export function bleedInk(ctx){
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(239,233,220,0.05)";
  ctx.fillRect(0,0,360,640);
}
