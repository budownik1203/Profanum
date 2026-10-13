/**
 * Plays a whole run with the scripted bot: fights every room, picks things up, opens chests, buys
 * at the fence, raises legends at the altar, breaks into the catacombs, walks through the doors,
 * kills the bosses and takes the stairs down, until the Holy Flame falls or the necromancer does.
 * Used by the whole-run test and by tools/fullrun.mjs (statistics and timing).
 */
import { Run } from "../src/game/run.js";
import { idleInput, type World } from "../src/game/world.js";
import { type Vec, add, dist, len, norm, scale, sub, vec } from "../src/game/math.js";
import { shopPrice } from "../src/game/loot.js";
import type { CharacterId } from "../src/game/data/items.js";
import type { InputState, Player, Side } from "../src/game/types.js";
import type { Floor, RoomNode } from "../src/game/floor.js";
import { botInput, newBot } from "./bot.js";

export interface RunReport {
  seed: number;
  victory: boolean;
  dead: boolean;
  depth: number;
  /** Simulated seconds. */
  time: number;
  rooms: number;
  /** Times the bot got stuck walking and was helped through a door. */
  stuck: number;
  /** Fights the bot could not finish (the enemies were removed). */
  stalled: number;
  bosses: { kind: string; seconds: number }[];
  halvesLost: number;
  kills: number;
  raised: number;
  legends: number;
  secrets: number;
  /** Secret floors the bot went down to. */
  secretFloors: string[];
  bought: number;
  maxBullets: number;
  /** Wall-clock milliseconds per simulation step. */
  avgStepMs: number;
  maxStepMs: number;
  problems: string[];
}

export interface RunOptions {
  god?: boolean;
  character?: CharacterId;
  /** Stop after this floor (6 = the whole run). */
  maxDepth?: number;
  /** Simulated seconds before giving up. */
  maxTime?: number;
  /** Take the trapdoors in the catacombs down to the secret floors (with a key in hand). */
  secrets?: boolean;
}

const DT = 1 / 60;
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The first step (door side and room) on the shortest way to a room the bot wants to reach. */
function nextStep(floor: Floor, goal: (r: RoomNode) => boolean): { side: Side; to: number } | null {
  const start = floor.node;
  const usable = (r: RoomNode, side: Side) => {
    if (!r.secretDoors[side]) return true;
    return !!r.world?.interactables.some((i) => i.kind === "secret" && i.side === side && i.used);
  };
  const prev = new Map<number, { from: number; side: Side }>();
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    const r = floor.rooms[id];
    if (id !== start.id && goal(r)) {
      let cur = id;
      while (prev.get(cur)!.from !== start.id) cur = prev.get(cur)!.from;
      return { side: prev.get(cur)!.side, to: cur };
    }
    for (const [side, to] of Object.entries(r.doors) as [Side, number][]) {
      if (seen.has(to) || !usable(r, side)) continue;
      seen.add(to);
      prev.set(to, { from: id, side });
      queue.push(to);
    }
  }
  return null;
}

interface Goal {
  kind: "pickup" | "buy" | "chest" | "altar" | "secret" | "stairs" | "hatch";
  key: string;
  pos: Vec;
  /** Close enough to act (interact or shoot). */
  reach: number;
  interact?: boolean;
  aim?: Vec;
}

/** What a quiet room still has for the bot, in order: loot, a purchase, chests, the altar, a cracked wall, the stairs. */
function quietGoal(w: World, p: Player, skip: Set<string>, bought: boolean, wallTime: number, secrets = false): Goal | null {
  const goals: Goal[] = [];
  const pickups = [...w.pickups].filter((pk) => pk.delay <= 0).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
  for (const pk of pickups) {
    // one relic is enough: swapping would only drop the old one back on the floor
    if (pk.kind === "relic" && p.relic) continue;
    if (pk.price === undefined) goals.push({ kind: "pickup", key: `pk:${pk.id}`, pos: pk.pos, reach: 30, interact: true });
    else if (!bought && p.gold >= shopPrice(w, pk.price)) goals.push({ kind: "buy", key: `buy:${pk.id}`, pos: pk.pos, reach: 80, interact: true });
  }
  for (const c of w.chests) {
    if (c.opened || c.broken) continue;
    // a bot heading for the secret floors keeps one key for the trapdoor
    if (p.keys > (secrets ? 1 : 0)) goals.push({ kind: "chest", key: `chest:${c.id}`, pos: c.pos, reach: 80, interact: true });
    else goals.push({ kind: "chest", key: `smash:${c.id}`, pos: c.pos, reach: 260, aim: c.pos });
  }
  const altar = w.interactables.find((i) => i.kind === "altar");
  if (altar && p.remains.length > 0 && p.souls >= 5) goals.push({ kind: "altar", key: "altar", pos: altar.pos, reach: 110, interact: true });
  const secret = w.interactables.find((i) => i.kind === "secret" && !i.used);
  if (secret && wallTime < 12) {
    const inward = { N: vec(0, 1), S: vec(0, -1), W: vec(1, 0), E: vec(-1, 0) }[secret.side ?? "N"];
    goals.push({ kind: "secret", key: `secret:${secret.id}`, pos: add(secret.pos, scale(inward, 300)), reach: 60, aim: secret.pos });
  }
  const hatch = w.interactables.find((i) => i.kind === "hatch" && !i.used);
  if (secrets && hatch && p.keys > 0) goals.push({ kind: "hatch", key: "hatch", pos: hatch.pos, reach: 60, interact: true });
  const stairs = w.interactables.find((i) => i.kind === "stairs");
  if (stairs) goals.push({ kind: "stairs", key: "stairs", pos: stairs.pos, reach: 60, interact: true });
  return goals.find((g) => !skip.has(g.key)) ?? null;
}

function walkTo(input: InputState, from: Vec, to: Vec): void {
  const d = sub(to, from);
  input.move = len(d) > 6 ? norm(d) : vec();
}

export function playRun(seed: number, o: RunOptions = {}): RunReport {
  const run = new Run({ seed, character: o.character ?? "grabarz" });
  const maxDepth = o.maxDepth ?? 6;
  const maxTime = o.maxTime ?? 5400;
  const mem = newBot();
  const rep: RunReport = {
    seed, victory: false, dead: false, depth: 1, time: 0, rooms: 1, stuck: 0, stalled: 0, bosses: [], halvesLost: 0, kills: 0, raised: 0,
    legends: 0, secrets: 0, secretFloors: [], bought: 0, maxBullets: 0, avgStepMs: 0, maxStepMs: 0, problems: [],
  };
  let steps = 0;
  let totalMs = 0;
  let roomTime = 0;
  let lastRoom = -1;
  let lastFloor: Floor | null = null;
  let progressAt = vec();
  let progressT = 0;
  let bossT = 0;
  let boughtHere = false;
  let wallTime = 0;
  /** What the bot gave up on in this room (out of reach, not wanted). */
  let skip = new Set<string>();
  let goalKey = "";
  let goalT = 0;
  let goalBest = 0;

  while (!run.over && rep.time < maxTime) {
    const floor = run.floor;
    const w: World = run.world;
    const p = run.player;
    if (floor !== lastFloor) {
      lastFloor = floor;
      rep.depth = run.depth;
      if (run.depth > maxDepth) break;
    }
    if (o.god) {
      p.maxHalves = Math.max(p.maxHalves, 40);
      p.halves = Math.max(p.halves, 30);
    }
    if (floor.current !== lastRoom) {
      lastRoom = floor.current;
      roomTime = 0;
      progressT = 0;
      boughtHere = false;
      wallTime = 0;
      skip = new Set();
      goalKey = "";
    }
    roomTime += DT;
    const node = floor.node;
    const enemies = w.enemies.filter((u) => u.alive);
    let input: InputState = idleInput(p.pos);

    if (enemies.length > 0) {
      // ---- a fight
      input = botInput(w, mem, DT);
      const boss = enemies.find((u) => u.def.boss);
      if (boss) bossT += DT;
      if (roomTime > (boss ? 400 : 90)) {
        // the bot cannot finish this one: note who was left, and where, then move on
        rep.stalled += 1;
        const who = enemies.map((u) => `${u.kind}(${u.state}) at ${Math.round(u.pos.x)},${Math.round(u.pos.y)}`).join(", ");
        rep.problems.push(`stalled in room ${node.id} (${node.type}${node.layout ? " " + node.layout : ""}) on floor ${run.depth}, necromancer at ${Math.round(p.pos.x)},${Math.round(p.pos.y)}: ${who}`);
        for (const u of enemies) u.alive = false;
        roomTime = 0;
      }
    } else {
      // ---- a quiet room: loot, then the way on
      const goal = quietGoal(w, run.player, skip, boughtHere, wallTime, o.secrets);
      if (goal) {
        const d = dist(goal.pos, p.pos);
        if (goal.key !== goalKey) {
          goalKey = goal.key;
          goalT = 0;
          goalBest = d;
        }
        goalT += DT;
        if (d < goalBest - 30) {
          goalBest = d;
          goalT = 0;
        }
        if (goal.kind === "secret") wallTime += DT;
        if (d > goal.reach) walkTo(input, p.pos, goal.pos);
        if (goal.aim) {
          input.aim = { ...goal.aim };
          input.shoot = d <= goal.reach + 40;
        }
        if (goal.interact && d <= goal.reach && roomTime % 0.4 < DT) {
          input.interact = true;
          if (goal.kind === "buy") boughtHere = true;
          if (goal.kind === "altar") skip.add(goal.key);
        }
        // the way on can't be given up: the bot only walks straight lines, so it gets carried past whatever blocks it
        if ((goal.kind === "stairs" || goal.kind === "hatch") && goalT > 3) {
          rep.stuck += 1;
          p.pos = w.collideWorld({ ...goal.pos }, 20);
          goalT = 0;
        } else if (goalT > 3 || (goal.kind === "pickup" && d < 40 && goalT > 1.5)) {
          // no closer for a while: give this one up (or, for a pickup lying at the feet, it is not wanted)
          skip.add(goal.key);
          goalT = 0;
        }
      } else {
        // the nearest room not yet seen, then the boss (or a secret floor's guardian)
        const last = (r: RoomNode) => r.type === "boss" || r.type === "final" || r.type === "guardian";
        const step = nextStep(floor, (r) => !r.visited && !last(r)) ?? nextStep(floor, last);
        if (step) {
          const c = w.doorCenter(step.side);
          const out = { N: vec(0, -1), S: vec(0, 1), W: vec(-1, 0), E: vec(1, 0) }[step.side];
          // line up with the doorway, then walk out through it
          const lane = step.side === "N" || step.side === "S" ? vec(c.x, p.pos.y) : vec(p.pos.x, c.y);
          walkTo(input, p.pos, dist(lane, p.pos) < 30 ? add(c, scale(out, 200)) : lane);
          progressT += DT;
          if (progressT > 4) {
            if (dist(progressAt, p.pos) < 40) {
              rep.stuck += 1;
              floor.travel(step.side, step.to);
            }
            progressT = 0;
            progressAt = { ...p.pos };
          }
        } else if (!(node.type === "boss" || node.type === "final" || node.type === "guardian")) {
          rep.problems.push(`no way on from room ${node.id} on floor ${run.depth}`);
          break;
        }
      }
    }

    const halves = p.halves;
    const t0 = now();
    const events = run.update(DT, input);
    const ms = now() - t0;
    steps += 1;
    totalMs += ms;
    rep.maxStepMs = Math.max(rep.maxStepMs, ms);
    rep.time += DT;
    if (p.halves < halves) rep.halvesLost += halves - p.halves;
    rep.maxBullets = Math.max(rep.maxBullets, run.world.bullets.length);
    for (const e of events) {
      if (e.type === "enterRoom") rep.rooms += 1;
      if (e.type === "legend") rep.legends += 1;
      if (e.type === "secretOpen") rep.secrets += 1;
      if (e.type === "hatch") rep.secretFloors.push(e.secret);
      if (e.type === "buy") rep.bought += 1;
      if (e.type === "bossDeath") {
        rep.bosses.push({ kind: e.boss, seconds: Math.round(bossT) });
        bossT = 0;
      }
    }
    for (const u of run.world.units) {
      if (!Number.isFinite(u.pos.x) || !Number.isFinite(u.pos.y)) {
        rep.problems.push(`${u.kind} at a non-number position on floor ${run.depth}`);
        u.alive = false;
      }
    }
    if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y)) {
      rep.problems.push(`the necromancer at a non-number position on floor ${run.depth}`);
      break;
    }
  }
  rep.victory = run.victory;
  rep.dead = run.over && !run.victory;
  rep.depth = run.depth;
  rep.kills = run.stats.kills;
  rep.raised = run.stats.raised;
  rep.avgStepMs = steps ? totalMs / steps : 0;
  return rep;
}
