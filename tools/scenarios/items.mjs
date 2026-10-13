/** Screenshots of the loot: every item and relic on the floor, the HUD with a full bag, the pause inventory. */
const ITEMS = ["boneshirt", "powder", "ramrod", "bandolier", "jarskull", "rosary", "shroud", "shackles", "handofglory", "claws", "hourglass", "tome", "purse", "martyrheart", "wick", "gravedirt", "emberpocket", "noose"];
const RELICS = ["monstrance", "finger", "plague", "nightshroud", "prophet", "vial", "rope"];

export async function run({ shot, sleep, game }) {
  await sleep(500);
  await game("g.startRun('grabarz', 11)");
  await game("g.god()");
  await game("(g.run.world.dark = false, true)");
  await game("g.place(700, 760)");
  // every item and relic laid out on the floor
  for (let i = 0; i < ITEMS.length; i++) await game(`g.drop('item', '${ITEMS[i]}', ${360 + (i % 9) * 80}, ${360 + Math.floor(i / 9) * 90})`);
  for (let i = 0; i < RELICS.length; i++) await game(`g.drop('relic', '${RELICS[i]}', ${360 + i * 80}, 560)`);
  await sleep(800);
  await shot("loot-floor");
  // a full bag: weapons, items, a relic, two synergies
  for (const w of ["organ", "lament", "howler", "gerwazy"]) await game(`g.give('weapon', '${w}')`);
  for (const it of ["ramrod", "jarskull", "gravedirt", "powder", "powder", "noose", "wick", "rosary", "tome"]) await game(`g.give('item', '${it}')`);
  await game("g.give('relic', 'prophet')");
  await sleep(1200);
  await shot("loot-hud");
  await game("g.pause()");
  await sleep(400);
  await shot("loot-pause");
}
