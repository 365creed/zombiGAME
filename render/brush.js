export function drawBrush(ctx, points){
  ctx.fillStyle = "#111";
  ctx.globalAlpha = 0.95;

  for(let i=1;i<points.length;i++){
    const a = points[i-1];
    const b = points[i];
    const d = Math.hypot(b.x-a.x,b.y-a.y);
    for(let t=0;t<d;t+=2){
      const x = a.x + (b.x-a.x)*(t/d);
      const y = a.y + (b.y-a.y)*(t/d);
      ctx.beginPath();
      ctx.ellipse(
        x, y,
        4 + Math.random()*2,
        7 + Math.random()*3,
        Math.random(),
        0, Math.PI*2
      );
      ctx.fill();
    }
  }
}
