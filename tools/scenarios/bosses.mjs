/** Screenshots of every boss: the arena, then attacks frozen mid-telegraph. */
const ARENAS = [
  { depth: 1, shots: [["chop", 0.45], ["ring", 0.3], ["charge", 0.45, 0.45]] },
  { depth: 2, shots: [["volley", 0.7], ["lunge", 0.2], ["pistols", 0.35, 0.45]] },
  { depth: 3, shots: [["bombs", 0.75], ["fuse", 0.45], ["spiral", 1.2, 0.45]] },
  { depth: 4, shots: [["cross", 0.6], ["consecrate", 0.9], ["rain", 0.6, 0.5]] },
  { depth: 5, shots: [["beam", 0.3], ["beam", 1.4], ["hook", 0.3], ["stakes", 0.7, 0.45]] },
  { depth: 6, shots: [["idle", 0.6], ["sermon", 0.8, 0.5], ["spiral", 1.5, 0.2]] },
];

export async function run({ shot, sleep, game }) {
  await sleep(500);
  for (const a of ARENAS) {
    await game("g.startRun('grabarz', 11)");
    await game(`g.descendTo(${a.depth})`);
    const ok = await game(a.depth === 6 ? "g.goto('final')" : "g.goto('boss')");
    if (!ok) continue;
    await game("g.god()");
    const near = (dy) => game(`(() => { const b = g.run.world.units.find(u => u.def.boss); g.place(b.pos.x, Math.min(b.pos.y + ${dy}, 1250)); return true; })()`);
    // a close, fully lit portrait first
    await game("g.freeze(true)");
    await game("(g.run.world.dark = false, true)");
    await near(230);
    await sleep(900);
    await shot(`boss${a.depth}-portrait`);
    await game("(g.run.world.dark = true, true)");
    await game("g.freeze(false)");
    await near(420);
    await sleep(700);
    await shot(`boss${a.depth}-intro`);
    for (const [step, after, hp] of a.shots) {
      await game("g.freeze(true)");
      if (a.depth === 4 && step === "consecrate") {
        await game("(g.run.world.lights.forEach(l => { if (l.kind === 'candelabra') l.on = false; }), true)");
      }
      if (a.depth === 6 && step === "idle") {
        // put three braziers out and let a tongue of fire reach for one
        await game("(g.run.world.lights.filter(l => l.kind === 'brazier').slice(0, 3).forEach(l => { l.on = false; }), true)");
        await game("(g.run.world.units.find(u => u.def.boss).boss.mem.feed = 0.05, true)");
      }
      await game(`g.boss('${step}'${hp !== undefined ? `, ${hp}` : ""})`);
      if (hp !== undefined) {
        // let the phase roar pass first, then start the attack
        await game("g.advance(1.3)");
        await game(`g.boss('${step}')`);
      }
      await game(`g.advance(${after})`);
      await sleep(250);
      await shot(`boss${a.depth}-${step}`);
      await game("g.freeze(false)");
    }
  }
}
