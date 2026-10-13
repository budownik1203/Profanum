/**
 * The bosses, drawn big and one by one, with their attacks telegraphed on the floor.
 * Telegraphs go into the glow layer so they read even when the arena has gone dark.
 * Everything here reads the boss's script state (boss.step / t / n / mem) and never changes it.
 */
import { type Vec, add, angleOf, dist, fromAngle, norm, scale, sub, vec } from "../game/math.js";
import type { BossState, Light, Unit } from "../game/types.js";
import type { World } from "../game/world.js";
import { PAL } from "../palette.js";
import { drawWeaponShape } from "./weapons.js";
import { BEAM_SWEEP, BEAM_TIME } from "../game/bosses.js";
import {
  type G, GOLD, INK, RED, TAU, arcLine, arm, band, clamp01, gait, haste, ink, limb, lookDir, marker, progressRing, sector, tongue, wing,
} from "./bosskit.js";
import { drawBoss2 } from "./bosses2.js";

// ------------------------------------------------------------------ dispatch
export function drawBoss(g: G, gl: G, e: Unit, w: World): void {
  const b = e.boss;
  if (!b) return;
  switch (e.kind) {
    case "executioner":
      return executioner(g, gl, e, w, b);
    case "captain":
      return captain(g, gl, e, w, b);
    case "powdermaster":
      return powdermaster(g, gl, e, w, b);
    case "bishop":
      return b.phase >= 2 ? bishopWalking(g, gl, e, w, b) : bishopLitter(g, gl, e, w, b);
    case "grandinquisitor":
      return inquisitor(g, gl, e, w, b);
    case "holyflame":
      return flame(g, gl, e, w, b);
    default:
      return drawBoss2(g, gl, e, w, b);
  }
}

// ------------------------------------------------------------------ the City Executioner
function executioner(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.7;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const attacking = b.step === "chop" || b.step === "charge";
  const look = lookDir(e, w, attacking);
  const face = look.x >= 0 ? 1 : -1;
  const dir = e.dir;
  const sw = gait(b, s);
  const burning = b.phase >= 2;

  // --- telegraphs on the floor
  marker(gl, e, b, 0x9e1f14);
  if (b.step === "chop") {
    const wind = 0.75 / h;
    if (b.n <= 1) {
      const k = clamp01(b.t / wind);
      sector(gl, x, y, angleOf(dir), 1.15, 240, RED, 0.08 + 0.12 * k);
      sector(gl, x, y, angleOf(dir), 1.15, 240 * k, RED, 0.18);
      arcLine(gl, x, y, angleOf(dir) - 1.15, angleOf(dir) + 1.15, 240, 3, RED, 0.5 + 0.4 * k);
    } else if (b.t < wind + 0.25) {
      const k = clamp01((b.t - wind) / 0.25);
      sector(gl, x, y, angleOf(dir), 1.15, 250, 0xfff0c0, 0.5 * (1 - k), 120);
    }
  } else if (b.step === "charge" && b.n <= 1) {
    const k = clamp01(b.t / (0.8 / h));
    band(gl, e.pos, dir, 540, e.radius * 2, RED, 0.08 + 0.2 * k);
  } else if (b.step === "ring" && b.n === 0) {
    const k = clamp01(b.t / (0.55 / h));
    gl.circle(x, y, 40 + 90 * k).stroke({ width: 4, color: RED, alpha: 0.3 + 0.5 * k });
    gl.circle(x, y, 130).stroke({ width: 2, color: RED, alpha: 0.25 });
  } else if (b.step === "relight") {
    const pyre = w.lights.find((l) => l.kind === "pyre" && !l.on && dist(l.pos, e.pos) < 160);
    if (pyre) progressRing(gl, pyre.pos.x, pyre.pos.y - 60, 26, (b.mem.gesture ?? 0) / 0.8, PAL.ember);
  }

  // --- the axe: where the hands and the head of the axe are for this moment
  let hand: Vec;
  let head: Vec;
  if (b.step === "chop" && b.n <= 1) {
    const k = clamp01(b.t / (0.75 / h));
    hand = vec(x + face * 6 * s, y - (72 + 22 * k) * s);
    head = vec(x - face * (18 + 14 * k) * s, y - (118 + 30 * k) * s);
  } else if (b.step === "chop") {
    hand = vec(x + dir.x * 34 * s, y - 44 * s + dir.y * 22 * s);
    head = vec(x + dir.x * 118 * s, y - 18 * s + dir.y * 86 * s);
  } else if (b.step === "ring" && b.n === 0) {
    hand = vec(x + face * 4 * s, y - 100 * s);
    head = vec(x + face * 10 * s, y - 156 * s);
  } else if (b.step === "ring") {
    hand = vec(x + face * 30 * s, y - 40 * s);
    head = vec(x + face * 98 * s, y - 2 * s);
  } else if (b.step === "charge" && b.n <= 1) {
    hand = vec(x - face * 6 * s, y - 70 * s);
    head = vec(x - face * 50 * s, y - 120 * s);
  } else if (b.step === "charge") {
    hand = vec(x - dir.x * 14 * s, y - 40 * s);
    head = vec(x - dir.x * 108 * s, y - 4 * s - dir.y * 44 * s);
  } else {
    // resting on the shoulder, one hand on the haft
    hand = vec(x + face * 18 * s, y - 48 * s);
    head = vec(x - face * 24 * s, y - 126 * s);
  }
  const twoHanded = b.step === "chop" || b.step === "ring" || b.step === "charge";
  const hd = norm(sub(head, hand));
  const pommel = sub(hand, scale(hd, 20 * s));
  const hand2 = twoHanded ? sub(hand, scale(hd, 24 * s)) : vec(x - face * 31 * s, y - 34 * s);

  // --- legs and boots
  for (const side of [-1, 1]) {
    const k = sw * side * 7 * s;
    limb(g, x + side * 11 * s, y - 34 * s, x + side * 13 * s + k, y - 5 * s, 13 * s, C(0x2a2220));
    g.ellipse(x + side * 13 * s + k + face * 3 * s, y - 3 * s, 10 * s, 5 * s).fill(C(0x161210)).stroke(ink(3));
  }
  // --- the leather apron, stained
  g.poly([x - 23 * s, y - 48 * s, x + 23 * s, y - 48 * s, x + 21 * s, y - 10 * s, x - 21 * s, y - 10 * s]).fill(C(0x3a2418)).stroke(ink(5));
  if (!fl) {
    g.ellipse(x - 6 * s, y - 24 * s, 7 * s, 5 * s).fill({ color: 0x4a1410, alpha: 0.8 });
    g.ellipse(x + 9 * s, y - 34 * s, 4 * s, 3 * s).fill({ color: 0x4a1410, alpha: 0.8 });
    for (const dx of [-12, 12]) g.moveTo(x + dx * s, y - 46 * s).lineTo(x + dx * s, y - 12 * s).stroke({ width: 2, color: 0x24160e });
  }
  // --- the bare barrel chest
  const skin = C(0x9a765e);
  g.poly([x - 32 * s, y - 68 * s, x + 32 * s, y - 68 * s, x + 25 * s, y - 46 * s, x - 25 * s, y - 46 * s]).fill(skin).stroke(ink(5));
  g.poly([x + face * 2 * s, y - 68 * s, x + face * 32 * s, y - 68 * s, x + face * 25 * s, y - 46 * s, x + face * 2 * s, y - 46 * s]).fill({ color: C(0x6a4c3a), alpha: 0.75 });
  g.moveTo(x - 18 * s, y - 58 * s).quadraticCurveTo(x - 8 * s, y - 53 * s, x - 1 * s, y - 58 * s).stroke({ width: 3, color: INK, alpha: 0.55 });
  g.moveTo(x + 1 * s, y - 58 * s).quadraticCurveTo(x + 8 * s, y - 53 * s, x + 18 * s, y - 58 * s).stroke({ width: 3, color: INK, alpha: 0.55 });
  g.rect(x - 26 * s, y - 51 * s, 52 * s, 7 * s).fill(C(0x1e1410)).stroke(ink(3));
  g.rect(x - 5 * s, y - 52 * s, 10 * s, 9 * s).fill(C(PAL.iron)).stroke(ink(3));
  // --- the hood with its shoulder mantle
  const hood = C(0x161012);
  g.poly([x - 27 * s, y - 62 * s, x + 27 * s, y - 62 * s, x + 16 * s, y - 75 * s, x + 13 * s, y - 94 * s, x - face * 8 * s, y - 112 * s, x - 13 * s, y - 94 * s, x - 16 * s, y - 75 * s]).fill(hood).stroke(ink(5));
  g.ellipse(x + face * 3 * s, y - 87 * s, 3.4 * s, 2.6 * s).fill(INK);
  g.ellipse(x + face * 11 * s, y - 87 * s, 3.4 * s, 2.6 * s).fill(INK);
  gl.circle(x + face * 3 * s, y - 87 * s, 2.2 * s).fill(0xffd090);
  gl.circle(x + face * 11 * s, y - 87 * s, 2.2 * s).fill(0xffd090);
  gl.circle(x + face * 7 * s, y - 87 * s, 9 * s).fill({ color: PAL.ember, alpha: 0.12 });

  // --- the axe (haft, then the bearded blade)
  limb(g, pommel.x, pommel.y, head.x + hd.x * 12 * s, head.y + hd.y * 12 * s, 5 * s, C(PAL.wood));
  let p = vec(-hd.y, hd.x);
  if (p.x * face + p.y * 0.3 < 0) p = scale(p, -1);
  const at = (a: number, c: number) => vec(head.x + hd.x * a * s + p.x * c * s, head.y + hd.y * a * s + p.y * c * s);
  const blade = [at(10, 2), at(18, 28), at(-6, 38), at(-30, 34), at(-32, 6)];
  g.poly(blade.flatMap((v) => [v.x, v.y])).fill(C(0x9a9890)).stroke(ink(5));
  const edge0 = at(16, 26);
  const edge1 = at(-28, 32);
  g.moveTo(edge0.x, edge0.y).quadraticCurveTo(at(-4, 40).x, at(-4, 40).y, edge1.x, edge1.y).stroke({ width: 3, color: burning ? PAL.ember : 0xd2cfc4 });
  if (burning) {
    // the burning axe of phase two
    const mid = at(-6, 30);
    gl.circle(mid.x, mid.y, 30 * s).fill({ color: PAL.ember, alpha: 0.18 });
    for (let i = 0; i < 4; i++) {
      const q = at(12 - i * 12, 30 + (i % 2) * 6);
      tongue(gl, q.x, q.y, 10 * s, (16 + 8 * Math.sin(w.time * 11 + i * 1.9)) * s, Math.sin(w.time * 7 + i) * 4, i % 2 ? PAL.emberHot : PAL.ember, 0.9);
    }
  }
  // --- arms: heavy, bare, leather bracers at the wrists
  const sh1 = vec(x + face * 26 * s, y - 64 * s);
  const sh2 = vec(x - face * 26 * s, y - 64 * s);
  const torch = b.step === "torches" && b.n < 3;
  if (!torch) {
    arm(g, sh2, hand2, 6 * s, 10 * s, skin, x);
    g.circle(hand2.x, hand2.y, 5.5 * s).fill(C(0x2a1e16)).stroke(ink(3));
  }
  arm(g, sh1, hand, 7 * s, 11 * s, skin, x);
  g.circle(hand.x, hand.y, 6 * s).fill(C(0x2a1e16)).stroke(ink(3));
  if (torch) {
    // a torch from the pyre in his free hand, about to fly
    const tx = x - face * 30 * s;
    const ty = y - 104 * s;
    arm(g, sh2, vec(tx, ty + 12 * s), 6 * s, 10 * s, skin, x);
    limb(g, tx, ty + 20 * s, tx + face * 4 * s, ty - 12 * s, 4 * s, C(PAL.wood));
    tongue(gl, tx + face * 4 * s, ty - 10 * s, 12 * s, 26 * s, Math.sin(w.time * 12) * 4, PAL.emberHot, 0.95);
    gl.circle(tx, ty - 16 * s, 24 * s).fill({ color: PAL.ember, alpha: 0.2 });
  }
}

// ------------------------------------------------------------------ the Captain of the City Watch
function captain(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.35;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const attacking = b.step === "lunge" || b.step === "pistols";
  const look = lookDir(e, w, attacking);
  const face = look.x >= 0 ? 1 : -1;
  const dir = e.dir;
  const sw = gait(b, s);
  const red = C(0x8a2a1e);
  const steel = C(0xa8a6a0);

  // --- telegraphs
  marker(gl, e, b, 0x9e1f14);
  if (b.step === "lunge") {
    const wind = 0.6 / h;
    const per = wind + 0.45;
    const k = Math.floor(b.t / per);
    const local = b.t - k * per;
    if (k < (b.phase >= 2 ? 3 : 2) && local < wind) band(gl, e.pos, dir, 700 * 0.45, e.radius * 2, RED, 0.1 + 0.25 * clamp01(local / wind));
  } else if (b.step === "pistols" && b.n >= 1) {
    const wind = 0.45 / h;
    const shots = b.phase >= 2 ? 3 : 2;
    const next = wind + (b.n - 1) * 0.35;
    if (b.n <= shots && b.t < next) {
      const aim = norm(sub(w.player.pos, e.pos));
      const k = clamp01(1 - (next - b.t) / 0.35);
      for (let i = 0; i < 5; i++) {
        const a = angleOf(aim) + (i / 4 - 0.5) * 0.8;
        const d = fromAngle(a);
        gl.moveTo(x + d.x * 40, y - 30 + d.y * 40).lineTo(x + d.x * 420, y - 30 + d.y * 420).stroke({ width: 2, color: RED, alpha: 0.15 + 0.3 * k });
      }
    }
  } else if (b.step === "volley" && b.n === 1 && b.mem.gapY !== undefined) {
    // "Volley!": the wall of muskets along one side, and the gap to run for
    const k = clamp01(b.t / 1.1);
    const { w: RW, h: RH } = w.room;
    const east = b.mem.fromEast === 1;
    const sx = east ? RW - 70 : 70;
    for (let yy = 80; yy < RH - 60; yy += 52) {
      if (Math.abs(yy - b.mem.gapY) < 110) continue;
      gl.circle(sx, yy, 8 + 4 * k).fill({ color: RED, alpha: 0.4 + 0.5 * k });
      gl.moveTo(sx, yy).lineTo(east ? sx - RW * k : sx + RW * k, yy).stroke({ width: 2, color: RED, alpha: 0.12 + 0.12 * k });
    }
    gl.rect(0, b.mem.gapY - 100, RW, 200).fill({ color: PAL.holy, alpha: 0.05 + 0.05 * k });
    gl.moveTo(0, b.mem.gapY - 100).lineTo(RW, b.mem.gapY - 100).stroke({ width: 2, color: PAL.holy, alpha: 0.35 });
    gl.moveTo(0, b.mem.gapY + 100).lineTo(RW, b.mem.gapY + 100).stroke({ width: 2, color: PAL.holy, alpha: 0.35 });
    if (b.phase >= 2 && b.mem.gapX !== undefined) {
      for (let xx = 80; xx < RW - 60; xx += 56) {
        if (Math.abs(xx - b.mem.gapX) < 120) continue;
        gl.circle(xx, 70, 7 + 4 * k).fill({ color: RED, alpha: 0.4 + 0.5 * k });
      }
      gl.rect(b.mem.gapX - 110, 0, 220, RH).fill({ color: PAL.holy, alpha: 0.04 + 0.04 * k });
    }
  }

  // --- the cape behind him
  const capeSway = Math.sin(w.time * 3) * 3 * s + sw * 4 * s;
  g.poly([x - face * 20 * s, y - 66 * s, x + face * 12 * s, y - 66 * s, x - face * (2 - capeSway / s) * s, y - 8 * s, x - face * (34 + capeSway / s) * s, y - 12 * s]).fill(C(0x4a1010)).stroke(ink(4));
  g.poly([x - face * 18 * s, y - 60 * s, x - face * 30 * s, y - 14 * s, x - face * (24 + capeSway / s) * s, y - 12 * s]).fill({ color: red, alpha: 0.7 });
  // the halberd slung across his back while he shoots
  if (b.step === "pistols") limb(g, x - face * 30 * s, y - 20 * s, x + face * 20 * s, y - 120 * s, 4 * s, C(PAL.wood));

  // --- legs: dark hose, tall boots, puffed breeches
  for (const side of [-1, 1]) {
    const k = sw * side * 7 * s;
    limb(g, x + side * 8 * s, y - 34 * s, x + side * 9 * s + k, y - 4 * s, 8 * s, C(0x2a2220));
    limb(g, x + side * 8.5 * s + k * 0.6, y - 16 * s, x + side * 9 * s + k, y - 4 * s, 11 * s, C(0x1a1412));
    g.ellipse(x + side * 9 * s + k + face * 3 * s, y - 2 * s, 8 * s, 4 * s).fill(C(0x1a1412)).stroke(ink(3));
    g.ellipse(x + side * 9 * s, y - 36 * s, 11 * s, 9 * s).fill(red).stroke(ink(4));
    if (!fl) g.moveTo(x + side * 9 * s, y - 44 * s).lineTo(x + side * 9 * s, y - 28 * s).stroke({ width: 3, color: GOLD });
  }
  // --- doublet and the steel cuirass
  g.poly([x - 21 * s, y - 67 * s, x + 21 * s, y - 67 * s, x + 17 * s, y - 38 * s, x - 17 * s, y - 38 * s]).fill(red).stroke(ink(5));
  g.poly([x - 17 * s, y - 64 * s, x + 17 * s, y - 64 * s, x + 14 * s, y - 43 * s, x, y - 35 * s, x - 14 * s, y - 43 * s]).fill(steel).stroke(ink(4));
  g.poly([x + face * 1 * s, y - 64 * s, x + face * 17 * s, y - 64 * s, x + face * 14 * s, y - 43 * s, x + face * 1 * s, y - 36 * s]).fill({ color: C(0x6a6862), alpha: 0.6 });
  g.moveTo(x, y - 63 * s).lineTo(x, y - 37 * s).stroke({ width: 2.5, color: C(0xd8d6cc) });
  // gold sash from shoulder to hip
  g.poly([x - face * 18 * s, y - 64 * s, x - face * 10 * s, y - 64 * s, x + face * 18 * s, y - 40 * s, x + face * 12 * s, y - 36 * s]).fill(C(GOLD)).stroke(ink(2));
  // the ruff
  g.ellipse(x + face * 1 * s, y - 68 * s, 13 * s, 5 * s).fill(C(0xe8e0d0)).stroke(ink(3));

  // --- head: moustache, morion and a big plume
  const hx = x + face * 2 * s;
  const hy = y - 79 * s;
  g.circle(hx, hy, 10 * s).fill(C(0x8a6e58)).stroke(ink(4));
  g.moveTo(hx + face * 2 * s, hy + 4 * s).quadraticCurveTo(hx + face * 9 * s, hy + 2 * s, hx + face * 12 * s, hy - 1 * s).stroke({ width: 3, color: 0x2a1a10 });
  g.moveTo(hx + face * 2 * s, hy + 4 * s).quadraticCurveTo(hx - face * 4 * s, hy + 3 * s, hx - face * 6 * s, hy - 1 * s).stroke({ width: 3, color: 0x2a1a10 });
  g.rect(hx + face * 3 * s - 2 * s, hy + 6 * s, 4 * s, 5 * s).fill(0x2a1a10);
  if (b.step === "volley" || b.step === "summon") g.ellipse(hx + face * 5 * s, hy + 6 * s, 3 * s, 2.4 * s).fill(INK); // shouting
  g.poly([hx - 21 * s, hy - 4 * s, hx - 13 * s, hy - 11 * s, hx + 13 * s, hy - 11 * s, hx + 21 * s, hy - 4 * s, hx + 12 * s, hy - 8 * s, hx - 12 * s, hy - 8 * s]).fill(steel).stroke(ink(4));
  g.moveTo(hx - 11 * s, hy - 10 * s).quadraticCurveTo(hx, hy - 34 * s, hx + 11 * s, hy - 10 * s).fill(steel).stroke(ink(4));
  const pl = Math.sin(w.time * 4 + sw) * 3 * s;
  g.moveTo(hx - face * 4 * s, hy - 26 * s).quadraticCurveTo(hx - face * 26 * s, hy - 52 * s + pl, hx - face * 44 * s, hy - 30 * s + pl).quadraticCurveTo(hx - face * 24 * s, hy - 38 * s, hx - face * 4 * s, hy - 20 * s).fill(C(0x9e1f14)).stroke(ink(3));
  g.moveTo(hx - face * 2 * s, hy - 28 * s).quadraticCurveTo(hx - face * 18 * s, hy - 58 * s + pl, hx - face * 34 * s, hy - 46 * s + pl).quadraticCurveTo(hx - face * 18 * s, hy - 46 * s, hx - face * 2 * s, hy - 24 * s).fill(C(0xe8e0d0)).stroke(ink(3));

  // --- arms and the partisan
  const sh1 = vec(x + face * 20 * s, y - 63 * s);
  const sh2 = vec(x - face * 20 * s, y - 63 * s);
  const sleeve = (sh: Vec) => g.ellipse(sh.x, sh.y + 6 * s, 8 * s, 9 * s).fill(red).stroke(ink(3));
  if (b.step === "pistols") {
    const aim = norm(sub(w.player.pos, e.pos));
    const a = angleOf(aim);
    const h1 = vec(sh1.x + aim.x * 30 * s, sh1.y + 10 * s + aim.y * 24 * s);
    const h2 = vec(sh2.x + aim.x * 34 * s, sh2.y + 14 * s + aim.y * 26 * s);
    arm(g, vec(sh2.x, sh2.y), vec(h2.x, h2.y), 5 * s, 8 * s, red, x);
    drawWeaponShape(g, "pistol", h2.x, h2.y, a + 0.12, s);
    arm(g, vec(sh1.x, sh1.y), vec(h1.x, h1.y), 5 * s, 8 * s, red, x);
    drawWeaponShape(g, "pistol", h1.x, h1.y, a - 0.06, s);
    if (b.n >= 1) gl.circle(h1.x + aim.x * 26 * s, h1.y + aim.y * 26 * s, 5).fill({ color: PAL.emberHot, alpha: 0.8 });
  } else {
    let base: Vec;
    let tip: Vec;
    let hand: Vec;
    if (b.step === "lunge") {
      hand = vec(x + dir.x * 12 * s, y - 50 * s + dir.y * 8 * s);
      tip = add(hand, scale(dir, 120 * s));
      base = sub(hand, scale(dir, 50 * s));
    } else if (b.step === "volley") {
      hand = vec(x + face * 22 * s, y - 70 * s);
      tip = vec(x + face * 70 * s, y - 160 * s);
      base = vec(x - face * 4 * s, y - 24 * s);
    } else if (b.step === "summon") {
      hand = vec(x + face * 22 * s, y - 92 * s);
      tip = vec(x + face * 26 * s, y - 190 * s);
      base = vec(x + face * 22 * s, y - 40 * s);
    } else {
      hand = vec(x + face * 24 * s, y - 56 * s);
      tip = vec(x + face * 27 * s, y - 150 * s);
      base = vec(x + face * 23 * s, y + 2 * s);
    }
    const pd = norm(sub(tip, base));
    limb(g, base.x, base.y, tip.x, tip.y, 4 * s, C(PAL.wood));
    // the partisan's head: a broad spear blade with two flukes and a red tassel
    const pp = vec(-pd.y, pd.x);
    const T = (a: number, c: number) => [tip.x + pd.x * a * s + pp.x * c * s, tip.y + pd.y * a * s + pp.y * c * s];
    g.poly([...T(0, -5), ...T(-6, -14), ...T(4, -6), ...T(34, 0), ...T(4, 6), ...T(-6, 14), ...T(0, 5)]).fill(C(0xc8c6be)).stroke(ink(4));
    g.circle(tip.x - pd.x * 6 * s, tip.y - pd.y * 6 * s, 4 * s).fill(C(0x9e1f14)).stroke(ink(2));
    sleeve(sh2);
    if (b.step === "relight") {
      // a torch held high: his men relight the braziers
      const tx = x - face * 30 * s;
      const ty = y - 110 * s;
      arm(g, vec(sh2.x, sh2.y), vec(tx, ty + 14 * s), 5 * s, 8 * s, red, x);
      limb(g, tx, ty + 22 * s, tx, ty - 10 * s, 4 * s, C(PAL.wood));
      tongue(gl, tx, ty - 8 * s, 10 * s, 24 * s, Math.sin(w.time * 12) * 3, PAL.emberHot, 0.95);
    } else {
      arm(g, vec(sh2.x, sh2.y), vec(x - face * 12 * s, y - 44 * s), 5 * s, 8 * s, red, x); // hand on the hip
    }
    sleeve(sh1);
    arm(g, vec(sh1.x, sh1.y), vec(hand.x, hand.y), 5 * s, 8 * s, red, x);
    g.circle(hand.x, hand.y, 4.5 * s).fill(C(0x2a1e16)).stroke(ink(2));
  }
}

// ------------------------------------------------------------------ the Powder Master
function powdermaster(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.4;
  const { x } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const spinning = b.step === "spiral" && b.t < 3;
  const look = lookDir(e, w, false);
  let face = look.x >= 0 ? 1 : -1;
  if (spinning) face = Math.sin(w.time * 18) >= 0 ? 1 : -1;
  const crouch = b.step === "fuse" && b.t < 0.8 ? 8 * s : 0;
  const y = e.pos.y + crouch;
  const sw = gait(b, s);
  const throwing = (b.step === "bombs" && b.n < 4) || (b.step === "keg" && b.t < 1.2) || (b.step === "oil" && b.n === 0);

  // --- telegraphs
  marker(gl, e, b, 0xa8823e);
  if (b.step === "spiral") {
    for (let i = 0; i < 3; i++) {
      const a = w.time * 9 + (i * TAU) / 3;
      arcLine(gl, x, e.pos.y - 40 * s, a, a + 1.2, 70 * s, 4, PAL.ember, 0.5);
    }
  }
  if (b.step === "blink" && b.t < 0.5) gl.circle(x, e.pos.y - 40, 90 * (1 - b.t * 2) + 20).fill({ color: 0x8a8278, alpha: 0.35 * (1 - b.t * 2) });

  // --- the powder keg on his back
  const kx = x - face * 16 * s;
  const ky = y - 72 * s;
  g.roundRect(kx - 17 * s, ky - 22 * s, 34 * s, 44 * s, 8 * s).fill(C(0x7a5a38)).stroke(ink(5));
  for (const dy of [-14, 0, 14]) g.moveTo(kx - 17 * s, ky + dy * s).lineTo(kx + 17 * s, ky + dy * s).stroke({ width: 3, color: C(PAL.iron) });
  g.moveTo(kx, ky - 22 * s).quadraticCurveTo(kx + face * 8 * s, ky - 34 * s, kx + face * 2 * s, ky - 40 * s).stroke({ width: 2.5, color: 0x2a2018 });
  gl.circle(kx + face * 2 * s, ky - 40 * s, 3 + Math.random() * 2).fill(PAL.emberHot);
  if (b.phase >= 2) {
    // his own powder caught fire
    for (let i = 0; i < 3; i++) tongue(gl, kx - 10 * s + i * 10 * s, ky - 20 * s, 9 * s, (18 + 6 * Math.sin(w.time * 12 + i * 2)) * s, Math.sin(w.time * 6 + i) * 3, i % 2 ? PAL.emberHot : PAL.ember, 0.9);
    gl.circle(kx, ky - 26 * s, 26 * s).fill({ color: PAL.ember, alpha: 0.15 });
  }
  if (spinning) gl.circle(kx, ky, 30 * s).fill({ color: PAL.ember, alpha: 0.25 });

  // --- short legs
  for (const side of [-1, 1]) {
    const k = sw * side * 6 * s;
    limb(g, x + side * 10 * s, y - 28 * s, x + side * 12 * s + k, y - 4 * s, 12 * s, C(0x3a3028));
    g.ellipse(x + side * 12 * s + k + face * 3 * s, y - 2 * s, 9 * s, 5 * s).fill(C(0x1a1412)).stroke(ink(3));
  }
  // --- belly, apron and bandolier of bombs
  g.ellipse(x, y - 46 * s, 27 * s, 25 * s).fill(C(0x6a5a48)).stroke(ink(5));
  g.poly([x - 22 * s, y - 58 * s, x + 22 * s, y - 58 * s, x + 25 * s, y - 14 * s, x - 25 * s, y - 14 * s]).fill(C(0x4a3420)).stroke(ink(4));
  if (!fl) {
    for (const [dx, dy, r] of [[-10, -40, 4], [8, -28, 3], [-4, -22, 2.5], [14, -48, 3]] as const) g.circle(x + dx * s, y + dy * s, r * s).fill(0x1e140c);
  }
  g.poly([x - face * 20 * s, y - 66 * s, x - face * 12 * s, y - 68 * s, x + face * 22 * s, y - 34 * s, x + face * 16 * s, y - 30 * s]).fill(C(0x2a2018)).stroke(ink(2));
  for (let i = 0; i < 4; i++) {
    const bx = x + face * (-12 + i * 9) * s;
    const by = y - (60 - i * 8) * s;
    g.circle(bx, by, 5 * s).fill(C(0x2a2620)).stroke(ink(2));
    g.rect(bx - 1 * s, by - 8 * s, 2 * s, 3 * s).fill(0x8a7a5a);
  }
  // --- head: leather cap, goggles, respirator snout
  const hx = x + face * 3 * s;
  const hy = y - 80 * s;
  g.circle(hx, hy, 12 * s).fill(C(0x3a2a1a)).stroke(ink(4));
  g.ellipse(hx - face * 1 * s, hy - 9 * s, 14 * s, 6 * s).fill(C(0x2a2018)).stroke(ink(3));
  for (const dx of [2, 10]) {
    g.circle(hx + face * (dx - 4) * s, hy - 1 * s, 5 * s).fill(C(0xa8823e)).stroke(ink(2));
    g.circle(hx + face * (dx - 4) * s, hy - 1 * s, 3.2 * s).fill(fl ? 0xffffff : 0x2a4a30);
    gl.circle(hx + face * (dx - 4) * s, hy - 1 * s, 2 * s).fill({ color: 0x9ad8a0, alpha: 0.85 });
  }
  g.ellipse(hx + face * 8 * s, hy + 8 * s, 6 * s, 5 * s).fill(C(0x5a4a38)).stroke(ink(3));
  g.circle(hx + face * 10 * s, hy + 9 * s, 2 * s).fill(INK);

  // --- arms: a lit bomb in one hand, the linstock in the other
  const sh1 = vec(x + face * 22 * s, y - 62 * s);
  const sh2 = vec(x - face * 22 * s, y - 62 * s);
  const linTop = b.step === "fuse" && b.t < 0.8 ? vec(x + e.dir.x * 70 * s, y - 6 * s + e.dir.y * 30 * s) : vec(x - face * 30 * s, y - 104 * s);
  const linHand = b.step === "fuse" && b.t < 0.8 ? vec(x + e.dir.x * 26 * s, y - 40 * s) : vec(x - face * 26 * s, y - 50 * s);
  arm(g, vec(sh2.x, sh2.y), vec(linHand.x, linHand.y), 6 * s, 11 * s, C(0x6a5a48), x);
  const ld = norm(sub(linTop, linHand));
  limb(g, linHand.x - ld.x * 20 * s, linHand.y - ld.y * 20 * s, linTop.x, linTop.y, 3 * s, C(PAL.wood));
  gl.circle(linTop.x, linTop.y, 4 + Math.random() * 2).fill(PAL.emberHot);
  gl.circle(linTop.x, linTop.y, 12).fill({ color: PAL.ember, alpha: 0.2 });
  let bomb: Vec;
  if (throwing) {
    const k = b.step === "keg" ? clamp01(b.t / 0.4) : (b.t * 6) % 1;
    bomb = vec(x + face * (10 + 16 * k) * s, y - (110 - 20 * k) * s);
  } else {
    bomb = vec(x + face * 28 * s, y - 44 * s);
  }
  arm(g, vec(sh1.x, sh1.y), vec(bomb.x, bomb.y + 6 * s), 6 * s, 11 * s, C(0x6a5a48), x);
  if (b.step === "keg" && b.t < 1.2) {
    g.roundRect(bomb.x - 14 * s, bomb.y - 18 * s, 28 * s, 34 * s, 6 * s).fill(C(0x7a5a38)).stroke(ink(4));
    g.moveTo(bomb.x - 14 * s, bomb.y - 4 * s).lineTo(bomb.x + 14 * s, bomb.y - 4 * s).stroke({ width: 3, color: PAL.iron });
  } else if (b.step === "oil" && b.n === 0) {
    g.circle(bomb.x, bomb.y - 4 * s, 7 * s).fill(C(0x5a8a3a)).stroke(ink(3));
  } else {
    g.circle(bomb.x, bomb.y - 4 * s, 9 * s).fill(C(0x2a2620)).stroke(ink(3));
    gl.circle(bomb.x + 4 * s, bomb.y - 14 * s, 3 + Math.random() * 2).fill(PAL.emberHot);
  }
}

// ------------------------------------------------------------------ the Bishop of the Procession
/** Golden lines to every light he is about to bless back on. */
function consecrateTelegraph(gl: G, e: Unit, w: World, b: BossState, fromY: number): void {
  if (b.step !== "consecrate" || b.n !== 1) return;
  const k = clamp01(b.t / (1.4 / haste(b)));
  const kinds: Light["kind"][] = ["candelabra", "candle", "chandelier", "brazier"];
  const targets = w.lights.filter((l) => kinds.includes(l.kind) && !l.on && !l.fallen && l.falling === undefined && dist(l.pos, e.pos) < 900);
  targets.sort((a, z) => dist(a.pos, e.pos) - dist(z.pos, e.pos));
  for (const l of targets.slice(0, 6)) {
    const to = vec(l.pos.x, l.pos.y - 40);
    const mid = vec(e.pos.x + (to.x - e.pos.x) * k, fromY + (to.y - fromY) * k);
    gl.moveTo(e.pos.x, fromY).lineTo(mid.x, mid.y).stroke({ width: 3, color: PAL.holy, alpha: 0.5 });
    gl.circle(to.x, to.y, 10 + 10 * k).stroke({ width: 2, color: PAL.holy, alpha: 0.3 + 0.5 * k });
  }
  gl.circle(e.pos.x, e.pos.y, 80 + 60 * k).stroke({ width: 3, color: PAL.holy, alpha: 0.25 + 0.4 * k });
}

function mitre(g: G, hx: number, hy: number, s: number, C: (c: number) => number): void {
  g.poly([hx - 11 * s, hy - 6 * s, hx - 10 * s, hy - 30 * s, hx, hy - 44 * s, hx + 10 * s, hy - 30 * s, hx + 11 * s, hy - 6 * s]).fill(C(0xe8e0d0)).stroke(ink(3));
  g.rect(hx - 1.5 * s, hy - 40 * s, 3 * s, 34 * s).fill(C(GOLD));
  g.rect(hx - 11 * s, hy - 10 * s, 22 * s, 4 * s).fill(C(GOLD));
  g.circle(hx, hy - 24 * s, 2.5 * s).fill(C(0x9e1f14));
}

function crozier(g: G, gl: G, bx: number, by: number, tx: number, ty: number, s: number, C: (c: number) => number, glowing: boolean): void {
  limb(g, bx, by, tx, ty, 3.5 * s, C(GOLD));
  g.moveTo(tx, ty).quadraticCurveTo(tx + 2 * s, ty - 18 * s, tx + 12 * s, ty - 16 * s).quadraticCurveTo(tx + 20 * s, ty - 12 * s, tx + 12 * s, ty - 4 * s).stroke({ width: 4 * s, color: C(GOLD), cap: "round" });
  if (glowing) gl.circle(tx + 6 * s, ty - 10 * s, 18 * s).fill({ color: PAL.holy, alpha: 0.35 });
}

function bearer(g: G, x: number, y: number, s: number, step: number, C: (c: number) => number): void {
  const bob = Math.sin(step) * 2 * s;
  g.ellipse(x, y + 2, 14 * s, 5 * s).fill({ color: INK, alpha: 0.5 });
  g.poly([x - 9 * s, y - 40 * s + bob, x + 9 * s, y - 40 * s + bob, x + 13 * s, y, x - 13 * s, y]).fill(C(0xb8ac98)).stroke(ink(3));
  g.circle(x, y - 46 * s + bob, 7 * s).fill(C(0x8a6e58)).stroke(ink(3));
  g.ellipse(x, y - 50 * s + bob, 7 * s, 3.5 * s).fill({ color: 0x2a1e14, alpha: 0.8 });
}

function bishopLitter(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.6;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const walk = (b.mem.walk ?? 0) / 16;
  const bob = (b.mem.speed ?? 0) > 15 ? Math.abs(Math.sin(walk)) * 3 : 0;
  const top = y - 64 * s - bob; // the platform
  const blessing = b.step === "cross" || b.step === "rosette" || b.step === "censers" || b.step === "summon";

  marker(gl, e, b, PAL.holy);
  consecrateTelegraph(gl, e, w, b, top - 60 * s);

  // the far bearers, then the poles and the platform
  bearer(g, x - 58 * s, y - 26 * s, s * 0.95, walk, C);
  bearer(g, x + 58 * s, y - 26 * s, s * 0.95, walk + Math.PI, C);
  for (const dy of [-8, 4]) limb(g, x - 96 * s, top + dy * s, x + 96 * s, top + dy * s, 4 * s, C(PAL.wood));
  g.rect(x - 58 * s, top - 10 * s, 116 * s, 22 * s).fill(C(0x6a4a2a)).stroke(ink(5));
  g.rect(x - 58 * s, top - 10 * s, 116 * s, 5 * s).fill(C(GOLD));
  for (const dx of [-40, 0, 40]) g.circle(x + dx * s, top + 2 * s, 4 * s).fill(C(GOLD)).stroke(ink(2));
  // the throne back
  g.poly([x - 24 * s, top - 10 * s, x - 24 * s, top - 74 * s, x, top - 86 * s, x + 24 * s, top - 74 * s, x + 24 * s, top - 10 * s]).fill(C(0x7a1a14)).stroke(ink(4));
  g.poly([x - 18 * s, top - 14 * s, x - 18 * s, top - 70 * s, x, top - 80 * s, x + 18 * s, top - 70 * s, x + 18 * s, top - 14 * s]).stroke({ width: 3, color: C(GOLD) });
  // the bishop, seated
  g.poly([x - 18 * s, top - 62 * s, x + 18 * s, top - 62 * s, x + 26 * s, top - 10 * s, x - 26 * s, top - 10 * s]).fill(C(0xe8e0d0)).stroke(ink(4));
  g.poly([x - 3 * s, top - 62 * s, x + 3 * s, top - 62 * s, x + 3 * s, top - 10 * s, x - 3 * s, top - 10 * s]).fill(C(GOLD));
  g.poly([x - 16 * s, top - 60 * s, x, top - 44 * s, x + 16 * s, top - 60 * s]).stroke({ width: 5, color: C(GOLD) });
  const hx = x + face * 2 * s;
  const hy = top - 72 * s;
  g.circle(hx, hy, 10 * s).fill(C(0x8a6e58)).stroke(ink(4));
  g.poly([hx - 7 * s, hy + 4 * s, hx + 7 * s, hy + 4 * s, hx, hy + 16 * s]).fill(C(0xd8d0c0)).stroke(ink(2)); // white beard
  mitre(g, hx, hy - 4 * s, s, C);
  // crozier in one hand, the other raised in blessing while he casts
  const cx = x + face * 30 * s;
  crozier(g, gl, cx, top - 6 * s, cx, top - 120 * s, s, C, b.step === "consecrate");
  arm(g, vec(x + face * 14 * s, top - 56 * s), vec(cx, top - 50 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
  if (blessing) {
    arm(g, vec(x - face * 14 * s, top - 56 * s), vec(x - face * 24 * s, top - 88 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
    g.circle(x - face * 24 * s, top - 92 * s, 4 * s).fill(C(0x9e1f14)).stroke(ink(2));
    gl.circle(x - face * 24 * s, top - 96 * s, 14 * s).fill({ color: PAL.holy, alpha: 0.4 });
  } else {
    arm(g, vec(x - face * 14 * s, top - 56 * s), vec(x - face * 16 * s, top - 30 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
  }
  // the canopy on gilded posts
  const roof = top - 132 * s;
  for (const dx of [-52, 52]) limb(g, x + dx * s, top - 8 * s, x + dx * s, roof + 6 * s, 3 * s, C(GOLD));
  g.poly([x - 66 * s, roof + 8 * s, x - 52 * s, roof - 16 * s, x + 52 * s, roof - 16 * s, x + 66 * s, roof + 8 * s]).fill(C(0x8a1a14)).stroke(ink(4));
  for (let i = 0; i < 9; i++) {
    const fx = x - 62 * s + i * 15.5 * s;
    g.moveTo(fx, roof + 8 * s).quadraticCurveTo(fx + 7 * s, roof + 18 * s, fx + 14 * s, roof + 8 * s).stroke({ width: 3, color: C(GOLD) });
  }
  g.poly([x - 6 * s, roof - 16 * s, x, roof - 32 * s, x + 6 * s, roof - 16 * s]).fill(C(GOLD)).stroke(ink(2));
  // the near bearers
  bearer(g, x - 66 * s, y + 4 * s, s, walk + Math.PI, C);
  bearer(g, x + 66 * s, y + 4 * s, s, walk, C);
  gl.circle(x, top - 70 * s, 70 * s).fill({ color: PAL.holy, alpha: 0.05 });
}

function bishopWalking(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.6;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const blessing = b.step === "cross" || b.step === "rosette" || b.step === "censers" || b.step === "rain" || b.step === "summon";

  marker(gl, e, b, PAL.holy);
  consecrateTelegraph(gl, e, w, b, y - 120 * s);

  // the red cope behind, torn at the hem
  g.poly([x - 20 * s, y - 68 * s, x + 20 * s, y - 68 * s, x + 30 * s + sw * 3 * s, y - 2 * s, x + 14 * s, y - 8 * s, x, y - 2 * s, x - 14 * s, y - 8 * s, x - 30 * s - sw * 3 * s, y - 2 * s]).fill(C(0x7a1a14)).stroke(ink(4));
  // the white alb and the chasuble with its gold Y
  g.poly([x - 16 * s, y - 68 * s, x + 16 * s, y - 68 * s, x + 22 * s, y - 4 * s, x - 22 * s, y - 4 * s]).fill(C(0xe8e0d0)).stroke(ink(4));
  g.poly([x + face * 1 * s, y - 68 * s, x + face * 16 * s, y - 68 * s, x + face * 22 * s, y - 4 * s, x + face * 1 * s, y - 4 * s]).fill({ color: C(0xa8a090), alpha: 0.6 });
  g.rect(x - 2.5 * s, y - 56 * s, 5 * s, 52 * s).fill(C(GOLD));
  g.poly([x - 14 * s, y - 66 * s, x, y - 52 * s, x + 14 * s, y - 66 * s]).stroke({ width: 5, color: C(GOLD) });
  if (!fl) {
    g.ellipse(x - 8 * s, y - 30 * s, 5 * s, 7 * s).fill({ color: PAL.blood, alpha: 0.8 }); // he fell off his litter
  }
  const hx = x + face * 2 * s;
  const hy = y - 78 * s;
  g.circle(hx, hy, 10 * s).fill(C(0x8a6e58)).stroke(ink(4));
  g.poly([hx - 7 * s, hy + 4 * s, hx + 7 * s, hy + 4 * s, hx, hy + 16 * s]).fill(C(0xd8d0c0)).stroke(ink(2));
  mitre(g, hx, hy - 4 * s, s, C);
  const cx = x + face * 26 * s;
  crozier(g, gl, cx, y, cx, y - 124 * s, s, C, b.step === "consecrate");
  arm(g, vec(x + face * 14 * s, y - 62 * s), vec(cx, y - 56 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
  if (blessing) {
    arm(g, vec(x - face * 14 * s, y - 62 * s), vec(x - face * 26 * s, y - 96 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
    g.circle(x - face * 26 * s, y - 100 * s, 4 * s).fill(C(0x9e1f14)).stroke(ink(2));
    gl.circle(x - face * 26 * s, y - 104 * s, 16 * s).fill({ color: PAL.holy, alpha: 0.4 });
  } else {
    arm(g, vec(x - face * 14 * s, y - 62 * s), vec(x - face * 18 * s, y - 34 * s), 4 * s, 7 * s, C(0xe8e0d0), x);
  }
}

// ------------------------------------------------------------------ the Grand Inquisitor
function inquisitor(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.45;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const lantern = vec(x - face * 24 * s, y - 158 * s);

  // --- telegraphs
  marker(gl, e, b, 0x9e1f14);
  if (b.step === "bursts" && b.n >= 1 && b.n <= 2) {
    const next = 0.4 / h + (b.n - 1) * 0.5;
    if (b.t < next) {
      const aim = norm(sub(w.player.pos, e.pos));
      const k = clamp01(1 - (next - b.t) / 0.4);
      for (let i = 0; i < 4; i++) {
        const d = fromAngle(angleOf(aim) + (i / 3 - 0.5) * 0.6);
        gl.moveTo(x + d.x * 40, y - 40 + d.y * 40).lineTo(x + d.x * 600, y - 40 + d.y * 600).stroke({ width: 2, color: PAL.holy, alpha: 0.15 + 0.35 * k });
      }
    }
  } else if (b.step === "beam" && b.mem.beamSign !== undefined) {
    const sign = b.mem.beamSign;
    const wind = 0.5;
    if (b.t < wind) {
      // the arc the lantern is about to sweep
      const k = clamp01(b.t / wind);
      const a0 = b.angle;
      const a1 = b.angle + BEAM_SWEEP * sign;
      sector(gl, x, y, (a0 + a1) / 2, BEAM_SWEEP / 2, 1100, PAL.holy, 0.04 + 0.05 * k);
      const d = fromAngle(a0);
      gl.moveTo(x, y).lineTo(x + d.x * 1100, y + d.y * 1100).stroke({ width: 4, color: PAL.holy, alpha: 0.4 + 0.4 * k });
    } else if (b.t < wind + BEAM_TIME) {
      const a = b.angle + BEAM_SWEEP * sign * ((b.t - wind) / BEAM_TIME);
      const d = fromAngle(a);
      gl.moveTo(lantern.x, lantern.y).lineTo(x + d.x * 1400, y + d.y * 1400).stroke({ width: 28, color: PAL.holy, alpha: 0.16 });
      gl.moveTo(lantern.x, lantern.y).lineTo(x + d.x * 1400, y + d.y * 1400).stroke({ width: 6, color: 0xfffaf0, alpha: 0.5 });
    }
  } else if (b.step === "hook" && b.n === 1) {
    const aim = norm(sub(w.player.pos, e.pos));
    const k = clamp01(b.t / (0.5 / h));
    for (let i = 0; i < 14; i++) {
      const a0 = 40 + i * 50;
      gl.moveTo(x + aim.x * a0, y - 30 + aim.y * a0).lineTo(x + aim.x * (a0 + 28), y - 30 + aim.y * (a0 + 28)).stroke({ width: 3, color: RED, alpha: 0.25 + 0.5 * k });
    }
  }
  // the chain to a flying hook
  const hook = w.bullets.find((bl) => bl.pullTo && dist(bl.pullTo, e.pos) < 400);
  const hand1 = vec(x + face * 22 * s, y - 50 * s);
  if (hook) {
    const d = sub(hook.pos, hand1);
    const L = Math.hypot(d.x, d.y);
    for (let i = 0; i < L; i += 16) {
      const q = add(hand1, scale(d, i / L));
      g.circle(q.x, q.y, 3.5).stroke({ width: 2.5, color: PAL.iron });
    }
  }
  if (b.step === "blink" && b.t < 0.4) gl.circle(x, y - 60, 120 * (1 - b.t / 0.4) + 30).fill({ color: PAL.holy, alpha: 0.4 * (1 - b.t / 0.4) });

  // --- the lantern staff (behind)
  limb(g, x - face * 22 * s, y + 2 * s, lantern.x, lantern.y + 14 * s, 3.5 * s, C(0x1a1410));
  // --- the crimson robe and the black mozzetta
  g.poly([x - 16 * s, y - 68 * s, x + 16 * s, y - 68 * s, x + 25 * s + sw * 2 * s, y - 2 * s, x - 25 * s - sw * 2 * s, y - 2 * s]).fill(C(0x7a1010)).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 68 * s, x + face * 16 * s, y - 68 * s, x + face * 25 * s, y - 2 * s, x + face * 1 * s, y - 2 * s]).fill({ color: C(0x400808), alpha: 0.7 });
  // the white lace rochet over the cassock
  g.poly([x - 17 * s, y - 52 * s, x + 17 * s, y - 52 * s, x + 23 * s, y - 22 * s, x - 23 * s, y - 22 * s]).fill(C(0xe8e0d0)).stroke(ink(3));
  for (let i = 0; i < 6; i++) {
    const lx = x - 23 * s + i * 7.7 * s;
    g.moveTo(lx, y - 22 * s).quadraticCurveTo(lx + 3.8 * s, y - 16 * s, lx + 7.7 * s, y - 22 * s).fill(C(0xe8e0d0)).stroke({ width: 2, color: INK });
  }
  g.poly([x + face * 1 * s, y - 52 * s, x + face * 17 * s, y - 52 * s, x + face * 23 * s, y - 22 * s, x + face * 1 * s, y - 22 * s]).fill({ color: C(0xa8a090), alpha: 0.5 });
  g.poly([x - 22 * s, y - 66 * s, x + 22 * s, y - 66 * s, x + 20 * s, y - 50 * s, x - 20 * s, y - 50 * s]).fill(C(0x1a1010)).stroke(ink(4));
  g.moveTo(x - 20 * s, y - 50 * s).lineTo(x + 20 * s, y - 50 * s).stroke({ width: 2.5, color: C(GOLD) });
  // the pectoral flame cross
  g.rect(x - 2 * s, y - 48 * s, 4 * s, 16 * s).fill(C(GOLD)).stroke(ink(2));
  g.rect(x - 7 * s, y - 43 * s, 14 * s, 4 * s).fill(C(GOLD)).stroke(ink(2));
  gl.poly([x - 3 * s, y - 48 * s, x, y - 56 * s - Math.sin(w.time * 10) * 1.5, x + 3 * s, y - 48 * s]).fill(PAL.emberHot);
  // --- the gaunt face and the galero
  const hx = x + face * 2 * s;
  const hy = y - 78 * s;
  g.ellipse(hx, hy, 8.5 * s, 10.5 * s).fill(C(0xb8a890)).stroke(ink(4));
  g.ellipse(hx + face * 3 * s, hy - 1 * s, 2.6 * s, 2 * s).fill(INK);
  g.ellipse(hx - face * 3 * s, hy - 1 * s, 2.4 * s, 2 * s).fill(INK);
  gl.circle(hx + face * 3 * s, hy - 1 * s, 1.2 * s).fill(0xfffaf0);
  gl.circle(hx - face * 3 * s, hy - 1 * s, 1.1 * s).fill(0xfffaf0);
  g.moveTo(hx - 3 * s, hy + 6 * s).lineTo(hx + 3 * s, hy + 6 * s).stroke({ width: 2, color: INK });
  g.ellipse(hx, hy - 10 * s, 30 * s, 7 * s).fill(C(0x8a1410)).stroke(ink(4));
  g.ellipse(hx, hy - 14 * s, 12 * s, 7 * s).fill(C(0x8a1410)).stroke(ink(3));
  for (const side of [-1, 1]) {
    const tx = hx + side * 26 * s;
    g.moveTo(tx, hy - 8 * s).quadraticCurveTo(tx + side * 6 * s, hy + 10 * s, tx + side * 2 * s, hy + 26 * s).stroke({ width: 2, color: C(0x9e1f14) });
    g.poly([tx + side * 2 * s - 4 * s, hy + 26 * s, tx + side * 2 * s + 4 * s, hy + 26 * s, tx + side * 2 * s + 5 * s, hy + 36 * s, tx + side * 2 * s - 5 * s, hy + 36 * s]).fill(C(0x9e1f14)).stroke(ink(2));
  }
  // --- the lantern: a brass cage of holy light
  const lit = !(b.step === "beam" && b.t >= 0.5 && b.t < 0.5 + BEAM_TIME);
  g.rect(lantern.x - 10 * s, lantern.y - 14 * s, 20 * s, 26 * s).fill(C(0x2a2010)).stroke(ink(3));
  for (const dx of [-10, 0, 10]) g.moveTo(lantern.x + dx * s, lantern.y - 14 * s).lineTo(lantern.x + dx * s, lantern.y + 12 * s).stroke({ width: 2.5, color: C(0xa8823e) });
  g.poly([lantern.x - 12 * s, lantern.y - 14 * s, lantern.x, lantern.y - 24 * s, lantern.x + 12 * s, lantern.y - 14 * s]).fill(C(0xa8823e)).stroke(ink(2));
  gl.circle(lantern.x, lantern.y, (lit ? 7 : 11) * s).fill(0xfff8e8);
  gl.circle(lantern.x, lantern.y, (lit ? 26 : 40) * s).fill({ color: PAL.holy, alpha: lit ? 0.18 : 0.35 });
  arm(g, vec(x - face * 20 * s, y - 62 * s), vec(x - face * 22 * s, y - 64 * s - (b.step === "beam" || b.step === "penitents" ? 30 : 0) * s), 4 * s, 7 * s, C(0x7a1010), x);
  // --- the hook on its chain in the other hand
  if (!hook) {
    const hk = b.step === "hook" && b.n === 1 ? vec(x + face * 30 * s, y - 92 * s) : vec(x + face * 24 * s, y - 18 * s);
    arm(g, vec(x + face * 18 * s, y - 62 * s), vec(hand1.x, hand1.y), 4 * s, 7 * s, C(0x7a1010), x);
    for (let i = 0; i <= 4; i++) {
      const q = vec(hand1.x + (hk.x - hand1.x) * (i / 4), hand1.y + (hk.y - hand1.y) * (i / 4));
      g.circle(q.x, q.y, 3 * s).stroke({ width: 2, color: C(PAL.iron) });
    }
    g.moveTo(hk.x, hk.y).quadraticCurveTo(hk.x + face * 12 * s, hk.y + 14 * s, hk.x, hk.y + 18 * s).stroke({ width: 4 * s, color: C(0x8c8a82), cap: "round" });
  } else {
    arm(g, vec(x + face * 18 * s, y - 62 * s), vec(hand1.x, hand1.y), 4 * s, 7 * s, C(0x7a1010), x);
  }
}

// ------------------------------------------------------------------ the Holy Flame
function flame(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const { x, y } = e.pos;
  const r = e.radius * 1.25;
  const t = w.time;
  const fl = e.flash > 0;
  const shield = b.mem.shield === 1;
  const vigor = shield ? 1 : 0.82;
  const cy = y - r * 1.25; // the heart of the fire
  const p3 = b.phase >= 3;

  // scorched floor under it
  g.ellipse(x, y + 10, r * 1.5, r * 0.45).fill({ color: 0x1a0c06, alpha: 0.8 });
  marker(gl, e, b, PAL.emberHot);

  // the braziers feed it: streams of fire from each one that burns
  for (const l of w.lights) {
    if (l.kind !== "brazier" || !l.on) continue;
    const from = vec(l.pos.x, l.pos.y - 40);
    gl.moveTo(from.x, from.y).lineTo(x, cy).stroke({ width: shield ? 4 : 2, color: PAL.holy, alpha: shield ? 0.3 : 0.12 });
    const k = (t * 0.7 + l.id * 0.37) % 1;
    gl.circle(from.x + (x - from.x) * k, from.y + (cy - from.y) * k, 6).fill({ color: 0xfff0c0, alpha: 0.8 });
  }
  // a tongue of fire reaching for a brazier to relight it
  if ((b.mem.tongueT ?? 0) > 0) {
    const l = w.lights.find((q) => q.id === b.mem.tongue);
    if (l) {
      const k = clamp01(1 - (b.mem.tongueT ?? 0) / 1.2);
      const to = vec(l.pos.x, l.pos.y - 34);
      const ctrl = vec((x + to.x) / 2, Math.min(cy, to.y) - 220);
      gl.moveTo(x, cy);
      const n = Math.max(2, Math.round(20 * k));
      let tip = vec(x, cy);
      for (let i = 1; i <= n; i++) {
        const u = (i / n) * k;
        const a = (1 - u) * (1 - u);
        const bq = 2 * (1 - u) * u;
        const c = u * u;
        tip = vec(a * x + bq * ctrl.x + c * to.x, a * cy + bq * ctrl.y + c * to.y);
        gl.lineTo(tip.x, tip.y);
      }
      gl.stroke({ width: 12, color: PAL.ember, alpha: 0.8, cap: "round" });
      gl.circle(tip.x, tip.y, 16).fill({ color: PAL.emberHot, alpha: 0.9 });
      progressRing(gl, to.x, to.y - 30, 22, k, PAL.ember);
    }
  }
  // the shield of its braziers
  if (shield) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    gl.circle(x, cy, r * 1.9).fill({ color: PAL.holy, alpha: 0.05 + 0.03 * pulse });
    gl.circle(x, cy, r * 1.9).stroke({ width: 3, color: PAL.holy, alpha: 0.35 + 0.2 * pulse });
    for (let i = 0; i < 8; i++) {
      const a = t * 0.5 + (i * TAU) / 8;
      const px = x + Math.cos(a) * r * 1.9;
      const py = cy + Math.sin(a) * r * 1.9;
      gl.moveTo(px - 6, py).lineTo(px + 6, py).stroke({ width: 3, color: PAL.holy, alpha: 0.7 });
      gl.moveTo(px, py - 8).lineTo(px, py + 6).stroke({ width: 3, color: PAL.holy, alpha: 0.7 });
    }
  }
  // the sermon gathers: rays and a ring about to burst
  if (b.step === "sermon" && b.n === 1) {
    const k = clamp01(b.t / 1.2);
    for (let i = 0; i < 16; i++) {
      const d = fromAngle((i * TAU) / 16 + t * 0.2);
      gl.moveTo(x + d.x * r, cy + d.y * r).lineTo(x + d.x * (r + 300 * k), cy + d.y * (r + 300 * k)).stroke({ width: 3, color: PAL.holy, alpha: 0.2 + 0.4 * k });
    }
    gl.circle(x, y, 90 + 140 * k).stroke({ width: 4, color: PAL.holy, alpha: 0.3 + 0.5 * k });
  }

  // six wings of fire, slowly beating
  const beat = Math.sin(t * 1.6) * 0.15;
  const outer = fl ? 0xffffff : p3 ? 0xb8200e : 0xc8321e;
  for (const side of [-1, 1]) {
    const root = vec(x + side * r * 0.25, cy - r * 0.3);
    wing(gl, root, vec(x + side * r * (1.5 + beat), cy - r * (1.9 + beat)), side * r * 0.2, r * 0.45, outer, 0.75);
    wing(gl, root, vec(x + side * r * (2.1 - beat), cy - r * (0.2 - beat)), side * -r * 0.15, r * 0.4, outer, 0.7);
    wing(gl, vec(x + side * r * 0.2, cy + r * 0.3), vec(x + side * r * (1.4 + beat), cy + r * (0.95 - beat)), side * -r * 0.1, r * 0.35, outer, 0.65);
    wing(gl, root, vec(x + side * r * (1.3 + beat), cy - r * (1.6 + beat)), side * r * 0.1, r * 0.22, PAL.ember, 0.8);
  }
  // the body: layered tongues
  const layer = (count: number, width: number, hMin: number, hMax: number, color: number, alpha: number, speed: number) => {
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0.5 : i / (count - 1);
      const bx = x + (a - 0.5) * width;
      const edge = 1 - Math.abs(a - 0.5) * 1.4;
      const hgt = (hMin + (hMax - hMin) * edge) * vigor * (1 + 0.12 * Math.sin(t * speed + i * 1.7));
      tongue(gl, bx, y, (width / count) * 1.9, hgt, Math.sin(t * speed * 0.6 + i) * r * 0.15, color, alpha);
    }
  };
  // a bed of embers where it touches the floor
  gl.ellipse(x, y, r * 1.25, r * 0.32).fill({ color: PAL.ember, alpha: 0.5 });
  gl.ellipse(x, y - 4, r * 0.9, r * 0.2).fill({ color: PAL.emberHot, alpha: 0.6 });
  layer(9, r * 2.2, r * 1.4, r * 2.9, outer, 0.85, 5);
  layer(7, r * 1.6, r * 1.2, r * 2.3, fl ? 0xffffff : PAL.ember, 0.9, 6);
  layer(5, r * 1.1, r * 1.0, r * 1.8, fl ? 0xffffff : 0xffb060, 0.95, 7);
  // the face in the white heart
  gl.ellipse(x, cy, r * 0.46, r * 0.68).fill(fl ? 0xffffff : p3 ? 0xfffaf0 : 0xfff4d8);
  const toP = norm(sub(w.player.pos, e.pos));
  const ey = cy - r * 0.12;
  if (b.phase === 1) {
    // serene, eyes closed
    for (const side of [-1, 1]) arcLine(gl, x + side * r * 0.17, ey - r * 0.04, 0.3, Math.PI - 0.3, r * 0.1, 3, 0xb87a2a, 1);
    gl.moveTo(x - r * 0.08, cy + r * 0.3).lineTo(x + r * 0.08, cy + r * 0.3).stroke({ width: 3, color: 0xb87a2a });
  } else {
    // awake: burning eyes that follow the necromancer
    for (const side of [-1, 1]) {
      const ex = x + side * r * 0.17;
      gl.ellipse(ex, ey, r * 0.11, r * 0.06).fill(0x8a2a0a);
      gl.circle(ex + toP.x * r * 0.04, ey + toP.y * r * 0.02, r * 0.035).fill(0xffffff);
    }
    if (p3) {
      // screaming
      gl.ellipse(x, cy + r * 0.3, r * 0.12, r * 0.18 + Math.sin(t * 9) * r * 0.03).fill(0x5a1004);
      gl.moveTo(x - r * 0.3, cy - r * 0.4).lineTo(x - r * 0.12, cy - r * 0.2).lineTo(x - r * 0.2, cy).stroke({ width: 2, color: 0xb8200e });
    } else {
      gl.ellipse(x, cy + r * 0.3, r * 0.1, r * 0.04).fill(0x8a2a0a);
    }
  }
  // a halo of wheels with eyes above it
  const hy = cy - r * 1.55;
  gl.ellipse(x, hy, r * 0.95, r * 0.26).stroke({ width: 5, color: GOLD, alpha: 0.85 });
  gl.ellipse(x, hy, r * 0.75, r * 0.2).stroke({ width: 2, color: GOLD, alpha: 0.6 });
  for (let i = 0; i < 7; i++) {
    const a = t * 0.8 + (i * TAU) / 7;
    const ex = x + Math.cos(a) * r * 0.95;
    const ey2 = hy + Math.sin(a) * r * 0.26;
    gl.ellipse(ex, ey2, 7, 4.5).fill(0xfff8e8).stroke({ width: 2, color: GOLD });
    gl.circle(ex, ey2, 2).fill(INK);
  }
}
