/**
 * A simple scripted player for balance checks and whole-run smoke tests: it keeps its distance,
 * steps out of bullet paths and burning ground, dodges what it cannot outrun and shoots the
 * nearest hostile. Not a good player, an honest one: it sees only what a player sees.
 */
import type { InputState, Unit } from "../src/game/types.js";
import { World, idleInput } from "../src/game/world.js";
import { add, dist, len, norm, scale, sub, vec } from "../src/game/math.js";
import { CONFIG } from "../src/game/config.js";
import { PUTOUT_KINDS } from "../src/game/lighting.js";
import { bossLit } from "../src/game/combat.js";
import { WEAPONS } from "../src/game/data/weapons.js";
import { soulCost } from "../src/game/shooting.js";

export interface BotMemory {
  strafe: number;
  flipT: number;
  raiseT: number;
}

export const newBot = (): BotMemory => ({ strafe: 1, flipT: 0, raiseT: 0 });

export function botInput(w: World, m: BotMemory, dt: number, keep = 380): InputState {
  const p = w.player;
  const input = idleInput(p.pos);
  const targets = w.units.filter((u) => u.alive && u.team !== "minion").sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
  // whoever is in its face first, then the boss, then the nearest
  const close = targets.find((u) => !u.def.boss && dist(u.pos, p.pos) < 420);
  const target: Unit | undefined = close ?? targets.find((u) => u.def.boss) ?? targets[0];
  let move = vec();
  let danger = 0;
  let lightAim = false;

  // bullets that will pass close in the next half second
  for (const b of w.bullets) {
    if (b.fromPlayer || b.side === "minion" || (b.delay ?? 0) > 0 || b.lob) continue;
    const rel = sub(p.pos, b.pos);
    const speed = len(b.vel);
    if (speed < 1 || len(rel) > 420) continue;
    const dir = scale(b.vel, 1 / speed);
    const along = rel.x * dir.x + rel.y * dir.y;
    if (along < -20) continue; // already past
    const tHit = along / speed;
    if (tHit > 0.6) continue;
    const closest = sub(rel, scale(dir, along));
    const miss = len(closest);
    const need = b.radius + CONFIG.player.radius + 18;
    if (miss > need) continue;
    // step sideways out of its path
    const side = miss > 1 ? scale(closest, 1 / miss) : vec(-dir.y, dir.x);
    const weight = (1 - tHit / 0.6) * (1 - miss / need + 0.3);
    move = add(move, scale(side, 3 * weight));
    if (tHit < 0.18) danger += 1;
  }
  // lobbed bombs and fire on the floor
  for (const b of w.bullets) {
    if (!b.lob || b.side === "minion") continue;
    const d = dist(p.pos, b.lob.to);
    if (d < b.lob.radius + 40) move = add(move, scale(norm(sub(p.pos, b.lob.to)), 2.5));
  }
  for (const z of w.zones) {
    if (z.side === "minion" || (z.dps <= 0 && z.burst <= 0 && z.halves <= 0)) continue;
    const d = dist(p.pos, z.pos);
    if (d < z.radius + 50) move = add(move, scale(norm(sub(p.pos, z.pos)), z.warn > 0 ? 3 : 2));
  }
  // holy light burns: get out of it
  if (w.isHoly(p.pos)) {
    const l = w.lights.find((x) => x.on && x.holy && dist(p.pos, x.pos) < x.radius);
    if (l) move = add(move, scale(norm(sub(p.pos, l.pos)), 1.2));
  }
  // keep the distance and circle the target
  if (target) {
    const to = sub(target.pos, p.pos);
    const d = len(to);
    const n = d > 1 ? scale(to, 1 / d) : vec(1, 0);
    const radial = d > keep + 80 ? 1 : d < keep - 80 ? -1 : 0;
    m.flipT -= dt;
    if (m.flipT <= 0) {
      m.flipT = 1.5 + w.rng() * 2;
      m.strafe *= -1;
    }
    move = add(move, scale(add(scale(n, radial), scale(vec(-n.y, n.x), 0.7 * m.strafe)), 0.8));
    input.aim = { ...target.pos };
    input.shoot = true;
    // fight for the dark: a boss in light (or shielded by its braziers) first loses its lights
    if (target.def.boss) {
      const shielded = target.boss?.mem.shield === 1;
      // a few seconds on the lights, a few on the boss: a lit boss still bleeds, only less
      const lightTurn = shielded || w.time % 7 < 3;
      if (lightTurn && (shielded || bossLit(w, target))) {
        const lights = w.lights.filter((l) => l.on && PUTOUT_KINDS.includes(l.kind) && (shielded ? l.kind === "brazier" : dist(l.pos, target.pos) < l.radius) && dist(l.pos, p.pos) < 700);
        lights.sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
        if (lights[0]) {
          input.aim = World.hitPoint(lights[0]);
          // the pistol never runs dry: it is for the candles
          if (p.current !== 0) input.slot = 0;
          lightAim = true;
        }
      }
    }
    if (!lightAim) {
      // the newest gun that can still fire (occult ones need souls, the others ammunition)
      let best = 0;
      p.weapons.forEach((slot, i) => {
        const def = WEAPONS[slot.id];
        const ok = def.kind === "occult" ? p.souls >= soulCost(w, slot, def) : slot.ammo > 0;
        if (ok) best = i;
      });
      if (p.current !== best) input.slot = best;
    }
  }
  // souls hovering nearby are worth a detour, fresh bodies are worth raising
  const soul = w.souls.filter((x) => dist(x.pos, p.pos) < 260).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
  if (soul && danger === 0) move = add(move, scale(norm(sub(soul.pos, p.pos)), 0.9));
  m.raiseT -= dt;
  if (m.raiseT <= 0 && w.raisableCorpse() && p.souls >= p.stats.raiseCost) {
    input.interact = true;
    m.raiseT = 0.5;
  }
  // walls
  const margin = 140;
  if (p.pos.x < margin) move.x += 1.5;
  if (p.pos.x > w.room.w - margin) move.x -= 1.5;
  if (p.pos.y < margin) move.y += 1.5;
  if (p.pos.y > w.room.h - margin) move.y -= 1.5;
  if (p.pos.x < margin * 1.5 || p.pos.x > w.room.w - margin * 1.5) m.strafe = p.pos.y > w.room.h / 2 ? -Math.sign(p.pos.x - w.room.w / 2) : Math.sign(p.pos.x - w.room.w / 2);
  input.move = len(move) > 0.05 ? norm(move) : vec();
  if (danger > 0 && p.dodgeCooldown <= 0) input.dodge = true;
  const slot = p.weapons[p.current];
  if (slot && slot.loaded <= 0 && slot.reloadLeft <= 0) input.reload = true;
  return input;
}
