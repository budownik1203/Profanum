/** Elites (their own fighters, not bigger guards), champions' gifts and the trial room. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { Floor } from "../src/game/floor.js";
import { damageUnit } from "../src/game/combat.js";
import { interact } from "../src/game/loot.js";
import { UNITS } from "../src/game/data/units.js";
import { FLOORS } from "../src/game/data/floors.js";
import { dist, makeRng, vec } from "../src/game/math.js";
import type { GameEvent, Unit } from "../src/game/types.js";
import { DT } from "./helpers.js";

function room(seed = 1): World {
  const w = new World(makeRng(seed), { w: 2000, h: 1400 });
  w.dark = false;
  w.player.halves = w.player.maxHalves = 999;
  w.player.pos = vec(1000, 1100);
  return w;
}

function run(w: World, seconds: number, aim = vec(1000, 300)): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, idleInput(aim));
    all.push(...w.events);
  }
  return all;
}

test("elites are their own kinds of fighters, as big as anyone, and every floor has some", () => {
  const elites = Object.values(UNITS).filter((d) => d.elite);
  assert.deepEqual(elites.map((d) => d.kind).sort(), ["butcher", "confessor", "grenadier", "summoner"]);
  for (const f of FLOORS) {
    assert.ok(f.elite.length > 0, f.id);
    for (const k of f.elite) assert.ok(UNITS[k].elite, `${f.id}: ${k}`);
  }
  const w = room();
  const g = w.spawn("grenadier", vec(500, 500));
  assert.equal(g.radius, UNITS.grenadier.radius, "not a bigger copy");
  assert.ok(g.elite);
});

test("the grenadier throws grenades in threes", () => {
  const w = room(2);
  w.spawn("grenadier", vec(1000, 500));
  w.alarm = true;
  const ev = run(w, 6);
  assert.ok(ev.filter((e) => e.type === "explosion").length >= 3);
});

test("the butcher's hook drags the necromancer in", () => {
  const w = room(3);
  const b = w.spawn("butcher", vec(1000, 750));
  b.cooldown = 0;
  w.alarm = true;
  const before = dist(w.player.pos, b.pos);
  let pulled = false;
  for (let t = 0; t < 5 && !pulled; t += DT) {
    w.update(DT, idleInput(vec(1000, 300)));
    if (w.events.some((e) => e.type === "hook" && e.hit)) pulled = true;
  }
  assert.ok(pulled, "the hook caught him");
  run(w, 0.4);
  assert.ok(dist(w.player.pos, b.pos) < before - 120, "and dragged him closer");
});

test("the confessor sprays holy fire, the summoner calls up the wild dead (only so many)", () => {
  const w = room(4);
  w.spawn("confessor", vec(1000, 850));
  w.alarm = true;
  const ev = run(w, 5);
  assert.ok(w.bullets.length > 0 || ev.filter((e) => e.type === "shot").length > 0 || w.zones.some((z) => z.kind === "holyfire"));
  const w2 = room(5);
  const s = w2.spawn("summoner", vec(1000, 500));
  w2.alarm = true;
  w2.player.pos = vec(1000, 1200);
  const ev2 = run(w2, 30, vec(1000, 500));
  assert.ok(ev2.some((e) => e.type === "summon"), "something crawled out");
  const ferals = w2.units.filter((u) => u.alive && u.master === s.id);
  assert.ok(ferals.length <= 4);
});

test("champions: armoured takes half, the explosive one leaves a blast, the splitting one falls in two", () => {
  const w = room(6);
  const a = w.spawn("halberdier", vec(500, 400));
  a.champion = "armored";
  damageUnit(w, a, 4, vec(1, 0));
  assert.equal(a.hp, a.maxHp - 2);
  const e = w.spawn("peasant", vec(800, 400));
  e.champion = "explosive";
  damageUnit(w, e, 99, vec(1, 0));
  assert.ok(w.zones.some((z) => z.kind === "slam" && dist(z.pos, vec(800, 400)) < 1), "a warned blast where he fell");
  const s = w.spawn("arquebusier", vec(1200, 400));
  s.champion = "splitting";
  const n = w.units.filter((u) => u.alive && u.kind === "arquebusier").length;
  damageUnit(w, s, 99, vec(1, 0));
  const halves = w.units.filter((u) => u.alive && u.kind === "arquebusier" && u.mini);
  assert.equal(halves.length, 2);
  assert.equal(w.units.filter((u) => u.alive && u.kind === "arquebusier").length, n + 1);
  for (const h of halves) assert.equal(h.champion, undefined, "the halves don't split again");
});

test("a healer champion prays his fellows back to health", () => {
  const w = room(7);
  const h = w.spawn("monk", vec(900, 400));
  h.champion = "healer";
  const friend = w.spawn("halberdier", vec(1000, 420));
  friend.hp = 2;
  w.alarm = true;
  run(w, 4);
  assert.ok(friend.hp > 2);
});

test("ordinary rooms get elites and champions now and then, more often deeper", () => {
  const count = (depth: number) => {
    let elites = 0;
    let champions = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const f = new Floor(seed, { depth });
      for (const r of f.rooms.filter((x) => x.type === "combat")) {
        f.travel("N", r.id);
        elites += f.world.units.filter((u) => u.elite).length;
        champions += f.world.units.filter((u) => u.champion).length;
      }
    }
    return { elites, champions };
  };
  const low = count(1);
  const high = count(5);
  assert.ok(low.elites > 0 && low.champions > 0, JSON.stringify(low));
  assert.ok(high.elites > low.elites && high.champions > low.champions, `${JSON.stringify(low)} → ${JSON.stringify(high)}`);
});

test("the trial room: the doors shut, the waves come, the last falls and the reward appears", () => {
  const f = new Floor(3, { depth: 2 });
  const node = f.rooms.find((r) => r.type === "miniboss")!;
  f.travel("N", node.id);
  const w = f.world;
  assert.ok(w.trial && !w.trial.active);
  assert.equal(w.enemies.length, 0, "empty until you touch the pillory");
  const pillory = w.interactables.find((i) => i.kind === "trial")!;
  w.player.pos = vec(pillory.pos.x, pillory.pos.y + 60);
  assert.ok(interact(w));
  assert.ok(w.trial.active);
  assert.equal(w.doorsOpen, false);
  const waves = w.trial.waves.length;
  let seen = 0;
  for (let t = 0; t < 120 && !w.trial.done; t += DT) {
    w.update(DT, idleInput(vec(0, 0)));
    if (w.events.some((e) => e.type === "trial" && e.stage === "wave")) seen += 1;
    // the necromancer is a fair hand: whatever walks in falls a moment later
    for (const u of w.units) if (u.alive && u.team !== "minion") damageUnit(w, u, 999, vec(0, 1), { fromPlayer: true });
  }
  assert.equal(seen, waves);
  assert.ok(w.trial.done);
  assert.equal(w.doorsOpen, true);
  assert.ok(w.chests.length > 0, "a chest for the winner");
});

void ({} as Unit);
