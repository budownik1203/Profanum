/**
 * How units behave. One function per behaviour (data/units.ts says which unit uses which);
 * the same code drives a guard and the guard raised as a minion, only the targets differ.
 */
import { CONFIG } from "./config.js";
import { type Vec, add, angleOf, dist, fromAngle, len, norm, scale, sub, vec } from "./math.js";
import type { ShotDef } from "./data/units.js";
import type { Unit } from "./types.js";
import type { World } from "./world.js";
import { addZone, damageUnit, fan, hurtPlayer, killUnit, lob, ring, spawnBullet } from "./combat.js";
import { tendLights } from "./lighting.js";
import { updateBoss } from "./bosses.js";

type Target = { pos: Vec; unit?: Unit; player?: true };
type Behaviour = (w: World, u: Unit, t: Target, dt: number) => Vec;

export function updateUnit(w: World, u: Unit, dt: number): void {
  u.flash = Math.max(0, u.flash - dt);
  u.timer -= dt;
  u.cooldown -= dt;
  u.cooldown2 -= dt;
  tickStatus(w, u, dt);
  if (!u.alive) return;
  if (u.def.ai === "boss") {
    updateBoss(w, u, dt);
    return;
  }
  if (u.team !== "minion" && u.lamplighter && u.st.stun <= 0 && tendLights(w, u, dt)) return;
  if (u.team !== "minion" && (u.state === "idle" || u.state === "patrol")) {
    updateUnaware(w, u, dt);
    return;
  }
  if (u.team === "minion") {
    const d = CONFIG.darkness;
    const inLight = w.dark && w.isLit(u.pos, false);
    const rate = !w.dark ? 1 : inLight ? (w.player.stats.synergies.includes("armia") ? 1 : d.minionLightDecay) : d.minionDarkDecay;
    u.lifetime -= dt * rate;
    if (u.lifetime <= 0) {
      killUnit(w, u, vec(0, 1), { crumbled: true });
      return;
    }
  }
  if (u.st.stun > 0) {
    w.moveUnit(u, vec(), dt);
    return;
  }
  if (u.st.fear > 0 && u.team !== "minion") {
    flee(w, u, dt);
    return;
  }
  // the mob panics at the sight of the walking dead (design doc: Frakcje)
  if (u.def.faction === "mob" && u.team === "enemy" && u.cooldown2 <= 0) {
    u.cooldown2 = 1.2;
    const m = nearestOf(w, u, (o) => o.team === "minion", 220);
    if (m && w.rng() < 0.5) {
      u.st.fear = 1.4;
      u.fleeFrom = { ...m.pos };
      if (u.state === "windup" || u.state === "strike") u.state = "approach";
      flee(w, u, dt);
      return;
    }
  }
  // a raised monk tends the dead around him (design doc: Sługi), fight or no fight
  if (u.team === "minion" && u.kind === "monk" && u.cooldown <= 0) tendTheDead(w, u);
  const target = w.targetFor(u);
  // minions with nothing to fight walk to the ordered point or stay near the necromancer
  if (u.team === "minion" && !target) {
    const goal = w.order ? w.order.pos : w.player.pos;
    const keep = w.order ? 20 : CONFIG.necro.followDistance + u.radius;
    let vel = vec();
    if (dist(u.pos, goal) > keep) vel = scale(norm(sub(goal, u.pos)), u.def.speed * 1.2);
    if (u.state !== "channel") u.state = u.def.ai === "gunner" || u.def.ai === "caster" || u.def.ai === "bomber" || u.def.ai === "censer" ? "reposition" : "follow";
    u.timer = Math.max(u.timer, 0.3);
    if (vel.x || vel.y) u.dir = norm(vel);
    w.moveUnit(u, vel, dt);
    return;
  }
  if (!target) {
    w.moveUnit(u, vec(), dt);
    return;
  }
  const vel = BEHAVIOURS[u.def.ai](w, u, target, dt);
  w.moveUnit(u, vel, dt);
}

function tickStatus(w: World, u: Unit, dt: number): void {
  const s = u.st;
  if (s.stun > 0) {
    s.stun -= dt;
    if (u.state === "ring" || u.state === "channel") u.state = "approach";
  }
  if (s.slow > 0) s.slow -= dt;
  if (s.fear > 0) s.fear -= dt;
  if (s.weep > 0) s.weep -= dt;
  if (s.burn > 0) {
    s.burn -= dt;
    u.hp -= 3 * dt;
    if (u.hp <= 0) killUnit(w, u, vec(0, 1), { side: "none" });
  }
}

/** Before the alarm: guards stand (sleeping, praying, on watch) or walk their patrol. */
function updateUnaware(w: World, u: Unit, dt: number): void {
  let vel = vec();
  if (u.state === "patrol" && u.route.length > 0) {
    const goal = u.route[u.routeIdx % u.route.length];
    if (dist(u.pos, goal) < 12) u.routeIdx = (u.routeIdx + 1) % u.route.length;
    u.dir = norm(sub(goal, u.pos));
    vel = scale(u.dir, u.def.speed * CONFIG.darkness.patrolSpeedMul);
  }
  w.moveUnit(u, vel, dt);
}

function flee(w: World, u: Unit, dt: number): void {
  const from = u.fleeFrom ?? w.player.pos;
  const away = norm(sub(u.pos, from));
  u.dir = away;
  w.moveUnit(u, scale(away.x || away.y ? away : vec(1, 0), u.def.speed * 1.1), dt);
}

function nearestOf(w: World, u: Unit, ok: (o: Unit) => boolean, within: number): Unit | undefined {
  let best: Unit | undefined;
  let bestD = within;
  for (const o of w.units) {
    if (o === u || !o.alive || !ok(o)) continue;
    const d = dist(o.pos, u.pos);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

// ------------------------------------------------------------------ helpers
/** Damage multiplier of a minion's blow or bullet: items, light and darkness. */
function minionMul(w: World, u: Unit): number {
  return u.team === "minion" ? w.player.stats.minionDamageMul * w.sideMul(u.pos, true) : 1;
}

function telegraph(w: World, u: Unit): void {
  if (u.team !== "minion") w.events.push({ type: "telegraph", enemy: u.id });
}

/** Strike one opponent: the necromancer loses half a heart, a unit takes the blow's damage. */
function strike(w: World, u: Unit, t: Target, damage: number, dir: Vec): void {
  if (t.player) hurtPlayer(w, CONFIG.contactDamage, dir);
  else if (t.unit) damageUnit(w, t.unit, damage * minionMul(w, u), dir, { side: u.team, knock: 40 });
}

/** Everything hostile to `u` within `radius` of `at` (optionally only in a cone around `dir`). */
function hitArea(w: World, u: Unit, at: Vec, radius: number, damage: number, dir?: Vec, cone = Math.PI): void {
  const inCone = (p: Vec) => !dir || Math.abs(angleDiff(angleOf(sub(p, at)), angleOf(dir))) <= cone;
  if (u.team !== "minion" && w.player.alive) {
    const d = dist(w.player.pos, at);
    if (d < radius + CONFIG.player.radius && inCone(w.player.pos)) hurtPlayer(w, CONFIG.contactDamage, norm(sub(w.player.pos, at)));
  }
  for (const o of w.units) {
    if (!o.alive || o.team === u.team) continue;
    if (dist(o.pos, at) > radius + o.radius || !inCone(o.pos)) continue;
    damageUnit(w, o, damage * minionMul(w, u), norm(sub(o.pos, at)), { side: u.team, knock: 60 });
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Fire a unit's shot pattern along `dir`. */
function shoot(w: World, u: Unit, dir: Vec, shot: ShotDef): void {
  const muzzle = add(u.pos, scale(dir, u.radius + 14));
  const minion = u.team === "minion";
  const damage = minion ? (shot.damage ?? 4) * minionMul(w, u) : shot.damage ?? CONFIG.hitOnMinion;
  const b = {
    side: u.team,
    radius: shot.radius,
    look: shot.look,
    damage,
    halves: CONFIG.enemyBulletDamage,
    holy: shot.holy,
    homing: shot.homing,
    life: shot.life ?? 4,
  };
  let aim = dir;
  if (u.st.weep > 0) aim = fromAngle(angleOf(dir) + (w.rng() - 0.5) * 0.9);
  if (shot.count === 1) {
    const a = angleOf(aim) + (w.rng() - 0.5) * shot.spread;
    spawnBullet(w, { ...b, pos: muzzle, vel: fromAngle(a, shot.speed) });
  } else {
    fan(w, muzzle, aim, shot.count, shot.spread, shot.speed, b);
  }
  w.events.push({ type: "shot", pos: muzzle, dir: aim, side: u.team, fromPlayer: false });
  if (w.dark && !minion) w.addLight("flash", muzzle);
}

// ------------------------------------------------------------------ behaviours
const charger: Behaviour = (w, u, t) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dirT = norm(toT);
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (len(toT) < (d.engageRange ?? 190)) {
        u.state = "windup";
        u.timer = d.windup ?? 0.5;
        telegraph(w, u);
      }
      return scale(dirT, d.speed);
    case "windup":
      u.dir = dirT; // keeps tracking until the charge locks in
      if (u.timer <= 0) {
        u.state = "charge";
        u.timer = d.chargeTime ?? 0.4;
      }
      return vec();
    case "charge": {
      const hit = chargeContact(w, u);
      if (hit || u.timer <= 0) {
        u.state = "recover";
        u.timer = d.recover ?? 0.9;
      }
      return scale(u.dir, d.chargeSpeed ?? 600);
    }
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return vec();
    default:
      u.state = "approach";
      return vec();
  }
};

/** A charging unit hits the first opponent it touches. */
function chargeContact(w: World, u: Unit): boolean {
  if (u.team !== "minion" && w.player.alive && dist(u.pos, w.player.pos) < u.radius + CONFIG.player.radius + 4) {
    hurtPlayer(w, CONFIG.contactDamage, u.dir);
    return true;
  }
  for (const o of w.units) {
    if (!o.alive || o.team === u.team) continue;
    if (dist(u.pos, o.pos) < u.radius + o.radius + 4) {
      damageUnit(w, o, (u.def.melee ?? 3) * minionMul(w, u), u.dir, { side: u.team, knock: 50 });
      return true;
    }
  }
  return false;
}

const gunner: Behaviour = (w, u, t) => {
  const d = u.def;
  const shot = d.shot!;
  const toT = sub(t.pos, u.pos);
  const dd = len(toT);
  const dirT = norm(toT);
  const range = d.range ?? 400;
  switch (u.state) {
    case "follow":
    case "approach":
    case "reposition": {
      u.state = "reposition";
      // hold the preferred range and strafe around the target
      const radial = dd > range + 40 ? 1 : dd < range - 40 ? -1 : 0;
      const side = { x: -dirT.y * u.strafe, y: dirT.x * u.strafe };
      const vel = scale(norm(add(scale(dirT, radial), scale(side, 0.8))), d.speed);
      u.dir = dirT;
      if (u.timer <= 0) {
        u.state = "aim";
        u.timer = d.aim ?? 0.6;
        telegraph(w, u);
      }
      return vel;
    }
    case "aim":
      u.dir = dirT;
      if (u.timer <= 0) {
        u.state = "fire";
        u.burst = shot.burst ?? 1;
        u.timer = 0;
      }
      return vec();
    case "fire":
      if (u.timer <= 0) {
        u.dir = dirT; // bursts track the target
        shoot(w, u, u.dir, shot);
        u.burst -= 1;
        if (u.burst > 0) {
          u.timer = shot.burstGap ?? 0.12;
        } else {
          u.state = "reload";
          u.timer = d.reload ?? 2;
        }
      }
      return vec();
    case "reload": {
      const vel = scale({ x: -dirT.y * u.strafe, y: dirT.x * u.strafe }, d.speed * 0.4);
      if (u.timer <= 0) {
        u.state = "reposition";
        u.timer = d.reposition ? w.range(d.reposition) : 1.2;
        if (w.rng() < 0.4) u.strafe *= -1;
      }
      return vel;
    }
    default:
      u.state = "reposition";
      return vec();
  }
};

const rusher: Behaviour = (w, u, t) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dd = len(toT);
  const dirT = norm(toT);
  const reach = (d.reach ?? 60) + (t.unit ? t.unit.radius : CONFIG.player.radius) * 0.5;
  // a torchbearer throws his torch from afar now and then
  if (u.kind === "torchbearer" && u.cooldown <= 0 && dd > 220 && dd < 520 && (u.state === "approach" || u.state === "follow")) {
    u.cooldown = (d.special ?? 4.5) * (0.8 + w.rng() * 0.5);
    lob(w, add(u.pos, vec(0, -30)), t.pos, { side: u.team, damage: 3, halves: 1, look: "torch", radius: 10, fromPlayer: false }, "fire", d.area ?? 70, 0.8, 120);
  }
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (dd < reach) {
        u.state = "windup";
        u.timer = d.windup ?? 0.3;
        telegraph(w, u);
      }
      return scale(dirT, d.speed);
    case "windup":
      u.dir = dirT;
      if (u.timer <= 0) {
        u.state = "strike";
        u.timer = 0.12;
        if (dist(u.pos, t.pos) < reach + 26) strike(w, u, t, d.melee ?? 2, u.dir);
      }
      return vec();
    case "strike":
      if (u.timer <= 0) {
        u.state = "recover";
        u.timer = d.recover ?? 0.6;
      }
      return scale(u.dir, u.kind === "dog" || u.kind === "mimic" ? 420 : 140);
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return scale(dirT, d.speed * 0.15);
    default:
      u.state = "approach";
      return vec();
  }
};

const slammer: Behaviour = (w, u, t) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dirT = norm(toT);
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (len(toT) < (d.engageRange ?? 150)) {
        // marks the spot: a red circle you have to leave
        u.state = "windup";
        u.timer = d.windup ?? 0.8;
        u.goal = add(u.pos, scale(dirT, Math.min(len(toT), 110)));
        addZone(w, { kind: "slam", pos: { ...u.goal }, radius: d.area ?? 95, life: (d.windup ?? 0.8) + 0.3, warn: d.windup ?? 0.8, side: u.team, dps: 0, burst: (d.melee ?? 4) * minionMul(w, u), halves: u.team === "minion" ? 0 : 1 });
        telegraph(w, u);
      }
      return scale(dirT, d.speed);
    case "windup":
      if (u.timer <= 0) {
        u.state = "recover";
        u.timer = d.recover ?? 1;
        const shot = d.shot;
        if (shot && u.goal) ring(w, u.goal, shot.count, shot.speed, w.rng() * Math.PI, { side: u.team, radius: shot.radius, look: shot.look, damage: u.team === "minion" ? 3 : CONFIG.hitOnMinion, halves: 1, life: 2.5 });
      }
      return vec();
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return vec();
    default:
      u.state = "approach";
      return vec();
  }
};

const censer: Behaviour = (w, u, t, dt) => {
  const d = u.def;
  if (u.state === "channel") {
    if (u.timer <= 0) {
      u.state = "reposition";
      u.timer = 0.8;
    }
    return vec();
  }
  if (u.cooldown <= 0) {
    if (u.team !== "minion") {
      // exorcism: a circle that burns the undead (minions and the necromancer himself)
      const undeadNear = w.units.some((o) => o.alive && o.team === "minion" && dist(o.pos, u.pos) < (d.area ?? 210) + 80);
      const playerNear = w.player.alive && dist(w.player.pos, u.pos) < (d.area ?? 210) * 0.8;
      if (undeadNear || playerNear) {
        u.cooldown = d.special ?? 7;
        u.state = "channel";
        u.timer = 1.2;
        addZone(w, { kind: "exorcism", pos: { ...u.pos }, radius: d.area ?? 210, life: 1.5, warn: 1.2, side: u.team, dps: 0, burst: 8, halves: 1, undeadOnly: true });
        w.events.push({ type: "exorcism", pos: { ...u.pos }, radius: d.area ?? 210, warn: true });
        return vec();
      }
    }
  }
  return gunner(w, u, t, dt);
};

function tendTheDead(w: World, u: Unit): void {
  u.cooldown = 4;
  let healed = false;
  for (const o of w.units) {
    if (!o.alive || o.team !== "minion" || o === u || dist(o.pos, u.pos) > 240) continue;
    o.hp = Math.min(o.maxHp, o.hp + 4);
    o.lifetime += 4;
    healed = true;
  }
  if (healed) w.events.push({ type: "heal", pos: { ...u.pos } });
}

const frenzy: Behaviour = (w, u, t) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dd = len(toT);
  const dirT = norm(toT);
  // the more he bleeds, the faster he lashes
  const fury = 1 + (1 - Math.max(0, u.hp) / u.maxHp) * 0.8;
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (dd < (d.reach ?? 110)) {
        u.state = "windup";
        u.timer = (d.windup ?? 0.35) / fury;
        telegraph(w, u);
      }
      return scale(dirT, d.speed * fury);
    case "windup":
      u.dir = dirT;
      if (u.timer <= 0) {
        u.state = "strike";
        u.timer = 0.15;
        hitArea(w, u, u.pos, (d.reach ?? 110) + 10, d.melee ?? 3, u.dir, 0.95);
      }
      return vec();
    case "strike":
      if (u.timer <= 0) {
        u.state = "recover";
        u.timer = (d.recover ?? 0.5) / fury;
      }
      return scale(u.dir, 80);
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return scale(dirT, d.speed * 0.3);
    default:
      u.state = "approach";
      return vec();
  }
};

const knight: Behaviour = (w, u, t, dt) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dirT = norm(toT);
  // the shield turns towards the threat, slowly; it hangs low while he recovers
  if (u.state !== "recover") {
    const cur = angleOf(u.facing);
    const turn = Math.max(-2.6 * dt, Math.min(2.6 * dt, angleDiff(angleOf(dirT), cur)));
    u.facing = fromAngle(cur + turn);
  }
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (len(toT) < (d.engageRange ?? 170)) {
        u.state = "windup";
        u.timer = d.windup ?? 0.5;
        telegraph(w, u);
      }
      return scale(dirT, d.speed);
    case "windup":
      u.dir = dirT;
      if (u.timer <= 0) {
        u.state = "charge";
        u.timer = d.chargeTime ?? 0.35;
      }
      return vec();
    case "charge": {
      const hit = chargeContact(w, u);
      if (hit || u.timer <= 0) {
        u.state = "recover";
        u.timer = d.recover ?? 1.1;
      }
      return scale(u.dir, d.chargeSpeed ?? 500);
    }
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return vec();
    default:
      u.state = "approach";
      return vec();
  }
};

const bomber: Behaviour = (w, u, t, dt) => {
  const d = u.def;
  if (u.state === "cast") {
    if (u.timer <= 0) {
      // lead the target a little
      const lead = t.player ? scale(w.player.vel, 0.4) : vec();
      const to = add(t.pos, lead);
      lob(w, add(u.pos, vec(0, -30)), to, { side: u.team, damage: u.team === "minion" ? 6 * minionMul(w, u) : 3, halves: 1, look: "flask", radius: 9 }, "fireRing", d.area ?? 80, 0.9, 150);
      u.state = "reposition";
      u.timer = d.reposition ? w.range(d.reposition) : 1.2;
      u.cooldown = d.special ?? 2.8;
    }
    return vec();
  }
  if (u.cooldown <= 0 && dist(u.pos, t.pos) < (d.range ?? 420) + 220) {
    u.state = "cast";
    u.timer = 0.45;
    u.dir = norm(sub(t.pos, u.pos));
    telegraph(w, u);
    return vec();
  }
  return keepRange(w, u, t, dt);
};

const caster: Behaviour = (w, u, t, dt) => {
  const d = u.def;
  const dd = dist(u.pos, t.pos);
  // too close: blink away in a puff of smoke
  if (dd < 180 && u.cooldown2 <= 0) {
    u.cooldown2 = 5;
    const away = norm(sub(u.pos, t.pos));
    const side = { x: -away.y, y: away.x };
    const to = add(u.pos, add(scale(away, 240), scale(side, (w.rng() - 0.5) * 300)));
    w.events.push({ type: "dodge", pos: { ...u.pos }, dir: away });
    u.pos = w.collideWorld(to, u.radius);
    return vec();
  }
  if (u.state === "cast") {
    if (u.timer <= 0) {
      shoot(w, u, norm(sub(t.pos, u.pos)), d.shot!);
      u.state = "reposition";
      u.cooldown = d.special ?? 3;
    }
    return vec();
  }
  if (u.cooldown <= 0) {
    u.state = "cast";
    u.timer = 0.5;
    telegraph(w, u);
    return vec();
  }
  return keepRange(w, u, t, dt);
};

/** Ranged units between attacks: hold the preferred distance and circle. */
function keepRange(_w: World, u: Unit, t: Target, _dt: number): Vec {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dd = len(toT);
  const dirT = norm(toT);
  const range = d.range ?? 380;
  u.state = "reposition";
  u.dir = dirT;
  const radial = dd > range + 40 ? 1 : dd < range - 40 ? -1 : 0;
  const side = { x: -dirT.y * u.strafe, y: dirT.x * u.strafe };
  return scale(norm(add(scale(dirT, radial), scale(side, 0.7))), d.speed);
}

const bellringer: Behaviour = (w, u, t, dt) => {
  const bell = w.interactables.find((i) => i.kind === "bell" && !i.used);
  if (u.team !== "minion" && bell && w.alarm) {
    if (u.state === "ring") {
      if (u.timer <= 0) {
        bell.used = true;
        w.bellRung = true;
        w.events.push({ type: "bell", pos: { ...bell.pos }, done: true });
        w.ctx.alarmNeighbours?.();
        u.state = "approach";
      }
      return vec();
    }
    if (dist(u.pos, bell.pos) > 56) {
      u.dir = norm(sub(bell.pos, u.pos));
      u.state = "approach";
      return scale(u.dir, u.def.speed * 1.15);
    }
    u.state = "ring";
    u.timer = 2.5;
    w.events.push({ type: "bell", pos: { ...bell.pos }, done: false });
    return vec();
  }
  return rusher(w, u, t, dt);
};

const brute: Behaviour = (w, u, t) => {
  const d = u.def;
  const toT = sub(t.pos, u.pos);
  const dirT = norm(toT);
  switch (u.state) {
    case "follow":
    case "approach":
      u.state = "approach";
      u.dir = dirT;
      if (len(toT) < (d.engageRange ?? 120)) {
        u.state = "windup";
        u.timer = d.windup ?? 0.5;
      }
      return scale(dirT, d.speed);
    case "windup":
      if (u.timer <= 0) {
        u.state = "recover";
        u.timer = d.recover ?? 0.8;
        w.events.push({ type: "explosion", pos: add(u.pos, scale(u.dir, 40)), radius: d.area ?? 100 });
        hitArea(w, u, add(u.pos, scale(u.dir, 40)), d.area ?? 100, d.melee ?? 8);
      }
      return vec();
    case "recover":
      if (u.timer <= 0) u.state = "approach";
      return vec();
    default:
      u.state = "approach";
      return vec();
  }
};

const BEHAVIOURS: Record<Exclude<Unit["def"]["ai"], "boss">, Behaviour> = {
  charger,
  gunner,
  rusher,
  slammer,
  censer,
  frenzy,
  knight,
  bomber,
  caster,
  bellringer,
  brute,
};
