(() => {
'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
let W=innerWidth,H=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
function resize(){W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize);resize();

const $=id=>document.getElementById(id);
const screens=['menu','loadout','result','pause','perk'];
function show(id){screens.forEach(x=>$(x).classList.toggle('hidden',x!==id));}
const SAVE='shadow_rift_save_v1';
const state={level:1,xp:0,xpNeed:100,gold:0,wave:1,depth:1,kills:0,autoUntil:0,rebirths:0,weapon:0,stats:{damage:18,hp:120,speed:3.4,crit:.06,armor:0},perks:[],selectedBuild:0};
const builds=[
 {name:'Клинок рассвета',desc:'Быстрые атаки. +20% скорость.',damage:16,speed:4.1},
 {name:'Охотник рифта',desc:'Дальний бой. +30% урон.',damage:23,speed:3.2},
 {name:'Страж',desc:'Тяжёлый стиль. +55 HP.',damage:20,speed:2.8}
];
const perkPool=[
 ['Острый импульс','+25% к урону','damage',1.25],
 ['Реактивный привод','+18% к скорости','speed',1.18],
 ['Укреплённое ядро','+30% к максимуму HP','hp',1.3],
 ['Точный контур','+8% к критическому удару','crit',null],
 ['Наноброня','+2 к броне','armor',null]
];
let running=false,paused=false,last=0,spawnClock=0,enemyId=0,hitFlash=0;
let player={x:W/2,y:H-125,r:18,hp:120,maxHp:120,atk:18,speed:3.4,crit:.06,armor:0,attackClock:0};
let enemies=[],shots=[],enemyShots=[],particles=[],joystick={on:false,x:0,y:0,sx:0,sy:0},keys={};

function save(){localStorage.setItem(SAVE,JSON.stringify({...state,autoUntil:Math.max(0,state.autoUntil-Date.now())}));}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(!s)return false;Object.assign(state,s);state.autoUntil=Date.now()+(s.autoUntil||0);return true}catch(e){return false}}
function sync(){state.stats=state.stats||{damage:18,hp:120,speed:3.4,crit:.06,armor:0};let b=builds[state.selectedBuild||0];player.maxHp=state.stats.hp+b.name==='Страж'?state.stats.hp+55:state.stats.hp;player.hp=Math.min(player.hp,player.maxHp);player.atk=state.stats.damage+b.damage-(state.stats.damage-18);player.speed=state.stats.speed+b.speed-3.4;player.crit=state.stats.crit;player.armor=state.stats.armor}
function resetRun(){state.wave=1;state.depth=1;state.kills=0;state.xp=0;state.xpNeed=100;state.perks=[];state.selectedBuild=0;player={x:W/2,y:H-125,r:18,hp:120,maxHp:120,atk:34,speed:4.1,crit:.06,armor:0,attackClock:0};enemies=[];shots=[];enemyShots=[];particles=[];sync()}
function updateHud(){const pct=Math.min(100,state.xp/state.xpNeed*100);$('level').textContent='УР. '+state.level;$('hp').textContent='HP '+Math.max(0,Math.ceil(player.hp))+'/'+Math.ceil(player.maxHp);$('gold').textContent='◆ '+state.gold;$('xpbar').style.width=pct+'%';$('location').textContent=(state.depth<4?'Ржавый коридор':state.depth<8?'Затонувший сектор':state.depth<12?'Нулевая цитадель':'Сердце рифта')+' · Этаж '+state.depth;$('quest').textContent='Задание: победить '+Math.min(20,state.depth+5)+' врагов · '+state.kills+'/'+Math.min(20,state.depth+5);$('adPanel').classList.toggle('hidden',!running||Date.now()<state.autoUntil)}
function start(){running=true;paused=false;show('game');$('adPanel').classList.remove('hidden');prepareFloor();last=performance.now();requestAnimationFrame(loop)}
function prepareFloor(){enemies=[];shots=[];enemyShots=[];spawnClock=0;player.x=W/2;player.y=H-125;player.hp=player.maxHp;for(let i=0;i<Math.min(3+Math.floor(state.depth/3),7);i++)spawnEnemy(i)}
function spawnEnemy(i){const elite=Math.random()<Math.min(.22,state.depth*.012);const r=elite?22:16;const hp=(45+state.depth*9)*(elite?2.5:1);enemies.push({id:enemyId++,x:100+(i%5)*Math.max(90,W/5),y:120+Math.floor(i/5)*70,r,hp,maxHp:hp,speed:(.5+state.depth*.015)*(elite?1.05:1),elite})}
function gainXP(n){state.xp+=n;while(state.xp>=state.xpNeed){state.xp-=state.xpNeed;state.level++;state.xpNeed=Math.floor(state.xpNeed*1.28);openPerk()}}
function openPerk(){running=false;show('perk');const choices=[...perkPool].sort(()=>Math.random()-.5).slice(0,3);$('perkCards').innerHTML=choices.map((p,i)=>'<div class="card" data-i="'+i+'"><b>'+p[0]+'</b><small>'+p[1]+'</small></div>').join('');$('perkCards').querySelectorAll('.card').forEach((el,i)=>el.onclick=()=>{const p=choices[i];state.perks.push(p[0]);if(p[2]==='crit')state.stats.crit+=.08;else if(p[2]==='armor')state.stats.armor+=2;else state.stats[p[2]]*=p[3];sync();show('game');running=true;last=performance.now();requestAnimationFrame(loop)})}
function attack(){if(player.attackClock>0)return;player.attackClock=state.autoUntil>Date.now()?75:145;let target=enemies.reduce((a,e)=>!a||e.y<a.y?e:a,null);if(!target)return;const dx=target.x-player.x,dy=target.y-player.y,len=Math.hypot(dx,dy)||1;shots.push({x:player.x,y:player.y,dx:dx/len*9,dy:dy/len*9,dmg:player.atk*(Math.random()<player.crit?2:1),life:900})}
function hitEnemy(e,dmg){e.hp-=dmg;hitFlash=1;for(let i=0;i<4;i++)particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3,life:300})}
function kill(e){state.kills++;state.gold+=e.elite?8:3;gainXP(e.elite?38:18);if(Math.random()<.13)state.gold+=10;enemies=enemies.filter(x=>x!==e);if(enemies.length===0){state.wave++;state.depth=Math.max(1,Math.floor((state.wave-1)/3)+1);if(state.wave%10===0){finish(true)}else prepareFloor()}}
function hurt(n){const dmg=Math.max(1,n-player.armor*.7);player.hp-=dmg;hitFlash=1;if(player.hp<=0)finish(false)}
function finish(win){running=false;save();show('result');$('resultEyebrow').textContent=win?'ЭТАЖ ОЧИЩЕН':'ЗАБЕГ ОКОНЧЕН';$('resultTitle').textContent=win?'ПРОРЫВ':'ПАДЕНИЕ';$('resultText').innerHTML='<p>Этаж: <b>'+state.depth+'</b><br>Враги: <b>'+state.kills+'</b><br>Золото: <b>'+state.gold+'</b></p>';$('againBtn').textContent=win?'ДАЛЬШЕ':'ПОВТОРИТЬ';}
function move(dt){let x=0,y=0;if(keys.w||keys.ArrowUp)y--;if(keys.s||keys.ArrowDown)y++;if(keys.a||keys.ArrowLeft)x--;if(keys.d||keys.ArrowRight)x++;if(joystick.on){x=joystick.x;y=joystick.y}const l=Math.hypot(x,y)||1;if(x||y){player.x+=x/l*player.speed*dt*.07;player.y+=y/l*player.speed*dt*.07}player.x=Math.max(25,Math.min(W-25,player.x));player.y=Math.max(90,Math.min(H-35,player.y))}
function update(dt){move(dt);player.attackClock=Math.max(0,player.attackClock-dt);if(state.autoUntil>Date.now())attack();else if(keys.Space)attack();for(const e of enemies){const dx=player.x-e.x,dy=player.y-e.y,l=Math.hypot(dx,dy)||1;e.x+=dx/l*e.speed*dt*.045;e.y+=dy/l*e.speed*dt*.045;if(l<e.r+player.r+5){hurt(8+state.depth*.8);e.x-=dx/l*18;e.y-=dy/l*18}if(Math.random()<dt*.00045&&enemyShots.length<45)enemyShots.push({x:e.x,y:e.y,dx:dx/l*3,dy:dy/l*3,life:1800})}for(const s of shots){s.x+=s.dx*dt/16;s.y+=s.dy*dt/16;s.life-=dt;for(const e of enemies){if(Math.hypot(s.x-e.x,s.y-e.y)<e.r+6){hitEnemy(e,s.dmg);s.life=0;if(e.hp<=0){kill(e);break}}}}shots=shots.filter(s=>s.life>0&&s.y>-20&&s.y<H+20);for(const s of enemyShots){s.x+=s.dx*dt/16;s.y+=s.dy*dt/16;s.life-=dt;if(Math.hypot(s.x-player.x,s.y-player.y)<player.r+5){s.life=0;hurt(10+state.depth)}}enemyShots=enemyShots.filter(s=>s.life>0&&s.x>-30&&s.x<W+30&&s.y>-30&&s.y<H+30);for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.life-=dt}particles=particles.filter(p=>p.life>0);hitFlash=Math.max(0,hitFlash-dt/160);updateHud())}
function draw(){ctx.clearRect(0,0,W,H);const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#090e1d');grd.addColorStop(1,'#05070d');ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);for(let i=0;i<60;i++){const x=(i*97+(state.depth*13))%W,y=(i*53+(state.wave*7))%H;ctx.fillStyle=i%7===0?'#6f83c8':'#27324b';ctx.fillRect(x,y,1,1)}ctx.strokeStyle='#182238';for(let y=125;y<H;y+=70){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/300);ctx.fillStyle='#90a7ff';ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;for(const e of enemies){ctx.fillStyle=e.elite?'#9a68ff':'#d34e72';ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,7);ctx.fill();ctx.fillStyle='#0b1020';ctx.beginPath();ctx.arc(e.x-5,e.y-3,3,0,7);ctx.arc(e.x+5,e.y-3,3,0,7);ctx.fill();ctx.fillStyle='#202941';ctx.fillRect(e.x-e.r,e.y-e.r-9,e.r*2,4);ctx.fillStyle='#75e0a0';ctx.fillRect(e.x-e.r,e.y-e.r-9,e.r*2*Math.max(0,e.hp/e.maxHp),4)}for(const s of shots){ctx.fillStyle='#dce5ff';ctx.fillRect(s.x-2,s.y-7,4,14)}for(const s of enemyShots){ctx.fillStyle='#ff687f';ctx.beginPath();ctx.arc(s.x,s.y,4,0,7);ctx.fill()}ctx.save();ctx.translate(player.x,player.y);ctx.fillStyle=hitFlash?'#fff':'#728cff';ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(17,19);ctx.lineTo(0,13);ctx.lineTo(-17,19);ctx.closePath();ctx.fill();ctx.restore();if(state.autoUntil>Date.now()){ctx.strokeStyle='#8ca5ff77';ctx.beginPath();ctx.arc(player.x,player.y,32+Math.sin(Date.now()/120)*4,0,7);ctx.stroke()}}
function loop(t){if(!running)return;const dt=Math.min(34,t-last);last=t;update(dt);draw();requestAnimationFrame(loop)}
function beginLoadout(){show('loadout');$('loadoutCards').innerHTML=builds.map((b,i)=>'<div class="card '+(i===state.selectedBuild?'selected':'')+'" data-i="'+i+'"><b>'+b.name+'</b><small>'+b.desc+'</small></div>').join('');$('loadoutCards').querySelectorAll('.card').forEach(el=>el.onclick=()=>{state.selectedBuild=+el.dataset.i;$('loadoutCards').querySelectorAll('.card').forEach(x=>x.classList.remove('selected'));el.classList.add('selected')});$('enterDungeon').onclick=()=>{sync();start()}}
$('startBtn').onclick=()=>{resetRun();beginLoadout()};$('continueBtn').onclick=()=>{if(load()){sync();beginLoadout()}else beginLoadout()};$('againBtn').onclick=()=>{state.wave=Math.max(1,state.wave);sync();start()};$('resultMenuBtn').onclick=()=>{save();show('menu')};$('pauseBtn').onclick=()=>{if(running){running=false;show('pause')}};$('resumeBtn').onclick=()=>{running=true;show('game');last=performance.now();requestAnimationFrame(loop)};$('saveBtn').onclick=()=>{save();show('menu')};$('pauseMenuBtn').onclick=()=>{save();show('menu')};$('afkBtn').onclick=()=>{const mins=5;state.gold+=Math.floor((state.depth+state.level)*mins*.7);state.xp+=Math.floor((state.depth+state.level)*mins*2);save();alert('AFK-отряд принёс ресурсы.');updateHud()};

$('adBtn').onclick=()=>{if(window.AndroidAPI&&typeof AndroidAPI.showRewardedAd==='function'){AndroidAPI.showRewardedAd()}else alert('Rewarded-реклама доступна в Android-версии. В браузере бонус не выдаётся.')};
window.addEventListener('rewardEarned',e=>{state.autoUntil=Date.now()+10*60*1000;updateHud();save();});
addEventListener('keydown',e=>{keys[e.key]=true;if(e.key===' '){e.preventDefault();attack()}});
addEventListener('keyup',e=>keys[e.key]=false);
function joyStart(e){const t=e.touches?e.touches[0]:e;joystick.on=true;joystick.sx=t.clientX;joystick.sy=t.clientY;joystick.x=0;joystick.y=0}
function joyMove(e){if(!joystick.on)return;const t=e.touches?e.touches[0]:e,dx=t.clientX-joystick.sx,dy=t.clientY-joystick.sy,l=Math.hypot(dx,dy)||1,m=Math.min(1,l/70);joystick.x=dx/l*m;joystick.y=dy/l*m}
function joyEnd(){joystick.on=false;joystick.x=0;joystick.y=0}
canvas.addEventListener('pointerdown',joyStart);canvas.addEventListener('pointermove',joyMove);canvas.addEventListener('pointerup',joyEnd);canvas.addEventListener('pointercancel',joyEnd);
show('menu');updateHud();
})();