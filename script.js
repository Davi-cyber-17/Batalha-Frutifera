const $=id=>document.getElementById(id),W=540,CX=W/2,R=78,L=340,WIN=10;
const LOCK=2.1,COOL=.5,SHOW=1.25,NF=4,ND=5;   // trava ao cortar bola falsa, recarga do botão, tempo da fruta cortada
const BLUE='#01c1ed',RED='#fd5d53',INK='#060a22',ICE={config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},{urls:['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turn:openrelay.metered.ca:443?transport=tcp'],username:'openrelayproject',credential:'openrelayproject'}]}},cv=$('cv'),cx=cv.getContext('2d');
const COLS=[BLUE,RED,'#39ff88','#c77dff'];   // azul, vermelho, verde, roxo
const FC=['#fd9a2e','#e5413a','#47b85a','#a3d65b'];          // laranja, romã, melancia, limão
const rnd=(a,b)=>a+Math.random()*(b-a),r1=n=>Math.round(n*10)/10;
let H=1170,CY=585,T=0,ping=0,trails=[],act={},G=null,peer=null,conn=null,run=false,tick=0,last=0,parts=[],bursts=[],vis={k:0,ty:-1,age:9,mo:0},ghosts=[],rings=[],shake=0,pulse=[0,0,0,0],hist=[[],[],[],[]],goT=0,motes=Array.from({length:46},()=>({x:Math.random(),y:Math.random(),s:rnd(1,2.6),v:rnd(.4,1.6),f:rnd(0,6)})),anim=Array.from({length:4},()=>({m:null,t:0,u:0}));

/* ---------- tela adaptável: a arena muda de proporção conforme o aparelho ---------- */
let LAND=false;
function fit(){
  const vw=document.documentElement.clientWidth||innerWidth,vh=innerHeight,st=$('stage');
  LAND=vw/vh>=1.05;let sw,sh;
  if(LAND){const r=Math.min(2.167,Math.max(1.333,vw/vh));sw=Math.min(vw,vh*r);sh=sw/r;H=Math.round(W*r)}   // deitado: arena horizontal
  else{const r=Math.min(.75,Math.max(.46,vw/vh));sw=Math.min(vw,vh*r);sh=sw/r;H=Math.round(W/r)}          // em pé: arena vertical
  CY=H/2;
  Object.assign(st.style,{width:sw+'px',height:sh+'px',left:(vw-sw)/2+'px',top:(vh-sh)/2+'px'});
}
addEventListener('resize',fit);if(window.visualViewport)visualViewport.addEventListener('resize',fit);addEventListener('orientationchange',()=>setTimeout(fit,150));
/* ---------- telas ---------- */
function show(id){document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('on',e.id===id));$('stage').classList.remove('on')}
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
$('bLocal').onclick=()=>show('local');$('bOnline').onclick=()=>show('online');
$('l1').onclick=()=>start('local1');$('l2').onclick=()=>start('local2');$('l3').onclick=()=>start('local3');$('l4').onclick=()=>start('local4');
function closeNet(){try{conn&&conn.close()}catch(e){}try{peer&&peer.destroy()}catch(e){}conn=peer=null}
function quit(msg){run=false;clearInterval(window.pingT);closeNet();G=null;$('over').classList.remove('on');show('menu');if(msg)alert(msg)}
$('bExit').onclick=()=>quit();$('bQuit').onclick=()=>quit();$('bLeave').onclick=()=>quit();

/* ---------- online (salas via PeerJS) ---------- */
$('bCreate').onclick=()=>{
  if(!window.Peer){$('onMsg').textContent='Sem conexão com o servidor de salas. Verifique a internet.';return}
  const code=Math.random().toString(36).slice(2,6).toUpperCase();
  $('onMsg').textContent='Criando sala...';
  peer=new Peer('frutabat-'+code,ICE);
  peer.on('open',()=>{$('roomCode').textContent=code;$('lobMsg').textContent='Aguardando outro jogador...';$('bSolo').style.display='';show('lobby')});
  peer.on('error',e=>{$('onMsg').textContent='Erro: '+(e.type==='unavailable-id'?'tente de novo':e.type)});
  peer.on('connection',c=>{
    if(conn||(G&&run)){c.on('open',()=>c.close());return}
    conn=c;
    c.on('open',()=>start('host'));
    c.on('data',d=>{if(!d)return;if(d.t==='cut'&&G&&G.mode==='host')cut(0);else if(d.t==='p'&&c.open)c.send({t:'q',ts:d.ts})});
    c.on('close',()=>{if(G&&G.mode==='host')quit('O outro jogador saiu.')});
  });
};
$('bSolo').onclick=()=>start('solo');
$('bJoin').onclick=()=>{
  if(!window.Peer){$('onMsg').textContent='Sem conexão com o servidor de salas. Verifique a internet.';return}
  const code=$('code').value.trim().toUpperCase();if(code.length<4){$('onMsg').textContent='Digite o código da sala.';return}
  $('onMsg').textContent='Conectando...';
  peer=new Peer(undefined,ICE);
  peer.on('error',()=>{$('onMsg').textContent='Sala não encontrada.'});
  peer.on('open',()=>{
    conn=peer.connect('frutabat-'+code,{reliable:true});
    conn.on('open',()=>{start('guest');clearInterval(window.pingT);window.pingT=setInterval(()=>{if(conn&&conn.open)conn.send({t:'p',ts:Date.now()})},2000)});
    conn.on('data',onState);
    conn.on('close',()=>{if(G&&G.mode==='guest')quit('A sala foi encerrada.')});
  });
};

/* ---------- jogo ----------
   Índice 0 = azul, 1 = vermelho. O jogador "de baixo" (canto inferior direito) é me():
   o convidado online é o 0, todos os outros modos o 1.
   Item: kind 0 = nada, 1 = fruta inteira (espera ser cortada), 2 = fruta cortada (mostra o corte),
         3 = bola falsa (não pode ser cortada, trava quem tentar). */
const me=()=>G.mode==='guest'?0:1;
const emit=e=>{G.ev.push(e);G.out.push(e)};
function start(mode){
  const n=mode==='local3'?3:mode==='local4'?4:2;   // nº de jogadores na arena
  G={mode,n,sc:Array(n).fill(0),lock:Array(n).fill(0),cool:Array(n).fill(0),phase:'count',cd:3,winner:null,lastFruit:-1,lastDecoy:false,
     it:{kind:0,type:0,pop:0,t:.6,dt:0,mt:0,by:0},bot:{at:0,done:true,age:0},ev:[],out:[]};
  parts=[];bursts=[];trails=[];act={};ghosts=[];rings=[];shake=0;pulse=[0,0,0,0];hist=[[],[],[],[]];vis={k:0,ty:-1,age:9,mo:0};goT=0;anim=Array.from({length:4},()=>({m:null,t:0,u:0}));
  const l2=mode==='local2';
  document.querySelectorAll('.screen').forEach(e=>e.classList.remove('on'));
  $('stage').classList.add('on');$('stage').classList.toggle('l2',l2);fit();$('over').classList.remove('on');
  $('bAgain').style.display=mode==='guest'?'none':'';
  $('hint').innerHTML=n>2?'Cada jogador toca no <u>seu canto</u> da tela!<br>Bolas falsas travam você por 2s':l2?'Toque na <u>sua metade</u> da tela para cortar!<br>Bolas falsas travam você por 2s':'Toque (ou deslize) na tela para cortar!<br>Bolas falsas travam você por 2s';
  if(!run){run=true;last=performance.now();requestAnimationFrame(loop)}
}
/* convidado: avança temporizadores entre pacotes de rede, para animar suave em vez de 'pulinhos' */
function gstep(dt){for(let i=0;i<2;i++){G.lock[i]=Math.max(0,G.lock[i]-dt);G.cool[i]=Math.max(0,G.cool[i]-dt)}if(G.phase==='count')G.cd=Math.max(0,G.cd-dt);G.it.pop=Math.min(1,G.it.pop+dt*6)}
function loop(t){
  if(!run)return;requestAnimationFrame(loop);
  const dt=Math.min(.033,(t-last)/1000);last=t;T=t;tick++;
  if(G.mode!=='guest'){sim(dt);if(G.mode==='host'&&tick%2===0&&conn&&conn.open)conn.send(pack())}else gstep(dt);
  fxStep(dt);draw();hud();
}
function spawnFruit(){
  const it=G.it;let t;do{t=Math.random()*NF|0}while(t===G.lastFruit);G.lastFruit=t;G.lastDecoy=false;
  Object.assign(it,{kind:1,type:t,pop:0});
  if(G.mode==='local1'||G.mode==='solo'){G.bot.done=false;G.bot.at=rnd(.38,.85);G.bot.age=0}
}
function spawnDecoy(){
  const it=G.it;G.lastDecoy=true;
  Object.assign(it,{kind:3,type:Math.random()*ND|0,pop:0,dt:rnd(1.8,3.6),mt:rnd(.6,1)});
  if(G.mode==='local1'||G.mode==='solo'){   // às vezes o bot erra e corta a bola falsa
    G.bot.age=0;if(Math.random()<.12){G.bot.done=false;G.bot.at=rnd(.4,1.2)}else G.bot.done=true}
}
function cut(p){
  if(!G||G.phase!=='play'||G.lock[p]>0||G.cool[p]>0)return;
  const it=G.it;G.cool[p]=COOL;
  if(it.kind===1){
    G.sc[p]++;Object.assign(it,{kind:2,t:SHOW,by:p});emit(['s',p,it.type]);
    if(G.sc[p]>=WIN){G.phase='over';G.winner=p}
  }else if(it.kind===3){G.lock[p]=LOCK;emit(['i',p])}
  else emit(['w',p]);   // golpe no vazio
}
function sim(dt){
  const it=G.it;
  for(let i=0;i<G.n;i++){if(G.lock[i]>0)G.lock[i]=Math.max(0,G.lock[i]-dt);if(G.cool[i]>0)G.cool[i]=Math.max(0,G.cool[i]-dt)}
  if(G.phase==='count'){G.cd-=dt;if(G.cd<=0)G.phase='play';return}
  if(G.phase!=='play')return;
  it.pop=Math.min(1,it.pop+dt*6);
  if(!G.bot.done&&(it.kind===1||it.kind===3)){G.bot.age+=dt;if(G.bot.age>=G.bot.at){G.bot.done=true;cut(0)}}  // bot = jogador de cima (0)
  if(it.kind===0){it.t-=dt;if(it.t<=0)spawnFruit()}
  else if(it.kind===2){it.t-=dt;if(it.t<=0){if(!G.lastDecoy&&Math.random()<.5)spawnDecoy();else spawnFruit()}}
  else if(it.kind===3){
    it.dt-=dt;it.mt-=dt;
    if(it.dt<=0)spawnFruit();
    else if(it.mt<=0){it.mt=rnd(.6,1);let t;do{t=Math.random()*ND|0}while(t===it.type);it.type=t;it.pop=.6}
  }
}
/* ---------- rede ---------- */
function pack(){
  const it=G.it,o={t:'s',it:[it.kind,it.type,Math.round(it.pop*100)/100,it.by],sc:G.sc,lk:[r1(G.lock[0]*10)/10,r1(G.lock[1]*10)/10],cl:[r1(G.cool[0]*10)/10,r1(G.cool[1]*10)/10],ph:G.phase,cd:G.cd,w:G.winner,ev:G.out};
  G.out=[];return o;
}
function onState(d){
  if(d&&d.t==='q'){ping=Date.now()-d.ts;return}
  if(!d||d.t!=='s'||!G)return;
  const it=G.it;it.kind=d.it[0];it.type=d.it[1];it.pop=d.it[2];it.by=d.it[3];
  G.sc=d.sc;G.lock=d.lk;G.cool=d.cl;G.phase=d.ph;G.cd=d.cd;G.winner=d.w;d.ev.forEach(e=>G.ev.push(e));
}
/* ---------- efeitos ---------- */
function fxStep(dt){
  for(const e of G.ev){
    const p=e[1],a=anim[p];if(!(a.m==='cut'&&a.t<.3&&e[0]!=='i'))a.t=0;a.m=e[0]==='i'?'hit':'cut';
    if(e[0]==='s'){
      bursts.push({p,l:.3});rings.push({p,age:0,k:0});shake=Math.max(shake,6);pulse[p]=1;
      for(let i=0;i<34;i++){const a=rnd(0,6.283),v=rnd(120,520),l=rnd(.45,.95);parts.push({x:CX,y:CY,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l,m:l,g:700,c:i%3?FC[e[2]]:i%2?'#ffffff':'#7fe9ff',s:rnd(3,9)})}
    }else if(e[0]==='i'){
      rings.push({p,age:0,k:1});shake=Math.max(shake,10);
      for(let i=0;i<16;i++){const a=rnd(0,6.283),v=rnd(80,320),l=rnd(.3,.6);parts.push({x:CX,y:CY,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l,m:l,g:0,c:i%2?'#ffd24a':'#ff2d95',s:rnd(3,7)})}
    }
  }
  G.ev=[];
  for(let p=0;p<G.n;p++){
    const a=anim[p];a.t+=dt;let u=0;
    if(a.m==='cut'){const t=a.t;if(t<.12)u=t/.12;else if(t<.28)u=1+(t-.12)/.16;else if(t<.6)u=2*(1-(t-.28)/.32);else a.m=null}
    else if(a.m==='hit'){if(G.lock[p]>0||a.t<.15)u=Math.min(1,a.t/.12);else{a.m='back';a.t=0}}
    if(a.m==='back'){u=1-a.t/.25;if(u<=0){u=0;a.m=null}}
    a.u=u;
  }
  for(const t of trails)t.age+=dt;trails=trails.filter(t=>t.end?t.age<.3:t.age<8);
  for(const b of bursts)b.l-=dt;bursts=bursts.filter(b=>b.l>0);
  for(const p of parts){p.vy+=(p.g||0)*dt;const d=1-Math.min(1,dt*2.2);p.vx*=d;p.vy*=d;p.x+=p.vx*dt;p.y+=p.vy*dt;p.l-=dt}parts=parts.filter(p=>p.l>0);
  const it=G.it;   // estado visual do item: tempo próprio, independente da simulação/rede
  if(it.kind!==vis.k||(it.kind===1&&it.type!==vis.ty)){if((vis.k===1||vis.k===3)&&it.kind!==2&&vis.age>.05)ghosts.push({k:vis.k,ty:vis.ty,age:0});vis.k=it.kind;vis.ty=it.type;vis.age=0}
  else if(it.kind===3&&it.type!==vis.ty){vis.ty=it.type;vis.mo=.25}
  vis.age+=dt;vis.mo=Math.max(0,vis.mo-dt);
  for(const g of ghosts)g.age+=dt;ghosts=ghosts.filter(g=>g.age<.3);
  for(const r of rings)r.age+=dt;rings=rings.filter(r=>r.age<.7);
  shake*=Math.pow(.0005,dt);for(let i=0;i<4;i++)pulse[i]=Math.max(0,pulse[i]-dt*3);
  for(let i=0;i<4;i++){for(const q of hist[i])q.age+=dt;hist[i]=hist[i].filter(q=>q.age<.2)}
}
/* ---------- desenho: frutas ---------- */
function circ(x,y,r,fill,lw){cx.beginPath();cx.arc(x,y,r,0,7);if(fill){cx.fillStyle=fill;cx.fill()}if(lw){cx.lineWidth=lw;cx.strokeStyle=INK;cx.stroke()}}
function dots(r,col,n,seed){cx.fillStyle=col;for(let i=0;i<n;i++){const a=i*2.4+seed,d=r*(.25+.55*((i*37%10)/10));circ(Math.cos(a)*d,Math.sin(a)*d,r*.05,col)}}
function gloss(r){cx.save();cx.beginPath();cx.arc(0,0,r-3,0,7);cx.clip();
  const g=cx.createRadialGradient(-r*.4,-r*.45,r*.05,0,0,r*1.05);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.25,'rgba(255,255,255,.08)');g.addColorStop(.7,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(10,5,40,.5)');
  cx.fillStyle=g;cx.fillRect(-r,-r,2*r,2*r);cx.restore()}
const eob=x=>{const c=1.70158;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
function drawItem(k,ty,sc,al,rot,y){cx.save();cx.globalAlpha=al;cx.translate(CX,y);cx.rotate(rot);(k===1?wholeFruit:decoy)(ty,0,0,R*sc);cx.restore()}
function aura(dk,a){const r=R*(2.1+Math.sin(T/260)*.08),g=cx.createRadialGradient(CX,CY,R*.4,CX,CY,r),c=dk?'255,45,90':'0,229,255';
  g.addColorStop(0,'rgba('+c+','+.28*a+')');g.addColorStop(1,'rgba('+c+',0)');cx.save();cx.shadowBlur=0;cx.fillStyle=g;cx.beginPath();cx.arc(CX,CY,r,0,7);cx.fill();cx.restore()}
function wholeFruit(t,x,y,r){
  cx.save();cx.translate(x,y);cx.lineJoin='round';
  if(t===0){circ(0,0,r,FC[0],8);dots(r,'#e8801a',8,1);
    cx.save();cx.translate(-r*.85,r*.05);cx.rotate(-.35);cx.beginPath();cx.ellipse(0,0,r*.3,r*.15,0,0,7);cx.fillStyle='#46b34a';cx.fill();cx.lineWidth=6;cx.stroke();cx.restore()}
  else if(t===1){circ(0,0,r,FC[1],8);cx.strokeStyle='#c8322d';cx.lineWidth=r*.12;cx.lineCap='round';cx.beginPath();cx.arc(0,0,r*.7,-1.2,-.2);cx.stroke();dots(r,'#c8322d',9,2);
    cx.fillStyle='#c92f2b';cx.lineWidth=6;cx.strokeStyle=INK;cx.beginPath();cx.moveTo(r*.55,r*.7);cx.lineTo(r*.95,r*.55);cx.lineTo(r*.78,r*.8);cx.lineTo(r*.98,r*.9);cx.lineTo(r*.6,r*.98);cx.closePath();cx.fill();cx.stroke()}
  else if(t===2){circ(0,0,r,FC[2],8);cx.strokeStyle='#2e8f45';cx.lineWidth=r*.12;for(const o of[-.55,0,.55]){cx.beginPath();cx.ellipse(o*r,0,r*.16,r*.78,0,0,7);cx.stroke()}
    cx.strokeStyle='#fff8';cx.lineWidth=r*.1;cx.lineCap='round';cx.beginPath();cx.arc(0,0,r*.75,Math.PI*1.1,Math.PI*1.4);cx.stroke()}
  else{circ(0,0,r,FC[3],8);dots(r,'#7fb83f',9,3);
    cx.save();cx.translate(r*.15,-r*.95);cx.rotate(.5);cx.beginPath();cx.ellipse(0,0,r*.3,r*.14,0,0,7);cx.fillStyle='#3fae52';cx.fill();cx.lineWidth=6;cx.stroke();cx.restore()}
  gloss(r);cx.restore();
}
function cutFace(t,x,y,r){
  cx.save();cx.translate(x,y);cx.lineJoin='round';cx.lineCap='round';
  const spokes=(n,a,b,col,lw)=>{cx.strokeStyle=col;cx.lineWidth=lw;for(let i=0;i<n;i++){const an=i*Math.PI*2/n+.2;cx.beginPath();cx.moveTo(Math.cos(an)*a,Math.sin(an)*a);cx.lineTo(Math.cos(an)*b,Math.sin(an)*b);cx.stroke()}};
  if(t===0){circ(0,0,r,FC[0],8);circ(0,0,r*.84,'#ffc13d');spokes(8,0,r*.84,'#ffe49a',5);circ(0,0,r*.1,'#ffe49a')}
  else if(t===1){circ(0,0,r,'#f9b45c',8);circ(0,0,r*.84,'#e8453c');spokes(3,0,r*.84,'#f9b45c',6);
    cx.fillStyle='#ff8a80';for(let i=0;i<22;i++){const a=i*2.4,d=r*(.2+.55*((i*37%10)/10));circ(Math.cos(a)*d,Math.sin(a)*d,r*.06,'#ff8a80')}}
  else if(t===2){circ(0,0,r,FC[2],8);circ(0,0,r*.88,'#e9f7d8');circ(0,0,r*.78,'#ff5a64');
    for(let i=0;i<8;i++){const a=i*.8+.3,d=r*(.3+.3*(i%2));circ(Math.cos(a)*d,Math.sin(a)*d,r*.06,'#ffe35a')}}
  else{circ(0,0,r,'#8cc63f',8);circ(0,0,r*.84,'#c8ec7a');spokes(8,0,r*.84,'#e6f7b0',5);circ(0,0,r*.1,'#e6f7b0')}
  gloss(r);cx.restore();
}
function decoy(t,x,y,r){
  cx.save();cx.translate(x,y);cx.lineJoin='round';
  circ(0,0,r,t===0?'#e5423a':t===1?'#fd9a2e':t===2?'#3fae52':t===3?'#e5423a':'#8d9bb0',8);
  cx.save();cx.beginPath();cx.arc(0,0,r-3,0,7);cx.clip();
  if(t===0){cx.strokeStyle='#ffc07a';cx.lineWidth=r*.28;for(const a of[.785,-.785]){cx.beginPath();cx.moveTo(-Math.cos(a)*r*1.4,-Math.sin(a)*r*1.4);cx.lineTo(Math.cos(a)*r*1.4,Math.sin(a)*r*1.4);cx.stroke()}
    cx.fillStyle='#fd9a2e';cx.lineWidth=5;cx.strokeStyle=INK;for(const s of[-1,1]){cx.save();cx.rotate(s*.55);cx.beginPath();cx.ellipse(s*r*.28,0,r*.3,r*.2,0,0,7);cx.fill();cx.stroke();cx.restore()}circ(0,0,r*.13,'#ff5a2a')}
  else if(t===1){cx.strokeStyle='#a8582a';cx.lineWidth=r*.24;for(let i=-3;i<=3;i++){cx.beginPath();cx.moveTo(i*r*.5-r,-r);cx.lineTo(i*r*.5+r,r);cx.stroke()}
    circ(0,0,r*.34,'#ffd84a',5);cx.fillStyle='#fff3a0';cx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,d=i%2?r*.1:r*.24;cx.lineTo(Math.cos(a)*d,Math.sin(a)*d)}cx.closePath();cx.fill()}
  else if(t===2){circ(0,0,r*.78,'#e9f8dd',5);cx.fillStyle='#e5423a';cx.lineWidth=5;cx.strokeStyle=INK;for(let i=0;i<5;i++){const a=i*Math.PI*2/5;cx.beginPath();cx.arc(Math.cos(a)*r*.32,Math.sin(a)*r*.32,r*.22,0,7);cx.fill();cx.stroke()}circ(0,0,r*.2,'#ffd84a',5)}
  else if(t===3){cx.fillStyle='#ff9a2e';for(let i=0;i<4;i++){cx.save();cx.rotate(i*Math.PI/2+.5);cx.beginPath();cx.moveTo(0,0);cx.quadraticCurveTo(r*.5,-r*.5,r*1.1,-r*.1);cx.lineTo(r*1.1,r*.3);cx.quadraticCurveTo(r*.5,r*.15,0,0);cx.fill();cx.restore()}circ(0,0,r*.14,'#ffd84a',5)}
  else{const g=cx.createRadialGradient(-r*.35,-r*.35,r*.1,0,0,r);g.addColorStop(0,'#eef3f8');g.addColorStop(.5,'#8d9bb0');g.addColorStop(1,'#3b4558');cx.fillStyle=g;cx.fillRect(-r,-r,2*r,2*r);
    cx.lineWidth=r*.08;cx.strokeStyle='#2a3344';cx.beginPath();cx.arc(0,0,r*.66,0,7);cx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4+.4;circ(Math.cos(a)*r*.82,Math.sin(a)*r*.82,r*.05,'#1d2433')}}
  cx.restore();gloss(r);
  cx.restore();
}
const shadow=(x,y,r)=>circ(x+52,y+50,r*.98,'rgba(0,0,0,.22)');
/* ---------- desenho: espadas ---------- */
const POSE={rest:[550,926,-2.47],hit:[252,780,-2.22],thr:[396,815,-1.08]};   // posição do cabo e ângulo (jogador de baixo)
const lerp=(a,b,t)=>a+(b-a)*t,sm=x=>x*x*(3-2*x);
function pose(u){const A=u<=1?POSE.rest:POSE.hit,B=u<=1?POSE.hit:POSE.thr,t=sm(Math.min(1,u<=1?u:u-1));return[lerp(A[0],B[0],t),lerp(A[1],B[1],t)+CY-585,lerp(A[2],B[2],t)]}
function blade(col){
  cx.lineJoin='round';cx.lineCap='round';
  cx.strokeStyle=INK;cx.lineWidth=20;cx.beginPath();cx.moveTo(-40,0);cx.lineTo(34,0);cx.stroke();cx.strokeStyle=col;cx.lineWidth=9;cx.stroke();
  cx.beginPath();cx.arc(30,0,26,Math.PI/2,Math.PI*1.5);cx.strokeStyle=INK;cx.lineWidth=18;cx.stroke();cx.strokeStyle=col;cx.lineWidth=8;cx.stroke();
  cx.beginPath();cx.moveTo(40,-18);cx.bezierCurveTo(L*.35,-22,L*.72,-36,L,-54);cx.bezierCurveTo(L*.8,-2,L*.45,20,40,22);cx.closePath();
  {const gg=cx.createLinearGradient(40,0,L,0);gg.addColorStop(0,'#ffffff');gg.addColorStop(1,'#a6ecff');cx.fillStyle=gg}cx.fill();cx.strokeStyle=INK;cx.lineWidth=8;cx.stroke();
  cx.strokeStyle='#c0d0d8';cx.lineWidth=10;cx.beginPath();cx.moveTo(52,8);cx.bezierCurveTo(L*.4,10,L*.7,-8,L*.92,-38);cx.stroke();
}
function placeS(s){if(s===0){cx.translate(W,H);cx.rotate(Math.PI)}else if(s===2){cx.translate(0,H);cx.scale(1,-1)}else if(s===3){cx.translate(W,0);cx.scale(-1,1)}}
function placeH(s){s=+s;if(s===1){cx.translate(W,H);cx.rotate(Math.PI)}else if(s===2){cx.translate(W,0);cx.scale(-1,1)}else if(s===3){cx.translate(0,H);cx.scale(1,-1)}}
function sword(p,top){
  const a=anim[p];let [x,y,an]=pose(a.u);const col=COLS[p];
  if(a.u<.01){y+=Math.sin(T/380+p*2)*5;an+=Math.sin(T/520+p)*.025}   // respiração em repouso
  const co=Math.cos(an),si=Math.sin(an),h=hist[p];
  if(a.u>.02){h.unshift({a:[x+co*110,y+si*110],b:[x+co*L+si*30,y+si*L-co*30],age:0});if(h.length>24)h.pop()}
  cx.save();
  placeS(p);
  if(h.length>1){cx.save();cx.globalCompositeOperation='lighter';cx.shadowBlur=0;cx.fillStyle=col;
    for(let i=0;i<h.length-1;i++){const q=h[i],n=h[i+1];cx.globalAlpha=Math.max(0,1-q.age/.2)*.55;cx.beginPath();cx.moveTo(q.a[0],q.a[1]);cx.lineTo(q.b[0],q.b[1]);cx.lineTo(n.b[0],n.b[1]);cx.lineTo(n.a[0],n.a[1]);cx.closePath();cx.fill()}
    cx.restore()}
  cx.translate(x,y);cx.rotate(an);blade(col);
  cx.restore();
}
/* ---------- desenho: fundo e HUD em estilo tecnológico ---------- */
function bg(){
  cx.fillStyle='#050816';cx.fillRect(-24,-24,W+48,H+48);
  const g=cx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0a1030');g.addColorStop(.5,'#0e1a52');g.addColorStop(1,'#080c24');cx.fillStyle=g;cx.fillRect(0,0,W,H);
  cx.strokeStyle='rgba(0,229,255,.08)';cx.lineWidth=1;cx.beginPath();
  for(let x=0;x<=W;x+=54){cx.moveTo(x,0);cx.lineTo(x,H)}
  const off=(T/50)%54;for(let y=off-54;y<=H;y+=54){cx.moveTo(0,y);cx.lineTo(W,y)}cx.stroke();
  for(const m of motes){const y=((m.y*H-T*m.v*.03)%H+H)%H;cx.fillStyle='rgba(127,233,255,'+(.25+.35*Math.sin(T/600+m.f)).toFixed(2)+')';cx.fillRect(m.x*W,y,m.s,m.s)}
  const sy=(T/5)%(H+240)-120,sg=cx.createLinearGradient(0,sy-60,0,sy+60);sg.addColorStop(0,'rgba(0,229,255,0)');sg.addColorStop(.5,'rgba(0,229,255,.07)');sg.addColorStop(1,'rgba(0,229,255,0)');cx.fillStyle=sg;cx.fillRect(0,sy-60,W,120);
  cx.save();cx.translate(CX,CY);const br=1+Math.sin(T/500)*.015;
  cx.shadowColor='#00e5ff';cx.shadowBlur=18;cx.strokeStyle='rgba(0,229,255,.45)';cx.lineWidth=3;cx.beginPath();cx.arc(0,0,128*br,0,7);cx.stroke();
  cx.shadowColor='#ff2d95';cx.strokeStyle='rgba(255,45,149,.5)';cx.lineWidth=4;cx.setLineDash([26,18]);cx.lineDashOffset=-T/25;cx.beginPath();cx.arc(0,0,146,0,7);cx.stroke();
  cx.shadowBlur=0;cx.strokeStyle='rgba(0,229,255,.28)';cx.lineWidth=9;cx.setLineDash([2,14]);cx.lineDashOffset=T/40;cx.beginPath();cx.arc(0,0,170,0,7);cx.stroke();cx.setLineDash([]);
  cx.strokeStyle='rgba(0,229,255,.18)';cx.lineWidth=2;cx.beginPath();cx.moveTo(-W/2,0);cx.lineTo(-190,0);cx.moveTo(190,0);cx.lineTo(W/2,0);cx.stroke();
  for(const r of rings){const k=r.age/.7,c=r.k?'#ffd24a':COLS[r.p];cx.globalAlpha=(1-k)*.9;cx.strokeStyle=c;cx.shadowColor=c;cx.shadowBlur=20;cx.lineWidth=6*(1-k)+1;cx.beginPath();cx.arc(0,0,120+k*k*260+k*60,0,7);cx.stroke()}
  cx.restore();
  const vg=cx.createRadialGradient(CX,CY,Math.min(W,H)*.35,CX,CY,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(2,4,16,.65)');cx.fillStyle=vg;cx.fillRect(0,0,W,H);
}
function glowCorner(x,y,col){const g=cx.createRadialGradient(x,y,0,x,y,420);g.addColorStop(0,col+'55');g.addColorStop(1,col+'00');cx.fillStyle=g;cx.fillRect(0,0,W,H)}
function corner(bottom,col,gray,score,digitRot,frac,fcol,pl){
  cx.save();
  placeH(bottom);
  const c=gray?'#5b6478':col;cx.lineJoin='round';
  cx.shadowColor=c;cx.shadowBlur=16;
  cx.fillStyle='rgba(6,10,30,.92)';cx.strokeStyle=c;cx.lineWidth=4;
  cx.beginPath();cx.moveTo(0,0);cx.lineTo(236,0);cx.lineTo(196,112);cx.lineTo(0,112);cx.closePath();cx.fill();cx.stroke();
  cx.shadowBlur=gray?3:14+6*Math.sin(T/160);circ(54,50,20,gray?'#38405a':col);cx.shadowBlur=0;                  // luz de estado: acesa = pronto, apagada = recarregando/travado
  cx.strokeStyle=gray?'#6b7690':'#ffffffaa';cx.lineWidth=3;cx.beginPath();cx.arc(54,50,12,Math.PI*1.05,Math.PI*1.6);cx.stroke();
  cx.save();cx.translate(150,52);cx.rotate((digitRot?Math.PI:0)+(LAND?Math.PI/2:0));cx.scale(1+pl*.45,1+pl*.45);if(+bottom===2)cx.scale(-1,1);if(+bottom===3)cx.scale(1,-1);cx.shadowColor=col;cx.shadowBlur=14;cx.fillStyle=col;cx.font='900 54px Orbitron,Arial,sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(score,0,0);cx.restore();
  cx.fillStyle='#0b1130';cx.beginPath();cx.roundRect(24,86,150,10,5);cx.fill();
  if(frac>0){cx.fillStyle=fcol;cx.shadowColor=fcol;cx.shadowBlur=10;cx.beginPath();cx.roundRect(24,86,Math.max(10,150*frac),10,5);cx.fill()}
  cx.restore();
}
function draw(){
  const k=Math.min(3,Math.max(1,cv.clientWidth*(devicePixelRatio||1)/(LAND?H:W))),cw=Math.round((LAND?H:W)*k),ch=Math.round((LAND?W:H)*k);if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch}
  if(LAND)cx.setTransform(0,-k,k,0,0,W*k);else cx.setTransform(k,0,0,k,0,0);
  if(shake>.4)cx.translate(rnd(-shake,shake),rnd(-shake,shake));   // deitado: arena girada 90°
  bg();
  if(G.n>2){cx.save();cx.strokeStyle='rgba(0,229,255,.14)';cx.lineWidth=2;cx.setLineDash([10,14]);cx.beginPath();cx.moveTo(CX,0);cx.lineTo(CX,H);cx.stroke();cx.restore()}
  const m=me(),t=1-m,l2=G.mode==='local2',it=G.it;
  const colT=m?BLUE:RED,colB=m?RED:BLUE;   // cor de quem está em cima / embaixo
  glowCorner(0,0,colT);glowCorner(W,H,colB);if(G.n>2){glowCorner(W,0,COLS[2]);if(G.n>3)glowCorner(0,H,COLS[3])}
  const gr=p=>G.lock[p]>0||G.cool[p]>0;
  // itens
  const bob=Math.sin(T/420)*5,spin=Math.sin(T/700)*.06;
  cx.save();cx.shadowColor='rgba(120,240,255,.5)';cx.shadowBlur=14;
  if(it.kind===1||it.kind===3){
    const e=Math.min(1,vis.age/.38),s=Math.max(.02,eob(e))*(1+vis.mo*.6);
    aura(it.kind===3,Math.min(1,vis.age/.2));
    drawItem(it.kind,it.type,s,Math.min(1,vis.age/.12),spin-(1-e)*.7+(vis.mo>0?Math.sin(T/20)*.12:0),CY+bob);
  }else if(it.kind===2){
    const age=vis.age,e=Math.min(1,age/.22),sl=G.n>2?it.by:(it.by===m?1:0),SX=[-1,1,1,-1][sl],SY=[-1,1,-1,1][sl],dir=SX,al=Math.max(0,Math.min(1,(SHOW-age)/.25)),off=Math.min(240,Math.max(120,CY-210));
    for(const b of bursts){const rr=R*(1.5+.4*(1-b.l/.3)),c=COLS[b.p];cx.save();cx.globalAlpha=Math.max(0,b.l/.3)*.7;cx.fillStyle=c;cx.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,d=i%2?rr*.7:rr;cx.lineTo(CX+Math.cos(a)*d,CY+Math.sin(a)*d)}cx.closePath();cx.fill();cx.restore()}
    cx.globalAlpha=al;
    const sc=1+.1*Math.sin(Math.min(1,age/.3)*Math.PI);cx.save();cx.translate(CX,CY);cx.scale(sc,sc);cutFace(it.type,0,0,R);cx.restore();
    for(let j=3;j>=0;j--){const ej=1-Math.pow(1-Math.max(0,e-j*.1),3);cx.save();cx.globalAlpha=al*(j?.16:1);cx.translate(CX+(G.n>2?-SX*120:SX*55)*ej,CY-SY*off*ej);cx.rotate(dir*ej*1.1);wholeFruit(it.type,0,0,R);cx.restore()}
    const sp=Math.min(1,age/.12),sa=Math.max(0,1-age/.3);
    if(sa>0){const c=COLS[it.by],x0=CX-dir*R*1.6,y0=CY+dir*R*1.6;cx.save();cx.globalAlpha=sa;cx.strokeStyle='#fff';cx.shadowColor=c;cx.shadowBlur=24;cx.lineWidth=8*sa+2;cx.lineCap='round';cx.beginPath();cx.moveTo(x0,y0);cx.lineTo(x0+(CX+dir*R*1.6-x0)*sp,y0+(CY-dir*R*1.6-y0)*sp);cx.stroke();cx.restore()}
  }
  for(const g of ghosts){const e=g.age/.3;drawItem(g.k,g.ty,1-.5*e,1-e,spin+e*.9,CY+bob)}
  cx.restore();
  cx.save();cx.shadowBlur=18;for(let p=0;p<G.n;p++){cx.shadowColor=COLS[p];sword(p)}cx.restore();
  cx.save();cx.globalCompositeOperation='lighter';parts.forEach(p=>{const k=Math.max(0,Math.min(1,p.l/(p.m||.7)));cx.globalAlpha=Math.min(1,k*1.6);cx.fillStyle=p.c;cx.beginPath();cx.arc(p.x,p.y,Math.max(.5,p.s*(.4+.6*k)),0,7);cx.fill()});cx.restore();
  cx.globalAlpha=1;
  for(const tr of trails){   // rastro do dedo / toque
    const c=COLS[tr.p],al=tr.end?Math.max(0,1-tr.age/.3):1;cx.save();cx.globalAlpha=al;cx.strokeStyle=c;cx.shadowColor=c;cx.shadowBlur=16;cx.lineCap='round';cx.lineJoin='round';cx.lineWidth=9;
    if(tr.pts.length>1){cx.beginPath();tr.pts.forEach((q,i)=>i?cx.lineTo(q.x,q.y):cx.moveTo(q.x,q.y));cx.stroke()}
    cx.globalAlpha=al*Math.max(0,1-tr.age*2.5);cx.lineWidth=5;cx.beginPath();cx.arc(tr.pts[0].x,tr.pts[0].y,18+tr.age*220,0,7);cx.stroke();cx.restore()}
  const fr=p=>G.lock[p]>0?G.lock[p]/LOCK:G.cool[p]/COOL,fc=p=>G.lock[p]>0?'#ffd24a':'#7fe9ff';
  if(G.n>2){for(let p=0;p<G.n;p++)corner(p,COLS[p],gr(p),G.sc[p],p!==3,fr(p),fc(p),pulse[p]);return}
  corner(false,colT,gr(t),G.sc[t],l2&&!LAND,fr(t),fc(t),pulse[t]);
  corner(true,colB,gr(m),G.sc[m],true,fr(m),fc(m),pulse[m]);
}
function hud(){
  let n=G.phase==='count'?String(Math.ceil(G.cd)):'';
  if(G.phase==='count')G.wc=1;else if(G.wc){G.wc=0;goT=T+700}
  if(!n&&T<goT)n='GO!';
  const bg_=$('big');if(bg_.textContent!==n){bg_.textContent=n;if(n){bg_.classList.remove('pop');void bg_.offsetWidth;bg_.classList.add('pop')}}
  $('hint').classList.toggle('on',G.phase==='count');
  $('ping').textContent=G.mode==='guest'&&ping?ping+' ms':'';
  const l2=G.mode==='local2',m=me(),ov=$('over');
  if(G.phase==='over'){
    $('winner').textContent=(l2||G.n>2)?['🔵 Azul','🔴 Vermelho','🟢 Verde','🟣 Roxo'][G.winner]+' venceu!':(G.winner===m?'🏆 Você venceu!':'😵 Você perdeu!');ov.classList.add('on')}
  else ov.classList.remove('on');
}
$('bAgain').onclick=()=>start(G.mode);

/* ---------- controles: toque (ou deslize) em qualquer ponto da tela ----------
   1 jogador / online: a tela inteira corta. 2 jogadores no mesmo aparelho: cada um toca na sua metade. */
function tap(p){
  if(!G||!run)return;
  if(G.mode==='guest'){if(conn&&conn.open){conn.send({t:'cut'});const a=anim[0];if(G.lock[0]<=0&&G.cool[0]<=0&&!a.m){a.m='cut';a.t=0}}}   // convidado: o golpe aparece na hora, o resultado vem do anfitrião
  else cut(p);
}
function toLogical(e){
  const r=$('stage').getBoundingClientRect(),u=(e.clientX-r.left)/r.width,v=(e.clientY-r.top)/r.height;
  return LAND?{x:W-v*W,y:u*H}:{x:u*W,y:v*H};
}
const pad=$('pad');
pad.addEventListener('pointerdown',e=>{
  e.preventDefault();if(!G||!run)return;
  const q=toLogical(e),p=G.mode==='local2'?(q.y<H/2?0:1):G.n>2?(q.x<CX?(q.y<CY?0:3):(q.y<CY?2:1)):me();
  try{pad.setPointerCapture(e.pointerId)}catch(_){}
  const tr={p,pts:[q],age:0,end:false};trails.push(tr);act[e.pointerId]=tr;
  tap(p);
});
pad.addEventListener('pointermove',e=>{const tr=act[e.pointerId];if(!tr)return;tr.pts.push(toLogical(e));if(tr.pts.length>14)tr.pts.shift()});
const rel=e=>{const tr=act[e.pointerId];if(tr){tr.end=true;tr.age=0;delete act[e.pointerId]}};
pad.addEventListener('pointerup',rel);pad.addEventListener('pointercancel',rel);
pad.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(e.repeat||!G)return;const k=e.key.length===1?e.key.toLowerCase():e.key;
  if(k===' '||k==='l'||k==='ArrowDown'||k==='Enter'){e.preventDefault();tap(me())}
  else if((k==='a'||k==='w')&&G.mode==='local2')tap(0);
  else if(G.n>2&&k.length===1&&'1234'.includes(k)&&+k<=G.n)tap(+k-1);
  else if(k==='Escape')quit();
});

$('bCopy').onclick=()=>{const u=location.origin+location.pathname+'?sala='+$('roomCode').textContent;
  if(navigator.share){navigator.share({title:'Batalha Frutífera',text:'Entre na minha sala!',url:u}).catch(()=>{});return}
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{$('lobMsg').textContent='Link copiado! Envie para seu amigo.'}).catch(()=>prompt('Copie o link:',u))};
const q=new URLSearchParams(location.search).get('sala');
if(q){show('online');$('code').value=q.toUpperCase().slice(0,4);$('onMsg').textContent='Toque em "Entrar na sala".'}
