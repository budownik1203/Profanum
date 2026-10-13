/** Screenshots of the secret floors: the trapdoor in the catacombs, then each floor's rooms. */
export async function run({ shot, sleep, game }) {
  await sleep(500);
  for (const [depth, id] of [[1, "ossuarium"], [3, "lochy"]]) {
    await game("g.startRun('grabarz', 11)");
    await game(`g.descendTo(${depth})`);
    await game("g.god()");
    await game("g.goto('secret')");
    await game("(g.quiet(), true)");
    await game("(() => { const h = g.run.world.interactables.find(i => i.kind === 'hatch'); g.place(h.pos.x - 120, h.pos.y + 20); return true; })()");
    await sleep(900);
    await shot(`${id}-hatch`);
    await game(`(g.run.enterSecret('${id}'), true)`);
    await sleep(700);
    await game("(g.quiet(), true)");
    await sleep(300);
    await shot(`${id}-landing`);
    for (const type of ["combat", "treasure", "guardian"]) {
      await game(`g.goto('${type}')`);
      await game("(g.quiet(), true)");
      await game("g.freeze(true)");
      await game("(g.run.world.dark = false, true)");
      await sleep(700);
      await shot(`${id}-${type}-lit`);
      await game("(g.run.world.dark = true, true)");
      await game("g.freeze(false)");
      await sleep(400);
      await shot(`${id}-${type}`);
    }
  }
}
