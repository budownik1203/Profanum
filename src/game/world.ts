/**
 * The whole combat simulation for one room. No rendering here: the renderer reads the state
 * and the `events` list each frame, and tests can run the world headless.
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
}

export const idleInput = (aim: Vec = vec()): InputState => ({
  move: vec(),
  aim,
  shoot: false,
  dodge: false,
  reload: false,
  flip: false,
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
  alive: boolean;
}

export type EnemyKind = "halberdier" | "arquebusier";
export type EnemyState = "approach" | "windup" | "charge" | "recover" | "reposition" | "aim" | "reload";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec;
  push: Vec;
  radius: number;
  hp: number;
  state: EnemyState;
  timer: number;
  /** Locked direction for a charge, or aim direction while aiming. */
  dir: Vec;
  /** Short white flash after being hit (seconds). */
  flash: number;
  /** Sideways strafing preference for the arquebusier (+1 / -1). */
  strafe: number;
  alive: boolean;
}

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  damage: number;
  from: "player" | "enemy";
  life: number;
}

export interface Cover extends Rect {
  id: number;
  flipped: boolean;
  hp: number;
  broken: boolean;
}

export type GameEvent =
  | { type: "shot"; pos: Vec; dir: Vec; from: "player" | "enemy" }
  | { type: "enemyHit"; pos: Vec; dir: Vec; enemy: number }
  | { type: "enemyDeath"; pos: Vec; dir: Vec; kind: EnemyKind }
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
  | { type: "roomCleared" };

// ------------------------------------------------------------------ world
export class World {
  readonly room: Rect;
  player: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  covers: Cover[] = [];
  events: GameEvent[] = [];
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

  spawn(kind: EnemyKind, pos: Vec): Enemy {
    const cfg = kind === "halberdier" ? CONFIG.halberdier : CONFIG.arquebusier;
    const e: Enemy = {
      id: this.nextId++,
      kind,
      pos,
      push: vec(),
      radius: cfg.radius,
      hp: cfg.hp,
      state: kind === "halberdier" ? "approach" : "reposition",
      timer: kind === "halberdier" ? 0 : this.range(CONFIG.arquebusier.reposition),
      dir: vec(0, 1),
      flash: 0,
      strafe: this.rng() < 0.5 ? -1 : 1,
      alive: true,
    };
    this.enemies.push(e);
    return e;
  }

  private range(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rng();
  }

  get solidCovers(): Cover[] {
    return this.covers.filter((c) => !c.broken);
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: InputState): void {
    this.events = [];
    this.time += dt;
    if (this.player.alive) this.updatePlayer(dt, input);
    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    this.updateBullets(dt);
    this.enemies = this.enemies.filter((e) => e.alive);
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
        const d = dist(p.pos, { x: Math.max(c.x, Math.min(p.pos.x, c.x + c.w)), y: Math.max(c.y, Math.min(p.pos.y, c.y + c.h)) });
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
  }

  private startReload(): void {
    const w = this.player.weapon;
    if (w.reloadLeft > 0) return;
    w.reloadLeft = CONFIG.flintlock.reload;
    this.events.push({ type: "reloadStart", pos: { ...this.player.pos } });
  }

  private updateEnemy(e: Enemy, dt: number): void {
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt);
    e.timer -= dt;
    const toP = sub(p.pos, e.pos);
    const d = len(toP);
    const dirP = norm(toP);
    let vel = vec();

    if (e.kind === "halberdier") {
      const c = CONFIG.halberdier;
      switch (e.state) {
        case "approach":
          vel = scale(dirP, c.speed);
          if (d < c.engageRange && p.alive) {
            e.state = "windup";
            e.timer = c.windup;
            e.dir = dirP;
            this.events.push({ type: "telegraph", enemy: e.id });
          }
          break;
        case "windup":
          e.dir = dirP; // keeps tracking until the charge locks in
          if (e.timer <= 0) {
            e.state = "charge";
            e.timer = c.chargeTime;
          }
          break;
        case "charge":
          vel = scale(e.dir, c.chargeSpeed);
          if (d < e.radius + CONFIG.player.radius + 4) {
            this.hurtPlayer(CONFIG.contactDamage, e.dir);
            e.state = "recover";
            e.timer = c.recover;
          } else if (e.timer <= 0) {
            e.state = "recover";
            e.timer = c.recover;
          }
          break;
        case "recover":
          if (e.timer <= 0) e.state = "approach";
          break;
        default:
          e.state = "approach";
      }
    } else {
      const c = CONFIG.arquebusier;
      switch (e.state) {
        case "reposition": {
          // hold the preferred range and strafe around the player
          const radial = d > c.preferredRange + 40 ? 1 : d < c.preferredRange - 40 ? -1 : 0;
          const side = { x: -dirP.y * e.strafe, y: dirP.x * e.strafe };
          vel = scale(norm(add(scale(dirP, radial), scale(side, 0.8))), c.speed);
          if (e.timer <= 0 && p.alive) {
            e.state = "aim";
            e.timer = c.aim;
            this.events.push({ type: "telegraph", enemy: e.id });
          }
          break;
        }
        case "aim":
          e.dir = dirP;
          if (e.timer <= 0) {
            const muzzle = add(e.pos, scale(e.dir, e.radius + 16));
            this.bullets.push({ pos: muzzle, vel: scale(e.dir, c.bulletSpeed), radius: c.bulletRadius, damage: CONFIG.enemyBulletDamage, from: "enemy", life: 4 });
            this.events.push({ type: "shot", pos: muzzle, dir: e.dir, from: "enemy" });
            e.state = "reload";
            e.timer = c.reload;
          }
          break;
        case "reload":
          vel = scale({ x: -dirP.y * e.strafe, y: dirP.x * e.strafe }, c.speed * 0.4);
          if (e.timer <= 0) {
            e.state = "reposition";
            e.timer = this.range(c.reposition);
            if (this.rng() < 0.4) e.strafe *= -1;
          }
          break;
        default:
          e.state = "reposition";
      }
    }

    e.push = scale(e.push, Math.max(0, 1 - dt * 8));
    e.pos = add(e.pos, scale(add(vel, e.push), dt));
    // keep enemies from stacking on each other
    for (const o of this.enemies) {
      if (o === e || !o.alive) continue;
      const sep = sub(e.pos, o.pos);
      const sd = len(sep);
      const min = e.radius + o.radius;
      if (sd > 0 && sd < min) e.pos = add(e.pos, scale(norm(sep), (min - sd) / 2));
    }
    e.pos = this.collideWorld(e.pos, e.radius);
  }

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
      if (b.from === "player") {
        for (const e of this.enemies) {
          if (!e.alive || dist(e.pos, to) > e.radius + b.radius) continue;
          const dir = norm(b.vel);
          e.hp -= b.damage;
          e.flash = 0.08;
          e.push = add(e.push, scale(dir, CONFIG.flintlock.knockback * 8));
          b.life = 0;
          if (e.hp <= 0) {
            e.alive = false;
            this.events.push({ type: "enemyDeath", pos: { ...e.pos }, dir, kind: e.kind });
          } else {
            this.events.push({ type: "enemyHit", pos: { ...e.pos }, dir, enemy: e.id });
          }
          break;
        }
      } else if (this.player.alive && dist(this.player.pos, to) < CONFIG.player.radius + b.radius) {
        if (this.hurtPlayer(b.damage, norm(b.vel))) b.life = 0;
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
