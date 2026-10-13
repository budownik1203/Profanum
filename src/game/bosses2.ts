/**
 * The other two bosses of every floor (design doc: Bossowie): each floor draws one of its three.
 *   the cemetery:        the Exorcist, the Mourner
 *   the slums:           the Rat-Catcher, the Mob Leader
 *   the merchants' quarter: the Usurer, the Lamp Master
 *   the monastery:       the Abbot, the Scriptor
 *   the cathedral:       the Organist, the Glass Angel
 * Like the others they fight for the light: each has its own way of bringing it back.
 */
import { type Vec, add, angleOf, clamp, dist, fromAngle, norm, scale, sub, vec } from "./math.js";
import type { UnitKind } from "./data/units.js";
import type { Light } from "./types.js";
import type { World } from "./world.js";
import { fan, lob, ring } from "./combat.js";
import { relight, relightable } from "./lighting.js";
import { placePickup } from "./loot.js";
import {
  type Ctx, type Options, B, adds, aim, anyDark, blink, cd, choose, cone, contact, crowd, edgeSpots, exorcismAt, gapRing, moveTo, pickGap,
  placeLight, prowl, ready, relightNear, relightStep, rest, shot, slamAt, stand, start, summon, telegraph, tick,
} from "./bosskit.js";

const TAU = Math.PI * 2;

export const PHASES2: Partial<Record<UnitKind, number[]>> = {
  exorcist: [0.5],
  mourner: [0.55],
  ratcatcher: [0.5],
  mobleader: [0.5],
  usurer: [0.5],
  lampmaster: [0.5],
  abbot: [0.5],
  scriptor: [0.5],
  organist: [0.5],
  glassangel: [0.5],
};

// ------------------------------------------------------------------ arenas
/** Build the arena of one of the ten; returns where the boss stands. */
export const ARENAS2: Partial<Record<UnitKind, (w: World) => Vec>> = {
  exorcist: (w) => {
    // the old cemetery at night: a candle on every grave, two braziers by the chapel wall
    w.theme = "cmentarz";
    const H = w.room.h;
    for (const [x, y] of [[470, 400], [830, 360], [1300, 360], [1660, 400], [470, 960], [830, 1000], [1300, 1000], [1660, 960]] as const) {
      w.addCover(x, y, 70, 30, "tomb");
      placeLight(w, "candle", x + 35, y + 64);
    }
    placeLight(w, "brazier", 260, 700);
    placeLight(w, "brazier", 1940, 700);
    for (const x of [700, 1500]) {
      placeLight(w, "torch", x, 92);
      placeLight(w, "torch", x, H - 92);
    }
    return vec(w.room.w / 2, 600);
  },
  mourner: (w) => {
    // an open grave at the cemetery's edge; candles burn low around the coffin
    w.theme = "cmentarz";
    const H = w.room.h;
    w.addCover(1030, 470, 140, 44, "coffin");
    placeLight(w, "candelabra", 940, 520);
    placeLight(w, "candelabra", 1260, 520);
    for (const [x, y] of [[420, 360], [1780, 360], [420, 1040], [1780, 1040]] as const) placeLight(w, "candle", x, y);
    for (const x of [600, 1600]) {
      placeLight(w, "torch", x, 92);
      placeLight(w, "torch", x, H - 92);
    }
    for (const [x, y] of [[380, 640], [1750, 640], [760, 900], [1370, 900], [700, 300], [1430, 300]] as const) w.addCover(x, y, 70, 30, "tomb");
    return vec(w.room.w / 2, 700);
  },
  ratcatcher: (w) => {
    // the yard behind the tannery: crates, carts and the rats' own fires
    w.theme = "slumsy";
    const H = w.room.h;
    for (const [x, y] of [[1100, 330], [480, 980], [1720, 980]] as const) placeLight(w, "brazier", x, y);
    for (const x of [600, 1600]) {
      placeLight(w, "torch", x, 92);
      placeLight(w, "torch", x, H - 92);
    }
    for (const [x, y] of [[700, 420], [1440, 420], [700, 960], [1440, 960], [1070, 1020]] as const) w.addCover(x, y, 60, 60, "crate");
    for (const [x, y, cw, ch] of [[300, 600, 36, 120], [1864, 600, 36, 120], [900, 700, 140, 36]] as const) w.addCover(x, y, cw, ch, "cart");
    return vec(w.room.w / 2, 560);
  },
  mobleader: (w) => {
    // the gallows square: burning barrels, market stalls kicked over
    w.theme = "slumsy";
    const H = w.room.h;
    for (const [x, y] of [[500, 400], [1700, 400], [500, 1000], [1700, 1000]] as const) placeLight(w, "brazier", x, y);
    for (const x of [700, 1500]) {
      placeLight(w, "torch", x, 92);
      placeLight(w, "torch", x, H - 92);
    }
    for (const [x, y] of [[760, 440], [1320, 440]] as const) w.addCover(x, y, 120, 40, "stall");
    for (const [x, y] of [[760, 960], [1300, 960]] as const) w.addCover(x, y, 140, 36, "cart");
    for (const [x, y] of [[300, 680], [1840, 680]] as const) w.addCover(x, y, 60, 60, "crate");
    return vec(w.room.w / 2, 700);
  },
  usurer: (w) => {
    // the counting house: ledgers on the tables, candles bought with other people's money
    w.theme = "kupiecka";
    placeLight(w, "chandelier", 1100, 700);
    for (const [x, y] of [[480, 520], [1720, 520], [480, 920], [1720, 920]] as const) placeLight(w, "candelabra", x, y);
    for (const x of [700, 1500]) placeLight(w, "torch", x, 92);
    for (const [x, y] of [[600, 380], [1460, 380], [600, 1000], [1460, 1000]] as const) w.addCover(x, y, 140, 50, "table");
    for (const [x, y] of [[1000, 1060], [1140, 1060], [300, 300], [1840, 300]] as const) w.addCover(x, y, 60, 60, "crate");
    return vec(w.room.w / 2, 420);
  },
  lampmaster: (w) => {
    // Lantern Street: two rows of street lamps, and the man who lights them
    w.theme = "kupiecka";
    for (const y of [330, 1070]) for (const x of [420, 860, 1340, 1780]) placeLight(w, "streetlamp", x, y);
    for (const [x, y] of [[560, 640], [1520, 640]] as const) w.addCover(x, y, 120, 40, "stall");
    for (const [x, y] of [[1040, 520], [1100, 860]] as const) w.addCover(x, y, 60, 60, "crate");
    for (const [x, y] of [[260, 680], [1904, 680]] as const) w.addCover(x, y, 36, 120, "cart");
    return vec(w.room.w / 2, 700);
  },
  abbot: (w) => {
    // the chapter house: a ring of candelabra around the abbot's chair, saints in the windows
    w.theme = "klasztor";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      placeLight(w, "candelabra", 1100 + Math.cos(a) * 560, 720 + Math.sin(a) * 360);
    }
    placeLight(w, "window", 700, 210);
    placeLight(w, "window", 1500, 210);
    for (const [x, y] of [[300, 520], [300, 860], [1850, 520], [1850, 860]] as const) w.addCover(x, y, 50, 50, "pillar");
    for (const [x, y] of [[880, 1040], [1180, 1040]] as const) w.addCover(x, y, 140, 36, "pew");
    return vec(w.room.w / 2, 640);
  },
  scriptor: (w) => {
    // the scriptorium: shelves along the walls, a candle by every desk, a chandelier over the copyists
    w.theme = "klasztor";
    for (const [x, y, cw, ch] of [[160, 300, 40, 280], [160, 820, 40, 280], [2000, 300, 40, 280], [2000, 820, 40, 280], [520, 150, 300, 36], [1380, 150, 300, 36]] as const) w.addCover(x, y, cw, ch, "shelf");
    for (const [x, y] of [[560, 520], [1520, 520], [560, 900], [1520, 900]] as const) {
      w.addCover(x, y, 120, 50, "table");
      placeLight(w, "candle", x + 60, y + 86);
    }
    placeLight(w, "chandelier", 1100, 720);
    for (const [x, y] of [[700, 92], [1500, 92]] as const) placeLight(w, "torch", x, y);
    return vec(w.room.w / 2, 420);
  },
  organist: (w) => {
    // the great organ stands across the choir; the organist never leaves his bench
    w.theme = "katedra";
    w.addCover(ORGAN.x0, ORGAN.top, ORGAN.x1 - ORGAN.x0, ORGAN.y - ORGAN.top, "organ");
    placeLight(w, "candelabra", 880, 560);
    placeLight(w, "candelabra", 1320, 560);
    placeLight(w, "chandelier", 1100, 1000);
    for (const [x, y] of [[230, 760], [230, 1120], [1970, 760], [1970, 1120]] as const) placeLight(w, "window", x, y);
    for (const x of [200, 2000]) placeLight(w, "torch", x, 92);
    for (const [x, y] of [[660, 860], [1380, 860], [660, 1140], [1380, 1140]] as const) w.addCover(x, y, 160, 36, "pew");
    return vec(1100, 530);
  },
  glassangel: (w) => {
    // the chapel of the rose windows: six saints in glass, and the one that stepped out of hers
    w.theme = "katedra";
    for (const x of [500, 1100, 1700]) {
      placeLight(w, "window", x, 230);
      placeLight(w, "window", x, w.room.h - 230);
    }
    for (const [x, y] of [[640, 640], [1510, 640]] as const) w.addCover(x, y, 50, 50, "pillar");
    for (const [x, y] of [[300, 680], [1820, 680]] as const) placeLight(w, "candelabra", x, y);
    return vec(w.room.w / 2, 600);
  },
};

// ------------------------------------------------------------------ phases
/** What a new phase does; false if this boss has nothing special (the default roar). */
export function onPhase2(c: Ctx): boolean {
  const { w, u, b } = c;
  switch (u.kind) {
    case "exorcist":
      // he lights a fresh censer: the graves' candles burn again
      relightNear(c, ["candle"], 3000, 4);
      ring(w, u.pos, 20, 200, w.rng(), B(c, { look: "holy", radius: 9 }));
      return true;
    case "mourner":
      // she tears her veil
      ring(w, u.pos, 24, 190, w.rng(), B(c, { look: "tear", radius: 9, effect: "weep", effectTime: 1 }));
      relightNear(c, ["candelabra"], 3000, 2);
      return true;
    case "ratcatcher":
      // the sack splits
      for (let i = 0; i < 6; i++) summon(c, "rat", add(u.pos, fromAngle((i / 6) * TAU, 80)), { quiet: true });
      w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 60 });
      return true;
    case "mobleader":
      summon(c, "torchbearer", vec(110, w.room.h / 2));
      summon(c, "torchbearer", vec(w.room.w - 110, w.room.h / 2));
      return true;
    case "usurer":
      // his purse splits: gold on the floor, for whoever dares go for it
      b.mem.guard = 0;
      spillGold(c, 6);
      ring(w, u.pos, 28, 210, w.rng(), B(c, { look: "coin", radius: 8 }));
      return true;
    case "lampmaster":
      // "Light them all!"
      for (const l of w.lights) if (l.kind === "streetlamp" && relightable(l)) relight(w, l, u.id);
      ring(w, u.pos, 18, 220, w.rng(), B(c, { look: "ember", radius: 10 }));
      return true;
    case "abbot":
      relightNear(c, ["candelabra"], 3000, 4);
      ring(w, u.pos, 20, 190, w.rng(), B(c, { look: "note", radius: 10 }));
      return true;
    case "scriptor":
      ring(w, u.pos, 24, 200, w.rng(), B(c, { look: "page", radius: 10 }));
      return true;
    case "organist":
      relightNear(c, ["candelabra", "chandelier"], 3000, 3);
      for (let i = 0; i < PIPES; i++) shot(c, pipeMouth(i), vec(0, 1), 230, { look: "note", radius: 10 });
      return true;
    case "glassangel":
      // her glass cracks
      ring(w, u.pos, 24, 230, w.rng(), B(c, { look: "shard", tint: GLASS, radius: 9, bounce: 1 }));
      w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 120 });
      return true;
    default:
      return false;
  }
}

// ------------------------------------------------------------------ the Exorcist
function exorcist(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 360, u.def.speed * 0.8);
      if (!ready(c)) break;
      const opts: Options = [["circles", 3], ["sprinkle", 3], ["litany", 2]];
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candle", "brazier", "torch"], 900)) opts.push(["relight", 3]);
      if (b.phase >= 2) opts.push(["banish", 2]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 2) opts.push(["crowd", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "crowd":
      // the parish follows its priest
      crowd(c, b.phase >= 2 ? ["peasant", "witchhunter", "peasant"] : ["peasant", "witchhunter"], 16);
      break;
    case "circles": {
      // he reads the rite: circles that burn the dead, under the necromancer and (later) his servants
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 0.35) {
        b.n = 2;
        const a0 = w.rng() * TAU;
        const spots = [c.target, add(c.target, fromAngle(a0, 200)), add(c.target, fromAngle(a0 + 2.1, 230)), add(c.target, fromAngle(a0 + 4.2, 340))];
        if (b.phase >= 2) {
          const dead = w.units.filter((m) => m.alive && m.team === "minion").sort((a, z) => dist(a.pos, u.pos) - dist(z.pos, u.pos));
          for (const m of dead.slice(0, 2)) spots.push(m.pos);
        }
        for (const p of spots) exorcismAt(c, w.collideWorld(p, 40), 95, 1.1);
      }
      if (b.t >= 1.6) rest(c, 1);
      break;
    }
    case "sprinkle": {
      // the aspergillum: three swings of holy water
      stand(c);
      const wind = 0.4 / c.haste;
      if (b.n === 0) {
        b.n = 1;
        u.dir = aim(c);
        telegraph(c);
      }
      if (b.n >= 1 && b.n <= 3 && b.t >= wind + (b.n - 1) * 0.3) {
        const a = angleOf(aim(c)) + (b.n - 2) * 0.3;
        fan(w, u.pos, fromAngle(a), b.phase >= 2 ? 9 : 7, 0.9, 290, B(c, { look: "holy", radius: 8 }));
        b.n += 1;
      }
      if (b.t >= wind + 1.2) rest(c, 1.1);
      break;
    }
    case "litany":
      // he walks at you praying: rings of rosary beads
      moveTo(c, c.target, u.def.speed * 0.5);
      if (b.n < 4 && b.t >= 0.3 + b.n * 0.42) {
        ring(w, u.pos, 14, 170, b.n * 0.22 + w.rng() * 0.2, B(c, { look: "rosette", radius: 9, spin: (b.n % 2 ? 1 : -1) * 0.45 }));
        b.n += 1;
      }
      if (b.t >= 2) rest(c, 1);
      break;
    case "relight":
      // a prayer over the graves: the candles burn again
      relightStep(c, ["candle", "brazier", "torch"], 900, 4, 1.3, 10);
      break;
    case "banish":
      // the great rite: a circle around himself. Get out of it.
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        exorcismAt(c, u.pos, 270, 1.3);
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 1.3) {
        b.n = 2;
        ring(w, u.pos, 20, 220, w.rng(), B(c, { look: "holy", radius: 9 }));
      }
      if (b.t >= 1.8) rest(c, 1.2);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Mourner
function mourner(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 380, u.def.speed * 0.7);
      if (!ready(c)) break;
      const opts: Options = [["wail", 3], ["tears", 3], ["veil", 2]];
      if (cd(c, "processionCd") <= 0 && adds(c) < 3) opts.push(["procession", 3]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candelabra", "candle", "torch"], 1000)) opts.push(["relight", 2]);
      if (b.phase >= 2) opts.push(["dirge", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "wail": {
      // her lament rolls out in waves: whoever it reaches weeps and drags his feet
      stand(c);
      const wind = 0.5 / c.haste;
      const rings = b.phase >= 2 ? 4 : 3;
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n >= 1 && b.n <= rings && b.t >= wind + (b.n - 1) * 0.45) {
        gapRing(c, u.pos, 22, 190, 3, b.n * 0.3 + w.rng() * 0.2, { look: "wave", radius: 14, damage: 3, effect: "weep", effectTime: 1.2 });
        b.n += 1;
      }
      if (b.t >= wind + rings * 0.45 + 0.3) rest(c, 1.1);
      break;
    }
    case "tears": {
      // the sky weeps with her: tears fall in columns, one dry lane somewhere near you
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        const { w: RW } = w.room;
        const px = w.player.pos.x;
        const lane = pickGap(c, Math.max(200, px - 550), Math.min(RW - 200, px + 550), px, 0);
        b.mem.lane = lane;
        for (let x = 90; x < RW - 60; x += 70) {
          if (Math.abs(x - lane) < 110) continue;
          for (let k = 0; k < 2; k++) shot(c, vec(x, 70), vec(0, 1), 280 + w.rng() * 60, { look: "tear", radius: 9, delay: 0.5 + w.rng() * 0.8 + k * 0.9, life: 7, effect: "weep", effectTime: 0.8 });
        }
      }
      if (b.t >= 1.2) rest(c, 1.4);
      break;
    }
    case "veil":
      // she draws her veil and is somewhere else; tears ring out where she appears
      stand(c);
      if (b.n === 0 && b.t >= 0.5) {
        b.n = 1;
        blink(c, 480);
      }
      if (b.n === 1 && b.t >= 0.9) {
        b.n = 2;
        ring(w, u.pos, 16, 200, w.rng(), B(c, { look: "tear", radius: 9 }));
      }
      if (b.t >= 1.3) rest(c, 0.9);
      break;
    case "procession":
      // mourners with lanterns: light walks with her people
      stand(c);
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        const spots = edgeSpots(w);
        const r = Math.floor(w.rng() * 4);
        summon(c, "acolyte", spots[r], { lantern: true });
        summon(c, "acolyte", spots[(r + 1) % 4], { lantern: true });
        if (b.phase >= 2) summon(c, "peasant", spots[(r + 2) % 4], { lantern: true });
        b.mem.processionCd = 16;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    case "relight":
      relightStep(c, ["candelabra", "candle", "torch"], 1000, 3, 1.2, 11);
      break;
    case "dirge":
      // the dirge: a slow triple spiral of tears
      stand(c);
      b.mem.emit = (b.mem.emit ?? 0) - c.dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 3) {
        b.mem.emit = 0.11;
        b.angle += 0.29;
        for (let k = 0; k < 3; k++) shot(c, u.pos, fromAngle(b.angle + (k * TAU) / 3), 170, { look: "tear", radius: 9, effect: "weep", effectTime: 0.8 });
      }
      if (b.t >= 3.4) rest(c, 1.2);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Rat-Catcher
function ratcatcher(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 330, u.def.speed * 0.8);
      if (!ready(c)) break;
      const rats = w.units.filter((x) => x.alive && x.kind === "rat" && x.team === u.team).length;
      const traps = w.zones.filter((z) => z.kind === "trap").length;
      const d = dist(u.pos, c.target);
      const opts: Options = [["poison", 2]];
      if (traps < 6) opts.push(["traps", 2]);
      if (rats < (b.phase >= 2 ? 8 : 5) && cd(c, "swarmCd") <= 0) opts.push(["swarm", 3]);
      if (d < 360) opts.push(["pole", 4]);
      else opts.push(["flick", 2]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["brazier", "torch"])) opts.push(["relight", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "swarm":
      // he opens his sack: rats pour out
      stand(c);
      if (b.n === 0 && b.t >= 0.6) {
        b.n = 1;
        const n = b.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) summon(c, "rat", add(u.pos, fromAngle((i / n) * TAU + w.rng() * 0.4, 70)), { quiet: true });
        b.mem.swarmCd = 9;
      }
      if (b.t >= 1) rest(c, 0.9);
      break;
    case "traps": {
      // iron traps thrown around you: step on one and it bites
      stand(c);
      const n = b.phase >= 2 ? 3 : 2;
      if (b.n < n && b.t >= 0.3 + b.n * 0.2) {
        const to = b.n === 0 ? c.target : add(c.target, fromAngle(w.rng() * TAU, 120 + w.rng() * 200));
        lob(w, add(u.pos, vec(0, -50)), w.collideWorld(to, 30), B(c, { look: "trap", radius: 12, damage: 0 }), "trap", 34, 0.75, 150);
        b.n += 1;
      }
      if (b.t >= 0.4 + n * 0.2 + 0.4) rest(c, 1);
      break;
    }
    case "poison":
      // rat poison in clay pots: clouds that eat at the living and the dead alike
      stand(c);
      if (b.n < 2 && b.t >= 0.35 + b.n * 0.35) {
        const to = add(c.target, fromAngle(w.rng() * TAU, b.n * 170));
        lob(w, add(u.pos, vec(0, -50)), w.collideWorld(to, 40), B(c, { look: "flask", radius: 10, damage: 0 }), "miasma", 95, 0.9, 170);
        b.n += 1;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    case "pole": {
      // the long pole with its hook: a wide sweep, two once he's angry
      stand(c);
      const wind = 0.75 / c.haste;
      const sweeps = b.phase >= 2 ? 2 : 1;
      if (b.n === 0 || (b.n === 2 && sweeps === 2 && b.t >= wind + 0.35)) {
        b.n += 1;
        u.dir = aim(c);
        telegraph(c);
      }
      if (b.n === 1 && b.t >= wind) {
        b.n = 2;
        cone(c, u.dir, 300, 0.5, 8);
      }
      if (b.n === 3 && b.t >= wind * 2 + 0.35) {
        b.n = 4;
        cone(c, u.dir, 300, 0.5, 8);
      }
      if (b.t >= (sweeps === 2 ? wind * 2 + 0.8 : wind + 0.5)) rest(c, 1);
      break;
    }
    case "flick":
      // from afar he flicks dead rats and offal at you
      stand(c);
      if (b.n < 2 && b.t >= 0.35 + b.n * 0.35) {
        fan(w, u.pos, aim(c), 4, 0.6, 260, B(c, { look: "bone", radius: 8 }));
        b.n += 1;
      }
      if (b.t >= 1.2) rest(c, 1);
      break;
    case "relight":
      // he kicks the embers back to life
      relightStep(c, ["brazier", "torch"], 3000, 2, 1, 10);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Mob Leader
function mobleader(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 340, u.def.speed * 0.8);
      if (!ready(c)) break;
      const d = dist(u.pos, c.target);
      const opts: Options = [["stones", 3], ["torches", 2]];
      if (d < 600) opts.push(["charge", 3]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 4) opts.push(["incite", 3]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["brazier", "torch"])) opts.push(["relight", 2]);
      if (b.phase >= 2 && cd(c, "speechCd") <= 0) opts.push(["speech", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "incite":
      // "Burn the witch!": the crowd comes running from every street
      crowd(c, b.phase >= 2 ? ["torchbearer", "peasant", "torchbearer", "peasant"] : ["peasant", "torchbearer", "peasant"], 14);
      break;
    case "stones": {
      // a fistful of cobbles
      stand(c);
      const n = b.phase >= 2 ? 6 : 5;
      if (b.n < n && b.t >= 0.25 + b.n * 0.14) {
        const off = b.n === 0 ? vec() : fromAngle(w.rng() * TAU, 60 + w.rng() * 220);
        lob(w, add(u.pos, vec(0, -60)), w.collideWorld(add(c.target, off), 20), B(c, { look: "stone", radius: 10, damage: 4 }), "stone", 46, 0.8, 180);
        b.n += 1;
      }
      if (b.t >= 0.3 + n * 0.14 + 0.6) rest(c, 1);
      break;
    }
    case "torches":
      stand(c);
      if (b.n < 2 && b.t >= 0.35 + b.n * 0.4) {
        const off = fromAngle(w.rng() * TAU, w.rng() * 150);
        lob(w, add(u.pos, vec(0, -70)), w.collideWorld(add(c.target, off), 30), B(c, { look: "torch", radius: 10, damage: 4 }), "fire", 85, 0.85, 170);
        b.n += 1;
      }
      if (b.t >= 1.4) rest(c, 1.1);
      break;
    case "charge": {
      // he raises his cudgel and runs at you: twice, three times when the square is behind him
      const wind = 0.55 / c.haste;
      const per = wind + 0.5;
      const k = Math.floor(b.t / per);
      const local = b.t - k * per;
      if (k >= (b.phase >= 2 ? 3 : 2)) {
        rest(c, 1.2);
        break;
      }
      if (local < wind) {
        if (b.n !== k + 1) {
          b.n = k + 1;
          u.dir = aim(c);
          telegraph(c);
        }
        stand(c);
      } else {
        w.moveUnit(u, scale(u.dir, 640), c.dt);
        contact(c, u.dir, 10);
      }
      break;
    }
    case "speech":
      // he climbs a cart and roars: the whole square throws at once, from every side
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
        b.mem.speechCd = 12;
      }
      if (b.n === 1 && b.t >= 0.9) {
        b.n = 2;
        const { w: RW, h: RH } = w.room;
        for (let i = 0; i < 30; i++) {
          const side = i % 4;
          const along = 0.1 + 0.8 * w.rng();
          const from = side === 0 ? vec(RW * along, 70) : side === 1 ? vec(RW * along, RH - 70) : side === 2 ? vec(70, RH * along) : vec(RW - 70, RH * along);
          const to = vec(RW / 2 + (w.rng() - 0.5) * 900, RH / 2 + (w.rng() - 0.5) * 600);
          shot(c, from, norm(sub(to, from)), 230 + w.rng() * 60, { look: "stone", radius: 10, delay: w.rng() * 0.9, life: 9 });
        }
        ring(w, u.pos, 14, 200, w.rng(), B(c, { look: "stone", radius: 10 }));
      }
      if (b.t >= 1.6) rest(c, 1.2);
      break;
    case "relight":
      // "Light the torches!"
      relightStep(c, ["torch", "brazier"], 3000, 3, 1, 10);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Usurer
function spillGold(c: Ctx, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = placePickup(c.w, "gold", c.u.pos, 1);
    p.vel = fromAngle((i / n) * TAU + c.w.rng(), 260 + c.w.rng() * 120);
    p.delay = 0.5;
  }
}

/** How long the usurer hides under the strongbox lid. */
export const STRONGBOX = 2;

function usurer(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  // behind the strongbox lid he takes almost nothing
  b.mem.guard = b.step === "strongbox" && b.n === 1 ? 1 : 0;
  switch (b.step) {
    case "idle": {
      prowl(c, 420, u.def.speed);
      if (!ready(c)) break;
      const opts: Options = [["coins", 3], ["rain", 2], ["seals", 2]];
      if (cd(c, "strongboxCd") <= 0) opts.push(["strongbox", 2]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 3) opts.push(["mercenaries", 3]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candelabra", "chandelier", "torch"])) opts.push(["relight", 2]);
      if (b.phase >= 2 && cd(c, "spillCd") <= 0) opts.push(["spill", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "coins": {
      // he flicks coins at you, a fan at a time
      stand(c);
      const wind = 0.35 / c.haste;
      const fans = b.phase >= 2 ? 4 : 3;
      if (b.n < fans && b.t >= wind + b.n * 0.34) {
        fan(w, u.pos, fromAngle(angleOf(aim(c)) + (b.n % 2 ? 0.12 : -0.12)), 5, 0.8, 270, B(c, { look: "coin", radius: 8 }));
        b.n += 1;
      }
      if (b.t >= wind + fans * 0.34 + 0.3) rest(c, 1.1);
      break;
    }
    case "rain":
      // a fistful thrown in the air: rings of gold with a gap
      stand(c);
      if (b.n < (b.phase >= 2 ? 3 : 2) && b.t >= 0.4 + b.n * 0.55) {
        gapRing(c, u.pos, 22, 185, 5, w.rng(), { look: "coin", radius: 8 });
        b.n += 1;
      }
      if (b.t >= 2) rest(c, 1.1);
      break;
    case "seals":
      // red wax seals that follow you: a debt always finds its debtor
      stand(c);
      if (b.n === 0 && b.t >= 0.4) {
        b.n = 1;
        const n = b.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) shot(c, u.pos, fromAngle((i / n) * TAU + w.rng() * 0.3), 170, { look: "orb", tint: 0x9e1f14, radius: 10, homing: 1.3, life: 5 });
      }
      if (b.t >= 1) rest(c, 1.2);
      break;
    case "strongbox":
      // the lid comes down over him; then it flies open, full of coin
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
        b.mem.strongboxCd = 12;
      }
      if (b.n === 1 && b.t >= STRONGBOX) {
        b.n = 2;
        gapRing(c, u.pos, 26, 220, 3, w.rng(), { look: "coin", radius: 8 });
        gapRing(c, u.pos, 26, 160, 3, w.rng(), { look: "coin", radius: 8 });
        w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 70 });
      }
      if (b.t >= STRONGBOX + 0.5) rest(c, 1);
      break;
    case "mercenaries":
      // he pays for steel: two halberds and a gun
      stand(c);
      if (b.n === 0 && b.t >= 0.9) {
        b.n = 1;
        const spots = edgeSpots(w);
        const r = Math.floor(w.rng() * 4);
        summon(c, "halberdier", spots[r]);
        summon(c, "halberdier", spots[(r + 1) % 4]);
        summon(c, b.phase >= 2 ? "sergeant" : "arquebusier", spots[(r + 2) % 4]);
        b.mem.crowdCd = 16;
      }
      if (b.t >= 1.4) rest(c, 1);
      break;
    case "relight":
      // he rings for a servant: the candles are lit again
      relightStep(c, ["candelabra", "chandelier", "torch"], 3000, 2, 1.1, 11);
      break;
    case "spill":
      stand(c);
      if (b.n === 0 && b.t >= 0.5) {
        b.n = 1;
        spillGold(c, 4);
        gapRing(c, u.pos, 30, 240, 4, w.rng(), { look: "coin", radius: 8 });
        b.mem.spillCd = 14;
      }
      if (b.t >= 1) rest(c, 1);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Lamp Master
/** Where a new lamp may go: near the necromancer, away from the other lamps. */
function lampSpot(c: Ctx): Vec | null {
  const { w } = c;
  for (let i = 0; i < 40; i++) {
    // near the necromancer first, then anywhere in the street
    const p = w.collideWorld(i < 30 ? add(c.target, fromAngle(w.rng() * TAU, 200 + w.rng() * 240)) : vec(200 + w.rng() * (w.room.w - 400), 200 + w.rng() * (w.room.h - 400)), 40);
    if (p.x < 140 || p.y < 160 || p.x > w.room.w - 140 || p.y > w.room.h - 120) continue;
    if (w.lights.some((l) => l.kind === "streetlamp" && dist(l.pos, p) < 280)) continue;
    return p;
  }
  return null;
}

function lampmaster(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  // from afar, with his long taper, he lights one dark lamp after another
  b.mem.feed = (b.mem.feed ?? 5) - c.dt;
  if (b.mem.feed <= 0 && (b.mem.tongueT ?? 0) <= 0) {
    b.mem.feed = b.phase >= 2 ? 5 : 7;
    const l = w.lights.filter((x) => x.kind === "streetlamp" && relightable(x)).sort((a, z) => dist(a.pos, u.pos) - dist(z.pos, u.pos))[0];
    if (l) {
      b.mem.tongue = l.id;
      b.mem.tongueT = 1.4;
    }
  }
  if ((b.mem.tongueT ?? 0) > 0) {
    b.mem.tongueT -= c.dt;
    if (b.mem.tongueT <= 0) {
      const l = w.lights.find((x) => x.id === b.mem.tongue);
      if (l && relightable(l)) relight(w, l, u.id);
    }
  }
  switch (b.step) {
    case "idle": {
      prowl(c, 360, u.def.speed * 0.85);
      if (!ready(c)) break;
      const d = dist(u.pos, c.target);
      const opts: Options = [["oil", 1], ["flare", 2]];
      opts.push(d < 330 ? ["taper", 4] : ["embers", 3]);
      if (w.lights.filter((l) => l.kind === "streetlamp").length < 12 && cd(c, "plantCd") <= 0) opts.push(["plant", 2]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 2) opts.push(["apprentices", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "taper": {
      // a lunge with the burning taper
      stand(c);
      const wind = 0.6 / c.haste;
      if (b.n === 0) {
        b.n = 1;
        u.dir = aim(c);
        telegraph(c);
      }
      if (b.n === 1 && b.t >= wind) {
        b.n = 2;
        cone(c, u.dir, 270, 0.5, 8);
        fan(w, add(u.pos, scale(u.dir, 50)), u.dir, 5, 0.9, 260, B(c, { look: "ember", radius: 9 }));
      }
      if (b.t >= wind + 0.5) rest(c, 1);
      break;
    }
    case "embers":
      // he shakes the taper at you: sparks in fans
      stand(c);
      if (b.n < 3 && b.t >= 0.3 + b.n * 0.3) {
        fan(w, u.pos, fromAngle(angleOf(aim(c)) + (b.n - 1) * 0.2), 5, 0.6, 300, B(c, { look: "ember", radius: 9 }));
        b.n += 1;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    case "oil":
      stand(c);
      if (b.n === 0 && b.t >= 0.4) {
        b.n = 1;
        if (w.zones.filter((z) => z.permanent).length < 4) {
          const to = add(c.target, fromAngle(w.rng() * TAU, 150 + w.rng() * 120));
          lob(w, add(u.pos, vec(0, -50)), w.collideWorld(to, 40), B(c, { look: "flask", radius: 10, damage: 0 }), "oil", 100, 1, 180);
        }
      }
      if (b.t > 1) rest(c, 0.8);
      break;
    case "flare":
      // a flare thrown high: the street lit like noon for a while
      stand(c);
      if (b.n === 0 && b.t >= 0.45) {
        b.n = 1;
        const to = add(c.target, fromAngle(w.rng() * TAU, 120));
        lob(w, add(u.pos, vec(0, -60)), w.collideWorld(to, 40), B(c, { look: "torch", radius: 10, damage: 0 }), "flare", 560, 1.1, 260);
      }
      if (b.t >= 1.2) rest(c, 1);
      break;
    case "plant": {
      // he plants a new lamp post and lights it
      stand(c);
      if (b.n === 0) {
        const p = lampSpot(c);
        if (!p) {
          b.mem.plantCd = 4;
          rest(c, 0.5);
          break;
        }
        b.n = 1;
        b.mem.plantX = p.x;
        b.mem.plantY = p.y;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 0.9 / c.haste) {
        b.n = 2;
        const l = w.addLight("streetlamp", vec(b.mem.plantX, b.mem.plantY));
        w.events.push({ type: "relight", pos: { x: l.pos.x, y: l.pos.y - 74 }, light: l.id, by: u.id });
        b.mem.plantCd = 9;
      }
      if (b.t >= 0.9 / c.haste + 0.4) rest(c, 1);
      break;
    }
    case "apprentices":
      // his apprentices, each with a taper: they'll light what you put out
      stand(c);
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        const spots = edgeSpots(w);
        const r = Math.floor(w.rng() * 4);
        summon(c, "halberdier", spots[r], { lamplighter: true });
        summon(c, b.phase >= 2 ? "sergeant" : "arquebusier", spots[(r + 2) % 4], { lamplighter: true });
        b.mem.crowdCd = 18;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Abbot
function abbot(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 340, u.def.speed);
      if (!ready(c)) break;
      const opts: Options = [["chant", 3], ["bell", 3]];
      if (cd(c, "crowdCd") <= 0 && adds(c) < 3) opts.push(["monks", 2]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candelabra"], 1300)) opts.push(["vespers", 3]);
      if (b.phase >= 2) opts.push(["gloria", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "chant":
      // plainchant: rings of notes turning one way, then the other
      moveTo(c, c.target, u.def.speed * 0.35);
      if (b.n < (b.phase >= 2 ? 4 : 3) && b.t >= 0.3 + b.n * 0.42) {
        ring(w, u.pos, 14, 160, b.n * 0.2 + w.rng() * 0.2, B(c, { look: "note", radius: 9, spin: (b.n % 2 ? 1 : -1) * 0.4 }));
        b.n += 1;
      }
      if (b.t >= 2) rest(c, 1.1);
      break;
    case "bell": {
      // he strikes the great hand bell: the floor jumps around him, the sound rolls on
      stand(c);
      const wind = 0.85 / c.haste;
      if (b.n === 0) {
        b.n = 1;
        slamAt(c, u.pos, 240, wind, 10);
        telegraph(c);
      }
      if ((b.n === 1 && b.t >= wind) || (b.n === 2 && b.t >= wind + 0.45) || (b.n === 3 && b.phase >= 2 && b.t >= wind + 0.9)) {
        b.n += 1;
        gapRing(c, u.pos, 26, 190, 5, w.rng(), { look: "wave", radius: 14 });
      }
      if (b.t >= wind + (b.phase >= 2 ? 1.3 : 0.9)) rest(c, 1.1);
      break;
    }
    case "monks":
      // brothers with censers: smoke that drives the dark away
      stand(c);
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        const spots = edgeSpots(w);
        const r = Math.floor(w.rng() * 4);
        summon(c, "monk", spots[r]);
        summon(c, b.phase >= 2 ? "monk" : "acolyte", spots[(r + 1) % 4]);
        b.mem.crowdCd = 16;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    case "vespers":
      // vespers: he kneels, and the candelabra burn again
      relightStep(c, ["candelabra", "candle"], 1300, 4, 1.4, 11);
      break;
    case "gloria":
      // Gloria: a four-armed spiral of notes
      stand(c);
      b.mem.emit = (b.mem.emit ?? 0) - c.dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 3.2) {
        b.mem.emit = 0.12;
        b.angle += 0.25;
        for (let k = 0; k < 3; k++) shot(c, u.pos, fromAngle(b.angle + (k * TAU) / 3), 170, { look: "note", radius: 10 });
      }
      if (b.t >= 3.6) rest(c, 1.2);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Scriptor
function scriptor(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  switch (b.step) {
    case "idle": {
      prowl(c, 380, u.def.speed * 0.8);
      if (!ready(c)) break;
      const opts: Options = [["pages", 3], ["quills", 3], ["ink", 2]];
      if (cd(c, "censorCd") <= 0) opts.push(["censor", 2]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candle", "chandelier", "torch"], 1300)) opts.push(["relight", 2]);
      if (b.phase >= 2) opts.push(["books", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "pages": {
      // the pages of the book he copies fly out in a spiral
      stand(c);
      const arms = b.phase >= 2 ? 4 : 3;
      b.mem.emit = (b.mem.emit ?? 0) - c.dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 2.8) {
        b.mem.emit = 0.1;
        b.angle += 0.26;
        for (let k = 0; k < arms; k++) shot(c, u.pos, fromAngle(b.angle + (k * TAU) / arms), 185, { look: "page", radius: 10 });
      }
      if (b.t >= 3.2) rest(c, 1.1);
      break;
    }
    case "quills":
      // sharpened quills that hunt you
      stand(c);
      if (b.n === 0 && b.t >= 0.4) {
        b.n = 1;
        const n = b.phase >= 2 ? 7 : 6;
        const a = angleOf(aim(c));
        for (let i = 0; i < n; i++) shot(c, u.pos, fromAngle(a + Math.PI + (i / (n - 1) - 0.5) * 2.4), 240, { look: "bolt", radius: 9, homing: 1.3, life: 5 });
      }
      if (b.t >= 1.1) rest(c, 1.1);
      break;
    case "ink": {
      // pots of ink: black pools that hold you down
      stand(c);
      const n = b.phase >= 2 ? 3 : 2;
      if (b.n < n && b.t >= 0.35 + b.n * 0.3) {
        const to = add(c.target, fromAngle(w.rng() * TAU, b.n * 160));
        lob(w, add(u.pos, vec(0, -50)), w.collideWorld(to, 40), B(c, { look: "flask", tint: 0x14121a, radius: 10, damage: 0 }), "ink", 85, 0.85, 170);
        b.n += 1;
      }
      if (b.t >= 0.5 + n * 0.3 + 0.4) rest(c, 1);
      break;
    }
    case "censor": {
      // the censor's line: a row of pages sweeps down the hall, one passage struck out
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        const { w: RW, h: RH } = w.room;
        const px = w.player.pos.x;
        const gap = pickGap(c, Math.max(200, px - 500), Math.min(RW - 200, px + 500), px, 0);
        b.mem.gapX = gap;
        for (let x = 80; x < RW - 60; x += 46) {
          if (Math.abs(x - gap) < 120) continue;
          shot(c, vec(x, 80), vec(0, 1), 210, { look: "page", radius: 10, delay: 0.9, life: 8 });
        }
        if (b.phase >= 2) {
          // and a second line across, from the side
          const py = w.player.pos.y;
          const gy = pickGap(c, Math.max(200, py - 400), Math.min(RH - 200, py + 400), py, 0);
          b.mem.gapY = gy;
          for (let y = 80; y < RH - 60; y += 46) {
            if (Math.abs(y - gy) < 120) continue;
            shot(c, vec(70, y), vec(1, 0), 210, { look: "page", radius: 10, delay: 1.8, life: 12 });
          }
        } else {
          delete b.mem.gapY;
        }
        b.mem.censorCd = 7;
        telegraph(c);
      }
      if (b.t >= 1.4) rest(c, 1.2);
      break;
    }
    case "books":
      // burning books: forbidden ones
      stand(c);
      if (b.n < 2 && b.t >= 0.35 + b.n * 0.4) {
        const off = fromAngle(w.rng() * TAU, w.rng() * 160);
        lob(w, add(u.pos, vec(0, -60)), w.collideWorld(add(c.target, off), 30), B(c, { look: "book", radius: 12, damage: 4 }), "fireRing", 80, 0.9, 190);
        b.n += 1;
      }
      if (b.t >= 1.5) rest(c, 1.1);
      break;
    case "relight":
      // he trims the wicks: the candles by the desks burn again
      relightStep(c, ["candle", "chandelier", "torch"], 1300, 3, 1.2, 11);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Organist
/** The organ case standing across the choir and its seven ranks of pipes (they speak towards the nave). */
export const ORGAN = { x0: 420, x1: 1780, top: 250, y: 430 };
export const PIPES = 7;
export const pipeMouth = (i: number): Vec => vec(500 + i * 200, ORGAN.y + 14);

/** Which pipe stays silent in a chord: one near the necromancer, never the same twice. */
function silentPipe(c: Ctx): number {
  const near = clamp(Math.round((c.w.player.pos.x - 500) / 200), 0, PIPES - 1);
  let i = clamp(near + Math.floor(c.w.rng() * 5) - 2, 0, PIPES - 1);
  if (i === c.b.mem.silent) i = clamp(i + (i < PIPES - 1 ? 1 : -1), 0, PIPES - 1);
  return i;
}

function organist(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  stand(c);
  switch (b.step) {
    case "idle": {
      u.dir = aim(c);
      if (!ready(c)) break;
      const opts: Options = [["fugue", 3], ["chord", 3], ["pedal", 2], ["aria", 2]];
      if (cd(c, "crowdCd") <= 0 && adds(c) < 3) opts.push(["choir", 2]);
      if (cd(c, "relightCd") <= 0 && anyDark(c, ["candelabra", "chandelier"])) opts.push(["relight", 2]);
      if (b.phase >= 2) opts.push(["toccata", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "fugue": {
      // the fugue: pipe after pipe, left to right and back, each a small fan of notes
      const step = 0.2 / c.haste;
      const order = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0];
      if (b.n < order.length && b.t >= 0.4 + b.n * step) {
        const i = order[b.n];
        fan(w, pipeMouth(i), vec(0, 1), 3, 0.36, 220, B(c, { look: "note", radius: 10, life: 8 }));
        b.mem.pipe = i;
        b.n += 1;
      }
      if (b.n >= order.length && b.t >= 0.4 + order.length * step + 0.3) rest(c, 1);
      break;
    }
    case "chord": {
      // full chords: every pipe at once, a wall of notes, one pipe silent
      const wind = 0.8 / c.haste;
      const chords = b.phase >= 2 ? 3 : 2;
      const per = wind + 0.5;
      const k = Math.floor(b.t / per);
      if (k >= chords) {
        rest(c, 1);
        break;
      }
      if (b.n === k * 2) {
        b.n += 1;
        b.mem.silent = silentPipe(c);
        telegraph(c);
      }
      if (b.n === k * 2 + 1 && b.t - k * per >= wind) {
        b.n += 1;
        for (let i = 0; i < PIPES; i++) {
          if (i === b.mem.silent) continue;
          const m = pipeMouth(i);
          for (const dx of [-50, 0, 50]) shot(c, vec(m.x + dx, m.y), vec(0, 1), 220, { look: "note", radius: 10, life: 8 });
        }
      }
      break;
    }
    case "pedal": {
      // the pedal note shakes the floor: a row of strikes across the nave, one quiet spot
      if (b.n === 0) {
        b.n = 1;
        const { w: RW, h: RH } = w.room;
        const y = clamp(c.target.y, ORGAN.y + 210, RH - 150);
        const px = w.player.pos.x;
        const gap = pickGap(c, Math.max(200, px - 450), Math.min(RW - 200, px + 450), px, 0);
        for (let x = 150; x < RW - 100; x += 160) {
          if (Math.abs(x - gap) < 140) continue;
          slamAt(c, vec(x, y), 95, 1.0, 8);
        }
        telegraph(c);
      }
      if (b.t >= 1.4) rest(c, 1);
      break;
    }
    case "aria":
      // from the bench itself: bursts of notes at you
      if (b.n < 3 && b.t >= 0.35 + b.n * 0.32) {
        fan(w, add(u.pos, vec(0, 30)), aim(c), 5, 0.7, 300, B(c, { look: "note", radius: 10 }));
        b.n += 1;
      }
      if (b.t >= 1.4) rest(c, 1);
      break;
    case "choir":
      // the choirboys come down from the loft
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        const { w: RW } = w.room;
        const spots = [vec(110, 760), vec(RW - 110, 760), vec(110, 1150), vec(RW - 110, 1150)];
        const r = Math.floor(w.rng() * 4);
        for (let i = 0; i < 3; i++) summon(c, "acolyte", spots[(r + i) % 4]);
        b.mem.crowdCd = 16;
      }
      if (b.t >= 1.3) rest(c, 1);
      break;
    case "toccata":
      // the toccata: pipes at random, fast, every note aimed at you
      b.mem.emit = (b.mem.emit ?? 0) - c.dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 3.4) {
        b.mem.emit = 0.16;
        const i = Math.floor(w.rng() * PIPES);
        const m = pipeMouth(i);
        b.mem.pipe = i;
        shot(c, m, norm(sub(c.target, m)), 270, { look: "note", radius: 10 });
      }
      if (b.t >= 3.8) rest(c, 1.2);
      break;
    case "relight":
      relightStep(c, ["candelabra", "chandelier"], 3000, 2, 1.2, 11);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Glass Angel
export const GLASS = 0x9ad8e8;
/** How long the angel folds her wings before a dive. */
export const DIVE_WIND = 0.85;

function intactWindows(w: World): Light[] {
  return w.lights.filter((l) => l.kind === "window" && !l.broken);
}

function glassangel(c: Ctx): void {
  const { w, u, b } = c;
  tick(c);
  // while three windows still stand, their saints shield her
  const windows = intactWindows(w);
  b.mem.windows = windows.length;
  b.mem.shield = windows.length >= 3 ? 1 : 0;
  switch (b.step) {
    case "idle": {
      prowl(c, 400, u.def.speed);
      if (!ready(c)) break;
      const opts: Options = [["shards", 3], ["refraction", 2], ["dive", 2]];
      if (windows.length > 0) opts.push(["beams", 3]);
      if (cd(c, "mendCd") <= 0 && w.lights.some((l) => l.kind === "window" && l.broken)) opts.push(["mend", 2]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 2) opts.push(["crowd", 1]);
      if (b.phase >= 2) opts.push(["shatter", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "crowd":
      crowd(c, ["flagellant", "acolyte"], 18);
      break;
    case "shards":
      // her wings shed glass: fans of shards that glance off the walls
      stand(c);
      if (b.n < (b.phase >= 2 ? 3 : 2) && b.t >= 0.35 + b.n * 0.32) {
        fan(w, u.pos, fromAngle(angleOf(aim(c)) + (b.n - 1) * 0.25), 5, 1.0, 260, B(c, { look: "shard", tint: GLASS, radius: 9, bounce: 1, life: 6 }));
        b.n += 1;
      }
      if (b.t >= 1.5) rest(c, 1);
      break;
    case "refraction":
      // light through a prism: rings that bounce twice
      stand(c);
      if (b.n < 2 && b.t >= 0.4 + b.n * 0.5) {
        ring(w, u.pos, 13, 180, w.rng(), B(c, { look: "shard", tint: GLASS, radius: 9, bounce: 2, life: 9 }));
        b.n += 1;
      }
      if (b.t >= 1.6) rest(c, 1.2);
      break;
    case "beams": {
      // every whole window turns its light on you: a line from the glass, then a stream of holy light
      stand(c);
      const wind = 0.9 / c.haste;
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
        b.mem.beamX = c.target.x;
        b.mem.beamY = c.target.y;
      }
      if (b.n === 1 && b.t >= wind) b.n = 2;
      if (b.n === 2) {
        b.mem.emit = (b.mem.emit ?? 0) - c.dt;
        if (b.mem.emit <= 0) {
          b.mem.emit = 0.06;
          const to = vec(b.mem.beamX, b.mem.beamY);
          for (const l of windows) {
            const from = w.windowPoint(l);
            shot(c, from, norm(sub(to, from)), 560, { look: "holy", radius: 9, life: 4 });
          }
        }
        if (b.t >= wind + 0.55) b.n = 3;
      }
      if (b.t >= wind + 0.9) rest(c, 1.1);
      break;
    }
    case "dive": {
      // she folds her wings and dives, leaving glass hanging in the air
      const wind = DIVE_WIND / c.haste;
      if (b.n === 0) {
        b.n = 1;
        u.dir = aim(c);
        telegraph(c);
      }
      if (b.n === 1 && b.t >= wind) b.n = 2;
      if (b.n === 2) {
        w.moveUnit(u, scale(u.dir, 700), c.dt);
        contact(c, u.dir, 10);
        b.mem.trail = (b.mem.trail ?? 0) - c.dt;
        if (b.mem.trail <= 0) {
          b.mem.trail = 0.14;
          const side = vec(-u.dir.y, u.dir.x);
          for (const s of [1, -1]) shot(c, u.pos, scale(side, s), 120, { look: "shard", tint: GLASS, radius: 8, delay: 0.5, life: 3 });
        }
        if (b.t >= wind + 0.65) b.n = 3;
      } else {
        stand(c);
      }
      if (b.n === 3 && b.t >= wind + 1.2) rest(c, 1);
      break;
    }
    case "mend":
      // she sings to the broken glass and a saint stands whole again
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 1.6 / c.haste) {
        b.n = 2;
        const broken = w.lights.filter((l) => l.kind === "window" && l.broken).sort((a, z) => dist(a.pos, u.pos) - dist(z.pos, u.pos))[0];
        if (broken) {
          broken.broken = false;
          broken.holy = true;
          broken.radius = broken.baseRadius;
          w.events.push({ type: "relight", pos: w.windowPoint(broken), light: broken.id, by: u.id });
        }
        b.mem.mendCd = 16;
      }
      if (b.t >= 1.6 / c.haste + 0.3) rest(c, 0.8);
      break;
    case "shatter":
      // she cracks from within: two rings of her own glass
      stand(c);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 0.8) {
        b.n = 2;
        ring(w, u.pos, 24, 240, w.rng(), B(c, { look: "shard", tint: GLASS, radius: 9, bounce: 1 }));
        ring(w, u.pos, 24, 170, w.rng(), B(c, { look: "shard", tint: GLASS, radius: 9, bounce: 1 }));
      }
      if (b.t >= 1.3) rest(c, 1.1);
      break;
    default:
      rest(c, 1);
  }
}

export const SCRIPTS2: Partial<Record<UnitKind, (c: Ctx) => void>> = {
  exorcist,
  mourner,
  ratcatcher,
  mobleader,
  usurer,
  lampmaster,
  abbot,
  scriptor,
  organist,
  glassangel,
};
