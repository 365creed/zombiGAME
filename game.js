import { Engine } from "./core/engine.js";
import { setScene } from "./core/state.js";
import { IntroScene } from "./scene/intro.js";

const canvas = document.getElementById("c");
const engine = new Engine(canvas);

setScene(new IntroScene(engine));
engine.start();
