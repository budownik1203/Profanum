/** More of them: a last stand with its clock, groups walking in at the doors. */
export async function run({ shot, sleep, game }) {
  await sleep(500);
  await game("g.startRun('grabarz', 41)");
  await sleep(400);
  await game("g.descendTo(3)");
  await game("g.goto('combat')");
  await sleep(300);
  await game("g.god()");
  const size = await game("({ w: g.run.world.room.w, h: g.run.world.room.h })");
  await game(`g.place(${Math.round(size.w / 2)}, ${Math.round(size.h / 2)})`);
  await game("g.hold()");
  for (let i = 0; i < 8; i++) {
    await sleep(1100);
    await shot(`hold-${i}`);
  }
}
