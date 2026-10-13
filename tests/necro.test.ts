/** Every character raises the dead his own way (necro.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { makePlayer } from "../src/game/stats.js";
import { CONFIG } from "../src/game/config.js";
import { makeRng, vec, dist } from "../src/game/math.js";
import type { CharacterId } from "../src/game/data/items.js";
import type { UnitKind } from "../src/game/data/units.js";
import { interactTarget } from "../src/game/loot.js";
import { DT, freeze, step } from "./helpers.js";

/** A world with this character, a body of `kind` at his feet and souls to spend. */
function withBody(character: CharacterId, kind: UnitKind = "halberdier", big = false): World {
  const w = new World(makeRng(21));
  w.player = makePlayer(character, vec(600, 600));
  w.player.souls = 10;
  w.corpses.push({ id: 700, kind, pos: vec(600, 560), dir: vec(1, 0), echo: 5, raises: 0, fromMinion: false, big });
  return w;
}
const raise = (w: World) => step(w, { ...idleInput(), interact: true }, DT);

test("the gravedigger raises the dead as they were", () => {
  const w = withBody("grabarz");
  raise(w);
  assert.deepEqual(w.minions.map((m) => m.kind), ["halberdier"]);
  assert.equal(w.player.souls, 9, "for one soul");
});

test("the necromancer makes two short-lived skeletons of one body, an archer of a shooter", () => {
  let w = withBody("nekromanta");
  raise(w);
  assert.deepEqual(w.minions.map((m) => m.kind).sort(), ["skeleton", "skeleton"]);
  for (const m of w.minions) assert.ok(m.lifetime <= CONFIG.necro.skeletonLifetime * w.player.stats.minionLifeMul + 0.01);
  w = withBody("nekromanta", "arquebusier");
  raise(w);
  assert.deepEqual(w.minions.map((m) => m.kind).sort(), ["skeleton", "skeletonArcher"]);
  // with one place left, only one rises
  w = withBody("nekromanta");
  for (let i = 0; i < w.player.stats.minionLimit - 1; i++) w.spawn("skeleton", vec(300 + i * 30, 300), "minion");
  raise(w);
  assert.equal(w.minions.length, w.player.stats.minionLimit);
});

test("the lich calls ghosts, and wraiths of the strong; ghosts pass through covers", () => {
  let w = withBody("lisz", "peasant");
  raise(w);
  assert.deepEqual(w.minions.map((m) => m.kind), ["ghost"]);
  w = withBody("lisz", "knight");
  raise(w);
  assert.deepEqual(w.minions.map((m) => m.kind), ["wraith"]);
  // a ghost inside a pew stays where it is, a man is pushed out
  const g = new World(makeRng(5));
  const cover = g.addCover(760, 470, 120, 60);
  const mid = vec(cover.x + cover.w / 2, cover.y + cover.h / 2);
  const ghost = g.spawn("ghost", { ...mid }, "minion");
  const man = g.spawn("peasant", { ...mid }, "minion");
  freeze(ghost);
  freeze(man);
  g.moveUnit(ghost, vec(), DT);
  g.moveUnit(man, vec(), DT);
  assert.ok(dist(ghost.pos, mid) < 1, "the ghost stays in the pew");
  assert.ok(dist(man.pos, mid) > 5, "the man is pushed out");
});

test("a wraith's scream puts the living to flight", () => {
  const w = withBody("lisz", "knight");
  raise(w);
  const wraith = w.minions[0];
  const e = w.spawn("peasant", vec(wraith.pos.x + 120, wraith.pos.y), "enemy");
  w.alarm = true;
  const ev = step(w, idleInput(), 1);
  assert.ok(ev.some((x) => x.type === "scream"));
  assert.ok(e.st.fear > 0 || !e.alive);
});

test("the plague doctor takes the organs out and stitches one abomination, which grows as he feeds it", () => {
  const w = withBody("medyk", "halberdier");
  raise(w);
  assert.equal(w.minions.length, 0, "nobody rises");
  assert.equal(w.corpses.length, 0, "the body is used up");
  assert.equal(w.player.organs, 1);
  assert.equal(w.player.souls, 10, "the knife costs no souls");
  w.player.organs = CONFIG.necro.abominationOrgans;
  assert.equal(interactTarget(w)?.kind, "abomination");
  const ev = raise(w);
  assert.ok(ev.some((e) => e.type === "abomination"));
  const abo = w.minions.find((m) => m.kind === "abomination")!;
  assert.ok(abo);
  assert.equal(w.player.organs, 0);
  const before = { hp: abo.maxHp, size: abo.stitched };
  // the next body feeds it straight away
  w.corpses.push({ id: 701, kind: "knight", pos: vec(600, 560), dir: vec(1, 0), echo: 5, raises: 0, fromMinion: false, big: false });
  abo.pos = vec(300, 300);
  freeze(abo);
  const fed = raise(w);
  assert.ok(fed.some((e) => e.type === "harvest" && e.fed));
  assert.ok(abo.maxHp > before.hp && abo.stitched > before.size);
  assert.equal(w.minions.filter((m) => m.kind === "abomination").length, 1, "only ever one");
});

test("the priest's fanatics hit harder in light and don't rot there", () => {
  const w = withBody("kaplan");
  w.dark = true;
  w.addLight("candelabra", vec(600, 560));
  raise(w);
  const m = w.minions[0];
  assert.ok(m.zealot);
  freeze(m);
  const life = m.lifetime;
  step(w, idleInput(), 1);
  assert.ok(life - m.lifetime < CONFIG.darkness.minionLightDecay, "slower than an ordinary minion in light");
});

test("the witch throws her hanged at the enemy; they stun where they land", () => {
  const w = withBody("wiedzma");
  raise(w);
  const h = w.minions[0];
  assert.ok(h.hanged);
  const e = w.spawn("halberdier", vec(900, 560), "enemy");
  freeze(e);
  w.alarm = true;
  const ev = step(w, { ...idleInput(vec(900, 560)), special: true }, DT);
  assert.ok(ev.some((x) => x.type === "hangedThrow"));
  const later = step(w, idleInput(vec(900, 560)), 0.8);
  assert.ok(later.some((x) => x.type === "hangedLand"));
  assert.ok(dist(h.pos, e.pos) < 200, "landed among them");
  assert.ok(e.st.stun > 0 || e.hp < e.maxHp);
});
