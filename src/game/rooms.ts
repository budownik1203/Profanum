/**
 * Hand-designed room layouts. The floor generator picks one per combat room (seeded),
 * then scales the guard count with the room's depth.
 *
 * Coordinates are in a 1800x1100 room. Door centres sit at (900,0), (900,1100), (0,550) and
 * (1800,550); layouts keep pews, guards and light out of those doorways (enforced again in floor.ts).
 */
import { CONFIG } from "./config.js";
import { type Vec, vec } from "./math.js";
import type { LightKind, Side, UnitKind, World } from "./world.js";

export type RoomType = "start" | "combat" | "treasure" | "boss";

interface GuardSpot {
  kind: UnitKind;
  pos: Vec;
  state: "idle" | "patrol";
  route?: Vec[];
  lantern?: boolean;
  /** Carries a taper and relights what the necromancer put out. */
  lamplighter?: boolean;
}

/** A fixed light: [kind, x, y]. Torches and windows hang on the wall nearest to them. */
type LightSpot = [Exclude<LightKind, "lantern" | "flash">, number, number];

export interface Layout {
  name: string;
  /** false = a room of light: the fight starts at once, no ambush. */
  dark: boolean;
  covers: [number, number, number, number][];
  /**
   * Rooms are bright: a chandelier, candelabra, torches, stained glass. The darkness sits at the
   * edges and by the doors, and the necromancer widens it by shooting the lights out.
   */
  lights: LightSpot[];
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
/** The lamplighter: third guard in every layout, so he shows up from the first rooms on. */
const lamplighter = (kind: UnitKind, x: number, y: number): GuardSpot => ({ kind, pos: vec(x, y), state: "idle", lamplighter: true });

// Torches stand 92 px from the wall line so their flame (30 px up) sits just off the wall face.
export const COMBAT_LAYOUTS: Layout[] = [
  {
    name: "Nawa",
    dark: true,
    covers: [
      [330, 300, 170, 36], [330, 460, 170, 36], [330, 620, 170, 36], [330, 780, 170, 36],
      [1300, 300, 170, 36], [1300, 460, 170, 36], [1300, 620, 170, 36], [1300, 780, 170, 36],
    ],
    lights: [
      ["chandelier", 900, 560],
      ["candelabra", 560, 300], ["candelabra", 1240, 300], ["candelabra", 560, 810], ["candelabra", 1240, 810],
      ["window", 420, 200], ["window", 1380, 200],
    ],
    guards: [
      idle("halberdier", 420, 380),
      idle("arquebusier", 1390, 380),
      lamplighter("halberdier", 900, 420),
      idle("arquebusier", 420, 700),
      patrol("halberdier", [[900, 300], [900, 820]]),
      idle("halberdier", 1390, 700),
    ],
  },
  {
    name: "Krypta",
    dark: true,
    covers: [
      [420, 300, 60, 150], [420, 650, 60, 150], [700, 470, 60, 150],
      [1040, 470, 60, 150], [1320, 300, 60, 150], [1320, 650, 60, 150],
    ],
    lights: [
      ["candelabra", 900, 550], ["candelabra", 900, 880],
      ["torch", 440, 92], ["torch", 1360, 92],
      ["candle", 590, 380], ["candle", 1210, 720], ["candle", 590, 720], ["candle", 1210, 380],
    ],
    guards: [
      idle("arquebusier", 520, 380),
      idle("halberdier", 1240, 740),
      lamplighter("arquebusier", 900, 640),
      patrol("halberdier", [[560, 860], [1240, 860], [1240, 240], [560, 240]]),
      idle("halberdier", 520, 740),
      idle("arquebusier", 1240, 380),
    ],
  },
  {
    name: "Kaplica",
    dark: false, // a room of light: the fight starts at once
    covers: [[560, 330, 150, 36], [1090, 330, 150, 36], [560, 740, 150, 36], [1090, 740, 150, 36], [300, 520, 36, 120], [1460, 520, 36, 120]],
    lights: [
      ["window", 520, 210], ["window", 1280, 210],
      ["chandelier", 900, 560],
      ["candelabra", 440, 520], ["candelabra", 1360, 520], ["candelabra", 620, 860], ["candelabra", 1180, 860],
    ],
    guards: [
      idle("halberdier", 640, 260),
      idle("arquebusier", 1500, 400),
      lamplighter("halberdier", 1160, 820),
      idle("arquebusier", 300, 400),
      idle("halberdier", 1160, 260),
      idle("arquebusier", 640, 820),
    ],
  },
  {
    name: "Zbrojownia",
    dark: true,
    covers: [[480, 420, 140, 60], [1180, 420, 140, 60], [480, 620, 140, 60], [1180, 620, 140, 60], [830, 260, 140, 40], [830, 800, 140, 40]],
    lights: [
      ["chandelier", 900, 550],
      ["torch", 500, 92], ["torch", 1300, 92],
      ["candelabra", 480, 330], ["candelabra", 1320, 790],
      ["candle", 1320, 330], ["candle", 480, 790],
    ],
    guards: [
      patrol("halberdier", [[300, 300], [1500, 300]]),
      idle("arquebusier", 1500, 820),
      lamplighter("halberdier", 900, 700),
      idle("arquebusier", 300, 820),
      patrol("halberdier", [[1500, 820], [300, 820]]),
      idle("arquebusier", 900, 440),
    ],
  },
];

/** The wall a torch or window hangs on: the nearest one. */
function nearestWall(x: number, y: number): Side {
  const { width: W, height: H } = CONFIG.room;
  const d: [Side, number][] = [["N", y], ["S", H - y], ["W", x], ["E", W - x]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

export function addLights(w: World, lights: LightSpot[]): void {
  for (const [kind, x, y] of lights) {
    w.addLight(kind, vec(x, y), kind === "torch" || kind === "window" ? { wall: nearestWall(x, y) } : {});
  }
}

/** Apply a layout to an empty room. `guardCount` takes the first n guard spots. */
export function applyLayout(w: World, layout: Layout, guardCount: number): void {
  w.dark = true; // every room has light and darkness; a "room of light" just starts with the alarm
  w.alarm = !layout.dark;
  for (const [x, y, cw, ch] of layout.covers) w.addCover(x, y, cw, ch);
  addLights(w, layout.lights);
  for (const g of layout.guards.slice(0, guardCount)) {
    const opts = { lantern: g.lantern, lamplighter: g.lamplighter };
    w.spawn(g.kind, g.pos, "enemy", layout.dark ? { ...opts, state: g.state, route: g.route } : opts);
  }
}

/** The quiet room where the necromancer rises: a mass grave lit by a single candle. */
export function applyStart(w: World): void {
  w.dark = true;
  w.alarm = false;
  addLights(w, [["candle", 900, 380], ["torch", 500, 92], ["torch", 1300, 92]]);
  w.addCover(500, 520, 150, 36);
  w.addCover(1150, 520, 150, 36);
}

/** Treasure room: a bone altar that heals and gives souls. */
export function applyTreasure(w: World): void {
  w.dark = true;
  w.alarm = false;
  w.shrine = { pos: vec(900, 500), used: false };
  addLights(w, [["candle", 780, 420], ["candle", 1020, 420]]);
}

/** The floor's last room: for now a Captain of the Guard with a strong squad (a real boss comes later). */
export function applyBoss(w: World): void {
  w.dark = true;
  w.alarm = true;
  for (const [x, y, cw, ch] of [[520, 380, 150, 40], [1130, 380, 150, 40], [520, 700, 150, 40], [1130, 700, 150, 40]] as const) {
    w.addCover(x, y, cw, ch);
  }
  // the Captain fights under stained glass: holy light burns, so the windows are worth breaking
  addLights(w, [
    ["chandelier", 900, 560], ["window", 500, 210], ["window", 1300, 210],
    ["candelabra", 450, 700], ["candelabra", 1350, 700], ["torch", 92, 230], ["torch", 1708, 230],
  ]);
  const captain = w.spawn("halberdier", vec(900, 300));
  captain.elite = true;
  captain.hp = captain.maxHp = CONFIG.halberdier.hp * 4;
  captain.radius = 30;
  w.spawn("arquebusier", vec(400, 260));
  w.spawn("arquebusier", vec(1400, 260));
  w.spawn("halberdier", vec(600, 300));
  w.spawn("halberdier", vec(1200, 300), "enemy", { lamplighter: true });
}
