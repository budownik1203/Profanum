/**
 * More of them, now and then, and more often deeper (design: Więcej walki, like Gungeon's rooms):
 * - waves: when most of a room's garrison is down, the next group comes in through a door;
 * - a call for help: spotted in a quiet room, the watch from next door runs in a few seconds later;
 * - the bell: while a bellringer keeps tolling, someone answers it every few seconds;
 * - ambush: a room that looks empty, its guards hidden in coffins, crates and behind curtains;
 * - the summoning circle: cultists keep a rite going, something crawls out until they all fall;
 * - the hunt: after an alarm, torchbearers sweep the floor and relight what was put out;
 * - the last stand: "hold for 40 seconds", groups walk in from every door.
 */
import { CONFIG } from "./config.js";
import type { FloorDef } from "./data/floors.js";
import type { UnitKind } from "./data/units.js";
import { type Vec, add, dist, vec } from "./math.js";
import { pick } from "./shared.js";
import { addChest } from "./loot.js";
import type { Unit } from "./types.js";
import type { World } from "./world.js";

export interface Reinforce {
  /** Groups still to come when the room thins out. */
  waves: UnitKind[][];
  /** Guards at the start of the fight (a wave comes when a third of them is left). */
  start: number;
  /** Help from next door: the group and how long after the alarm it comes (null: none, or it came). */
  call: { kinds: UnitKind[]; t: number } | null;
  /** The room was quiet when the necromancer walked in (only then is there anyone to call). */
  quiet: boolean;
  /** The bell's answer: seconds to the next man, how many came. */
  bell: { t: number; n: number };
  /** The floor's pools, for whoever answers. */
  melee: UnitKind[];
  ranged: UnitKind[];
  /** Cultists' summoning circle. */
  rite: { pos: Vec; t: number; n: number; zone: number } | null;
  /** The last stand: seconds left, seconds to the next group; done once it's over. */
  hold: { active: boolean; left: number; next: number; started: boolean; done: boolean; depth: number } | null;
  /** The hunt sweeping the floor: a party coming in after a while. */
  hunt: { kinds: UnitKind[]; t: number; lamp: UnitKind } | null;
}

const chance = (base: number, per: number, depth: number, max: number) => Math.min(max, base + per * (depth - 1));

/** Decide a combat room's surprises when it is built. */
export function planRoom(w: World, def: FloorDef, rng: () => number, opts: { hold?: boolean } = {}): void {
  const c = CONFIG.reinforce;
  const depth = def.depth;
  const r: Reinforce = {
    waves: [],
    start: w.enemies.length,
    call: null,
    quiet: !w.alarm,
    bell: { t: c.bellEvery, n: 0 },
    melee: def.melee,
    ranged: def.ranged,
    rite: null,
    hold: null,
    hunt: null,
  };
  const group = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? pick(rng, def.melee) : pick(rng, def.ranged)));
  if (opts.hold) {
    r.hold = { active: false, left: c.holdTime, next: 1.2, started: false, done: false, depth };
    w.reinforce = r;
    return;
  }
  // waves
  if (rng() < chance(c.waveBase, c.wavePerDepth, depth, c.waveMax)) {
    const n = rng() < (depth - 2) * 0.12 ? 2 : 1;
    for (let i = 0; i < n; i++) r.waves.push(group(2 + Math.floor(depth / 2) + Math.floor(rng() * 2)));
  }
  // a call for help (only if the room is quiet when he walks in, and has no waves coming already)
  if (r.quiet && r.waves.length === 0 && rng() < chance(c.callBase, c.callPerDepth, depth, c.callMax)) r.call = { kinds: group(2 + Math.floor(depth / 3)), t: c.callDelay[0] + rng() * (c.callDelay[1] - c.callDelay[0]) };
  // an ambush: everyone hidden (not in a room of light, which starts the fight at once)
  if (r.quiet && w.enemies.length > 0 && rng() < chance(c.ambushBase, c.ambushPerDepth, depth, c.ambushMax)) {
    for (const u of w.enemies) if (u.state === "idle" && !u.lamplighter && !u.lantern && !u.def.boss) u.hidden = true;
  }
  // a summoning circle where cultists stand
  const cultist = w.enemies.find((u) => u.kind === "cultist");
  if (cultist && rng() < c.riteChance) {
    const pos = w.collideWorld(add(cultist.pos, vec(90, 60)), 60);
    const z = w.addZone({ kind: "rite", pos, radius: 80, life: 9999, warn: 0, side: "feral", dps: 0, burst: 0, halves: 0, permanent: true });
    r.rite = { pos, t: c.riteEvery, n: 0, zone: z.id };
  }
  w.reinforce = r;
}

/** Hunters after an alarm on the floor: a torch to relight the dark and men to search it. */
export function planHunt(w: World, def: FloorDef, rng: () => number): void {
  const c = CONFIG.reinforce;
  if (!w.reinforce) planRoom(w, def, () => 1);
  const lamp: UnitKind = def.id === "klasztor" || def.id === "katedra" ? "acolyte" : "torchbearer";
  const kinds = Array.from({ length: 1 + Math.floor(def.depth / 2) }, () => pick(rng, def.melee));
  w.reinforce!.hunt = { kinds, lamp, t: c.huntDelay[0] + rng() * (c.huntDelay[1] - c.huntDelay[0]) };
}

/** A doorway to walk in through: the one farthest from the necromancer (never a secret passage). */
function entry(w: World, i = 0): Vec {
  const doors = w.usableDoors.filter((d) => !d.secret).map((d) => w.arrivalPoint(d.side));
  if (!doors.length) return vec(w.room.w / 2, CONFIG.room.wall + 120);
  doors.sort((a, b) => dist(b, w.player.pos) - dist(a, w.player.pos));
  const far = doors.filter((p) => dist(p, w.player.pos) > 380);
  const pool = far.length ? far : doors;
  return pool[i % pool.length];
}

/** Men come in through a doorway, already fighting. */
function walkIn(w: World, kinds: UnitKind[], at?: Vec, opts: { lamp?: boolean } = {}): Unit[] {
  const out: Unit[] = [];
  kinds.forEach((k, i) => {
    const base = at ?? entry(w, i);
    const pos = w.collideWorld(add(base, vec((i % 3 - 1) * 46, Math.floor(i / 3) * 40)), 26);
    const u = w.spawn(k, pos, undefined, opts.lamp && i === 0 ? { lamplighter: true } : {});
    out.push(u);
    w.events.push({ type: "reinforcements", pos: { ...pos }, first: i === 0 });
  });
  if (!w.alarm) w.raiseAlarm(out[0]);
  return out;
}

/** Is there still something to come? (the room isn't cleared before it has come) */
export function reinforcementsPending(w: World): boolean {
  const r = w.reinforce;
  if (!r) return false;
  return (w.alarm && r.waves.length > 0) || !!r.hold?.active || (!!r.call && w.alarm && r.quiet);
}

export function updateReinforce(w: World, dt: number): void {
  const r = w.reinforce!;
  const c = CONFIG.reinforce;
  const p = w.player;
  // ambushers burst out when he comes close, or when anyone raises the alarm
  for (const u of w.units) {
    if (!u.hidden) continue;
    if (w.alarm || (p.alive && dist(u.pos, p.pos) < c.ambushReveal)) {
      u.hidden = false;
      u.state = "approach";
      w.events.push({ type: "ambushOut", pos: { ...u.pos }, unit: u.id });
      if (!w.alarm) w.raiseAlarm(u);
    }
  }
  // the last stand
  const h = r.hold;
  if (h && !h.done) {
    if (!h.started) {
      h.started = true;
      h.active = true;
      w.alarm = true;
      w.events.push({ type: "hold", stage: "start", left: h.left });
    }
    if (h.active) {
      h.left -= dt;
      h.next -= dt;
      if (h.next <= 0 && h.left > 3) {
        h.next = c.holdEvery;
        const n = 2 + Math.floor(h.depth / 2) + Math.floor(w.rng() * 2);
        const doors = w.usableDoors.filter((d) => !d.secret);
        const at = doors.length ? w.arrivalPoint(pick(w.rng, doors).side) : undefined;
        walkIn(w, Array.from({ length: n }, (_, i) => (i % 2 ? pick(w.rng, r.ranged) : pick(w.rng, r.melee))), at);
      }
      if (h.left <= 0) {
        h.active = false;
        w.events.push({ type: "hold", stage: "over", left: 0 });
      }
    } else if (w.enemies.length === 0) {
      h.done = true;
      addChest(w, h.depth >= 3 ? "iron" : "wood", vec(w.room.w / 2, w.room.h / 2));
      w.events.push({ type: "hold", stage: "won", left: 0 });
    }
  }
  // the hunt walks in whether the room is fighting or not
  if (r.hunt) {
    r.hunt.t -= dt;
    if (r.hunt.t <= 0) {
      walkIn(w, [r.hunt.lamp, ...r.hunt.kinds], undefined, { lamp: true });
      w.events.push({ type: "hunt", pos: { ...entry(w) } });
      r.hunt = null;
    }
  }
  if (!w.alarm) return;
  // a wave when the garrison thins out
  if (r.waves.length > 0 && w.enemies.length <= Math.ceil(r.start / 3)) walkIn(w, r.waves.shift()!);
  // help from next door
  if (r.call && r.quiet) {
    r.call.t -= dt;
    if (r.call.t <= 0) {
      walkIn(w, r.call.kinds);
      r.call = null;
    }
  }
  // the bell: as long as it tolls, someone answers
  if (w.units.some((u) => u.alive && u.kind === "bellringer" && u.state === "ring" && u.team !== "minion") && r.bell.n < c.bellMax) {
    r.bell.t -= dt;
    if (r.bell.t <= 0) {
      r.bell.t = c.bellEvery;
      r.bell.n += 1;
      walkIn(w, [w.rng() < 0.5 ? pick(w.rng, r.melee) : pick(w.rng, r.ranged)]);
    }
  }
  // the rite: while a cultist lives, something crawls out of the circle now and then
  if (r.rite) {
    const keepers = w.units.some((u) => u.alive && u.kind === "cultist" && u.team !== "minion");
    if (!keepers) {
      w.zones = w.zones.filter((z) => z.id !== r.rite!.zone);
      w.events.push({ type: "riteBroken", pos: { ...r.rite.pos } });
      r.rite = null;
    } else if (r.rite.n < c.riteMax) {
      r.rite.t -= dt;
      if (r.rite.t <= 0) {
        r.rite.t = c.riteEvery;
        r.rite.n += 1;
        const u = w.spawn("feral", w.collideWorld(add(r.rite.pos, vec((w.rng() - 0.5) * 60, (w.rng() - 0.5) * 60)), 22));
        u.state = "approach";
        w.events.push({ type: "summon", pos: { ...u.pos } });
      }
    }
  }
}
