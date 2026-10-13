/** The arsenal: switching, ammunition, pellets, piercing, occult costs, lobbed shells, legends. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { WEAPONS } from "../src/game/data/weapons.js";
import { UNITS } from "../src/game/data/units.js";
import { giveWeapon } from "../src/game/stats.js";
import { makeRng, vec } from "../src/game/math.js";
import { DT, freeze, step } from "./helpers.js";

const room = (): World => {
  const w = new World(makeRng(41));
  w.player.stats.critChance = 0;
  return w;
};

test("weapons switch with 1-9 and the wheel; switching loses the reload in progress", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "arquebus");
  giveWeapon(p, "blunderbuss");
  assert.equal(p.weapons.length, 3);
  assert.equal(p.weapons[p.current].id, "blunderbuss", "a new gun goes straight into the hands");
  step(w, { ...idleInput(), slot: 0 }, DT);
  assert.equal(p.weapons[p.current].id, "pistol");
  step(w, { ...idleInput(), cycle: 1 }, DT);
  assert.equal(p.weapons[p.current].id, "arquebus");
  // fire the arquebus: it starts reloading; switching away throws the reload away
  step(w, { ...idleInput(vec(900, 0)), shoot: true }, 0.4);
  assert.ok(p.weapons[1].reloadLeft > 0);
  step(w, { ...idleInput(), cycle: -1 }, DT);
  assert.equal(p.weapons[1].reloadLeft, 0);
  assert.equal(p.weapons[1].loaded, 0);
});

test("the blunderbuss throws a fan of pellets and runs out of ammunition", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "blunderbuss");
  const slot = p.weapons[p.current];
  step(w, { ...idleInput(vec(900, 0)), shoot: true }, DT);
  assert.equal(w.bullets.length, WEAPONS.blunderbuss.pellets);
  assert.equal(slot.ammo, WEAPONS.blunderbuss.ammo - 1);
  slot.ammo = 0;
  slot.loaded = 0;
  slot.reloadLeft = 0;
  const ev = step(w, { ...idleInput(vec(900, 0)), shoot: true }, 0.6);
  assert.ok(ev.some((e) => e.type === "empty"), "click of an empty gun");
});

test("the starting pistol never runs dry", () => {
  const w = room();
  const slot = w.player.weapons[0];
  assert.equal(slot.ammo, Infinity);
  step(w, { ...idleInput(vec(900, 0)), shoot: true }, 6);
  assert.equal(slot.ammo, Infinity);
});

test("an arquebus ball passes through a line of guards", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "arquebus");
  const line = [200, 300, 400].map((d) => {
    const u = w.spawn("arquebusier", vec(p.pos.x, p.pos.y - d));
    freeze(u);
    return u;
  });
  step(w, { ...idleInput(vec(p.pos.x, 0)), shoot: true }, DT);
  step(w, idleInput(vec(p.pos.x, 0)), 0.5);
  assert.ok(line.every((u) => !u.alive || u.hp < u.maxHp), "every guard in the line was hit");
});

test("occult weapons cost souls, half in the dark, and the howling skull stuns", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "howler");
  const g = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 150));
  freeze(g);
  p.souls = 0;
  let ev = step(w, { ...idleInput(g.pos), shoot: true }, DT);
  assert.ok(ev.some((e) => e.type === "noSouls"));
  step(w, idleInput(g.pos), 0.5);
  p.souls = 5;
  w.dark = false;
  step(w, { ...idleInput(g.pos), shoot: true }, DT);
  assert.equal(p.souls, 3, "two souls in the open");
  step(w, idleInput(g.pos), 0.2);
  assert.ok(g.st.stun > 0 || !g.alive, "the scream stuns");
  w.dark = true;
  step(w, idleInput(g.pos), 1);
  step(w, { ...idleInput(g.pos), shoot: true }, DT);
  assert.equal(p.souls, 2, "one soul in the dark");
});

test("a lobbed mortar shell blows up where it lands, sparing the necromancer", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "mortar");
  const target = vec(p.pos.x + 400, p.pos.y);
  const a = w.spawn("peasant", vec(target.x + 30, target.y));
  const b = w.spawn("peasant", vec(target.x - 40, target.y + 20));
  freeze(a);
  freeze(b);
  const ev = step(w, { ...idleInput(target), shoot: true }, DT);
  ev.push(...step(w, idleInput(target), 1.2));
  assert.ok(ev.some((e) => e.type === "explosion"));
  assert.ok(!a.alive && !b.alive, "both peasants caught in the blast");
  assert.equal(p.halves, p.maxHalves);
});

test("the crossbow is silent: no flash gives the necromancer away in the dark", () => {
  const w = room();
  w.dark = true;
  w.alarm = false;
  const p = w.player;
  giveWeapon(p, "crossbow");
  w.spawn("halberdier", vec(p.pos.x + 250, p.pos.y - 100), "enemy", { state: "idle" });
  step(w, { ...idleInput(vec(p.pos.x - 300, p.pos.y - 300)), shoot: true }, DT);
  assert.equal(w.lights.filter((l) => l.kind === "flash").length, 0);
  step(w, idleInput(), 0.3);
  assert.equal(w.alarm, false);
});

test("the inquisitor's crossbow looses a burst of three bolts with one click", () => {
  const w = room();
  giveWeapon(w.player, "inqcrossbow");
  const ev = step(w, { ...idleInput(vec(900, 0)), shoot: true }, DT);
  ev.push(...step(w, idleInput(vec(900, 0)), 0.4));
  assert.equal(ev.filter((e) => e.type === "shot").length, 3);
});

test("the headsman's legend finishes off a wounded guard", () => {
  const w = room();
  const p = w.player;
  giveWeapon(p, "headsman");
  const g = w.spawn("knight", vec(p.pos.x, p.pos.y - 250));
  freeze(g);
  g.facing = vec(1, 0); // shield turned away
  g.hp = UNITS.knight.hp * 0.9;
  step(w, { ...idleInput(g.pos), shoot: true }, DT);
  step(w, idleInput(g.pos), 0.3);
  assert.equal(g.alive, false, "20 damage leaves him under the threshold: executed");
});
