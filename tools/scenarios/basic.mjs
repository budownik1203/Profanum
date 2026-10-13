/** Start the game, walk a little, shoot, take a few pictures. */
export async function run({ page, shot, sleep }) {
  await sleep(500);
  await shot("title");
  await page.mouse.click(800, 300);
  await sleep(600);
  await shot("start-room");
  await page.keyboard.down("KeyW");
  await sleep(900);
  await page.keyboard.up("KeyW");
  await page.mouse.move(800, 150);
  await page.mouse.down();
  await sleep(120);
  await page.mouse.up();
  await sleep(400);
  await shot("after-shot");
}
