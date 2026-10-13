/** Shared helpers for the headless tests. */
import type { Bullet, GameEvent, InputState, Unit } from "../src/game/types.js";
import type { World } from "../src/game/world.js";
import type { Vec } from "../src/game/math.js";

export const DT = 1 / 60;

/** Run the world for `seconds` with the same input, collecting every event. */
export function step(w: World, input: InputState, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, input);
    all.push(...w.events);
  }
  return all;
}

/** A guard's musket ball flying at `vel`. */
export function enemyBullet(pos: Vec, vel: Vec, extra: Partial<Bullet> = {}): Bullet {
  return { pos, vel, radius: 9, damage: 3, halves: 1, side: "enemy", fromPlayer: false, life: 3, look: "ball", ...extra };
}

/** Freeze a unit in place so a test can control the situation. */
export function freeze(u: Unit): void {
  u.state = "recover";
  u.timer = 999;
}
