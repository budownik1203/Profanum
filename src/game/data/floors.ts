/**
 * The five floors of a run, from the cemetery to the cathedral, and the sanctum of the Holy Flame
 * (design doc: Struktura runa, Frakcje według piętra). Names live in i18n.ts under `floor.<id>`.
 */
import type { CoverKind, LightKind } from "../types.js";
import type { UnitKind } from "./units.js";

export type ThemeId = "cmentarz" | "slumsy" | "kupiecka" | "klasztor" | "katedra" | "sanktuarium" | "krypta" | "ossuarium" | "lochy";

export interface FloorDef {
  id: ThemeId;
  depth: number;
  /** Rooms on the floor (without the secret one). */
  rooms: number;
  /** The floor draws its boss from these three (design doc: Bossowie). */
  bosses: UnitKind[];
  /** Who fills the guard spots of a room template, by role. Repeats weigh the draw. */
  melee: UnitKind[];
  ranged: UnitKind[];
  special: UnitKind[];
  /** Candidates for the floor's mini-boss (an elite). */
  elite: UnitKind[];
  /** What a template's covers become here. */
  flip: CoverKind;
  solid: CoverKind;
  /** Lights a template asks for, as this floor has them (null = none here). */
  lightMap: Partial<Record<LightKind, LightKind | null>>;
  /** Chance a combat room gets powder and oil barrels. */
  barrels: number;
  /** Bellringers and bells appear. */
  bells: boolean;
  /** Extra guards on top of the template's base count. */
  extra: number;
}

export const FLOORS: FloorDef[] = [
  {
    id: "cmentarz", depth: 1, rooms: 10, bosses: ["executioner", "exorcist", "mourner"],
    melee: ["peasant", "peasant", "feral", "feral", "torchbearer", "gravedigger"],
    ranged: ["witchhunter", "witchhunter", "peasant"],
    special: ["torchbearer", "gravedigger", "feral"],
    elite: ["gravedigger", "witchhunter"],
    flip: "coffin", solid: "tomb",
    lightMap: { chandelier: "pyre", window: "torch", candelabra: "brazier" },
    barrels: 0.1, bells: false, extra: 0,
  },
  {
    id: "slumsy", depth: 2, rooms: 11, bosses: ["captain", "ratcatcher", "mobleader"],
    melee: ["peasant", "halberdier", "halberdier", "torchbearer", "dog"],
    ranged: ["arquebusier", "arquebusier", "witchhunter", "sergeant"],
    special: ["dog", "sergeant", "torchbearer"],
    elite: ["sergeant", "halberdier"],
    flip: "cart", solid: "crate",
    lightMap: { chandelier: "brazier", window: "torch" },
    barrels: 0.35, bells: false, extra: 1,
  },
  {
    id: "kupiecka", depth: 3, rooms: 11, bosses: ["powdermaster", "usurer", "lampmaster"],
    melee: ["halberdier", "halberdier", "feral", "dog"],
    ranged: ["arquebusier", "cultist", "alchemist", "sergeant"],
    special: ["alchemist", "cultist", "dog"],
    elite: ["alchemist", "cultist", "sergeant"],
    flip: "stall", solid: "crate",
    lightMap: { window: "torch" },
    barrels: 0.6, bells: false, extra: 1,
  },
  {
    id: "klasztor", depth: 4, rooms: 12, bosses: ["bishop", "abbot", "scriptor"],
    melee: ["flagellant", "flagellant", "acolyte"],
    ranged: ["monk", "monk", "acolyte"],
    special: ["bellringer", "monk", "flagellant"],
    elite: ["monk", "flagellant"],
    flip: "pew", solid: "pillar",
    lightMap: {},
    barrels: 0.05, bells: true, extra: 2,
  },
  {
    id: "katedra", depth: 5, rooms: 12, bosses: ["grandinquisitor", "organist", "glassangel"],
    melee: ["knight", "flagellant", "knight"],
    ranged: ["inquisitor", "inquisitor", "monk"],
    special: ["bellringer", "inquisitor", "knight"],
    elite: ["knight", "inquisitor"],
    flip: "pew", solid: "pillar",
    lightMap: {},
    barrels: 0, bells: true, extra: 2,
  },
];

export const SANCTUM = { id: "sanktuarium" as ThemeId, depth: 6, boss: "holyflame" as UnitKind };

// ------------------------------------------------------------------ secret floors
/**
 * Secret floors under the catacombs (design doc: Katakumby, like Gungeon's Oubliette). A trapdoor in
 * the catacombs of the floors above opens with a key; the secret floor is short, dark and well
 * guarded, holds a reliquary and Echo of Souls, and its guardian's stairs lead to the next floor.
 */
export type SecretId = "ossuarium" | "lochy";

export interface SecretFloorDef extends FloorDef {
  id: SecretId;
  /** The floors whose catacombs hide the trapdoor down to it. */
  under: number[];
  /** Who guards the way out: an elite and his escort. */
  guardian: UnitKind;
  escort: UnitKind[];
  /** Echo of Souls waiting with the guardian. */
  echo: number;
}

export const SECRET_FLOORS: Record<SecretId, SecretFloorDef> = {
  // the ossuary under the cemetery: walls of skulls, the dead who were never buried, their worshippers
  ossuarium: {
    id: "ossuarium", depth: 2, rooms: 5, bosses: [],
    melee: ["feral", "feral", "feral", "gravedigger"],
    ranged: ["cultist", "cultist", "alchemist"],
    special: ["alchemist", "cultist", "feral"],
    elite: ["feral"],
    flip: "coffin", solid: "tomb",
    lightMap: { chandelier: "brazier", window: "torch", candelabra: "candle" },
    barrels: 0.1, bells: false, extra: 1,
    under: [1, 2], guardian: "abomination", escort: ["feral", "cultist", "feral"], echo: 10,
  },
  // the Inquisition's dungeons under the merchants' quarter and the monastery: cells, racks, chains
  lochy: {
    id: "lochy", depth: 4, rooms: 5, bosses: [],
    melee: ["flagellant", "flagellant", "knight", "halberdier"],
    ranged: ["inquisitor", "arquebusier", "monk"],
    special: ["monk", "inquisitor", "flagellant"],
    elite: ["inquisitor", "knight"],
    flip: "table", solid: "pillar",
    lightMap: { chandelier: "brazier", window: "torch" },
    barrels: 0.3, bells: false, extra: 2,
    under: [3, 4], guardian: "knight", escort: ["inquisitor", "flagellant", "flagellant"], echo: 14,
  },
};

/** The secret floor whose trapdoor hides in this floor's catacombs, if any. */
export function secretUnder(depth: number): SecretId | null {
  for (const id of Object.keys(SECRET_FLOORS) as SecretId[]) if (SECRET_FLOORS[id].under.includes(depth)) return id;
  return null;
}

export function floorDef(depth: number): FloorDef {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, depth - 1))];
}
