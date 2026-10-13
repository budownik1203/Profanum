/** A whole run, played by the bot from the cemetery to the Holy Flame (the bot cannot die here). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { playRun } from "./runner.js";
import { FLOORS } from "../src/game/data/floors.js";

test("a whole run can be played from the first room to the death of the Holy Flame", () => {
  const r = playRun(1068, { god: true });
  assert.equal(r.victory, true, `the run ended on floor ${r.depth}: ${r.problems.join("; ")}`);
  // one boss from each floor's three, then the Flame
  const met = r.bosses.map((b) => b.kind);
  assert.equal(met.length, 6, met.join(", "));
  FLOORS.forEach((f, i) => assert.ok((f.bosses as string[]).includes(met[i]), `${met[i]} belongs to ${f.id}`));
  assert.equal(met[5], "holyflame");
  assert.ok(r.rooms >= 40, `walked through ${r.rooms} rooms`);
  assert.ok(r.secrets >= 1, "found the catacombs at least once");
  assert.ok(!r.problems.some((p) => p.includes("non-number")), r.problems.join("; "));
  assert.ok(r.avgStepMs < 1, `a simulation step takes ${r.avgStepMs.toFixed(3)} ms`);
});

test("the bot can take a trapdoor down to a secret floor and come out on the floor below", () => {
  const r = playRun(1102, { god: true, secrets: true, maxDepth: 3 });
  assert.ok(r.secretFloors.length >= 1, `went down a trapdoor (${r.problems.join("; ")})`);
  assert.ok(r.depth >= 3, `came out below: floor ${r.depth}`);
  assert.ok(!r.problems.some((p) => p.includes("no way on")), r.problems.join("; "));
});
