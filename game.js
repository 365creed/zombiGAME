(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha:false });

  // HUD elements
  const hpFill = document.getElementById("hpFill");
  const spFill = document.getElementById("spFill");
  const scoreText = document.getElementById("scoreText");
  const hiText = document.getElementById("hiText");
  const killText = document.getElementById("killText");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");

  // Touch UI
  const stick = document.getElementById("stick");
  const knob = document.getElementById("knob");
  const btnSlash = document.getElementById("btnSlash");
  const btnGuard = document.getElementById("btnGuard");
  const btnDash = document.getElementById("btnDash");
  const btnSpecial = document.getElementById("btnSpecial");

  // ---------- Helpers ----------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const rand = (a,b)=>a+Math.random()*(b-a);
  const randi = (a,b)=>Math.floor(rand(a,b+1));
  const hypot = Math.hypot;

    function spawnAfterimage(){
    state.after.push({
      x: player.x, y: player.y,
      fx: player.face.x, fy: player.face.y,
      t: 0, life: 0.22,
      guard: player.guarding,
      slash: player.slashing
    });
  }

  // ---------- Storage ----------
  const HI_KEY = "ink_blade_hi_v2";
  const loadHi = () => Number(localStorage.getItem(HI_KEY) || "0");
  const saveHi = (v) => localStorage.setItem(HI_KEY, String(v));

  // ---------- Visual theme ----------
  const PAPER = "#f1e6c8";
  const PAPER2 = "#eadbb4";
  const INK = (a)=>`rgba(15,23,42,${a})`;

  // ---------- Paper texture (cached) ----------
  const paper = document.createElement("canvas");
  paper.width = 512; paper.height = 512;
  const pctx = paper.getContext("2d");
  (function makePaper(){
    pctx.fillStyle = PAPER;
    pctx.fillRect(0,0,paper.width,paper.height);
    for(let i=0;i<14000;i++){
      const x = Math.random()*paper.width;
      const y = Math.random()*paper.height;
      const a = Math.random()*0.06;
      pctx.fillStyle = `rgba(15,23,42,${a})`;
      pctx.fillRect(x,y,1,1);
    }
    // warm wash
    const g = pctx.createRadialGradient(160,160,40, 280,280,460);
    g.addColorStop(0,"rgba(15,23,42,0.06)");
    g.addColorStop(1,"rgba(15,23,42,0)");
    pctx.fillStyle = g;
    pctx.fillRect(0,0,paper.width,paper.height);
  })();

  // ---------- Brush primitives (STRONG INK FEEL) ----------
  function brushStroke(points, w, a){
    ctx.save();
    ctx.lineCap="round"; ctx.lineJoin="round";
    for(let pass=0; pass<3; pass++){
      const jw = pass===0 ? 1.0 : (pass===1 ? 0.7 : 0.45);
      const jj = pass===0 ? 0.6 : (pass===1 ? 1.2 : 2.0);
      ctx.strokeStyle = INK(a * jw);
      ctx.lineWidth = w * jw;
      ctx.beginPath();
      for(let i=0;i<points.length;i++){
        const p = points[i];
        const x = p.x + (Math.random()*2-1)*jj;
        const y = p.y + (Math.random()*2-1)*jj;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function washCircle(x,y,r,a){
    ctx.save();
    ctx.fillStyle = INK(a);
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function splatter(x,y, power=1){
    for(let i=0;i<22;i++){
      const ang = Math.random()*Math.PI*2;
      const d = rand(2, 52) * power;
      const rx = x + Math.cos(ang)*d;
      const ry = y + Math.sin(ang)*d;
      const rr = rand(1.2, 7.0) * power;
      const aa = rand(0.05, 0.22);
      washCircle(rx, ry, rr, aa);
    }
  }

  // ---------- World / Camera (BIG MAP, portrait scroll) ----------
  const WORLD = { w: 2600, h: 5200 }; // “아주 넓게”
  const cam = { x: 0, y: 0, shake: 0 };

    // ---------- JUICE (Hitstop / Slowmo / Camera punch) ----------
  const juice = {
    hitStop: 0,          // seconds
    timeScale: 1,        // current scale
    targetScale: 1,      // target
    scaleT: 0,           // lerp timer
    punchX: 0, punchY: 0,
    punchVX: 0, punchVY: 0,
    lookX: 0, lookY: 0,  // camera look-ahead
  };

  function addHitStop(sec){
    juice.hitStop = Math.max(juice.hitStop, sec);
  }
  function addSlowmo(scale, sec){
    // ex) addSlowmo(0.7, 0.22)
    juice.targetScale = Math.min(juice.targetScale, scale);
    juice.scaleT = Math.max(juice.scaleT, sec);
  }
  function addPunch(dx, dy, strength){
    // direction punch
    const s = strength || 1;
    juice.punchVX += dx * 120 * s;
    juice.punchVY += dy * 120 * s;
  }


  // ---------- Input ----------
  const input = {
    up:false, down:false, left:false, right:false,
    slash:false, guard:false, dash:false, special:false,
    slashPressed:false, dashPressed:false, specialPressed:false,
    pointerStick:false,
    stickId:null,
    stickCenter:{x:0,y:0},
    stickVec:{x:0,y:0},
  };

  // ---------- Player ----------
  const player = {
    x: WORLD.w*0.5,
    y: WORLD.h*0.85,
    vx: 0, vy: 0,
    face: {x:0,y:-1},
    hp: 100,
    hpMax: 100,

    sp: 0,     // 기(氣) 0..100
    spMax: 100,

    // movement
    speed: 520,
    dashSpeed: 980,
    dashT: 0,
    dashDur: 0.16,
    dashing: false,
    dashCD: 0,

    // combat
    slashing:false,
    slashT:0,
    slashDur:0.14,
    slashCD:0,

    guarding:false,
    parryWindow:0,   // 0.. seconds
    parryCool:0,

    invuln:0,
    stun:0,
  };

  // ---------- Enemies ----------
  const ENEMY_TYPES = {
    dokkaebi: { name:"도깨비", hp: 55, spd: 260, atkRange: 70, atkCD: 0.85, dmg: 18, weight: 0.38, kind:"dokkaebi" },
    ghost:    { name:"귀신",   hp: 35, spd: 300, atkRange: 85, atkCD: 0.95, dmg: 14, weight: 0.28, kind:"ghost" },
    gate:     { name:"수문장", hp: 120,spd: 200, atkRange: 95, atkCD: 1.25, dmg: 28, weight: 0.18, kind:"gate" },
    wraith:   { name:"무사 망령", hp: 80, spd: 280, atkRange: 85, atkCD: 0.95, dmg: 22, weight: 0.16, kind:"wraith" },
  };

  const state = {
    started:false,
    running:false,
    over:false,
    last:0,
    t:0,
    score:0,
    hi: loadHi(),
    kills:0,
    wave:1,
    spawnT:0,
    spawnEvery: 1.1,
    enemies: [],
    fx: [],
    flash:0,
  };

  function pickEnemyType(){
    const r = Math.random();
    let acc = 0;
    for(const k of Object.keys(ENEMY_TYPES)){
      acc += ENEMY_TYPES[k].weight;
      if(r <= acc) return ENEMY_TYPES[k];
    }
    return ENEMY_TYPES.dokkaebi;
  }

  function spawnEnemy(){
    const t = pickEnemyType();
    // spawn around camera/player but off-screen-ish
    const ring = rand(520, 860);
    const ang = rand(0, Math.PI*2);
    const x = clamp(player.x + Math.cos(ang)*ring, 80, WORLD.w-80);
    const y = clamp(player.y + Math.sin(ang)*ring, 120, WORLD.h-120);

    state.enemies.push({
      type: t,
      x,y, vx:0, vy:0,
      hp: t.hp,
      atkCD: rand(0.2, t.atkCD),
      teleT: 0, // for ghost fade
      hurt:0,
      stun:0,
      windup:0, // attack windup timer
      attacking:false,
    });
  }

  // ---------- Overlay ----------
  function showOverlay(on){
    overlay.style.display = on ? "flex" : "none";
  }

  function reset(){
    state.started=false; state.running=false; state.over=false;
    state.last=0; state.t=0;
    state.score=0; state.kills=0; state.wave=1;
    state.spawnT=0; state.spawnEvery=1.1;
    state.enemies.length=0; state.fx.length=0;
    state.flash=0;

    player.x= WORLD.w*0.5;
    player.y= WORLD.h*0.85;
    player.vx=0; player.vy=0;
    player.face={x:0,y:-1};
    player.hp=player.hpMax;
    player.sp=0;
    player.dashing=false; player.dashT=0; player.dashCD=0;
    player.slashing=false; player.slashT=0; player.slashCD=0;
    player.guarding=false; player.parryWindow=0; player.parryCool=0;
    player.invuln=0; player.stun=0;

    cam.shake=0;
    showOverlay(true);

    updateHUD();
  }

  function start(){
    if(state.running) return;
    state.started=true;
    state.running=true;
    state.over=false;
    showOverlay(false);

    // spawn initial
    for(let i=0;i<4;i++) spawnEnemy();
  }

  function gameOver(){
    state.running=false;
    state.over=true;
    showOverlay(true);
  }

  // ---------- HUD ----------
  function updateHUD(){
    const hpPct = clamp(player.hp/player.hpMax, 0, 1);
    const spPct = clamp(player.sp/player.spMax, 0, 1);
    hpFill.style.width = `${hpPct*100}%`;
    spFill.style.width = `${spPct*100}%`;

    scoreText.textContent = Math.floor(state.score);
    hiText.textContent = state.hi;
    killText.textContent = state.kills;
  }

  // ---------- Keyboard ----------
  window.addEventListener("keydown", (e)=>{
    const k = e.code;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyJ","KeyK","KeyL","KeyI"].includes(k)) e.preventDefault();

    if(k==="ArrowUp"||k==="KeyW") input.up=true;
    if(k==="ArrowDown"||k==="KeyS") input.down=true;
    if(k==="ArrowLeft"||k==="KeyA") input.left=true;
    if(k==="ArrowRight"||k==="KeyD") input.right=true;

    if(k==="KeyJ"){ input.slash=true; input.slashPressed=true; }
    if(k==="KeyK"){ input.guard=true; }
    if(k==="KeyL"){ input.dash=true; input.dashPressed=true; }
    if(k==="KeyI"){ input.special=true; input.specialPressed=true; }

    if(k==="Enter"){ start(); }
    if(k==="KeyR"){ reset(); }
  }, {passive:false});

  window.addEventListener("keyup", (e)=>{
    const k = e.code;
    if(k==="ArrowUp"||k==="KeyW") input.up=false;
    if(k==="ArrowDown"||k==="KeyS") input.down=false;
    if(k==="ArrowLeft"||k==="KeyA") input.left=false;
    if(k==="ArrowRight"||k==="KeyD") input.right=false;

    if(k==="KeyJ") input.slash=false;
    if(k==="KeyK") input.guard=false;
    if(k==="KeyL") input.dash=false;
    if(k==="KeyI") input.special=false;
  });

  // ---------- Touch controls ----------
  startBtn.addEventListener("click", start);
  resetBtn.addEventListener("click", reset);

  btnSlash.addEventListener("pointerdown", ()=>{ input.slashPressed=true; });
  btnDash.addEventListener("pointerdown", ()=>{ input.dashPressed=true; });
  btnSpecial.addEventListener("pointerdown", ()=>{ input.specialPressed=true; });
  btnGuard.addEventListener("pointerdown", ()=>{ input.guard=true; });
  btnGuard.addEventListener("pointerup", ()=>{ input.guard=false; });
  btnGuard.addEventListener("pointercancel", ()=>{ input.guard=false; });

  // joystick
  stick.addEventListener("pointerdown", (e)=>{
    input.pointerStick=true;
    input.stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    input.stickCenter.x = r.left + r.width/2;
    input.stickCenter.y = r.top + r.height/2;
    stick.setPointerCapture(e.pointerId);
  });

  stick.addEventListener("pointermove", (e)=>{
    if(!input.pointerStick || e.pointerId !== input.stickId) return;
    const dx = e.clientX - input.stickCenter.x;
    const dy = e.clientY - input.stickCenter.y;
    const max = 52;
    const mag = Math.hypot(dx,dy) || 1;
    const nx = clamp(dx/mag, -1, 1);
    const ny = clamp(dy/mag, -1, 1);
    const amt = clamp(mag/max, 0, 1);
    input.stickVec.x = nx * amt;
    input.stickVec.y = ny * amt;

    knob.style.transform = `translate(${(-50 + input.stickVec.x*42)}%, ${(-50 + input.stickVec.y*42)}%)`;
  });

  function endStick(){
    input.pointerStick=false;
    input.stickId=null;
    input.stickVec.x=0; input.stickVec.y=0;
    knob.style.transform = "translate(-50%,-50%)";
  }
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  // ---------- Combat mechanics ----------
  function doDash(dir){
    if(player.dashCD>0 || player.dashing || player.stun>0) return;
    player.dashing=true;
    player.dashT=0;
    player.dashCD=0.28;
    player.invuln = Math.max(player.invuln, 0.18);

    const mag = Math.hypot(dir.x, dir.y) || 1;
    player.vx = (dir.x/mag) * player.dashSpeed;
    player.vy = (dir.y/mag) * player.dashSpeed;

    splatter(player.x, player.y, 0.9);
    cam.shake = Math.max(cam.shake, 7);
  }

  function doSlash(){
    if(player.slashCD>0 || player.slashing || player.stun>0) return;
    player.slashing=true;
    player.slashT=0;
    player.slashCD=0.18;
    cam.shake = Math.max(cam.shake, 5);

    // small SP gain on swing (hit gives more)
    player.sp = clamp(player.sp + 2.5, 0, player.spMax);
  }

  function doSpecial(){
    if(player.sp < player.spMax || player.stun>0) return;
    player.sp = 0;

    // “필살기: 묵풍일섬(墨風一閃)” — 큰 원형 베기 + 화면 먹번짐
    cam.shake = Math.max(cam.shake, 16);
    state.flash = 1;

    // hit all enemies in radius
    const R = 260;
    for(const e of state.enemies){
      const d = hypot(e.x-player.x, e.y-player.y);
      if(d < R){
        e.hp -= 55;
        e.hurt = 1;
        e.stun = Math.max(e.stun, 0.7);
        splatter(e.x, e.y, 1.4);
      }
    }

    // FX ring
    state.fx.push({ kind:"ring", x:player.x, y:player.y, t:0, life:0.35, r:30, R:290 });
    splatter(player.x, player.y, 1.6);
  }

  function startParryWindow(){
    if(player.parryCool>0) return;
    player.parryWindow = 0.14; // 타이밍 창
    player.parryCool = 0.18;
  }

  function takeDamage(dmg){
    if(player.invuln>0) return;
    if(player.guarding){
      // guard reduces damage; if in parry window and timing => no dmg
      if(player.parryWindow>0){
        // perfect parry
        player.sp = clamp(player.sp + 24, 0, player.spMax);
        cam.shake = Math.max(cam.shake, 12);
        splatter(player.x, player.y, 1.2);
        state.fx.push({ kind:"kanji", x:player.x, y:player.y-60, t:0, life:0.35, text:"破" });
        addHitStop(0.08);
        addSlowmo(0.78, 0.16);
        addPunch(-player.face.x||0, -player.face.y||1, 1.4);
        return "parry";
      }
      player.hp -= dmg * 0.18;
      player.sp = clamp(player.sp + 8, 0, player.spMax);
      player.invuln = 0.12;
      cam.shake = Math.max(cam.shake, 8);
      splatter(player.x, player.y, 0.8);
      return "guard";
    }

    // normal hit
    player.hp -= dmg;
    player.invuln = 0.38;
    player.stun = Math.max(player.stun, 0.18);
    cam.shake = Math.max(cam.shake, 14);
    splatter(player.x, player.y, 1.2);
    state.flash = 1;
    addHitStop(0.08);
    addSlowmo(0.78, 0.16);
    addPunch(-player.face.x||0, -player.face.y||1, 1.4);

    if(player.hp <= 0){
      player.hp = 0;
      // save hi
      const s = Math.floor(state.score);
      if(s > state.hi){ state.hi = s; saveHi(state.hi); }
      gameOver();
    }
    return "hit";
  }

  // ---------- Attack resolution ----------
  function slashHits(e){
    // slash cone in front
    const range = 120;
    const angle = 0.85; // radians cone half-angle
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d = Math.hypot(dx,dy);
    if(d > range) return false;

    const fx = player.face.x, fy = player.face.y;
    const dot = (dx/d)*fx + (dy/d)*fy;
    const ang = Math.acos(clamp(dot, -1, 1));
    return ang < angle;
  }

  // ---------- Drawing: world ----------
  function draw(){
    // camera look-ahead (towards facing direction)
    const lookAmt = 120; // feel free: 80~160
    juice.lookX = lerp(juice.lookX, (player.face.x||0) * lookAmt, 1 - Math.pow(0.001, state.dt||0.016));
    juice.lookY = lerp(juice.lookY, (player.face.y||-1) * (lookAmt*0.75), 1 - Math.pow(0.001, state.dt||0.016));

    // camera punch spring (screen-space)
    const spring = 70;
    const damp = 14;
    juice.punchVX += (-juice.punchX * spring - juice.punchVX * damp) * (state.dt||0.016);
    juice.punchVY += (-juice.punchY * spring - juice.punchVY * damp) * (state.dt||0.016);
    juice.punchX += juice.punchVX * (state.dt||0.016);
    juice.punchY += juice.punchVY * (state.dt||0.016);

    const targetCamX = clamp((player.x + juice.lookX) - canvas.width/2, 0, WORLD.w - canvas.width);
    const targetCamY = clamp((player.y + juice.lookY) - canvas.height*0.62, 0, WORLD.h - canvas.height);
    
    // camera follow
    const targetCamX = clamp(player.x - canvas.width/2, 0, WORLD.w - canvas.width);
    const targetCamY = clamp(player.y - canvas.height*0.62, 0, WORLD.h - canvas.height);
    cam.x = lerp(cam.x, targetCamX, 1 - Math.pow(0.001, state.dt));
    cam.y = lerp(cam.y, targetCamY, 1 - Math.pow(0.001, state.dt));

    const shake = cam.shake;
    const sx = (Math.random()*2-1)*shake;
    const sy = (Math.random()*2-1)*shake;
    cam.shake = Math.max(0, cam.shake - state.dt*30);

    ctx.save();
    ctx.translate(-cam.x + sx + juice.punchX, -cam.y + sy + juice.punchY);

    // paper tile
    for(let yy = Math.floor(cam.y/512)*512; yy < cam.y + canvas.height + 512; yy+=512){
      for(let xx = Math.floor(cam.x/512)*512; xx < cam.x + canvas.width + 512; xx+=512){
        ctx.drawImage(paper, xx, yy);
      }
    }

    // subtle washes/“먹 번짐” terrain
    drawTerrainWashes();

    // landmarks (ink-only): gates, pagoda, bridges-ish in black brush
    drawLandmarks();

    // enemies
    for(const e of state.enemies) drawEnemy(e);

    // afterimages behind player
    for(const a of state.after){
      const k = a.t / a.life;
      const alpha = clamp(1 - k, 0, 1) * 0.10;
      ctx.fillStyle = INK(alpha);
      ctx.beginPath(); roundRect(a.x-18, a.y-86, 36, 72, 14); ctx.fill();
      ctx.beginPath(); roundRect(a.x-16, a.y-124, 32, 36, 14); ctx.fill();
      // sword faint
      brushStroke([{x:a.x + a.fx*18, y:a.y-64 + a.fy*6}, {x:a.x + a.fx*88, y:a.y-64 + a.fy*76}], 7, alpha);
    }

    // player
    drawPlayer();

    // FX
    drawFX();

    ctx.restore();

    // screen veil on special/hit
    if(state.flash>0){
      ctx.save();
      ctx.fillStyle = INK(0.18*state.flash);
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.restore();
    }
  }

  function drawTerrainWashes(){
    // big moving wash band (gives “living paper” feel)
    const t = state.t*0.06;
    for(let i=0;i<5;i++){
      const x = (Math.sin(t + i*1.3)*0.5+0.5) * WORLD.w;
      const y = (Math.cos(t*1.2 + i*0.9)*0.5+0.5) * WORLD.h;
      ctx.fillStyle = INK(0.03);
      ctx.beginPath();
      ctx.ellipse(x, y, 420, 260, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawLandmarks(){
    // 간단하지만 “수묵” 분위기 주는 상징 오브젝트들(검정만)
    // 1) 큰 문(광화문 느낌)
    inkGate(420, 820, 1.2);
    // 2) 산세(남산 느낌)
    inkMountain(1900, 1100, 1.4);
    // 3) 다리(한강 느낌)
    inkBridge(520, 2600, 1.4);
    // 4) 궁 지붕
    inkRoof(1700, 3600, 1.5);
  }

  function inkGate(x,y,s){
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    ctx.fillStyle = INK(0.06);
    ctx.fillRect(-170,-10,340,36);
    brushStroke([{x:-190,y:-10},{x:0,y:-120},{x:190,y:-10}], 12, 0.12);
    brushStroke([{x:-170,y:0},{x:170,y:0}], 10, 0.12);
    brushStroke([{x:-120,y:0},{x:-120,y:170}], 12, 0.12);
    brushStroke([{x:120,y:0},{x:120,y:170}], 12, 0.12);
    ctx.restore();
  }
  function inkMountain(x,y,s){
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    const pts=[];
    for(let i=0;i<=12;i++){
      pts.push({x:-220 + i*(440/12), y: 40 + Math.sin(i*0.8 + state.t*0.2)*40 + (i%3)*12});
    }
    brushStroke(pts, 16, 0.10);
    ctx.fillStyle = INK(0.04);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(const p of pts) ctx.lineTo(p.x,p.y);
    ctx.lineTo(220, 220); ctx.lineTo(-220,220);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function inkBridge(x,y,s){
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    brushStroke([{x:-260,y:60},{x:0,y:-80},{x:260,y:60}], 14, 0.10);
    brushStroke([{x:-300,y:60},{x:300,y:60}], 16, 0.10);
    ctx.restore();
  }
  function inkRoof(x,y,s){
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    brushStroke([{x:-220,y:30},{x:0,y:-100},{x:220,y:30}], 14, 0.11);
    brushStroke([{x:-200,y:30},{x:200,y:30}], 12, 0.11);
    brushStroke([{x:-160,y:30},{x:-160,y:140}], 12, 0.11);
    brushStroke([{x:160,y:30},{x:160,y:140}], 12, 0.11);
    ctx.restore();
  }

  function drawPlayer(){
    // player silhouette + sword (black only), strong brush lines
    const x=player.x, y=player.y;
    const spdNow = Math.hypot(player.vx, player.vy);
    const lean = clamp(spdNow / 900, 0, 1) * 0.18; // radians
    const ang = Math.atan2(player.vy, player.vx);
    ctx.save();
    ctx.translate(x, y-60);
    ctx.rotate(isFinite(ang) ? ang * 0.15 : 0);
    ctx.rotate(lean * (player.dashing ? 1.4 : 1.0));
    ctx.translate(-x, -(y-60));
    ctx.restore();

    // aura when guarding/parry
    if(player.guarding){
      ctx.fillStyle = INK(0.05);
      ctx.beginPath(); ctx.ellipse(x, y-20, 70, 48, 0, 0, Math.PI*2); ctx.fill();
    }
    if(player.invuln>0){
      ctx.fillStyle = INK(0.04);
      ctx.beginPath(); ctx.ellipse(x, y-20, 90, 60, 0, 0, Math.PI*2); ctx.fill();
    }

    // shadow
    ctx.fillStyle = INK(0.10);
    ctx.beginPath(); ctx.ellipse(x, y+12, 52, 16, 0, 0, Math.PI*2); ctx.fill();

    // body wash
    ctx.fillStyle = INK(0.10);
    ctx.beginPath(); roundRect(x-18,y-86,36,72,14); ctx.fill();
    ctx.beginPath(); roundRect(x-16,y-124,32,36,14); ctx.fill();

    // outline
    brushStroke([{x:x-18,y:y-86},{x:x+18,y:y-86},{x:x+18,y:y-14},{x:x-18,y:y-14},{x:x-18,y:y-86}], 6, 0.18);
    brushStroke([{x:x-16,y:y-124},{x:x+16,y:y-124},{x:x+16,y:y-88},{x:x-16,y:y-88},{x:x-16,y:y-124}], 5, 0.16);

    // sword direction
    const fx = player.face.x || 0;
    const fy = player.face.y || -1;
    const sx = x + fx*18, sy = y-64 + fy*6;
    brushStroke([{x:sx, y:sy}, {x:sx + fx*70, y:sy + fy*70}], 8, 0.18);
    brushStroke([{x:sx, y:sy}, {x:sx - fy*20, y:sy + fx*20}], 8, 0.12);

    // slash arc
    if(player.slashing){
      const t = player.slashT/player.slashDur;
      const a = clamp(1-t, 0, 1);
      const arcPts=[];
      const R=120;
      const baseAng = Math.atan2(fy, fx);
      const start = baseAng - 1.2;
      const end = baseAng + 1.2;
      for(let i=0;i<=10;i++){
        const u=i/10;
        const ang = lerp(start, end, u);
        arcPts.push({x:x + Math.cos(ang)*R, y:(y-70) + Math.sin(ang)*R*0.7});
      }
      brushStroke(arcPts, 18, 0.14*a);
      splatter(x + fx*60, y-60, 0.6*a);
    }
  }

  function drawEnemy(e){
    const x=e.x, y=e.y;

    // ghost fades
    let alpha = 0.14;
    if(e.type.kind==="ghost"){
      alpha = 0.10 + 0.04*(Math.sin(state.t*3 + e.teleT)*0.5+0.5);
      e.teleT += state.dt*2;
    }

    // shadow
    ctx.fillStyle = INK(0.10);
    ctx.beginPath(); ctx.ellipse(x, y+12, 50, 16, 0, 0, Math.PI*2); ctx.fill();

    // body wash
    ctx.fillStyle = INK(alpha + (e.type.kind==="gate"?0.03:0));
    ctx.beginPath(); roundRect(x-20,y-92,40,78,14); ctx.fill();
    ctx.beginPath(); roundRect(x-18,y-132,36,40,14); ctx.fill();

    // outline heavier for gatekeeper/wraith
    const w = (e.type.kind==="gate") ? 8 : (e.type.kind==="wraith" ? 7 : 6);
    brushStroke([{x:x-20,y:y-92},{x:x+20,y:y-92},{x:x+20,y:y-14},{x:x-20,y:y-14},{x:x-20,y:y-92}], w, 0.18);
    brushStroke([{x:x-18,y:y-132},{x:x+18,y:y-132},{x:x+18,y:y-92},{x:x-18,y:y-92},{x:x-18,y:y-132}], w-1, 0.16);

    // horns / helmet / mask by type
    if(e.type.kind==="dokkaebi"){
      brushStroke([{x:x-10,y:y-132},{x:x-32,y:y-150}], 7, 0.16);
      brushStroke([{x:x+10,y:y-132},{x:x+32,y:y-150}], 7, 0.16);
    } else if(e.type.kind==="gate"){
      // helmet crest
      brushStroke([{x:x-36,y:y-142},{x:x+36,y:y-142}], 10, 0.14);
      brushStroke([{x:x,y:y-162},{x:x,y:y-132}], 8, 0.14);
    } else if(e.type.kind==="wraith"){
      // samurai shoulder plates
      brushStroke([{x:x-40,y:y-78},{x:x-18,y:y-64}], 9, 0.14);
      brushStroke([{x:x+40,y:y-78},{x:x+18,y:y-64}], 9, 0.14);
    } else if(e.type.kind==="ghost"){
      // trailing tail
      brushStroke([{x:x,y:y-14},{x:x-30,y:y+60},{x:x+30,y:y+110}], 10, 0.10);
    }

    // eyes
    ctx.fillStyle = INK(0.45);
    washCircle(x-7, y-112, 2.8, 0.45);
    washCircle(x+7, y-112, 2.8, 0.45);

    // hurt flash
    if(e.hurt>0){
      ctx.fillStyle = INK(0.06*e.hurt);
      ctx.fillRect(x-60, y-170, 120, 220);
    }

    // windup cue (attack) — ink ring
    if(e.windup>0){
      const a = clamp(e.windup/0.26, 0, 1);
      ctx.fillStyle = INK(0.02 + 0.04*a);
      ctx.beginPath(); ctx.ellipse(x, y+10, 70, 24, 0, 0, Math.PI*2); ctx.fill();
      brushStroke([{x:x-70,y:y+10},{x:x+70,y:y+10}], 6, 0.10*a);
    }
  }

  function drawFX(){
    for(const f of state.fx){
      if(f.kind==="ring"){
        const t = f.t/f.life;
        const r = lerp(f.r, f.R, t);
        const a = clamp(1-t, 0, 1);
        const pts=[];
        const steps=24;
        for(let i=0;i<=steps;i++){
          const ang = (i/steps)*Math.PI*2;
          pts.push({x:f.x + Math.cos(ang)*r, y:f.y + Math.sin(ang)*r*0.62});
        }
        brushStroke(pts, 14, 0.12*a);
      } else if(f.kind==="kanji"){
        const t = f.t/f.life;
        const a = clamp(1-t, 0, 1);
        ctx.save();
        ctx.fillStyle = INK(0.18*a);
        ctx.font = `900 ${Math.floor(44 + 14*(1-t))}px system-ui`;
        ctx.fillText(f.text, f.x-14, f.y);
        ctx.restore();
      }
    }
  }

  function roundRect(x,y,w,h,r){
    // canvas roundRect polyfill
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  // ---------- Update loop ----------
  function update(dt){
    state.dt = dt;
    state.t += dt;

    if(!state.running) return;

    // wave scaling + spawn
    state.score += dt * (90 + state.wave*6);
    const targetWave = 1 + Math.floor(state.score/700);
    state.wave = Math.max(state.wave, targetWave);

    state.spawnEvery = clamp(1.2 - (state.wave-1)*0.06, 0.45, 1.2);
    state.spawnT += dt;
    if(state.spawnT >= state.spawnEvery){
      state.spawnT = 0;
      spawnEnemy();
      if(state.wave >= 6 && Math.random() < 0.35) spawnEnemy();
    }

    // cooldowns
    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.stun = Math.max(0, player.stun - dt);
    player.parryWindow = Math.max(0, player.parryWindow - dt);
    player.parryCool = Math.max(0, player.parryCool - dt);

    // guard state + parry detection
    if(input.guard && player.stun<=0){
      if(!player.guarding){
        // guard press moment -> open parry timing
        startParryWindow();
      }
      player.guarding = true;
    } else {
      player.guarding = false;
    }

    // movement direction (keyboard + joystick)
    let mx = 0, my = 0;
    if(input.left) mx -= 1;
    if(input.right) mx += 1;
    if(input.up) my -= 1;
    if(input.down) my += 1;

    // stick adds
    mx += input.stickVec.x;
    my += input.stickVec.y;
    after: [],

    // normalize
    const mm = Math.hypot(mx,my);
    if(mm > 1e-6){
      mx/=mm; my/=mm;
      player.face.x = lerp(player.face.x, mx, 1 - Math.pow(0.001, dt));
      player.face.y = lerp(player.face.y, my, 1 - Math.pow(0.001, dt));
    }

    // actions
    if(input.dashPressed){
      input.dashPressed=false;
      if(mm > 1e-6) doDash({x:mx,y:my});
      else doDash({x:player.face.x||0, y:player.face.y||-1});
    }

    if(input.slashPressed){
      input.slashPressed=false;
      doSlash();
    }

    if(input.specialPressed){
      input.specialPressed=false;
      doSpecial();
    }

    // dash update
    if(player.dashing){
      player.dashT += dt;
      const t = player.dashT / player.dashDur;
      if(t >= 1){
        player.dashing=false;
        // stop dash momentum
        player.vx *= 0.25; player.vy *= 0.25;
      } else {
        player.invuln = Math.max(player.invuln, 0.12);
      }
      if(Math.random() < dt * 22){
        spawnAfterimage();
      }
    }

    // movement physics
    if(player.stun > 0){
      // when stunned, damp
      player.vx *= Math.pow(0.001, dt);
      player.vy *= Math.pow(0.001, dt);
    } else if(!player.dashing){
      // free move
      const spd = player.speed * (player.guarding ? 0.62 : 1.0);
      const tx = mx * spd;
      const ty = my * spd;
      // springy acceleration for smoothness
      player.vx = lerp(player.vx, tx, 1 - Math.pow(0.001, dt));
      player.vy = lerp(player.vy, ty, 1 - Math.pow(0.001, dt));
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 60, WORLD.w-60);
    player.y = clamp(player.y, 80, WORLD.h-80);

    // slash update + hit enemies
    if(player.slashing){
      player.slashT += dt;
      const t = player.slashT/player.slashDur;
      const dmgOn = (t > 0.18 && t < 0.70);

      if(dmgOn){
        for(const e of state.enemies){
          if(e.hp <= 0) continue;
          if(slashHits(e)){
            e.hp -= 22;
            e.hurt = 1;
            e.stun = Math.max(e.stun, 0.20);
            splatter(e.x, e.y, 0.9);
            cam.shake = Math.max(cam.shake, 10);
            player.sp = clamp(player.sp + 10, 0, player.spMax);

             // JUICE: hit confirm
            addHitStop(0.055);
            addSlowmo(0.86, 0.10);
            addPunch(player.face.x||0, player.face.y||-1, 1.0);
          }
        }
      }

      if(player.slashT >= player.slashDur){
        player.slashing=false;
        player.slashT=0;
      }
    }

    // enemies AI + attacks
    for(const e of state.enemies){
      if(e.hp <= 0) continue;

      e.hurt = Math.max(0, e.hurt - dt*4);
      e.stun = Math.max(0, e.stun - dt*1.8);
      e.atkCD -= dt;

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx,dy) || 1;

      // ghost phase: sometimes blink closer
      if(e.type.kind==="ghost" && Math.random() < dt*0.25){
        const step = rand(40, 90);
        e.x += (dx/d)*step;
        e.y += (dy/d)*step;
        splatter(e.x, e.y, 0.35);
      }

      if(e.stun > 0){
        e.vx *= Math.pow(0.001, dt);
        e.vy *= Math.pow(0.001, dt);
      } else {
        // approach
        const spd = e.type.spd * (e.type.kind==="gate" ? 0.92 : 1);
        e.vx = lerp(e.vx, (dx/d)*spd, 1 - Math.pow(0.001, dt));
        e.vy = lerp(e.vy, (dy/d)*spd, 1 - Math.pow(0.001, dt));
      }

      // attack windup + strike (Sekiro-ish)
      const inRange = d < e.type.atkRange;

      if(inRange && e.atkCD <= 0 && !e.attacking){
        e.attacking = true;
        e.windup = 0.26; // telegraph time
      }

      if(e.attacking){
        e.windup -= dt;
        if(e.windup <= 0){
          // strike moment
          e.attacking = false;
          e.atkCD = e.type.atkCD + rand(-0.12, 0.12);

          const distNow = Math.hypot(player.x - e.x, player.y - e.y);
          if(distNow < e.type.atkRange + 18){
            const res = takeDamage(e.type.dmg);
            if(res === "parry"){
              // enemy stunned hard
              e.stun = Math.max(e.stun, 0.75);
              e.hurt = 1;
              e.hp -= 10; // parry chip
              splatter(e.x, e.y, 1.1);
              state.fx.push({ kind:"kanji", x:e.x, y:e.y-70, t:0, life:0.35, text:"弾" });
            } else if(res === "guard"){
              // guard pushes back slightly
              e.x -= (dx/d)*26;
              e.y -= (dy/d)*26;
            }
          }
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, 60, WORLD.w-60);
      e.y = clamp(e.y, 80, WORLD.h-80);
    }

    // cleanup dead
    for(let i=state.enemies.length-1;i>=0;i--){
      const e = state.enemies[i];
      if(e.hp > 0) continue;

      state.enemies.splice(i,1);
      state.kills += 1;
      state.score += 180 + state.wave*20;
      splatter(e.x, e.y, 1.5);
      cam.shake = Math.max(cam.shake, 12);
      // SP reward
      player.sp = clamp(player.sp + 18, 0, player.spMax);
    }
        for(const a of state.after) a.t += dt;
    state.after = state.after.filter(a => a.t < a.life);

    // FX update
    for(const f of state.fx){
      f.t += dt;
    }
    state.fx = state.fx.filter(f => f.t < f.life);

    // flash decay
    state.flash = Math.max(0, state.flash - dt*1.8);

    // save hi live
    const s = Math.floor(state.score);
    if(s > state.hi){ state.hi = s; saveHi(state.hi); }

    updateHUD();
  }

  // ---------- Main loop ----------
  function loop(ts){
    if(!state.last) state.last = ts;
        const rawDt = clamp((ts - state.last)/1000, 0, 0.033);
    state.last = ts;

    // hitstop: time freezes but we still decay hitstop using rawDt
    if(juice.hitStop > 0){
      juice.hitStop = Math.max(0, juice.hitStop - rawDt);
      // still draw (freeze update)
      // dt = 0
      update(0);
    } else {
      // slowmo scale settle
      if(juice.scaleT > 0){
        juice.scaleT = Math.max(0, juice.scaleT - rawDt);
      } else {
        juice.targetScale = 1;
      }
      // smooth timescale
      juice.timeScale = lerp(juice.timeScale, juice.targetScale, 1 - Math.pow(0.001, rawDt));
      update(rawDt * juice.timeScale);
    }
    state.last = ts;

    update(dt);

    // Clear screen (paper base)
    ctx.fillStyle = PAPER;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // draw world
    draw();

    requestAnimationFrame(loop);
  }

  // ---------- Start ----------
  reset();
  hiText.textContent = state.hi;
  requestAnimationFrame(loop);

  // Overlay click starts
  overlay.addEventListener("pointerdown", ()=>{
    if(!state.started) start();
    else if(state.over) reset();
  });
})();
