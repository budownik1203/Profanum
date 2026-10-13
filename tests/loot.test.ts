/** Gold, chests, the fence, the altar, abominations, relics, barrels. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { addChest, placePickup, stockShop } from "../src/game/loot.js";
import { giveRelic, giveWeapon } from "../src/game/stats.js";
import { makeRng, vec } from "../src/game/math.js";
import { DT, enemyBullet, freeze, step } from "./helpers.js";

const shootAt = (w: World, at: { x: number; y: number }) => {
  step(w, { ...idleInput(at), shoot: true }, DT);
  step(w, idleInput(at), 1.3);
};

test("a dead guard's gold flies to the necromancer", () => {
  const w = new World(makeRng(2));
  const g = w.spawn("sergeant", vec(w.player.pos.x, w.player.pos.y - 120));
  freeze(g);
  g.hp = 0.1;
  shootAt(w, g.pos);
  assert.ok(w.player.gold >= 3, `collected ${w.player.gold}`);
});

test("a chest opens with a key and spills its contents", () => {
  const w = new World(makeRng(4));
  const p = w.player;
  p.keys = 1;
  w.ctx.depth = 1;
  const c = addChest(w, "iron", vec(p.pos.x, p.pos.y - 70));
  c.mimic = false;
  let ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "chestOpen"));
  assert.equal(p.keys, 0);
  assert.ok(w.pickups.some((x) => x.kind === "weapon" || x.kind === "item"));
  const c2 = addChest(w, "wood", vec(p.pos.x + 60, p.pos.y));
  c2.mimic = false;
  ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "needKey") || ev.some((e) => e.type === "itemGet"));
});

test("smashing a chest open needs no key", () => {
  const w = new World(makeRng(6));
  const p = w.player;
  p.keys = 0;
  const c = addChest(w, "wood", vec(p.pos.x, p.pos.y - 260));
  c.mimic = false;
  for (let i = 0; i < 4; i++) shootAt(w, c.pos);
  assert.equal(c.broken, true);
});

test("a mimic bares its teeth", () => {
  const w = new World(makeRng(8));
  const p = w.player;
  p.keys = 1;
  const c = addChest(w, "wood", vec(p.pos.x, p.pos.y - 70));
  c.mimic = true;
  const ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "mimic"));
  assert.ok(w.enemies.some((u) => u.kind === "mimic"));
});

test("the fence sells for gold", () => {
  const w = new World(makeRng(10));
  const p = w.player;
  stockShop(w, vec(p.pos.x, p.pos.y - 200));
  const key = w.pickups.find((x) => x.kind === "ammoBox" && x.price !== undefined)!;
  p.pos = { ...key.pos };
  p.gold = 0;
  let ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "tooPoor"));
  giveWeapon(p, "arquebus");
  p.weapons[p.current].ammo = 3;
  p.gold = 100;
  ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "buy"));
  assert.ok(p.gold < 100);
  assert.equal(p.weapons[p.current].ammo, 30);
});

test("weapon remains become a legend at the altar, for souls", () => {
  const w = new World(makeRng(12));
  const p = w.player;
  const altar = w.addInteractable("altar", vec(p.pos.x, p.pos.y - 60));
  p.remains.push("lament");
  p.souls = 1;
  let ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "raiseFail"));
  p.souls = 10;
  ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "legend" && e.legend === "lament"));
  assert.equal(p.weapons[p.current].id, "lament");
  // then a ritual: a guard sacrificed at the altar
  w.spawn("halberdier", vec(altar.pos.x + 80, altar.pos.y), "minion");
  ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "ritual" && e.form === "guard"));
  assert.equal(p.weapons[p.current].ritual, "guard");
});

test("the gravedigger stitches no abomination of the bodies lying around", () => {
  const w = new World(makeRng(14));
  const p = w.player;
  for (const dx of [-60, 0, 60]) {
    w.corpses.push({ id: 900 + dx, kind: "halberdier", pos: vec(p.pos.x + dx, p.pos.y - 40), dir: vec(1, 0), echo: 0, raises: 0, fromMinion: false, big: false });
  }
  p.souls = 3;
  const ev = step(w, { ...idleInput(), interact: true }, DT);
  assert.ok(!ev.some((e) => e.type === "abomination"));
  assert.equal(w.minions.filter((u) => u.kind === "abomination").length, 0);
});

test("relics charge by clearing rooms; the monstrance blinds", () => {
  const w = new World(makeRng(16));
  const p = w.player;
  giveRelic(p, "monstrance");
  p.relic!.charge = 0;
  const g = w.spawn("arquebusier", vec(p.pos.x + 200, p.pos.y));
  freeze(g);
  let ev = step(w, { ...idleInput(), relic: true }, DT);
  assert.ok(ev.some((e) => e.type === "relicNotReady"));
  p.relic!.charge = 2;
  ev = step(w, { ...idleInput(), relic: true }, DT);
  assert.ok(ev.some((e) => e.type === "relicUse"));
  assert.ok(g.st.stun > 2);
  // clearing a room charges it again
  g.alive = false;
  step(w, idleInput(), DT);
  assert.equal(p.relic!.charge, 1);
});

test("the witch's rope drags a gunner to her feet", () => {
  const w = new World(makeRng(18));
  w.player = { ...w.player, character: "wiedzma" };
  const p = w.player;
  const g = w.spawn("arquebusier", vec(p.pos.x + 400, p.pos.y));
  const ev = step(w, { ...idleInput(g.pos), special: true }, DT);
  assert.ok(ev.some((e) => e.type === "special"));
  assert.ok(Math.hypot(g.pos.x - p.pos.x, g.pos.y - p.pos.y) < 120);
});

test("a powder barrel blows up the guards around it; burning oil lights the floor for good", () => {
  const w = new World(makeRng(20));
  const p = w.player;
  const b = w.addCover(p.pos.x - 20, p.pos.y - 420, 40, 40, "powder");
  const g = w.spawn("halberdier", vec(p.pos.x + 80, p.pos.y - 400));
  freeze(g);
  shootAt(w, { x: b.x + 20, y: b.y + 20 });
  assert.equal(b.broken, true);
  assert.equal(g.alive, false);
  const oil = w.addCover(p.pos.x + 300, p.pos.y - 420, 40, 40, "oil");
  w.bullets.push({ ...enemyBullet(vec(oil.x + 20, oil.y + 200), vec(0, -900)), side: "minion", fromPlayer: true, damage: 4, halves: 0 });
  step(w, idleInput(), 0.5);
  assert.equal(oil.broken, true);
  const fire = w.zones.find((z) => z.permanent);
  assert.ok(fire && w.isLit(fire.pos, false));
  step(w, idleInput(), 30);
  assert.ok(w.zones.some((z) => z.permanent), "still burning");
});

test("gold on a shop counter is not picked up by walking over it", () => {
  const w = new World(makeRng(22));
  const p = w.player;
  const pk = placePickup(w, "heart", { ...p.pos }, 1, undefined, 25);
  p.halves = 2;
  step(w, idleInput(), 0.5);
  assert.ok(w.pickups.includes(pk));
  assert.equal(p.halves, 2);
});
