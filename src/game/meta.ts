/**
 * What survives death: Echo of Souls, unlocks, characters, statistics, settings, and the run saved
 * at the start of the current floor. Stored as JSON through a small storage interface, so tests use
 * memory and the browser uses localStorage (which may refuse: then it simply isn't kept).
 */
import { CHARACTERS, STARTING_POOL, UNLOCKABLES, type Challenge, type CharacterId } from "./data/items.js";
import { FLOORS } from "./data/floors.js";
import type { SavedRun, Run } from "./run.js";

export interface Settings {
  /** Screen shake strength 0..1 (design doc: Dostępność). */
  shake: number;
  volume: number;
  music: number;
  numbers: boolean;
  /** Mode of Grace: more hearts, slower enemy bullets. */
  grace: boolean;
  /** Film grain and colour grading over the arena. */
  film: boolean;
  lang: "pl" | "en";
}

export interface Meta {
  v: 1;
  echo: number;
  /** Bought at the Echo altar into the loot pool. */
  unlocked: string[];
  /** Characters woken from their sarcophagi. */
  characters: CharacterId[];
  selected: CharacterId;
  challenges: Challenge[];
  stats: { runs: number; wins: number; deaths: number; kills: number; raised: number; deepest: number; bosses: string[] };
  settings: Settings;
  /** Where the talking skull is in its story (old saves: how many lines it said). */
  skull: number;
  /** Lines of the skull's story already heard (indices into SKULL_STORY). */
  skullHeard: number[];
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage when the browser allows it, memory otherwise. */
export function makeStore(): Store {
  const mem = new Map<string, string>();
  const ls = (): Storage | null => {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    get(key) {
      try {
        const v = ls()?.getItem(key);
        if (v !== null && v !== undefined) return v;
      } catch {
        /* storage refused */
      }
      return mem.get(key) ?? null;
    },
    set(key, value) {
      mem.set(key, value);
      try {
        ls()?.setItem(key, value);
      } catch {
        /* storage refused: kept in memory for this session */
      }
    },
    remove(key) {
      mem.delete(key);
      try {
        ls()?.removeItem(key);
      } catch {
        /* storage refused */
      }
    },
  };
}

const META_KEY = "profanum.meta.v1";
const RUN_KEY = "profanum.run.v1";

export function freshMeta(): Meta {
  return {
    v: 1,
    echo: 0,
    unlocked: [],
    characters: ["grabarz"],
    selected: "grabarz",
    challenges: [],
    stats: { runs: 0, wins: 0, deaths: 0, kills: 0, raised: 0, deepest: 0, bosses: [] },
    settings: { shake: 1, volume: 0.8, music: 0.6, numbers: true, grace: false, film: true, lang: "pl" },
    skull: 0,
    skullHeard: [],
  };
}

export function loadMeta(store: Store): Meta {
  const fresh = freshMeta();
  try {
    const raw = store.get(META_KEY);
    if (!raw) return fresh;
    const m = JSON.parse(raw) as Partial<Meta>;
    return {
      ...fresh,
      ...m,
      stats: { ...fresh.stats, ...(m.stats ?? {}) },
      settings: { ...fresh.settings, ...(m.settings ?? {}) },
      characters: m.characters?.length ? m.characters : fresh.characters,
      skullHeard: Array.isArray(m.skullHeard) ? m.skullHeard : [],
      // the challenges were once named after single bosses
      challenges: (m.challenges ?? []).map((c) => ((c as string) === "killCaptain" ? "beatSlums" : (c as string) === "killInquisitor" ? "beatCathedral" : c)),
    };
  } catch {
    return fresh;
  }
}

export function saveMeta(store: Store, m: Meta): void {
  store.set(META_KEY, JSON.stringify(m));
}

export function loadRun(store: Store): SavedRun | null {
  try {
    const raw = store.get(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedRun;
    return r && r.v === 1 ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(store: Store, r: SavedRun): void {
  store.set(RUN_KEY, JSON.stringify(r));
}

export function clearRun(store: Store): void {
  store.remove(RUN_KEY);
}

/** Everything that can drop this run. */
export function poolOf(m: Meta): string[] {
  return [...STARTING_POOL, ...m.unlocked];
}

/** A run ended (death or victory): bank the echo, count the dead, check the challenges. */
export function finishRun(m: Meta, run: Run): Challenge[] {
  m.echo += run.echo;
  m.stats.runs += 1;
  if (run.victory) m.stats.wins += 1;
  else m.stats.deaths += 1;
  m.stats.kills += run.stats.kills;
  m.stats.raised += run.stats.raised;
  m.stats.deepest = Math.max(m.stats.deepest, run.stats.depth, run.depth);
  for (const b of run.stats.bosses) if (!m.stats.bosses.includes(b)) m.stats.bosses.push(b);
  return checkChallenges(m);
}

/** Mark newly met challenges; returns them. */
export function checkChallenges(m: Meta): Challenge[] {
  const met: Record<Challenge, boolean> = {
    raise20: m.stats.raised >= 20,
    beatSlums: FLOORS[1].bosses.some((b) => m.stats.bosses.includes(b)),
    kills250: m.stats.kills >= 250,
    reachMonastery: m.stats.deepest >= 4,
    beatCathedral: FLOORS[4].bosses.some((b) => m.stats.bosses.includes(b)),
  };
  const fresh: Challenge[] = [];
  for (const [c, ok] of Object.entries(met) as [Challenge, boolean][]) {
    if (ok && !m.challenges.includes(c)) {
      m.challenges.push(c);
      fresh.push(c);
    }
  }
  return fresh;
}

/** Can this character be woken now, and for how much? */
export function characterState(m: Meta, id: CharacterId): "owned" | "buyable" | "sealed" {
  if (m.characters.includes(id)) return "owned";
  const u = CHARACTERS[id].unlock;
  if (!u) return "owned";
  return m.challenges.includes(u.challenge) ? "buyable" : "sealed";
}

export function buyCharacter(m: Meta, id: CharacterId): boolean {
  const u = CHARACTERS[id].unlock;
  if (!u || characterState(m, id) !== "buyable" || m.echo < u.echo) return false;
  m.echo -= u.echo;
  m.characters.push(id);
  m.selected = id;
  return true;
}

export function buyUnlock(m: Meta, id: string): boolean {
  const u = UNLOCKABLES.find((x) => x.id === id);
  if (!u || m.unlocked.includes(id) || m.echo < u.echo) return false;
  m.echo -= u.echo;
  m.unlocked.push(id);
  return true;
}
