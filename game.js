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
  const hypot = Math.hypot;

  // ---------- SOUND (mobile safe) ----------
  const Sound = {
    ctx: null,
    unlocked: false,
    buffers: {},
    master: 0.9,

    init(){
      if(this.unlocked) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.unlocked = true;
    },

    async load(name, urls){
      const list = [];
      for(const url of urls){
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(arr);
        list.push(buf);
      }
      this.buffers[name] = list;
    },

    play(name, vol=1, pitchRand=0){
      if(!this.unlocked) return;
      const list = this.buffers[name];
      if(!list || !list.length) return;

      const buf = list[(Math.random()*list.length)|0];
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();

      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random()*2-1)*pitchRand;
      gain.gain.value = vol * this.master;

      src.connect(gain).connect(this.ctx.destination);
      src.start();
    }
  };

  // ---------- Storage ----------
  const HI_KEY = "ink_blade_hi_v3";
  const loadHi = () => Number(localStorage.getItem(HI_KEY) || "0");
  const saveHi = (v) => localStorage.setItem(HI_KEY, String(v));

  // ---------- Visual theme ----------
  const PAPER = "#f1e6c8";
  const INK = (a)=>`rgba(15,23,42,${a})`;

  // ---------- JUICE ----------
  const juice = {
    hitStop: 0,
    timeScale: 1,
    targetScale: 1,
    scaleT: 0,
    punchX: 0, punchY: 0,
    punchVX: 0, punchVY: 0,
    lookX: 0, lookY: 0
  };

  function addHitStop(sec){ juice.hitStop = Math.max(juice.hitStop, sec); }
  function addSlowmo(scale, sec){
    juice.targetScale = Math.min(juice.targetScale, scale);
    juice.scaleT = Math.max(juice.scaleT, sec);
  }
  function addPunch(dx, dy, strength=1){
    juice.punchVX += dx * 120 * strength;
    juice.punchVY += dy * 120 * strength;
  }

  // ---------- World ----------
  const WORLD = { w: 2600, h: 5200 };
  const cam = { x: 0, y: 0, shake: 0 };

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
    hp: 100, hpMax: 100,
    sp: 0, spMax: 100,

    speed: 520,
    dashSpeed: 980,
    dashT: 0, dashDur: 0.16,
    dashing: false,
    dashCD: 0,

    slashing:false,
    slashT:0, slashDur:0.14,
    slashCD:0,

    guarding:false,
    parryWindow:0,
    parryCool:0,
    parryPerfect:false,

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
    started:false, running:false, over:false,
    last:0, t:0,
    score:0, hi: loadHi(), kills:0,
    wave:1, spawnT:0, spawnEvery:1.1,
    enemies: [], fx: [], flash:0,
    after: []
  };

  function spawnEnemy(){
    const t = pickEnemyType();
    const elite = Math.random() < 0.08;

    const ring = rand(520, 860);
    const ang = rand(0, Math.PI*2);
    const x = clamp(player.x + Math.cos(ang)*ring, 80, WORLD.w-80);
    const y = clamp(player.y + Math.sin(ang)*ring, 120, WORLD.h-120);

    state.enemies.push({
      type: t,
      x,y, vx:0, vy:0,
      hp: elite ? t.hp*2.2 : t.hp,
      elite,
      phase: 1,
      atkCD: rand(0.2, t.atkCD),
      hurt:0, stun:0,
      windup:0,
      attacking:false,
      danger:false
    });
  }

  function pickEnemyType(){
    const r = Math.random();
    let acc = 0;
    for(const k of Object.keys(ENEMY_TYPES)){
      acc += ENEMY_TYPES[k].weight;
      if(r <= acc) return ENEMY_TYPES[k];
    }
    return ENEMY_TYPES.dokkaebi;
  }

  // ---------- Overlay ----------
  function showOverlay(on){
    overlay.style.display = on ? "flex" : "none";
  }

  function reset(){
    if(!Sound.buffers.slash){
      Sound.init();
      Sound.load("slash", [
        "sound/sword.1.ogg","sound/sword.2.ogg","sound/sword.3.ogg",
        "sound/sword.4.ogg","sound/sword.5.ogg"
      ]);
      Sound.load("hit", ["sound/sword.6.ogg","sound/sword.7.ogg"]);
      Sound.load("parry", ["sound/sword.8.ogg","sound/sword.9.ogg"]);
      Sound.load("dash", ["sound/sword.10.ogg"]);
      Sound.load("guard", ["sound/sword.1.ogg"]);
      Sound.load("special", ["sound/sword.10.ogg"]);
      Sound.load("ui", ["sound/sword.2.ogg"]);
    }

    state.started=false; state.running=false; state.over=false;
    state.last=0; state.t=0;
    state.score=0; state.kills=0; state.wave=1;
    state.spawnT=0; state.spawnEvery=1.1;
    state.enemies.length=0; state.fx.length=0; state.after.length=0;
    state.flash=0;

    Object.assign(player,{
      x: WORLD.w*0.5, y: WORLD.h*0.85,
      vx:0, vy:0, face:{x:0,y:-1},
      hp:player.hpMax, sp:0,
      dashing:false, dashT:0, dashCD:0,
      slashing:false, slashT:0, slashCD:0,
      guarding:false, parryWindow:0, parryCool:0, parryPerfect:false,
      invuln:0, stun:0
    });

    cam.shake=0;
    showOverlay(true);
    updateHUD();
  }

  function start(){
    if(state.running) return;
    Sound.init();
    state.started=true;
    state.running=true;
    state.over=false;
    showOverlay(false);
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
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyJ","KeyK","KeyL","KeyI"].includes(k)) e.preventDefault();
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

  // ---------- Touch ----------
  startBtn.addEventListener("click", start);
  resetBtn.addEventListener("click", reset);

  btnSlash.addEventListener("pointerdown", ()=>{ input.slashPressed=true; });
  btnDash.addEventListener("pointerdown", ()=>{ input.dashPressed=true; });
  btnSpecial.addEventListener("pointerdown", ()=>{ input.specialPressed=true; });
  btnGuard.addEventListener("pointerdown", ()=>{ input.guard=true; });
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>{
    btnGuard.addEventListener(ev, ()=>{ input.guard=false; });
  });

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

  // ---------- Combat ----------
  function doDash(dir){
    if(player.dashCD>0 || player.dashing || player.stun>0) return;
    Sound.play("dash", 0.55, 0.06);
    player.dashing=true;
    player.dashT=0;
    player.dashCD=0.28;
    player.invuln = Math.max(player.invuln, 0.18);

    const mag = Math.hypot(dir.x, dir.y) || 1;
    player.vx = (dir.x/mag) * player.dashSpeed;
    player.vy = (dir.y/mag) * player.dashSpeed;
  }

  function doSlash(){
    if(player.slashCD>0 || player.slashing || player.stun>0) return;
    Sound.play("slash", 0.5, 0.05);
    player.slashing=true;
    player.slashT=0;
    player.slashCD=0.18;
    cam.shake = Math.max(cam.shake, 5);
    player.sp = clamp(player.sp + 2.5, 0, player.spMax);
  }

  function doSpecial(){
    if(player.sp < player.spMax || player.stun>0) return;
    Sound.play("special", 1.0, 0.0);
    player.sp = 0;
    cam.shake = Math.max(cam.shake, 16);
    state.flash = 1;
    const R = 260;
    for(const e of state.enemies){
      const d = hypot(e.x-player.x, e.y-player.y);
      if(d < R){
        e.hp -= 55;
        e.hurt = 1;
        e.stun = Math.max(e.stun, 0.7);
      }
    }
  }

  function startParryWindow(){
    if(player.parryCool>0) return;
    player.parryWindow = 0.12;
    player.parryCool = 0.22;
    player.parryPerfect = true;
  }

  function takeDamage(dmg){
    if(player.invuln>0) return;
    if(player.guarding){
      if(player.parryPerfect && player.parryWindow>0){
        Sound.play("parry", 1.0, 0.02);
        player.sp = clamp(player.sp + 30, 0, player.spMax);
        addHitStop(0.09);
        addSlowmo(0.6, 0.22);
        addPunch(-player.face.x||0, -player.face.y||1, 1.6);
        return "parry";
      }
      Sound.play("guard", 0.45, 0.02);
      player.hp -= dmg * 0.25;
      player.sp = clamp(player.sp + 6, 0, player.spMax);
      return "guard";
    }

    Sound.play("hit", 0.7, 0.03);
    player.hp -= dmg;
    player.invuln = 0.38;
    player.stun = Math.max(player.stun, 0.18);
    cam.shake = Math.max(cam.shake, 14);
    state.flash = 1;
    addHitStop(0.08);
    addSlowmo(0.78, 0.16);
    addPunch(-player.face.x||0, -player.face.y||1, 1.4);

    if(player.hp <= 0){
      player.hp = 0;
      const s = Math.floor(state.score);
      if(s > state.hi){ state.hi = s; saveHi(state.hi); }
      gameOver();
    }
    return "hit";
  }

  // ---------- Update loop ----------
  function update(dt){
    state.dt = dt;
    state.t += dt;
    if(!state.running) return;

    if(player.parryWindow<=0) player.parryPerfect=false;

    state.score += dt * (90 + state.wave*6);
    const targetWave = 1 + Math.floor(state.score/700);
    state.wave = Math.max(state.wave, targetWave);

    state.spawnEvery = clamp(1.2 - (state.wave-1)*0.06, 0.45, 1.2);
    state.spawnT += dt;
    if(state.spawnT >= state.spawnEvery){
      state.spawnT = 0;
      spawnEnemy();
    }

    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.stun = Math.max(0, player.stun - dt);
    player.parryWindow = Math.max(0, player.parryWindow - dt);
    player.parryCool = Math.max(0, player.parryCool - dt);

    if(input.guard && player.stun<=0){
      if(!player.guarding) startParryWindow();
      player.guarding = true;
    } else {
      player.guarding = false;
    }

    let mx = 0, my = 0;
    if(input.left) mx -= 1;
    if(input.right) mx += 1;
    if(input.up) my -= 1;
    if(input.down) my += 1;
    mx += input.stickVec.x;
    my += input.stickVec.y;

    const mm = Math.hypot(mx,my);
    if(mm > 1e-6){
      mx/=mm; my/=mm;
      player.face.x = lerp(player.face.x, mx, 1 - Math.pow(0.001, dt));
      player.face.y = lerp(player.face.y, my, 1 - Math.pow(0.001, dt));
    }

    if(input.dashPressed){
      input.dashPressed=false;
      doDash(mm > 1e-6 ? {x:mx,y:my} : player.face);
    }
    if(input.slashPressed){ input.slashPressed=false; doSlash(); }
    if(input.specialPressed){ input.specialPressed=false; doSpecial(); }

    if(player.dashing){
      player.dashT += dt;
      if(player.dashT >= player.dashDur){
        player.dashing=false;
        player.vx *= 0.25; player.vy *= 0.25;
      }
    }

    if(player.stun > 0){
      player.vx *= Math.pow(0.001, dt);
      player.vy *= Math.pow(0.001, dt);
    } else if(!player.dashing){
      const spd = player.speed * (player.guarding ? 0.62 : 1.0);
      player.vx = lerp(player.vx, mx * spd, 1 - Math.pow(0.001, dt));
      player.vy = lerp(player.vy, my * spd, 1 - Math.pow(0.001, dt));
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 60, WORLD.w-60);
    player.y = clamp(player.y, 80, WORLD.h-80);

    updateHUD();
  }

  // ---------- Main loop ----------
  function loop(ts){
  if(!state.last) state.last = ts;
  const rawDt = clamp((ts - state.last)/1000, 0, 0.033);
  state.last = ts;

  if(juice.hitStop > 0){
    juice.hitStop = Math.max(0, juice.hitStop - rawDt);
    update(0);
  } else {
    if(juice.scaleT > 0){
      juice.scaleT = Math.max(0, juice.scaleT - rawDt);
    } else {
      juice.targetScale = 1;
    }
    juice.timeScale = lerp(juice.timeScale, juice.targetScale, 1 - Math.pow(0.001, rawDt));
    update(rawDt * juice.timeScale);
  }

  // Clear screen (paper base)
  ctx.fillStyle = PAPER;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // 🔴 이 줄이 빠져 있어서 화면이 텅 비어 있었음
  draw();

  requestAnimationFrame(loop);
}

  reset();
  hiText.textContent = state.hi;
  requestAnimationFrame(loop);

  overlay.addEventListener("pointerdown", ()=>{
    Sound.init();
    if(!state.started) start();
    else if(state.over) reset();
  });

})();
