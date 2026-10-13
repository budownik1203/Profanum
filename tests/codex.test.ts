/** The Grimoire: what it notes, what it keeps over reloads, and that every page has its texts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODEX_SECTIONS, cleanCodex, codexProgress, entryKnown, freshCodex, noteEvents, noteWorld } from "../src/game/codex.js";
import { freshMeta, loadMeta, makeStore, saveMeta } from "../src/game/meta.js";
import { UNITS, type UnitKind } from "../src/game/data/units.js";
import { WEAPONS } from "../src/game/data/weapons.js";
import { ITEMS, RELICS, SYNERGIES } from "../src/game/data/items.js";
import { World } from "../src/game/world.js";
import { giveItem, giveRelic, giveWeapon } from "../src/game/stats.js";
import { makeRng, vec } from "../src/game/math.js";
import type { GameEvent } from "../src/game/types.js";
import { hasText, setLang, t, textKeys } from "../src/i18n.js";

const death = (kind: UnitKind, team: "enemy" | "minion" = "enemy"): GameEvent => ({
  type: "enemyDeath", pos: vec(0, 0), dir: vec(1, 0), kind, ambush: false, team, elite: false, boss: !!UNITS[kind].boss,
});

test("the chapters hold everything the game has, each thing once", () => {
  const all = CODEX_SECTIONS.flatMap((s) => s.entries);
  assert.equal(new Set(all).size, all.length);
  const units = Object.keys(UNITS);
  assert.equal(CODEX_SECTIONS[0].entries.length + CODEX_SECTIONS[1].entries.length, units.length);
  for (const id of Object.keys(WEAPONS)) assert.ok(all.includes(id), id);
  for (const id of Object.keys(ITEMS)) assert.ok(all.includes(id), id);
  for (const id of Object.keys(RELICS)) assert.ok(all.includes(id), id);
  for (const s of SYNERGIES) assert.ok(all.includes(s.id), s.id);
  // every boss in the bosses' chapter, none among the enemies
  for (const id of CODEX_SECTIONS[1].entries) assert.ok(UNITS[id as UnitKind].boss, id);
  for (const id of CODEX_SECTIONS[0].entries) assert.ok(!UNITS[id as UnitKind].boss, id);
  // the legends close the weapons' chapter
  const weapons = CODEX_SECTIONS[2].entries;
  const firstLegend = weapons.findIndex((id) => WEAPONS[id as keyof typeof WEAPONS].rarity === "legend");
  assert.ok(firstLegend > 0);
  for (const id of weapons.slice(firstLegend)) assert.equal(WEAPONS[id as keyof typeof WEAPONS].rarity, "legend");
  const p = codexProgress(freshCodex());
  assert.deepEqual(p, { known: 0, total: all.length });
});

test("a room notes who is in it and what the necromancer carries, once", () => {
  const w = new World(makeRng(3), { w: 1600, h: 1200 });
  w.spawn("halberdier", vec(500, 500), "enemy");
  w.spawn("monk", vec(700, 500), "enemy");
  giveWeapon(w.player, "crossbow");
  giveItem(w.player, "rosary");
  giveRelic(w.player, "chain");
  const c = freshCodex();
  assert.equal(noteWorld(c, w), true);
  for (const id of ["halberdier", "monk"]) assert.ok(entryKnown(c, id === "monk" ? "enemies" : "enemies", id), id);
  for (const id of ["crossbow", "rosary", "chain"]) assert.ok(c.found.includes(id), id);
  assert.ok(entryKnown(c, "weapons", "crossbow"));
  assert.ok(entryKnown(c, "items", "rosary"));
  assert.ok(entryKnown(c, "relics", "chain"));
  assert.ok(!entryKnown(c, "enemies", "knight"));
  // nothing new the second time
  assert.equal(noteWorld(c, w), false);
  assert.equal(codexProgress(c).known, c.met.length + c.found.length);
});

test("kills are counted per kind, the minions' own deaths are not", () => {
  const c = freshCodex();
  assert.equal(noteEvents(c, [death("peasant"), death("peasant"), death("executioner")]), true);
  assert.equal(c.kills.peasant, 2);
  assert.equal(c.kills.executioner, 1);
  assert.ok(entryKnown(c, "bosses", "executioner"));
  assert.equal(noteEvents(c, [death("peasant", "minion")]), false);
  assert.equal(c.kills.peasant, 2);
  assert.equal(noteEvents(c, [{ type: "hatch" } as unknown as GameEvent]), false);
});

test("the grimoire survives a reload; old or broken records are cleaned", () => {
  const store = makeStore();
  const m = freshMeta();
  m.codex.met.push("knight", "bishop");
  m.codex.found.push("lament", "koncert");
  m.codex.kills.knight = 7;
  saveMeta(store, m);
  const back = loadMeta(store);
  assert.deepEqual(back.codex.met, ["knight", "bishop"]);
  assert.deepEqual(back.codex.found, ["lament", "koncert"]);
  assert.equal(back.codex.kills.knight, 7);
  // a save from before the grimoire
  assert.deepEqual(cleanCodex(undefined), freshCodex());
  // things the game no longer knows are dropped
  const odd = cleanCodex({ met: ["knight", "dragon"], found: ["pistol", "laser"], kills: { knight: 3, dragon: 9, monk: Number.NaN } });
  assert.deepEqual(odd.met, ["knight"]);
  assert.deepEqual(odd.found, ["pistol"]);
  assert.deepEqual(odd.kills, { knight: 3 });
});

test("every page of the grimoire has its name, story and use, in Polish and English", () => {
  const keysOf = (section: string, id: string): string[] => {
    switch (section) {
      case "enemies":
      case "bosses":
        return [`unit.${id}`, `lore.unit.${id}`];
      case "weapons":
        return [`weapon.${id}`, `weaponDesc.${id}`, `lore.weapon.${id}`];
      case "items":
        return [`item.${id}`, `itemDesc.${id}`, `lore.item.${id}`];
      case "relics":
        return [`relic.${id}`, `relicDesc.${id}`, `lore.relic.${id}`];
      default:
        return [`synergy.${id}`, `synergyDesc.${id}`];
    }
  };
  const missing: string[] = [];
  for (const s of CODEX_SECTIONS) {
    for (const id of s.entries) {
      for (const k of keysOf(s.id, id)) for (const l of ["pl", "en"] as const) if (!hasText(k, l)) missing.push(`${l}:${k}`);
    }
  }
  for (const k of ["codex.title", "codex.hint", "codex.hp", "codex.where", "codex.weaponStats"]) for (const l of ["pl", "en"] as const) if (!hasText(k, l)) missing.push(`${l}:${k}`);
  for (const f of new Set(Object.values(UNITS).map((u) => u.faction))) for (const l of ["pl", "en"] as const) if (!hasText(`codex.faction.${f}`, l)) missing.push(`${l}:codex.faction.${f}`);
  assert.deepEqual(missing, []);
});

test("nothing the player reads is left untranslated (bare formats aside)", () => {
  setLang("pl");
  const untranslated = textKeys("pl").filter((k) => !hasText(k, "en") && /\p{L}/u.test(t(k).replace(/\{\w+\}/g, "")));
  assert.deepEqual(untranslated, []);
  // and nothing English-only
  assert.deepEqual(textKeys("en").filter((k) => !hasText(k, "pl")), []);
});
