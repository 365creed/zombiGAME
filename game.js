/* game.js — FULL REPLACE (HEAVY / WEIGHTY “SANNABI-ish” monochrome line-pixel feel)
   - 검정색만(알파로 대비)
   - 베기 범위/궤적이 확실히 보임(부채꼴 + 다중 획 + 잔선 스파크)
   - 가드가 “방패 영역”처럼 보임(전방 부채 + 링 + 떨림)
   - 플레이어/적 구분 명확(정돈된 홍길동 실루엣 vs 거친 먹귀)
   - 타격감 강화(히트스톱/카메라 흔들림/진동/스크래치 파편)
*/
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

  /* =========================
     Resize
  ========================= */
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas, { passive: true });
  resizeCanvas();

  /* =========================
     Helpers
  ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const snap = (v) => Math.round(v);
  const rand = (a, b) => a + Math.random() * (b - a);

  function haptic(ms = 20) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  // tiny synth: heavier = lower pitch
  let audioCtx = null;
  function beep(freq = 160, dur = 0.06, type = "square", gain = 0.04) {
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

  /* =========================
     World / State
  ========================= */
  const WORLD = { w: 1300, h: 850 };

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
    // “무게감”: 카메라가 살짝 뒤따라오도록
    camX: 0,
    camY: 0,
  };
  hiText.textContent = String(state.hi);

  const player = {
    x: WORLD.w * 0.5,
    y: WORLD.h * 0.58,
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

    flash: 0,     // 번쩍
    guardFx: 0,   // 가드 강조
    swingFx: 0,   // 베기 모션 잔상/일렁임 강도
  };

  const input = {
    mx: 0, my: 0,
    keys: new Set(),
    slash: false,
    guard: false,
    dash: false,
    special: false,
  };

  const enemies = [];
  const particles = [];   // 잉크 점/파편
  const scratches = [];   // “검은 잔선” 파편
  const slashes = [];     // 베기 궤적(시각)
  const skyline = [];
  const wires = [];

  /* =========================
     Background: skyline + wires (더 산나비 느낌)
  ========================= */
  function seedBackground() {
    skyline.length = 0;
    wires.length = 0;

    const baseY = WORLD.h * 0.30;
    let x = -80;
    while (x < WORLD.w + 200) {
      const w = rand(50, 140);
      const h = rand(50, 280);
      skyline.push({
        x,
        w,
        h,
        y: baseY + rand(-12, 18),
        dents: Math.floor(rand(2, 6)),
      });
      x += w * rand(0.55, 0.9);
    }

    // 전선 (얇은 곡선 여러 개)
    const wireCount = 4;
    for (let i = 0; i < wireCount; i++) {
      const y0 = baseY + rand(-110, 40) + i * rand(16, 30);
      wires.push({
        y0,
        a: rand(0.8, 1.4),
        ph: rand(0, Math.PI * 2),
      });
    }
  }
  seedBackground();

  /* =========================
     Rank / Combo
  ========================= */
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
    rankPopSub.textContent = rank === "S" ? "검은 묵기 폭주!" : "묵기 연계!";
    rankPop.classList.remove("show");
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
    state.comboTimer = 2.4;
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

  /* =========================
     Spawn
  ========================= */
  function spawnEnemy(n = 1) {
    for (let i = 0; i < n; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (edge === 0) { x = -50; y = rand(0, WORLD.h); }
      if (edge === 1) { x = WORLD.w + 50; y = rand(0, WORLD.h); }
      if (edge === 2) { x = rand(0, WORLD.w); y = -50; }
      if (edge === 3) { x = rand(0, WORLD.w); y = WORLD.h + 50; }

      // 무게감: 적도 살짝 둔중
      const speed = 52 + Math.random() * (25 + state.wave * 3.8);

      const typeRoll = Math.random();
      const type = typeRoll < 0.65 ? "wraith" : (typeRoll < 0.9 ? "brute" : "dart");

      const baseR = type === "brute" ? rand(22, 30) : (type === "dart" ? rand(14, 18) : rand(16, 24));
      const baseHP = type === "brute" ? 36 : (type === "dart" ? 20 : 26);

      enemies.push({
        kind: "enemy",
        type,
        x, y,
        r: baseR,
        hp: baseHP + state.wave * (type === "brute" ? 9 : 6),
        sp: speed * (type === "dart" ? 1.35 : (type === "brute" ? 0.85 : 1)),
        hit: 0,
        wob: rand(0, 999),
      });
    }
  }

  function spawnWave(w) {
    waveText.textContent = String(w);
    const count = 4 + Math.floor(w * 1.7);
    spawnEnemy(count);
  }

  function resetGame(full = true) {
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.rank = "-";

    player.x = WORLD.w * 0.5;
    player.y = WORLD.h * 0.58;
    player.vx = player.vy = 0;
    player.hp = player.hpMax;
    player.ink = player.inkMax;
    player.guarding = false;
    player.dashCD = 0;
    player.slashCD = 0;
    player.invuln = 0;
    player.flash = 0;
    player.guardFx = 0;
    player.swingFx = 0;

    enemies.length = 0;
    particles.length = 0;
    scratches.length = 0;
    slashes.length = 0;

    if (full) seedBackground();
    spawnWave(state.wave);
    syncHUD();
  }

  /* =========================
     FX particles
  ========================= */
  function inkDot(x, y, vx, vy, life, size) {
    particles.push({ x, y, vx, vy, life, t: life, size });
  }
  function scratchLine(x, y, vx, vy, life, w) {
    scratches.push({ x, y, vx, vy, life, t: life, w, a: rand(0, Math.PI * 2) });
  }
  function burstInk(x, y, power = 1) {
    const n = Math.floor(16 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 260) * power;
      inkDot(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.22, 0.55), rand(2, 5));
    }
    const m = Math.floor(10 * power);
    for (let i = 0; i < m; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (120 + Math.random() * 360) * power;
      scratchLine(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.14, 0.32), rand(10, 18));
    }
  }

  function hitStop(frames = 3) {
    state.hitStop = Math.max(state.hitStop, frames);
  }
  function shake(amount = 10) {
    state.shake = Math.max(state.shake, amount);
  }

  /* =========================
     Visible range (heavy slash cone)
  ========================= */
  function drawCone(ctx2, sx, sy, fx, fy, reach, halfAngle, alpha) {
    const ang = Math.atan2(fy, fx);
    ctx2.save();
    ctx2.translate(sx, sy);
    ctx2.rotate(ang);

    // fill
    ctx2.globalAlpha = alpha;
    ctx2.fillStyle = "#000";
    ctx2.beginPath();
    ctx2.moveTo(0, 0);
    ctx2.arc(0, 0, reach, -halfAngle, halfAngle);
    ctx2.closePath();
    ctx2.fill();

    // outline
    ctx2.globalAlpha = Math.min(1, alpha + 0.18);
    ctx2.strokeStyle = "#000";
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.arc(0, 0, reach, -halfAngle, halfAngle);
    ctx2.stroke();

    // inner ring hint
    ctx2.globalAlpha = alpha * 0.55;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.arc(0, 0, reach * 0.72, 0, Math.PI * 2);
    ctx2.stroke();

    ctx2.restore();
  }

  /* =========================
     Slash visuals pack
  ========================= */
  function pushSlash(px, py, dx, dy, heavy = false) {
    const [nx, ny] = norm(dx, dy);
    const life = heavy ? 0.22 : 0.16; // 더 오래 남게(무게감)
    const reach = heavy ? 128 : 98;
    const half = heavy ? 0.84 : 0.62;
    slashes.push({
      x: px + nx * 16,
      y: py + ny * 16,
      nx, ny,
      life,
      t: life,
      heavy,
      reach,
      half,
      r: heavy ? 92 : 72,
      w: heavy ? 34 : 24,
    });
  }

  /* =========================
     Combat: heavy feel
  ========================= */
  function dealDamage(e, dmg, hx, hy, isHeavy = false) {
    e.hp -= dmg;
    e.hit = 0.16;

    // 무게감: 강할수록 더 긴 히트스톱/더 큰 흔들림
    player.flash = Math.max(player.flash, isHeavy ? 0.36 : 0.22);
    player.swingFx = Math.max(player.swingFx, isHeavy ? 0.42 : 0.26);

    burstInk(hx, hy, isHeavy ? 1.35 : 1.0);
    shake(isHeavy ? 16 : 11);
    hitStop(isHeavy ? 5 : 3);

    beep(isHeavy ? 120 : 150, isHeavy ? 0.08 : 0.06, "square", isHeavy ? 0.055 : 0.045);
    haptic(isHeavy ? 34 : 22);

    if (e.hp <= 0) {
      state.kills += 1;
      killText.textContent = String(state.kills);

      state.score += 12 + Math.floor(state.combo * 1.7);
      addCombo();

      burstInk(e.x, e.y, 1.8);
      beep(85, 0.09, "sawtooth", 0.05);

      enemies.splice(enemies.indexOf(e), 1);

      if (enemies.length === 0) {
        state.wave += 1;
        waveText.textContent = String(state.wave);
        state.score += 60 + state.wave * 6;
        spawnWave(state.wave);
      }
    }
  }

  // 공격 판정을 “부채꼴(시각과 동일)”로 맞춤
  function inCone(px, py, fx, fy, ex, ey, reach, halfAngle) {
    const dx = ex - px;
    const dy = ey - py;
    const d = Math.hypot(dx, dy);
    if (d > reach) return false;
    const angTo = Math.atan2(dy, dx);
    const angF = Math.atan2(fy, fx);
    let da = angTo - angF;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) <= halfAngle;
  }

  function slashAttack(heavy = false) {
    if (player.slashCD > 0) return;

    // 무게감: 공격 속도 느리게, 대신 강하게
    const cost = heavy ? 32 : 12;
    if (player.ink < cost) return;

    player.ink -= cost;
    player.slashCD = heavy ? 0.62 : 0.30;

    const fx = player.faceX || 1;
    const fy = player.faceY || 0;

    pushSlash(player.x, player.y, fx, fy, heavy);

    player.flash = Math.max(player.flash, heavy ? 0.30 : 0.16);
    player.swingFx = Math.max(player.swingFx, heavy ? 0.40 : 0.22);

    // 히트 박스: 시각과 동일
    const reach = heavy ? 128 : 98;
    const half = heavy ? 0.84 : 0.62;
    const dmg = heavy ? 30 : 16;

    // “무거운 휘두름” 느낌: 살짝 전진
    const [nx, ny] = norm(fx, fy);
    player.vx += nx * (heavy ? 140 : 60);
    player.vy += ny * (heavy ? 140 : 60);

    // 타격 판정
    for (const e of [...enemies]) {
      const hit = inCone(player.x, player.y, fx, fy, e.x, e.y, reach + e.r, half);
      if (!hit) continue;

      const hx = lerp(player.x, e.x, 0.65);
      const hy = lerp(player.y, e.y, 0.65);
      dealDamage(e, dmg, hx, hy, heavy);
    }

    // 휘두름 자체 임팩트(헛스윙도 무게감)
    shake(heavy ? 11 : 7);
    hitStop(heavy ? 2 : 1);
    beep(heavy ? 135 : 210, heavy ? 0.09 : 0.06, "triangle", heavy ? 0.05 : 0.035);
    haptic(heavy ? 18 : 10);
  }

  function dash() {
    if (player.dashCD > 0) return;
    if (player.ink < 12) return;

    player.ink -= 12;
    player.dashCD = 0.75;
    player.invuln = 0.22;
    player.flash = Math.max(player.flash, 0.18);

    const [nx, ny] = norm(player.faceX || 1, player.faceY || 0);
    player.vx += nx * 520;
    player.vy += ny * 520;

    burstInk(player.x, player.y, 0.85);
    shake(10);
    hitStop(1);
    beep(260, 0.05, "sine", 0.05);
    haptic(16);
  }

  function specialInkBurst() {
    if (player.ink < 56) return;
    player.ink -= 56;

    player.flash = Math.max(player.flash, 0.44);
    player.swingFx = Math.max(player.swingFx, 0.55);

    const radius = 165;
    burstInk(player.x, player.y, 2.2);
    pushSlash(player.x, player.y, player.faceX || 1, player.faceY || 0, true);

    for (const e of [...enemies]) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.r) dealDamage(e, 22, e.x, e.y, true);
    }

    shake(18);
    hitStop(6);
    beep(95, 0.13, "sawtooth", 0.06);
    haptic(38);
  }

  /* =========================
     Input: Keyboard
  ========================= */
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
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

  /* =========================
     Input: Touch joystick (single)
  ========================= */
  const joy = {
    active: false,
    id: null,
    cx: 0,
    cy: 0,
    dx: 0,
    dy: 0,
    mag: 0,
    radius: 54,
    dead: 0.14,
  };

  function setKnob(dx, dy, mag) {
    const r = joy.radius;
    knob.style.transform = `translate(${dx * r * mag}px, ${dy * r * mag}px)`;
  }

  function joyStart(e) {
    joy.active = true;
    joy.id = e.pointerId;
    const rect = stick.getBoundingClientRect();
    joy.cx = rect.left + rect.width / 2;
    joy.cy = rect.top + rect.height / 2;
    stick.classList.add("stick--on");
    stick.setPointerCapture?.(e.pointerId);
    joyMove(e);
  }

  function joyMove(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    const dx = e.clientX - joy.cx;
    const dy = e.clientY - joy.cy;
    const d = Math.hypot(dx, dy);
    const m = clamp(d / joy.radius, 0, 1);
    const [nx, ny] = d > 0 ? [dx / d, dy / d] : [0, 0];
    joy.dx = nx; joy.dy = ny; joy.mag = m;
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

  stick.addEventListener("pointerdown", joyStart, { passive: false });
  window.addEventListener("pointermove", joyMove, { passive: false });
  window.addEventListener("pointerup", joyEnd, { passive: true });
  window.addEventListener("pointercancel", joyEnd, { passive: true });

  /* =========================
     Input: Mobile buttons
  ========================= */
  function bindHold(btn, onDown, onUp) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("is-down");
      btn.setPointerCapture?.(e.pointerId);
      onDown();
    }, { passive: false });

    const up = () => {
      btn.classList.remove("is-down");
      onUp?.();
    };
    btn.addEventListener("pointerup", up, { passive: true });
    btn.addEventListener("pointercancel", up, { passive: true });
    btn.addEventListener("lostpointercapture", () => btn.classList.remove("is-down"), { passive: true });
  }

  // SLASH: 짧게 누르면 라이트 / 길게(0.22s)면 헤비로 자동
  let slashHoldT = 0;
  bindHold(btnSlash,
    () => { slashHoldT = 0.0001; },
    () => {
      const heavy = slashHoldT >= 0.22;
      input.slash = false;
      slashAttack(heavy);
    }
  );

  bindHold(btnGuard, () => (input.guard = true), () => (input.guard = false));
  bindHold(btnDash, () => { input.dash = true; }, () => {});
  bindHold(btnSpecial, () => { input.special = true; }, () => {});

  // Overlay
  startBtn.addEventListener("click", () => {
    overlay.classList.add("hide");
    state.running = true;
    state.last = performance.now();
    // iOS audio unlock
    beep(1, 0.001, "sine", 0.0001);
  });
  resetBtn.addEventListener("click", () => {
    resetGame(true);
    overlay.classList.remove("hide");
    state.running = false;
  });

  /* =========================
     Character Draw (monochrome line/pixel)
  ========================= */
  function inkFlicker(ctx2, x, y, r, power, t) {
    const n = 10;
    ctx2.save();
    ctx2.translate(x, y);
    ctx2.globalAlpha = 0.10 * power;
    ctx2.strokeStyle = "#000";
    ctx2.lineWidth = 2;
    ctx2.lineCap = "square";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 6;
      const rr = r + 10 + Math.sin(t * 10 + i) * 7 * power;
      const ex = Math.cos(a) * rr;
      const ey = Math.sin(a) * rr;
      ctx2.beginPath();
      ctx2.moveTo(0, 0);
      ctx2.quadraticCurveTo(ex * 0.35, ey * 0.35, ex, ey);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  function drawHeroHongGildong(ctx2, x, y, fx, fy, flash, guardFx, swingFx, inv, t) {
    x = snap(x); y = snap(y);
    const dir = Math.atan2(fy || 0, fx || 1);

    ctx2.save();
    ctx2.translate(x, y);
    ctx2.rotate(dir);

    // flash blob
    const f = clamp(flash, 0, 1);
    if (f > 0.001) {
      ctx2.globalAlpha = 0.18 * f;
      ctx2.fillStyle = "#000";
      ctx2.beginPath();
      ctx2.arc(0, 0, 46, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.globalAlpha = 1;
    }

    // swing smear (묵직한 휘두름 잔상)
    const sf = clamp(swingFx, 0, 1);
    if (sf > 0.01) {
      ctx2.save();
      ctx2.globalAlpha = 0.10 * sf;
      ctx2.fillStyle = "#000";
      ctx2.beginPath();
      ctx2.moveTo(8, 6);
      ctx2.arc(0, 0, 56, -0.55, 0.55);
      ctx2.closePath();
      ctx2.fill();
      ctx2.restore();
    }

    ctx2.strokeStyle = "#000";
    ctx2.lineCap = "square";

    // cloak: 더 각지고 무겁게
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.moveTo(-22, 14);
    ctx2.quadraticCurveTo(-10, 34, 16, 22);
    ctx2.quadraticCurveTo(36, 10, 24, -6);
    ctx2.stroke();

    // torn hem lines (도포 아래 찢김 느낌)
    ctx2.globalAlpha = 0.55;
    ctx2.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const xx = -18 + i * 7;
      const yy = 22 + (i % 2) * 2;
      ctx2.beginPath();
      ctx2.moveTo(xx, yy);
      ctx2.lineTo(xx + 4, yy + 10 + (i % 3));
      ctx2.stroke();
    }
    ctx2.globalAlpha = 1;

    // torso line
    ctx2.lineWidth = 5;
    ctx2.beginPath();
    ctx2.moveTo(-8, 12);
    ctx2.quadraticCurveTo(0, 24, 12, 12);
    ctx2.stroke();

    // hat brim (크게)
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.ellipse(0, -14, 22, 8, 0, 0, Math.PI * 2);
    ctx2.stroke();

    // hat top
    ctx2.lineWidth = 3;
    ctx2.beginPath();
    ctx2.moveTo(-12, -14);
    ctx2.quadraticCurveTo(0, -32, 12, -14);
    ctx2.stroke();

    // face dot
    ctx2.fillStyle = "#000";
    ctx2.fillRect(6, -10, 2, 2);

    // sword (longer, heavier)
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.moveTo(10, 8);
    ctx2.lineTo(42, 2);
    ctx2.stroke();

    // sword tip scratches
    ctx2.globalAlpha = 0.55;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(42, 2);
    ctx2.lineTo(54, -2);
    ctx2.moveTo(40, 6);
    ctx2.lineTo(50, 10);
    ctx2.stroke();
    ctx2.globalAlpha = 1;

    // Guard: 링 + 전방 부채 + 떨림
    if (guardFx > 0.01) {
      const g = guardFx;
      ctx2.save();
      ctx2.globalAlpha = 0.28 * g;
      ctx2.lineWidth = 6;
      ctx2.beginPath();
      ctx2.arc(0, 0, 38, 0, Math.PI * 2);
      ctx2.stroke();

      // front fan shows defense zone
      ctx2.globalAlpha = 0.14 * g;
      ctx2.fillStyle = "#000";
      ctx2.beginPath();
      ctx2.moveTo(0, 0);
      ctx2.arc(0, 0, 52, -1.05, 1.05);
      ctx2.closePath();
      ctx2.fill();

      // jitter lines
      ctx2.globalAlpha = 0.22 * g;
      ctx2.strokeStyle = "#000";
      ctx2.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45 + Math.sin(t * 14 + i) * 0.04;
        ctx2.beginPath();
        ctx2.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        ctx2.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
        ctx2.stroke();
      }
      ctx2.restore();
    }

    // invuln ring
    if (inv > 0.001) {
      ctx2.globalAlpha = 0.30;
      ctx2.lineWidth = 1;
      ctx2.beginPath();
      ctx2.arc(0, 0, 56, 0, Math.PI * 2);
      ctx2.stroke();
      ctx2.globalAlpha = 1;
    }

    ctx2.restore();
  }

  function drawEnemyInk(ctx2, x, y, r, hit, t, type) {
    x = snap(x); y = snap(y);
    ctx2.save();
    ctx2.translate(x, y);

    ctx2.strokeStyle = "#000";
    ctx2.lineCap = "square";

    // body: rough torn (type별 모양 차)
    ctx2.globalAlpha = hit > 0 ? 0.95 : 0.78;
    ctx2.lineWidth = type === "brute" ? 4 : 3;

    ctx2.beginPath();
    const seg = type === "dart" ? 14 : 18;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + Math.sin(t * 8 + i) * (type === "dart" ? 0.16 : 0.12);
      const jag = (i % 3 === 0) ? 4 : -2;
      const rr = r * wob + jag;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx2.moveTo(px, py);
      else ctx2.lineTo(px, py);
    }
    ctx2.closePath();
    ctx2.stroke();

    // eye dots (enemy marker)
    ctx2.globalAlpha = 1;
    ctx2.fillStyle = "#000";
    ctx2.fillRect(-4, -3, 2, 2);
    ctx2.fillRect(2, -3, 2, 2);

    // tendrils
    ctx2.globalAlpha = 0.55;
    ctx2.lineWidth = 2;
    const n = type === "brute" ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(t * 2) * 0.18;
      const ex = Math.cos(a) * (r + 16 + (i % 2) * 12);
      const ey = Math.sin(a) * (r + 10 + (i % 3) * 10);
      ctx2.beginPath();
      ctx2.moveTo(0, 0);
      ctx2.quadraticCurveTo(ex * 0.35, ey * 0.35, ex, ey);
      ctx2.stroke();
    }

    // brute has “shoulder spike” lines
    if (type === "brute") {
      ctx2.globalAlpha = 0.55;
      ctx2.lineWidth = 3;
      ctx2.beginPath();
      ctx2.moveTo(-r * 0.6, -r * 0.2);
      ctx2.lineTo(-r * 1.2, -r * 0.7);
      ctx2.moveTo(r * 0.6, -r * 0.2);
      ctx2.lineTo(r * 1.2, -r * 0.7);
      ctx2.stroke();
    }

    ctx2.restore();
  }

  /* =========================
     HUD
  ========================= */
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

  function gameOver() {
    state.running = false;
    overlay.classList.remove("hide");
    document.getElementById("ovTitle").textContent = "GAME OVER";
    document.getElementById("ovBody").innerHTML =
      `SCORE <b>${state.score}</b> · BEST <b>${state.hi}</b><br/>RESET을 누르면 새로 시작합니다.`;
  }

  /* =========================
     Update
  ========================= */
  function update(dt) {
    // hit stop
    if (state.hitStop > 0) {
      state.hitStop -= 1;
      dt = 0;
    }

    state.t += dt;

    // mobile slash hold timer
    if (slashHoldT > 0) slashHoldT += dt;

    // combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }

    // ink regen (무게감: 조금 느리게)
    player.ink = clamp(player.ink + 16 * dt, 0, player.inkMax);

    // cooldowns
    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    // fx decay
    player.flash = Math.max(0, player.flash - dt * 4.2);
    player.swingFx = Math.max(0, player.swingFx - dt * 3.4);

    // movement input
    let mx = 0, my = 0;
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) my -= 1;
    if (k.has("s") || k.has("arrowdown")) my += 1;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;

    // joystick
    const jm = joy.mag > joy.dead ? joy.mag : 0;
    if (jm > 0) {
      mx += joy.dx * jm;
      my += joy.dy * jm;
    }

    const mlen = Math.hypot(mx, my);
    if (mlen > 0.001) {
      const nx = mx / mlen;
      const ny = my / mlen;
      input.mx = nx; input.my = ny;
      // 무게감: 바라보는 방향도 살짝 느리게 따라감
      player.faceX = lerp(player.faceX, nx, clamp(9 * dt, 0, 1));
      player.faceY = lerp(player.faceY, ny, clamp(9 * dt, 0, 1));
    } else {
      input.mx = input.my = 0;
    }

    // guard
    player.guarding = !!input.guard;
    if (player.guarding) player.guardFx = Math.min(1, player.guardFx + dt * 5.5);
    else player.guardFx = Math.max(0, player.guardFx - dt * 7.5);

    // actions (keyboard one-shot)
    if (input.dash) { dash(); input.dash = false; }
    if (input.special) { specialInkBurst(); input.special = false; }

    // keyboard slash: Shift+J = heavy
    if (input.slash) {
      const heavy = input.keys.has("shift");
      slashAttack(heavy);
      input.slash = false;
    }

    // move physics (무게감: 가속/감속 느리게)
    const baseSp = player.guarding ? 170 : 225;
    const accel = player.guarding ? 5.5 : 5.0;
    const ax = input.mx * baseSp * accel;
    const ay = input.my * baseSp * accel;

    player.vx = player.vx + ax * dt;
    player.vy = player.vy + ay * dt;

    // friction
    const fr = player.guarding ? 9.5 : 7.2;
    player.vx = lerp(player.vx, 0, clamp(fr * dt, 0, 1));
    player.vy = lerp(player.vy, 0, clamp(fr * dt, 0, 1));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // bounds
    player.x = clamp(player.x, 50, WORLD.w - 50);
    player.y = clamp(player.y, 70, WORLD.h - 50);

    // enemies update + collision
    for (const e of enemies) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const [nx, ny] = norm(dx, dy);

      // type별 움직임 살짝 차이
      const drift = (e.type === "dart") ? 0.12 : 0.08;
      const wob = Math.sin(state.t * 2.2 + e.wob) * drift;

      e.x += (nx * e.sp + -ny * e.sp * wob) * dt;
      e.y += (ny * e.sp + nx * e.sp * wob) * dt;

      e.hit = Math.max(0, e.hit - dt);

      const d = Math.hypot(dx, dy);
      if (d < e.r + player.r) {
        if (player.invuln <= 0) {
          const base = 9 + Math.floor(state.wave * 0.7);
          const dmg = e.type === "brute" ? base + 4 : (e.type === "dart" ? base - 2 : base);

          if (player.guarding) {
            // guard reduces + gives ink
            player.hp -= Math.max(1, Math.floor(dmg * 0.22));
            player.ink = clamp(player.ink + 12, 0, player.inkMax);

            player.flash = Math.max(player.flash, 0.14);
            shake(8);
            hitStop(2);
            beep(420, 0.04, "square", 0.045);
            haptic(14);
          } else {
            player.hp -= dmg;
            player.flash = Math.max(player.flash, 0.32);
            shake(16);
            hitStop(4);
            beep(70, 0.09, "sawtooth", 0.055);
            haptic(34);
            breakCombo();
          }

          player.invuln = 0.38;
          burstInk(player.x, player.y, 0.9);

          if (player.hp <= 0) {
            player.hp = 0;
            gameOver();
          }
        }
      }
    }

    // update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t -= dt;
      if (p.t <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.90;
      p.vy *= 0.90;
    }

    // scratches
    for (let i = scratches.length - 1; i >= 0; i--) {
      const s = scratches[i];
      s.t -= dt;
      if (s.t <= 0) { scratches.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.88;
      s.vy *= 0.88;
      s.a += dt * 4.2;
    }

    // slashes
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i];
      s.t -= dt;
      if (s.t <= 0) slashes.splice(i, 1);
    }

    // score/hi
    if (state.score > state.hi) {
      state.hi = state.score;
      localStorage.setItem("ink_hi", String(state.hi));
    }

    syncHUD();
  }

  /* =========================
     Draw
  ========================= */
  function worldToScreen(x, y, camX, camY) {
    return [x - camX, y - camY];
  }

  function drawBackground(vw, vh, camX, camY, sx, sy) {
    // paper
    ctx.fillStyle = "#efe6cf";
    ctx.fillRect(0, 0, vw, vh);

    // skyline parallax
    ctx.save();
    ctx.translate(-camX * 0.35 + sx * 0.2, -camY * 0.18 + sy * 0.2);
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.72;

    for (const b of skyline) {
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // dents/windows scratches
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < b.dents; i++) {
        const wx = b.x + rand(6, b.w - 10);
        const wy = b.y + rand(10, b.h - 16);
        ctx.fillRect(wx, wy, 2, rand(6, 14));
      }
      ctx.globalAlpha = 0.72;
    }

    // wires
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    for (const w of wires) {
      ctx.beginPath();
      for (let x = -40; x <= WORLD.w + 40; x += 24) {
        const y = w.y0 + Math.sin((x * 0.012) * w.a + state.t * 0.35 + w.ph) * 10;
        if (x === -40) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();

    // floor strokes (heavier scratches)
    ctx.save();
    ctx.translate(sx * 0.25, sy * 0.25);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 10; i++) {
      const x = ((i * 197 + state.t * 38) % WORLD.w);
      const y = ((i * 131 + state.t * 24) % WORLD.h);
      const [px, py] = worldToScreen(x, y, camX, camY);
      ctx.fillRect(px, py, 260, 2);
      ctx.fillRect(px + 34, py + 16, 190, 2);
      if (i % 2 === 0) ctx.fillRect(px + 18, py + 34, 140, 2);
    }
    ctx.restore();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    ctx.imageSmoothingEnabled = false;

    // camera: follow with a bit of lag (weight)
    const targetCamX = clamp(player.x - vw / 2, 0, WORLD.w - vw);
    const targetCamY = clamp(player.y - vh / 2, 0, WORLD.h - vh);
    state.camX = lerp(state.camX, targetCamX, clamp(6 * state.dt, 0, 1));
    state.camY = lerp(state.camY, targetCamY, clamp(6 * state.dt, 0, 1));

    // shake
    let sx = 0, sy = 0;
    if (state.shake > 0) {
      const m = state.shake;
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
      state.shake = Math.max(0, state.shake - 26 * state.dt);
    }

    const camX = state.camX;
    const camY = state.camY;

    // BG
    drawBackground(vw, vh, camX, camY, sx, sy);

    // world layer
    ctx.save();
    ctx.translate(sx, sy);

    // enemies
    for (const e of enemies) {
      const [x, y] = worldToScreen(e.x, e.y, camX, camY);
      drawEnemyInk(ctx, x, y, e.r, e.hit, state.t, e.type);
    }

    // cone telegraph (last slash)
    if (slashes.length > 0) {
      const s0 = slashes[slashes.length - 1];
      const [px, py] = worldToScreen(player.x, player.y, camX, camY);
      const a = clamp(s0.t / s0.life, 0, 1);
      drawCone(ctx, px, py, s0.nx, s0.ny, s0.reach, s0.half, (s0.heavy ? 0.22 : 0.16) * a);
    }

    // player aura
    {
      const [x, y] = worldToScreen(player.x, player.y, camX, camY);
      if (player.swingFx > 0.01) inkFlicker(ctx, x, y, 30, player.swingFx * 0.9, state.t);
      if (player.flash > 0.01) inkFlicker(ctx, x, y, 26, player.flash * 0.7, state.t * 0.9);
      if (player.guardFx > 0.01) inkFlicker(ctx, x, y, 34, player.guardFx * 0.8, state.t * 0.75);

      drawHeroHongGildong(
        ctx,
        x, y,
        player.faceX, player.faceY,
        player.flash,
        player.guardFx,
        player.swingFx,
        player.invuln,
        state.t
      );
    }

    // slash strokes (무게감: 다중 획 + 두꺼운 스크래치)
    for (const s of slashes) {
      const [x, y] = worldToScreen(s.x, s.y, camX, camY);
      const t = clamp(s.t / s.life, 0, 1);
      const ang = Math.atan2(s.ny, s.nx);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);

      // main heavy stroke
      ctx.globalAlpha = (s.heavy ? 0.92 : 0.86) * t;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = s.w;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.arc(0, 0, s.r, -0.70, 0.70);
      ctx.stroke();

      // second stroke slightly offset (획 2겹)
      ctx.globalAlpha = 0.46 * t;
      ctx.lineWidth = Math.max(2, s.w * 0.22);
      ctx.beginPath();
      ctx.arc(0, -6, s.r - 8, -0.66, 0.66);
      ctx.stroke();

      // third scratch (잔선)
      ctx.globalAlpha = 0.32 * t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 7, s.r - 14, -0.62, 0.62);
      ctx.stroke();

      // tip sparks (검은 스크래치)
      ctx.globalAlpha = (s.heavy ? 0.45 : 0.36) * t;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < (s.heavy ? 10 : 7); i++) {
        const yy = -10 + i * 2.4;
        ctx.moveTo(s.r + rand(-2, 2), yy);
        ctx.lineTo(s.r + rand(10, 22), yy + rand(-6, 6));
      }
      ctx.stroke();

      ctx.restore();
    }

    // particles dots
    for (const p of particles) {
      const [x, y] = worldToScreen(p.x, p.y, camX, camY);
      const a = clamp(p.t / p.life, 0, 1);
      ctx.globalAlpha = 0.52 * a;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // scratch lines
    for (const s of scratches) {
      const [x, y] = worldToScreen(s.x, s.y, camX, camY);
      const a = clamp(s.t / s.life, 0, 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.a);
      ctx.globalAlpha = 0.35 * a;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s.w * 0.5, 0);
      ctx.lineTo(s.w * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // vignette bars (무대감)
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, vw, 18);
    ctx.fillRect(0, vh - 18, vw, 18);
    ctx.globalAlpha = 1;
  }

  /* =========================
     Loop
  ========================= */
  function loop(ts) {
    const t = ts / 1000;
    let dt = Math.min(0.033, t - (state.last / 1000 || t));
    state.last = ts;
    state.dt = dt;

    if (state.running) update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  /* =========================
     Boot
  ========================= */
  resetGame(true);
  requestAnimationFrame(loop);

  // overlay 안내 (헤비 슬래시 안내 추가)
  document.getElementById("ovTitle").textContent = "INK SWORD";
  document.getElementById("ovBody").innerHTML =
    `<b>이동</b> WASD/방향키 · <b>베기</b> J (Shift+J = 헤비) · <b>가드</b> K(누름) · <b>대시</b> L · <b>잉크 폭발</b> I<br/>
     모바일: SLASH 짧게=라이트 / 길게(눌러서)=헤비 · 왼쪽 조이스틱 이동`;

  // start/reset overlay는 HTML 그대로 사용
})();