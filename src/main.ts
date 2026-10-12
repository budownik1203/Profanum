/**
 * Profanum - milestone 1: combat in one room.
 * Fixed-step simulation (World) + PixiJS v8 view (GameRenderer).
 */
import { Application } from "pixi.js";
import { World, idleInput } from "./game/world.js";
import { GameRenderer } from "./render/renderer.js";
import { Input } from "./input.js";
import { PAL } from "./palette.js";

const STEP = 1 / 60;
const MAX_STEPS = 5;

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ background: PAL.bg, resizeTo: window, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.body.appendChild(app.canvas);

  const input = new Input(app.canvas);
  const view = new GameRenderer(app.renderer);
  app.stage.addChild(view.root);

  const fit = () => view.resize(app.screen.width, app.screen.height);
  fit();
  window.addEventListener("resize", fit);

  let world = World.firstRoom();
  let acc = 0;
  let hitstop = 0;
  // the room waits for the first click: gives the page keyboard focus and a moment to look around
  let started = false;
  app.canvas.addEventListener("pointerdown", () => (started = true), { once: true });

  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    const aim = view.screenToWorld(input.mouse);

    if ((!world.player.alive || world.cleared) && input.wasPressed("Enter")) {
      world = World.firstRoom();
      view.reset();
      acc = 0;
    }

    // hit-stop: freeze the simulation for a few frames on heavy hits
    if (!started) {
      input.endFrame();
    } else if (hitstop > 0) {
      hitstop -= dt;
    } else {
      acc += dt;
      let steps = 0;
      let first = true;
      while (acc >= STEP && steps < MAX_STEPS) {
        // edge-triggered actions (dodge, reload, flip) only count on the first step of a frame
        const held = input.read(aim);
        const stepInput = first ? held : { ...idleInput(aim), move: held.move, shoot: held.shoot };
        world.update(STEP, stepInput);
        view.handle(world.events);
        for (const e of world.events) {
          if (e.type === "enemyDeath") hitstop = Math.max(hitstop, 0.07);
          if (e.type === "playerHit") hitstop = Math.max(hitstop, 0.05);
        }
        acc -= STEP;
        steps++;
        if (first) {
          input.endFrame();
          first = false;
        }
      }
      if (steps === MAX_STEPS) acc = 0; // tab was in the background: don't spiral
    }

    // edge presses are cleared only after a simulation step consumed them (see the loop above),
    // so a click is never lost on frames where no step runs (high refresh rates, hit-stop)
    view.draw(world, dt, aim, started);
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#d8c8a8;padding:2em">Nie udało się uruchomić gry:\n${String(err)}</pre>`;
});
