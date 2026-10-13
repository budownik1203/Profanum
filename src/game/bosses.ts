/**
 * Boss scripts. (Filled in with the real bosses later; this keeps a simple placeholder behaviour.)
 */
import { norm, scale, sub } from "./math.js";
import type { Unit } from "./types.js";
import type { World } from "./world.js";
import { ring } from "./combat.js";

export function updateBoss(w: World, u: Unit, dt: number): void {
  const t = w.targetFor(u);
  if (!t) return;
  const dir = norm(sub(t.pos, u.pos));
  u.dir = dir;
  w.moveUnit(u, scale(dir, u.def.speed * 0.5), dt);
  if (u.cooldown <= 0) {
    u.cooldown = 1.6;
    ring(w, u.pos, 14, 200, w.time, { side: u.team, look: "ember", radius: 10, damage: 3, halves: 1 });
  }
}
