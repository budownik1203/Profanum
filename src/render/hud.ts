/**
 * The HUD in gothic frames (design doc: Interfejs): hearts and bone armour, souls, gold and keys,
 * the weapon in hand with its ammunition, the relic and its charge, the minions, the minimap,
 * the boss's health, room banners and the narrator's line.
 */
import type { Graphics } from "pixi.js";
import { CONFIG } from "../game/config.js";
import { RELICS, type ItemId } from "../game/data/items.js";
import { WEAPONS } from "../game/data/weapons.js";
import type { Floor } from "../game/floor.js";
import { boundMinions } from "../game/loot.js";
import { maxAmmo } from "../game/stats.js";
import { goldCostOf, reloadShare, soulCost } from "../game/shooting.js";
import type { World } from "../game/world.js";
import { soulsWord, t } from "../i18n.js";
import { PAL } from "../palette.js";
import { heartShape } from "./env.js";
import type { TextPool } from "./text.js";
import { drawWeaponShape } from "./weapons.js";
import { drawItemIcon, drawRelicIcon } from "./icons.js";

export const VIEW_W = 1920;
export const VIEW_H = 1080;

export interface HudInfo {
  world: World;
  floor?: Floor;
  mode: "run" | "hub";
  narrator: string;
  narratorAlpha: number;
  banner: { text: string; sub?: string; alpha: number } | null;
  /** Echo of Souls (shown in the crypt). */
  echo?: number;
  started: boolean;
}

/** A frame of black iron with ember corners. */
export function frame(g: Graphics, x: number, y: number, w: number, h: number, alpha = 0.78): void {
  g.rect(x, y, w, h).fill({ color: PAL.ink, alpha });
  g.rect(x, y, w, h).stroke({ width: 4, color: 0x2e2622 });
  g.rect(x + 5, y + 5, w - 10, h - 10).stroke({ width: 1.5, color: 0x5a3a22, alpha: 0.8 });
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as const) {
    g.poly([cx, cy - 7, cx + 7, cy, cx, cy + 7, cx - 7, cy]).fill(PAL.ember).stroke({ width: 2, color: PAL.ink });
  }
}

export function drawHud(g: Graphics, tx: TextPool, info: HudInfo): void {
  const w = info.world;
  const p = w.player;
  g.clear();
  tx.begin();
  if (!info.started) {
    tx.end();
    return;
  }
  // ---------------------------------------------------------------- hearts, armour, purse
  frame(g, 24, 20, 360, 112);
  const hearts = p.maxHalves / 2;
  for (let i = 0; i < hearts; i++) {
    const hx = 56 + i * 44;
    const hy = 50;
    heartShape(g, hx, hy, 0.85, PAL.heartEmpty);
    const filled = p.halves - i * 2;
    if (filled >= 2) heartShape(g, hx, hy, 0.85);
    else if (filled === 1) {
      // half a heart: the left half filled
      const s = 0.85;
      g.poly([hx, hy + 16 * s, hx - 18 * s, hy - 2 * s, hx - 18 * s, hy - 10 * s, hx - 10 * s, hy - 16 * s, hx, hy - 9 * s]).fill(PAL.heart);
      g.poly([hx, hy + 16 * s, hx - 18 * s, hy - 2 * s, hx - 18 * s, hy - 10 * s, hx - 10 * s, hy - 16 * s, hx, hy - 9 * s, hx + 10 * s, hy - 16 * s, hx + 18 * s, hy - 10 * s, hx + 18 * s, hy - 2 * s]).stroke({ width: 3, color: PAL.ink });
    }
  }
  for (let i = 0; i < p.armor; i++) {
    const ax = 56 + (hearts + i) * 44;
    g.poly([ax - 13, 38, ax + 13, 38, ax + 11, 64, ax - 11, 64]).fill(0xcfc4a8).stroke({ width: 3, color: PAL.ink });
    for (let k = 0; k < 3; k++) g.moveTo(ax - 9, 45 + k * 6).lineTo(ax + 9, 45 + k * 6).stroke({ width: 2, color: 0x6a6050 });
  }
  // souls, gold, keys
  const row = 100;
  g.poly([48, row + 6, 56, row - 14, 64, row + 6, 56, row + 12]).fill(PAL.soul).stroke({ width: 2, color: PAL.ink });
  tx.text(String(p.souls), 74, row - 14, { size: 26, color: PAL.soul });
  g.circle(140, row, 9).fill(0xd8b04a).stroke({ width: 3, color: PAL.ink });
  tx.text(String(p.gold), 156, row - 14, { size: 26, color: 0xd8b04a });
  g.circle(240, row, 6).stroke({ width: 4, color: 0xd8b04a });
  g.moveTo(246, row).lineTo(260, row).stroke({ width: 4, color: 0xd8b04a });
  tx.text(String(p.keys), 268, row - 14, { size: 26, color: PAL.hudText });

  // light and the alarm, under the hearts
  if (info.mode === "run" && w.dark && p.alive) {
    const holy = w.isHoly(p.pos);
    const lit = w.isLit(p.pos, false);
    const where = holy ? t("hud.holy") : lit ? t("hud.lit") : t("hud.dark");
    const seen = w.alarm ? t("hud.seen") : t("hud.hidden");
    const burning = w.exposure > CONFIG.darkness.burnDelay * p.stats.burnDelayMul * 0.5 ? `  ·  ${t("hud.burning")}` : "";
    const slowed = (p.slow ?? 0) > 0 ? `  ·  ${t("hud.slowed")}` : "";
    tx.text(`${where}  ·  ${seen}${burning}${slowed}`, 30, 140, { size: 22, color: holy ? 0xf4e2a8 : lit ? PAL.hudText : PAL.hudDim, stroke: true });
  }

  // ---------------------------------------------------------------- the weapon
  const slot = p.weapons[p.current];
  if (slot) {
    const def = WEAPONS[slot.id];
    const bx = 24;
    const by = VIEW_H - 150;
    frame(g, bx, by, 470, 126);
    drawWeaponShape(g, slot.id, bx + 34, by + 64, 0, 2);
    tx.text(t(`weapon.${slot.id}`), bx + 170, by + 14, { size: 24, color: def.rarity === "legend" ? 0xc88aff : PAL.hudText, font: "display" });
    let status: string;
    if (def.kind === "occult") {
      const cost = soulCost(w, slot, def);
      status = cost === 0 ? "∞" : `${cost} ${soulsWord(cost)}`;
    } else if (slot.reloadLeft > 0) {
      status = t("hud.reloading");
    } else {
      const gold = goldCostOf(w, def);
      const total = gold > 0 ? ` · ${t("hud.goldShot", { n: gold })}` : Number.isFinite(slot.ammo) ? ` · ${slot.ammo}/${maxAmmo(p, slot)}` : " · ∞";
      status = slot.ammo <= 0 ? t("hud.empty") : `${slot.loaded}/${def.capacity}${total}`;
    }
    tx.text(status, bx + 170, by + 48, { size: 24, color: slot.ammo <= 0 ? PAL.telegraph : PAL.hudText });
    // loaded rounds as pips
    if (def.kind !== "occult") {
      for (let i = 0; i < def.capacity; i++) {
        g.rect(bx + 172 + i * 16, by + 86, 10, 18).fill(i < slot.loaded ? 0xd8b04a : 0x2a2420).stroke({ width: 2, color: PAL.ink });
      }
    }
    const share = reloadShare(w);
    if (share > 0) {
      g.rect(bx + 170, by + 110, 280, 6).fill(0x2a2420);
      g.rect(bx + 170, by + 110, 280 * share, 6).fill(PAL.ember);
    }
    if (slot.ritual) tx.text(`✦ ${t(`form.${slot.ritual}`)}`, bx + 330, by + 82, { size: 18, color: 0xc88aff });
    // the other weapons as numbered slots
    p.weapons.forEach((s, i) => {
      const sx = bx + 8 + i * 58;
      const sy = by - 52;
      g.rect(sx, sy, 52, 40).fill({ color: PAL.ink, alpha: 0.7 }).stroke({ width: 2, color: i === p.current ? PAL.ember : 0x3a302a });
      drawWeaponShape(g, s.id, sx + 8, sy + 22, 0, 0.7);
      tx.text(String(i + 1), sx + 4, sy + 2, { size: 14, color: i === p.current ? PAL.ember : PAL.hudDim });
    });
  }

  // ---------------------------------------------------------------- relic and minions
  const rx = VIEW_W - 394;
  const ry = VIEW_H - 150;
  frame(g, rx, ry, 370, 126);
  if (p.relic) {
    const def = RELICS[p.relic.id];
    const ready = p.relic.charge >= def.charge;
    if (ready) g.circle(rx + 40, ry + 50, 30).fill({ color: 0xf4e2a8, alpha: 0.12 });
    drawRelicIcon(g, p.relic.id, rx + 40, ry + 50, 1.25);
    tx.text(t(`relic.${p.relic.id}`), rx + 78, ry + 14, { size: 21, color: ready ? 0xf4e2a8 : PAL.hudText, font: "display" });
    for (let i = 0; i < def.charge; i++) g.rect(rx + 80 + i * 26, ry + 48, 20, 12).fill(i < p.relic.charge ? PAL.ember : 0x2a2420).stroke({ width: 2, color: PAL.ink });
    if (ready) tx.text(t("hud.relicReady"), rx + 80 + def.charge * 26 + 8, ry + 42, { size: 18, color: PAL.ember });
  } else {
    tx.text(t("hud.noRelic"), rx + 22, ry + 20, { size: 20, color: PAL.hudDim });
  }
  // the passive items, a row of small ink icons above the relic
  const counts = new Map<ItemId, number>();
  for (const id of p.items) counts.set(id, (counts.get(id) ?? 0) + 1);
  const list = [...counts];
  const perRow = 9;
  list.slice(0, perRow * 2).forEach(([id, n], i) => {
    const ix = rx + 2 + (i % perRow) * 41;
    const iy = ry - 46 - Math.floor(i / perRow) * 42;
    g.rect(ix, iy, 36, 36).fill({ color: PAL.ink, alpha: 0.72 }).stroke({ width: 2, color: 0x3a302a });
    drawItemIcon(g, id, ix + 18, iy + 18, 0.75);
    if (n > 1) tx.text(`×${n}`, ix + 34, iy + 20, { size: 13, color: PAL.hudText, align: "right", stroke: true }, 1, 0);
  });
  if (list.length > perRow * 2) tx.text(`+${list.length - perRow * 2}`, rx + 2, ry - 46 - 2 * 42 + 10, { size: 16, color: PAL.hudDim });
  const minions = boundMinions(w);
  tx.text(`${t("hud.minions")}: ${minions}/${p.stats.minionLimit}`, rx + 22, ry + 82, { size: 22, color: minions > 0 ? PAL.ember : PAL.hudText });
  if (p.character === "wiedzma") {
    const cd = p.specialCooldown;
    tx.text(cd > 0 ? `${t("hud.rope")} ${cd.toFixed(1)}s` : t("hud.rope"), rx + 200, ry + 82, { size: 20, color: cd > 0 ? PAL.hudDim : PAL.hudText });
  }

  // ---------------------------------------------------------------- minimap
  if (info.floor) drawMinimap(g, tx, info.floor);
  if (info.mode === "hub" && info.echo !== undefined) {
    frame(g, VIEW_W - 344, 20, 320, 60);
    tx.text(t("hub.echo", { n: info.echo }), VIEW_W - 324, 34, { size: 26, color: 0x8ab4ff });
  }

  // ---------------------------------------------------------------- the boss
  const boss = w.units.find((u) => u.def.boss && u.alive);
  if (boss) {
    const bw = 760;
    const bx = (VIEW_W - bw) / 2;
    const by2 = 46;
    frame(g, bx - 12, by2 - 34, bw + 24, 66);
    g.rect(bx, by2 + 4, bw, 14).fill(0x2a1210);
    g.rect(bx, by2 + 4, bw * Math.max(0, boss.hp / boss.maxHp), 14).fill(PAL.heart);
    tx.text(t(`unit.${boss.kind}`), VIEW_W / 2, by2 - 28, { size: 26, font: "display", align: "center" }, 0.5, 0);
    if (w.isLit(boss.pos, false)) tx.text("☀", bx + bw + 4, by2 - 6, { size: 20, color: 0xf4e2a8 });
  }

  // ---------------------------------------------------------------- banners and the narrator
  if (info.banner && info.banner.alpha > 0) {
    tx.text(info.banner.text, VIEW_W / 2, VIEW_H * 0.3, { size: 54, font: "display", align: "center", stroke: true }, 0.5, 0.5, info.banner.alpha);
    if (info.banner.sub) tx.text(info.banner.sub, VIEW_W / 2, VIEW_H * 0.3 + 52, { size: 26, color: PAL.hudDim, align: "center", stroke: true }, 0.5, 0.5, info.banner.alpha);
  }
  if (info.narrator && info.narratorAlpha > 0) {
    g.rect(VIEW_W / 2 - 620, VIEW_H - 236, 1240, 64).fill({ color: PAL.ink, alpha: 0.55 * info.narratorAlpha });
    tx.text(info.narrator, VIEW_W / 2, VIEW_H - 204, { size: 25, color: 0xe8d8b8, align: "center", wrap: 1180, font: "body" }, 0.5, 0.5, info.narratorAlpha);
  }
  tx.end();
}

/** Rooms seen so far: visited ones filled, their neighbours as outlines, special rooms marked. */
function drawMinimap(g: Graphics, tx: TextPool, floor: Floor): void {
  const known = floor.known();
  const cell = 30;
  const gap = 8;
  const xs = floor.rooms.map((r) => r.gx);
  const ys = floor.rooms.map((r) => r.gy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const wpx = (maxX - minX + 1) * (cell + gap) + 24;
  const hpx = (maxY - minY + 1) * (cell + gap) + 24;
  const ox = VIEW_W - 24 - wpx;
  const oy = 20;
  frame(g, ox, oy, wpx, hpx, 0.65);
  const at = (gx: number, gy: number) => ({ x: ox + 12 + (gx - minX) * (cell + gap), y: oy + 12 + (gy - minY) * (cell + gap) });
  for (const r of known) {
    if (!r.visited) continue;
    const p = at(r.gx, r.gy);
    for (const [side, to] of Object.entries(r.doors)) {
      if (to === undefined || !known.some((k) => k.id === to)) continue;
      const cx = p.x + cell / 2;
      const cy = p.y + cell / 2;
      const dx = side === "E" ? 1 : side === "W" ? -1 : 0;
      const dy = side === "S" ? 1 : side === "N" ? -1 : 0;
      g.moveTo(cx + (dx * cell) / 2, cy + (dy * cell) / 2).lineTo(cx + dx * (cell / 2 + gap), cy + dy * (cell / 2 + gap)).stroke({ width: 4, color: PAL.hudDim });
    }
  }
  for (const r of known) {
    if (r.hidden && !floor.revealed) continue;
    const p = at(r.gx, r.gy);
    const cleared = r.world?.cleared && r.world.hadEnemies;
    const fill = r.id === floor.current ? PAL.ember : r.visited ? (cleared ? 0x3a322a : 0x6a5c4c) : PAL.ink;
    g.rect(p.x, p.y, cell, cell).fill({ color: fill, alpha: r.visited ? 0.95 : 0.5 }).stroke({ width: 3, color: r.visited ? PAL.hudText : PAL.hudDim });
    const cx = p.x + cell / 2;
    const cy = p.y + cell / 2;
    switch (r.type) {
      case "boss":
      case "final":
        g.circle(cx, cy, 7).fill(PAL.heart).stroke({ width: 2, color: PAL.ink });
        break;
      case "treasure":
        g.rect(cx - 7, cy - 5, 14, 10).fill(0xd8b04a).stroke({ width: 2, color: PAL.ink });
        break;
      case "shop":
        g.circle(cx, cy, 6).fill(0xd8b04a).stroke({ width: 2, color: PAL.ink });
        break;
      case "altar":
        g.rect(cx - 2, cy - 8, 4, 16).fill(0xc88aff);
        g.rect(cx - 6, cy + 1, 12, 4).fill(0xc88aff);
        break;
      case "secret":
        g.circle(cx, cy, 6).fill(0x8ab4ff).stroke({ width: 2, color: PAL.ink });
        break;
      case "miniboss":
        g.poly([cx - 6, cy + 5, cx - 6, cy - 5, cx - 2, cy, cx, cy - 7, cx + 2, cy, cx + 6, cy - 5, cx + 6, cy + 5]).fill(0xd8b04a);
        break;
      default:
        break;
    }
  }
  tx.text(t(`floor.${floor.world.theme}`), VIEW_W - 24, oy + hpx + 6, { size: 18, color: PAL.hudDim, align: "right" }, 1, 0);
}
