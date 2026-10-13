/**
 * People and creatures: every unit kind as an ink silhouette with its own headgear and weapon,
 * the six playable characters, minions in ash grey with ember eyes, elites with a gold crest.
 * Parametric on purpose: one figure builder, many looks (placeholders until the cut-out sprites).
 */
import type { Graphics } from "pixi.js";
import { CONFIG } from "../game/config.js";
import type { UnitKind } from "../game/data/units.js";
import type { CharacterId } from "../game/data/items.js";
import type { Unit } from "../game/types.js";
import type { World } from "../game/world.js";
import { PAL } from "../palette.js";
import { OUT } from "./env.js";
import { drawWeaponShape } from "./weapons.js";

type Head = "morion" | "plumed" | "widebrim" | "capotain" | "straw" | "bare" | "hood" | "skull" | "cowl" | "mask" | "tonsure" | "inqhat" | "greathelm" | "executioner" | "mitre";
type Gear = "halberd" | "arquebus" | "pistols" | "pitchfork" | "torch" | "crossbow" | "shovel" | "claws" | "orb" | "flask" | "censer" | "whip" | "sword" | "handbell" | "candle" | "axe" | "bombs" | "crozier" | "none";

interface Look {
  coat: number;
  coatMid: number;
  skin: number;
  head: Head;
  gear: Gear;
  /** Long robe to the ground instead of a coat skirt. */
  robe?: boolean;
  /** Hunched forward (0..0.4). */
  hunch?: number;
  bulk?: number;
  shield?: boolean;
  trim?: number;
  eyes?: number;
}

const LOOKS: Partial<Record<UnitKind, Look>> = {
  halberdier: { coat: 0x6a2c1e, coatMid: 0x3e1912, skin: 0x8a6e58, head: "morion", gear: "halberd" },
  arquebusier: { coat: 0x3a4048, coatMid: 0x22262c, skin: 0x8a6e58, head: "widebrim", gear: "arquebus" },
  sergeant: { coat: 0x7a3022, coatMid: 0x451a12, skin: 0x8a6e58, head: "plumed", gear: "pistols", trim: 0xa8823e, bulk: 1.08 },
  peasant: { coat: 0x5a4a32, coatMid: 0x3a2e1e, skin: 0x8c705a, head: "straw", gear: "pitchfork", hunch: 0.15 },
  torchbearer: { coat: 0x4e3e2a, coatMid: 0x30261a, skin: 0x8c705a, head: "bare", gear: "torch", hunch: 0.1 },
  witchhunter: { coat: 0x24201c, coatMid: 0x141210, skin: 0x8a6e58, head: "capotain", gear: "crossbow", trim: 0xc8c0a8 },
  gravedigger: { coat: 0x3a3a30, coatMid: 0x22221c, skin: 0x7a6a58, head: "hood", gear: "shovel", hunch: 0.2, bulk: 1.1 },
  feral: { coat: 0x4a5040, coatMid: 0x2a3024, skin: 0x6a7258, head: "skull", gear: "claws", hunch: 0.3, eyes: 0x8aff6a },
  cultist: { coat: 0x3a2048, coatMid: 0x22122c, skin: 0x7a6a5a, head: "cowl", gear: "orb", robe: true, trim: 0x9a5ac8, eyes: 0xc88aff },
  alchemist: { coat: 0x4a3a28, coatMid: 0x2a2016, skin: 0x8a6e58, head: "mask", gear: "flask", trim: 0x6a5a3a },
  monk: { coat: 0x5a4a3a, coatMid: 0x382c22, skin: 0x8a6e58, head: "tonsure", gear: "censer", robe: true },
  flagellant: { coat: 0x8a6a58, coatMid: 0x5a3a2c, skin: 0x8a6a58, head: "hood", gear: "whip", trim: 0x7a1a12 },
  inquisitor: { coat: 0x5a1414, coatMid: 0x320a0a, skin: 0x8a6e58, head: "inqhat", gear: "crossbow", robe: true, trim: 0xa8823e },
  knight: { coat: 0xd8d0c0, coatMid: 0x8a8070, skin: 0x8a6e58, head: "greathelm", gear: "sword", shield: true, trim: 0xb8321e, bulk: 1.15 },
  bellringer: { coat: 0x4a3a30, coatMid: 0x2c221c, skin: 0x8a6e58, head: "hood", gear: "handbell", hunch: 0.35 },
  acolyte: { coat: 0xb8ac98, coatMid: 0x7a6e5e, skin: 0x8a6e58, head: "tonsure", gear: "candle", robe: true },
  // bosses (their full portraits come with the boss fights)
  executioner: { coat: 0x7a5a48, coatMid: 0x4a2a20, skin: 0x8a6a58, head: "executioner", gear: "axe", bulk: 1.25, trim: 0x2a2020 },
  captain: { coat: 0x8a2a1e, coatMid: 0x4a1610, skin: 0x8a6e58, head: "plumed", gear: "halberd", trim: 0xd8b04a, bulk: 1.1 },
  powdermaster: { coat: 0x5a4028, coatMid: 0x342414, skin: 0x8a6e58, head: "mask", gear: "bombs", trim: 0xa8823e, bulk: 1.2 },
  bishop: { coat: 0xe8e0d0, coatMid: 0xa8a090, skin: 0x8a6e58, head: "mitre", gear: "crozier", robe: true, trim: 0xd8b04a, bulk: 1.2 },
  grandinquisitor: { coat: 0x7a1010, coatMid: 0x400808, skin: 0x8a6e58, head: "inqhat", gear: "crossbow", robe: true, trim: 0xd8b04a, bulk: 1.1 },
};

const MINION = { coat: PAL.minion, coatMid: PAL.minionMid, skin: 0x7a766e };

// ------------------------------------------------------------------ units
export function drawUnit(g: Graphics, glow: Graphics, e: Unit, w: World, warn: number): void {
  if (e.kind === "dog") return drawDog(g, glow, e, w, warn);
  if (e.kind === "mimic") return drawMimic(g, glow, e, w);
  if (e.kind === "abomination") return drawAbomination(g, glow, e, w);
  if (e.kind === "holyflame") return drawFlame(g, glow, e, w);
  const look = LOOKS[e.kind] ?? LOOKS.halberdier!;
  const minion = e.team === "minion";
  const { x, y } = e.pos;
  const size = (e.def.size ?? 1) * (e.mini ? 0.75 : 1) * (e.elite ? 1.15 : 1);
  const face = minion ? (e.dir.x >= 0 ? 1 : -1) : w.player.pos.x >= x ? 1 : -1;
  const flash = e.flash > 0;
  const coat = flash ? 0xffffff : minion ? MINION.coat : look.coat;
  const coatMid = flash ? 0xffffff : minion ? MINION.coatMid : look.coatMid;
  const skin = flash ? 0xffffff : minion ? MINION.skin : look.skin;
  const s = size;
  const top = y - 70 * s;
  const hunch = (look.hunch ?? 0) * 20 * s * face;
  const bulk = look.bulk ?? 1;

  g.ellipse(x, y + 16 * s, 24 * s * bulk, 8 * s).fill({ color: PAL.ink, alpha: 0.6 });
  if (minion) {
    // black mist curling at the feet; it thins out as the body nears its end
    const left = Math.min(1, e.lifetime / 6);
    g.ellipse(x, y + 12 * s, 34 * s, 12 * s).fill({ color: PAL.ink, alpha: 0.35 + 0.25 * left });
    if (e.lifetime < 6 && Math.floor(w.time * 8) % 2 === 0) return; // flickers before crumbling
  }
  if (e.elite) glow.ellipse(x, y + 14 * s, 34 * s, 11 * s).stroke({ width: 3, color: 0xd8b04a, alpha: 0.6 });

  // telegraph: a red line along the attack direction (only hostile units warn the player)
  if (!minion && (e.state === "windup" || e.state === "aim" || e.state === "cast" || warn > 0)) {
    const melee = e.def.ai === "charger" || e.def.ai === "knight";
    const reach = melee ? 260 : e.def.ai === "rusher" || e.def.ai === "frenzy" ? (e.def.reach ?? 80) + 30 : 900;
    const a = e.state === "windup" || e.state === "aim" || e.state === "cast" ? 0.55 : 0.25;
    if (e.def.ai !== "slammer" && e.def.ai !== "bomber" && e.def.ai !== "caster" && e.def.ai !== "censer") {
      glow.moveTo(x, y - 30 * s).lineTo(x + e.dir.x * reach, y - 30 * s + e.dir.y * reach).stroke({ width: melee ? 10 : 2, color: PAL.telegraph, alpha: a });
    } else if (e.state === "cast" || e.state === "aim") {
      glow.circle(x + face * 20 * s, top + 40 * s, 14).fill({ color: PAL.telegraph, alpha: 0.35 });
    }
  }

  // body
  const skirt = look.robe ? 92 : 82;
  const wTop = 18 * s * bulk;
  const wBot = (look.robe ? 28 : 24) * s * bulk;
  g.poly([x - wTop + hunch, top + 20 * s, x + wTop + hunch, top + 20 * s, x + wBot, top + skirt * s, x - wBot, top + skirt * s])
    .fill(coat)
    .stroke({ width: OUT, color: PAL.ink, join: "round" });
  // the shadow half (light from the upper left)
  g.poly([x + 2 * face + hunch, top + 20 * s, x + wTop * face + hunch, top + 20 * s, x + wBot * face, top + skirt * s, x + 2 * face, top + skirt * s]).fill({ color: coatMid, alpha: 0.9 });
  if (look.trim && !minion) g.rect(x - wTop * 0.8 + hunch, top + 22 * s, wTop * 1.6, 5 * s).fill(look.trim);
  if (e.kind === "flagellant" && !minion) {
    // bloody stripes on a bare back
    for (let i = 0; i < 3; i++) g.moveTo(x - 12 * s, top + (32 + i * 10) * s).lineTo(x + 12 * s, top + (38 + i * 10) * s).stroke({ width: 3, color: 0x7a1a12 });
  }
  if (e.kind === "knight" && !minion) {
    // the flame cross of the Holy Flame on the tabard
    g.rect(x - 3 * s, top + 34 * s, 6 * s, 26 * s).fill(0xb8321e);
    g.rect(x - 10 * s, top + 42 * s, 20 * s, 6 * s).fill(0xb8321e);
  }
  if (!look.robe) g.rect(x - 20 * s * bulk, top + 50 * s, 40 * s * bulk, 5 * s).fill(PAL.ink);

  drawHead(g, glow, look.head, x + 2 * face * s + hunch * 1.2, top + 12 * s, s, face, skin, minion, flash, look);
  drawGear(g, glow, look.gear, e, x, top, s, face, minion, w);
  if (look.shield) drawShield(g, e, x, top, s, minion);

  if (minion) {
    glow.circle(x + 6 * face * s + hunch * 1.2, top + 12 * s, 8 * s).fill({ color: PAL.ember, alpha: 0.22 });
    glow.circle(x + 3 * face * s + hunch * 1.2, top + 11 * s, 2 * s).fill(PAL.ember);
    glow.circle(x + 9 * face * s + hunch * 1.2, top + 11 * s, 1.6 * s).fill(PAL.ember);
  } else if (look.eyes) {
    glow.circle(x + 4 * face * s + hunch * 1.2, top + 11 * s, 2.2 * s).fill(look.eyes);
    glow.circle(x + 10 * face * s + hunch * 1.2, top + 11 * s, 1.8 * s).fill(look.eyes);
  }
  if (e.elite) {
    // a gilded crest: the mini-boss
    g.poly([x - 2, top - 8 * s, x + 6, top - 34 * s, x + 14, top - 30 * s, x + 8, top - 8 * s]).fill(0xd8b04a).stroke({ width: 3, color: PAL.ink });
  }
  drawStatus(g, glow, e, x, top, s, w);
  if (e.lamplighter && !minion) drawTaper(g, glow, e, x, top, s, face, w);
}

function drawHead(g: Graphics, glow: Graphics, head: Head, hx: number, hy: number, s: number, face: number, skin: number, minion: boolean, flash: boolean, look: Look): void {
  const ink = { width: 4, color: PAL.ink };
  const dark = flash ? 0xffffff : 0x2a2420;
  switch (head) {
    case "skull":
      g.circle(hx, hy, 11 * s).fill(flash ? 0xffffff : 0xa8a088).stroke(ink);
      g.rect(hx - 5 * s, hy + 5 * s, 10 * s, 7 * s).fill(flash ? 0xffffff : 0xa8a088).stroke({ width: 2, color: PAL.ink });
      return;
    case "hood":
      g.poly([hx - 14 * s, hy + 10 * s, hx - 10 * s, hy - 10 * s, hx - 2 * face * s, hy - 18 * s, hx + 12 * s, hy - 6 * s, hx + 14 * s, hy + 10 * s]).fill(minion ? skin : look.coatMid).stroke(ink);
      g.ellipse(hx + 4 * face * s, hy + 2 * s, 7 * s, 8 * s).fill(PAL.ink);
      return;
    case "cowl":
      g.poly([hx - 15 * s, hy + 12 * s, hx - 12 * s, hy - 10 * s, hx, hy - 20 * s, hx + 12 * s, hy - 10 * s, hx + 15 * s, hy + 12 * s]).fill(minion ? skin : look.coat).stroke(ink);
      g.ellipse(hx + 3 * face * s, hy + 2 * s, 8 * s, 9 * s).fill(PAL.ink);
      return;
    case "executioner":
      g.poly([hx - 13 * s, hy + 12 * s, hx - 12 * s, hy - 12 * s, hx, hy - 22 * s, hx + 12 * s, hy - 12 * s, hx + 13 * s, hy + 12 * s]).fill(flash ? 0xffffff : 0x1a1414).stroke(ink);
      glow.circle(hx + 3 * face * s, hy - 2 * s, 2 * s).fill(0xffd090);
      glow.circle(hx + 9 * face * s, hy - 2 * s, 2 * s).fill(0xffd090);
      return;
    default:
      break;
  }
  g.circle(hx, hy, 11 * s).fill(skin).stroke(ink);
  switch (head) {
    case "morion":
    case "plumed":
      g.poly([hx - 20 * s, hy - 6 * s, hx - 10 * s, hy - 18 * s, hx + 8 * s, hy - 20 * s, hx + 18 * s, hy - 8 * s, hx, hy - 10 * s]).fill(flash ? 0xffffff : PAL.steel).stroke({ width: 4, color: PAL.ink });
      if (head === "plumed") g.poly([hx - 4 * s, hy - 18 * s, hx + 4 * s, hy - 40 * s, hx + 12 * s, hy - 36 * s, hx + 6 * s, hy - 18 * s]).fill(flash ? 0xffffff : 0x9e1f14).stroke({ width: 3, color: PAL.ink });
      break;
    case "widebrim":
    case "capotain":
      g.ellipse(hx, hy - 10 * s, 20 * s, 6 * s).fill(dark).stroke({ width: 4, color: PAL.ink });
      g.rect(hx - 9 * s, hy - (head === "capotain" ? 30 : 22) * s, 18 * s, (head === "capotain" ? 20 : 12) * s).fill(dark).stroke({ width: 3, color: PAL.ink });
      if (head === "capotain") g.rect(hx - 9 * s, hy - 16 * s, 18 * s, 3 * s).fill(0xa8823e);
      break;
    case "straw":
      g.poly([hx - 22 * s, hy - 6 * s, hx, hy - 24 * s, hx + 22 * s, hy - 6 * s]).fill(flash ? 0xffffff : 0xb8a058).stroke({ width: 3, color: PAL.ink });
      break;
    case "bare":
      g.poly([hx - 11 * s, hy - 4 * s, hx - 8 * s, hy - 14 * s, hx + 2 * s, hy - 13 * s, hx + 10 * s, hy - 8 * s, hx + 11 * s, hy - 2 * s]).fill(0x2a1e14);
      break;
    case "mask":
      g.rect(hx - 10 * s, hy - 4 * s, 20 * s, 10 * s).fill(0x4a3a28).stroke({ width: 2, color: PAL.ink });
      g.circle(hx + 3 * face * s, hy, 4 * s).fill(0x8ab090).stroke({ width: 2, color: PAL.ink });
      g.circle(hx - 5 * face * s, hy, 4 * s).fill(0x8ab090).stroke({ width: 2, color: PAL.ink });
      break;
    case "tonsure":
      g.ellipse(hx, hy - 6 * s, 11 * s, 6 * s).fill({ color: 0x2a1e14, alpha: 0.8 });
      g.circle(hx, hy - 8 * s, 6 * s).fill(skin);
      break;
    case "inqhat":
      g.ellipse(hx, hy - 9 * s, 18 * s, 5 * s).fill(0x1a1010).stroke({ width: 3, color: PAL.ink });
      g.poly([hx - 10 * s, hy - 10 * s, hx - 6 * s, hy - 38 * s, hx + 6 * s, hy - 38 * s, hx + 10 * s, hy - 10 * s]).fill(flash ? 0xffffff : 0x1a1010).stroke({ width: 3, color: PAL.ink });
      g.rect(hx - 9 * s, hy - 16 * s, 18 * s, 3 * s).fill(0xa8823e);
      break;
    case "greathelm":
      g.rect(hx - 12 * s, hy - 14 * s, 24 * s, 26 * s).fill(flash ? 0xffffff : 0xb8b4ac).stroke({ width: 4, color: PAL.ink });
      g.rect(hx - 10 * s, hy - 3 * s, 20 * s, 3 * s).fill(PAL.ink);
      g.rect(hx - 1.5 * s, hy - 12 * s, 3 * s, 22 * s).fill(0x8a8478);
      break;
    case "mitre":
      g.poly([hx - 11 * s, hy - 6 * s, hx - 9 * s, hy - 34 * s, hx, hy - 44 * s, hx + 9 * s, hy - 34 * s, hx + 11 * s, hy - 6 * s]).fill(flash ? 0xffffff : 0xe8e0d0).stroke({ width: 3, color: PAL.ink });
      g.rect(hx - 1.5 * s, hy - 40 * s, 3 * s, 32 * s).fill(0xd8b04a);
      break;
    default:
      break;
  }
}

function drawGear(g: Graphics, glow: Graphics, gear: Gear, e: Unit, x: number, top: number, s: number, face: number, minion: boolean, w: World): void {
  const d = e.dir;
  const hx = x + d.x * 18 * s;
  const hy = top + 40 * s + d.y * 18 * s;
  const stick = (x0: number, y0: number, x1: number, y1: number, width: number, color: number) => {
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width + 4, color: PAL.ink, cap: "round" });
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, cap: "round" });
  };
  switch (gear) {
    case "halberd":
    case "pitchfork":
    case "shovel":
    case "axe":
    case "crozier": {
      const raise = e.state === "windup" ? -40 * s : 0;
      const len = (gear === "axe" ? 80 : 70) * s;
      const tx = hx + d.x * len;
      const ty = hy + d.y * len + raise;
      stick(hx - d.x * 30 * s, hy - d.y * 30 * s, tx, ty, 4 * s, gear === "crozier" ? 0xd8b04a : PAL.wood);
      if (gear === "halberd") {
        g.poly([tx, ty, tx - d.y * 14 * s, ty + d.x * 14 * s, tx + d.x * 16 * s, ty + d.y * 16 * s]).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
      } else if (gear === "pitchfork") {
        for (const o of [-7, 0, 7]) stick(tx + -d.y * o * s, ty + d.x * o * s, tx + d.x * 14 * s + -d.y * o * s, ty + d.y * 14 * s + d.x * o * s, 2, PAL.steel);
      } else if (gear === "shovel") {
        g.poly([tx - d.y * 10 * s, ty + d.x * 10 * s, tx + d.y * 10 * s, ty - d.x * 10 * s, tx + d.x * 20 * s + d.y * 8 * s, ty + d.y * 20 * s - d.x * 8 * s, tx + d.x * 20 * s - d.y * 8 * s, ty + d.y * 20 * s + d.x * 8 * s]).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
      } else if (gear === "axe") {
        g.poly([tx, ty, tx - d.y * 26 * s + d.x * 8 * s, ty + d.x * 26 * s + d.y * 8 * s, tx - d.y * 24 * s - d.x * 18 * s, ty + d.x * 24 * s - d.y * 18 * s]).fill(minion ? PAL.minion : 0x9a9890).stroke({ width: 4, color: PAL.ink });
      } else {
        g.circle(tx, ty - 6 * s, 9 * s).stroke({ width: 4 * s, color: 0xd8b04a });
      }
      if (e.state === "charge") {
        for (let i = 1; i <= 3; i++) {
          g.moveTo(x - d.x * 20 * i, top + 40 * s - d.y * 20 * i).lineTo(x - d.x * 20 * (i + 1), top + 40 * s - d.y * 20 * (i + 1)).stroke({ width: 3, color: PAL.ink, alpha: 0.5 / i });
        }
      }
      break;
    }
    case "arquebus":
    case "crossbow": {
      const gx = x + face * 6 * s;
      const gy = top + 38 * s;
      drawWeaponShape(g, gear === "crossbow" ? (e.kind === "inquisitor" || e.kind === "grandinquisitor" ? "inqcrossbow" : "crossbow") : "arquebus", gx, gy, Math.atan2(d.y, d.x), s * 0.9);
      if (e.state === "aim" || e.state === "fire") glow.circle(gx + d.x * 50 * s, gy + d.y * 50 * s, 4 + 4 * Math.max(0, 1 - e.timer / (e.def.aim ?? 0.7))).fill({ color: PAL.ember, alpha: 0.8 });
      break;
    }
    case "pistols":
      drawWeaponShape(g, "pistol", x + face * 8 * s, top + 40 * s, Math.atan2(d.y, d.x), s);
      drawWeaponShape(g, "pistol", x - face * 8 * s, top + 44 * s, Math.atan2(d.y, d.x) + 0.3 * face, s);
      break;
    case "torch": {
      const tx = x + face * 22 * s;
      const ty = top + 22 * s;
      stick(x + face * 10 * s, top + 46 * s, tx, ty, 4 * s, PAL.wood);
      glow.circle(tx, ty - 8, 16).fill({ color: PAL.ember, alpha: 0.25 });
      glow.poly([tx - 6, ty, tx, ty - 22 - Math.sin(w.time * 12 + e.id) * 3, tx + 6, ty]).fill(PAL.emberHot);
      break;
    }
    case "claws": {
      const reach = e.state === "strike" ? 26 : 14;
      for (const o of [-6, 6]) stick(x + face * 10 * s, top + 44 * s + o, hx + d.x * reach * s, hy + d.y * reach * s + o, 3, minion ? PAL.minion : 0x6a7258);
      break;
    }
    case "orb": {
      const ox = x + face * 20 * s;
      const oy = top + 40 * s;
      glow.circle(ox, oy, (e.state === "cast" ? 14 : 9) * s).fill({ color: 0xc88aff, alpha: 0.6 });
      glow.circle(ox, oy, 4 * s).fill(0xffffff);
      break;
    }
    case "flask": {
      const fx = x + face * 18 * s;
      const fy = top + (e.state === "cast" ? 20 : 44) * s;
      g.circle(fx, fy, 7 * s).fill(0x5a8a3a).stroke({ width: 3, color: PAL.ink });
      g.rect(fx - 2 * s, fy - 12 * s, 4 * s, 6 * s).fill(0x8a7a5a);
      break;
    }
    case "bombs": {
      for (let i = 0; i < 3; i++) g.circle(x - 14 * s + i * 14 * s, top + 54 * s, 6 * s).fill(0x2a2620).stroke({ width: 2, color: PAL.ink });
      const fx = x + face * 24 * s;
      g.circle(fx, top + 36 * s, 9 * s).fill(0x2a2620).stroke({ width: 3, color: PAL.ink });
      glow.circle(fx + 4, top + 26 * s, 4).fill(PAL.emberHot);
      break;
    }
    case "censer": {
      const swing = Math.sin(w.time * 3 + e.id) * 0.6 + (e.state === "channel" ? Math.sin(w.time * 12) * 0.6 : 0);
      const cx = x + face * 10 * s + Math.sin(swing) * 26 * s;
      const cy = top + 56 * s + Math.cos(swing) * 10 * s;
      g.moveTo(x + face * 10 * s, top + 34 * s).lineTo(cx, cy - 8 * s).stroke({ width: 2, color: 0xa8823e });
      g.circle(cx, cy, 7 * s).fill(0xa8823e).stroke({ width: 3, color: PAL.ink });
      glow.circle(cx, cy - 10 * s, 12 * s).fill({ color: e.state === "channel" ? PAL.holy : 0xd8d0c0, alpha: e.state === "channel" ? 0.45 : 0.16 });
      break;
    }
    case "whip": {
      const lash = e.state === "strike" ? 1 : e.state === "windup" ? -0.5 : 0.2;
      const ex = hx + (d.x * 70 * lash - d.y * 20) * s;
      const ey = hy + (d.y * 70 * lash + d.x * 20) * s;
      g.moveTo(x + face * 12 * s, top + 40 * s).quadraticCurveTo(hx + d.x * 30 * s, hy - 30 * s, ex, ey).stroke({ width: 3, color: 0x3a2014 });
      break;
    }
    case "sword": {
      const raise = e.state === "windup" ? -1 : 0;
      const sx = x + face * 14 * s;
      const sy = top + 44 * s;
      const a = Math.atan2(d.y, d.x) + raise * 0.9 * face;
      stick(sx, sy, sx + Math.cos(a) * 54 * s, sy + Math.sin(a) * 54 * s, 4 * s, 0xd8d4cc);
      break;
    }
    case "handbell": {
      const ring = e.state === "ring" ? Math.sin(w.time * 30) * 6 : 0;
      const bx = x + face * 20 * s + ring;
      const by = top + 36 * s;
      g.poly([bx - 8 * s, by + 8 * s, bx - 5 * s, by - 6 * s, bx + 5 * s, by - 6 * s, bx + 8 * s, by + 8 * s]).fill(0xa8823e).stroke({ width: 3, color: PAL.ink });
      break;
    }
    case "candle":
      g.rect(x + face * 14 * s - 3, top + 30 * s, 6, 14 * s).fill(PAL.wax).stroke({ width: 2, color: PAL.ink });
      glow.poly([x + face * 14 * s - 3, top + 30 * s, x + face * 14 * s, top + 22 * s, x + face * 14 * s + 3, top + 30 * s]).fill(PAL.emberHot);
      break;
    default:
      break;
  }
}

function drawShield(g: Graphics, e: Unit, x: number, top: number, s: number, minion: boolean): void {
  // the kite shield sits where the knight faces; lowered while he recovers
  const f = e.facing;
  const low = e.state === "recover" ? 14 : 0;
  const cx = x + f.x * 26 * s;
  const cy = top + 44 * s + f.y * 18 * s + low;
  const px = -f.y;
  const py = f.x;
  g.poly([cx + px * 16 * s, cy + py * 16 * s - 16 * s, cx - px * 16 * s, cy - py * 16 * s - 16 * s, cx - px * 12 * s, cy - py * 12 * s + 14 * s, cx, cy + 28 * s, cx + px * 12 * s, cy + py * 12 * s + 14 * s])
    .fill(minion ? PAL.minionMid : 0xd8d0c0)
    .stroke({ width: 4, color: PAL.ink, join: "round" });
  if (!minion) g.circle(cx, cy, 5 * s).fill(0xb8321e);
}

function drawStatus(g: Graphics, glow: Graphics, e: Unit, x: number, top: number, s: number, w: World): void {
  const st = e.st;
  if (st.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = w.time * 5 + (i * Math.PI * 2) / 3;
      glow.circle(x + Math.cos(a) * 16, top - 14 * s + Math.sin(a) * 5, 3).fill(0xf4e2a8);
    }
  }
  if (st.burn > 0) {
    for (let i = 0; i < 3; i++) {
      const fx = x - 12 + i * 12;
      glow.poly([fx - 5, top + 60 * s, fx, top + (36 - 6 * Math.sin(w.time * 10 + i)) * s, fx + 5, top + 60 * s]).fill({ color: i % 2 ? PAL.emberHot : PAL.ember, alpha: 0.8 });
    }
  }
  if (st.weep > 0) glow.circle(x + 6, top + 22 * s + ((w.time * 40) % 20), 2.5).fill(0x9ab8e8);
  if (st.fear > 0) g.poly([x - 3, top - 26 * s, x + 3, top - 26 * s, x + 2, top - 10 * s, x - 2, top - 10 * s]).fill(0xf4e2a8).stroke({ width: 2, color: PAL.ink });
  if (st.infected) glow.circle(x - 8, top + 30 * s, 3).fill({ color: 0x8aff6a, alpha: 0.6 });
  if (st.ashMarked) glow.circle(x + 8, top + 30 * s, 3).fill({ color: PAL.ember, alpha: 0.6 });
  void g;
}

/** The lamplighter's long brass taper and his relighting progress. */
function drawTaper(g: Graphics, glow: Graphics, e: Unit, x: number, top: number, s: number, face: number, w: World): void {
  const bx = x - 14 * face;
  const tip = { x: x - 30 * face, y: top - 34 };
  g.moveTo(bx, top + 48 * s).lineTo(tip.x, tip.y).stroke({ width: 7, color: PAL.ink, cap: "round" });
  g.moveTo(bx, top + 48 * s).lineTo(tip.x, tip.y).stroke({ width: 3, color: 0xa8823e, cap: "round" });
  glow.circle(tip.x, tip.y - 4, 12).fill({ color: PAL.ember, alpha: 0.25 });
  glow.poly([tip.x - 3, tip.y, tip.x, tip.y - 12 - Math.sin(w.time * 14 + e.id) * 1.5, tip.x + 3, tip.y]).fill(PAL.emberHot);
  const target = e.task !== undefined ? w.lights.find((l) => l.id === e.task) : undefined;
  if (target && Math.hypot(target.pos.x - e.pos.x, target.pos.y - e.pos.y) <= CONFIG.lamplighter.reach + 2) {
    const t = 1 - Math.max(0, e.taskTime) / CONFIG.lamplighter.relightTime;
    glow.circle(x, top - 26, 13).stroke({ width: 4, color: PAL.ink, alpha: 0.8 });
    glow.moveTo(x, top - 39).arc(x, top - 26, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t).stroke({ width: 4, color: PAL.ember });
  }
}

// ------------------------------------------------------------------ beasts and abominations
function drawDog(g: Graphics, glow: Graphics, e: Unit, w: World, warn: number): void {
  const minion = e.team === "minion";
  const { x, y } = e.pos;
  const face = e.dir.x >= 0 ? 1 : -1;
  const col = e.flash > 0 ? 0xffffff : minion ? PAL.minion : 0x5a4636;
  const lunge = e.state === "strike" ? 8 : 0;
  g.ellipse(x, y + 10, 26, 7).fill({ color: PAL.ink, alpha: 0.6 });
  if (!minion && (e.state === "windup" || warn > 0)) glow.moveTo(x, y - 14).lineTo(x + e.dir.x * 80, y - 14 + e.dir.y * 80).stroke({ width: 6, color: PAL.telegraph, alpha: 0.4 });
  // body, legs, head
  g.ellipse(x - face * 4 + lunge * face, y - 16, 24, 11).fill(col).stroke({ width: 4, color: PAL.ink });
  for (const dx of [-14, -6, 8, 16]) g.moveTo(x + dx, y - 10).lineTo(x + dx + Math.sin(w.time * 14 + dx) * 3, y + 6).stroke({ width: 4, color: PAL.ink });
  const hx = x + face * 22 + lunge * face;
  g.poly([hx - face * 6, y - 30, hx + face * 14, y - 22, hx + face * 12, y - 14, hx - face * 6, y - 14]).fill(col).stroke({ width: 4, color: PAL.ink });
  g.poly([hx - face * 4, y - 30, hx, y - 40, hx + face * 4, y - 28]).fill(col).stroke({ width: 3, color: PAL.ink });
  glow.circle(hx + face * 4, y - 24, 2).fill(minion ? PAL.ember : 0xffd090);
}

function drawMimic(g: Graphics, glow: Graphics, e: Unit, w: World): void {
  const { x, y } = e.pos;
  const bite = e.state === "strike" || e.state === "windup" ? 1 : Math.abs(Math.sin(w.time * 6)) * 0.5;
  g.ellipse(x, y + 22, 40, 10).fill({ color: PAL.ink, alpha: 0.6 });
  g.rect(x - 34, y - 8, 68, 32).fill(e.flash > 0 ? 0xffffff : 0x6a4a2a).stroke({ width: OUT, color: PAL.ink });
  g.rect(x - 34, y - 30 - bite * 18, 68, 22).fill(e.flash > 0 ? 0xffffff : 0x6a4a2a).stroke({ width: OUT, color: PAL.ink });
  g.rect(x - 30, y - 8 - bite * 18, 60, 8 + bite * 18).fill(0x3a0a0a);
  for (let i = 0; i < 6; i++) {
    g.poly([x - 28 + i * 11, y - 8 - bite * 18, x - 23 + i * 11, y + 2 - bite * 10, x - 18 + i * 11, y - 8 - bite * 18]).fill(0xe8e0d0);
    g.poly([x - 28 + i * 11, y - 8, x - 23 + i * 11, y - 16, x - 18 + i * 11, y - 8]).fill(0xe8e0d0);
  }
  g.moveTo(x, y - 4).quadraticCurveTo(x + 10, y + 10, x - 4, y + 18).stroke({ width: 6, color: 0x9e2a2a });
  glow.circle(x - 12, y - 24 - bite * 18, 3).fill(PAL.ember);
  glow.circle(x + 12, y - 24 - bite * 18, 3).fill(PAL.ember);
}

function drawAbomination(g: Graphics, glow: Graphics, e: Unit, w: World): void {
  const { x, y } = e.pos;
  const r = e.radius;
  const col = e.flash > 0 ? 0xffffff : 0x6a5e54;
  g.ellipse(x, y + 18, r * 1.2, r * 0.35).fill({ color: PAL.ink, alpha: 0.6 });
  // lumps of stitched bodies
  const lumps = Math.max(3, e.stitched);
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2 + 0.3;
    const lx = x + Math.cos(a) * r * 0.45;
    const ly = y - r * 0.9 + Math.sin(a) * r * 0.35 + Math.sin(w.time * 3 + i) * 2;
    g.circle(lx, ly, r * 0.55).fill(col).stroke({ width: 4, color: PAL.ink });
  }
  g.circle(x, y - r * 1.4, r * 0.4).fill(col).stroke({ width: 4, color: PAL.ink });
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const sx = x + Math.cos(a) * r * 0.3;
    const sy = y - r * 0.9 + Math.sin(a) * r * 0.2;
    g.moveTo(sx - 10, sy).lineTo(sx + 10, sy).stroke({ width: 2, color: 0x2a1a14 });
    for (let k = -1; k <= 1; k++) g.moveTo(sx + k * 6, sy - 4).lineTo(sx + k * 6, sy + 4).stroke({ width: 2, color: 0x2a1a14 });
  }
  glow.circle(x - 6, y - r * 1.45, 3).fill(PAL.ember);
  glow.circle(x + 6, y - r * 1.45, 3).fill(PAL.ember);
  if (e.state === "windup") glow.circle(x + e.dir.x * 40, y + e.dir.y * 40, e.def.area ?? 100).stroke({ width: 3, color: PAL.ember, alpha: 0.4 });
}

/** The Holy Flame: a pillar of fire with eyes (its full fight comes with the boss scripts). */
function drawFlame(g: Graphics, glow: Graphics, e: Unit, w: World): void {
  const { x, y } = e.pos;
  const r = e.radius;
  g.ellipse(x, y + 20, r * 1.3, r * 0.4).fill({ color: 0x1a0c06, alpha: 0.7 });
  for (let i = 0; i < 9; i++) {
    const a = i / 9;
    const h = r * (2.2 + 0.4 * Math.sin(w.time * 5 + i * 1.3));
    const fx = x + (a - 0.5) * r * 1.6;
    glow.poly([fx - r * 0.25, y, fx, y - h, fx + r * 0.25, y]).fill({ color: i % 2 ? 0xffd090 : PAL.ember, alpha: 0.85 });
  }
  glow.ellipse(x, y - r * 1.1, r * 0.55, r * 0.9).fill({ color: e.flash > 0 ? 0xffffff : 0xfff4d8, alpha: 0.9 });
  glow.circle(x - r * 0.2, y - r * 1.3, r * 0.08).fill(PAL.ink);
  glow.circle(x + r * 0.2, y - r * 1.3, r * 0.08).fill(PAL.ink);
}

// ------------------------------------------------------------------ the necromancer
interface Hero {
  body: number;
  shade: number;
  hood: "hood" | "horns" | "crown" | "beak" | "cassock" | "hair";
  eyes: number;
}

const HEROES: Record<CharacterId, Hero> = {
  grabarz: { body: PAL.shroud, shade: PAL.shroudMid, hood: "hood", eyes: PAL.ember },
  nekromanta: { body: 0x3a2a48, shade: 0x1e1428, hood: "horns", eyes: 0xc88aff },
  lisz: { body: 0x4a5a5a, shade: 0x243030, hood: "crown", eyes: 0x6affd8 },
  medyk: { body: 0x22201e, shade: 0x0e0d0c, hood: "beak", eyes: 0x8aff6a },
  kaplan: { body: 0x1e1a18, shade: 0x0c0a09, hood: "cassock", eyes: 0xffd090 },
  wiedzma: { body: 0x2e3a28, shade: 0x161e12, hood: "hair", eyes: 0xff4a4a },
};

export function drawPlayer(g: Graphics, glow: Graphics, w: World): void {
  const p = w.player;
  const hero = HEROES[p.character] ?? HEROES.grabarz;
  const { x, y } = p.pos;
  const face = Math.cos(p.facing) >= 0 ? 1 : -1;
  g.ellipse(x, y + 18, 26, 9).fill({ color: PAL.ink, alpha: 0.6 });
  if (p.dodgeLeft > 0) {
    // dissolved into mist: only a dark smear and the eyes
    g.ellipse(x, y - 20, 26, 34).fill({ color: PAL.ink, alpha: 0.55 });
    glow.circle(x + face * 6, y - 40, 3).fill(hero.eyes);
    return;
  }
  if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return; // hit blink

  const top = y - 78; // ~96 px tall sprite
  const body = [
    x - 8 * face, top, x + 14 * face, top + 6, x + 20 * face, top + 26, x + 18 * face, top + 40,
    x + 30 * face, top + 54, x + 26 * face, top + 70, x + 24 * face, top + 92,
    x - 24 * face, top + 92, x - 28 * face, top + 66, x - 32 * face, top + 54,
    x - 18 * face, top + 40, x - 20 * face, top + 22, x - 26 * face, top + 14,
  ];
  g.poly(body).fill(hero.body).stroke({ width: OUT, color: PAL.ink, join: "round" });
  g.poly([x + 4, top + 4, x + 18 * face, top + 24, x + 28 * face, top + 54, x + 24 * face, top + 92, x + 4, top + 92]).fill({ color: PAL.ink, alpha: 0.55 });
  g.moveTo(x - 30 * face, top + 56).lineTo(x + 28 * face, top + 56).stroke({ width: 3, color: PAL.ink });
  g.rect(x - 22, top + 66, 44, 4).fill(PAL.wood);
  switch (hero.hood) {
    case "horns":
      g.poly([x - 14 * face, top + 8, x - 26 * face, top - 18, x - 8 * face, top + 2]).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      g.poly([x + 14 * face, top + 8, x + 22 * face, top - 18, x + 8 * face, top + 2]).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      break;
    case "crown":
      for (let i = 0; i < 5; i++) g.poly([x - 14 + i * 7, top + 2, x - 11 + i * 7, top - 12 - (i % 2) * 6, x - 8 + i * 7, top + 2]).fill(0x8a8070).stroke({ width: 2, color: PAL.ink });
      break;
    case "beak":
      g.ellipse(x, top - 2, 28, 7).fill(0x14120f).stroke({ width: 3, color: PAL.ink });
      g.rect(x - 11, top - 16, 22, 14).fill(0x14120f).stroke({ width: 3, color: PAL.ink });
      g.poly([x + 6 * face, top + 18, x + 34 * face, top + 32, x + 6 * face, top + 28]).fill(0xd8ccb0).stroke({ width: 3, color: PAL.ink });
      break;
    case "cassock":
      g.rect(x - 8, top + 30, 16, 5).fill(0xe8e0d0);
      glow.ellipse(x, top - 6, 16, 5).stroke({ width: 2, color: 0xffd090, alpha: 0.5 });
      break;
    case "hair":
      for (let i = 0; i < 6; i++) g.moveTo(x - 12 + i * 5, top + 2).lineTo(x - 22 + i * 9, top + 34 + (i % 2) * 8).stroke({ width: 3, color: 0x8a8478 });
      g.moveTo(x - 8, top + 36).quadraticCurveTo(x, top + 44, x + 8, top + 36).stroke({ width: 3, color: 0x8a6a3a });
      break;
    default:
      break;
  }
  // face hole and glowing eyes
  g.ellipse(x + 6 * face, top + 22, 10, 12).fill(PAL.ink);
  glow.circle(x + 6 * face, top + 21, 10).fill({ color: hero.eyes, alpha: 0.18 });
  glow.circle(x + 3 * face, top + 21, 2.4).fill(hero.eyes);
  glow.circle(x + 11 * face, top + 20, 1.8).fill(hero.eyes);

  // the weapon in a charred hand, towards the aim
  const slot = p.weapons[p.current];
  const sx = x + face * 4;
  const sy = top + 46;
  const ax = Math.cos(p.facing);
  const ay = Math.sin(p.facing);
  g.moveTo(sx, sy).lineTo(sx + ax * 24, sy + ay * 24).stroke({ width: 9, color: PAL.ink, cap: "round" });
  g.moveTo(sx, sy).lineTo(sx + ax * 22, sy + ay * 22).stroke({ width: 5, color: hero.shade, cap: "round" });
  if (slot) drawWeaponShape(g, slot.id, sx + ax * 22, sy + ay * 22, p.facing, 1);
  // ember glow at the claws
  glow.circle(sx + ax * 22, sy + ay * 22, 5).fill({ color: PAL.ember, alpha: 0.35 });
}
