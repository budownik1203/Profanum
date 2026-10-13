/**
 * Boss arenas and scripts. (The full fights come in a later step; this keeps a working placeholder.)
 */
import { norm, scale, sub, vec } from "./math.js";
import { floorDef } from "./data/floors.js";
import type { UnitKind } from "./data/units.js";
import type { Unit } from "./types.js";
import type { World } from "./world.js";
import { ring } from "./combat.js";

export function setupBossArena(w: World, kind: UnitKind, depth: number, _rng: () => number): Unit {
  const def = floorDef(Math.min(depth, 5));
  w.theme = depth >= 6 ? "sanktuarium" : def.id;
  w.dark = true;
  w.alarm = true;
  const W = w.room.w;
  const H = w.room.h;
  for (const [x, y] of [[W * 0.28, H * 0.38], [W * 0.66, H * 0.38], [W * 0.28, H * 0.66], [W * 0.66, H * 0.66]] as const) {
    w.addCover(x, y, 150, 40, def.solid);
  }
  for (const [x, y] of [[W * 0.2, H * 0.25], [W * 0.8, H * 0.25], [W * 0.2, H * 0.75], [W * 0.8, H * 0.75]] as const) {
    w.addLight("candelabra", vec(x, y));
  }
  const boss = w.spawn(kind, vec(W / 2, H * 0.32), "enemy");
  boss.boss = { phase: 1, step: "intro", t: 0, n: 0, next: 1.5, angle: 0, intro: 2, mem: {} };
  w.events.push({ type: "bossIntro", boss: kind });
  return boss;
}

export function updateBoss(w: World, u: Unit, dt: number): void {
  const b = u.boss ?? (u.boss = { phase: 1, step: "fight", t: 0, n: 0, next: 1, angle: 0, intro: 0, mem: {} });
  if (b.intro > 0) {
    b.intro -= dt;
    return;
  }
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
