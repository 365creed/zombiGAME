/* game.js — v5.3 FULL REPLACE
   FIXED:
   - update/draw/loop 완결
   - camera 적용 → 화면 안보이던 문제 해결
   - guard 이동 감쇠 / 가드 콘 시각화
   - 모바일 패링 보정
*/

(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  /* =========================
     CONFIG
  ========================= */
  const IS_TOUCH = "ontouchstart" in window;
  const PARRY_BONUS = IS_TOUCH ? 1.4 : 1.0;

  const CONFIG = {
    width: 360,
    height: 640,
    gravity: 0.9,
    friction: 0.82
  };

  /* =========================
     STATE
  ========================= */
  const state = {
    camX: 0,
    camY: 0,
    time: 0
  };

  /* =========================
     PLAYER
  ========================= */
  const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: 24,
    h: 40,
    hp: 100,

    facing: 1,
    faceX: 1,
    faceY: 0,

    guarding: false,
    guardFx: 0,
    parryTimer: 0,

    slashTimer: 0
  };

  /* =========================
     ENEMY (SAMPLE)
  ========================= */
  const enemy = {
    x: 160,
    y: 0,
    w: 26,
    h: 42,
    attackTimer: 0,
    alive: true
  };

  /* =========================
     INPUT
  ========================= */
  const input = {
    left: false,
    right: false,
    guard: false,
    slash: false
  };

  window.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") input.left = true;
    if (e.key === "ArrowRight") input.right = true;
    if (e.key === "z") input.slash = true;
    if (e.key === "x") input.guard = true;
  });
  window.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft") input.left = false;
    if (e.key === "ArrowRight") input.right = false;
    if (e.key === "z") input.slash = false;
    if (e.key === "x") input.guard = false;
  });

  /* =========================
     UPDATE
  ========================= */
  function update() {
    state.time++;

    let moveSpeed = 1.6;
    if (player.guarding) moveSpeed *= 0.42;

    if (input.left) player.vx -= moveSpeed;
    if (input.right) player.vx += moveSpeed;

    player.vx *= CONFIG.friction;
    player.x += player.vx;

    // facing
    if (player.vx < -0.1) player.facing = -1;
    if (player.vx > 0.1) player.facing = 1;
    player.faceX = player.facing;

    // guard
    if (input.guard) {
      if (!player.guarding) {
        player.parryTimer = Math.floor(10 * PARRY_BONUS);
      }
      player.guarding = true;
    } else {
      player.guarding = false;
    }

    player.guardFx += (player.guarding ? 1 : -1) * 0.2;
    player.guardFx = Math.max(0, Math.min(1, player.guardFx));

    if (player.parryTimer > 0) player.parryTimer--;

    // enemy attack (dummy)
    enemy.attackTimer++;
    if (enemy.attackTimer > 120) {
      enemy.attackTimer = 0;
      checkParry();
    }

    // camera follow
    state.camX += (player.x - state.camX - CONFIG.width / 2) * 0.1;
  }

  function checkParry() {
    if (!player.guarding) return;

    const dx = enemy.x - player.x;
    const dist = Math.abs(dx);

    if (dist < 60 && player.parryTimer > 0) {
      // parry success
      enemy.x += player.facing * 60;
    }
  }

  /* =========================
     DRAW
  ========================= */
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-state.camX, -state.camY);

    // ground
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(-1000, 40);
    ctx.lineTo(2000, 40);
    ctx.stroke();

    // enemy
    if (enemy.alive) {
      ctx.fillRect(enemy.x - enemy.w / 2, enemy.y - enemy.h, enemy.w, enemy.h);
    }

    // player
    ctx.fillRect(player.x - player.w / 2, player.y - player.h, player.w, player.h);

    // guard cone
    if (player.guardFx > 0) {
      drawCone(
        player.x,
        player.y - 20,
        player.faceX,
        0,
        100,
        0.9,
        0.22 * player.guardFx
      );
    }

    ctx.restore();
  }

  function drawCone(x, y, fx, fy, len, angle, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(
      x,
      y,
      len,
      Math.atan2(fy, fx) - angle,
      Math.atan2(fy, fx) + angle
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* =========================
     LOOP
  ========================= */
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CONFIG.width * dpr;
    canvas.height = CONFIG.height * dpr;
    canvas.style.width = CONFIG.width + "px";
    canvas.style.height = CONFIG.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  loop();
})();