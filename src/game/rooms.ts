/**
 * Room templates and how each kind of room is furnished (design doc: Pokoje).
 *
 * A combat template is a generic arrangement: covers ("f" topple-able, "s" solid, "b" barrel spot),
 * lights and guard spots with roles. The floor decides what they become: on the cemetery a
 * topple-able cover is a coffin and the chandelier a burning stake, in the cathedral a pew and a
 * chandelier. Templates may be mirrored, so the same plan reads differently.
 *
 * Doors sit in the middle of each wall; floor.ts keeps covers, guards and light off the doorways.
 */
import { CONFIG } from "./config.js";
import { type Vec, vec } from "./math.js";
import { floorDef, type FloorDef, type SecretFloorDef, type SecretId } from "./data/floors.js";
import type { UnitKind } from "./data/units.js";
import type { Champion, LightKind, Side } from "./types.js";
import type { World } from "./world.js";
import { addChest, placePickup, stockShop } from "./loot.js";
import { pick } from "./shared.js";
import { drillFor, formSquads } from "./tactics.js";

export type RoomType = "start" | "combat" | "treasure" | "shop" | "altar" | "miniboss" | "boss" | "secret" | "final" | "guardian";

type CoverRole = "f" | "s" | "b";
type SlotRole = "m" | "r" | "s" | "p" | "l";
type LightSpot = [Exclude<LightKind, "lantern" | "flash" | "fire" | "censer" | "carried">, number, number];

export interface Template {
  name: string;
  w: number;
  h: number;
  /** A room of light: no ambush, the fight starts at once. */
  light?: boolean;
  covers: [number, number, number, number, CoverRole][];
  lights: LightSpot[];
  /** Guard spots in the order they are used: m melee, r ranged, s special, p patrol, l lamplighter. */
  slots: [SlotRole, number, number, [number, number][]?][];
}

export const TEMPLATES: Template[] = [
  {
    name: "nawa", w: 1800, h: 1100,
    covers: [
      [330, 300, 170, 36, "f"], [330, 460, 170, 36, "f"], [330, 620, 170, 36, "f"], [330, 780, 170, 36, "f"],
      [1300, 300, 170, 36, "f"], [1300, 460, 170, 36, "f"], [1300, 620, 170, 36, "f"], [1300, 780, 170, 36, "f"],
    ],
    lights: [
      ["chandelier", 900, 560],
      ["candelabra", 560, 300], ["candelabra", 1240, 300], ["candelabra", 560, 810], ["candelabra", 1240, 810],
      ["window", 420, 200], ["window", 1380, 200],
    ],
    slots: [["m", 420, 380], ["r", 1390, 380], ["l", 900, 470], ["r", 420, 700], ["p", 900, 300, [[900, 300], [900, 820]]], ["m", 1390, 700], ["s", 260, 540], ["r", 1540, 540]],
  },
  {
    name: "krypta", w: 1800, h: 1100,
    covers: [[420, 300, 60, 150, "s"], [420, 650, 60, 150, "s"], [700, 470, 60, 150, "f"], [1040, 470, 60, 150, "f"], [1320, 300, 60, 150, "s"], [1320, 650, 60, 150, "s"]],
    lights: [
      ["candelabra", 900, 550], ["candelabra", 900, 880],
      ["torch", 440, 92], ["torch", 1360, 92],
      ["candle", 590, 380], ["candle", 1210, 720], ["candle", 590, 720], ["candle", 1210, 380],
    ],
    slots: [["r", 520, 380], ["m", 1240, 740], ["l", 900, 640], ["p", 560, 860, [[560, 860], [1240, 860], [1240, 240], [560, 240]]], ["m", 520, 740], ["r", 1240, 380], ["s", 900, 300]],
  },
  {
    name: "kaplica", w: 1800, h: 1100, light: true,
    covers: [[560, 330, 150, 36, "f"], [1090, 330, 150, 36, "f"], [560, 740, 150, 36, "f"], [1090, 740, 150, 36, "f"], [300, 520, 36, 120, "s"], [1460, 520, 36, 120, "s"]],
    lights: [
      ["window", 520, 210], ["window", 1280, 210],
      ["chandelier", 900, 560],
      ["candelabra", 440, 520], ["candelabra", 1360, 520], ["candelabra", 620, 860], ["candelabra", 1180, 860],
    ],
    slots: [["m", 640, 260], ["r", 1500, 400], ["l", 1160, 820], ["r", 300, 400], ["m", 1160, 260], ["r", 640, 820], ["s", 900, 420]],
  },
  {
    name: "zbrojownia", w: 1800, h: 1100,
    covers: [[480, 420, 140, 60, "f"], [1180, 420, 140, 60, "f"], [480, 620, 140, 60, "f"], [1180, 620, 140, 60, "f"], [830, 260, 140, 40, "s"], [830, 800, 140, 40, "s"]],
    lights: [
      ["chandelier", 900, 550],
      ["torch", 500, 92], ["torch", 1300, 92],
      ["candelabra", 480, 330], ["candelabra", 1320, 790],
      ["candle", 1320, 330], ["candle", 480, 790],
    ],
    slots: [["p", 300, 300, [[300, 300], [1500, 300]]], ["r", 1500, 820], ["l", 900, 700], ["r", 300, 820], ["m", 1400, 260], ["s", 900, 440], ["m", 600, 560]],
  },
  {
    name: "dziedziniec", w: 2100, h: 1300,
    covers: [
      [970, 570, 160, 160, "s"],
      [360, 300, 170, 40, "f"], [360, 380, 40, 120, "s"], [1570, 300, 170, 40, "f"], [1700, 380, 40, 120, "s"],
      [360, 960, 170, 40, "f"], [360, 820, 40, 120, "s"], [1570, 960, 170, 40, "f"], [1700, 820, 40, 120, "s"],
      [760, 560, 40, 180, "f"], [1300, 560, 40, 180, "f"],
      [600, 640, 40, 40, "b"], [1460, 640, 40, 40, "b"],
    ],
    lights: [
      ["candelabra", 820, 450], ["candelabra", 1280, 450], ["candelabra", 820, 850], ["candelabra", 1280, 850],
      ["torch", 600, 92], ["torch", 1500, 92], ["candle", 480, 700], ["candle", 1620, 700],
    ],
    slots: [["m", 600, 420], ["r", 1500, 420], ["l", 1050, 470], ["r", 600, 880], ["m", 1500, 880], ["p", 750, 350, [[750, 350], [1350, 350], [1350, 950], [750, 950]]], ["s", 300, 650], ["r", 1800, 650]],
  },
  {
    name: "galeria", w: 2200, h: 1000,
    covers: [
      [420, 300, 60, 60, "s"], [720, 300, 60, 60, "s"], [1420, 300, 60, 60, "s"], [1720, 300, 60, 60, "s"],
      [420, 640, 60, 60, "s"], [720, 640, 60, 60, "s"], [1420, 640, 60, 60, "s"], [1720, 640, 60, 60, "s"],
      [540, 470, 120, 36, "f"], [1540, 470, 120, 36, "f"], [1000, 300, 40, 40, "b"],
    ],
    lights: [["candelabra", 700, 500], ["candelabra", 1500, 500], ["window", 600, 200], ["window", 1600, 200], ["candle", 300, 250], ["candle", 1900, 750]],
    slots: [["r", 450, 200], ["r", 1750, 800], ["m", 900, 500], ["l", 1300, 500], ["m", 1700, 220], ["s", 500, 800], ["p", 400, 500, [[400, 500], [1800, 500]]], ["r", 1100, 780]],
  },
  {
    name: "cela", w: 1400, h: 900,
    covers: [[400, 300, 140, 36, "f"], [860, 560, 140, 36, "f"], [300, 600, 40, 40, "s"], [1060, 260, 40, 40, "s"]],
    lights: [["candle", 350, 200], ["candle", 1050, 700], ["torch", 400, 92], ["torch", 1000, 92], ["candelabra", 700, 450]],
    slots: [["m", 420, 450], ["r", 1000, 330], ["l", 700, 600], ["m", 1100, 650], ["s", 300, 720]],
  },
  {
    name: "rozstaje", w: 1900, h: 1200,
    covers: [
      [500, 350, 120, 36, "f"], [700, 520, 120, 36, "f"], [1100, 640, 120, 36, "f"], [1300, 810, 120, 36, "f"],
      [1300, 300, 40, 140, "s"], [560, 760, 40, 140, "s"], [820, 300, 40, 40, "b"], [1050, 880, 40, 40, "b"],
    ],
    lights: [["chandelier", 950, 600], ["candelabra", 450, 600], ["candelabra", 1450, 600], ["window", 500, 200], ["window", 1400, 200], ["candle", 300, 950], ["candle", 1600, 300]],
    slots: [["m", 600, 300], ["r", 1400, 900], ["l", 950, 470], ["r", 400, 900], ["m", 1500, 300], ["s", 950, 800], ["p", 600, 950, [[600, 950], [1300, 950]]], ["r", 1650, 600]],
  },
  {
    name: "plac", w: 2000, h: 1200, light: true,
    covers: [
      [620, 360, 150, 36, "f"], [1230, 360, 150, 36, "f"], [620, 820, 150, 36, "f"], [1230, 820, 150, 36, "f"],
      [520, 560, 36, 120, "s"], [1444, 560, 36, 120, "s"], [960, 280, 80, 36, "f"], [960, 900, 80, 36, "f"],
    ],
    lights: [["chandelier", 1000, 600], ["candelabra", 560, 300], ["candelabra", 1440, 300], ["candelabra", 560, 900], ["candelabra", 1440, 900]],
    slots: [["m", 700, 460], ["r", 1300, 460], ["m", 700, 760], ["r", 1300, 760], ["s", 1000, 460], ["l", 1000, 760], ["r", 400, 600], ["m", 1600, 600]],
  },
];

// ------------------------------------------------------------------ furnishing
/** Lights a template asks for, as this floor has them; windows become wall torches outdoors. */
function themedLights(w: World, def: FloorDef, lights: LightSpot[], mirror: boolean): void {
  for (const [kind, x0, y] of lights) {
    const x = mirror ? w.room.w - x0 : x0;
    const mapped = def.lightMap[kind] === undefined ? kind : def.lightMap[kind];
    if (!mapped) continue;
    if (kind === "window" && mapped === "torch") {
      w.addLight("torch", vec(x, 92), { wall: "N" });
      continue;
    }
    w.addLight(mapped, vec(x, y), mapped === "torch" || mapped === "window" ? { wall: nearestWall(w, x, y) } : {});
  }
}

export function nearestWall(w: World, x: number, y: number): Side {
  const d: [Side, number][] = [["N", y], ["S", w.room.h - y], ["W", x], ["E", w.room.w - x]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

/** Who stands on a guard spot of this role, on this floor. */
function kindFor(def: FloorDef, role: SlotRole, rng: () => number): UnitKind {
  if (role === "r") return pick(rng, def.ranged);
  if (role === "s") return pick(rng, def.special);
  if (role === "l") return pick(rng, rng() < 0.5 ? def.melee : def.ranged);
  return pick(rng, def.melee);
}

/** A combat (or mini-boss) room from a template, peopled by the floor's factions. */
export function applyTemplate(w: World, t: Template, depthOrDef: number | FloorDef, guardCount: number, rng: () => number, opts: { mirror?: boolean } = {}): void {
  const def = typeof depthOrDef === "number" ? floorDef(depthOrDef) : depthOrDef;
  const mirror = opts.mirror ?? false;
  const mx = (x: number, width = 0) => (mirror ? w.room.w - x - width : x);
  w.theme = def.id;
  w.dark = true; // every room has light and darkness; a "room of light" just starts with the alarm
  w.alarm = t.light ?? false;
  for (const [x, y, cw, ch, role] of t.covers) {
    if (role === "b") {
      if (rng() < def.barrels) w.addCover(mx(x, cw), y, cw, ch, rng() < 0.6 ? "powder" : "oil");
      continue;
    }
    w.addCover(mx(x, cw), y, cw, ch, role === "f" ? def.flip : def.solid);
  }
  themedLights(w, def, t.lights, mirror);
  let bellringer = false;
  let lamplighter = false;
  // some garrisons are drilled: their places go to the men of one formation (tactics.ts)
  const drill = drillFor(def, def.depth, rng);
  const drilled = (role: string): UnitKind | undefined =>
    !drill ? undefined : role === "r" ? drill.ranged : role === "m" || role === "p" ? drill.melee : role === "s" ? drill.special : undefined;
  // more guards than places: the extra ones stand beside the first places (no patrols for them)
  const slots = t.slots.slice(0, guardCount);
  for (let i = 0; slots.length < guardCount && i < t.slots.length * 2; i++) {
    const [role, x, y] = t.slots[i % t.slots.length];
    if (role === "l" || role === "p") continue;
    slots.push([role, x + (i % 2 ? 70 : -70), y + 55, undefined]);
  }
  slots.forEach(([role, x0, y, route]) => {
    const pos = vec(mx(x0), y);
    const kind = drilled(role) ?? kindFor(def, role, rng);
    const aware = t.light ? {} : { state: (role === "p" ? "patrol" : "idle") as "patrol" | "idle", route: route?.map(([rx, ry]) => vec(mx(rx), ry)) };
    w.spawn(kind, pos, undefined, {
      ...aware,
      lantern: role === "p",
      lamplighter: role === "l" && !lamplighter,
    });
    if (role === "l") lamplighter = true;
    if (kind === "bellringer") bellringer = true;
    // a sergeant never walks without his dog
    if (kind === "sergeant") w.spawn("dog", vec(pos.x + 50, pos.y + 30), undefined, t.light ? {} : { state: "idle" });
  });
  if (bellringer && def.bells) w.addInteractable("bell", vec(mx(Math.round(w.room.w * 0.25)), 120), { radius: 60 });
  addElites(w, def, rng);
  formSquads(w, rng, def.depth, drill);
  addChampions(w, def.depth, rng);
}

const CHAMPIONS: Champion[] = ["swift", "armored", "explosive", "splitting", "healer", "shadow", "vengeful"];

/** Now and then one of the floor's elite fighters stands among the guards (more often deeper). */
export function addElites(w: World, def: FloorDef, rng: () => number): void {
  const e = CONFIG.elites;
  const guards = w.units.filter((u) => u.team !== "minion" && !u.def.boss && !u.lamplighter && u.kind !== "sergeant");
  if (!guards.length || !def.elite.length || rng() >= Math.min(e.roomMax, e.roomBase + e.roomPerDepth * (def.depth - 1))) return;
  // he takes the place of one ordinary man
  const old = pick(rng, guards);
  w.units = w.units.filter((u) => u !== old);
  w.lights = w.lights.filter((l) => l.owner !== old.id);
  w.spawn(pick(rng, def.elite), old.pos, undefined, old.state === "idle" || old.state === "patrol" ? { state: "idle" } : {});
}

/** Some ordinary men are champions: one gift each, an aura to tell them by. */
export function addChampions(w: World, depth: number, rng: () => number, chanceMul = 1): void {
  const c = CONFIG.champions;
  const p = Math.min(c.max, c.base + c.perDepth * (depth - 1)) * chanceMul;
  for (const u of w.units) {
    if (u.team === "minion" || u.def.boss || u.elite || u.leader || u.mini || u.kind === "rat") continue;
    if (rng() < p) u.champion = pick(rng, CHAMPIONS);
  }
}

/**
 * A trial room (instead of the old elite quarters): the template's furniture and lights, nobody
 * home, a pillory of trial in the middle. Touch it and the doors slam: three or four waves, the
 * last with elites and champions, then a chest, cursed remains and Echo.
 */
export function applyTrial(w: World, t: Template, def: FloorDef, rng: () => number, mirror: boolean): void {
  applyTemplate(w, t, def, 0, rng, { mirror });
  w.alarm = false;
  const c = vec(w.room.w / 2, w.room.h / 2);
  w.covers = w.covers.filter((cv) => Math.hypot(cv.x + cv.w / 2 - c.x, cv.y + cv.h / 2 - c.y) > 200);
  w.addInteractable("trial", c, { radius: 110 });
  w.addLight("brazier", vec(c.x - 150, c.y - 40));
  w.addLight("brazier", vec(c.x + 150, c.y - 40));
  const pool = (k: "melee" | "ranged" | "special") => def[k];
  const waves: [UnitKind, Champion | ""][][] = [];
  const count = 3 + (def.depth >= 3 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const n = 3 + i + Math.floor(def.depth / 2);
    const wave: [UnitKind, Champion | ""][] = [];
    for (let k = 0; k < n; k++) {
      const role = k % 3 === 0 ? "ranged" : k % 3 === 1 ? "melee" : "special";
      const gift = rng() < 0.12 + 0.1 * i ? pick(rng, CHAMPIONS) : "";
      wave.push([pick(rng, pool(role)), gift]);
    }
    // the last waves bring the floor's elites
    if (i >= count - 2 && def.elite.length) wave.push([pick(rng, def.elite), ""]);
    waves.push(wave);
  }
  w.trial = { active: false, done: false, waves, wave: 0, t: 0, depth: def.depth };
}

/** The quiet room each floor starts in (the mass grave on the cemetery). */
export function applyStart(w: World, depth: number): void {
  const def = floorDef(depth);
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  w.addCover(380, 380, 150, 36, def.flip);
  w.addCover(870, 380, 150, 36, def.flip);
  w.addLight("candle", vec(700, 300));
  w.addLight("torch", vec(350, 92), { wall: "N" });
  w.addLight("torch", vec(1050, 92), { wall: "N" });
  if (depth === 1) {
    // the grave the burnt heretics were thrown into
    for (const [x, y] of [[560, 560], [620, 600], [780, 580], [840, 540]] as const) {
      w.corpses.push({ id: -x - y, kind: "peasant", pos: vec(x, y), dir: vec(x > 700 ? 1 : -1, 0), echo: 0, raises: 2, fromMinion: true, big: true });
    }
  }
}

/** A treasure room: one chest on a dais; deeper floors hold better ones. */
export function applyTreasure(w: World, depth: number, rng: () => number): void {
  const def = floorDef(depth);
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  const r = rng() + depth * 0.06;
  addChest(w, r > 0.85 ? "reliquary" : r > 0.5 ? "iron" : "wood", vec(w.room.w / 2, w.room.h / 2 - 40));
  w.addLight("candle", vec(w.room.w / 2 - 120, w.room.h / 2 - 90));
  w.addLight("candle", vec(w.room.w / 2 + 120, w.room.h / 2 - 90));
  w.addLight("torch", vec(300, 92), { wall: "N" });
  w.addLight("torch", vec(w.room.w - 300, 92), { wall: "N" });
}

/** The fence: a hooded trader of foul goods behind a counter (design doc: Paser). */
export function applyShop(w: World, depth: number): void {
  const def = floorDef(depth);
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  const at = vec(w.room.w / 2, 300);
  w.addInteractable("fence", at, { radius: 110, ref: "fence" });
  w.addCover(at.x - 360, at.y + 40, 720, 30, "crate");
  stockShop(w, vec(at.x, at.y + 60));
  w.addLight("candelabra", vec(at.x - 420, at.y + 40));
  w.addLight("candelabra", vec(at.x + 420, at.y + 40));
  w.addLight("candle", vec(at.x - 120, at.y + 20));
  w.addLight("candle", vec(at.x + 120, at.y + 20));
  // the wares lie in candlelight, so you can see what you pay for
  w.addLight("candle", vec(at.x - 225, at.y + 205));
  w.addLight("candle", vec(at.x + 75, at.y + 205));
  w.addLight("candle", vec(at.x + 225, at.y + 205));
  w.addLight("candle", vec(at.x - 75, at.y + 205));
}

/** The desecrated altar: legends are raised here and sanctified with a sacrifice. */
export function applyAltar(w: World, depth: number): void {
  const def = floorDef(depth);
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  const at = vec(w.room.w / 2, w.room.h / 2 - 80);
  w.addInteractable("altar", at, { radius: 120 });
  w.addLight("candelabra", vec(at.x - 230, at.y));
  w.addLight("candelabra", vec(at.x + 230, at.y));
  w.addCover(at.x - 360, at.y + 260, 40, 40, def.solid);
  w.addCover(at.x + 320, at.y + 260, 40, 40, def.solid);
}

/** Catacombs under the floor: a reliquary, a bone shrine, a note and an echo of souls. */
export function applySecret(w: World, depth: number, noteIndex: number, hatch: SecretId | null = null): void {
  w.theme = "krypta";
  w.dark = true;
  w.alarm = false;
  addChest(w, "reliquary", vec(w.room.w / 2, w.room.h / 2 - 120));
  w.shrine = { pos: vec(w.room.w / 2 - 260, w.room.h / 2 + 60), used: false };
  placePickup(w, "note", vec(w.room.w / 2 + 260, w.room.h / 2 + 60), noteIndex);
  placePickup(w, "echo", vec(w.room.w / 2, w.room.h / 2 + 120), 4 + depth);
  w.addLight("candle", vec(w.room.w / 2 - 300, w.room.h / 2 - 20));
  w.addLight("candle", vec(w.room.w / 2 + 300, w.room.h / 2 - 20));
  w.addLight("brazier", vec(w.room.w / 2, w.room.h / 2 + 260));
  // a trapdoor with a padlock: the way down to a secret floor
  if (hatch) {
    const at = vec(w.room.w / 2 + 330, w.room.h / 2 + 250);
    w.addInteractable("hatch", at, { radius: 80, ref: hatch });
    w.addLight("candle", vec(at.x - 100, at.y - 40));
  }
}

/** The bottom of the ladder on a secret floor: quiet, dark, a single candle. */
export function applyLanding(w: World, def: SecretFloorDef): void {
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  w.addCover(380, 380, 150, 36, def.flip);
  w.addCover(870, 380, 150, 36, def.flip);
  w.addLight("candle", vec(700, 300));
  w.addLight("torch", vec(350, 92), { wall: "N" });
  w.addLight("torch", vec(1050, 92), { wall: "N" });
}

/** A secret floor's vault: always a reliquary, and gold for whoever got this far. */
export function applyVault(w: World, def: SecretFloorDef): void {
  w.theme = def.id;
  w.dark = true;
  w.alarm = false;
  addChest(w, "reliquary", vec(w.room.w / 2, w.room.h / 2 - 40));
  for (let i = 0; i < 6; i++) placePickup(w, "gold", vec(w.room.w / 2 - 150 + i * 60, w.room.h / 2 + 140), 5);
  w.addLight("candle", vec(w.room.w / 2 - 120, w.room.h / 2 - 90));
  w.addLight("candle", vec(w.room.w / 2 + 120, w.room.h / 2 - 90));
}

/** The guardian of a secret floor: an elite with his escort in one of the usual rooms. */
export function applyGuardian(w: World, t: Template, def: SecretFloorDef, rng: () => number): void {
  applyTemplate(w, t, def, 0, rng);
  w.alarm = true;
  const c = vec(w.room.w / 2, w.room.h * 0.4);
  const g = w.spawn(def.guardian, c);
  // the guardian has one champion's gift of his own
  g.champion = pick(rng, ["armored", "healer", "vengeful"] as Champion[]);
  def.escort.forEach((k, i) => w.spawn(k, vec(c.x + (i - 1) * 240, c.y + 160 + (i % 2) * 60)));
}

/** Room sizes for the special rooms. */
export function roomSize(type: RoomType, template?: Template): { w: number; h: number } {
  switch (type) {
    case "combat":
    case "miniboss":
      return template ? { w: template.w, h: template.h } : { w: CONFIG.room.width, h: CONFIG.room.height };
    case "start":
      return { w: 1400, h: 900 };
    case "treasure":
      return { w: 1300, h: 900 };
    case "shop":
      return { w: 1600, h: 1000 };
    case "altar":
      return { w: 1300, h: 1000 };
    case "secret":
      return { w: 1200, h: 900 };
    case "boss":
    case "final":
      return { w: 2200, h: 1400 };
    case "guardian":
      return template ? { w: template.w, h: template.h } : { w: CONFIG.room.width, h: CONFIG.room.height };
  }
}

export function templateByName(name: string): Template {
  return TEMPLATES.find((t) => t.name === name) ?? TEMPLATES[0];
}

export const roomCenter = (w: World): Vec => vec(w.room.w / 2, w.room.h / 2);
