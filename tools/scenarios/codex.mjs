/** The Grimoire: the lectern in the crypt and every chapter, half filled in. */
export async function run({ page, shot, sleep, game }) {
  await sleep(600);
  await page.mouse.click(800, 522);
  await sleep(800);
  // half of every chapter known, some kills counted
  await game(`(() => {
    const c = g.meta.codex;
    const S = g.codexSections;
    for (const s of S) s.entries.forEach((id, i) => {
      if (i % 3 === 2) return;
      if (s.id === "enemies" || s.id === "bosses") { if (!c.met.includes(id)) c.met.push(id); c.kills[id] = (i * 7) % 23 + 1; }
      else if (!c.found.includes(id)) c.found.push(id);
    });
    return true;
  })()`);
  await game("g.place(520, 905)");
  await game("g.quiet()");
  await sleep(500);
  await shot("crypt-lectern");
  await page.mouse.move(4, 4);
  const views = [
    [0, 0], [0, 8], [0, 18],
    [1, 0], [1, 4], [1, 13], [1, 14],
    [2, 1], [2, 22],
    [3, 0], [3, 3],
    [4, 0], [4, 7],
    [5, 0], [5, 6],
  ];
  for (const [tab, entry] of views) {
    await game(`g.codex(${tab}, ${entry})`);
    await sleep(250);
    await shot(`codex-${tab}-${entry}`);
  }
  // the same pages in English
  await game("g.lang('en')");
  for (const [tab, entry] of [[0, 18], [1, 13], [2, 22], [5, 6]]) {
    await game(`g.codex(${tab}, ${entry})`);
    await sleep(250);
    await shot(`codex-en-${tab}-${entry}`);
  }
  await game("g.lang('pl')");
  // the pause menu shows the way in
  await game("g.startRun('grabarz', 5)");
  await sleep(500);
  await game("g.quiet()");
  await game("g.pause()");
  await sleep(300);
  await shot("pause");
}
