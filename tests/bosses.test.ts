/** The bosses: every arena and script runs, phases, the fight for light around them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { makeRng, vec, dist } from "../src/game/math.js";
import type { UnitKind } from "../src/game/data/units.js";
import type { GameEvent, Unit } from "../src/game/types.js";
import { setupBossArena } from "../src/game/bosses.js";
import { bossTakenMul, damageUnit, spawnBullet } from "../src/game/combat.js";
import { DT } from "./helpers.js";

const BOSSES: [UnitKind, number][] = [
  ["executioner", 1],
  ["captain", 2],
  ["powdermaster", 3],
  ["bishop", 4],
  ["grandinquisitor", 5],
  ["holyflame", 6],
];

function arena(kind: UnitKind, depth: number, seed = 3): { w: World; boss: Unit } {
  const rng = makeRng(seed);
  const w = new World(rng, { w: 2200, h: 1400 });
  w.roomType = depth >= 6 ? "final" : "boss";
  w.ctx = { depth, grace: false };
  const boss = setupBossArena(w, kind, depth, rng);
  w.player.pos = vec(1100, 1150);
  return { w, boss };
}

/** Keep the necromancer standing for long scripted fights. */
function immortal(w: World): void {
  w.player.maxHalves = 9999;
  w.player.halves = 9999;
}

test("every boss goes through its attacks, crosses into its next phase and stays in its arena", () => {
  for (const [kind, depth] of BOSSES) {
    const { w, boss } = arena(kind, depth);
    immortal(w);
    const steps = new Set<string>();
    let enemyBullets = 0;
    let phaseEvents = 0;
    let t = 0;
    for (; t < 50; t += DT) {
      // strafe left and right in front of it, shooting
      const sx = Math.sin(t * 0.7) > 0 ? 1 : -1;
      w.update(DT, { ...idleInput(boss.pos), move: vec(sx, 0), shoot: true });
      if (t > 22 && t < 22 + DT * 1.5) boss.hp = Math.min(boss.hp, boss.maxHp * 0.45);
      if (t > 22 && kind === "holyflame" && boss.hp > boss.maxHp * 0.2 && t > 36) boss.hp = boss.maxHp * 0.2;
      if (boss.hp < boss.maxHp * 0.1) boss.hp = boss.maxHp * 0.1; // keep it alive for the whole test
      steps.add(boss.boss!.step);
      enemyBullets += w.bullets.filter((b) => !b.fromPlayer && b.side === "enemy").length > 0 ? 1 : 0;
      phaseEvents += w.events.filter((e) => e.type === "bossPhase").length;
      assert.ok(Number.isFinite(boss.pos.x) && Number.isFinite(boss.pos.y), `${kind}: position stays a number`);
      assert.ok(boss.pos.x > 0 && boss.pos.y > 0 && boss.pos.x < w.room.w && boss.pos.y < w.room.h, `${kind}: stays in the arena (${boss.pos.x}, ${boss.pos.y})`);
    }
    const attacks = [...steps].filter((s) => s !== "idle" && s !== "intro" && s !== "phase");
    assert.ok(attacks.length >= 4, `${kind} used several attacks: ${attacks.join(", ")}`);
    assert.ok(enemyBullets > 0, `${kind} fired bullets`);
    assert.ok(phaseEvents >= 1, `${kind} entered phase 2`);
    assert.ok(w.player.halves < 9999, `${kind} landed a hit on a strafing necromancer`);
    if (kind === "holyflame") assert.equal(boss.boss!.phase, 3, "the Flame reaches its last phase");
  }
});

test("a boss shrugs off hits in its light and bleeds in the dark", () => {
  const { w, boss } = arena("executioner", 1);
  boss.boss!.intro = 0;
  const pyre = w.lights.find((l) => l.kind === "pyre")!;
  boss.pos = vec(pyre.pos.x + 40, pyre.pos.y);
  assert.equal(bossTakenMul(w, boss), 0.75);
  let before = boss.hp;
  damageUnit(w, boss, 10, vec(1, 0));
  assert.ok(Math.abs(before - boss.hp - 7.5) < 1e-6);
  for (const l of w.lights) l.on = false;
  assert.equal(bossTakenMul(w, boss), 1.3);
  before = boss.hp;
  damageUnit(w, boss, 10, vec(1, 0));
  assert.ok(Math.abs(before - boss.hp - 13) < 1e-6);
});

test("a boss cannot be hurt while it makes its entrance", () => {
  const { w, boss } = arena("captain", 2);
  const hp = boss.hp;
  damageUnit(w, boss, 50, vec(1, 0));
  assert.equal(boss.hp, hp);
  for (let t = 0; t < 2.6; t += DT) w.update(DT, idleInput());
  damageUnit(w, boss, 50, vec(1, 0));
  assert.ok(boss.hp < hp);
});

test("the Holy Flame is shielded while four braziers burn, and its own glow does not count as light", () => {
  const { w, boss } = arena("holyflame", 6);
  boss.boss!.intro = 0;
  immortal(w);
  w.update(DT, idleInput());
  assert.equal(boss.boss!.mem.shield, 1);
  assert.equal(bossTakenMul(w, boss), 0.4);
  const braziers = w.lights.filter((l) => l.kind === "brazier");
  assert.equal(braziers.length, 6);
  for (const l of braziers.slice(0, 3)) l.on = false;
  w.update(DT, idleInput());
  assert.equal(boss.boss!.mem.shield, 0);
  // two braziers on the far side of the ellipse do not reach it: only its own fire glows there
  const lit = braziers.slice(3).some((l) => dist(l.pos, boss.pos) < l.radius);
  assert.equal(bossTakenMul(w, boss), lit ? 0.75 : 1.3);
});

test("the Holy Flame sends a tongue of fire to relight its braziers", () => {
  const { w, boss } = arena("holyflame", 6);
  boss.boss!.intro = 0;
  immortal(w);
  for (const l of w.lights) if (l.kind === "brazier") l.on = false;
  const ev: GameEvent[] = [];
  for (let t = 0; t < 8; t += DT) {
    w.update(DT, idleInput());
    ev.push(...w.events);
  }
  assert.ok(ev.some((e) => e.type === "relight" && e.by === boss.id), "a brazier burns again");
  assert.ok(w.lights.some((l) => l.kind === "brazier" && l.on));
});

test("the bishop's litter breaks into bodies to raise", () => {
  const { w, boss } = arena("bishop", 4);
  boss.boss!.intro = 0;
  immortal(w);
  const corpses = w.corpses.length;
  boss.hp = boss.maxHp * 0.5;
  w.update(DT, idleInput());
  assert.equal(boss.boss!.phase, 2);
  assert.ok(w.corpses.length >= corpses + 4, "the bearers fell");
  assert.ok(w.corpses.every((c) => c.kind !== "bishop"));
});

test("the executioner walks back to relight his stakes", () => {
  const { w, boss } = arena("executioner", 1);
  boss.boss!.intro = 0;
  immortal(w);
  w.player.pos = vec(1100, 1300);
  for (const l of w.lights) if (l.kind === "pyre") l.on = false;
  const ev: GameEvent[] = [];
  for (let t = 0; t < 25 && !ev.some((e) => e.type === "relight"); t += DT) {
    w.update(DT, idleInput());
    ev.push(...w.events);
  }
  assert.ok(ev.some((e) => e.type === "relight" && e.by === boss.id), "a stake burns again");
});

test("the inquisitor's hook drags the necromancer towards him", () => {
  const { w, boss } = arena("grandinquisitor", 5);
  immortal(w);
  w.player.pos = vec(1100, 1000);
  w.player.invuln = 0;
  spawnBullet(w, { pos: vec(1100, 940), vel: vec(0, 600), side: "enemy", radius: 12, damage: 4, halves: 1, life: 2, look: "bolt", pullTo: vec(1100, 400) });
  const y0 = w.player.pos.y;
  for (let t = 0; t < 0.4; t += DT) w.update(DT, idleInput());
  assert.ok(w.player.pos.y < y0 - 40, `pulled from ${y0} to ${w.player.pos.y}`);
  void boss;
});
