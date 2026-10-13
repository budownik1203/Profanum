/** The lit room: shooting out candelabra, dropping the chandelier, stained glass, the lamplighter. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, idleInput, type GameEvent, type InputState, type Unit } from "../src/game/world.js";
import { Floor } from "../src/game/floor.js";
import { TEMPLATES, applyTemplate } from "../src/game/rooms.js";
import { CONFIG } from "../src/game/config.js";
import { makeRng, vec } from "../src/game/math.js";
import { WEAPONS } from "../src/game/data/weapons.js";

const DT = 1 / 60;
const step = (w: World, input: InputState, seconds: number): GameEvent[] => {
  const all: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.update(DT, input);
    all.push(...w.events);
  }
  return all;
};
const freeze = (u: Unit) => {
  u.state = "recover";
  u.timer = 999;
};
/** Fire one shot at a point and let the bullet fly; then wait for the reload. */
const shootAt = (w: World, at: { x: number; y: number }): GameEvent[] => {
  const ev = step(w, { ...idleInput(at), shoot: true }, DT);
  ev.push(...step(w, idleInput(at), WEAPONS.pistol.reload + 0.1));
  return ev;
};

function quietRoom(): World {
  const w = new World(makeRng(31));
  w.dark = true;
  w.alarm = false;
  return w;
}

test("a candelabra takes two shots: the first only dims it", () => {
  const w = quietRoom();
  const c = w.addLight("candelabra", vec(w.player.pos.x, w.player.pos.y - 400));
  let ev = shootAt(w, World.hitPoint(c));
  assert.ok(ev.some((e) => e.type === "lightHit"));
  assert.equal(c.on, true);
  assert.ok(c.radius < c.baseRadius, "fewer candles, a smaller pool of light");
  ev = shootAt(w, World.hitPoint(c));
  assert.ok(ev.some((e) => e.type === "lightOut"));
  assert.equal(c.on, false);
});

test("shooting the chandelier down crushes the guards under it and darkens the middle", () => {
  const w = quietRoom();
  w.player.pos = vec(900, 1000);
  const ch = w.addLight("chandelier", vec(900, 500));
  const under = w.spawn("halberdier", vec(930, 520), "enemy", { state: "idle" });
  const aside = w.spawn("arquebusier", vec(1500, 300), "enemy", { state: "idle" });
  freeze(aside);
  const ev: GameEvent[] = [];
  for (let i = 0; i < CONFIG.lights.chandelier.hp; i++) ev.push(...shootAt(w, World.hitPoint(ch)));
  assert.ok(ev.some((e) => e.type === "chandelierFall"));
  assert.ok(ev.some((e) => e.type === "chandelierCrash"));
  assert.equal(under.alive, false, "crushed");
  assert.ok(ev.some((e) => e.type === "enemyDeath" && e.ambush), "a kill from the dark counts as an ambush");
  assert.equal(aside.alive, true);
  assert.equal(ch.on, false);
  assert.equal(w.lightAt(vec(900, 500), false), 0);
});

test("the necromancer standing under the falling chandelier gets hit too", () => {
  const w = quietRoom();
  w.alarm = true;
  const ch = w.addLight("chandelier", vec(w.player.pos.x, w.player.pos.y + 60));
  ch.hp = 1;
  step(w, { ...idleInput(World.hitPoint(ch)), shoot: true }, CONFIG.chandelier.fallTime + 0.2);
  assert.equal(w.player.halves, w.player.maxHalves - 1);
});

test("a shot through stained glass rains shards on the guards below and ends the holy light", () => {
  const w = quietRoom();
  const win = w.addLight("window", vec(600, 220), { wall: "N" });
  const g = w.spawn("arquebusier", vec(700, 300), "enemy", { state: "idle" });
  w.player.pos = vec(600, 900);
  assert.equal(w.isHoly(vec(600, 220)), true);
  const ev = shootAt(w, vec(600, 20));
  assert.ok(ev.some((e) => e.type === "windowBreak"));
  assert.ok(g.hp < g.maxHp || !g.alive, "glass hurt the guard");
  assert.equal(win.on, true, "the window still lets the moon in");
  assert.equal(w.isHoly(vec(600, 220)), false);
});

test("the lamplighter walks to a light that was put out and relights it", () => {
  const w = quietRoom();
  w.player.pos = vec(1700, 1000);
  const candle = w.addLight("candle", vec(500, 500));
  candle.on = false;
  candle.hp = 0;
  const lamp = w.spawn("halberdier", vec(800, 500), "enemy", { state: "idle", lamplighter: true });
  assert.ok(w.lights.some((l) => l.kind === "lantern" && l.owner === lamp.id), "he carries his own light");
  const ev = step(w, idleInput(), 8);
  assert.ok(ev.some((e) => e.type === "relight" && e.light === candle.id));
  assert.equal(candle.on, true);
  assert.equal(candle.hp, candle.maxHp);
  assert.equal(w.alarm, false, "relighting doesn't mean he found you");
});

test("a fallen chandelier and a stained-glass window can't be relit", () => {
  const w = quietRoom();
  w.alarm = true;
  w.player.pos = vec(1700, 1000);
  const ch = w.addLight("chandelier", vec(500, 500));
  ch.on = false;
  ch.fallen = true;
  w.spawn("halberdier", vec(600, 500), "enemy", { lamplighter: true });
  const ev = step(w, idleInput(), 4);
  assert.ok(!ev.some((e) => e.type === "relight"));
});

test("combat rooms are bright, with darkness at the edges, on every floor", () => {
  for (let depth = 1; depth <= 5; depth++) {
    for (const t of TEMPLATES) {
      const w = new World(makeRng(1), { w: t.w, h: t.h });
      applyTemplate(w, t, depth, 0, makeRng(2));
      let lit = 0;
      let n = 0;
      for (let x = 60; x < t.w - 60; x += 20) {
        for (let y = 60; y < t.h - 60; y += 20) {
          n++;
          if (w.isLit(vec(x, y), false)) lit++;
        }
      }
      const share = lit / n;
      assert.ok(share > 0.3 && share < 0.85, `${t.name} on floor ${depth}: ${(share * 100).toFixed(0)}% lit`);
      for (const corner of [vec(80, 80), vec(t.w - 80, 80), vec(80, t.h - 80), vec(t.w - 80, t.h - 80)]) {
        assert.equal(w.isLit(corner, false), false, `${t.name} on floor ${depth}: corner ${corner.x},${corner.y} is dark`);
      }
    }
  }
});

test("every door opens into shadow", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const f = new Floor(seed);
    for (const r of f.rooms) {
      f.travel("N", r.id);
      const w = f.world;
      for (const d of w.doors) {
        const a = w.arrivalPoint(d.side);
        for (const off of [vec(0, 0), vec(60, 0), vec(-60, 0), vec(0, 60), vec(0, -60)]) {
          const p = vec(a.x + off.x, a.y + off.y);
          assert.equal(w.isLit(p, false), false, `seed ${seed} room ${r.id} door ${d.side}`);
        }
      }
    }
  }
});
