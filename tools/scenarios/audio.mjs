/** The sound wakes up on the first click and survives a fight, a boss and the crypt without errors. */
export async function run({ page, sleep, game }) {
  await sleep(500);
  const before = await game("g.audio");
  await page.mouse.click(800, 522); // "Do krypty"
  await sleep(600);
  const after = await game("g.audio");
  console.log("audio before/after the first click:", before, after);
  if (!String(after).startsWith("running")) throw new Error(`audio did not start: ${after}`);
  await game("g.startRun('grabarz', 11)");
  await game("g.god()");
  await game("g.goto('combat')");
  // a fight: shots, hits, deaths, explosions
  await page.keyboard.down("KeyD");
  await page.mouse.move(1200, 300);
  await page.mouse.down();
  await sleep(1500);
  await page.mouse.up();
  await page.keyboard.up("KeyD");
  await game("g.killAll()");
  await sleep(800);
  await game("g.descendTo(5)");
  await game("g.goto('boss')");
  await game("g.god()");
  await game("g.boss('beam')");
  await sleep(2500);
  await game("g.boss('stakes', 0.4)");
  await sleep(2000);
  console.log("audio during the boss:", await game("g.audio"));
  await game("g.enterHub()");
  await sleep(1200);
  console.log("audio in the crypt:", await game("g.audio"));
}
