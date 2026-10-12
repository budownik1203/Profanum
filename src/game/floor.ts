/**
 * One floor of a run: rooms on a grid, connected by doors.
 * Rooms are built lazily the first time the necromancer walks in and keep their state
 * (blood, corpses, cleared or not) after he leaves. The player and his minions walk with him.
 */
import { CONFIG } from "./config.js";
import { makeRng, type Vec, vec } from "./math.js";
import { COMBAT_LAYOUTS, type RoomType, applyBoss, applyLayout, applyStart, applyTreasure } from "./rooms.js";
import { type GameEvent, type InputState, type Player, type Side, World } from "./world.js";

export interface RoomNode {
  id: number;
  gx: number;
  gy: number;
  type: RoomType;
  /** Steps from the start room. */
  depth: number;
  doors: Partial<Record<Side, number>>;
  /** Layout name for combat rooms. */
  layout?: string;
  world: World | null;
  visited: boolean;
}

const DIRS: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
export const OPPOSITE: Record<Side, Side> = { N: "S", S: "N", W: "E", E: "W" };
const SIDES: Side[] = ["N", "E", "S", "W"];

export class Floor {
  rooms: RoomNode[] = [];
  current = 0;
  player: Player;
  cleared = false;
  readonly seed: number;
  private rng: () => number;

  constructor(seed = Math.floor(Math.random() * 1e9), roomCount = 8) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.generate(roomCount);
    const start = this.rooms[0];
    start.world = this.build(start);
    start.visited = true;
    this.player = start.world.player;
  }

  get world(): World {
    const w = this.rooms[this.current].world;
    if (!w) throw new Error("current room was never built");
    return w;
  }

  get node(): RoomNode {
    return this.rooms[this.current];
  }

  /** Rooms the minimap may show: visited ones and their direct neighbours. */
  known(): RoomNode[] {
    const ids = new Set<number>();
    for (const r of this.rooms) {
      if (!r.visited) continue;
      ids.add(r.id);
      for (const to of Object.values(r.doors)) if (to !== undefined) ids.add(to);
    }
    return this.rooms.filter((r) => ids.has(r.id));
  }

  // ---------------------------------------------------------------- generation
  private generate(count: number): void {
    const at = new Map<string, RoomNode>();
    const key = (x: number, y: number) => `${x},${y}`;
    const add = (gx: number, gy: number): RoomNode => {
      const r: RoomNode = { id: this.rooms.length, gx, gy, type: "combat", depth: 0, doors: {}, world: null, visited: false };
      this.rooms.push(r);
      at.set(key(gx, gy), r);
      return r;
    };
    const link = (a: RoomNode, b: RoomNode, side: Side) => {
      a.doors[side] = b.id;
      b.doors[OPPOSITE[side]] = a.id;
    };

    add(0, 0);
    let guard = 0;
    while (this.rooms.length < count && guard++ < 1000) {
      const from = this.rooms[Math.floor(this.rng() * this.rooms.length)];
      const side = SIDES[Math.floor(this.rng() * 4)];
      const [dx, dy] = DIRS[side];
      const gx = from.gx + dx;
      const gy = from.gy + dy;
      if (Math.abs(gx) > 3 || Math.abs(gy) > 3 || at.has(key(gx, gy))) continue;
      link(from, add(gx, gy), side);
    }
    // one extra loop now and then, so the floor is not a pure tree
    if (this.rng() < 0.6) {
      for (const r of this.rooms) {
        const side = SIDES.find((s) => r.doors[s] === undefined && at.has(key(r.gx + DIRS[s][0], r.gy + DIRS[s][1])));
        if (side && this.rng() < 0.3) {
          link(r, at.get(key(r.gx + DIRS[side][0], r.gy + DIRS[side][1]))!, side);
          break;
        }
      }
    }

    // depth by breadth-first search from the start
    const depth = new Map<number, number>([[0, 0]]);
    const queue = [0];
    while (queue.length) {
      const id = queue.shift()!;
      for (const to of Object.values(this.rooms[id].doors)) {
        if (to === undefined || depth.has(to)) continue;
        depth.set(to, depth.get(id)! + 1);
        queue.push(to);
      }
    }
    for (const r of this.rooms) r.depth = depth.get(r.id) ?? 0;

    // start, boss (deepest), treasure (a dead end if possible), the rest are combat rooms
    this.rooms[0].type = "start";
    const others = this.rooms.slice(1);
    const maxDepth = Math.max(...others.map((r) => r.depth));
    const deepest = others.filter((r) => r.depth === maxDepth);
    const boss = deepest[Math.floor(this.rng() * deepest.length)];
    boss.type = "boss";
    const rest = others.filter((r) => r !== boss);
    const deadEnds = rest.filter((r) => Object.keys(r.doors).length === 1);
    const pool = deadEnds.length ? deadEnds : rest;
    pool[Math.floor(this.rng() * pool.length)].type = "treasure";
    for (const r of this.rooms) {
      if (r.type === "combat") r.layout = COMBAT_LAYOUTS[Math.floor(this.rng() * COMBAT_LAYOUTS.length)].name;
    }
  }

  /** Build the room's World the first time it is entered. */
  private build(node: RoomNode): World {
    const w = new World(makeRng(this.seed + node.id * 7919));
    if (node.type === "start") applyStart(w);
    else if (node.type === "treasure") applyTreasure(w);
    else if (node.type === "boss") applyBoss(w);
    else {
      const layout = COMBAT_LAYOUTS.find((l) => l.name === node.layout) ?? COMBAT_LAYOUTS[0];
      applyLayout(w, layout, Math.min(layout.guards.length, 2 + node.depth));
    }
    for (const side of SIDES) {
      const to = node.doors[side];
      if (to !== undefined) w.addDoor(side, to);
    }
    keepDoorwaysClear(w);
    if (this.rooms[0].world) w.player = this.player;
    return w;
  }

  // ---------------------------------------------------------------- play
  update(dt: number, input: InputState): GameEvent[] {
    const w = this.world;
    w.update(dt, input);
    const events = [...w.events];
    const exit = events.find((e) => e.type === "exit");
    if (exit && exit.type === "exit") events.push(...this.travel(exit.door.side, exit.door.to));
    if (!this.cleared && this.node.type === "boss" && w.cleared) {
      this.cleared = true;
      events.push({ type: "floorCleared" });
    }
    return events;
  }

  /** Walk through a door: the minions follow, the new room is built if needed. */
  private travel(side: Side, to: number): GameEvent[] {
    const from = this.world;
    const node = this.rooms[to];
    if (!node.world) node.world = this.build(node);
    const w = node.world;
    const arriveSide = OPPOSITE[side];
    w.player = this.player;
    const at = w.placeAtDoor(arriveSide);

    const minions = from.units.filter((u) => u.team === "minion" && u.alive);
    from.units = from.units.filter((u) => u.team !== "minion");
    from.order = null;
    from.bullets = [];
    minions.forEach((m, i) => {
      m.pos = spreadAround(at, i, arriveSide);
      m.push = vec();
      m.state = m.kind === "halberdier" ? "follow" : "reposition";
      w.units.push(m);
    });
    w.order = null;
    w.events = [];
    this.current = to;
    node.visited = true;
    return [{ type: "enterRoom", room: to, side: arriveSide }];
  }
}

/** Minions step into the room just behind the necromancer. */
function spreadAround(at: Vec, i: number, side: Side): Vec {
  const along = (i - 1) * 50;
  const back = 50;
  if (side === "N") return vec(at.x + along, at.y - back * 0.4 + 30);
  if (side === "S") return vec(at.x + along, at.y + back * 0.4 - 30);
  if (side === "W") return vec(at.x - back * 0.4 + 30, at.y + along);
  return vec(at.x + back * 0.4 - 30, at.y + along);
}

/** Keep pews out of doorways and guards out of the arrival zone, whatever the layout says. */
function keepDoorwaysClear(w: World): void {
  const zones = w.doors.map((d) => w.doorCenter(d.side));
  const nearDoor = (p: Vec, r: number) => zones.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < r);
  w.covers = w.covers.filter((c) => !nearDoor({ x: c.x + c.w / 2, y: c.y + c.h / 2 }, 260));
  for (const u of w.units) {
    if (u.team !== "enemy") continue;
    for (const z of zones) {
      const dx = u.pos.x - z.x;
      const dy = u.pos.y - z.y;
      const d = Math.hypot(dx, dy);
      const min = 360;
      if (d < min) {
        // push the guard deeper into the room, away from the doorway
        const cx = CONFIG.room.width / 2;
        const cy = CONFIG.room.height / 2;
        const tx = cx - z.x;
        const ty = cy - z.y;
        const tl = Math.hypot(tx, ty) || 1;
        u.pos = vec(z.x + (tx / tl) * min + (d > 0 ? (dx / d) * 40 : 0), z.y + (ty / tl) * min + (d > 0 ? (dy / d) * 40 : 0));
        if (u.route.length) u.route = u.route.map((p) => (nearDoor(p, min) ? vec(p.x + (tx / tl) * 120, p.y + (ty / tl) * 120) : p));
      }
    }
  }
}
