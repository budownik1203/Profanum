/**
 * The other ten bosses, drawn (their scripts are in game/bosses2.ts). Same rules as bosses.ts:
 * big shapes, thick ink, telegraphs in the glow layer, everything read from the script state.
 */
import { type Vec, add, angleOf, dist, fromAngle, norm, scale, sub, vec } from "../game/math.js";
import type { BossState, Unit } from "../game/types.js";
import type { World } from "../game/world.js";
import { PAL } from "../palette.js";
import { DIVE_WIND, GLASS, PIPES, STRONGBOX, pipeMouth } from "../game/bosses2.js";
import {
  type G, GOLD, INK, RED, TAU, arcLine, arm, band, clamp01, fadeOf, flameTip, gait, haste, ink, limb, lookDir, marker, progressRing, relightTelegraph,
  sector, tongue,
} from "./bosskit.js";

export function drawBoss2(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  switch (e.kind) {
    case "exorcist":
      return exorcist(g, gl, e, w, b);
    case "mourner":
      return mourner(g, gl, e, w, b);
    case "ratcatcher":
      return ratcatcher(g, gl, e, w, b);
    case "mobleader":
      return mobleader(g, gl, e, w, b);
    case "usurer":
      return usurer(g, gl, e, w, b);
    case "lampmaster":
      return lampmaster(g, gl, e, w, b);
    case "abbot":
      return abbot(g, gl, e, w, b);
    case "scriptor":
      return scriptor(g, gl, e, w, b);
    case "organist":
      return organist(g, gl, e, w, b);
    case "glassangel":
      return glassangel(g, gl, e, w, b);
    default:
      return;
  }
}

// ------------------------------------------------------------------ small props
type Tint = (c: number) => number;

/** An open book held in the hands; glowing while a rite is read from it. */
function openBook(g: G, gl: G, x: number, y: number, s: number, C: Tint, glowing: boolean, flutter = 0): void {
  g.poly([x - 14 * s, y - 1 * s, x, y + 3 * s, x + 14 * s, y - 1 * s, x + 13 * s, y - 12 * s - flutter, x, y - 9 * s, x - 13 * s, y - 12 * s + flutter]).fill(C(0xe8dcc0)).stroke(ink(3));
  g.moveTo(x, y + 3 * s).lineTo(x, y - 9 * s).stroke({ width: 2, color: INK });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) g.moveTo(x + side * 3 * s, y - (8 - i * 2.6) * s).lineTo(x + side * 10 * s, y - (9 - i * 2.6) * s).stroke({ width: 1.2, color: 0x5a4a3a });
  }
  g.moveTo(x + 1 * s, y + 2 * s).lineTo(x + 3 * s, y + 11 * s).stroke({ width: 2, color: C(0x9e1f14) });
  if (glowing) gl.circle(x, y - 6 * s, 24 * s).fill({ color: PAL.holy, alpha: 0.32 });
}

/** A highlighted lane across the room: where the wall of bullets leaves a way through. */
function lane(gl: G, w: World, at: number, half: number, vertical: boolean, color: number, k: number, from = 60): void {
  if (vertical) {
    gl.rect(at - half, from, half * 2, w.room.h - 60 - from).fill({ color, alpha: 0.04 + 0.05 * k });
    for (const side of [-1, 1]) gl.moveTo(at + side * half, from).lineTo(at + side * half, w.room.h - 60).stroke({ width: 2, color, alpha: 0.25 + 0.2 * k });
  } else {
    gl.rect(60, at - half, w.room.w - 120, half * 2).fill({ color, alpha: 0.04 + 0.05 * k });
    for (const side of [-1, 1]) gl.moveTo(60, at + side * half).lineTo(w.room.w - 60, at + side * half).stroke({ width: 2, color, alpha: 0.25 + 0.2 * k });
  }
}

/** A blow in a cone: the area fills while the blow winds up, flashes when it lands. */
function coneTelegraph(gl: G, x: number, y: number, dir: Vec, range: number, half: number, k: number, struck: boolean): void {
  const a = angleOf(dir);
  if (struck) {
    sector(gl, x, y, a, half, range + 10, 0xfff0c0, 0.35, range * 0.4);
    return;
  }
  sector(gl, x, y, a, half, range, RED, 0.08 + 0.12 * k);
  sector(gl, x, y, a, half, range * k, RED, 0.18);
  arcLine(gl, x, y, a - half, a + half, range, 3, RED, 0.5 + 0.4 * k);
}

// ------------------------------------------------------------------ the Exorcist
function exorcist(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.5;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const reading = b.step === "circles" || b.step === "banish" || b.step === "relight";
  const robe = C(0x161214);

  // --- telegraphs (the circles themselves are drawn with the zones)
  marker(gl, e, b, PAL.holy);
  relightTelegraph(gl, e, w, b, ["candle", "brazier", "torch"], y - 120 * s);
  if (b.step === "sprinkle" && b.n >= 1 && b.n <= 3) {
    const next = 0.4 / h + (b.n - 1) * 0.3;
    if (b.t < next) {
      const k = clamp01(1 - (next - b.t) / 0.4);
      const a = angleOf(norm(sub(w.player.pos, e.pos))) + (b.n - 2) * 0.3;
      sector(gl, x, y, a, 0.45, 360, PAL.holy, 0.04 + 0.1 * k);
      arcLine(gl, x, y, a - 0.45, a + 0.45, 360, 2, PAL.holy, 0.3 + 0.4 * k);
    }
  }
  if (b.step === "banish" && b.n === 1) {
    // light pours down on him while the great rite gathers
    const k = clamp01(b.t / 1.3);
    gl.rect(x - 34 * s, y - 280 * s, 68 * s, 280 * s).fill({ color: PAL.holy, alpha: 0.06 + 0.14 * k });
  }

  // --- the cassock to the floor, feet under the hem
  for (const side of [-1, 1]) g.ellipse(x + side * 8 * s + sw * side * 5 * s + face * 3 * s, y - 1 * s, 7 * s, 3.5 * s).fill(C(0x0e0b0a)).stroke(ink(2));
  g.poly([x - 15 * s, y - 66 * s, x + 15 * s, y - 66 * s, x + 21 * s + sw * 2 * s, y - 3 * s, x - 21 * s - sw * 2 * s, y - 3 * s]).fill(robe).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 66 * s, x + face * 15 * s, y - 66 * s, x + face * 21 * s, y - 3 * s, x + face * 1 * s, y - 3 * s]).fill({ color: C(0x050404), alpha: 0.5 });
  // --- the white surplice with its lace hem
  g.poly([x - 17 * s, y - 64 * s, x + 17 * s, y - 64 * s, x + 24 * s, y - 30 * s, x - 24 * s, y - 30 * s]).fill(C(0xe8e0d0)).stroke(ink(4));
  for (let i = 0; i < 6; i++) {
    const lx = x - 24 * s + i * 8 * s;
    g.moveTo(lx, y - 30 * s).quadraticCurveTo(lx + 4 * s, y - 24 * s, lx + 8 * s, y - 30 * s).fill(C(0xe8e0d0)).stroke({ width: 2, color: INK });
  }
  g.poly([x + face * 1 * s, y - 64 * s, x + face * 17 * s, y - 64 * s, x + face * 24 * s, y - 30 * s, x + face * 1 * s, y - 30 * s]).fill({ color: C(0xa8a090), alpha: 0.5 });
  // --- the purple stole, gold crosses at its ends
  for (const side of [-1, 1]) {
    g.poly([x + side * 3 * s, y - 67 * s, x + side * 9 * s, y - 67 * s, x + side * 11 * s, y - 20 * s, x + side * 5 * s, y - 20 * s]).fill(C(0x5a2a6a)).stroke(ink(2));
    g.rect(x + side * 8 * s - 1 * s, y - 31 * s, 2 * s, 8 * s).fill(C(GOLD));
    g.rect(x + side * 8 * s - 3 * s, y - 28 * s, 6 * s, 2 * s).fill(C(GOLD));
  }
  // --- the gaunt head under a wide black hat
  const hx = x + face * 2 * s;
  const hy = y - 76 * s;
  g.ellipse(hx, hy, 8 * s, 10 * s).fill(C(0xb8a890)).stroke(ink(4));
  g.ellipse(hx + face * 3 * s, hy - 1 * s, 2.4 * s, 1.8 * s).fill(INK);
  g.ellipse(hx - face * 3 * s, hy - 1 * s, 2.2 * s, 1.8 * s).fill(INK);
  if (b.step === "litany" || reading) g.ellipse(hx + face * 1 * s, hy + 6 * s, 2.2 * s, 1.8 * s + Math.abs(Math.sin(w.time * 9)) * 1.2 * s).fill(INK);
  else g.moveTo(hx - 2 * s, hy + 6 * s).lineTo(hx + 3 * s, hy + 6 * s).stroke({ width: 2, color: INK });
  g.ellipse(hx, hy - 9 * s, 25 * s, 6 * s).fill(C(0x121012)).stroke(ink(4));
  g.ellipse(hx, hy - 13 * s, 11 * s, 8 * s).fill(C(0x121012)).stroke(ink(3));
  g.ellipse(hx - 4 * s, hy - 16 * s, 4 * s, 2 * s).fill({ color: C(0x3a3640), alpha: 0.7 });
  // --- the ritual book in one hand
  const sh1 = vec(x + face * 15 * s, y - 60 * s);
  const sh2 = vec(x - face * 15 * s, y - 60 * s);
  const bookHand = reading ? vec(x - face * 20 * s, y - 102 * s) : vec(x - face * 20 * s, y - 46 * s);
  arm(g, sh2, bookHand, 4 * s, 7 * s, robe, x);
  openBook(g, gl, bookHand.x, bookHand.y - 5 * s, s, C, reading, reading ? Math.sin(w.time * 14) * 2 * s : 0);
  // --- the aspergillum in the other: held up, or swung through the air
  let hand: Vec;
  let tip: Vec;
  if (b.step === "sprinkle" && b.n >= 1) {
    const toP = norm(sub(w.player.pos, e.pos));
    const next = 0.4 / h + Math.max(0, b.n - 1) * 0.3;
    const k = clamp01(1 - (next - b.t) / 0.3); // raised, then swung down at the throw
    const a = angleOf(toP) - face * (1.4 - 1.4 * k);
    hand = add(sh1, scale(fromAngle(a), 22 * s));
    tip = add(hand, scale(fromAngle(a - face * 0.5), 36 * s));
  } else if (b.step === "litany") {
    hand = vec(x + face * 18 * s, y - 40 * s);
    tip = vec(x + face * 22 * s, y - 12 * s);
  } else {
    hand = vec(x + face * 22 * s, y - 44 * s);
    tip = vec(x + face * 30 * s, y - 80 * s);
  }
  arm(g, sh1, hand, 4 * s, 7 * s, robe, x);
  limb(g, hand.x, hand.y, tip.x, tip.y, 3 * s, C(0xb8b4a8));
  g.circle(tip.x, tip.y, 6 * s).fill(C(0xc8c4b8)).stroke(ink(3));
  for (let i = 0; i < 3; i++) g.circle(tip.x + Math.cos(i * 2.1) * 3 * s, tip.y + Math.sin(i * 2.1) * 3 * s, 1 * s).fill(INK);
  if (b.step === "sprinkle") gl.circle(tip.x, tip.y, 14 * s).fill({ color: PAL.holy, alpha: 0.3 });
  // a rosary swinging from the belt
  const rb = vec(x + face * 6 * s, y - 34 * s);
  for (let i = 0; i < 6; i++) g.circle(rb.x + Math.sin(w.time * 2 + i * 0.6) * 2 * s + i * face * 0.6 * s, rb.y + i * 3.4 * s, 1.6 * s).fill(C(0x6a1e18));
  g.rect(rb.x - 2.5 * s + 4 * face * s, rb.y + 20 * s, 5 * s, 1.6 * s).fill(C(GOLD));
  g.rect(rb.x - 0.8 * s + 4 * face * s, rb.y + 18 * s, 1.6 * s, 6 * s).fill(C(GOLD));
}

// ------------------------------------------------------------------ the Mourner
function mourner(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.55;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const a = fadeOf(b, "veil", 0.5, 0.9, 1.3);
  const C = (c: number) => (fl ? 0xffffff : c);
  const F = (c: number, alpha = 1) => ({ color: C(c), alpha: alpha * a });
  const K = (width = 4) => ({ width, color: INK, alpha: a, join: "round" as const, cap: "round" as const });
  const h = haste(b);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const bob = Math.sin(w.time * 1.6 + e.id) * 2 * s;
  const TEAR = 0xc8dcff;

  // --- telegraphs
  marker(gl, e, b, 0x8ab4ff);
  relightTelegraph(gl, e, w, b, ["candelabra", "candle", "torch"], y - 130 * s, TEAR);
  if (b.step === "wail" && b.n >= 1 && b.n <= (b.phase >= 2 ? 4 : 3)) {
    const next = 0.5 / h + (b.n - 1) * 0.45;
    if (b.t < next) {
      const k = clamp01(1 - (next - b.t) / 0.5);
      gl.circle(x, y - 40 * s, 30 + 70 * k).stroke({ width: 3, color: TEAR, alpha: 0.25 + 0.45 * k });
    }
  }
  if (b.step === "tears" && b.mem.lane !== undefined) lane(gl, w, b.mem.lane, 110, true, TEAR, clamp01(b.t / 1.2));

  // --- the long black dress, flaring into a train
  const hem = y - 2 * s;
  g.poly([x - 12 * s, y - 70 * s + bob, x + 12 * s, y - 70 * s + bob, x + 25 * s + sw * 2 * s, hem, x + 8 * s, hem + 3 * s, x - 12 * s, hem + 2 * s, x - 30 * s - face * 6 * s, hem + 1 * s]).fill(F(0x141012)).stroke(K(5));
  for (const dx of [-8, 3]) g.moveTo(x + dx * s, y - 50 * s + bob).lineTo(x + dx * 1.7 * s, hem).stroke({ width: 2, color: C(0x2e262c), alpha: a });
  // --- the veil, from the crown of her head down past her waist
  const hx = x + face * 1 * s;
  const hy = y - 84 * s + bob;
  const flow = Math.sin(w.time * 2.2) * 4 * s;
  g.poly([hx - 9 * s, hy - 12 * s, hx + 9 * s, hy - 12 * s, hx + 21 * s, hy + 34 * s, hx + 13 * s + flow, hy + 54 * s, hx - 15 * s + flow, hy + 52 * s, hx - 22 * s - flow * 0.5, hy + 30 * s]).fill(F(0x1e1a22, 0.95)).stroke(K(4));
  g.ellipse(hx + face * 2 * s, hy + 2 * s, 7 * s, 9 * s).fill(F(0xb8a8a0, 0.3));
  for (const ex of [5, -1]) gl.circle(hx + face * ex * s, hy + 1 * s, 1.6 * s).fill({ color: TEAR, alpha: a });
  const tk = (w.time * 0.9 + e.id * 0.1) % 1;
  gl.circle(hx + face * 5 * s, hy + 4 * s + tk * 16 * s, 1.5 * s).fill({ color: TEAR, alpha: a * (1 - tk) });
  // a black lace crown holds the veil
  g.ellipse(hx, hy - 12 * s, 10 * s, 4 * s).fill(F(0x0e0b0c)).stroke(K(3));
  for (let i = -2; i <= 2; i++) g.poly([hx + i * 4 * s - 2 * s, hy - 14 * s, hx + i * 4 * s, hy - 20 * s, hx + i * 4 * s + 2 * s, hy - 14 * s]).fill(F(0x0e0b0c));
  // --- the arms in black sleeves, pale hands
  const sh1 = vec(x + face * 11 * s, y - 64 * s + bob);
  const sh2 = vec(x - face * 11 * s, y - 64 * s + bob);
  let h1: Vec;
  let h2: Vec;
  if (b.step === "wail" || b.step === "dirge") {
    const lift = b.step === "dirge" ? Math.sin(w.time * 3) * 6 * s : 0;
    h1 = vec(x + face * 36 * s, y - 100 * s + bob + lift);
    h2 = vec(x - face * 36 * s, y - 100 * s + bob - lift);
  } else if (b.step === "procession" || b.step === "relight") {
    h1 = vec(x + face * 36 * s, y - 82 * s + bob);
    h2 = vec(x - face * 12 * s, y - 44 * s + bob);
  } else {
    // weeping into her hands
    h1 = vec(hx + face * 7 * s, hy + 10 * s);
    h2 = vec(hx - face * 5 * s, hy + 12 * s);
  }
  for (const [sh, hd] of [[sh2, h2], [sh1, h1]] as const) {
    const el = vec((sh.x + hd.x) / 2 + (sh.x > x ? 6 : -6) * s, (sh.y + hd.y) / 2 + 4 * s);
    g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(hd.x, hd.y).stroke({ width: 12 * s, color: INK, alpha: a, cap: "round", join: "round" });
    g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(hd.x, hd.y).stroke({ width: 6 * s, color: C(0x141012), alpha: a, cap: "round", join: "round" });
    g.circle(hd.x, hd.y, 3.6 * s).fill(F(0xd8ccc0)).stroke(K(2));
  }
  // a white handkerchief in the near hand
  g.poly([h1.x - 2 * s, h1.y, h1.x + face * 6 * s, h1.y + 4 * s, h1.x + face * 2 * s, h1.y + 12 * s + Math.sin(w.time * 4) * 2 * s, h1.x - face * 3 * s, h1.y + 7 * s]).fill(F(0xe8e4dc)).stroke(K(2));
  if (b.step === "wail") gl.circle(hx, hy, 34 * s).fill({ color: TEAR, alpha: 0.12 * a });
}

// ------------------------------------------------------------------ the Rat-Catcher
function ratcatcher(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.5;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const poling = b.step === "pole";
  const look = lookDir(e, w, poling);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const coat = C(0x4a3a26);

  // --- telegraphs
  marker(gl, e, b, 0x8a6a3a);
  relightTelegraph(gl, e, w, b, ["brazier", "torch"], y - 110 * s, PAL.ember);
  const wind = 0.75 / h;
  if (poling) {
    if (b.n === 1 && b.t < wind) coneTelegraph(gl, x, y, e.dir, 300, 0.5, clamp01(b.t / wind), false);
    else if (b.n === 3 && b.t < wind * 2 + 0.35) coneTelegraph(gl, x, y, e.dir, 300, 0.5, clamp01((b.t - wind - 0.35) / wind), false);
    else if ((b.n === 2 && b.t < wind + 0.2) || (b.n === 4 && b.t < wind * 2 + 0.55)) coneTelegraph(gl, x, y, e.dir, 300, 0.5, 1, true);
  }

  // --- the sack: on his back, or open on the ground while the rats pour out
  const wriggle = Math.sin(w.time * 9 + e.id) * 2 * s;
  if (b.step === "swarm") {
    const kx = x + face * 30 * s;
    g.ellipse(kx, y - 12 * s, 20 * s, 12 * s).fill(C(0x6a5a3a)).stroke(ink(4));
    g.ellipse(kx, y - 20 * s, 12 * s, 5 * s).fill(INK);
    for (let i = 0; i < 3; i++) g.circle(kx + (i - 1) * 7 * s + wriggle, y - 22 * s - Math.abs(Math.sin(w.time * 12 + i)) * 6 * s, 3.5 * s).fill(C(0x4a3e34)).stroke(ink(2));
  } else {
    const kx = x - face * 19 * s;
    const ky = y - 66 * s;
    g.ellipse(kx, ky, 17 * s, 22 * s).fill(C(0x6a5a3a)).stroke(ink(4));
    g.circle(kx + 6 * s + wriggle, ky + 6 * s, 6 * s).fill({ color: C(0x5a4a2e), alpha: 0.9 });
    g.circle(kx - 5 * s - wriggle * 0.6, ky - 4 * s, 5 * s).fill({ color: C(0x5a4a2e), alpha: 0.9 });
    g.moveTo(kx - 7 * s, ky - 20 * s).lineTo(kx + 7 * s, ky - 20 * s).stroke({ width: 4, color: C(0x2a1e14) });
  }
  // --- legs: patched breeches, boots
  for (const side of [-1, 1]) {
    const k = sw * side * 6 * s;
    limb(g, x + side * 8 * s, y - 32 * s, x + side * 10 * s + k, y - 5 * s, 9 * s, C(0x3a3024));
    g.ellipse(x + side * 10 * s + k + face * 3 * s, y - 3 * s, 8 * s, 4.5 * s).fill(C(0x1a1410)).stroke(ink(3));
  }
  // --- the long patched coat, hunched
  g.poly([x - 18 * s, y - 64 * s, x + 16 * s, y - 66 * s, x + 22 * s, y - 16 * s, x - 22 * s, y - 14 * s]).fill(coat).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 65 * s, x + face * 16 * s, y - 66 * s, x + face * 22 * s, y - 16 * s, x + face * 1 * s, y - 15 * s]).fill({ color: C(0x2a2016), alpha: 0.55 });
  g.rect(x - 12 * s, y - 46 * s, 9 * s, 8 * s).fill(C(0x6a5034)).stroke(ink(2));
  g.rect(x + 6 * s, y - 30 * s, 8 * s, 7 * s).fill(C(0x3a4a3a)).stroke(ink(2));
  // a belt hung with traps
  g.rect(x - 20 * s, y - 40 * s, 40 * s, 5 * s).fill(C(0x2a1e14)).stroke(ink(2));
  for (const dx of [-12, 12]) {
    g.circle(x + dx * s, y - 32 * s, 5 * s).stroke({ width: 3, color: C(0x6a665e) });
    g.circle(x + dx * s, y - 32 * s, 5 * s).stroke({ width: 1, color: INK });
  }
  // --- head pushed forward: a scarf over his nose, a floppy hat
  const hx = x + face * 8 * s;
  const hy = y - 74 * s;
  g.circle(hx, hy, 10 * s).fill(C(0x8a7058)).stroke(ink(4));
  g.poly([hx - 10 * s, hy + 1 * s, hx + 10 * s, hy + 1 * s, hx + 9 * s, hy + 9 * s, hx - 9 * s, hy + 9 * s]).fill(C(0x6a2a1e)).stroke(ink(3));
  g.circle(hx + face * 4 * s, hy - 3 * s, 1.8 * s).fill(INK);
  gl.circle(hx + face * 4 * s, hy - 3 * s, 1.1 * s).fill(0xffd070);
  g.ellipse(hx - face * 2 * s, hy - 9 * s, 22 * s, 6 * s).fill(C(0x3a2e20)).stroke(ink(4));
  g.poly([hx - 9 * s, hy - 10 * s, hx - 7 * s, hy - 22 * s, hx + 8 * s, hy - 21 * s, hx + 10 * s, hy - 10 * s]).fill(C(0x3a2e20)).stroke(ink(3));
  // a rat riding on his shoulder
  const rx = x - face * 6 * s;
  const ry = y - 70 * s;
  g.ellipse(rx, ry, 7 * s, 4 * s).fill(C(0x4a3e34)).stroke(ink(2));
  g.poly([rx + face * 5 * s, ry - 3 * s, rx + face * 11 * s, ry, rx + face * 5 * s, ry + 2 * s]).fill(C(0x4a3e34)).stroke(ink(2));
  g.moveTo(rx - face * 6 * s, ry).quadraticCurveTo(rx - face * 12 * s, ry + 8 * s, rx - face * 8 * s, ry + 14 * s).stroke({ width: 2, color: C(0xb88a7a) });
  // --- the pole with its hook: over the shoulder, or swept at you
  const sh = vec(x + face * 16 * s, y - 60 * s);
  let hand: Vec;
  let tip: Vec;
  if (poling) {
    const winding = (b.n === 1 && b.t < wind) || (b.n === 3 && b.t < wind * 2 + 0.35);
    const k = winding ? clamp01((b.n === 1 ? b.t : b.t - wind - 0.35) / wind) : 1;
    const a = angleOf(e.dir) + (winding ? -face * 1.2 * k : face * 0.5);
    hand = add(sh, scale(fromAngle(a), 18 * s));
    tip = add(hand, scale(fromAngle(a), 150 * s));
  } else {
    hand = vec(x + face * 22 * s, y - 48 * s);
    tip = vec(x - face * 56 * s, y - 170 * s);
  }
  const pd = norm(sub(tip, hand));
  limb(g, hand.x - pd.x * 30 * s, hand.y - pd.y * 30 * s, tip.x, tip.y, 3.5 * s, C(PAL.wood));
  g.moveTo(tip.x, tip.y).quadraticCurveTo(tip.x + pd.x * 12 * s - pd.y * 10 * s, tip.y + pd.y * 12 * s + pd.x * 10 * s, tip.x - pd.y * 12 * s, tip.y + pd.x * 12 * s).stroke({ width: 4 * s, color: C(0x8c8a82), cap: "round" });
  if (!poling) {
    // two dead rats hanging from the pole by their tails
    for (const k of [0.62, 0.78]) {
      const q = vec(hand.x + (tip.x - hand.x) * k, hand.y + (tip.y - hand.y) * k);
      g.moveTo(q.x, q.y).lineTo(q.x, q.y + 12 * s).stroke({ width: 2, color: C(0xb88a7a) });
      g.ellipse(q.x, q.y + 18 * s, 4 * s, 7 * s).fill(C(0x4a3e34)).stroke(ink(2));
    }
  }
  arm(g, sh, hand, 4 * s, 8 * s, coat, x);
  g.circle(hand.x, hand.y, 4.5 * s).fill(C(0x8a7058)).stroke(ink(2));
  // the other hand: a trap or a pot about to fly
  const sh2 = vec(x - face * 16 * s, y - 60 * s);
  const throwing = (b.step === "traps" || b.step === "poison" || b.step === "flick") && b.t < 1;
  const h2 = throwing ? vec(x - face * 10 * s, y - 104 * s + Math.sin(b.t * 20) * 4 * s) : vec(x - face * 18 * s, y - 38 * s);
  arm(g, sh2, h2, 4 * s, 8 * s, coat, x);
  if (throwing && b.step === "traps") g.ellipse(h2.x, h2.y - 6 * s, 9 * s, 5 * s).stroke({ width: 3, color: C(0x6a665e) });
  if (throwing && b.step === "poison") g.circle(h2.x, h2.y - 6 * s, 7 * s).fill(C(0x5a8a3a)).stroke(ink(3));
  g.circle(h2.x, h2.y, 4.5 * s).fill(C(0x8a7058)).stroke(ink(2));
}

// ------------------------------------------------------------------ the Mob Leader
function mobleader(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.6;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const charging = b.step === "charge";
  const look = lookDir(e, w, charging);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const shouting = b.step === "incite" || b.step === "speech" || b.step === "relight" || charging;
  const skin = C(0x9a765e);

  // --- telegraphs
  marker(gl, e, b, PAL.ember);
  relightTelegraph(gl, e, w, b, ["torch", "brazier"], y - 120 * s, PAL.ember);
  if (charging) {
    const wind = 0.55 / h;
    const per = wind + 0.5;
    const k = Math.floor(b.t / per);
    const local = b.t - k * per;
    if (k < (b.phase >= 2 ? 3 : 2) && local < wind) band(gl, e.pos, e.dir, 640 * 0.5, e.radius * 2, RED, 0.1 + 0.25 * clamp01(local / wind));
  }
  if (b.step === "speech" && b.n === 1) {
    // his roar: arcs from the mouth, the whole square answering
    const k = clamp01(b.t / 0.9);
    for (let i = 0; i < 3; i++) arcLine(gl, x + face * 10 * s, y - 84 * s, -Math.PI / 2 - 1, -Math.PI / 2 + 1, (30 + i * 26) * s * (0.6 + 0.4 * k), 3, PAL.ember, 0.6 - i * 0.15);
  }

  // --- legs, boots, rough trousers
  for (const side of [-1, 1]) {
    const k = sw * side * 7 * s;
    limb(g, x + side * 11 * s, y - 34 * s, x + side * 13 * s + k, y - 5 * s, 12 * s, C(0x3a3028));
    g.ellipse(x + side * 13 * s + k + face * 3 * s, y - 3 * s, 10 * s, 5 * s).fill(C(0x1a1410)).stroke(ink(3));
  }
  // --- the belly in a dirty shirt, a leather vest, a red rag tied around the arm
  g.ellipse(x, y - 50 * s, 27 * s, 24 * s).fill(C(0xb8a888)).stroke(ink(5));
  g.poly([x - 26 * s, y - 70 * s, x - 10 * s, y - 70 * s, x - 6 * s, y - 30 * s, x - 24 * s, y - 32 * s]).fill(C(0x4a3020)).stroke(ink(3));
  g.poly([x + 26 * s, y - 70 * s, x + 10 * s, y - 70 * s, x + 6 * s, y - 30 * s, x + 24 * s, y - 32 * s]).fill(C(0x4a3020)).stroke(ink(3));
  g.rect(x - 26 * s, y - 34 * s, 52 * s, 6 * s).fill(C(0x2a1e14)).stroke(ink(2));
  if (!fl) {
    g.ellipse(x + 4 * s, y - 50 * s, 6 * s, 4 * s).fill({ color: 0x8a7a5a, alpha: 0.7 });
    g.ellipse(x - 5 * s, y - 42 * s, 4 * s, 3 * s).fill({ color: PAL.blood, alpha: 0.7 });
  }
  // --- head: bald, a great beard, a mouth that never closes
  const hx = x + face * 4 * s;
  const hy = y - 82 * s;
  g.circle(hx, hy, 12 * s).fill(skin).stroke(ink(4));
  g.poly([hx - 11 * s, hy + 2 * s, hx + 11 * s, hy + 2 * s, hx + 8 * s, hy + 18 * s, hx, hy + 24 * s, hx - 8 * s, hy + 18 * s]).fill(C(0x5a3018)).stroke(ink(3));
  if (shouting) g.ellipse(hx + face * 2 * s, hy + 7 * s, 4 * s, 3.5 * s + Math.abs(Math.sin(w.time * 12)) * 1.5 * s).fill(0x2a0a08);
  else g.moveTo(hx - 1 * s, hy + 7 * s).lineTo(hx + face * 5 * s, hy + 7 * s).stroke({ width: 2, color: INK });
  g.moveTo(hx + face * 1 * s, hy - 5 * s).lineTo(hx + face * 9 * s, hy - 3 * s).stroke({ width: 3, color: INK });
  g.circle(hx + face * 5 * s, hy - 1 * s, 1.8 * s).fill(INK);
  g.ellipse(hx - face * 4 * s, hy - 8 * s, 4 * s, 2 * s).fill({ color: 0xc8a888, alpha: 0.6 });
  // --- arms: the cudgel in one fist, the torch in the other
  const sh1 = vec(x + face * 24 * s, y - 66 * s);
  const sh2 = vec(x - face * 24 * s, y - 66 * s);
  let club: Vec;
  let clubTip: Vec;
  if (charging) {
    club = vec(x + e.dir.x * 26 * s, y - 60 * s + e.dir.y * 10 * s);
    clubTip = add(club, vec(-face * 10 * s, -54 * s));
  } else if (b.step === "stones" && b.t < 1.2) {
    // throwing cobbles: the cudgel tucked under the arm
    club = vec(x + face * 30 * s, y - 104 * s + Math.sin(b.t * 18) * 6 * s);
    clubTip = vec(club.x - face * 40 * s, club.y + 30 * s);
  } else {
    club = vec(x + face * 30 * s, y - 40 * s);
    clubTip = vec(x + face * 40 * s, y - 90 * s);
  }
  limb(g, club.x, club.y, clubTip.x, clubTip.y, 7 * s, C(0x5a4028));
  const cd = norm(sub(clubTip, club));
  for (let i = 0; i < 3; i++) {
    const q = add(club, scale(cd, (30 + i * 7) * s));
    g.moveTo(q.x - cd.y * 5 * s, q.y + cd.x * 5 * s).lineTo(q.x - cd.y * 10 * s, q.y + cd.x * 10 * s).stroke({ width: 2, color: C(0x8c8a82) });
  }
  if (b.step === "stones" && b.t < 1.2) g.poly([club.x - 6 * s, club.y - 4 * s, club.x, club.y - 9 * s, club.x + 6 * s, club.y - 3 * s, club.x + 2 * s, club.y + 3 * s]).fill(C(0x6a6458)).stroke(ink(2));
  arm(g, sh1, club, 6 * s, 11 * s, skin, x);
  g.rect(sh1.x - 6 * s, sh1.y + 6 * s, 12 * s, 6 * s).fill(C(0x9e1f14)).stroke(ink(2));
  g.circle(club.x, club.y, 6 * s).fill(skin).stroke(ink(3));
  const raised = b.step === "speech" || b.step === "relight" || b.step === "incite" || (b.step === "torches" && b.t < 1.2);
  const torch = raised ? vec(x - face * 26 * s, y - 128 * s) : vec(x - face * 30 * s, y - 52 * s);
  arm(g, sh2, vec(torch.x, torch.y + 12 * s), 6 * s, 11 * s, skin, x);
  limb(g, torch.x, torch.y + 24 * s, torch.x + face * 2 * s, torch.y - 10 * s, 4 * s, C(PAL.wood));
  tongue(gl, torch.x + face * 2 * s, torch.y - 8 * s, 12 * s, (24 + 6 * Math.sin(w.time * 11)) * s, Math.sin(w.time * 7) * 4, PAL.emberHot, 0.95);
  gl.circle(torch.x, torch.y - 16 * s, 26 * s).fill({ color: PAL.ember, alpha: 0.18 });
  g.circle(torch.x, torch.y + 12 * s, 6 * s).fill(skin).stroke(ink(3));
}

// ------------------------------------------------------------------ the Usurer
function usurer(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.6;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const robe = C(0x2a3a2a);
  const fur = C(0x8a7050);

  // --- telegraphs
  marker(gl, e, b, GOLD);
  relightTelegraph(gl, e, w, b, ["candelabra", "chandelier", "torch"], y - 120 * s, GOLD);
  const boxed = b.step === "strongbox" && b.n === 1;
  if (boxed) {
    // the box will burst: a ring gathers where the coins fly
    const k = clamp01(b.t / STRONGBOX);
    progressRing(gl, x, y - 130 * s, 18, k, GOLD);
    if (k > 0.6) gl.circle(x, y, 60 + 200 * (k - 0.6) / 0.4).stroke({ width: 3, color: RED, alpha: 0.6 * k });
  }

  // --- the robe: a heavy fur-trimmed coat over a round belly
  for (const side of [-1, 1]) g.ellipse(x + side * 12 * s + sw * side * 4 * s + face * 3 * s, y - 2 * s, 9 * s, 4.5 * s).fill(C(0x1a1410)).stroke(ink(3));
  g.poly([x - 22 * s, y - 70 * s, x + 22 * s, y - 70 * s, x + 32 * s, y - 6 * s, x - 32 * s, y - 6 * s]).fill(robe).stroke(ink(5));
  g.ellipse(x + face * 4 * s, y - 40 * s, 22 * s, 22 * s).fill(C(0x6a2a1e)).stroke(ink(4));
  g.poly([x + face * 2 * s, y - 70 * s, x + face * 22 * s, y - 70 * s, x + face * 32 * s, y - 6 * s, x + face * 2 * s, y - 6 * s]).fill({ color: C(0x101810), alpha: 0.45 });
  g.rect(x - 32 * s, y - 12 * s, 64 * s, 8 * s).fill(fur).stroke(ink(3));
  g.poly([x - 6 * s, y - 70 * s, x + 6 * s, y - 70 * s, x + 4 * s, y - 8 * s, x - 4 * s, y - 8 * s]).fill(fur);
  g.ellipse(x, y - 70 * s, 24 * s, 7 * s).fill(fur).stroke(ink(3));
  // the gold chain, the purse at his belt
  g.moveTo(x - 16 * s, y - 66 * s).quadraticCurveTo(x, y - 48 * s, x + 16 * s, y - 66 * s).stroke({ width: 3 * s, color: C(GOLD) });
  g.circle(x, y - 52 * s, 4 * s).fill(C(GOLD)).stroke(ink(2));
  const purse = vec(x - face * 18 * s, y - 28 * s);
  g.ellipse(purse.x, purse.y, 8 * s, 9 * s).fill(C(0x7a4a2a)).stroke(ink(3));
  g.moveTo(purse.x - 5 * s, purse.y - 7 * s).lineTo(purse.x + 5 * s, purse.y - 7 * s).stroke({ width: 2, color: C(GOLD) });
  // --- head: jowls, little spectacles, a tall fur hat with a jewel
  const hx = x + face * 3 * s;
  const hy = y - 84 * s;
  g.ellipse(hx, hy + 2 * s, 13 * s, 12 * s).fill(C(0xc8a088)).stroke(ink(4));
  g.ellipse(hx + face * 8 * s, hy + 7 * s, 5 * s, 4 * s).fill({ color: C(0xd8a898), alpha: 0.7 });
  for (const dx of [2, 8]) g.circle(hx + face * dx * s, hy, 3 * s).stroke({ width: 2, color: C(GOLD) });
  gl.circle(hx + face * 8 * s - 1, hy - 1, 1.2 * s).fill({ color: 0xffffff, alpha: 0.8 });
  g.moveTo(hx + face * 2 * s, hy + 9 * s).quadraticCurveTo(hx + face * 6 * s, hy + 12 * s, hx + face * 10 * s, hy + 8 * s).stroke({ width: 2, color: INK });
  g.rect(hx - 12 * s, hy - 32 * s, 24 * s, 22 * s).fill(C(0x3a2a1a)).stroke(ink(3));
  g.ellipse(hx, hy - 10 * s, 15 * s, 5 * s).fill(fur).stroke(ink(3));
  g.circle(hx + face * 2 * s, hy - 22 * s, 3.5 * s).fill(C(0x9e1f14)).stroke(ink(2));
  // --- arms: the ledger under one, coins (a seal, a purse, a bell) in the other
  const sh1 = vec(x + face * 22 * s, y - 64 * s);
  const sh2 = vec(x - face * 22 * s, y - 64 * s);
  const h2 = vec(x - face * 26 * s, y - 46 * s);
  arm(g, sh2, h2, 5 * s, 10 * s, robe, x);
  g.rect(h2.x - 9 * s, h2.y - 16 * s, 18 * s, 22 * s).fill(C(0x5a2a1a)).stroke(ink(3));
  g.rect(h2.x - 7 * s, h2.y - 14 * s, 14 * s, 3 * s).fill(C(GOLD));
  let h1 = vec(x + face * 30 * s, y - 50 * s);
  if (b.step === "coins" || b.step === "rain" || b.step === "spill") h1 = vec(x + face * 34 * s, y - 96 * s - (b.step === "rain" ? 16 * s : 0));
  if (b.step === "seals") h1 = vec(x + face * 34 * s, y - 70 * s);
  if (b.step === "mercenaries" || b.step === "relight") h1 = vec(x + face * 26 * s, y - 108 * s);
  arm(g, sh1, h1, 5 * s, 10 * s, robe, x);
  g.circle(h1.x, h1.y, 5.5 * s).fill(C(0xc8a088)).stroke(ink(2));
  if (b.step === "coins" || b.step === "rain" || b.step === "spill") {
    for (let i = 0; i < 3; i++) g.circle(h1.x + (i - 1) * 5 * s, h1.y - 8 * s - (i % 2) * 3 * s, 3.5 * s).fill(C(0xe8c050)).stroke(ink(1.5));
    gl.circle(h1.x, h1.y - 8 * s, 14 * s).fill({ color: GOLD, alpha: 0.25 });
  } else if (b.step === "seals") {
    g.rect(h1.x - 3 * s, h1.y - 14 * s, 6 * s, 10 * s).fill(C(0x5a3a1a)).stroke(ink(2));
    g.circle(h1.x, h1.y - 2 * s, 5 * s).fill(C(0x9e1f14)).stroke(ink(2));
  } else if (b.step === "mercenaries") {
    g.ellipse(h1.x, h1.y - 10 * s, 8 * s, 9 * s).fill(C(0x7a4a2a)).stroke(ink(3));
  } else if (b.step === "relight") {
    // a little silver bell for his servant
    g.poly([h1.x - 6 * s, h1.y - 4 * s, h1.x - 3 * s, h1.y - 14 * s, h1.x + 3 * s, h1.y - 14 * s, h1.x + 6 * s, h1.y - 4 * s]).fill(C(0xc8c4b8)).stroke(ink(2));
  }
  // --- the strongbox: an iron-bound chest closed over him, or burst open
  if (b.step === "strongbox") {
    const bw = 44 * s;
    const top = y - 92 * s;
    if (b.n === 1) {
      const drop = clamp01(b.t / 0.25);
      const ty = top - (1 - drop) * 40 * s;
      g.rect(x - bw, ty, bw * 2, y - 2 * s - ty).fill(C(0x5a3a22)).stroke(ink(5));
      for (const dy of [0.2, 0.55, 0.85]) g.rect(x - bw, ty + (y - ty) * dy, bw * 2, 6 * s).fill(C(0x3a3632)).stroke(ink(2));
      for (const dx of [-0.7, 0.7]) g.rect(x + bw * dx - 3 * s, ty, 6 * s, y - 2 * s - ty).fill(C(0x3a3632));
      g.rect(x - 8 * s, ty + (y - ty) * 0.38, 16 * s, 16 * s).fill(C(GOLD)).stroke(ink(3));
      g.circle(x, ty + (y - ty) * 0.38 + 7 * s, 2.5 * s).fill(INK);
      const pulse = 0.5 + 0.5 * Math.sin(w.time * 8);
      gl.rect(x - bw - 4, ty - 4, bw * 2 + 8, y - ty + 4).stroke({ width: 3, color: GOLD, alpha: 0.25 + 0.25 * pulse });
    } else if (b.t < STRONGBOX + 0.5) {
      g.rect(x - bw, y - 40 * s, bw * 2, 38 * s).fill(C(0x5a3a22)).stroke(ink(4));
      g.poly([x - bw, y - 40 * s, x + bw, y - 40 * s, x + bw + 10 * s, y - 70 * s, x - bw - 10 * s, y - 70 * s]).fill(C(0x6a4a2a)).stroke(ink(4));
      gl.ellipse(x, y - 40 * s, bw, 10 * s).fill({ color: GOLD, alpha: 0.5 });
    }
  }
}

// ------------------------------------------------------------------ the Lamp Master
function lampmaster(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.55;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const tapering = b.step === "taper";
  const look = lookDir(e, w, tapering);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const coat = C(0x2a3040);

  // --- the pole: where his hand is and where its burning tip points
  const sh1 = vec(x + face * 15 * s, y - 64 * s);
  let hand = vec(x + face * 20 * s, y - 50 * s);
  let tip = vec(x + face * 34 * s, y - 210 * s);
  const wind = 0.6 / h;
  const lighting = (b.mem.tongueT ?? 0) > 0;
  if (tapering) {
    const k = b.n === 1 ? clamp01(b.t / wind) : 1;
    const a = angleOf(e.dir);
    hand = add(sh1, scale(fromAngle(a), (10 + 16 * k) * s));
    tip = add(hand, scale(fromAngle(a - face * (1 - k) * 0.9), 110 * s));
  } else if (b.step === "embers") {
    const a = angleOf(norm(sub(w.player.pos, e.pos))) - face * 0.6;
    hand = add(sh1, scale(fromAngle(a), 20 * s));
    tip = add(hand, scale(fromAngle(a - face * 0.4 + Math.sin(w.time * 18) * 0.1), 120 * s));
  } else if (lighting) {
    // reaching out with the pole towards the lamp he lights from afar
    const l = w.lights.find((q) => q.id === b.mem.tongue);
    if (l) {
      const a = angleOf(sub(vec(l.pos.x, l.pos.y - 74), sh1));
      hand = add(sh1, scale(fromAngle(a), 22 * s));
      tip = add(hand, scale(fromAngle(a), 140 * s));
    }
  }

  // --- telegraphs
  marker(gl, e, b, PAL.ember);
  if (tapering && b.n === 1 && b.t < wind) coneTelegraph(gl, x, y, e.dir, 270, 0.5, clamp01(b.t / wind), false);
  else if (tapering && b.n === 2 && b.t < wind + 0.2) coneTelegraph(gl, x, y, e.dir, 270, 0.5, 1, true);
  if (lighting) {
    // a thread of fire runs from his pole to the lamp; it catches when the ring closes
    const l = w.lights.find((q) => q.id === b.mem.tongue);
    if (l) {
      const k = clamp01(1 - (b.mem.tongueT ?? 0) / 1.4);
      const to = vec(l.pos.x, l.pos.y - 74);
      const mid = vec(tip.x + (to.x - tip.x) * k, tip.y + (to.y - tip.y) * k - Math.sin(k * Math.PI) * 60);
      gl.moveTo(tip.x, tip.y).quadraticCurveTo((tip.x + mid.x) / 2, Math.min(tip.y, mid.y) - 50, mid.x, mid.y).stroke({ width: 4, color: PAL.ember, alpha: 0.8 });
      gl.circle(mid.x, mid.y, 7).fill(PAL.emberHot);
      progressRing(gl, to.x, to.y - 26, 18, k, PAL.ember);
    }
  }
  if (b.step === "plant" && b.n === 1 && b.mem.plantX !== undefined) {
    // the spot where a new lamp post goes up
    const k = clamp01(b.t / (0.9 / h));
    const px = b.mem.plantX;
    const py = b.mem.plantY;
    gl.circle(px, py, 250 * k).fill({ color: PAL.ember, alpha: 0.06 });
    gl.circle(px, py, 250).stroke({ width: 2, color: PAL.ember, alpha: 0.35 });
    gl.moveTo(px, py).lineTo(px, py - 74 * k).stroke({ width: 5, color: PAL.ember, alpha: 0.6 });
    progressRing(gl, px, py - 100, 16, k, PAL.ember);
  }

  // --- legs in narrow trousers, buckled shoes
  for (const side of [-1, 1]) {
    const k = sw * side * 8 * s;
    limb(g, x + side * 7 * s, y - 36 * s, x + side * 8 * s + k, y - 5 * s, 7 * s, C(0x1e1e24));
    g.ellipse(x + side * 8 * s + k + face * 3 * s, y - 3 * s, 7 * s, 3.5 * s).fill(C(0x14110e)).stroke(ink(3));
  }
  // --- the long coat with a short cape and brass buttons; a lantern at the belt
  g.poly([x - 15 * s, y - 68 * s, x + 15 * s, y - 68 * s, x + 20 * s + sw * 2 * s, y - 16 * s, x - 20 * s - sw * 2 * s, y - 16 * s]).fill(coat).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 68 * s, x + face * 15 * s, y - 68 * s, x + face * 20 * s, y - 16 * s, x + face * 1 * s, y - 16 * s]).fill({ color: C(0x141820), alpha: 0.55 });
  g.poly([x - 21 * s, y - 70 * s, x + 21 * s, y - 70 * s, x + 25 * s, y - 50 * s, x - 25 * s, y - 50 * s]).fill(C(0x323a4e)).stroke(ink(4));
  for (let i = 0; i < 4; i++) g.circle(x + face * 4 * s, y - 46 * s + i * 8 * s, 1.8 * s).fill(C(GOLD));
  const lx = x - face * 14 * s;
  const ly = y - 30 * s;
  g.rect(lx - 6 * s, ly - 8 * s, 12 * s, 15 * s).fill(C(0x2a2010)).stroke(ink(3));
  gl.rect(lx - 3 * s, ly - 5 * s, 6 * s, 9 * s).fill(PAL.emberHot);
  gl.circle(lx, ly, 18 * s).fill({ color: PAL.ember, alpha: 0.2 });
  // --- head: a lean face, side-whiskers, a tall cap with a brass badge
  const hx = x + face * 2 * s;
  const hy = y - 80 * s;
  g.ellipse(hx, hy, 8 * s, 10 * s).fill(C(0xb89880)).stroke(ink(4));
  g.ellipse(hx - face * 6 * s, hy + 3 * s, 3 * s, 6 * s).fill(C(0x6a5040));
  g.ellipse(hx + face * 3 * s, hy - 1 * s, 2 * s, 1.6 * s).fill(INK);
  gl.circle(hx + face * 3 * s, hy - 1 * s, 0.9 * s).fill(PAL.emberHot);
  g.rect(hx - 9 * s, hy - 30 * s, 18 * s, 20 * s).fill(C(0x1e2230)).stroke(ink(3));
  g.ellipse(hx, hy - 10 * s, 13 * s, 3.5 * s).fill(C(0x1e2230)).stroke(ink(3));
  g.circle(hx + face * 2 * s, hy - 20 * s, 3 * s).fill(C(GOLD)).stroke(ink(1.5));
  // --- the pole: brass-tipped, a hook for the lamp doors and a flame on top
  const pd = norm(sub(tip, hand));
  limb(g, hand.x - pd.x * 40 * s, hand.y - pd.y * 40 * s, tip.x, tip.y, 3 * s, C(0x4a3a28));
  limb(g, tip.x - pd.x * 14 * s, tip.y - pd.y * 14 * s, tip.x, tip.y, 4 * s, C(GOLD));
  g.moveTo(tip.x - pd.x * 10 * s, tip.y - pd.y * 10 * s).quadraticCurveTo(tip.x - pd.x * 6 * s + pd.y * 10 * s, tip.y - pd.y * 6 * s - pd.x * 10 * s, tip.x + pd.y * 6 * s, tip.y - pd.x * 6 * s).stroke({ width: 2.5 * s, color: C(0x8c8a82) });
  flameTip(gl, tip.x, tip.y, s * 1.1, w.time);
  arm(g, sh1, hand, 4 * s, 7 * s, coat, x);
  g.circle(hand.x, hand.y, 4 * s).fill(C(0xb89880)).stroke(ink(2));
  // the other hand: a flare, a flask, or resting
  const sh2 = vec(x - face * 15 * s, y - 64 * s);
  const throwing = (b.step === "flare" || b.step === "oil") && b.n === 0;
  const h2 = throwing ? vec(x - face * 16 * s, y - 108 * s) : b.step === "apprentices" ? vec(x - face * 6 * s, y - 84 * s) : vec(x - face * 18 * s, y - 40 * s);
  arm(g, sh2, h2, 4 * s, 7 * s, coat, x);
  if (throwing && b.step === "flare") {
    g.rect(h2.x - 3 * s, h2.y - 16 * s, 6 * s, 14 * s).fill(C(0x9e1f14)).stroke(ink(2));
    flameTip(gl, h2.x, h2.y - 16 * s, s, w.time, 0xfff0c0);
  }
  if (throwing && b.step === "oil") g.circle(h2.x, h2.y - 6 * s, 7 * s).fill(C(0x5a8a3a)).stroke(ink(3));
  g.circle(h2.x, h2.y, 4 * s).fill(C(0xb89880)).stroke(ink(2));
}

// ------------------------------------------------------------------ the Abbot
function abbot(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.6;
  const { x } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const kneel = b.step === "vespers" && b.n === 1 ? 10 * s : 0;
  const y = e.pos.y + kneel;
  const habit = C(0x1a1614);
  const singing = b.step === "chant" || b.step === "gloria" || b.step === "vespers";

  // --- telegraphs (the bell's strike is drawn with the zones)
  marker(gl, e, b, PAL.holy);
  relightTelegraph(gl, e, w, b, ["candelabra", "candle"], y - 130 * s);
  if (b.step === "gloria") {
    for (let i = 0; i < 10; i++) {
      const d = fromAngle(-Math.PI / 2 + (i - 4.5) * 0.22);
      gl.moveTo(x, y - 90 * s).lineTo(x + d.x * 180 * s, y - 90 * s + d.y * 180 * s).stroke({ width: 3, color: PAL.holy, alpha: 0.2 });
    }
  }
  if (singing) {
    // notes rising from his mouth
    for (let i = 0; i < 3; i++) {
      const k = (w.time * 0.7 + i / 3) % 1;
      const nx = x + face * (14 + 20 * k) * s + Math.sin(k * 9 + i) * 6 * s;
      const ny = e.pos.y - 84 * s - k * 60 * s;
      gl.ellipse(nx, ny, 4 * s, 3 * s).fill({ color: PAL.holy, alpha: 0.8 * (1 - k) });
      gl.moveTo(nx + 3 * s, ny).lineTo(nx + 3 * s, ny - 10 * s).stroke({ width: 2, color: PAL.holy, alpha: 0.8 * (1 - k) });
    }
  }

  // --- the black habit, heavy and wide; a scapular down the front, a rope at the waist
  for (const side of [-1, 1]) g.ellipse(x + side * 10 * s + sw * side * 5 * s + face * 3 * s, e.pos.y - 1 * s, 8 * s, 4 * s).fill(C(0x0e0b0a)).stroke(ink(2));
  g.poly([x - 20 * s, y - 70 * s, x + 20 * s, y - 70 * s, x + 28 * s + sw * 2 * s, e.pos.y - 3 * s, x - 28 * s - sw * 2 * s, e.pos.y - 3 * s]).fill(habit).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 70 * s, x + face * 20 * s, y - 70 * s, x + face * 28 * s, e.pos.y - 3 * s, x + face * 1 * s, e.pos.y - 3 * s]).fill({ color: C(0x060505), alpha: 0.5 });
  g.poly([x - 9 * s, y - 66 * s, x + 9 * s, y - 66 * s, x + 11 * s, e.pos.y - 6 * s, x - 11 * s, e.pos.y - 6 * s]).fill(C(0x262220)).stroke(ink(2));
  g.moveTo(x - 22 * s, y - 38 * s).quadraticCurveTo(x, y - 33 * s, x + 22 * s, y - 38 * s).stroke({ width: 3 * s, color: C(0x8a7a5a) });
  g.moveTo(x + face * 6 * s, y - 36 * s).lineTo(x + face * 8 * s, y - 14 * s).stroke({ width: 2.5 * s, color: C(0x8a7a5a) });
  // the cowl, down around the shoulders
  g.ellipse(x, y - 68 * s, 24 * s, 9 * s).fill(habit).stroke(ink(4));
  // the silver pectoral cross
  g.rect(x - 2 * s, y - 60 * s, 4 * s, 16 * s).fill(C(0xc8c4b8)).stroke(ink(1.5));
  g.rect(x - 6 * s, y - 55 * s, 12 * s, 4 * s).fill(C(0xc8c4b8)).stroke(ink(1.5));
  // --- head: a tonsured crown, a white beard, heavy brows
  const hx = x + face * 2 * s;
  const hy = y - 82 * s;
  g.circle(hx, hy, 11 * s).fill(C(0xa88870)).stroke(ink(4));
  g.ellipse(hx, hy - 4 * s, 12 * s, 6 * s).stroke({ width: 3 * s, color: C(0xd8d0c0) });
  g.poly([hx - 9 * s, hy + 3 * s, hx + 9 * s, hy + 3 * s, hx + 6 * s, hy + 20 * s, hx, hy + 26 * s, hx - 6 * s, hy + 20 * s]).fill(C(0xd8d0c0)).stroke(ink(3));
  g.moveTo(hx + face * 1 * s, hy - 3 * s).lineTo(hx + face * 8 * s, hy - 2 * s).stroke({ width: 3, color: C(0xd8d0c0) });
  g.circle(hx + face * 5 * s, hy + 1 * s, 1.6 * s).fill(INK);
  if (singing) g.ellipse(hx + face * 3 * s, hy + 9 * s, 2.6 * s, 2.4 * s + Math.abs(Math.sin(w.time * 8)) * s).fill(0x3a1a10);
  // --- the great hand bell and the breviary
  const sh1 = vec(x + face * 20 * s, y - 64 * s);
  const sh2 = vec(x - face * 20 * s, y - 64 * s);
  const ringing = b.step === "bell";
  const bell = ringing ? vec(x + face * 24 * s, y - 124 * s + (b.n >= 2 ? Math.sin(w.time * 30) * 4 * s : 0)) : vec(x + face * 30 * s, y - 40 * s);
  arm(g, sh1, vec(bell.x, bell.y - 12 * s), 5 * s, 10 * s, habit, x);
  limb(g, bell.x, bell.y - 18 * s, bell.x, bell.y - 6 * s, 3 * s, C(PAL.wood));
  g.poly([bell.x - 7 * s, bell.y - 6 * s, bell.x - 13 * s, bell.y + 12 * s, bell.x + 13 * s, bell.y + 12 * s, bell.x + 7 * s, bell.y - 6 * s]).fill(C(0xc8a040)).stroke(ink(3));
  g.ellipse(bell.x, bell.y + 12 * s, 13 * s, 3 * s).fill(C(0x8a6a28)).stroke(ink(2));
  if (ringing) gl.circle(bell.x, bell.y + 4 * s, 26 * s).fill({ color: PAL.holy, alpha: 0.2 });
  const raised = b.step === "gloria" || b.step === "vespers" || b.step === "monks";
  const h2 = raised ? vec(x - face * 26 * s, y - 112 * s) : vec(x - face * 24 * s, y - 46 * s);
  arm(g, sh2, h2, 5 * s, 10 * s, habit, x);
  if (raised) {
    g.circle(h2.x, h2.y - 4 * s, 4.5 * s).fill(C(0xa88870)).stroke(ink(2));
    gl.circle(h2.x, h2.y - 8 * s, 18 * s).fill({ color: PAL.holy, alpha: 0.35 });
  } else {
    g.rect(h2.x - 7 * s, h2.y - 12 * s, 14 * s, 17 * s).fill(C(0x3a1a12)).stroke(ink(3));
    g.rect(h2.x - 1 * s, h2.y - 12 * s, 2 * s, 17 * s).fill(C(GOLD));
  }
}

// ------------------------------------------------------------------ the Scriptor
function scriptor(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.5;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const look = lookDir(e, w, false);
  const face = look.x >= 0 ? 1 : -1;
  const sw = gait(b, s);
  const habit = C(0x4a3a2a);
  const PAGE = 0xe8dcc0;

  // --- telegraphs
  marker(gl, e, b, PAGE);
  relightTelegraph(gl, e, w, b, ["candle", "chandelier", "torch"], y - 120 * s);
  if (b.step === "censor") {
    const k = clamp01(b.t / 1.4);
    if (b.mem.gapX !== undefined) lane(gl, w, b.mem.gapX, 120, true, PAGE, k);
    if (b.mem.gapY !== undefined) lane(gl, w, b.mem.gapY, 120, false, PAGE, k);
  }
  // pages circling him, more of them while he casts
  const many = b.step === "pages" ? 8 : 3;
  for (let i = 0; i < many; i++) {
    const a = w.time * (1.2 + i * 0.1) + (i * TAU) / many;
    const px = x + Math.cos(a) * 46 * s;
    const py = y - 60 * s + Math.sin(a) * 16 * s - Math.sin(w.time * 2 + i) * 8 * s;
    const c = Math.cos(a * 3) * 6 * s;
    g.poly([px - c, py - 5 * s, px + c, py - 5 * s, px + c, py + 5 * s, px - c, py + 5 * s]).fill(C(PAGE)).stroke(ink(1.5));
  }

  // --- a thin hunched monk in a brown habit, the hood up
  for (const side of [-1, 1]) g.ellipse(x + side * 7 * s + sw * side * 5 * s + face * 3 * s, y - 1 * s, 7 * s, 3.5 * s).fill(C(0x1a1410)).stroke(ink(2));
  g.poly([x - 14 * s, y - 64 * s, x + 16 * s, y - 66 * s, x + 20 * s + sw * 2 * s, y - 3 * s, x - 20 * s - sw * 2 * s, y - 3 * s]).fill(habit).stroke(ink(5));
  g.poly([x + face * 1 * s, y - 65 * s, x + face * 16 * s, y - 66 * s, x + face * 20 * s, y - 3 * s, x + face * 1 * s, y - 3 * s]).fill({ color: C(0x2a2016), alpha: 0.5 });
  g.moveTo(x - 18 * s, y - 36 * s).quadraticCurveTo(x, y - 31 * s, x + 18 * s, y - 36 * s).stroke({ width: 2.5 * s, color: C(0x2a1e14) });
  // an inkwell and a knife at the belt
  g.rect(x - face * 12 * s - 4 * s, y - 34 * s, 8 * s, 8 * s).fill(C(0x14121a)).stroke(ink(2));
  // --- the hood: in its shadow only the glint of spectacles
  const hx = x + face * 7 * s;
  const hy = y - 76 * s;
  g.poly([hx - 13 * s, hy + 10 * s, hx - 12 * s, hy - 8 * s, hx - face * 2 * s, hy - 18 * s, hx + 12 * s, hy - 8 * s, hx + 13 * s, hy + 10 * s]).fill(habit).stroke(ink(4));
  g.ellipse(hx + face * 3 * s, hy + 1 * s, 8 * s, 9 * s).fill(C(0x0e0b09));
  for (const dx of [0, 6]) {
    g.circle(hx + face * dx * s, hy, 2.6 * s).stroke({ width: 1.5, color: C(GOLD) });
    gl.circle(hx + face * dx * s, hy, 1.4 * s).fill({ color: 0xfff4d8, alpha: 0.9 });
  }
  g.moveTo(hx - face * 6 * s, hy - 10 * s).lineTo(hx - face * 16 * s, hy - 26 * s).stroke({ width: 2.5, color: C(0xe8e0d0) });
  // --- the great book held open before him, or the quill raised, or a burning tome
  const sh1 = vec(x + face * 14 * s, y - 60 * s);
  const sh2 = vec(x - face * 14 * s, y - 60 * s);
  const bookAt = vec(x + face * 18 * s, y - 52 * s);
  const quillUp = b.step === "quills" && b.n === 0;
  const burning = b.step === "books";
  arm(g, sh2, vec(bookAt.x - face * 10 * s, bookAt.y + 2 * s), 4 * s, 7 * s, habit, x);
  openBook(g, gl, bookAt.x, bookAt.y, s * 1.3, C, b.step === "pages" || b.step === "censor", b.step === "pages" ? Math.sin(w.time * 20) * 3 * s : 0);
  if (burning) {
    for (let i = 0; i < 3; i++) tongue(gl, bookAt.x - 10 * s + i * 10 * s, bookAt.y - 10 * s, 9 * s, (16 + 6 * Math.sin(w.time * 12 + i * 2)) * s, Math.sin(w.time * 6 + i) * 3, i % 2 ? PAL.emberHot : PAL.ember, 0.9);
  }
  const h1 = quillUp ? vec(x + face * 10 * s, y - 110 * s) : b.step === "ink" && b.t < 1.2 ? vec(x + face * 24 * s, y - 100 * s) : vec(bookAt.x + face * 10 * s, bookAt.y - 4 * s);
  arm(g, sh1, h1, 4 * s, 7 * s, habit, x);
  g.circle(h1.x, h1.y, 3.8 * s).fill(C(0x2a2420)).stroke(ink(2));
  if (b.step === "ink" && b.t < 1.2) {
    g.circle(h1.x, h1.y - 6 * s, 6 * s).fill(C(0x14121a)).stroke(ink(3));
  } else {
    // the quill
    const qt = quillUp ? vec(h1.x + face * 4 * s, h1.y - 34 * s) : vec(h1.x + face * 16 * s, h1.y - 22 * s);
    g.moveTo(h1.x, h1.y).quadraticCurveTo((h1.x + qt.x) / 2 - face * 8 * s, (h1.y + qt.y) / 2, qt.x, qt.y).quadraticCurveTo((h1.x + qt.x) / 2 + face * 2 * s, (h1.y + qt.y) / 2, h1.x, h1.y).fill(C(0xf0ece4)).stroke(ink(2));
    if (quillUp) gl.circle(qt.x, qt.y, 12 * s).fill({ color: PAGE, alpha: 0.3 });
  }
}

// ------------------------------------------------------------------ the Organist
function organist(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.5;
  const { x, y } = e.pos;
  const fl = e.flash > 0;
  const C = (c: number) => (fl ? 0xffffff : c);
  const h = haste(b);
  const coat = C(0x1a1416);
  const look = norm(sub(w.player.pos, e.pos));
  const turn = look.x >= 0 ? 1 : -1;

  // --- the pipes speak: a glow on each pipe about to sound
  marker(gl, e, b, GOLD);
  relightTelegraph(gl, e, w, b, ["candelabra", "chandelier"], y - 110 * s, GOLD);
  const glowPipe = (i: number, k: number, color: number) => {
    const m = pipeMouth(i);
    // the pipe's mouth sits on the organ deck, a little above where its notes come out
    gl.circle(m.x, m.y - 97, 18 + 14 * k).fill({ color, alpha: 0.15 + 0.4 * k });
    gl.rect(m.x - 10, m.y - 190, 20, 120).fill({ color, alpha: 0.08 + 0.2 * k });
  };
  if (b.step === "fugue") {
    const step = 0.2 / h;
    const order = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0];
    if (b.n < order.length) glowPipe(order[b.n], clamp01(1 - (0.4 + b.n * step - b.t) / 0.3), RED);
    if (b.n > 0) glowPipe(order[b.n - 1], 0.4, PAL.holy);
  } else if (b.step === "chord" && b.mem.silent !== undefined) {
    const wind = 0.8 / h;
    const per = wind + 0.5;
    const k = Math.floor(b.t / per);
    const local = b.t - k * per;
    if (b.n % 2 === 1 && local < wind) {
      const kk = clamp01(local / wind);
      for (let i = 0; i < PIPES; i++) if (i !== b.mem.silent) glowPipe(i, kk, RED);
      // the silent pipe's lane: the one way through
      lane(gl, w, pipeMouth(b.mem.silent).x, 100, true, PAL.holy, kk, pipeMouth(0).y);
    }
  } else if ((b.step === "toccata" || b.step === "fugue") && b.mem.pipe !== undefined) {
    glowPipe(b.mem.pipe, 0.5, PAL.holy);
  }

  // --- the bench
  g.rect(x - 40 * s, y - 22 * s, 80 * s, 10 * s).fill(C(0x3a2416)).stroke(ink(4));
  for (const dx of [-34, 34]) g.rect(x + dx * s - 3 * s, y - 12 * s, 6 * s, 12 * s).fill(C(0x2a1a10)).stroke(ink(2));
  // --- seen from behind: a hunched back in a black tailcoat, tails over the bench
  g.poly([x - 22 * s, y - 64 * s, x + 22 * s, y - 64 * s, x + 26 * s, y - 20 * s, x - 26 * s, y - 20 * s]).fill(coat).stroke(ink(5));
  g.poly([x - 18 * s, y - 22 * s, x - 4 * s, y - 22 * s, x - 8 * s, y - 2 * s, x - 22 * s, y - 4 * s]).fill(coat).stroke(ink(3));
  g.poly([x + 18 * s, y - 22 * s, x + 4 * s, y - 22 * s, x + 8 * s, y - 2 * s, x + 22 * s, y - 4 * s]).fill(coat).stroke(ink(3));
  g.moveTo(x, y - 62 * s).lineTo(x, y - 24 * s).stroke({ width: 2, color: C(0x2a2226) });
  // --- arms reaching up to the manuals: playing, raised for a chord, crashing down
  const play = Math.sin(w.time * (b.step === "toccata" ? 26 : 12));
  let lift = 0;
  if (b.step === "chord") {
    const wind = 0.8 / h;
    const per = wind + 0.5;
    const local = b.t - Math.floor(b.t / per) * per;
    lift = local < wind ? clamp01(local / wind) * 30 * s : Math.max(0, 1 - (local - wind) / 0.2) * -6 * s;
  }
  for (const side of [-1, 1]) {
    const sh = vec(x + side * 20 * s, y - 60 * s);
    const hand = vec(x + side * 34 * s, y - 86 * s - lift + (side > 0 ? play : -play) * 3 * s);
    arm(g, sh, hand, 6 * s, 7 * s, coat, x);
    g.circle(hand.x, hand.y, 4 * s).fill(C(0xc8b8a8)).stroke(ink(2));
    // long spidery fingers
    for (let f = -1; f <= 1; f++) g.moveTo(hand.x, hand.y).lineTo(hand.x + f * 3 * s, hand.y - 7 * s).stroke({ width: 2, color: INK });
  }
  // --- the head from behind: wild white hair, a pale profile turned towards you, one burning eye
  const hx = x + turn * 3 * s;
  const hy = y - 76 * s;
  g.circle(hx, hy, 11 * s).fill(C(0xd8d4cc)).stroke(ink(4));
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    const r0 = 10 * s;
    const r1 = (16 + (i % 2) * 4 + Math.sin(w.time * 3 + i) * 1.5) * s;
    g.moveTo(hx + Math.cos(a) * r0, hy + Math.sin(a) * r0).lineTo(hx + Math.cos(a) * r1, hy + Math.sin(a) * r1).stroke({ width: 3, color: C(0xe8e4dc), cap: "round" });
  }
  g.ellipse(hx + turn * 8 * s, hy + 2 * s, 4 * s, 7 * s).fill(C(0xc8b8a8)).stroke(ink(2));
  g.circle(hx + turn * 9 * s, hy, 1.6 * s).fill(INK);
  gl.circle(hx + turn * 9 * s, hy, 1.1 * s).fill(GOLD);
}

// ------------------------------------------------------------------ the Glass Angel
function glassangel(g: G, gl: G, e: Unit, w: World, b: BossState): void {
  const s = e.def.size ?? 1.9;
  const x = e.pos.x;
  const ground = e.pos.y;
  const fl = e.flash > 0;
  const h = haste(b);
  const t = w.time;
  const diving = b.step === "dive" && b.n >= 2 && b.n < 3;
  const hover = diving ? 6 * s : (14 + Math.sin(t * 1.8) * 4) * s;
  const y = ground - hover;
  const cracked = b.phase >= 2;
  const panes = PAL.glass;
  const P = (i: number) => (fl ? 0xffffff : panes[i % panes.length]);
  const lead = (width = 3) => ({ width, color: INK, join: "round" as const });

  // --- what feeds her: a stream of light from every window still whole
  gl.ellipse(x, ground + 4, e.radius * 1.2, e.radius * 0.35).fill({ color: GLASS, alpha: 0.15 });
  marker(gl, e, b, GLASS);
  const windows = w.lights.filter((l) => l.kind === "window" && !l.broken);
  if (b.mem.shield === 1) {
    for (const l of windows) {
      const from = w.windowPoint(l);
      gl.moveTo(from.x, from.y).lineTo(x, y - 60 * s).stroke({ width: 3, color: PAL.holy, alpha: 0.18 });
      const k = (t * 0.6 + l.id * 0.31) % 1;
      gl.circle(from.x + (x - from.x) * k, from.y + (y - 60 * s - from.y) * k, 5).fill({ color: 0xfff8e0, alpha: 0.8 });
    }
    gl.circle(x, y - 60 * s, 70 * s).stroke({ width: 3, color: PAL.holy, alpha: 0.3 + 0.15 * Math.sin(t * 3) });
  }
  // --- telegraphs
  if (b.step === "beams" && b.mem.beamX !== undefined) {
    const to = vec(b.mem.beamX, b.mem.beamY);
    const wind = 0.9 / h;
    for (const l of windows) {
      const from = w.windowPoint(l);
      const far = add(from, scale(norm(sub(to, from)), 1800));
      if (b.n === 1) {
        const k = clamp01(b.t / wind);
        gl.moveTo(from.x, from.y).lineTo(far.x, far.y).stroke({ width: 2 + 4 * k, color: RED, alpha: 0.2 + 0.4 * k });
      } else if (b.n === 2) {
        gl.moveTo(from.x, from.y).lineTo(far.x, far.y).stroke({ width: 26, color: PAL.holy, alpha: 0.15 });
      }
    }
  }
  if (b.step === "dive" && b.n === 1) band(gl, e.pos, e.dir, 700 * 0.65, e.radius * 2, RED, 0.1 + 0.25 * clamp01(b.t / (DIVE_WIND / h)));
  if (b.step === "mend" && b.n === 1) {
    const broken = w.lights.filter((l) => l.kind === "window" && l.broken).sort((a, z) => dist(a.pos, e.pos) - dist(z.pos, e.pos))[0];
    if (broken) {
      const wp = w.windowPoint(broken);
      const k = clamp01(b.t / (1.6 / h));
      gl.moveTo(x, y - 70 * s).lineTo(x + (wp.x - x) * k, y - 70 * s + (wp.y - y + 70 * s) * k).stroke({ width: 4, color: GLASS, alpha: 0.6 });
      progressRing(gl, wp.x, wp.y + 40, 20, k, GLASS);
    }
  }
  if (b.step === "shatter" && b.n === 1) gl.circle(x, y - 60 * s, 40 + 120 * clamp01(b.t / 0.8)).stroke({ width: 4, color: GLASS, alpha: 0.6 });

  // --- wings of stained glass: spread, beating slowly, folded for a dive
  const spread = diving || (b.step === "dive" && b.n === 1) ? 0.25 : b.step === "shards" || b.step === "refraction" || b.step === "shatter" ? 1.15 : 1;
  const beat = Math.sin(t * 1.4) * 0.08;
  for (const side of [-1, 1]) {
    const root = vec(x + side * 10 * s, y - 70 * s);
    const tipA = vec(x + side * (60 + 30 * spread) * s * spread, y - (120 + 40 * spread + beat * 100) * s);
    const tipB = vec(x + side * (70 * spread + 14) * s, y - (40 - beat * 60) * s);
    const elbow = vec(x + side * (40 * spread + 10) * s, y - (110 + 20 * spread) * s);
    // the wing is a fan of panes between the root and its edge
    const edge = [elbow, tipA, vec((tipA.x + tipB.x) / 2 + side * 12 * s * spread, (tipA.y + tipB.y) / 2), tipB];
    for (let i = 0; i < edge.length - 1; i++) {
      g.poly([root.x, root.y, edge[i].x, edge[i].y, edge[i + 1].x, edge[i + 1].y]).fill({ color: P(i + (side > 0 ? 1 : 2)), alpha: 0.88 }).stroke(lead(4));
    }
    g.moveTo(root.x, root.y).lineTo(tipA.x, tipA.y).stroke({ width: 2, color: 0xfff8e0, alpha: 0.35 });
  }
  // --- the robe: long panes of glass ending in shards instead of feet
  const body = [x - 16 * s, y - 72 * s, x + 16 * s, y - 72 * s, x + 24 * s, y - 14 * s, x + 12 * s, y - 2 * s, x + 4 * s, y - 10 * s, x - 6 * s, y, x - 14 * s, y - 10 * s, x - 24 * s, y - 14 * s];
  g.poly(body).fill(fl ? 0xffffff : 0x2a4f8c).stroke(lead(5));
  const strips = [[-16, -72, -2, -72, -6, -6, -18, -14], [-2, -72, 16, -72, 20, -14, 4, -10]];
  strips.forEach((q, i) => g.poly(q.map((v, k) => (k % 2 ? y + v * s : x + v * s))).fill({ color: P(i ? 0 : 3), alpha: 0.85 }).stroke(lead(3)));
  for (const yy of [-52, -32]) g.moveTo(x - 20 * s, y + yy * s).lineTo(x + 20 * s, y + yy * s).stroke(lead(3));
  gl.poly(body).fill({ color: GLASS, alpha: b.mem.shield === 1 ? 0.18 : 0.08 });
  // --- the head: pale glass, eyes closed in prayer (open, white, when wounded)
  const hx = x;
  const hy = y - 86 * s;
  g.ellipse(hx, hy, 10 * s, 12 * s).fill(fl ? 0xffffff : 0xe8e0d0).stroke(lead(4));
  g.moveTo(hx, hy - 12 * s).lineTo(hx, hy + 12 * s).stroke(lead(2));
  if (cracked) {
    gl.ellipse(hx - 4 * s, hy - 1 * s, 2.6 * s, 1.6 * s).fill(0xffffff);
    gl.ellipse(hx + 4 * s, hy - 1 * s, 2.6 * s, 1.6 * s).fill(0xffffff);
  } else {
    for (const side of [-1, 1]) arcLine(g, hx + side * 4 * s, hy - 2 * s, 0.3, Math.PI - 0.3, 2.6 * s, 2, INK, 1);
  }
  // a halo of gold glass
  g.ellipse(hx, hy - 16 * s, 20 * s, 6 * s).stroke({ width: 6, color: INK });
  g.ellipse(hx, hy - 16 * s, 20 * s, 6 * s).stroke({ width: 3, color: fl ? 0xffffff : GOLD });
  gl.ellipse(hx, hy - 16 * s, 22 * s, 7 * s).stroke({ width: 4, color: GOLD, alpha: 0.35 });
  // --- hands joined in prayer, or thrown open
  const open = b.step === "shards" || b.step === "refraction" || b.step === "beams" || b.step === "shatter" || b.step === "mend";
  for (const side of [-1, 1]) {
    const sh = vec(x + side * 14 * s, y - 66 * s);
    const hand = open ? vec(x + side * 34 * s, y - 84 * s) : vec(x + side * 3 * s, y - 52 * s);
    g.moveTo(sh.x, sh.y).lineTo(hand.x, hand.y).stroke({ width: 10 * s, color: INK, cap: "round" });
    g.moveTo(sh.x, sh.y).lineTo(hand.x, hand.y).stroke({ width: 5 * s, color: fl ? 0xffffff : P(side > 0 ? 0 : 2), cap: "round" });
    g.circle(hand.x, hand.y, 3.5 * s).fill(fl ? 0xffffff : 0xe8e0d0).stroke(lead(2));
  }
  // --- cracks once she is wounded: light leaks through them
  if (cracked) {
    const crack = (pts: number[]) => {
      gl.moveTo(x + pts[0] * s, y + pts[1] * s);
      for (let i = 2; i < pts.length; i += 2) gl.lineTo(x + pts[i] * s, y + pts[i + 1] * s);
      gl.stroke({ width: 2.5, color: 0xfffaf0, alpha: 0.7 + 0.3 * Math.sin(t * 7) });
    };
    crack([-8, -70, -2, -58, -10, -46, -4, -30]);
    crack([10, -64, 4, -50, 12, -38]);
    crack([-3, -94, 2, -86, -2, -80]);
  }
}
