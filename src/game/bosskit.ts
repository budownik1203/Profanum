/**
 * The tools every boss script is written with: the step machine (start / rest / choose),
 * movement, bullets and patterns, blows, reinforcements and relighting.
 * A script is a small state machine over `boss.step`: "idle" (moving, waiting for the next attack),
 * one step per attack, and "phase" (a roar when the boss crosses a health threshold).
 */
import { CONFIG } from "./config.js";
import { type Vec, add, angleOf, dist, fromAngle, len, norm, scale, sub, vec } from "./math.js";
import type { UnitKind } from "./data/units.js";
import type { Bullet, BossState, Light, Side, Unit, Zone } from "./types.js";
import type { World } from "./world.js";
import { addZone, bossLit, damageUnit, hurtPlayer, spawnBullet } from "./combat.js";
import { relight, relightable } from "./lighting.js";

export interface Ctx {
  w: World;
  u: Unit;
  b: BossState;
  dt: number;
  /** Attack speed: faster in light, slower in the dark, faster each phase. */
  haste: number;
  /** Where the necromancer is (or the nearest minion if he is gone). */
  target: Vec;
}

export type Options = [string, number][];

// ------------------------------------------------------------------ the arena
export function wallSide(w: World, x: number, y: number): Side {
  const d: [Side, number][] = [["N", y], ["S", w.room.h - y], ["W", x], ["E", w.room.w - x]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

/** Place a fixed light; torches and windows go on the nearest wall. */
export function placeLight(w: World, k: Light["kind"], x: number, y: number): Light {
  return w.addLight(k, vec(x, y), k === "torch" || k === "window" ? { wall: wallSide(w, x, y) } : {});
}

// ------------------------------------------------------------------ the step machine
export function start(c: Ctx, step: string): void {
  c.b.step = step;
  c.b.t = 0;
  c.b.n = 0;
  c.u.state = "boss";
  if (step !== "idle" && step !== "phase") c.b.prev = step;
}

export function idle(b: BossState, seconds: number): void {
  b.step = "idle";
  b.t = 0;
  b.n = 0;
  b.next = seconds;
}

export function rest(c: Ctx, seconds: number): void {
  idle(c.b, seconds / c.haste);
  c.u.state = "boss";
}

/** Weighted choice that avoids repeating the last attack when it can. */
export function choose(c: Ctx, options: Options): string {
  const pool = options.length > 1 ? options.filter(([n]) => n !== c.b.prev) : options;
  const total = pool.reduce((s, [, wgt]) => s + wgt, 0);
  let r = c.w.rng() * total;
  for (const [n, wgt] of pool) {
    r -= wgt;
    if (r <= 0) return n;
  }
  return pool[0][0];
}

export const cd = (c: Ctx, key: string): number => c.b.mem[key] ?? 0;

export function tickCooldowns(c: Ctx): void {
  for (const k of Object.keys(c.b.mem)) if (k.endsWith("Cd")) c.b.mem[k] -= c.dt;
}

/** The usual opening of a script's update: the clock and the cooldowns. */
export function tick(c: Ctx): void {
  c.b.t += c.dt;
  tickCooldowns(c);
}

/** Count down to the next attack; true when it is time to choose one. */
export function ready(c: Ctx): boolean {
  c.b.next -= c.dt * c.haste;
  return c.b.next <= 0;
}

// ------------------------------------------------------------------ moving
export function stand(c: Ctx): void {
  c.w.moveUnit(c.u, vec(), c.dt);
}

export function moveTo(c: Ctx, goal: Vec, speed: number): void {
  const d = sub(goal, c.u.pos);
  if (len(d) < 8) {
    c.w.moveUnit(c.u, vec(), c.dt);
    return;
  }
  c.u.dir = norm(d);
  c.w.moveUnit(c.u, scale(c.u.dir, speed), c.dt);
}

/** Hold a distance from the target and circle it. */
export function keepDistance(c: Ctx, want: number, speed: number): void {
  const toT = sub(c.target, c.u.pos);
  const d = len(toT);
  const dirT = norm(toT);
  c.u.dir = dirT;
  const radial = d > want + 60 ? 1 : d < want - 60 ? -1 : 0;
  if (c.w.rng() < c.dt * 0.25) c.u.strafe *= -1;
  const side = { x: -dirT.y * c.u.strafe, y: dirT.x * c.u.strafe };
  c.w.moveUnit(c.u, scale(norm(add(scale(dirT, radial), scale(side, 0.6))), speed), c.dt);
}

/**
 * Keep a distance from the necromancer, but a boss caught in the dark walks back into one of its
 * lights first (a candle, a brazier, a window), as long as the necromancer isn't standing in it.
 */
export function prowl(c: Ctx, want: number, speed: number): void {
  const { w, u, b } = c;
  let seek = b.mem.seek !== undefined ? w.lights.find((l) => l.id === b.mem.seek && l.on) : undefined;
  if (!seek && cd(c, "seekCd") <= 0 && !bossLit(w, u)) {
    let best = 750;
    for (const l of w.lights) {
      if (!l.on || l.owner !== undefined || l.ownerZone !== undefined || l.kind === "flash" || l.life !== undefined) continue;
      const d = dist(l.pos, u.pos);
      if (d < best && dist(l.pos, c.target) > l.radius + 100) {
        best = d;
        seek = l;
      }
    }
    if (seek) b.mem.seek = seek.id;
    else b.mem.seekCd = 1.5;
  }
  if (seek) {
    if (dist(u.pos, seek.pos) > seek.radius * 0.45 && dist(seek.pos, c.target) > 140) {
      moveTo(c, seek.pos, speed);
      return;
    }
    // there: stay a while before looking for light again
    delete b.mem.seek;
    b.mem.seekCd = 4;
  } else if (b.mem.seek !== undefined) {
    delete b.mem.seek;
  }
  keepDistance(c, want, speed);
}

export function randomSpot(c: Ctx, awayFrom: Vec, minDist: number): Vec {
  const { w } = c;
  for (let i = 0; i < 20; i++) {
    const p = vec(200 + w.rng() * (w.room.w - 400), 200 + w.rng() * (w.room.h - 400));
    if (dist(p, awayFrom) >= minDist) return p;
  }
  return vec(w.room.w / 2, w.room.h / 2);
}

/** Vanish and appear somewhere far from the necromancer (smoke both ways). */
export function blink(c: Ctx, minDist: number): void {
  const { w, u } = c;
  w.events.push({ type: "dodge", pos: { ...u.pos }, dir: vec(0, -1) });
  u.pos = w.collideWorld(randomSpot(c, w.player.pos, minDist), u.radius);
  w.events.push({ type: "dodge", pos: { ...u.pos }, dir: vec(0, 1) });
}

// ------------------------------------------------------------------ bullets
export const B = (c: Ctx, o: Partial<Bullet> = {}): Partial<Bullet> & Pick<Bullet, "side"> => ({ side: c.u.team, radius: 10, damage: 4, halves: 1, life: 7, look: "ember", ...o });

export function shot(c: Ctx, from: Vec, dir: Vec, speed: number, o: Partial<Bullet> = {}): void {
  spawnBullet(c.w, { ...B(c, o), pos: { ...from }, vel: scale(dir, speed) });
}

export function aim(c: Ctx): Vec {
  return norm(sub(c.target, c.u.pos));
}

/** A ring of `n` bullets with `gap` neighbouring ones left out (a way through). */
export function gapRing(c: Ctx, from: Vec, n: number, speed: number, gap: number, offset: number, o: Partial<Bullet> = {}): void {
  const at = Math.floor(c.w.rng() * n);
  for (let i = 0; i < n; i++) {
    if ((i - at + n) % n < gap) continue;
    shot(c, from, fromAngle(offset + (i / n) * Math.PI * 2), speed, o);
  }
}

/** A straight wall of bullets across the room with one gap, kept away from the necromancer. */
export function pickGap(c: Ctx, lo: number, hi: number, avoid: number, keepAway: number): number {
  let gap = lo + c.w.rng() * (hi - lo);
  for (let i = 0; i < 12 && Math.abs(gap - avoid) < keepAway; i++) gap = lo + c.w.rng() * (hi - lo);
  return gap;
}

// ------------------------------------------------------------------ blows
/** A blow in a cone in front of the boss. */
export function cone(c: Ctx, dir: Vec, range: number, half: number, unitDamage: number): boolean {
  const { w, u } = c;
  const inside = (p: Vec) => {
    const d = sub(p, u.pos);
    if (len(d) > range) return false;
    let a = angleOf(d) - angleOf(dir);
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) <= half;
  };
  let hit = false;
  if (w.player.alive && inside(w.player.pos)) hit = hurtPlayer(w, 1, dir);
  for (const o of w.units) if (o.alive && o.team !== u.team && inside(o.pos)) damageUnit(w, o, unitDamage, dir, { side: u.team, knock: 90 });
  return hit;
}

/** Running into the boss hurts. */
export function contact(c: Ctx, dir: Vec, unitDamage: number): void {
  const { w, u } = c;
  if (w.player.alive && dist(w.player.pos, u.pos) < u.radius + CONFIG.player.radius) hurtPlayer(w, 1, dir);
  for (const o of w.units) if (o.alive && o.team !== u.team && dist(o.pos, u.pos) < u.radius + o.radius) damageUnit(w, o, unitDamage, dir, { side: u.team, knock: 90 });
}

/** A telegraphed circle on the floor that strikes once. */
export function slamAt(c: Ctx, pos: Vec, radius: number, warn: number, burst = 8): Zone {
  return addZone(c.w, { kind: "slam", pos: { ...pos }, radius, life: warn + 0.3, warn, side: c.u.team, dps: 0, burst, halves: 1 });
}

/** An exorcism circle: it burns only the dead (the minions and the necromancer himself). */
export function exorcismAt(c: Ctx, pos: Vec, radius: number, warn: number): Zone {
  c.w.events.push({ type: "exorcism", pos: { ...pos }, radius, warn: true });
  return addZone(c.w, { kind: "exorcism", pos: { ...pos }, radius, life: warn + 0.3, warn, side: c.u.team, dps: 0, burst: 8, halves: 1, undeadOnly: true });
}

// ------------------------------------------------------------------ the boss's people
export function adds(c: Ctx): number {
  return c.w.units.filter((x) => x.alive && x.team === c.u.team && !x.def.boss).length;
}

export function summon(c: Ctx, kind: UnitKind, at: Vec, opts: { lantern?: boolean; lamplighter?: boolean; quiet?: boolean } = {}): Unit {
  const s = c.w.spawn(kind, c.w.collideWorld(at, 30), c.u.team, { lantern: opts.lantern, lamplighter: opts.lamplighter });
  if (!opts.quiet) c.w.events.push({ type: "raise", pos: { ...s.pos }, kind, unit: s.id, free: true });
  return s;
}

/** Where reinforcements walk in: the four corners of the side walls. */
export function edgeSpots(w: World): Vec[] {
  return [vec(110, w.room.h * 0.3), vec(w.room.w - 110, w.room.h * 0.3), vec(110, w.room.h * 0.7), vec(w.room.w - 110, w.room.h * 0.7)];
}

/** Reinforcements walk in from the edges of the arena: bodies for the necromancer to raise. */
export function crowd(c: Ctx, kinds: UnitKind[], cooldown: number): void {
  const { w, b } = c;
  stand(c);
  if (b.n === 0 && b.t >= 0.8) {
    b.n = 1;
    const spots = edgeSpots(w);
    const r = Math.floor(w.rng() * 4);
    kinds.forEach((k, i) => summon(c, k, spots[(i + r) % 4]));
    b.mem.crowdCd = cooldown;
  }
  if (b.t >= 1.3) rest(c, 1);
}

// ------------------------------------------------------------------ light
/** Relight up to `n` lights of these kinds within `range`; returns how many. */
export function relightNear(c: Ctx, kinds: Light["kind"][], range: number, n: number): number {
  const list = c.w.lights.filter((l) => kinds.includes(l.kind) && relightable(l) && dist(l.pos, c.u.pos) < range).sort((a, b) => dist(a.pos, c.u.pos) - dist(b.pos, c.u.pos));
  for (const l of list.slice(0, n)) relight(c.w, l, c.u.id);
  return Math.min(n, list.length);
}

export function anyDark(c: Ctx, kinds: Light["kind"][], range = 5000): boolean {
  return c.w.lights.some((l) => kinds.includes(l.kind) && relightable(l) && dist(l.pos, c.u.pos) < range);
}

/**
 * A prayer, a shout, a struck flint: the boss stands still for `wind` seconds and then up to `n`
 * dark lights come back. The renderer shows golden lines to them while it lasts.
 */
export function relightStep(c: Ctx, kinds: Light["kind"][], range: number, n: number, wind: number, cooldown: number): void {
  const { b } = c;
  stand(c);
  if (b.n === 0) {
    b.n = 1;
    b.mem.relightRange = range;
    b.mem.relightN = n;
    b.mem.relightWind = wind;
    telegraph(c);
  }
  if (b.n === 1 && b.t >= wind / c.haste) {
    b.n = 2;
    relightNear(c, kinds, range, n);
    b.mem.relightCd = cooldown;
  }
  if (b.t >= wind / c.haste + 0.3) rest(c, 0.8);
}

export function telegraph(c: Ctx): void {
  c.w.events.push({ type: "telegraph", enemy: c.u.id });
}
