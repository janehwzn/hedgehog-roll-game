'use strict';
/* =====================================================================
 * 刺猬滚跑 Hedgehog Roll Run — 纯逻辑部分
 * 不依赖 DOM，可在 Node 里直接 require 做单元测试。
 * ===================================================================== */

// 把折线加密成密集采样点，并计算累计弧长
function buildPath(waypoints){
  const pts=[];
  for(let i=0;i<waypoints.length-1;i++){
    const x1=waypoints[i][0],y1=waypoints[i][1];
    const x2=waypoints[i+1][0],y2=waypoints[i+1][1];
    const d=Math.hypot(x2-x1,y2-y1);
    const n=Math.max(2,Math.ceil(d/6));
    for(let j=(i===0?0:1);j<=n;j++){
      const t=j/n;
      pts.push({x:x1+(x2-x1)*t,y:y1+(y2-y1)*t,s:0});
    }
  }
  let s=0;
  for(let i=1;i<pts.length;i++){
    s+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    pts[i].s=s;
  }
  return {pts:pts,len:s};
}

// 弧长 s 处的路径点 + 切线 / 法线
function pathFrame(path,s){
  s=Math.max(0,Math.min(path.len,s));
  const pts=path.pts;
  let i=1;
  while(i<pts.length-1&&pts[i].s<s)i++;
  const a=pts[i-1],b=pts[i];
  const seg=Math.max(1e-6,b.s-a.s);
  const t=(s-a.s)/seg;
  const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
  let dx=b.x-a.x,dy=b.y-a.y;
  const d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;
  return {x:x,y:y,tx:dx,ty:dy,nx:-dy,ny:dx};
}

// 离 (x,y) 最近的路径采样点
function nearestOnPath(path,x,y){
  let bi=0,bd=Infinity;
  const pts=path.pts;
  for(let i=0;i<pts.length;i++){
    const dx=pts[i].x-x,dy=pts[i].y-y,d=dx*dx+dy*dy;
    if(d<bd){bd=d;bi=i;}
  }
  const p=pts[bi];
  return {x:p.x,y:p.y,s:p.s,dist:Math.sqrt(bd)};
}

// 骷髅夹子开合状态：{open:1张开/0夹紧, warn:是否预警抖动}
function chompState(pin,t){
  const c=pin.chomp;
  if(!c)return {open:1,warn:false};
  const cyc=(((t==null?0:t)+(c.phase||0))%c.period+c.period)%c.period;
  if(cyc<c.open)return {open:1,warn:false};
  if(cyc<c.open+(c.warn==null?0.6:c.warn))return {open:1,warn:true};
  return {open:0,warn:false};
}
// 会跑的夹子：夹子沿山洞滑动，位置 s 随时间变化
function pinchS(pin,t){
  t=(t==null?0:t);
  if(pin.slide){
    const ph=2*Math.PI*t/pin.slide.period+(pin.slide.phase||0);
    return pin.baseS+pin.slide.amp*Math.sin(ph);
  }
  return pin.s;
}
// 隧道半宽（带收窄点；chomp 夹子会随时间开合）
function halfWidthAt(level,s,t){
  t=(t==null?0:t);
  let hw=level.half;
  const pinches=level.pinches||[];
  for(let k=0;k<pinches.length;k++){
    const pin=pinches[k];
    const d=Math.abs(s-pinchS(pin,t));
    if(d<pin.len){
      const tt=1-d/pin.len;
      const sm=tt*tt*(3-2*tt);
      let ph=pin.half;
      if(pin.chomp){
        const st=chompState(pin,t);
        const shut=pin.shutHalf==null?16:pin.shutHalf;
        ph=pin.half+(shut-pin.half)*(1-st.open);
      }
      hw=Math.min(hw,level.half+(ph-level.half)*sm);
    }
  }
  if(level.alcoveS!=null){ // L11 岔路小山洞：隧道鼓成圆形房间
    const d=Math.abs(s-level.alcoveS);
    if(d<level.alcoveR){
      const bulge=level.alcoveR*(0.55+0.45*Math.cos(d/level.alcoveR*Math.PI/2));
      hw=Math.max(hw,bulge);
    }
  }
  return hw;
}

// 把刺猬限制在隧道内；返回修正后的位置和所在弧长
function clampToTunnel(path,level,x,y,r,t){
  const n=nearestOnPath(path,x,y);
  const hw=halfWidthAt(level,n.s,t)-r;
  if(n.dist<=hw)return {x:x,y:y,s:n.s,hitWall:false};
  const dx=x-n.x,dy=y-n.y;
  const d=Math.hypot(dx,dy)||1;
  return {x:n.x+dx/d*hw,y:n.y+dy/d*hw,s:n.s,hitWall:true};
}

function stepProjectile(p,dt){
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
  return p.life>0;
}

function circleHit(ax,ay,ar,bx,by,br){
  const dx=ax-bx,dy=ay-by,rr=ar+br;
  return dx*dx+dy*dy<rr*rr;
}

/* ---------------- 关卡数据 ----------------
 * waypoints: 隧道走向（逻辑坐标 420x760）
 * half: 隧道半宽；pinches: 收窄点 {frac, half, len, skull}
 * bows: 弓箭 {frac, side, period, speed}
 * slings: 弹弓 {frac, side, period, speed}
 */
const LEVELS=[
  { name:'Level 1 · Follow the Arrows',
    sub:'The cave adventure begins!',
    hint:'🔭 Camera says: Follow the blue arrows through the cave, all the way up!',
    waypoints:[[70,690],[70,470],[250,470],[250,270],[110,270],[110,140]],
    half:60, pinches:[], bows:[], slings:[], starN:6 },
  { name:'Level 2 · Skull Mouth',
    sub:'Careful, arrows ahead!',
    hint:'🔭 Camera says: Crawl through the skull\'s mouth and dodge the arrows!',
    waypoints:[[70,690],[70,540],[300,540],[300,380],[140,380],[140,220],[330,220],[330,120]],
    half:55,
    pinches:[{frac:0.55,half:28,len:70,skull:true}],
    bows:[{frac:0.32,side:1,period:2.8,speed:280},
           {frac:0.74,side:-1,period:3.4,speed:320}],
    slings:[], starN:7 },
  { name:'Level 3 · Arrow Rain',
    sub:'The toughest cave yet!',
    hint:'🔭 Camera says: Bows and slingshots together! Dash through the gaps!',
    waypoints:[[90,690],[90,560],[290,560],[290,430],[130,430],[130,300],[310,300],[310,150]],
    half:52,
    pinches:[{frac:0.34,half:28,len:70,skull:true},
              {frac:0.68,half:28,len:70,skull:true}],
    bows:[{frac:0.20,side:1,period:2.6,speed:300},
           {frac:0.52,side:-1,period:3.0,speed:340},
           {frac:0.86,side:1,period:2.4,speed:320}],
    slings:[{frac:0.42,side:-1,period:3.8,speed:220},
             {frac:0.78,side:1,period:4.2,speed:240}],
    starN:8 },
  { name:'Level 4 · Winding Cave',
    sub:'The cave gets windier!',
    hint:'🔭 Camera says: More turns, more arrows — time your dash!',
    waypoints:[[70,690],[70,580],[250,580],[250,470],[90,470],[90,360],[270,360],[270,240],[120,240],[120,130]],
    half:48,
    pinches:[{frac:0.30,half:26,len:60,skull:true},
              {frac:0.68,half:26,len:60,skull:true}],
    bows:[{frac:0.18,side:1,period:2.4,speed:320},
           {frac:0.50,side:-1,period:2.8,speed:360},
           {frac:0.86,side:1,period:2.2,speed:340}],
    slings:[{frac:0.42,side:-1,period:3.6,speed:240},
             {frac:0.78,side:1,period:4.0,speed:260}],
    starN:8 },
  { name:'Level 5 · Ultimate Adventure',
    sub:'You can do it!',
    hint:'🔭 Camera says: Three skulls, arrows like rain — charge!',
    waypoints:[[90,690],[90,600],[300,600],[300,490],[110,490],[110,380],[310,380],[310,260],[130,260],[130,150],[260,150]],
    half:46,
    pinches:[{frac:0.26,half:26,len:60,skull:true},
              {frac:0.52,half:26,len:60,skull:true},
              {frac:0.78,half:26,len:60,skull:true}],
    bows:[{frac:0.14,side:1,period:2.2,speed:340},
           {frac:0.40,side:-1,period:2.6,speed:380},
           {frac:0.65,side:1,period:2.0,speed:360},
           {frac:0.90,side:-1,period:2.4,speed:380}],
    slings:[{frac:0.33,side:-1,period:3.4,speed:260},
             {frac:0.58,side:1,period:3.8,speed:280},
             {frac:0.83,side:-1,period:3.2,speed:280}],
    starN:9 },
  { name:'Level 6 · Skull Clamp',
    sub:'Spiky clamps that snap shut!',
    hint:'🔭 Camera says: Dash when the clamp opens — getting caught costs a heart!',
    waypoints:[[80,690],[80,590],[260,590],[260,490],[100,490],[100,390],[280,390],[280,280],[140,280],[140,170]],
    half:48,
    pinches:[{frac:0.5,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:3.6,open:2.0,warn:0.6,phase:0}}],
    bows:[{frac:0.25,side:1,period:2.6,speed:320},
           {frac:0.75,side:-1,period:2.6,speed:340}],
    slings:[{frac:0.62,side:1,period:3.8,speed:250}],
    starN:8 },
  { name:'Level 7 · Double Clamps',
    sub:'Two clamps, different rhythms!',
    hint:'🔭 Camera says: One clamp fast, one slow — time it right!',
    waypoints:[[90,690],[90,600],[300,600],[300,500],[120,500],[120,400],[310,400],[310,300],[150,300],[150,190],[260,190]],
    half:46,
    pinches:[{frac:0.35,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:3.2,open:1.8,warn:0.5,phase:0}},
             {frac:0.68,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:4.4,open:2.6,warn:0.6,phase:1.7}}],
    bows:[{frac:0.18,side:1,period:2.4,speed:340},
           {frac:0.52,side:-1,period:2.8,speed:360},
           {frac:0.85,side:1,period:2.4,speed:340}],
    slings:[{frac:0.45,side:-1,period:3.6,speed:250},
             {frac:0.80,side:1,period:4.0,speed:270}],
    starN:8 },
  { name:'Level 8 · Clamp Gauntlet',
    sub:'Three clamps await!',
    hint:'🔭 Camera says: Three clamps, each with its own rhythm — go!',
    waypoints:[[70,690],[70,590],[280,590],[280,490],[100,490],[100,390],[300,390],[300,290],[120,290],[120,190],[270,190],[270,120]],
    half:46,
    pinches:[{frac:0.25,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:2.8,open:1.6,warn:0.4,phase:0}},
             {frac:0.5,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:3.6,open:2.0,warn:0.6,phase:1.2}},
             {frac:0.75,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:4.6,open:2.8,warn:0.6,phase:2.3}}],
    bows:[{frac:0.15,side:1,period:2.2,speed:360},
           {frac:0.38,side:-1,period:2.6,speed:380},
           {frac:0.62,side:1,period:2.2,speed:360},
           {frac:0.88,side:-1,period:2.6,speed:380}],
    slings:[{frac:0.42,side:1,period:3.4,speed:260},
             {frac:0.66,side:-1,period:3.8,speed:280}],
    starN:9 },
  { name:'Level 9 · Running Clamps',
    sub:'The clamps can run! 75 seconds!',
    hint:'🔭 Camera says: The clamps slide along the cave — time it right! Only 75 seconds, hurry!',
    timeLimit:75,
    waypoints:[[80,690],[80,590],[270,590],[270,480],[110,480],[110,380],[290,380],[290,270],[130,270],[130,160],[250,160]],
    half:48,
    pinches:[{frac:0.35,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:3.4,open:1.8,warn:0.5,phase:0},
              slide:{amp:110,period:7,phase:0}},
             {frac:0.68,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:4.2,open:2.4,warn:0.6,phase:2.1},
              slide:{amp:90,period:9,phase:3.1}}],
    bows:[{frac:0.18,side:1,period:2.4,speed:340},
           {frac:0.52,side:-1,period:2.8,speed:360},
           {frac:0.85,side:1,period:2.4,speed:340}],
    slings:[{frac:0.5,side:-1,period:3.6,speed:250}],
    starN:8 },
  { name:'Level 10 · Dark Cave',
    sub:'So dark! Catch fireflies! 80 seconds!',
    hint:'🔭 Camera says: Catch fireflies to grow your light! Wesley\'s fireflies help too! Only 80 seconds!',
    timeLimit:80,
    waypoints:[[70,690],[70,600],[280,600],[280,500],[120,500],[120,400],[300,400],[300,300],[140,300],[140,200],[260,200],[260,120]],
    half:50,
    dark:true,fireflyN:8,
    pinches:[{frac:0.5,half:28,len:70,skull:true}],
    bows:[{frac:0.25,side:1,period:2.6,speed:320},
           {frac:0.75,side:-1,period:2.6,speed:340}],
    slings:[{frac:0.6,side:1,period:3.8,speed:240}],
    starN:6 },
  { name:'Level 11 · Key & Door',
    sub:'A stone door blocks the exit!',
    hint:'🔭 Camera says: Find the key in the side cave first, then open the stone door!',
    waypoints:[[90,690],[90,600],[300,600],[300,500],[130,500],[130,400],[310,400],[310,300],[150,300],[150,180]],
    half:48,
    alcove:{frac:0.42,r:75},key:{frac:0.42,off:38},door:{frac:0.93},
    pinches:[{frac:0.25,half:28,len:60,skull:true,spikes:true,shutHalf:16,
              chomp:{period:3.6,open:2.0,warn:0.6,phase:0}}],
    bows:[{frac:0.18,side:1,period:2.4,speed:340},
           {frac:0.65,side:-1,period:2.8,speed:360}],
    slings:[{frac:0.82,side:1,period:3.6,speed:250}],
    starN:8 },
  { name:'Level 12 · Skull King',
    sub:'Final battle: the Skull King!',
    hint:'🔭 Camera says: Giant skull with double jaws that spits mini skeletons! Charge through!',
    waypoints:[[80,690],[80,590],[260,590],[260,480],[100,480],[100,380],[280,380],[280,260],[120,260],[120,150]],
    half:48,
    pinches:[{frac:0.55,half:26,len:130,skull:true,spikes:true,shutHalf:10,boss:true,
              spit:{period:4.5},
              chomp:{period:3.2,open:1.8,warn:0.5,phase:0},
              chomp2:{period:3.2,open:1.8,warn:0.5,phase:1.6}}],
    bows:[{frac:0.2,side:1,period:2.4,speed:340},
           {frac:0.85,side:-1,period:2.4,speed:360}],
    slings:[{frac:0.35,side:-1,period:3.6,speed:250}],
    starN:8 },
];

/* ---------------- 程序化关卡 13-100 ----------------
 * 用 seeded PRNG（mulberry32，种子=关卡号）生成，保证每次玩都一样。
 * 关卡定义格式与手写关卡完全一致，可直接被 loadLevel 使用。
 */
function mulberry32(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
const GEN_NAMES=['Twisty Turny','Skull Alley','Arrow Storm','The Squeeze','Dark Depths',
  'Bone Yard','Windy Whirl','Spike Party','Narrow Pass','Shadow Run','Pebble Dash',
  'The Gauntlet','Silent Hollow','Jagged Way','Moon Cave','Thorny Trail','Echo Cave',
  'The Spiral','Crystal Grotto','Misty Maze','Rocky Road','Deep Dark','Swift Stream',
  'Curvy Cave','Wild Ride','Bumpy Road','Sneaky Path','Happy Hollow','Dizzy Drop',
  'Starlight Den'];
const GEN_SUBS=['Deeper into the caves!','Trickier than ever!','Stay sharp!',
  'The adventure continues!','Can you roll through?','Watch your step!',
  'Almost a maze master!','Keep rolling!','The caves go on and on!'];
function genHint(n,hasPinch,hasBow,hasSling,isBoss,isDark,isTime,isKey){
  const tips=[];
  if(isBoss)tips.push('the Skull King is BACK — double jaws and mini skeletons');
  if(isDark)tips.push('pitch dark — catch fireflies to see');
  if(isTime)tips.push('beat the clock');
  if(isKey)tips.push('find the key, then open the stone door');
  if(hasPinch)tips.push('skull clamps snap shut');
  if(hasBow)tips.push('bows fire fast');
  if(hasSling)tips.push('slingshots spray pebbles');
  if(!tips.length)tips.push('a twisty maze — follow the blue arrows');
  return '\u{1F52D} Camera says: '+tips.join(' · ')+'! You got this!';
}
function genLevel(n){
  const rnd=mulberry32((n*2654435761)>>>0);
  const R=(a,b)=>a+rnd()*(b-a);
  const RI=(a,b)=>a+Math.floor(rnd()*(b-a+1));
  const pick=arr=>arr[Math.floor(rnd()*arr.length)%arr.length];
  // 蛇形路径：起点 [80,690]，竖直/水平交替，每段 120-220px
  const wp=[[80,690]];
  let x=80,y=690,dir=1;
  const segs=RI(6,11);
  for(let i=0;i<segs;i++){
    if(i%2===0){ // 竖直向上
      const ny=Math.max(110,y-R(120,200));
      if(y-ny<80)break;
      y=ny;
    }else{ // 水平蛇形
      let nx=x+dir*R(120,220);
      nx=Math.max(60,Math.min(340,nx));
      if(Math.abs(nx-x)<80)nx=Math.max(60,Math.min(340,x-dir*R(120,220)));
      if(Math.abs(nx-x)<80)break;
      x=Math.round(nx);dir=-dir;
    }
    wp.push([Math.round(x),Math.round(y)]);
    if(y<=110&&i>=5)break;
  }
  const half=Math.round(Math.max(38,58-(n-13)*0.22));
  const isBoss=n%10===0,isDark=n%7===0,isTime=n%9===0,isKey=n%11===0;
  const pinches=[];
  if(isBoss){ // Boss 关：大骷髅王
    pinches.push({frac:0.55,half:26,len:130,skull:true,spikes:true,shutHalf:10,boss:true,
      spit:{period:4.5},
      chomp:{period:3.2,open:1.8,warn:0.5,phase:+R(0,3).toFixed(2)},
      chomp2:{period:3.2,open:1.8,warn:0.5,phase:+R(0,3).toFixed(2)}});
  }else{
    const cnt=Math.min(5,Math.floor((n-10)/8));
    const used=[];
    for(let i=0;i<cnt;i++){
      let f=0.5,ok=false;
      for(let t=0;t<30&&!ok;t++){f=R(0.15,0.85);ok=used.every(u=>Math.abs(u-f)>=0.12);}
      used.push(f);
      const p={frac:+f.toFixed(3),half:26,len:60,skull:true,spikes:rnd()<0.6,shutHalf:16};
      if(rnd()<0.55){
        const open=+R(1.4,2.4).toFixed(2);
        p.chomp={period:+(open+R(1.2,2.2)).toFixed(2),open:open,warn:0.5,phase:+R(0,3).toFixed(2)};
      }
      pinches.push(p);
    }
  }
  const prog=Math.min(1,Math.max(0,(n-13)/87)); // 0→1 难度进度
  const bows=[];
  {
    const cnt=Math.min(6,Math.floor((n-8)/6));
    const used=[];
    for(let i=0;i<cnt;i++){
      let f=0.5,ok=false;
      for(let t=0;t<30&&!ok;t++){f=R(0.1,0.9);ok=used.every(u=>Math.abs(u-f)>=0.1);}
      used.push(f);
      bows.push({frac:+f.toFixed(3),side:rnd()<0.5?1:-1,
        period:+Math.max(1.6,2.8-prog*1.0+R(-0.2,0.4)).toFixed(2),
        speed:Math.round(300+prog*120+R(-20,20))});
    }
  }
  const slings=[];
  {
    const cnt=Math.min(4,Math.floor((n-12)/9));
    const used=[];
    for(let i=0;i<cnt;i++){
      let f=0.5,ok=false;
      for(let t=0;t<30&&!ok;t++){f=R(0.1,0.9);ok=used.every(u=>Math.abs(u-f)>=0.1);}
      used.push(f);
      slings.push({frac:+f.toFixed(3),side:rnd()<0.5?1:-1,
        period:+R(3.2,4.2).toFixed(2),speed:Math.round(R(220,280))});
    }
  }
  const lv={name:'Level '+n+' \u00B7 '+pick(GEN_NAMES),
    sub:pick(GEN_SUBS),
    hint:genHint(n,pinches.length>0,bows.length>0,slings.length>0,isBoss,isDark,isTime,isKey),
    waypoints:wp,half:half,pinches:pinches,bows:bows,slings:slings,
    starN:6+(n%4)};
  if(isDark){lv.dark=true;lv.fireflyN=RI(6,10);}
  if(isTime){lv.timeLimit=60+(n%3)*10;}
  if(isKey){lv.alcove={frac:0.42,r:75};lv.key={frac:0.42,off:38};lv.door={frac:0.93};}
  return lv;
}
function validLevel(lv){
  const wp=lv.waypoints;
  if(!wp||wp.length<3)return false;
  for(const p of wp){if(p[0]<40||p[0]>380||p[1]<80||p[1]>720)return false;}
  for(let i=1;i<wp.length;i++){
    if(Math.hypot(wp[i][0]-wp[i-1][0],wp[i][1]-wp[i-1][1])<79)return false;
  }
  return true;
}
function safeLevel(n){ // 校验失败时的兜底关卡
  return {name:'Level '+n+' \u00B7 Safe Path',sub:'A calm maze',
    hint:'\u{1F52D} Camera says: follow the blue arrows, nice and easy!',
    waypoints:[[80,690],[80,500],[260,500],[260,320],[120,320],[120,150]],
    half:50,pinches:[],bows:[],slings:[],starN:6};
}
for(let _n=13;_n<=100;_n++){
  const _lv=genLevel(_n);
  if(validLevel(_lv))LEVELS.push(_lv);
  else{console.warn('[genLevel] invalid level '+_n+', using fallback');LEVELS.push(safeLevel(_n));}
}

if(typeof module!=='undefined'){
  module.exports={buildPath:buildPath,pathFrame:pathFrame,
    nearestOnPath:nearestOnPath,halfWidthAt:halfWidthAt,chompState:chompState,
    pinchS:pinchS,clampToTunnel:clampToTunnel,stepProjectile:stepProjectile,
    circleHit:circleHit,LEVELS:LEVELS,
    mulberry32:mulberry32,genLevel:genLevel,validLevel:validLevel,safeLevel:safeLevel};
}

/* =====================================================================
 * 浏览器游戏部分
 * ===================================================================== */
if(typeof window!=='undefined')(function(){
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const LW=420,LH=760;
let scale=1,ox=0,oy=0;
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=window.innerWidth,H=window.innerHeight;
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.width=W+'px';cv.style.height=H+'px';
  scale=Math.min(W/LW,H/LH);ox=(W-LW*scale)/2;oy=(H-LH*scale)/2;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize',resize);
cv.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- 音效 ---------- */
let AC=null;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}
}return AC;}
/* ---------- UI preferences (separate key; never touches the pet save) ---------- */
const UI_KEY='hedgehog-ui-v1';
const HERO_NAME='Pip'; // one constant so the character name is easy to change
let UI={sound:true,seenTips:[]};
try{const r=localStorage.getItem(UI_KEY);if(r){const u=JSON.parse(r);if(typeof u.sound==='boolean')UI.sound=u.sound;if(Array.isArray(u.seenTips))UI.seenTips=u.seenTips;}}catch(e){}
function uiSave(){try{localStorage.setItem(UI_KEY,JSON.stringify(UI));}catch(e){}}
function tone(f,d,type,v,when){
  if(!UI.sound)return;
  try{
    const a=ac();if(!a)return;
    const o=a.createOscillator(),g=a.createGain(),t=a.currentTime+(when||0);
    o.type=type||'sine';o.frequency.value=f;
    g.gain.setValueAtTime(v||0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);
    o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+0.02);
  }catch(e){}
}
const sfxStar=()=>{tone(660,0.09,'sine',0.14);tone(990,0.12,'sine',0.14,0.07);};
const sfxHit=()=>{tone(160,0.25,'sawtooth',0.12);tone(110,0.3,'sawtooth',0.1,0.05);};
const sfxShoot=()=>tone(240,0.08,'square',0.05);
const sfxWin=()=>{[523,659,784,1047,1319].forEach((f,i)=>tone(f,0.22,'triangle',0.14,i*0.15));};
const sfxLevel=()=>{[392,523,659].forEach((f,i)=>tone(f,0.18,'triangle',0.13,i*0.12));};
const sfxFeed=()=>{tone(880,0.09,'sine',0.14);tone(1174,0.14,'sine',0.14,0.09);};
document.addEventListener('pointerdown',()=>{const a=ac();if(a&&a.resume)a.resume();});

/* ---------- 宠物小鸟泥 Birdie（照着 Steven 的画画的） ---------- */
const PET_KEY='birdie-pet-v1';
let Pet={unlocked:false,stars:0,food:0,fed:0,stage:0,
  wesley:false,catfood:0,catfed:0,wstage:0,
  sunStage:0,sunWater:0,shield:1,bomb:1,maxLv:0,
  fireflies:0,lastBreakfast:'',
  lastFedB:0,lastFedW:0,levelsSinceSleep:0,
  doubleFeed:false,
  sleepUntil:0,sleepTogether:false,
  nest:false,hat:false,scarf:false,pajamas:false,
  equipHat:false,equipScarf:false,equipPajamas:false,
  limited:[]};
try{
  const raw=localStorage.getItem(PET_KEY);
  if(raw){const p=JSON.parse(raw);for(const k in Pet){if(typeof p[k]===typeof Pet[k])Pet[k]=p[k];}}
}catch(e){}
// 老存档迁移：以前的"进化"(stage=1，黑金大鸟)就是现在的成年体(stage=2)
if(Pet.stage===1){Pet.stage=2;if(Pet.fed<20)Pet.fed=20;petSave();}
if(Pet.fed>=20&&Pet.stage<2){Pet.stage=2;petSave();}
else if(Pet.fed>=10&&Pet.stage<1){Pet.stage=1;petSave();}
if(Pet.catfed>=10&&Pet.wstage<1){Pet.wstage=1;petSave();} // 老玩家：猫喂满过直接长大
if(Pet.unlocked&&!Pet.lastFedB)Pet.lastFedB=Date.now();
if(Pet.wesley&&!Pet.lastFedW)Pet.lastFedW=Date.now();
function petSave(){try{localStorage.setItem(PET_KEY,JSON.stringify(Pet));}catch(e){}}

// 照着 Steven 的画：圆滚滚绿身体 + 小圆头 + 豆豆眼 + 右边尖嘴 + 左边尖尾巴
function drawBirdie(c,x,y,s,t,opt){
  opt=opt||{};
  const bob=Math.sin(t*3)*3*s;
  let hop=0;
  if(opt.happy>0)hop=Math.abs(Math.sin(t*9))*16*s*Math.min(1,opt.happy);
  y=y+bob-hop;
  const bodyC=opt.ghost?'#455a64':'#9ccc65';
  const darkC=opt.ghost?'#263238':'#7cb342';
  c.save();c.translate(x,y);
  c.fillStyle=darkC; // 尾巴
  c.beginPath();c.moveTo(-19*s,-2*s);c.lineTo(-35*s,-9*s);c.lineTo(-30*s,7*s);c.closePath();c.fill();
  c.fillStyle=bodyC;c.strokeStyle=darkC;c.lineWidth=3*s; // 身体
  c.beginPath();c.ellipse(0,0,22*s,19*s,0,0,7);c.fill();c.stroke();
  c.beginPath();c.arc(13*s,-16*s,11*s,0,7);c.fill();c.stroke(); // 头
  const blink=(t%3.6)<0.15;
  c.fillStyle=opt.ghost?'#cfd8dc':'#212121';
  if(blink){c.fillRect(13*s,-18*s,7*s,2.6*s);}
  else{c.beginPath();c.arc(17*s,-17*s,2.6*s,0,7);c.fill();}
  c.fillStyle=opt.ghost?'#546e7a':'#ffa726'; // 嘴巴
  c.beginPath();c.moveTo(22*s,-18*s);c.lineTo(33*s,-14*s);c.lineTo(22*s,-10*s);c.closePath();c.fill();
  c.restore();
  if(opt.happy>0){
    c.fillStyle='#ef5350';c.font=Math.round(18*s)+'px ui-rounded, system-ui, sans-serif';c.textAlign='center';
    c.fillText('❤',x+28*s,y-36*s-Math.abs(Math.sin(t*9))*8*s);
  }
}

let petT0=Date.now(),petHappyUntil=0,petHappyWUntil=0,petRAF=0,petCont=null;
// 照着 Steven 的画：黄黄的小猫，尖耳朵，笑眯眯，卷尾巴
function drawWesley(c,x,y,s,t){
  const bob=Math.sin(t*2.4+1)*2.5*s;
  y=y+bob;
  const fur='#ffee58',dark='#8d6e63',belly='#ffb74d';
  c.save();c.translate(x,y);
  const sway=Math.sin(t*2)*4*s;
  c.lineCap='round'; // 卷卷的尾巴
  c.strokeStyle=fur;c.lineWidth=9*s;
  c.beginPath();c.moveTo(20*s,10*s);
  c.quadraticCurveTo(46*s,6*s+sway,40*s,-24*s+sway);c.stroke();
  c.strokeStyle=dark;c.lineWidth=2.5*s;
  c.beginPath();c.moveTo(20*s,10*s);
  c.quadraticCurveTo(46*s,6*s+sway,40*s,-24*s+sway);c.stroke();
  c.fillStyle=fur;c.strokeStyle=dark;c.lineWidth=3*s;
  c.beginPath();c.ellipse(0,14*s,20*s,24*s,0,0,7);c.fill();c.stroke(); // 身体
  c.fillStyle=belly; // 肚皮
  c.beginPath();c.ellipse(0,18*s,10*s,14*s,0,0,7);c.fill();
  c.fillStyle=fur; // 胳膊
  c.beginPath();c.ellipse(-20*s,12*s,6*s,12*s,0.5,0,7);c.fill();c.stroke();
  c.beginPath();c.ellipse(20*s,12*s,6*s,12*s,-0.5,0,7);c.fill();c.stroke();
  c.beginPath();c.ellipse(-10*s,38*s,9*s,5*s,0,0,7);c.fill();c.stroke(); // 脚
  c.beginPath();c.ellipse(10*s,38*s,9*s,5*s,0,0,7);c.fill();c.stroke();
  c.beginPath();c.arc(0,-22*s,20*s,0,7);c.fill();c.stroke(); // 头
  c.beginPath();c.moveTo(-16*s,-34*s);c.lineTo(-11*s,-50*s);c.lineTo(-4*s,-36*s);c.closePath();c.fill();c.stroke();
  c.beginPath();c.moveTo(16*s,-34*s);c.lineTo(11*s,-50*s);c.lineTo(4*s,-36*s);c.closePath();c.fill();c.stroke();
  const blink=(t%4.1)<0.15;
  c.fillStyle='#212121';
  if(blink){c.fillRect(-11*s,-26*s,7*s,2.6*s);c.fillRect(4*s,-26*s,7*s,2.6*s);}
  else{c.beginPath();c.arc(-8*s,-25*s,2.6*s,0,7);c.fill();c.beginPath();c.arc(8*s,-25*s,2.6*s,0,7);c.fill();}
  c.beginPath();c.arc(0,-19*s,2.2*s,0,7);c.fill();
  c.strokeStyle='#212121';c.lineWidth=2*s;
  c.beginPath();c.arc(0,-19*s,7*s,0.3,Math.PI-0.3);c.stroke();
  c.restore();
}
// 照着 Steven 的画：净化后的小鸟泥——黑色长身子 + 金色圆头 + 金色羽冠 + 金色羽毛，比之前大一圈
function drawEvolvedBirdie(c,x,y,s,t,opt){
  opt=opt||{};
  const bob=Math.sin(t*3)*3*s;
  let hop=0;
  if(opt.happy>0)hop=Math.abs(Math.sin(t*9))*16*s*Math.min(1,opt.happy);
  y=y+bob-hop;
  const black='#212121',gold='#fdd835',goldD='#f9a825';
  c.save();c.translate(x,y);
  c.fillStyle=black; // 小尾巴
  c.beginPath();c.moveTo(-28*s,-2*s);c.lineTo(-43*s,-9*s);c.lineTo(-36*s,4*s);c.closePath();c.fill();
  c.beginPath();c.ellipse(0,0,32*s,17*s,0,0,7);c.fill(); // 黑色长身子
  c.strokeStyle=gold;c.lineWidth=3*s;c.lineCap='round'; // 金色羽毛纹路
  for(const yy of [-6,0,6]){
    c.beginPath();c.moveTo(-18*s,yy*s);c.quadraticCurveTo(0,(yy-4)*s,18*s,yy*s);c.stroke();
  }
  c.fillStyle=gold; // 金色肚皮光斑
  c.beginPath();c.ellipse(2*s,2*s,10*s,6*s,0,0,7);c.fill();
  c.fillStyle=gold;c.strokeStyle=black;c.lineWidth=3*s; // 金色圆头
  c.beginPath();c.arc(30*s,-16*s,13*s,0,7);c.fill();c.stroke();
  c.strokeStyle=goldD;c.lineWidth=3.5*s; // 头顶金色羽冠
  c.beginPath();c.moveTo(26*s,-28*s);c.quadraticCurveTo(30*s,-43*s,41*s,-37*s);c.stroke();
  c.beginPath();c.moveTo(33*s,-28*s);c.quadraticCurveTo(39*s,-41*s,47*s,-33*s);c.stroke();
  c.fillStyle='#ff9800'; // 尖嘴
  c.beginPath();c.moveTo(41*s,-18*s);c.lineTo(55*s,-13*s);c.lineTo(41*s,-8*s);c.closePath();c.fill();
  const blink=(t%3.6)<0.15; // 眨眼
  c.fillStyle=black;
  if(blink){c.fillRect(29*s,-20*s,7*s,2.6*s);}
  else{c.beginPath();c.arc(33*s,-18*s,2.8*s,0,7);c.fill();}
  c.fillStyle=goldD; // 小脚
  c.fillRect(-8*s,14*s,6*s,5*s);c.fillRect(4*s,14*s,6*s,5*s);
  c.restore();
}
// 少年小鸟泥（过渡期，Steven 还没画，先用代码版）：身体变大、墨绿带金，头顶冒出金色小羽冠
function drawTeenBirdie(c,x,y,s,t,opt){
  opt=opt||{};
  const bob=Math.sin(t*3)*3*s;
  let hop=0;
  if(opt.happy>0)hop=Math.abs(Math.sin(t*9))*16*s*Math.min(1,opt.happy);
  y=y+bob-hop;
  const bodyC='#6b8f3e',darkC='#4a6b2a',gold='#fdd835';
  c.save();c.translate(x,y);
  c.fillStyle=darkC; // 尾巴变长
  c.beginPath();c.moveTo(-24*s,-2*s);c.lineTo(-42*s,-10*s);c.lineTo(-36*s,6*s);c.closePath();c.fill();
  c.fillStyle=bodyC;c.strokeStyle=darkC;c.lineWidth=3*s; // 身体：比宝宝大
  c.beginPath();c.ellipse(0,0,27*s,21*s,0,0,7);c.fill();c.stroke();
  c.beginPath();c.arc(17*s,-18*s,13*s,0,7);c.fill();c.stroke(); // 头
  c.strokeStyle=gold;c.lineWidth=3*s;c.lineCap='round'; // 冒出金色小羽冠
  c.beginPath();c.moveTo(14*s,-30*s);c.quadraticCurveTo(17*s,-40*s,26*s,-36*s);c.stroke();
  const blink=(t%3.6)<0.15;
  c.fillStyle='#212121';
  if(blink){c.fillRect(17*s,-20*s,7*s,2.6*s);}
  else{c.beginPath();c.arc(21*s,-19*s,2.6*s,0,7);c.fill();}
  c.fillStyle='#ffa726'; // 嘴巴
  c.beginPath();c.moveTo(28*s,-20*s);c.lineTo(40*s,-15*s);c.lineTo(28*s,-10*s);c.closePath();c.fill();
  c.restore();
  if(opt.happy>0){
    c.fillStyle='#ef5350';c.font=Math.round(18*s)+'px ui-rounded, system-ui, sans-serif';c.textAlign='center';
    c.fillText('❤',x+28*s,y-36*s-Math.abs(Math.sin(t*9))*8*s);
  }
}
// 照着 Steven 的画：净化版 Wesley——金黄大脑袋 + 尖耳朵橙内耳 + 粉红肚皮 + 深色小爪子，比之前大一圈
function drawEvolvedWesley(c,x,y,s,t){
  const bob=Math.sin(t*2.4+1)*2.5*s;
  y=y+bob;
  const fur='#ffdf6b',dark='#5d4037',belly='#f48fb1',inner='#ffab91',paw='#4e342e';
  c.save();c.translate(x,y);
  c.fillStyle=fur;c.strokeStyle=dark;c.lineWidth=3*s;
  c.beginPath();c.ellipse(-26*s,30*s,16*s,8*s,-0.4,0,7);c.fill();c.stroke(); // 腿：坐姿张开
  c.beginPath();c.ellipse(26*s,30*s,16*s,8*s,0.4,0,7);c.fill();c.stroke();
  c.fillStyle=paw; // 深色脚尖
  c.beginPath();c.arc(-39*s,31*s,5*s,0,7);c.fill();
  c.beginPath();c.arc(39*s,31*s,5*s,0,7);c.fill();
  c.fillStyle=fur; // 身体
  c.beginPath();c.ellipse(0,12*s,24*s,26*s,0,0,7);c.fill();c.stroke();
  c.fillStyle=belly; // 粉红肚皮
  c.beginPath();c.ellipse(0,16*s,13*s,17*s,0,0,7);c.fill();
  c.fillStyle=fur; // 胳膊张开
  c.beginPath();c.ellipse(-26*s,8*s,7*s,14*s,0.5,0,7);c.fill();c.stroke();
  c.beginPath();c.ellipse(26*s,8*s,7*s,14*s,-0.5,0,7);c.fill();c.stroke();
  c.fillStyle=paw; // 深色手尖
  c.beginPath();c.arc(-31*s,19*s,4.5*s,0,7);c.fill();
  c.beginPath();c.arc(31*s,19*s,4.5*s,0,7);c.fill();
  c.fillStyle=fur; // 金黄大脑袋
  c.beginPath();c.arc(0,-24*s,22*s,0,7);c.fill();c.stroke();
  c.beginPath();c.moveTo(-18*s,-38*s);c.lineTo(-13*s,-57*s);c.lineTo(-4*s,-40*s);c.closePath();c.fill();c.stroke();
  c.beginPath();c.moveTo(18*s,-38*s);c.lineTo(13*s,-57*s);c.lineTo(4*s,-40*s);c.closePath();c.fill();c.stroke();
  c.fillStyle=inner; // 橙色内耳
  c.beginPath();c.moveTo(-15*s,-41*s);c.lineTo(-12*s,-51*s);c.lineTo(-7*s,-42*s);c.closePath();c.fill();
  c.beginPath();c.moveTo(15*s,-41*s);c.lineTo(12*s,-51*s);c.lineTo(7*s,-42*s);c.closePath();c.fill();
  const blink=(t%4.1)<0.15;
  c.fillStyle='#212121';
  if(blink){c.fillRect(-12*s,-28*s,7*s,2.6*s);c.fillRect(5*s,-28*s,7*s,2.6*s);}
  else{c.beginPath();c.arc(-9*s,-27*s,2.8*s,0,7);c.fill();c.beginPath();c.arc(9*s,-27*s,2.8*s,0,7);c.fill();}
  c.beginPath();c.arc(0,-21*s,2.4*s,0,7);c.fill(); // 小鼻子
  c.strokeStyle='#212121';c.lineWidth=2*s; // 笑嘴
  c.beginPath();c.arc(0,-21*s,8*s,0.3,Math.PI-0.3);c.stroke();
  c.restore();
}
function drawPetScene(){
  const cv=document.getElementById('petCv');if(!cv)return;
  const c=cv.getContext('2d');if(!c)return;
  const W=cv.width||360,H=cv.height||230;
  const t=(Date.now()-petT0)/1000;
  const happy=Math.max(0,(petHappyUntil-Date.now())/900);
  const happyW=Math.max(0,(petHappyWUntil-Date.now())/900);
  const g=c.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#b3e5fc');g.addColorStop(0.72,'#e8f5e9');g.addColorStop(1,'#c8e6c9');
  c.fillStyle=g;c.fillRect(0,0,W,H);
  c.fillStyle='#ffeb3b';c.beginPath();c.arc(W-46,42,24,0,7);c.fill();
  c.fillStyle='rgba(255,255,255,.92)';
  c.beginPath();c.ellipse(80,52,36,14,0,0,7);c.fill();
  c.beginPath();c.ellipse(212,84,26,11,0,0,7);c.fill();
  c.fillStyle='#a5d6a7';c.fillRect(0,H-52,W,52);
  c.fillStyle='#ef9a9a';
  for(const fx of [40,W-30]){c.beginPath();c.arc(fx,H-30,5,0,7);c.fill();}
  c.fillStyle='#fff59d';
  for(const fx of [72,W-70]){c.beginPath();c.arc(fx,H-24,5,0,7);c.fill();}
  c.font='66px ui-rounded, system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.fillText('🦔',100,H-56);
  const sleeping=Pet.sleepUntil&&Date.now()<Pet.sleepUntil;
  if(Pet.unlocked&&!sleeping){
    const bx=186,by=H-112;
    if(Pet.stage>=2)drawEvolvedBirdie(c,bx,by,1.35,t,{happy:happy});
    else if(Pet.stage>=1)drawTeenBirdie(c,bx,by,1.25,t,{happy:happy});
    else drawBirdie(c,bx,by,1.15,t,{happy:happy});
    drawPetAcc(c,'birdie',bx,by,t);
    drawPetStatus(c,bx,by-70,'birdie',t);
  }
  if(Pet.wesley&&!sleeping){
    const wx=286,wy=H-96;
    if(Pet.wstage>=1)drawEvolvedWesley(c,wx,wy,1.15,t,{happy:happyW});
    else drawWesley(c,wx,wy,1.0,t,{happy:happyW});
    drawPetAcc(c,'wesley',wx,wy,t);
    drawPetStatus(c,wx,wy-70,'wesley',t);
  }
  if(sleeping)drawSleeping(c,W,H,t);
  drawSunflower(c,36,H-100,1.0,t); // 向日葵（植物不睡觉）
  c.fillStyle='#4e342e';c.font='15px ui-rounded, system-ui, sans-serif';
  const nm=[];
  if(Pet.unlocked)nm.push('Birdie'+['(Baby)','(Teen)','(Adult)'][Pet.stage]||'');
  if(Pet.wesley)nm.push('Wesley'+(Pet.wstage>=1?'(Adult)':'(Kitten)'));
  // 名字已经在画布下方的标题里显示，这里不再重复画
  c.textBaseline='alphabetic';
}
// 宠物头顶状态：饿了冒饭碗，困了冒 Zzz
function drawPetStatus(c,x,y,which,t){
  const hungry=petHungry(which),sleepy=petSleepy();
  c.font='22px ui-rounded, system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
  if(hungry){
    c.fillText('🍚',x+30,y-14+Math.sin(t*5)*3);
  }
  if(sleepy){
    c.fillText('💤',x-32,y-16+Math.sin(t*2)*2);
  }
  c.textBaseline='alphabetic';
}
function petHungry(which){
  const last=which==='birdie'?Pet.lastFedB:Pet.lastFedW;
  const has=which==='birdie'?Pet.unlocked:Pet.wesley;
  return has&&(Date.now()-last>2*3600*1000);
}
function petSleepy(){return Pet.levelsSinceSleep>=3;}
// 睡觉中：鸟巢里两只挤在一起，冒 Zzz / 打呼
function drawSleeping(c,W,H,t){
  const cx=W/2,cy=H-80;
  // 鸟巢
  c.fillStyle='#8d6e63';
  c.beginPath();c.ellipse(cx,cy,90,34,0,0,7);c.fill();
  c.fillStyle='#a1887f';
  c.beginPath();c.ellipse(cx,cy-8,76,26,0,0,7);c.fill();
  c.fillStyle='#6d4c41';
  for(let i=-3;i<=3;i++){
    c.fillRect(cx+i*22-3,cy-26,6,20);
  }
  // 睡着的宠物（简化小圆球）
  const br=Math.sin(t*1.5)*2;
  if(Pet.unlocked){
    c.fillStyle=Pet.stage>=2?'#212121':(Pet.stage>=1?'#6b8f3e':'#9ccc65');
    c.beginPath();c.arc(cx-32,cy-30+br,22,0,7);c.fill();
  }
  if(Pet.wesley){
    c.fillStyle=Pet.wstage>=1?'#ffdf6b':'#ffee58';
    c.beginPath();c.arc(cx+32,cy-28-br,24,0,7);c.fill();
  }
  // Zzz / 打呼
  c.font='20px ui-rounded, system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
  const z1=(t%3),z2=((t+1.5)%3);
  c.fillStyle='rgba(92,107,192,'+(1-z1/3)+')';
  c.fillText('Z',cx-60-z1*8,cy-70-z1*14);
  c.fillStyle='rgba(92,107,192,'+(1-z2/3)+')';
  c.fillText('Z',cx+60+z2*8,cy-70-z2*14);
  if(Pet.sleepTogether){
    c.font='18px ui-rounded, system-ui, sans-serif';
    c.fillText('💤 Snore snore…',cx,cy-96+Math.sin(t*3)*3);
  }
  c.textBaseline='alphabetic';
}
// 装扮：帽子/围巾/睡衣（穿上才画）
function drawPetAcc(c,which,x,y,t){
  c.save();c.translate(x,y);
  const hatY=which==='birdie'?-32:-44, scY=which==='birdie'?-8:-2;
  if(Pet.equipHat){
    c.fillStyle='#e53935';
    c.beginPath();c.moveTo(hatY-14+14,hatY);c.lineTo(hatY+14+14,hatY);c.lineTo(hatY+14,hatY-20);c.closePath();c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(hatY+14,hatY-20,5,0,7);c.fill();
  }
  if(Pet.equipScarf){
    c.strokeStyle='#42a5f5';c.lineWidth=7;c.lineCap='round';
    c.beginPath();c.moveTo(-18,scY);c.quadraticCurveTo(0,scY+6,18,scY);c.stroke();
  }
  if(Pet.equipPajamas){
    c.fillStyle='rgba(156,39,176,.30)';
    c.beginPath();c.ellipse(0,scY+12,24,18,0,0,7);c.fill();
  }
  // 限定装扮
  for(const li of (Pet.limited||[])){
    if(li==='starhair'){
      c.fillStyle='#ffd54f';
      c.beginPath();
      for(let i=0;i<5;i++){
        const a=-Math.PI/2+i*2*Math.PI/5, a2=a+Math.PI/5;
        c.lineTo(Math.cos(a)*14,hatY-8+Math.sin(a)*14);
        c.lineTo(Math.cos(a2)*6,hatY-8+Math.sin(a2)*6);
      }
      c.closePath();c.fill();
    }
  }
  c.restore();
}
function updatePetUI(){
  const names=[];
  if(Pet.unlocked)names.push('🐦 Birdie');
  if(Pet.wesley)names.push('🐱 Wesley');
  document.getElementById('petNames').textContent=names.join('  ·  ');
  document.getElementById('petStats').textContent=names.length?('🍖 x'+Pet.food+(Pet.wesley?'  ·  🐟 x'+Pet.catfood:'')):'';
  const $=id=>document.getElementById(id);
  if($('petStarChip'))$('petStarChip').textContent=Pet.stars;
  if($('noPets'))$('noPets').style.display=Pet.unlocked?'none':'';
  if($('noTreats'))$('noTreats').style.display=Pet.unlocked?'none':'';
  if($('feedBtn'))$('feedBtn').parentElement.style.display=Pet.unlocked?'':'none';
  if($('birdBar'))$('birdBar').parentElement.parentElement.parentElement.style.display=Pet.unlocked?'':'none';
  if($('birdBar'))$('birdBar').style.width=Math.min(100,Pet.fed/20*100)+'%';
  if($('catBar'))$('catBar').style.width=Math.min(100,Pet.catfed/10*100)+'%';
  if($('foodCount'))$('foodCount').textContent='🍖 x'+Pet.food;
  if($('catFoodCount'))$('catFoodCount').textContent='🐟 x'+Pet.catfood;
  document.getElementById('petFedTxt').textContent=Pet.fed>=20?
    'All grown up! Brings you 1 ⭐ for breakfast every morning.':
    (Pet.fed>=10?'Teen! '+(20-Pet.fed)+' more treats to grow up.':
    'Baby bird · '+Pet.fed+'/20 treats ('+(10-Pet.fed)+' more to become a teen)');
  document.getElementById('petCatFedTxt').textContent=!Pet.wesley?'':
    (Pet.catfed>=10?(Pet.wstage>=1?'All grown up! Catches fireflies for dark caves.':'Wesley is full!'):
    'Kitten · '+Pet.catfed+'/10 treats to grow up');
  document.getElementById('catRow').style.display=Pet.wesley?'':'none';
  document.getElementById('feedBtn').disabled=!(Pet.food>0&&Pet.fed<20);
  document.getElementById('exchangeBtn').disabled=!(Pet.stars>=10);
  document.getElementById('feedCatBtn').disabled=!(Pet.wesley&&Pet.catfood>0&&Pet.catfed<10);
  document.getElementById('exchangeCatBtn').disabled=!(Pet.stars>=10);
  // 萤火虫库存
  const ff=document.getElementById('petFirefly');
  if(ff)ff.textContent=Pet.wesley?('✨ Fireflies x'+(Pet.fireflies||0)+' (they light up dark caves)'):'';
  // 产心速度
  const hrB=heartRateText('birdie'),hrW=heartRateText('wesley');
  const hrEl=document.getElementById('petHeartRate');
  if(hrEl){
    const parts=[];
    if(hrB)parts.push('🐦 Birdie: '+hrB);
    if(hrW)parts.push('🐱 Wesley: '+hrW);
    hrEl.textContent=parts.length?('While you explore: '+parts.join('  ·  ')):'';
  }
  updateShopUI();
  updateSunUI();
  updateToolUI();
}
function checkBreakfast(){
  if(Pet.stage<2||!Pet.unlocked)return null; // 大鸟才行
  const today=new Date().toDateString();
  if(Pet.lastBreakfast===today)return null;
  Pet.lastBreakfast=today;Pet.stars++;petSave();
  return '🐦 Adult Birdie brought breakfast! +1 ⭐';
}
function showPet(which,first,contIdx){
  G.phase='pet';
  petCont=contIdx;
  const bk=checkBreakfast(); // 大鸟每日早餐
  const isW=which==='wesley';
  hideAllOverlays();
  document.getElementById('petOv').style.display='flex';
  petTab('friends');
  document.getElementById('petTitle').textContent=first?'🎉 New friend!':'Pet Hollow';
  const cer=document.getElementById('petCeremonyTxt');
  cer.style.display=first?'block':'none';
  cer.textContent=isW?
    'Cave 8 cleared! A kitten tumbled out of the grass and wants to be '+HERO_NAME+'\'s friend.':
    'Cave 5 cleared! A little bird fluttered down from the sky to be '+HERO_NAME+'\'s friend.';
  if(first)confetti();
  document.getElementById('petNextBtn').style.display=contIdx!=null?'':'none';
  if(contIdx!=null)document.getElementById('petNextBtn').textContent='Continue to Cave '+(contIdx+1)+' ▶';
  document.getElementById('petAgainBtn').style.display='none';
  updatePetUI();
  if(bk)setTimeout(()=>banner(bk,2600),600);
  petT0=Date.now();
  // 点宠物：开心地跳
  document.getElementById('petCv').onclick=function(e){
    const cv=e.target,rc=cv.getBoundingClientRect();
    const x=(e.clientX-rc.left)*(cv.width/rc.width),y=(e.clientY-rc.top)*(cv.height/rc.height);
    const H=cv.height||230;
    if(Pet.unlocked&&Math.hypot(x-186,y-(H-112))<55){petHappyUntil=Date.now()+1500;sfxFeed();}
    if(Pet.wesley&&Math.hypot(x-286,y-(H-96))<55){petHappyWUntil=Date.now()+1500;sfxFeed();}
  };
  try{cancelAnimationFrame(petRAF);}catch(e){}
  const loop=()=>{
    if(document.getElementById('petOv').style.display==='none')return;
    drawPetScene();
    petRAF=requestAnimationFrame(loop);
  };
  loop();
}
function hidePet(){document.getElementById('petOv').style.display='none';}
function doExchange(){
  if(Pet.stars<10)return;
  Pet.stars-=10;Pet.food++;petSave();updatePetUI();sfxStar();
}
function doFeed(){
  if(!(Pet.food>0&&Pet.fed<20))return;
  const gain=Pet.doubleFeed?2:1; // 一起睡醒来：快乐加倍
  if(Pet.doubleFeed){Pet.doubleFeed=false;}
  Pet.food--;Pet.fed=Math.min(20,Pet.fed+gain);
  Pet.lastFedB=Date.now();petSave();
  const ns=Pet.fed>=20?2:(Pet.fed>=10?1:0);
  petHappyUntil=Date.now()+900;
  updatePetUI();sfxFeed();
  if(gain>1)banner('💖 Double happiness! This feeding counts as 2!',2000);
  if(ns>Pet.stage){Pet.stage=ns;petSave();setTimeout(()=>showEvo('birdie'),1000);}
}
function doExchangeCat(){
  if(Pet.stars<10)return;
  Pet.stars-=10;Pet.catfood++;petSave();updatePetUI();sfxStar();
}
function doFeedCat(){
  if(!(Pet.wesley&&Pet.catfood>0&&Pet.catfed<10))return;
  const gain=Pet.doubleFeed?2:1;
  if(Pet.doubleFeed){Pet.doubleFeed=false;}
  Pet.catfood--;Pet.catfed=Math.min(10,Pet.catfed+gain);
  Pet.lastFedW=Date.now();petSave();
  petHappyWUntil=Date.now()+900;
  updatePetUI();sfxFeed();
  if(gain>1)banner('💖 Double happiness! This feeding counts as 2!',2000);
  if(Pet.catfed>=10&&Pet.wstage<1){Pet.wstage=1;petSave();setTimeout(()=>showEvo('wesley'),1000);}
}
function showEvo(which){
  const isW=which==='wesley';
  document.getElementById('evoOv').style.display='flex';
  if(isW){
    document.getElementById('evoTitle').textContent='✨ Wesley grew up!';
    document.getElementById('evoTxt').innerHTML=
      'Ate 10 cat food — Wesley grew from kitten to adult!<br>Golden body, pink belly, so cute!<br>🐟 At night the adult cat catches fireflies to light the Dark Cave!';
  }else if(Pet.stage>=2){
    document.getElementById('evoTitle').textContent='✨ Birdie became an adult!';
    document.getElementById('evoTxt').innerHTML=
      'Ate 20 bird food — Birdie grew from teen to adult!<br>Black body, golden head and feathers, so cool!<br>🌅 Every morning the adult bird brings back 1 star for "breakfast"!';
  }else{
    document.getElementById('evoTitle').textContent='✨ Birdie became a teen!';
    document.getElementById('evoTxt').innerHTML=
      'Ate 10 bird food — Birdie grew from baby to teen!<br>Bigger body with a golden crest!<br>10 more to become an adult!';
  }
  document.getElementById('evoOv').style.display='flex';
  const cv=document.getElementById('evoCv');
  if(cv&&cv.getContext){
    const c=cv.getContext('2d'),W=cv.width||200,H=cv.height||160;
    const g=c.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#fff8e1');g.addColorStop(1,'#ffecb3');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    if(isW)drawEvolvedWesley(c,W/2,H/2+26,0.95,1.2);
    else drawEvolvedBirdie(c,W/2-8,H/2+18,1.05,1.2,{});
    c.fillStyle='#f9a825';c.font='15px ui-rounded, system-ui, sans-serif';c.textAlign='center';
    c.fillText('✨ Grown Up! ✨',W/2,22);
  }
  sfxWin();
}

/* ---------- 状态 ---------- */
const MAX_HEARTS=5;
let G=null,totalStars=0,runHearts=3; // runHearts：整局 100 关基础 3 颗心，宠物/向日葵产心可补到 5 颗上限
function setHearts(n){runHearts=Math.max(0,Math.min(MAX_HEARTS,n));if(G)G.hearts=runHearts;}
const HEDGE_R=16;

function loadLevel(idx){
  const def=LEVELS[idx];
  const path=buildPath(def.waypoints);
  const level={
    def:def,path:path,half:def.half,
    pinches:(def.pinches||[]).map(p=>({s:p.frac*path.len,baseS:p.frac*path.len,slide:p.slide,
      half:p.half,len:p.len,skull:!!p.skull,
      spikes:!!p.spikes,shutHalf:p.shutHalf,chomp:p.chomp,chomp2:p.chomp2,boss:!!p.boss,spit:p.spit})),
    bows:(def.bows||[]).map((b,i)=>({s:b.frac*path.len,side:b.side,period:b.period,speed:b.speed,timer:1.1+i*0.8})),
    slings:(def.slings||[]).map((b,i)=>({s:b.frac*path.len,side:b.side,period:b.period,speed:b.speed,timer:2.0+i*1.1})),
    stars:[],
    fireflies:[],key:null,door:null,minions:[],spitT:3.5
  };
  for(let i=0;i<def.starN;i++){
    const f=pathFrame(path,(i+1)/(def.starN+1)*path.len);
    const off=(i%2===0?1:-1)*def.half*0.35;
    level.stars.push({x:f.x+f.nx*off,y:f.y+f.ny*off,got:false,ph:Math.random()*6});
  }
  if(def.dark){ // L10 黑黑大山洞：萤火虫
    const n=def.fireflyN||6;
    for(let i=0;i<n;i++){
      const f=pathFrame(path,(i+1)/(n+1)*path.len);
      const off=(i%2===0?1:-1)*def.half*0.3;
      level.fireflies.push({x:f.x+f.nx*off,y:f.y+f.ny*off,got:false,ph:Math.random()*6});
    }
  }
  if(def.key){ // L11 钥匙开门：钥匙藏在岔路小山洞
    const kf=pathFrame(path,def.key.frac*path.len);
    const off=def.key.off||38;
    level.key={x:kf.x+kf.nx*off,y:kf.y+kf.ny*off,got:false};
    level.alcoveS=def.key.frac*path.len;
    level.alcoveR=(def.alcove&&def.alcove.r)||75;
  }
  if(def.door)level.door={s:def.door.frac*path.len,open:false};
  const st=pathFrame(path,14);
  G={idx:idx,level:level,phase:'intro',time:0,hearts:runHearts,starGot:0,
     hasKey:false,lightGot:0,timeLeft:def.timeLimit||0,
     heartProgB:0,heartProgW:0,heartProgS:0,
     shieldT:0,bombAim:false,combo:0,comboT:-99,floats:[],booms:[],
     hed:{x:st.x,y:st.y,tx:st.x,ty:st.y,r:HEDGE_R,face:1},
     projs:[],invuln:0,sMax:0};
  showIntro(idx,false);
}

/* ---------- Cave naming / regions ---------- */
const REGIONS=[
  {name:'Mossy Caves',from:0,to:24,emoji:'🌿',desc:'Soft moss, gentle turns and your very first friends.'},
  {name:'Crystal Caverns',from:25,to:49,emoji:'💎',desc:'Sparkly tunnels, sneaky clamps and quick arrows.'},
  {name:'Moonlit Hollow',from:50,to:74,emoji:'🌙',desc:'Dark, dreamy caves. Fireflies help you see.'},
  {name:"Skull King's Lair",from:75,to:99,emoji:'👑',desc:'The trickiest caves of all. Only brave paws!'},
];
function regionOf(idx){return REGIONS.find(r=>idx>=r.from&&idx<=r.to)||REGIONS[0];}
function caveTitle(idx){const n=LEVELS[idx].name;const p=n.split(' · ');return p[1]||n;}
function cleanHint(h){const t=String(h||'').replace(/^\S*\s*Camera says:\s*/i,'');return t.charAt(0).toUpperCase()+t.slice(1);}

/* ---------- Progressive tips: shown the first time a mechanic appears ---------- */
const TIPS={
  drag:{ic:'👆',t:'Drag to roll',d:'Hold your finger on '+HERO_NAME+' and slide. Follow the blue arrows to the glowing exit.'},
  skull:{ic:'💀',t:'Skull tunnels',d:'Squeeze through the skull\'s mouth. It\'s a narrow spot!'},
  bow:{ic:'🏹',t:'Watch for arrows',d:'Bows glow red with a ! right before they shoot. Wait, then dash.'},
  sling:{ic:'🪨',t:'Slingshots',d:'Slingshots spray three pebbles at once. Pass between the shots.'},
  clamp:{ic:'🦷',t:'Snapping clamps',d:'Spiky clamps open and close. Roll through while they\'re open.'},
  run:{ic:'🏃',t:'Running clamps',d:'Some clamps slide along the tunnel. Watch their rhythm first.'},
  time:{ic:'⏱️',t:'Beat the clock',d:'This cave has a timer. Keep rolling!'},
  dark:{ic:'🔦',t:'Dark cave',d:'Catch fireflies to make your light bigger.'},
  key:{ic:'🔑',t:'Key & door',d:'Find the key in the side cave first. Then the stone door opens.'},
  boss:{ic:'👑',t:'The Skull King',d:'Double jaws and mini skeletons! Time your run between bites.'},
  tools:{ic:'🛡️',t:'Shield & bomb',d:'Tap 🛡️ for 2 seconds of protection, or 💣 then a hazard to pop it. Get more in Pet Hollow.'},
};
function tipsFor(idx){
  const d=LEVELS[idx],k=[];
  k.push('drag');
  if((d.pinches||[]).some(p=>p.skull&&!p.chomp))k.push('skull');
  if((d.bows||[]).length){k.push('bow');k.push('tools');}
  if((d.slings||[]).length)k.push('sling');
  if((d.pinches||[]).some(p=>p.chomp&&!p.boss))k.push('clamp');
  if((d.pinches||[]).some(p=>p.slide))k.push('run');
  if(d.timeLimit)k.push('time');
  if(d.dark)k.push('dark');
  if(d.key)k.push('key');
  if((d.pinches||[]).some(p=>p.boss))k.push('boss');
  return k;
}
function tipHTML(k,isNew){const t=TIPS[k];return '<div class="tip'+(isNew?' new':'')+'"><div class="ic">'+t.ic+'</div><div><b>'+t.t+'</b><span>'+t.d+'</span></div></div>';}
let pendingTips=[];

function showIntro(idx,passed){
  const def=LEVELS[idx];
  hideAllOverlays();
  const reg=regionOf(idx);
  document.getElementById('introTitle').textContent=reg.emoji+' '+reg.name+' · Cave '+(idx+1);
  document.getElementById('introLevel').textContent=caveTitle(idx);
  document.getElementById('introSub').textContent=def.sub;
  pendingTips=tipsFor(idx).filter(k=>!UI.seenTips.includes(k)).slice(0,2);
  document.getElementById('introTips').innerHTML=pendingTips.map(k=>tipHTML(k,true)).join('');
  document.getElementById('introHint').textContent=cleanHint(def.hint);
  document.getElementById('introHintBox').style.display=(pendingTips.length>=2||pendingTips.includes('drag'))?'none':'';
  document.getElementById('startBtn').textContent=idx===0&&!UI.seenTips.includes('drag')?'Let\'s roll!':'Go!';
  document.getElementById('startOv').style.display='flex';
  updateHeartShop();
}

/* ---------- 心用完了 ---------- */
function gameOver(){
  sfxHit();
  hideAllOverlays();
  document.getElementById('overStars').textContent='⭐ '+Pet.stars;
  let close='';
  if(G&&G.level&&G.level.path.len>0&&G.sMax/G.level.path.len>0.8)
    close='So close! You almost made it. \u{1F4AA}';
  document.getElementById('overClose').textContent=close;
  document.getElementById('retryBtn').textContent='Try Cave '+(G.idx+1)+' again';
  document.getElementById('reviveBtn').style.display=Pet.stars>=20?'':'none';
  document.getElementById('restartBtn').style.display=G.idx>0?'':'none';
  document.getElementById('overOv').style.display='flex';
}
/* ---------- 过关 ---------- */
function showClear(idx){
  hideAllOverlays();
  const def=LEVELS[idx];
  const titles=['Cave conquered!','Hooray, '+HERO_NAME+'!','You did it!','Rolling star!','Brilliant paws!'];
  document.getElementById('clearTitle').textContent=titles[idx%titles.length];
  document.getElementById('clearSub').textContent='Cave '+(idx+1)+' · '+caveTitle(idx)+' explored.';
  document.getElementById('clearStars').textContent=G.starGot+'/'+def.starN;
  document.getElementById('clearHearts').textContent=runHearts>0?'❤'.repeat(runHearts):'0';
  document.getElementById('clearBank').textContent=Pet.stars;
  document.getElementById('clearPetBtn').style.display='';
  document.getElementById('clearNextBtn').textContent='Next: Cave '+(idx+2)+' ▶';
  document.getElementById('clearOv').style.display='flex';
  confetti();
}
/* ---------- 全部 12 关通关 ---------- */
function showWin(){
  hideAllOverlays();
  document.getElementById('winStats').textContent='⭐ '+Pet.stars+' stars saved  ·  ❤ '+runHearts+'/'+MAX_HEARTS;
  document.getElementById('winOv').style.display='flex';
  confetti();
}
/* ---------- 哄睡 ---------- */
function doSleep(){
  if(!petSleepy())return;
  if(!Pet.nest){banner('🪹 Buy a nest from the treasure box first so pets can sleep!',2600);return;}
  const together=Pet.unlocked&&Pet.wesley;
  Pet.sleepTogether=together;
  Pet.sleepUntil=Date.now()+6000;
  petSave();updatePetUI();
  banner(together?'💤 Both squeezed into the nest, asleep…':'💤 Sleeping…',2000);
  setTimeout(wakeUp,6200);
}
function wakeUp(){
  Pet.sleepUntil=0;
  const together=Pet.sleepTogether;
  Pet.sleepTogether=false;
  Pet.levelsSinceSleep=0;
  const roll=Math.random();
  let gift;
  if(roll<0.12){
    if(!Pet.limited.includes('starhair'))Pet.limited.push('starhair');
    gift='🎁 Dream gift: limited 「Star Headband」!';
  }else if(roll<0.42){
    Pet.stars++;gift='🎁 Dream gift: 1 star ⭐!';
  }else if(Pet.wesley&&Math.random()<0.5){
    Pet.catfood++;gift='🎁 Dream gift: 1 cat food 🐟!';
  }else{
    Pet.food++;gift='🎁 Dream gift: 1 bird food 🍖!';
  }
  let ff='';
  if(Pet.wesley&&Pet.wstage>=1){Pet.fireflies=(Pet.fireflies||0)+1;ff=' 🐱 Adult Wesley caught 1 firefly!';}
  if(together){Pet.doubleFeed=true;gift+=' 💤 Slept together, super happy — next feeding counts double!';}
  petSave();updatePetUI();
  banner(gift+ff,3400);
  sfxFeed();
}
/* ---------- 百宝箱 ---------- */
const SHOP=[
  {id:'nest',name:'🪹 Nest',price:15},
  {id:'hat',name:'🎩 Hat',price:15},
  {id:'scarf',name:'🧣 Scarf',price:20},
  {id:'pajamas',name:'🌙 Pajamas',price:25},
];
function buyAcc(id){
  const it=SHOP.find(s=>s.id===id);
  if(!it||Pet[it.id]||Pet.stars<it.price)return;
  Pet.stars-=it.price;Pet[it.id]=true;petSave();
  updatePetUI();sfxStar();
  banner('🎁 Got '+it.name+'！',2000);
}
function toggleAcc(id){
  if(id==='hat')Pet.equipHat=!Pet.equipHat;
  if(id==='scarf')Pet.equipScarf=!Pet.equipScarf;
  if(id==='pajamas')Pet.equipPajamas=!Pet.equipPajamas;
  petSave();updateShopUI();
}
function updateShopUI(){
  for(const it of SHOP){
    const btn=document.getElementById('shop_'+it.id);
    if(!btn)continue;
    if(Pet[it.id]){
      if(it.id==='nest'){btn.innerHTML='🪹 Nest<small>✓ Yours</small>';btn.disabled=true;btn.onclick=null;}
      else{
        const eq=(it.id==='hat'&&Pet.equipHat)||(it.id==='scarf'&&Pet.equipScarf)||(it.id==='pajamas'&&Pet.equipPajamas);
        btn.innerHTML=it.name+(eq?'<small>✓ Wearing · tap to take off</small>':'<small>Tap to wear</small>');btn.classList.toggle('mint',!!eq);
        btn.disabled=false;btn.onclick=()=>toggleAcc(it.id);
      }
    }else{
      btn.innerHTML=it.name+'<small>'+it.price+' ⭐</small>';btn.classList.remove('mint');
      btn.disabled=!(Pet.stars>=it.price);
      btn.onclick=()=>buyAcc(it.id);
    }
  }
  const slp=document.getElementById('sleepBtn');
  if(slp){
    const sleeping=Pet.sleepUntil&&Date.now()<Pet.sleepUntil;
    slp.style.display=(petSleepy()&&!sleeping)?'':'none';
    slp.textContent=Pet.nest?'Tuck in':'Need a nest';
  }
}
/* ---------- 宠物产心 ---------- */
// 每只宠物每隔 N 秒产 1 颗心（玩游戏时）。阶段越高速越快，穿装备再加速。
function heartInterval(which){
  let base;
  if(which==='birdie'){
    if(!Pet.unlocked)return 0;
    base=Pet.stage>=2?180:(Pet.stage>=1?240:300); // 大鸟3分，少年4分，宝宝5分
  }else{
    if(!Pet.wesley)return 0;
    base=Pet.wstage>=1?180:300; // 大猫3分，小猫5分
  }
  let mult=1;
  if(Pet.equipHat)mult*=0.8;
  if(Pet.equipScarf)mult*=0.8;
  if(Pet.equipPajamas)mult*=0.8;
  return base*mult;
}
function heartRateText(which){
  const iv=heartInterval(which);
  if(iv<=0)return '';
  const m=Math.round(iv/60*10)/10;
  return '❤️ every '+m+' min';
}
/* ---------- 每关开始前：20⭐ 换 1❤️ ---------- */
function updateHeartShop(){
  document.getElementById('shopInfo').textContent='❤ '+runHearts+'/'+MAX_HEARTS+'  ·  ⭐ '+Pet.stars;
  const can=Pet.stars>=20&&runHearts<3;
  document.getElementById('heartBtn').disabled=!can;
  document.getElementById('heartBtn').style.display=runHearts<3?'':'none';
}

/* ---------- 输入：手指挪刺猬 ---------- */
function toLogical(e){
  return {x:(e.clientX-ox)/scale,y:(e.clientY-oy)/scale};
}
let pActive=false;
cv.addEventListener('pointerdown',e=>{
  e.preventDefault();pActive=true;
  try{cv.setPointerCapture(e.pointerId);}catch(err){}
  const p=toLogical(e);
  if(G&&G.phase==='play'){
    if(G.bombAim){bombTap(p.x,p.y);pActive=false;return;} // 炸弹瞄准模式：点危险物
    G.hed.tx=p.x;G.hed.ty=p.y;
  }
});
cv.addEventListener('pointermove',e=>{
  if(!pActive)return;
  const p=toLogical(e);
  if(G&&G.phase==='play'&&!G.bombAim){G.hed.tx=p.x;G.hed.ty=p.y;}
});
const pEnd=()=>{pActive=false;};
cv.addEventListener('pointerup',pEnd);
cv.addEventListener('pointercancel',pEnd);
window.addEventListener('keydown',e=>{ // 电脑上也能玩
  if(!G||G.phase!=='play')return;
  const h=G.hed,st=26;
  if(e.key==='ArrowLeft'||e.key==='a')h.tx-=st;
  if(e.key==='ArrowRight'||e.key==='d')h.tx+=st;
  if(e.key==='ArrowUp'||e.key==='w')h.ty-=st;
  if(e.key==='ArrowDown'||e.key==='s')h.ty+=st;
  if(e.key===' '){e.preventDefault();h.tx=h.x;h.ty=h.y;}
});

/* ---------- 提示 ---------- */
let warnTimer=null,tipTimer=null;
function banner(t,ms){
  const w=document.getElementById('warn');
  document.getElementById('warnTxt').textContent=t;
  w.classList.add('show');
  clearTimeout(warnTimer);warnTimer=setTimeout(()=>w.classList.remove('show'),ms||2600);
}

/* ---------- 发射 ---------- */
function fireBow(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s,G.time);
  const px=f.x+f.nx*b.side*(hw+2),py=f.y+f.ny*b.side*(hw+2);
  const vx=-f.nx*b.side*b.speed,vy=-f.ny*b.side*b.speed;
  G.projs.push({x:px,y:py,vx:vx,vy:vy,life:2.4,kind:'arrow',ang:Math.atan2(vy,vx)});
  sfxShoot();
}
function fireSling(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s,G.time);
  const px=f.x+f.nx*b.side*(hw+2),py=f.y+f.ny*b.side*(hw+2);
  const base=Math.atan2(-f.ny*b.side,-f.nx*b.side);
  for(const o of [-0.28,0,0.28]){
    const a=base+o;
    G.projs.push({x:px,y:py,vx:Math.cos(a)*b.speed,vy:Math.sin(a)*b.speed,life:2.6,kind:'peb'});
  }
  sfxShoot();
}

/* ---------- 逻辑 ---------- */
function update(dt){
  G.time+=dt;
  const L=G.level,h=G.hed;
  G.invuln=Math.max(0,G.invuln-dt);
  G.shieldT=Math.max(0,(G.shieldT||0)-dt);
  for(const f of G.floats)f.t+=dt;
  G.floats=G.floats.filter(f=>f.t<1.2);
  for(const b of G.booms)b.t+=dt;
  G.booms=G.booms.filter(b=>b.t<0.6);
  // 宠物产心：玩游戏时按速度攒，满了就补 1 颗（上限 5）
  const ivB=heartInterval('birdie'),ivW=heartInterval('wesley');
  if(ivB>0&&runHearts<MAX_HEARTS){
    G.heartProgB+=dt;
    if(G.heartProgB>=ivB){G.heartProgB=0;setHearts(runHearts+1);banner('💖 Birdie made a ❤️!',1800);sfxStar();}
  }
  if(ivW>0&&runHearts<MAX_HEARTS){
    G.heartProgW+=dt;
    if(G.heartProgW>=ivW){G.heartProgW=0;setHearts(runHearts+1);banner('💖 Wesley made a ❤️!',1800);sfxStar();}
  }
  // 向日葵产心：开花后每 8 分钟产 1 颗（玩游戏时）
  if((Pet.sunStage||0)>=3&&runHearts<MAX_HEARTS){
    G.heartProgS+=dt;
    if(G.heartProgS>=480){G.heartProgS=0;setHearts(runHearts+1);banner('🌻 Sunflower made a ❤️!',1800);sfxStar();}
  }
  // 限时关：倒计时
  if(G.timeLeft>0){
    G.timeLeft-=dt;
    if(G.timeLeft<=0){
      G.timeLeft=0;
      setHearts(runHearts-1);sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('⏱️ Time\'s up! Lost 1 heart, retry this level',2200);
      setTimeout(()=>{loadLevel(G.idx);showIntro(G.idx,false);},1400);
      G.phase='done';
      return;
    }
  }
  // 刺猬跟随手指
  const k=Math.min(1,dt*9);
  const px=h.x,py=h.y;
  h.x+=(h.tx-h.x)*k;h.y+=(h.ty-h.y)*k;
  if(Math.abs(h.tx-h.x)>2)h.face=h.tx>h.x?1:-1;
  const c=clampToTunnel(L.path,L,h.x,h.y,h.r,G.time);
  h.x=c.x;h.y=c.y;
  if(c.s>G.sMax)G.sMax=c.s;
  // L11 石门：没钥匙不能过去
  if(L.door&&!L.door.open){
    if(c.s>L.door.s-26){
      const df=pathFrame(L.path,L.door.s-26);
      h.x=df.x;h.y=df.y;h.tx=df.x;h.ty=df.y;
      if(!G._doorHint||G.time-G._doorHint>4){
        G._doorHint=G.time;
        banner('🚪 Stone door blocks the way! Find the key in the side path first 🔑',2200);
      }
    }
  }
  // L11 捡钥匙
  if(L.key&&!L.key.got&&circleHit(L.key.x,L.key.y,12,h.x,h.y,h.r+6)){
    L.key.got=true;G.hasKey=true;if(L.door)L.door.open=true;
    banner('🔑 Found the key! The stone door is open!',2200);sfxStar();
  }
  // L10 抓萤火虫：光圈变大
  for(const fl of L.fireflies){
    if(!fl.got&&circleHit(fl.x,fl.y,10,h.x,h.y,h.r+6)){
      fl.got=true;G.lightGot++;sfxStar();
      banner('✨ Caught a firefly! Light grew bigger',1500);
    }
  }
  // L12 大骷髅王吐小骷髅兵
  for(const pin of L.pinches){
    if(pin.boss&&pin.spit){
      L.spitT-=dt;
      if(L.spitT<=0){
        L.spitT=pin.spit.period;
        const bf=pathFrame(L.path,pinchS(pin,G.time));
        const a=Math.random()*Math.PI*2;
        L.minions.push({x:bf.x,y:bf.y,vx:Math.cos(a)*46,vy:Math.sin(a)*46,life:7,ph:Math.random()*6});
        banner('💀 The Skull King spat out mini skeletons!',1500);
      }
    }
  }
  const mkeep=[];
  for(const m of L.minions){
    m.life-=dt;m.ph+=dt*3;
    m.x+=m.vx*dt;m.y+=m.vy*dt;
    const mn=nearestOnPath(L.path,m.x,m.y);
    const mhw=halfWidthAt(L,mn.s,G.time)-8;
    if(mn.dist>mhw){m.vx*=-1;m.vy*=-1;}
    if(m.life<=0)continue;
    if(G.invuln<=0&&circleHit(m.x,m.y,12,h.x,h.y,h.r)){
      setHearts(runHearts-1);G.invuln=1.6;sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('Ouch! Hit by a mini skeleton! Hearts left: '+'❤'.repeat(runHearts),1800);
      continue;
    }
    mkeep.push(m);
  }
  L.minions=mkeep;
  // 弓箭 / 弹弓
  for(const b of L.bows){
    b.timer-=dt;
    if(b.timer<=0){fireBow(b);b.timer=b.period;}
  }
  for(const b of L.slings){
    b.timer-=dt;
    if(b.timer<=0){fireSling(b);b.timer=b.period;}
  }
  // 飞行物
  const keep=[];
  for(const p of G.projs){
    if(!stepProjectile(p,dt))continue;
    const n=nearestOnPath(L.path,p.x,p.y);
    const hw=halfWidthAt(L,n.s,G.time);
    if(n.dist>hw+30)continue; // 打到对面墙上
    const pr=p.kind==='arrow'?6:7;
    const pd=Math.hypot(p.x-h.x,p.y-h.y);
    if(G.invuln<=0&&pd<pr+h.r){
      setHearts(runHearts-1);G.invuln=1.6;sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('Ouch! Hit! Hearts left: '+'❤'.repeat(runHearts),1800);
      continue;
    }
    if(pd<pr+h.r+30){ // 擦弹奖励：近而不中 +2⭐（每颗飞行物 1 秒冷却）
      if(!p._nm||G.time-p._nm>1){
        p._nm=G.time;Pet.stars+=2;totalStars+=2;petSave();
        addFloat('Close! +2⭐',h.x,h.y-30,'#ffd54f');sfxStar();
      }
    }
    keep.push(p);
  }
  G.projs=keep;
  // 骷髅夹子夹人：夹紧的一瞬间如果刺猬在嘴里，就会被夹到
  for(const pin of L.pinches){
    if(!pin.chomp)continue;
    const ps=pinchS(pin,G.time);
    const cst=chompState(pin,G.time);
    const cst2=pin.chomp2?chompState({chomp:pin.chomp2},G.time):null;
    const shut=(cst.open===0||(cst2&&cst2.open===0));
    const pds=Math.abs(c.s-ps);
    if(shut&&pds<pin.len*0.85&&G.invuln<=0){
      setHearts(runHearts-1);G.invuln=1.6;sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('Ow! Caught by the clamp! Hearts left: '+'❤'.repeat(runHearts),1800);
      break;
    }
    if(shut&&pds<pin.len&&G.invuln<=0){ // 擦身而过 +2⭐（每个夹子 1 秒冷却）
      if(!pin._nm||G.time-pin._nm>1){
        pin._nm=G.time;Pet.stars+=2;totalStars+=2;petSave();
        addFloat('Close! +2⭐',h.x,h.y-30,'#ffd54f');sfxStar();
      }
    }
  }
  // 星星（连击：2.5 秒内连吃星星，x2/x3… 星星价值翻倍）
  for(const s of L.stars){
    if(!s.got&&circleHit(s.x,s.y,10,h.x,h.y,h.r+4)){
      s.got=true;G.starGot++;
      if(G.time-G.comboT<2.5)G.combo=Math.min(9,G.combo+1);else G.combo=1;
      G.comboT=G.time;
      totalStars+=G.combo;Pet.stars+=G.combo;petSave();sfxStar();
      if(G.combo>=2)addFloat('COMBO x'+G.combo+'!',s.x,s.y-26,'#ffca28');
    }
  }
  // 到出口？
  if(G.sMax>=L.path.len-30){
    G.phase='done';sfxWin();
    Pet.levelsSinceSleep=(Pet.levelsSinceSleep||0)+1;
    Pet.maxLv=Math.max(Pet.maxLv||0,Math.min(99,G.idx+1));petSave(); // 解锁下一关（选关用）
    if(G.idx===4){
      const first=!Pet.unlocked;      // 第 5 关：小鸟泥
      Pet.unlocked=true;petSave();
      showPet('birdie',first,5);
    }else if(G.idx===7){
      const first=!Pet.wesley;        // 第 8 关：小猫 Wesley
      Pet.wesley=true;Pet.unlocked=true;petSave();
      showPet('wesley',first,8);
    }else if(G.idx>=LEVELS.length-1){
      showWin();                       // 第 12 关：打败大骷髅王，全部通关！
    }else{
      sfxLevel();
      const ci=G.idx; // 过关卡片：下一关 / 宠物小家 / 地图
      setTimeout(()=>{if(G&&G.idx===ci&&G.phase==='done')showClear(ci);},700);
    }
  }
}

/* ---------- 画画 ---------- */
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function drawTunnel(){
  const L=G.level,pts=L.path.pts;
  // 墙（深色 halo）+ 地面
  for(let i=0;i<pts.length;i+=2){
    const p=pts[i],hw=halfWidthAt(L,p.s,G.time);
    ctx.fillStyle='#4e342e';
    ctx.beginPath();ctx.arc(p.x,p.y,hw+10,0,7);ctx.fill();
  }
  for(let i=0;i<pts.length;i+=2){
    const p=pts[i],hw=halfWidthAt(L,p.s,G.time);
    ctx.fillStyle='#d9b384';
    ctx.beginPath();ctx.arc(p.x,p.y,hw,0,7);ctx.fill();
  }
  // 手绘风：隧道两边加抖动虚线描边
  ctx.save();
  ctx.strokeStyle='rgba(62,39,35,.55)';ctx.lineWidth=3;ctx.lineCap='round';
  ctx.setLineDash([14,10]);
  const t0=G.time*0.7; // 虚线缓慢流动，像手绘
  ctx.lineDashOffset=-t0*8;
  for(const side of [-1,1]){
    ctx.beginPath();
    let started=false;
    for(let s=0;s<L.path.len;s+=18){
      const f=pathFrame(L.path,s);
      const ang=Math.atan2(f.ty,f.tx);
      const nx=-Math.sin(ang),ny=Math.cos(ang);
      const hw=halfWidthAt(L,s,G.time);
      // 加一点正弦抖动，模拟手绘不直
      const wob=Math.sin(s*0.05+t0)*3;
      const x=f.x+nx*(hw+4+wob)*side, y=f.y+ny*(hw+4+wob)*side;
      if(!started){ctx.moveTo(x,y);started=true;}
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // 蓝色箭头（像 Steven 画里的）
  ctx.save();
  for(let s=70;s<L.path.len-50;s+=115){
    const f=pathFrame(L.path,s);
    const ang=Math.atan2(f.ty,f.tx);
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(ang);
    ctx.strokeStyle='rgba(66,165,245,.9)';ctx.lineWidth=6;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-17,0);ctx.lineTo(9,0);ctx.stroke();
    ctx.fillStyle='rgba(66,165,245,.9)';
    ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(5,-9);ctx.lineTo(5,9);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawStartExit(){
  const L=G.level;
  const st=pathFrame(L.path,8);
  ctx.fillStyle='#1c1512';
  ctx.beginPath();ctx.ellipse(st.x,st.y,halfWidthAt(L,8,G.time)*0.85,halfWidthAt(L,8,G.time)*0.7,0,0,7);ctx.fill();
  ctx.fillStyle='#a1887f';ctx.font='15px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';
  ctx.fillText('Start',st.x,st.y+halfWidthAt(L,8,G.time)+22);
  const en=pathFrame(L.path,L.path.len-8);
  const g=ctx.createRadialGradient(en.x,en.y,4,en.x,en.y,52);
  g.addColorStop(0,'rgba(255,249,196,.95)');g.addColorStop(1,'rgba(255,249,196,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(en.x,en.y,52,0,7);ctx.fill();
  ctx.fillStyle='#fffde7';ctx.strokeStyle='#ffb300';ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(en.x,en.y,26,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e65100';ctx.font='15px ui-rounded, system-ui, sans-serif';
  ctx.fillText('Exit',en.x,en.y+5);
}

function drawCamera(){
  const L=G.level,f=pathFrame(L.path,52);
  const ang=Math.atan2(f.ty,f.tx);
  const cx=f.x+f.nx*-(halfWidthAt(L,52,G.time)*0.4),cy=f.y+f.ny*-(halfWidthAt(L,52,G.time)*0.4);
  ctx.save();ctx.translate(cx,cy);
  ctx.font='30px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';
  ctx.fillText('📷',0,0);
  ctx.restore();
  ctx.save();ctx.translate(cx,cy-34);ctx.rotate(0);
  ctx.fillStyle='rgba(255,255,255,.94)';
  const tw=86;
  rr(-tw/2,-16,tw,28,13);ctx.fill();
  ctx.fillStyle='#5d4037';ctx.font='14px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';
  ctx.fillText('This way!',0,3);
  ctx.restore();
}

function drawSkull(pin){
  const L=G.level,f=pathFrame(L.path,pinchS(pin,G.time));
  const ang=Math.atan2(f.ty,f.tx);
  const st=chompState(pin,G.time);
  const bs=pin.boss?1.7:1; // Boss 骷髅王：1.7 倍大
  const mh=pin.chomp?(pin.half+(6-pin.half)*(1-st.open)):pin.half; // 夹子开合：嘴巴张大/夹紧
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(ang);ctx.scale(bs,bs);
  if(st.warn){ // 预警：红光+抖动
    ctx.fillStyle='rgba(239,83,80,'+(0.22+0.18*Math.sin(G.time*16))+')';
    ctx.beginPath();ctx.arc(0,0,54,0,7);ctx.fill();
    ctx.translate(Math.sin(G.time*40)*3,0);
  }
  // 头
  ctx.fillStyle='#eceff1';ctx.strokeStyle='#616161';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,40,0,7);ctx.fill();ctx.stroke();
  // 嘴巴通道（隧道从这里穿过）
  ctx.fillStyle='#d9b384';
  rr(-48,-mh,96,mh*2,10);ctx.fill();
  // 牙齿/尖刺（只画在头圆以内）
  ctx.save();
  ctx.beginPath();ctx.arc(0,0,40,0,7);ctx.clip();
  if(pin.spikes){
    ctx.fillStyle='#90a4ae';ctx.strokeStyle='#546e7a';ctx.lineWidth=1.5;
    for(let i=-3;i<=3;i++){
      const sx=i*13;
      ctx.beginPath();ctx.moveTo(sx-6,-mh);ctx.lineTo(sx+6,-mh);ctx.lineTo(sx,-mh+15);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(sx-6,mh);ctx.lineTo(sx+6,mh);ctx.lineTo(sx,mh-15);ctx.closePath();ctx.fill();ctx.stroke();
    }
  }else{
    ctx.fillStyle='#fafafa';ctx.strokeStyle='#9e9e9e';ctx.lineWidth=1.5;
    for(let i=-3;i<=3;i++){
      ctx.fillRect(i*13-5,-mh-13,10,13);ctx.strokeRect(i*13-5,-mh-13,10,13);
      ctx.fillRect(i*13-5,mh,10,13);ctx.strokeRect(i*13-5,mh,10,13);
    }
  }
  ctx.restore();
  if(pin.chomp2){ // Boss 双重夹子：内层小嘴，节奏和外层错开
    const st2=chompState({chomp:pin.chomp2},G.time);
    const mh2=pin.half*0.5+(5-pin.half*0.5)*(1-st2.open);
    ctx.fillStyle='#78909c';ctx.strokeStyle='#455a64';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,22,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#d9b384';
    rr(-26,-mh2,52,mh2*2,8);ctx.fill();
    ctx.fillStyle='#eceff1';
    for(let i=-1;i<=1;i++){
      ctx.fillRect(i*13-4,-mh2-10,8,10);
      ctx.fillRect(i*13-4,mh2,8,10);
    }
  }
  // 眼睛（嘴巴上方）
  ctx.fillStyle='#212121';
  ctx.beginPath();ctx.arc(-13,-30,6,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(13,-30,6,0,7);ctx.fill();
  ctx.restore();
}

function drawBow(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s,G.time);
  const bx=f.x+f.nx*b.side*(hw+4),by=f.y+f.ny*b.side*(hw+4);
  const ang=Math.atan2(-f.ny*b.side,-f.nx*b.side);
  const tele=b.timer<0.7;
  ctx.save();ctx.translate(bx,by);ctx.rotate(ang);
  if(tele){
    ctx.fillStyle='rgba(239,83,80,'+(0.22+0.18*Math.sin(G.time*14))+')';
    ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='20px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';
    ctx.fillText('!',0,-30);
  }
  ctx.strokeStyle='#6d4c41';ctx.lineWidth=6;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(0,0,20,-1.15,1.15);ctx.stroke();
  const sx=Math.cos(-1.15)*20,sy=Math.sin(-1.15)*20;
  const ex=Math.cos(1.15)*20,ey=Math.sin(1.15)*20;
  const pull=tele?-10:2;
  ctx.strokeStyle='#d7ccc8';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(pull,0);ctx.lineTo(ex,ey);ctx.stroke();
  if(tele){
    ctx.strokeStyle='#8d6e63';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(pull-8,0);ctx.lineTo(pull+20,0);ctx.stroke();
    ctx.fillStyle='#8d6e63';
    ctx.beginPath();ctx.moveTo(pull+28,0);ctx.lineTo(pull+18,-5);ctx.lineTo(pull+18,5);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function drawSling(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s,G.time);
  const bx=f.x+f.nx*b.side*(hw+4),by=f.y+f.ny*b.side*(hw+4);
  const ang=Math.atan2(-f.ny*b.side,-f.nx*b.side);
  const tele=b.timer<0.8;
  ctx.save();ctx.translate(bx,by);ctx.rotate(ang);
  if(tele){
    ctx.fillStyle='rgba(239,83,80,'+(0.22+0.18*Math.sin(G.time*14))+')';
    ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='20px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';
    ctx.fillText('!',0,-30);
  }
  ctx.strokeStyle='#6d4c41';ctx.lineWidth=7;ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-15,0);ctx.lineTo(-1,0);
  ctx.moveTo(-1,0);ctx.lineTo(11,-10);
  ctx.moveTo(-1,0);ctx.lineTo(11,10);
  ctx.stroke();
  ctx.strokeStyle='#d7ccc8';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(11,-10);
  if(tele)ctx.quadraticCurveTo(2,0,11,10);
  else ctx.lineTo(11,10);
  ctx.stroke();
  if(tele){
    ctx.fillStyle='#9e9e9e';
    ctx.beginPath();ctx.arc(4,0,6.5,0,7);ctx.fill();
    ctx.fillStyle='#616161';
    ctx.beginPath();ctx.arc(2,-2,2,0,7);ctx.fill();
  }
  ctx.restore();
}

function drawProjs(){
  for(const p of G.projs){
    if(p.kind==='arrow'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.ang);
      ctx.strokeStyle='#5d4037';ctx.lineWidth=4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(10,0);ctx.stroke();
      ctx.fillStyle='#5d4037';
      ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(7,-6);ctx.lineTo(7,6);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#b0bec5';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-20,-5);ctx.moveTo(-14,0);ctx.lineTo(-20,5);ctx.stroke();
      ctx.restore();
    }else{
      ctx.fillStyle='#9e9e9e';
      ctx.beginPath();ctx.arc(p.x,p.y,6.5,0,7);ctx.fill();
      ctx.fillStyle='#616161';
      ctx.beginPath();ctx.arc(p.x-2,p.y-2,2,0,7);ctx.fill();
    }
  }
}

function drawStars(){
  const L=G.level;
  for(const s of L.stars){
    if(s.got)continue;
    const bob=Math.sin(G.time*4+s.ph)*3;
    ctx.save();ctx.translate(s.x,s.y+bob);
    ctx.font='26px ui-rounded, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('⭐',0,0);
    ctx.restore();
  }
  ctx.textBaseline='alphabetic';
}

function drawHedgehog(){
  const h=G.hed;
  ctx.save();ctx.translate(h.x,h.y);
  if(G.invuln>0&&G.shieldT<=0&&Math.floor(G.time*10)%2===0)ctx.globalAlpha=0.35;
  // 刺（手绘勾边）
  ctx.fillStyle='#5d4037';
  for(let i=0;i<9;i++){
    const a=Math.PI*(0.08+i*0.21);
    const x1=Math.cos(a)*13,y1=-Math.sin(a)*13;
    const x2=Math.cos(a)*23,y2=-Math.sin(a)*23;
    const pa=a+0.11,pb=a-0.11;
    ctx.beginPath();
    ctx.moveTo(Math.cos(pa)*12,-Math.sin(pa)*12);
    ctx.lineTo(x2,y2);
    ctx.lineTo(Math.cos(pb)*12,-Math.sin(pb)*12);
    ctx.closePath();ctx.fill();
  }
  // 身体（手绘勾边）
  ctx.fillStyle='#8d6e63';
  ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.fill();
  // 脸（手绘勾边）
  ctx.fillStyle='#d7b98f';
  ctx.beginPath();ctx.arc(h.face*8,4,9.5,0,7);ctx.fill();
  // 眼睛
  ctx.fillStyle='#212121';
  ctx.beginPath();ctx.arc(h.face*10,-1,2.4,0,7);ctx.fill();
  // 鼻子
  ctx.fillStyle='#ef9a9a';
  ctx.beginPath();ctx.arc(h.face*16,5,3.2,0,7);ctx.fill();
  // 腮红
  ctx.fillStyle='rgba(239,154,154,.7)';
  ctx.beginPath();ctx.arc(h.face*6,8,2.6,0,7);ctx.fill();
  ctx.restore();
  if(G.shieldT>0){ // 护盾气泡
    ctx.save();ctx.translate(h.x,h.y);
    ctx.fillStyle='rgba(66,165,245,.10)';
    ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    ctx.strokeStyle='rgba(66,165,245,.9)';ctx.lineWidth=3.5;
    ctx.beginPath();ctx.arc(0,0,27+Math.sin(G.time*8)*2,0,7);ctx.stroke();
    ctx.restore();
  }
}

function drawMinions(){
  const L=G.level;
  for(const m of L.minions){
    ctx.save();ctx.translate(m.x,m.y+Math.sin(m.ph)*3);
    ctx.fillStyle='#eceff1';ctx.strokeStyle='#616161';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,12,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e53935'; // 红眼睛，坏坏的
    ctx.beginPath();ctx.arc(-4,-3,3,0,7);ctx.fill();
    ctx.beginPath();ctx.arc(4,-3,3,0,7);ctx.fill();
    ctx.fillStyle='#fafafa';
    ctx.fillRect(-6,5,4,5);ctx.fillRect(2,5,4,5);
    ctx.restore();
  }
}
function drawFireflies(){
  const L=G.level;
  for(const fl of L.fireflies){
    if(fl.got)continue;
    const tw=0.6+0.4*Math.sin(G.time*4+fl.ph);
    ctx.save();ctx.translate(fl.x,fl.y+Math.sin(G.time*2+fl.ph)*4);
    ctx.fillStyle='rgba(255,235,59,'+(0.25*tw)+')';
    ctx.beginPath();ctx.arc(0,0,16*tw,0,7);ctx.fill();
    ctx.fillStyle='#ffeb3b';
    ctx.beginPath();ctx.arc(0,0,6,0,7);ctx.fill();
    ctx.fillStyle='#fffde7';
    ctx.beginPath();ctx.arc(-1.5,-1.5,2.5,0,7);ctx.fill();
    ctx.restore();
  }
}
function drawKey(){
  const L=G.level;
  if(!L.key||L.key.got)return;
  const bob=Math.sin(G.time*3)*4;
  ctx.save();ctx.translate(L.key.x,L.key.y+bob);
  ctx.fillStyle='rgba(255,213,79,.3)';
  ctx.beginPath();ctx.arc(0,0,20+Math.sin(G.time*4)*3,0,7);ctx.fill();
  ctx.fillStyle='#ffd54f';ctx.strokeStyle='#ff8f00';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(-8,0,8,0,7);ctx.fill();ctx.stroke();
  ctx.fillRect(-8,-3,22,6);
  ctx.fillRect(8,-3,5,10);ctx.fillRect(15,-3,5,8);
  ctx.restore();
}
function drawDoor(){
  const L=G.level;
  if(!L.door||L.door.open)return;
  const f=pathFrame(L.path,L.door.s);
  const ang=Math.atan2(f.ty,f.tx);
  const hw=halfWidthAt(L,L.door.s,G.time);
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(ang);
  ctx.fillStyle='#78909c';ctx.strokeStyle='#455a64';ctx.lineWidth=3;
  rr(-8,-hw,8,hw,4);ctx.fill();ctx.stroke();
  rr(0,-hw,8,hw,4);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#546e7a';ctx.lineWidth=1.5;
  for(let y=-hw+10;y<hw-5;y+=18){
    ctx.beginPath();ctx.moveTo(-8,y);ctx.lineTo(8,y);ctx.stroke();
  }
  ctx.fillStyle='#37474f';
  ctx.beginPath();ctx.arc(0,0,6,0,7);ctx.fill();
  ctx.restore();
}
// L10 黑暗：只有刺猬周围的光圈看得见
function lightRadius(){
  if(!G||!G.level.def.dark)return 0;
  return 100+G.lightGot*14+(Pet.fireflies||0)*8;
}
function drawDark(){
  const r=lightRadius();
  if(r<=0)return;
  const h=G.hed;
  const g=ctx.createRadialGradient(h.x,h.y,Math.max(1,r*0.35),h.x,h.y,r);
  g.addColorStop(0,'rgba(5,5,15,0)');
  g.addColorStop(1,'rgba(5,5,15,0.93)');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,LW,LH);
}
function draw(){
  const W=window.innerWidth,H=window.innerHeight;
  ctx.fillStyle='#201a18';ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.translate(ox,oy);ctx.scale(scale,scale);
  const bg=ctx.createLinearGradient(0,0,0,LH);
  bg.addColorStop(0,'#3a2c28');bg.addColorStop(1,'#2a211e');
  ctx.fillStyle=bg;ctx.fillRect(0,0,LW,LH);
  drawTunnel();
  drawStartExit();
  drawCamera();
  const L=G.level;
  for(const pin of L.pinches)if(pin.skull)drawSkull(pin);
  drawDoor();
  drawStars();
  drawKey();
  for(const b of L.bows)drawBow(b);
  for(const b of L.slings)drawSling(b);
  drawProjs();
  drawMinions();
  drawHedgehog();
  drawBooms();
  drawFloats();
  if(G.bombAim){
    ctx.save();ctx.textAlign='center';
    ctx.font='700 22px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle='#fff';
    ctx.fillText('\u{1F4A3} Tap a skull, bow or slingshot!',LW/2,64+Math.sin(G.time*6)*4);
    ctx.restore();
  }
  if(L.def.dark)drawDark();
  drawFireflies(); // 萤火虫在黑暗上层发光
  ctx.restore();
}

/* ---------- HUD ---------- */
function hud(){
  const hh=Math.max(0,G.hearts);
  const hs=hh>0?'❤'.repeat(hh):'💔';
  const hEl=document.getElementById('hHeart');
  if(hEl.textContent!==hs){hEl.textContent=hs;hEl.setAttribute('aria-label',hh+' hearts');}
  const ss='⭐ '+G.starGot+'/'+G.level.def.starN;
  const sEl=document.getElementById('hStar');if(sEl.textContent!==ss)sEl.textContent=ss;
  let lv='Cave '+(G.idx+1);
  if(G.timeLeft>0){
    const s=Math.ceil(G.timeLeft);
    const urg=s<=15?' style="color:#D9677A;"':'';
    lv+='&nbsp;&nbsp;<span'+urg+'>⏱ '+s+'s</span>';
  }
  const lEl=document.getElementById('hLevel');if(lEl._v!==lv){lEl._v=lv;lEl.innerHTML=lv;}
  document.getElementById('pauseBtn').style.visibility=G.phase==='play'?'visible':'hidden';
  const tb=document.getElementById('toolBar');
  if(tb){
    tb.style.display=G.phase==='play'?'flex':'none';
    document.getElementById('shieldN').textContent=Pet.shield||0;
    document.getElementById('bombN').textContent=Pet.bomb||0;
    const shB=document.getElementById('shieldBtn'),boB=document.getElementById('bombBtn');
    if(shB)shB.disabled=!((Pet.shield||0)>0&&(G.shieldT||0)<=0);
    if(boB){boB.disabled=!((Pet.bomb||0)>0);boB.classList.toggle('aim',!!G.bombAim);}
  }
}

/* ---------- 主循环 ---------- */
let last=0;
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min(0.05,(ts-last)/1000||0);last=ts;
  if(G&&(G.phase==='play'))update(dt);
  if(G){draw();hud();}
}
document.getElementById('startBtn').addEventListener('click',()=>{
  document.getElementById('startOv').style.display='none';
  for(const k of pendingTips)if(!UI.seenTips.includes(k))UI.seenTips.push(k);
  uiSave();pendingTips=[];
  G.phase='play';
  banner('🔭 '+cleanHint(G.level.def.hint),2600);
});
document.getElementById('againBtn').addEventListener('click',()=>{
  totalStars=0;setHearts(3);loadLevel(0);
});
document.getElementById('exchangeBtn').addEventListener('click',doExchange);
document.getElementById('feedBtn').addEventListener('click',doFeed);
document.getElementById('exchangeCatBtn').addEventListener('click',doExchangeCat);
document.getElementById('feedCatBtn').addEventListener('click',doFeedCat);
document.getElementById('sleepBtn').addEventListener('click',doSleep);
document.getElementById('petAgainBtn').addEventListener('click',goHome);
document.getElementById('petNextBtn').addEventListener('click',()=>{
  if(petCont==null)return;
  hidePet();loadLevel(petCont);
});
document.getElementById('evoOkBtn').addEventListener('click',()=>{document.getElementById('evoOv').style.display='none';});
document.getElementById('heartBtn').addEventListener('click',()=>{
  if(!(Pet.stars>=20&&runHearts<3))return;
  Pet.stars-=20;petSave();setHearts(runHearts+1);updateHeartShop();sfxStar();
});
document.getElementById('reviveBtn').addEventListener('click',()=>{
  if(Pet.stars<20)return;
  Pet.stars-=20;petSave();setHearts(1);
  document.getElementById('overOv').style.display='none';
  loadLevel(G.idx);
});
document.getElementById('restartBtn').addEventListener('click',()=>{
  document.getElementById('overOv').style.display='none';
  totalStars=0;setHearts(3);loadLevel(0);
});
document.getElementById('waterBtn').addEventListener('click',waterSunflower);
document.getElementById('buyShieldBtn').addEventListener('click',buyShield);
document.getElementById('buyBombBtn').addEventListener('click',buyBomb);
document.getElementById('shieldBtn').addEventListener('click',useShield);
document.getElementById('bombBtn').addEventListener('click',useBomb);
document.getElementById('lvCloseBtn').addEventListener('click',()=>{
  document.getElementById('lvSelOv').style.display='none';
  if(mapReturn)mapReturn();
});

/* ---------- 新 UI：首页 / 暂停 / 过关 / 地图 / 宠物小家 / 设置 ---------- */
const $id=id=>document.getElementById(id);
const OVERLAYS=['homeOv','startOv','pauseOv','clearOv','overOv','winOv','lvSelOv','petOv','evoOv','gateOv','settingsOv','howOv','privacyOv'];
function hideAllOverlays(){for(const o of OVERLAYS){const e=$id(o);if(e)e.style.display='none';}}
function continueIdx(){return Math.max(0,Math.min(LEVELS.length-1,Pet.maxLv||0));}
let heroRAF=0,heroT0=Date.now();
function goHome(){
  hideAllOverlays();
  if(G&&G.phase==='play')G.phase='paused';
  const ci=continueIdx();
  $id('homeStars').textContent=Pet.stars;
  $id('playSub').textContent=(Pet.maxLv||0)>0?('Continue · Cave '+(ci+1)):'Cave 1 · '+caveTitle(0);
  $id('hollowHint').textContent=Pet.unlocked?'':'friends join at Cave 5';
  $id('homeOv').style.display='flex';
  cancelAnimationFrame(heroRAF);
  const tick=()=>{if($id('homeOv').style.display==='none')return;drawHero();heroRAF=requestAnimationFrame(tick);};
  tick();
}
// 首页大刺猬：眨眼、歪头、轻轻弹
function drawHero(){
  const c=$id('heroCv').getContext('2d'),W=440,H=400,t=(Date.now()-heroT0)/1000;
  c.clearRect(0,0,W,H);
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bob=reduce?0:Math.sin(t*2.2)*6, squash=reduce?1:1+Math.sin(t*2.2)*0.025;
  const tilt=reduce?0:Math.sin(t*0.7)*0.06;
  // 光晕 + 小山洞口
  const g=c.createRadialGradient(W/2,H*0.55,20,W/2,H*0.55,200);
  g.addColorStop(0,'rgba(255,214,107,.55)');g.addColorStop(1,'rgba(255,214,107,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);
  c.fillStyle='rgba(73,52,44,.14)';c.beginPath();c.ellipse(W/2,H*0.86,140,20,0,0,7);c.fill();
  // 星星
  for(let i=0;i<5;i++){const a=t*0.6+i*1.257,r=165;
    c.font='26px system-ui';c.textAlign='center';c.textBaseline='middle';
    c.globalAlpha=0.55+0.45*Math.sin(t*2+i);c.fillText('⭐',W/2+Math.cos(a)*r,H*0.5+Math.sin(a)*r*0.45);}
  c.globalAlpha=1;
  c.save();c.translate(W/2-10,H*0.56+bob);c.rotate(tilt);c.scale(1/squash,squash);
  const S=6.4;
  // 刺
  c.fillStyle='#65453B';
  for(let i=0;i<13;i++){
    const ang=Math.PI*(1.05-i*0.085);
    const x2=Math.cos(ang)*25*S,y2=-Math.abs(Math.sin(ang))*25*S-4*S;
    c.beginPath();c.moveTo(Math.cos(ang+0.16)*14*S,-Math.abs(Math.sin(ang+0.16))*14*S);
    c.quadraticCurveTo(x2*0.9,y2*0.9,x2,y2);
    c.lineTo(Math.cos(ang-0.16)*14*S,-Math.abs(Math.sin(ang-0.16))*14*S);c.closePath();c.fill();}
  // 身体
  c.fillStyle='#8D6E63';c.beginPath();c.ellipse(0,0,19*S,16*S,0,0,7);c.fill();
  // 肚皮/脸
  c.fillStyle='#F2D7B0';c.beginPath();c.ellipse(4*S,3*S,13*S,11.5*S,0,0,7);c.fill();
  // 耳朵
  c.fillStyle='#E8C39A';c.beginPath();c.arc(-6*S,-10*S,3.4*S,0,7);c.fill();
  c.fillStyle='#F28F9D';c.beginPath();c.arc(-6*S,-10*S,1.8*S,0,7);c.fill();
  // 眼睛（眨眼）
  const blink=(t%3.6)<0.14;
  c.fillStyle='#2B1D18';
  for(const ex of [-1,8]){
    if(blink){c.fillRect((ex*S)-2.6*S,-1*S,5.2*S,1.1*S);}
    else{c.beginPath();c.ellipse(ex*S,-1*S,2.4*S,3*S,0,0,7);c.fill();
      c.fillStyle='#fff';c.beginPath();c.arc(ex*S+0.9*S,-2.2*S,0.9*S,0,7);c.fill();c.fillStyle='#2B1D18';}
  }
  // 鼻子 + 嘴
  c.fillStyle='#49342C';c.beginPath();c.ellipse(15*S,3*S,2.6*S,2.1*S,0,0,7);c.fill();
  c.strokeStyle='#49342C';c.lineWidth=0.9*S;c.lineCap='round';
  c.beginPath();c.arc(8.5*S,5*S,2.6*S,0.2,Math.PI-0.6);c.stroke();
  // 腮红
  c.fillStyle='rgba(242,143,157,.7)';
  c.beginPath();c.ellipse(-4*S,5*S,2.8*S,1.8*S,0,0,7);c.fill();
  c.beginPath();c.ellipse(13*S,8*S,2.2*S,1.5*S,0,0,7);c.fill();
  // 小脚
  c.fillStyle='#65453B';
  c.beginPath();c.ellipse(-8*S,15*S,4*S,2.4*S,0,0,7);c.fill();
  c.beginPath();c.ellipse(8*S,15.5*S,4*S,2.4*S,0,0,7);c.fill();
  c.restore();
}
function startCave(idx,freshRun){
  hideAllOverlays();
  if(freshRun||runHearts<=0){totalStars=0;setHearts(3);}
  loadLevel(idx);
}
function confetti(){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const box=document.createElement('div');box.className='confetti';
  const em=['⭐','✨','💛','🌟'];
  for(let i=0;i<22;i++){const s=document.createElement('i');s.textContent=em[i%em.length];
    s.style.left=(Math.random()*100)+'%';s.style.animationDelay=(Math.random()*0.5)+'s';s.style.fontSize=(16+Math.random()*16)+'px';box.appendChild(s);}
  document.body.appendChild(box);setTimeout(()=>box.remove(),2400);
}
// 首页
$id('playBtn').addEventListener('click',()=>startCave(continueIdx(),false));
$id('mapBtn').addEventListener('click',()=>showLvSel(goHome));
$id('hollowBtn').addEventListener('click',()=>showPet(null,false,null));
$id('howBtn').addEventListener('click',showHow);
$id('introHomeBtn').addEventListener('click',goHome);
// 暂停
$id('pauseBtn').addEventListener('click',()=>{if(!G||G.phase!=='play')return;G.phase='paused';pActive=false;$id('pauseOv').style.display='flex';});
$id('resumeBtn').addEventListener('click',()=>{$id('pauseOv').style.display='none';if(G)G.phase='play';last=0;});
$id('pauseMapBtn').addEventListener('click',()=>showLvSel(()=>{$id('pauseOv').style.display='flex';}));
$id('pauseHomeBtn').addEventListener('click',goHome);
document.addEventListener('visibilitychange',()=>{ // 切到后台自动暂停
  if(document.hidden&&G&&G.phase==='play'){G.phase='paused';pActive=false;$id('pauseOv').style.display='flex';}
});
// 过关
$id('clearNextBtn').addEventListener('click',()=>{const ni=Math.min(LEVELS.length-1,G.idx+1);startCave(ni,false);});
$id('clearPetBtn').addEventListener('click',()=>showPet(null,false,Math.min(LEVELS.length-1,G.idx+1)));
$id('clearMapBtn').addEventListener('click',()=>showLvSel(()=>{$id('clearOv').style.display='flex';}));
// 心用完
$id('retryBtn').addEventListener('click',()=>startCave(G.idx,true));
$id('overMapBtn').addEventListener('click',()=>showLvSel(()=>{$id('overOv').style.display='flex';}));
$id('winPetBtn').addEventListener('click',()=>showPet(null,false,null));
// 宠物小家
$id('petBackBtn').addEventListener('click',goHome);
function petTab(name){
  document.querySelectorAll('#petTabs .tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.panel===name?'true':'false'));
  document.querySelectorAll('#petOv .panel').forEach(p=>p.classList.toggle('on',p.dataset.panel===name));
}
let shopUnlockedUntil=0;
$id('petTabs').addEventListener('click',e=>{
  const b=e.target.closest('.tab');if(!b)return;
  if(b.dataset.panel==='shop'&&Date.now()>shopUnlockedUntil){
    parentalGate(()=>{shopUnlockedUntil=Date.now()+5*60*1000;petTab('shop');});return;
  }
  petTab(b.dataset.panel);
});
// 家长验证（儿童类 App 要求：购买前需要成人验证）
function parentalGate(onPass){
  const a=6+Math.floor(Math.random()*4),b=6+Math.floor(Math.random()*4),ans=a*b;
  const words=['zero','one','two','three','four','five','six','seven','eight','nine'];
  $id('gateQ').textContent='What is '+words[a]+' times '+words[b]+'?';
  const opts=new Set([ans]);while(opts.size<6)opts.add(ans+(Math.floor(Math.random()*21)-10)||ans+11);
  const arr=[...opts].sort(()=>Math.random()-0.5);
  const box=$id('gateOpts');box.innerHTML='';
  for(const v of arr){const btn=document.createElement('button');btn.className='btn ghost';btn.textContent=v;
    btn.onclick=()=>{$id('gateOv').style.display='none';if(v===ans)onPass();else banner('That\'s not quite right. Ask a grown-up for help!',2000);};
    box.appendChild(btn);}
  $id('gateOv').style.display='flex';
}
$id('gateCancel').addEventListener('click',()=>{$id('gateOv').style.display='none';});
// 设置 / 玩法 / 隐私
function syncSound(){$id('soundSw').setAttribute('aria-checked',UI.sound?'true':'false');}
$id('settingsBtn').addEventListener('click',()=>{syncSound();$id('settingsOv').style.display='flex';});
$id('soundSw').addEventListener('click',()=>{UI.sound=!UI.sound;uiSave();syncSound();if(UI.sound)sfxStar();});
$id('setCloseBtn').addEventListener('click',()=>{$id('settingsOv').style.display='none';});
$id('setHowBtn').addEventListener('click',()=>{$id('settingsOv').style.display='none';showHow();});
$id('privacyBtn').addEventListener('click',()=>{$id('privacyFrame').src='privacy-policy.html';$id('settingsOv').style.display='none';$id('privacyOv').style.display='flex';});
$id('privacyCloseBtn').addEventListener('click',()=>{$id('privacyOv').style.display='none';$id('settingsOv').style.display='flex';});
function showHow(){
  const order=['drag','skull','bow','sling','clamp','run','time','dark','key','boss','tools'];
  $id('howList').innerHTML=order.map(k=>{const t=TIPS[k];return '<li><span class="ic">'+t.ic+'</span><span><b>'+t.t+'.</b> '+t.d+'</span></li>';}).join('')+
    '<li><span class="ic">⭐</span><span><b>Stars.</b> Grab stars quickly in a row for combo bonuses. Spend them in Pet Hollow.</span></li>'+
    '<li><span class="ic">❤️</span><span><b>Hearts.</b> You start with 3. Pets and the sunflower make more while you play.</span></li>';
  $id('howOv').style.display='flex';
}
$id('howCloseBtn').addEventListener('click',()=>{$id('howOv').style.display='none';});

// 老玩家：已经玩过的关卡里的机制不再当作"新提示"
if(!UI.seenTips.length&&(Pet.maxLv||0)>0){
  for(let i=0;i<Math.min(LEVELS.length,Pet.maxLv);i++)for(const k of tipsFor(i))if(!UI.seenTips.includes(k))UI.seenTips.push(k);
  uiSave();
}
resize();loadLevel(continueIdx());goHome();
// 调试钩子：只在 URL 带 ?debug 时开启，正式版不受影响
if(/[?&]debug\b/.test(location.search))window.__hr={getG:()=>G,Pet:()=>Pet,showClear:showClear,gameOver:gameOver,showPet:showPet,showWin:showWin,update:update,parentalGate:parentalGate,setHearts:setHearts};
requestAnimationFrame(loop);
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}

/* ---------- 向日葵 / 工具 / 选关 ---------- */
function addFloat(txt,x,y,color){
  if(!G)return;
  G.floats.push({txt:txt,x:x,y:y,t:0,color:color||'#fff'});
}
function drawFloats(){
  if(!G||!G.floats.length)return;
  ctx.save();ctx.textAlign='center';ctx.font='700 20px ui-rounded, system-ui, sans-serif';
  for(const f of G.floats){
    ctx.globalAlpha=Math.max(0,1-f.t/1.2);
    ctx.fillStyle=f.color||'#fff';
    ctx.fillText(f.txt,f.x,f.y-f.t*40);
  }
  ctx.restore();ctx.globalAlpha=1;
}
function drawBooms(){
  if(!G||!G.booms.length)return;
  for(const b of G.booms){
    const r=10+b.t*90;
    ctx.save();ctx.globalAlpha=Math.max(0,1-b.t/0.6);
    ctx.fillStyle='#ff9800';ctx.beginPath();ctx.arc(b.x,b.y,r,0,7);ctx.fill();
    ctx.fillStyle='#ffeb3b';ctx.beginPath();ctx.arc(b.x,b.y,r*0.6,0,7);ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
// 向日葵：seed → sprout → bud → blooming（开花后玩游戏时每 8 分钟产 1 颗心）
function drawSunflower(c,x,y,s,t){
  const st=Pet.sunStage||0;
  c.save();c.translate(x,y);c.scale(s,s);
  c.fillStyle='#8d6e63';
  c.beginPath();c.ellipse(0,26,30,10,0,0,7);c.fill();
  c.fillStyle='#6d4c41';
  c.beginPath();c.ellipse(0,22,22,7,0,0,7);c.fill();
  if(st===0){
    c.fillStyle='#5d4037';
    c.beginPath();c.ellipse(0,14,7,9,0.3,0,7);c.fill();
    c.fillStyle='#8d6e63';
    c.beginPath();c.ellipse(-2,11,2.5,4,0.3,0,7);c.fill();
  }else{
    const sway=Math.sin(t*2)*3;
    const hgt=st===1?34:(st===2?52:66);
    c.strokeStyle='#43a047';c.lineWidth=5;c.lineCap='round';
    c.beginPath();c.moveTo(0,22);c.quadraticCurveTo(sway,22-hgt/2,sway*1.5,22-hgt);c.stroke();
    c.fillStyle='#66bb6a';
    for(const sd of [-1,1]){
      c.save();c.translate(sd*4,22-hgt*0.45);c.rotate(sd*0.7);
      c.beginPath();c.ellipse(sd*10,0,12,6,0,0,7);c.fill();
      c.restore();
    }
    const fx=sway*1.5,fy=22-hgt;
    if(st===2){
      c.fillStyle='#2e7d32';
      c.beginPath();c.arc(fx,fy-6,9,0,7);c.fill();
      c.fillStyle='#66bb6a';
      c.beginPath();c.ellipse(fx,fy+2,11,5,0,0,7);c.fill();
    }else if(st>=3){
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6+Math.sin(t*1.5)*0.05;
        c.fillStyle='#ffca28';
        c.beginPath();c.ellipse(fx+Math.cos(a)*16,fy-8+Math.sin(a)*16,9,5.5,a,0,7);c.fill();
      }
      c.fillStyle='#8d6e63';
      c.beginPath();c.arc(fx,fy-8,11,0,7);c.fill();
      c.fillStyle='#5d4037';
      for(let i=0;i<7;i++){
        const a=i*2.4;
        c.beginPath();c.arc(fx+Math.cos(a)*5,fy-8+Math.sin(a)*5,1.6,0,7);c.fill();
      }
      c.fillStyle='#3e2723';
      c.beginPath();c.arc(fx-4,fy-10,1.8,0,7);c.fill();
      c.beginPath();c.arc(fx+4,fy-10,1.8,0,7);c.fill();
      c.strokeStyle='#3e2723';c.lineWidth=1.6;
      c.beginPath();c.arc(fx,fy-7,4,0.3,Math.PI-0.3);c.stroke();
    }
  }
  c.restore();
}
function waterSunflower(){
  const st=Pet.sunStage||0;
  if(st>=3){banner('🌻 Already blooming beautifully!',1600);return;}
  if((Pet.sunWater||0)>0)Pet.sunWater--;
  else if(Pet.stars>=5)Pet.stars-=5;
  else{banner('Need 5⭐ or buy 💧 water in the Premium Shop!',1800);return;}
  Pet.sunStage=st+1;petSave();updatePetUI();sfxFeed();
  banner('💧 Glug glug… '+['','now a sprout! 🌱','now a bud! 🌿','BLOOMING! 🌻'][Pet.sunStage],1800);
}
function updateSunUI(){
  const st=Pet.sunStage||0;
  const names=['🌰 Seed','🌱 Sprout','🌿 Bud','🌻 Blooming!'];
  const el=document.getElementById('sunTxt');
  if(el)el.textContent=names[st]+(st>=3?' · makes a ❤️ every 8 min while you play':' · water it to grow (5 ⭐ or 1 💧)')+
    ((Pet.sunWater||0)>0?' · 💧 x'+Pet.sunWater:'');
  const wb=document.getElementById('waterBtn');
  if(wb)wb.disabled=!(st<3&&((Pet.sunWater||0)>0||Pet.stars>=5));
}
// 工具：护盾（2 秒无敌）/ 炸弹（炸掉一个危险物）
function buyShield(){
  if(Pet.stars<30){banner('Need 30⭐ for a shield!',1500);return;}
  Pet.stars-=30;Pet.shield=(Pet.shield||0)+1;petSave();updatePetUI();sfxStar();
  banner('🛡️ Got a shield! Tap 🛡️ in game for 2s protection.',1800);
}
function buyBomb(){
  if(Pet.stars<25){banner('Need 25⭐ for a bomb!',1500);return;}
  Pet.stars-=25;Pet.bomb=(Pet.bomb||0)+1;petSave();updatePetUI();sfxStar();
  banner('💣 Got a bomb! Tap 💣 in game, then tap a hazard!',1800);
}
function updateToolUI(){
  const sb=document.getElementById('buyShieldBtn'),bb=document.getElementById('buyBombBtn');
  // 注意：点击已经用 addEventListener 绑定了，这里不能再设 onclick，否则一次点击会买两次
  if(sb){sb.textContent='30 ⭐';sb.disabled=!(Pet.stars>=30);}
  if(bb){bb.textContent='25 ⭐';bb.disabled=!(Pet.stars>=25);}
  const ti=document.getElementById('toolInv');
  if(ti)ti.textContent='In your backpack: 🛡️ x'+(Pet.shield||0)+'  ·  💣 x'+(Pet.bomb||0);
}
function useShield(){
  if(!G||G.phase!=='play')return;
  if((G.shieldT||0)>0)return;
  if(!((Pet.shield||0)>0)){banner('No shields! Get some in the Pet Home 🐾',1600);return;}
  Pet.shield--;petSave();
  G.shieldT=2;G.invuln=2;
  banner('🛡️ Shield up! 2 seconds of protection!',1500);sfxStar();
}
function useBomb(){
  if(!G||G.phase!=='play')return;
  if(G.bombAim){G.bombAim=false;banner('💣 Aim cancelled',1200);return;}
  if(!((Pet.bomb||0)>0)){banner('No bombs! Get some in the Pet Home 🐾',1600);return;}
  G.bombAim=true;
  banner('💣 Tap a skull, bow or slingshot to blow it up!',2200);
}
function bombTap(x,y){
  const L=G.level;
  let best=null,bestKind='',bx=0,by=0,bestD=48;
  for(const pin of L.pinches){
    const f=pathFrame(L.path,pinchS(pin,G.time));
    const d=Math.hypot(x-f.x,y-f.y);
    if(d<bestD){bestD=d;best=pin;bestKind='pinch';bx=f.x;by=f.y;}
  }
  const shooters=[['bow',L.bows],['sling',L.slings]];
  for(const pair of shooters){
    const kind=pair[0],arr=pair[1];
    for(const b of arr){
      const f=pathFrame(L.path,b.s);
      const hw=halfWidthAt(L,b.s,G.time);
      const sx=f.x+f.nx*b.side*(hw+4),sy=f.y+f.ny*b.side*(hw+4);
      const d=Math.hypot(x-sx,y-sy);
      if(d<bestD){bestD=d;best=b;bestKind=kind;bx=sx;by=sy;}
    }
  }
  if(!best){banner('💣 No target there — tap a skull, bow or slingshot!',1600);return;}
  Pet.bomb--;petSave();
  G.bombAim=false;
  if(bestKind==='pinch')L.pinches.splice(L.pinches.indexOf(best),1);
  else if(bestKind==='bow')L.bows.splice(L.bows.indexOf(best),1);
  else L.slings.splice(L.slings.indexOf(best),1);
  G.booms.push({x:bx,y:by,t:0});
  tone(90,0.4,'sawtooth',0.18);tone(60,0.5,'square',0.12,0.05);
  banner('💥 Boom! Hazard destroyed!',1500);
  sfxStar();
}
// 选关：100 格，通一关解锁下一关
// 洞穴地图：4 个区域，每区 25 个洞，弯弯曲曲的小路
let mapReturn=null,mapRegion=0;
function buildRegionTabs(){
  const tabs=document.getElementById('regionTabs');if(!tabs)return;
  const maxU=Math.min(LEVELS.length-1,Pet.maxLv||0);
  tabs.innerHTML='';
  REGIONS.forEach((r,i)=>{
    const b=document.createElement('button');b.className='tab';b.setAttribute('role','tab');
    const locked=r.from>maxU;
    b.textContent=r.emoji+' '+r.name+(locked?' 🔒':'');
    b.setAttribute('aria-selected',i===mapRegion?'true':'false');
    b.addEventListener('click',()=>{mapRegion=i;buildRegionTabs();buildLvGrid();});
    tabs.appendChild(b);
  });
}
function buildLvGrid(){
  const grid=document.getElementById('lvGrid');
  if(!grid)return;
  grid.innerHTML='';
  const maxU=Math.min(LEVELS.length-1,Pet.maxLv||0);
  const r=REGIONS[mapRegion];
  const done=Math.min(r.to+1,maxU)-r.from; // 已通关的洞数
  document.getElementById('regionDesc').textContent=Math.max(0,Math.min(25,done))+'/25 explored · '+r.desc;
  document.getElementById('mapCount').textContent=maxU+'/100';
  const n=r.to-r.from+1,gap=96,top=56;
  const W=Math.min(408,(grid.clientWidth||360)-32);
  const trail=document.createElement('div');trail.className='trail';
  trail.style.height=(top*2+(n-1)*gap)+'px';
  const pts=[];
  for(let k=0;k<n;k++){const x=W/2+Math.sin(k*0.85)*(W*0.30);pts.push([x,top+k*gap]);}
  let d='M'+pts[0][0]+' '+pts[0][1];
  for(let k=1;k<n;k++){const p=pts[k-1],q=pts[k],my=(p[1]+q[1])/2;d+=' C'+p[0]+' '+my+' '+q[0]+' '+my+' '+q[0]+' '+q[1];}
  trail.innerHTML='<svg viewBox="0 0 '+W+' '+(top*2+(n-1)*gap)+'" preserveAspectRatio="none" aria-hidden="true">'+
    '<path d="'+d+'" fill="none" stroke="#E6D3B5" stroke-width="14" stroke-linecap="round"/>'+
    '<path d="'+d+'" fill="none" stroke="#C9824B" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/></svg>';
  let cur=null;
  for(let k=0;k<n;k++){
    const i=r.from+k;
    const b=document.createElement('button');
    const st=i<maxU?'done':(i===maxU?'current':'locked');
    const isBoss=(LEVELS[i].pinches||[]).some(p=>p.boss);
    b.className='node '+st+(isBoss?' boss':'');
    b.style.left=pts[k][0]+'px';b.style.top=pts[k][1]+'px';
    b.textContent=String(i+1);
    b.setAttribute('aria-label','Cave '+(i+1)+', '+caveTitle(i)+(isBoss?', Skull King':'')+(st==='done'?', explored':st==='current'?', next up':', locked'));
    if(st!=='locked'){
      b.addEventListener('click',()=>{
        document.getElementById('lvSelOv').style.display='none';mapReturn=null;
        startCave(i,runHearts<=0);
      });
    }else{b.disabled=true;}
    if(st==='current')cur=b;
    trail.appendChild(b);
  }
  grid.appendChild(trail);
  if(cur)setTimeout(()=>{grid.scrollTop=Math.max(0,parseFloat(cur.style.top)-grid.clientHeight/2);},0);
  else grid.scrollTop=0;
}
function showLvSel(ret){
  mapReturn=typeof ret==='function'?ret:null;
  mapRegion=REGIONS.indexOf(regionOf(Math.min(LEVELS.length-1,Pet.maxLv||0)));
  for(const o of ['homeOv','pauseOv','clearOv','overOv'])document.getElementById(o).style.display='none';
  document.getElementById('lvSelOv').style.display='flex';
  buildRegionTabs();buildLvGrid();
}

/* ---------- In-App Purchases (Capacitor native app only) ---------- */
const IAP_BTNS={heart_pack_5:'iap_heart_pack',bird_food_5:'iap_bird_food',cat_food_5:'iap_cat_food',
  water_pack_5:'iap_water_pack',shield_pack_3:'iap_shield_pack',bomb_pack_3:'iap_bomb_pack'};
const IAP_PRODUCTS = {
  heart_pack_5: { hearts: 5, label: '💖 5 Hearts' },
  bird_food_5: { birdFood: 5, label: '🍖 5 Bird Food' },
  cat_food_5: { catFood: 5, label: '🐟 5 Cat Food' },
  water_pack_5: { water: 5, label: '💧 5 Water' },
  shield_pack_3: { shield: 3, label: '🛡️ 3 Shields' },
  bomb_pack_3: { bomb: 3, label: '💣 3 Bombs' },
};
let iapReady = false;

function isNativeApp(){
  return typeof window!=='undefined' && window.Capacitor &&
         window.Capacitor.isNativePlatform &&
         window.Capacitor.isNativePlatform();
}
function getNativePurchases(){
  if(typeof window==='undefined') return null;
  if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases)
    return window.Capacitor.Plugins.NativePurchases;
  return null;
}
async function initIAP(){
  if(!isNativeApp()) return;
  const NP = getNativePurchases();
  if(!NP) return;
  try {
    const { isBillingSupported } = await NP.isBillingSupported();
    if(!isBillingSupported){
      document.getElementById('iapStatus').textContent = 'In-app purchases not available on this device.';
      return;
    }
    // 加载商品价格（显示商店实际价格）
    const ids = Object.keys(IAP_PRODUCTS);
    for(const pid of ids){
      try {
        const { product } = await NP.getProduct({ productIdentifier: pid, productType: 'inapp' });
        const b = document.getElementById(IAP_BTNS[pid]);
        if(b && product && product.priceString){
          b.textContent = IAP_PRODUCTS[pid].label + ' — ' + product.priceString;
        }
      } catch(e){ console.log('IAP product load failed:', pid, e); }
    }
    document.getElementById('iapShop').style.display = 'block';
    document.getElementById('shopTab').style.display = ''; // 只在原生 App 显示，进入需要家长验证
    iapReady = true;
  } catch(e){
    console.log('IAP init failed:', e);
  }
}
async function buyIAP(pid){
  const NP = getNativePurchases();
  if(!NP || !iapReady){
    banner('Store not ready yet, try again soon!', 2000);
    return;
  }
  const statusEl = document.getElementById('iapStatus');
  try {
    statusEl.textContent = 'Processing purchase…';
    const result = await NP.purchaseProduct({ productIdentifier: pid, productType: 'inapp', quantity: 1 });
    // 消耗型商品：consume 后才能再次购买
    try { await NP.consumePurchase({ transactionId: result.transactionId }); } catch(e){}
    try { await NP.finishTransaction({ transactionId: result.transactionId }); } catch(e){}
    // 发货
    const item = IAP_PRODUCTS[pid];
    if(item.hearts){ setHearts(runHearts + item.hearts); }
    if(item.birdFood){ Pet.food = (Pet.food||0) + item.birdFood; }
    if(item.catFood){ Pet.catfood = (Pet.catfood||0) + item.catFood; }
    if(item.water){ Pet.sunWater = (Pet.sunWater||0) + item.water; }
    if(item.shield){ Pet.shield = (Pet.shield||0) + item.shield; }
    if(item.bomb){ Pet.bomb = (Pet.bomb||0) + item.bomb; }
    petSave(); updatePetUI();
    statusEl.textContent = 'Purchase successful! Enjoy! 🎉';
    banner('🎉 Purchase successful!', 2000);
    sfxStar();
  } catch(e){
    console.log('Purchase failed:', e);
    statusEl.textContent = 'Purchase cancelled or failed.';
  }
}
// 绑定购买按钮
if(typeof document!=='undefined'){
  document.addEventListener('DOMContentLoaded', ()=>{
    initIAP();
    const bind = (id, pid)=>{
      const b = document.getElementById(id);
      if(b) b.addEventListener('click', ()=>buyIAP(pid));
    };
    bind('iap_heart_pack', 'heart_pack_5');
    bind('iap_bird_food', 'bird_food_5');
    bind('iap_cat_food', 'cat_food_5');
    bind('iap_water_pack', 'water_pack_5');
    bind('iap_shield_pack', 'shield_pack_3');
    bind('iap_bomb_pack', 'bomb_pack_3');
  });
}

// Node 测试钩子：浏览器里 module 未定义，无影响
if(typeof module!=='undefined'&&typeof process!=='undefined'){
  module.exports._t={getG:function(){return G},loadLevel:loadLevel,showIntro:showIntro,update:update,
    clickStart:function(){document.getElementById('startBtn').click();},
    getPet:function(){return Pet},showPet:showPet,doExchange:doExchange,doFeed:doFeed,doExchangeCat:doExchangeCat,doFeedCat:doFeedCat,updatePetUI:updatePetUI,
    setHearts:setHearts,gameOver:gameOver,
    waterSunflower:waterSunflower,buyShield:buyShield,buyBomb:buyBomb,useShield:useShield,useBomb:useBomb,
    buildLvGrid:buildLvGrid,showLvSel:showLvSel,addFloat:addFloat,bombTap:bombTap,genLevel:genLevel};
}
})();
