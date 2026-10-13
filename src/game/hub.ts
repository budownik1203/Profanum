/**
 * The necromancer's crypt between runs (design doc: Krypta-hub): sarcophagi of the six characters,
 * the altar of echoes that unlocks new things, a talking skull, the ledger of the dead (statistics),
 * the Grimoire (everything met and held) and the stairs down to the cemetery.
 */
import { vec } from "./math.js";
import { CHARACTER_ORDER, type CharacterId } from "./data/items.js";
import { makePlayer } from "./stats.js";
import { World } from "./world.js";

export function buildHub(character: CharacterId): World {
  const w = new World(Math.random, { w: 1700, h: 1050 });
  w.theme = "krypta";
  w.roomType = "hub";
  w.dark = true;
  w.alarm = true;
  w.player = makePlayer(character, vec(850, 760));
  CHARACTER_ORDER.forEach((id, i) => {
    w.addInteractable("sarcophagus", vec(300 + i * 220, 250), { ref: id, radius: 90 });
  });
  w.addInteractable("echoAltar", vec(1330, 640), { ref: "echoAltar", radius: 110 });
  w.addInteractable("skull", vec(370, 640), { ref: "skull", radius: 100 });
  w.addInteractable("ledger", vec(850, 560), { ref: "ledger", radius: 90 });
  w.addInteractable("stairs", vec(850, 900), { radius: 90 });
  // the Grimoire, chained to its stone: all that was met and held
  w.addInteractable("codex", vec(520, 840), { ref: "codex", radius: 90 });
  w.addLight("candle", vec(600, 800));
  for (const [x, y] of [[180, 160], [1520, 160]] as const) w.addLight("brazier", vec(x, y));
  for (const [x, y] of [[300, 360], [520, 360], [740, 360], [960, 360], [1180, 360], [1400, 360]] as const) w.addLight("candle", vec(x, y));
  w.addLight("candelabra", vec(1330, 560));
  w.addLight("candle", vec(370, 590));
  w.addLight("candle", vec(905, 520));
  w.addLight("brazier", vec(850, 980));
  w.addCover(560, 520, 40, 40, "pillar");
  w.addCover(1100, 520, 40, 40, "pillar");
  return w;
}
