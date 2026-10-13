/**
 * Formations (design: Taktyka wrogów). A sergeant, or a soldier promoted for the fight (a plume on
 * his hat), turns a handful of men into a squad:
 * - a musket line that aims and fires as one; two ranks take turns and swap places (countermarch),
 *   a paviser plants his great shield before it;
 * - a wedge of halberds that closes in at a walk and charges as one wall, smashing pews on the way;
 * - a procession of the Church: a column behind a cross, its holy light growing with every marcher;
 * - dogs and the mob swinging round the flanks while the line holds the front.
 * Kill the leader and the formation falls apart. Churchmen also burn the dead so they can't be raised.
 * The squads only steer: the behaviours in ai.ts still aim, fire and strike.
 */
import { CONFIG } from "./config.js";
import type { FloorDef } from "./data/floors.js";
import type { UnitKind } from "./data/units.js";
import { type Vec, add, dist, len, norm, scale, sub, vec } from "./math.js";
import { nextId } from "./shared.js";
import type { Squad, SquadKind, Unit } from "./types.js";
import type { World } from "./world.js";

const LINE: readonly UnitKind[] = ["arquebusier", "witchhunter", "inquisitor"];
const WEDGE: readonly UnitKind[] = ["halberdier"];
const PROCESSION: readonly UnitKind[] = ["monk", "acolyte", "flagellant"];
const FLANK: readonly UnitKind[] = ["dog", "peasant", "torchbearer"];
/** Those who carry fire and hate the dead: they burn bodies before the necromancer can raise them. */
const BURNERS: readonly UnitKind[] = ["monk", "acolyte", "torchbearer"];

/** How a drilled room's slots are filled: which kind takes the ranged, melee and special places. */
export interface Drill {
  kind: SquadKind;
  ranged?: UnitKind;
  melee?: UnitKind;
  special?: UnitKind;
  /** A paviser marches with the line. */
  pavise?: boolean;
}

/** Does this room's garrison fight in formation, and which? (by floor; more often deeper) */
export function drillFor(def: FloorDef, depth: number, rng: () => number): Drill | null {
  const c = CONFIG.tactics;
  if (rng() >= Math.min(0.8, c.drillBase + c.drillPerDepth * (depth - 1))) return null;
  const guard = def.id === "slumsy" || def.id === "kupiecka" || def.id === "lochy";
  const roll = rng();
  switch (def.id) {
    case "cmentarz":
      return { kind: "line", ranged: "witchhunter" };
    case "klasztor":
      return { kind: "procession", ranged: roll < 0.5 ? "monk" : "acolyte", melee: "flagellant" };
    case "katedra":
      return roll < 0.5 ? { kind: "line", ranged: "inquisitor" } : { kind: "procession", ranged: "monk", melee: "flagellant", special: "acolyte" };
    default:
      if (!guard) return null;
      return roll < 0.55 ? { kind: "line", ranged: "arquebusier", pavise: depth >= 2 || rng() < 0.5 } : { kind: "wedge", melee: "halberdier" };
  }
}

/** After a room's guards are placed: pick the leaders and form the squads. */
export function formSquads(w: World, rng: () => number, depth: number, drill: Drill | null): void {
  const c = CONFIG.tactics;
  const free = () => w.units.filter((u) => u.alive && u.team === "enemy" && !u.def.boss && !u.tac && !u.elite);
  const promote = drill !== null || rng() < Math.min(0.85, c.promoteBase + c.promotePerDepth * (depth - 1));
  let sergeant = free().find((u) => u.kind === "sergeant");

  const tryForm = (kind: SquadKind, kinds: readonly UnitKind[], need: number): Squad | null => {
    const men = free().filter((u) => kinds.includes(u.kind));
    if (men.length < need) return null;
    let leader: Unit | undefined;
    if (sergeant && kind !== "procession") {
      leader = sergeant;
      sergeant = undefined;
    } else if (promote) {
      // the oldest hand of the group takes the plume (a monk carries the cross in a procession)
      leader = kind === "procession" ? men.find((u) => u.kind === "monk") ?? men[0] : men[0];
      men.splice(men.indexOf(leader), 1);
    }
    if (!leader || men.length < need - 1) return null;
    leader.leader = true;
    const sq: Squad = { id: nextId(), kind, leader: leader.id, members: men.map((u) => u.id), phase: kind === "wedge" || kind === "procession" ? "advance" : "form", timer: 0, rank: 0 };
    leader.tac = { squad: sq.id };
    men.forEach((u, i) => (u.tac = { squad: sq.id, rank: men.length >= 4 ? i % 2 : 0 }));
    w.squads.push(sq);
    return sq;
  };

  const order: SquadKind[] = drill ? [drill.kind, "line", "wedge", "procession"] : ["line", "wedge", "procession"];
  for (const kind of [...new Set(order)]) {
    if (kind === "line") tryForm("line", LINE, 2);
    if (kind === "wedge") tryForm("wedge", WEDGE, 3);
    if (kind === "procession") tryForm("procession", PROCESSION, 3);
  }
  // a line marches with its paviser; dogs and the mob work the flanks of any squad
  const anchor = w.squads.find((s) => s.kind === "line" || s.kind === "wedge");
  if (!anchor) return;
  if (drill?.pavise && anchor.kind === "line") {
    const lead = w.units.find((u) => u.id === anchor.leader)!;
    const pv = w.spawn("paviser", vec(lead.pos.x + 40, lead.pos.y + 20), undefined, lead.state === "idle" || lead.state === "patrol" ? { state: "idle" } : {});
    pv.tac = { squad: anchor.id };
    anchor.members.push(pv.id);
  }
  let side = 1;
  for (const u of free()) {
    if (!FLANK.includes(u.kind)) continue;
    u.tac = { squad: anchor.id, flank: side };
    side = -side;
  }
}

// ------------------------------------------------------------------ every step
const byId = (w: World, id: number) => w.units.find((u) => u.id === id && u.alive);

/** Where the squad fights: the necromancer or whoever its leader would go for. */
function targetOf(w: World, leader: Unit): Vec | null {
  const t = w.targetFor(leader);
  return t ? t.pos : null;
}

function inRoom(w: World, p: Vec, margin = 70): Vec {
  const m = CONFIG.room.wall + margin;
  return vec(Math.max(m, Math.min(w.room.w - m, p.x)), Math.max(m, Math.min(w.room.h - m, p.y)));
}

export function updateSquads(w: World, dt: number): void {
  for (const sq of w.squads) {
    const leader = byId(w, sq.leader);
    const men = sq.members.map((id) => byId(w, id)).filter((u): u is Unit => !!u && !!u.tac);
    sq.members = men.map((u) => u.id);
    // the leader fell, or his men did: the formation is gone
    if (!leader || men.length === 0) {
      disband(w, sq, leader ? leader.pos : men[0]?.pos);
      continue;
    }
    if (!w.alarm) continue;
    const target = targetOf(w, leader);
    if (!target) continue;
    sq.timer += dt;
    if (sq.kind === "line") updateLine(w, sq, leader, men, target, dt);
    else if (sq.kind === "wedge") updateWedge(w, sq, leader, men, target, dt);
    else updateProcession(w, sq, leader, men, target);
  }
  w.squads = w.squads.filter((s) => s.leader !== -1);
}

function disband(w: World, sq: Squad, at?: Vec): void {
  for (const id of [sq.leader, ...sq.members]) {
    const u = w.units.find((x) => x.id === id);
    if (!u) continue;
    u.tac = undefined;
    // a moment of confusion in the ranks
    if (u.alive && id !== sq.leader && w.alarm) u.st.stun = Math.max(u.st.stun, 0.5);
  }
  if (at && w.alarm) w.events.push({ type: "squadBroken", pos: { ...at } });
  if (sq.light !== undefined) w.lights = w.lights.filter((l) => l.id !== sq.light);
  sq.leader = -1;
}

/** The line stands at musket range across the way to the target; the ranks take turns. */
function updateLine(w: World, sq: Squad, leader: Unit, men: Unit[], target: Vec, dt: number): void {
  const c = CONFIG.tactics;
  const shooters = men.filter((u) => u.def.ai === "gunner");
  const range = shooters.length ? shooters.reduce((a, u) => a + (u.def.range ?? 400), 0) / shooters.length : 400;
  const from = sq.center ?? leader.pos;
  const want = inRoom(w, add(target, scale(norm(sub(from, target)), range * 0.92)), 90);
  sq.center = sq.center ? add(sq.center, scale(sub(want, sq.center), Math.min(1, dt * 1.1))) : want;
  const dir = norm(sub(target, sq.center));
  sq.dir = dir;
  const across = vec(-dir.y, dir.x);
  const twoRanks = shooters.length >= 4;
  // the rank about to fire stands in front; the other waits a step behind (countermarch)
  const ranks = [shooters.filter((u) => (u.tac!.rank ?? 0) === 0), shooters.filter((u) => (u.tac!.rank ?? 0) === 1)];
  ranks.forEach((rank, r) => {
    const front = !twoRanks || r === sq.rank;
    const base = front ? sq.center! : sub(sq.center!, scale(dir, c.rankGap));
    // keep each man on his side of the line so they don't cross over
    rank.sort((a, b) => (a.pos.x - b.pos.x) * across.x + (a.pos.y - b.pos.y) * across.y);
    rank.forEach((u, i) => (u.tac!.slot = inRoom(w, add(base, scale(across, (i - (rank.length - 1) / 2) * c.lineGap)))));
  });
  leader.tac!.slot = inRoom(w, sub(sq.center, scale(dir, c.rankGap * 2)));
  // the paviser's shield goes up before the line
  for (const u of men) if (u.kind === "paviser") u.tac!.slot = inRoom(w, add(sq.center, scale(dir, 110)), 60);

  const firing = twoRanks ? ranks[sq.rank] : shooters;
  if (sq.phase === "form") {
    const ready = firing.filter((u) => u.state === "reposition" && dist(u.pos, u.tac!.slot!) < 50).length;
    const reloaded = firing.filter((u) => u.state === "reposition").length;
    if ((reloaded > 0 && ready >= Math.ceil(firing.length * 0.6)) || (reloaded > 0 && sq.timer > c.formTime)) {
      // "Fire!": the whole rank aims at once, then the volley
      for (const u of [...firing, leader]) {
        if (u.state !== "reposition" || u.st.stun > 0 || u.def.ai !== "gunner") continue;
        u.state = "aim";
        u.timer = c.volleyAim;
        u.dir = norm(sub(target, u.pos));
        w.events.push({ type: "telegraph", enemy: u.id });
      }
      w.events.push({ type: "squadOrder", pos: { ...leader.pos }, order: "volley" });
      sq.phase = "reload";
      const reload = Math.max(...firing.map((u) => u.def.reload ?? 2));
      sq.timer = 0;
      sq.dir = dir;
      // two ranks: the next volley comes from the other rank in half the time
      sq.wait = twoRanks ? c.volleyAim + reload * 0.55 : c.volleyAim + reload + 0.3;
    }
  } else if (sq.phase === "reload") {
    if (sq.timer >= (sq.wait ?? 3)) {
      sq.phase = "form";
      sq.timer = 0;
      if (twoRanks) sq.rank = 1 - sq.rank;
    }
  }
}

/** The wedge: the leader at the point walks in, the halberds follow in a V, then all charge at once. */
function updateWedge(w: World, sq: Squad, leader: Unit, men: Unit[], target: Vec, _dt: number): void {
  const c = CONFIG.tactics;
  if (sq.phase === "charge") {
    if (sq.timer > 0.15 && [leader, ...men].every((u) => u.state !== "windup" && u.state !== "charge")) {
      sq.phase = "recover";
      sq.timer = 0;
    }
    return;
  }
  if (sq.phase === "recover") {
    if (sq.timer > 1.6) {
      sq.phase = "advance";
      sq.timer = 0;
    }
    return;
  }
  const dir = norm(sub(target, leader.pos));
  sq.dir = dir;
  const across = vec(-dir.y, dir.x);
  leader.tac!.slot = undefined;
  men.forEach((u, i) => {
    const row = Math.floor(i / 2) + 1;
    const side = i % 2 === 0 ? 1 : -1;
    u.tac!.slot = inRoom(w, add(sub(leader.pos, scale(dir, row * 58)), scale(across, side * row * 52)), 50);
  });
  const near = dist(leader.pos, target) < c.wedgeCharge;
  const ready = men.filter((u) => dist(u.pos, u.tac!.slot!) < 60).length >= Math.ceil(men.length * 0.6);
  if (near && (ready || sq.timer > 3)) {
    for (const u of [leader, ...men]) {
      if (u.st.stun > 0 || (u.state !== "approach" && u.state !== "follow")) continue;
      u.state = "windup";
      u.timer = 0.55;
      u.dir = dir;
      w.events.push({ type: "telegraph", enemy: u.id });
    }
    w.events.push({ type: "squadOrder", pos: { ...leader.pos }, order: "charge" });
    sq.phase = "charge";
    sq.timer = 0;
  }
}

/** The procession: a column behind the cross, chanting; its light grows with every marcher. */
function updateProcession(w: World, sq: Squad, leader: Unit, men: Unit[], target: Vec): void {
  const c = CONFIG.tactics;
  if (sq.light === undefined) {
    const l = w.addLight("censer", leader.pos, { owner: leader.id, radius: c.processionLight });
    l.holy = true;
    sq.light = l.id;
    w.events.push({ type: "squadOrder", pos: { ...leader.pos }, order: "chant" });
  }
  const light = w.lights.find((l) => l.id === sq.light);
  if (light) light.radius = light.baseRadius = c.processionLight + c.processionLightPer * men.length;
  const dir = norm(sub(target, leader.pos));
  sq.dir = dir;
  men.forEach((u, i) => {
    const zig = (i % 2 === 0 ? 1 : -1) * 16;
    u.tac!.slot = inRoom(w, add(sub(leader.pos, scale(dir, (i + 1) * 56)), scale(vec(-dir.y, dir.x), zig)), 50);
  });
  // close enough: the chant ends and everyone fights on his own (the light stays with the cross)
  if (dist(leader.pos, target) < c.processionBreak) {
    for (const u of men) u.tac = undefined;
    leader.tac = undefined;
    sq.members = [];
    sq.leader = -1;
    sq.light = undefined;
  }
}

// ------------------------------------------------------------------ steering for the behaviours
/** The squad this unit marches with (only once the room is fighting). */
export function squadOf(w: World, u: Unit): Squad | undefined {
  if (!u.tac || !w.alarm || u.team === "minion") return undefined;
  return w.squads.find((s) => s.id === u.tac!.squad);
}

/** Walk to the formation's place for this unit; null when it has none (fight on your own). */
export function holdFormation(w: World, u: Unit, speedMul = 1): Vec | null {
  const sq = squadOf(w, u);
  if (!sq) return null;
  // the head of a wedge or a procession sets the pace towards the enemy
  if (u.id === sq.leader && (sq.kind === "wedge" || sq.kind === "procession")) {
    const t = w.targetFor(u);
    if (!t) return vec();
    const d = sub(t.pos, u.pos);
    if (sq.kind === "wedge" && len(d) < CONFIG.tactics.wedgeCharge - 30) return vec();
    u.dir = norm(d);
    return scale(u.dir, sq.kind === "procession" ? CONFIG.tactics.processionPace : u.def.speed * CONFIG.tactics.wedgePace);
  }
  const slot = u.tac!.slot;
  if (!slot) return null;
  const to = sub(slot, u.pos);
  const d = len(to);
  if (d < 8) return vec();
  // slow down on arrival so the line doesn't shuffle
  const pace = sq.kind === "procession" ? Math.max(CONFIG.tactics.processionPace * 1.4, u.def.speed * 0.8) : u.def.speed;
  return scale(norm(to), Math.min(pace * speedMul, d * 4));
}

/** The wedge's common direction while it charges (every man pushes the same way). */
export function chargeDir(w: World, u: Unit): Vec | null {
  const sq = squadOf(w, u);
  return sq && sq.kind === "wedge" && sq.phase === "charge" && sq.dir ? sq.dir : null;
}

/** Flankers swing round the side of the target before they close in. Null once they are there. */
export function flankMove(w: World, u: Unit, target: Vec): Vec | null {
  if (!u.tac?.flank || !w.alarm) return null;
  const sq = w.squads.find((s) => s.id === u.tac!.squad);
  const anchor = sq && byId(w, sq.leader);
  if (!anchor) {
    u.tac.flank = 0;
    return null;
  }
  // from the target, turn away from where the squad stands, by a little over a right angle
  const from = norm(sub(anchor.pos, target));
  const a = Math.atan2(from.y, from.x) + u.tac.flank * 1.9;
  const goal = inRoom(w, add(target, vec(Math.cos(a) * CONFIG.tactics.flankRadius, Math.sin(a) * CONFIG.tactics.flankRadius)), 60);
  if (dist(u.pos, goal) < 70 || dist(u.pos, target) < 150) {
    u.tac.flank = 0;
    return null;
  }
  u.dir = norm(sub(goal, u.pos));
  return scale(u.dir, u.def.speed);
}

// ------------------------------------------------------------------ burning the dead
/**
 * A churchman (or a torchbearer of the mob) who sees a body the necromancer could raise walks over
 * and burns it, as long as the necromancer himself isn't close. Returns his steering, or null.
 */
export function tendPyre(w: World, u: Unit, dt: number): Vec | null {
  // men in a formation keep their place: only those on their own go to the pyre
  if (u.team !== "enemy" || !w.alarm || !BURNERS.includes(u.kind) || u.lamplighter || u.st.stun > 0 || (u.tac && !u.pyre)) return null;
  const c = CONFIG.tactics;
  const safe = !w.player.alive || dist(w.player.pos, u.pos) > c.burnSafe;
  if (u.pyre) {
    const body = w.corpses.find((x) => x.id === u.pyre!.corpse);
    if (!body || !safe) {
      u.pyre = undefined;
      return null;
    }
    const to = sub(body.pos, u.pos);
    if (len(to) > 34) {
      u.dir = norm(to);
      return scale(u.dir, u.def.speed * 1.1);
    }
    u.pyre.t -= dt;
    if (u.pyre.t <= 0) {
      w.corpses = w.corpses.filter((x) => x !== body);
      w.events.push({ type: "corpseBurned", pos: { ...body.pos } });
      w.addZone({ kind: "fire", pos: { ...body.pos }, radius: 46, life: 2.2, warn: 0, side: "enemy", dps: 2, burst: 0, halves: 1 });
      u.pyre = undefined;
      u.taskTime = 4;
    }
    return vec();
  }
  u.taskTime -= dt;
  if (u.taskTime > 0 || !safe) return null;
  u.taskTime = 1.5;
  let best: { id: number; d: number } | null = null;
  for (const body of w.corpses) {
    if (body.big || body.echo <= 0) continue;
    const d = dist(body.pos, u.pos);
    if (d < c.burnLook && (!best || d < best.d)) best = { id: body.id, d };
  }
  // not every time: sometimes he has better things to do than tend the pyre
  if (best && w.rng() < 0.6) u.pyre = { corpse: best.id, t: c.burnTime };
  return null;
}
