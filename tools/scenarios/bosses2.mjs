/** Screenshots of the ten newer bosses: a lit portrait, the arena, attacks frozen mid-telegraph. */
const BOSSES = [
  { kind: "exorcist", depth: 1, shots: [["circles", 0.6], ["sprinkle", 0.3], ["banish", 0.8, 0.45]] },
  { kind: "mourner", depth: 1, shots: [["wail", 0.4], ["tears", 0.9], ["veil", 0.7], ["dirge", 1.4, 0.5]] },
  { kind: "ratcatcher", depth: 2, shots: [["pole", 0.5], ["swarm", 1.2], ["traps", 0.9], ["poison", 1.2, 0.45]] },
  { kind: "mobleader", depth: 2, shots: [["charge", 0.4], ["stones", 0.7], ["speech", 0.95, 0.45]] },
  { kind: "usurer", depth: 3, shots: [["coins", 0.6], ["strongbox", 1.4], ["seals", 0.8], ["rain", 1.1, 0.45]] },
  { kind: "lampmaster", depth: 3, shots: [["taper", 0.4], ["plant", 0.5], ["flare", 1.4], ["embers", 0.7, 0.45]] },
  { kind: "abbot", depth: 4, shots: [["bell", 0.6], ["chant", 1.0], ["vespers", 0.8], ["gloria", 1.6, 0.45]] },
  { kind: "scriptor", depth: 4, shots: [["censor", 0.7], ["pages", 1.2], ["ink", 0.8], ["books", 0.7, 0.45]] },
  { kind: "organist", depth: 5, shots: [["chord", 0.6], ["fugue", 1.4], ["pedal", 0.6], ["toccata", 1.5, 0.45]] },
  { kind: "glassangel", depth: 5, shots: [["beams", 0.6], ["dive", 0.5], ["shards", 0.8], ["shatter", 0.6, 0.45]] },
];

export async function run({ shot, sleep, game }) {
  await sleep(500);
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
  for (const a of BOSSES) {
    if (only && !only.includes(a.kind)) continue;
    await game(`g.startRun('grabarz', 11, { ${a.depth}: '${a.kind}' })`);
    await game(`g.descendTo(${a.depth})`);
    const ok = await game("g.goto('boss')");
    if (!ok) continue;
    await game("g.god()");
    await game("(g.quiet(), true)");
    const near = (dy) => game(`(() => { const b = g.run.world.units.find(u => u.def.boss); g.place(b.pos.x, Math.min(b.pos.y + ${dy}, 1250)); return true; })()`);
    await game("g.freeze(true)");
    await game("(g.run.world.dark = false, true)");
    await near(230);
    await sleep(900);
    await shot(`${a.kind}-portrait`);
    await game("(g.run.world.dark = true, true)");
    await game("g.freeze(false)");
    await near(420);
    await sleep(700);
    await shot(`${a.kind}-arena`);
    for (const [step, after, hp] of a.shots) {
      await game("g.freeze(true)");
      if (step === "vespers" || step === "relight") {
        await game("(g.run.world.lights.forEach(l => { if (l.kind === 'candelabra' || l.kind === 'candle') l.on = false; }), true)");
      }
      if (step === "plant") await game("(g.run.world.lights.filter(l => l.kind === 'streetlamp').slice(0, 2).forEach(l => { l.on = false; }), g.run.world.units.find(u => u.def.boss).boss.mem.feed = 0.05, true)");
      await game(`g.boss('${step}'${hp !== undefined ? `, ${hp}` : ""})`);
      if (hp !== undefined) {
        await game("g.advance(1.3)");
        await game(`g.boss('${step}')`);
      }
      await game(`g.advance(${after})`);
      await game("(g.quiet(), true)");
      await sleep(250);
      await shot(`${a.kind}-${step}`);
      await game("g.freeze(false)");
    }
  }
}
