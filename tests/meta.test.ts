/** What survives death: the crypt's records, unlocks, the six characters, the skull's story. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buyCharacter,
  buyUnlock,
  characterState,
  checkChallenges,
  finishRun,
  freshMeta,
  loadMeta,
  loadRun,
  makeStore,
  poolOf,
  saveMeta,
  saveRun,
} from "../src/game/meta.js";
import { Run } from "../src/game/run.js";
import { CHARACTERS, CHARACTER_ORDER, STARTING_POOL, UNLOCKABLES } from "../src/game/data/items.js";
import { WEAPONS } from "../src/game/data/weapons.js";
import { World, idleInput } from "../src/game/world.js";
import { makePlayer } from "../src/game/stats.js";
import { damageUnit } from "../src/game/combat.js";
import { buildHub } from "../src/game/hub.js";
import { nextSkullLine, SKULL_STORY } from "../src/narrator.js";
import { makeRng, vec } from "../src/game/math.js";
import { DT, freeze, step } from "./helpers.js";

test("the crypt's records survive a reload, and a broken save starts afresh", () => {
  const store = makeStore();
  const m = freshMeta();
  m.echo = 17;
  m.unlocked.push("organ");
  m.skullHeard.push(0, 1);
  saveMeta(store, m);
  const back = loadMeta(store);
  assert.equal(back.echo, 17);
  assert.deepEqual(back.unlocked, ["organ"]);
  assert.deepEqual(back.skullHeard, [0, 1]);
  store.set("profanum.meta.v1", "{not json");
  assert.equal(loadMeta(store).echo, 0);
});

test("a finished run banks its echo, counts the dead and opens challenges", () => {
  const m = freshMeta();
  const run = new Run({ seed: 3 });
  run.echo = 12;
  run.stats.kills = 260;
  run.stats.raised = 21;
  run.stats.bosses = ["executioner", "captain"];
  run.depth = 2;
  const fresh = finishRun(m, run);
  assert.equal(m.echo, 12);
  assert.equal(m.stats.runs, 1);
  assert.equal(m.stats.deaths, 1);
  assert.equal(m.stats.deepest, 2);
  assert.deepEqual(fresh.sort(), ["killCaptain", "kills250", "raise20"]);
  assert.deepEqual(checkChallenges(m), [], "a challenge opens once");
});

test("characters wake in their sarcophagi: sealed, then bought with echo", () => {
  const m = freshMeta();
  assert.equal(characterState(m, "grabarz"), "owned");
  assert.equal(characterState(m, "nekromanta"), "sealed");
  assert.equal(buyCharacter(m, "nekromanta"), false);
  m.stats.raised = 20;
  checkChallenges(m);
  assert.equal(characterState(m, "nekromanta"), "buyable");
  m.echo = 5;
  assert.equal(buyCharacter(m, "nekromanta"), false, "too little echo");
  m.echo = CHARACTERS.nekromanta.unlock!.echo + 3;
  assert.equal(buyCharacter(m, "nekromanta"), true);
  assert.equal(m.echo, 3);
  assert.equal(m.selected, "nekromanta");
  assert.equal(characterState(m, "nekromanta"), "owned");
});

test("the echo altar adds things to the loot pool, once each", () => {
  const m = freshMeta();
  m.echo = 100;
  const first = UNLOCKABLES[0];
  assert.equal(poolOf(m).includes(first.id), false);
  assert.equal(buyUnlock(m, first.id), true);
  assert.equal(buyUnlock(m, first.id), false);
  assert.equal(m.echo, 100 - first.echo);
  assert.ok(poolOf(m).includes(first.id));
  assert.equal(poolOf(m).length, STARTING_POOL.length + 1);
});

test("a saved run is stored and read back whole", () => {
  const store = makeStore();
  const run = new Run({ seed: 9, character: "medyk" });
  run.descend();
  saveRun(store, run.snapshot());
  const back = loadRun(store);
  assert.ok(back);
  const again = new Run({}, back!);
  assert.equal(again.character, "medyk");
  assert.equal(again.depth, 2);
});

test("each of the six starts with its own weapon, hearts and gift", () => {
  for (const id of CHARACTER_ORDER) {
    const p = makePlayer(id, vec());
    const c = CHARACTERS[id];
    assert.equal(p.weapons[0].id, c.weapon, id);
    assert.equal(p.weapons[0].starter, true);
    assert.equal(p.maxHalves, c.hearts * 2);
    for (const [k, v] of Object.entries(c.stats)) assert.equal((p.stats as unknown as Record<string, unknown>)[k], v, `${id}.${k}`);
    if (c.relic) assert.equal(p.relic?.id, c.relic);
  }
  // the gravedigger raises for one soul, the others for two
  assert.equal(makePlayer("grabarz", vec()).stats.raiseCost, 1);
  assert.equal(makePlayer("medyk", vec()).stats.raiseCost, 2);
  // a starting occult weapon is free
  const lich = makePlayer("lisz", vec());
  assert.equal(WEAPONS[lich.weapons[0].id].kind, "occult");
});

test("the plague doctor's infected rise as his minions", () => {
  const w = new World(makeRng(3));
  w.player = makePlayer("medyk", vec(400, 500));
  w.alarm = true;
  const g = w.spawn("arquebusier", vec(600, 500));
  freeze(g);
  damageUnit(w, g, 1, vec(1, 0), { fromPlayer: true, side: "minion" });
  assert.ok(g.st.infected, "infected by the hit");
  damageUnit(w, g, 999, vec(1, 0), { fromPlayer: true, side: "minion" });
  step(w, idleInput(), DT);
  assert.ok(w.minions.some((m) => m.kind === "arquebusier"), "risen as a minion");
});

test("the crypt has its sarcophagi, the altar, the skull, the ledger and the stairs", () => {
  const hub = buildHub("grabarz");
  const kinds = hub.interactables.map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === "sarcophagus").length, 6);
  for (const k of ["echoAltar", "skull", "ledger", "stairs"] as const) assert.ok(kinds.includes(k), k);
  // walking to the ledger and pressing E opens it
  const ledger = hub.interactables.find((i) => i.kind === "ledger")!;
  hub.player.pos = vec(ledger.pos.x, ledger.pos.y + 40);
  const ev = step(hub, { ...idleInput(), interact: true }, DT);
  assert.ok(ev.some((e) => e.type === "station" && e.ref === "ledger"));
});

test("the skull tells its story in order, keeping back what the necromancer hasn't lived yet", () => {
  const ctx = { runs: 0, deaths: 0, wins: 0, deepest: 0, bosses: [] as string[] };
  const heard: number[] = [];
  const said: string[] = [];
  for (let i = 0; i < SKULL_STORY.length; i++) {
    const n = nextSkullLine(heard, ctx);
    if (n.index < 0) break;
    heard.push(n.index);
    said.push(n.line[1]);
  }
  assert.ok(said.length >= 8 && said.length < SKULL_STORY.length, "only the advice so far");
  assert.equal(nextSkullLine(heard, ctx, 0).index, -1, "then it just mutters");
  // after the first death and the executioner, new lines open up, in story order
  ctx.deaths = 1;
  ctx.bosses = ["executioner"];
  const a = nextSkullLine(heard, ctx);
  assert.ok(a.index >= 0 && SKULL_STORY[a.index].when);
  heard.push(a.index);
  const b = nextSkullLine(heard, ctx);
  assert.ok(b.index > a.index);
  // a victory unlocks the ending
  heard.push(b.index);
  Object.assign(ctx, { wins: 1, deepest: 6, bosses: ["executioner", "captain", "powdermaster", "bishop", "grandinquisitor", "holyflame"] });
  let left = 0;
  while (nextSkullLine(heard, ctx).index >= 0) {
    heard.push(nextSkullLine(heard, ctx).index);
    left += 1;
  }
  assert.equal(heard.length, SKULL_STORY.length, "the whole story told");
  assert.ok(left > 0);
});
