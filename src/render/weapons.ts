/**
 * Weapons drawn as ink silhouettes: in the necromancer's hands, on the floor and in the HUD.
 * Each is drawn along `angle` from its grip at (x, y).
 */
import type { Graphics } from "pixi.js";
import { WEAPONS, type WeaponId } from "../game/data/weapons.js";
import { PAL } from "../palette.js";

export function drawWeaponShape(g: Graphics, id: WeaponId, x: number, y: number, angle: number, s = 1): void {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  // local (u along the barrel, v across it) → world
  const P = (u: number, v: number): [number, number] => [x + (c * u - sn * v) * s, y + (sn * u + c * v) * s];
  const line = (u0: number, v0: number, u1: number, v1: number, width: number, color: number) => {
    const [ax, ay] = P(u0, v0);
    const [bx, by] = P(u1, v1);
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: width * s, color, cap: "round" });
  };
  const poly = (pts: [number, number][], fill: number) => {
    g.poly(pts.flatMap(([u, v]) => P(u, v))).fill(fill).stroke({ width: 3 * s, color: PAL.ink, join: "round" });
  };
  const def = WEAPONS[id];
  const L = def ? def.length : 20;
  const wood = PAL.wood;
  const steel = PAL.steel;
  switch (id) {
    case "pistol":
    case "doublepistol":
      poly([[-8, -3], [6, -3], [6, 9], [-2, 10]], wood);
      line(0, -2, L, -2, 7, PAL.ink);
      line(0, -2, L - 1, -2, 3.5, steel);
      if (id === "doublepistol") {
        line(0, 3, L, 3, 7, PAL.ink);
        line(0, 3, L - 1, 3, 3.5, steel);
      }
      break;
    case "arquebus":
    case "captainarq":
    case "gerwazy":
      poly([[-18, -4], [8, -3], [8, 4], [-18, 8]], id === "gerwazy" ? 0x8a8070 : wood);
      line(4, -1, L, -1, 8, PAL.ink);
      line(4, -1, L - 1, -1, 4, id === "gerwazy" ? 0xe8e0c8 : steel);
      if (id === "captainarq") line(10, 2, 22, 2, 3, 0xd8b04a);
      if (id === "gerwazy") line(L - 6, -5, L - 6, 3, 3, 0xd8b04a);
      break;
    case "blunderbuss":
    case "lament":
      poly([[-14, -4], [6, -3], [6, 4], [-14, 8]], wood);
      line(4, 0, L - 6, 0, 8, PAL.ink);
      line(4, 0, L - 6, 0, 4, id === "lament" ? 0xb8ac90 : 0xa8823e);
      poly([[L - 8, -4], [L + 2, -8], [L + 2, 8], [L - 8, 4]], id === "lament" ? 0xd8ccb0 : 0xa8823e);
      if (id === "lament") for (let i = 0; i < 3; i++) line(L + 2, -6 + i * 6, L + 6, -6 + i * 6, 2, 0xe8e0d0);
      break;
    case "crossbow":
    case "inqcrossbow":
      line(-10, 0, L, 0, 7, PAL.ink);
      line(-10, 0, L, 0, 4, id === "inqcrossbow" ? 0x5a1414 : wood);
      line(L - 6, -16, L - 6, 16, 6, PAL.ink);
      line(L - 6, -16, L - 6, 16, 3, steel);
      line(L - 6, -16, 2, 0, 1.5, 0xd8c8a0);
      line(L - 6, 16, 2, 0, 1.5, 0xd8c8a0);
      break;
    case "petronel":
      poly([[-12, -2], [4, -3], [4, 4], [-6, 12], [-14, 10]], wood);
      line(2, 0, L, 0, 8, PAL.ink);
      line(2, 0, L - 1, 0, 4, steel);
      break;
    case "organ":
    case "martyrs":
      poly([[-10, -10], [6, -10], [6, 10], [-10, 10]], wood);
      for (let i = -2; i <= 2; i++) {
        line(4, i * 4, L, i * 4, 4, PAL.ink);
        line(4, i * 4, L - 1, i * 4, 2, id === "martyrs" ? 0xd8ccb0 : steel);
      }
      break;
    case "hakownica":
    case "headsman":
      poly([[-16, -4], [10, -4], [10, 5], [-16, 8]], wood);
      line(8, 0, L, 0, 11, PAL.ink);
      line(8, 0, L - 1, 0, 6, id === "headsman" ? 0x5a1414 : steel);
      line(L * 0.55, 4, L * 0.55, 14, 5, PAL.ink);
      break;
    case "mortar":
      poly([[-8, -6], [6, -6], [6, 6], [-8, 6]], wood);
      poly([[4, -10], [L, -12], [L, 12], [4, 10]], 0x4a4440);
      break;
    case "howler":
      g.circle(...P(10, 0), 10 * s).fill(0xcfc4a8).stroke({ width: 3 * s, color: PAL.ink });
      g.circle(...P(12, -3), 2.5 * s).fill(PAL.ink);
      g.circle(...P(12, 3), 2.5 * s).fill(PAL.ink);
      poly([[16, -5], [22, -6], [22, 6], [16, 5]], 0xcfc4a8);
      break;
    case "ashbook":
      poly([[0, -10], [16, -10], [16, 10], [0, 10]], 0x3a2418);
      line(2, 0, 14, 0, 2, 0xff8a3a);
      break;
    case "bonestaff":
      line(-16, 0, L, 0, 7, PAL.ink);
      line(-16, 0, L, 0, 3.5, 0xcfc4a8);
      g.circle(...P(L + 4, 0), 7 * s).fill(0xcfc4a8).stroke({ width: 3 * s, color: PAL.ink });
      break;
    case "ratgun":
      // a short musket with a wire cage of live rats on the barrel
      poly([[-12, -3], [6, -3], [6, 4], [-12, 8]], wood);
      line(4, 0, L, 0, 8, PAL.ink);
      line(4, 0, L - 1, 0, 4, steel);
      poly([[L - 22, -9], [L - 6, -9], [L - 6, 7], [L - 22, 7]], 0x3a3028);
      for (const u of [-19, -14, -9]) line(L + u, -9, L + u, 7, 1.6, 0x8c8a82);
      g.moveTo(...P(L - 22, 4)).quadraticCurveTo(...P(L - 28, 12), ...P(L - 24, 16)).stroke({ width: 2 * s, color: 0xb88a7a });
      break;
    case "sling":
      // two cords and a leather pouch with a cobble in it
      line(0, -2, L - 6, -6, 2, 0x8a6a3a);
      line(0, 2, L - 6, 6, 2, 0x8a6a3a);
      poly([[L - 8, -7], [L + 4, -5], [L + 4, 5], [L - 8, 7]], 0x6a4a2a);
      g.circle(...P(L - 1, 0), 4 * s).fill(0x6a6458).stroke({ width: 2 * s, color: PAL.ink });
      g.circle(...P(-2, 0), 3 * s).fill(0x6a4a2a).stroke({ width: 2 * s, color: PAL.ink });
      break;
    case "coingun":
      // a gilded pistol with a coin slot on the lock
      poly([[-8, -3], [6, -3], [6, 9], [-2, 10]], 0x3a2416);
      line(0, -2, L, -2, 8, PAL.ink);
      line(0, -2, L - 1, -2, 4.5, 0xd8b04a);
      g.circle(...P(-3, 5), 2.5 * s).fill(0xd8b04a);
      line(2, -6, 7, -6, 2, PAL.ink);
      break;
    case "snuffer":
      // the lamplighter's pole: a brass snuffing cone and a smouldering wick
      line(-14, 0, L, 0, 6, PAL.ink);
      line(-14, 0, L, 0, 3, 0x4a3a28);
      poly([[L - 4, -4], [L + 8, -9], [L + 8, 9], [L - 4, 4]], 0xa8823e);
      g.circle(...P(L + 9, 0), 3 * s).fill(PAL.emberHot);
      break;
    case "abbotbell":
      // a heavy hand bell on a turned wooden handle
      line(-6, 0, 6, 0, 5, PAL.wood);
      poly([[6, -6], [20, -11], [20, 11], [6, 6]], 0xc8a040);
      g.circle(...P(22, 0), 2.6 * s).fill(0x8a6a28).stroke({ width: 1.5 * s, color: PAL.ink });
      break;
    case "glassgun":
      // a flared barrel of leaded stained glass
      poly([[-12, -4], [6, -3], [6, 4], [-12, 8]], wood);
      poly([[4, -5], [L - 6, -4], [L + 2, -9], [L + 2, 9], [L - 6, 4], [4, 5]], 0x2a4f8c);
      poly([[10, -4], [16, -4], [16, 4], [10, 4]], PAL.glass[0]);
      poly([[16, -4], [L - 6, -4], [L - 6, 4], [16, 4]], PAL.glass[2]);
      poly([[L - 6, -4], [L + 2, -9], [L + 2, 9], [L - 6, 4]], 0x9ad8e8);
      break;
    default:
      line(0, 0, L, 0, 6, PAL.ink);
  }
}
