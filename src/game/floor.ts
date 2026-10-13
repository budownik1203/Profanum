/**
 * One floor of a run: rooms on a grid, connected by doors (one of them hidden: the way down to the
 * catacombs). Rooms are built the first time the necromancer walks in and keep their state
 * (blood, corpses, cleared or not) after he leaves. The player and his minions walk with him.
 */
import { CONFIG } from "./config.js";
import { makeRng, type Vec, vec } from "./math.js";
import { FLOORS, SECRET_FLOORS, floorDef, type SecretFloorDef, type SecretId } from "./data/floors.js";
import type { UnitKind } from "./data/units.js";
import { WEAPONS } from "./data/weapons.js";
import {
  TEMPLATES, type RoomType, applyAltar, applyGuardian, applyLanding, applySecret, applyShop, applyStart, applyTemplate, applyTreasure, applyVault, roomSize,
  templateByName,
} from "./rooms.js";
import { setupBossArena } from "./bosses.js";
import type { GameEvent, InputState, Player, Side } from "./types.js";
import { World } from "./world.js";
import { pick } from "./shared.js";

export interface RoomNode {
  id: number;
  gx: number;
  gy: number;
  type: RoomType;
  /** Steps from the start room. */
  depth: number;
  doors: Partial<Record<Side, number>>;
  /** Doors hidden behind a cracked wall (the catacombs). */
  secretDoors: Partial<Record<Side, true>>;
  /** Template name for combat rooms. */
  layout?: string;
  mirror: boolean;
  world: World | null;
  visited: boolean;
  /** A bell or a curse warned this room: it starts with the alarm. */
  alarmed: boolean;
  /** The catacombs: not on the map until found. */
  hidden: boolean;
}

export interface FloorOptions {
  /** Floor number: 1 cemetery ... 5 cathedral, 6 the sanctum of the Holy Flame. */
  depth: number;
  /** The necromancer coming down from the floor above (a fresh one is made otherwise). */
  player?: Player;
  pool?: string[];
  grace?: boolean;
  roomCount?: number;
  /** Who waits in the boss room (otherwise drawn from the floor's three). */
  boss?: UnitKind;
  /** This is a secret floor under the catacombs (see SECRET_FLOORS). */
  secret?: SecretId;
  /** The catacombs of this floor hide the trapdoor down to this secret floor. */
  hatch?: SecretId | null;
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
  readonly depth: number;
  /** The saint's finger showed the whole floor. */
  revealed = false;
  /** The boss of this floor, drawn from its pool of three. */
  readonly boss: UnitKind;
  /** A secret floor's definition (null on the ordinary floors). */
  readonly secret: SecretFloorDef | null;
  private rng: () => number;
  private opts: FloorOptions;

  constructor(seed = Math.floor(Math.random() * 1e9), options: Partial<FloorOptions> = {}) {
    this.seed = seed;
    this.opts = { depth: 1, ...options };
    this.depth = this.opts.depth;
    this.rng = makeRng(seed);
    // a separate draw, so the choice of boss doesn't change the layout of the floor
    const pool = this.depth >= 6 ? ["holyflame" as UnitKind] : floorDef(this.depth).bosses;
    this.boss = this.opts.boss ?? pool[Math.floor(makeRng(seed * 31 + 7)() * pool.length)];
    this.secret = this.opts.secret ? SECRET_FLOORS[this.opts.secret] : null;
    if (this.secret) this.generateSecret();
    else if (this.depth >= 6) this.generateSanctum();
    else this.generate(this.opts.roomCount ?? floorDef(this.depth).rooms);
    const start = this.rooms[0];
    start.world = this.build(start);
    start.visited = true;
    if (this.opts.player) {
      start.world.player = this.opts.player;
      this.opts.player.pos = vec(start.world.room.w / 2, start.world.room.h * 0.7);
    }
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

  /** Rooms the minimap may show: visited ones and their direct neighbours (all, after the finger). */
  known(): RoomNode[] {
    if (this.revealed) return this.rooms;
    const ids = new Set<number>();
    for (const r of this.rooms) {
      if (!r.visited) continue;
      ids.add(r.id);
      for (const [side, to] of Object.entries(r.doors) as [Side, number][]) {
        if (r.secretDoors[side] && !this.secretOpen(r, side)) continue;
        ids.add(to);
      }
    }
    return this.rooms.filter((r) => ids.has(r.id));
  }

  private secretOpen(r: RoomNode, side: Side): boolean {
    return !!r.world?.interactables.some((i) => i.kind === "secret" && i.side === side && i.used);
  }

  // ---------------------------------------------------------------- generation
  private generate(count: number): void {
    const at = new Map<string, RoomNode>();
    const key = (x: number, y: number) => `${x},${y}`;
    const add = (gx: number, gy: number): RoomNode => {
      const r: RoomNode = { id: this.rooms.length, gx, gy, type: "combat", depth: 0, doors: {}, secretDoors: {}, world: null, visited: false, mirror: this.rng() < 0.5, alarmed: false, hidden: false };
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
    while (this.rooms.length < count && guard++ < 2000) {
      const from = this.rooms[Math.floor(this.rng() * this.rooms.length)];
      // grow mostly from rooms with few doors: longer corridors, more dead ends
      if (Object.keys(from.doors).length >= 3 && this.rng() < 0.7) continue;
      const side = SIDES[Math.floor(this.rng() * 4)];
      const [dx, dy] = DIRS[side];
      const gx = from.gx + dx;
      const gy = from.gy + dy;
      if (Math.abs(gx) > 4 || Math.abs(gy) > 4 || at.has(key(gx, gy))) continue;
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
    this.computeDepths();

    // start, boss (deepest), then the special rooms on dead ends where possible
    this.rooms[0].type = "start";
    const others = this.rooms.slice(1);
    const maxDepth = Math.max(...others.map((r) => r.depth));
    const deepest = others.filter((r) => r.depth === maxDepth);
    pick(this.rng, deepest).type = "boss";
    const free = () => this.rooms.filter((r) => r.type === "combat");
    const deadEnds = () => free().filter((r) => Object.keys(r.doors).length === 1);
    const place = (type: RoomType, minDepth: number, preferDeadEnd: boolean) => {
      const de = deadEnds().filter((r) => r.depth >= minDepth);
      const pool = preferDeadEnd && de.length ? de : free().filter((r) => r.depth >= minDepth);
      const list = pool.length ? pool : free();
      if (list.length) pick(this.rng, list).type = type;
    };
    place("treasure", 1, true);
    place("shop", 2, true);
    place("altar", 1, true);
    if (this.depth >= 3) place("treasure", 2, true);
    place("miniboss", 2, false);
    for (const r of this.rooms) {
      if (r.type === "combat" || r.type === "miniboss") r.layout = pick(this.rng, TEMPLATES).name;
    }
    this.addSecretRoom(at, key);
  }

  /** The catacombs: a hidden room next to an ordinary one, behind a cracked wall. */
  private addSecretRoom(at: Map<string, RoomNode>, key: (x: number, y: number) => string): void {
    const hosts = this.rooms.filter((r) => r.type === "combat" || r.type === "treasure" || r.type === "altar");
    const options: [RoomNode, Side][] = [];
    for (const r of hosts) {
      for (const s of SIDES) {
        const [dx, dy] = DIRS[s];
        if (r.doors[s] === undefined && !at.has(key(r.gx + dx, r.gy + dy))) options.push([r, s]);
      }
    }
    if (!options.length) return;
    const [host, side] = pick(this.rng, options);
    const [dx, dy] = DIRS[side];
    const s: RoomNode = { id: this.rooms.length, gx: host.gx + dx, gy: host.gy + dy, type: "secret", depth: host.depth + 1, doors: {}, secretDoors: {}, world: null, visited: false, mirror: false, alarmed: false, hidden: true };
    this.rooms.push(s);
    at.set(key(s.gx, s.gy), s);
    host.doors[side] = s.id;
    host.secretDoors[side] = true;
    s.doors[OPPOSITE[side]] = host.id;
  }

  /**
   * A secret floor: a short descent of rooms to its guardian, with a vault off to one side.
   *   start (0,0) - fight (0,-1) - fight (0,-2) - guardian (0,-3); a fight to the side leads to the vault.
   */
  private generateSecret(): void {
    const side = this.rng() < 0.5 ? 1 : -1;
    const mk = (id: number, gx: number, gy: number, type: RoomType): RoomNode => ({
      id, gx, gy, type, depth: 0, doors: {}, secretDoors: {}, world: null, visited: false, mirror: this.rng() < 0.5, alarmed: false, hidden: false,
    });
    this.rooms.push(mk(0, 0, 0, "start"), mk(1, 0, -1, "combat"), mk(2, side, -1, "combat"), mk(3, side, -2, "treasure"), mk(4, 0, -2, "combat"), mk(5, 0, -3, "guardian"));
    const link = (a: number, b: number, s: Side) => {
      this.rooms[a].doors[s] = b;
      this.rooms[b].doors[OPPOSITE[s]] = a;
    };
    link(0, 1, "N");
    link(1, 2, side > 0 ? "E" : "W");
    link(2, 3, "N");
    link(1, 4, "N");
    link(4, 5, "N");
    this.computeDepths();
    for (const r of this.rooms) if (r.type === "combat" || r.type === "guardian") r.layout = pick(this.rng, TEMPLATES).name;
  }

  /** The last floor: an antechamber and the sanctum of the Holy Flame. */
  private generateSanctum(): void {
    const mk = (id: number, gy: number, type: RoomType): RoomNode => ({ id, gx: 0, gy, type, depth: id, doors: {}, secretDoors: {}, world: null, visited: false, mirror: false, alarmed: false, hidden: false });
    const a = mk(0, 0, "start");
    const b = mk(1, -1, "final");
    a.doors.N = 1;
    b.doors.S = 0;
    this.rooms.push(a, b);
  }

  private computeDepths(): void {
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
  }

  /** Build the room's World the first time it is entered. */
  private build(node: RoomNode): World {
    const rng = makeRng(this.seed + node.id * 7919);
    const template = node.layout ? templateByName(node.layout) : undefined;
    const w = new World(rng, roomSize(node.type, template));
    w.roomType = node.type;
    w.ctx = {
      depth: this.depth,
      grace: this.opts.grace ?? false,
      pool: this.opts.pool,
      alarmNeighbours: () => this.alarmNeighbours(node.id),
      secretEcho: this.secret?.echo,
    };
    if (this.rooms[0].world || this.opts.player) w.player = this.player ?? this.opts.player!;
    const sec = this.secret;
    const def = sec ?? floorDef(this.depth);
    switch (node.type) {
      case "start":
        if (sec) {
          applyLanding(w, sec);
          break;
        }
        applyStart(w, Math.min(this.depth, FLOORS.length));
        if (this.depth >= 6) w.theme = "sanktuarium";
        break;
      case "treasure":
        if (sec) applyVault(w, sec);
        else applyTreasure(w, this.depth, rng);
        break;
      case "guardian":
        applyGuardian(w, template!, sec ?? SECRET_FLOORS.ossuarium, rng);
        break;
      case "shop":
        applyShop(w, this.depth);
        break;
      case "altar":
        applyAltar(w, this.depth);
        break;
      case "secret":
        applySecret(w, this.depth, (this.depth - 1) * 2 + Math.floor(rng() * 2), this.opts.hatch ?? null);
        break;
      case "boss":
      case "final":
        setupBossArena(w, this.boss, this.depth, rng);
        break;
      default: {
        const t = template!;
        const guards = Math.min(t.slots.length, 3 + def.extra + Math.floor(node.depth / 2));
        applyTemplate(w, t, sec ?? this.depth, guards, rng, { elite: node.type === "miniboss", mirror: node.mirror });
      }
    }
    for (const side of SIDES) {
      const to = node.doors[side];
      if (to === undefined) continue;
      const secret = !!node.secretDoors[side];
      w.addDoor(side, to, secret);
      if (secret) {
        const c = w.doorCenter(side);
        w.addInteractable("secret", c, { hidden: true, hp: 3, side, radius: 90 });
      }
    }
    keepDoorwaysClear(w);
    if (node.alarmed || this.cursedAlarm()) alertAll(w);
    return w;
  }

  /** Saint Gervase's barrel: the priests sense its bearer, every room starts alarmed. */
  private cursedAlarm(): boolean {
    const p = this.player ?? this.opts.player;
    return !!p && p.weapons.some((s) => WEAPONS[s.id].curse === "alarm");
  }

  /** A bell (or a cursed gun) warns the neighbouring rooms: they wait ready for the fight. */
  alarmNeighbours(id: number): void {
    const node = this.rooms[id];
    for (const [side, to] of Object.entries(node.doors) as [Side, number][]) {
      if (node.secretDoors[side]) continue;
      const n = this.rooms[to];
      if (n.type === "start" || n.type === "boss" || n.type === "final") continue;
      n.alarmed = true;
      if (n.world && !n.world.cleared) alertAll(n.world);
    }
  }

  // ---------------------------------------------------------------- play
  update(dt: number, input: InputState): GameEvent[] {
    const w = this.world;
    w.update(dt, input);
    const events = [...w.events];
    const exit = events.find((e) => e.type === "exit");
    if (exit && exit.type === "exit") events.push(...this.travel(exit.door.side, exit.door.to));
    if (events.some((e) => e.type === "relicUse" && e.relic === "finger")) {
      this.revealed = true;
      for (const r of this.rooms) r.hidden = false;
    }
    if (events.some((e) => e.type === "secretOpen")) {
      for (const r of this.rooms) if (r.type === "secret") r.hidden = false;
    }
    if (!this.cleared && (this.node.type === "boss" || this.node.type === "final" || this.node.type === "guardian") && w.cleared && w.hadEnemies) {
      this.cleared = true;
      events.push({ type: "floorCleared" });
    }
    return events;
  }

  /** Walk through a door: the minions follow, the new room is built if needed. */
  travel(side: Side, to: number): GameEvent[] {
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
      m.state = m.def.ai === "gunner" || m.def.ai === "caster" || m.def.ai === "bomber" || m.def.ai === "censer" ? "reposition" : "follow";
      w.units.push(m);
    });
    // lights carried by minions move with them
    for (const l of from.lights.filter((x) => x.owner !== undefined && minions.some((m) => m.id === x.owner))) {
      from.lights = from.lights.filter((x) => x !== l);
      w.lights.push(l);
    }
    w.order = null;
    w.events = [];
    if (node.alarmed && !w.alarm && !w.cleared) alertAll(w);
    this.current = to;
    node.visited = true;
    node.hidden = false;
    return [{ type: "enterRoom", room: to, side: arriveSide }];
  }
}

/** Everyone in the room is already up and ready (doors shut the moment you walk in). */
function alertAll(w: World): void {
  w.alarm = true;
  for (const u of w.units) {
    if (u.team === "minion") continue;
    if (u.state === "idle" || u.state === "patrol") {
      const ranged = u.def.ai === "gunner" || u.def.ai === "caster" || u.def.ai === "bomber" || u.def.ai === "censer";
      u.state = ranged ? "reposition" : "approach";
      u.timer = ranged ? 0.4 + w.rng() * 0.8 : 0;
    }
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

/**
 * Keep pews out of doorways, guards out of the arrival zone and light off the threshold,
 * whatever the template says: every door opens into a pocket of shadow to start the fight from.
 */
export function keepDoorwaysClear(w: World): void {
  const zones = w.doors.map((d) => w.doorCenter(d.side));
  const nearDoor = (p: Vec, r: number) => zones.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < r);
  w.covers = w.covers.filter((c) => !nearDoor({ x: c.x + c.w / 2, y: c.y + c.h / 2 }, 260));
  w.chests = w.chests.filter((c) => !nearDoor(c.pos, 200));
  const arrivals = w.doors.map((d) => w.arrivalPoint(d.side));
  const shadow = CONFIG.darkness.doorShadow;
  for (const l of w.lights) {
    if (l.owner !== undefined) continue; // lanterns walk where they like
    for (const a of arrivals) {
      const d = Math.hypot(l.pos.x - a.x, l.pos.y - a.y);
      if (d < l.radius + shadow) l.radius = l.baseRadius = Math.max(0, d - shadow);
    }
  }
  // a light squeezed this small is not worth keeping
  w.lights = w.lights.filter((l) => l.owner !== undefined || l.radius >= 90);
  const cx = w.room.w / 2;
  const cy = w.room.h / 2;
  for (const u of w.units) {
    if (u.team === "minion" || u.def.boss) continue;
    for (const z of zones) {
      const dx = u.pos.x - z.x;
      const dy = u.pos.y - z.y;
      const d = Math.hypot(dx, dy);
      // lantern-bearers stay farther off, so their light doesn't spill onto the threshold
      const min = u.lantern ? 420 + (u.def.lightRadius ?? 150) - 150 : 360;
      if (d < min) {
        // push the guard deeper into the room, away from the doorway
        const tx = cx - z.x;
        const ty = cy - z.y;
        const tl = Math.hypot(tx, ty) || 1;
        u.pos = vec(z.x + (tx / tl) * min + (d > 0 ? (dx / d) * 40 : 0), z.y + (ty / tl) * min + (d > 0 ? (dy / d) * 40 : 0));
        if (u.route.length) u.route = u.route.map((p) => (nearDoor(p, min) ? vec(p.x + (tx / tl) * 120, p.y + (ty / tl) * 120) : p));
      }
    }
  }
  // lanterns go where their (possibly moved) bearers stand
  for (const l of w.lights) {
    const u = l.owner !== undefined ? w.units.find((x) => x.id === l.owner) : undefined;
    if (u) l.pos = { x: u.pos.x, y: u.pos.y - 10 };
  }
}
