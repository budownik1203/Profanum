/** More of them: waves, help from next door, the bell, ambushes, the rite, the hunt, the last stand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { Floor } from "../src/game/floor.js";
import { planRoom } from "../src/game/reinforce.js";
import { damageUnit } from "../src/game/combat.js";
import { FLOORS } from "../src/game/data/floors.js";
import { makeRng, vec } from "../src/game/math.js";
import type { GameEvent } from "../src/game/types.js";
import { DT } from "./helpers.js";

function room(seed = 1): World {
  const w = new World(makeRng(seed), { w: 1800, h: 1100 });
  w.dark = false;
  w.alarm = false;
  w.player.halves = w.player.maxHalves = 999;
  w.player.pos = vec(900, 900);
  w.addDoor("N", 1);
  w.addDoor("E", 2);
  return w;
}

function run(w: World, seconds: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, idleInput(vec(900, 300)));
    all.push(...w.events);
  }
  return all;
}

const killAll = (w: World) => {
  for (const u of w.units) if (u.alive && u.team !== "minion") damageUnit(w, u, 999, vec(0, 1), { fromPlayer: true });
};

test("a wave walks in through the far door when the garrison thins out; the room isn't cleared before", () => {
  const w = room();
  const guards = [0, 1, 2, 3, 4, 5].map((i) => w.spawn("halberdier", vec(500 + i * 100, 400), "enemy", { state: "idle" }));
  planRoom(w, FLOORS[1], () => 1);
  w.reinforce!.waves = [["arquebusier", "arquebusier", "halberdier"]];
  w.raiseAlarm(guards[0]);
  guards.slice(0, 4).forEach((g) => damageUnit(w, g, 999, vec(0, 1)));
  const ev = run(w, 0.2);
  assert.ok(ev.some((e) => e.type === "reinforcements"));
  assert.equal(w.units.filter((u) => u.alive && u.kind === "arquebusier").length, 2);
  // the newcomers come in at a doorway, not next to the necromancer
  for (const u of w.units.filter((x) => x.kind === "arquebusier")) assert.ok(Math.hypot(u.pos.x - 900, u.pos.y - 900) > 300);
  // all dead at once: still the wave comes before the room counts as cleared
  const w2 = room(2);
  const g2 = [0, 1].map((i) => w2.spawn("peasant", vec(600 + i * 100, 400), "enemy", { state: "idle" }));
  planRoom(w2, FLOORS[1], () => 1);
  w2.reinforce!.waves = [["peasant"]];
  w2.raiseAlarm(g2[0]);
  killAll(w2);
  const ev2 = run(w2, 0.1);
  assert.ok(!ev2.some((e) => e.type === "roomCleared"));
  assert.ok(ev2.some((e) => e.type === "reinforcements"));
});

test("spotted in a quiet room: help from next door comes a few seconds later", () => {
  const w = room(3);
  const g = w.spawn("arquebusier", vec(700, 300), "enemy", { state: "idle" });
  planRoom(w, FLOORS[1], () => 1);
  w.reinforce!.call = { kinds: ["halberdier", "halberdier"], t: 3 };
  w.raiseAlarm(g);
  let ev = run(w, 2);
  assert.ok(!ev.some((e) => e.type === "reinforcements"));
  ev = run(w, 1.5);
  assert.ok(ev.some((e) => e.type === "reinforcements"));
  assert.equal(w.units.filter((u) => u.kind === "halberdier").length, 2);
});

test("an ambush: nobody to be seen until he comes close, then they burst out", () => {
  const w = room(4);
  const a = w.spawn("peasant", vec(900, 500), "enemy", { state: "idle" });
  const b = w.spawn("halberdier", vec(1300, 400), "enemy", { state: "idle" });
  a.hidden = b.hidden = true;
  planRoom(w, FLOORS[1], () => 1);
  w.player.pos = vec(900, 900);
  run(w, 1);
  assert.ok(a.hidden && !w.alarm, "they wait unseen");
  w.player.pos = vec(900, 700);
  const ev = run(w, 0.2);
  assert.ok(ev.some((e) => e.type === "ambushOut"));
  assert.ok(!a.hidden && !b.hidden && w.alarm, "one bursts out, the alarm brings the rest");
});

test("the tolling bell brings someone every few seconds, four at most, until the ringer falls", () => {
  const w = room(5);
  const ringer = w.spawn("bellringer", vec(500, 400), "enemy", { state: "idle" });
  w.addInteractable("bell", vec(450, 140), { radius: 60 });
  planRoom(w, FLOORS[3], () => 1);
  w.raiseAlarm(ringer);
  const ev = run(w, 30);
  const came = ev.filter((e) => e.type === "reinforcements").length;
  assert.ok(came >= 3 && came <= 4, `answered: ${came}`);
});

test("a summoning circle keeps spitting out the wild dead until the last cultist falls", () => {
  const w = room(6);
  const c = w.spawn("cultist", vec(400, 300), undefined, { state: "idle" });
  planRoom(w, FLOORS[2], () => 1);
  const z = w.addZone({ kind: "rite", pos: vec(500, 360), radius: 80, life: 9999, warn: 0, side: "feral", dps: 0, burst: 0, halves: 0, permanent: true });
  w.reinforce!.rite = { pos: vec(500, 360), t: 1, n: 0, zone: z.id };
  w.raiseAlarm(c);
  run(w, 6.5);
  assert.ok(w.units.filter((u) => u.kind === "feral").length >= 2);
  damageUnit(w, c, 999, vec(0, 1));
  const ev = run(w, 0.2);
  assert.ok(ev.some((e) => e.type === "riteBroken"));
  assert.ok(!w.zones.some((x) => x.id === z.id));
});

test("the last stand: doors shut, groups from every door for 40 seconds, then a chest", () => {
  const w = room(7);
  planRoom(w, FLOORS[2], () => 1, { hold: true });
  const ev: GameEvent[] = [];
  for (let t = 0; t < 41; t += DT) {
    w.update(DT, idleInput(vec(900, 300)));
    ev.push(...w.events);
    if (t > 1 && t < 39) assert.equal(w.doorsOpen, false);
    killAll(w);
  }
  assert.ok(ev.filter((e) => e.type === "reinforcements" && e.first).length >= 4, "group after group");
  run(w, 0.5);
  assert.ok(w.reinforce!.hold!.done);
  assert.ok(w.chests.length === 1);
  assert.ok(w.doorsOpen);
});

test("after an alarm the hunt sweeps the floor and finds him in later rooms", () => {
  let hunted = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const f = new Floor(seed, { depth: 3 });
    f.hunt = true;
    for (const r of f.rooms.filter((x) => x.type === "combat")) {
      f.travel("N", r.id);
      if (f.world.reinforce?.hunt) hunted += 1;
    }
  }
  assert.ok(hunted > 5, `hunted rooms: ${hunted}`);
});
