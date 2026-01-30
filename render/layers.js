export const Layers = {
  bg:null,
  ink:null,
  fx:null,
  ctx:null,

  init(w,h,mainCtx){
    this.ctx = mainCtx;
    this.bg = new OffscreenCanvas(w,h);
    this.ink = new OffscreenCanvas(w,h);
    this.fx = new OffscreenCanvas(w,h);
  },

  clear(){
    [this.bg,this.ink,this.fx].forEach(c=>{
      const x=c.getContext("2d");
      x.clearRect(0,0,c.width,c.height);
    });
  },

  compose(){
    this.ctx.clearRect(0,0,360,640);
    this.ctx.drawImage(this.bg,0,0);
    this.ctx.drawImage(this.ink,0,0);
    this.ctx.drawImage(this.fx,0,0);
  }
};
