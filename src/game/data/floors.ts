/**
 * The five floors of a run, from the cemetery to the cathedral, and the sanctum of the Holy Flame
 * (design doc: Struktura runa, Frakcje według piętra). Names live in i18n.ts under `floor.<id>`.
 */
import type { CoverKind, LightKind } from "../types.js";
import type { UnitKind } from "./units.js";

export type ThemeId = "cmentarz" | "slumsy" | "kupiecka" | "klasztor" | "katedra" | "sanktuarium" | "krypta";

export interface FloorDef {
  id: ThemeId;
  depth: number;
  /** Rooms on the floor (without the secret one). */
  rooms: number;
  boss: UnitKind;
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
    id: "cmentarz", depth: 1, rooms: 10, boss: "executioner",
    melee: ["peasant", "peasant", "feral", "feral", "torchbearer", "gravedigger"],
    ranged: ["witchhunter", "witchhunter", "peasant"],
    special: ["torchbearer", "gravedigger", "feral"],
    elite: ["gravedigger", "witchhunter"],
    flip: "coffin", solid: "tomb",
    lightMap: { chandelier: "pyre", window: "torch", candelabra: "brazier" },
    barrels: 0.1, bells: false, extra: 0,
  },
  {
    id: "slumsy", depth: 2, rooms: 11, boss: "captain",
    melee: ["peasant", "halberdier", "halberdier", "torchbearer", "dog"],
    ranged: ["arquebusier", "arquebusier", "witchhunter", "sergeant"],
    special: ["dog", "sergeant", "torchbearer"],
    elite: ["sergeant", "halberdier"],
    flip: "cart", solid: "crate",
    lightMap: { chandelier: "brazier", window: "torch" },
    barrels: 0.35, bells: false, extra: 1,
  },
  {
    id: "kupiecka", depth: 3, rooms: 11, boss: "powdermaster",
    melee: ["halberdier", "halberdier", "feral", "dog"],
    ranged: ["arquebusier", "cultist", "alchemist", "sergeant"],
    special: ["alchemist", "cultist", "dog"],
    elite: ["alchemist", "cultist", "sergeant"],
    flip: "stall", solid: "crate",
    lightMap: { window: "torch" },
    barrels: 0.6, bells: false, extra: 1,
  },
  {
    id: "klasztor", depth: 4, rooms: 12, boss: "bishop",
    melee: ["flagellant", "flagellant", "acolyte"],
    ranged: ["monk", "monk", "acolyte"],
    special: ["bellringer", "monk", "flagellant"],
    elite: ["monk", "flagellant"],
    flip: "pew", solid: "pillar",
    lightMap: {},
    barrels: 0.05, bells: true, extra: 2,
  },
  {
    id: "katedra", depth: 5, rooms: 12, boss: "grandinquisitor",
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

export function floorDef(depth: number): FloorDef {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, depth - 1))];
}
