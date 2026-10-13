/** Headless tests of the combat simulation: run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput, type InputState } from "../src/game/world.js";
import { CONFIG } from "../src/game/config.js";
import { makeRng, vec } from "../src/game/math.js";
import { WEAPONS } from "../src/game/data/weapons.js";
import { enemyBullet } from "./helpers.js";

const DT = 1 / 60;
const empty = (): World => new World(makeRng(1));
const step = (w: World, input: InputState, seconds: number) => {
  const all = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, input);
    all.push(...w.events);
  }
  return all;
};

test("player walks and stays inside the room walls", () => {
  const w = empty();
  const start = { ...w.player.pos };
  step(w, { ...idleInput(), move: vec(1, 0) }, 0.5);
  assert.ok(w.player.pos.x > start.x + 100, "moved right");
  step(w, { ...idleInput(), move: vec(1, 0) }, 10);
  assert.ok(w.player.pos.x <= CONFIG.room.width - CONFIG.room.wall - CONFIG.player.radius + 0.001, "clamped by the wall");
});

test("the flintlock pistol fires its two barrels, then must reload", () => {
  const w = empty();
  const aim = vec(w.player.pos.x, 0);
  const shoot = { ...idleInput(aim), shoot: true };
  const ev = step(w, shoot, 0.5);
  assert.equal(ev.filter((e) => e.type === "shot").length, 2, "two shots, then the gun is empty");
  const slot = w.player.weapons[0];
  assert.equal(slot.loaded, 0);
  assert.ok(slot.reloadLeft > 0, "reload started automatically");
  const ev2 = step(w, idleInput(aim), WEAPONS.pistol.reload + 0.05);
  assert.ok(ev2.some((e) => e.type === "reloadDone"));
  assert.equal(slot.loaded, 2);
});

test("two pistol shots kill a halberdier", () => {
  const w = empty();
  const e = w.spawn("halberdier", vec(w.player.pos.x, w.player.pos.y - 600));
  e.state = "recover";
  e.timer = 999; // stand still for the test
  const shoot = { ...idleInput(e.pos), shoot: true };
  let events = step(w, shoot, 0.6);
  assert.ok(events.some((x) => x.type === "enemyHit"));
  events = step(w, shoot, WEAPONS.pistol.reload + 0.6);
  assert.ok(events.some((x) => x.type === "enemyDeath"));
  assert.ok(events.some((x) => x.type === "roomCleared"));
});

test("dodge makes the player immune to a bullet", () => {
  const w = empty();
  const p = w.player;
  w.bullets.push(enemyBullet(vec(p.pos.x - 80, p.pos.y), vec(600, 0), { life: 2 }));
  step(w, { ...idleInput(), dodge: true }, DT);
  step(w, idleInput(), 0.2);
  assert.equal(p.halves, w.player.maxHalves, "no damage while dissolved into mist");
});

test("an enemy bullet costs half a heart and grants invulnerability", () => {
  const w = empty();
  const p = w.player;
  w.bullets.push(enemyBullet(vec(p.pos.x - 80, p.pos.y), vec(600, 0), { life: 2 }));
  w.bullets.push(enemyBullet(vec(p.pos.x - 140, p.pos.y), vec(600, 0), { life: 2 }));
  step(w, idleInput(), 0.4);
  assert.equal(p.halves, w.player.maxHalves - 1, "second bullet passes during invulnerability");
});

test("a toppled pew stops bullets and breaks after enough hits", () => {
  const w = empty();
  const p = w.player;
  const c = w.addCover(p.pos.x - 75, p.pos.y - 120, 150, 40);
  step(w, { ...idleInput(), flip: true }, DT);
  assert.ok(c.flipped, "pew toppled with the flip key");
  for (let i = 0; i < 20 && !c.broken; i++) {
    w.bullets.push(enemyBullet(vec(p.pos.x, p.pos.y - 400), vec(0, 600), { life: 3 }));
    step(w, idleInput(), 0.6);
  }
  assert.equal(p.halves, w.player.maxHalves, "cover absorbed every bullet");
  assert.ok(c.broken, "cover eventually breaks");
});

test("an unflipped pew blocks walking but not bullets", () => {
  const w = empty();
  const p = w.player;
  const c = w.addCover(p.pos.x + 40, p.pos.y - 100, 40, 200);
  step(w, { ...idleInput(), move: vec(1, 0) }, 1);
  assert.ok(p.pos.x <= c.x - CONFIG.player.radius + 0.5, "stopped by the pew");
  w.bullets.push(enemyBullet(vec(c.x + 200, p.pos.y), vec(-600, 0), { life: 2 }));
  step(w, idleInput(), 0.6);
  assert.equal(p.halves, w.player.maxHalves - 1, "bullet flew over the standing pew");
});

test("halberdier winds up, charges and hits", () => {
  const w = empty();
  const p = w.player;
  w.spawn("halberdier", vec(p.pos.x, p.pos.y - 400));
  const events = step(w, idleInput(), 4);
  assert.ok(events.some((e) => e.type === "telegraph"), "telegraphs before the charge");
  assert.ok(events.some((e) => e.type === "playerHit"), "the charge connects");
});

test("arquebusier keeps its distance and shoots", () => {
  const w = empty();
  const p = w.player;
  const e = w.spawn("arquebusier", vec(p.pos.x + 150, p.pos.y));
  const events = step(w, idleInput(), 4);
  assert.ok(events.some((x) => x.type === "shot" && x.side === "enemy"), "fires at the player");
  assert.ok(Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > 250, "backed off to range");
});

test("the first room is winnable by a scripted player (smoke test)", () => {
  const w = World.firstRoom(makeRng(7));
  w.player.halves = 999; // only checking that the sim runs and enemies can die
  for (let t = 0; t < 120 && !w.cleared; t += DT) {
    const target = w.enemies[0];
    w.update(DT, { ...idleInput(target ? target.pos : vec()), shoot: true });
  }
  assert.ok(w.cleared, "all guards died within two simulated minutes");
});
