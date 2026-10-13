/** Formations: the musket line's volleys and countermarch, the wedge, pavises, broken ranks, pyres, the wild dead. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { formSquads } from "../src/game/tactics.js";
import { makeRng, vec } from "../src/game/math.js";
import type { GameEvent, Unit } from "../src/game/types.js";
import type { UnitKind } from "../src/game/data/units.js";
import { DT } from "./helpers.js";

function room(seed = 1): World {
  const w = new World(makeRng(seed), { w: 2200, h: 1600 });
  w.dark = false;
  w.alarm = false;
  w.player.halves = w.player.maxHalves = 999;
  w.player.pos = vec(1100, 1350);
  return w;
}

const place = (w: World, kind: UnitKind, x: number, y: number): Unit => w.spawn(kind, vec(x, y), "enemy", { state: "idle" });

/** Run the room with the necromancer standing still; returns every event with its time. */
function run(w: World, seconds: number): { t: number; e: GameEvent }[] {
  const all: { t: number; e: GameEvent }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, idleInput(vec(1100, 300)));
    for (const e of w.events) all.push({ t, e });
  }
  return all;
}

test("a sergeant forms his musketeers into a line that fires as one, rank after rank", () => {
  const w = room();
  place(w, "sergeant", 1100, 300);
  const men = [900, 1000, 1200, 1300].map((x) => place(w, "arquebusier", x, 340));
  formSquads(w, makeRng(2), 2, null);
  assert.equal(w.squads.length, 1);
  assert.equal(w.squads[0].kind, "line");
  assert.ok(w.units.find((u) => u.kind === "sergeant")!.leader);
  w.raiseAlarm(men[0]);
  const ev = run(w, 14);
  const orders = ev.filter((x) => x.e.type === "squadOrder");
  assert.ok(orders.length >= 3, `volleys called: ${orders.length}`);
  // every volley: the rank's muskets go off within a moment of each other
  const shots = ev.filter((x) => x.e.type === "shot" && !(x.e as { fromPlayer: boolean }).fromPlayer);
  const first = orders[0].t;
  const volley = shots.filter((s) => s.t >= first && s.t < first + 1.2);
  assert.ok(volley.length >= 2, `shots in the first volley: ${volley.length}`);
  const spread = Math.max(...volley.map((s) => s.t)) - Math.min(...volley.map((s) => s.t));
  assert.ok(spread < 0.2, `volley spread ${spread}`);
  // countermarch: four muskets make two ranks, and the ranks take turns
  const ranks = new Set(men.map((u) => u.tac?.rank));
  assert.deepEqual([...ranks].sort(), [0, 1]);
});

test("halberds close in as a wedge and charge together; pews splinter in their way", () => {
  const w = room(3);
  const lead = place(w, "halberdier", 1100, 300);
  [1040, 1160, 980, 1220].forEach((x, i) => place(w, "halberdier", x, 250 - i * 10));
  const pew = w.addCover(1030, 1160, 140, 36, "pew");
  formSquads(w, makeRng(9), 3, { kind: "wedge", melee: "halberdier" });
  const sq = w.squads.find((s) => s.kind === "wedge");
  assert.ok(sq, "a wedge formed");
  assert.ok(w.units.find((u) => u.id === sq.leader)!.leader);
  w.raiseAlarm(lead);
  const ev = run(w, 11);
  const charge = ev.find((x) => x.e.type === "squadOrder" && (x.e as { order: string }).order === "charge");
  assert.ok(charge, "the wedge charged");
  const telegraphs = ev.filter((x) => x.e.type === "telegraph" && Math.abs(x.t - charge.t) < 0.05);
  assert.ok(telegraphs.length >= 3, `halberds winding up together: ${telegraphs.length}`);
  assert.ok(pew.broken, "the pew in the way splintered");
});

test("kill the leader and the formation falls apart", () => {
  const w = room(4);
  const sergeant = place(w, "sergeant", 1100, 300);
  const men = [900, 1000, 1200].map((x) => place(w, "arquebusier", x, 340));
  formSquads(w, makeRng(2), 2, null);
  w.raiseAlarm(men[0]);
  run(w, 1);
  sergeant.hp = 0;
  sergeant.alive = false;
  const ev = run(w, 0.5);
  assert.ok(ev.some((x) => x.e.type === "squadBroken"));
  assert.equal(w.squads.length, 0);
  for (const u of men) assert.equal(u.tac, undefined);
});

test("a paviser plants his shield before the musket line", () => {
  const w = room(5);
  place(w, "sergeant", 1100, 300);
  [950, 1250].forEach((x) => place(w, "arquebusier", x, 340));
  formSquads(w, makeRng(2), 3, { kind: "line", ranged: "arquebusier", pavise: true });
  const pv = w.units.find((u) => u.kind === "paviser");
  assert.ok(pv, "a paviser marches with the line");
  w.raiseAlarm(pv);
  const ev = run(w, 8);
  assert.ok(ev.some((x) => x.e.type === "pavise"), "the pavise went up");
  const pavise = w.covers.find((c) => c.kind === "pavise");
  assert.ok(pavise && !pavise.broken);
});

test("monks burn the bodies the necromancer could raise, unless he stands close", () => {
  const w = room(6);
  const monk = place(w, "monk", 600, 400);
  w.corpses.push({ id: 777, kind: "peasant", pos: vec(760, 450), dir: vec(1, 0), echo: 30, raises: 0, fromMinion: false, big: false });
  w.player.pos = vec(1900, 1400);
  w.raiseAlarm(monk);
  const ev = run(w, 8);
  assert.ok(ev.some((x) => x.e.type === "corpseBurned"), "the body went to the pyre");
  assert.ok(!w.corpses.some((c) => c.id === 777));
  // with the necromancer standing over a body, nobody comes to burn it
  const w2 = room(6);
  const m2 = place(w2, "monk", 600, 400);
  w2.corpses.push({ id: 778, kind: "peasant", pos: vec(760, 450), dir: vec(1, 0), echo: 30, raises: 0, fromMinion: false, big: false });
  w2.player.pos = vec(800, 480);
  w2.raiseAlarm(m2);
  const ev2: GameEvent[] = [];
  for (let t = 0; t < 4; t += DT) {
    w2.update(DT, idleInput(vec(600, 400)));
    ev2.push(...w2.events);
  }
  assert.ok(!ev2.some((e) => e.type === "corpseBurned"));
});

test("the wild dead wait in silence until the alarm, then go for whoever is nearest", () => {
  const w = room(7);
  w.dark = false; // in plain light: a guard would see the necromancer at once
  const feral = w.spawn("feral", vec(1100, 1000), undefined, { state: "idle" });
  run(w, 3);
  assert.equal(w.alarm, false, "the ferals don't raise the alarm");
  assert.equal(feral.state, "idle");
  // a guard spots the necromancer: now the ferals wake too, and pick the nearest body
  const guard = place(w, "halberdier", 1150, 1080);
  w.raiseAlarm(guard);
  assert.equal(w.targetFor(feral)?.unit?.id, guard.id, "the guard stands closer than the necromancer");
  run(w, 0.5);
  assert.notEqual(feral.state, "idle");
});
