/* =====================================================================
   NEON FIST — a compact HTML5 canvas fighting game (Tekken/SF vibe)
   Pure vanilla JS. No assets. Everything is drawn procedurally.
   ===================================================================== */
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const FLOOR = H - 70;

  // ----- input -----
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)) e.preventDefault();
    if (e.code === 'Enter') { if (game.state === 'title' || game.state === 'over') startMatch(); }
    if (e.code === 'KeyT' && game.state === 'title') { game.twoPlayer = !game.twoPlayer; }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  // ----- helpers -----
  const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
  const rand = (a,b) => a + Math.random()*(b-a);
  const aabb = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;

  // ----- particles -----
  const fx = [];
  function spark(x,y,color,n=10){
    for(let i=0;i<n;i++) fx.push({x,y,vx:rand(-4,4),vy:rand(-5,1),life:rand(15,30),color,r:rand(2,5)});
  }
  function updateFx(){
    for(let i=fx.length-1;i>=0;i--){
      const p=fx[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.3; p.life--;
      if(p.life<=0) fx.splice(i,1);
    }
  }
  function drawFx(){
    fx.forEach(p=>{ ctx.globalAlpha=clamp(p.life/30,0,1); ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); });
    ctx.globalAlpha=1;
  }

  // ----- projectiles -----
  const shots = [];

  // ----- fighter -----
  class Fighter {
    constructor(x, color, name, facing){
      this.x=x; this.y=FLOOR-120; this.w=54; this.h=120;
      this.vx=0; this.vy=0; this.color=color; this.name=name;
      this.facing=facing; // 1 right, -1 left
      this.hp=100; this.maxhp=100; this.onGround=true;
      this.attack=null; this.attackT=0; this.cooldown=0;
      this.blocking=false; this.hitstun=0; this.special=0;
      this.wins=0; this.flash=0; this.crouch=false;
      this.animT=0;
    }
    reset(x){ this.x=x; this.y=FLOOR-120; this.vx=0; this.vy=0; this.hp=100;
      this.attack=null; this.attackT=0; this.cooldown=0; this.hitstun=0; this.blocking=false; this.special=0; }
    get cx(){ return this.x + this.w/2; }
    startAttack(type){
      if(this.cooldown>0 || this.attack || this.hitstun>0) return;
      if(type==='special' && this.special<100) return;
      this.attack=type;
      this.attackT = type==='punch'?14: type==='kick'?20: 26;
      this.cooldown = type==='punch'?20: type==='kick'?28: 50;
      if(type==='special'){ this.special=0;
        shots.push({x:this.cx+this.facing*30,y:this.y+44,vx:this.facing*8,w:30,h:24,owner:this,color:this.color,life:90});
        spark(this.cx+this.facing*30,this.y+50,this.color,18);
      }
    }
    hitbox(){
      if(!this.attack || this.attack==='special') return null;
      const reach = this.attack==='kick'?64:50;
      const hy = this.attack==='kick'? this.y+60 : this.y+34;
      // active frames window
      const t = this.attackT;
      const active = this.attack==='punch'? (t<10&&t>3): (t<14&&t>5);
      if(!active) return null;
      return { x: this.facing>0? this.x+this.w : this.x-reach, y:hy, w:reach, h:28,
        dmg: this.attack==='kick'?12:8, kb:this.attack==='kick'?9:6 };
    }
    update(opp){
      this.animT++;
      if(this.flash>0) this.flash--;
      if(this.cooldown>0) this.cooldown--;
      if(this.attackT>0){ this.attackT--; if(this.attackT===0) this.attack=null; }
      if(this.hitstun>0){ this.hitstun--; }
      // face opponent when idle
      if(!this.attack && this.onGround) this.facing = opp.cx > this.cx ? 1 : -1;
      // gravity
      this.vy += 0.9;
      this.y += this.vy;
      if(this.y >= FLOOR-this.h){ this.y=FLOOR-this.h; this.vy=0; this.onGround=true; }
      else this.onGround=false;
      this.x += this.vx;
      this.vx *= this.onGround?0.7:0.95;
      this.x = clamp(this.x, 10, W-this.w-10);
      // slowly build special meter
      this.special = clamp(this.special+0.12,0,100);
    }
    takeHit(dmg, kb, dir){
      if(this.blocking){ dmg*=0.2; kb*=0.4; spark(this.cx,this.y+50,'#8fefff',8); }
      else { spark(this.cx,this.y+50,'#fff',14); this.hitstun=18; this.flash=8; }
      this.hp = clamp(this.hp-dmg,0,this.maxhp);
      this.vx += dir*kb;
      this.vy -= 2.5;
      this.special = clamp(this.special+6,0,100);
      game.shake = 8;
    }
    draw(){
      const cx=this.cx, top=this.y;
      // shadow
      ctx.globalAlpha=.35; ctx.fillStyle='#000';
      ctx.beginPath(); ctx.ellipse(cx,FLOOR+4,34,9,0,0,7); ctx.fill(); ctx.globalAlpha=1;
      const bob = this.onGround? Math.sin(this.animT*0.15)*2 : 0;
      const lean = this.facing;
      const col = this.flash>0 && (this.flash>>1&1) ? '#ffffff' : this.color;
      // legs
      ctx.strokeStyle=col; ctx.lineWidth=10; ctx.lineCap='round';
      const legSpread = this.attack==='kick'? 22: 12;
      ctx.beginPath();
      ctx.moveTo(cx, top+76);
      ctx.lineTo(cx-legSpread, FLOOR);
      ctx.moveTo(cx, top+76);
      if(this.attack==='kick'){ ctx.lineTo(cx+lean*70, top+58+bob); }
      else ctx.lineTo(cx+legSpread, FLOOR);
      ctx.stroke();
      // torso
      ctx.lineWidth=14;
      ctx.beginPath(); ctx.moveTo(cx, top+30+bob); ctx.lineTo(cx, top+78); ctx.stroke();
      // arms
      ctx.lineWidth=8;
      if(this.attack==='punch'){
        ctx.beginPath(); ctx.moveTo(cx, top+44); ctx.lineTo(cx+lean*60, top+44); ctx.stroke();
        spark(cx+lean*60, top+44, col, 1);
      } else if(this.blocking){
        ctx.beginPath(); ctx.moveTo(cx, top+44); ctx.lineTo(cx+lean*16, top+30); ctx.lineTo(cx+lean*10, top+54); ctx.stroke();
      } else {
        const sw=Math.sin(this.animT*0.15)*8;
        ctx.beginPath(); ctx.moveTo(cx, top+44); ctx.lineTo(cx+lean*22, top+60+sw); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, top+44); ctx.lineTo(cx-lean*18, top+62-sw); ctx.stroke();
      }
      // head
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(cx+lean*4, top+18+bob, 16, 0, 7); ctx.fill();
      // glow eye
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(cx+lean*9, top+16+bob, 3, 0, 7); ctx.fill();
      // special aura
      if(this.special>=100){
        ctx.strokeStyle='rgba(255,230,80,'+(0.4+0.3*Math.sin(this.animT*0.3))+')';
        ctx.lineWidth=3; ctx.beginPath(); ctx.arc(cx, top+50, 46, 0, 7); ctx.stroke();
      }
    }
  }

  // ----- game state -----
  const game = { state:'title', timer:99, tick:0, shake:0, round:1, twoPlayer:false, msg:'', msgT:0 };
  let p1, p2;

  function newFighters(){
    p1 = new Fighter(200, '#00e5ff', 'NEON', 1);
    p2 = new Fighter(W-260, '#ff2e88', 'BLAZE', -1);
  }
  newFighters();

  function startMatch(){
    newFighters();
    game.state='fight'; game.timer=99; game.tick=0; game.round=1;
    game.msg='ROUND 1'; game.msgT=90;
    shots.length=0; fx.length=0;
  }
  function nextRound(winner){
    winner.wins++;
    if(winner.wins>=2){ game.state='over'; game.msg=winner.name+' WINS!'; game.msgT=99999; return; }
    game.round++;
    p1.reset(200); p2.reset(W-260);
    shots.length=0;
    game.timer=99; game.msg='ROUND '+game.round; game.msgT=90;
  }

  // ----- simple CPU AI -----
  function cpu(self, opp){
    if(self.hitstun>0) return;
    const dist = Math.abs(self.cx-opp.cx);
    const dir = opp.cx>self.cx?1:-1;
    self.blocking = false;
    // block incoming attacks sometimes
    if(opp.attack && dist<90 && Math.random()<0.5){ self.blocking=true; return; }
    if(self.special>=100 && dist<420 && Math.random()<0.02){ self.startAttack('special'); return; }
    if(dist>120){ self.vx += dir*0.9; if(self.onGround && Math.random()<0.01) self.vy=-15; }
    else if(dist<70){
      if(Math.random()<0.06) self.startAttack(Math.random()<0.5?'punch':'kick');
      else if(Math.random()<0.02) self.vx -= dir*4;
    } else {
      self.vx += dir*0.5;
      if(Math.random()<0.03) self.startAttack('punch');
    }
  }

  function handleP1(){
    if(p1.hitstun>0) return;
    p1.blocking = !!keys['KeyS'];
    if(keys['KeyA']) p1.vx -= 0.9;
    if(keys['KeyD']) p1.vx += 0.9;
    if(keys['KeyW'] && p1.onGround){ p1.vy=-16; }
    if(keys['KeyF']) p1.startAttack('punch');
    if(keys['KeyG']) p1.startAttack('kick');
    if(keys['KeyH']) p1.startAttack('special');
  }
  function handleP2(){
    if(p2.hitstun>0) return;
    p2.blocking = !!keys['ArrowDown'];
    if(keys['ArrowLeft']) p2.vx -= 0.9;
    if(keys['ArrowRight']) p2.vx += 0.9;
    if(keys['ArrowUp'] && p2.onGround){ p2.vy=-16; }
    if(keys['KeyK']) p2.startAttack('punch');
    if(keys['KeyL']) p2.startAttack('kick');
    if(keys['Semicolon']) p2.startAttack('special');
  }

  function updateShots(){
    for(let i=shots.length-1;i>=0;i--){
      const s=shots[i]; s.x+=s.vx; s.life--;
      const tgt = s.owner===p1?p2:p1;
      const body={x:tgt.x,y:tgt.y,w:tgt.w,h:tgt.h};
      if(aabb(s,body)){ tgt.takeHit(16,11,Math.sign(s.vx)); spark(s.x,s.y,s.color,20); shots.splice(i,1); continue; }
      if(s.x<-40||s.x>W+40||s.life<=0) shots.splice(i,1);
    }
  }
  function drawShots(){
    shots.forEach(s=>{
      ctx.save(); ctx.shadowBlur=20; ctx.shadowColor=s.color; ctx.fillStyle=s.color;
      ctx.beginPath(); ctx.ellipse(s.x,s.y,18,13,0,0,7); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.ellipse(s.x,s.y,8,6,0,0,7); ctx.fill();
      ctx.restore();
    });
  }

  // ----- background -----
  function drawBg(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a0e24'); g.addColorStop(.6,'#160a2b'); g.addColorStop(1,'#04030a');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // distant skyline
    ctx.fillStyle='rgba(0,229,255,.08)';
    for(let i=0;i<14;i++){ const bw=W/14; const bh=80+((i*53)%120);
      ctx.fillRect(i*bw, FLOOR-bh, bw-6, bh); }
    ctx.fillStyle='rgba(255,46,136,.07)';
    for(let i=0;i<9;i++){ const bw=W/9; const bh=120+((i*97)%160);
      ctx.fillRect(i*bw+20, FLOOR-bh, bw-26, bh); }
    // grid floor
    ctx.strokeStyle='rgba(0,229,255,.25)'; ctx.lineWidth=1;
    for(let i=0;i<=20;i++){ const x=i*(W/20); ctx.beginPath(); ctx.moveTo(x,FLOOR); ctx.lineTo(W/2+(x-W/2)*3,H); ctx.stroke(); }
    for(let j=0;j<6;j++){ const y=FLOOR+j*j*3+2; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(0,FLOOR,W,H-FLOOR);
  }

  // ----- HUD -----
  function bar(x,y,w,hp,max,color,flip){
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(x,y,w,20);
    const pw=w*clamp(hp/max,0,1);
    ctx.fillStyle=color; ctx.shadowBlur=12; ctx.shadowColor=color;
    ctx.fillRect(flip? x+w-pw:x, y, pw, 20); ctx.shadowBlur=0;
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,20);
  }
  function meter(x,y,w,v,flip){
    ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(x,y,w,8);
    const pw=w*clamp(v/100,0,1);
    ctx.fillStyle = v>=100? '#ffe23c':'#ffae00';
    ctx.fillRect(flip? x+w-pw:x, y, pw, 8);
  }
  function drawHud(){
    bar(30,24,360,p1.hp,p1.maxhp,'#00e5ff',false);
    bar(W-390,24,360,p2.hp,p2.maxhp,'#ff2e88',true);
    meter(30,48,360,p1.special,false);
    meter(W-390,48,360,p2.special,true);
    ctx.fillStyle='#fff'; ctx.font='bold 18px Trebuchet MS'; ctx.textAlign='left';
    ctx.fillText(p1.name,30,18); ctx.textAlign='right'; ctx.fillText(p2.name,W-30,18);
    // timer
    ctx.textAlign='center'; ctx.font='bold 34px Trebuchet MS'; ctx.fillStyle='#fff';
    ctx.fillText(Math.ceil(game.timer), W/2, 46);
    // round pips
    for(let i=0;i<2;i++){
      ctx.fillStyle = i<p1.wins? '#00e5ff':'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.arc(W/2-40+i*14,58,5,0,7); ctx.fill();
      ctx.fillStyle = i<p2.wins? '#ff2e88':'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.arc(W/2+40-i*14,58,5,0,7); ctx.fill();
    }
  }

  function centerText(t,y,size,color){
    ctx.textAlign='center'; ctx.font='bold '+size+'px Trebuchet MS';
    ctx.fillStyle=color; ctx.shadowBlur=18; ctx.shadowColor=color;
    ctx.fillText(t,W/2,y); ctx.shadowBlur=0;
  }

  // ----- main loop -----
  function loop(){
    game.tick++;
    ctx.save();
    if(game.shake>0){ ctx.translate(rand(-game.shake,game.shake),rand(-game.shake,game.shake)); game.shake*=0.85; if(game.shake<0.5)game.shake=0; }
    drawBg();

    if(game.state==='fight'){
      if(game.msgT>0) game.msgT--;
      const live = game.msgT<60; // small freeze on round start
      if(live){
        handleP1();
        if(game.twoPlayer) handleP2(); else cpu(p2,p1);
        p1.update(p2); p2.update(p1);
        // assign attack ids for single-hit
        if(p1.attack && p1.attackT===(p1.attack==='punch'?14:p1.attack==='kick'?20:26)) p1.attackId=game.tick;
        if(p2.attack && p2.attackT===(p2.attack==='punch'?14:p2.attack==='kick'?20:26)) p2.attackId=game.tick;
        const h1=p1.hitbox(); if(h1){ const body={x:p2.x,y:p2.y,w:p2.w,h:p2.h};
          if(aabb(h1,body) && p2._lastId!==p1.attackId){ p2.takeHit(h1.dmg,h1.kb,p1.facing); p2._lastId=p1.attackId; } }
        const h2=p2.hitbox(); if(h2){ const body={x:p1.x,y:p1.y,w:p1.w,h:p1.h};
          if(aabb(h2,body) && p1._lastId!==p2.attackId){ p1.takeHit(h2.dmg,h2.kb,p2.facing); p1._lastId=p2.attackId; } }
        // keep apart
        if(aabb({x:p1.x,y:p1.y,w:p1.w,h:p1.h},{x:p2.x,y:p2.y,w:p2.w,h:p2.h})){
          const push=(p1.cx<p2.cx?-1:1); p1.x+=push*1.2; p2.x-=push*1.2;
        }
        updateShots();
        game.timer -= 1/60;
        if(game.timer<=0){ game.timer=0;
          if(p1.hp>p2.hp) nextRound(p1); else if(p2.hp>p1.hp) nextRound(p2); else { nextRound(p1.wins>=p2.wins?p1:p2); } }
        if(p1.hp<=0) nextRound(p2);
        else if(p2.hp<=0) nextRound(p1);
      } else { p1.update(p2); p2.update(p1); }
      updateFx();
      drawShots(); p1.draw(); p2.draw(); drawFx(); drawHud();
      if(game.msgT>0) centerText(game.msg, H/2-40, 60, '#fff');
    }
    else if(game.state==='title'){
      updateFx();
      p1.facing=1; p2.facing=-1; p1.draw(); p2.draw(); drawFx();
      centerText('NEON FIST', 170, 86, '#00e5ff');
      centerText('a tekken/street-fighter style brawler', 210, 22, '#ff2e88');
      ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
      centerText('PRESS ENTER TO FIGHT', 330, 30, '#fff'); ctx.globalAlpha=1;
      centerText('MODE: '+(game.twoPlayer?'2 PLAYERS':'1P vs CPU')+'  (press T to toggle)', 380, 20, '#7fdfff');
    }
    else if(game.state==='over'){
      updateFx(); p1.draw(); p2.draw(); drawFx(); drawHud();
      centerText(game.msg, H/2-30, 64, game.msg.startsWith(p1.name)?'#00e5ff':'#ff2e88');
      ctx.globalAlpha=0.6+0.4*Math.sin(game.tick*0.08);
      centerText('PRESS ENTER FOR REMATCH', H/2+30, 26, '#fff'); ctx.globalAlpha=1;
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }
  loop();
})();
