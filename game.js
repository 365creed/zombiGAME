// 모바일 스크롤/줌이 터치 입력을 먹는 문제 차단
document.addEventListener("touchmove", (e)=>e.preventDefault(), { passive:false });
document.addEventListener("touchstart", (e)=>{ /* no-op */ }, { passive:false });

(() => {
  "use strict";

  const $ = (s, p = document) => p.querySelector(s);

  const app = $("#app");
  const stage = $("#stage");
  const canvas = $("#c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const hpFill = $("#hpFill");
  const spFill = $("#spFill");
  const scoreText = $("#scoreText");
  const hiText = $("#hiText");
  const killText = $("#killText");
  const waveText = $("#waveText");
  const comboText = $("#comboText");
  const rankText = $("#rankText");

  const overlay = $("#overlay");
  const startBtn = $("#startBtn");
  const resetBtn = $("#resetBtn");

  const stick = $("#stick");
  const knob = $("#knob");
  const btnSlash = $("#btnSlash");
  const btnGuard = $("#btnGuard");
  const btnDash = $("#btnDash");
  const btnSpecial = $("#btnSpecial");

  const rankPop = $("#rankPop");
  const rankPopRank = $("#rankPopRank");
  const rankPopCombo = $("#rankPopCombo");
  const rankPopSub = $("#rankPopSub");

  /* =========================
     Utils
  ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => (a + (Math.random() * (b - a + 1) | 0));
  const hypot = Math.hypot;

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  /* =========================
     Canvas resize (CSS px coords)
  ========================= */
  const view = { w: 0, h: 0, dpr: 1 };
  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    view.w = Math.max(1, r.width);
    view.h = Math.max(1, r.height);
    view.dpr = dpr;

    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas, { passive: true });
  resizeCanvas();

  /* =========================
     Tiny audio (no files)
  ========================= */
  const Beep = {
    ctx: null,
    unlocked: false,
    init() {
      if (this.unlocked) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.unlocked = true;
    },
    ping(freq = 220, dur = 0.05, type = "triangle", gain = 0.08) {
      if (!this.unlocked) return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
  };

  /* =========================
     Input
  ========================= */
  const input = {
    up: false, down: false, left: false, right: false,
    guard: false,
    slashPressed: false, dashPressed: false, specialPressed: false,

    pointerStick: false,
    stickId: null,
    stickCenter: { x: 0, y: 0 },
    stickVec: { x: 0, y: 0 }
  };

  window.addEventListener("keydown", (e) => {
    const k = e.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL", "KeyI", "Space"].includes(k)) {
      e.preventDefault();
    }
    if (k === "ArrowUp" || k === "KeyW") input.up = true;
    if (k === "ArrowDown" || k === "KeyS") input.down = true;
    if (k === "ArrowLeft" || k === "KeyA") input.left = true;
    if (k === "ArrowRight" || k === "KeyD") input.right = true;

    if (k === "KeyJ") input.slashPressed = true;
    if (k === "KeyK") input.guard = true;
    if (k === "KeyL") input.dashPressed = true;
    if (k === "KeyI") input.specialPressed = true;

    if (k === "Enter" || k === "Space") start();
    if (k === "KeyR") reset();
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    const k = e.code;
    if (k === "ArrowUp" || k === "KeyW") input.up = false;
    if (k === "ArrowDown" || k === "KeyS") input.down = false;
    if (k === "ArrowLeft" || k === "KeyA") input.left = false;
    if (k === "ArrowRight" || k === "KeyD") input.right = false;
    if (k === "KeyK") input.guard = false;
  });

  startBtn.addEventListener("click", () => { Beep.init(); start(); });
  resetBtn.addEventListener("click", () => { Beep.init(); reset(); });

  btnSlash.addEventListener("pointerdown", () => { Beep.init(); input.slashPressed = true; });
  btnDash.addEventListener("pointerdown", () => { Beep.init(); input.dashPressed = true; });
  btnSpecial.addEventListener("pointerdown", () => { Beep.init(); input.specialPressed = true; });
  btnGuard.addEventListener("pointerdown", () => { Beep.init(); input.guard = true; });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => {
    btnGuard.addEventListener(ev, () => { input.guard = false; });
  });

  stick.addEventListener("pointerdown", (e) => {
    Beep.init();
    input.pointerStick = true;
    input.stickId = e.pointerId;
    const r = stick.getBoundingClientRect();
    input.stickCenter.x = r.left + r.width / 2;
    input.stickCenter.y = r.top + r.height / 2;
    stick.setPointerCapture(e.pointerId);
  });

  stick.addEventListener("pointermove", (e) => {
    if (!input.pointerStick || e.pointerId !== input.stickId) return;
    const dx = e.clientX - input.stickCenter.x;
    const dy = e.clientY - input.stickCenter.y;
    const max = 52;

    const mag = Math.hypot(dx, dy) || 1;
    const nx = dx / mag;
    const ny = dy / mag;
    const amt = clamp(mag / max, 0, 1);

    input.stickVec.x = nx * amt;
    input.stickVec.y = ny * amt;
    knob.style.transform = `translate(${(-50 + input.stickVec.x * 42)}%, ${(-50 + input.stickVec.y * 42)}%)`;
  });

  function endStick() {
    input.pointerStick = false;
    input.stickId = null;
    input.stickVec.x = 0; input.stickVec.y = 0;
    knob.style.transform = "translate(-50%,-50%)";
  }
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  /* =========================
     Storage
  ========================= */
  const HI_KEY = "ink_sword_hi_v2";
  const loadHi = () => Number(localStorage.getItem(HI_KEY) || "0");
  const saveHi = (v) => localStorage.setItem(HI_KEY, String(v));

  /* =========================
     World / Camera
  ========================= */
  const WORLD = { w: 2600, h: 5200 };

  const cam = { x: WORLD.w * 0.5, y: WORLD.h * 0.85, shake: 0, sx: 0, sy: 0 };

  /* =========================
     Palette (Seoul ink-wash)
  ========================= */
  const PAPER = "#efe6cf";
  const INK = (a) => `rgba(18, 18, 20, ${a})`;
  const INDIGO = (a) => `rgba(26, 36, 72, ${a})`;   // night-ish city
  const CRIM = (a) => `rgba(120, 15, 25, ${a})`;    // hit
  const GOLD = (a) => `rgba(170, 125, 45, ${a})`;   // rank flash

  /* =========================
     Ink FX (splatter + trails)
  ========================= */
  const fx = [];
  const strokes = [];

  function inkColor(hue, a) {
    if (hue === "gold") return GOLD(a);
    if (hue === "crim") return CRIM(a);
    if (hue === "indigo") return INDIGO(a);
    return INK(a);
  }

  function spawnSplatter(x, y, power = 1, hue = "ink") {
    const n = randi(18, 34) * power;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(90, 520) * power;
      fx.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(0.8, 3.6) * power,
        life: rand(0.2, 0.7) * (0.7 + power * 0.4),
        t: 0,
        hue
      });
    }
  }

  function spawnBrushTrail(x, y, dx, dy, weight = 1, hue = "ink") {
    const len = Math.max(1, Math.floor(7 * weight));
    for (let i = 0; i < len; i++) {
      const off = rand(-10, 10) * weight;
      strokes.push({
        x: x + dy * off,
        y: y - dx * off,
        dx: dx * rand(18, 42) * weight,
        dy: dy * rand(18, 42) * weight,
        w0: rand(7, 22) * weight,
        w1: rand(1.6, 6) * weight,
        life: rand(0.22, 0.55) * (0.7 + weight * 0.25),
        t: 0,
        hue
      });
    }
  }

  /* =========================
     Calligraphy stroke render (KEY)
     - “실제 붓획 여러 개”로 캐릭터를 구성
  ========================= */
  function strokeSegment(x0, y0, x1, y1, w0, w1, a, hue) {
    // 가는 획/굵은 획 혼합: 2번 그려 가장자리 번짐 느낌
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = inkColor(hue, a * 0.38);
    ctx.lineWidth = w0 * 1.9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.strokeStyle = inkColor(hue, a);
    ctx.lineWidth = w0;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // 끝부분 농담 변화(붓 떼는 느낌)
    ctx.strokeStyle = inkColor(hue, a * 0.22);
    ctx.lineWidth = w1;
    ctx.beginPath();
    ctx.moveTo(lerp(x0, x1, 0.6), lerp(y0, y1, 0.6));
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function drawCalligraphyFigure(screenX, screenY, dirX, dirY, scale, hue, accentHue, hurt01, eliteGlow) {
    const ang = Math.atan2(dirY, dirX);
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(ang + Math.PI * 0.5);

    const a = 0.92 - hurt01 * 0.28;

    // “한 획짜리 사람”이 아니라, 서예처럼 6~9획으로 구성
    // 몸통(세로 굵은 획)
    strokeSegment(0, -32 * scale, 0, 30 * scale, 14 * scale, 4 * scale, a, hue);

    // 어깨/팔(갈퀴 느낌 가로 획)
    strokeSegment(-16 * scale, -10 * scale, 18 * scale, -6 * scale, 8 * scale, 2.5 * scale, a * 0.9, hue);
    strokeSegment(14 * scale, -2 * scale, 22 * scale, 18 * scale, 6 * scale, 2.2 * scale, a * 0.85, hue);

    // 다리(갈라지는 획)
    strokeSegment(-6 * scale, 18 * scale, -16 * scale, 38 * scale, 7 * scale, 2.2 * scale, a * 0.85, hue);
    strokeSegment(6 * scale, 18 * scale, 16 * scale, 38 * scale, 7 * scale, 2.2 * scale, a * 0.85, hue);

    // 머리(작은 점/찍기)
    ctx.fillStyle = inkColor(hue, a);
    ctx.beginPath();
    ctx.arc(0, -38 * scale, 7.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inkColor(hue, a * 0.22);
    ctx.beginPath();
    ctx.arc(2 * scale, -40 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 검(길고 얇은 획)
    const bladeA = a * 0.85;
    strokeSegment(6 * scale, -8 * scale, 6 * scale, -56 * scale, 6.2 * scale, 2.2 * scale, bladeA, accentHue);

    // elite rim / aura
    if (eliteGlow) {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = GOLD(0.35);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 2 * scale, 44 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* =========================
     Entities
  ========================= */
  const player = {
    x: WORLD.w * 0.5,
    y: WORLD.h * 0.85,
    vx: 0, vy: 0,
    face: { x: 0, y: -1 },
    hp: 100, hpMax: 100,
    sp: 0, spMax: 100,

    speed: 520,
    dashSpeed: 1040,

    dashing: false,
    dashT: 0, dashDur: 0.14,
    dashCD: 0,

    slashing: false,
    slashT: 0, slashDur: 0.13,
    slashCD: 0,

    guarding: false,
    parryWindow: 0,
    parryCool: 0,
    parryPerfect: false,

    invuln: 0,
    stun: 0
  };

  const ENEMY_TYPES = {
    runner:  { name: "RUNNER",  hp: 45, spd: 330, atkRange: 84, atkCD: 0.90, dmg: 14, weight: 0.46, hue: "indigo" },
    thug:    { name: "THUG",    hp: 70, spd: 250, atkRange: 92, atkCD: 1.05, dmg: 18, weight: 0.32, hue: "ink" },
    brute:   { name: "BRUTE",   hp: 130, spd: 210, atkRange: 108, atkCD: 1.35, dmg: 28, weight: 0.16, hue: "ink" },
    phantom: { name: "PHANTOM", hp: 80, spd: 290, atkRange: 96, atkCD: 1.00, dmg: 22, weight: 0.06, hue: "crim" }
  };

  const enemies = [];

  function pickEnemyType() {
    const r = Math.random();
    let acc = 0;
    for (const k of Object.keys(ENEMY_TYPES)) {
      acc += ENEMY_TYPES[k].weight;
      if (r <= acc) return ENEMY_TYPES[k];
    }
    return ENEMY_TYPES.thug;
  }

  function spawnEnemy() {
    const t = pickEnemyType();
    const elite = Math.random() < 0.09;

    const ring = rand(560, 980);
    const ang = rand(0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(ang) * ring, 90, WORLD.w - 90);
    const y = clamp(player.y + Math.sin(ang) * ring, 130, WORLD.h - 130);

    enemies.push({
      type: t,
      elite,
      x, y,
      vx: 0, vy: 0,
      hp: elite ? t.hp * 2.1 : t.hp,
      atkCD: rand(0.15, t.atkCD),
      wind: 0,
      attacking: false,
      hurt: 0,
      stun: 0
    });

    spawnSplatter(x, y, elite ? 1.1 : 0.75, t.hue);
  }

  /* =========================
     Combo / Rank (S/A/B)
  ========================= */
  const combo = {
    count: 0,
    timer: 0,
    window: 1.6,     // 콤보 유지 시간
    popT: 0,
    rank: "-",
    best: 0
  };

  function rankFromCombo(n) {
    if (n >= 10) return "S";
    if (n >= 5) return "A";
    if (n >= 2) return "B";
    return "-";
  }

  function pushRankPop(rank, count, note) {
    rankPopRank.textContent = rank;
    rankPopCombo.textContent = `x${count}`;
    rankPopSub.textContent = note;

    rankPop.classList.remove("show");
    void rankPop.offsetWidth;
    rankPop.classList.add("show");

    combo.popT = 0.95;
  }

  function onKill(qualityNote = "연계!") {
    combo.count += 1;
    combo.timer = combo.window;
    combo.best = Math.max(combo.best, combo.count);

    const r = rankFromCombo(combo.count);
    combo.rank = r;

    // 랭크 팝업은 B부터
    if (r !== "-") {
      pushRankPop(r, combo.count, qualityNote);
      Beep.ping(r === "S" ? 760 : r === "A" ? 620 : 520, 0.06, "triangle", 0.09);
    }

    // score bonus
    state.score += 60 * combo.count;
  }

  function breakCombo() {
    if (combo.count >= 2) pushRankPop("-", combo.count, "흩어짐…");
    combo.count = 0;
    combo.timer = 0;
    combo.rank = "-";
  }

  /* =========================
     Game state
  ========================= */
  const state = {
    started: false,
    running: false,
    over: false,
    last: 0,
    t: 0,
    score: 0,
    hi: loadHi(),
    kills: 0,
    wave: 1,
    spawnT: 0,
    spawnEvery: 1.1,
    flash: 0,
    hitStop: 0,
    timeScale: 1,
    slowT: 0,
    slowTarget: 1
  };

  function showOverlay(on) { overlay.style.display = on ? "flex" : "none"; }

  function reset() {
    Beep.init();

    Object.assign(state, {
      started: false, running: false, over: false,
      last: 0, t: 0, score: 0,
      kills: 0, wave: 1,
      spawnT: 0, spawnEvery: 1.1,
      flash: 0, hitStop: 0, timeScale: 1,
      slowT: 0, slowTarget: 1
    });

    enemies.length = 0;
    fx.length = 0;
    strokes.length = 0;

    Object.assign(player, {
      x: WORLD.w * 0.5, y: WORLD.h * 0.85,
      vx: 0, vy: 0, face: { x: 0, y: -1 },
      hp: player.hpMax, sp: 0,
      dashing: false, dashT: 0, dashCD: 0,
      slashing: false, slashT: 0, slashCD: 0,
      guarding: false, parryWindow: 0, parryCool: 0, parryPerfect: false,
      invuln: 0, stun: 0
    });

    cam.x = player.x; cam.y = player.y;
    cam.shake = 0;

    combo.count = 0;
    combo.timer = 0;
    combo.popT = 0;
    combo.rank = "-";

    showOverlay(true);
    updateHUD();
  }

  function start() {
    if (state.running) return;
    Beep.init();

    state.started = true;
    state.running = true;
    state.over = false;
    showOverlay(false);

    for (let i = 0; i < 4; i++) spawnEnemy();
    spawnSplatter(player.x, player.y, 1.2, "gold");
    Beep.ping(260, 0.07, "sine", 0.09);
    Beep.ping(520, 0.06, "triangle", 0.07);
  }

  function gameOver() {
    state.running = false;
    state.over = true;
    showOverlay(true);
    Beep.ping(140, 0.12, "sawtooth", 0.08);
  }

  /* =========================
     Combat helpers
  ========================= */
  function addHitStop(sec) { state.hitStop = Math.max(state.hitStop, sec); }
  function addSlowmo(scale, sec) {
    state.slowTarget = Math.min(state.slowTarget, scale);
    state.slowT = Math.max(state.slowT, sec);
  }
  function shake(power) { cam.shake = Math.max(cam.shake, power); }

  function startParryWindow() {
    if (player.parryCool > 0) return;
    player.parryWindow = 0.12;
    player.parryCool = 0.22;
    player.parryPerfect = true;
  }

  function takeDamage(dmg, dirx, diry) {
    if (player.invuln > 0) return;

    // 맞으면 콤보 끊기(긴장감)
    breakCombo();

    if (player.guarding) {
      if (player.parryPerfect && player.parryWindow > 0) {
        app.classList.remove("parry-glow");
        void app.offsetWidth;
        app.classList.add("parry-glow");

        Beep.ping(780, 0.05, "triangle", 0.10);
        Beep.ping(520, 0.06, "sine", 0.08);

        player.sp = clamp(player.sp + 34, 0, player.spMax);
        addHitStop(0.08);
        addSlowmo(0.62, 0.20);
        shake(10);

        spawnSplatter(player.x + dirx * 22, player.y + diry * 22, 1.4, "gold");
        return "parry";
      }

      Beep.ping(260, 0.05, "square", 0.06);
      player.hp -= dmg * 0.28;
      player.sp = clamp(player.sp + 7, 0, player.spMax);
      spawnSplatter(player.x, player.y, 0.65, "ink");
      return "guard";
    }

    Beep.ping(180, 0.07, "sawtooth", 0.08);
    player.hp -= dmg;
    player.invuln = 0.36;
    player.stun = Math.max(player.stun, 0.16);
    shake(14);
    state.flash = 1;
    addHitStop(0.07);
    addSlowmo(0.78, 0.16);

    spawnSplatter(player.x, player.y, 1.15, "crim");

    if (player.hp <= 0) {
      player.hp = 0;
      const s = Math.floor(state.score);
      if (s > state.hi) { state.hi = s; saveHi(state.hi); }
      gameOver();
    }
    return "hit";
  }

  function doDash(dir) {
    if (player.dashCD > 0 || player.dashing || player.stun > 0) return;
    const mag = Math.hypot(dir.x, dir.y) || 1;

    player.dashing = true;
    player.dashT = 0;
    player.dashCD = 0.28;
    player.invuln = Math.max(player.invuln, 0.16);

    player.vx = (dir.x / mag) * player.dashSpeed;
    player.vy = (dir.y / mag) * player.dashSpeed;

    shake(8);
    Beep.ping(620, 0.04, "triangle", 0.08);
    spawnBrushTrail(player.x, player.y, -dir.x, -dir.y, 1.2, "indigo");
  }

  function doSlash() {
    if (player.slashCD > 0 || player.slashing || player.stun > 0) return;

    player.slashing = true;
    player.slashT = 0;
    player.slashCD = 0.18;

    player.sp = clamp(player.sp + 2.8, 0, player.spMax);

    shake(6);
    addHitStop(0.03);

    const fxdir = player.face;

    // 붓 휘두름: 획 + 번짐
    spawnBrushTrail(player.x + fxdir.x * 18, player.y + fxdir.y * 18, fxdir.x, fxdir.y, 1.8, "ink");
    spawnSplatter(player.x + fxdir.x * 34, player.y + fxdir.y * 34, 0.9, "ink");
    Beep.ping(420, 0.05, "triangle", 0.07);

    const R = 118;
    const cone = 0.78;

    let killedAny = false;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d = hypot(dx, dy);
      if (d > R) continue;

      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      const dot = nx * fxdir.x + ny * fxdir.y;
      if (Math.acos(clamp(dot, -1, 1)) > cone) continue;

      const dmg = e.elite ? 20 : 26;
      e.hp -= dmg;
      e.hurt = 1;
      e.stun = Math.max(e.stun, 0.18);

      spawnSplatter(e.x, e.y, e.elite ? 1.15 : 1.0, e.type.hue);
      addSlowmo(0.72, 0.10);
      shake(10);

      if (e.hp <= 0) {
        killedAny = true;
        state.kills++;
        state.score += 120 + state.wave * 12;
        player.sp = clamp(player.sp + 8, 0, player.spMax);
        spawnSplatter(e.x, e.y, 1.6, "gold");
        onKill(combo.count >= 10 ? "서울묵기 폭주!" : combo.count >= 5 ? "획이 이어진다!" : "연계!");
      }
    }

    // 칼질이 헛치면 콤보 시간만 조금 줄이기(너무 빡세지 않게)
    if (!killedAny && combo.count > 0) combo.timer = Math.max(0, combo.timer - 0.18);
  }

  function doSpecial() {
    if (player.sp < player.spMax || player.stun > 0) return;
    player.sp = 0;

    const R = 290;
    shake(18);
    addHitStop(0.09);
    addSlowmo(0.62, 0.22);
    state.flash = 1;

    spawnSplatter(player.x, player.y, 2.1, "gold");
    spawnBrushTrail(player.x, player.y, 1, 0, 2.4, "indigo");
    spawnBrushTrail(player.x, player.y, -1, 0, 2.4, "indigo");
    spawnBrushTrail(player.x, player.y, 0, 1, 2.4, "indigo");
    spawnBrushTrail(player.x, player.y, 0, -1, 2.4, "indigo");

    Beep.ping(240, 0.08, "sawtooth", 0.10);
    Beep.ping(480, 0.07, "triangle", 0.09);

    let killCount = 0;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = hypot(e.x - player.x, e.y - player.y);
      if (d <= R) {
        e.hp -= 55;
        e.hurt = 1;
        e.stun = Math.max(e.stun, 0.7);
        spawnSplatter(e.x, e.y, 1.5, e.type.hue);
        if (e.hp <= 0) {
          killCount++;
          state.kills++;
          state.score += 200 + state.wave * 20;
          spawnSplatter(e.x, e.y, 1.9, "gold");
        }
      }
    }
    if (killCount > 0) {
      for (let i = 0; i < killCount; i++) onKill("묵기 폭발!");
    }
  }

  /* =========================
     HUD
  ========================= */
  function updateHUD() {
    const hpPct = clamp(player.hp / player.hpMax, 0, 1);
    const spPct = clamp(player.sp / player.spMax, 0, 1);
    hpFill.style.width = `${hpPct * 100}%`;
    spFill.style.width = `${spPct * 100}%`;

    scoreText.textContent = Math.floor(state.score);
    hiText.textContent = state.hi;
    killText.textContent = state.kills;
    waveText.textContent = state.wave;

    comboText.textContent = combo.count;
    rankText.textContent = combo.rank;

    const hud = $(".hud");
    if (player.hp < 28) hud.classList.add("hp-low");
    else hud.classList.remove("hp-low");
  }

  /* =========================
     Update
  ========================= */
  function update(dt) {
    state.t += dt;
    if (!state.running) return;

    state.score += dt * (92 + state.wave * 7);
    const targetWave = 1 + Math.floor(state.score / 900);
    state.wave = Math.max(state.wave, targetWave);

    state.spawnEvery = clamp(1.25 - (state.wave - 1) * 0.06, 0.40, 1.25);
    state.spawnT += dt;
    if (state.spawnT >= state.spawnEvery) {
      state.spawnT = 0;
      spawnEnemy();
    }

    // combo timer
    if (combo.count > 0) {
      combo.timer = Math.max(0, combo.timer - dt);
      if (combo.timer <= 0) breakCombo();
    }
    combo.popT = Math.max(0, combo.popT - dt);

    // timers
    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.stun = Math.max(0, player.stun - dt);
    player.parryWindow = Math.max(0, player.parryWindow - dt);
    player.parryCool = Math.max(0, player.parryCool - dt);

    if (player.parryWindow <= 0) player.parryPerfect = false;

    if (input.guard && player.stun <= 0) {
      if (!player.guarding) startParryWindow();
      player.guarding = true;
    } else {
      player.guarding = false;
    }

    let mx = 0, my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    mx += input.stickVec.x;
    my += input.stickVec.y;

    const mm = Math.hypot(mx, my);
    if (mm > 1e-6) {
      mx /= mm; my /= mm;
      player.face.x = lerp(player.face.x, mx, 1 - Math.pow(0.001, dt));
      player.face.y = lerp(player.face.y, my, 1 - Math.pow(0.001, dt));
    }

    if (input.dashPressed) { input.dashPressed = false; doDash(mm > 1e-6 ? { x: mx, y: my } : player.face); }
    if (input.slashPressed) { input.slashPressed = false; doSlash(); }
    if (input.specialPressed) { input.specialPressed = false; doSpecial(); }

    if (player.dashing) {
      player.dashT += dt;
      if (player.dashT >= player.dashDur) {
        player.dashing = false;
        player.vx *= 0.22; player.vy *= 0.22;
      }
    }

    if (player.stun > 0) {
      player.vx *= Math.pow(0.001, dt);
      player.vy *= Math.pow(0.001, dt);
    } else if (!player.dashing) {
      const spd = player.speed * (player.guarding ? 0.62 : 1.0);
      player.vx = lerp(player.vx, mx * spd, 1 - Math.pow(0.001, dt));
      player.vy = lerp(player.vy, my * spd, 1 - Math.pow(0.001, dt));
    }

    const px0 = player.x, py0 = player.y;
    player.x = clamp(player.x + player.vx * dt, 70, WORLD.w - 70);
    player.y = clamp(player.y + player.vy * dt, 90, WORLD.h - 90);

    const mv = hypot(player.x - px0, player.y - py0);
    if (mv > 0.4) {
      spawnBrushTrail(player.x, player.y, player.vx * 0.003, player.vy * 0.003, player.guarding ? 0.55 : 0.85, "ink");
      if (Math.random() < 0.06) spawnSplatter(player.x, player.y, 0.30, "ink");
    }

    for (const e of enemies) {
      if (e.hp <= 0) continue;

      e.hurt = Math.max(0, e.hurt - dt * 3);
      e.stun = Math.max(0, e.stun - dt);

      const t = e.type;

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      const desire = (d > t.atkRange * 0.92) ? 1 : 0.35;
      const spd = (e.stun > 0) ? 0 : t.spd * (e.elite ? 1.08 : 1.0);

      const ox = -ny * 0.35;
      const oy = nx * 0.35;

      e.vx = lerp(e.vx, (nx * desire + ox) * spd, 1 - Math.pow(0.001, dt));
      e.vy = lerp(e.vy, (ny * desire + oy) * spd, 1 - Math.pow(0.001, dt));

      e.x = clamp(e.x + e.vx * dt, 70, WORLD.w - 70);
      e.y = clamp(e.y + e.vy * dt, 90, WORLD.h - 90);

      e.atkCD -= dt;
      if (e.atkCD <= 0 && d < t.atkRange + 10 && e.stun <= 0) {
        e.atkCD = t.atkCD * rand(0.85, 1.08);
        e.wind = 0.28;
        e.attacking = true;
        stage.classList.remove("danger-flash");
        void stage.offsetWidth;
        stage.classList.add("danger-flash");
      }

      if (e.attacking) {
        e.wind -= dt;
        if (e.wind <= 0) {
          e.attacking = false;

          const dd = hypot(player.x - e.x, player.y - e.y);
          if (dd < t.atkRange + 18) {
            const res = takeDamage(t.dmg * (e.elite ? 1.1 : 1.0), nx, ny);
            spawnSplatter(player.x - nx * 12, player.y - ny * 12, 0.95, res === "parry" ? "gold" : "crim");
          }

          spawnBrushTrail(e.x, e.y, nx, ny, e.elite ? 1.5 : 1.15, t.hue);
          spawnSplatter(e.x + nx * 22, e.y + ny * 22, e.elite ? 1.05 : 0.75, t.hue);
          shake(7);
        }
      }
    }

    // remove dead
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) enemies.splice(i, 1);
    }
    if (enemies.length < 3 && state.wave >= 2 && Math.random() < 0.015) spawnEnemy();

    // fx update
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.0015, dt);
      p.vy *= Math.pow(0.0015, dt);
      if (p.t >= p.life) fx.splice(i, 1);
    }
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      s.t += dt;
      s.x += s.dx * dt;
      s.y += s.dy * dt;
      s.dx *= Math.pow(0.0018, dt);
      s.dy *= Math.pow(0.0018, dt);
      if (s.t >= s.life) strokes.splice(i, 1);
    }

    // camera
    cam.x = lerp(cam.x, player.x, 1 - Math.pow(0.00005, dt));
    cam.y = lerp(cam.y, player.y, 1 - Math.pow(0.00005, dt));
    cam.shake = Math.max(0, cam.shake - dt * 40);
    const sh = cam.shake;
    cam.sx = (Math.random() * 2 - 1) * sh;
    cam.sy = (Math.random() * 2 - 1) * sh;

    state.flash = Math.max(0, state.flash - dt * 3.5);

    // rank pop visibility
    if (combo.popT > 0) rankPop.setAttribute("aria-hidden", "false");
    else rankPop.setAttribute("aria-hidden", "true");

    updateHUD();
  }

  /* =========================
     Render helpers
  ========================= */
  function worldToScreen(wx, wy) {
    const sx = (wx - cam.x) + view.w * 0.5 + cam.sx;
    const sy = (wy - cam.y) + view.h * 0.5 + cam.sy;
    return { x: sx, y: sy };
  }

  /* =========================
     Seoul City Ink Wash Background
     - 한강 라인 + 스카이라인 + 남산타워/롯데타워 느낌
     - “고딕 스크립트”는 제거하고, 대신 '한글/한자 붓문양' 패턴
  ========================= */
  function drawPaper() {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.w, view.h);

    // 종이 섬유
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() * view.w) | 0;
      const y = (Math.random() * view.h) | 0;
      const w = rand(26, 140);
      const h = rand(1, 3);
      ctx.fillStyle = "rgba(40,35,30,0.35)";
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;

    // 서울 밤빛 잉크 워시(상단 그라데이션)
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, "rgba(26,36,72,0.20)");
    sky.addColorStop(0.45, "rgba(26,36,72,0.08)");
    sky.addColorStop(1, "rgba(0,0,0,0.00)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);

    // 한강(가로 흐름)
    const riverY = view.h * 0.62;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(26,36,72,0.35)";
    ctx.beginPath();
    ctx.moveTo(-40, riverY + 30);
    ctx.quadraticCurveTo(view.w * 0.35, riverY - 10, view.w + 40, riverY + 18);
    ctx.lineTo(view.w + 40, view.h + 40);
    ctx.lineTo(-40, view.h + 40);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // 스카이라인(패럴랙스)
    drawSeoulSkyline(0.22, view.h * 0.44, 0.10);
    drawSeoulSkyline(0.36, view.h * 0.50, 0.14);
    drawSeoulSkyline(0.52, view.h * 0.56, 0.18);

    // 붓글 문양(한글/한자 느낌) - 배경 패턴
    drawBrushScriptPattern();

    // 비네트
    const g = ctx.createRadialGradient(view.w * 0.5, view.h * 0.45, 60, view.w * 0.5, view.h * 0.5, Math.max(view.w, view.h) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawSeoulSkyline(depth, baseY, alpha) {
    // depth: 0~1 (멀수록 작고 천천히 움직임)
    const par = 0.10 + depth * 0.25;
    const shift = ((cam.x / WORLD.w) - 0.5) * view.w * par;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(shift, 0);
    ctx.fillStyle = INK(0.55);

    const h = 160 + depth * 120;
    const y = baseY;

    // 건물 덩어리
    let x = -60;
    while (x < view.w + 60) {
      const bw = rand(24, 70);
      const bh = rand(22, h);
      ctx.fillRect(x, y - bh, bw, bh);
      // 창문 점(아주 희미)
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + rand(4, bw - 6), y - rand(8, bh - 6), 1, 1);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = INK(0.55);
      x += bw + rand(6, 18);
    }

    // 남산타워(간단 실루엣)
    const tx = view.w * 0.22;
    ctx.fillRect(tx, y - (h * 0.72), 10, h * 0.72);
    ctx.beginPath();
    ctx.moveTo(tx - 18, y - (h * 0.72));
    ctx.lineTo(tx + 28, y - (h * 0.72));
    ctx.lineTo(tx + 5, y - (h * 0.92));
    ctx.closePath();
    ctx.fill();

    // 롯데타워 느낌(가늘고 긴)
    const lx = view.w * 0.78;
    ctx.fillRect(lx, y - (h * 1.08), 12, h * 1.08);
    ctx.beginPath();
    ctx.moveTo(lx, y - (h * 1.08));
    ctx.lineTo(lx + 12, y - (h * 1.08));
    ctx.lineTo(lx + 6, y - (h * 1.24));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBrushScriptPattern() {
    // 고딕 스크립트 대신 “동양 붓문양”
    // 폰트는 사용자의 시스템 폰트 중 Serif 계열로 대체(없어도 표시됨)
    const texts = ["서울", "漢江", "묵", "劍", "風", "墨"];
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // 여러 레이어로 살짝 번짐
    for (let layer = 0; layer < 2; layer++) {
      ctx.globalAlpha = layer === 0 ? 0.055 : 0.03;
      ctx.font = `${layer === 0 ? 46 : 54}px ui-serif, "Times New Roman", serif`;

      const stepX = 220;
      const stepY = 190;
      const rot = (layer === 0 ? -10 : 8) * Math.PI / 180;
      ctx.save();
      ctx.translate(view.w * 0.5, view.h * 0.48);
      ctx.rotate(rot);
      ctx.translate(-view.w * 0.5, -view.h * 0.48);

      for (let y = 0; y < view.h + stepY; y += stepY) {
        for (let x = 0; x < view.w + stepX; x += stepX) {
          const t = texts[(x / stepX + y / stepY + layer) % texts.length | 0];
          // 카메라에 따라 살짝 흐르는 느낌
          const ox = ((cam.x / WORLD.w) - 0.5) * 18;
          const oy = ((cam.y / WORLD.h) - 0.5) * 18;
          ctx.fillText(t, x + ox, y + oy);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawArena() {
    // 바닥 결(거리/도시 느낌): 격자 대신 “도로 결” 느낌 라인
    ctx.save();
    const minX = cam.x - view.w * 0.65;
    const maxX = cam.x + view.w * 0.65;
    const minY = cam.y - view.h * 0.65;
    const maxY = cam.y + view.h * 0.65;

    ctx.strokeStyle = "rgba(0,0,0,0.11)";
    ctx.lineWidth = 2;

    const step = 260;
    for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
      const a = 0.08 + 0.06 * Math.sin(y * 0.008);
      ctx.globalAlpha = a;
      const p0 = worldToScreen(minX, y);
      const p1 = worldToScreen(maxX, y);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // world border hint
    const pad = 60;
    const left = pad, top = pad, right = WORLD.w - pad, bot = WORLD.h - pad;
    const A = worldToScreen(left, top);
    const B = worldToScreen(right, top);
    const C = worldToScreen(right, bot);
    const D = worldToScreen(left, bot);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.lineTo(D.x, D.y);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 16;
    ctx.stroke();

    ctx.restore();
  }

  function drawStrokes() {
    for (const s of strokes) {
      const t = s.t / s.life;
      const k = easeOutCubic(1 - t);

      const p0 = worldToScreen(s.x, s.y);
      const p1 = worldToScreen(s.x + s.dx * 0.06, s.y + s.dy * 0.06);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const w = lerp(s.w0, s.w1, t) * (0.7 + k * 0.6);

      ctx.strokeStyle = inkColor(s.hue, (0.10 + 0.34 * k));
      ctx.lineWidth = w * 1.85;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      ctx.strokeStyle = inkColor(s.hue, (0.12 + 0.44 * k));
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  function drawSplatter() {
    for (const p of fx) {
      const t = p.t / p.life;
      const k = 1 - t;
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = inkColor(p.hue, 0.10 + 0.42 * k);
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * (0.7 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    const p = worldToScreen(player.x, player.y);
    const fxdir = player.face;

    // 잉크 그림자(웅덩이)
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 18, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const hurt01 = player.invuln > 0 ? 0.9 : 0;
    drawCalligraphyFigure(p.x, p.y, fxdir.x, fxdir.y, 1.0, "ink", "indigo", hurt01, false);
  }

  function drawEnemy(e) {
    const p = worldToScreen(e.x, e.y);
    const t = e.type;

    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 16, e.elite ? 26 : 22, e.elite ? 13 : 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 적은 타입별로 색(인디고/검정/붉은 기운)
    const hurt01 = e.hurt > 0 ? 1 : 0;
    const hue = t.hue;
    const accent = hue === "crim" ? "crim" : "indigo";
    drawCalligraphyFigure(p.x, p.y, (player.x - e.x), (player.y - e.y), e.elite ? 1.10 : 0.92, hue, accent, hurt01, e.elite);

    // 공격 예고 링
    if (e.attacking) {
      ctx.strokeStyle = CRIM(0.30);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.elite ? 42 : 34, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFlash() {
    if (state.flash <= 0) return;
    ctx.globalAlpha = clamp(state.flash, 0, 1) * 0.34;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
  }

  function drawRankPop() {
    // CSS로도 처리하지만, 캔버스 위에 더 “묵기” 느낌의 빛을 살짝 얹음
    if (combo.popT <= 0) return;
    const t = 1 - (combo.popT / 0.95);
    const k = easeOutExpo(clamp(t, 0, 1));

    const a = (1 - k) * 0.14;
    ctx.globalAlpha = a;
    const gx = view.w * 0.5, gy = view.h * 0.45;
    const r = 220 * (0.7 + k * 0.6);
    const g = ctx.createRadialGradient(gx, gy, 20, gx, gy, r);
    g.addColorStop(0, "rgba(170,125,45,0.22)");
    g.addColorStop(1, "rgba(170,125,45,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
  }

  /* =========================
     Render
  ========================= */
  function draw() {
    drawPaper();
    drawArena();

    drawStrokes();
    drawSplatter();

    for (const e of enemies) if (e.hp > 0) drawEnemy(e);
    drawPlayer();

    drawRankPop();
    drawFlash();

    // 필름 그레인
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 110; i++) {
      const x = (Math.random() * view.w) | 0;
      const y = (Math.random() * view.h) | 0;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* =========================
     Main loop
  ========================= */
  function loop(ts) {
    if (!state.last) state.last = ts;
    const rawDt = clamp((ts - state.last) / 1000, 0, 0.033);
    state.last = ts;

    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - rawDt);
      update(0);
    } else {
      if (state.slowT > 0) state.slowT = Math.max(0, state.slowT - rawDt);
      else state.slowTarget = 1;

      state.timeScale = lerp(state.timeScale, state.slowTarget, 1 - Math.pow(0.001, rawDt));
      update(rawDt * state.timeScale);
    }

    draw();
    requestAnimationFrame(loop);
  }

  /* =========================
     Boot
  ========================= */
  reset();
  hiText.textContent = state.hi;
  requestAnimationFrame(loop);

  overlay.addEventListener("pointerdown", () => {
    Beep.init();
    if (!state.started) start();
    else if (state.over) reset();
  }, { passive: true });

})();

/* =========================
   MOBILE INPUT PATCH (Joystick + Attack)
========================= */
const INPUT = {
  ax: 0,  // -1 ~ 1
  ay: 0,  // -1 ~ 1
  atk: false,
};

(function setupMobileControls(){
  const ui = document.getElementById("mobileUI");
  const joy = document.getElementById("joy");
  const base = document.getElementById("joyBase");
  const stick = document.getElementById("joyStick");
  const btnAtk = document.getElementById("btnAtk");
  if(!ui || !joy || !base || !stick || !btnAtk) return;

  // 모바일에서만 보이게(원하면 제거 가능)
  const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  if(!isTouch) ui.style.display = "none";

  let dragging = false;
  let centerX = 0, centerY = 0;
  const R = 46;      // 조이스틱 반경(감도)
  const DEAD = 6;    // 데드존(px)

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function setCenter(){
    const r = base.getBoundingClientRect();
    centerX = r.left + r.width/2;
    centerY = r.top + r.height/2;
  }

  function updateStick(clientX, clientY){
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if(dist < DEAD){
      stick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
      INPUT.ax = 0; INPUT.ay = 0;
      return;
    }

    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);

    // 스틱 UI 이동(최대 R)
    const px = clamp(dx, -R, R);
    const py = clamp(dy, -R, R);
    stick.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px)`;

    // 입력값(-1~1)
    const strength = clamp(dist / R, 0, 1);
    INPUT.ax = nx * strength;
    INPUT.ay = ny * strength;
  }

  function stop(){
    dragging = false;
    stick.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
    INPUT.ax = 0; INPUT.ay = 0;
  }

  // ✅ pointer 이벤트로 모바일/PC 모두 안정적(터치+마우스 통합)
  joy.addEventListener("pointerdown", (e)=>{
    dragging = true;
    joy.setPointerCapture(e.pointerId);
    setCenter();
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  });

  joy.addEventListener("pointermove", (e)=>{
    if(!dragging) return;
    updateStick(e.clientX, e.clientY);
    e.preventDefault();
  });

  joy.addEventListener("pointerup", (e)=>{
    stop();
    e.preventDefault();
  });
  joy.addEventListener("pointercancel", stop);

  // 공격 버튼 (눌렀을 때 1회 공격)
  btnAtk.addEventListener("pointerdown", (e)=>{
    INPUT.atk = true;
    e.preventDefault();
  });
  btnAtk.addEventListener("pointerup", (e)=>{
    e.preventDefault();
  });

  window.addEventListener("resize", setCenter);
  setTimeout(setCenter, 0);
})();

/* =========================
   ✅ 너 게임 코드랑 연결하는 부분 (여기만 바꾸면 끝)
   - 게임 루프(매 프레임)에서 아래 함수를 한번 호출해줘.
========================= */
function APPLY_MOBILE_INPUT(){
  // 1) 이동: 아래 playerMove(ax, ay) 를 네 프로젝트 함수/변수로 연결
  // 예) player.vx = INPUT.ax * player.speed; player.vy = INPUT.ay * player.speed;
  if (typeof playerMove === "function") {
    playerMove(INPUT.ax, INPUT.ay);
  }

  // 2) 공격: 아래 playerAttack() 를 네 프로젝트 함수/변수로 연결
  if (INPUT.atk) {
    INPUT.atk = false;
    if (typeof playerAttack === "function") playerAttack();
  }
}

// === INPUT DEBUG HUD (모바일에서 입력 들어오는지 눈으로 확인) ===
(function(){
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:10px;top:10px;z-index:99999;padding:8px 10px;background:rgba(0,0,0,.55);color:#fff;font:12px/1.2 monospace;border-radius:10px;pointer-events:none";
  document.body.appendChild(d);

  setInterval(()=> {
    const ax = (window.INPUT?.ax ?? 0).toFixed(2);
    const ay = (window.INPUT?.ay ?? 0).toFixed(2);
    const atk = window.INPUT?.atk ? "1":"0";
    d.textContent = `ax:${ax} ay:${ay} atk:${atk}`;
  }, 100);
})();