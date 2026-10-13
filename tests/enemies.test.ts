/** Every faction: their behaviours, counters to stealth and reactions to the minions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { UNITS, type UnitKind } from "../src/game/data/units.js";
import { makeRng, vec } from "../src/game/math.js";
import { enemyBullet, freeze, step } from "./helpers.js";

test("every kind of unit runs on both sides without breaking the simulation", () => {
  const kinds = (Object.keys(UNITS) as UnitKind[]).filter((k) => !UNITS[k].boss);
  for (const kind of kinds) {
    const w = new World(makeRng(3));
    w.player.halves = 999;
    w.player.maxHalves = 999;
    w.spawn(kind, vec(500, 300));
    w.spawn(kind, vec(1300, 700), "minion");
    w.spawn("halberdier", vec(1500, 300));
    for (let t = 0; t < 6; t += 1 / 60) w.update(1 / 60, idleInput(vec(900, 300)));
    assert.ok(true, kind);
  }
});

test("a guard dog smells the necromancer in the dark and barks", () => {
  const w = new World(makeRng(5));
  w.dark = true;
  w.alarm = false;
  w.spawn("dog", vec(w.player.pos.x + 230, w.player.pos.y), "enemy", { state: "idle" });
  const ev = step(w, idleInput(), 0.2);
  assert.ok(ev.some((e) => e.type === "bark"));
  assert.equal(w.alarm, true);
});

test("the mob panics at the sight of the walking dead", () => {
  const w = new World(makeRng(9));
  const peasants = [0, 1, 2, 3].map((i) => w.spawn("peasant", vec(500 + i * 60, 300)));
  w.spawn("halberdier", vec(560, 420), "minion");
  step(w, idleInput(), 3);
  assert.ok(peasants.some((p) => p.st.fear > 0 || p.fleeFrom), "at least one ran away");
});

test("a monk's exorcism burns the undead inside the circle", () => {
  const w = new World(makeRng(11));
  w.player.pos = vec(1600, 1000);
  const monk = w.spawn("monk", vec(600, 500));
  const m = w.spawn("halberdier", vec(700, 520), "minion");
  freeze(m);
  const ev = step(w, idleInput(), 9);
  assert.ok(ev.some((e) => e.type === "exorcism"));
  assert.ok(m.hp < m.maxHp || !m.alive, "the minion was caught");
  assert.ok(monk.alive);
});

test("a holy knight's shield stops bullets from the front, not from behind", () => {
  const w = new World(makeRng(13));
  w.player.pos = vec(1700, 1000);
  const k = w.spawn("knight", vec(900, 500));
  freeze(k);
  k.state = "approach";
  k.timer = 0;
  k.facing = vec(0, 1); // shield towards the south
  k.state = "windup";
  k.timer = 99;
  w.bullets.push({ ...enemyBullet(vec(900, 700), vec(0, -900)), side: "minion", fromPlayer: true, damage: 4, halves: 0 });
  let ev = step(w, idleInput(), 0.3);
  assert.ok(ev.some((e) => e.type === "shieldBlock"));
  assert.equal(k.hp, k.maxHp);
  w.bullets.push({ ...enemyBullet(vec(900, 300), vec(0, 900)), side: "minion", fromPlayer: true, damage: 4, halves: 0 });
  ev = step(w, idleInput(), 0.3);
  assert.ok(k.hp < k.maxHp, "hit in the back");
});

test("occult rivals attack the city guard too", () => {
  const w = new World(makeRng(17));
  w.player.pos = vec(1700, 1000);
  const guard = w.spawn("halberdier", vec(500, 400));
  freeze(guard);
  w.spawn("feral", vec(620, 420));
  step(w, idleInput(), 4);
  assert.ok(guard.hp < guard.maxHp || !guard.alive);
});

test("a bellringer runs to the bell and alarms the neighbouring rooms", () => {
  const w = new World(makeRng(19));
  let called = 0;
  w.ctx.alarmNeighbours = () => (called += 1);
  w.player.pos = vec(1700, 1000);
  w.addInteractable("bell", vec(400, 200));
  w.spawn("bellringer", vec(700, 400));
  const ev = step(w, idleInput(), 6);
  assert.ok(ev.some((e) => e.type === "bell" && e.done));
  assert.equal(w.bellRung, true);
  assert.ok(called > 0);
});

test("an alchemist's flask leaves burning, glowing ground", () => {
  const w = new World(makeRng(23));
  w.player.halves = 99;
  w.spawn("alchemist", vec(900, 200));
  step(w, idleInput(), 6);
  assert.ok(w.zones.some((z) => z.kind === "fire") || w.lights.some((l) => l.kind === "fire"), "fire on the floor");
});

test("a dead torchbearer's torch sets the floor alight", () => {
  const w = new World(makeRng(29));
  const t = w.spawn("torchbearer", vec(600, 400));
  assert.ok(w.lights.some((l) => l.owner === t.id && l.kind === "carried"));
  t.hp = 0.1;
  w.bullets.push({ ...enemyBullet(vec(600, 600), vec(0, -900)), side: "minion", fromPlayer: true, damage: 4, halves: 0 });
  step(w, idleInput(), 0.3);
  assert.equal(t.alive, false);
  assert.ok(w.zones.some((z) => z.kind === "fire"));
});

test("a raised monk tends the other minions", () => {
  const w = new World(makeRng(31));
  w.spawn("monk", vec(800, 600), "minion");
  const hurt = w.spawn("halberdier", vec(860, 600), "minion");
  hurt.hp = 2;
  const ev = step(w, idleInput(), 8);
  assert.ok(ev.some((e) => e.type === "heal"));
  assert.ok(hurt.hp > 2);
});
