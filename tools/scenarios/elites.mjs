/** Elites and champions, and a trial room from the pillory to the reward. */
export async function run({ page, shot, sleep, game }) {
  await sleep(500);
  await game("g.startRun('grabarz', 31)");
  await sleep(400);
  await game("g.descendTo(2)");
  await game("g.goto('combat')");
  await sleep(300);
  await game("g.god()");
  const size = await game("({ w: g.run.world.room.w, h: g.run.world.room.h })");
  const cx = Math.round(size.w / 2);
  const cy = Math.round(size.h / 2);
  await game(`g.place(${cx}, ${cy + 260})`);
  // the four elites in a row, lit by a brazier, and a row of champions
  await game(`g.squad([["grenadier", ${cx - 330}, ${cy - 120}], ["butcher", ${cx - 110}, ${cy - 120}], ["confessor", ${cx + 110}, ${cy - 120}], ["summoner", ${cx + 330}, ${cy - 120}],
    ["halberdier", ${cx - 420}, ${cy + 60}], ["arquebusier", ${cx - 280}, ${cy + 60}], ["peasant", ${cx - 140}, ${cy + 60}], ["monk", ${cx}, ${cy + 60}], ["dog", ${cx + 140}, ${cy + 60}], ["witchhunter", ${cx + 280}, ${cy + 60}], ["flagellant", ${cx + 420}, ${cy + 60}]])`);
  await game(`(() => { const w = g.run.world; w.addLight("brazier", { x: ${cx}, y: ${cy - 20} }, { radius: 700 });
    const gifts = ["swift", "armored", "explosive", "splitting", "healer", "shadow", "vengeful"];
    w.units.filter((u) => !u.elite && u.team !== "minion").forEach((u, i) => (u.champion = gifts[i % gifts.length]));
    return true; })()`);
  await game("g.freeze(true)");
  await sleep(400);
  await game("g.quiet()");
  await shot("elites-champions");
  await game("g.freeze(false)");
  await game("g.alarm()");
  for (let i = 0; i < 4; i++) {
    await sleep(800);
    await game("g.quiet()");
    await shot(`elites-fight-${i}`);
  }
  // the trial room
  await game("g.goto('miniboss')");
  await sleep(300);
  await game("g.god()");
  await game("g.quiet()");
  const t = await game("(() => { const p = g.run.world.interactables.find((i) => i.kind === 'trial'); return { x: p.pos.x, y: p.pos.y }; })()");
  await game(`g.place(${t.x}, ${t.y + 80})`);
  await sleep(500);
  await shot("trial-pillory");
  await page.keyboard.press("KeyE");
  for (let i = 0; i < 6; i++) {
    await sleep(700);
    await shot(`trial-${i}`);
  }
  // fast-forward: every wave falls
  for (let k = 0; k < 8; k++) {
    await game("g.killAll()");
    await game("(() => { for (const u of g.run.world.units) if (u.team !== 'minion') u.hp = 0.001; return true; })()");
    await game("(() => { const w = g.run.world; for (const u of w.units) if (u.alive && u.team !== 'minion') { u.alive = false; } w.units = w.units.filter(u => u.alive); return true; })()");
    await sleep(1700);
  }
  await game("g.quiet()");
  await shot("trial-done");
}
