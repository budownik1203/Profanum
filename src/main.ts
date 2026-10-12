/**
 * Profanum - milestone 4: a floor of rooms.
 * Fixed-step simulation (Floor / World) + PixiJS v8 view (GameRenderer).
 */
import { Application } from "pixi.js";
import { idleInput } from "./game/world.js";
import { Floor } from "./game/floor.js";
import { COMBAT_LAYOUTS } from "./game/rooms.js";
import { GameRenderer } from "./render/renderer.js";
import { Input } from "./input.js";
import { PAL } from "./palette.js";

const STEP = 1 / 60;
const MAX_STEPS = 5;

/** What the necromancer reads when he walks into a room. */
function roomTitle(floor: Floor): string {
  const n = floor.node;
  if (n.type === "start") return "Grób zbiorowy";
  if (n.type === "treasure") return "Ossuarium";
  if (n.type === "boss") return "Komnata Kapitana";
  return COMBAT_LAYOUTS.find((l) => l.name === n.layout)?.name ?? "";
}

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

  let floor = new Floor();
  view.setRoom(floor.current, floor.world);
  let acc = 0;
  let hitstop = 0;
  // the run waits for the first click: gives the page keyboard focus and a moment to look around
  let started = false;
  app.canvas.addEventListener("pointerdown", () => (started = true), { once: true });

  const newFloor = () => {
    floor = new Floor();
    view.reset();
    view.setRoom(floor.current, floor.world);
    view.announce(floor.world, roomTitle(floor));
    acc = 0;
  };

  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    const aim = view.screenToWorld(input.mouse);

    if ((!floor.player.alive || floor.cleared) && input.wasPressed("Enter")) newFloor();

    if (!started) {
      input.endFrame();
    } else if (hitstop > 0) {
      // hit-stop: freeze the simulation for a few frames on heavy hits
      hitstop -= dt;
    } else {
      acc += dt;
      let steps = 0;
      let first = true;
      while (acc >= STEP && steps < MAX_STEPS) {
        // edge-triggered actions (dodge, reload, flip, raise, command) only count on the first step of a frame
        const held = input.read(aim);
        const stepInput = first ? held : { ...idleInput(aim), move: held.move, shoot: held.shoot };
        const events = floor.update(STEP, stepInput);
        view.handle(events);
        for (const e of events) {
          if (e.type === "enemyDeath") hitstop = Math.max(hitstop, 0.07);
          if (e.type === "playerHit") hitstop = Math.max(hitstop, 0.05);
          if (e.type === "enterRoom") {
            view.setRoom(floor.current, floor.world);
            view.announce(floor.world, roomTitle(floor));
          }
          if (e.type === "roomCleared") view.announce(floor.world, "Pokój oczyszczony", PAL.soul);
          if (e.type === "doorsShut") view.announce(floor.world, "Drzwi zatrzaśnięte", PAL.telegraph);
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
    view.draw(floor.world, dt, aim, started, floor);
  });
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#d8c8a8;padding:2em">Nie udało się uruchomić gry:\n${String(err)}</pre>`;
});
