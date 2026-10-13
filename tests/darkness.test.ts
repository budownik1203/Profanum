/** Darkness, light, the alarm and the ambush that opens a fight. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput, type InputState } from "../src/game/world.js";
import { CONFIG } from "../src/game/config.js";
import { makeRng, vec } from "../src/game/math.js";
import { UNITS } from "../src/game/data/units.js";
import { WEAPONS } from "../src/game/data/weapons.js";

const DT = 1 / 60;
const step = (w: World, input: InputState, seconds: number) => {
  const all = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, input);
    all.push(...w.events);
  }
  return all;
};

/** A dark, quiet room with the player in the middle and nothing else. */
function darkRoom(): World {
  const w = new World(makeRng(21));
  w.dark = true;
  w.alarm = false;
  return w;
}

test("before the alarm guards don't attack the necromancer hiding in the dark", () => {
  const w = darkRoom();
  const p = w.player;
  w.spawn("halberdier", vec(p.pos.x, p.pos.y - 300), "enemy", { state: "idle" });
  w.spawn("arquebusier", vec(p.pos.x + 400, p.pos.y - 200), "enemy", { state: "idle" });
  const ev = step(w, idleInput(), 5);
  assert.equal(w.alarm, false);
  assert.ok(!ev.some((e) => e.type === "shot" || e.type === "playerHit"));
});

test("stepping into candle light gets you seen: the whole room wakes", () => {
  const w = darkRoom();
  const p = w.player;
  const g1 = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 500), "enemy", { state: "idle" });
  const g2 = w.spawn("arquebusier", vec(p.pos.x + 600, p.pos.y - 400), "enemy", { state: "idle" });
  w.addLight("candle", vec(p.pos.x + 200, p.pos.y));
  const ev = step(w, { ...idleInput(), move: vec(1, 0) }, 1);
  assert.ok(ev.some((e) => e.type === "alarm"));
  assert.equal(g1.state === "idle" || g2.state === "idle", false, "every guard switched to fighting");
});

test("walking right up to a guard in the dark also gets you noticed", () => {
  const w = darkRoom();
  const p = w.player;
  w.spawn("halberdier", vec(p.pos.x, p.pos.y - 200), "enemy", { state: "idle" });
  step(w, { ...idleInput(), move: vec(0, -1) }, 1);
  assert.equal(w.alarm, true);
});

test("the first shot from the dark is an ambush: double damage", () => {
  const w = darkRoom();
  const p = w.player;
  const g = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 500), "enemy", { state: "idle" });
  const ev = step(w, { ...idleInput(g.pos), shoot: true }, 0.6);
  const kill = ev.find((e) => e.type === "enemyDeath");
  assert.ok(kill && kill.type === "enemyDeath" && kill.ambush, "a single ambush shot (4 x 2) kills an 8 hp halberdier");
});

test("after the alarm shots are normal again", () => {
  const w = darkRoom();
  const p = w.player;
  const g = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 500), "enemy", { state: "idle" });
  g.state = "recover";
  g.timer = 999;
  w.alarm = true;
  const ev = step(w, { ...idleInput(g.pos), shoot: true }, 0.6);
  assert.ok(ev.some((e) => e.type === "enemyHit" && !e.ambush), "survives a normal shot");
});

test("a candle can be shot out without waking distant guards", () => {
  const w = darkRoom();
  const p = w.player;
  w.spawn("halberdier", vec(200, 150), "enemy", { state: "idle" });
  const candle = w.addLight("candle", vec(p.pos.x, p.pos.y - 400));
  const ev = step(w, { ...idleInput(candle.pos), shoot: true }, 0.5);
  assert.ok(ev.some((e) => e.type === "lightOut"));
  assert.equal(candle.on, false);
  assert.equal(w.alarm, false, "the muzzle flash was too far to be seen");
});

test("toppling a pew next to sleeping guards wakes them", () => {
  const w = darkRoom();
  const p = w.player;
  w.addCover(p.pos.x - 75, p.pos.y - 60, 150, 30);
  w.spawn("halberdier", vec(p.pos.x + 250, p.pos.y - 250), "enemy", { state: "idle" });
  step(w, { ...idleInput(), flip: true }, DT);
  assert.equal(w.alarm, true);
});

test("the necromancer hits softer in light", () => {
  const w = darkRoom();
  w.alarm = true;
  const p = w.player;
  p.stats.critChance = 0;
  w.addLight("candle", p.pos);
  const g = w.spawn("halberdier", vec(p.pos.x, p.pos.y - 500));
  g.state = "recover";
  g.timer = 999;
  step(w, { ...idleInput(g.pos), shoot: true }, DT);
  step(w, idleInput(g.pos), 0.6);
  assert.equal(g.hp, UNITS.halberdier.hp - WEAPONS.pistol.damage * p.stats.lightDamageMul);
});

test("holy light from stained glass burns the necromancer if he lingers in it", () => {
  const w = darkRoom();
  w.alarm = true;
  w.addLight("window", w.player.pos, { wall: "N" });
  const ev = step(w, idleInput(), CONFIG.darkness.burnDelay + 0.5);
  assert.ok(ev.some((e) => e.type === "burn"));
  assert.equal(w.player.halves, w.player.maxHalves - 1);
});

test("ordinary light only reveals: candles and chandeliers don't burn", () => {
  const w = darkRoom();
  w.alarm = true;
  w.addLight("chandelier", w.player.pos);
  const ev = step(w, idleInput(), CONFIG.darkness.burnDelay + 4);
  assert.ok(!ev.some((e) => e.type === "burn"));
  assert.equal(w.player.halves, w.player.maxHalves);
});

test("minions last longer in the dark and crumble faster in light", () => {
  const w = darkRoom();
  w.alarm = true;
  const inDark = w.spawn("halberdier", vec(300, 300), "minion");
  const inLight = w.spawn("halberdier", vec(1500, 300), "minion");
  w.addLight("chandelier", vec(1500, 300));
  inDark.state = "recover";
  inLight.state = "recover";
  const before = CONFIG.necro.minionLifetime;
  // no enemies: both walk to the necromancer, who stands next to the lit one; the other stays in the dark for 2 s
  w.player.pos = vec(1450, 300);
  step(w, idleInput(), 2);
  assert.ok(before - inDark.lifetime < 1.5, "dark: about 0.5 s lost per second");
  assert.ok(before - inLight.lifetime > 2.5 || !inLight.alive, "light: about 1.5 s lost per second");
});

test("a patrolling guard walks its route with a lantern", () => {
  const w = darkRoom();
  w.player.pos = vec(1700, 1000);
  const g = w.spawn("halberdier", vec(300, 300), "enemy", { state: "patrol", lantern: true, route: [vec(300, 300), vec(700, 300)] });
  const lantern = w.lights.find((l) => l.kind === "lantern");
  assert.ok(lantern);
  step(w, idleInput(), 3);
  assert.ok(g.pos.x > 400, "walked along the route");
  assert.ok(Math.abs(lantern.pos.x - g.pos.x) < 40, "the lantern moves with him");
});

test("the first room starts dark and quiet", () => {
  const w = World.firstRoom(makeRng(1));
  assert.equal(w.dark, true);
  assert.equal(w.alarm, false);
  step(w, idleInput(), 1);
  assert.equal(w.alarm, false, "the player starts unseen");
});
