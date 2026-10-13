/**
 * Every creature of the game in one table: stats and which behaviour drives it.
 * The same definition serves a guard and the guard raised as a minion (same role, other side).
 * Names live in i18n.ts under `unit.<kind>`.
 */
import type { BulletLook } from "../types.js";

export type UnitKind =
  // City guard
  | "halberdier" | "arquebusier" | "sergeant" | "dog" | "paviser"
  // the mob
  | "peasant" | "torchbearer" | "witchhunter" | "gravedigger"
  // occult rivals (fight everyone)
  | "feral" | "cultist" | "alchemist"
  // the Church and the Inquisition
  | "monk" | "flagellant" | "inquisitor" | "knight" | "bellringer" | "acolyte"
  // others
  | "mimic" | "abomination" | "rat"
  // elites: one fighter of each faction, met now and then among the ordinary guards
  | "grenadier" | "butcher" | "confessor" | "summoner"
  // the necromancers' own servants (never met as enemies)
  | "skeleton" | "skeletonArcher" | "ghost" | "wraith"
  // bosses: three a floor, then the Holy Flame
  | "executioner" | "exorcist" | "mourner"
  | "captain" | "ratcatcher" | "mobleader"
  | "powdermaster" | "usurer" | "lampmaster"
  | "bishop" | "abbot" | "scriptor"
  | "grandinquisitor" | "organist" | "glassangel"
  | "holyflame";

/** Decides how a unit reacts to the necromancer's minions (design doc: Frakcje). */
export type Faction = "guard" | "church" | "mob" | "occult" | "beast" | "undead" | "boss";

export type AiKind =
  | "charger" // wind up, then a straight charge (halberdier)
  | "gunner" // hold range, aim, fire a pattern, reload (arquebusier, inquisitor...)
  | "rusher" // run in and strike up close (mob, dogs, ferals, mimic)
  | "slammer" // overhead slam on a marked spot (gravedigger)
  | "censer" // slow fans, smoke that lights the dark, exorcism of the undead (monk)
  | "frenzy" // whip arcs, faster the more hurt (flagellant)
  | "knight" // shield that stops bullets from the front, lunge (holy knight)
  | "bomber" // lobbed flasks that burst into fire (alchemist)
  | "caster" // homing orbs, blinks away (cultist)
  | "bellringer" // runs to the bell when the alarm sounds
  | "brute" // stitched abomination: slow, heavy slams
  | "paviser" // carries a great shield and plants it before the musket line
  | "grenadier" // elite of the watch: grenades thrown in threes, the musket butt up close
  | "butcher" // elite of the mob: a meat hook that pulls you in, two cleaver blows
  | "flamer" // elite of the Church: sprays holy fire in a sweeping cone
  | "summoner" // elite of the occultists: circles the wild dead crawl out of, rings of orbs
  | "wraith" // the lich's wraith: strikes, and screams the living into flight
  | "boss";

export interface ShotDef {
  count: number;
  /** Total fan angle for count > 1, random cone for a single bullet (radians). */
  spread: number;
  speed: number;
  radius: number;
  look: BulletLook;
  /** Holy water: double damage to the undead (two half hearts to the necromancer). */
  holy?: boolean;
  /** Shots per volley (crossbow bursts). */
  burst?: number;
  burstGap?: number;
  /** Damage to units (minions or guards); the player always loses half a heart (or a whole for holy). */
  damage?: number;
  homing?: number;
  life?: number;
}

export interface UnitDef {
  kind: UnitKind;
  faction: Faction;
  ai: AiKind;
  hp: number;
  radius: number;
  speed: number;
  /** Melee: how close it strikes from, wind-up and recovery. */
  reach?: number;
  windup?: number;
  recover?: number;
  /** Damage of its blows to units (the player always loses half a heart). */
  melee?: number;
  /** Chargers: distance to start the wind-up, charge time and speed. */
  engageRange?: number;
  chargeTime?: number;
  chargeSpeed?: number;
  /** Ranged: preferred distance, aim time, reload, strafe time range. */
  range?: number;
  aim?: number;
  reload?: number;
  reposition?: readonly [number, number];
  shot?: ShotDef;
  /** Seconds between special attacks (torch throws, flasks, orbs, exorcisms). */
  special?: number;
  /** Area attacks (slam, exorcism, flask fire) radius. */
  area?: number;
  /** Dogs smell the undead in the dark within this distance. */
  smell?: number;
  /** Light it carries. */
  light?: "lantern" | "censer" | "carried";
  lightRadius?: number;
  /** Gold dropped on death. */
  gold: readonly [number, number];
  /** Can its corpse be raised? */
  raisable: boolean;
  /** Drawing scale (1 = a man). */
  size: number;
  boss?: boolean;
  /** An elite fighter (design: Elity): rarer, dangerous, may carry weapon remains. */
  elite?: boolean;
  /** Only ever a necromancer's servant (skeletons, ghosts): not in the Grimoire's chapters. */
  servant?: boolean;
  /** Passes through covers and pews (ghosts). */
  phase?: boolean;
}

const D = (d: UnitDef): UnitDef => d;

export const UNITS: Record<UnitKind, UnitDef> = {
  // ---------------------------------------------------------------- City guard
  halberdier: D({
    kind: "halberdier", faction: "guard", ai: "charger", hp: 8, radius: 22, speed: 150,
    engageRange: 190, windup: 0.55, chargeTime: 0.4, chargeSpeed: 650, recover: 0.9, melee: 3,
    gold: [1, 3], raisable: true, size: 1,
  }),
  arquebusier: D({
    kind: "arquebusier", faction: "guard", ai: "gunner", hp: 6, radius: 21, speed: 120,
    range: 430, reposition: [1.0, 1.8], aim: 0.7, reload: 2.4,
    shot: { count: 1, spread: 0, speed: 420, radius: 9, look: "ball" },
    gold: [1, 3], raisable: true, size: 1,
  }),
  sergeant: D({
    kind: "sergeant", faction: "guard", ai: "gunner", hp: 14, radius: 24, speed: 135,
    range: 360, reposition: [0.8, 1.4], aim: 0.6, reload: 2.0,
    shot: { count: 3, spread: 0.44, speed: 380, radius: 9, look: "ball" },
    gold: [3, 5], raisable: true, size: 1.08,
  }),
  paviser: D({
    kind: "paviser", faction: "guard", ai: "paviser", hp: 12, radius: 23, speed: 125,
    reach: 58, windup: 0.4, recover: 0.8, melee: 3, special: 9,
    gold: [2, 4], raisable: true, size: 1.04,
  }),
  dog: D({
    kind: "dog", faction: "beast", ai: "rusher", hp: 4, radius: 16, speed: 270,
    reach: 46, windup: 0.22, recover: 0.5, melee: 2, smell: 280,
    gold: [0, 0], raisable: true, size: 0.75,
  }),
  // ---------------------------------------------------------------- elites
  grenadier: D({
    kind: "grenadier", faction: "guard", ai: "grenadier", hp: 24, radius: 23, speed: 120,
    range: 400, reposition: [1.0, 1.6], special: 3.4, area: 85, reach: 60, windup: 0.35, recover: 0.7, melee: 4,
    gold: [6, 10], raisable: true, size: 1.05, elite: true,
  }),
  butcher: D({
    kind: "butcher", faction: "mob", ai: "butcher", hp: 30, radius: 25, speed: 140,
    reach: 92, windup: 0.45, recover: 0.9, melee: 6, special: 5,
    gold: [5, 9], raisable: true, size: 1.1, elite: true,
  }),
  confessor: D({
    kind: "confessor", faction: "church", ai: "flamer", hp: 26, radius: 23, speed: 105,
    range: 230, special: 4, light: "censer", lightRadius: 140,
    gold: [6, 10], raisable: true, size: 1.05, elite: true,
  }),
  summoner: D({
    kind: "summoner", faction: "occult", ai: "summoner", hp: 22, radius: 21, speed: 110,
    range: 420, reposition: [1.2, 2], special: 7,
    shot: { count: 10, spread: 0, speed: 165, radius: 11, look: "orb", life: 5 },
    gold: [6, 10], raisable: true, size: 1.02, elite: true,
  }),
  // ---------------------------------------------------------------- servants
  skeleton: D({
    kind: "skeleton", faction: "undead", ai: "rusher", hp: 6, radius: 18, speed: 175,
    reach: 54, windup: 0.25, recover: 0.45, melee: 3,
    gold: [0, 0], raisable: false, size: 0.95, servant: true,
  }),
  skeletonArcher: D({
    kind: "skeletonArcher", faction: "undead", ai: "gunner", hp: 5, radius: 18, speed: 140,
    range: 360, reposition: [0.6, 1.2], aim: 0.45, reload: 1.3,
    shot: { count: 1, spread: 0.06, speed: 560, radius: 6, look: "bone", damage: 3 },
    gold: [0, 0], raisable: false, size: 0.95, servant: true,
  }),
  ghost: D({
    kind: "ghost", faction: "undead", ai: "rusher", hp: 5, radius: 17, speed: 210,
    reach: 50, windup: 0.2, recover: 0.4, melee: 2,
    gold: [0, 0], raisable: false, size: 0.9, servant: true, phase: true,
  }),
  wraith: D({
    kind: "wraith", faction: "undead", ai: "wraith", hp: 16, radius: 21, speed: 180,
    reach: 64, windup: 0.3, recover: 0.5, melee: 5, special: 6, area: 260,
    gold: [0, 0], raisable: false, size: 1.1, servant: true, phase: true,
  }),
  // ---------------------------------------------------------------- the mob
  peasant: D({
    kind: "peasant", faction: "mob", ai: "rusher", hp: 5, radius: 20, speed: 165,
    reach: 64, windup: 0.35, recover: 0.7, melee: 2,
    gold: [0, 2], raisable: true, size: 0.96,
  }),
  torchbearer: D({
    kind: "torchbearer", faction: "mob", ai: "rusher", hp: 5, radius: 20, speed: 150,
    reach: 64, windup: 0.35, recover: 0.7, melee: 2, special: 4.5, area: 70,
    light: "carried", lightRadius: 170,
    gold: [0, 2], raisable: true, size: 0.96,
  }),
  witchhunter: D({
    kind: "witchhunter", faction: "mob", ai: "gunner", hp: 7, radius: 21, speed: 135,
    range: 400, reposition: [0.9, 1.5], aim: 0.55, reload: 1.8,
    shot: { count: 2, spread: 0.14, speed: 540, radius: 6, look: "bolt" },
    gold: [1, 3], raisable: true, size: 1,
  }),
  gravedigger: D({
    kind: "gravedigger", faction: "mob", ai: "slammer", hp: 10, radius: 23, speed: 115,
    engageRange: 160, windup: 0.8, recover: 1.0, melee: 4, area: 95,
    shot: { count: 6, spread: 0, speed: 210, radius: 9, look: "shard" },
    gold: [1, 2], raisable: true, size: 1.05,
  }),
  // ---------------------------------------------------------------- occult rivals
  feral: D({
    kind: "feral", faction: "undead", ai: "rusher", hp: 7, radius: 21, speed: 130,
    reach: 60, windup: 0.3, recover: 0.6, melee: 2,
    gold: [0, 1], raisable: true, size: 1,
  }),
  cultist: D({
    kind: "cultist", faction: "occult", ai: "caster", hp: 6, radius: 20, speed: 115,
    range: 360, special: 3, reposition: [1.2, 2],
    shot: { count: 3, spread: 0.6, speed: 170, radius: 11, look: "orb", homing: 1.6, life: 5 },
    gold: [1, 3], raisable: true, size: 1,
  }),
  alchemist: D({
    kind: "alchemist", faction: "occult", ai: "bomber", hp: 7, radius: 21, speed: 110,
    range: 420, special: 2.8, area: 80, reposition: [1, 1.8],
    shot: { count: 8, spread: 0, speed: 230, radius: 9, look: "ember" },
    gold: [2, 4], raisable: true, size: 1,
  }),
  // ---------------------------------------------------------------- the Church
  monk: D({
    kind: "monk", faction: "church", ai: "censer", hp: 10, radius: 22, speed: 95,
    range: 300, reposition: [1.2, 2.0], special: 7, area: 210,
    shot: { count: 5, spread: 0.7, speed: 200, radius: 10, look: "ember" },
    light: "censer", lightRadius: 170,
    gold: [1, 3], raisable: true, size: 1,
  }),
  flagellant: D({
    kind: "flagellant", faction: "church", ai: "frenzy", hp: 9, radius: 21, speed: 170,
    reach: 115, windup: 0.35, recover: 0.5, melee: 3,
    gold: [0, 2], raisable: true, size: 1,
  }),
  inquisitor: D({
    kind: "inquisitor", faction: "church", ai: "gunner", hp: 12, radius: 23, speed: 110,
    range: 420, reposition: [0.9, 1.6], aim: 0.6, reload: 2.2,
    shot: { count: 1, spread: 0.04, speed: 560, radius: 7, look: "holy", holy: true, burst: 3, burstGap: 0.14 },
    light: "lantern", lightRadius: 210,
    gold: [2, 4], raisable: true, size: 1.04,
  }),
  knight: D({
    kind: "knight", faction: "church", ai: "knight", hp: 20, radius: 26, speed: 105,
    engageRange: 170, windup: 0.5, chargeTime: 0.35, chargeSpeed: 520, recover: 1.1, melee: 5,
    gold: [2, 5], raisable: true, size: 1.15,
  }),
  bellringer: D({
    kind: "bellringer", faction: "church", ai: "bellringer", hp: 6, radius: 20, speed: 150,
    reach: 60, windup: 0.35, recover: 0.7, melee: 1,
    gold: [0, 2], raisable: true, size: 0.9,
  }),
  acolyte: D({
    kind: "acolyte", faction: "church", ai: "gunner", hp: 4, radius: 18, speed: 140,
    range: 320, reposition: [0.8, 1.4], aim: 0.6, reload: 1.8,
    shot: { count: 1, spread: 0.05, speed: 300, radius: 8, look: "ember" },
    gold: [0, 1], raisable: true, size: 0.85,
  }),
  // ---------------------------------------------------------------- others
  mimic: D({
    kind: "mimic", faction: "beast", ai: "rusher", hp: 18, radius: 28, speed: 190,
    reach: 72, windup: 0.3, recover: 0.5, melee: 3,
    gold: [6, 10], raisable: false, size: 1.1,
  }),
  abomination: D({
    kind: "abomination", faction: "undead", ai: "brute", hp: 40, radius: 32, speed: 120,
    engageRange: 120, windup: 0.5, recover: 0.8, melee: 8, area: 100,
    gold: [0, 0], raisable: false, size: 1.45,
  }),
  // the rat-catcher's rats: fast, weak, many (raised, they make a fine swarm)
  rat: D({
    kind: "rat", faction: "beast", ai: "rusher", hp: 2, radius: 11, speed: 210,
    reach: 34, windup: 0.3, recover: 0.5, melee: 1,
    gold: [0, 0], raisable: true, size: 0.5,
  }),
  // ---------------------------------------------------------------- bosses (scripts in bosses.ts)
  executioner: D({ kind: "executioner", faction: "boss", ai: "boss", hp: 260, radius: 40, speed: 125, melee: 6, gold: [20, 30], raisable: false, size: 1.7, boss: true }),
  exorcist: D({ kind: "exorcist", faction: "boss", ai: "boss", hp: 250, radius: 30, speed: 115, melee: 5, gold: [20, 30], raisable: false, size: 1.5, boss: true }),
  mourner: D({ kind: "mourner", faction: "boss", ai: "boss", hp: 240, radius: 30, speed: 120, melee: 5, gold: [20, 30], raisable: false, size: 1.55, boss: true }),
  captain: D({ kind: "captain", faction: "boss", ai: "boss", hp: 300, radius: 32, speed: 150, melee: 5, gold: [25, 35], raisable: false, size: 1.5, boss: true }),
  ratcatcher: D({ kind: "ratcatcher", faction: "boss", ai: "boss", hp: 270, radius: 32, speed: 135, melee: 5, gold: [25, 35], raisable: false, size: 1.5, boss: true }),
  mobleader: D({ kind: "mobleader", faction: "boss", ai: "boss", hp: 310, radius: 36, speed: 125, melee: 6, gold: [25, 35], raisable: false, size: 1.6, boss: true }),
  powdermaster: D({ kind: "powdermaster", faction: "boss", ai: "boss", hp: 320, radius: 34, speed: 115, melee: 5, gold: [30, 40], raisable: false, size: 1.65, boss: true }),
  usurer: D({ kind: "usurer", faction: "boss", ai: "boss", hp: 270, radius: 40, speed: 85, melee: 5, gold: [45, 60], raisable: false, size: 1.6, boss: true }),
  lampmaster: D({ kind: "lampmaster", faction: "boss", ai: "boss", hp: 290, radius: 30, speed: 140, melee: 5, gold: [30, 40], raisable: false, size: 1.55, boss: true }),
  bishop: D({ kind: "bishop", faction: "boss", ai: "boss", hp: 360, radius: 54, speed: 70, melee: 6, gold: [30, 40], raisable: false, size: 1.6, boss: true }),
  abbot: D({ kind: "abbot", faction: "boss", ai: "boss", hp: 360, radius: 36, speed: 85, melee: 6, gold: [30, 40], raisable: false, size: 1.6, boss: true }),
  scriptor: D({ kind: "scriptor", faction: "boss", ai: "boss", hp: 340, radius: 30, speed: 115, melee: 5, gold: [30, 40], raisable: false, size: 1.5, boss: true }),
  grandinquisitor: D({ kind: "grandinquisitor", faction: "boss", ai: "boss", hp: 380, radius: 36, speed: 140, melee: 6, gold: [35, 45], raisable: false, size: 1.6, boss: true }),
  organist: D({ kind: "organist", faction: "boss", ai: "boss", hp: 340, radius: 40, speed: 0, melee: 6, gold: [35, 45], raisable: false, size: 1.5, boss: true }),
  glassangel: D({ kind: "glassangel", faction: "boss", ai: "boss", hp: 400, radius: 44, speed: 95, melee: 6, gold: [35, 45], raisable: false, size: 1.9, boss: true }),
  holyflame: D({ kind: "holyflame", faction: "boss", ai: "boss", hp: 560, radius: 70, speed: 70, melee: 8, gold: [0, 0], raisable: false, size: 2.4, boss: true }),
};

/** The occult rivals belong to nobody: they attack the city, the Church and the necromancer alike. */
export function teamOf(kind: UnitKind): "enemy" | "feral" {
  const f = UNITS[kind].faction;
  return f === "occult" || f === "undead" ? "feral" : "enemy";
}

export const BOSS_KINDS: UnitKind[] = [
  "executioner", "exorcist", "mourner",
  "captain", "ratcatcher", "mobleader",
  "powdermaster", "usurer", "lampmaster",
  "bishop", "abbot", "scriptor",
  "grandinquisitor", "organist", "glassangel",
  "holyflame",
];
