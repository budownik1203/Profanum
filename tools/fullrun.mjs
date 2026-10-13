/**
 * Whole runs played by the bot (tests/runner.ts): does every run reach the Holy Flame, how long does
 * it take, where does the bot get stuck, how fast is a simulation step.
 *   npm test && node tools/fullrun.mjs [runs] [god|mortal] [character] [secrets]
 */
import { playRun } from "../.test-build/tests/runner.js";

const runs = Number(process.argv[2] ?? 3);
const god = (process.argv[3] ?? "god") === "god";
const character = process.argv[4] ?? "grabarz";
const secrets = process.argv[5] === "secrets";
for (let i = 1; i <= runs; i++) {
  const t0 = Date.now();
  const r = playRun(1000 + i * 17, { god, character, secrets });
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `seed ${r.seed}: ${r.victory ? "VICTORY" : r.dead ? `died on floor ${r.depth}` : `stopped on floor ${r.depth}`}` +
      ` · ${Math.round(r.time / 60)} min simulated (${wall}s real) · rooms ${r.rooms} · stuck ${r.stuck} · stalled ${r.stalled}` +
      ` · lost ${r.halvesLost} halves · kills ${r.kills} · raised ${r.raised} · legends ${r.legends} · secrets ${r.secrets} · bought ${r.bought}` +
      ` · bullets max ${r.maxBullets} · step ${r.avgStepMs.toFixed(3)}ms avg / ${r.maxStepMs.toFixed(1)}ms max`,
  );
  console.log("   bosses:", r.bosses.map((b) => `${b.kind} ${b.seconds}s`).join(", ") + (r.secretFloors.length ? `   secret floors: ${r.secretFloors.join(", ")}` : ""));
  for (const p of r.problems.slice(0, 8)) console.log("   !", p);
}
