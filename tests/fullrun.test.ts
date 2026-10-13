/** A whole run, played by the bot from the cemetery to the Holy Flame (the bot cannot die here). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { playRun } from "./runner.js";

test("a whole run can be played from the first room to the death of the Holy Flame", () => {
  const r = playRun(1068, { god: true });
  assert.equal(r.victory, true, `the run ended on floor ${r.depth}: ${r.problems.join("; ")}`);
  assert.deepEqual(
    r.bosses.map((b) => b.kind),
    ["executioner", "captain", "powdermaster", "bishop", "grandinquisitor", "holyflame"],
  );
  assert.ok(r.rooms >= 40, `walked through ${r.rooms} rooms`);
  assert.ok(r.secrets >= 1, "found the catacombs at least once");
  assert.ok(!r.problems.some((p) => p.includes("non-number")), r.problems.join("; "));
  assert.ok(r.avgStepMs < 1, `a simulation step takes ${r.avgStepMs.toFixed(3)} ms`);
});
