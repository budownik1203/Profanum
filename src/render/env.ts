/**
 * The world around the actors: floors of each district, walls and doorways, covers, light fixtures,
 * chests, altars and other things to use, pickups and burning ground. Stylised placeholders in the
 * game's ink-and-ember style (design doc: Przewodnik stylu).
 */
import type { Graphics } from "pixi.js";
import { CONFIG } from "../game/config.js";
import { WEAPONS, type WeaponId } from "../game/data/weapons.js";
import type { Chest, Cover, Door, Interactable, Light, Pickup, Zone } from "../game/types.js";
import { World } from "../game/world.js";
import { PAL } from "../palette.js";
import { drawWeaponShape } from "./weapons.js";
import { drawItemIcon, drawRelicIcon } from "./icons.js";
import type { ItemId, RelicId } from "../game/data/items.js";

export const OUT = 5; // ink outline width

export interface Theme {
  floor: number[];
  line: number;
  wall: number;
  wallTop: number;
  pattern: "flag" | "grass" | "cobble" | "tile" | "marble" | "cracks" | "bone" | "ossuary" | "dungeon";
  accent: number;
}

export const THEMES: Record<string, Theme> = {
  cmentarz: { floor: [0x2a2c22, 0x2e3026, 0x25271e, 0x32342a], line: 0x14150f, wall: 0x1b1c16, wallTop: 0x3c3e32, pattern: "grass", accent: 0x4a6a3a },
  slumsy: { floor: [0x2e2620, 0x332a22, 0x2a221b, 0x382e25], line: 0x140f0b, wall: 0x1d1712, wallTop: 0x40332a, pattern: "cobble", accent: 0x6a5030 },
  kupiecka: { floor: [0x3a3020, 0x403524, 0x352c1d, 0x463a27], line: 0x1a140c, wall: 0x221a10, wallTop: 0x5a4830, pattern: "tile", accent: 0xa8823e },
  klasztor: { floor: [0x2c2d30, 0x303135, 0x28292c, 0x34353a], line: 0x121316, wall: 0x1a1b1e, wallTop: 0x46474d, pattern: "flag", accent: 0x8a8c96 },
  katedra: { floor: [0x2e2826, 0x332c29, 0x2a2422, 0x3a322e], line: 0x151010, wall: 0x1c1514, wallTop: 0x5a4a2a, pattern: "marble", accent: 0x9e1f14 },
  sanktuarium: { floor: [0x1e1614, 0x231a17, 0x1a1311, 0x271d19], line: 0x0c0806, wall: 0x140e0c, wallTop: 0x3a221a, pattern: "cracks", accent: 0xff6a1c },
  krypta: { floor: [0x262321, 0x2a2624, 0x221f1d, 0x2e2a27], line: 0x100e0d, wall: 0x181514, wallTop: 0x3c3632, pattern: "bone", accent: 0xcfc4a8 },
  ossuarium: { floor: [0x2a2620, 0x2f2a23, 0x26221c, 0x332e26], line: 0x110f0c, wall: 0x1a1713, wallTop: 0x4a443a, pattern: "ossuary", accent: 0xcfc4a8 },
  lochy: { floor: [0x22231f, 0x262722, 0x1f201c, 0x2a2b25], line: 0x0e0f0c, wall: 0x151612, wallTop: 0x34362e, pattern: "dungeon", accent: 0x6a1e18 },
};

export const themeOf = (w: World): Theme => THEMES[w.theme] ?? THEMES.klasztor;

/** A cheap deterministic noise for decoration. */
const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ------------------------------------------------------------------ floor and walls
export function drawFloor(g: Graphics, w: World, doors: Door[]): void {
  g.clear();
  const th = themeOf(w);
  const { w: W, h: H } = w.room;
  const wall = CONFIG.room.wall;
  g.rect(0, 0, W, H).fill(th.floor[0]);
  switch (th.pattern) {
    case "grass": {
      // trodden earth, gravel paths and tufts of dead grass
      for (let y = 0; y < H; y += 48) {
        for (let x = 0; x < W; x += 48) {
          const r = hash(x, y);
          g.rect(x + 1, y + 1, 46, 46).fill(th.floor[Math.floor(r * th.floor.length)]);
          if (r > 0.82) g.ellipse(x + 24, y + 24, 18, 8).fill({ color: 0x1c1e16, alpha: 0.6 });
          if (r < 0.12) {
            for (let i = 0; i < 4; i++) g.moveTo(x + 10 + i * 8, y + 40).lineTo(x + 6 + i * 8 + r * 20, y + 26).stroke({ width: 2, color: 0x4a5236 });
          }
        }
      }
      g.rect(W / 2 - 70, 0, 140, H).fill({ color: 0x3a3a30, alpha: 0.35 });
      break;
    }
    case "cobble": {
      let row = 0;
      for (let y = 0; y < H; y += 32, row++) {
        for (let x = -(row % 2) * 16; x < W; x += 32) {
          const r = hash(x, y);
          g.roundRect(x + 2, y + 2, 28, 28, 8).fill(th.floor[Math.floor(r * th.floor.length)]);
        }
      }
      g.rect(0, H / 2 - 40, W, 80).fill({ color: 0x1a140f, alpha: 0.25 });
      break;
    }
    case "tile": {
      for (let y = 0; y < H; y += 80) {
        for (let x = 0; x < W; x += 80) {
          const r = hash(x, y);
          g.rect(x + 2, y + 2, 76, 76).fill(th.floor[Math.floor(r * th.floor.length)]);
          if ((x / 80 + y / 80) % 2 === 0) g.rect(x + 30, y + 30, 20, 20).fill({ color: 0x2a2014, alpha: 0.5 });
        }
      }
      break;
    }
    case "marble": {
      for (let y = 0; y < H; y += 96) {
        for (let x = 0; x < W; x += 96) {
          const dark = (x / 96 + y / 96) % 2 === 0;
          g.rect(x + 2, y + 2, 92, 92).fill(dark ? th.floor[2] : th.floor[3]);
          g.moveTo(x + hash(x, y) * 90, y + 4).lineTo(x + hash(y, x) * 90, y + 92).stroke({ width: 1, color: 0x4a3e38, alpha: 0.5 });
        }
      }
      // the crimson carpet down the nave
      g.rect(W / 2 - 110, 0, 220, H).fill(0x4a1414);
      g.rect(W / 2 - 110, 0, 10, H).fill(0xa8823e);
      g.rect(W / 2 + 100, 0, 10, H).fill(0xa8823e);
      break;
    }
    case "cracks": {
      for (let y = 0; y < H; y += 64) {
        for (let x = 0; x < W; x += 64) g.rect(x + 2, y + 2, 60, 60).fill(th.floor[Math.floor(hash(x, y) * th.floor.length)]);
      }
      for (let i = 0; i < 40; i++) {
        const x = hash(i, 3) * W;
        const y = hash(7, i) * H;
        g.moveTo(x, y).lineTo(x + (hash(i, i) - 0.5) * 160, y + (hash(i, 9) - 0.5) * 160).stroke({ width: 3, color: 0x7a2a10, alpha: 0.7 });
      }
      break;
    }
    case "bone": {
      let row = 0;
      for (let y = 0; y < H; y += 56, row++) {
        for (let x = -(row % 2) * 40; x < W; x += 80) g.rect(x + 2, y + 2, 76, 52).fill(th.floor[Math.floor(hash(x, y) * th.floor.length)]);
      }
      break;
    }
    case "ossuary": {
      // packed earth strewn with bones, here and there a skull looking up
      for (let y = 0; y < H; y += 60) {
        for (let x = 0; x < W; x += 60) {
          const r = hash(x, y);
          g.rect(x, y, 60, 60).fill(th.floor[Math.floor(r * th.floor.length)]);
          if (r > 0.7) {
            const a = hash(y, x) * Math.PI;
            const cx = x + 30;
            const cy = y + 30;
            const dx = Math.cos(a) * 12;
            const dy = Math.sin(a) * 6;
            g.moveTo(cx - dx, cy - dy).lineTo(cx + dx, cy + dy).stroke({ width: 4, color: 0x8a8270, cap: "round" });
            g.circle(cx - dx, cy - dy, 3).fill(0x8a8270);
            g.circle(cx + dx, cy + dy, 3).fill(0x8a8270);
          } else if (r < 0.06) {
            g.circle(x + 30, y + 30, 8).fill(0xa89e88).stroke({ width: 2, color: PAL.ink });
            g.circle(x + 27, y + 29, 2).fill(PAL.ink);
            g.circle(x + 33, y + 29, 2).fill(PAL.ink);
          }
        }
      }
      break;
    }
    case "dungeon": {
      // wet flagstones, a gutter down the middle and drain grates
      const ft = 72;
      let row = 0;
      for (let y = 0; y < H; y += ft, row++) {
        const off = (row % 2) * 54;
        for (let x = -off; x < W; x += 108) g.rect(x + 3, y + 3, 102, ft - 6).fill(th.floor[Math.floor(hash(x, y) * th.floor.length)]);
      }
      g.rect(W / 2 - 14, 0, 28, H).fill({ color: 0x0c0d0a, alpha: 0.7 });
      for (let y = 200; y < H; y += 420) {
        g.rect(W / 2 - 34, y, 68, 44).fill(0x0a0a08).stroke({ width: 3, color: PAL.ink });
        for (let i = 1; i < 5; i++) g.rect(W / 2 - 34 + i * 13.6 - 2, y + 2, 4, 40).fill(0x3a3a34);
      }
      for (let i = 0; i < 14; i++) g.ellipse(hash(i, 5) * W, hash(5, i) * H, 30 + hash(i, i) * 40, 10 + hash(i, 2) * 10).fill({ color: 0x3a4a44, alpha: 0.18 });
      break;
    }
    default: {
      // staggered flagstones
      const ft = 64;
      let row = 0;
      for (let y = 0; y < H; y += ft, row++) {
        const off = (row % 2) * 48;
        for (let x = -off; x < W; x += 96) g.rect(x + 2, y + 2, 92, ft - 4).fill(th.floor[Math.floor(hash(x, y) * th.floor.length)]);
      }
      for (let y = 0; y < H; y += ft) g.rect(0, y, W, 3).fill(th.line);
    }
  }
  // walls with a lighter top edge
  g.rect(0, 0, W, wall).fill(th.wall);
  g.rect(0, H - wall, W, wall).fill(th.wall);
  g.rect(0, 0, wall, H).fill(th.wall);
  g.rect(W - wall, 0, wall, H).fill(th.wall);
  g.rect(wall, wall - 10, W - wall * 2, 10).fill(th.wallTop);
  // stones of the north wall
  for (let x = wall; x < W - wall; x += 64) g.rect(x, 4, 2, wall - 14).fill({ color: th.line, alpha: 0.8 });
  if (w.theme === "krypta") {
    // skulls in niches along the walls
    for (let x = 120; x < W - 100; x += 160) {
      g.rect(x - 16, 6, 32, 28).fill(0x0c0a09);
      g.circle(x, 22, 9).fill(0xbdb29a).stroke({ width: 2, color: PAL.ink });
    }
  }
  if (w.theme === "ossuarium") {
    // the walls are built of skulls, row on row
    for (let row = 0; row < 3; row++) {
      for (let x = wall + 14 + (row % 2) * 12; x < W - wall - 10; x += 24) {
        g.circle(x, 8 + row * 11, 8).fill(row === 1 ? 0xa89e88 : 0xbdb29a).stroke({ width: 1.5, color: PAL.ink });
        g.circle(x - 3, 7 + row * 11, 1.8).fill(PAL.ink);
        g.circle(x + 3, 7 + row * 11, 1.8).fill(PAL.ink);
      }
    }
    for (const xx of [6, W - 30]) for (let y = wall + 20; y < H - wall; y += 26) g.circle(xx + 12, y, 7).fill(0xa89e88).stroke({ width: 1.5, color: PAL.ink });
  }
  if (w.theme === "lochy") {
    // chains and shackles hang from the walls
    for (let x = 160; x < W - 120; x += 260) {
      for (let i = 0; i < 4; i++) g.ellipse(x + (i % 2) * 2, 10 + i * 9, 3, 5).stroke({ width: 2.5, color: 0x5a5a52 });
      g.circle(x, 52, 7).stroke({ width: 3, color: 0x5a5a52 });
    }
  }
  g.rect(wall - 4, wall - 4, W - wall * 2 + 8, H - wall * 2 + 8).stroke({ width: 8, color: PAL.ink });
  // doorways: a dark gap in the wall with stone jambs
  const half = CONFIG.room.door / 2;
  for (const d of doors) {
    if (d.secret) continue;
    const r =
      d.side === "N" ? { x: W / 2 - half, y: 0, w: half * 2, h: wall + 4 }
      : d.side === "S" ? { x: W / 2 - half, y: H - wall - 4, w: half * 2, h: wall + 4 }
      : d.side === "W" ? { x: 0, y: H / 2 - half, w: wall + 4, h: half * 2 }
      : { x: W - wall - 4, y: H / 2 - half, w: wall + 4, h: half * 2 };
    g.rect(r.x, r.y, r.w, r.h).fill(0x070505);
    const horizontal = d.side === "N" || d.side === "S";
    if (horizontal) {
      g.rect(r.x - 14, r.y, 14, r.h).fill(th.wallTop).stroke({ width: 4, color: PAL.ink });
      g.rect(r.x + r.w, r.y, 14, r.h).fill(th.wallTop).stroke({ width: 4, color: PAL.ink });
    } else {
      g.rect(r.x, r.y - 14, r.w, 14).fill(th.wallTop).stroke({ width: 4, color: PAL.ink });
      g.rect(r.x, r.y + r.h, r.w, 14).fill(th.wallTop).stroke({ width: 4, color: PAL.ink });
    }
  }
}

/** Shut doors: an iron portcullis across every doorway; a broken cracked wall opens a passage. */
export function drawDoorsState(g: Graphics, w: World): void {
  const { w: W, h: H } = w.room;
  const wall = CONFIG.room.wall;
  const half = CONFIG.room.door / 2;
  for (const d of w.usableDoors) {
    if (d.secret) {
      // the broken wall: rubble in a dark gap
      const c = w.doorCenter(d.side);
      const horizontal = d.side === "N" || d.side === "S";
      const r = horizontal ? { x: c.x - half, y: d.side === "N" ? 0 : H - wall, w: half * 2, h: wall } : { x: d.side === "W" ? 0 : W - wall, y: c.y - half, w: wall, h: half * 2 };
      g.rect(r.x, r.y, r.w, r.h).fill(0x070505);
      for (let i = 0; i < 6; i++) g.circle(r.x + hash(i, 1) * r.w, r.y + hash(1, i) * r.h, 6 + hash(i, i) * 6).fill(0x3a3430).stroke({ width: 2, color: PAL.ink });
    }
    if (w.doorsOpen) continue;
    const horizontal = d.side === "N" || d.side === "S";
    const base = d.side === "N" ? wall / 2 : d.side === "S" ? H - wall / 2 : d.side === "W" ? wall / 2 : W - wall / 2;
    for (let i = -half + 12; i <= half - 12; i += 22) {
      if (horizontal) g.rect(W / 2 + i - 4, base - wall / 2, 8, wall).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
      else g.rect(base - wall / 2, H / 2 + i - 4, wall, 8).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
    }
  }
  // cracked walls hiding the catacombs, once you know where to look
  for (const it of w.interactables) {
    if (it.kind !== "secret" || it.used || it.hidden) continue;
    const c = it.pos;
    const horizontal = it.side === "N" || it.side === "S";
    for (let i = 0; i < 5; i++) {
      const a = horizontal ? c.x - 50 + i * 25 : c.x;
      const b = horizontal ? c.y : c.y - 50 + i * 25;
      const y0 = it.side === "N" ? 6 : it.side === "S" ? H - 6 : b;
      const x0 = it.side === "W" ? 6 : it.side === "E" ? W - 6 : a;
      g.moveTo(x0, y0).lineTo(x0 + (horizontal ? 8 : it.side === "W" ? 34 : -34), y0 + (horizontal ? (it.side === "N" ? 34 : -34) : 8)).stroke({ width: 3, color: 0x0a0807 });
    }
  }
}

// ------------------------------------------------------------------ covers
export function drawCover(g: Graphics, c: Cover, t: number): void {
  if (c.broken) return;
  const { x, y, w, h } = c;
  const horizontal = w >= h;
  const ink = { width: OUT, color: PAL.ink, join: "round" as const };
  switch (c.kind) {
    case "tomb": {
      // a headstone: grey slab with a rounded top, seen from the front
      const lift = 30;
      g.ellipse(x + w / 2, y + h, w * 0.6, 10).fill({ color: PAL.ink, alpha: 0.5 });
      g.roundRect(x, y - lift, w, h + lift, Math.min(w, h) * 0.45).fill(0x6a6a62).stroke(ink);
      g.rect(x + 4, y - lift + 6, w - 8, 6).fill({ color: 0x9a9a90, alpha: 0.6 });
      if (w > 60) {
        g.moveTo(x + w / 2, y - lift + 12).lineTo(x + w / 2, y + h - 6).stroke({ width: 4, color: 0x3a3a34 });
        g.moveTo(x + w / 2 - 12, y - lift + 22).lineTo(x + w / 2 + 12, y - lift + 22).stroke({ width: 4, color: 0x3a3a34 });
      }
      break;
    }
    case "pillar": {
      const lift = 70;
      g.ellipse(x + w / 2, y + h, w * 0.7, 12).fill({ color: PAL.ink, alpha: 0.5 });
      g.rect(x, y - lift, w, h + lift).fill(0x58565a).stroke(ink);
      g.rect(x + w * 0.55, y - lift, w * 0.45, h + lift).fill({ color: PAL.ink, alpha: 0.45 });
      g.rect(x - 6, y - lift - 10, w + 12, 14).fill(0x6e6c70).stroke({ width: 4, color: PAL.ink });
      g.rect(x - 6, y + h - 8, w + 12, 12).fill(0x4a484c).stroke({ width: 4, color: PAL.ink });
      break;
    }
    case "crate": {
      const lift = 18;
      g.rect(x, y - lift, w, h + lift).fill(0x6a5232).stroke(ink);
      g.rect(x, y - lift, w, lift).fill(0x8a6e44).stroke({ width: 3, color: PAL.ink });
      g.moveTo(x + 4, y + 4).lineTo(x + w - 4, y + h - 4).stroke({ width: 4, color: 0x3e2e1c });
      g.moveTo(x + w - 4, y + 4).lineTo(x + 4, y + h - 4).stroke({ width: 4, color: 0x3e2e1c });
      break;
    }
    case "powder":
    case "oil": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2 + 4;
      g.ellipse(cx, cy + r * 0.9, r, r * 0.35).fill({ color: PAL.ink, alpha: 0.5 });
      g.roundRect(cx - r, cy - r * 1.3, r * 2, r * 2.2, 8).fill(c.kind === "powder" ? 0x6e4a2a : 0x2e2a26).stroke(ink);
      g.rect(cx - r, cy - r * 0.8, r * 2, 4).fill(PAL.steel);
      g.rect(cx - r, cy + r * 0.4, r * 2, 4).fill(PAL.steel);
      g.ellipse(cx, cy - r * 1.3, r, r * 0.35).fill(c.kind === "powder" ? 0x8a603a : 0x3e3a34).stroke({ width: 3, color: PAL.ink });
      if (c.kind === "powder") {
        // a painted skull: keep shooting it from afar
        g.circle(cx, cy - r * 0.2, r * 0.4).fill(0xd8ccb0);
        g.circle(cx - r * 0.14, cy - r * 0.24, r * 0.1).fill(PAL.ink);
        g.circle(cx + r * 0.14, cy - r * 0.24, r * 0.1).fill(PAL.ink);
      } else {
        g.moveTo(cx + r * 0.5, cy - r * 1.2).lineTo(cx + r * 0.55, cy + r * 0.2 + Math.sin(t * 2) * 2).stroke({ width: 4, color: 0x14110e });
      }
      break;
    }
    case "coffin": {
      if (!c.flipped) {
        // lying coffin: a long hexagon
        const pts = horizontal
          ? [x, y + h / 2, x + w * 0.18, y, x + w, y + h * 0.1, x + w, y + h * 0.9, x + w * 0.18, y + h]
          : [x + w / 2, y, x + w, y + h * 0.18, x + w * 0.9, y + h, x + w * 0.1, y + h, x, y + h * 0.18];
        g.poly(pts).fill(0x4e3424).stroke(ink);
        g.poly(pts).fill({ color: 0x6e4c34, alpha: 0.4 });
        if (horizontal) g.moveTo(x + w * 0.35, y + h / 2).lineTo(x + w * 0.7, y + h / 2).stroke({ width: 3, color: 0x2a1c12 });
        else g.moveTo(x + w / 2, y + h * 0.3).lineTo(x + w / 2, y + h * 0.7).stroke({ width: 3, color: 0x2a1c12 });
      } else {
        drawFlippedSlab(g, c, 0x4e3424, 0x6e4c34);
      }
      break;
    }
    case "cart": {
      if (!c.flipped) {
        g.rect(x, y, w, h).fill(0x6a4e30).stroke(ink);
        for (let i = 1; i < 4; i++) g.rect(x + (w * i) / 4 - 1, y + 3, 3, h - 6).fill(0x3e2c1a);
        g.circle(x + 10, y + h + 6, 12).fill(0x3a2c1c).stroke({ width: 4, color: PAL.ink });
        g.circle(x + w - 10, y + h + 6, 12).fill(0x3a2c1c).stroke({ width: 4, color: PAL.ink });
      } else drawFlippedSlab(g, c, 0x5a4028, 0x7a5a3a);
      break;
    }
    case "stall": {
      if (!c.flipped) {
        g.rect(x, y, w, h).fill(0x6a5232).stroke(ink);
        // striped canopy
        for (let i = 0; i < 6; i++) g.rect(x + (w / 6) * i, y - 16, w / 6, 16).fill(i % 2 ? 0x8a2a1e : 0xc8b890);
        g.rect(x, y - 16, w, 16).stroke({ width: 3, color: PAL.ink });
      } else drawFlippedSlab(g, c, 0x5a4428, 0x8a2a1e);
      break;
    }
    case "organ": {
      // the great organ: a carved case along the back wall and seven towers of tin pipes
      const deck = y + h - 56;
      g.rect(x - 10, y - 30, w + 20, h + 30).fill(0x2a1a10).stroke(ink);
      for (let i = 0; i < 7; i++) {
        const cx = x + 80 + i * 200;
        // a wooden tower behind every rank of pipes, a gilded crest on top
        g.rect(cx - 62, y - 40 - (i % 2) * 14, 124, deck - y + 40 + (i % 2) * 14).fill(0x3a2416).stroke({ width: 4, color: PAL.ink });
        g.poly([cx - 30, y - 40 - (i % 2) * 14, cx, y - 64 - (i % 2) * 14, cx + 30, y - 40 - (i % 2) * 14]).fill(0xa8823e).stroke({ width: 3, color: PAL.ink });
        for (let k = -2; k <= 2; k++) {
          const px = cx + k * 22;
          const top = deck - (120 - Math.abs(k) * 22 - (i % 2) * 12);
          g.rect(px - 9, top, 18, deck - top).fill(k === 0 ? 0xc8c0b0 : 0xa8a090).stroke({ width: 3, color: PAL.ink });
          g.rect(px + 2, top + 3, 5, deck - top - 6).fill({ color: PAL.ink, alpha: 0.28 });
          g.ellipse(px, top, 9, 3).fill(0x6a645a).stroke({ width: 2, color: PAL.ink });
          // the mouth
          g.poly([px - 6, deck - 22, px + 6, deck - 22, px, deck - 32]).fill(PAL.ink);
        }
      }
      // the console deck along the front
      g.rect(x - 10, deck, w + 20, y + h - deck).fill(0x4a2e1a).stroke(ink);
      g.rect(x - 10, deck, w + 20, 8).fill(0x8a6a3a);
      for (let i = 0; i < 14; i++) g.circle(x + 50 + i * (w - 100) / 13, deck + 30, 5).fill(0xa8823e).stroke({ width: 2, color: PAL.ink });
      break;
    }
    case "shelf": {
      if (!c.flipped) {
        g.rect(x, y, w, h).fill(0x3e2c1c).stroke(ink);
        for (let i = 0; i < Math.floor((horizontal ? w : h) / 12); i++) {
          const col = [0x6a1e18, 0x2a3a5a, 0x5a4a20, 0x3a4a2a][i % 4];
          if (horizontal) g.rect(x + 4 + i * 12, y + 4, 9, h - 8).fill(col);
          else g.rect(x + 4, y + 4 + i * 12, w - 8, 9).fill(col);
        }
      } else drawFlippedSlab(g, c, 0x3e2c1c, 0x5a4028);
      break;
    }
    default: {
      // pews and tables
      if (!c.flipped) {
        g.rect(x, y, w, h).fill(PAL.wood).stroke(ink);
        for (let i = 1; i < 3; i++) {
          if (horizontal) g.rect(x + 4, y + (h * i) / 3 - 1, w - 8, 2).fill(PAL.woodMid);
          else g.rect(x + (w * i) / 3 - 1, y + 4, 2, h - 8).fill(PAL.woodMid);
        }
        g.rect(x + 4, y + 4, horizontal ? w - 8 : 4, horizontal ? 4 : h - 8).fill(PAL.woodHi);
      } else {
        drawFlippedSlab(g, c, PAL.woodMid, PAL.woodHi);
      }
    }
  }
}

/** A toppled cover: its seat faces us as a wall; cracks grow as it takes hits. */
function drawFlippedSlab(g: Graphics, c: Cover, body: number, edge: number): void {
  const lift = 26;
  g.rect(c.x, c.y - lift, c.w, c.h + lift).fill(body).stroke({ width: OUT, color: PAL.ink });
  g.rect(c.x + 4, c.y - lift + 4, c.w - 8, 8).fill(edge);
  g.rect(c.x, c.y + c.h - 8, c.w, 8).fill(PAL.ink);
  const damage = 1 - c.hp / CONFIG.cover.hp;
  const cracks = Math.floor(Math.max(0, damage) * 6);
  for (let i = 0; i < cracks; i++) {
    const cx = c.x + ((i * 37) % Math.max(1, c.w - 16)) + 8;
    g.moveTo(cx, c.y - lift + 10).lineTo(cx + 6, c.y).lineTo(cx - 3, c.y + c.h - 10).stroke({ width: 2, color: PAL.ink });
  }
}

// ------------------------------------------------------------------ light fixtures
/** Candelabra arms: x offset and the order they go dark in (0 and 1 survive the first shot). */
export const CANDELABRA_ARMS: [number, number][] = [[-22, 2], [-11, 0], [0, 3], [11, 1], [22, 4]];
export const CHANDELIER_CANDLES = 8;

/** Where a wall-mounted torch's bracket meets the wall face. */
function wallFace(w: World, l: Light, head: { x: number; y: number }): { x: number; y: number } {
  const wall = CONFIG.room.wall;
  switch (l.wall ?? "N") {
    case "N": return { x: head.x, y: wall - 6 };
    case "S": return { x: head.x, y: w.room.h - wall + 6 };
    case "W": return { x: wall - 6, y: head.y - 8 };
    default: return { x: w.room.w - wall + 6, y: head.y - 8 };
  }
}

/** Stands, brackets, windows and wrecks: drawn on the floor layer, under the darkness. */
export function drawFixture(g: Graphics, l: Light, w: World): void {
  const { x, y } = l.pos;
  const ink = { width: 3, color: PAL.ink };
  switch (l.kind) {
    case "candle":
      g.ellipse(x, y + 22, 18, 6).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(x - 10, y + 14, 20, 8).fill(PAL.steel).stroke(ink);
      g.rect(x - 4, y - 6, 8, 22).fill(PAL.wax).stroke(ink);
      break;
    case "candelabra": {
      g.ellipse(x, y + 6, 30, 9).fill({ color: PAL.ink, alpha: 0.6 });
      g.poly([x - 22, y + 6, x, y - 8, x + 22, y + 6], false).stroke({ width: 7, color: PAL.ink, join: "round" });
      g.poly([x - 22, y + 6, x, y - 8, x + 22, y + 6], false).stroke({ width: 3, color: PAL.iron, join: "round" });
      g.moveTo(x, y + 4).lineTo(x, y - 30).stroke({ width: 8, color: PAL.ink });
      g.moveTo(x, y + 4).lineTo(x, y - 30).stroke({ width: 4, color: PAL.iron });
      g.moveTo(x - 24, y - 26).quadraticCurveTo(x, y - 14, x + 24, y - 26).stroke({ width: 7, color: PAL.ink });
      g.moveTo(x - 24, y - 26).quadraticCurveTo(x, y - 14, x + 24, y - 26).stroke({ width: 3, color: PAL.iron });
      for (const [dx, i] of CANDELABRA_ARMS) {
        const lit = l.on && (l.hp >= l.maxHp || i < 2);
        const h = lit ? 12 : 5;
        g.rect(x + dx - 3, y - 30 - h + (dx === 0 ? -6 : 0), 6, h).fill(PAL.wax).stroke({ width: 2, color: PAL.ink });
      }
      break;
    }
    case "brazier": {
      // an iron fire basket on three legs
      g.ellipse(x, y + 10, 30, 9).fill({ color: PAL.ink, alpha: 0.6 });
      for (const dx of [-16, 0, 16]) g.moveTo(x + dx, y + 8).lineTo(x + dx * 0.5, y - 14).stroke({ width: 5, color: PAL.ink });
      g.poly([x - 26, y - 24, x + 26, y - 24, x + 16, y - 6, x - 16, y - 6]).fill(PAL.iron).stroke(ink);
      g.ellipse(x, y - 24, 26, 8).fill(l.on ? 0x2a1208 : 0x161210).stroke(ink);
      if (!l.on) for (let i = 0; i < 3; i++) g.circle(x - 10 + i * 10, y - 25, 3).fill(0x3a3430);
      break;
    }
    case "pyre": {
      // the stake: a post in a heap of faggots
      g.ellipse(x, y + 10, 64, 20).fill({ color: PAL.ink, alpha: 0.6 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI;
        g.moveTo(x - Math.cos(a) * 54, y + 6 - Math.sin(a) * 6).lineTo(x - Math.cos(a) * 18, y - 22).stroke({ width: 8, color: PAL.ink });
        g.moveTo(x - Math.cos(a) * 54, y + 6 - Math.sin(a) * 6).lineTo(x - Math.cos(a) * 18, y - 22).stroke({ width: 4, color: l.on ? 0x4a2e1a : 0x2a221c });
      }
      g.rect(x - 6, y - 90, 12, 96).fill(0x3a2a1c).stroke(ink);
      g.rect(x - 22, y - 74, 44, 8).fill(0x3a2a1c).stroke(ink);
      break;
    }
    case "torch": {
      const head = World.hitPoint(l);
      const at = wallFace(w, l, head);
      g.moveTo(at.x, at.y).lineTo(head.x, head.y + 8).stroke({ width: 8, color: PAL.ink, cap: "round" });
      g.moveTo(at.x, at.y).lineTo(head.x, head.y + 8).stroke({ width: 4, color: PAL.iron, cap: "round" });
      g.moveTo(head.x, head.y + 18).lineTo(head.x, head.y).stroke({ width: 9, color: PAL.ink, cap: "round" });
      g.moveTo(head.x, head.y + 18).lineTo(head.x, head.y).stroke({ width: 5, color: PAL.wood, cap: "round" });
      g.ellipse(head.x, head.y, 7, 5).fill(l.on ? 0x2a1a10 : 0x1a1410).stroke(ink);
      break;
    }
    case "streetlamp": {
      // an iron post with a glass lantern on top
      g.ellipse(x, y + 6, 22, 7).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(x - 9, y - 4, 18, 10).fill(PAL.iron).stroke(ink);
      g.moveTo(x, y).lineTo(x, y - 62).stroke({ width: 8, color: PAL.ink });
      g.moveTo(x, y).lineTo(x, y - 62).stroke({ width: 4, color: PAL.iron });
      g.moveTo(x - 12, y - 62).lineTo(x + 12, y - 62).stroke({ width: 5, color: PAL.ink });
      g.poly([x - 11, y - 64, x + 11, y - 64, x + 9, y - 86, x - 9, y - 86]).fill(l.on ? 0x5a4020 : 0x1e1a16).stroke(ink);
      g.poly([x - 12, y - 86, x, y - 96, x + 12, y - 86]).fill(PAL.iron).stroke(ink);
      if (!l.on) g.moveTo(x - 6, y - 70).lineTo(x + 5, y - 80).stroke({ width: 2, color: 0x6a6660 }); // cracked glass
      break;
    }
    case "window": {
      const wp = w.windowPoint(l);
      const along = l.wall === "N" || l.wall === "S" || l.wall === undefined;
      const half = CONFIG.window.width / 2;
      const thick = CONFIG.room.wall - 14;
      const r = along ? { x: wp.x - half, y: wp.y - thick / 2, w: half * 2, h: thick } : { x: wp.x - thick / 2, y: wp.y - half, w: thick, h: half * 2 };
      g.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8).fill(0x3a3029).stroke({ width: 4, color: PAL.ink });
      if (l.broken) {
        g.rect(r.x, r.y, r.w, r.h).fill(0x0c0e14);
        for (let i = 0; i < 6; i++) {
          const k = (i + 0.5) / 6;
          const px = along ? r.x + r.w * k : r.x;
          const py = along ? r.y : r.y + r.h * k;
          g.poly(along ? [px - 8, py, px + 8, py, px + 2, py + 10 + (i % 3) * 5] : [px, py - 8, px, py + 8, px + 10 + (i % 3) * 5, py + 2]).fill({ color: PAL.glass[i % PAL.glass.length], alpha: 0.8 });
        }
      } else {
        const panes = 5;
        for (let i = 0; i < panes; i++) {
          const col = PAL.glass[(i + l.id) % PAL.glass.length];
          if (along) g.rect(r.x + (r.w / panes) * i, r.y, r.w / panes, r.h).fill(col);
          else g.rect(r.x, r.y + (r.h / panes) * i, r.w, r.h / panes).fill(col);
        }
        for (let i = 1; i < panes; i++) {
          if (along) g.moveTo(r.x + (r.w / panes) * i, r.y).lineTo(r.x + (r.w / panes) * i, r.y + r.h).stroke({ width: 3, color: PAL.ink });
          else g.moveTo(r.x, r.y + (r.h / panes) * i).lineTo(r.x + r.w, r.y + (r.h / panes) * i).stroke({ width: 3, color: PAL.ink });
        }
        g.rect(r.x, r.y, r.w, r.h).stroke({ width: 3, color: PAL.ink });
      }
      // the coloured patch the window throws on the floor
      if (l.on) {
        if (l.holy) {
          for (let i = 0; i < 3; i++) g.ellipse(x + (i - 1) * l.radius * 0.28, y, l.radius * 0.3, l.radius * 0.55).fill({ color: PAL.glass[(i + l.id) % PAL.glass.length], alpha: 0.13 });
          g.ellipse(x, y, l.radius * 0.62, l.radius * 0.5).stroke({ width: 3, color: PAL.holy, alpha: 0.25 });
        } else {
          g.ellipse(x, y, l.radius * 0.6, l.radius * 0.5).fill({ color: 0x9fb4d8, alpha: 0.08 });
        }
      }
      break;
    }
    case "chandelier":
      if (l.fallen) {
        g.ellipse(x, y + 4, 92, 30).fill({ color: PAL.ink, alpha: 0.6 });
        g.ellipse(x, y, 80, 24).stroke({ width: 10, color: PAL.ink });
        g.ellipse(x, y, 80, 24).stroke({ width: 5, color: PAL.iron });
        g.moveTo(x - 60, y - 6).lineTo(x + 20, y + 30).stroke({ width: 6, color: PAL.ink });
        g.moveTo(x + 50, y - 16).lineTo(x - 10, y + 22).stroke({ width: 6, color: PAL.ink });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + l.id;
          const r = 96 + (i % 3) * 22;
          g.rect(x + Math.cos(a) * r - 7, y + Math.sin(a) * r * 0.45 - 3, 14, 6).fill(PAL.wax).stroke({ width: 2, color: PAL.ink });
        }
      }
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ things to use
export function drawChest(g: Graphics, c: Chest, t: number): void {
  if (c.broken && !c.opened) {
    // splinters of a smashed chest
    for (let i = 0; i < 6; i++) g.rect(c.pos.x - 30 + hash(i, c.id) * 60, c.pos.y - 10 + hash(c.id, i) * 26, 16, 6).fill(0x5a4028).stroke({ width: 2, color: PAL.ink });
    return;
  }
  const { x, y } = c.pos;
  const body = c.tier === "wood" ? 0x6a4a2a : c.tier === "iron" ? 0x4a4440 : 0x8a6a2a;
  const band = c.tier === "wood" ? 0x3e2a18 : c.tier === "iron" ? PAL.steel : 0xd8b04a;
  g.ellipse(x, y + 26, 40, 10).fill({ color: PAL.ink, alpha: 0.6 });
  if (c.opened) {
    g.rect(x - 34, y - 6, 68, 32).fill(0x1a120c).stroke({ width: 4, color: PAL.ink });
    g.rect(x - 34, y - 40, 68, 30).fill(body).stroke({ width: 4, color: PAL.ink });
    return;
  }
  const bob = c.mimic ? Math.sin(t * 7) * 1.2 : 0;
  g.rect(x - 34, y - 18 + bob, 68, 44).fill(body).stroke({ width: OUT, color: PAL.ink });
  g.roundRect(x - 34, y - 34 + bob, 68, 22, 10).fill(body).stroke({ width: OUT, color: PAL.ink });
  g.rect(x - 34, y - 14 + bob, 68, 6).fill(band);
  g.rect(x - 24, y - 34 + bob, 6, 60).fill(band);
  g.rect(x + 18, y - 34 + bob, 6, 60).fill(band);
  g.rect(x - 7, y - 16 + bob, 14, 14).fill(c.tier === "reliquary" ? 0xf4e2a8 : 0xa8823e).stroke({ width: 2, color: PAL.ink });
  if (c.tier === "reliquary") {
    g.moveTo(x, y - 46 + bob).lineTo(x, y - 30 + bob).stroke({ width: 4, color: 0xd8b04a });
    g.moveTo(x - 7, y - 40 + bob).lineTo(x + 7, y - 40 + bob).stroke({ width: 4, color: 0xd8b04a });
  }
}

export function drawInteractable(g: Graphics, glow: Graphics, it: Interactable, w: World, t: number, highlight: boolean): void {
  const { x, y } = it.pos;
  switch (it.kind) {
    case "stairs": {
      // a hole in the floor with steps going down into red dark
      g.ellipse(x, y + 10, 90, 34).fill({ color: PAL.ink, alpha: 0.7 });
      g.rect(x - 70, y - 40, 140, 80).fill(0x0a0605).stroke({ width: OUT, color: PAL.ink });
      for (let i = 0; i < 4; i++) g.rect(x - 66 + i * 8, y - 36 + i * 18, 132 - i * 16, 10).fill(0x3a3028 - i * 0x080605).stroke({ width: 2, color: PAL.ink });
      glow.ellipse(x, y + 20, 50, 16).fill({ color: PAL.ember, alpha: 0.12 + 0.06 * Math.sin(t * 2) });
      break;
    }
    case "hatch": {
      // a trapdoor in the floor: oak planks bound in iron, a padlock until it's opened
      g.ellipse(x, y + 8, 80, 26).fill({ color: PAL.ink, alpha: 0.6 });
      if (it.used) {
        g.rect(x - 60, y - 34, 120, 68).fill(0x050403).stroke({ width: OUT, color: PAL.ink });
        for (let i = 0; i < 4; i++) g.rect(x - 52 + i * 8, y - 28 + i * 14, 104 - i * 16, 8).fill(0x2a241e - i * 0x060504);
        break;
      }
      g.rect(x - 60, y - 34, 120, 68).fill(0x4a3420).stroke({ width: OUT, color: PAL.ink });
      for (let i = 1; i < 4; i++) g.moveTo(x - 60 + i * 30, y - 34).lineTo(x - 60 + i * 30, y + 34).stroke({ width: 2, color: 0x2a1c10 });
      for (const dy of [-20, 18]) g.rect(x - 60, y + dy, 120, 7).fill(0x3a3632).stroke({ width: 2, color: PAL.ink });
      g.circle(x + 30, y - 2, 9).stroke({ width: 4, color: 0x6a6660 });
      g.rect(x + 22, y + 2, 16, 14).fill(0x8a7a5a).stroke({ width: 2, color: PAL.ink });
      g.circle(x + 30, y + 9, 2).fill(PAL.ink);
      if (highlight) glow.rect(x - 64, y - 38, 128, 76).stroke({ width: 3, color: PAL.ember, alpha: 0.6 });
      // a cold draught from below
      glow.ellipse(x, y, 50, 16).fill({ color: 0x8ab4ff, alpha: 0.05 + 0.04 * Math.sin(t * 1.5) });
      break;
    }
    case "altar": {
      const offer = w.player.remains.length > 0;
      g.ellipse(x, y + 44, 100, 20).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(x - 90, y - 10, 180, 54).fill(0x3a3030).stroke({ width: OUT, color: PAL.ink });
      g.rect(x - 96, y - 22, 192, 16).fill(0x4e4440).stroke({ width: 4, color: PAL.ink });
      // an upside-down cross, desecrated
      g.rect(x - 5, y - 90, 10, 70).fill(0x2a2020).stroke({ width: 3, color: PAL.ink });
      g.rect(x - 22, y - 46, 44, 9).fill(0x2a2020).stroke({ width: 3, color: PAL.ink });
      for (const dx of [-60, 60]) g.circle(x + dx, y - 30, 11).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      glow.circle(x, y - 40, 60).fill({ color: offer ? 0x9a5ac8 : PAL.ember, alpha: (offer ? 0.22 : 0.08) + 0.05 * Math.sin(t * 3) });
      break;
    }
    case "fence": {
      // the fence: a hooded figure with a lantern behind his counter
      g.ellipse(x, y + 20, 40, 10).fill({ color: PAL.ink, alpha: 0.6 });
      g.poly([x - 34, y + 30, x - 26, y - 40, x, y - 66, x + 26, y - 40, x + 34, y + 30]).fill(0x2e2a24).stroke({ width: OUT, color: PAL.ink });
      g.ellipse(x, y - 42, 12, 14).fill(PAL.ink);
      glow.circle(x - 4, y - 44, 2).fill(0xd8c070);
      glow.circle(x + 5, y - 44, 2).fill(0xd8c070);
      g.rect(x + 30, y - 30, 14, 20).fill(PAL.emberHot).stroke({ width: 3, color: PAL.ink });
      glow.circle(x + 37, y - 20, 22).fill({ color: PAL.ember, alpha: 0.25 });
      break;
    }
    case "bell": {
      g.rect(x - 40, y - 70, 8, 90).fill(0x3a2a1c).stroke({ width: 3, color: PAL.ink });
      g.rect(x + 32, y - 70, 8, 90).fill(0x3a2a1c).stroke({ width: 3, color: PAL.ink });
      g.rect(x - 44, y - 76, 88, 10).fill(0x3a2a1c).stroke({ width: 3, color: PAL.ink });
      const swing = it.used ? 0 : Math.sin(t * 2) * 2;
      g.poly([x - 20 + swing, y + 4, x - 14 + swing, y - 36, x + 14 + swing, y - 36, x + 20 + swing, y + 4]).fill(it.used ? 0x5a4a30 : 0xa8823e).stroke({ width: 4, color: PAL.ink });
      break;
    }
    case "sarcophagus":
      drawSarcophagus(g, glow, it, t, highlight);
      break;
    case "echoAltar": {
      g.ellipse(x, y + 40, 90, 18).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(x - 70, y - 20, 140, 60).fill(0x2e2a30).stroke({ width: OUT, color: PAL.ink });
      for (let i = 0; i < 5; i++) g.circle(x - 48 + i * 24, y - 28, 9).fill(0xcfc4a8).stroke({ width: 2, color: PAL.ink });
      glow.circle(x, y - 40, 50).fill({ color: 0x8ab4ff, alpha: 0.15 + 0.06 * Math.sin(t * 2.2) });
      break;
    }
    case "skull": {
      g.rect(x - 30, y - 10, 60, 40).fill(0x3a3430).stroke({ width: 4, color: PAL.ink });
      g.circle(x, y - 26, 22).fill(0xcfc4a8).stroke({ width: 4, color: PAL.ink });
      g.rect(x - 12, y - 10, 24, 14).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      glow.circle(x - 8, y - 28, 4).fill(PAL.ember);
      glow.circle(x + 8, y - 28, 4).fill(PAL.ember);
      break;
    }
    case "note":
      if (!it.used) drawNote(g, x, y);
      break;
    case "ledger": {
      // a lectern with the open ledger of the dead
      g.ellipse(x, y + 40, 50, 12).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(x - 8, y - 20, 16, 60).fill(PAL.woodMid).stroke({ width: 4, color: PAL.ink });
      g.rect(x - 26, y + 30, 52, 10).fill(PAL.woodMid).stroke({ width: 3, color: PAL.ink });
      g.poly([x - 46, y - 18, x + 46, y - 18, x + 40, y - 44, x - 40, y - 44]).fill(PAL.wood).stroke({ width: 4, color: PAL.ink });
      g.poly([x - 40, y - 24, x - 2, y - 26, x - 2, y - 50, x - 36, y - 46]).fill(0xd8c8a0).stroke({ width: 2, color: PAL.ink });
      g.poly([x + 40, y - 24, x + 2, y - 26, x + 2, y - 50, x + 36, y - 46]).fill(0xd8c8a0).stroke({ width: 2, color: PAL.ink });
      for (let i = 0; i < 4; i++) {
        g.moveTo(x - 32, y - 44 + i * 5).lineTo(x - 8, y - 45 + i * 5).stroke({ width: 1.2, color: 0x5a4a3a });
        g.moveTo(x + 8, y - 45 + i * 5).lineTo(x + 32, y - 44 + i * 5).stroke({ width: 1.2, color: 0x5a4a3a });
      }
      if (highlight) glow.circle(x, y - 36, 50).fill({ color: PAL.soul, alpha: 0.08 });
      break;
    }
    default:
      break;
  }
}

/** Eyes of the six characters, glowing from their sarcophagus lids. */
const HERO_EYES: Record<string, number> = { grabarz: PAL.ember, nekromanta: 0xc88aff, lisz: 0x6affd8, medyk: 0x8aff6a, kaplan: 0xffd090, wiedzma: 0xff4a4a };

/** A sarcophagus in the crypt: chained shut, cracking with echo, or carved with its sleeper's face. */
function drawSarcophagus(g: Graphics, glow: Graphics, it: Interactable, t: number, highlight: boolean): void {
  const { x, y } = it.pos;
  const look = it.look ?? "sealed";
  const id = it.ref ?? "grabarz";
  g.ellipse(x, y + 60, 80, 16).fill({ color: PAL.ink, alpha: 0.6 });
  g.rect(x - 60, y - 70, 120, 130).fill(0x4a4440).stroke({ width: OUT, color: PAL.ink });
  g.rect(x - 52, y - 62, 104, 114).fill(highlight ? 0x5e5650 : 0x524a46);
  if (look === "sealed") {
    // chains across a blank lid and a lock
    for (const [x0, y0, x1, y1] of [[x - 52, y - 60, x + 52, y + 50], [x + 52, y - 60, x - 52, y + 50]] as const) {
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 8, color: PAL.ink });
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 4, color: 0x6a6660 });
    }
    g.rect(x - 9, y - 12, 18, 16).fill(0x5a5048).stroke({ width: 3, color: PAL.ink });
    g.moveTo(x - 5, y - 12).quadraticCurveTo(x, y - 24, x + 5, y - 12).stroke({ width: 3, color: 0x6a6660 });
    return;
  }
  // the sleeper's face carved in the lid
  const hx = x;
  const hy = y - 22;
  g.ellipse(hx, hy + 4, 30, 40).fill(0x3e3834);
  switch (id) {
    case "nekromanta":
      g.poly([hx - 14, hy - 8, hx - 26, hy - 34, hx - 6, hy - 14]).fill(0x8a8070);
      g.poly([hx + 14, hy - 8, hx + 26, hy - 34, hx + 6, hy - 14]).fill(0x8a8070);
      break;
    case "lisz":
      for (let i = 0; i < 5; i++) g.poly([hx - 14 + i * 7, hy - 16, hx - 11 + i * 7, hy - 30 - (i % 2) * 6, hx - 8 + i * 7, hy - 16]).fill(0x8a8070);
      break;
    case "medyk":
      g.poly([hx + 4, hy + 4, hx + 24, hy + 18, hx + 4, hy + 12]).fill(0x8a8070);
      break;
    case "kaplan":
      g.rect(hx - 9, hy + 22, 18, 5).fill(0xb8b0a0);
      break;
    case "wiedzma":
      for (let i = 0; i < 5; i++) g.moveTo(hx - 12 + i * 6, hy - 14).lineTo(hx - 20 + i * 10, hy + 24).stroke({ width: 3, color: 0x6a6258 });
      break;
    default:
      break;
  }
  g.poly([hx - 20, hy + 26, hx - 18, hy - 10, hx, hy - 26, hx + 18, hy - 10, hx + 20, hy + 26]).fill(0x2a2624);
  g.ellipse(hx, hy + 2, 11, 13).fill(PAL.ink);
  const eyes = HERO_EYES[id] ?? PAL.ember;
  if (look === "buyable") {
    // the lid cracks: the echo seeps out
    g.moveTo(x - 40, y + 40).lineTo(x - 18, y + 10).lineTo(x - 26, y - 6).stroke({ width: 3, color: PAL.ink });
    glow.moveTo(x - 40, y + 40).lineTo(x - 18, y + 10).lineTo(x - 26, y - 6).stroke({ width: 2, color: 0x8ab4ff, alpha: 0.5 + 0.3 * Math.sin(t * 3) });
    glow.circle(hx, hy, 40).fill({ color: 0x8ab4ff, alpha: 0.06 + 0.03 * Math.sin(t * 2) });
    return;
  }
  glow.circle(hx - 4, hy, 2.4).fill(eyes);
  glow.circle(hx + 4, hy, 2.4).fill(eyes);
  if (look === "chosen") glow.ellipse(x, y - 4, 64, 74).fill({ color: eyes, alpha: 0.07 + 0.03 * Math.sin(t * 2) });
}

function drawNote(g: Graphics, x: number, y: number): void {
  g.poly([x - 16, y - 12, x + 16, y - 14, x + 18, y + 12, x - 14, y + 14]).fill(0xd8c8a0).stroke({ width: 3, color: PAL.ink });
  for (let i = 0; i < 3; i++) g.moveTo(x - 10, y - 6 + i * 7).lineTo(x + 10, y - 7 + i * 7).stroke({ width: 1.5, color: 0x5a4a3a });
}

// ------------------------------------------------------------------ pickups
export function drawPickup(g: Graphics, glow: Graphics, p: Pickup, t: number): void {
  const bob = Math.sin(t * 4 + p.id) * 3;
  const x = p.pos.x;
  const y = p.pos.y + bob;
  g.ellipse(p.pos.x, p.pos.y + 14, 16, 5).fill({ color: PAL.ink, alpha: 0.5 });
  switch (p.kind) {
    case "gold":
      g.circle(x, y, p.value >= 5 ? 10 : 7).fill(0xd8b04a).stroke({ width: 3, color: PAL.ink });
      g.circle(x - 2, y - 2, 2).fill(0xfff0b0);
      break;
    case "ammo":
      g.rect(x - 10, y - 8, 20, 16).fill(0x6a5232).stroke({ width: 3, color: PAL.ink });
      g.circle(x - 3, y - 2, 3).fill(PAL.steel);
      g.circle(x + 4, y + 2, 3).fill(PAL.steel);
      break;
    case "ammoBox":
      g.rect(x - 18, y - 14, 36, 28).fill(0x6a5232).stroke({ width: 3, color: PAL.ink });
      for (let i = 0; i < 3; i++) g.circle(x - 9 + i * 9, y - 2, 4).fill(PAL.steel).stroke({ width: 1.5, color: PAL.ink });
      break;
    case "heart":
    case "halfHeart":
      heartShape(g, x, y, p.kind === "heart" ? 1 : 0.7);
      break;
    case "key":
      g.circle(x - 8, y, 7).stroke({ width: 4, color: 0xd8b04a });
      g.moveTo(x - 1, y).lineTo(x + 14, y).stroke({ width: 4, color: 0xd8b04a });
      g.moveTo(x + 10, y).lineTo(x + 10, y + 6).stroke({ width: 3, color: 0xd8b04a });
      break;
    case "armor":
      g.poly([x - 14, y - 12, x + 14, y - 12, x + 12, y + 14, x - 12, y + 14]).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      for (let i = 0; i < 3; i++) g.moveTo(x - 10, y - 4 + i * 7).lineTo(x + 10, y - 4 + i * 7).stroke({ width: 2, color: 0x6a6050 });
      break;
    case "echo":
      glow.circle(x, y, 24).fill({ color: 0x8ab4ff, alpha: 0.2 });
      glow.poly([x - 8, y + 6, x, y - 18, x + 8, y + 6, x, y + 12]).fill({ color: 0x8ab4ff, alpha: 0.9 });
      glow.circle(x, y + 2, 3).fill(0xffffff);
      break;
    case "weapon":
      glow.circle(x, y, 30).fill({ color: PAL.ember, alpha: 0.1 + 0.05 * Math.sin(t * 3) });
      drawWeaponShape(g, p.ref as WeaponId, x - 14, y, 0, 1.1);
      if (WEAPONS[p.ref as WeaponId]?.rarity === "legend") glow.circle(x, y, 26).stroke({ width: 2, color: 0x9a5ac8, alpha: 0.7 });
      break;
    case "item":
      glow.circle(x, y, 26).fill({ color: PAL.soul, alpha: 0.1 + 0.05 * Math.sin(t * 3) });
      drawItemIcon(g, p.ref as ItemId, x, y, 1.1);
      break;
    case "relic":
      glow.circle(x, y, 28).fill({ color: 0xf4e2a8, alpha: 0.14 + 0.06 * Math.sin(t * 3) });
      drawRelicIcon(g, p.ref as RelicId, x, y, 1.15);
      break;
    case "remains":
      glow.circle(x, y, 30).fill({ color: 0x9a5ac8, alpha: 0.18 + 0.06 * Math.sin(t * 3) });
      g.moveTo(x - 18, y + 6).lineTo(x + 2, y - 4).stroke({ width: 7, color: PAL.ink });
      g.moveTo(x - 18, y + 6).lineTo(x + 2, y - 4).stroke({ width: 3, color: PAL.steel });
      g.moveTo(x + 6, y - 2).lineTo(x + 18, y - 10).stroke({ width: 6, color: PAL.ink });
      g.moveTo(x + 6, y - 2).lineTo(x + 18, y - 10).stroke({ width: 2, color: 0x6a5a4a });
      break;
    case "note":
      drawNote(g, x, y);
      break;
  }
}

export function heartShape(g: Graphics, x: number, y: number, s: number, color: number = PAL.heart): void {
  const pts = [x, y + 16 * s, x - 18 * s, y - 2 * s, x - 18 * s, y - 10 * s, x - 10 * s, y - 16 * s, x, y - 9 * s, x + 10 * s, y - 16 * s, x + 18 * s, y - 10 * s, x + 18 * s, y - 2 * s];
  g.poly(pts).fill(color).stroke({ width: 3, color: PAL.ink, join: "round" });
}

// ------------------------------------------------------------------ areas on the floor
export function drawZone(g: Graphics, glow: Graphics, z: Zone, t: number): void {
  const { x, y } = z.pos;
  const fade = z.permanent ? 1 : Math.min(1, z.life / 0.8);
  switch (z.kind) {
    case "fire":
    case "holyfire": {
      const hot = z.kind === "holyfire" ? 0xfff0c0 : PAL.emberHot;
      const mid = z.kind === "holyfire" ? 0xf4c860 : PAL.ember;
      if (z.warn > 0) {
        // not burning yet: a ring that fills up until it ignites
        const k = 1 - z.warn / Math.max(0.01, z.warnMax ?? 1);
        const pulse = 0.5 + 0.5 * Math.sin(t * 16);
        const ring = z.kind === "holyfire" ? PAL.holy : PAL.telegraph;
        glow.circle(x, y, z.radius).stroke({ width: 3 + 2 * pulse, color: ring, alpha: 0.45 + 0.35 * k });
        glow.circle(x, y, z.radius * k).fill({ color: ring, alpha: 0.12 + 0.14 * k });
        if (z.kind === "holyfire") {
          // a pillar of light gathers above the spot
          glow.rect(x - z.radius * 0.25 * k, y - 260, z.radius * 0.5 * k, 260).fill({ color: PAL.holy, alpha: 0.08 + 0.12 * k });
        }
        break;
      }
      // the burning area is a true circle: exactly where it hurts
      g.circle(x, y, z.radius).fill({ color: 0x1a0c06, alpha: 0.5 * fade });
      glow.circle(x, y, z.radius).fill({ color: mid, alpha: 0.16 * fade });
      const n = Math.max(5, Math.round(z.radius / 10));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + z.id;
        const r = z.radius * (0.2 + 0.7 * hash(i, z.id));
        const fx = x + Math.cos(a) * r;
        const fy = y + Math.sin(a) * r;
        const h = (14 + 10 * Math.sin(t * 9 + i * 1.7)) * fade;
        glow.poly([fx - 6, fy, fx, fy - h, fx + 6, fy]).fill({ color: i % 2 ? hot : mid, alpha: 0.85 * fade });
      }
      break;
    }
    case "plague": {
      // a sickly cloud; a hostile one (rat poison) shows its edge, so you know where it eats
      const hostile = z.side !== "minion";
      const settling = z.warn > 0 ? 1 - z.warn / Math.max(0.01, z.warnMax ?? 1) : 1;
      for (let i = 0; i < 6; i++) {
        const a = t * 0.6 + i;
        glow.circle(x + Math.cos(a) * z.radius * 0.4 * settling, y + Math.sin(a * 1.3) * z.radius * 0.3 * settling, z.radius * 0.5 * settling).fill({ color: 0x6a8a3a, alpha: (hostile ? 0.16 : 0.1) * fade });
      }
      if (hostile) {
        glow.circle(x, y, z.radius).stroke({ width: z.warn > 0 ? 3 : 2, color: 0x8ab43a, alpha: (z.warn > 0 ? 0.5 + 0.3 * Math.sin(t * 16) : 0.35) * fade });
        for (let i = 0; i < 4; i++) {
          // bubbles rising
          const k = (t * 0.8 + i * 0.25 + hash(i, z.id)) % 1;
          glow.circle(x + (hash(i + 7, z.id) - 0.5) * z.radius * 1.2, y - k * 50, 3 + 2 * (1 - k)).fill({ color: 0xb8d86a, alpha: 0.5 * (1 - k) * fade });
        }
      }
      break;
    }
    case "exorcism": {
      const warn = z.warn > 0;
      const pulse = 0.5 + 0.5 * Math.sin(t * 14);
      glow.circle(x, y, z.radius).stroke({ width: warn ? 3 + pulse * 2 : 8, color: PAL.holy, alpha: warn ? 0.5 + 0.3 * pulse : 0.8 * fade });
      glow.circle(x, y, z.radius).fill({ color: PAL.holy, alpha: warn ? 0.05 : 0.25 * fade });
      if (warn) {
        // a cross of light marks it
        glow.moveTo(x - z.radius * 0.7, y).lineTo(x + z.radius * 0.7, y).stroke({ width: 2, color: PAL.holy, alpha: 0.4 });
        glow.moveTo(x, y - z.radius * 0.7).lineTo(x, y + z.radius * 0.7).stroke({ width: 2, color: PAL.holy, alpha: 0.4 });
      }
      break;
    }
    case "trap": {
      // iron jaws in the dirt, sprung shut once stepped on
      const armed = z.warn <= 0;
      g.ellipse(x, y, z.radius, z.radius * 0.55).fill({ color: PAL.ink, alpha: 0.55 });
      g.ellipse(x, y, z.radius * 0.8, z.radius * 0.42).stroke({ width: 4, color: PAL.iron });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = x + Math.cos(a) * z.radius * 0.8;
        const py = y + Math.sin(a) * z.radius * 0.42;
        g.poly([px - 3, py, px, py - 7, px + 3, py]).fill(0x9a968c).stroke({ width: 1.5, color: PAL.ink });
      }
      g.circle(x, y, 4).fill(PAL.iron).stroke({ width: 2, color: PAL.ink });
      if (armed) glow.ellipse(x, y, z.radius * 0.85, z.radius * 0.45).stroke({ width: 2, color: PAL.telegraph, alpha: 0.35 + 0.15 * Math.sin(t * 5) });
      break;
    }
    case "ink": {
      // a spreading puddle of black ink with a sheen
      g.circle(x, y, z.radius).fill({ color: 0x07060a, alpha: 0.85 * fade });
      g.ellipse(x - z.radius * 0.3, y - z.radius * 0.3, z.radius * 0.35, z.radius * 0.18).fill({ color: 0x3a3a5a, alpha: 0.5 * fade });
      for (let i = 0; i < 5; i++) g.circle(x + Math.cos(i * 2.3 + z.id) * z.radius * 0.98, y + Math.sin(i * 2.3 + z.id) * z.radius * 0.98, 5 + (i % 3) * 3).fill({ color: 0x07060a, alpha: 0.8 * fade });
      break;
    }
    case "slam": {
      const warn = z.warn > 0;
      glow.circle(x, y, z.radius).stroke({ width: 4, color: PAL.telegraph, alpha: warn ? 0.6 : 0.2 * fade });
      if (warn) glow.circle(x, y, z.radius * (1 - z.warn / Math.max(0.01, z.maxLife - 0.3))).fill({ color: PAL.telegraph, alpha: 0.15 });
      break;
    }
    default:
      break;
  }
}
