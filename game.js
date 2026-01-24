/* game.js - full replace */
(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  // UI
  const hpFill = document.getElementById("hpFill");
  const spFill = document.getElementById("spFill");
  const scoreText = document.getElementById("scoreText");
  const hiText = document.getElementById("hiText");
  const killText = document.getElementById("killText");
  const waveText = document.getElementById("waveText");
  const comboText = document.getElementById("comboText");
  const rankText = document.getElementById("rankText");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");

  const rankPop = document.getElementById("rankPop");
  const rankPopRank = document.getElementById("rankPopRank");
  const rankPopCombo = document.getElementById("rankPopCombo");
  const rankPopSub = document.getElementById("rankPopSub");

  // Touch UI
  const stick = document.getElementById("stick");
  const knob = document.getElementById("knob");
  const btnSlash = document.getElementById("btnSlash");
  const btnGuard = document.getElementById("btnGuard");
  const btnDash = document.getElementById("btnDash");
  const btnSpecial = document.getElementById("btnSpecial");

  // ---------- Resize (모바일/PC 공통 안정) ----------
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas, { passive: true });
  resizeCanvas();

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const len = (x, y) => Math.hypot(x, y);
  const norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const now = () => performance.now() / 1000;

  // ---------- Audio (no assets) ----------
  let audioCtx = null;
  function beep(freq = 220, dur = 0.06, type = "square", gain = 0.04) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch {}
  }
  function haptic(ms = 18) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  }

  // ---------- Game State ----------
  const WORLD = {
    w: 1200,
    h: 800,
  };

  const state = {
    running: false,
    t: 0,
    dt: 0,
    last: 0,
    shake: 0,
    hitStop: 0,
    score: 0,
    hi: Number(localStorage.getItem("ink_hi") || 0),
    kills: 0,
    wave: 1,
    combo: 0,
    comboTimer: 0,
    rank: "-",
  };

  hiText.textContent = String(state.hi);

  const player = {
    x: WORLD.w * 0.5,
    y: WORLD.h * 0.55,
    vx: 0,
    vy: 0,
    r: 18,
    hp: 100,
    hpMax: 100,
    ink: 100,
    inkMax: 100,
    faceX: 1,
    faceY: 0,
    guarding: false,
    dashCD: 0,
    slashCD: 0,
    invuln: 0,
  };

  const input = {
    mx: 0,
    my: 0,
    keys: new Set(),
    slash: false,
    guard: false,
    dash: false,
    special: false,
  };

  const enemies = [];
  const particles = [];
  const slashes = [];
  const skyline = [];

  // ---------- Visual flavor (Seoul skyline silhouettes) ----------
  function seedSkyline() {
    skyline.length = 0;
    const baseY = WORLD.h * 0.28;
    let x = 0;
    while (x < WORLD.w + 200) {
      const w = 40 + Math.random() * 110;
      const h = 30 + Math.random() * 220;
      skyline.push({
        x,
        w,
        h,
        y: baseY + (Math.random() * 20 - 10),
        sp: 10 + Math.random() * 20,
      });
      x += w * (0.55 + Math.random() * 0.8);
    }
  }
  seedSkyline();

  function resetGame(full = true) {
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.rank = "-";

    player.x = WORLD.w * 0.5;
    player.y = WORLD.h * 0.55;
    player.vx = player.vy = 0;
    player.hp = player.hpMax;
    player.ink = player.inkMax;
    player.guarding = false;
    player.dashCD = 0;
    player.slashCD = 0;
    player.invuln = 0;

    enemies.length = 0;
    particles.length = 0;
    slashes.length = 0;

    if (full) seedSkyline();

    spawnWave(state.wave);
    syncHUD();
  }

  // ---------- Rank / Combo ----------
  function calcRank(c) {
    if (c >= 18) return "S";
    if (c >= 10) return "A";
    if (c >= 5) return "B";
    if (c >= 2) return "C";
    return "-";
  }

  function showRankPop(rank, combo) {
    rankPopRank.textContent = rank;
    rankPopCombo.textContent = `x${combo}`;
    rankPopSub.textContent = rank === "S" ? "서울 잉크 폭주!" : "묵기 연계!";
    rankPop.classList.remove("show");
    // reflow
    void rankPop.offsetHeight;
    rankPop.classList.add("show");
    rankPop.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      rankPop.classList.remove("show");
      rankPop.setAttribute("aria-hidden", "true");
    }, 650);
  }

  function addCombo() {
    state.combo += 1;
    state.comboTimer = 2.2;
    const r = calcRank(state.combo);
    if (r !== state.rank) {
      state.rank = r;
      rankText.textContent = r;
      if (r !== "-") showRankPop(r, state.combo);
    }
    comboText.textContent = String(state.combo);
  }

  function breakCombo() {
    state.combo = 0;
    state.comboTimer = 0;
    state.rank = "-";
    comboText.textContent = "0";
    rankText.textContent = "-";
  }

  // ---------- Enemy ----------
  function spawnEnemy(n = 1) {
    for (let i = 0; i < n; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (edge === 0) { x = -40; y = Math.random() * WORLD.h; }
      if (edge === 1) { x = WORLD.w + 40; y = Math.random() * WORLD.h; }
      if (edge === 2) { x = Math.random() * WORLD.w; y = -40; }
      if (edge === 3) { x = Math.random() * WORLD.w; y = WORLD.h + 40; }

      const speed = 55 + Math.random() * (35 + state.wave * 4);
      enemies.push({
        x, y,
        r: 16 + Math.random() * 10,
        hp: 22 + state.wave * 6,
        sp: speed,
        hit: 0,
      });
    }
  }

  function spawnWave(w) {
    waveText.textContent = String(w);
    const count = 4 + Math.floor(w * 1.6);
    spawnEnemy(count);
  }

  // ---------- Particles / Slash visuals ----------
  function inkParticle(x, y, vx, vy, life, size) {
    particles.push({ x, y, vx, vy, life, t: life, size });
  }

  function burstInk(x, y, power = 1) {
    const n = Math.floor(18 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (80 + Math.random() * 220) * power;
      inkParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.35, 2 + Math.random() * 4);
    }
  }

  function makeSlashArc(px, py, dx, dy, big = false) {
    const [nx, ny] = norm(dx, dy);
    slashes.push({
      x: px + nx * 14,
      y: py + ny * 14,
      nx, ny,
      r: big ? 78 : 58,
      w: big ? 28 : 20,
      life: big ? 0.17 : 0.12,
      t: big ? 0.17 : 0.12,
      big,
    });
  }

  // ---------- Combat ----------
  function hitStop(frames = 2) {
    state.hitStop = Math.max(state.hitStop, frames);
  }

  function shake(amount = 7) {
    state.shake = Math.max(state.shake, amount);
  }

  function dealDamageToEnemy(e, dmg, hx, hy) {
    e.hp -= dmg;
    e.hit = 0.12;

    // impact
    burstInk(hx, hy, dmg >= 18 ? 1.2 : 0.9);
    shake(dmg >= 18 ? 10 : 7);
    hitStop(dmg >= 18 ? 3 : 2);

    beep(dmg >= 18 ? 180 : 140, 0.05, "square", 0.05);
    haptic(dmg >= 18 ? 28 : 18);

    if (e.hp <= 0) {
      state.kills += 1;
      killText.textContent = String(state.kills);
      state.score += 10 + Math.floor(state.combo * 1.5);
      addCombo();

      burstInk(e.x, e.y, 1.6);
      beep(90, 0.08, "sawtooth", 0.05);
      enemies.splice(enemies.indexOf(e), 1);

      // wave clear
      if (enemies.length === 0) {
        state.wave += 1;
        waveText.textContent = String(state.wave);
        state.score += 50 + state.wave * 5;
        spawnWave(state.wave);
      }
    }
  }

  function slashAttack(big = false) {
    if (player.slashCD > 0) return;
    const cost = big ? 35 : 10;
    if (player.ink < cost) return;

    player.ink -= cost;
    player.slashCD = big ? 0.48 : 0.22;

    const dx = player.faceX || 1;
    const dy = player.faceY || 0;
    makeSlashArc(player.x, player.y, dx, dy, big);

    // hit check in cone-ish radius
    const reach = big ? 92 : 72;
    const dmg = big ? 28 : 16;
    const [nx, ny] = norm(dx, dy);

    for (const e of [...enemies]) {
      const ex = e.x - player.x;
      const ey = e.y - player.y;
      const d = Math.hypot(ex, ey);
      if (d > reach + e.r) continue;
      const [enx, eny] = norm(ex, ey);
      const dot = enx * nx + eny * ny;
      if (dot < (big ? 0.15 : 0.25)) continue;

      const hx = lerp(player.x, e.x, 0.6);
      const hy = lerp(player.y, e.y, 0.6);
      dealDamageToEnemy(e, dmg, hx, hy);
    }

    // swing feel
    shake(big ? 9 : 6);
    beep(big ? 260 : 330, big ? 0.07 : 0.05, "triangle", 0.035);
    haptic(big ? 22 : 12);
  }

  function dash() {
    if (player.dashCD > 0) return;
    if (player.ink < 12) return;

    player.ink -= 12;
    player.dashCD = 0.65;
    player.invuln = 0.22;

    const [nx, ny] = norm(player.faceX || 1, player.faceY || 0);
    player.vx += nx * 520;
    player.vy += ny * 520;

    burstInk(player.x, player.y, 0.7);
    shake(8);
    beep(420, 0.05, "sine", 0.05);
    haptic(18);
  }

  function specialInkBurst() {
    if (player.ink < 55) return;
    player.ink -= 55;

    const radius = 140;
    burstInk(player.x, player.y, 2.0);
    makeSlashArc(player.x, player.y, player.faceX || 1, player.faceY || 0, true);

    for (const e of [...enemies]) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.r) dealDamageToEnemy(e, 22, e.x, e.y);
    }
    shake(14);
    hitStop(4);
    beep(110, 0.12, "sawtooth", 0.06);
    haptic(30);
  }

  // ---------- Input: Keyboard ----------
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    input.keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === "j") input.slash = true;
    if (e.key.toLowerCase() === "k") input.guard = true;
    if (e.key.toLowerCase() === "l") input.dash = true;
    if (e.key.toLowerCase() === "i") input.special = true;
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    input.keys.delete(e.key.toLowerCase());
    if (e.key.toLowerCase() === "k") input.guard = false;
  }, { passive: true });

  // ---------- Input: Touch Joystick (중요: 중복 UI 제거 + pointer events 통일) ----------
  let joy = {
    active: false,
    id: null,
    cx: 0, cy: 0,
    x: 0, y: 0,
    dx: 0, dy: 0,
    mag: 0,
    radius: 54,
    dead: 0.14,
  };

  function setKnob(dx, dy, mag) {
    const r = joy.radius;
    const kx = dx * r * mag;
    const ky = dy * r * mag;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  function joyStart(e) {
    const p = e.pointerId;
    joy.active = true;
    joy.id = p;
    const rect = stick.getBoundingClientRect();
    joy.cx = rect.left + rect.width / 2;
    joy.cy = rect.top + rect.height / 2;
    joyMove(e);
    stick.classList.add("stick--on");
    stick.setPointerCapture?.(p);
  }

  function joyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const dx = (e.clientX - joy.cx);
    const dy = (e.clientY - joy.cy);
    const d = Math.hypot(dx, dy);
    const m = clamp(d / joy.radius, 0, 1);
    const [nx, ny] = d > 0 ? [dx / d, dy / d] : [0, 0];
    joy.dx = nx;
    joy.dy = ny;
    joy.mag = m;
    setKnob(nx, ny, m);
    e.preventDefault();
  }

  function joyEnd(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    joy.active = false;
    joy.id = null;
    joy.dx = joy.dy = 0;
    joy.mag = 0;
    setKnob(0, 0, 0);
    stick.classList.remove("stick--on");
  }

  // stick 영역 스크롤/줌 방지 + 포인터로 통일
  stick.addEventListener("pointerdown", joyStart, { passive: false });
  window.addEventListener("pointermove", joyMove, { passive: false });
  window.addEventListener("pointerup", joyEnd, { passive: true });
  window.addEventListener("pointercancel", joyEnd, { passive: true });

  // ---------- Mobile Buttons (확실히 눌리게 pointerdown/up로 처리) ----------
  function bindHold(btn, onDown, onUp) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("is-down");
      btn.setPointerCapture?.(e.pointerId);
      onDown();
    }, { passive: false });

    const up = (e) => {
      btn.classList.remove("is-down");
      onUp?.();
    };
    btn.addEventListener("pointerup", up, { passive: true });
    btn.addEventListener("pointercancel", up, { passive: true });
    btn.addEventListener("lostpointercapture", () => btn.classList.remove("is-down"), { passive: true });
  }

  bindHold(btnSlash, () => { input.slash = true; }, () => {});
  bindHold(btnGuard, () => { input.guard = true; }, () => { input.guard = false; });
  bindHold(btnDash, () => { input.dash = true; }, () => {});
  bindHold(btnSpecial, () => { input.special = true; }, () => {});

  // Overlay buttons
  startBtn.addEventListener("click", () => {
    overlay.classList.add("hide");
    state.running = true;
    state.last = performance.now();
    // iOS 오디오 언락
    beep(1, 0.001, "sine", 0.0001);
  });
  resetBtn.addEventListener("click", () => {
    resetGame(true);
    overlay.classList.remove("hide");
    state.running = false;
  });

  // ---------- Update / Draw ----------
  function syncHUD() {
    hpFill.style.width = `${clamp(player.hp / player.hpMax, 0, 1) * 100}%`;
    spFill.style.width = `${clamp(player.ink / player.inkMax, 0, 1) * 100}%`;

    scoreText.textContent = String(state.score);
    hiText.textContent = String(state.hi);
    killText.textContent = String(state.kills);
    waveText.textContent = String(state.wave);
    comboText.textContent = String(state.combo);
    rankText.textContent = state.rank;
  }

  function update(dt) {
    // hit stop
    if (state.hitStop > 0) {
      state.hitStop -= 1;
      dt = 0; // freeze
    }

    state.t += dt;

    // combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }

    // regen
    player.ink = clamp(player.ink + 18 * dt, 0, player.inkMax);

    // cooldowns
    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    // read movement
    let mx = 0, my = 0;
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) my -= 1;
    if (k.has("s") || k.has("arrowdown")) my += 1;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;

    // joystick override/add
    const jm = joy.mag > joy.dead ? joy.mag : 0;
    if (jm > 0) {
      mx += joy.dx * jm;
      my += joy.dy * jm;
    }

    const mlen = Math.hypot(mx, my);
    if (mlen > 0.001) {
      const [nx, ny] = [mx / mlen, my / mlen];
      input.mx = nx;
      input.my = ny;
      player.faceX = nx;
      player.faceY = ny;
    } else {
      input.mx = input.my = 0;
    }

    // guarding
    player.guarding = !!input.guard;

    // actions (one-shot)
    if (input.dash) {
      dash();
      input.dash = false;
    }
    if (input.special) {
      specialInkBurst();
      input.special = false;
    }
    if (input.slash) {
      // 짧은 임팩트 + 연계감: 콤보 높을수록 약간 강화(대신 잉크 소모 증가 X)
      slashAttack(false);
      input.slash = false;
    }

    // movement physics
    const baseSp = player.guarding ? 170 : 240;
    const ax = input.mx * baseSp * 6;
    const ay = input.my * baseSp * 6;
    player.vx = lerp(player.vx, player.vx + ax * dt, 1);
    player.vy = lerp(player.vy, player.vy + ay * dt, 1);

    // friction
    const fr = player.guarding ? 10 : 8;
    player.vx = lerp(player.vx, 0, clamp(fr * dt, 0, 1));
    player.vy = lerp(player.vy, 0, clamp(fr * dt, 0, 1));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // bounds
    player.x = clamp(player.x, 40, WORLD.w - 40);
    player.y = clamp(player.y, 60, WORLD.h - 40);

    // enemies update
    for (const e of enemies) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const [nx, ny] = norm(dx, dy);
      e.x += nx * e.sp * dt;
      e.y += ny * e.sp * dt;
      e.hit = Math.max(0, e.hit - dt);

      // collision damage
      const d = Math.hypot(dx, dy);
      if (d < e.r + player.r) {
        if (player.invuln <= 0) {
          const dmg = 8 + Math.floor(state.wave * 0.6);
          if (player.guarding) {
            // parry window 느낌: 딱 눌렀을 때(guard 유지 중) 피해 경감 + 잉크 회복
            player.hp -= Math.max(1, Math.floor(dmg * 0.25));
            player.ink = clamp(player.ink + 10, 0, player.inkMax);
            shake(6);
            beep(520, 0.03, "square", 0.035);
            haptic(12);
          } else {
            player.hp -= dmg;
            shake(10);
            hitStop(2);
            beep(70, 0.08, "sawtooth", 0.05);
            haptic(24);
            breakCombo();
          }
          player.invuln = 0.35;
          burstInk(player.x, player.y, 0.8);
          if (player.hp <= 0) {
            player.hp = 0;
            gameOver();
          }
        }
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t -= dt;
      if (p.t <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }

    // slashes
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i];
      s.t -= dt;
      if (s.t <= 0) slashes.splice(i, 1);
    }

    // score / hi
    if (state.score > state.hi) {
      state.hi = state.score;
      localStorage.setItem("ink_hi", String(state.hi));
    }

    syncHUD();
  }

  function gameOver() {
    state.running = false;
    overlay.classList.remove("hide");
    document.getElementById("ovTitle").textContent = "GAME OVER";
    document.getElementById("ovBody").innerHTML =
      `SCORE <b>${state.score}</b> · BEST <b>${state.hi}</b><br/>RESET을 누르면 새로 시작합니다.`;
  }

  // ---------- Draw ----------
  function worldToScreen(x, y, camX, camY) {
    return [x - camX, y - camY];
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;

    // camera centered
    const camX = clamp(player.x - vw / 2, 0, WORLD.w - vw);
    const camY = clamp(player.y - vh / 2, 0, WORLD.h - vh);

    // screen shake
    let sx = 0, sy = 0;
    if (state.shake > 0) {
      const m = state.shake;
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
      state.shake = Math.max(0, state.shake - 30 * state.dt);
    }

    // background paper
    ctx.fillStyle = "#efe6cf";
    ctx.fillRect(0, 0, vw, vh);

    // skyline parallax
    ctx.save();
    ctx.translate(-camX * 0.35 + sx * 0.2, -camY * 0.2 + sy * 0.2);
    ctx.fillStyle = "#2b2b2b";
    ctx.globalAlpha = 0.85;
    for (const b of skyline) {
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // small neon window scratches
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 6; i++) {
        const wx = b.x + 6 + Math.random() * (b.w - 12);
        const wy = b.y + 8 + Math.random() * (b.h - 16);
        ctx.fillRect(wx, wy, 2, 6);
      }
      ctx.globalAlpha = 0.85;
    }
    ctx.restore();

    // arena texture strokes
    ctx.save();
    ctx.translate(sx * 0.3, sy * 0.3);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 8; i++) {
      const x = ((i * 197 + state.t * 40) % WORLD.w);
      const y = ((i * 131 + state.t * 22) % WORLD.h);
      const [px, py] = worldToScreen(x, y, camX, camY);
      ctx.fillRect(px, py, 220, 2);
      ctx.fillRect(px + 30, py + 18, 160, 2);
    }
    ctx.restore();

    // world layer
    ctx.save();
    ctx.translate(sx, sy);

    // enemies
    for (const e of enemies) {
      const [x, y] = worldToScreen(e.x, e.y, camX, camY);
      // ink blob body
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = e.hit > 0 ? "#111" : "#1f1f1f";
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();

      // calligraphy whiskers
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = "#0b0b0b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.9, 0);
      ctx.quadraticCurveTo(-e.r * 0.2, -e.r * 0.9, e.r * 0.8, -e.r * 0.2);
      ctx.stroke();

      ctx.restore();
    }

    // player
    {
      const [x, y] = worldToScreen(player.x, player.y, camX, camY);
      ctx.save();
      ctx.translate(x, y);

      // guard ring
      if (player.guarding) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, player.r + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // body - brush stroke style
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#121212";
      ctx.beginPath();
      ctx.ellipse(0, 0, player.r + 3, player.r - 2, 0.6, 0, Math.PI * 2);
      ctx.fill();

      // blade direction mark
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(player.faceX * 26, player.faceY * 26);
      ctx.stroke();

      ctx.restore();
    }

    // slashes
    for (const s of slashes) {
      const [x, y] = worldToScreen(s.x, s.y, camX, camY);
      const t = s.t / s.life; // 1 -> 0
      ctx.save();
      ctx.translate(x, y);
      const ang = Math.atan2(s.ny, s.nx);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.85 * t;

      // thick ink stroke
      ctx.strokeStyle = "#060606";
      ctx.lineWidth = s.w;
      ctx.lineCap = "round";
      ctx