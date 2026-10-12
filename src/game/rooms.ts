/**
 * Hand-designed room layouts. The floor generator picks one per combat room (seeded),
 * then scales the guard count with the room's depth.
 *
 * Coordinates are in a 1800x1100 room. Door centres sit at (900,0), (900,1100), (0,550) and
 * (1800,550); layouts keep pews and guards out of those doorways (enforced again in floor.ts).
 */
import { CONFIG } from "./config.js";
import { type Vec, vec } from "./math.js";
import type { UnitKind, World } from "./world.js";

export type RoomType = "start" | "combat" | "treasure" | "boss";

interface GuardSpot {
  kind: UnitKind;
  pos: Vec;
  state: "idle" | "patrol";
  route?: Vec[];
  lantern?: boolean;
}

export interface Layout {
  name: string;
  /** false = a room of light: lit from wall to wall, the fight starts at once. */
  dark: boolean;
  covers: [number, number, number, number][];
  candles: Vec[];
  /** Guard spots in the order they get used: deeper rooms use more of them. */
  guards: GuardSpot[];
}

const idle = (kind: UnitKind, x: number, y: number): GuardSpot => ({ kind, pos: vec(x, y), state: "idle" });
const patrol = (kind: UnitKind, route: [number, number][]): GuardSpot => ({
  kind,
  pos: vec(route[0][0], route[0][1]),
  state: "patrol",
  lantern: true,
  route: route.map(([x, y]) => vec(x, y)),
});

export const COMBAT_LAYOUTS: Layout[] = [
  {
    name: "Nawa",
    dark: true,
    covers: [
      [330, 300, 170, 36], [330, 460, 170, 36], [330, 620, 170, 36], [330, 780, 170, 36],
      [1300, 300, 170, 36], [1300, 460, 170, 36], [1300, 620, 170, 36], [1300, 780, 170, 36],
    ],
    candles: [vec(160, 160), vec(1640, 160), vec(160, 940), vec(1640, 940)],
    guards: [
      idle("halberdier", 420, 380),
      idle("arquebusier", 1390, 380),
      patrol("halberdier", [[900, 300], [900, 820]]),
      idle("arquebusier", 420, 700),
      idle("halberdier", 1390, 700),
      idle("arquebusier", 260, 220),
    ],
  },
  {
    name: "Krypta",
    dark: true,
    covers: [
      [420, 300, 60, 150], [420, 650, 60, 150], [700, 470, 60, 150],
      [1040, 470, 60, 150], [1320, 300, 60, 150], [1320, 650, 60, 150],
    ],
    candles: [vec(900, 550), vec(200, 200), vec(1600, 900)],
    guards: [
      idle("arquebusier", 520, 380),
      idle("halberdier", 1240, 740),
      idle("arquebusier", 1240, 380),
      patrol("halberdier", [[560, 860], [1240, 860], [1240, 240], [560, 240]]),
      idle("halberdier", 520, 740),
      idle("arquebusier", 900, 300),
    ],
  },
  {
    name: "Kaplica",
    dark: false, // a room of light: no hiding, the fight starts at once
    covers: [[560, 330, 150, 36], [1090, 330, 150, 36], [560, 740, 150, 36], [1090, 740, 150, 36], [300, 520, 36, 120], [1460, 520, 36, 120]],
    candles: [vec(300, 220), vec(1500, 220), vec(300, 880), vec(1500, 880), vec(900, 220), vec(900, 880)],
    guards: [
      idle("halberdier", 640, 260),
      idle("arquebusier", 1500, 400),
      idle("halberdier", 1160, 820),
      idle("arquebusier", 300, 400),
      idle("halberdier", 1160, 260),
      idle("arquebusier", 640, 820),
    ],
  },
  {
    name: "Zbrojownia",
    dark: true,
    covers: [[480, 420, 140, 60], [1180, 420, 140, 60], [480, 620, 140, 60], [1180, 620, 140, 60], [830, 260, 140, 40], [830, 800, 140, 40]],
    candles: [vec(900, 540), vec(150, 150)],
    guards: [
      patrol("halberdier", [[300, 300], [1500, 300]]),
      idle("arquebusier", 1500, 820),
      patrol("halberdier", [[1500, 820], [300, 820]]),
      idle("arquebusier", 300, 820),
      idle("halberdier", 1400, 260),
      idle("arquebusier", 900, 440),
    ],
  },
];

/** Apply a layout to an empty room. `guardCount` takes the first n guard spots. */
export function applyLayout(w: World, layout: Layout, guardCount: number): void {
  w.dark = true; // every room has candles and darkness; a "room of light" just starts with the alarm
  w.alarm = !layout.dark;
  for (const [x, y, cw, ch] of layout.covers) w.addCover(x, y, cw, ch);
  for (const c of layout.candles) w.addLight("candle", c);
  if (!layout.dark) {
    // light floods the whole room: extra candles along the walls
    for (const x of [450, 1350]) for (const y of [140, 960]) w.addLight("candle", vec(x, y));
  }
  for (const g of layout.guards.slice(0, guardCount)) {
    w.spawn(g.kind, g.pos, "enemy", layout.dark ? { state: g.state, route: g.route, lantern: g.lantern } : { lantern: g.lantern });
  }
}

/** The quiet room where the necromancer rises. */
export function applyStart(w: World): void {
  w.dark = true;
  w.alarm = false;
  w.addLight("candle", vec(900, 380));
  w.addCover(500, 520, 150, 36);
  w.addCover(1150, 520, 150, 36);
}

/** Treasure room: a bone altar that heals and gives souls. */
export function applyTreasure(w: World): void {
  w.dark = true;
  w.alarm = false;
  w.shrine = { pos: vec(900, 500), used: false };
  w.addLight("candle", vec(780, 420));
  w.addLight("candle", vec(1020, 420));
}

/** The floor's last room: for now a Captain of the Guard with a strong squad (a real boss comes later). */
export function applyBoss(w: World): void {
  w.dark = true;
  w.alarm = true;
  for (const [x, y, cw, ch] of [[520, 380, 150, 40], [1130, 380, 150, 40], [520, 700, 150, 40], [1130, 700, 150, 40]] as const) {
    w.addCover(x, y, cw, ch);
  }
  for (const c of [vec(300, 200), vec(1500, 200), vec(300, 900), vec(1500, 900), vec(900, 200)]) w.addLight("candle", c);
  const captain = w.spawn("halberdier", vec(900, 300));
  captain.elite = true;
  captain.hp = captain.maxHp = CONFIG.halberdier.hp * 4;
  captain.radius = 30;
  w.spawn("arquebusier", vec(400, 260));
  w.spawn("arquebusier", vec(1400, 260));
  w.spawn("halberdier", vec(600, 300));
  w.spawn("halberdier", vec(1200, 300));
}
