/* =====================================================================
   NEON FIST — pixel-art HTML5 fighting game (Tekken-style)
   Vanilla JS. Procedural shaded pixel sprites + WebAudio SFX.
   Internal res 480x270, CSS-upscaled with pixelation.
   Features: combos + juggle (air combos), launcher, throw, Rage mode,
   chip damage, round stars, announcer text.
   ===================================================================== */
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = cv.width, H = cv.height;            // 480 x 270
  const FLOOR = H - 40;

  // ===================== AUDIO =====================
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null, muted = false;
  function aInit(){ try{ if(!actx && AC) actx=new AC(); if(actx&&actx.state==='suspended') actx.resume(); }catch(e){} }
  function tone(freq,dur,type,vol,slide){
    if(!actx||muted) return;
    const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();
    o.type=type||'square'; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,slide),t+dur);
    g.gain.setValueAtTime(vol||0.15,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t+dur+0.03);
  }
  function noise(dur,vol,freq){
    if(!actx||muted) return;
    const t=actx.currentTime,n=Math.floor(actx.sampleRate*dur);
    const b=actx.createBuffer(1,n,actx.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=actx.createBufferSource(); s.buffer=b;
    const g=actx.createGain(); g.gain.setValueAtTime(vol||0.2,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    const f=actx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq||900;
    s.connect(f).connect(g).connect(actx.destination); s.start(t);
  }
  // tiny announcer-ish blips (formant-ish sweeps)
  function say(seq){ if(!actx||muted) return; let d=0; seq.forEach(s=>{ setTimeout(()=>tone(s[0],s[1],'sawtooth',0.16,s[2]),d*1000); d+=s[1]*0.7; }); }
  const sfx = {
    punch(){ tone(300,0.07,'square',0.14,170); },
    kick(){ tone(210,0.12,'square',0.17,90); noise(0.05,0.08,500); },
    hit(){ noise(0.14,0.26,700); tone(120,0.12,'sawtooth',0.12,60); },
    big(){ noise(0.2,0.34,500); tone(90,0.22,'sawtooth',0.2,50); },
    block(){ tone(720,0.05,'square',0.12); noise(0.05,0.1,1500); },
    special(){ tone(180,0.34,'sawtooth',0.2,760); },
    launch(){ tone(260,0.26,'square',0.18,900); noise(0.1,0.12,1200); },
    throwh(){ noise(0.18,0.3,400); tone(140,0.2,'sawtooth',0.16,70); },
    jump(){ tone(420,0.09,'square',0.1,720); },
    land(){ noise(0.08,0.14,300); },
    rage(){ say([[160,0.18,420],[260,0.2,520]]); noise(0.3,0.2,300); },
    ko(){ say([[300,0.3,90],[180,0.5,55]]); noise(0.5,0.22,400); },
    fight(){ say([[300,0.18,360],[520,0.22,700]]); },
    round(){ tone(520,0.1,'square',0.18); setTimeout(()=>tone(700,0.13,'square',0.18),130); },
    ui(){ tone(620,0.05,'square',0.12,820); },
  };

  // ===================== INPUT =====================
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code]=true; aInit();
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)) e.preventDefault();
    if(e.code==='KeyM') toggleMute();
    if(e.code==='KeyT' && game.state==='title' && !isTouch){ game.twoPlayer=!game.twoPlayer; sfx.ui(); }
    if(e.code==='Enter'){
      if(game.state==='title') gotoSelect();
      else if(game.state==='select') confirmSelect();
      else if(game.state==='over') gotoSelect();
    }
    if(game.state==='title' && ['KeyF','KeyG','KeyH','Space'].includes(e.code)) gotoSelect();
  });
  addEventListener('keyup', e => { keys[e.code]=false; });

  const muteBtn=document.getElementById('mute');
  function toggleMute(){ muted=!muted; aInit(); if(muteBtn) muteBtn.textContent=muted?'\uD83D\uDD07':'\uD83D\uDD0A'; }
  if(muteBtn) muteBtn.addEventListener('click', toggleMute);

  const isTouch = window.matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window);
  if(isTouch){
    document.body.classList.add('touch');
    document.querySelectorAll('#touch [data-k]').forEach(btn=>{
      const k=btn.getAttribute('data-k');
      const down=e=>{ e.preventDefault(); aInit(); btn.classList.add('on'); keys[k]=true; };
      const up=e=>{ e.preventDefault(); btn.classList.remove('on'); keys[k]=false; };
      btn.addEventListener('touchstart',down,{passive:false});
      btn.addEventListener('touchend',up,{passive:false});
      btn.addEventListener('touchcancel',up,{passive:false});
      btn.addEventListener('mousedown',down); btn.addEventListener('mouseup',up); btn.addEventListener('mouseleave',up);
    });
    cv.addEventListener('touchstart',e=>{ aInit();
      if(game.state==='title'){ e.preventDefault(); gotoSelect(); }
      else if(game.state==='select'){ e.preventDefault(); confirmSelect(); }
      else if(game.state==='over'){ e.preventDefault(); gotoSelect(); }
    },{passive:false});
  }

  // ===================== HELPERS =====================
  const clamp=(v,a,b)=> v<a?a:v>b?b:v;
  const rand=(a,b)=> a+Math.random()*(b-a);
  const aabb=(a,b)=> a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function shade(hex,amt){ // lighten(+)/darken(-) a hex color
    let c=hex.replace('#',''); if(c.length===3) c=c.split('').map(x=>x+x).join('');
    let r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
    r=clamp(Math.round(r+amt),0,255); g=clamp(Math.round(g+amt),0,255); b=clamp(Math.round(b+amt),0,255);
    return 'rgb('+r+','+g+','+b+')';
  }
  function px(x,y,w,h,fill){ ctx.fillStyle=fill; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }
  // shaded limb: dark outline + base + top-light highlight
  function limbS(x1,y1,x2,y2,wd,base,white){
    const a=Math.atan2(y2-y1,x2-x1), len=Math.hypot(x2-x1,y2-y1)+wd*0.4;
    ctx.save(); ctx.translate(x1,y1); ctx.rotate(a);
    ctx.fillStyle = white?'#bfe9ff':shade(base,-46); ctx.fillRect(-1,-wd/2-1,len+2,wd+2);
    ctx.fillStyle = white?'#fff':base;               ctx.fillRect(0,-wd/2,len,wd);
    ctx.fillStyle = white?'#fff':shade(base,40);     ctx.fillRect(0,-wd/2,len,Math.max(1,wd*0.34));
    ctx.restore();
  }

  // ===================== CHARACTERS =====================
  const CHARS = [
    { name:'NEON',  tag:'CYBER', accent:'#00e5ff', spd:1.00, pow:1.00, jmp:1.00,
      pal:{ skin:'#f0c69a', suit:'#e9f1ff', suit2:'#1b6dff', band:'#1b6dff', hair:'#222f47', glove:'#d23a3a', accent:'#00e5ff' } },
    { name:'BLAZE', tag:'INFERNO', accent:'#ff5a3c', spd:0.94, pow:1.15, jmp:0.93,
      pal:{ skin:'#e6ac79', suit:'#ff5a3c', suit2:'#ffd23c', band:'#ffd23c', hair:'#241210', glove:'#7a1414', accent:'#ff5a3c' } },
    { name:'VOLT',  tag:'STORM', accent:'#ffe23c', spd:1.18, pow:0.88, jmp:1.12,
      pal:{ skin:'#f0c69a', suit:'#2b2b33', suit2:'#ffe23c', band:'#ffe23c', hair:'#ffe23c', glove:'#2b2b33', accent:'#ffe23c' } },
    { name:'TOXIN', tag:'VENOM', accent:'#5dff8f', spd:1.06, pow:1.02, jmp:1.04,
      pal:{ skin:'#c9b196', suit:'#1f7a45', suit2:'#0c1f14', band:'#5dff8f', hair:'#0c1f14', glove:'#0c1f14', accent:'#5dff8f' } },
  ];

  // ===================== SPRITE (shaded, taller) =====================
  function drawShadow(cx,F,scale){ ctx.globalAlpha=.32; ctx.fillStyle='#000';
    ctx.beginPath(); ctx.ellipse(cx,F+1,16*(scale||1),4,0,0,7); ctx.fill(); ctx.globalAlpha=1; }

  function torsoS(cx,top,bot,P,white){
    const w=16;
    px(cx-w/2-1,top-1,w+2,(bot-top)+3, white?'#bfe9ff':shade(P.suit,-50));
    px(cx-w/2,top,w,(bot-top)+1, white?'#fff':P.suit);
    px(cx-w/2,top,5,(bot-top)+1, white?'#fff':shade(P.suit,28));      // left light
    px(cx+w/2-4,top,4,(bot-top)+1, white?'#fff':shade(P.suit,-30));   // right shade
    px(cx-w/2,bot-3,w,4, white?'#fff':P.suit2);                        // belt
  }
  function headS(cx,cy,dir,P,white){
    px(cx-6,cy-6,13,13, white?'#bfe9ff':shade(P.skin,-50));
    px(cx-5,cy-5,11,11, white?'#fff':P.skin);
    px(cx-5,cy-5,4,11, white?'#fff':shade(P.skin,26));     // face light
    px(cx+2,cy-5,3,11, white?'#fff':shade(P.skin,-28));    // face shade
    px(cx-6,cy-8,13,4, white?'#fff':P.hair);               // hair top
    px(cx-6,cy-3,13,2, white?'#fff':P.band);               // headband
    if(!white){ px(cx+dir*1+1,cy-1,2,3,'#16202b'); }       // eye
    px(cx-6,cy-1,2,3, white?'#fff':P.accent);              // cheek accent
  }
  function gloveS(x,y,P,white){ px(x-3,y-3,6,6, white?'#fff':shade(P.glove,-40)); px(x-2,y-2,5,5, white?'#fff':P.glove); px(x-2,y-2,2,2, white?'#fff':shade(P.glove,40)); }
  function bootS(x,y,P,white){ px(x-3,y-2,7,4, white?'#fff':shade(P.suit2,-40)); px(x-3,y-2,7,2, white?'#fff':P.suit2); }

  function spriteDraw(cx,F,pal,dir,pose,t,special,white,rage){
    const P=pal;
    const bob = pose==='idle'? Math.sin(t*0.1)*1 : 0;
    const hipY=F-26+bob, shY=F-46+bob, headCy=F-54+bob;
    let lean=0; if(pose==='hurt') lean=-dir*3; if(pose==='launched') lean=dir*4;
    // legs base positions
    let bx=cx-dir*5, by=F, fx=cx+dir*5, fy=F;
    if(pose==='walk'){ const s=Math.sin(t*0.3)*5; fx=cx+dir*(4+s); bx=cx-dir*(4-s); }
    else if(pose==='back'){ const s=Math.sin(t*0.3)*4; fx=cx+dir*(3-s); bx=cx-dir*(3+s); }
    else if(pose==='kick'){ fx=cx+dir*20; fy=F-16; bx=cx-dir*6; }
    else if(pose==='launch'){ fx=cx+dir*15; fy=F-26; bx=cx-dir*5; }
    else if(pose==='air'||pose==='launched'){ by=F-7; fy=F-12; bx=cx-dir*4; fx=cx+dir*8; }
    else if(pose==='block'){ bx=cx-dir*7; fx=cx+dir*4; }
    else if(pose==='crouch'){ bx=cx-dir*7; fx=cx+dir*7; by=F; fy=F; }
    limbS(cx-dir*2,hipY, bx,by, 6, P.suit2, white); bootS(bx,by,P,white);
    limbS(cx+dir*2,hipY, fx,fy, 6, P.suit2, white); bootS(fx,fy,P,white);
    // torso
    const ctop = pose==='crouch'? shY+6 : shY;
    torsoS(cx+lean,ctop,hipY,P,white);
    // arms
    const shx=cx+lean, shy=ctop+3;
    if(pose==='block'){ limbS(shx,shy, shx+dir*7,shY+1, 5,P.suit,white); gloveS(shx+dir*7,shY+1,P,white);
      limbS(shx,shy, shx+dir*8,shY+10, 5,P.suit,white); gloveS(shx+dir*8,shY+10,P,white); }
    else if(pose==='punch'){ limbS(shx,shy, shx-dir*7,hipY-1, 5,P.suit,white); gloveS(shx-dir*7,hipY-1,P,white);
      limbS(shx,shy, shx+dir*22,shY+4, 5,P.suit,white); gloveS(shx+dir*22,shY+4,P,white); }
    else if(pose==='kick'){ limbS(shx,shy, shx-dir*6,hipY-3, 5,P.suit,white); gloveS(shx-dir*6,hipY-3,P,white);
      limbS(shx,shy, shx+dir*6,hipY-6, 5,P.suit,white); gloveS(shx+dir*6,hipY-6,P,white); }
    else if(pose==='launch'){ limbS(shx,shy, shx+dir*4,shY-14, 5,P.suit,white); gloveS(shx+dir*4,shY-14,P,white);
      limbS(shx,shy, shx-dir*5,hipY-3, 5,P.suit,white); gloveS(shx-dir*5,hipY-3,P,white); }
    else if(pose==='throw'){ limbS(shx,shy, shx+dir*16,shY+2, 5,P.suit,white); gloveS(shx+dir*16,shY+2,P,white);
      limbS(shx,shy, shx+dir*15,shY+8, 5,P.suit,white); gloveS(shx+dir*15,shY+8,P,white); }
    else if(pose==='air'||pose==='launched'){ limbS(shx,shy, shx-dir*9,shY-2, 5,P.suit,white); gloveS(shx-dir*9,shY-2,P,white);
      limbS(shx,shy, shx+dir*9,shY, 5,P.suit,white); gloveS(shx+dir*9,shY,P,white); }
    else if(pose==='hurt'){ limbS(shx,shy, shx-dir*7,shY-3, 5,P.suit,white); gloveS(shx-dir*7,shY-3,P,white);
      limbS(shx,shy, shx+dir*5,shY-4, 5,P.suit,white); gloveS(shx+dir*5,shY-4,P,white); }
    else { const sw=Math.sin(t*0.1)*2; limbS(shx,shy, shx-dir*7,hipY-3+sw, 5,P.suit,white); gloveS(shx-dir*7,hipY-3+sw,P,white);
      limbS(shx,shy, shx+dir*9,hipY-6-sw, 5,P.suit,white); gloveS(shx+dir*9,hipY-6-sw,P,white); }
    // head
    headS(cx+lean,headCy + (pose==='crouch'?6:0),dir,P,white);
    // aura: special-ready or rage
    if(rage && !white){ ctx.globalAlpha=0.4+0.3*Math.sin(t*0.5); ctx.strokeStyle='#ff2b2b'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,F-24,26,0,7); ctx.stroke(); ctx.globalAlpha=1;
      for(let i=0;i<3;i++) px(cx+rand(-12,12),F-24+rand(-22,18),2,2,'#ff6b4a'); }
    else if(special>=100 && !white){ ctx.globalAlpha=0.32+0.22*Math.sin(t*0.4); ctx.strokeStyle=pal.accent; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cx,F-24,25,0,7); ctx.stroke(); ctx.globalAlpha=1; }
  }

  // ===================== FX =====================
  const shots=[], fx=[];
  function spark(x,y,color,n=8,spd=2.4){ for(let i=0;i<n;i++) fx.push({x,y,vx:rand(-spd,spd),vy:rand(-spd*1.1,spd*0.3),life:rand(12,26),color,r:rand(1,2.6)}); }
  function ring(x,y,color){ fx.push({ring:true,x,y,r:2,max:rand(16,24),color,life:18}); }
  function updateFx(){ for(let i=fx.length-1;i>=0;i--){ const p=fx[i];
    if(p.ring){ p.r+=(p.max-p.r)*0.3; p.life--; if(p.life<=0) fx.splice(i,1); continue; }
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.16; p.life--; if(p.life<=0) fx.splice(i,1); } }
  function drawFx(){ fx.forEach(p=>{ if(p.ring){ ctx.globalAlpha=clamp(p.life/18,0,1); ctx.strokeStyle=p.color; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.stroke(); }
    else { ctx.globalAlpha=clamp(p.life/26,0,1); px(p.x,p.y,Math.ceil(p.r),Math.ceil(p.r),p.color); } }); ctx.globalAlpha=1; }

  // ===================== FIGHTER =====================
  class Fighter {
    constructor(x,char,facing){
      this.x=x; this.w=26; this.h=58; this.y=FLOOR-this.h;
      this.vx=0; this.vy=0; this.facing=facing;
      this.char=char; this.pal=char.pal; this.accent=char.accent; this.name=char.name; this.tag=char.tag;
      this.pow=char.pow; this.spd=char.spd; this.jmp=char.jmp;
      this.hp=100; this.maxhp=100; this.chip=100; this.onGround=true;
      this.attack=null; this.attackT=0; this.cooldown=0;
      this.blocking=false; this.crouch=false; this.hitstun=0; this.special=0; this.wins=0;
      this.flash=0; this.t=0; this.attackId=0; this._lastId=-1;
      this.juggle=0; this.rage=false; this.usedRage=false; this.throwT=0;
    }
    reset(x,facing){ this.x=x; this.facing=facing; this.y=FLOOR-this.h; this.vx=0; this.vy=0; this.hp=100; this.chip=100;
      this.attack=null; this.attackT=0; this.cooldown=0; this.hitstun=0; this.blocking=false; this.crouch=false;
      this.special=0; this.flash=0; this.juggle=0; this.rage=false; this.usedRage=false; this.throwT=0; }
    get cx(){ return this.x+this.w/2; }
    tryJump(){ if(this.onGround && this.hitstun<=0 && !this.attack){ this.vy=-9.4*this.jmp; this.onGround=false; sfx.jump(); } }
    startAttack(type){
      if(this.cooldown>0||this.attack||this.hitstun>0||this.throwT>0) return;
      if(type==='special' && this.special<100 && !this.rage) return;
      // launcher only from crouch/standing on ground
      if(type==='launch' && !this.onGround) return;
      this.attack=type;
      this.attackT = type==='punch'?14: type==='kick'?20: type==='launch'?24: 26;
      this.cooldown = type==='punch'?18: type==='kick'?26: type==='launch'?40: 46;
      this.attackId++;
      if(type==='punch') sfx.punch();
      else if(type==='kick') sfx.kick();
      else if(type==='launch') sfx.launch();
      else if(type==='special'){ if(!this.rage) this.special=0; sfx.special();
        shots.push({ x:this.cx+this.facing*12, y:this.y+22, vx:this.facing*5, w:15, h:12, owner:this, color:this.rage?'#ff3b2b':this.accent, life:80, big:this.rage });
        ring(this.cx+this.facing*12,this.y+24,this.accent); spark(this.cx+this.facing*12,this.y+24,this.accent,14); }
    }
    tryThrow(opp){
      if(this.cooldown>0||this.attack||this.hitstun>0||this.throwT>0) return false;
      const dist=Math.abs(this.cx-opp.cx);
      if(dist<30 && opp.onGround && opp.hitstun<=0){
        this.throwT=30; opp.hitstun=30; opp.attack=null; this.cooldown=46; sfx.throwh();
        opp.vx=this.facing*5; opp.vy=-5.5; opp.onGround=false;
        opp.takeRaw(16*this.pow); ring(opp.cx,opp.y+24,'#fff'); spark(opp.cx,opp.y+24,'#fff',16); game.shake=6;
        announce('THROW!',40); return true;
      }
      return false;
    }
    hitbox(){
      if(!this.attack||this.attack==='special'||this.attack==='throw') return null;
      let reach,hy,dmg,kb,launch=false;
      if(this.attack==='punch'){ reach=22; hy=this.y+18; dmg=6; kb=2.4; }
      else if(this.attack==='kick'){ reach=30; hy=this.y+30; dmg=10; kb=3.6; }
      else { reach=26; hy=this.y+10; dmg=9; kb=2; launch=true; }      // launcher
      const t=this.attackT;
      const active = this.attack==='punch'?(t<10&&t>3): this.attack==='kick'?(t<14&&t>5):(t<18&&t>8);
      if(!active) return null;
      return { x:this.facing>0?this.x+this.w:this.x-reach, y:hy, w:reach, h:14, dmg:dmg*this.pow, kb, launch };
    }
    update(opp){
      this.t++;
      if(this.flash>0) this.flash--;
      if(this.cooldown>0) this.cooldown--;
      if(this.throwT>0) this.throwT--;
      if(this.attackT>0){ this.attackT--; if(this.attackT===0) this.attack=null; }
      if(this.hitstun>0) this.hitstun--;
      if(!this.attack && this.onGround && this.throwT<=0) this.facing = opp.cx>this.cx?1:-1;
      const wasAir=!this.onGround;
      this.vy+=0.5; this.y+=this.vy;
      if(this.y>=FLOOR-this.h){ this.y=FLOOR-this.h; if(wasAir && this.vy>3){ sfx.land(); spark(this.cx,FLOOR,'#9bd',6,1.6); } this.vy=0; this.onGround=true; this.juggle=0; }
      else this.onGround=false;
      this.x+=this.vx; this.vx*= this.onGround?0.7:0.94;
      this.x=clamp(this.x,6,W-this.w-6);
      if(!this.rage) this.special=clamp(this.special+0.09,0,100);
      // chip recovers toward hp
      if(this.chip>this.hp) this.chip=Math.max(this.hp,this.chip-0.25);
      // rage trigger
      if(!this.usedRage && this.hp>0 && this.hp<=30){ this.rage=true; this.usedRage=true; this.special=100; sfx.rage(); announce(this.name+' RAGE!',60); ring(this.cx,this.y+24,'#ff2b2b'); }
    }
    takeRaw(dmg){ this.hp=clamp(this.hp-dmg,0,this.maxhp); }
    takeHit(h,dir){
      let dmg=h.dmg, kb=h.kb;
      if(this.blocking && this.onGround && !h.launch){ dmg*=0.18; kb*=0.35; sfx.block(); spark(this.cx,this.y+24,'#8fefff',6);
        this.chip=clamp(this.chip-dmg*0.5,0,this.maxhp); this.hp=clamp(this.hp-dmg*0.15,0,this.maxhp); this.vx+=dir*kb; return false; }
      // hit confirmed
      const air=!this.onGround;
      sfx.hit();
      if(h.launch || (air && this.juggle<5)){
        // launch / juggle
        this.juggle++; this.vy=-7.2 - this.juggle*0.2; this.vx=dir*2.2; this.onGround=false; this.hitstun=22;
        if(h.launch){ sfx.launch(); announce('LAUNCH!',36); }
        game.combo.add(this===p1?'p2':'p1');
        spark(this.cx,this.y+22,'#fff',14); ring(this.cx,this.y+22,this.accent);
      } else {
        this.hitstun=16; this.vx+=dir*kb; this.vy-=1.2;
        game.combo.add(this===p1?'p2':'p1');
        spark(this.cx,this.y+24,'#fff',12);
      }
      // combo damage scaling
      const owner = this===p1?p2:p1;
      const scale = owner ? owner._comboScale() : 1;
      this.flash=8; this.hp=clamp(this.hp-dmg*scale,0,this.maxhp);
      this.special=clamp(this.special+5,0,100);
      game.shake=Math.min(7,3+dmg*0.2);
      return true;
    }
    _comboScale(){ const c=game.combo.who===(this===p1?'p1':'p2')?game.combo.n:0; return clamp(1-(c*0.08),0.4,1); }
    pose(){
      if(this.throwT>0) return 'throw';
      if(this.hitstun>0) return this.onGround?'hurt':'launched';
      if(!this.onGround) return 'air';
      if(this.attack==='punch'||this.attack==='special') return 'punch';
      if(this.attack==='kick') return 'kick';
      if(this.attack==='launch') return 'launch';
      if(this.crouch) return 'crouch';
      if(this.blocking) return 'block';
      if(Math.abs(this.vx)>0.4) return (this.vx>0)===(this.facing>0)?'walk':'back';
      return 'idle';
    }
    draw(){ drawShadow(this.cx,this.y+this.h);
      const white=this.flash>0 && ((this.flash>>1)&1)===1;
      spriteDraw(this.cx,this.y+this.h,this.pal,this.facing,this.pose(),this.t,this.special,white,this.rage);
    }
  }

  // ===================== GAME STATE =====================
  const game = { state:'title', timer:60, tick:0, shake:0, round:1, twoPlayer:false,
    msg:'', msgT:0, msgBig:false, sel:{p1:0,p2:1,turn:'p1'},
    combo:{ n:0, who:null, t:0,
      add(who){ if(this.who!==who){ this.who=who; this.n=0; } this.n++; this.t=70; },
      tickdown(){ if(this.t>0){ this.t--; if(this.t===0){ this.n=0; this.who=null; } } } }
  };
  let p1=null,p2=null,mPrev={};
  function announce(msg,frames,big){ game.msg=msg; game.msgT=frames||50; game.msgBig=!!big; }

  function gotoSelect(){ game.state='select'; game.sel={p1:0,p2:1,turn:'p1'}; mPrev={}; sfx.ui(); }
  function confirmSelect(){ sfx.ui();
    if(game.sel.turn==='p1' && game.twoPlayer && !isTouch){ game.sel.turn='p2'; return; }
    startMatch();
  }
  function startMatch(){
    if(isTouch) game.twoPlayer=false;
    const i1=game.sel.p1;
    const i2=(game.twoPlayer&&!isTouch)?game.sel.p2:(i1+1+Math.floor(Math.random()*(CHARS.length-1)))%CHARS.length;
    p1=new Fighter(110,CHARS[i1],1); p2=new Fighter(W-110-26,CHARS[i2],-1);
    game.state='fight'; game.timer=60; game.tick=0; game.round=1; shots.length=0; fx.length=0;
    game.combo.n=0; game.combo.who=null;
    announce('ROUND 1',70,true); sfx.round(); setTimeout(()=>{ if(game.state==='fight') { announce('FIGHT!',45,true); sfx.fight(); } },1100);
  }
  function nextRound(winner){
    winner.wins++;
    game.combo.n=0; game.combo.who=null;
    if(winner.wins>=2){ game.state='over'; announce(winner.name+' WINS',99999,true); sfx.ko(); return; }
    game.round++; p1.reset(110,1); p2.reset(W-110-26,-1); shots.length=0;
    game.timer=60; announce('ROUND '+game.round,70,true); sfx.round();
    setTimeout(()=>{ if(game.state==='fight') { announce('FIGHT!',45,true); sfx.fight(); } },1100);
  }
  function koCheck(){
    if(p1.hp<=0 && p2.hp<=0){ nextRound(p1.wins>=p2.wins?p1:p2); return true; }
    if(p2.hp<=0){ announce('K.O.',60,true); sfx.ko(); nextRound(p1); return true; }
    if(p1.hp<=0){ announce('K.O.',60,true); sfx.ko(); nextRound(p2); return true; }
    return false;
  }

  // ===================== CPU AI =====================
  function cpu(self,opp){
    if(self.hitstun>0||self.throwT>0) return;
    const dist=Math.abs(self.cx-opp.cx), dir=opp.cx>self.cx?1:-1;
    self.blocking=false; self.crouch=false;
    if(opp.attack && dist<48 && Math.random()<0.45){ self.blocking=true; return; }
    if(!opp.onGround && opp.hitstun>0 && dist<40 && Math.random()<0.3){ self.startAttack('kick'); return; } // juggle followup
    if((self.special>=100||self.rage) && dist<250 && Math.random()<0.025){ self.startAttack('special'); return; }
    if(dist<28 && Math.random()<0.02){ self.tryThrow(opp); return; }
    if(dist>62){ self.vx+=dir*0.5*self.spd; if(self.onGround && Math.random()<0.012) self.tryJump(); }
    else if(dist<34){ const r=Math.random(); if(r<0.05) self.startAttack('launch'); else if(r<0.14) self.startAttack(Math.random()<0.5?'punch':'kick'); else if(r<0.16) self.vx-=dir*2; }
    else { self.vx+=dir*0.3*self.spd; if(Math.random()<0.03) self.startAttack('punch'); }
  }
  function handleP1(){
    if(p1.hitstun>0||p1.throwT>0) return;
    p1.blocking=!!keys['KeyS'] && p1.onGround; p1.crouch=p1.blocking;
    if(keys['KeyA']) p1.vx-=0.55*p1.spd;
    if(keys['KeyD']) p1.vx+=0.55*p1.spd;
    if(keys['KeyW']) p1.tryJump();
    if(keys['KeyF']&&keys['KeyG']) { if(!p1.tryThrow(p2)) p1.startAttack('punch'); }
    else if(keys['KeyS']&&keys['KeyG']) p1.startAttack('launch');
    else if(keys['KeyF']) p1.startAttack('punch');
    else if(keys['KeyG']) p1.startAttack('kick');
    if(keys['KeyH']) p1.startAttack('special');
  }
  function handleP2(){
    if(p2.hitstun>0||p2.throwT>0) return;
    p2.blocking=!!keys['ArrowDown'] && p2.onGround; p2.crouch=p2.blocking;
    if(keys['ArrowLeft']) p2.vx-=0.55*p2.spd;
    if(keys['ArrowRight']) p2.vx+=0.55*p2.spd;
    if(keys['ArrowUp']) p2.tryJump();
    if(keys['KeyK']&&keys['KeyL']) { if(!p2.tryThrow(p1)) p2.startAttack('punch'); }
    else if(keys['ArrowDown']&&keys['KeyL']) p2.startAttack('launch');
    else if(keys['KeyK']) p2.startAttack('punch');
    else if(keys['KeyL']) p2.startAttack('kick');
    if(keys['Semicolon']) p2.startAttack('special');
  }

  function updateShots(){
    for(let i=shots.length-1;i>=0;i--){ const s=shots[i]; s.x+=s.vx; s.life--;
      const tgt=s.owner===p1?p2:p1, body={x:tgt.x,y:tgt.y,w:tgt.w,h:tgt.h};
      if(aabb(s,body)){ tgt.takeHit({dmg:(s.big?22:14)*s.owner.pow,kb:4.5,launch:s.big}, Math.sign(s.vx)); ring(s.x,s.y,s.color); spark(s.x,s.y,s.color,16); shots.splice(i,1); continue; }
      if(s.x<-30||s.x>W+30||s.life<=0) shots.splice(i,1);
    }
  }
  function drawShots(){ shots.forEach(s=>{ const cx=s.x+s.w/2,cy=s.y+s.h/2, R=s.big?2:0;
    ctx.globalAlpha=0.9; px(cx-7-R,cy-3-R,14+R*2,6+R*2,s.color); px(cx-4,cy-6-R,8,12+R*2,s.color); px(cx-2,cy-2,4,4,'#fff'); ctx.globalAlpha=1;
    if(s.big){ spark(s.x,s.y,s.color,2,1); } }); }

  // ===================== BACKGROUND =====================
  function drawBg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a0e24'); g.addColorStop(.55,'#1a0a2e'); g.addColorStop(1,'#04030a');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.5; px(W-72,26,32,32,'#2c2452'); ctx.globalAlpha=1;
    // far skyline
    ctx.fillStyle='rgba(0,229,255,.10)';
    for(let i=0;i<16;i++){ const bw=W/16,bh=30+((i*53)%60); ctx.fillRect(i*bw,FLOOR-bh,bw-3,bh); }
    ctx.fillStyle='rgba(255,46,136,.09)';
    for(let i=0;i<10;i++){ const bw=W/10,bh=50+((i*97)%80); ctx.fillRect(i*bw+8,FLOOR-bh,bw-12,bh); }
    // neon signs flicker
    if((game.tick>>4)%5!==0){ px(60,90,3,26,'rgba(255,46,136,.5)'); px(W-90,70,3,34,'rgba(0,229,255,.5)'); }
    // perspective grid floor (depth)
    ctx.strokeStyle='rgba(0,229,255,.25)'; ctx.lineWidth=1;
    for(let i=0;i<=20;i++){ const x=i*(W/20); ctx.beginPath(); ctx.moveTo(x,FLOOR); ctx.lineTo(W/2+(x-W/2)*3,H); ctx.stroke(); }
    for(let j=0;j<6;j++){ const y=FLOOR+j*j*2+2; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(0,FLOOR,W,H-FLOOR);
  }

  // ===================== HUD (Tekken-style) =====================
  function healthbar(x,y,w,f,flip){
    const skew=6;
    ctx.fillStyle='rgba(255,255,255,.18)';
    ctx.beginPath();
    if(!flip){ ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w-skew,y+11); ctx.lineTo(x,y+11);} 
    else { ctx.moveTo(x+skew,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+11); ctx.lineTo(x,y+11);} 
    ctx.closePath(); ctx.fill();
    const cw=clamp(f.chip/100,0,1)*(w-4), hw=clamp(f.hp/100,0,1)*(w-4);
    const bx=x+2;
    ctx.fillStyle='#ff5a3c'; ctx.fillRect(flip? x+w-2-cw : bx, y+2, cw, 7);
    const grad = f.rage? '#ff2b2b' : (flip?'#ff2e88':'#00e5ff');
    ctx.fillStyle=grad; ctx.fillRect(flip? x+w-2-hw : bx, y+2, hw, 7);
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(flip? x+w-2-hw : bx, y+2, hw, 2);
  }
  function meter(x,y,w,v,flip,rage){
    ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(x,y,w,3);
    const pw=Math.round(w*clamp(v/100,0,1));
    ctx.fillStyle = rage?'#ff2b2b' : v>=100?'#ffe23c':'#ffae00';
    ctx.fillRect(flip?x+w-pw:x,y,pw,3);
  }
  function txt(s,x,y,size,color,align){ ctx.textAlign=align||'center'; ctx.font='bold '+size+"px 'Courier New',monospace"; ctx.fillStyle=color; ctx.fillText(s,x,y); }
  function glow(s,x,y,size,color){ ctx.save(); ctx.shadowBlur=14; ctx.shadowColor=color; txt(s,x,y,size,color,'center'); ctx.restore(); }
  function star(cx,cy,r,fill){ ctx.fillStyle=fill; ctx.beginPath();
    for(let i=0;i<10;i++){ const ang=-Math.PI/2+i*Math.PI/5, rr=i%2?r*0.45:r; const px2=cx+Math.cos(ang)*rr, py2=cy+Math.sin(ang)*rr; i?ctx.lineTo(px2,py2):ctx.moveTo(px2,py2);} ctx.closePath(); ctx.fill(); }
  function drawHud(){
    healthbar(14,16,176,p1,false);
    healthbar(W-14-176,16,176,p2,true);
    meter(16,29,172,p1.special,false,p1.rage);
    meter(W-16-172,29,172,p2.special,true,p2.rage);
    txt(p1.name,16,13,9,'#fff','left'); txt('('+p1.tag+')',16+p1.name.length*7+6,13,6,p1.accent,'left');
    txt(p2.name,W-16,13,9,'#fff','right'); txt('('+p2.tag+')',W-16-p2.name.length*7-6,13,6,p2.accent,'right');
    for(let i=0;i<2;i++){ star(W/2-26+i*9,9,4,i<p1.wins?'#00e5ff':'rgba(255,255,255,.22)');
      star(W/2+26-i*9,9,4,i<p2.wins?'#ff2e88':'rgba(255,255,255,.22)'); }
    px(W/2-15,15,30,16,'rgba(0,0,0,.5)'); txt(Math.ceil(game.timer),W/2,28,15,'#fff','center');
    if(game.combo.n>=2 && game.combo.who){
      const left=game.combo.who==='p1'; const cx=left?96:W-96;
      ctx.save(); const sc=clamp(game.combo.t/70+0.6,0.7,1.3);
      glow(game.combo.n+' HITS',cx,70,12*sc, left?'#00e5ff':'#ff2e88'); ctx.restore();
      txt('COMBO',cx,82,7,'#fff','center');
    }
  }

  // ===================== SCREENS =====================
  function drawTitle(){
    spriteDraw(150,FLOOR,CHARS[0].pal,1,'idle',game.tick,0,false,false);
    spriteDraw(W-150,FLOOR,CHARS[1].pal,-1,'idle',game.tick,0,false,false);
    glow('NEON FIST',W/2,84,38,'#00e5ff');
    txt('TEKKEN-STYLE PIXEL FIGHTER',W/2,104,9,'#ff2e88','center');
    ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
    txt(isTouch?'TAP TO START':'PRESS ENTER',W/2,146,14,'#fff','center'); ctx.globalAlpha=1;
    txt(isTouch?'MODE: 1P vs CPU':('MODE: '+(game.twoPlayer?'2 PLAYERS':'1P vs CPU')+'   (press T)'),W/2,164,8,'#7fdfff','center');
    txt('COMBO · JUGGLE · LAUNCHER · THROW · RAGE',W/2,180,7,'#9bd','center');
  }
  function drawSelect(){
    glow('SELECT YOUR FIGHTER',W/2,32,15,'#00e5ff');
    const n=CHARS.length;
    for(let i=0;i<n;i++){
      const cxp=W/2+(i-(n-1)/2)*100;
      const selP1=(game.sel.p1===i), selP2=(game.twoPlayer&&!isTouch&&game.sel.p2===i);
      ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(cxp-36,66,72,116);
      if(selP1||selP2){ ctx.strokeStyle=selP1?'#00e5ff':'#ff2e88'; ctx.lineWidth=2; ctx.strokeRect(cxp-36,66,72,116); }
      spriteDraw(cxp,166,CHARS[i].pal,1,'idle',game.tick+i*20,0,false,false);
      txt(CHARS[i].name,cxp,180,10,CHARS[i].accent,'center');
      txt('SPD '+CHARS[i].spd.toFixed(2),cxp,80,6,'#fff','center');
      txt('POW '+CHARS[i].pow.toFixed(2),cxp,88,6,'#fff','center');
      if(selP1) txt('P1',cxp-22,78,9,'#00e5ff','center');
      if(selP2) txt('P2',cxp+22,78,9,'#ff2e88','center');
    }
    const who=(game.twoPlayer&&!isTouch)?(game.sel.turn==='p1'?'P1':'P2'):'P1';
    txt(who+' — '+(isTouch?'◀ ▶ choose · tap to confirm':'A/D choose · F/Enter confirm'),W/2,206,9,'#fff','center');
  }

  // ===================== MENU NAV =====================
  function selectMenu(){
    const l1=!!keys['KeyA'],r1=!!keys['KeyD'],c1=!!keys['KeyF'];
    const l2=!!keys['ArrowLeft'],r2=!!keys['ArrowRight'],c2=!!keys['KeyK'];
    const twoTurn=(game.twoPlayer&&!isTouch&&game.sel.turn==='p2');
    const L=twoTurn?l2:l1,R=twoTurn?r2:r1,C=twoTurn?c2:c1, key=twoTurn?'p2':'p1';
    if(L&&!mPrev.L){ game.sel[key]=(game.sel[key]+CHARS.length-1)%CHARS.length; sfx.ui(); }
    if(R&&!mPrev.R){ game.sel[key]=(game.sel[key]+1)%CHARS.length; sfx.ui(); }
    if(C&&!mPrev.C){ confirmSelect(); }
    mPrev={L,R,C};
  }

  // ===================== MAIN LOOP =====================
  function loop(){
    game.tick++;
    ctx.save();
    if(game.shake>0){ ctx.translate(rand(-game.shake,game.shake),rand(-game.shake,game.shake)); game.shake*=0.85; if(game.shake<0.4) game.shake=0; }
    drawBg();

    if(game.state==='fight'){
      const intro = game.msgT>0 && (game.msg.indexOf('ROUND')>=0 || game.msg==='FIGHT!');
      const live = !intro;
      if(game.msgT>0) game.msgT--;
      game.combo.tickdown();
      if(live){
        handleP1();
        if(game.twoPlayer && !isTouch) handleP2(); else cpu(p2,p1);
        p1.update(p2); p2.update(p1);
        const h1=p1.hitbox(); if(h1){ const b={x:p2.x,y:p2.y,w:p2.w,h:p2.h};
          if(aabb(h1,b) && p2._lastId!==p1.attackId){ p2.takeHit(h1,p1.facing); p2._lastId=p1.attackId; } }
        const h2=p2.hitbox(); if(h2){ const b={x:p1.x,y:p1.y,w:p1.w,h:p1.h};
          if(aabb(h2,b) && p1._lastId!==p2.attackId){ p1.takeHit(h2,p2.facing); p1._lastId=p2.attackId; } }
        if(aabb({x:p1.x,y:p1.y,w:p1.w,h:p1.h},{x:p2.x,y:p2.y,w:p2.w,h:p2.h}) && p1.onGround && p2.onGround){ const push=p1.cx<p2.cx?-1:1; p1.x+=push*0.6; p2.x-=push*0.6; }
        updateShots();
        game.timer-=1/60;
        if(!koCheck()){ if(game.timer<=0){ game.timer=0; if(p1.hp>p2.hp) nextRound(p1); else if(p2.hp>p1.hp) nextRound(p2); else nextRound(p1.wins>=p2.wins?p1:p2); } }
      } else { p1.update(p2); p2.update(p1); }
      updateFx(); drawShots(); (p1.x<=p2.x?[p1,p2]:[p2,p1]).forEach(f=>f.draw()); drawFx(); drawHud();
      if(game.msgT>0){ const big=game.msgBig; ctx.globalAlpha=clamp(game.msgT/20,0,1);
        glow(game.msg,W/2,H/2-6, big?28:22, game.msg==='K.O.'?'#ff2e88':'#fff'); ctx.globalAlpha=1; }
    }
    else if(game.state==='title'){ updateFx(); drawFx(); drawTitle(); }
    else if(game.state==='select'){ selectMenu(); drawSelect(); }
    else if(game.state==='over'){ updateFx(); (p1.x<=p2.x?[p1,p2]:[p2,p1]).forEach(f=>f.draw()); drawFx(); drawHud();
      glow(game.msg,W/2,H/2-6,24, game.msg.startsWith(p1.name)?'#00e5ff':'#ff2e88');
      ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
      txt(isTouch?'TAP FOR REMATCH':'PRESS ENTER FOR REMATCH',W/2,H/2+16,12,'#fff','center'); ctx.globalAlpha=1;
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }
  loop();
})();
