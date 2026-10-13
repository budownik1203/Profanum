/** Formations: a musket line with a paviser, a wedge of halberds, a procession, monks at the pyre. */
export async function run({ page, shot, sleep, game }) {
  await sleep(500);
  await game("g.startRun('grabarz', 21)");
  await sleep(400);
  await game("g.descendTo(2)");
  await game("g.goto('combat')");
  await sleep(300);
  await game("g.god()");
  await game("g.quiet()");
  const size = await game("({ w: g.run.world.room.w, h: g.run.world.room.h })");
  const cx = Math.round(size.w / 2);
  const top = 260;
  await game(`g.place(${cx}, ${size.h - 200})`);
  // the line: a sergeant, four muskets in two ranks, a paviser
  await game(`g.squad([["sergeant", ${cx}, ${top}], ["arquebusier", ${cx - 160}, ${top + 40}], ["arquebusier", ${cx - 60}, ${top + 40}], ["arquebusier", ${cx + 60}, ${top + 40}], ["arquebusier", ${cx + 160}, ${top + 40}], ["dog", ${cx + 260}, ${top + 60}], ["dog", ${cx - 260}, ${top + 60}]], { kind: "line", ranged: "arquebusier", pavise: true })`);
  await sleep(400);
  await game("g.quiet()");
  await shot("line-idle");
  await game("g.alarm()");
  for (let i = 0; i < 6; i++) {
    await sleep(700);
    await game("g.quiet()");
    await shot(`line-${i}`);
  }
  // the wedge
  await game(`g.squad([["halberdier", ${cx}, ${top}], ["halberdier", ${cx - 70}, ${top - 30}], ["halberdier", ${cx + 70}, ${top - 30}], ["halberdier", ${cx - 140}, ${top - 60}], ["halberdier", ${cx + 140}, ${top - 60}]], { kind: "wedge", melee: "halberdier" })`);
  await game(`g.place(${cx}, ${size.h - 200})`);
  await game("g.alarm()");
  for (let i = 0; i < 5; i++) {
    await sleep(900);
    await game("g.quiet()");
    await shot(`wedge-${i}`);
  }
  // a procession in the monastery, and monks burning the dead
  await game("g.descendTo(4)");
  await game("g.goto('combat')");
  await sleep(300);
  await game("g.god()");
  const s4 = await game("({ w: g.run.world.room.w, h: g.run.world.room.h })");
  const c4 = Math.round(s4.w / 2);
  await game(`g.place(${c4}, ${s4.h - 200})`);
  const px = c4 - 420;
  await game(`g.squad([["monk", ${px}, 360], ["flagellant", ${px}, 300], ["acolyte", ${px - 30}, 250], ["acolyte", ${px + 30}, 200], ["flagellant", ${px}, 150]], { kind: "procession" })`);
  await game(`(() => { for (let i = 0; i < 3; i++) g.run.world.corpses.push({ id: 9000 + i, kind: "peasant", pos: { x: ${c4} + 300 + i * 60, y: 560 }, dir: { x: 1, y: 0 }, echo: 40, raises: 0, fromMinion: false, big: false }); return true; })()`);
  await game("g.alarm()");
  for (let i = 0; i < 6; i++) {
    await sleep(800);
    await game("g.quiet()");
    await shot(`procession-${i}`);
  }
}
