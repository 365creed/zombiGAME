/* game.js — v6.0 FULL REPLACE
   INK BRUSH RENDERING SYSTEM
*/

console.log("INK v6 LOADED", Date.now());

(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  /* =========================
     CONFIG
  ========================= */
  const DPR = window.devicePixelRatio || 1;

  const CONFIG = {
    baseWidth: 360,
    baseHeight: 640,
    viewScale: 0.67,        // 🔥 가장 예쁜 비율
    gravity: 0.9,
    friction: 0.82
  };

  const IS_TOUCH = "ontouchstart" in window;

  /* =========================
     STATE
  ========================= */
  const state = {
    time: 0,
    camX: 0
  };

  /* =========================
     PLAYER / ENEMY
  ========================= */
  const player = {
    x: 0,
    y: 40,
    vx: 0,
    facing: 1,
    guarding: false,
    guardFx: 0,
    slashTimer: 0
  };

  const enemy = {
    x: 140,
    y: 40,
    alive: true,
    hitFx: 0
  };

  /* =========================
     INPUT
  ========================= */
  const input = {
    left:false,
    right:false,
    guard:false,
    slash:false
  };

  window.addEventListener("keydown", e => {
    if(e.key==="ArrowLeft") input.left = true;
    if(e.key==="ArrowRight") input.right = true;
    if(e.key==="z") input.slash = true;
    if(e.key==="x") input.guard = true;
  });
  window.addEventListener("keyup", e => {
    if(e.key==="ArrowLeft") input.left = false;
    if(e.key==="ArrowRight") input.right = false;
    if(e.key==="z") input.slash = false;
    if(e.key==="x") input.guard = false;
  });

  /* =========================
     UPDATE
  ========================= */
  function update(){
    state.time++;

    let speed = 1.6 * (IS_TOUCH ? 1.2 : 1);
    if(input.left) player.vx -= speed;
    if(input.right) player.vx += speed;

    player.vx *= CONFIG.friction;
    player.x += player.vx;

    if(player.vx > 0.1) player.facing = 1;
    if(player.vx < -0.1) player.facing = -1;

    // guard
    player.guarding = input.guard;
    player.guardFx += (player.guarding ? 1 : -1) * 0.18;
    player.guardFx = Math.max(0, Math.min(1, player.guardFx));

    // slash
    if(input.slash && player.slashTimer <= 0){
      player.slashTimer = 18;
      enemy.hitFx = 1;
    }
    if(player.slashTimer > 0) player.slashTimer--;

    enemy.hitFx *= 0.88;

    // camera
    state.camX += (player.x - state.camX - CONFIG.baseWidth/2) * 0.08;
  }

  /* =========================
     BRUSH STROKE UTILS
  ========================= */
  function brushStroke(path, baseWidth, alpha){
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";

    for(let i=0;i<3;i++){
      ctx.lineWidth = baseWidth + Math.random()*1.2;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for(let p of path){
        ctx.lineTo(
          p.x + (Math.random()-.5)*0.6,
          p.y + (Math.random()-.5)*0.6
        );
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* =========================
     DRAW CHARACTERS
  ========================= */
  function drawPlayer(){
    const x = player.x;
    const y = player.y;

    brushStroke([
      {x:x, y:y-42},
      {x:x+player.facing*4, y:y-22},
      {x:x, y:y}
    ], 6, 0.9);

    // slash trail
    if(player.slashTimer > 0){
      const t = player.slashTimer / 18;
      brushStroke([
        {x:x, y:y-28},
        {x:x+player.facing*60*(1-t), y:y-40}
      ], 4 + t*4, 0.7);
    }

    // guard bloom
    if(player.guardFx > 0){
      ctx.save();
      ctx.globalAlpha = 0.15 * player.guardFx;
      ctx.beginPath();
      ctx.arc(
        x + player.facing*18,
        y-26,
        40 * player.guardFx,
        0, Math.PI*2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEnemy(){
    if(!enemy.alive) return;

    const x = enemy.x;
    const y = enemy.y;

    brushStroke([
      {x:x, y:y-44},
      {x:x-4, y:y-24},
      {x:x, y:y}
    ], 6, 0.85 + enemy.hitFx*0.3);
  }

  /* =========================
     DRAW
  ========================= */
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();
    ctx.scale(CONFIG.viewScale, CONFIG.viewScale);
    ctx.translate(-state.camX,0);

    // ground
    ctx.strokeStyle="#111";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-1000,40);
    ctx.lineTo(2000,40);
    ctx.stroke();

    drawEnemy();
    drawPlayer();

    ctx.restore();
  }

  /* =========================
     LOOP / RESIZE
  ========================= */
  function loop(){
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function resize(){
    canvas.width = CONFIG.baseWidth * DPR;
    canvas.height = CONFIG.baseHeight * DPR;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  window.addEventListener("resize", resize);
  resize();
  loop();
})();
