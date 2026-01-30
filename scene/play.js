import { Layers } from "../render/layers.js";
import { drawBrush } from "../render/brush.js";
import { bleedInk } from "../render/ink.js";

export class PlayScene{
  constructor(){
    this.points = [];
    Layers.clear();
  }

  update(){
    bleedInk(Layers.ink.getContext("2d"));
  }

  draw(){
    Layers.compose();
  }
}
