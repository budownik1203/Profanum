/**
 * A whole run: five floors from the cemetery down to the cathedral, then the sanctum of the
 * Holy Flame. Death anywhere or the final victory ends it back in the crypt (design doc).
 * Saving: the run is stored at the start of each floor and resumed from there.
 */
import { CHARACTERS, STARTING_POOL, type CharacterId, type ItemId, type LegendId, type RelicId } from "./data/items.js";
import { WEAPONS, type WeaponId } from "./data/weapons.js";
import { Floor } from "./floor.js";
import { makePlayer, recomputeStats } from "./stats.js";
import type { GameEvent, InputState, Player, RitualForm } from "./types.js";
import type { World } from "./world.js";
import type { UnitKind } from "./data/units.js";
import { vec } from "./math.js";

export interface RunStats {
  kills: number;
  raised: number;
  gold: number;
  time: number;
  bosses: string[];
  depth: number;
}

/** What is stored when a floor begins (design doc: wyjście z gry zapisuje run). */
export interface SavedRun {
  v: 1;
  seed: number;
  character: CharacterId;
  depth: number;
  grace: boolean;
  echo: number;
  stats: RunStats;
  player: {
    halves: number;
    maxHalves: number;
    armor: number;
    souls: number;
    gold: number;
    keys: number;
    items: ItemId[];
    relic: { id: RelicId; charge: number } | null;
    remains: LegendId[];
    weapons: { id: WeaponId; ammo: number | null; starter?: boolean; ritual?: RitualForm }[];
    current: number;
  };
}

export interface RunOptions {
  seed?: number;
  character?: CharacterId;
  pool?: string[];
  grace?: boolean;
  /** Bosses chosen ahead for some floors (screenshots, tests). */
  bosses?: Partial<Record<number, UnitKind>>;
}

export class Run {
  readonly seed: number;
  readonly character: CharacterId;
  readonly grace: boolean;
  readonly pool: string[];
  depth = 1;
  floor: Floor;
  player: Player;
  /** Echo of Souls gathered this run (kept after death, spent in the crypt). */
  echo = 0;
  stats: RunStats = { kills: 0, raised: 0, gold: 0, time: 0, bosses: [], depth: 1 };
  over = false;
  victory = false;

  constructor(o: RunOptions = {}, saved?: SavedRun) {
    this.seed = saved?.seed ?? o.seed ?? Math.floor(Math.random() * 1e9);
    this.character = saved?.character ?? o.character ?? "grabarz";
    this.grace = saved?.grace ?? o.grace ?? false;
    this.pool = o.pool ?? STARTING_POOL;
    this.forceBosses = o.bosses ?? {};
    this.player = makePlayer(this.character, vec());
    if (this.grace) {
      this.player.maxHalves += 2;
      this.player.halves += 2;
    }
    if (saved) {
      this.depth = saved.depth;
      this.echo = saved.echo;
      this.stats = { ...saved.stats };
      restorePlayer(this.player, saved);
    }
    this.floor = this.makeFloor();
  }

  get world(): World {
    return this.floor.world;
  }

  /** Bosses chosen ahead for some floors (screenshots, tests). */
  forceBosses: Partial<Record<number, UnitKind>> = {};

  private makeFloor(): Floor {
    return new Floor(this.seed + this.depth * 7717, { depth: this.depth, player: this.player, pool: this.pool, grace: this.grace, boss: this.forceBosses[this.depth] });
  }

  update(dt: number, input: InputState): GameEvent[] {
    if (this.over) return [];
    const events = this.floor.update(dt, input);
    this.stats.time += dt;
    for (const e of events) {
      switch (e.type) {
        case "pickup":
          if (e.kind === "echo") this.echo += e.value;
          if (e.kind === "gold") this.stats.gold += e.value;
          break;
        case "raise":
          this.stats.raised += 1;
          break;
        case "enemyDeath":
          if (e.team !== "minion") this.stats.kills += 1;
          break;
        case "bossDeath":
          this.stats.bosses.push(e.boss);
          if (e.boss === "holyflame") {
            this.victory = true;
            this.over = true;
          }
          break;
        case "playerDeath":
          this.over = true;
          break;
        default:
          break;
      }
    }
    if (events.some((e) => e.type === "stairs")) {
      this.descend();
      events.push({ type: "enterRoom", room: 0, side: "S" });
    }
    return events;
  }

  /** Down the stairs: a new floor, without the army (design doc: Sługi). */
  descend(): void {
    this.depth = Math.min(6, this.depth + 1);
    this.stats.depth = Math.max(this.stats.depth, this.depth);
    // a new floor begins at full ammunition for nothing: what you carry is what you have
    this.floor = this.makeFloor();
  }

  snapshot(): SavedRun {
    const p = this.player;
    return {
      v: 1,
      seed: this.seed,
      character: this.character,
      depth: this.depth,
      grace: this.grace,
      echo: this.echo,
      stats: { ...this.stats, bosses: [...this.stats.bosses] },
      player: {
        halves: p.halves,
        maxHalves: p.maxHalves,
        armor: p.armor,
        souls: p.souls,
        gold: p.gold,
        keys: p.keys,
        items: [...p.items],
        relic: p.relic ? { ...p.relic } : null,
        remains: [...p.remains],
        weapons: p.weapons.map((s) => ({ id: s.id, ammo: Number.isFinite(s.ammo) ? s.ammo : null, starter: s.starter, ritual: s.ritual })),
        current: p.current,
      },
    };
  }
}

function restorePlayer(p: Player, s: SavedRun): void {
  const d = s.player;
  p.halves = d.halves;
  p.maxHalves = d.maxHalves;
  p.armor = d.armor;
  p.souls = d.souls;
  p.gold = d.gold;
  p.keys = d.keys;
  p.items = [...d.items];
  p.relic = d.relic ? { ...d.relic } : null;
  p.remains = [...d.remains];
  p.weapons = d.weapons.map((w) => ({
    id: w.id,
    loaded: 0,
    ammo: w.ammo === null ? Infinity : w.ammo,
    reloadLeft: 0,
    cooldown: 0,
    starter: w.starter,
    ritual: w.ritual,
  }));
  p.current = Math.min(d.current, p.weapons.length - 1);
  if (p.weapons.length === 0) p.weapons = [{ id: CHARACTERS[p.character].weapon, loaded: 1, ammo: Infinity, reloadLeft: 0, cooldown: 0, starter: true }];
  for (const w of p.weapons) w.loaded = WEAPONS[w.id].kind === "occult" ? 1 : Math.min(WEAPONS[w.id].capacity, w.ammo);
  recomputeStats(p);
  p.seenSynergies = [...p.stats.synergies]; // announced back when they came together
}
