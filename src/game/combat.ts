/**
 * Damage and death, bullets (straight, homing, lobbed), explosions and areas on the floor
 * (fire, plague, exorcism circles, slams).
 */
import { CONFIG } from "./config.js";
import { type Vec, add, angleOf, clamp, dist, distToSegment, fromAngle, len, norm, scale, segmentHitsRect, sub, vec } from "./math.js";
import type { Bullet, BulletEffect, Cover, Team, Unit, Zone } from "./types.js";
import type { World } from "./world.js";
import { BARRELS, blocksBullets, nextId } from "./shared.js";
import { shootLight, breakWindow, snuffNear } from "./lighting.js";
import { breakChest, dropLoot, hitSecretWall, onBossDeath, autoRaise } from "./loot.js";

// ------------------------------------------------------------------ the necromancer
/** Returns true if the hit landed (false while dodging or invulnerable). */
export function hurtPlayer(w: World, halves: number, dir: Vec, holy = false): boolean {
  const p = w.player;
  if (p.dodgeLeft > 0 || p.invuln > 0 || !p.alive) return false;
  const slot = p.weapons[p.current];
  // a legend sanctified by a guard's sacrifice sometimes turns a blow aside
  if (slot?.ritual === "guard" && w.rng() < 0.25) {
    p.invuln = 0.4;
    w.events.push({ type: "shieldBlock", pos: { ...p.pos } });
    return true;
  }
  p.invuln = CONFIG.player.hitInvuln;
  p.push = add(p.push, scale(dir, CONFIG.player.hitKnockback * 10));
  if (p.armor > 0) {
    p.armor -= 1;
    w.events.push({ type: "playerHit", pos: { ...p.pos }, dir, armor: true });
    return true;
  }
  p.halves = Math.max(0, p.halves - halves * (holy ? 2 : 1));
  w.events.push({ type: "playerHit", pos: { ...p.pos }, dir, armor: false });
  if (p.halves === 0) {
    p.alive = false;
    w.events.push({ type: "playerDeath", pos: { ...p.pos } });
  }
  return true;
}

// ------------------------------------------------------------------ units
export interface HitOpts {
  ambush?: boolean;
  crit?: boolean;
  /** The necromancer's own shot or blast. */
  fromPlayer?: boolean;
  /** Side of whoever dealt it. */
  side?: Team | "none";
  holy?: boolean;
  effect?: BulletEffect;
  effectTime?: number;
  knock?: number;
  /** Finish off non-boss enemies below this share of health. */
  execute?: number;
}

/** Bosses fight for the light (design doc): in light they shrug hits off, in the dark they bleed. */
export function bossTakenMul(w: World, u: Unit): number {
  if (!u.def.boss) return 1;
  // the Holy Flame is shielded while its braziers burn, the Glass Angel while its windows stand
  if (u.boss?.mem.shield) return 0.4;
  // the usurer behind his strongbox lid
  if (u.boss?.mem.guard) return 0.15;
  return bossLit(w, u) ? 0.75 : 1.3;
}

/** Is a boss standing in light, not counting the glow it carries itself? */
export function bossLit(w: World, u: Unit): boolean {
  return w.lights.some((l) => l.on && l.owner !== u.id && l.kind !== "flash" && dist(l.pos, u.pos) < l.radius);
}

export function damageUnit(w: World, u: Unit, amount: number, dir: Vec, o: HitOpts = {}): void {
  if (!u.alive) return;
  let dmg = amount;
  if (u.team === "minion" && w.dark && w.isLit(u.pos, false)) dmg *= CONFIG.darkness.minionLightTakenMul;
  const undead = u.team === "minion" || u.def.faction === "undead";
  if (o.holy && undead) dmg *= 2;
  dmg *= bossTakenMul(w, u);
  if (u.champion === "armored") dmg *= CONFIG.champions.armoredTaken;
  if (u.boss && u.boss.intro > 0) dmg = 0; // the boss is still making its entrance
  u.hp -= dmg;
  if (!w.alarm && u.team !== "minion") w.raiseAlarm(u);
  u.flash = 0.08;
  const knock = (o.knock ?? 30) * (u.def.boss ? 0.1 : u.elite ? 0.5 : 1);
  u.push = add(u.push, scale(dir, knock * 8));
  if (o.effect) applyEffect(u, o.effect, o.effectTime ?? 1.5);
  if (o.fromPlayer && w.player.stats.infect && u.team !== "minion" && u.def.raisable) u.st.infected = true;
  if (o.execute && u.team !== "minion" && !u.def.boss && u.hp > 0 && u.hp / u.maxHp < o.execute) u.hp = 0;
  if (u.hp <= 0) {
    killUnit(w, u, dir, { ambush: o.ambush, fromPlayer: o.fromPlayer, side: o.side, holy: o.holy });
  } else if (u.team !== "minion") {
    w.events.push({ type: "enemyHit", pos: { ...u.pos }, dir, enemy: u.id, ambush: o.ambush ?? false, amount: dmg, crit: o.crit ?? false });
  } else {
    w.events.push({ type: "minionHit", pos: { ...u.pos }, dir, unit: u.id, amount: dmg });
  }
}

export function applyEffect(u: Unit, effect: BulletEffect, time: number): void {
  const boss = u.def.boss ? 0.2 : 1;
  switch (effect) {
    case "stun": u.st.stun = Math.max(u.st.stun, time * boss); break;
    case "slow": u.st.slow = Math.max(u.st.slow, time); break;
    case "weep": u.st.weep = Math.max(u.st.weep, time); break;
    case "fear": if (!u.def.boss) u.st.fear = Math.max(u.st.fear, time); break;
    case "burn": u.st.burn = Math.max(u.st.burn, time); break;
    case "ash": u.st.ashMarked = true; break;
    default: break;
  }
}

export function killUnit(w: World, u: Unit, dir: Vec, o: { crumbled?: boolean; ambush?: boolean; fromPlayer?: boolean; side?: Team | "none"; holy?: boolean } = {}): void {
  if (!u.alive) return;
  u.alive = false;
  u.hp = Math.min(u.hp, 0);
  const n = CONFIG.necro;
  // what the dead carried: a lantern keeps burning on the floor, a peasant's torch sets it alight
  for (const l of w.lights) {
    if (l.owner !== u.id) continue;
    l.owner = undefined;
    if (l.kind === "censer") l.life = 0.01;
    if (l.kind === "carried") {
      l.life = 0.01;
      addZone(w, { kind: "fire", pos: { ...u.pos }, radius: 45, life: 5, warn: 0, side: "none", dps: 3, burst: 0, halves: 1 });
    }
  }
  if (u.team !== "minion") {
    w.kills += 1;
    if (o.fromPlayer || o.side === "minion") w.player.kills += 1;
    w.events.push({ type: "enemyDeath", pos: { ...u.pos }, dir, kind: u.kind, ambush: o.ambush ?? false, team: u.team, elite: u.elite, boss: u.def.boss ?? false });
    if (u.kind !== "mimic") {
      w.corpses.push({
        id: nextId(),
        kind: u.kind,
        pos: { ...u.pos },
        dir,
        echo: u.def.raisable ? n.echo : 0,
        raises: 0,
        fromMinion: false,
        big: !u.def.raisable,
      });
    }
    const souls = u.def.boss ? 3 : 1;
    for (let i = 0; i < souls; i++) w.souls.push({ id: nextId(), pos: { x: u.pos.x + (i - (souls - 1) / 2) * 40, y: u.pos.y - 30 }, life: n.soulLife });
    if (w.rng() < w.player.stats.extraSoulChance) w.souls.push({ id: nextId(), pos: { x: u.pos.x + 26, y: u.pos.y - 44 }, life: n.soulLife });
    // Saint Gervase's holy water + the martyr's vial: kills heal now and then
    if (o.holy && o.fromPlayer && w.player.stats.synergies.includes("namaszczenie")) {
      const slot = w.player.weapons[w.player.current];
      slot.holyKills = (slot.holyKills ?? 0) + 1;
      if (slot.holyKills >= 12 && w.player.halves < w.player.maxHalves) {
        slot.holyKills = 0;
        w.player.halves += 1;
        w.events.push({ type: "heal", pos: { ...w.player.pos } });
      }
    }
    dropLoot(w, u);
    if (u.champion) championDeath(w, u);
    if (u.def.boss) onBossDeath(w, u);
    if (u.st.infected && u.def.raisable) autoRaise(w, u, false);
    else if (u.st.ashMarked && u.def.raisable) autoRaise(w, u, true);
  } else {
    w.events.push({ type: "minionDeath", pos: { ...u.pos }, dir, kind: u.kind, crumbled: o.crumbled ?? false });
    if (u.kind !== "abomination" && !u.mini) {
      // a fallen minion leaves a body that can be raised once more (no new soul)
      w.corpses.push({ id: nextId(), kind: u.kind, pos: { ...u.pos }, dir, echo: u.raises < n.maxRaises ? n.echo : 0, raises: u.raises, fromMinion: true, big: false });
    }
  }
}

/** A champion's gift shows itself once more as he dies. */
function championDeath(w: World, u: Unit): void {
  const c = u.champion!;
  const pos = { ...u.pos };
  switch (c) {
    case "explosive":
      // a red circle, then the blast: time enough to step out
      addZone(w, { kind: "slam", pos, radius: 110, life: 0.95, warn: 0.75, side: u.team, dps: 0, burst: 10, halves: 1 });
      break;
    case "splitting":
      // he falls apart into two smaller copies of himself (they don't split again)
      for (const side of [-1, 1]) {
        const k = w.spawn(u.kind, w.collideWorld(add(pos, vec(side * 34, 10)), u.radius * 0.75), u.team, { mini: true });
        k.hp = k.maxHp = Math.max(2, u.maxHp * 0.4);
      }
      break;
    case "vengeful":
      ring(w, pos, 12, 230, w.rng() * Math.PI, { side: u.team, radius: 9, look: "holy", holy: true, life: 3, damage: 3, halves: 1 });
      break;
    default:
      break;
  }
  w.events.push({ type: "championDeath", pos, champion: c });
}

// ------------------------------------------------------------------ explosions and areas
export function addZone(w: World, z: Omit<Zone, "id" | "maxLife">): Zone {
  return w.addZone(z);
}

/** A blast: hurts everyone not on `side` within the radius, topples nothing, sets off barrels. */
export function explode(w: World, pos: Vec, radius: number, damage: number, side: Team | "none", fromPlayer: boolean, halves = 1): void {
  w.events.push({ type: "explosion", pos: { ...pos }, radius });
  for (const u of w.units) {
    if (!u.alive || (side !== "none" && u.team === side)) continue;
    const d = dist(u.pos, pos);
    if (d > radius + u.radius) continue;
    damageUnit(w, u, damage, norm(sub(u.pos, pos)), { fromPlayer, side, knock: 120 });
  }
  if (side !== "minion" && w.player.alive && dist(w.player.pos, pos) < radius + CONFIG.player.radius) {
    hurtPlayer(w, halves, norm(sub(w.player.pos, pos)));
  }
  for (const c of w.covers) {
    if (c.broken) continue;
    const cx = clamp(pos.x, c.x, c.x + c.w);
    const cy = clamp(pos.y, c.y, c.y + c.h);
    if (Math.hypot(cx - pos.x, cy - pos.y) > radius) continue;
    if (BARRELS.includes(c.kind)) {
      c.hp = 0;
      breakCover(w, c, fromPlayer);
    } else if (Number.isFinite(c.hp)) {
      c.hp -= damage;
      if (c.hp <= 0) breakCover(w, c, fromPlayer);
    }
  }
  w.makeNoise(pos);
}

/** A cover gives way; barrels go up in fire. */
export function breakCover(w: World, c: Cover, fromPlayer: boolean): void {
  if (c.broken) return;
  c.broken = true;
  const at = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  w.events.push({ type: "coverBreak", cover: c.id, pos: at, kind: c.kind });
  const b = CONFIG.barrel;
  if (c.kind === "powder") {
    explode(w, at, b.blastRadius, b.blastDamage, "none", fromPlayer);
    addZone(w, { kind: "fire", pos: at, radius: b.fireRadius, life: b.fireTime, warn: 0, side: "none", dps: 4, burst: 0, halves: 1, fromPlayer });
  } else if (c.kind === "oil") {
    // burning oil lights the floor for good
    w.events.push({ type: "fire", pos: at, radius: b.oilRadius });
    addZone(w, { kind: "fire", pos: at, radius: b.oilRadius, life: 9999, warn: 0, side: "none", dps: 4, burst: 0, halves: 1, permanent: true, fromPlayer });
    w.makeNoise(at);
  }
}

export function updateZones(w: World, dt: number): void {
  for (const z of w.zones) {
    if (!z.permanent) z.life -= dt;
    if (z.kind === "trap") {
      // an iron trap waits to be stepped on (by the necromancer or one of his dead)
      if (z.warn > 0) {
        z.warn -= dt;
        continue;
      }
      const victim = w.player.alive && dist(w.player.pos, z.pos) < z.radius + CONFIG.player.radius * 0.5;
      const minion = w.units.find((u) => u.alive && u.team === "minion" && dist(u.pos, z.pos) < z.radius + u.radius * 0.5);
      if (victim || minion) {
        if (victim && hurtPlayer(w, z.halves, vec())) w.player.slow = Math.max(w.player.slow ?? 0, 1.6);
        if (minion) damageUnit(w, minion, z.burst, vec(), { side: z.side, knock: 0, effect: "slow", effectTime: 2 });
        w.events.push({ type: "trap", pos: { ...z.pos } });
        z.life = 0;
      }
      continue;
    }
    if (z.warn > 0) {
      z.warn -= dt;
      if (z.warn <= 0) zoneBurst(w, z);
      continue;
    }
    if (z.dps <= 0 && z.halves <= 0) continue;
    z.tick = (z.tick ?? 0) - dt;
    if (z.tick > 0) continue;
    z.tick = 0.5;
    for (const u of w.units) {
      if (!u.alive || !zoneHurts(z, u.team, u.def.faction === "undead" || u.team === "minion")) continue;
      if (dist(u.pos, z.pos) > z.radius + u.radius * 0.5) continue;
      damageUnit(w, u, z.dps * 0.5, vec(), { fromPlayer: z.fromPlayer, side: z.side, knock: 0, effect: z.kind === "fire" || z.kind === "holyfire" ? "burn" : undefined, effectTime: 1 });
    }
    if (z.halves > 0 && z.side !== "minion" && w.player.alive && dist(w.player.pos, z.pos) < z.radius + CONFIG.player.radius * 0.5) {
      if (hurtPlayer(w, z.halves, vec(), z.kind === "holyfire") && z.kind === "ink") w.player.slow = Math.max(w.player.slow ?? 0, 1.5);
    }
  }
  const gone = w.zones.filter((z) => z.life <= 0);
  if (gone.length) {
    const ids = new Set(gone.map((z) => z.light).filter((x): x is number => x !== undefined));
    w.lights = w.lights.filter((l) => !ids.has(l.id));
    w.zones = w.zones.filter((z) => z.life > 0);
  }
}

function zoneHurts(z: Zone, team: Team, undead: boolean): boolean {
  if (z.undeadOnly) return undead;
  return z.side === "none" || z.side !== team;
}

/** The warning ran out: the circle strikes. */
function zoneBurst(w: World, z: Zone): void {
  if (z.kind === "exorcism") w.events.push({ type: "exorcism", pos: { ...z.pos }, radius: z.radius, warn: false });
  if (z.kind === "slam") w.events.push({ type: "explosion", pos: { ...z.pos }, radius: z.radius });
  if (z.kind === "fire" || z.kind === "holyfire") {
    const l = w.lights.find((x) => x.id === z.light);
    if (l) l.on = true;
    w.events.push({ type: "fire", pos: { ...z.pos }, radius: z.radius });
  }
  for (const u of w.units) {
    if (!u.alive || !zoneHurts(z, u.team, u.def.faction === "undead" || u.team === "minion")) continue;
    if (dist(u.pos, z.pos) > z.radius + u.radius * 0.5) continue;
    damageUnit(w, u, z.burst, norm(sub(u.pos, z.pos)), { fromPlayer: z.fromPlayer, side: z.side, knock: 60, holy: z.kind === "exorcism" });
  }
  if (z.halves > 0 && z.side !== "minion" && w.player.alive && dist(w.player.pos, z.pos) < z.radius + CONFIG.player.radius * 0.5) {
    hurtPlayer(w, z.halves, norm(sub(w.player.pos, z.pos)));
  }
  if (z.dps <= 0) z.life = Math.min(z.life, 0.25); // a one-off strike fades right after
}

// ------------------------------------------------------------------ bullets
export function spawnBullet(w: World, b: Partial<Bullet> & Pick<Bullet, "pos" | "vel" | "side">): Bullet {
  const full: Bullet = {
    radius: 8,
    damage: CONFIG.hitOnMinion,
    halves: 1,
    fromPlayer: false,
    life: 4,
    look: "ball",
    ...b,
  };
  if (!full.fromPlayer && w.ctx.grace) full.vel = scale(full.vel, 0.82);
  w.bullets.push(full);
  return full;
}

/** Fire a pattern of bullets: `count` spread evenly over `fan` radians around `dir`. */
export function fan(w: World, from: Vec, dir: Vec, count: number, fanAngle: number, speed: number, b: Partial<Bullet> & Pick<Bullet, "side">): void {
  const base = angleOf(dir);
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? base : base - fanAngle / 2 + (fanAngle * i) / (count - 1);
    spawnBullet(w, { ...b, pos: { ...from }, vel: fromAngle(a, speed) });
  }
}

/** A full circle of `count` bullets. */
export function ring(w: World, from: Vec, count: number, speed: number, offset: number, b: Partial<Bullet> & Pick<Bullet, "side">): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (Math.PI * 2 * i) / count;
    spawnBullet(w, { ...b, pos: { ...from }, vel: fromAngle(a, speed) });
  }
}

/** Throw something that flies over everything and lands at `to`. */
export function lob(w: World, from: Vec, to: Vec, b: Partial<Bullet> & Pick<Bullet, "side">, land: NonNullable<Bullet["lob"]>["land"], radius: number, dur = 0.9, height = 140): Bullet {
  return spawnBullet(w, {
    ...b,
    pos: { ...from },
    vel: vec(),
    life: dur + 1,
    lob: { from: { ...from }, to: { ...to }, t: 0, dur, land, radius, height },
  });
}

function nearestHostile(w: World, b: Bullet): Vec | null {
  let best: Vec | null = null;
  let bestD = 700;
  if (b.side !== "minion" && w.player.alive) {
    best = w.player.pos;
    bestD = dist(b.pos, w.player.pos);
  }
  for (const u of w.units) {
    if (!u.alive || u.team === b.side) continue;
    const d = dist(b.pos, u.pos);
    if (d < bestD) {
      bestD = d;
      best = u.pos;
    }
  }
  return best;
}

function landLob(w: World, b: Bullet): void {
  const l = b.lob!;
  const at = l.to;
  switch (l.land) {
    case "explode":
      explode(w, at, l.radius, b.damage, b.side, b.fromPlayer);
      break;
    case "fire":
      w.events.push({ type: "fire", pos: { ...at }, radius: l.radius });
      addZone(w, { kind: "fire", pos: { ...at }, radius: l.radius, life: 4, warn: 0, side: b.side, dps: 4, burst: 0, halves: 1, fromPlayer: b.fromPlayer });
      break;
    case "fireRing":
      w.events.push({ type: "explosion", pos: { ...at }, radius: l.radius * 0.7 });
      ring(w, at, 8, 230, w.rng() * Math.PI, { side: b.side, radius: 9, look: "ember", life: 3, damage: 3, halves: 1, fromPlayer: b.fromPlayer });
      addZone(w, { kind: "fire", pos: { ...at }, radius: l.radius, life: 4, warn: 0, side: b.side, dps: 4, burst: 0, halves: 1, fromPlayer: b.fromPlayer });
      break;
    case "holyRing":
      ring(w, at, 12, 210, w.rng() * Math.PI, { side: b.side, radius: 9, look: "holy", holy: true, life: 3.5, damage: 3, halves: 1 });
      addZone(w, { kind: "holyfire", pos: { ...at }, radius: l.radius, life: 3, warn: 0, side: b.side, dps: 3, burst: 0, halves: 1 });
      break;
    case "plague":
      addZone(w, { kind: "plague", pos: { ...at }, radius: l.radius, life: 5, warn: 0, side: b.side, dps: 6, burst: 0, halves: 0, fromPlayer: b.fromPlayer });
      break;
    case "keg":
      // a rolled powder keg: a blast and a ring of burning splinters
      explode(w, at, l.radius, b.damage, b.side, b.fromPlayer);
      ring(w, at, 12, 210, w.rng() * Math.PI, { side: b.side, radius: 9, look: "ember", life: 3.5, damage: 3, halves: 1 });
      break;
    case "oil":
      // burning oil: a fire that never goes out and lights the floor for good
      w.events.push({ type: "fire", pos: { ...at }, radius: l.radius });
      addZone(w, { kind: "fire", pos: { ...at }, radius: l.radius, life: 9999, warn: 0, side: "none", dps: 4, burst: 0, halves: 1, permanent: true });
      break;
    case "trap":
      // an iron trap lands open and arms itself a moment later
      w.events.push({ type: "bulletWall", pos: { ...at } });
      addZone(w, { kind: "trap", pos: { ...at }, radius: l.radius, life: 20, warn: 0.45, side: b.side, dps: 0, burst: 4, halves: 1 });
      break;
    case "miasma":
      // rat poison: a sickly cloud that hurts everyone but its thrower's side
      addZone(w, { kind: "plague", pos: { ...at }, radius: l.radius, life: 5.5, warn: 0.5, side: b.side, dps: 3, burst: 0, halves: 1 });
      break;
    case "ink":
      // a pot of ink bursts: black, sticky, slowing
      w.events.push({ type: "bulletWall", pos: { ...at } });
      addZone(w, { kind: "ink", pos: { ...at }, radius: l.radius, life: 8, warn: 0, side: b.side, dps: 2, burst: 0, halves: 1 });
      break;
    case "stone": {
      // a thrown stone only hurts where it lands
      w.events.push({ type: "coverHit", cover: -1, pos: { ...at } });
      for (const u of w.units) {
        if (u.alive && u.team !== b.side && dist(u.pos, at) < l.radius + u.radius) damageUnit(w, u, b.damage, norm(sub(u.pos, at)), { side: b.side, knock: 60 });
      }
      if (b.side !== "minion" && w.player.alive && dist(w.player.pos, at) < l.radius + CONFIG.player.radius) hurtPlayer(w, b.halves, norm(sub(w.player.pos, at)));
      break;
    }
    case "flare": {
      // a lamplighter's flare: a short fire and, for a few seconds, light over half the room
      w.events.push({ type: "explosion", pos: { ...at }, radius: 50 });
      addZone(w, { kind: "fire", pos: { ...at }, radius: l.radius, life: 3.5, warn: 0, side: b.side, dps: 3, burst: 0, halves: 1 });
      const glare = w.addLight("fire", at, { radius: CONFIG.flare.light });
      glare.life = CONFIG.flare.time;
      ring(w, at, 8, 180, w.rng() * Math.PI, { side: b.side, radius: 9, look: "ember", life: 3, damage: 3, halves: 1 });
      break;
    }
  }
}

export function updateBullets(w: World, dt: number): void {
  const W = w.room;
  const wall = CONFIG.room.wall;
  for (const b of w.bullets) {
    if (b.life <= 0) continue;
    if (b.delay && b.delay > 0) {
      b.delay -= dt;
      continue;
    }
    if (b.lob) {
      const l = b.lob;
      l.t += dt;
      const t = Math.min(1, l.t / l.dur);
      b.pos = { x: l.from.x + (l.to.x - l.from.x) * t, y: l.from.y + (l.to.y - l.from.y) * t };
      if (t >= 1) {
        b.life = 0;
        landLob(w, b);
      }
      continue;
    }
    if (b.homing) {
      const target = nearestHostile(w, b);
      if (target) {
        const want = angleOf(sub(target, b.pos));
        const cur = angleOf(b.vel);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -b.homing * dt, b.homing * dt);
        b.vel = fromAngle(cur + turn, len(b.vel));
      }
    }
    if (b.spin) b.vel = fromAngle(angleOf(b.vel) + b.spin * dt, len(b.vel));
    if (b.accel) {
      const sp = Math.max(b.minSpeed ?? 40, len(b.vel) + b.accel * dt);
      b.vel = scale(norm(b.vel), sp);
    }
    const from = b.pos;
    const to = add(b.pos, scale(b.vel, dt));
    b.pos = to;
    b.life -= dt;

    if (b.fromPlayer) {
      // candles, candelabra, torches, braziers, pyres and the chandelier's frame can be shot out
      const target = w.lights.find(
        (l) => l.on && l.hp > 0 && l.falling === undefined && CONFIG.lights[l.kind].hit > 0 && distToSegment(liftPoint(l), from, to) < CONFIG.lights[l.kind].hit + b.radius,
      );
      if (target) {
        shootLight(w, target);
        b.life = 0;
        continue;
      }
      if (w.player.stats.wickSnuffer || b.snuff) snuffNear(w, from, to);
    }

    if (to.x < W.x + wall || to.y < W.y + wall || to.x > W.x + W.w - wall || to.y > W.y + W.h - wall) {
      if (b.bounce && b.bounce > 0) {
        // glass glances off the wall
        b.bounce -= 1;
        if (to.x < W.x + wall || to.x > W.x + W.w - wall) b.vel = vec(-b.vel.x, b.vel.y);
        if (to.y < W.y + wall || to.y > W.y + W.h - wall) b.vel = vec(b.vel.x, -b.vel.y);
        b.pos = { x: clamp(to.x, W.x + wall + 1, W.x + W.w - wall - 1), y: clamp(to.y, W.y + wall + 1, W.y + W.h - wall - 1) };
        w.events.push({ type: "bulletWall", pos: { ...b.pos } });
        continue;
      }
      b.life = 0;
      const at = { x: clamp(to.x, wall, W.w - wall), y: clamp(to.y, wall, W.h - wall) };
      w.events.push({ type: "bulletWall", pos: at });
      if (b.fromPlayer) {
        const side = to.y < W.y + wall ? "N" : to.y > W.y + W.h - wall ? "S" : to.x < W.x + wall ? "W" : "E";
        const glass = w.lights.find((l) => {
          if (l.kind !== "window" || l.broken || (l.wall ?? "N") !== side) return false;
          const wp = w.windowPoint(l);
          const along = side === "N" || side === "S" ? Math.abs(at.x - wp.x) : Math.abs(at.y - wp.y);
          return along < CONFIG.window.width / 2;
        });
        if (glass) breakWindow(w, glass);
        hitSecretWall(w, at, side);
      }
      if (b.blast) explode(w, at, b.blast, b.damage * 0.5, b.side, b.fromPlayer);
      continue;
    }
    // toppled cover, tombs and barrels stop bullets from both sides
    let blocked = false;
    for (const c of w.covers) {
      if (!blocksBullets(c) || !segmentHitsRect(from, to, c)) continue;
      blocked = true;
      if (Number.isFinite(c.hp)) {
        c.hp -= b.fromPlayer || b.side === "minion" ? b.damage : Math.max(1, b.damage);
        w.events.push({ type: "coverHit", cover: c.id, pos: { ...to } });
        if (c.hp <= 0) breakCover(w, c, b.fromPlayer);
      } else {
        w.events.push({ type: "bulletWall", pos: { ...to } });
      }
      break;
    }
    if (blocked) {
      b.life = 0;
      if (b.blast) explode(w, to, b.blast, b.damage * 0.5, b.side, b.fromPlayer);
      continue;
    }
    if (b.fromPlayer) {
      const chest = w.chests.find((c) => !c.opened && !c.broken && dist(c.pos, to) < 34 + b.radius);
      if (chest) {
        b.life = 0;
        chest.hp -= 1;
        if (chest.hp <= 0) breakChest(w, chest);
        else w.events.push({ type: "coverHit", cover: chest.id, pos: { ...to } });
        continue;
      }
    }
    const dir = norm(b.vel);
    for (const u of w.units) {
      if (!u.alive || u.team === b.side || dist(u.pos, to) > u.radius + b.radius) continue;
      if (b.hit && b.hit.includes(u.id)) continue;
      // a holy knight's shield stops what comes from the front
      if (u.def.ai === "knight" && u.state !== "recover" && u.st.stun <= 0) {
        const facing = u.facing;
        const dot = -(dir.x * facing.x + dir.y * facing.y);
        if (dot > Math.cos((65 * Math.PI) / 180)) {
          w.events.push({ type: "shieldBlock", pos: { ...to } });
          b.life = 0;
          break;
        }
      }
      // the rat musket and the plague censer: the bitten carry the plague
      if (b.weapon === "ratgun" && w.player.stats.synergies.includes("zaraza") && u.team !== "minion" && u.def.raisable) u.st.infected = true;
      damageUnit(w, u, b.damage, dir, {
        ambush: b.ambush,
        crit: b.crit,
        fromPlayer: b.fromPlayer,
        side: b.side,
        holy: b.holy,
        effect: b.effect === "split" || b.effect === "execute" ? undefined : b.effect,
        effectTime: b.effectTime,
        knock: b.knock,
        execute: b.effect === "execute" ? b.effectTime : undefined,
      });
      if (b.fromPlayer && w.player.stats.synergies.includes("koncert")) {
        // the scream and the teeth together: the howl makes them weep, the teeth make them flee
        if (b.weapon === "howler") applyEffect(u, "weep", 2.5);
        if (b.weapon === "lament") applyEffect(u, "fear", 1.2);
      }
      if (b.blast) explode(w, to, b.blast, b.damage * 0.5, b.side, b.fromPlayer);
      if (b.effect === "split" && !b.hit) {
        // Saint Gervase in the dark: the holy water splits into three
        for (const da of [-0.5, 0, 0.5]) {
          spawnBullet(w, { pos: { ...to }, vel: fromAngle(angleOf(b.vel) + da, len(b.vel) * 0.8), side: b.side, fromPlayer: true, damage: b.damage * 0.4, halves: 0, radius: 5, life: 0.5, look: "holy", hit: [u.id] });
        }
      }
      if (b.pierce && b.pierce > 0) {
        b.pierce -= 1;
        (b.hit ??= []).push(u.id);
      } else {
        b.life = 0;
      }
      break;
    }
    if (b.life > 0 && b.side !== "minion" && w.player.alive && dist(w.player.pos, to) < CONFIG.player.radius + b.radius) {
      if (hurtPlayer(w, b.halves, dir, b.holy)) {
        b.life = 0;
        // a chain hook drags the necromancer in
        if (b.pullTo) w.player.push = add(w.player.push, scale(norm(sub(b.pullTo, w.player.pos)), 1500));
        // tears and ink weigh him down
        if (b.effect === "slow" || b.effect === "weep") w.player.slow = Math.max(w.player.slow ?? 0, b.effectTime ?? 1.5);
      }
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
}

function liftPoint(l: { pos: Vec; kind: keyof typeof CONFIG.lights }): Vec {
  return { x: l.pos.x, y: l.pos.y - CONFIG.lights[l.kind].lift };
}
