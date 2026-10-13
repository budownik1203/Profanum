/**
 * Every character raises the dead in his own way (design: Nekromancja postaci):
 * - the Gravedigger raises them as they were, and stitches no abominations;
 * - the Necromancer makes skeletons of the bones: two from a body, weak, short-lived, many of them;
 * - the Lich calls up ghosts that pass through walls of pews, and wraiths from the strong ones;
 * - the Plague Doctor raises nobody: he takes the organs out of bodies and stitches one
 *   abomination of them, feeding it more as it fights;
 * - the Fallen Priest's dead are fanatics: light doesn't wear them down, it makes them stronger;
 * - the Witch hangs hers on her rope: she throws them at enemies and pulls them back.
 */
import { CONFIG } from "./config.js";
import type { CharacterId } from "./data/items.js";
import { UNITS, type UnitKind } from "./data/units.js";
import { add, dist, norm, scale, sub, vec, type Vec } from "./math.js";
import type { Corpse, Unit } from "./types.js";
import type { World } from "./world.js";

export type NecroStyle = "grave" | "bones" | "spirits" | "organs" | "zealots" | "hanged";

export const NECRO: Record<CharacterId, NecroStyle> = {
  grabarz: "grave",
  nekromanta: "bones",
  lisz: "spirits",
  medyk: "organs",
  kaplan: "zealots",
  wiedzma: "hanged",
};

export const styleOf = (w: World): NecroStyle => NECRO[w.player.character] ?? "grave";

/** The strong ones: the lich makes wraiths of them. */
const STRONG: readonly UnitKind[] = ["sergeant", "knight", "inquisitor", "gravedigger", "paviser", "grenadier", "butcher", "confessor", "summoner"];

/** How many servants one body makes (the necromancer's bones split in two). */
export function servantsFrom(w: World): number {
  return styleOf(w) === "bones" ? 2 : 1;
}

/** Raise a body the character's way. Returns the servants that rose. */
export function raiseAs(w: World, c: Corpse, room: number): Unit[] {
  const style = styleOf(w);
  const out: Unit[] = [];
  const ranged = UNITS[c.kind].ai === "gunner" || UNITS[c.kind].ai === "caster" || UNITS[c.kind].ai === "bomber" || UNITS[c.kind].ai === "censer";
  switch (style) {
    case "bones": {
      // the bones of one body: a swordsman, and an archer too if the dead man shot
      const n = Math.min(room, 2);
      for (let i = 0; i < n; i++) {
        const kind: UnitKind = i === 0 && ranged ? "skeletonArcher" : "skeleton";
        const u = w.spawn(kind, add(c.pos, vec(i === 0 ? -20 : 20, 0)), "minion");
        u.lifetime = CONFIG.necro.skeletonLifetime * w.player.stats.minionLifeMul;
        out.push(u);
      }
      break;
    }
    case "spirits": {
      const u = w.spawn(STRONG.includes(c.kind) || c.big ? "wraith" : "ghost", c.pos, "minion");
      out.push(u);
      break;
    }
    default: {
      const u = w.spawn(c.kind, c.pos, "minion");
      if (style === "zealots") u.zealot = true;
      if (style === "hanged") u.hanged = true;
      out.push(u);
    }
  }
  for (const u of out) u.raises = c.raises + 1;
  return out;
}

// ------------------------------------------------------------------ the plague doctor's organs
export const abominationOf = (w: World): Unit | undefined => w.units.find((u) => u.alive && u.team === "minion" && u.kind === "abomination");

/** Take the organs out of a body: into the jar, or straight into the abomination if there is one. */
export function harvest(w: World, c: Corpse): void {
  const p = w.player;
  const n = c.big || UNITS[c.kind].hp >= 12 ? 2 : 1;
  w.corpses = w.corpses.filter((x) => x !== c);
  const abo = abominationOf(w);
  if (abo) {
    feed(abo, n);
    w.events.push({ type: "harvest", pos: { ...c.pos }, organs: n, fed: true });
    return;
  }
  p.organs = (p.organs ?? 0) + n;
  w.events.push({ type: "harvest", pos: { ...c.pos }, organs: n, fed: false });
}

/** Every organ makes the abomination bigger and tougher (up to a point), and mends it. */
export function feed(abo: Unit, n: number): void {
  const a = CONFIG.necro;
  for (let i = 0; i < n; i++) {
    if (abo.stitched >= a.abominationMaxSize) {
      abo.hp = Math.min(abo.maxHp, abo.hp + a.organHp);
      continue;
    }
    abo.stitched += 1;
    abo.maxHp += a.organHp;
    abo.hp += a.organHp;
    abo.radius = UNITS.abomination.radius * (0.85 + abo.stitched * 0.05);
  }
}

/** Stitch the abomination from the jar. */
export function stitchFromOrgans(w: World): boolean {
  const p = w.player;
  const a = CONFIG.necro;
  if (abominationOf(w) || (p.organs ?? 0) < a.abominationOrgans) return false;
  p.organs = (p.organs ?? 0) - a.abominationOrgans;
  const at = add(p.pos, vec(0, -70));
  const u = w.spawn("abomination", w.collideWorld(at, 32), "minion");
  u.maxHp = u.hp = a.abominationBaseHp;
  u.stitched = 0;
  u.lifetime = Infinity;
  feed(u, 3);
  w.events.push({ type: "abomination", pos: { ...u.pos }, corpses: 3 });
  return true;
}

// ------------------------------------------------------------------ the witch's hanged
/** C: throw the hanged one nearest to her at the aim point; with none near, pull them all back. */
export function throwHanged(w: World, aim: Vec): boolean {
  const p = w.player;
  const hanged = w.units.filter((u) => u.alive && u.team === "minion" && u.hanged && !u.thrown);
  if (!hanged.length) return false;
  const near = hanged.filter((u) => dist(u.pos, p.pos) < CONFIG.rope.hangedReach).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
  if (near.length) {
    const u = near[0];
    const to = w.collideWorld(aim, u.radius);
    const d = dist(u.pos, to);
    u.push = scale(norm(sub(to, u.pos)), d * 8);
    u.thrown = 0.45;
    w.events.push({ type: "hangedThrow", from: { ...u.pos }, to });
    return true;
  }
  // too far: the rope pulls them all back to her
  for (const u of hanged) {
    const to = add(p.pos, vec((Math.random() - 0.5) * 120, 60));
    u.push = scale(norm(sub(to, u.pos)), Math.min(1600, dist(u.pos, to) * 8));
  }
  w.events.push({ type: "hangedRecall", pos: { ...p.pos } });
  return true;
}
