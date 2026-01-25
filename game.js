/* game.js — v5.1 FULL REPLACE
   FIX: slashHoldT scope bug removed, no requestAnimationFrame override.
   FEATURES:
   - Player: HUMAN pixel sprite, Walk 4f / Slash 4f (big sword travel) / Guard 2f
   - Enemies: 2-frame breathing animation
   - Guard: shield cone + parry flash window (on press)
   - Heavy feel: hitstop, shake, visible cone, brush flash
*/
(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  // HUD
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
  const snap = (v) => Math.round(v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  function haptic(ms = 20) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
  }

  /* =========================
     World / State
  ========================= */
  const WORLD = { w: 1400, h: 900 };

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

    camX: 0,
    camY: 0,
  };
  hiText.textContent = String(state.hi);

  const player = {
    x: WORLD.w * 0.5,
    y: WORLD.h * 0.6,
    vx: 0, vy: 0,
    r: 22,

    hp: 100, hpMax: 100,
    ink: 100, inkMax: 100,

    faceX: 1, faceY: 0,
    facing: 1,

    guarding: false,
    guardHeld: false,
    parryT: 0,
    parryFlash: 0,

    dashCD: 0,
    slashCD: 0,
    invuln: 0,

    flash: 0,
    guardFx: 0,

    act: "idle",
    animT: 0,
    walkT: 0,
  };

  const input = {
    keys: new Set(),
    slashTap: false,
    guard: false,
    dash: false,
    special: false,
  };

  // ✅ FIX: declare here (used in update)
  let slashHoldT = 0;

  const enemies = [];
  const dots = [];
  const slashes = [];

  /* =========================
     Combo / Rank
  ========================= */
  function calcRank(c) {
    if (c >= 20) return "S";
    if (c >= 12) return "A";
    if (c >= 6) return "B";
    if (c >= 3) return "C";
    return "-";
  }
  function addCombo() {
    state.combo += 1;
    state.comboTimer = 2.6;
    state.rank = calcRank(state.combo);
    comboText.textContent = String(state.combo);
    rankText.textContent = state.rank;
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
      if (edge === 0) { x = -40; y = rand(0, WORLD.h); }
      if (edge === 1) { x = WORLD.w + 40; y = rand(0, WORLD.h); }
      if (edge === 2) { x = rand(0, WORLD.w); y = -40; }
      if (edge === 3) { x = rand(0, WORLD.w); y = WORLD.h + 40; }

      const r0 = Math.random();
      const type = r0 < 0.60 ? "wraith" : (r0 < 0.85 ? "brute" : "dart");

      const baseHP = type === "brute" ? 76 : (type === "dart" ? 36 : 52);
      const baseSp = type === "brute" ? 76 : (type === "dart" ? 156 : 112);

      enemies.push({
        type,
        x, y,
        r: type === "brute" ? 28 : (type === "dart" ? 18 : 22),
        hp: baseHP + state.wave * (type === "brute" ? 11 : 7),
        sp: baseSp + state.wave * (type === "dart" ? 2.3 : 1.7),
        hit: 0,
        animT: rand(0, 10),
        wob: rand(0, 999),
        stun: 0,
      });
    }
  }
  function spawnWave(w) {
    waveText.textContent = String(w);
    spawnEnemy(4 + Math.floor(w * 1.9));
  }

  function resetGame() {
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.rank = "-";

    player.x = WORLD.w * 0.5;
    player.y = WORLD.h * 0.6;
    player.vx = player.vy = 0;
    player.hp = player.hpMax;
    player.ink = player.inkMax;

    player.dashCD = 0;
    player.slashCD = 0;
    player.invuln = 0;

    player.guardHeld = false;
    player.parryT = 0;
    player.parryFlash = 0;

    player.flash = 0;
    player.guardFx = 0;
    player.act = "idle";
    player.animT = 0;
    player.walkT = 0;

    slashHoldT = 0;

    enemies.length = 0;
    dots.length = 0;
    slashes.length = 0;

    spawnWave(state.wave);
    syncHUD();
  }

  /* =========================
     FX
  ========================= */
  function dot(x, y, vx, vy, life, size) {
    dots.push({ x, y, vx, vy, life, t: life, size });
  }
  function burstDots(x, y, power = 1) {
    const n = Math.floor(28 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (120 + Math.random() * 280) * power;
      dot(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.16, 0.55), rand(2, 4));
    }
  }
  function hitStop(frames) { state.hitStop = Math.max(state.hitStop, frames); }
  function shake(amount) { state.shake = Math.max(state.shake, amount); }

  /* =========================
     Combat
  ========================= */
  function inCone(px, py, fx, fy, ex, ey, reach, halfAngle) {
    const dx = ex - px, dy = ey - py;
    const d = Math.hypot(dx, dy);
    if (d > reach) return false;
    const angTo = Math.atan2(dy, dx);
    const angF = Math.atan2(fy, fx);
    let da = angTo - angF;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) <= halfAngle;
  }

  function pushSlash(px, py, dx, dy, heavy = false) {
    const [nx, ny] = norm(dx, dy);
    const life = heavy ? 0.30 : 0.22;
    slashes.push({
      x: px + nx * 18,
      y: py + ny * 18,
      nx, ny,
      heavy,
      reach: heavy ? 160 : 125,
      half: heavy ? 0.95 : 0.74,
      life, t: life,
    });
  }

  function dealDamageIndex(idx, dmg, hx, hy, heavy = false) {
    const e = enemies[idx];
    if (!e) return;

    e.hp -= dmg;
    e.hit = 0.18;

    burstDots(hx, hy, heavy ? 1.55 : 1.0);
    shake(heavy ? 22 : 14);
    hitStop(heavy ? 9 : 5);
    haptic(heavy ? 38 : 18);

    player.flash = Math.max(player.flash, heavy ? 0.62 : 0.28);

    if (e.hp <= 0) {
      state.kills += 1;
      killText.textContent = String(state.kills);

      state.score += 16 + Math.floor(state.combo * 2.2);
      addCombo();

      burstDots(e.x, e.y, 1.9);
      enemies.splice(idx, 1);

      if (enemies.length === 0) {
        state.wave += 1;
        spawnWave(state.wave);
      }
    }
  }

  function slashAttack(heavy = false) {
    if (player.slashCD > 0) return;
    const cost = heavy ? 38 : 14;
    if (player.ink < cost) return;

    player.ink -= cost;
    player.slashCD = heavy ? 0.78 : 0.38;

    const fx = player.faceX || 1;
    const fy = player.faceY || 0;

    pushSlash(player.x, player.y, fx, fy, heavy);

    const reach = heavy ? 160 : 125;
    const half = heavy ? 0.95 : 0.74;
    const dmg = heavy ? 42 : 18;

    const [nx, ny] = norm(fx, fy);
    player.vx += nx * (heavy ? 185 : 95);
    player.vy += ny * (heavy ? 185 : 95);

    // iterate backwards (safe for splice)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!inCone(player.x, player.y, fx, fy, e.x, e.y, reach + e.r, half)) continue;
      dealDamageIndex(i, dmg, lerp(player.x, e.x, 0.72), lerp(player.y, e.y, 0.72), heavy);
      if (heavy && enemies[i]) enemies[i].stun = Math.max(enemies[i].stun, 0.14);
    }

    player.act = "slash";
    player.animT = 0;
  }

  function dash() {
    if (player.dashCD > 0) return;
    if (player.ink < 14) return;

    player.ink -= 14;
    player.dashCD = 0.92;
    player.invuln = 0.26;

    const [nx, ny] = norm(player.faceX || 1, player.faceY || 0);
    player.vx += nx * 640;
    player.vy += ny * 640;

    burstDots(player.x, player.y, 1.0);
    shake(14);
    hitStop(2);
    haptic(18);

    player.act = "dash";
    player.animT = 0;
  }

  function specialInkBurst() {
    if (player.ink < 60) return;
    player.ink -= 60;

    player.flash = Math.max(player.flash, 0.68);

    const radius = 190;
    burstDots(player.x, player.y, 2.6);
    pushSlash(player.x, player.y, player.faceX || 1, player.faceY || 0, true);

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.r) dealDamageIndex(i, 32, e.x, e.y, true);
    }

    shake(26);
    hitStop(10);
    haptic(46);

    player.act = "slash";
    player.animT = 0;
  }

  /* =========================
     Guard + Parry
  ========================= */
  function startParryWindow() {
    player.parryT = 0.12;
    player.parryFlash = 0.20;
    shake(8);
    hitStop(1);
    haptic(10);
  }

  function tryParryOnContact(enemyIndex) {
    if (player.parryT <= 0) return false;

    const e = enemies[enemyIndex];
    if (!e) return false;

    player.parryT = 0;
    player.parryFlash = Math.max(player.parryFlash, 0.26);

    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const [nx, ny] = norm(dx, dy);

    // knockback + stun
    e.x += nx * 26;
    e.y += ny * 26;
    e.stun = Math.max(e.stun, 0.24);

    // parry damage (heavy)
    dealDamageIndex(enemyIndex, 22, e.x, e.y, true);

    // reward
    player.ink = clamp(player.ink + 18, 0, player.inkMax);

    burstDots(player.x + nx * 22, player.y + ny * 22, 1.2);
    shake(22);
    hitStop(8);
    haptic(36);
    addCombo();
    return true;
  }

  /* =========================
     Input: Keyboard
  ========================= */
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    input.keys.add(k);
    if (k === "j") input.slashTap = true;

    if (k === "k") {
      if (!input.guard) startParryWindow();
      input.guard = true;
    }

    if (k === "l") input.dash = true;
    if (k === "i") input.special = true;
  }, { passive: true });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    input.keys.delete(k);
    if (k === "k") input.guard = false;
  }, { passive: true });

  /* =========================
     Touch Joystick (single)
  ========================= */
  const joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0, mag: 0, radius: 54, dead: 0.14 };

  function setKnob(dx, dy, mag) {
    knob.style.transform = `translate(${dx * joy.radius * mag}px, ${dy * joy.radius * mag}px)`;
  }

  function joyStart(e) {
    joy.active = true;
    joy.id = e.pointerId;
    const r = stick.getBoundingClientRect();
    joy.cx = r.left + r.width / 2;
    joy.cy = r.top + r.height / 2;
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
    e.preventDefault?.();
  }
  function joyEnd(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    joy.active = false;
    joy.id = null;
    joy.dx = joy.dy = 0;
    joy.mag = 0;
    setKnob(0, 0, 0);
  }

  stick.addEventListener("pointerdown", joyStart, { passive: false });
  window.addEventListener("pointermove", joyMove, { passive: false });
  window.addEventListener("pointerup", joyEnd, { passive: true });
  window.addEventListener("pointercancel", joyEnd, { passive: true });

  /* =========================
     Touch Buttons
  ========================= */
  function btnDown(btn, fn) {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.classList.add("is-down"); fn(e); }, { passive: false });
  }
  function btnUp(btn, fn) {
    btn.addEventListener("pointerup", () => { btn.classList.remove("is-down"); fn(); }, { passive: true });
    btn.addEventListener("pointercancel", () => { btn.classList.remove("is-down"); fn(true); }, { passive: true });
  }

  // SLASH: hold -> heavy
  btnDown(btnSlash, () => { slashHoldT = 0.0001; });
  btnUp(btnSlash, () => {
    const heavy = slashHoldT >= 0.28;
    slashHoldT = 0;
    slashAttack(heavy);
  });

  // GUARD: press -> parry window
  btnDown(btnGuard, () => {
    if (!input.guard) startParryWindow();
    input.guard = true;
  });
  btnUp(btnGuard, () => { input.guard = false; });

  // DASH
  btnDown(btnDash, () => { input.dash = true; });
  btnUp(btnDash, () => {});

  // SPECIAL
  btnDown(btnSpecial, () => { input.special = true; });
  btnUp(btnSpecial, () => {});

  /* =========================
     Sprite System
  ========================= */
  function spriteFromStrings(lines) {
    return { w: lines[0].length, h: lines.length, lines };
  }
  function drawSprite(ctx2, spr, x, y, px, alpha = 1, mirrorX = false) {
    const w = spr.w, h = spr.h;
    const ox = Math.floor(w / 2);
    const oy = Math.floor(h / 2);

    ctx2.save();
    ctx2.translate(snap(x), snap(y));
    ctx2.scale(mirrorX ? -1 : 1, 1);
    ctx2.translate(-ox * px, -oy * px);
    ctx2.imageSmoothingEnabled = false;

    for (let yy = 0; yy < h; yy++) {
      const row = spr.lines[yy];
      for (let xx = 0; xx < w; xx++) {
        const c = row[xx];
        if (c === " ") continue;
        let a = alpha;
        if (c === ".") a *= 0.35;
        else if (c === "#") a *= 0.85;
        else if (c === "+") a *= 1.0;
        ctx2.globalAlpha = a;
        ctx2.fillStyle = "#000";
        ctx2.fillRect(xx * px, yy * px, px, px);
      }
    }
    ctx2.restore();
    ctx2.globalAlpha = 1;
  }

 /* =========================
   PLAYER (HUMAN) — REPLACE THIS WHOLE BLOCK
   더 “사람”으로 읽히는 도트: 머리/머리카락/얼굴/도포/팔/다리/칼
========================= */

// 24x32 (모든 줄 길이 24 유지!)
const P_IDLE = spriteFromStrings([
  "        ..++++..        ",
  "      ..++####++..      ",
  "     .++########++.     ",
  "     ++##++..++##++     ",
  "    .+##+..++++..+#+.   ",
  "    .+##+..+..+..+#+.   ",
  "     ++##++....++##++   ",
  "      .++########++.    ",
  "        ..++##++..      ",
  "         .++##++.       ",
  "        .++####++.      ",
  "      ..++######++..    ",
  "     .++###++++###++.   ",
  "     ++###+....+###++   ",
  "     ++##+  ++  +##++   ",
  "     ++##+  ++  +##++   ",
  "     ++##+  ++  +##++   ",
  "     ++##++....++##++   ",
  "     .++###++++###++.   ",
  "      .++########++.    ",
  "        ..++##++..      ",
  "        .++####++.      ",
  "       .++######++.     ",
  "      .++##++++##++.    ",
  "      ++##+    +##++    ",
  "      ++##+    +##++    ",
  "      ++##+    +##++    ",
  "      ++##+    +##++    ",
  "      .++..    ..++.    ",
  "       ..++.. ..++..    ",
  "         ..++++..       ",
  "           ....         ",
]);

// WALK 4f (다리 교차 + 도포 살짝 흔들림)
function repl(lines, map) {
  const out = lines.slice();
  for (const m of map) out[m.i] = out[m.i].replace(m.from, m.to);
  return out;
}

const P_WALK1 = spriteFromStrings(repl(P_IDLE.lines, [
  { i: 24, from: "++##+    +##++", to: "++##+  ++ +##++" },
  { i: 25, from: "++##+    +##++", to: "++##+ ++  +##++" },
  { i: 28, from: ".++..    ..++.", to: ".++..  .. ..++." },
]));

const P_WALK2 = spriteFromStrings(repl(P_IDLE.lines, [
  { i: 24, from: "++##+    +##++", to: "++##+ ++  +##++" },
  { i: 25, from: "++##+    +##++", to: "++##+++   +##++" },
  { i: 28, from: ".++..    ..++.", to: ".++.. ..  ..++." },
]));

const P_WALK3 = spriteFromStrings(repl(P_IDLE.lines, [
  { i: 24, from: "++##+    +##++", to: "++##+   ++##++" },
  { i: 25, from: "++##+    +##++", to: "++##+  ++ +##+" },
  { i: 28, from: ".++..    ..++.", to: ".++..  .. ..++." },
]));

const P_WALK4 = spriteFromStrings(repl(P_IDLE.lines, [
  { i: 24, from: "++##+    +##++", to: "++##+  ++ +##++" },
  { i: 25, from: "++##+    +##++", to: "++##+   ++##++" },
  { i: 28, from: ".++..    ..++.", to: ".++.. ..  ..++." },
]));

// GUARD 2f (앞팔/방패 자세)
function addShield(lines, phase) {
  return lines.map((row, i) => {
    if (i >= 12 && i <= 17) return row + (phase === 0 ? "  ++##" : " +++##");
    if (i === 18) return row + (phase === 0 ? "   ++ " : "  +++");
    return row + "      ";
  });
}
const P_GUARD1 = spriteFromStrings(addShield(P_IDLE.lines, 0));
const P_GUARD2 = spriteFromStrings(addShield(P_IDLE.lines, 1));

// SLASH 4f (칼 위치 “크게” 이동)
function addSword(lines, phase) {
  return lines.map((row, i) => {
    let add = "      ";
    if (phase === 0 && (i === 15 || i === 16)) add = "   ++ ";
    if (phase === 1 && (i === 13 || i === 14 || i === 15)) add = "  ++++";
    if (phase === 2 && (i === 11 || i === 12 || i === 13 || i === 14)) add = " ++++++++";
    if (phase === 2 && (i === 15 || i === 16)) add = "  ++++++";
    if (phase === 3 && (i === 14 || i === 15)) add = "   +++";
    return row + add;
  });
}
const P_SLASH1 = spriteFromStrings(addSword(P_IDLE.lines, 0));
const P_SLASH2 = spriteFromStrings(addSword(P_IDLE.lines, 1));
const P_SLASH3 = spriteFromStrings(addSword(P_IDLE.lines, 2));
const P_SLASH4 = spriteFromStrings(addSword(P_IDLE.lines, 3));


  /* =========================
     HUD / Game Over
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
     Draw helpers
  ========================= */
  function drawCone(sx, sy, fx, fy, reach, halfAngle, alpha) {
    const ang = Math.atan2(fy, fx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, -halfAngle, halfAngle);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = Math.min(1, alpha + 0.14);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, reach, -halfAngle, halfAngle);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBrushFlash(x, y, nx, ny, heavy, a) {
    const len = heavy ? 170 : 125;
    const w = heavy ? 9 : 7;

    ctx.save();
    ctx.fillStyle = "#000";

    ctx.globalAlpha = (heavy ? 0.40 : 0.30) * a;
    for (let i = 0; i < len; i += 5) {
      const k = i / len;
      const jitter = Math.sin((k * 12 + state.t * 18)) * (heavy ? 3.0 : 2.1);
      const px = snap(x + nx * i - ny * jitter);
      const py = snap(y + ny * i + nx * jitter);
      ctx.fillRect(px - w, py - 1, w * 2, 2);
    }

    ctx.globalAlpha = (heavy ? 0.28 : 0.22) * a;
    const sparks = heavy ? 14 : 9;
    for (let s = 0; s < sparks; s++) {
      const i = rand(len * 0.15, len * 0.98);
      const side = (s % 2 ? 1 : -1) * rand(12, 24);
      const px = snap(x + nx * i - ny * side);
      const py = snap(y + ny * i + nx * side);
      ctx.fillRect(px, py, rand(12, 28), 1);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParryFlash(x, y, fx, fy, alpha) {
    drawCone(x, y, fx, fy, 88, 0.72, 0.28 * alpha);

    ctx.save();
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* =========================
     Update
  ========================= */
  function update(dt) {
    if (state.hitStop > 0) {
      state.hitStop -= 1;
      dt = 0;
    }

    state.t += dt;
    player.animT += dt;

    // ✅ hold timer updated here (safe)
    if (slashHoldT > 0) slashHoldT += dt;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }

    player.ink = clamp(player.ink + 18 * dt, 0, player.inkMax);

    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    player.flash = Math.max(0, player.flash - dt * 4.6);
    player.parryT = Math.max(0, player.parryT - dt);
    player.parryFlash = Math.max(0, player.parryFlash - dt * 7);

    // move input
    let mx = 0, my = 0;
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) my -= 1;
    if (k.has("s") || k.has("arrowdown")) my += 1;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;

    // joystick
    const jm = joy.mag > joy.dead ? joy.mag : 0;
    if (jm > 0) { mx += joy.dx * jm; my += joy.dy * jm; }

    const mlen = Math.hypot(mx, my);
    if (mlen > 0.001) {
      const nx = mx / mlen;
      const ny = my / mlen;
      player.faceX = lerp(player.faceX, nx, clamp(9 * dt, 0, 1));
      player.faceY = lerp(player.faceY, ny, clamp(9 * dt, 0, 1));
      if (nx < -0.15) player.facing = -1;
      if (nx > 0.15) player.facing = 1;
    }

    // guarding
    player.guarding = !!input.guard;
    player.guardFx = player.guarding ? Math.min(1, player.guardFx + dt * 6.5) : Math.max(0, player.guardFx - dt * 9);

    // actions
    if (input.dash) { dash(); input.dash = false; }
    if (input.special) { specialInkBurst(); input.special = false; }
    if (input.slashTap) { slashAttack(false); input.slashTap = false; }

    // settle
    if (player.act === "slash" && player.animT > 0.34) player.act = "idle";
    if (player.act === "dash" && player.animT > 0.22) player.act = "idle";

    // movement
    const baseSp = player.guarding ? 175 : 250;
    const accel = player.guarding ? 5.7 : 5.2;
    player.vx += mx * baseSp * accel * dt;
    player.vy += my * baseSp * accel * dt;

    const fr = player.guarding ? 9.2 : 7.6;
    player.vx = lerp(player.vx, 0, clamp(fr * dt, 0, 1));
    player.vy = lerp(player.vy, 0, clamp(fr * dt, 0, 1));

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 60, WORLD.w - 60);
    player.y = clamp(player.y, 80, WORLD.h - 60);

    // enemies (backwards)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.animT += dt;
      e.stun = Math.max(0, e.stun - dt);

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const [nx, ny] = norm(dx, dy);

      const stunMul = e.stun > 0 ? 0.25 : 1;
      const wob = Math.sin(state.t * 2.2 + e.wob) * (e.type === "dart" ? 0.14 : 0.10);
      e.x += (nx * e.sp + -ny * e.sp * wob) * dt * stunMul;
      e.y += (ny * e.sp + nx * e.sp * wob) * dt * stunMul;

      e.hit = Math.max(0, e.hit - dt);

      const d = Math.hypot(dx, dy);
      if (d < e.r + player.r && player.invuln <= 0) {
        if (player.guarding) {
          // parry first
          if (tryParryOnContact(i)) {
            player.invuln = 0.18;
            continue;
          }
          const base = 10 + Math.floor(state.wave * 1.1);
          const dmg = e.type === "brute" ? base + 4 : (e.type === "dart" ? base - 2 : base);
          player.hp -= Math.max(1, Math.floor(dmg * 0.22));
          player.ink = clamp(player.ink + 12, 0, player.inkMax);
          shake(10);
          hitStop(3);
          haptic(14);
          // push enemy slightly
          e.x -= nx * 10;
          e.y -= ny * 10;
          e.stun = Math.max(e.stun, 0.08);
        } else {
          const base = 10 + Math.floor(state.wave * 1.1);
          const dmg = e.type === "brute" ? base + 4 : (e.type === "dart" ? base - 2 : base);
          player.hp -= dmg;
          shake(22);
          hitStop(6);
          haptic(34);
          breakCombo();
          burstDots(player.x, player.y, 1.0);
          player.flash = Math.max(player.flash, 0.32);
        }

        player.invuln = 0.40;
        if (player.hp <= 0) {
          player.hp = 0;
          gameOver();
        }
      }
    }

    // particles
    for (let i = dots.length - 1; i >= 0; i--) {
      const p = dots[i];
      p.t -= dt;
      if (p.t <= 0) { dots.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.90;
      p.vy *= 0.90;
    }

    // slashes life
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].t -= dt;
      if (slashes[i].t <= 0) slashes.splice(i, 1);
    }

    if (state.score > state.hi) {
      state.hi = state.score;
      localStorage.setItem("ink_hi", String(state.hi));
    }

    syncHUD();
  }

  /* =========================
     Draw
  ========================= */
  function draw() {
    const rect = canvas.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    ctx.imageSmoothingEnabled = false;

    const targetCamX = clamp(player.x - vw / 2, 0, WORLD.w - vw);
    const targetCamY = clamp(player.y - vh / 2, 0, WORLD.h - vh);
    state.camX = lerp(state.camX, targetCamX, clamp(6 * state.dt, 0, 1));
    state.camY = lerp(state.camY, targetCamY, clamp(6 * state.dt, 0, 1));

    let sx = 0, sy = 0;
    if (state.shake > 0) {
      sx = (Math.random() * 2 - 1) * state.shake;
      sy = (Math.random() * 2 - 1) * state.shake;
      state.shake = Math.max(0, state.shake - 28 * state.dt);
    }

    ctx.fillStyle = "#efe6cf";
    ctx.fillRect(0, 0, vw, vh);

    const px = clamp(Math.round(Math.min(vw, vh) / 190), 2, 4);

    ctx.save();
    ctx.translate(sx, sy);

    // enemies
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = e.x - state.camX;
      const y = e.y - state.camY;
      const spr = pickEnemySprite(e);
      const a = e.hit > 0 ? 1 : 0.92;
      const bob = (Math.sin(e.animT * 6.5) > 0) ? 1 : 0;
      drawSprite(ctx, spr, x, y + bob, px, a, false);
    }

    // guard visuals
    if (player.guarding) {
      const x = player.x - state.camX;
      const y = player.y - state.camY;
      const fx = player.faceX || 1;
      const fy = player.faceY || 0;
      drawCone(x, y, fx, fy, 92, 0.70, 0.14 + 0.12 * player.guardFx);

      if (player.parryFlash > 0) {
        const a = clamp(player.parryFlash / 0.26, 0, 1);
        drawParryFlash(x, y, fx, fy, a);
      }
    }

    // slash visuals
    if (slashes.length > 0) {
      const s = slashes[slashes.length - 1];
      const x = player.x - state.camX;
      const y = player.y - state.camY;
      const a = clamp(s.t / s.life, 0, 1);
      drawCone(x, y, s.nx, s.ny, s.reach, s.half, (s.heavy ? 0.26 : 0.18) * a);
      drawBrushFlash(x + s.nx * 20, y + s.ny * 20, s.nx, s.ny, s.heavy, a);
    }

    // player
    {
      const x = player.x - state.camX;
      const y = player.y - state.camY;

      if (player.flash > 0.01) {
        ctx.globalAlpha = 0.14 * player.flash;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(x, y, 58, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const spr = pickPlayerSprite();
      const alpha = player.invuln > 0 ? 0.78 : 1;
      drawSprite(ctx, spr, x, y, px, alpha, player.facing < 0);
    }

    // particles
    for (let i = 0; i < dots.length; i++) {
      const p = dots[i];
      const x = p.x - state.camX;
      const y = p.y - state.camY;
      const a = clamp(p.t / p.life, 0, 1);
      ctx.globalAlpha = 0.62 * a;
      ctx.fillStyle = "#000";
      ctx.fillRect(snap(x), snap(y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

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
     Overlay
  ========================= */
  document.getElementById("ovTitle").textContent = "INK SWORD";
  document.getElementById("ovBody").innerHTML =
    `<b>이동</b> WASD/방향키 · <b>베기</b> J (모바일 SLASH 홀드=헤비) · <b>가드</b> K/GUARD (딱 누르면 패링 번쩍) · <b>대시</b> L/DASH · <b>잉크 폭발</b> I/INK BURST`;

  startBtn.addEventListener("click", () => {
    overlay.classList.add("hide");
    state.running = true;
    state.last = performance.now();
  });
  resetBtn.addEventListener("click", () => {
    resetGame();
    overlay.classList.remove("hide");
    state.running = false;
  });

  /* =========================
     Boot
  ========================= */
  resetGame();
  requestAnimationFrame(loop);
  state.running = false;
})();
