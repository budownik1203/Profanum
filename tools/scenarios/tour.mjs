/** A tour through the game for screenshots: title, crypt, rooms of each floor, menus. */
export async function run({ page, shot, sleep, game }) {
  await sleep(600);
  await shot("title");
  // "Do krypty" is the first item without a saved run
  await page.mouse.click(800, 522);
  await sleep(800);
  await shot("crypt");
  await game("g.startRun('grabarz', 11)");
  await sleep(900);
  await shot("start");
  for (const type of ["combat", "treasure", "shop", "altar", "secret", "miniboss", "boss"]) {
    const ok = await game(`g.goto('${type}')`);
    if (!ok) continue;
    await sleep(700);
    await shot(`f1-${type}`);
  }
  for (const depth of [2, 3, 4, 5]) {
    await game(`g.descendTo(${depth})`);
    await sleep(500);
    await game(`g.goto('combat')`);
    await sleep(700);
    await shot(`f${depth}-combat`);
  }
  await game("g.descendTo(6)");
  await game("g.goto('final')");
  await sleep(900);
  await shot("final");
  await game("g.pause()");
  await sleep(300);
  await shot("pause");
}
