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

// 隧道半宽（带收窄点，比如骷髅头的嘴巴）
function halfWidthAt(level,s){
  let hw=level.half;
  const pinches=level.pinches||[];
  for(let k=0;k<pinches.length;k++){
    const pin=pinches[k];
    const d=Math.abs(s-pin.s);
    if(d<pin.len){
      const t=1-d/pin.len;
      const sm=t*t*(3-2*t);
      hw=Math.min(hw,level.half+(pin.half-level.half)*sm);
    }
  }
  return hw;
}

// 把刺猬限制在隧道内；返回修正后的位置和所在弧长
function clampToTunnel(path,level,x,y,r){
  const n=nearestOnPath(path,x,y);
  const hw=halfWidthAt(level,n.s)-r;
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
  { name:'第 1 关 · 跟着箭头走',
    sub:'山洞探险开始！',
    hint:'🔭 镜头说：跟着蓝色箭头，钻进山洞，一直往上走！',
    waypoints:[[70,690],[70,470],[250,470],[250,270],[110,270],[110,140]],
    half:60, pinches:[], bows:[], slings:[], starN:6 },
  { name:'第 2 关 · 骷髅头的嘴巴',
    sub:'小心，前面有弓箭！',
    hint:'🔭 镜头说：从骷髅头的嘴巴钻过去，躲开弓箭射来的箭！',
    waypoints:[[70,690],[70,540],[300,540],[300,380],[140,380],[140,220],[330,220],[330,120]],
    half:55,
    pinches:[{frac:0.55,half:28,len:70,skull:true}],
    bows:[{frac:0.32,side:1,period:2.8,speed:280},
           {frac:0.74,side:-1,period:3.4,speed:320}],
    slings:[], starN:7 },
  { name:'第 3 关 · 箭雨大冒险',
    sub:'最后一关，最难的山洞！',
    hint:'🔭 镜头说：弓箭和弹弓一起来了！看准空隙冲过去！',
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
];

if(typeof module!=='undefined'){
  module.exports={buildPath:buildPath,pathFrame:pathFrame,
    nearestOnPath:nearestOnPath,halfWidthAt:halfWidthAt,
    clampToTunnel:clampToTunnel,stepProjectile:stepProjectile,
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
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}return AC;}
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
document.addEventListener('pointerdown',()=>{const a=ac();if(a&&a.resume)a.resume();});

/* ---------- 状态 ---------- */
let G=null,totalStars=0;
const HEDGE_R=16;

function loadLevel(idx){
  const def=LEVELS[idx];
  const path=buildPath(def.waypoints);
  const level={
    def:def,path:path,half:def.half,
    pinches:(def.pinches||[]).map(p=>({s:p.frac*path.len,half:p.half,len:p.len,skull:!!p.skull})),
    bows:(def.bows||[]).map((b,i)=>({s:b.frac*path.len,side:b.side,period:b.period,speed:b.speed,timer:1.1+i*0.8})),
    slings:(def.slings||[]).map((b,i)=>({s:b.frac*path.len,side:b.side,period:b.period,speed:b.speed,timer:2.0+i*1.1})),
    stars:[]
  };
  for(let i=0;i<def.starN;i++){
    const f=pathFrame(path,(i+1)/(def.starN+1)*path.len);
    const off=(i%2===0?1:-1)*def.half*0.35;
    level.stars.push({x:f.x+f.nx*off,y:f.y+f.ny*off,got:false,ph:Math.random()*6});
  }
  const st=pathFrame(path,14);
  G={idx:idx,level:level,phase:'intro',time:0,hearts:3,starGot:0,
     hed:{x:st.x,y:st.y,tx:st.x,ty:st.y,r:HEDGE_R,face:1},
     projs:[],invuln:0,sMax:0};
  showIntro(idx,false);
}

function showIntro(idx,passed){
  const def=LEVELS[idx];
  document.getElementById('introTitle').textContent='🦔 刺猬滚跑';
  document.getElementById('introLevel').textContent=def.name;
  document.getElementById('introSub').textContent=passed?('🎉 '+(LEVELS[idx-1]?LEVELS[idx-1].name:'')+'通过啦！'):def.sub;
  document.getElementById('introHint').textContent=def.hint;
  document.getElementById('introRules').style.display=idx===0?'block':'none';
  document.getElementById('startBtn').textContent=idx===0?'开始滚跑！':'进入'+def.name.split(' ')[0];
  document.getElementById('startOv').style.display='flex';
  document.getElementById('winOv').style.display='none';
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
  const hw=halfWidthAt(L,b.s);
  const px=f.x+f.nx*b.side*(hw+2),py=f.y+f.ny*b.side*(hw+2);
  const vx=-f.nx*b.side*b.speed,vy=-f.ny*b.side*b.speed;
  G.projs.push({x:px,y:py,vx:vx,vy:vy,life:2.4,kind:'arrow',ang:Math.atan2(vy,vx)});
  sfxShoot();
}
function fireSling(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s);
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
  // 刺猬跟随手指
  const k=Math.min(1,dt*9);
  const px=h.x,py=h.y;
  h.x+=(h.tx-h.x)*k;h.y+=(h.ty-h.y)*k;
  if(Math.abs(h.tx-h.x)>2)h.face=h.tx>h.x?1:-1;
  const c=clampToTunnel(L.path,L,h.x,h.y,h.r);
  h.x=c.x;h.y=c.y;
  if(c.s>G.sMax)G.sMax=c.s;
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
    const hw=halfWidthAt(L,n.s);
    if(n.dist>hw+30)continue; // 打到对面墙上
    if(G.invuln<=0&&circleHit(p.x,p.y,p.kind==='arrow'?6:7,h.x,h.y,h.r)){
      G.hearts--;G.invuln=1.6;sfxHit();
      if(G.hearts<=0){
        banner('😵 刺猬晕啦，再试一次！',2200);
        const idx=G.idx,ts=totalStars-G.starGot;
        setTimeout(()=>{totalStars=ts;loadLevel(idx);},900);
        G.phase='over';return;
      }
      banner('哎呀！被打到了，还剩 '+'❤'.repeat(G.hearts),1800);
      continue;
    }
    keep.push(p);
  }
  G.projs=keep;
  // 星星
  for(const s of L.stars){
    if(!s.got&&circleHit(s.x,s.y,10,h.x,h.y,h.r+4)){
      s.got=true;G.starGot++;totalStars++;sfxStar();
    }
  }
  // 到出口？
  if(G.sMax>=L.path.len-30){
    G.phase='done';sfxWin();
    if(G.idx>=LEVELS.length-1){
      document.getElementById('winStats').innerHTML=
        '🦔 小刺猬走出了所有的山洞！<br>⭐ 一共吃到 <b>'+totalStars+'</b> 颗小星星';
      document.getElementById('winOv').style.display='flex';
    }else{
      banner('🎉 '+L.def.name+'通过！',2200);
      sfxLevel();
      setTimeout(()=>{G.phase='intro';showIntro(G.idx+1,true);},1400);
    }
  }
}

/* ---------- 画画 ---------- */
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

function drawTunnel(){
  const L=G.level,pts=L.path.pts;
  // 墙（深色 halo）+ 地面
  for(let i=0;i<pts.length;i+=2){
    const p=pts[i],hw=halfWidthAt(L,p.s);
    ctx.fillStyle='#4e342e';
    ctx.beginPath();ctx.arc(p.x,p.y,hw+10,0,7);ctx.fill();
  }
  for(let i=0;i<pts.length;i+=2){
    const p=pts[i],hw=halfWidthAt(L,p.s);
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
  ctx.beginPath();ctx.ellipse(st.x,st.y,halfWidthAt(L,8)*0.85,halfWidthAt(L,8)*0.7,0,0,7);ctx.fill();
  ctx.fillStyle='#a1887f';ctx.font='bold 15px sans-serif';ctx.textAlign='center';
  ctx.fillText('起点',st.x,st.y+halfWidthAt(L,8)+22);
  const en=pathFrame(L.path,L.path.len-8);
  const g=ctx.createRadialGradient(en.x,en.y,4,en.x,en.y,52);
  g.addColorStop(0,'rgba(255,249,196,.95)');g.addColorStop(1,'rgba(255,249,196,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(en.x,en.y,52,0,7);ctx.fill();
  ctx.fillStyle='#fffde7';ctx.strokeStyle='#ffb300';ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(en.x,en.y,26,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e65100';ctx.font='bold 15px sans-serif';
  ctx.fillText('出口',en.x,en.y+5);
}

function drawCamera(){
  const L=G.level,f=pathFrame(L.path,52);
  const ang=Math.atan2(f.ty,f.tx);
  const cx=f.x+f.nx*-(halfWidthAt(L,52)*0.4),cy=f.y+f.ny*-(halfWidthAt(L,52)*0.4);
  ctx.save();ctx.translate(cx,cy);
  ctx.font='30px sans-serif';ctx.textAlign='center';
  ctx.fillText('📷',0,0);
  ctx.restore();
  ctx.save();ctx.translate(cx,cy-34);ctx.rotate(0);
  ctx.fillStyle='rgba(255,255,255,.94)';
  const tw=86;
  rr(-tw/2,-16,tw,28,13);ctx.fill();
  ctx.fillStyle='#5d4037';ctx.font='bold 14px sans-serif';ctx.textAlign='center';
  ctx.fillText('往这边走！',0,3);
  ctx.restore();
}

function drawSkull(pin){
  const L=G.level,f=pathFrame(L.path,pin.s);
  const ang=Math.atan2(f.ty,f.tx);
  const ph=pin.half;
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(ang);
  // 头
  ctx.fillStyle='#eceff1';ctx.strokeStyle='#616161';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,40,0,7);ctx.fill();ctx.stroke();
  // 嘴巴通道（隧道从这里穿过）
  ctx.fillStyle='#d9b384';
  rr(-48,-ph,96,ph*2,10);ctx.fill();
  // 牙齿（只画在头圆以内）
  ctx.save();
  ctx.beginPath();ctx.arc(0,0,40,0,7);ctx.clip();
  ctx.fillStyle='#fafafa';ctx.strokeStyle='#9e9e9e';ctx.lineWidth=1.5;
  for(let i=-3;i<=3;i++){
    ctx.fillRect(i*13-5,-ph-13,10,13);ctx.strokeRect(i*13-5,-ph-13,10,13);
    ctx.fillRect(i*13-5,ph,10,13);ctx.strokeRect(i*13-5,ph,10,13);
  }
  ctx.restore();
  // 眼睛（嘴巴上方）
  ctx.fillStyle='#212121';
  ctx.beginPath();ctx.arc(-13,-30,6,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(13,-30,6,0,7);ctx.fill();
  ctx.restore();
}

function drawBow(b){
  const L=G.level,f=pathFrame(L.path,b.s);
  const hw=halfWidthAt(L,b.s);
  const bx=f.x+f.nx*b.side*(hw+4),by=f.y+f.ny*b.side*(hw+4);
  const ang=Math.atan2(-f.ny*b.side,-f.nx*b.side);
  const tele=b.timer<0.7;
  ctx.save();ctx.translate(bx,by);ctx.rotate(ang);
  if(tele){
    ctx.fillStyle='rgba(239,83,80,'+(0.22+0.18*Math.sin(G.time*14))+')';
    ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';
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
  const hw=halfWidthAt(L,b.s);
  const bx=f.x+f.nx*b.side*(hw+4),by=f.y+f.ny*b.side*(hw+4);
  const ang=Math.atan2(-f.ny*b.side,-f.nx*b.side);
  const tele=b.timer<0.8;
  ctx.save();ctx.translate(bx,by);ctx.rotate(ang);
  if(tele){
    ctx.fillStyle='rgba(239,83,80,'+(0.22+0.18*Math.sin(G.time*14))+')';
    ctx.beginPath();ctx.arc(0,0,27,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';
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
    ctx.font='26px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
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
  drawStars();
  for(const b of L.bows)drawBow(b);
  for(const b of L.slings)drawSling(b);
  drawProjs();
  drawHedgehog();
  ctx.restore();
}

/* ---------- HUD ---------- */
function hud(){
  document.getElementById('hHeart').textContent='❤'.repeat(Math.max(0,G.hearts))||'💔';
  document.getElementById('hStar').textContent='⭐ '+G.starGot;
  document.getElementById('hLevel').textContent=G.level.def.name.split(' ')[0]+' '+G.level.def.name.split(' ')[1];
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
  totalStars=0;loadLevel(0);
});
resize();loadLevel(0);
requestAnimationFrame(loop);
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
})();
