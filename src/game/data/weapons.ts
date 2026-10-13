/**
 * The arsenal (design doc: Bronie). Period firearms are the base, occult pieces are rare,
 * legends come only from raising cursed weapon remains at an altar.
 * Names and descriptions live in i18n.ts under `weapon.<id>` / `weaponDesc.<id>`.
 */
import type { BulletEffect, BulletLook, Lob } from "../types.js";

export type WeaponId =
  | "pistol" | "doublepistol" | "arquebus" | "blunderbuss" | "crossbow"
  | "petronel" | "organ" | "hakownica" | "mortar"
  | "inqcrossbow" | "captainarq"
  | "howler" | "ashbook" | "bonestaff"
  // legends
  | "gerwazy" | "lament" | "martyrs" | "headsman";

export type WeaponKind = "firearm" | "crossbow" | "occult";
export type Rarity = "starter" | "common" | "rare" | "unique" | "occult" | "legend";
/** The small price of a legend (design doc: Klątwy). */
export type Curse = "alarm" | "noise" | "slowReload" | "heavy";

export interface WeaponDef {
  id: WeaponId;
  kind: WeaponKind;
  rarity: Rarity;
  /** Shots per load. */
  capacity: number;
  /** Seconds to reload (muzzle-loaders are slow). */
  reload: number;
  /** Most ammunition it can carry (Infinity: starting weapons, occult). */
  ammo: number;
  damage: number;
  /** Bullets per shot. */
  pellets: number;
  /** Random cone (radians) for each bullet. */
  spread: number;
  /** Bullets spread evenly over this angle. */
  fan: number;
  speed: number;
  /** Random speed variation (share of speed). */
  speedJitter: number;
  radius: number;
  /** Bullet lifetime in seconds (range = speed x life). */
  life: number;
  pierce: number;
  /** How hard the shot shoves the necromancer back (px). */
  recoil: number;
  /** How hard a hit shoves the target (px). */
  knock: number;
  /** Minimum seconds between shots. */
  fireDelay: number;
  /** Fires every loaded barrel at once (organ gun). */
  volley?: boolean;
  /** Bolts per click (crossbow bursts). */
  burst?: number;
  burstGap?: number;
  /** Occult weapons are paid for in souls (half in darkness). */
  soulCost?: number;
  look: BulletLook;
  effect?: BulletEffect;
  effectTime?: number;
  /** Lobbed shells. */
  lob?: Pick<Lob, "land" | "radius" | "dur" | "height">;
  /** Holy water: double damage to the undead. */
  holy?: boolean;
  /** No muzzle flash: does not give the shooter away in the dark. */
  silent?: boolean;
  /** Legends only. */
  curse?: Curse;
  /** Second form in the dark (design doc: Mrok i światło). */
  dark?: Partial<Pick<WeaponDef, "pellets" | "damage" | "effect" | "effectTime" | "pierce" | "fan">> & { twice?: boolean; execute?: number };
  /** Execute threshold: hits finish off enemies below this share of health. */
  execute?: number;
  /** Price at the fence. */
  price: number;
  /** Drawing: barrel length in px. */
  length: number;
}

const W = (w: Omit<WeaponDef, "speedJitter" | "pierce" | "fan" | "spread" | "pellets"> & Partial<Pick<WeaponDef, "speedJitter" | "pierce" | "fan" | "spread" | "pellets">>): WeaponDef => ({
  speedJitter: 0,
  pierce: 0,
  fan: 0,
  spread: 0.03,
  pellets: 1,
  ...w,
});

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: W({
    id: "pistol", kind: "firearm", rarity: "starter", capacity: 2, reload: 1.1, ammo: Infinity,
    damage: 4, spread: 0.035, speed: 1300, radius: 6, life: 1.6, recoil: 14, knock: 30, fireDelay: 0.2,
    look: "ball", price: 0, length: 20,
  }),
  doublepistol: W({
    id: "doublepistol", kind: "firearm", rarity: "common", capacity: 1, reload: 1.5, ammo: 50,
    damage: 4, pellets: 2, fan: 0.1, speed: 1250, radius: 6, life: 1.5, recoil: 22, knock: 40, fireDelay: 0.25,
    look: "ball", price: 45, length: 22,
  }),
  arquebus: W({
    id: "arquebus", kind: "firearm", rarity: "common", capacity: 1, reload: 2.4, ammo: 30,
    damage: 11, pierce: 3, spread: 0.01, speed: 1650, radius: 7, life: 1.6, recoil: 26, knock: 70, fireDelay: 0.3,
    look: "ball", price: 55, length: 46,
  }),
  blunderbuss: W({
    id: "blunderbuss", kind: "firearm", rarity: "common", capacity: 1, reload: 2.0, ammo: 25,
    damage: 2.4, pellets: 8, fan: 0.6, spread: 0.05, speed: 1050, speedJitter: 0.2, radius: 6, life: 0.4,
    recoil: 34, knock: 30, fireDelay: 0.3, look: "pellet", price: 50, length: 30,
  }),
  crossbow: W({
    id: "crossbow", kind: "crossbow", rarity: "common", capacity: 1, reload: 1.3, ammo: 40,
    damage: 7, speed: 1050, radius: 5, life: 1.5, recoil: 6, knock: 20, fireDelay: 0.25,
    silent: true, look: "bolt", price: 40, length: 28,
  }),
  petronel: W({
    id: "petronel", kind: "firearm", rarity: "rare", capacity: 3, reload: 2.0, ammo: 45,
    damage: 6, spread: 0.05, speed: 1400, radius: 7, life: 1.6, recoil: 70, knock: 50, fireDelay: 0.28,
    look: "ball", price: 70, length: 34,
  }),
  organ: W({
    id: "organ", kind: "firearm", rarity: "rare", capacity: 1, reload: 3.6, ammo: 20, volley: true,
    damage: 4, pellets: 7, fan: 0.55, spread: 0.02, speed: 1200, radius: 6, life: 1.3, recoil: 45, knock: 35, fireDelay: 0.3,
    look: "ball", price: 80, length: 32,
  }),
  hakownica: W({
    id: "hakownica", kind: "firearm", rarity: "rare", capacity: 1, reload: 3.0, ammo: 16,
    damage: 18, pierce: 6, spread: 0.01, speed: 1500, radius: 10, life: 1.6, recoil: 60, knock: 140, fireDelay: 0.4,
    look: "ball", price: 85, length: 52,
  }),
  mortar: W({
    id: "mortar", kind: "firearm", rarity: "rare", capacity: 1, reload: 2.6, ammo: 14,
    damage: 12, speed: 0, radius: 12, life: 2, recoil: 30, knock: 90, fireDelay: 0.4,
    lob: { land: "explode", radius: 110, dur: 0.7, height: 160 }, look: "bomb", price: 90, length: 24,
  }),
  inqcrossbow: W({
    id: "inqcrossbow", kind: "crossbow", rarity: "unique", capacity: 3, reload: 2.0, ammo: 45, burst: 3, burstGap: 0.09,
    damage: 5, spread: 0.03, speed: 1150, radius: 6, life: 1.5, recoil: 5, knock: 20, fireDelay: 0.35,
    holy: true, silent: true, look: "holy", price: 110, length: 30,
  }),
  captainarq: W({
    id: "captainarq", kind: "firearm", rarity: "unique", capacity: 2, reload: 1.8, ammo: 40,
    damage: 10, pierce: 2, spread: 0.01, speed: 1750, radius: 7, life: 1.6, recoil: 22, knock: 60, fireDelay: 0.28,
    look: "ball", price: 110, length: 48,
  }),
  howler: W({
    id: "howler", kind: "occult", rarity: "occult", capacity: 1, reload: 0, ammo: Infinity, soulCost: 2,
    damage: 2, pellets: 9, fan: 0.9, spread: 0.02, speed: 700, radius: 12, life: 0.45, recoil: 0, knock: 80, fireDelay: 0.9,
    effect: "stun", effectTime: 1.2, look: "wave", price: 95, length: 14,
  }),
  ashbook: W({
    id: "ashbook", kind: "occult", rarity: "occult", capacity: 1, reload: 0, ammo: Infinity, soulCost: 2,
    damage: 6, speed: 900, radius: 9, life: 1.5, recoil: 0, knock: 20, fireDelay: 0.4,
    effect: "ash", look: "ash", price: 95, length: 14,
  }),
  bonestaff: W({
    id: "bonestaff", kind: "occult", rarity: "occult", capacity: 1, reload: 0, ammo: Infinity, soulCost: 1,
    damage: 2.6, pellets: 3, fan: 0.22, speed: 1000, radius: 6, life: 1.1, recoil: 0, knock: 18, fireDelay: 0.42,
    look: "bone", price: 70, length: 40,
  }),
  // ---------------------------------------------------------------- legends (raised from remains)
  gerwazy: W({
    id: "gerwazy", kind: "firearm", rarity: "legend", capacity: 2, reload: 1.8, ammo: 40,
    damage: 10, pierce: 2, spread: 0.01, speed: 1600, radius: 8, life: 1.6, recoil: 20, knock: 60, fireDelay: 0.28,
    holy: true, curse: "alarm", dark: { effect: "split" }, look: "holy", price: 0, length: 44,
  }),
  lament: W({
    id: "lament", kind: "firearm", rarity: "legend", capacity: 1, reload: 1.8, ammo: 30,
    damage: 2.8, pellets: 10, fan: 0.65, spread: 0.05, speed: 1000, speedJitter: 0.2, radius: 6, life: 0.45,
    recoil: 30, knock: 30, fireDelay: 0.3, effect: "weep", effectTime: 2.5, curse: "noise",
    dark: { effect: "fear", effectTime: 1.6 }, look: "tooth", price: 0, length: 32,
  }),
  martyrs: W({
    id: "martyrs", kind: "firearm", rarity: "legend", capacity: 1, reload: 3.0, ammo: 24, volley: true,
    damage: 4, pellets: 9, fan: 0.7, spread: 0.02, speed: 1200, radius: 7, life: 1.3, pierce: 1, recoil: 45, knock: 35, fireDelay: 0.3,
    curse: "slowReload", dark: { twice: true }, look: "bone", price: 0, length: 34,
  }),
  headsman: W({
    id: "headsman", kind: "firearm", rarity: "legend", capacity: 1, reload: 2.6, ammo: 20,
    damage: 20, pierce: 4, spread: 0.01, speed: 1550, radius: 11, life: 1.6, recoil: 55, knock: 150, fireDelay: 0.4,
    execute: 0.3, curse: "heavy", dark: { execute: 0.5 }, look: "ball", price: 0, length: 54,
  }),
};
