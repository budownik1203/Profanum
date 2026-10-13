/**
 * Lights: moving ones follow their bearers, shot ones go out, the chandelier falls, stained glass
 * breaks, and the lamplighter walks around relighting what the necromancer put out.
 */
import { CONFIG } from "./config.js";
import { type Vec, dist, distToSegment, norm, scale, sub, vec } from "./math.js";
import type { Light, LightKind, Unit } from "./types.js";
import type { World } from "./world.js";
import { damageUnit, hurtPlayer } from "./combat.js";

/** Fixed lights the necromancer can shoot out (and a lamplighter can relight). */
export const PUTOUT_KINDS: readonly LightKind[] = ["candle", "candelabra", "torch", "chandelier", "brazier", "pyre"];

export function updateLights(w: World, dt: number): void {
  for (const l of w.lights) {
    if (l.owner !== undefined) {
      const u = w.units.find((x) => x.id === l.owner);
      if (u) l.pos = { x: u.pos.x + u.dir.x * 18, y: u.pos.y - 10 };
    }
    if (l.ownerZone !== undefined) {
      const z = w.zones.find((x) => x.id === l.ownerZone);
      if (z) {
        // fire flickers as it dies down
        const fade = z.permanent ? 1 : Math.min(1, z.life / 1.5);
        l.radius = l.baseRadius * (0.6 + 0.4 * fade);
      }
    }
    if (l.dimmed !== undefined) {
      l.dimmed -= dt;
      if (l.dimmed <= 0) {
        l.dimmed = undefined;
        l.on = true;
      }
    }
    if (l.life !== undefined) l.life -= dt;
    if (l.falling !== undefined) {
      l.falling -= dt;
      if (l.falling <= 0) crashChandelier(w, l);
    }
  }
  w.lights = w.lights.filter((l) => l.life === undefined || l.life > 0);
}

/** A player bullet reached a light's hitbox. */
export function shootLight(w: World, l: Light): void {
  const at = { x: l.pos.x, y: l.pos.y - CONFIG.lights[l.kind].lift };
  l.hp -= 1;
  if (l.hp > 0) {
    // some candles knocked off: the pool of light shrinks
    l.radius = l.baseRadius * (CONFIG.lightDamagedRadius + (1 - CONFIG.lightDamagedRadius) * ((l.hp - 1) / Math.max(1, l.maxHp - 1)));
    w.events.push({ type: "lightHit", pos: at, light: l.id, kind: l.kind });
    return;
  }
  if (l.kind === "chandelier") {
    // the chain snaps: the whole thing comes down a moment later
    l.falling = CONFIG.chandelier.fallTime;
    w.events.push({ type: "chandelierFall", pos: at, light: l.id });
    return;
  }
  putOut(w, l, at);
}

function putOut(w: World, l: Light, at: Vec): void {
  l.on = false;
  w.events.push({ type: "lightOut", pos: at, light: l.id, kind: l.kind });
  // hand of glory + night shroud: the dying flame bursts into embers
  if (w.player.stats.synergies.includes("noc")) {
    for (const u of w.units) {
      if (u.alive && u.team !== "minion" && dist(u.pos, l.pos) < 130) damageUnit(w, u, 4, norm(sub(u.pos, l.pos)), { fromPlayer: true, side: "minion", effect: "burn", effectTime: 2 });
    }
  }
}

/** The "wet wick" item: a bullet passing close to a flame snuffs it without stopping. */
export function snuffNear(w: World, from: Vec, to: Vec): void {
  for (const l of w.lights) {
    if (!l.on || l.kind === "chandelier" || !PUTOUT_KINDS.includes(l.kind)) continue;
    const p = { x: l.pos.x, y: l.pos.y - CONFIG.lights[l.kind].lift };
    if (distToSegment(p, from, to) < 46) {
      l.hp = 0;
      putOut(w, l, p);
    }
  }
}

/** Tons of iron and burning wax hit the floor: everything under it is crushed, the middle goes dark. */
export function crashChandelier(w: World, l: Light): void {
  const c = CONFIG.chandelier;
  l.falling = undefined;
  l.fallen = true;
  l.on = false;
  w.events.push({ type: "chandelierCrash", pos: { ...l.pos }, light: l.id });
  const ambush = !w.alarm;
  for (const u of w.units) {
    if (!u.alive || dist(u.pos, l.pos) > c.crushRadius + u.radius) continue;
    damageUnit(w, u, c.crushDamage, norm(sub(u.pos, l.pos)), { ambush: ambush && u.team !== "minion", fromPlayer: true, side: "minion", knock: 80 });
  }
  if (w.player.alive && dist(w.player.pos, l.pos) < c.crushRadius + CONFIG.player.radius) {
    hurtPlayer(w, 1, norm(sub(w.player.pos, l.pos)));
  }
  w.makeNoise(l.pos);
}

/** A shot through stained glass: shards rain on whoever stands in its light, the light stops being holy. */
export function breakWindow(w: World, l: Light): void {
  l.broken = true;
  l.holy = false;
  l.radius = l.baseRadius * CONFIG.window.brokenRadiusMul;
  w.events.push({ type: "windowBreak", pos: w.windowPoint(l), light: l.id });
  const ambush = !w.alarm;
  for (const u of w.units) {
    if (!u.alive || u.team === "minion" || dist(u.pos, l.pos) > l.baseRadius) continue;
    damageUnit(w, u, CONFIG.window.shardDamage, vec(0, 1), { ambush, fromPlayer: true, side: "minion" });
  }
  w.makeNoise(w.windowPoint(l));
}

/** Can a lamplighter (or a boss) bring this light back? */
export function relightable(l: Light): boolean {
  return !l.on && PUTOUT_KINDS.includes(l.kind) && !l.fallen && l.falling === undefined;
}

export function relight(w: World, l: Light, by: number): void {
  l.on = true;
  l.hp = l.maxHp;
  l.radius = l.baseRadius;
  w.events.push({ type: "relight", pos: { x: l.pos.x, y: l.pos.y - CONFIG.lights[l.kind].lift }, light: l.id, by });
}

/**
 * A lamplighter walks to the nearest light that was put out and relights it,
 * before the alarm and during the fight alike. Returns true if he spent this step on it.
 */
export function tendLights(w: World, u: Unit, dt: number): boolean {
  const lc = CONFIG.lamplighter;
  const aware = !(u.state === "idle" || u.state === "patrol");
  // never drops an attack halfway, and fights back if the necromancer is in his face
  if (u.state === "windup" || u.state === "charge" || u.state === "aim" || u.state === "fire" || u.state === "strike") return false;
  if (aware && w.player.alive && dist(u.pos, w.player.pos) < 160) return false;
  let l = u.task !== undefined ? w.lights.find((x) => x.id === u.task) : undefined;
  if (!l || !relightable(l)) {
    l = undefined;
    u.task = undefined;
    let best: number = lc.range;
    for (const x of w.lights) {
      if (!relightable(x)) continue;
      // two lamplighters don't go for the same candle
      if (w.units.some((o) => o !== u && o.alive && o.task === x.id)) continue;
      const d = dist(u.pos, x.pos);
      if (d < best) {
        best = d;
        l = x;
      }
    }
    if (!l) return false;
    u.task = l.id;
    u.taskTime = lc.relightTime;
  }
  if (dist(u.pos, l.pos) > lc.reach) {
    u.dir = norm(sub(l.pos, u.pos));
    const speed = u.def.speed * (aware ? 1.1 : CONFIG.darkness.patrolSpeedMul * 1.4);
    w.moveUnit(u, scale(u.dir, speed), dt);
    return true;
  }
  w.moveUnit(u, vec(), dt);
  u.taskTime -= dt;
  if (u.taskTime <= 0) {
    relight(w, l, u.id);
    u.task = undefined;
  }
  return true;
}
