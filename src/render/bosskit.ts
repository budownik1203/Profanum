/**
 * Drawing tools shared by all the bosses: limbs, telegraph shapes on the floor (true world geometry,
 * exactly what gets hit), gait, the marker ring under a boss and the golden relight lines.
 */
import type { Graphics } from "pixi.js";
import { type Vec, add, dist, norm, scale, sub, vec } from "../game/math.js";
import type { BossState, Light, Unit } from "../game/types.js";
import type { World } from "../game/world.js";
import { PAL } from "../palette.js";

export type G = Graphics;
export const TAU = Math.PI * 2;
export const INK = PAL.ink;
export const GOLD = 0xd8b04a;
export const RED = PAL.telegraph;
export const ink = (width = 4) => ({ width, color: INK, join: "round" as const });
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------ shared drawing helpers
export function limb(g: G, x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: width + 6, color: INK, cap: "round" });
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, cap: "round" });
}

/** An arm in two segments, the elbow pushed away from the body's middle (cx). */
export function arm(g: G, sh: Vec, hand: Vec, bend: number, width: number, color: number, cx: number): void {
  const d = sub(hand, sh);
  const L = Math.hypot(d.x, d.y) || 1;
  let p = vec(-d.y / L, d.x / L);
  const mid = vec(sh.x + d.x * 0.5, sh.y + d.y * 0.5);
  if (p.x * (mid.x - cx) < 0) p = scale(p, -1);
  const el = vec(mid.x + p.x * bend, mid.y + p.y * bend);
  g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(hand.x, hand.y).stroke({ width: width + 6, color: INK, cap: "round", join: "round" });
  g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(hand.x, hand.y).stroke({ width, color, cap: "round", join: "round" });
}

/** A slice of a disc on the floor (true world geometry: it is exactly what gets hit). */
export function sector(gl: G, x: number, y: number, angle: number, half: number, r: number, color: number, alpha: number, r0 = 0): void {
  const pts: number[] = [];
  const n = Math.max(6, Math.ceil(half * 18));
  for (let i = 0; i <= n; i++) {
    const a = angle - half + (2 * half * i) / n;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  if (r0 > 0) {
    for (let i = n; i >= 0; i--) {
      const a = angle - half + (2 * half * i) / n;
      pts.push(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    }
  } else {
    pts.push(x, y);
  }
  gl.poly(pts).fill({ color, alpha });
}

export function arcLine(gl: G, x: number, y: number, a0: number, a1: number, r: number, width: number, color: number, alpha: number): void {
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * 18));
  gl.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    gl.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  gl.stroke({ width, color, alpha, cap: "round" });
}

/** A straight strip along `dir` (a charge, a lunge). */
export function band(gl: G, from: Vec, dir: Vec, length: number, width: number, color: number, alpha: number): void {
  const px = -dir.y * (width / 2);
  const py = dir.x * (width / 2);
  const ex = from.x + dir.x * length;
  const ey = from.y + dir.y * length;
  gl.poly([from.x + px, from.y + py, ex + px, ey + py, ex - px, ey - py, from.x - px, from.y - py]).fill({ color, alpha });
  // an arrow head at the end
  const ax = ex + dir.x * width * 0.5;
  const ay = ey + dir.y * width * 0.5;
  gl.poly([ex + px * 1.3, ey + py * 1.3, ax, ay, ex - px * 1.3, ey - py * 1.3]).fill({ color, alpha: alpha * 1.4 });
}

/** A progress ring (relighting, consecrating...). */
export function progressRing(gl: G, x: number, y: number, r: number, k: number, color: number): void {
  gl.circle(x, y, r).stroke({ width: 5, color: INK, alpha: 0.8 });
  if (k > 0) arcLine(gl, x, y, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(k), r, 4, color, 1);
}

/** A flame-shaped tongue rising from (bx, by). */
export function tongue(gl: G, bx: number, by: number, width: number, height: number, lean: number, color: number, alpha: number): void {
  const hw = width / 2;
  gl.moveTo(bx - hw, by)
    .quadraticCurveTo(bx - hw * 0.8 + lean * 0.2, by - height * 0.55, bx + lean, by - height)
    .quadraticCurveTo(bx + hw * 0.8 + lean * 0.2, by - height * 0.55, bx + hw, by)
    .fill({ color, alpha });
}

/** A crescent-shaped wing of fire from root to tip. */
export function wing(gl: G, root: Vec, tip: Vec, bend: number, width: number, color: number, alpha: number): void {
  const d = sub(tip, root);
  const L = Math.hypot(d.x, d.y) || 1;
  const p = { x: -d.y / L, y: d.x / L };
  const mid = add(root, scale(d, 0.5));
  const c1 = add(mid, scale(p, bend + width));
  const c2 = add(mid, scale(p, bend - width * 0.2));
  gl.moveTo(root.x, root.y).quadraticCurveTo(c1.x, c1.y, tip.x, tip.y).quadraticCurveTo(c2.x, c2.y, root.x, root.y).fill({ color, alpha });
}

export function haste(b: BossState): number {
  return b.mem.haste ?? 1;
}

/** Which way the boss looks: along its attack, otherwise at the necromancer. */
export function lookDir(e: Unit, w: World, attacking: boolean): Vec {
  return attacking ? e.dir : norm(sub(w.player.pos, e.pos));
}

/** Gait: a swing value (-1..1) while walking, 0 when standing still. */
export function gait(b: BossState, s: number): number {
  return (b.mem.speed ?? 0) > 15 ? Math.sin((b.mem.walk ?? 0) / (13 * s)) : 0;
}

/** A dark ring under the boss so it can be found in the dark, and the roar shockwave of a new phase. */
export function marker(gl: G, e: Unit, b: BossState, color: number): void {
  const { x, y } = e.pos;
  gl.ellipse(x, y + 4, e.radius * 1.35, e.radius * 0.45).stroke({ width: 2, color, alpha: 0.35 });
  if (b.step === "phase") {
    const k = clamp01(b.t / 1.1);
    gl.circle(x, y - 40, 60 + 380 * k).stroke({ width: 10 * (1 - k) + 2, color: PAL.emberHot, alpha: 0.7 * (1 - k) });
  }
}

/**
 * A boss bringing its lights back (bosskit's relightStep): golden lines reach out to every dark
 * light it is about to relight, and a ring gathers around it.
 */
export function relightTelegraph(gl: G, e: Unit, w: World, b: BossState, kinds: Light["kind"][], fromY: number, color: number = PAL.holy): void {
  if (b.step !== "relight" && b.step !== "vespers") return;
  if (b.n !== 1) return;
  const wind = (b.mem.relightWind ?? 1.2) / haste(b);
  const k = clamp01(b.t / wind);
  const range = b.mem.relightRange ?? 900;
  const n = b.mem.relightN ?? 3;
  const targets = w.lights.filter((l) => kinds.includes(l.kind) && !l.on && !l.fallen && l.falling === undefined && dist(l.pos, e.pos) < range);
  targets.sort((a, z) => dist(a.pos, e.pos) - dist(z.pos, e.pos));
  for (const l of targets.slice(0, n)) {
    const to = vec(l.pos.x, l.pos.y - 40);
    const mid = vec(e.pos.x + (to.x - e.pos.x) * k, fromY + (to.y - fromY) * k);
    gl.moveTo(e.pos.x, fromY).lineTo(mid.x, mid.y).stroke({ width: 3, color, alpha: 0.5 });
    gl.circle(to.x, to.y, 10 + 10 * k).stroke({ width: 2, color, alpha: 0.3 + 0.5 * k });
  }
  gl.circle(e.pos.x, e.pos.y, 70 + 50 * k).stroke({ width: 3, color, alpha: 0.25 + 0.4 * k });
}

/** A small flame (a candle, a taper's tip). */
export function flameTip(gl: G, x: number, y: number, size: number, t: number, color: number = PAL.emberHot): void {
  gl.circle(x, y - 4 * size, 10 * size).fill({ color: PAL.ember, alpha: 0.25 });
  gl.poly([x - 4 * size, y, x, y - (14 + Math.sin(t * 13) * 2) * size, x + 4 * size, y]).fill(color);
}

/** Fading in and out (a veil, a blink): 0 invisible, 1 solid. */
export function fadeOf(b: BossState, step: string, outAt: number, inAt: number, total: number): number {
  if (b.step !== step) return 1;
  if (b.t < outAt) return 1 - 0.85 * clamp01(b.t / outAt);
  if (b.t < inAt) return 0.15;
  return 0.15 + 0.85 * clamp01((b.t - inAt) / Math.max(0.01, total - inAt));
}
