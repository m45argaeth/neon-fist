/* =====================================================================
   NEON FIST — pixel-art HTML5 fighting game (Tekken/SF vibe)
   Pure vanilla JS. No assets. Procedural pixel sprites + WebAudio SFX.
   Internal resolution 480x270, CSS-upscaled with pixelation.
   ===================================================================== */
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = cv.width, H = cv.height;          // 480 x 270
  const FLOOR = H - 44;                        // ground line

  // ===================== AUDIO (synth SFX) =====================
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null, muted = false;
  function aInit(){ try{ if(!actx && AC) actx = new AC(); if(actx && actx.state==='suspended') actx.resume(); }catch(e){} }
  function tone(freq,dur,type,vol,slide){
    if(!actx || muted) return;
    const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,slide),t+dur);
    g.gain.setValueAtTime(vol||0.15,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t+dur+0.03);
  }
  function noise(dur,vol,freq){
    if(!actx || muted) return;
    const t=actx.currentTime, n=Math.floor(actx.sampleRate*dur);
    const b=actx.createBuffer(1,n,actx.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=actx.createBufferSource(); s.buffer=b;
    const g=actx.createGain(); g.gain.setValueAtTime(vol||0.2,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    const f=actx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq||900;
    s.connect(f).connect(g).connect(actx.destination); s.start(t);
  }
  const sfx = {
    punch(){ tone(300,0.07,'square',0.14,170); },
    kick(){ tone(210,0.12,'square',0.17,90); noise(0.05,0.08,500); },
    hit(){ noise(0.14,0.26,700); tone(120,0.12,'sawtooth',0.12,60); },
    block(){ tone(720,0.05,'square',0.12); noise(0.05,0.1,1500); },
    special(){ tone(180,0.34,'sawtooth',0.2,760); },
    jump(){ tone(420,0.09,'square',0.1,720); },
    ko(){ tone(300,0.6,'sawtooth',0.26,55); noise(0.5,0.2,400); },
    round(){ tone(520,0.1,'square',0.18); setTimeout(()=>tone(700,0.13,'square',0.18),130); },
    ui(){ tone(620,0.05,'square',0.12,820); },
  };

  // ===================== INPUT =====================
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true; aInit();
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') { toggleMute(); }
    if (e.code === 'KeyT' && game.state==='title' && !isTouch) { game.twoPlayer=!game.twoPlayer; sfx.ui(); }
    if (e.code === 'Enter') {
      if (game.state==='title') gotoSelect();
      else if (game.state==='select') confirmSelect();
      else if (game.state==='over') gotoSelect();
    }
    if (game.state==='title' && ['KeyF','KeyG','KeyH','Space'].includes(e.code)) gotoSelect();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  const muteBtn = document.getElementById('mute');
  function toggleMute(){ muted=!muted; aInit(); if(muteBtn) muteBtn.textContent = muted?'\uD83D\uDD07':'\uD83D\uDD0A'; }
  if(muteBtn) muteBtn.addEventListener('click', ()=>{ toggleMute(); });

  // ----- mobile / touch -----
  const isTouch = window.matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window);
  if (isTouch) {
    document.body.classList.add('touch');
    document.querySelectorAll('#touch [data-k]').forEach(btn => {
      const k = btn.getAttribute('data-k');
      const down = e => { e.preventDefault(); aInit(); btn.classList.add('on'); keys[k]=true; };
      const up   = e => { e.preventDefault(); btn.classList.remove('on'); keys[k]=false; };
      btn.addEventListener('touchstart', down, {passive:false});
      btn.addEventListener('touchend', up, {passive:false});
      btn.addEventListener('touchcancel', up, {passive:false});
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    });
    cv.addEventListener('touchstart', e => {
      aInit();
      if (game.state==='title'){ e.preventDefault(); gotoSelect(); }
      else if (game.state==='select'){ e.preventDefault(); confirmSelect(); }
      else if (game.state==='over'){ e.preventDefault(); gotoSelect(); }
    }, {passive:false});
  }

  // ===================== HELPERS =====================
  const clamp=(v,a,b)=> v<a?a:v>b?b:v;
  const rand=(a,b)=> a+Math.random()*(b-a);
  const aabb=(a,b)=> a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;

  function px(x,y,w,h,fill,outline){
    x=Math.round(x); y=Math.round(y);
    if(outline){ ctx.fillStyle=outline; ctx.fillRect(x-1,y-1,w+2,h+2); }
    ctx.fillStyle=fill; ctx.fillRect(x,y,w,h);
  }
  function limb(x1,y1,x2,y2,wd,fill,outline){
    const a=Math.atan2(y2-y1,x2-x1), len=Math.hypot(x2-x1,y2-y1)+wd*0.4;
    ctx.save(); ctx.translate(x1,y1); ctx.rotate(a);
    if(outline){ ctx.fillStyle=outline; ctx.fillRect(-1,-wd/2-1,len+2,wd+2); }
    ctx.fillStyle=fill; ctx.fillRect(0,-wd/2,len,wd);
    ctx.restore();
  }

  // ===================== CHARACTERS =====================
  const CHARS = [
    { name:'NEON',  accent:'#00e5ff', spd:1.00, pow:1.00, jmp:1.00,
      pal:{ line:'#08111a', skin:'#f4c89a', suit:'#eef3ff', suit2:'#1b6dff', band:'#1b6dff', hair:'#23314a', glove:'#d23a3a', accent:'#00e5ff' } },
    { name:'BLAZE', accent:'#ff5a3c', spd:0.94, pow:1.14, jmp:0.94,
      pal:{ line:'#1a0808', skin:'#e8b07e', suit:'#ff5a3c', suit2:'#ffd23c', band:'#ffd23c', hair:'#2a1411', glove:'#7a1414', accent:'#ff5a3c' } },
    { name:'VOLT',  accent:'#ffe23c', spd:1.16, pow:0.90, jmp:1.10,
      pal:{ line:'#14140a', skin:'#f4c89a', suit:'#2b2b33', suit2:'#ffe23c', band:'#ffe23c', hair:'#ffe23c', glove:'#2b2b33', accent:'#ffe23c' } },
    { name:'TOXIN', accent:'#5dff8f', spd:1.06, pow:1.00, jmp:1.05,
      pal:{ line:'#06140c', skin:'#cdb59a', suit:'#1f7a45', suit2:'#0c1f14', band:'#5dff8f', hair:'#0c1f14', glove:'#0c1f14', accent:'#5dff8f' } },
  ];

  // ===================== SPRITE =====================
  function drawShadow(cx,F){ ctx.globalAlpha=.3; ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(cx,F+2,15,4,0,0,7); ctx.fill(); ctx.globalAlpha=1; }

  function legDraw(x1,y1,x2,y2,P){ limb(x1,y1,x2,y2,5,P.suit2,P.line); px(x2-3,y2-2,6,3,P.line); }
  function armDraw(x1,y1,x2,y2,P){ limb(x1,y1,x2,y2,4,P.suit,P.line); px(x2-3,y2-3,6,6,P.glove,P.line); }

  function spriteDraw(cx,F,pal,dir,pose,animT,special,white){
    const P = white ? { line:pal.line, skin:'#fff', suit:'#fff', suit2:'#fff', band:'#fff', hair:'#fff', glove:'#fff', accent:pal.accent } : pal;
    const bob = pose==='idle' ? Math.sin(animT*0.12)*1 : pose==='walk' ? -Math.abs(Math.sin(animT*0.3)) : 0;
    const hipY=F-24, shoulderY=F-40, headCy=F-48;
    const lean = pose==='hurt' ? -dir*3 : 0;
    // legs
    let bx=cx-dir*5, fx=cx+dir*5, by=F, fy=F;
    if(pose==='walk'){ const s=Math.sin(animT*0.3)*5; fx=cx+dir*(4+s); bx=cx-dir*(4-s); }
    else if(pose==='kick'){ fx=cx+dir*18; fy=F-14; bx=cx-dir*6; }
    else if(pose==='air'){ by=F-6; fy=F-10; bx=cx-dir*3; fx=cx+dir*7; }
    else if(pose==='block'){ bx=cx-dir*7; fx=cx+dir*3; }
    legDraw(cx-dir*2, hipY+bob, bx, by, P);
    legDraw(cx+dir*2, hipY+bob, fx, fy, P);
    // torso
    px((cx+lean)-7, shoulderY+bob, 14, (hipY-shoulderY)+6, P.suit, P.line);
    px((cx+lean)-7, hipY+bob-1, 14, 3, P.suit2);
    // arms
    const shx=cx+lean, shy=shoulderY+3+bob;
    if(pose==='block'){ armDraw(shx,shy, shx+dir*6, shoulderY+1+bob, P); armDraw(shx,shy, shx+dir*7, shoulderY+9+bob, P); }
    else if(pose==='punch'){ armDraw(shx,shy, shx-dir*7, hipY-1, P); armDraw(shx,shy, shx+dir*20, shoulderY+4+bob, P); }
    else if(pose==='kick'){ armDraw(shx,shy, shx-dir*5, hipY-3, P); armDraw(shx,shy, shx+dir*5, hipY-5, P); }
    else if(pose==='air'){ armDraw(shx,shy, shx-dir*8, shoulderY+2, P); armDraw(shx,shy, shx+dir*8, shoulderY+1, P); }
    else if(pose==='hurt'){ armDraw(shx,shy, shx-dir*7, shoulderY-2, P); armDraw(shx,shy, shx+dir*4, shoulderY-3, P); }
    else { const sw=Math.sin(animT*0.12)*2; armDraw(shx,shy, shx-dir*7, hipY-3+sw, P); armDraw(shx,shy, shx+dir*8, hipY-5-sw, P); }
    // head
    const hx=cx+lean, hy=headCy+bob;
    px(hx-5, hy-5, 11, 11, P.skin, P.line);
    px(hx-dir*8, hy-5, 4, 2, P.band);
    px(hx-6, hy-6, 13, 3, P.band);
    px(hx-5, hy-8, 11, 3, P.hair);
    if(!white) px(hx+dir*1, hy-1, 2, 3, '#15202b');
    // special-ready aura
    if(special>=100 && !white){ ctx.globalAlpha=0.35+0.25*Math.sin(animT*0.4);
      ctx.strokeStyle=pal.accent; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(cx,F-22,24,0,7); ctx.stroke(); ctx.globalAlpha=1; }
  }

  // ===================== PROJECTILES / PARTICLES =====================
  const shots=[], fx=[];
  function spark(x,y,color,n=8){ for(let i=0;i<n;i++) fx.push({x,y,vx:rand(-2.2,2.2),vy:rand(-2.6,0.6),life:rand(12,26),color,r:rand(1,2.6)}); }
  function updateFx(){ for(let i=fx.length-1;i>=0;i--){ const p=fx[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.16; p.life--; if(p.life<=0) fx.splice(i,1); } }
  function drawFx(){ fx.forEach(p=>{ ctx.globalAlpha=clamp(p.life/26,0,1); px(p.x,p.y,Math.ceil(p.r),Math.ceil(p.r),p.color); }); ctx.globalAlpha=1; }

  // ===================== FIGHTER =====================
  class Fighter {
    constructor(x,char,facing){
      this.x=x; this.w=26; this.h=56; this.y=FLOOR-this.h;
      this.vx=0; this.vy=0; this.facing=facing;
      this.char=char; this.pal=char.pal; this.accent=char.accent; this.name=char.name;
      this.pow=char.pow; this.spd=char.spd; this.jmp=char.jmp;
      this.hp=100; this.maxhp=100; this.onGround=true;
      this.attack=null; this.attackT=0; this.cooldown=0;
      this.blocking=false; this.hitstun=0; this.special=0; this.wins=0;
      this.flash=0; this.animT=0; this.attackId=0; this._lastId=-1;
    }
    reset(x){ this.x=x; this.y=FLOOR-this.h; this.vx=0; this.vy=0; this.hp=100;
      this.attack=null; this.attackT=0; this.cooldown=0; this.hitstun=0; this.blocking=false; this.special=0; this.flash=0; }
    get cx(){ return this.x+this.w/2; }
    tryJump(){ if(this.onGround && this.hitstun<=0){ this.vy=-9.2*this.jmp; this.onGround=false; sfx.jump(); } }
    startAttack(type){
      if(this.cooldown>0 || this.attack || this.hitstun>0) return;
      if(type==='special' && this.special<100) return;
      this.attack=type;
      this.attackT = type==='punch'?14: type==='kick'?20: 26;
      this.cooldown = type==='punch'?20: type==='kick'?28: 50;
      this.attackId++;
      if(type==='punch') sfx.punch();
      else if(type==='kick') sfx.kick();
      else if(type==='special'){ this.special=0; sfx.special();
        shots.push({ x:this.cx+this.facing*12, y:this.y+22, vx:this.facing*4.6, w:14, h:11, owner:this, color:this.accent, life:80 });
        spark(this.cx+this.facing*12, this.y+24, this.accent, 12);
      }
    }
    hitbox(){
      if(!this.attack || this.attack==='special') return null;
      const reach=this.attack==='kick'?28:22;
      const hy=this.attack==='kick'? this.y+30 : this.y+18;
      const t=this.attackT, active=this.attack==='punch'?(t<10&&t>3):(t<14&&t>5);
      if(!active) return null;
      return { x:this.facing>0?this.x+this.w:this.x-reach, y:hy, w:reach, h:13,
        dmg:(this.attack==='kick'?11:7)*this.pow, kb:this.attack==='kick'?3.8:2.6 };
    }
    update(opp){
      this.animT++;
      if(this.flash>0) this.flash--;
      if(this.cooldown>0) this.cooldown--;
      if(this.attackT>0){ this.attackT--; if(this.attackT===0) this.attack=null; }
      if(this.hitstun>0) this.hitstun--;
      if(!this.attack && this.onGround) this.facing = opp.cx>this.cx?1:-1;
      this.vy+=0.5; this.y+=this.vy;
      if(this.y>=FLOOR-this.h){ this.y=FLOOR-this.h; this.vy=0; this.onGround=true; } else this.onGround=false;
      this.x+=this.vx; this.vx*= this.onGround?0.72:0.93;
      this.x=clamp(this.x,6,W-this.w-6);
      this.special=clamp(this.special+0.1,0,100);
    }
    takeHit(dmg,kb,dir){
      if(this.blocking){ dmg*=0.2; kb*=0.4; sfx.block(); spark(this.cx,this.y+24,'#8fefff',6); }
      else { sfx.hit(); spark(this.cx,this.y+24,'#fff',12); this.hitstun=16; this.flash=8; }
      this.hp=clamp(this.hp-dmg,0,this.maxhp);
      this.vx+=dir*kb; this.vy-=1.4; this.special=clamp(this.special+6,0,100); game.shake=4;
    }
    pose(){
      if(this.hitstun>0) return 'hurt';
      if(!this.onGround) return 'air';
      if(this.attack==='punch'||this.attack==='special') return 'punch';
      if(this.attack==='kick') return 'kick';
      if(this.blocking) return 'block';
      if(Math.abs(this.vx)>0.45) return 'walk';
      return 'idle';
    }
    draw(){ drawShadow(this.cx,this.y+this.h);
      const white=this.flash>0 && ((this.flash>>1)&1)===1;
      spriteDraw(this.cx,this.y+this.h,this.pal,this.facing,this.pose(),this.animT,this.special,white);
    }
  }

  // ===================== GAME STATE =====================
  const game = { state:'title', timer:99, tick:0, shake:0, round:1, twoPlayer:false, msg:'', msgT:0,
    sel:{ p1:0, p2:1, turn:'p1' } };
  let p1=null, p2=null;
  let mPrev={};

  function gotoSelect(){ game.state='select'; game.sel={ p1:0, p2:1, turn:'p1' }; mPrev={}; sfx.ui(); }
  function confirmSelect(){ sfx.ui();
    if(game.sel.turn==='p1' && game.twoPlayer && !isTouch){ game.sel.turn='p2'; return; }
    startMatch();
  }
  function startMatch(){
    if(isTouch) game.twoPlayer=false;
    const i1=game.sel.p1;
    const i2 = (game.twoPlayer && !isTouch) ? game.sel.p2
      : (i1 + 1 + Math.floor(Math.random()*(CHARS.length-1))) % CHARS.length;
    p1=new Fighter(110, CHARS[i1], 1);
    p2=new Fighter(W-110-26, CHARS[i2], -1);
    game.state='fight'; game.timer=99; game.tick=0; game.round=1;
    game.msg='ROUND 1'; game.msgT=90; shots.length=0; fx.length=0; sfx.round();
  }
  function nextRound(winner){
    winner.wins++;
    if(winner.wins>=2){ game.state='over'; game.msg=winner.name+' WINS!'; game.msgT=99999; sfx.ko(); return; }
    game.round++; p1.reset(110); p2.reset(W-110-26); shots.length=0;
    game.timer=99; game.msg='ROUND '+game.round; game.msgT=90; sfx.round();
  }

  // ===================== CPU AI =====================
  function cpu(self,opp){
    if(self.hitstun>0) return;
    const dist=Math.abs(self.cx-opp.cx), dir=opp.cx>self.cx?1:-1;
    self.blocking=false;
    if(opp.attack && dist<46 && Math.random()<0.5){ self.blocking=true; return; }
    if(self.special>=100 && dist<240 && Math.random()<0.02){ self.startAttack('special'); return; }
    if(dist>60){ self.vx+=dir*0.5*self.spd; if(self.onGround && Math.random()<0.01) self.tryJump(); }
    else if(dist<36){ if(Math.random()<0.06) self.startAttack(Math.random()<0.5?'punch':'kick'); else if(Math.random()<0.02) self.vx-=dir*2; }
    else { self.vx+=dir*0.3*self.spd; if(Math.random()<0.03) self.startAttack('punch'); }
  }
  function handleP1(){
    if(p1.hitstun>0) return;
    p1.blocking=!!keys['KeyS'];
    if(keys['KeyA']) p1.vx-=0.55*p1.spd;
    if(keys['KeyD']) p1.vx+=0.55*p1.spd;
    if(keys['KeyW']) p1.tryJump();
    if(keys['KeyF']) p1.startAttack('punch');
    if(keys['KeyG']) p1.startAttack('kick');
    if(keys['KeyH']) p1.startAttack('special');
  }
  function handleP2(){
    if(p2.hitstun>0) return;
    p2.blocking=!!keys['ArrowDown'];
    if(keys['ArrowLeft']) p2.vx-=0.55*p2.spd;
    if(keys['ArrowRight']) p2.vx+=0.55*p2.spd;
    if(keys['ArrowUp']) p2.tryJump();
    if(keys['KeyK']) p2.startAttack('punch');
    if(keys['KeyL']) p2.startAttack('kick');
    if(keys['Semicolon']) p2.startAttack('special');
  }

  function updateShots(){
    for(let i=shots.length-1;i>=0;i--){ const s=shots[i]; s.x+=s.vx; s.life--;
      const tgt=s.owner===p1?p2:p1, body={x:tgt.x,y:tgt.y,w:tgt.w,h:tgt.h};
      if(aabb(s,body)){ tgt.takeHit(15*s.owner.pow,4.5,Math.sign(s.vx)); spark(s.x,s.y,s.color,16); shots.splice(i,1); continue; }
      if(s.x<-30||s.x>W+30||s.life<=0) shots.splice(i,1);
    }
  }
  function drawShots(){ shots.forEach(s=>{ const cx=s.x+s.w/2, cy=s.y+s.h/2;
    ctx.globalAlpha=0.9; px(cx-7,cy-3,14,6,s.color); px(cx-4,cy-5,8,10,s.color); px(cx-2,cy-2,4,4,'#fff'); ctx.globalAlpha=1; }); }

  // ===================== BACKGROUND =====================
  function drawBg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a0e24'); g.addColorStop(.6,'#160a2b'); g.addColorStop(1,'#04030a');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // moon
    ctx.globalAlpha=.5; px(W-70,28,30,30,'#2a2350'); ctx.globalAlpha=1;
    // skyline back
    ctx.fillStyle='rgba(0,229,255,.10)';
    for(let i=0;i<16;i++){ const bw=W/16, bh=30+((i*53)%60); ctx.fillRect(i*bw,FLOOR-bh,bw-3,bh); }
    ctx.fillStyle='rgba(255,46,136,.09)';
    for(let i=0;i<10;i++){ const bw=W/10, bh=50+((i*97)%80); ctx.fillRect(i*bw+8,FLOOR-bh,bw-12,bh); }
    // grid floor
    ctx.strokeStyle='rgba(0,229,255,.25)'; ctx.lineWidth=1;
    for(let i=0;i<=20;i++){ const x=i*(W/20); ctx.beginPath(); ctx.moveTo(x,FLOOR); ctx.lineTo(W/2+(x-W/2)*3,H); ctx.stroke(); }
    for(let j=0;j<6;j++){ const y=FLOOR+j*j*2+2; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(0,FLOOR,W,H-FLOOR);
  }

  // ===================== HUD =====================
  function bar(x,y,w,hp,max,color,flip){
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(x,y,w,10);
    const pw=Math.round(w*clamp(hp/max,0,1));
    ctx.fillStyle=color; ctx.fillRect(flip?x+w-pw:x,y,pw,10);
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,w-1,9);
  }
  function meter(x,y,w,v,flip){
    ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(x,y,w,3);
    const pw=Math.round(w*clamp(v/100,0,1));
    ctx.fillStyle=v>=100?'#ffe23c':'#ffae00'; ctx.fillRect(flip?x+w-pw:x,y,pw,3);
  }
  function txt(s,x,y,size,color,align){ ctx.textAlign=align||'center'; ctx.font='bold '+size+"px 'Courier New',monospace";
    ctx.fillStyle=color; ctx.fillText(s,x,y); }
  function glow(s,x,y,size,color){ ctx.save(); ctx.shadowBlur=12; ctx.shadowColor=color; txt(s,x,y,size,color,'center'); ctx.restore(); }
  function drawHud(){
    bar(14,16,176,p1.hp,p1.maxhp,'#00e5ff',false);
    bar(W-14-176,16,176,p2.hp,p2.maxhp,'#ff2e88',true);
    meter(14,27,176,p1.special,false);
    meter(W-14-176,27,176,p2.special,true);
    txt(p1.name,14,12,8,'#fff','left'); txt(p2.name,W-14,12,8,'#fff','right');
    txt(Math.ceil(game.timer),W/2,20,16,'#fff','center');
    for(let i=0;i<2;i++){
      ctx.fillStyle=i<p1.wins?'#00e5ff':'rgba(255,255,255,.2)'; ctx.fillRect(W/2-22+i*7,26,5,5);
      ctx.fillStyle=i<p2.wins?'#ff2e88':'rgba(255,255,255,.2)'; ctx.fillRect(W/2+17-i*7,26,5,5);
    }
  }

  // ===================== SCREENS =====================
  function drawTitle(){
    spriteDraw(150,FLOOR,CHARS[0].pal,1,'idle',game.tick,0,false);
    spriteDraw(W-150,FLOOR,CHARS[1].pal,-1,'idle',game.tick,0,false);
    glow('NEON FIST',W/2,90,40,'#00e5ff');
    txt('PIXEL FIGHTER',W/2,110,11,'#ff2e88','center');
    ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
    txt(isTouch?'TAP TO START':'PRESS ENTER',W/2,150,14,'#fff','center'); ctx.globalAlpha=1;
    txt(isTouch?'MODE: 1P vs CPU':('MODE: '+(game.twoPlayer?'2 PLAYERS':'1P vs CPU')+'   (T)'),W/2,168,9,'#7fdfff','center');
  }
  function drawSelect(){
    glow('CHOOSE YOUR FIGHTER',W/2,34,16,'#00e5ff');
    const n=CHARS.length;
    for(let i=0;i<n;i++){
      const cxp=W/2+(i-(n-1)/2)*100;
      const selP1=(game.sel.p1===i), selP2=(game.twoPlayer&&!isTouch&&game.sel.p2===i);
      if(selP1||selP2){ ctx.strokeStyle=selP1?'#00e5ff':'#ff2e88'; ctx.lineWidth=2; ctx.strokeRect(cxp-36,70,72,108); }
      ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(cxp-36,70,72,108);
      spriteDraw(cxp,164,CHARS[i].pal,1,'idle',game.tick+i*20,0,false);
      txt(CHARS[i].name,cxp,186,11,CHARS[i].accent,'center');
      if(selP1) txt('P1',cxp-20,82,9,'#00e5ff','center');
      if(selP2) txt('P2',cxp+20,82,9,'#ff2e88','center');
    }
    const who=(game.twoPlayer&&!isTouch)?(game.sel.turn==='p1'?'P1':'P2'):'P1';
    txt(who+' — '+(isTouch?'◀ ▶ choose · tap to confirm':'A/D choose · F/Enter confirm'),W/2,212,10,'#fff','center');
  }

  // ===================== MAIN LOOP =====================
  function selectMenu(){
    const l1=!!keys['KeyA'], r1=!!keys['KeyD'], c1=!!keys['KeyF'];
    const l2=!!keys['ArrowLeft'], r2=!!keys['ArrowRight'], c2=!!keys['KeyK'];
    const twoTurn=(game.twoPlayer&&!isTouch&&game.sel.turn==='p2');
    const L=twoTurn?l2:l1, R=twoTurn?r2:r1, C=twoTurn?c2:c1;
    const key=twoTurn?'p2':'p1';
    if(L&&!mPrev.L){ game.sel[key]=(game.sel[key]+CHARS.length-1)%CHARS.length; sfx.ui(); }
    if(R&&!mPrev.R){ game.sel[key]=(game.sel[key]+1)%CHARS.length; sfx.ui(); }
    if(C&&!mPrev.C){ confirmSelect(); }
    mPrev={L,R,C};
  }

  function loop(){
    game.tick++;
    ctx.save();
    if(game.shake>0){ ctx.translate(rand(-game.shake,game.shake),rand(-game.shake,game.shake)); game.shake*=0.85; if(game.shake<0.4) game.shake=0; }
    drawBg();

    if(game.state==='fight'){
      if(game.msgT>0) game.msgT--;
      const live=game.msgT<60;
      if(live){
        handleP1();
        if(game.twoPlayer && !isTouch) handleP2(); else cpu(p2,p1);
        p1.update(p2); p2.update(p1);
        const h1=p1.hitbox(); if(h1){ const b={x:p2.x,y:p2.y,w:p2.w,h:p2.h};
          if(aabb(h1,b) && p2._lastId!==p1.attackId){ p2.takeHit(h1.dmg,h1.kb,p1.facing); p2._lastId=p1.attackId; } }
        const h2=p2.hitbox(); if(h2){ const b={x:p1.x,y:p1.y,w:p1.w,h:p1.h};
          if(aabb(h2,b) && p1._lastId!==p2.attackId){ p1.takeHit(h2.dmg,h2.kb,p2.facing); p1._lastId=p2.attackId; } }
        if(aabb({x:p1.x,y:p1.y,w:p1.w,h:p1.h},{x:p2.x,y:p2.y,w:p2.w,h:p2.h})){ const push=p1.cx<p2.cx?-1:1; p1.x+=push*0.7; p2.x-=push*0.7; }
        updateShots();
        game.timer-=1/60;
        if(game.timer<=0){ game.timer=0; if(p1.hp>p2.hp) nextRound(p1); else if(p2.hp>p1.hp) nextRound(p2); else nextRound(p1.wins>=p2.wins?p1:p2); }
        else if(p1.hp<=0) nextRound(p2);
        else if(p2.hp<=0) nextRound(p1);
      } else { p1.update(p2); p2.update(p1); }
      updateFx(); drawShots(); p1.draw(); p2.draw(); drawFx(); drawHud();
      if(game.msgT>0) glow(game.msg,W/2,H/2-10, game.msg.indexOf('WINS')>=0?22:26, '#fff');
    }
    else if(game.state==='title'){ updateFx(); drawTitle(); }
    else if(game.state==='select'){ selectMenu(); drawSelect(); }
    else if(game.state==='over'){ updateFx(); p1.draw(); p2.draw(); drawFx(); drawHud();
      glow(game.msg,W/2,H/2-6,22, game.msg.startsWith(p1.name)?'#00e5ff':'#ff2e88');
      ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
      txt(isTouch?'TAP FOR REMATCH':'PRESS ENTER FOR REMATCH',W/2,H/2+16,12,'#fff','center'); ctx.globalAlpha=1;
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }
  loop();
})();
