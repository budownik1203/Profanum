/** Small 2D vector helpers. Plain objects keep the game logic easy to test and serialise. */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const fromAngle = (a: number, l = 1): Vec => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/** Axis-aligned rectangle (x, y = top-left). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Closest point of a rectangle to p. */
export function closestOnRect(p: Vec, r: Rect): Vec {
  return { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) };
}

export function circleHitsRect(p: Vec, radius: number, r: Rect): boolean {
  const c = closestOnRect(p, r);
  return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < radius * radius;
}

/** Push a circle out of a rectangle. Returns the corrected centre. */
export function pushOutOfRect(p: Vec, radius: number, r: Rect): Vec {
  const c = closestOnRect(p, r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return p;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: c.x + (dx / d) * radius, y: c.y + (dy / d) * radius };
  }
  // centre inside the rectangle: leave through the nearest side
  const left = p.x - r.x;
  const right = r.x + r.w - p.x;
  const top = p.y - r.y;
  const bottom = r.y + r.h - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: r.x - radius, y: p.y };
  if (m === right) return { x: r.x + r.w + radius, y: p.y };
  if (m === top) return { x: p.x, y: r.y - radius };
  return { x: p.x, y: r.y + r.h + radius };
}

/** Does the segment a→b cross the rectangle? (slab test) */
export function segmentHitsRect(a: Vec, b: Vec, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = sub(b, a);
  const checks: [number, number][] = [
    [-d.x, a.x - r.x],
    [d.x, r.x + r.w - a.x],
    [-d.y, a.y - r.y],
    [d.y, r.y + r.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Seedable random generator (mulberry32) so tests and replays are deterministic. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
