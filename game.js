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

if(typeof module!=='undefined'){
  module.exports={buildPath:buildPath,pathFrame:pathFrame,
    nearestOnPath:nearestOnPath,halfWidthAt:halfWidthAt,chompState:chompState,
    pinchS:pinchS,clampToTunnel:clampToTunnel,stepProjectile:stepProjectile,
    circleHit:circleHit,LEVELS:LEVELS};
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
function tone(f,d,type,v,when){
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
    c.fillStyle='#ef5350';c.font=Math.round(18*s)+'px "Baloo 2", sans-serif';c.textAlign='center';
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
    c.fillStyle='#ef5350';c.font=Math.round(18*s)+'px "Baloo 2", sans-serif';c.textAlign='center';
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
  c.font='66px "Baloo 2", sans-serif';c.textAlign='center';c.textBaseline='middle';
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
  c.fillStyle='#4e342e';c.font='800 15px "Baloo 2", sans-serif';
  const nm=[];
  if(Pet.unlocked)nm.push('Birdie'+['(Baby)','(Teen)','(Adult)'][Pet.stage]||'');
  if(Pet.wesley)nm.push('Wesley'+(Pet.wstage>=1?'(Adult)':'(Kitten)'));
  c.fillText(nm.join(' ＋ '),200,26);
  c.textBaseline='alphabetic';
}
// 宠物头顶状态：饿了冒饭碗，困了冒 Zzz
function drawPetStatus(c,x,y,which,t){
  const hungry=petHungry(which),sleepy=petSleepy();
  c.font='22px "Baloo 2", sans-serif';c.textAlign='center';c.textBaseline='middle';
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
  c.font='20px "Baloo 2", sans-serif';c.textAlign='center';c.textBaseline='middle';
  const z1=(t%3),z2=((t+1.5)%3);
  c.fillStyle='rgba(92,107,192,'+(1-z1/3)+')';
  c.fillText('Z',cx-60-z1*8,cy-70-z1*14);
  c.fillStyle='rgba(92,107,192,'+(1-z2/3)+')';
  c.fillText('Z',cx+60+z2*8,cy-70-z2*14);
  if(Pet.sleepTogether){
    c.font='18px "Baloo 2", sans-serif';
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
  document.getElementById('petNames').innerHTML=names.join(' ｜ ');
  document.getElementById('petStats').textContent='⭐ '+Pet.stars+' ｜ 🍖 Bird food x'+Pet.food+' ｜ 🐟 Cat food x'+Pet.catfood;
  document.getElementById('petFedTxt').textContent=Pet.fed>=20?
    'Birdie is an adult! ✨ Brings back 1 star every morning for breakfast!':
    (Pet.fed>=10?'Birdie is a teen! Feed '+(20-Pet.fed)+' more to become adult':
    'Fed '+Pet.fed+' / 20 bird food'+(Pet.fed>=10?'':'(10 to become teen)'));
  document.getElementById('petCatFedTxt').textContent=!Pet.wesley?'':
    (Pet.catfed>=10?(Pet.wstage>=1?'Wesley grew up! ✨':'Wesley is full!'):
    'Fed '+Pet.catfed+' / 10 cat food');
  document.getElementById('catRow').style.display=Pet.wesley?'':'none';
  document.getElementById('feedBtn').disabled=!(Pet.food>0&&Pet.fed<20);
  document.getElementById('exchangeBtn').disabled=!(Pet.stars>=10);
  document.getElementById('feedCatBtn').disabled=!(Pet.wesley&&Pet.catfood>0&&Pet.catfed<10);
  document.getElementById('exchangeCatBtn').disabled=!(Pet.stars>=10);
  // 萤火虫库存
  const ff=document.getElementById('petFirefly');
  if(ff)ff.textContent=Pet.wesley?('✨ Fireflies x'+(Pet.fireflies||0)+'(lights the Dark Cave)'):'';
  updateShopUI();
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
  document.getElementById('winOv').style.display='none';
  document.getElementById('petOv').style.display='flex';
  document.getElementById('petTitle').textContent=
    isW?(first?'🎉 New Pet!':'🐱 Pet Home'):(first?'🎉 New Pet!':'🐦 Pet Home');
  const cer=document.getElementById('petCeremonyTxt');
  cer.style.display=first?'block':'none';
  cer.innerHTML=isW?
    'Cleared Level 8, amazing!<br>A kitten ran out of the grass —':
    'The hedgehog left Cave 5!<br>A little bird fell from the sky and became its friend —';
  document.getElementById('petNextBtn').style.display=contIdx!=null?'':'none';
  if(contIdx!=null)document.getElementById('petNextBtn').textContent='Continue to Level '+(contIdx+1)+' ▶';
  document.getElementById('petAgainBtn').style.display=contIdx!=null?'none':'';
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
    c.fillStyle='#f9a825';c.font='800 15px "Baloo 2", sans-serif';c.textAlign='center';
    c.fillText('✨ Grown Up! ✨',W/2,22);
  }
  sfxWin();
}

/* ---------- 状态 ---------- */
let G=null,totalStars=0,runHearts=3; // runHearts：整局 12 关一共只有 3 颗心，不过关不回满
function setHearts(n){runHearts=Math.max(0,Math.min(3,n));if(G)G.hearts=runHearts;}
const HEDGE_R=16;

function loadLevel(idx){
  const def=LEVELS[idx];
  const path=buildPath(def.waypoints);
  const level={
    def:def,path:path,half:def.half,
    pinches:(def.pinches||[]).map(p=>({s:p.frac*path.len,baseS:p.frac*path.len,slide:p.slide,
      half:p.half,len:p.len,skull:!!p.skull,
      spikes:!!p.spikes,shutHalf:p.shutHalf,chomp:p.chomp,chomp2:p.chomp2,boss:!!p.boss})),
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
     hed:{x:st.x,y:st.y,tx:st.x,ty:st.y,r:HEDGE_R,face:1},
     projs:[],invuln:0,sMax:0};
  showIntro(idx,false);
}

function showIntro(idx,passed){
  const def=LEVELS[idx];
  document.getElementById('introTitle').textContent='🦔 Hedgehog Roll';
  document.getElementById('introLevel').textContent=def.name;
  document.getElementById('introSub').textContent=passed?('🎉 '+(LEVELS[idx-1]?LEVELS[idx-1].name:'')+'Cleared!'):def.sub;
  document.getElementById('introHint').textContent=def.hint;
  document.getElementById('introRules').style.display=idx===0?'block':'none';
  document.getElementById('startBtn').textContent=idx===0?'Start Rolling!':'Enter '+def.name.split(' ').slice(0,3).join(' ');
  document.getElementById('startOv').style.display='flex';
  document.getElementById('winOv').style.display='none';
  updateHeartShop();
}

/* ---------- 心用完了 ---------- */
function gameOver(){
  sfxHit();
  document.getElementById('overStars').textContent='⭐ '+Pet.stars;
  document.getElementById('reviveBtn').style.display=Pet.stars>=20?'':'none';
  document.getElementById('overOv').style.display='flex';
}
/* ---------- 全部 12 关通关 ---------- */
function showWin(){
  document.getElementById('winStats').innerHTML=
    '⭐ '+Pet.stars+' ｜ <span style="color:#ff8a80;">❤</span> '+runHearts+'/3<br>'+
    'You beat the Skull King — a true Roll Master! 👑';
  document.getElementById('winOv').style.display='flex';
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
      if(it.id==='nest'){btn.innerHTML='🪹 Nest owned';btn.disabled=true;btn.onclick=null;}
      else{
        const eq=(it.id==='hat'&&Pet.equipHat)||(it.id==='scarf'&&Pet.equipScarf)||(it.id==='pajamas'&&Pet.equipPajamas);
        btn.innerHTML=it.name+(eq?'<br><span style="font-size:13px;">✓ Wearing (tap to remove)</span>':'<br><span style="font-size:13px;">Tap to wear</span>');
        btn.disabled=false;btn.onclick=()=>toggleAcc(it.id);
      }
    }else{
      btn.innerHTML=it.name+'<br><span style="font-size:13px;">'+it.price+' ⭐</span>';
      btn.disabled=!(Pet.stars>=it.price);
      btn.onclick=()=>buyAcc(it.id);
    }
  }
  const slp=document.getElementById('sleepBtn');
  if(slp){
    const sleeping=Pet.sleepUntil&&Date.now()<Pet.sleepUntil;
    slp.style.display=(petSleepy()&&!sleeping)?'':'none';
    slp.innerHTML='😴 Sleep<br><span style="font-size:13px;">'+(Pet.nest?'Tuck into nest':'Buy nest first')+'</span>';
  }
}
/* ---------- 每关开始前：20⭐ 换 1❤️ ---------- */
function updateHeartShop(){
  document.getElementById('shopInfo').innerHTML='⭐ '+Pet.stars+' ｜ <span style="color:#ff8a80;">❤</span> '+runHearts+'/3';
  document.getElementById('heartBtn').disabled=!(Pet.stars>=20&&runHearts<3);
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
  if(G&&G.phase==='play'){G.hed.tx=p.x;G.hed.ty=p.y;}
});
cv.addEventListener('pointermove',e=>{
  if(!pActive)return;
  const p=toLogical(e);
  if(G&&G.phase==='play'){G.hed.tx=p.x;G.hed.ty=p.y;}
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
    if(G.invuln<=0&&circleHit(p.x,p.y,p.kind==='arrow'?6:7,h.x,h.y,h.r)){
      setHearts(runHearts-1);G.invuln=1.6;sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('Ouch! Hit! Hearts left: '+'❤'.repeat(runHearts),1800);
      continue;
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
    if(shut&&Math.abs(c.s-ps)<pin.len*0.85&&G.invuln<=0){
      setHearts(runHearts-1);G.invuln=1.6;sfxHit();
      if(runHearts<=0){gameOver();G.phase='over';return;}
      banner('Ow! Caught by the clamp! Hearts left: '+'❤'.repeat(runHearts),1800);
      break;
    }
  }
  // 星星
  for(const s of L.stars){
    if(!s.got&&circleHit(s.x,s.y,10,h.x,h.y,h.r+4)){
      s.got=true;G.starGot++;totalStars++;Pet.stars++;petSave();sfxStar();
    }
  }
  // 到出口？
  if(G.sMax>=L.path.len-30){
    G.phase='done';sfxWin();
    Pet.levelsSinceSleep=(Pet.levelsSinceSleep||0)+1;petSave(); // 玩一关，困意+1
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
      banner('🎉 '+L.def.name+'Cleared!',2200);
      sfxLevel();
      const ni=G.idx+1; // 通关后必须载入下一关的数据，否则会一直在重玩本关
      setTimeout(()=>{loadLevel(ni);showIntro(ni,true);},1400);
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
  ctx.fillStyle='#a1887f';ctx.font='800 15px "Baloo 2", sans-serif';ctx.textAlign='center';
  ctx.fillText('Start',st.x,st.y+halfWidthAt(L,8,G.time)+22);
  const en=pathFrame(L.path,L.path.len-8);
  const g=ctx.createRadialGradient(en.x,en.y,4,en.x,en.y,52);
  g.addColorStop(0,'rgba(255,249,196,.95)');g.addColorStop(1,'rgba(255,249,196,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(en.x,en.y,52,0,7);ctx.fill();
  ctx.fillStyle='#fffde7';ctx.strokeStyle='#ffb300';ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(en.x,en.y,26,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e65100';ctx.font='800 15px "Baloo 2", sans-serif';
  ctx.fillText('Exit',en.x,en.y+5);
}

function drawCamera(){
  const L=G.level,f=pathFrame(L.path,52);
  const ang=Math.atan2(f.ty,f.tx);
  const cx=f.x+f.nx*-(halfWidthAt(L,52,G.time)*0.4),cy=f.y+f.ny*-(halfWidthAt(L,52,G.time)*0.4);
  ctx.save();ctx.translate(cx,cy);
  ctx.font='30px "Baloo 2", sans-serif';ctx.textAlign='center';
  ctx.fillText('📷',0,0);
  ctx.restore();
  ctx.save();ctx.translate(cx,cy-34);ctx.rotate(0);
  ctx.fillStyle='rgba(255,255,255,.94)';
  const tw=86;
  rr(-tw/2,-16,tw,28,13);ctx.fill();
  ctx.fillStyle='#5d4037';ctx.font='800 14px "Baloo 2", sans-serif';ctx.textAlign='center';
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
    ctx.fillStyle='#fff';ctx.font='800 20px "Baloo 2", sans-serif';ctx.textAlign='center';
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
    ctx.fillStyle='#fff';ctx.font='800 20px "Baloo 2", sans-serif';ctx.textAlign='center';
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
    ctx.font='26px "Baloo 2", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('⭐',0,0);
    ctx.restore();
  }
  ctx.textBaseline='alphabetic';
}

function drawHedgehog(){
  const h=G.hed;
  ctx.save();ctx.translate(h.x,h.y);
  if(G.invuln>0&&Math.floor(G.time*10)%2===0)ctx.globalAlpha=0.35;
  // 刺
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
  // 身体
  ctx.fillStyle='#8d6e63';
  ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.fill();
  // 脸
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
  if(L.def.dark)drawDark();
  drawFireflies(); // 萤火虫在黑暗上层发光
  ctx.restore();
}

/* ---------- HUD ---------- */
function hud(){
  const hh=Math.max(0,G.hearts);
  document.getElementById('hHeart').innerHTML=hh>0?'<span style="color:#ff8a80;">'+'❤'.repeat(hh)+'</span>':'💔';
  document.getElementById('hStar').textContent='⭐ '+G.starGot;
  let lv=G.level.def.name.split(' ').slice(0,3).join(' ');
  if(G.timeLeft>0){
    const s=Math.ceil(G.timeLeft);
    const urg=s<=15?' style="color:#ef5350;"':'';
    lv+=' <span'+urg+'>⏱️'+s+'</span>';
  }
  document.getElementById('hLevel').innerHTML=lv;
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
  G.phase='play';
  banner(G.level.def.hint,3000);
});
document.getElementById('againBtn').addEventListener('click',()=>{
  totalStars=0;setHearts(3);loadLevel(0);
});
document.getElementById('exchangeBtn').addEventListener('click',doExchange);
document.getElementById('feedBtn').addEventListener('click',doFeed);
document.getElementById('exchangeCatBtn').addEventListener('click',doExchangeCat);
document.getElementById('feedCatBtn').addEventListener('click',doFeedCat);
document.getElementById('sleepBtn').addEventListener('click',doSleep);
document.getElementById('petAgainBtn').addEventListener('click',()=>{hidePet();totalStars=0;setHearts(3);loadLevel(0);});
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
resize();loadLevel(0);
requestAnimationFrame(loop);
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
// Node 测试钩子：浏览器里 module 未定义，无影响
if(typeof module!=='undefined'&&typeof process!=='undefined'){
  module.exports._t={getG:function(){return G},loadLevel:loadLevel,showIntro:showIntro,update:update,
    clickStart:function(){document.getElementById('startBtn').click();},
    getPet:function(){return Pet},showPet:showPet,doExchange:doExchange,doFeed:doFeed,doExchangeCat:doExchangeCat,doFeedCat:doFeedCat,updatePetUI:updatePetUI,
    setHearts:setHearts,gameOver:gameOver};
}
})();
