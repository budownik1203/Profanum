/**
 * The whole combat simulation for one room. No rendering here: the renderer reads the state
 * and the `events` list each frame, and tests can run the world headless.
 *
 * Enemies and raised minions are the same kind of unit (`Unit`) on opposite teams:
 * a raised halberdier still charges and a raised arquebusier still shoots, just for the necromancer.
 */
import { CONFIG } from "./config.js";
import {
  type Rect,
  type Vec,
  add,
  angleOf,
  circleHitsRect,
  clamp,
  dist,
  distToSegment,
  fromAngle,
  len,
  norm,
  pushOutOfRect,
  scale,
  segmentHitsRect,
  sub,
  vec,
} from "./math.js";

// ------------------------------------------------------------------ types
export interface InputState {
  /** Movement intent, each axis in -1..1. */
  move: Vec;
  /** Aim point in world coordinates. */
  aim: Vec;
  shoot: boolean;
  /** Edge-triggered actions: true only on the frame the key/button went down. */
  dodge: boolean;
  reload: boolean;
  flip: boolean;
  /** E: raise the nearest fresh corpse. */
  raise: boolean;
  /** Q: send every minion to the aim point. */
  command: boolean;
}

export const idleInput = (aim: Vec = vec()): InputState => ({
  move: vec(),
  aim,
  shoot: false,
  dodge: false,
  reload: false,
  flip: false,
  raise: false,
  command: false,
});

export interface Weapon {
  name: string;
  loaded: number;
  capacity: number;
  /** Seconds left of the current reload, 0 when not reloading. */
  reloadLeft: number;
}

export interface Player {
  pos: Vec;
  vel: Vec;
  /** Extra velocity from recoil and hits, decays quickly. */
  push: Vec;
  facing: number;
  halves: number;
  invuln: number;
  dodgeLeft: number;
  dodgeCooldown: number;
  dodgeDir: Vec;
  weapon: Weapon;
  souls: number;
  alive: boolean;
}

export type UnitKind = "halberdier" | "arquebusier";
/** Kept for readability at call sites that only deal with hostiles. */
export type EnemyKind = UnitKind;
export type Team = "enemy" | "minion";
export type UnitState =
  | "approach" | "windup" | "charge" | "recover" | "reposition" | "aim" | "reload" | "follow"
  /** Before the alarm: standing still (sleeping, praying, on watch) or walking a patrol route. */
  | "idle" | "patrol";

export interface Unit {
  id: number;
  kind: UnitKind;
  team: Team;
  pos: Vec;
  push: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  timer: number;
  /** Locked direction for a charge, or aim direction while aiming. */
  dir: Vec;
  /** Short white flash after being hit (seconds). */
  flash: number;
  /** Sideways strafing preference for gunners (+1 / -1). */
  strafe: number;
  /** Minions only: seconds until the body crumbles. */
  lifetime: number;
  /** How many times this body has already been raised. */
  raises: number;
  /** Patrol route walked before the alarm. */
  route: Vec[];
  routeIdx: number;
  /** Carries a lantern (a moving light source). */
  lantern: boolean;
  /** A tougher named guard (the floor's boss for now). */
  elite: boolean;
  /** Carries a taper and relights what the necromancer put out. */
  lamplighter: boolean;
  /** Lamplighter: id of the light he is walking to, and seconds of work left at it. */
  task?: number;
  taskTime: number;
  alive: boolean;
}
/** Kept for readability: an enemy is a Unit on the "enemy" team. */
export type Enemy = Unit;

export interface Corpse {
  id: number;
  kind: UnitKind;
  pos: Vec;
  /** Which way the body fell (for drawing). */
  dir: Vec;
  /** Seconds left while it can still be raised. */
  echo: number;
  raises: number;
  /** Corpses of fallen minions are drawn darker. */
  fromMinion: boolean;
}

export interface Soul {
  id: number;
  pos: Vec;
  life: number;
}

export type Faction = "player" | "enemy" | "minion";

export type LightKind = "candle" | "candelabra" | "torch" | "chandelier" | "window" | "lantern" | "flash";
/** Fixed lights the necromancer can shoot out (and a lamplighter can relight). */
export const PUTOUT_KINDS: readonly LightKind[] = ["candle", "candelabra", "torch", "chandelier"];

export type Side = "N" | "E" | "S" | "W";

/** A doorway in one of the four walls, leading to another room of the floor. */
export interface Door {
  side: Side;
  /** Id of the room on the other side. */
  to: number;
}

/** Bone altar in a treasure room: heals and gives souls, once. */
export interface Shrine {
  pos: Vec;
  used: boolean;
}

export interface Light {
  id: number;
  kind: LightKind;
  /** Centre of the pool of light on the floor (the stand of a candelabra, the spot under a chandelier). */
  pos: Vec;
  radius: number;
  /** Radius when whole; damage shrinks `radius`, relighting restores it. */
  baseRadius: number;
  on: boolean;
  hp: number;
  maxHp: number;
  /** Holy light (stained glass) burns the undead necromancer. Ordinary light only reveals him. */
  holy: boolean;
  /** Torches and windows hang on a wall. */
  wall?: Side;
  /** Chandelier: seconds until it hits the floor; fallen once it has. */
  falling?: number;
  fallen?: boolean;
  /** Window: the glass is shot out. */
  broken?: boolean;
  /** Lanterns follow the unit that carries them. */
  owner?: number;
  /** Muzzle flashes last a moment. */
  life?: number;
}

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  from: Faction;
  life: number;
  /** Fired from the dark before the alarm: double damage. */
  ambush?: boolean;
}

export interface Cover extends Rect {
  id: number;
  flipped: boolean;
  hp: number;
  broken: boolean;
}

export type GameEvent =
  | { type: "shot"; pos: Vec; dir: Vec; from: Faction }
  | { type: "enemyHit"; pos: Vec; dir: Vec; enemy: number; ambush: boolean }
  | { type: "enemyDeath"; pos: Vec; dir: Vec; kind: UnitKind; ambush: boolean }
  | { type: "minionHit"; pos: Vec; dir: Vec; unit: number }
  | { type: "minionDeath"; pos: Vec; dir: Vec; kind: UnitKind; crumbled: boolean }
  | { type: "playerHit"; pos: Vec; dir: Vec }
  | { type: "playerDeath"; pos: Vec }
  | { type: "dodge"; pos: Vec; dir: Vec }
  | { type: "reloadStart"; pos: Vec }
  | { type: "reloadDone"; pos: Vec }
  | { type: "coverFlip"; cover: number; pos: Vec }
  | { type: "coverHit"; cover: number; pos: Vec }
  | { type: "coverBreak"; cover: number; pos: Vec }
  | { type: "bulletWall"; pos: Vec }
  | { type: "telegraph"; enemy: number }
  | { type: "soulPickup"; pos: Vec; souls: number }
  | { type: "raise"; pos: Vec; kind: UnitKind; unit: number }
  | { type: "raiseFail"; pos: Vec; reason: "noSouls" | "limit" }
  | { type: "command"; pos: Vec }
  | { type: "alarm"; pos: Vec; by: number }
  /** A shot knocked some candles off but the light still burns. */
  | { type: "lightHit"; pos: Vec; light: number; kind: LightKind }
  | { type: "lightOut"; pos: Vec; light: number; kind: LightKind }
  | { type: "chandelierFall"; pos: Vec; light: number }
  | { type: "chandelierCrash"; pos: Vec; light: number }
  | { type: "windowBreak"; pos: Vec; light: number }
  | { type: "relight"; pos: Vec; light: number; by: number }
  | { type: "burn"; pos: Vec }
  | { type: "exit"; door: Door }
  | { type: "shrine"; pos: Vec; halves: number; souls: number }
  | { type: "doorsShut" }
  | { type: "enterRoom"; room: number; side: Side }
  | { type: "floorCleared" }
  | { type: "roomCleared" };

/** Ids are unique across all rooms of a run (minions walk from room to room). */
let NEXT_ID = 1;
export const nextId = (): number => NEXT_ID++;

const statsOf = (kind: UnitKind) => (kind === "halberdier" ? CONFIG.halberdier : CONFIG.arquebusier);

// ------------------------------------------------------------------ world
export class World {
  readonly room: Rect;
  player: Player;
  /** Every unit in the room: hostile guards and the necromancer's minions. */
  units: Unit[] = [];
  corpses: Corpse[] = [];
  souls: Soul[] = [];
  bullets: Bullet[] = [];
  covers: Cover[] = [];
  events: GameEvent[] = [];
  /** Active Q order: minions go to this point and fight there. */
  order: { pos: Vec; time: number } | null = null;
  lights: Light[] = [];
  /** A dark room: light and darkness change the rules (see CONFIG.darkness). */
  dark = false;
  /** Before the alarm the guards don't know the necromancer is here. */
  alarm = true;
  /** Seconds the player has stood in light (burns after CONFIG.darkness.burnDelay). */
  exposure = 0;
  private burnTick = 0;
  time = 0;
  cleared = false;
  doors: Door[] = [];
  shrine: Shrine | null = null;
  /** True once any guard was placed in the room (an empty room is not "cleared" in combat). */
  hadEnemies = false;
  private exited = false;
  private wasOpen = true;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    const { width, height } = CONFIG.room;
    this.room = { x: 0, y: 0, w: width, h: height };
    this.player = this.makePlayer(vec(width / 2, height * 0.75));
  }

  /** Hostile guards still standing. */
  get enemies(): Unit[] {
    return this.units.filter((u) => u.team === "enemy");
  }

  get minions(): Unit[] {
    return this.units.filter((u) => u.team === "minion");
  }

  private makePlayer(pos: Vec): Player {
    return {
      pos,
      vel: vec(),
      push: vec(),
      facing: -Math.PI / 2,
      halves: CONFIG.player.maxHalves,
      invuln: 0,
      dodgeLeft: 0,
      dodgeCooldown: 0,
      dodgeDir: vec(),
      weapon: { name: "Pistolet skałkowy", loaded: CONFIG.flintlock.capacity, capacity: CONFIG.flintlock.capacity, reloadLeft: 0 },
      souls: 0,
      alive: true,
    };
  }

  /** The default first room: pews to topple and a mixed squad of city guards. */
  static firstRoom(rng: () => number = Math.random): World {
    const w = new World(rng);
    const { width: W, height: H } = CONFIG.room;
    for (const [x, y, cw, ch] of [
      [W * 0.25, H * 0.45, 150, 40],
      [W * 0.62, H * 0.45, 150, 40],
      [W * 0.42, H * 0.28, 150, 40],
      [W * 0.18, H * 0.7, 40, 130],
      [W * 0.8, H * 0.68, 40, 130],
    ] as const) {
      w.addCover(x, y, cw, ch);
    }
    w.dark = true;
    w.alarm = false;
    // candles: the altar, two corners, two by the side walls
    for (const [x, y] of [[W * 0.5, H * 0.13], [W * 0.1, H * 0.14], [W * 0.9, H * 0.14], [W * 0.07, H * 0.55], [W * 0.93, H * 0.55]] as const) {
      w.addLight("candle", vec(x, y));
    }
    w.spawn("halberdier", vec(W * 0.5, H * 0.2), "enemy", { state: "idle" }); // praying at the altar
    w.spawn("halberdier", vec(W * 0.3, H * 0.24), "enemy", { state: "idle" }); // dozing in the dark
    w.spawn("halberdier", vec(W * 0.3, H * 0.58), "enemy", {
      state: "patrol",
      lantern: true,
      route: [vec(W * 0.3, H * 0.58), vec(W * 0.7, H * 0.58), vec(W * 0.7, H * 0.36), vec(W * 0.3, H * 0.36)],
    });
    w.spawn("arquebusier", vec(W * 0.13, H * 0.24), "enemy", { state: "idle" });
    w.spawn("arquebusier", vec(W * 0.87, H * 0.24), "enemy", { state: "idle" });
    return w;
  }

  addCover(x: number, y: number, w: number, h: number): Cover {
    const c: Cover = { id: nextId(), x, y, w, h, flipped: false, hp: CONFIG.cover.hp, broken: false };
    this.covers.push(c);
    return c;
  }

  addLight(kind: LightKind, pos: Vec, opts: { owner?: number; wall?: Side } = {}): Light {
    const c = CONFIG.lights[kind];
    const l: Light = {
      id: nextId(),
      kind,
      pos: { ...pos },
      radius: c.radius,
      baseRadius: c.radius,
      on: true,
      hp: c.hp,
      maxHp: c.hp,
      holy: kind === "window",
      wall: opts.wall,
      owner: opts.owner,
      life: kind === "flash" ? CONFIG.darkness.flashTime : undefined,
    };
    this.lights.push(l);
    return l;
  }

  /** Where a bullet has to pass to hit this light: the flame, the chandelier's frame up on its chain. */
  static hitPoint(l: Light): Vec {
    return { x: l.pos.x, y: l.pos.y - CONFIG.lights[l.kind].lift };
  }

  /** Where a stained-glass window sits in its wall (its pool of light lies on the floor below). */
  windowPoint(l: Light): Vec {
    const half = CONFIG.room.wall / 2;
    const { w, h } = this.room;
    switch (l.wall ?? "N") {
      case "N": return vec(l.pos.x, half);
      case "S": return vec(l.pos.x, h - half);
      case "W": return vec(half, l.pos.y);
      default: return vec(w - half, l.pos.y);
    }
  }

  /** 1 inside the bright core of a light, 0.5 in its outer band, 0 in darkness. */
  lightAt(p: Vec, includeFlash = true): number {
    let v = 0;
    for (const l of this.lights) {
      if (!l.on || (!includeFlash && l.kind === "flash")) continue;
      const d = dist(p, l.pos);
      if (d < l.radius * 0.7) return 1;
      if (d < l.radius) v = 0.5;
    }
    return v;
  }

  /** Standing in holy light (an unbroken stained-glass window). */
  isHoly(p: Vec): boolean {
    return this.lights.some((l) => l.on && l.holy && dist(p, l.pos) < l.radius);
  }

  /** Standing inside any light's radius. */
  isLit(p: Vec, includeFlash = true): boolean {
    return this.lightAt(p, includeFlash) > 0;
  }

  /** Damage multiplier for the necromancer's side, from light and darkness. */
  private sideMul(pos: Vec, minion: boolean): number {
    if (!this.dark) return 1;
    const d = CONFIG.darkness;
    if (this.isLit(pos)) return d.lightDamageMul;
    return minion ? d.minionDarkDamageMul : 1;
  }

  spawn(
    kind: UnitKind,
    pos: Vec,
    team: Team = "enemy",
    opts: { state?: "idle" | "patrol"; route?: Vec[]; lantern?: boolean; lamplighter?: boolean } = {},
  ): Unit {
    const cfg = statsOf(kind);
    const u: Unit = {
      id: nextId(),
      kind,
      team,
      pos: { ...pos },
      push: vec(),
      radius: cfg.radius,
      hp: cfg.hp,
      maxHp: cfg.hp,
      state: kind === "halberdier" ? "approach" : "reposition",
      timer: kind === "halberdier" ? 0 : this.range(CONFIG.arquebusier.reposition),
      dir: vec(0, 1),
      flash: 0,
      strafe: this.rng() < 0.5 ? -1 : 1,
      lifetime: team === "minion" ? CONFIG.necro.minionLifetime : Infinity,
      raises: 0,
      route: opts.route ?? [],
      routeIdx: 0,
      // a lamplighter always carries a light of his own: you can see him coming
      lantern: (opts.lantern || opts.lamplighter) ?? false,
      elite: false,
      lamplighter: (opts.lamplighter && team === "enemy") ?? false,
      taskTime: 0,
      alive: true,
    };
    if (opts.state && team === "enemy") u.state = opts.state;
    if (team === "enemy") this.hadEnemies = true;
    this.units.push(u);
    if (u.lantern) this.addLight("lantern", u.pos, { owner: u.id });
    return u;
  }

  private range(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rng();
  }

  get solidCovers(): Cover[] {
    return this.covers.filter((c) => !c.broken);
  }

  /** The corpse E would raise right now, if any. */
  raisableCorpse(): Corpse | undefined {
    let best: Corpse | undefined;
    let bestD: number = CONFIG.necro.raiseRange;
    for (const c of this.corpses) {
      if (c.echo <= 0 || c.raises >= CONFIG.necro.maxRaises) continue;
      const d = dist(c.pos, this.player.pos);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: InputState): void {
    this.events = [];
    this.time += dt;
    if (this.order) {
      this.order.time -= dt;
      if (this.order.time <= 0) this.order = null;
    }
    if (this.player.alive) this.updatePlayer(dt, input);
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.updateBullets(dt);
    this.updateDead(dt);
    this.updateLights(dt);
    if (!this.alarm) this.detect();
    if (this.dark && this.player.alive) this.updateBurn(dt);
    this.units = this.units.filter((u) => u.alive);
    if (!this.cleared && this.enemies.length === 0) {
      this.cleared = true;
      if (this.hadEnemies) this.events.push({ type: "roomCleared" });
    }
    const open = this.doorsOpen;
    if (this.wasOpen && !open && this.doors.length > 0) this.events.push({ type: "doorsShut" });
    this.wasOpen = open;
  }

  // ---------------------------------------------------------------- doors
  /** Doors slam shut when the alarm sounds and open again once the room is cleared. */
  get doorsOpen(): boolean {
    return !(this.alarm && this.enemies.length > 0);
  }

  addDoor(side: Side, to: number): Door {
    const d: Door = { side, to };
    this.doors.push(d);
    return d;
  }

  /** Centre of a doorway on the wall line. */
  doorCenter(side: Side): Vec {
    const { w, h } = this.room;
    return side === "N" ? vec(w / 2, 0) : side === "S" ? vec(w / 2, h) : side === "W" ? vec(0, h / 2) : vec(w, h / 2);
  }

  /** Where the necromancer stands right after walking in through this doorway. */
  arrivalPoint(side: Side): Vec {
    const c = this.doorCenter(side);
    const inset = CONFIG.room.wall + CONFIG.player.radius + 46;
    return side === "N" ? vec(c.x, inset) : side === "S" ? vec(c.x, this.room.h - inset) : side === "W" ? vec(inset, c.y) : vec(this.room.w - inset, c.y);
  }

  /** Put the player just inside the given doorway (arriving from the neighbouring room). */
  placeAtDoor(side: Side): Vec {
    const pos = this.arrivalPoint(side);
    this.player.pos = pos;
    this.player.push = vec();
    this.exited = false;
    return pos;
  }

  /** The player's collision also lets him walk out through an open doorway. */
  private collidePlayer(pos: Vec, r: number): Vec {
    const wall = CONFIG.room.wall;
    const { w, h } = this.room;
    const half = CONFIG.room.door / 2;
    let minX = wall + r, maxX = w - wall - r, minY = wall + r, maxY = h - wall - r;
    if (this.doorsOpen) {
      for (const d of this.doors) {
        const along = d.side === "N" || d.side === "S" ? Math.abs(pos.x - w / 2) : Math.abs(pos.y - h / 2);
        if (along > half - r) continue;
        if (d.side === "N") minY = -r * 2;
        if (d.side === "S") maxY = h + r * 2;
        if (d.side === "W") minX = -r * 2;
        if (d.side === "E") maxX = w + r * 2;
      }
    }
    let p = { x: clamp(pos.x, minX, maxX), y: clamp(pos.y, minY, maxY) };
    // inside a doorway: stay between its jambs
    if (p.y < wall + r || p.y > h - wall - r) p.x = clamp(p.x, w / 2 - half + r, w / 2 + half - r);
    if (p.x < wall + r || p.x > w - wall - r) p.y = clamp(p.y, h / 2 - half + r, h / 2 + half - r);
    for (const c of this.solidCovers) if (circleHitsRect(p, r, c)) p = pushOutOfRect(p, r, c);
    return p;
  }

  private checkExit(): void {
    if (this.exited || !this.doorsOpen) return;
    const p = this.player.pos;
    const t = CONFIG.room.wall * 0.3;
    const { w, h } = this.room;
    const side: Side | null = p.y < t ? "N" : p.y > h - t ? "S" : p.x < t ? "W" : p.x > w - t ? "E" : null;
    const door = side ? this.doors.find((d) => d.side === side) : undefined;
    if (door) {
      this.exited = true;
      this.events.push({ type: "exit", door });
    }
  }

  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    const cfg = CONFIG.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.facing = angleOf(sub(input.aim, p.pos));

    const move = len(input.move) > 1 ? norm(input.move) : input.move;

    // dodge: dissolve into mist, invulnerable, fast, committed direction
    if (input.dodge && p.dodgeLeft <= 0 && p.dodgeCooldown <= 0) {
      p.dodgeDir = len(move) > 0.1 ? norm(move) : fromAngle(p.facing);
      p.dodgeLeft = CONFIG.dodge.duration;
      this.events.push({ type: "dodge", pos: { ...p.pos }, dir: p.dodgeDir });
    }
    if (p.dodgeLeft > 0) {
      p.dodgeLeft -= dt;
      p.vel = scale(p.dodgeDir, cfg.speed * CONFIG.dodge.speedMul);
      if (p.dodgeLeft <= 0) p.dodgeCooldown = CONFIG.dodge.cooldown;
    } else {
      p.vel = scale(move, cfg.speed);
    }

    p.push = scale(p.push, Math.max(0, 1 - dt * 10));
    p.pos = add(p.pos, scale(add(p.vel, p.push), dt));
    p.pos = this.collidePlayer(p.pos, cfg.radius);
    this.checkExit();

    // the bone altar of a treasure room
    if (this.shrine && !this.shrine.used && dist(this.shrine.pos, p.pos) < 70) {
      this.shrine.used = true;
      const halves = Math.min(2, CONFIG.player.maxHalves - p.halves);
      p.halves += halves;
      p.souls += 2;
      this.events.push({ type: "shrine", pos: { ...this.shrine.pos }, halves, souls: 2 });
    }

    // weapon
    const w = p.weapon;
    const fl = CONFIG.flintlock;
    if (w.reloadLeft > 0) {
      w.reloadLeft -= dt;
      if (w.reloadLeft <= 0) {
        w.reloadLeft = 0;
        w.loaded = w.capacity;
        this.events.push({ type: "reloadDone", pos: { ...p.pos } });
      }
    } else if (input.reload && w.loaded < w.capacity) {
      this.startReload();
    }
    const canShoot = p.dodgeLeft <= 0 && w.reloadLeft <= 0 && w.loaded > 0;
    if (input.shoot && canShoot) {
      const a = p.facing + (this.rng() - 0.5) * 2 * fl.spread;
      const dir = fromAngle(a);
      const muzzle = add(p.pos, scale(dir, cfg.radius + 18));
      const ambush = this.dark && !this.alarm;
      const damage = fl.damage * this.sideMul(p.pos, false) * (ambush ? CONFIG.darkness.ambushMul : 1);
      this.bullets.push({ pos: muzzle, vel: scale(dir, fl.bulletSpeed), radius: fl.bulletRadius, damage, from: "player", life: 1.6, ambush });
      if (this.dark) this.addLight("flash", muzzle);
      w.loaded -= 1;
      p.push = add(p.push, scale(dir, -fl.recoil * 10)); // push decays at 10/s, so v0 = distance * 10
      this.events.push({ type: "shot", pos: muzzle, dir, from: "player" });
      if (w.loaded === 0) this.startReload();
    }

    // topple the nearest pew into cover
    if (input.flip) {
      let best: Cover | undefined;
      let bestD = CONFIG.cover.flipRange + cfg.radius;
      for (const c of this.solidCovers) {
        if (c.flipped) continue;
        const d = dist(p.pos, { x: clamp(p.pos.x, c.x, c.x + c.w), y: clamp(p.pos.y, c.y, c.y + c.h) });
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        best.flipped = true;
        const at = { x: best.x + best.w / 2, y: best.y + best.h / 2 };
        this.events.push({ type: "coverFlip", cover: best.id, pos: at });
        this.makeNoise(at);
      }
    }

    // collect souls by walking through them
    for (const s of this.souls) {
      if (s.life > 0 && dist(s.pos, p.pos) < CONFIG.necro.soulPickup) {
        s.life = 0;
        p.souls += 1;
        this.events.push({ type: "soulPickup", pos: { ...s.pos }, souls: p.souls });
      }
    }

    // E: raise the nearest fresh corpse
    if (input.raise) this.tryRaise();

    // Q: send the minions to the aim point
    if (input.command && this.minions.length > 0) {
      this.order = { pos: { ...input.aim }, time: CONFIG.necro.commandTime };
      this.events.push({ type: "command", pos: { ...input.aim } });
    }
  }

  private tryRaise(): void {
    const c = this.raisableCorpse();
    if (!c) return;
    const n = CONFIG.necro;
    if (this.minions.length >= n.minionLimit) {
      this.events.push({ type: "raiseFail", pos: { ...c.pos }, reason: "limit" });
      return;
    }
    if (this.player.souls < n.raiseCost) {
      this.events.push({ type: "raiseFail", pos: { ...c.pos }, reason: "noSouls" });
      return;
    }
    this.player.souls -= n.raiseCost;
    const u = this.spawn(c.kind, c.pos, "minion");
    u.raises = c.raises + 1;
    u.state = u.kind === "halberdier" ? "follow" : "reposition";
    this.corpses = this.corpses.filter((x) => x !== c);
    this.events.push({ type: "raise", pos: { ...c.pos }, kind: c.kind, unit: u.id });
  }

  private startReload(): void {
    const w = this.player.weapon;
    if (w.reloadLeft > 0) return;
    w.reloadLeft = CONFIG.flintlock.reload;
    this.events.push({ type: "reloadStart", pos: { ...this.player.pos } });
  }

  // ---------------------------------------------------------------- targeting
  /** Nearest opponent of a unit: guards pick the player or a minion, minions pick a guard. */
  private targetFor(u: Unit): { pos: Vec; unit?: Unit; player?: true } | null {
    let best: { pos: Vec; unit?: Unit; player?: true } | null = null;
    let bestD = Infinity;
    if (u.team === "enemy") {
      if (this.player.alive) {
        best = { pos: this.player.pos, player: true };
        bestD = dist(u.pos, this.player.pos);
      }
      for (const m of this.units) {
        if (m.team !== "minion" || !m.alive) continue;
        const d = dist(u.pos, m.pos);
        if (d < bestD) {
          bestD = d;
          best = { pos: m.pos, unit: m };
        }
      }
      return best;
    }
    // minions: obey the order first, otherwise the guard nearest to them
    const anchor = this.order ? this.order.pos : u.pos;
    const reach = this.order ? CONFIG.necro.commandRadius : Infinity;
    for (const e of this.units) {
      if (e.team !== "enemy" || !e.alive) continue;
      const d = dist(anchor, e.pos);
      if (d < reach && d < bestD) {
        bestD = d;
        best = { pos: e.pos, unit: e };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- units
  private updateUnit(u: Unit, dt: number): void {
    u.flash = Math.max(0, u.flash - dt);
    u.timer -= dt;
    if (u.team === "enemy" && u.lamplighter && this.tendLights(u, dt)) return;
    if (u.team === "enemy" && (u.state === "idle" || u.state === "patrol")) {
      this.updateUnaware(u, dt);
      return;
    }
    if (u.team === "minion") {
      const d = CONFIG.darkness;
      u.lifetime -= dt * (this.dark ? (this.isLit(u.pos, false) ? d.minionLightDecay : d.minionDarkDecay) : 1);
      if (u.lifetime <= 0) {
        this.killUnit(u, vec(0, 1), true);
        return;
      }
    }
    const target = this.targetFor(u);
    let vel = vec();

    // minions with nothing to fight walk to the ordered point or stay near the necromancer
    if (u.team === "minion" && !target) {
      const goal = this.order ? this.order.pos : this.player.pos;
      const keep = this.order ? 20 : CONFIG.necro.followDistance;
      const d = dist(u.pos, goal);
      if (d > keep) vel = scale(norm(sub(goal, u.pos)), statsOf(u.kind).speed * 1.2);
      u.state = u.kind === "halberdier" ? "follow" : "reposition";
      u.timer = Math.max(u.timer, 0.3);
      this.moveUnit(u, vel, dt);
      return;
    }
    if (!target) {
      this.moveUnit(u, vel, dt);
      return;
    }

    const toT = sub(target.pos, u.pos);
    const d = len(toT);
    const dirT = norm(toT);

    if (u.kind === "halberdier") {
      const c = CONFIG.halberdier;
      switch (u.state) {
        case "follow":
        case "approach":
          u.state = "approach";
          vel = scale(dirT, c.speed);
          if (d < c.engageRange) {
            u.state = "windup";
            u.timer = c.windup;
            u.dir = dirT;
            if (u.team === "enemy") this.events.push({ type: "telegraph", enemy: u.id });
          }
          break;
        case "windup":
          u.dir = dirT; // keeps tracking until the charge locks in
          if (u.timer <= 0) {
            u.state = "charge";
            u.timer = c.chargeTime;
          }
          break;
        case "charge": {
          vel = scale(u.dir, c.chargeSpeed);
          const hit = this.chargeContact(u);
          if (hit || u.timer <= 0) {
            u.state = "recover";
            u.timer = c.recover;
          }
          break;
        }
        case "recover":
          if (u.timer <= 0) u.state = "approach";
          break;
        default:
          u.state = "approach";
      }
    } else {
      const c = CONFIG.arquebusier;
      switch (u.state) {
        case "follow":
        case "reposition": {
          u.state = "reposition";
          // hold the preferred range and strafe around the target
          const radial = d > c.preferredRange + 40 ? 1 : d < c.preferredRange - 40 ? -1 : 0;
          const side = { x: -dirT.y * u.strafe, y: dirT.x * u.strafe };
          vel = scale(norm(add(scale(dirT, radial), scale(side, 0.8))), c.speed);
          if (u.timer <= 0) {
            u.state = "aim";
            u.timer = c.aim;
            if (u.team === "enemy") this.events.push({ type: "telegraph", enemy: u.id });
          }
          break;
        }
        case "aim":
          u.dir = dirT;
          if (u.timer <= 0) {
            const muzzle = add(u.pos, scale(u.dir, u.radius + 16));
            this.bullets.push({
              pos: muzzle,
              vel: scale(u.dir, c.bulletSpeed),
              radius: c.bulletRadius,
              damage: u.team === "enemy" ? CONFIG.enemyBulletDamage : CONFIG.flintlock.damage * this.sideMul(u.pos, true),
              from: u.team,
              life: 4,
            });
            this.events.push({ type: "shot", pos: muzzle, dir: u.dir, from: u.team });
            u.state = "reload";
            u.timer = c.reload;
          }
          break;
        case "reload":
          vel = scale({ x: -dirT.y * u.strafe, y: dirT.x * u.strafe }, c.speed * 0.4);
          if (u.timer <= 0) {
            u.state = "reposition";
            u.timer = this.range(c.reposition);
            if (this.rng() < 0.4) u.strafe *= -1;
          }
          break;
        default:
          u.state = "reposition";
      }
    }
    this.moveUnit(u, vel, dt);
  }

  private moveUnit(u: Unit, vel: Vec, dt: number): void {
    u.push = scale(u.push, Math.max(0, 1 - dt * 8));
    u.pos = add(u.pos, scale(add(vel, u.push), dt));
    // keep units from stacking on each other
    for (const o of this.units) {
      if (o === u || !o.alive) continue;
      const sep = sub(u.pos, o.pos);
      const sd = len(sep);
      const min = u.radius + o.radius;
      if (sd > 0 && sd < min) u.pos = add(u.pos, scale(norm(sep), (min - sd) / 2));
    }
    u.pos = this.collideWorld(u.pos, u.radius);
  }

  /** A charging halberdier hits the first opponent it touches. */
  private chargeContact(u: Unit): boolean {
    if (u.team === "enemy" && this.player.alive && dist(u.pos, this.player.pos) < u.radius + CONFIG.player.radius + 4) {
      this.hurtPlayer(CONFIG.contactDamage, u.dir);
      return true;
    }
    for (const o of this.units) {
      if (!o.alive || o.team === u.team) continue;
      if (dist(u.pos, o.pos) < u.radius + o.radius + 4) {
        this.hurtUnit(o, u.team === "enemy" ? CONFIG.hitOnMinion : CONFIG.flintlock.damage * this.sideMul(u.pos, true), u.dir);
        return true;
      }
    }
    return false;
  }

  private hurtUnit(u: Unit, damage: number, dir: Vec, ambush = false): void {
    if (u.team === "minion" && this.dark && this.isLit(u.pos, false)) damage *= CONFIG.darkness.minionLightTakenMul;
    u.hp -= damage;
    if (!this.alarm && u.team === "enemy") this.raiseAlarm(u);
    u.flash = 0.08;
    u.push = add(u.push, scale(dir, CONFIG.flintlock.knockback * 8));
    if (u.hp <= 0) {
      this.killUnit(u, dir, false, ambush);
    } else if (u.team === "enemy") {
      this.events.push({ type: "enemyHit", pos: { ...u.pos }, dir, enemy: u.id, ambush });
    } else {
      this.events.push({ type: "minionHit", pos: { ...u.pos }, dir, unit: u.id });
    }
  }

  private killUnit(u: Unit, dir: Vec, crumbled: boolean, ambush = false): void {
    u.alive = false;
    const n = CONFIG.necro;
    // a dead lantern-bearer drops the lantern; it keeps burning on the floor
    for (const l of this.lights) if (l.owner === u.id) l.owner = undefined;
    if (u.team === "enemy") {
      this.events.push({ type: "enemyDeath", pos: { ...u.pos }, dir, kind: u.kind, ambush });
      this.corpses.push({ id: nextId(), kind: u.kind, pos: { ...u.pos }, dir, echo: n.echo, raises: 0, fromMinion: false });
      this.souls.push({ id: nextId(), pos: { x: u.pos.x, y: u.pos.y - 30 }, life: n.soulLife });
    } else {
      this.events.push({ type: "minionDeath", pos: { ...u.pos }, dir, kind: u.kind, crumbled });
      // a fallen minion leaves a body that can be raised once more (no new soul)
      this.corpses.push({ id: nextId(), kind: u.kind, pos: { ...u.pos }, dir, echo: u.raises < n.maxRaises ? n.echo : 0, raises: u.raises, fromMinion: true });
    }
  }

  private updateDead(dt: number): void {
    for (const c of this.corpses) c.echo = Math.max(0, c.echo - dt);
    for (const s of this.souls) {
      s.life -= dt;
      s.pos.y -= dt * 6; // drifts slowly upward
    }
    this.souls = this.souls.filter((s) => s.life > 0);
  }

  // ---------------------------------------------------------------- bullets
  private updateBullets(dt: number): void {
    const W = this.room;
    const wall = CONFIG.room.wall;
    for (const b of this.bullets) {
      const from = b.pos;
      const to = add(b.pos, scale(b.vel, dt));
      b.pos = to;
      b.life -= dt;

      if (b.from === "player") {
        // candles, candelabra, torches and the chandelier's frame can be shot out
        const target = this.lights.find(
          (l) => l.on && l.hp > 0 && l.falling === undefined && PUTOUT_KINDS.includes(l.kind) && distToSegment(World.hitPoint(l), from, to) < CONFIG.lights[l.kind].hit + b.radius,
        );
        if (target) {
          this.shootLight(target);
          b.life = 0;
          continue;
        }
      }
      if (to.x < W.x + wall || to.y < W.y + wall || to.x > W.x + W.w - wall || to.y > W.y + W.h - wall) {
        b.life = 0;
        const at = { x: clamp(to.x, wall, W.w - wall), y: clamp(to.y, wall, W.h - wall) };
        this.events.push({ type: "bulletWall", pos: at });
        if (b.from === "player") {
          const side: Side = to.y < W.y + wall ? "N" : to.y > W.y + W.h - wall ? "S" : to.x < W.x + wall ? "W" : "E";
          const glass = this.lights.find((l) => {
            if (l.kind !== "window" || l.broken || (l.wall ?? "N") !== side) return false;
            const wp = this.windowPoint(l);
            const along = side === "N" || side === "S" ? Math.abs(at.x - wp.x) : Math.abs(at.y - wp.y);
            return along < CONFIG.window.width / 2;
          });
          if (glass) this.breakWindow(glass);
        }
        continue;
      }
      // toppled cover stops bullets from both sides
      let blocked = false;
      for (const c of this.solidCovers) {
        if (!c.flipped || !segmentHitsRect(from, to, c)) continue;
        blocked = true;
        c.hp -= b.damage;
        this.events.push({ type: "coverHit", cover: c.id, pos: { ...to } });
        if (c.hp <= 0) {
          c.broken = true;
          this.events.push({ type: "coverBreak", cover: c.id, pos: { x: c.x + c.w / 2, y: c.y + c.h / 2 } });
        }
        break;
      }
      if (blocked) {
        b.life = 0;
        continue;
      }
      const dir = norm(b.vel);
      // the player's and the minions' bullets hit guards; guards' bullets hit the player and minions
      const hostileTeam: Team = b.from === "enemy" ? "minion" : "enemy";
      for (const u of this.units) {
        if (!u.alive || u.team !== hostileTeam || dist(u.pos, to) > u.radius + b.radius) continue;
        this.hurtUnit(u, b.from === "enemy" ? CONFIG.hitOnMinion : b.damage, dir, b.ambush === true);
        b.life = 0;
        break;
      }
      if (b.life > 0 && b.from === "enemy" && this.player.alive && dist(this.player.pos, to) < CONFIG.player.radius + b.radius) {
        if (this.hurtPlayer(b.damage, dir)) b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  // ---------------------------------------------------------------- darkness
  /** Before the alarm: guards stand (sleeping, praying, on watch) or walk their patrol. */
  private updateUnaware(u: Unit, dt: number): void {
    let vel = vec();
    if (u.state === "patrol" && u.route.length > 0) {
      const goal = u.route[u.routeIdx % u.route.length];
      if (dist(u.pos, goal) < 12) u.routeIdx = (u.routeIdx + 1) % u.route.length;
      u.dir = norm(sub(goal, u.pos));
      vel = scale(u.dir, statsOf(u.kind).speed * CONFIG.darkness.patrolSpeedMul);
    }
    this.moveUnit(u, vel, dt);
  }

  private updateLights(dt: number): void {
    for (const l of this.lights) {
      if (l.owner !== undefined) {
        const u = this.units.find((x) => x.id === l.owner);
        if (u) l.pos = { x: u.pos.x + u.dir.x * 18, y: u.pos.y - 10 };
      }
      if (l.life !== undefined) l.life -= dt;
      if (l.falling !== undefined) {
        l.falling -= dt;
        if (l.falling <= 0) this.crashChandelier(l);
      }
    }
    this.lights = this.lights.filter((l) => l.life === undefined || l.life > 0);
  }

  /** A player bullet reached a light's hitbox. */
  private shootLight(l: Light): void {
    const at = World.hitPoint(l);
    l.hp -= 1;
    if (l.hp > 0) {
      // some candles knocked off: the pool of light shrinks
      l.radius = l.baseRadius * (CONFIG.lightDamagedRadius + (1 - CONFIG.lightDamagedRadius) * ((l.hp - 1) / Math.max(1, l.maxHp - 1)));
      this.events.push({ type: "lightHit", pos: at, light: l.id, kind: l.kind });
      return;
    }
    if (l.kind === "chandelier") {
      // the chain snaps: the whole thing comes down a moment later
      l.falling = CONFIG.chandelier.fallTime;
      this.events.push({ type: "chandelierFall", pos: at, light: l.id });
      return;
    }
    l.on = false;
    this.events.push({ type: "lightOut", pos: at, light: l.id, kind: l.kind });
  }

  /** Tons of iron and burning wax hit the floor: everything under it is crushed, the middle goes dark. */
  private crashChandelier(l: Light): void {
    const c = CONFIG.chandelier;
    l.falling = undefined;
    l.fallen = true;
    l.on = false;
    this.events.push({ type: "chandelierCrash", pos: { ...l.pos }, light: l.id });
    const ambush = !this.alarm;
    for (const u of this.units) {
      if (!u.alive || dist(u.pos, l.pos) > c.crushRadius + u.radius) continue;
      this.hurtUnit(u, c.crushDamage, norm(sub(u.pos, l.pos)), ambush && u.team === "enemy");
    }
    if (this.player.alive && dist(this.player.pos, l.pos) < c.crushRadius + CONFIG.player.radius) {
      this.hurtPlayer(1, norm(sub(this.player.pos, l.pos)));
    }
    this.makeNoise(l.pos);
  }

  /** A shot through stained glass: shards rain on whoever stands in its light, the light stops being holy. */
  private breakWindow(l: Light): void {
    l.broken = true;
    l.holy = false;
    l.radius = l.baseRadius * CONFIG.window.brokenRadiusMul;
    this.events.push({ type: "windowBreak", pos: this.windowPoint(l), light: l.id });
    const ambush = !this.alarm;
    for (const u of this.units) {
      if (!u.alive || u.team !== "enemy" || dist(u.pos, l.pos) > l.baseRadius) continue;
      this.hurtUnit(u, CONFIG.window.shardDamage, vec(0, 1), ambush);
    }
    this.makeNoise(this.windowPoint(l));
  }

  /** Something loud happened: a guard within earshot raises the alarm. */
  private makeNoise(at: Vec): void {
    if (this.alarm) return;
    const woken = this.enemies.find((e) => e.alive && dist(e.pos, at) < CONFIG.darkness.noiseRadius);
    if (woken) this.raiseAlarm(woken);
  }

  /** Can a lamplighter bring this light back? */
  private relightable(l: Light): boolean {
    return !l.on && PUTOUT_KINDS.includes(l.kind) && !l.fallen && l.falling === undefined;
  }

  /**
   * A lamplighter walks to the nearest light that was put out and relights it,
   * before the alarm and during the fight alike. Returns true if he spent this step on it.
   */
  private tendLights(u: Unit, dt: number): boolean {
    const lc = CONFIG.lamplighter;
    const aware = !(u.state === "idle" || u.state === "patrol");
    // never drops an attack halfway, and fights back if the necromancer is in his face
    if (u.state === "windup" || u.state === "charge" || u.state === "aim") return false;
    if (aware && this.player.alive && dist(u.pos, this.player.pos) < 160) return false;
    let l = u.task !== undefined ? this.lights.find((x) => x.id === u.task) : undefined;
    if (!l || !this.relightable(l)) {
      l = undefined;
      u.task = undefined;
      let best: number = lc.range;
      for (const x of this.lights) {
        if (!this.relightable(x)) continue;
        // two lamplighters don't go for the same candle
        if (this.units.some((o) => o !== u && o.alive && o.task === x.id)) continue;
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
      const speed = statsOf(u.kind).speed * (aware ? 1.1 : CONFIG.darkness.patrolSpeedMul * 1.4);
      this.moveUnit(u, scale(u.dir, speed), dt);
      return true;
    }
    this.moveUnit(u, vec(), dt);
    u.taskTime -= dt;
    if (u.taskTime <= 0) {
      l.on = true;
      l.hp = l.maxHp;
      l.radius = l.baseRadius;
      u.task = undefined;
      this.events.push({ type: "relight", pos: World.hitPoint(l), light: l.id, by: u.id });
    }
    return true;
  }

  /** Does this guard notice the necromancer or one of his minions? */
  private sees(u: Unit, pos: Vec): boolean {
    const d = CONFIG.darkness;
    const r = dist(u.pos, pos);
    if (r < d.seeDistance) return true;
    if (r < d.sightRange && this.isLit(pos, false)) return true;
    return r < d.flashSight && this.isLit(pos, true);
  }

  private detect(): void {
    for (const u of this.units) {
      if (u.team !== "enemy" || !u.alive) continue;
      if (this.player.alive && this.sees(u, this.player.pos)) return this.raiseAlarm(u);
      for (const m of this.units) {
        if (m.team === "minion" && m.alive && this.sees(u, m.pos)) return this.raiseAlarm(u);
      }
    }
  }

  /** One guard shouts: the whole room starts fighting. */
  raiseAlarm(by: Unit): void {
    if (this.alarm) return;
    this.alarm = true;
    this.events.push({ type: "alarm", pos: { ...by.pos }, by: by.id });
    for (const u of this.units) {
      if (u.team !== "enemy") continue;
      if (u.state === "idle" || u.state === "patrol") {
        u.state = u.kind === "halberdier" ? "approach" : "reposition";
        u.timer = u.kind === "halberdier" ? 0 : 0.4 + this.rng() * 0.8;
      }
    }
  }

  /** Holy light (stained glass) burns the undead necromancer if he lingers in it. */
  private updateBurn(dt: number): void {
    const d = CONFIG.darkness;
    if (this.isHoly(this.player.pos)) {
      this.exposure += dt;
      if (this.exposure > d.burnDelay) {
        this.burnTick -= dt;
        if (this.burnTick <= 0) {
          this.burnTick = d.burnInterval;
          if (this.hurtPlayer(1, vec())) this.events.push({ type: "burn", pos: { ...this.player.pos } });
        }
      }
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 2);
      this.burnTick = 0;
    }
  }

  /** Returns true if the hit landed (false while dodging or invulnerable). */
  private hurtPlayer(halves: number, dir: Vec): boolean {
    const p = this.player;
    if (p.dodgeLeft > 0 || p.invuln > 0 || !p.alive) return false;
    p.halves = Math.max(0, p.halves - halves);
    p.invuln = CONFIG.player.hitInvuln;
    p.push = add(p.push, scale(dir, CONFIG.player.hitKnockback * 10));
    this.events.push({ type: "playerHit", pos: { ...p.pos }, dir });
    if (p.halves === 0) {
      p.alive = false;
      this.events.push({ type: "playerDeath", pos: { ...p.pos } });
    }
    return true;
  }

  /** Keep a circle inside the room and outside every pew (toppled or not). */
  private collideWorld(pos: Vec, radius: number): Vec {
    const wall = CONFIG.room.wall;
    let p = {
      x: clamp(pos.x, this.room.x + wall + radius, this.room.x + this.room.w - wall - radius),
      y: clamp(pos.y, this.room.y + wall + radius, this.room.y + this.room.h - wall - radius),
    };
    for (const c of this.solidCovers) if (circleHitsRect(p, radius, c)) p = pushOutOfRect(p, radius, c);
    return p;
  }
}
