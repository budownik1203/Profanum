/**
 * Ink-drawn icons for the passive items and the relics (design doc: Interfejs, ikony rysowane
 * tuszem): on the floor where they lie, in the HUD and in the pause screen's inventory.
 * Each icon fits a ~36 px box at scale 1, centred on (x, y).
 */
import type { Graphics } from "pixi.js";
import type { ItemId, RelicId } from "../game/data/items.js";
import { PAL } from "../palette.js";

const INK = PAL.ink;
const BONE = 0xcfc4a8;
const GOLD = 0xd8b04a;
const ROPE = 0xa88456;
const ink = (s: number, w = 3) => ({ width: w * Math.max(0.7, s), color: INK, join: "round" as const, cap: "round" as const });

function line(g: Graphics, x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width + 3, color: INK, cap: "round" });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, cap: "round" });
}

function skull(g: Graphics, x: number, y: number, s: number): void {
  g.circle(x, y - 2 * s, 7 * s).fill(BONE).stroke(ink(s, 2));
  g.rect(x - 4 * s, y + 3 * s, 8 * s, 5 * s).fill(BONE).stroke(ink(s, 2));
  g.circle(x - 2.6 * s, y - 2 * s, 1.8 * s).fill(INK);
  g.circle(x + 2.6 * s, y - 2 * s, 1.8 * s).fill(INK);
}

export function drawItemIcon(g: Graphics, id: ItemId, x: number, y: number, s = 1): void {
  switch (id) {
    case "boneshirt":
      g.poly([x - 12 * s, y - 14 * s, x + 12 * s, y - 14 * s, x + 10 * s, y + 14 * s, x - 10 * s, y + 14 * s]).fill(BONE).stroke(ink(s));
      for (const dy of [-7, -1, 5]) g.moveTo(x - 8 * s, y + dy * s).quadraticCurveTo(x, y + (dy + 3) * s, x + 8 * s, y + dy * s).stroke({ width: 2 * s, color: 0x6a6050 });
      g.moveTo(x, y - 13 * s).lineTo(x, y + 13 * s).stroke({ width: 2.5 * s, color: 0x6a6050 });
      return;
    case "powder":
      g.moveTo(x - 14 * s, y + 10 * s)
        .quadraticCurveTo(x - 6 * s, y - 14 * s, x + 14 * s, y - 10 * s)
        .lineTo(x + 13 * s, y - 2 * s)
        .quadraticCurveTo(x - 1 * s, y - 4 * s, x - 7 * s, y + 13 * s)
        .fill(0xb8a070)
        .stroke(ink(s));
      g.rect(x + 11 * s, y - 13 * s, 6 * s, 12 * s).fill(0x3a2a1a).stroke(ink(s, 2));
      for (const [dx, dy] of [[-10, 14], [-6, 15], [-12, 16]] as const) g.circle(x + dx * s, y + dy * s, 1.3 * s).fill(INK);
      return;
    case "ramrod":
      line(g, x - 12 * s, y + 12 * s, x + 12 * s, y - 12 * s, 3 * s, PAL.steel);
      g.ellipse(x - 12 * s, y + 12 * s, 6 * s, 4 * s).fill(0xd8ccb0).stroke(ink(s, 2));
      g.circle(x + 12 * s, y - 12 * s, 3 * s).fill(GOLD).stroke(ink(s, 2));
      return;
    case "bandolier":
      g.poly([x - 16 * s, y - 8 * s, x - 10 * s, y - 14 * s, x + 16 * s, y + 8 * s, x + 10 * s, y + 14 * s]).fill(0x5a3a22).stroke(ink(s));
      for (let i = 0; i < 4; i++) {
        const cx = x - 9 * s + i * 7 * s;
        const cy = y - 7 * s + i * 6 * s;
        g.rect(cx - 2.5 * s, cy - 6 * s, 5 * s, 9 * s).fill(0x8a7a5a).stroke(ink(s, 1.5));
        g.rect(cx - 2.5 * s, cy - 6 * s, 5 * s, 3 * s).fill(GOLD);
      }
      return;
    case "jarskull":
      g.roundRect(x - 12 * s, y - 11 * s, 24 * s, 26 * s, 5 * s).fill(0x3a4a48).stroke(ink(s));
      skull(g, x, y + 3 * s, s);
      g.rect(x - 9 * s, y - 16 * s, 18 * s, 6 * s).fill(0x6a4a2a).stroke(ink(s, 2));
      g.moveTo(x - 8 * s, y - 6 * s).lineTo(x - 8 * s, y + 8 * s).stroke({ width: 2 * s, color: 0x8ab0a8, alpha: 0.6 });
      return;
    case "rosary":
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        if (i === 6) continue;
        g.circle(x + Math.cos(a) * 11 * s, y - 3 * s + Math.sin(a) * 10 * s, 2.6 * s).fill(0x6a4a3a).stroke(ink(s, 1.2));
      }
      line(g, x, y + 7 * s, x, y + 17 * s, 2.5 * s, GOLD);
      line(g, x - 4 * s, y + 11 * s, x + 4 * s, y + 11 * s, 2.5 * s, GOLD);
      return;
    case "shroud":
      g.moveTo(x, y - 16 * s)
        .quadraticCurveTo(x + 14 * s, y - 10 * s, x + 14 * s, y + 14 * s)
        .lineTo(x - 14 * s, y + 14 * s)
        .quadraticCurveTo(x - 14 * s, y - 10 * s, x, y - 16 * s)
        .fill(0xd8d0c0)
        .stroke(ink(s));
      g.ellipse(x + 1 * s, y - 3 * s, 5 * s, 6 * s).fill(INK);
      for (const dx of [-7, 6]) g.moveTo(x + dx * s, y + 3 * s).lineTo(x + (dx + 1) * s, y + 13 * s).stroke({ width: 2 * s, color: 0x8a8278 });
      return;
    case "shackles":
      for (const dx of [-8, 8]) g.circle(x + dx * s, y + 6 * s, 7 * s).stroke({ width: 6 * s, color: INK }).circle(x + dx * s, y + 6 * s, 7 * s).stroke({ width: 3 * s, color: 0x6a6660 });
      for (let i = 0; i < 3; i++) g.ellipse(x, y - 10 * s + i * 5 * s, 2.5 * s, 3.2 * s).stroke({ width: 2 * s, color: 0x6a6660 });
      return;
    case "handofglory":
      g.roundRect(x - 9 * s, y - 2 * s, 18 * s, 16 * s, 4 * s).fill(0x8a6a4a).stroke(ink(s));
      for (let i = 0; i < 4; i++) {
        const fx = x - 7.5 * s + i * 5 * s;
        g.roundRect(fx - 2 * s, y - 14 * s, 4 * s, 13 * s, 2 * s).fill(0x8a6a4a).stroke(ink(s, 1.5));
        g.poly([fx - 2 * s, y - 14 * s, fx, y - 21 * s, fx + 2 * s, y - 14 * s]).fill(PAL.emberHot);
      }
      return;
    case "claws":
      for (let i = 0; i < 3; i++) {
        const cx = x - 8 * s + i * 8 * s;
        g.moveTo(cx - 3 * s, y + 13 * s).quadraticCurveTo(cx - 3 * s, y - 6 * s, cx + 4 * s, y - 14 * s).stroke({ width: 6 * s, color: INK, cap: "round" });
        g.moveTo(cx - 3 * s, y + 13 * s).quadraticCurveTo(cx - 3 * s, y - 6 * s, cx + 4 * s, y - 14 * s).stroke({ width: 3 * s, color: BONE, cap: "round" });
      }
      return;
    case "hourglass":
      g.poly([x - 9 * s, y - 13 * s, x + 9 * s, y - 13 * s, x + 1.5 * s, y, x + 9 * s, y + 13 * s, x - 9 * s, y + 13 * s, x - 1.5 * s, y]).fill(0x4a5a5a).stroke(ink(s, 2));
      g.poly([x - 6 * s, y + 12 * s, x + 6 * s, y + 12 * s, x, y + 5 * s]).fill(GOLD);
      line(g, x - 12 * s, y - 15 * s, x + 12 * s, y - 15 * s, 3 * s, PAL.wood);
      line(g, x - 12 * s, y + 15 * s, x + 12 * s, y + 15 * s, 3 * s, PAL.wood);
      return;
    case "tome":
      g.rect(x - 12 * s, y - 15 * s, 24 * s, 30 * s).fill(0x4a1e1a).stroke(ink(s));
      g.rect(x - 12 * s, y - 15 * s, 4 * s, 30 * s).fill(0x2a1210);
      g.circle(x + 2 * s, y, 7 * s).stroke({ width: 2 * s, color: GOLD });
      g.poly([x + 2 * s, y + 6 * s, x - 4 * s, y - 4 * s, x + 8 * s, y - 4 * s]).stroke({ width: 1.6 * s, color: GOLD });
      return;
    case "purse":
      g.moveTo(x - 6 * s, y - 10 * s)
        .quadraticCurveTo(x - 16 * s, y + 4 * s, x - 10 * s, y + 13 * s)
        .lineTo(x + 10 * s, y + 13 * s)
        .quadraticCurveTo(x + 16 * s, y + 4 * s, x + 6 * s, y - 10 * s)
        .fill(0x6a4a2a)
        .stroke(ink(s));
      g.moveTo(x - 7 * s, y - 9 * s).lineTo(x + 7 * s, y - 9 * s).stroke({ width: 3 * s, color: ROPE });
      g.circle(x + 6 * s, y + 6 * s, 4.5 * s).fill(GOLD).stroke(ink(s, 1.5));
      return;
    case "martyrheart": {
      const k = 0.9 * s;
      g.poly([x, y + 16 * k, x - 18 * k, y - 2 * k, x - 18 * k, y - 10 * k, x - 10 * k, y - 16 * k, x, y - 9 * k, x + 10 * k, y - 16 * k, x + 18 * k, y - 10 * k, x + 18 * k, y - 2 * k]).fill(PAL.heart).stroke(ink(s));
      g.moveTo(x - 15 * s, y - 6 * s);
      for (let i = 1; i <= 6; i++) g.lineTo(x - 15 * s + i * 5 * s, y - 6 * s + (i % 2 ? -4 : 3) * s);
      g.stroke({ width: 2.5 * s, color: 0x4a3a20 });
      return;
    }
    case "wick":
      g.rect(x - 7 * s, y - 4 * s, 14 * s, 18 * s).fill(PAL.wax).stroke(ink(s));
      g.moveTo(x, y - 4 * s).quadraticCurveTo(x + 2 * s, y - 10 * s, x + 6 * s, y - 10 * s).stroke({ width: 2 * s, color: INK });
      g.moveTo(x - 11 * s, y - 14 * s).quadraticCurveTo(x - 16 * s, y - 6 * s, x - 11 * s, y - 4 * s).quadraticCurveTo(x - 6 * s, y - 6 * s, x - 11 * s, y - 14 * s).fill(0x8ab4ff).stroke(ink(s, 1.5));
      return;
    case "gravedirt":
      g.moveTo(x - 16 * s, y + 12 * s).quadraticCurveTo(x, y - 8 * s, x + 16 * s, y + 12 * s).fill(0x3a2e22).stroke(ink(s));
      line(g, x + 2 * s, y + 2 * s, x + 2 * s, y - 15 * s, 3 * s, PAL.wood);
      line(g, x - 4 * s, y - 9 * s, x + 8 * s, y - 9 * s, 3 * s, PAL.wood);
      return;
    case "emberpocket":
      g.roundRect(x - 12 * s, y - 10 * s, 24 * s, 24 * s, 6 * s).fill(0x3a2a20).stroke(ink(s));
      g.circle(x, y + 3 * s, 6 * s).fill(PAL.ember);
      g.circle(x, y + 3 * s, 3 * s).fill(PAL.emberHot);
      g.moveTo(x - 12 * s, y - 3 * s).lineTo(x + 12 * s, y - 3 * s).stroke({ width: 2 * s, color: INK });
      return;
    case "noose":
      g.circle(x, y + 6 * s, 9 * s).stroke({ width: 7 * s, color: INK }).circle(x, y + 6 * s, 9 * s).stroke({ width: 4 * s, color: ROPE });
      g.rect(x - 4 * s, y - 12 * s, 8 * s, 10 * s).fill(ROPE).stroke(ink(s, 2));
      for (let i = 1; i < 3; i++) g.moveTo(x - 4 * s, y - 12 * s + i * 3.3 * s).lineTo(x + 4 * s, y - 12 * s + i * 3.3 * s).stroke({ width: 1.2 * s, color: INK });
      line(g, x, y - 12 * s, x, y - 17 * s, 3 * s, ROPE);
      return;
  }
}

export function drawRelicIcon(g: Graphics, id: RelicId, x: number, y: number, s = 1): void {
  switch (id) {
    case "monstrance":
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * 5 * s, y - 5 * s + Math.sin(a) * 5 * s).lineTo(x + Math.cos(a) * 13 * s, y - 5 * s + Math.sin(a) * 13 * s).stroke({ width: 2.5 * s, color: GOLD });
      }
      g.circle(x, y - 5 * s, 5.5 * s).fill(0xfff4d8).stroke(ink(s, 2));
      line(g, x, y + 1 * s, x, y + 12 * s, 2.5 * s, GOLD);
      g.poly([x - 7 * s, y + 15 * s, x + 7 * s, y + 15 * s, x + 3 * s, y + 11 * s, x - 3 * s, y + 11 * s]).fill(GOLD).stroke(ink(s, 1.5));
      return;
    case "finger":
      for (let i = 0; i < 3; i++) {
        const cx = x - 7 * s + i * 7 * s;
        const cy = y + 8 * s - i * 8 * s;
        g.roundRect(cx - 4 * s, cy - 5 * s, 8 * s, 10 * s, 3.5 * s).fill(BONE).stroke(ink(s, 2));
      }
      g.circle(x - 7 * s, y + 8 * s, 5.5 * s).stroke({ width: 2 * s, color: GOLD });
      return;
    case "plague":
      for (const [dx, dy, r] of [[-6, -12, 5], [3, -15, 6], [9, -9, 4]] as const) g.circle(x + dx * s, y + dy * s, r * s).fill({ color: 0x6a8a3a, alpha: 0.8 });
      g.rect(x - 3 * s, y - 8 * s, 6 * s, 6 * s).fill(0x5a8a3a).stroke(ink(s, 1.5));
      g.circle(x, y + 6 * s, 9 * s).fill(0x5a8a3a).stroke(ink(s));
      g.circle(x - 3 * s, y + 3 * s, 2.2 * s).fill(0xb8e090);
      return;
    case "nightshroud":
      g.moveTo(x, y - 15 * s)
        .quadraticCurveTo(x + 16 * s, y - 4 * s, x + 12 * s, y + 15 * s)
        .lineTo(x - 12 * s, y + 15 * s)
        .quadraticCurveTo(x - 16 * s, y - 4 * s, x, y - 15 * s)
        .fill(0x1e1428)
        .stroke(ink(s));
      g.circle(x + 2 * s, y - 2 * s, 6 * s).fill(0xd8d0e8);
      g.circle(x + 5 * s, y - 4 * s, 5.5 * s).fill(0x1e1428);
      return;
    case "prophet":
      g.ellipse(x, y - 13 * s, 10 * s, 3.5 * s).stroke({ width: 3 * s, color: GOLD });
      skull(g, x, y + 3 * s, s * 1.3);
      return;
    case "vial":
      g.roundRect(x - 5 * s, y - 10 * s, 10 * s, 24 * s, 5 * s).fill(0x6a3030).stroke(ink(s));
      g.roundRect(x - 3.5 * s, y - 2 * s, 7 * s, 14 * s, 3.5 * s).fill(0xb8201a);
      g.rect(x - 4 * s, y - 15 * s, 8 * s, 6 * s).fill(0x6a4a2a).stroke(ink(s, 1.5));
      return;
    case "rope":
      for (const r of [12, 8, 4]) g.ellipse(x, y + 4 * s, r * s, r * 0.6 * s).stroke({ width: 5 * s, color: INK }).ellipse(x, y + 4 * s, r * s, r * 0.6 * s).stroke({ width: 2.5 * s, color: ROPE });
      g.moveTo(x + 11 * s, y + 3 * s).quadraticCurveTo(x + 16 * s, y - 10 * s, x + 6 * s, y - 15 * s).stroke({ width: 5 * s, color: INK }).moveTo(x + 11 * s, y + 3 * s).quadraticCurveTo(x + 16 * s, y - 10 * s, x + 6 * s, y - 15 * s).stroke({ width: 2.5 * s, color: ROPE });
      return;
  }
}
