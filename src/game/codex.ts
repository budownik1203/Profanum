/**
 * The Grimoire: what the necromancer has met and held over all his runs (an Ammonomicon in the
 * crypt). Entries open up as they are seen: the living and the dead met in a room, bosses faced,
 * weapons, items and relics held, synergies formed. Kills are counted per kind.
 */
import { UNITS, type UnitKind } from "./data/units.js";
import { WEAPONS, type WeaponId } from "./data/weapons.js";
import { ITEMS, RELICS, SYNERGIES } from "./data/items.js";
import type { GameEvent } from "./types.js";
import type { World } from "./world.js";

export interface Codex {
  /** Kinds of units met (alive, in a room with the necromancer). */
  met: string[];
  /** Kills by the necromancer's side, per kind. */
  kills: Record<string, number>;
  /** Weapons, items, relics and synergies he has had. */
  found: string[];
}

export const freshCodex = (): Codex => ({ met: [], kills: {}, found: [] });

export type CodexSectionId = "enemies" | "bosses" | "weapons" | "items" | "relics" | "synergies";

export interface CodexSection {
  id: CodexSectionId;
  entries: string[];
}

const unitKinds = Object.keys(UNITS) as UnitKind[];

/** The grimoire's chapters, in the order of the tabs. */
export const CODEX_SECTIONS: CodexSection[] = [
  // ordinary men first, the elites at the end of the chapter
  { id: "enemies", entries: unitKinds.filter((k) => !UNITS[k].boss && !UNITS[k].servant).sort((a, b) => Number(!!UNITS[a].elite) - Number(!!UNITS[b].elite)) },
  { id: "bosses", entries: unitKinds.filter((k) => UNITS[k].boss) },
  // ordinary weapons first, the legends last
  { id: "weapons", entries: (Object.keys(WEAPONS) as WeaponId[]).sort((a, b) => Number(WEAPONS[a].rarity === "legend") - Number(WEAPONS[b].rarity === "legend")) },
  { id: "items", entries: Object.keys(ITEMS) },
  { id: "relics", entries: Object.keys(RELICS) },
  { id: "synergies", entries: SYNERGIES.map((s) => s.id) },
];

export function entryKnown(c: Codex, section: CodexSectionId, id: string): boolean {
  return section === "enemies" || section === "bosses" ? c.met.includes(id) : c.found.includes(id);
}

export function codexProgress(c: Codex): { known: number; total: number } {
  let known = 0;
  let total = 0;
  for (const s of CODEX_SECTIONS) {
    for (const id of s.entries) {
      total += 1;
      if (entryKnown(c, s.id, id)) known += 1;
    }
  }
  return { known, total };
}

const add = (list: string[], id: string): boolean => {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
};

/** Note what the room shows right now: who is in it, what the necromancer carries. True if anything new. */
export function noteWorld(c: Codex, w: World): boolean {
  let fresh = false;
  for (const u of w.units) if (u.alive) fresh = add(c.met, u.kind) || fresh;
  const p = w.player;
  for (const s of p.weapons) fresh = add(c.found, s.id) || fresh;
  for (const id of p.items) fresh = add(c.found, id) || fresh;
  if (p.relic) fresh = add(c.found, p.relic.id) || fresh;
  for (const id of p.stats.synergies) fresh = add(c.found, id) || fresh;
  return fresh;
}

/** Count the kills of this step. True if anything changed. */
export function noteEvents(c: Codex, events: GameEvent[]): boolean {
  let changed = false;
  for (const e of events) {
    if (e.type === "enemyDeath" && e.team !== "minion") {
      c.kills[e.kind] = (c.kills[e.kind] ?? 0) + 1;
      add(c.met, e.kind);
      changed = true;
    }
  }
  return changed;
}

/** Old saves had no grimoire; keep only what the game still knows. */
export function cleanCodex(raw: Partial<Codex> | undefined): Codex {
  const c = freshCodex();
  if (!raw) return c;
  const known = new Set(CODEX_SECTIONS.flatMap((s) => s.entries));
  c.met = (raw.met ?? []).filter((k) => known.has(k));
  c.found = (raw.found ?? []).filter((k) => known.has(k));
  for (const [k, v] of Object.entries(raw.kills ?? {})) if (known.has(k) && Number.isFinite(v)) c.kills[k] = v;
  return c;
}
