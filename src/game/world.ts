/**
 * The simulation of one room. No rendering here: the renderer reads the state and the `events`
 * list each frame, and tests run the world headless.
 *
 * The World owns the state and the order of the update; the systems live in their own files:
 * ai.ts (units), combat.ts (damage, bullets, areas), shooting.ts (the necromancer's weapons),
 * lighting.ts (lights, the lamplighter), loot.ts (pickups, chests, shop, interaction),
 * relics.ts (active relics and the witch's rope).
 */
import { CONFIG } from "./config.js";
import { WEAPONS } from "./data/weapons.js";
import { type Rect, type Vec, add, angleOf, circleHitsRect, clamp, dist, fromAngle, len, norm, pushOutOfRect, scale, sub, vec } from "./math.js";
import { UNITS, teamOf, type UnitKind } from "./data/units.js";
import type {
  Bullet, Chest, Corpse, Cover, CoverKind, Door, GameEvent, InputState, Interactable, Light, LightKind, Pickup,
  Player, Side, Soul, Team, Unit, Zone,
} from "./types.js";
import { makePlayer } from "./stats.js";
import { BARRELS, FLIPPABLE, blocksBullets, nextId } from "./shared.js";
import { updateUnit } from "./ai.js";
import { hurtPlayer, updateBullets, updateZones } from "./combat.js";
import { updateShooting } from "./shooting.js";
import { updateLights } from "./lighting.js";
import { interact, raisableCorpse as findRaisable, updatePickups, onRoomCleared } from "./loot.js";
import { useRelic, useSpecial } from "./relics.js";

export type * from "./types.js";

export const idleInput = (aim: Vec = vec()): InputState => ({
  move: vec(),
  aim,
  shoot: false,
  dodge: false,
  reload: false,
  flip: false,
  interact: false,
  command: false,
  relic: false,
  special: false,
  cycle: 0,
  slot: -1,
});

export { nextId, FLIPPABLE, BARRELS, blocksBullets } from "./shared.js";

/** What the floor wants to know about the room it built (alarms in neighbours, curses...). */
export interface WorldContext {
  /** Floor number 1-5 (6 = the sanctum). */
  depth: number;
  /** Mercy mode: more hearts, slower enemy bullets. */
  grace: boolean;
  /** Called when something makes the neighbouring rooms ready for a fight (a bell, a cursed gun). */
  alarmNeighbours?: () => void;
  /** Weapons, items and relics that can drop this run (the crypt unlocks more). */
  pool?: string[];
  /** On a secret floor: the Echo of Souls its guardian guards. */
  secretEcho?: number;
}

export class World {
  readonly room: Rect;
  /** Look of the floor (cemetery, slums...); the renderer reads it. */
  theme = "cmentarz";
  roomType = "combat";
  player: Player;
  /** Every unit in the room: guards, occult rivals, the necromancer's minions, bosses. */
  units: Unit[] = [];
  corpses: Corpse[] = [];
  souls: Soul[] = [];
  bullets: Bullet[] = [];
  covers: Cover[] = [];
  lights: Light[] = [];
  zones: Zone[] = [];
  pickups: Pickup[] = [];
  chests: Chest[] = [];
  interactables: Interactable[] = [];
  events: GameEvent[] = [];
  /** Active Q order: minions go to this point and fight there. */
  order: { pos: Vec; time: number } | null = null;
  /** Light and darkness change the rules (see CONFIG.darkness). Rooms of a floor are all dark. */
  dark = false;
  /** Before the alarm the guards don't know the necromancer is here. */
  alarm = true;
  /** Seconds the player has stood in holy light (burns after CONFIG.darkness.burnDelay). */
  exposure = 0;
  burnTick = 0;
  time = 0;
  cleared = false;
  doors: Door[] = [];
  /** Bone altar of an ossuary: heals and gives souls, once. */
  shrine: { pos: Vec; used: boolean } | null = null;
  /** True once any hostile was placed in the room (an empty room is not "cleared" in combat). */
  hadEnemies = false;
  /** The bell in this room has been rung. */
  bellRung = false;
  ctx: WorldContext = { depth: 1, grace: false };
  /** Kills in this room, for the narrator and statistics. */
  kills = 0;
  exited = false;
  private wasOpen = true;
  rng: () => number;

  constructor(rng: () => number = Math.random, size: { w: number; h: number } = { w: CONFIG.room.width, h: CONFIG.room.height }) {
    this.rng = rng;
    this.room = { x: 0, y: 0, w: size.w, h: size.h };
    this.player = makePlayer("grabarz", vec(size.w / 2, size.h * 0.75));
  }

  /** Everyone hostile to the necromancer still standing: guards, the Church, occult rivals. */
  get enemies(): Unit[] {
    return this.units.filter((u) => u.team !== "minion");
  }

  get minions(): Unit[] {
    return this.units.filter((u) => u.team === "minion");
  }

  /** The default first room used by tests: pews to topple and a mixed squad of city guards. */
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
    for (const [x, y] of [[W * 0.5, H * 0.13], [W * 0.1, H * 0.14], [W * 0.9, H * 0.14], [W * 0.07, H * 0.55], [W * 0.93, H * 0.55]] as const) {
      w.addLight("candle", vec(x, y));
    }
    w.spawn("halberdier", vec(W * 0.5, H * 0.2), "enemy", { state: "idle" });
    w.spawn("halberdier", vec(W * 0.3, H * 0.24), "enemy", { state: "idle" });
    w.spawn("halberdier", vec(W * 0.3, H * 0.58), "enemy", {
      state: "patrol",
      lantern: true,
      route: [vec(W * 0.3, H * 0.58), vec(W * 0.7, H * 0.58), vec(W * 0.7, H * 0.36), vec(W * 0.3, H * 0.36)],
    });
    w.spawn("arquebusier", vec(W * 0.13, H * 0.24), "enemy", { state: "idle" });
    w.spawn("arquebusier", vec(W * 0.87, H * 0.24), "enemy", { state: "idle" });
    return w;
  }

  // ---------------------------------------------------------------- building the room
  addCover(x: number, y: number, w: number, h: number, kind: CoverKind = "pew"): Cover {
    const hp = kind === "pillar" || kind === "organ" ? Infinity : BARRELS.includes(kind) ? CONFIG.cover.barrelHp : kind === "tomb" || kind === "crate" ? CONFIG.cover.stoneHp : CONFIG.cover.hp;
    const c: Cover = { id: nextId(), x, y, w, h, kind, flipped: false, hp, broken: false };
    this.covers.push(c);
    return c;
  }

  addLight(kind: LightKind, pos: Vec, opts: { owner?: number; wall?: Side; radius?: number; ownerZone?: number } = {}): Light {
    const c = CONFIG.lights[kind];
    const radius = opts.radius ?? c.radius;
    const l: Light = {
      id: nextId(),
      kind,
      pos: { ...pos },
      radius,
      baseRadius: radius,
      on: true,
      hp: c.hp,
      maxHp: c.hp,
      holy: kind === "window" || kind === "pyre",
      wall: opts.wall,
      owner: opts.owner,
      ownerZone: opts.ownerZone,
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

  addZone(z: Omit<Zone, "id" | "maxLife">): Zone {
    const zone: Zone = { ...z, id: nextId(), maxLife: z.life, warnMax: z.warn };
    this.zones.push(zone);
    if (z.kind === "fire" || z.kind === "holyfire") {
      const l = this.addLight("fire", z.pos, { radius: z.radius * 1.9, ownerZone: zone.id });
      if (z.kind === "holyfire") l.holy = true;
      // a warned fire only lights up when it ignites
      if (z.warn > 0) l.on = false;
      zone.light = l.id;
    }
    return zone;
  }

  addInteractable(kind: Interactable["kind"], pos: Vec, opts: Partial<Interactable> = {}): Interactable {
    const it: Interactable = { id: nextId(), kind, pos: { ...pos }, radius: 70, used: false, ...opts };
    this.interactables.push(it);
    return it;
  }

  // ---------------------------------------------------------------- light queries
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

  /** Standing inside any light's radius. */
  isLit(p: Vec, includeFlash = true): boolean {
    return this.lightAt(p, includeFlash) > 0;
  }

  /** Standing in holy light (stained glass, a pyre, holy fire). */
  isHoly(p: Vec): boolean {
    return this.lights.some((l) => l.on && l.holy && dist(p, l.pos) < l.radius);
  }

  /** Damage multiplier for the necromancer's side, from light and darkness. */
  sideMul(pos: Vec, minion: boolean): number {
    if (!this.dark) return 1;
    const d = CONFIG.darkness;
    if (this.isLit(pos)) return minion ? d.lightDamageMul : this.player.stats.lightDamageMul;
    return minion ? d.minionDarkDamageMul * (this.player.stats.synergies.includes("armia") ? 1.25 : 1) : 1;
  }

  // ---------------------------------------------------------------- units
  spawn(
    kind: UnitKind,
    pos: Vec,
    team: Team = teamOf(kind),
    opts: { state?: "idle" | "patrol"; route?: Vec[]; lantern?: boolean; lamplighter?: boolean; elite?: boolean; mini?: boolean } = {},
  ): Unit {
    const def = UNITS[kind];
    const elite = opts.elite ?? false;
    const minion = team === "minion";
    const stats = this.player.stats;
    let hp = def.hp * (elite ? CONFIG.elite.hpMul : 1);
    if (minion) hp *= stats.minionHpMul * (opts.mini ? 0.5 : 1);
    const u: Unit = {
      id: nextId(),
      kind,
      def,
      team,
      pos: { ...pos },
      push: vec(),
      radius: def.radius * (elite ? CONFIG.elite.sizeMul : 1) * (opts.mini ? 0.75 : 1),
      hp,
      maxHp: hp,
      state: "approach",
      timer: def.reposition ? this.range(def.reposition) : 0,
      dir: vec(0, 1),
      flash: 0,
      strafe: this.rng() < 0.5 ? -1 : 1,
      lifetime: minion ? (opts.mini ? CONFIG.necro.miniLifetime : CONFIG.necro.minionLifetime * stats.minionLifeMul) : Infinity,
      raises: 0,
      route: opts.route ?? [],
      routeIdx: 0,
      // a lamplighter always carries a light of his own: you can see him coming
      lantern: (opts.lantern || opts.lamplighter || def.light !== undefined) ?? false,
      elite,
      lamplighter: (opts.lamplighter && team !== "minion") ?? false,
      taskTime: 0,
      cooldown: def.special ? def.special * (0.4 + this.rng() * 0.6) : 0,
      cooldown2: 0,
      burst: 0,
      facing: vec(0, 1),
      st: { stun: 0, slow: 0, burn: 0, fear: 0, weep: 0, infected: false, ashMarked: false },
      mini: opts.mini ?? false,
      stitched: 0,
      alive: true,
    };
    u.state = def.ai === "gunner" || def.ai === "caster" || def.ai === "bomber" || def.ai === "censer" ? "reposition" : "approach";
    if (minion) u.state = u.state === "approach" ? "follow" : u.state;
    if (opts.state && !minion) u.state = opts.state;
    if (!minion) this.hadEnemies = true;
    this.units.push(u);
    if (u.lantern) {
      const kindOfLight: LightKind = def.light === "censer" ? "censer" : def.light === "carried" ? "carried" : "lantern";
      this.addLight(kindOfLight, u.pos, { owner: u.id, radius: def.lightRadius ?? CONFIG.lights[kindOfLight].radius });
    }
    return u;
  }

  range(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rng();
  }

  /** Covers that still block movement. */
  get solidCovers(): Cover[] {
    return this.covers.filter((c) => !c.broken);
  }

  /** Does this cover stop bullets? (toppled pews, tombs, pillars, crates, barrels) */
  static blocksBullets(c: Cover): boolean {
    return blocksBullets(c);
  }

  /** The corpse E would raise right now, if any. */
  raisableCorpse(): Corpse | undefined {
    return findRaisable(this);
  }

  /** Nearest opponent of a unit: guards pick the player or a minion, minions pick a guard, ferals anyone. */
  targetFor(u: Unit): { pos: Vec; unit?: Unit; player?: true } | null {
    let best: { pos: Vec; unit?: Unit; player?: true } | null = null;
    let bestD = Infinity;
    if (u.team !== "minion") {
      if (this.player.alive) {
        best = { pos: this.player.pos, player: true };
        bestD = dist(u.pos, this.player.pos);
      }
      for (const m of this.units) {
        if (m.team === u.team || !m.alive) continue;
        const d = dist(u.pos, m.pos);
        if (d < bestD) {
          bestD = d;
          best = { pos: m.pos, unit: m };
        }
      }
      return best;
    }
    // minions: obey the order first, otherwise the enemy nearest to them
    const anchor = this.order ? this.order.pos : u.pos;
    const reach = this.order ? CONFIG.necro.commandRadius : Infinity;
    for (const e of this.units) {
      if (e.team === "minion" || !e.alive) continue;
      const d = dist(anchor, e.pos);
      if (d < reach && d < bestD) {
        bestD = d;
        best = { pos: e.pos, unit: e };
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
    for (const u of this.units) if (u.alive) updateUnit(this, u, dt);
    updateBullets(this, dt);
    updateZones(this, dt);
    this.updateDead(dt);
    updatePickups(this, dt);
    updateLights(this, dt);
    if (!this.alarm) this.detect();
    if (this.dark && this.player.alive) this.updateBurn(dt);
    this.units = this.units.filter((u) => u.alive);
    if (!this.cleared && this.enemies.length === 0) {
      this.cleared = true;
      if (this.hadEnemies) {
        this.events.push({ type: "roomCleared" });
        onRoomCleared(this);
      }
    }
    const open = this.doorsOpen;
    if (this.wasOpen && !open && this.doors.length > 0) this.events.push({ type: "doorsShut" });
    this.wasOpen = open;
    // a synergy that just came together gets its moment on screen
    const p = this.player;
    const seen = (p.seenSynergies ??= []);
    for (const id of p.stats.synergies) {
      if (seen.includes(id)) continue;
      seen.push(id);
      this.events.push({ type: "synergy", pos: { ...p.pos }, id });
    }
  }

  // ---------------------------------------------------------------- doors
  /** Doors slam shut when the alarm sounds and open again once the room is cleared. */
  get doorsOpen(): boolean {
    return !(this.alarm && this.enemies.length > 0);
  }

  addDoor(side: Side, to: number, secret = false, at = 0.5): Door {
    const d: Door = { side, to, secret: secret || undefined, at: at === 0.5 ? undefined : at };
    this.doors.push(d);
    return d;
  }

  /** Doors you can walk through: secret passages only once their cracked wall is broken. */
  get usableDoors(): Door[] {
    return this.doors.filter((d) => !d.secret || this.interactables.some((i) => i.kind === "secret" && i.side === d.side && i.used));
  }

  /** Centre of a doorway on the wall line. */
  doorCenter(side: Side): Vec {
    const { w, h } = this.room;
    const at = this.doors.find((d) => d.side === side)?.at ?? 0.5;
    return side === "N" ? vec(w * at, 0) : side === "S" ? vec(w * at, h) : side === "W" ? vec(0, h * at) : vec(w, h * at);
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
      for (const d of this.usableDoors) {
        const c = this.doorCenter(d.side);
        const along = d.side === "N" || d.side === "S" ? Math.abs(pos.x - c.x) : Math.abs(pos.y - c.y);
        if (along > half - r) continue;
        if (d.side === "N") minY = -r * 2;
        if (d.side === "S") maxY = h + r * 2;
        if (d.side === "W") minX = -r * 2;
        if (d.side === "E") maxX = w + r * 2;
      }
    }
    let p = { x: clamp(pos.x, minX, maxX), y: clamp(pos.y, minY, maxY) };
    // inside a doorway: stay between its jambs
    if (p.y < wall + r || p.y > h - wall - r) {
      const c = this.doorCenter(p.y < h / 2 ? "N" : "S");
      p.x = clamp(p.x, c.x - half + r, c.x + half - r);
    }
    if (p.x < wall + r || p.x > w - wall - r) {
      const c = this.doorCenter(p.x < w / 2 ? "W" : "E");
      p.y = clamp(p.y, c.y - half + r, c.y + half - r);
    }
    for (const c of this.solidCovers) if (circleHitsRect(p, r, c)) p = pushOutOfRect(p, r, c);
    for (const ch of this.chests) if (!ch.opened && !ch.broken && dist(p, ch.pos) < r + 30) p = add(ch.pos, scale(norm(sub(p, ch.pos)), r + 30));
    return p;
  }

  private checkExit(): void {
    if (this.exited || !this.doorsOpen) return;
    const p = this.player.pos;
    const t = CONFIG.room.wall * 0.3;
    const { w, h } = this.room;
    const side: Side | null = p.y < t ? "N" : p.y > h - t ? "S" : p.x < t ? "W" : p.x > w - t ? "E" : null;
    const door = side ? this.usableDoors.find((d) => d.side === side) : undefined;
    if (door) {
      this.exited = true;
      this.events.push({ type: "exit", door });
    }
  }

  // ---------------------------------------------------------------- the necromancer
  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    const cfg = CONFIG.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.specialCooldown = Math.max(0, p.specialCooldown - dt);
    p.facing = angleOf(sub(input.aim, p.pos));

    const move = len(input.move) > 1 ? norm(input.move) : input.move;

    // dodge: dissolve into mist, invulnerable, fast, committed direction
    if (input.dodge && p.dodgeLeft <= 0 && p.dodgeCooldown <= 0) {
      p.dodgeDir = len(move) > 0.1 ? norm(move) : fromAngle(p.facing);
      p.dodgeLeft = CONFIG.dodge.duration;
      this.events.push({ type: "dodge", pos: { ...p.pos }, dir: p.dodgeDir });
      if (p.stats.dodgeReload) {
        const slot = p.weapons[p.current];
        if (slot && slot.reloadLeft > 0) slot.reloadLeft = 0.01;
      }
    }
    const inHand = p.weapons[p.current];
    const heavy = inHand && WEAPONS[inHand.id].curse === "heavy" ? CONFIG.curses.heavySpeedMul : 1;
    if (p.dodgeLeft > 0) {
      p.dodgeLeft -= dt;
      p.vel = scale(p.dodgeDir, cfg.speed * CONFIG.dodge.speedMul);
      if (p.dodgeLeft <= 0) p.dodgeCooldown = CONFIG.dodge.cooldown * p.stats.dodgeCooldownMul;
    } else {
      const slowed = (p.slow ?? 0) > 0 ? 0.6 : 1;
      p.vel = scale(move, cfg.speed * heavy * slowed);
    }
    if (p.slow) p.slow = Math.max(0, p.slow - dt);

    p.push = scale(p.push, Math.max(0, 1 - dt * 10));
    p.pos = add(p.pos, scale(add(p.vel, p.push), dt));
    p.pos = this.collidePlayer(p.pos, cfg.radius);
    this.checkExit();

    // the bone altar of an ossuary
    if (this.shrine && !this.shrine.used && dist(this.shrine.pos, p.pos) < 70) {
      this.shrine.used = true;
      const halves = Math.min(2, p.maxHalves - p.halves);
      p.halves += halves;
      p.souls += 2;
      this.events.push({ type: "shrine", pos: { ...this.shrine.pos }, halves, souls: 2 });
    }

    updateShooting(this, input, dt);

    // topple the nearest pew into cover
    if (input.flip) {
      let best: Cover | undefined;
      let bestD = CONFIG.cover.flipRange + cfg.radius;
      for (const c of this.solidCovers) {
        if (c.flipped || !FLIPPABLE.includes(c.kind)) continue;
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

    // E: interact with what's in reach: open, buy, take, pray at the altar or raise the dead
    if (input.interact) interact(this);

    // Q: send the minions to the aim point
    if (input.command && this.minions.length > 0) {
      this.order = { pos: { ...input.aim }, time: CONFIG.necro.commandTime };
      this.events.push({ type: "command", pos: { ...input.aim } });
    }

    if (input.relic) useRelic(this, input.aim);
    if (input.special) useSpecial(this, input.aim);
  }

  // ---------------------------------------------------------------- the dead
  private updateDead(dt: number): void {
    for (const c of this.corpses) c.echo = Math.max(0, c.echo - dt);
    for (const s of this.souls) {
      s.life -= dt;
      s.pos.y -= dt * 6; // drifts slowly upward
    }
    this.souls = this.souls.filter((s) => s.life > 0);
  }

  // ---------------------------------------------------------------- detection
  /** Does this guard notice the necromancer or one of his minions? */
  sees(u: Unit, pos: Vec): boolean {
    const d = CONFIG.darkness;
    const r = dist(u.pos, pos);
    if (r < d.seeDistance) return true;
    // dogs smell the undead in the dark
    if (u.def.smell && r < u.def.smell) return true;
    if (r < d.sightRange && this.isLit(pos, false)) return true;
    return r < d.flashSight && this.isLit(pos, true);
  }

  private detect(): void {
    for (const u of this.units) {
      if (u.team === "minion" || !u.alive || u.st.stun > 0) continue;
      const seesPlayer = this.player.alive && this.sees(u, this.player.pos);
      const seesMinion = !seesPlayer && this.units.some((m) => m.team === "minion" && m.alive && this.sees(u, m.pos));
      if (seesPlayer || seesMinion) {
        if (u.def.smell) this.events.push({ type: "bark", pos: { ...u.pos } });
        return this.raiseAlarm(u);
      }
    }
  }

  /** One guard shouts: the whole room starts fighting. */
  raiseAlarm(by: Unit): void {
    if (this.alarm) return;
    this.alarm = true;
    this.events.push({ type: "alarm", pos: { ...by.pos }, by: by.id });
    for (const u of this.units) {
      if (u.team === "minion") continue;
      if (u.state === "idle" || u.state === "patrol") {
        const ranged = u.def.ai === "gunner" || u.def.ai === "caster" || u.def.ai === "bomber" || u.def.ai === "censer";
        u.state = ranged ? "reposition" : "approach";
        u.timer = ranged ? 0.4 + this.rng() * 0.8 : 0;
      }
    }
  }

  /** Something loud happened: a guard within earshot raises the alarm. */
  makeNoise(at: Vec): void {
    if (this.alarm) return;
    const woken = this.enemies.find((e) => e.alive && dist(e.pos, at) < CONFIG.darkness.noiseRadius);
    if (woken) this.raiseAlarm(woken);
  }

  /** Holy light (stained glass, pyres) burns the undead necromancer if he lingers in it. */
  private updateBurn(dt: number): void {
    const d = CONFIG.darkness;
    if (this.isHoly(this.player.pos)) {
      this.exposure += dt;
      if (this.exposure > d.burnDelay * this.player.stats.burnDelayMul) {
        this.burnTick -= dt;
        if (this.burnTick <= 0) {
          this.burnTick = d.burnInterval;
          this.events.push({ type: "burn", pos: { ...this.player.pos } });
          hurtPlayer(this, 1, vec());
        }
      }
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 2);
      this.burnTick = 0;
    }
  }

  // ---------------------------------------------------------------- movement
  moveUnit(u: Unit, vel: Vec, dt: number): void {
    u.push = scale(u.push, Math.max(0, 1 - dt * 8));
    const slow = u.st.slow > 0 || u.st.weep > 0 ? 0.5 : 1;
    u.pos = add(u.pos, scale(add(scale(vel, slow), u.push), dt));
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

  /** Keep a circle inside the room and outside every cover (toppled or not). */
  collideWorld(pos: Vec, radius: number): Vec {
    const wall = CONFIG.room.wall;
    let p = {
      x: clamp(pos.x, this.room.x + wall + radius, this.room.x + this.room.w - wall - radius),
      y: clamp(pos.y, this.room.y + wall + radius, this.room.y + this.room.h - wall - radius),
    };
    for (const c of this.solidCovers) if (circleHitsRect(p, radius, c)) p = pushOutOfRect(p, radius, c);
    return p;
  }
}
