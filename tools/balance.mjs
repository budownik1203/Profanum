/**
 * Boss balance check with the scripted bot (tests/bot.ts): time to kill and hits taken.
 *   npm test (to compile .test-build) && node tools/balance.mjs [seeds] [weapon]
 */
import { World } from "../.test-build/src/game/world.js";
import { makeRng, vec } from "../.test-build/src/game/math.js";
import { setupBossArena } from "../.test-build/src/game/bosses.js";
import { giveWeapon } from "../.test-build/src/game/stats.js";
import { botInput, newBot } from "../.test-build/tests/bot.js";

const seeds = Number(process.argv[2] ?? 4);
const weaponArg = process.argv[3];
const BOSSES = [["executioner", 1], ["captain", 2], ["powdermaster", 3], ["bishop", 4], ["grandinquisitor", 5], ["holyflame", 6]];
const LOADOUT = { 1: "pistol", 2: "doublepistol", 3: "arquebus", 4: "petronel", 5: "organ", 6: "hakownica" };
const DT = 1 / 60;
for (const [kind, depth] of BOSSES) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = makeRng(seed * 31 + depth);
    const w = new World(rng, { w: 2200, h: 1400 });
    w.roomType = depth >= 6 ? "final" : "boss";
    w.ctx = { depth, grace: false };
    const boss = setupBossArena(w, kind, depth, rng);
    const p = w.player;
    p.pos = vec(1100, 1250);
    p.maxHalves = 999;
    p.halves = 999;
    const wid = weaponArg ?? LOADOUT[depth];
    if (wid !== "pistol") {
      giveWeapon(p, wid);
      p.current = p.weapons.length - 1;
      p.weapons[p.current].ammo = 9999;
    }
    const m = newBot();
    let t = 0;
    let hitsBy = {};
    let lastStep = "";
    for (; t < 240 && boss.alive; t += DT) {
      const before = p.halves;
      w.update(DT, botInput(w, m, DT));
      if (boss.boss && boss.boss.step !== "idle") lastStep = boss.boss.step;
      if (p.halves < before) hitsBy[lastStep] = (hitsBy[lastStep] ?? 0) + (before - p.halves);
    }
    rows.push({ seed, ttk: boss.alive ? ">240" : t.toFixed(0), lost: 999 - p.halves, hitsBy });
  }
  const lost = rows.map((r) => r.lost);
  const avgLost = lost.reduce((a, b) => a + b, 0) / rows.length;
  console.log(`${kind.padEnd(16)} weapon=${(weaponArg ?? LOADOUT[depth]).padEnd(12)} ttk=${rows.map((r) => r.ttk).join(",").padEnd(18)} halves lost=${lost.join(",")} avg ${avgLost.toFixed(1)}`);
  const agg = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.hitsBy)) agg[k] = (agg[k] ?? 0) + v;
  console.log("   by attack:", JSON.stringify(agg));
}
