/** A whole run: floors in order, the way down, saving and restoring, bells, the catacombs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Run } from "../src/game/run.js";
import { Floor, OPPOSITE } from "../src/game/floor.js";
import { idleInput, type Side } from "../src/game/world.js";
import { giveItem, giveWeapon } from "../src/game/stats.js";
import { DT } from "./helpers.js";
import { damageUnit } from "../src/game/combat.js";

test("the stairs after a boss lead down, floor after floor, to the sanctum", () => {
  const run = new Run({ seed: 5 });
  const themes: string[] = [];
  for (let i = 0; i < 6; i++) {
    themes.push(run.world.theme);
    if (i < 5) {
      const boss = run.floor.rooms.find((r) => r.type === "boss")!;
      run.floor.travel("N", boss.id);
      for (const u of run.world.units) {
        u.hp = 0.01;
      }
      // kill the boss properly so the stairs appear
      const b = run.world.units.find((u) => u.def.boss)!;
      b.boss!.intro = 0;
      run.world.player.pos = { x: b.pos.x, y: b.pos.y + 200 };
      for (let t = 0; t < 3 && b.alive; t += DT) run.update(DT, { ...idleInput(b.pos), shoot: true });
      // some bosses hide behind something (a strongbox, a shield): finish him by hand then
      if (b.alive) damageUnit(run.world, b, 9999, { x: 0, y: 1 }, { fromPlayer: true });
      for (let t = 0; t < 0.2; t += DT) run.update(DT, idleInput());
      assert.equal(b.alive, false, `boss of floor ${i + 1} died`);
      const stairs = run.world.interactables.find((x) => x.kind === "stairs")!;
      assert.ok(stairs, "stairs appeared");
      run.world.player.pos = { ...stairs.pos };
      run.update(DT, { ...idleInput(), interact: true });
    }
  }
  assert.deepEqual(themes, ["cmentarz", "slumsy", "kupiecka", "klasztor", "katedra", "sanktuarium"]);
  assert.equal(run.depth, 6);
  assert.equal(run.floor.rooms[1].type, "final");
});

test("a saved run comes back at the start of its floor with everything carried", () => {
  const run = new Run({ seed: 9, character: "grabarz" });
  const p = run.player;
  giveWeapon(p, "arquebus");
  giveItem(p, "powder");
  p.gold = 77;
  p.souls = 4;
  p.weapons[1].ammo = 12;
  run.descend();
  const saved = JSON.parse(JSON.stringify(run.snapshot()));
  const back = new Run({}, saved);
  assert.equal(back.depth, 2);
  assert.equal(back.world.theme, "slumsy");
  assert.equal(back.player.gold, 77);
  assert.equal(back.player.souls, 4);
  assert.deepEqual(back.player.items, ["powder"]);
  assert.equal(back.player.weapons[1].id, "arquebus");
  assert.equal(back.player.weapons[1].ammo, 12);
  assert.equal(back.player.weapons[0].ammo, Infinity);
  assert.ok(back.player.stats.firearmDamageMul > 1, "item stats restored");
});

test("a rung bell readies the neighbouring rooms", () => {
  const f = new Floor(21, { depth: 4 });
  const [side, to] = Object.entries(f.node.doors)[0] as [Side, number];
  f.travel(side, to);
  const here = f.current;
  f.world.ctx.alarmNeighbours!();
  const neighbours = Object.values(f.rooms[here].doors).map((id) => f.rooms[id!]);
  assert.ok(neighbours.some((n) => n.alarmed && n.type !== "start"));
  const target = neighbours.find((n) => n.alarmed && n.type === "combat");
  if (target) {
    const back = (Object.entries(f.rooms[here].doors) as [Side, number][]).find(([, id]) => id === target.id)![0];
    f.travel(back, target.id);
    assert.equal(f.world.alarm, true, "the next room waits ready");
    void OPPOSITE;
  }
});

test("the catacombs hide behind a cracked wall that a few shots break open", () => {
  for (let seed = 1; seed < 30; seed++) {
    const f = new Floor(seed, { depth: 1 });
    const host = f.rooms.find((r) => Object.keys(r.secretDoors).length > 0);
    if (!host) continue;
    f.travel("N", host.id);
    const w = f.world;
    const wall = w.interactables.find((i) => i.kind === "secret")!;
    assert.ok(wall && wall.hidden, "hidden at first");
    assert.equal(w.usableDoors.some((d) => d.secret), false);
    const side = wall.side!;
    // stand near the wall and shoot it
    const inward = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, W: { x: 1, y: 0 }, E: { x: -1, y: 0 } }[side];
    w.player.pos = { x: wall.pos.x + inward.x * 300, y: wall.pos.y + inward.y * 300 };
    for (const u of w.units) u.alive = false;
    for (let i = 0; i < 4; i++) {
      for (let t = 0; t < 0.4; t += DT) f.update(DT, { ...idleInput(wall.pos), shoot: t < DT });
      for (let t = 0; t < 1.3; t += DT) f.update(DT, idleInput(wall.pos));
    }
    assert.equal(wall.used, true, "the wall gave way");
    assert.ok(w.usableDoors.some((d) => d.secret));
    return;
  }
  assert.fail("no floor with catacombs among the seeds");
});

// ------------------------------------------------------------------ secret floors
/** Walk into the catacombs of the run's current floor (built on the spot). */
function intoCatacombs(run: Run): void {
  const secret = run.floor.rooms.find((r) => r.type === "secret")!;
  run.floor.travel("N", secret.id);
}

test("the catacombs of floors 1-4 hide a padlocked trapdoor to a secret floor", () => {
  const want: Record<number, string | undefined> = { 1: "ossuarium", 2: "ossuarium", 3: "lochy", 4: "lochy", 5: undefined };
  for (let depth = 1; depth <= 5; depth++) {
    const run = new Run({ seed: 21 });
    while (run.depth < depth) run.descend();
    intoCatacombs(run);
    const hatch = run.world.interactables.find((i) => i.kind === "hatch");
    assert.equal(hatch?.ref, want[depth], `floor ${depth}`);
  }
});

test("a key opens the trapdoor; the secret floor leads down to the next floor", () => {
  const run = new Run({ seed: 21 });
  intoCatacombs(run);
  const hatch = run.world.interactables.find((i) => i.kind === "hatch")!;
  run.world.player.keys = 0;
  run.world.player.pos = { ...hatch.pos };
  let ev = run.update(DT, { ...idleInput(), interact: true });
  assert.ok(ev.some((e) => e.type === "needKey"), "no key, no way down");
  assert.equal(run.secret, null);
  run.world.player.keys = 1;
  ev = run.update(DT, { ...idleInput(), interact: true });
  assert.ok(ev.some((e) => e.type === "hatch"));
  assert.equal(run.secret, "ossuarium");
  assert.equal(run.depth, 1, "a secret floor lies between floors");
  assert.equal(run.world.theme, "ossuarium");
  assert.equal(run.player.keys, 0);
  // the layout: a landing, fights, a vault with a reliquary, the guardian
  const types = run.floor.rooms.map((r) => r.type);
  assert.deepEqual([...types].sort(), ["combat", "combat", "combat", "guardian", "start", "treasure"]);
  const vault = run.floor.rooms.find((r) => r.type === "treasure")!;
  run.floor.travel("N", vault.id);
  assert.ok(run.world.chests.some((c) => c.tier === "reliquary"), "the vault holds a reliquary");
  // the guardian falls: echo, a heart and the stairs on
  const guard = run.floor.rooms.find((r) => r.type === "guardian")!;
  run.floor.travel("N", guard.id);
  const elite = run.world.units.find((u) => u.elite);
  assert.ok(elite && elite.kind === "summoner" && elite.champion, "the ossuary's guardian: a summoner with a champion's gift");
  for (const u of run.world.units) u.hp = 0.01;
  run.world.player.pos = { x: run.world.room.w / 2, y: run.world.room.h - 200 };
  ev = [];
  for (let t = 0; t < 4 && !run.world.interactables.some((i) => i.kind === "stairs"); t += DT) {
    const target = run.world.units.find((u) => u.alive && u.team !== "minion");
    ev.push(...run.update(DT, { ...idleInput(target?.pos ?? run.world.player.pos), shoot: true }));
  }
  const stairs = run.world.interactables.find((i) => i.kind === "stairs");
  assert.ok(stairs, "the way on");
  assert.ok(run.world.pickups.some((p) => p.kind === "echo"), "echo of souls");
  run.world.player.pos = { ...stairs!.pos };
  run.update(DT, { ...idleInput(), interact: true });
  assert.equal(run.secret, null);
  assert.equal(run.depth, 2, "out onto the slums");
  // its trapdoor does not open twice in one run
  intoCatacombs(run);
  assert.equal(run.world.interactables.some((i) => i.kind === "hatch"), false);
});

test("a run saved on a secret floor comes back there", () => {
  const run = new Run({ seed: 33 });
  while (run.depth < 3) run.descend();
  run.enterSecret("lochy");
  const back = new Run({}, run.snapshot());
  assert.equal(back.secret, "lochy");
  assert.equal(back.depth, 3);
  assert.equal(back.world.theme, "lochy");
  assert.deepEqual(back.secretsSeen, ["lochy"]);
});
