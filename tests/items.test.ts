/** Everything the necromancer can carry does what its description promises. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput } from "../src/game/world.js";
import { WEAPONS, type WeaponId } from "../src/game/data/weapons.js";
import { ITEMS, RELICS, SYNERGIES, type ItemId, type RelicId } from "../src/game/data/items.js";
import { giveItem, giveRelic, giveWeapon, maxAmmo } from "../src/game/stats.js";
import { reloadTime, soulCost } from "../src/game/shooting.js";
import { damageUnit, killUnit } from "../src/game/combat.js";
import { shopPrice } from "../src/game/loot.js";
import { Floor } from "../src/game/floor.js";
import { makeRng, vec } from "../src/game/math.js";
import type { Unit } from "../src/game/types.js";
import { DT, enemyBullet, freeze, step } from "./helpers.js";

/** A quiet lit room, the necromancer at the left and a sturdy frozen dummy in front of him. */
function range(dx = 250): { w: World; dummy: Unit } {
  const w = new World(makeRng(5));
  w.alarm = true;
  w.player.pos = vec(500, 550);
  const dummy = w.spawn("halberdier", vec(500 + dx, 550));
  freeze(dummy);
  dummy.hp = dummy.maxHp = 2000;
  return { w, dummy };
}

/** A fresh guard's corpse right at the necromancer's feet. */
function corpseHere(w: World): void {
  const g = w.spawn("halberdier", vec(w.player.pos.x + 40, w.player.pos.y));
  killUnit(w, g, vec(1, 0), { fromPlayer: true });
}

// ------------------------------------------------------------------ weapons
test("every weapon in the arsenal fires and hurts", () => {
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    const { w, dummy } = range();
    const p = w.player;
    if (id !== "pistol") giveWeapon(p, id);
    p.current = p.weapons.findIndex((s) => s.id === id);
    p.souls = 50;
    const hp = dummy.hp;
    step(w, { ...idleInput(dummy.pos), shoot: true }, 2.5);
    assert.ok(dummy.hp < hp, `${id} hurt the dummy`);
  }
});

test("occult weapons are paid for in souls, legends are not", () => {
  const { w, dummy } = range();
  const p = w.player;
  giveWeapon(p, "ashbook");
  p.souls = 5;
  step(w, { ...idleInput(dummy.pos), shoot: true }, DT);
  assert.equal(p.souls, 3, "the ash grimoire costs two souls in light");
  giveWeapon(p, "headsman");
  const before = p.souls;
  step(w, { ...idleInput(dummy.pos), shoot: true }, 0.5);
  assert.equal(p.souls, before);
});

test("the ash grimoire's victims rise as short-lived minions", () => {
  const { w } = range();
  const p = w.player;
  giveWeapon(p, "ashbook");
  p.souls = 10;
  const g = w.spawn("arquebusier", vec(500, 300));
  freeze(g);
  g.hp = 1;
  step(w, { ...idleInput(g.pos), shoot: true }, 0.8);
  assert.equal(g.alive, false);
  const mini = w.minions.find((u) => u.mini);
  assert.ok(mini, "a small minion rose from the ashes");
});

// ------------------------------------------------------------------ items
test("items with numbers do what their descriptions say", () => {
  const { w } = range();
  const p = w.player;
  const pistol = p.weapons[0];
  const base = {
    reload: reloadTime(w, pistol),
    limit: p.stats.minionLimit,
    crit: p.stats.critChance,
    ambush: p.stats.ambushMul,
    shop: shopPrice(w, 100),
  };
  giveItem(p, "ramrod");
  assert.ok(Math.abs(reloadTime(w, pistol) - base.reload * 0.75) < 1e-9, "the horn ramrod reloads 25% faster");
  giveItem(p, "jarskull");
  assert.equal(p.stats.minionLimit, base.limit + 1);
  giveItem(p, "noose");
  assert.ok(Math.abs(p.stats.critChance - base.crit - 0.1) < 1e-9);
  giveItem(p, "handofglory");
  assert.equal(p.stats.ambushMul, base.ambush + 1, "ambushes hit three times as hard");
  giveItem(p, "purse");
  assert.equal(shopPrice(w, 100), Math.round(base.shop * 0.75));
  const halves = p.maxHalves;
  giveItem(p, "martyrheart");
  assert.equal(p.maxHalves, halves + 2);
  giveItem(p, "shroud");
  assert.equal(p.stats.burnDelayMul, 2);
  assert.ok(p.stats.lightDamageMul > 0.8, "light weakens him less");
  giveItem(p, "rosary");
  assert.equal(p.stats.extraSoulChance, 0.25);
  // every item in the game is known to the code
  for (const id of Object.keys(ITEMS) as ItemId[]) assert.ok(ITEMS[id].price > 0);
});

test("black powder hits harder with firearms", () => {
  const { w, dummy } = range();
  const p = w.player;
  const firstHit = (): number => {
    p.stats.critChance = 0;
    const ev = step(w, { ...idleInput(dummy.pos), shoot: true }, 0.35);
    step(w, idleInput(dummy.pos), 2);
    const hit = ev.find((e) => e.type === "enemyHit");
    return hit && hit.type === "enemyHit" ? hit.amount : 0;
  };
  const plain = firstHit();
  giveItem(p, "powder");
  const powder = firstHit();
  assert.ok(plain > 0 && Math.abs(powder - plain * 1.2) < 1e-6, `${plain} → ${powder}`);
});

test("the bone shirt takes the next hit instead of a heart", () => {
  const { w } = range();
  const p = w.player;
  giveItem(p, "boneshirt");
  const halves = p.halves;
  w.bullets.push(enemyBullet(vec(p.pos.x - 60, p.pos.y), vec(600, 0)));
  const ev = step(w, idleInput(), 0.2);
  assert.ok(ev.some((e) => e.type === "playerHit" && e.armor));
  assert.equal(p.halves, halves);
  assert.equal(p.armor, 0);
});

test("the bandolier packs half again more ammunition, new guns included", () => {
  const { w } = range();
  const p = w.player;
  giveItem(p, "bandolier");
  giveWeapon(p, "arquebus");
  const slot = p.weapons[p.current];
  assert.equal(slot.ammo, Math.round(WEAPONS.arquebus.ammo * 1.5));
  assert.equal(maxAmmo(p, slot), slot.ammo);
});

test("shackles bring the mist back sooner; the ember pocket finishes a reload", () => {
  const { w, dummy } = range();
  const p = w.player;
  giveItem(p, "shackles");
  giveItem(p, "emberpocket");
  // empty both barrels: the reload starts
  step(w, { ...idleInput(dummy.pos), shoot: true }, 0.3);
  assert.ok(p.weapons[0].reloadLeft > 0.5);
  step(w, { ...idleInput(dummy.pos), dodge: true }, DT);
  step(w, idleInput(dummy.pos), 2 * DT);
  assert.equal(p.weapons[0].reloadLeft, 0, "loaded mid-dodge");
  assert.equal(p.weapons[0].loaded, 2);
  step(w, idleInput(dummy.pos), 0.4);
  assert.ok(p.dodgeCooldown > 0 && p.dodgeCooldown <= 0.7 * 0.7 + 1e-9, `cooldown ${p.dodgeCooldown}`);
});

test("grave dirt, claws and the hourglass make better minions", () => {
  const { w } = range();
  const p = w.player;
  giveItem(p, "gravedirt");
  giveItem(p, "hourglass");
  giveItem(p, "claws");
  p.souls = 5;
  corpseHere(w);
  step(w, { ...idleInput(), interact: true }, DT);
  const m = w.minions[0];
  assert.ok(m, "raised");
  assert.equal(m.maxHp, m.def.hp * 1.5);
  assert.ok(m.lifetime > 30 * 1.5 - 0.1);
  assert.equal(p.stats.minionDamageMul, 1.3);
});

test("the skull in a jar allows a fourth minion", () => {
  const { w } = range();
  const p = w.player;
  p.souls = 20;
  for (let i = 0; i < 4; i++) {
    corpseHere(w);
    step(w, { ...idleInput(), interact: true }, DT);
    step(w, idleInput(), 0.6);
  }
  assert.equal(w.minions.length, p.stats.minionLimit);
  giveItem(p, "jarskull");
  corpseHere(w);
  step(w, { ...idleInput(), interact: true }, DT);
  assert.equal(w.minions.length, p.stats.minionLimit);
});

test("the tome makes occult shots a soul cheaper", () => {
  const { w } = range();
  const p = w.player;
  giveWeapon(p, "howler");
  const slot = p.weapons[p.current];
  assert.equal(soulCost(w, slot, WEAPONS.howler), 2);
  giveItem(p, "tome");
  assert.equal(soulCost(w, slot, WEAPONS.howler), 1);
});

test("the wet wick snuffs the candles a bullet passes", () => {
  for (const wick of [false, true]) {
    const { w, dummy } = range(500);
    const candle = w.addLight("candle", vec(750, 550 + 34 + 14)); // flame 34 px below the line of fire
    if (wick) giveItem(w.player, "wick");
    step(w, { ...idleInput(dummy.pos), shoot: true }, 0.3);
    assert.equal(candle.on, !wick, wick ? "snuffed" : "left burning");
  }
});

test("the rosary sometimes leaves a second soul", () => {
  const { w } = range();
  giveItem(w.player, "rosary");
  const before = w.souls.length;
  for (let i = 0; i < 60; i++) {
    const g = w.spawn("peasant", vec(300 + (i % 10) * 60, 300 + Math.floor(i / 10) * 60));
    damageUnit(w, g, 999, vec(1, 0), { fromPlayer: true, side: "minion" });
  }
  const souls = w.souls.length - before;
  assert.ok(souls > 66 && souls < 100, `${souls} souls from 60 kills`);
});

// ------------------------------------------------------------------ relics
test("every relic does something when used", () => {
  for (const id of Object.keys(RELICS) as RelicId[]) {
    const { w, dummy } = range(300);
    const p = w.player;
    giveRelic(p, id);
    p.relic!.charge = RELICS[id].charge;
    p.halves = 2;
    w.dark = true;
    const candle = w.addLight("candle", vec(p.pos.x + 100, p.pos.y - 100));
    corpseHere(w);
    const ev = step(w, { ...idleInput(dummy.pos), relic: true }, DT);
    assert.ok(ev.some((e) => e.type === "relicUse" && e.relic === id), `${id} used`);
    assert.equal(p.relic!.charge, 0);
    step(w, idleInput(dummy.pos), 1.2);
    switch (id) {
      case "monstrance":
        assert.ok(dummy.st.stun > 0);
        break;
      case "plague":
        assert.ok(dummy.hp < dummy.maxHp, "the plague cloud hurts");
        break;
      case "nightshroud":
        assert.equal(candle.on, false);
        break;
      case "prophet":
        assert.ok(w.minions.length >= 1);
        break;
      case "vial":
        assert.equal(p.halves, 4);
        break;
      case "rope":
        assert.ok(Math.hypot(dummy.pos.x - p.pos.x, dummy.pos.y - p.pos.y) < 120);
        break;
      case "finger":
        break; // checked on the floor below
    }
  }
});

test("the saint's finger shows the whole floor", () => {
  const f = new Floor(3, { depth: 1 });
  const p = f.world.player;
  giveRelic(p, "finger");
  p.relic!.charge = 1;
  assert.ok(f.known().length < f.rooms.length);
  f.update(DT, { ...idleInput(), relic: true });
  assert.equal(f.known().length, f.rooms.length);
});

test("the chaplain's relics charge faster", () => {
  const w = new World(makeRng(2), undefined);
  w.player = { ...w.player, character: "kaplan" };
  const p = w.player;
  giveRelic(p, "prophet");
  p.relic!.charge = 0;
  const g = w.spawn("peasant", vec(200, 200));
  freeze(g);
  w.alarm = true;
  step(w, idleInput(), DT);
  g.alive = false;
  step(w, idleInput(), DT);
  assert.equal(p.relic!.charge, 2);
});

// ------------------------------------------------------------------ synergies
test("every synergy comes together from its two halves and is announced once", () => {
  for (const sy of SYNERGIES) {
    const { w } = range();
    const p = w.player;
    for (const need of sy.needs) {
      if (need in WEAPONS) giveWeapon(p, need as WeaponId);
      else if (need in ITEMS) giveItem(p, need as ItemId);
      else giveRelic(p, need as RelicId);
    }
    assert.ok(p.stats.synergies.includes(sy.id), sy.id);
    const ev = step(w, idleInput(), 3 * DT);
    assert.equal(ev.filter((e) => e.type === "synergy" && e.id === sy.id).length, 1, `${sy.id} announced once`);
  }
});

test("Concert of Wails: the howl makes them weep", () => {
  const { w, dummy } = range(180);
  const p = w.player;
  giveWeapon(p, "lament");
  giveWeapon(p, "howler");
  p.souls = 10;
  step(w, { ...idleInput(dummy.pos), shoot: true }, 0.3);
  assert.ok(dummy.st.weep > 0, "weeping");
  assert.ok(dummy.st.stun > 0, "and stunned");
});

test("Volley after Volley: the organ gun reloads twice as fast", () => {
  const { w } = range();
  const p = w.player;
  giveWeapon(p, "organ");
  const slot = p.weapons[p.current];
  const plain = reloadTime(w, slot);
  giveItem(p, "ramrod");
  assert.ok(Math.abs(reloadTime(w, slot) - plain * 0.75 * 0.5) < 1e-9);
});

test("Night without Dawn: a flame put out burns the guards beside it", () => {
  const { w } = range();
  const p = w.player;
  giveItem(p, "handofglory");
  giveItem(p, "shroud");
  const candle = w.addLight("candle", vec(800, 400));
  const g = w.spawn("arquebusier", vec(840, 430));
  freeze(g);
  const hp = g.hp;
  step(w, { ...idleInput(vec(800, 400 - 14)), shoot: true }, 0.25);
  assert.equal(candle.on, false);
  assert.ok(g.hp < hp, "embers burned the guard");
});

test("Army from the Earth: minions stop rotting in light", () => {
  const { w } = range();
  const p = w.player;
  w.dark = true;
  w.addLight("candelabra", vec(p.pos.x, p.pos.y));
  giveItem(p, "jarskull");
  giveItem(p, "gravedirt");
  p.souls = 5;
  corpseHere(w);
  step(w, { ...idleInput(), interact: true }, DT);
  const m = w.minions[0];
  freeze(m);
  const life = m.lifetime;
  step(w, idleInput(), 1);
  assert.ok(Math.abs(life - m.lifetime - 1) < 0.05, `lost ${life - m.lifetime}s in one second of light`);
});

test("Last Rites: holy kills heal", () => {
  const { w } = range();
  const p = w.player;
  giveWeapon(p, "gerwazy");
  giveRelic(p, "vial");
  p.halves = 2;
  for (let i = 0; i < 12; i++) {
    const g = w.spawn("peasant", vec(300 + i * 40, 300));
    damageUnit(w, g, 999, vec(1, 0), { fromPlayer: true, side: "minion", holy: true });
  }
  assert.equal(p.halves, 3);
});

// ------------------------------------------------------------------ curses
test("legends carry their curses", () => {
  // the heavy headsman slows the necromancer
  const { w } = range();
  const p = w.player;
  const speed = () => {
    const x = p.pos.x;
    step(w, { ...idleInput(), move: vec(1, 0) }, 0.5);
    return p.pos.x - x;
  };
  const light = speed();
  giveWeapon(p, "headsman");
  const heavy = speed();
  assert.ok(heavy < light * 0.9, `${light} → ${heavy}`);
  // the martyrs' organ reloads slower
  giveWeapon(p, "martyrs");
  assert.ok(Math.abs(reloadTime(w, p.weapons[p.current]) - WEAPONS.martyrs.reload * 1.3) < 1e-9);
  // the Lamentation's noise wakes the neighbouring rooms
  let woke = 0;
  w.ctx.alarmNeighbours = () => woke++;
  giveWeapon(p, "lament");
  step(w, { ...idleInput(vec(900, 550)), shoot: true }, DT);
  assert.ok(woke > 0);
});

test("Saint Gervase's barrel: rooms wait alarmed for its bearer", () => {
  const f = new Floor(4, { depth: 1 });
  giveWeapon(f.world.player, "gerwazy");
  const combat = f.rooms.find((r) => r.type === "combat")!;
  f.travel("N", combat.id);
  assert.equal(f.world.alarm, true);
});
