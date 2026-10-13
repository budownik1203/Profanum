/**
 * Characters, passive items, relics, legends and named synergies (design doc: Przedmioty i ekonomia,
 * Postacie grywalne). Names and descriptions live in i18n.ts.
 */
import type { Stats } from "../types.js";
import type { WeaponId } from "./weapons.js";

// ------------------------------------------------------------------ characters
export type CharacterId = "grabarz" | "nekromanta" | "lisz" | "medyk" | "kaplan" | "wiedzma";

export interface CharacterDef {
  id: CharacterId;
  weapon: WeaponId;
  hearts: number;
  /** Stat changes on top of the defaults. */
  stats: Partial<Stats>;
  /** Starts the run with this relic. */
  relic?: RelicId;
  /** How it is unlocked in the crypt: a challenge, then Echo of Souls. */
  unlock: { challenge: Challenge; echo: number } | null;
}

export type Challenge = "raise20" | "killCaptain" | "kills250" | "reachMonastery" | "killInquisitor";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  grabarz: { id: "grabarz", weapon: "pistol", hearts: 3, stats: { raiseCost: 1 }, unlock: null },
  nekromanta: { id: "nekromanta", weapon: "bonestaff", hearts: 3, stats: { minionLimit: 4 }, unlock: { challenge: "raise20", echo: 20 } },
  lisz: { id: "lisz", weapon: "howler", hearts: 2, stats: { lightDamageMul: 0.92, burnDelayMul: 2 }, unlock: { challenge: "killCaptain", echo: 35 } },
  medyk: { id: "medyk", weapon: "blunderbuss", hearts: 3, stats: { infect: true }, unlock: { challenge: "kills250", echo: 30 } },
  kaplan: { id: "kaplan", weapon: "arquebus", hearts: 3, stats: { relicChargeBonus: 1 }, relic: "monstrance", unlock: { challenge: "reachMonastery", echo: 45 } },
  wiedzma: { id: "wiedzma", weapon: "petronel", hearts: 3, stats: {}, unlock: { challenge: "killInquisitor", echo: 60 } },
};

export const CHARACTER_ORDER: CharacterId[] = ["grabarz", "nekromanta", "lisz", "medyk", "kaplan", "wiedzma"];

/** Defaults every character starts from. */
export const BASE_STATS: Stats = {
  damageMul: 1,
  firearmDamageMul: 1,
  reloadMul: 1,
  ammoMul: 1,
  minionLimit: 3,
  raiseCost: 2,
  lightDamageMul: 0.75,
  burnDelayMul: 1,
  dodgeCooldownMul: 1,
  shopMul: 1,
  minionDamageMul: 1,
  minionLifeMul: 1,
  minionHpMul: 1,
  extraSoulChance: 0,
  critChance: 0.06,
  ambushMul: 2,
  occultCostDelta: 0,
  relicChargeBonus: 0,
  infect: false,
  dodgeReload: false,
  wickSnuffer: false,
  synergies: [],
};

// ------------------------------------------------------------------ passive items
export type ItemId =
  | "boneshirt" | "powder" | "ramrod" | "bandolier" | "jarskull" | "rosary" | "shroud" | "shackles"
  | "handofglory" | "claws" | "hourglass" | "tome" | "purse" | "martyrheart" | "wick" | "gravedirt"
  | "emberpocket" | "noose";

export interface ItemDef {
  id: ItemId;
  rarity: "common" | "rare";
  stats?: Partial<Record<keyof Stats, number | boolean>>;
  /** Multiply instead of add for these stats. */
  mul?: Partial<Record<keyof Stats, number>>;
  /** One-off effects when picked up. */
  onPickup?: "armor" | "heart";
  price: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  boneshirt: { id: "boneshirt", rarity: "common", onPickup: "armor", price: 30 },
  powder: { id: "powder", rarity: "common", mul: { firearmDamageMul: 1.2 }, price: 55 },
  ramrod: { id: "ramrod", rarity: "common", mul: { reloadMul: 0.75 }, price: 50 },
  bandolier: { id: "bandolier", rarity: "common", mul: { ammoMul: 1.5 }, price: 45 },
  jarskull: { id: "jarskull", rarity: "rare", stats: { minionLimit: 1 }, price: 70 },
  rosary: { id: "rosary", rarity: "common", stats: { extraSoulChance: 0.25 }, price: 50 },
  shroud: { id: "shroud", rarity: "rare", mul: { burnDelayMul: 2 }, stats: { lightDamageMul: 0.1 }, price: 65 },
  shackles: { id: "shackles", rarity: "common", mul: { dodgeCooldownMul: 0.7 }, price: 40 },
  handofglory: { id: "handofglory", rarity: "rare", stats: { ambushMul: 1 }, price: 70 },
  claws: { id: "claws", rarity: "common", mul: { minionDamageMul: 1.3 }, price: 50 },
  hourglass: { id: "hourglass", rarity: "common", mul: { minionLifeMul: 1.5 }, price: 45 },
  tome: { id: "tome", rarity: "rare", stats: { occultCostDelta: -1 }, price: 60 },
  purse: { id: "purse", rarity: "common", mul: { shopMul: 0.75 }, price: 35 },
  martyrheart: { id: "martyrheart", rarity: "rare", onPickup: "heart", price: 75 },
  wick: { id: "wick", rarity: "common", stats: { wickSnuffer: true }, price: 40 },
  gravedirt: { id: "gravedirt", rarity: "common", mul: { minionHpMul: 1.5 }, price: 45 },
  emberpocket: { id: "emberpocket", rarity: "rare", stats: { dodgeReload: true }, price: 65 },
  noose: { id: "noose", rarity: "common", stats: { critChance: 0.1 }, price: 45 },
};

// ------------------------------------------------------------------ relics (F, charged by cleared rooms)
export type RelicId = "monstrance" | "finger" | "plague" | "nightshroud" | "prophet" | "vial" | "rope";

export interface RelicDef {
  id: RelicId;
  /** Rooms to clear for a full charge (design doc: 1 to 4). */
  charge: number;
  price: number;
}

export const RELICS: Record<RelicId, RelicDef> = {
  monstrance: { id: "monstrance", charge: 2, price: 80 },
  finger: { id: "finger", charge: 1, price: 50 },
  plague: { id: "plague", charge: 2, price: 75 },
  nightshroud: { id: "nightshroud", charge: 2, price: 70 },
  prophet: { id: "prophet", charge: 3, price: 90 },
  vial: { id: "vial", charge: 4, price: 85 },
  rope: { id: "rope", charge: 1, price: 55 },
};

// ------------------------------------------------------------------ legends
export type LegendId = "gerwazy" | "lament" | "martyrs" | "headsman";

/** Souls it costs at the altar to raise the remains as a legend. */
export const LEGEND_COST: Record<LegendId, number> = { gerwazy: 6, lament: 5, martyrs: 6, headsman: 7 };

/** Named synergies: owning both halves unlocks the bonus (design doc: Pasywki i synergie). */
export interface SynergyDef {
  id: string;
  needs: [string, string];
}

export const SYNERGIES: SynergyDef[] = [
  // Lamentation teeth and the howling skull: the scream makes them weep, the teeth make them flee
  { id: "koncert", needs: ["lament", "howler"] },
  // organ gun + horn ramrod: the volley reloads twice as fast
  { id: "salwa", needs: ["organ", "ramrod"] },
  // hand of glory + night shroud: lights you shoot out burst into embers that hurt the guards around
  { id: "noc", needs: ["handofglory", "shroud"] },
  // skull in a jar + grave dirt: minions hit 25% harder and don't decay faster in light
  { id: "armia", needs: ["jarskull", "gravedirt"] },
  // Saint Gervase's barrel + martyr's vial: every 12 kills with holy water heal half a heart
  { id: "namaszczenie", needs: ["gerwazy", "vial"] },
];

// ------------------------------------------------------------------ loot pools
export type PoolEntry = { kind: "weapon"; id: WeaponId } | { kind: "item"; id: ItemId } | { kind: "relic"; id: RelicId };

/** Unlocked from the start; the rest is bought at the crypt's Echo altar. */
export const STARTING_POOL: string[] = [
  "doublepistol", "arquebus", "blunderbuss", "crossbow", "petronel", "howler",
  "boneshirt", "powder", "ramrod", "bandolier", "jarskull", "rosary", "shroud", "shackles", "claws", "hourglass", "purse", "noose", "martyrheart",
  "monstrance", "finger", "nightshroud", "vial", "rope",
];

/** What the Echo altar sells into the pool, with its price in Echo of Souls. */
export const UNLOCKABLES: { id: string; echo: number }[] = [
  { id: "organ", echo: 8 },
  { id: "hakownica", echo: 10 },
  { id: "mortar", echo: 12 },
  { id: "ashbook", echo: 12 },
  { id: "bonestaff", echo: 8 },
  { id: "handofglory", echo: 10 },
  { id: "tome", echo: 8 },
  { id: "wick", echo: 6 },
  { id: "gravedirt", echo: 6 },
  { id: "emberpocket", echo: 12 },
  { id: "plague", echo: 10 },
  { id: "prophet", echo: 14 },
];
