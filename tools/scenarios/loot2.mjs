/** Screenshots of the stage-9 loot: the bosses' weapons, the new items and relics on the floor and in hand. */
const WEAPONS = ["ratgun", "sling", "coingun", "snuffer", "abbotbell", "glassgun"];
const ITEMS = ["goldtooth", "stainedglass", "usurerseal", "spectacles"];
const RELICS = ["chain", "knell", "wail"];

export async function run({ shot, sleep, game }) {
  await sleep(500);
  await game("g.startRun('grabarz', 11)");
  await game("g.god()");
  await game("(g.quiet(), true)");
  await game("(g.run.world.dark = false, true)");
  await game("g.place(700, 760)");
  for (let i = 0; i < WEAPONS.length; i++) await game(`g.drop('weapon', '${WEAPONS[i]}', ${360 + i * 110}, 380)`);
  for (let i = 0; i < ITEMS.length; i++) await game(`g.drop('item', '${ITEMS[i]}', ${360 + i * 110}, 500)`);
  for (let i = 0; i < RELICS.length; i++) await game(`g.drop('relic', '${RELICS[i]}', ${360 + i * 110}, 610)`);
  await sleep(800);
  await shot("loot2-floor");
  for (const w of WEAPONS) {
    await game(`g.give('weapon', '${w}')`);
    await game("(g.run.world.player.gold = 30, g.run.world.player.souls = 9, true)");
    await game("(g.quiet(), true)");
    await sleep(350);
    await shot(`loot2-hand-${w}`);
  }
  // firing each one at a guard
  await game("(g.run.world.spawn('halberdier', { x: 1100, y: 500 }), true)");
  for (const w of WEAPONS) {
    await game(`(g.run.world.player.current = g.run.world.player.weapons.findIndex(s => s.id === '${w}'), g.run.world.player.facing = Math.atan2(500 - g.run.world.player.pos.y, 1100 - g.run.world.player.pos.x), true)`);
  }
  await game("g.give('relic', 'wail')");
  await game("g.pause()");
  await sleep(400);
  await shot("loot2-pause");
}
