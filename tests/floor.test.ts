/** The floor: rooms, doors, travelling between rooms, finishing the floor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Floor, OPPOSITE } from "../src/game/floor.js";
import { World, idleInput, type GameEvent, type InputState, type Side } from "../src/game/world.js";
import { CONFIG } from "../src/game/config.js";
import { vec } from "../src/game/math.js";

const DT = 1 / 60;
const run = (f: Floor, input: InputState | (() => InputState), seconds: number): GameEvent[] => {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) all.push(...f.update(DT, typeof input === "function" ? input() : input));
  return all;
};
const dirOf: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

/** Walk the player straight out through the given door of the current room. */
function walkOut(f: Floor, side: Side): GameEvent[] {
  const w = f.world;
  const c = w.doorCenter(side);
  // line up with the doorway first
  w.player.pos = side === "N" || side === "S" ? vec(c.x, w.player.pos.y) : vec(w.player.pos.x, c.y);
  const [dx, dy] = dirOf[side];
  const all: GameEvent[] = [];
  for (let t = 0; t < 6; t += DT) {
    const ev = f.update(DT, { ...idleInput(), move: vec(dx, dy) });
    all.push(...ev);
    if (ev.some((e) => e.type === "enterRoom")) break; // stop just inside the new room
  }
  return all;
}

test("a floor has its start, boss, special rooms and a hidden catacomb, all connected", () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const depth of [1, 3, 5]) {
      const f = new Floor(seed, { depth });
      const count = (t: string) => f.rooms.filter((r) => r.type === t).length;
      assert.equal(count("start"), 1);
      assert.equal(count("boss"), 1);
      assert.ok(count("treasure") >= 1);
      assert.equal(count("shop"), 1);
      assert.equal(count("altar"), 1);
      assert.equal(count("miniboss"), 1);
      assert.ok(count("secret") <= 1);
      assert.ok(f.rooms.filter((r) => r.type !== "secret").length >= 10);
      for (const r of f.rooms) {
        assert.ok(r.id === 0 || r.depth > 0, "every room is reachable");
        for (const [side, to] of Object.entries(r.doors) as [Side, number][]) {
          assert.equal(f.rooms[to].doors[OPPOSITE[side]], r.id, "doors are two-way");
        }
      }
      const normal = f.rooms.filter((r) => r.type !== "secret");
      const boss = f.rooms.find((r) => r.type === "boss")!;
      assert.equal(boss.depth, Math.max(...normal.map((r) => r.depth)), "boss is the deepest room");
    }
  }
});

test("the sanctum is an antechamber and the Holy Flame", () => {
  const f = new Floor(3, { depth: 6 });
  assert.equal(f.rooms.length, 2);
  assert.equal(f.rooms[1].type, "final");
});

test("the same seed builds the same floor", () => {
  const a = new Floor(42);
  const b = new Floor(42);
  assert.deepEqual(
    a.rooms.map((r) => [r.gx, r.gy, r.type, r.layout]),
    b.rooms.map((r) => [r.gx, r.gy, r.type, r.layout]),
  );
});

test("walking through a door enters the next room and keeps hearts, souls and minions", () => {
  const f = new Floor(7);
  const start = f.world;
  const p = f.player;
  p.souls = 3;
  p.halves = 4;
  start.spawn("halberdier", vec(p.pos.x + 60, p.pos.y), "minion");
  const [side, to] = Object.entries(f.node.doors)[0] as [Side, number];
  const ev = walkOut(f, side);
  assert.ok(ev.some((e) => e.type === "enterRoom" && e.room === to), "entered the neighbour");
  assert.equal(f.current, to);
  assert.equal(f.player.souls, 3);
  assert.equal(f.player.halves, 4);
  assert.equal(f.world.minions.length, 1, "the minion followed");
  assert.equal(start.minions.length, 0);
});

test("doors shut when the alarm sounds and open once the room is cleared", () => {
  const w = new World();
  w.addDoor("N", 1);
  w.dark = true;
  w.alarm = false;
  const g = w.spawn("halberdier", vec(300, 300), "enemy", { state: "idle" });
  assert.equal(w.doorsOpen, true, "before the alarm you can still back out");
  w.raiseAlarm(g);
  assert.equal(w.doorsOpen, false);
  // the player cannot walk out through a shut door
  w.player.pos = vec(w.doorCenter("N").x, 200);
  for (let i = 0; i < 120; i++) w.update(DT, { ...idleInput(), move: vec(0, -1) });
  assert.ok(w.player.pos.y >= CONFIG.room.wall + CONFIG.player.radius - 0.01, "stopped at the wall");
  g.alive = false;
  w.update(DT, idleInput());
  assert.equal(w.doorsOpen, true);
});

test("a room you left keeps its state", () => {
  const f = new Floor(9);
  const [side] = Object.entries(f.node.doors)[0] as [Side, number];
  walkOut(f, side);
  const second = f.world;
  const corpses = second.corpses.length;
  // come back the way we came
  walkOut(f, OPPOSITE[side]);
  assert.equal(f.current, 0);
  walkOut(f, side);
  assert.equal(f.world, second, "the same room object, not rebuilt");
  assert.equal(f.world.corpses.length, corpses);
});

test("the treasure room's bone altar heals and gives souls once", () => {
  const w = new World();
  w.shrine = { pos: vec(900, 500), used: false };
  w.player.halves = 2;
  w.player.pos = vec(900, 600);
  const ev: GameEvent[] = [];
  for (let i = 0; i < 60; i++) {
    w.update(DT, { ...idleInput(), move: vec(0, -1) });
    ev.push(...w.events);
  }
  assert.equal(ev.filter((e) => e.type === "shrine").length, 1);
  assert.equal(w.player.halves, 4);
  assert.equal(w.player.souls, 2);
});

test("clearing the boss room finishes the floor", () => {
  const f = new Floor(11);
  const boss = f.rooms.find((r) => r.type === "boss")!;
  // jump straight there for the test
  f.travel("N", boss.id);
  assert.equal(f.node.type, "boss");
  assert.ok(f.world.units.some((u) => u.def.boss), "the floor's boss is there");
  for (const u of f.world.units) u.alive = false;
  const ev = run(f, idleInput(), DT * 2);
  assert.ok(ev.some((e) => e.type === "floorCleared"));
  assert.equal(f.cleared, true);
});

test("guards never start right at a doorway", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const f = new Floor(seed);
    for (const r of f.rooms) {
      if (r.type !== "combat") continue;
      f.travel("N", r.id);
      const w = f.world;
      for (const d of w.doors) {
        const c = w.doorCenter(d.side);
        for (const u of w.enemies) assert.ok(Math.hypot(u.pos.x - c.x, u.pos.y - c.y) > 300, `seed ${seed} room ${r.id}`);
      }
    }
  }
});
