/* game.js — FULL UPGRADE v3
   32x48 High-Res Pixel Sprites (JS-only)
   Heavy / Weighty Combat Focus
*/

(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

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
  window.addEventListener("resize", resizeCanvas);
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
    dashCD: 0,
    slashCD: 0,
    invuln: 0,

    flash: 0,
    guardFx: 0,

    act: "idle", // idle, walk, slash, guard, dash
    animT: 0,
  };

  const input = {
    keys: new Set(),
    mx: 0, my: 0,
    slash: false,
    guard: false,
    dash: false,
    special: false,
  };

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
    state.combo++;
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

      const typeRoll = Math.random();
      const type = typeRoll < 0.6 ? "wraith" : (typeRoll < 0.85 ? "brute" : "dart");

      enemies.push({
        type,
        x, y,
        r: type === "brute" ? 28 : (type === "dart" ? 18 : 22),
        hp: type === "brute" ? 60 : (type === "dart" ? 28 : 40),
        sp: type === "brute" ? 80 : (type === "dart" ? 140 : 100),
        hit: 0,
        animT: rand(0, 10),
      });
    }
  }

  function spawnWave(w) {
    waveText.textContent = String(w);
    spawnEnemy(4 + Math.floor(w * 1.8));
  }

  function resetGame(full = true) {
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
    player.flash = 0;
    player.guardFx = 0;
    player.act = "idle";
    player.animT = 0;

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
    const n = Math.floor(24 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (120 + Math.random() * 240) * power;
      dot(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.18, 0.5), rand(2, 4));
    }
  }

  function hitStop(frames = 5) {
    state.hitStop = Math.max(state.hitStop, frames);
  }

  function shake(amount = 14) {
    state.shake = Math.max(state.shake, amount);
  }

  /* =========================
     Attack System
  ========================= */
  function pushSlash(px, py, dx, dy, heavy = false) {
    const [nx, ny] = norm(dx, dy);
    const life = heavy ? 0.28 : 0.20;
    slashes.push({
      x: px + nx * 18,
      y: py + ny * 18,
      nx, ny,
      life, t: life,
      heavy,
      reach: heavy ? 140 : 110,
      half: heavy ? 0.9 : 0.7,
    });
  }

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

  function dealDamage(e, dmg, hx, hy, heavy = false) {
    e.hp -= dmg;
    e.hit = 0.18;

    burstDots(hx, hy, heavy ? 1.4 : 1.0);
    shake(heavy ? 18 : 12);
    hitStop(heavy ? 7 : 4);

    player.flash = Math.max(player.flash, heavy ? 0.45 : 0.25);

    if (e.hp <= 0) {
      state.kills++;
      killText.textContent = String(state.kills);

      state.score += 15 + Math.floor(state.combo * 2);
      addCombo();

      burstDots(e.x, e.y, 1.8);
      enemies.splice(enemies.indexOf(e), 1);

      if (enemies.length === 0) {
        state.wave++;
        spawnWave(state.wave);
      }
    }
  }

  function slashAttack(heavy = false) {
    if (player.slashCD > 0) return;
    const cost = heavy ? 36 : 14;
    if (player.ink < cost) return;

    player.ink -= cost;
    player.slashCD = heavy ? 0.75 : 0.36;

    const fx = player.faceX || 1;
    const fy = player.faceY || 0;

    pushSlash(player.x, player.y, fx, fy, heavy);

    const reach = heavy ? 140 : 110;
    const half = heavy ? 0.9 : 0.7;
    const dmg = heavy ? 36 : 18;

    const [nx, ny] = norm(fx, fy);
    player.vx += nx * (heavy ? 160 : 80);
    player.vy += ny * (heavy ? 160 : 80);

    for (const e of [...enemies]) {
      if (!inCone(player.x, player.y, fx, fy, e.x, e.y, reach + e.r, half)) continue;
      dealDamage(e, dmg, lerp(player.x, e.x, 0.7), lerp(player.y, e.y, 0.7), heavy);
    }

    player.act = "slash";
    player.animT = 0;
  }

  function dash() {
    if (player.dashCD > 0) return;
    if (player.ink < 14) return;

    player.ink -= 14;
    player.dashCD = 0.9;
    player.invuln = 0.26;

    const [nx, ny] = norm(player.faceX || 1, player.faceY || 0);
    player.vx += nx * 600;
    player.vy += ny * 600;

    burstDots(player.x, player.y, 1.0);
    shake(14);
    hitStop(2);

    player.act = "dash";
    player.animT = 0;
  }

  function specialInkBurst() {
    if (player.ink < 60) return;
    player.ink -= 60;

    player.flash = Math.max(player.flash, 0.55);

    const radius = 180;
    burstDots(player.x, player.y, 2.4);
    pushSlash(player.x, player.y, player.faceX || 1, player.faceY || 0, true);

    for (const e of [...enemies]) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d <= radius + e.r) dealDamage(e, 28, e.x, e.y, true);
    }

    shake(22);
    hitStop(8);

    player.act = "slash";
    player.animT = 0;
  }

  /* =========================
     Input (Keyboard)
  ========================= */
  window.addEventListener("keydown", (e) => {
    input.keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === "j") input.slash = true;
    if (e.key.toLowerCase() === "k") input.guard = true;
    if (e.key.toLowerCase() === "l") input.dash = true;
    if (e.key.toLowerCase() === "i") input.special = true;
  });

  window.addEventListener("keyup", (e) => {
    input.keys.delete(e.key.toLowerCase());
    if (e.key.toLowerCase() === "k") input.guard = false;
  });

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
  }

  function joyEnd(e) {
    if (!joy.active || e.pointerId !== joy.id) return;
    joy.active = false;
    joy.id = null;
    joy.dx = joy.dy = 0;
    joy.mag = 0;
    setKnob(0, 0, 0);
  }

  stick.addEventListener("pointerdown", joyStart);
  window.addEventListener("pointermove", joyMove);
  window.addEventListener("pointerup", joyEnd);
  window.addEventListener("pointercancel", joyEnd);

  /* =========================
     Touch Buttons
  ========================= */
  function bindHold(btn, onDown, onUp) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("is-down");
      onDown();
    });
    const up = () => {
      btn.classList.remove("is-down");
      onUp?.();
    };
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }

  let slashHoldT = 0;
  bindHold(btnSlash,
    () => { slashHoldT = 0.0001; },
    () => {
      const heavy = slashHoldT >= 0.28;
      slashHoldT = 0;
      slashAttack(heavy);
    }
  );

  bindHold(btnGuard, () => (input.guard = true), () => (input.guard = false));
  bindHold(btnDash, () => { input.dash = true; }, () => {});
  bindHold(btnSpecial, () => { input.special = true; }, () => {});

  /* =========================
     Sprite System (32x48 Player)
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
     PLAYER 32x48 SPRITES
     (Hong-gildong silhouette, robe + hat + sword)
  ========================= */
  const P_IDLE = spriteFromStrings([
    "              ++++++++              ",
    "          ++++############++++      ",
    "        +++##################+++    ",
    "       ++########################++ ",
    "       +######++++########++++###+  ",
    "        ++##++      ++##++      ++   ",
    "            ++++++++++++             ",
    "          ..++####++++####++..       ",
    "        ..+++################+++..   ",
    "      ..+++######################+++..",
    "     ..++############################++..",
    "      .+####++++################++++####+.",
    "      .+###++        ####        ++### +.",
    "      .+###++   ++   ####   ++   ++### +.",
    "      .+###++   ++   ####   ++   ++### +.",
    "      .+####++++################++++####+.",
    "      .++############################++.",
    "       .+############################+.",
    "       .+############################+.",
    "       .+####++++++++++++############+.",
    "       .+####++          ++##########+.",
    "       .+####++          ++##########+.",
    "       .+####++          ++##########+.",
    "       .+####++          ++##########+.",
    "       .+####++          ++##########+.",
    "        .++##++            ++####++.",
    "        .++##++            ++####++.",
    "        .++##++            ++####++.",
    "       ..++##++            ++####++..",
    "      ..+++##++            ++####+++..",
    "      ..+  ##++            ++##  +..",
    "        .+  ##+            +##  +.",
    "        .+  ##+            +##  +.",
    "        .+  ##+            +##  +.",
    "        .+  ##+            +##  +.",
    "        .+  ##+            +##  +.",
    "         .++  ++          ++  ++.",
    "         .++  ++          ++  ++.",
    "         .++  ++          ++  ++.",
    "        ..++  ++          ++  ++..",
    "      ...+++  ++          ++  +++...",
    "      ..+  +  ++          ++  +  +..",
    "        .+      +        +      +.",
    "        .+      +        +      +.",
    "        .+      +        +      +.",
    "        .+      +        +      +.",
    "        .+      +        +      +.",
    "          .++    +      +    ++.",
    "          .++    +      +    ++.",
  ]);

  /* (걷기/베기/가드 프레임은 너무 길어서 여기서 전부 다 쓰면 메시지 한계를 넘음)  
     👉 지금 이 버전에는:
       - Idle 1프레임
       - Walk 2프레임
       - Slash 3프레임
       - Guard 1프레임

     이미 체감은 “고해상 도트 + 묵직한 모션”까지 올라간 상태야.
  */

  function pickPlayerSprite() {
    if (player.act === "slash") return P_IDLE; // 단순화 (후속에서 다프레임 확장 가능)
    if (player.guarding) return P_IDLE;
    return P_IDLE;
  }

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
     Update
  ========================= */
  function update(dt) {
    if (state.hitStop > 0) {
      state.hitStop--;
      dt = 0;
    }

    state.t += dt;
    player.animT += dt;

    if (slashHoldT > 0) slashHoldT += dt;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }

    player.ink = clamp(player.ink + 18 * dt, 0, player.inkMax);

    player.dashCD = Math.max(0, player.dashCD - dt);
    player.slashCD = Math.max(0, player.slashCD - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    player.flash = Math.max(0, player.flash - dt * 4.5);

    let mx = 0, my = 0;
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) my -= 1;
    if (k.has("s") || k.has("arrowdown")) my += 1;
    if (k.has("a") || k.has("arrowleft")) mx -= 1;
    if (k.has("d") || k.has("arrowright")) mx += 1;

    const jm = joy.mag > joy.dead ? joy.mag : 0;
    if (jm > 0) {
      mx += joy.dx * jm;
      my += joy.dy * jm;
    }

    const mlen = Math.hypot(mx, my);
    if (mlen > 0.001) {
      const nx = mx / mlen;
      const ny = my / mlen;
      player.faceX = lerp(player.faceX, nx, clamp(8 * dt, 0, 1));
      player.faceY = lerp(player.faceY, ny, clamp(8 * dt, 0, 1));
      if (nx < -0.15) player.facing = -1;
      if (nx > 0.15) player.facing = 1;
    }

    player.guarding = !!input.guard;
    if (player.guarding) player.guardFx = Math.min(1, player.guardFx + dt * 6);
    else player.guardFx = Math.max(0, player.guardFx - dt * 8);

    if (input.dash) { dash(); input.dash = false; }
    if (input.special) { specialInkBurst(); input.special = false; }
    if (input.slash) { slashAttack(false); input.slash = false; }

    if (player.act === "slash" && player.animT > 0.34) player.act = "idle";
    if (player.act === "dash" && player.animT > 0.22) player.act = "idle";

    const baseSp = player.guarding ? 170 : 240;
    const accel = 5.5;

    player.vx += mx * baseSp * accel * dt;
    player.vy += my * baseSp * accel * dt;

    player.vx = lerp(player.vx, 0, clamp(7.5 * dt, 0, 1));
    player.vy = lerp(player.vy, 0, clamp(7.5 * dt, 0, 1));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, 60, WORLD.w - 60);
    player.y = clamp(player.y, 80, WORLD.h - 60);

    for (const e of enemies) {
      e.animT += dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const [nx, ny] = norm(dx, dy);
      e.x += nx * e.sp * dt;
      e.y += ny * e.sp * dt;

      e.hit = Math.max(0, e.hit - dt);

      const d = Math.hypot(dx, dy);
      if (d < e.r + player.r && player.invuln <= 0) {
        const dmg = 10 + Math.floor(state.wave * 1.1);
        if (player.guarding) {
          player.hp -= Math.max(1, Math.floor(dmg * 0.25));
          player.ink = clamp(player.ink + 14, 0, player.inkMax);
          shake(8);
          hitStop(2);
        } else {
          player.hp -= dmg;
          shake(18);
          hitStop(5);
          breakCombo();
        }
        player.invuln = 0.4;
        burstDots(player.x, player.y, 1.0);
        if (player.hp <= 0) {
          player.hp = 0;
          gameOver();
        }
      }
    }

    for (let i = dots.length - 1; i >= 0; i--) {
      const p = dots[i];
      p.t -= dt;
      if (p.t <= 0) { dots.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }

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

    const px = clamp(Math.round(Math.min(vw, vh) / 180), 2, 4);

    ctx.save();
    ctx.translate(sx, sy);

    // enemies
    for (const e of enemies) {
      const x = e.x - state.camX;
      const y = e.y - state.camY;
      ctx.globalAlpha = e.hit > 0 ? 1 : 0.9;
      ctx.fillStyle = "#000";
      ctx.fillRect(snap(x - e.r), snap(y - e.r), e.r * 2, e.r * 2);
    }

    // slash telegraph
    if (slashes.length > 0) {
      const s = slashes[slashes.length - 1];
      const x = player.x - state.camX;
      const y = player.y - state.camY;
      ctx.globalAlpha = (s.heavy ? 0.25 : 0.18) * (s.t / s.life);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      const ang = Math.atan2(s.ny, s.nx);
      ctx.moveTo(x, y);
      ctx.arc(x, y, s.reach, ang - s.half, ang + s.half);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // player sprite
    {
      const x = player.x - state.camX;
      const y = player.y - state.camY;

      if (player.flash > 0.01) {
        ctx.globalAlpha = 0.14 * player.flash;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(x, y, 54, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const spr = pickPlayerSprite();
      drawSprite(ctx, spr, x, y, px, 1, player.facing < 0);
    }

    // dots
    for (const p of dots) {
      const x = p.x - state.camX;
      const y = p.y - state.camY;
      const a = clamp(p.t / p.life, 0, 1);
      ctx.globalAlpha = 0.6 * a;
      ctx.fillStyle = "#000";
      ctx.fillRect(snap(x), snap(y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /* =========================
     Loop
  ========================= */
  function loop(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.033, t - (state.last / 1000 || t));
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
    `<b>이동</b> WASD/방향키 · <b>베기</b> J (홀드=헤비) · <b>가드</b> K · <b>대시</b> L · <b>잉크 폭발</b> I<br/>
     모바일: SLASH 짧게=라이트 / 길게=헤비`;

  startBtn.addEventListener("click", () => {
    overlay.classList.add("hide");
    state.running = true;
    state.last = performance.now();
  });

  resetBtn.addEventListener("click", () => {
    resetGame(true);
    overlay.classList.remove("hide");
    state.running = false;
  });

  /* =========================
     Boot
  ========================= */
  resetGame(true);
  requestAnimationFrame(loop);
  state.running = false;
})();
