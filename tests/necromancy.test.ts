/** Necromancy: souls, raising the dead, minions fighting for the player. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput, type InputState, type Unit } from "../src/game/world.js";
import { CONFIG } from "../src/game/config.js";
import { makeRng, vec } from "../src/game/math.js";

const DT = 1 / 60;
const step = (w: World, input: InputState, seconds: number) => {
  const all = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, input);
    all.push(...w.events);
  }
  return all;
};
/** Freeze a unit in place so a test can control the situation. */
const freeze = (u: Unit) => {
  u.state = "recover";
  u.timer = 999;
};

/** Kill one guard right next to the player and return the world. */
function worldWithFreshCorpse(): World {
  const w = new World(makeRng(3));
  const p = w.player;
  const e = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 80));
  freeze(e);
  e.hp = 1;
  step(w, { ...idleInput(e.pos), shoot: true }, 0.2);
  assert.equal(w.corpses.length, 1, "the guard left a corpse");
  return w;
}

test("a killed guard leaves a corpse and a soul you have to walk to", () => {
  const w = worldWithFreshCorpse();
  assert.equal(w.souls.length, 1);
  assert.equal(w.player.souls, 0, "souls are not collected automatically");
  const soul = w.souls[0];
  const toSoul = { ...idleInput(), move: vec(soul.pos.x - w.player.pos.x, soul.pos.y - w.player.pos.y) };
  const ev = step(w, toSoul, 0.6);
  assert.ok(ev.some((e) => e.type === "soulPickup"));
  assert.equal(w.player.souls, 1);
});

test("an uncollected soul fades away", () => {
  const w = worldWithFreshCorpse();
  w.player.pos = vec(200, 900); // far away
  step(w, idleInput(), CONFIG.necro.soulLife + 0.2);
  assert.equal(w.souls.length, 0);
  assert.equal(w.player.souls, 0);
});

test("E raises a fresh corpse into a minion of the same kind, for a soul", () => {
  const w = worldWithFreshCorpse();
  w.player.souls = 1;
  const ev = step(w, { ...idleInput(), raise: true }, DT);
  assert.ok(ev.some((e) => e.type === "raise"));
  assert.equal(w.minions.length, 1);
  assert.equal(w.minions[0].kind, "halberdier");
  assert.equal(w.player.souls, 0);
  assert.equal(w.corpses.length, 0, "the corpse got up and walks");
});

test("raising needs souls and respects the minion limit", () => {
  const w = worldWithFreshCorpse();
  w.player.souls = 0;
  let ev = step(w, { ...idleInput(), raise: true }, DT);
  assert.ok(ev.some((e) => e.type === "raiseFail" && e.reason === "noSouls"));
  w.player.souls = 10;
  for (let i = 0; i < CONFIG.necro.minionLimit; i++) w.spawn("halberdier", vec(300 + i * 60, 300), "minion");
  ev = step(w, { ...idleInput(), raise: true }, DT);
  assert.ok(ev.some((e) => e.type === "raiseFail" && e.reason === "limit"));
});

test("a corpse can't be raised once its echo has faded", () => {
  const w = worldWithFreshCorpse();
  w.player.souls = 1;
  step(w, idleInput(), CONFIG.necro.echo + 0.1);
  const ev = step(w, { ...idleInput(), raise: true }, DT);
  assert.ok(!ev.some((e) => e.type === "raise"));
  assert.equal(w.corpses.length, 1, "the body stays as decoration");
});

test("minions crumble after their lifetime and can be raised once more", () => {
  const w = new World(makeRng(5));
  w.player.souls = 5;
  const m = w.spawn("halberdier", vec(w.player.pos.x + 60, w.player.pos.y), "minion");
  m.raises = 1;
  m.lifetime = 0.5;
  const ev = step(w, idleInput(), 0.6);
  assert.ok(ev.some((e) => e.type === "minionDeath" && e.crumbled));
  assert.equal(w.corpses.length, 1);
  step(w, { ...idleInput(), raise: true }, DT);
  assert.equal(w.minions.length, 1, "raised for the second time");
  const second = w.minions[0];
  second.lifetime = 0.2;
  step(w, idleInput(), 0.3);
  step(w, { ...idleInput(), raise: true }, DT);
  assert.equal(w.minions.length, 0, "a body raised twice stays dead");
});

test("a raised halberdier charges the guards, not the player", () => {
  const w = new World(makeRng(7));
  const p = w.player;
  const guard = w.spawn("arquebusier", vec(p.pos.x + 300, p.pos.y - 300));
  freeze(guard);
  w.spawn("halberdier", vec(p.pos.x + 60, p.pos.y), "minion");
  const ev = step(w, idleInput(), 6);
  assert.ok(ev.some((e) => e.type === "enemyDeath" || e.type === "enemyHit"), "minion hurt the guard");
  assert.equal(p.halves, CONFIG.player.maxHalves, "the player was never hit");
});

test("guards attack the nearest target, including minions", () => {
  const w = new World(makeRng(9));
  const p = w.player;
  const minion = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 300), "minion");
  freeze(minion);
  w.spawn("halberdier", vec(p.pos.x, p.pos.y - 600));
  const ev = step(w, idleInput(), 4);
  assert.ok(ev.some((e) => e.type === "minionHit" || e.type === "minionDeath"), "the guard went for the closer minion");
  assert.equal(p.halves, CONFIG.player.maxHalves);
});

test("a minion standing in the line of fire soaks an enemy bullet", () => {
  const w = new World(makeRng(11));
  const p = w.player;
  const shield = w.spawn("halberdier", vec(p.pos.x - 60, p.pos.y), "minion");
  freeze(shield);
  w.bullets.push({ pos: vec(p.pos.x - 200, p.pos.y), vel: vec(600, 0), radius: 9, damage: 1, from: "enemy", life: 2 });
  step(w, idleInput(), 0.5);
  assert.equal(p.halves, CONFIG.player.maxHalves, "the minion took the bullet");
  assert.ok(shield.hp < shield.maxHp);
});

test("Q sends the minions to the aimed point", () => {
  const w = new World(makeRng(13));
  const p = w.player;
  const m = w.spawn("halberdier", vec(p.pos.x + 40, p.pos.y), "minion");
  const target = vec(p.pos.x, p.pos.y - 500);
  step(w, { ...idleInput(target), command: true }, DT);
  step(w, idleInput(target), 3);
  assert.ok(Math.hypot(m.pos.x - target.x, m.pos.y - target.y) < 80, "minion went to the ordered point");
});

test("the room counts as cleared even with minions still standing", () => {
  const w = new World(makeRng(15));
  w.spawn("halberdier", vec(300, 300), "minion");
  const ev = step(w, idleInput(), DT);
  assert.ok(ev.some((e) => e.type === "roomCleared"));
});
