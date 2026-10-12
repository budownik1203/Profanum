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
export type UnitState = "approach" | "windup" | "charge" | "recover" | "reposition" | "aim" | "reload" | "follow";

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

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  from: Faction;
  life: number;
}

export interface Cover extends Rect {
  id: number;
  flipped: boolean;
  hp: number;
  broken: boolean;
}

export type GameEvent =
  | { type: "shot"; pos: Vec; dir: Vec; from: Faction }
  | { type: "enemyHit"; pos: Vec; dir: Vec; enemy: number }
  | { type: "enemyDeath"; pos: Vec; dir: Vec; kind: UnitKind }
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
  | { type: "roomCleared" };

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
  time = 0;
  cleared = false;
  private nextId = 1;
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
    w.spawn("halberdier", vec(W * 0.2, H * 0.18));
    w.spawn("halberdier", vec(W * 0.5, H * 0.12));
    w.spawn("halberdier", vec(W * 0.82, H * 0.2));
    w.spawn("arquebusier", vec(W * 0.12, H * 0.35));
    w.spawn("arquebusier", vec(W * 0.9, H * 0.38));
    return w;
  }

  addCover(x: number, y: number, w: number, h: number): Cover {
    const c: Cover = { id: this.nextId++, x, y, w, h, flipped: false, hp: CONFIG.cover.hp, broken: false };
    this.covers.push(c);
    return c;
  }

  spawn(kind: UnitKind, pos: Vec, team: Team = "enemy"): Unit {
    const cfg = statsOf(kind);
    const u: Unit = {
      id: this.nextId++,
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
      alive: true,
    };
    this.units.push(u);
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
    this.units = this.units.filter((u) => u.alive);
    if (!this.cleared && this.enemies.length === 0) {
      this.cleared = true;
      this.events.push({ type: "roomCleared" });
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
    p.pos = this.collideWorld(p.pos, cfg.radius);

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
      this.bullets.push({ pos: muzzle, vel: scale(dir, fl.bulletSpeed), radius: fl.bulletRadius, damage: fl.damage, from: "player", life: 1.6 });
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
        this.events.push({ type: "coverFlip", cover: best.id, pos: { x: best.x + best.w / 2, y: best.y + best.h / 2 } });
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
    if (u.team === "minion") {
      u.lifetime -= dt;
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
              damage: u.team === "enemy" ? CONFIG.enemyBulletDamage : CONFIG.flintlock.damage,
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
        this.hurtUnit(o, u.team === "enemy" ? CONFIG.hitOnMinion : CONFIG.flintlock.damage, u.dir);
        return true;
      }
    }
    return false;
  }

  private hurtUnit(u: Unit, damage: number, dir: Vec): void {
    u.hp -= damage;
    u.flash = 0.08;
    u.push = add(u.push, scale(dir, CONFIG.flintlock.knockback * 8));
    if (u.hp <= 0) {
      this.killUnit(u, dir, false);
    } else if (u.team === "enemy") {
      this.events.push({ type: "enemyHit", pos: { ...u.pos }, dir, enemy: u.id });
    } else {
      this.events.push({ type: "minionHit", pos: { ...u.pos }, dir, unit: u.id });
    }
  }

  private killUnit(u: Unit, dir: Vec, crumbled: boolean): void {
    u.alive = false;
    const n = CONFIG.necro;
    if (u.team === "enemy") {
      this.events.push({ type: "enemyDeath", pos: { ...u.pos }, dir, kind: u.kind });
      this.corpses.push({ id: this.nextId++, kind: u.kind, pos: { ...u.pos }, dir, echo: n.echo, raises: 0, fromMinion: false });
      this.souls.push({ id: this.nextId++, pos: { x: u.pos.x, y: u.pos.y - 30 }, life: n.soulLife });
    } else {
      this.events.push({ type: "minionDeath", pos: { ...u.pos }, dir, kind: u.kind, crumbled });
      // a fallen minion leaves a body that can be raised once more (no new soul)
      this.corpses.push({ id: this.nextId++, kind: u.kind, pos: { ...u.pos }, dir, echo: u.raises < n.maxRaises ? n.echo : 0, raises: u.raises, fromMinion: true });
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

      if (to.x < W.x + wall || to.y < W.y + wall || to.x > W.x + W.w - wall || to.y > W.y + W.h - wall) {
        b.life = 0;
        this.events.push({ type: "bulletWall", pos: { x: clamp(to.x, wall, W.w - wall), y: clamp(to.y, wall, W.h - wall) } });
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
        this.hurtUnit(u, b.from === "enemy" ? CONFIG.hitOnMinion : b.damage, dir);
        b.life = 0;
        break;
      }
      if (b.life > 0 && b.from === "enemy" && this.player.alive && dist(this.player.pos, to) < CONFIG.player.radius + b.radius) {
        if (this.hurtPlayer(b.damage, dir)) b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
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
