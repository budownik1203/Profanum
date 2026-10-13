/** Small helpers shared by every system (no imports from other game modules). */
import type { Cover, CoverKind } from "./types.js";

/** Ids are unique across all rooms of a run (minions walk from room to room). */
let NEXT_ID = 1;
export const nextId = (): number => NEXT_ID++;

/** Kinds of cover that can be toppled; the rest always stops bullets or explodes. */
export const FLIPPABLE: readonly CoverKind[] = ["pew", "table", "coffin", "cart", "stall", "shelf"];
export const BARRELS: readonly CoverKind[] = ["powder", "oil"];

/** Does this cover stop bullets? (toppled pews, tombs, pillars, crates, barrels) */
export function blocksBullets(c: Cover): boolean {
  // the organ's pipes and fretwork let bullets through: it stops bodies, not shots
  if (c.kind === "organ") return false;
  return !c.broken && (c.flipped || !FLIPPABLE.includes(c.kind));
}

/** Random integer in [a, b]. */
export function randInt(rng: () => number, a: number, b: number): number {
  return a + Math.floor(rng() * (b - a + 1));
}

export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
