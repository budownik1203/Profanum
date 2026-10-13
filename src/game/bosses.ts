/**
 * The bosses: three a floor and the Holy Flame at the end (design doc: Bossowie).
 * Every boss fights for the light: it relights its arena, it is stronger in light (faster attacks,
 * shrugs off hits) and weaker in the dark (see bossTakenMul in combat.ts).
 *
 * This file has the machinery, the first boss of every floor and the Flame; the other ten live in
 * bosses2.ts. The tools the scripts are written with are in bosskit.ts.
 */
import { CONFIG } from "./config.js";
import { add, angleOf, dist, fromAngle, scale, vec } from "./math.js";
import type { UnitKind } from "./data/units.js";
import type { BossState, Unit } from "./types.js";
import type { World } from "./world.js";
import { addZone, bossLit, fan, lob, ring } from "./combat.js";
import { relight, relightable } from "./lighting.js";
import {
  type Ctx, B, adds, aim, blink, cd, choose, cone, contact, crowd, idle, keepDistance, moveTo, placeLight, relightNear, rest, shot, start, summon,
  telegraph, tickCooldowns,
} from "./bosskit.js";
import { ARENAS2, PHASES2, SCRIPTS2, onPhase2 } from "./bosses2.js";

/** Health shares at which a boss enters its next phase. */
const PHASES: Partial<Record<UnitKind, number[]>> = {
  executioner: [0.5],
  captain: [0.5],
  powdermaster: [0.5],
  bishop: [0.55],
  grandinquisitor: [0.5],
  holyflame: [0.6, 0.25],
  ...PHASES2,
};

// ------------------------------------------------------------------ arenas
export function setupBossArena(w: World, kind: UnitKind, depth: number, _rng: () => number): Unit {
  const W = w.room.w;
  const H = w.room.h;
  w.dark = true;
  w.alarm = true;
  const light = (k: Parameters<World["addLight"]>[0], x: number, y: number) => placeLight(w, k, x, y);
  let at = vec(W / 2, H * 0.43);
  switch (kind) {
    case "executioner":
      // the Square of Ashes, where the heretic burned: his stake still smoulders in the middle
      w.theme = "cmentarz";
      light("pyre", W / 2, 470);
      for (const [x, y] of [[420, 380], [1780, 380], [420, 1040], [1780, 1040]] as const) light("pyre", x, y);
      for (const [x, y] of [[300, 720], [1900, 720]] as const) light("brazier", x, y);
      for (const x of [700, 1500]) {
        light("torch", x, 92);
        light("torch", x, H - 92);
      }
      for (const [x, y] of [[760, 560], [1440, 560], [760, 900], [1440, 900], [1100, 1060]] as const) w.addCover(x, y, 70, 30, "tomb");
      at = vec(W / 2, 720);
      break;
    case "captain":
      // the watch barracks yard around its bonfire
      w.theme = "slumsy";
      light("brazier", W / 2, 520);
      for (const [x, y] of [[480, 420], [1720, 420], [480, 1000], [1720, 1000]] as const) light("brazier", x, y);
      for (const x of [700, 1500]) {
        light("torch", x, 92);
        light("torch", x, H - 92);
      }
      for (const [x, y, cw, ch, k] of [[700, 380, 60, 60, "crate"], [1440, 380, 60, 60, "crate"], [700, 960, 140, 36, "cart"], [1360, 960, 140, 36, "cart"], [300, 640, 36, 120, "cart"], [1864, 640, 36, 120, "cart"]] as const) w.addCover(x, y, cw, ch, k);
      at = vec(W / 2, 720);
      break;
    case "powdermaster":
      // a powder warehouse: every barrel is a bomb, for him and for you
      w.theme = "kupiecka";
      light("chandelier", W / 2, 640);
      for (const x of [600, 1600]) {
        light("torch", x, 92);
        light("torch", x, H - 92);
      }
      for (const [x, y] of [[420, 360], [1780, 360], [420, 1040], [1780, 1040]] as const) light("candelabra", x, y);
      for (const [x, y] of [[640, 520], [1520, 520], [640, 880], [1520, 880], [1100, 1060]] as const) w.addCover(x, y, 60, 60, "crate");
      for (const [x, y, k] of [[860, 420, "powder"], [1300, 420, "powder"], [860, 960, "powder"], [1300, 960, "powder"], [300, 700, "oil"], [1860, 700, "oil"]] as const) w.addCover(x, y, 40, 40, k);
      at = vec(W / 2, 380);
      break;
    case "bishop":
      // the monastery's procession hall, candelabra along the way and saints in the glass
      w.theme = "klasztor";
      for (const [x, y] of [[560, 340], [1100, 300], [1640, 340], [560, 1060], [1100, 1100], [1640, 1060]] as const) light("candelabra", x, y);
      light("window", 700, 210);
      light("window", 1500, 210);
      light("chandelier", W / 2, 700);
      for (const [x, y] of [[360, 520], [360, 820], [1800, 520], [1800, 820]] as const) w.addCover(x, y, 50, 50, "pillar");
      for (const [x, y] of [[860, 640], [1200, 640]] as const) w.addCover(x, y, 140, 36, "pew");
      at = vec(W * 0.3, H * 0.3);
      break;
    case "grandinquisitor":
      // the cathedral nave: stained glass that burns, a chandelier that falls
      w.theme = "katedra";
      light("window", 450, 220);
      light("window", 1750, 220);
      light("window", 230, 1050);
      light("window", 1970, 1050);
      light("chandelier", 1100, 720);
      for (const [x, y] of [[700, 400], [1500, 400], [700, 1060], [1500, 1060]] as const) light("candelabra", x, y);
      for (const [x, y] of [[520, 560], [520, 840], [1640, 560], [1640, 840]] as const) w.addCover(x, y, 50, 50, "pillar");
      for (const [x, y] of [[760, 980], [1300, 980], [760, 620], [1300, 620]] as const) w.addCover(x, y, 140, 36, "pew");
      at = vec(W / 2, 440);
      break;
    case "holyflame": {
      // the sanctum: braziers feed the Flame; put them out to wound it
      w.theme = "sanktuarium";
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2 + Math.PI / 6;
        const l = light("brazier", W / 2 + Math.cos(a) * 520, H / 2 + Math.sin(a) * 380);
        l.holy = true;
      }
      for (const [x, y] of [[700, 1000], [1440, 1000]] as const) w.addCover(x, y, 60, 60, "pillar");
      at = vec(W / 2, H * 0.4);
      break;
    }
    default:
      at = ARENAS2[kind]?.(w) ?? at;
      break;
  }
  const boss = w.spawn(kind, at, "enemy");
  // the first reinforcements come a while into the fight
  boss.boss = { phase: 1, step: "intro", t: 0, n: 0, next: 1.5, angle: 0, intro: 2.4, mem: { crowdCd: 10 } };
  if (kind === "holyflame") w.addLight("fire", at, { owner: boss.id, radius: 260 }).holy = false;
  void depth;
  w.events.push({ type: "bossIntro", boss: kind });
  return boss;
}

// ------------------------------------------------------------------ the shared machinery
export function updateBoss(w: World, u: Unit, dt: number): void {
  const b = u.boss ?? (u.boss = { phase: 1, step: "idle", t: 0, n: 0, next: 1, angle: 0, intro: 0, mem: {} });
  const before = { ...u.pos };
  think(w, u, b, dt);
  // for the renderer: how fast it walks (the gait) and how fast it attacks (the telegraphs)
  const moved = dist(before, u.pos);
  b.mem.speed = dt > 0 ? moved / dt : 0;
  b.mem.walk = (b.mem.walk ?? 0) + moved;
  b.mem.haste = hasteOf(w, u, b);
}

function hasteOf(w: World, u: Unit, b: BossState): number {
  return (bossLit(w, u) ? 1.25 : 0.85) * (b.phase >= 2 ? 1.15 : 1) * (b.phase >= 3 ? 1.15 : 1);
}

function think(w: World, u: Unit, b: BossState, dt: number): void {
  if (b.intro > 0) {
    b.intro -= dt;
    if (b.intro <= 0) idle(b, 0.6);
    w.moveUnit(u, vec(), dt);
    return;
  }
  const c: Ctx = {
    w,
    u,
    b,
    dt,
    haste: hasteOf(w, u, b),
    target: w.player.alive ? w.player.pos : w.targetFor(u)?.pos ?? u.pos,
  };
  // crossing a health threshold: a roar and the next phase
  const want = 1 + (PHASES[u.kind] ?? []).filter((th) => u.hp / u.maxHp <= th).length;
  if (want > b.phase) {
    b.phase = want;
    w.events.push({ type: "bossPhase", boss: u.kind, phase: b.phase });
    start(c, "phase");
    onPhase(c);
  }
  if (b.step === "phase") {
    b.t += dt;
    w.moveUnit(u, vec(), dt);
    if (b.t > 1.1) idle(b, 0.4);
    return;
  }
  if (u.st.stun > 0) {
    w.moveUnit(u, vec(), dt);
    return;
  }
  SCRIPTS[u.kind]?.(c);
}

function onPhase(c: Ctx): void {
  const { w, u } = c;
  switch (u.kind) {
    case "bishop": {
      // the litter breaks: the bearers fall, the bishop walks
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        w.corpses.push({ id: 900000 + u.id * 10 + i, kind: "acolyte", pos: add(u.pos, fromAngle(a, 70)), dir: fromAngle(a), echo: CONFIG.necro.echo, raises: 0, fromMinion: false, big: false });
      }
      u.radius = 34;
      w.events.push({ type: "coverBreak", cover: u.id, pos: { ...u.pos }, kind: "pew" });
      summon(c, "acolyte", add(u.pos, vec(-120, 60)));
      summon(c, "acolyte", add(u.pos, vec(120, 60)));
      break;
    }
    case "holyflame":
      // the Flame flares: half its braziers burn again
      relightNear(c, ["brazier"], 3000, 3);
      ring(w, u.pos, 36, 220, w.rng(), B(c, { look: "holy", radius: 9 }));
      w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 160 });
      break;
    case "captain":
      summon(c, "dog", vec(90, w.room.h / 2 - 120));
      summon(c, "dog", vec(w.room.w - 90, w.room.h / 2 + 120));
      break;
    case "executioner":
    case "powdermaster":
    case "grandinquisitor":
      w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 90 });
      break;
    default:
      if (!onPhase2(c)) w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 90 });
  }
}
// ------------------------------------------------------------------ the City Executioner
function executioner(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  switch (b.step) {
    case "idle": {
      const d = dist(u.pos, c.target);
      if (d > 170) moveTo(c, c.target, u.def.speed * 0.7);
      else w.moveUnit(u, vec(), dt);
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const opts: [string, number][] = [["ring", 2], ["torches", 2]];
      if (d < 320) opts.push(["chop", 5]);
      if (cd(c, "relightCd") <= 0 && w.lights.some((l) => l.kind === "pyre" && relightable(l))) opts.push(["relight", 3]);
      if (b.phase >= 2) opts.push(["charge", 3]);
      if (cd(c, "crowdCd") <= 0 && adds(c) < 2) opts.push(["crowd", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "crowd":
      // the townsfolk come to watch the heretic burn again
      crowd(c, b.phase >= 2 ? ["torchbearer", "peasant", "torchbearer"] : ["peasant", "torchbearer"], 16);
      break;
    case "chop": {
      // the axe goes up... and sweeps a wide arc
      if (b.n === 0) {
        b.n = 1;
        u.dir = aim(c);
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 0.75 / c.haste) {
        b.n = 2;
        cone(c, u.dir, 240, 1.15, 12);
        fan(w, u.pos, u.dir, 5, 1.3, 250, B(c, { look: "ember" }));
        w.events.push({ type: "explosion", pos: add(u.pos, scale(u.dir, 100)), radius: 70 });
      }
      if (b.t >= 1.5 / c.haste) rest(c, 1);
      break;
    }
    case "torches":
      if (b.n < 3 && b.t >= b.n * 0.3) {
        const off = fromAngle(w.rng() * Math.PI * 2, w.rng() * 170);
        lob(w, add(u.pos, vec(0, -60)), add(c.target, off), B(c, { look: "torch", radius: 10, damage: 4 }), "fire", 85, 0.85, 170);
        b.n += 1;
      }
      if (b.t > 1.4) rest(c, 1.2);
      break;
    case "ring":
      // he slams the axe into the ground: rings of embers
      if (b.n === 0 && b.t >= 0.55 / c.haste) {
        b.n = 1;
        ring(w, u.pos, 18, 210, w.rng(), B(c));
        w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 80 });
      }
      if (b.n === 1 && b.t >= 0.55 / c.haste + 0.35) {
        b.n = 2;
        ring(w, u.pos, 18, 210, Math.PI / 18 + w.rng() * 0.1, B(c));
      }
      if (b.n === 2 && b.phase >= 2 && b.t >= 0.55 / c.haste + 0.7) {
        b.n = 3;
        ring(w, u.pos, 22, 180, w.rng(), B(c, { look: "fireball", radius: 12 }));
      }
      if (b.t >= 1.7) rest(c, 1.1);
      break;
    case "relight": {
      // back to his stakes: the light is his
      const pyre = w.lights.filter((l) => l.kind === "pyre" && relightable(l)).sort((a, z) => dist(a.pos, u.pos) - dist(z.pos, u.pos))[0];
      if (!pyre || b.t > 5) {
        b.mem.relightCd = 6;
        rest(c, 0.6);
        break;
      }
      if (dist(u.pos, pyre.pos) > 140) {
        moveTo(c, pyre.pos, u.def.speed * 1.25);
      } else {
        w.moveUnit(u, vec(), dt);
        b.mem.gesture = (b.mem.gesture ?? 0) + dt;
        if (b.mem.gesture >= 0.8) {
          relight(w, pyre, u.id);
          b.mem.gesture = 0;
          b.mem.relightCd = 9;
          rest(c, 0.8);
        }
      }
      break;
    }
    case "charge": {
      if (b.n === 0) {
        b.n = 1;
        u.dir = aim(c);
        telegraph(c);
      }
      const wind = 0.8 / c.haste;
      if (b.n === 1 && b.t >= wind) b.n = 2;
      if (b.n === 2) {
        // dragging the burning axe: fire behind him
        w.moveUnit(u, scale(u.dir, 720), dt);
        b.mem.trail = (b.mem.trail ?? 0) - dt;
        if (b.mem.trail <= 0) {
          b.mem.trail = 0.09;
          addZone(w, { kind: "fire", pos: { ...u.pos }, radius: 45, life: 3, warn: 0, side: u.team, dps: 3, burst: 0, halves: 1 });
        }
        contact(c, u.dir, 12);
        if (b.t >= wind + 0.75) b.n = 3;
      }
      if (b.n === 3 && b.t >= wind + 1.6) rest(c, 1);
      break;
    }
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Captain of the City Watch
function captain(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  switch (b.step) {
    case "idle": {
      keepDistance(c, 380, u.def.speed * 0.8);
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const d = dist(u.pos, c.target);
      const opts: [string, number][] = [["pistols", 3]];
      if (cd(c, "volleyCd") <= 0) opts.push(["volley", 3]);
      if (d < 650) opts.push(["lunge", 2]);
      if (cd(c, "summonCd") <= 0 && adds(c) < 3) opts.push(["summon", 2]);
      if (cd(c, "relightCd") <= 0 && w.lights.some((l) => l.kind === "brazier" && relightable(l))) opts.push(["relight", 3]);
      start(c, choose(c, opts));
      break;
    }
    case "pistols": {
      w.moveUnit(u, vec(), dt);
      const wind = 0.45 / c.haste;
      const shots = b.phase >= 2 ? 3 : 2;
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n >= 1 && b.n <= shots && b.t >= wind + (b.n - 1) * 0.35) {
        const dir = fromAngle(angleOf(aim(c)) + (b.n % 2 ? 0 : 0.09));
        fan(w, add(u.pos, scale(dir, 30)), dir, 5, 0.8, 290, B(c, { look: "ball", radius: 9 }));
        w.events.push({ type: "shot", pos: { ...u.pos }, dir, side: u.team, fromPlayer: false });
        b.n += 1;
      }
      if (b.t >= wind + shots * 0.35 + 0.3) rest(c, 1.2);
      break;
    }
    case "volley": {
      // "Volley!": a wall of musket balls from the side, with one gap to run to
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        const H = w.room.h;
        const py = w.player.pos.y;
        let gap = 200 + w.rng() * (H - 400);
        for (let i = 0; i < 10 && Math.abs(gap - py) < 260; i++) gap = 200 + w.rng() * (H - 400);
        b.mem.gapY = gap;
        b.mem.fromEast = w.rng() < 0.5 ? 1 : 0;
        if (b.phase >= 2) {
          const px = w.player.pos.x;
          let gx = 200 + w.rng() * (w.room.w - 400);
          for (let i = 0; i < 10 && Math.abs(gx - px) < 300; i++) gx = 200 + w.rng() * (w.room.w - 400);
          b.mem.gapX = gx;
        }
        b.mem.volleyCd = 9;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 1.1) {
        b.n = 2;
        const { w: RW, h: RH } = w.room;
        const east = b.mem.fromEast === 1;
        for (let y = 80; y < RH - 60; y += 52) {
          if (Math.abs(y - b.mem.gapY) < 110) continue;
          shot(c, vec(east ? RW - 70 : 70, y), vec(east ? -1 : 1, 0), 320, { look: "ball", radius: 9, life: 9 });
        }
        if (b.phase >= 2 && b.mem.gapX !== undefined) {
          for (let x = 80; x < RW - 60; x += 56) {
            if (Math.abs(x - b.mem.gapX) < 120) continue;
            shot(c, vec(x, 70), vec(0, 1), 240, { look: "ball", radius: 9, life: 9, delay: 0.5 });
          }
        }
        w.events.push({ type: "shot", pos: { ...u.pos }, dir: vec(1, 0), side: u.team, fromPlayer: false });
      }
      if (b.t >= 1.6) rest(c, 1.3);
      break;
    }
    case "lunge": {
      // charges with the halberd: two, three once he is wounded
      const wind = 0.6 / c.haste;
      const per = wind + 0.45;
      const k = Math.floor(b.t / per);
      const local = b.t - k * per;
      if (k >= (b.phase >= 2 ? 3 : 2)) {
        rest(c, 1.3);
        break;
      }
      if (local < wind) {
        if (b.n !== k + 1) {
          b.n = k + 1;
          u.dir = aim(c);
          telegraph(c);
        }
        w.moveUnit(u, vec(), dt);
      } else {
        w.moveUnit(u, scale(u.dir, 700), dt);
        contact(c, u.dir, 10);
      }
      break;
    }
    case "summon":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 0.9) {
        b.n = 1;
        const H = w.room.h;
        summon(c, "halberdier", vec(90, H / 2 - 160));
        summon(c, "halberdier", vec(w.room.w - 90, H / 2 + 160));
        summon(c, b.phase >= 2 ? "sergeant" : "arquebusier", vec(w.room.w / 2, 120));
        b.mem.summonCd = 15;
      }
      if (b.t >= 1.4) rest(c, 1);
      break;
    case "relight":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 1) {
        b.n = 1;
        relightNear(c, ["brazier", "torch"], 3000, 2);
        b.mem.relightCd = 10;
      }
      if (b.t >= 1.3) rest(c, 0.8);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Powder Master
function powdermaster(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  switch (b.step) {
    case "idle": {
      keepDistance(c, 430, u.def.speed);
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const d = dist(u.pos, c.target);
      const opts: [string, number][] = [["bombs", 3], ["keg", 2], ["fuse", 2]];
      if (cd(c, "oilCd") <= 0 && w.zones.filter((z) => z.permanent).length < 4) opts.push(["oil", 1]);
      if (d < 280) opts.push(["blink", 3]);
      if (b.phase >= 2) opts.push(["spiral", 3]);
      if (b.phase >= 2 && cd(c, "crowdCd") <= 0 && adds(c) < 2) opts.push(["crowd", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "crowd":
      // the warehouse guards come running at the noise
      crowd(c, ["arquebusier", "halberdier"], 18);
      break;
    case "bombs":
      w.moveUnit(u, vec(), dt);
      if (b.n < 4 && b.t >= 0.25 + b.n * 0.16) {
        const off = b.n === 0 ? vec() : fromAngle(w.rng() * Math.PI * 2, 60 + w.rng() * 170);
        lob(w, add(u.pos, vec(0, -50)), add(c.target, off), B(c, { look: "bomb", radius: 11, damage: 6 }), "explode", 100, 0.9, 200);
        b.n += 1;
      }
      if (b.t > 1.4) rest(c, 1.2);
      break;
    case "keg":
      w.moveUnit(u, vec(), dt);
      if (b.n < (b.phase >= 2 ? 2 : 1) && b.t >= 0.4 + b.n * 0.5) {
        const to = add(c.target, fromAngle(w.rng() * Math.PI * 2, b.n * 140));
        lob(w, { ...u.pos }, w.collideWorld(to, 20), B(c, { look: "bomb", radius: 18, damage: 8 }), "keg", 120, 1.6, 12);
        b.n += 1;
      }
      if (b.t > 1.8) rest(c, 1.2);
      break;
    case "fuse": {
      // a powder trail lit at his feet runs towards you
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        const dir = aim(c);
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const p = add(u.pos, scale(dir, 90 * i));
          if (p.x < 70 || p.y < 70 || p.x > w.room.w - 70 || p.y > w.room.h - 70) break;
          addZone(w, { kind: "fire", pos: p, radius: 52, life: 0.3 + i * 0.12 + 2.6, warn: 0.3 + i * 0.12, side: u.team, dps: 4, burst: 0, halves: 1 });
        }
      }
      if (b.t > 1.2) rest(c, 1);
      break;
    }
    case "oil":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 0.4) {
        b.n = 1;
        const to = add(c.target, fromAngle(w.rng() * Math.PI * 2, 160 + w.rng() * 120));
        lob(w, add(u.pos, vec(0, -50)), w.collideWorld(to, 40), B(c, { look: "flask", radius: 10, damage: 0 }), "oil", 110, 1, 180);
        b.mem.oilCd = 12;
      }
      if (b.t > 1) rest(c, 0.8);
      break;
    case "blink":
      if (b.n === 0) {
        b.n = 1;
        blink(c, 520);
      }
      if (b.t > 0.5) rest(c, 0.8);
      break;
    case "spiral":
      // Greek fire: a spiral of burning powder
      w.moveUnit(u, vec(), dt);
      b.mem.emit = (b.mem.emit ?? 0) - dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 3.4) {
        b.mem.emit = 0.075;
        b.angle += 0.32;
        for (const off of [0, Math.PI]) shot(c, u.pos, fromAngle(b.angle + off), 220, { look: "fireball", radius: 11 });
      }
      if (b.t > 3.8) rest(c, 1.3);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Bishop of the Procession
const ROUTE = [vec(0.3, 0.3), vec(0.7, 0.3), vec(0.7, 0.7), vec(0.3, 0.7)];

function bishop(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  const walk = () => {
    if (b.phase === 1) {
      // carried along the procession route by his bearers
      const i = (b.mem.route ?? 0) % ROUTE.length;
      const goal = vec(ROUTE[i].x * w.room.w, ROUTE[i].y * w.room.h);
      if (dist(u.pos, goal) < 20) b.mem.route = i + 1;
      moveTo(c, goal, u.def.speed);
    } else {
      keepDistance(c, 320, 95);
    }
  };
  switch (b.step) {
    case "idle": {
      walk();
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const opts: [string, number][] = [["cross", 3], ["rosette", 3], ["censers", 2]];
      if (cd(c, "consecrateCd") <= 0 && w.lights.some((l) => (l.kind === "candelabra" || l.kind === "chandelier") && relightable(l))) opts.push(["consecrate", 3]);
      if (b.phase >= 2) {
        opts.push(["rain", 2]);
        if (cd(c, "summonCd") <= 0 && adds(c) < 4) opts.push(["summon", 2]);
      }
      start(c, choose(c, opts));
      break;
    }
    case "cross": {
      walk();
      if (b.n === 0 && b.t >= 0.3) {
        b.n = 1;
        const arms = b.phase >= 2 ? 6 : 4;
        const spin = (b.mem.spinSign = -(b.mem.spinSign ?? 1)) * 0.35;
        b.angle += 0.4;
        for (let a = 0; a < arms; a++) {
          for (let k = 0; k < 7; k++) shot(c, u.pos, fromAngle(b.angle + (a / arms) * Math.PI * 2), 150 + k * 28, { look: "cross", radius: 9, spin });
        }
      }
      if (b.t > 0.9) rest(c, 1.1);
      break;
    }
    case "rosette":
      walk();
      if (b.n < 3 && b.t >= b.n * 0.28) {
        const n = 14;
        ring(w, u.pos, n, 170, b.n * (Math.PI / n) * 0.66 + b.angle, B(c, { look: "rosette", radius: 9, spin: (b.n % 2 ? 1 : -1) * 0.5 }));
        b.n += 1;
      }
      if (b.t > 1.2) rest(c, 1.1);
      break;
    case "censers":
      walk();
      if (b.n === 0 && b.t >= 0.4) {
        b.n = 1;
        const a = angleOf(aim(c));
        for (const off of [-1.3, 0, 1.3]) fan(w, u.pos, fromAngle(a + off), 5, 0.5, 190, B(c, { look: "ember" }));
      }
      if (b.t > 0.9) rest(c, 1);
      break;
    case "consecrate":
      // he stops and blesses the candles back to light
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 1.4 / c.haste) {
        b.n = 2;
        relightNear(c, ["candelabra", "candle", "chandelier", "brazier"], 900, 6);
        b.mem.consecrateCd = 12;
      }
      if (b.t >= 1.7 / c.haste) rest(c, 0.8);
      break;
    case "rain":
      walk();
      if (b.n === 0) {
        b.n = 1;
        const at = c.target;
        addZone(w, { kind: "holyfire", pos: { ...at }, radius: 80, life: 1.4, warn: 0.9, side: u.team, dps: 0, burst: 4, halves: 1 });
        for (let i = 0; i < 4; i++) {
          const p = add(at, fromAngle((i / 4) * Math.PI * 2 + w.rng(), 170));
          addZone(w, { kind: "holyfire", pos: p, radius: 80, life: 1.6, warn: 1.1, side: u.team, dps: 0, burst: 4, halves: 1 });
        }
      }
      if (b.t > 1.5) rest(c, 1);
      break;
    case "summon":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        for (let i = 0; i < 3; i++) summon(c, "acolyte", add(u.pos, fromAngle((i / 3) * Math.PI * 2, 110)));
        b.mem.summonCd = 12;
      }
      if (b.t > 1.2) rest(c, 1);
      break;
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Grand Inquisitor
/** The lantern's beam: the arc it sweeps and how long it takes (slower than a running necromancer). */
export const BEAM_SWEEP = 1.6;
export const BEAM_TIME = 2.4;

function grandinquisitor(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  switch (b.step) {
    case "idle": {
      keepDistance(c, 380, u.def.speed * 0.8);
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const opts: [string, number][] = [["bursts", 3], ["beam", 2], ["hook", 2], ["stakes", 2]];
      if (b.phase >= 2) {
        if (cd(c, "penitentCd") <= 0 && adds(c) < 2) opts.push(["penitents", 2]);
        if (cd(c, "blinkCd") <= 0 && w.lights.some((l) => l.kind === "window" && l.holy)) opts.push(["blink", 2]);
      }
      start(c, choose(c, opts));
      break;
    }
    case "bursts": {
      w.moveUnit(u, vec(), dt);
      const wind = 0.4 / c.haste;
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if ((b.n === 1 && b.t >= wind) || (b.n === 2 && b.t >= wind + 0.5)) {
        fan(w, u.pos, aim(c), 4, 0.6, 400, B(c, { look: "holy", radius: 8 }));
        w.events.push({ type: "shot", pos: { ...u.pos }, dir: aim(c), side: u.team, fromPlayer: false });
        b.n += 1;
      }
      if (b.t >= wind + 0.9) rest(c, 1.1);
      break;
    }
    case "beam": {
      // he raises his lantern: a sweeping line of holy light
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        b.angle = angleOf(aim(c)) - (BEAM_SWEEP / 2) * (b.mem.beamSign = -(b.mem.beamSign ?? 1));
        telegraph(c);
      }
      const wind = 0.5;
      if (b.t >= wind && b.t < wind + BEAM_TIME) {
        b.mem.emit = (b.mem.emit ?? 0) - dt;
        // the light falters now and then: gaps to slip through
        const gap = Math.floor((b.t - wind) / 0.25) % 3 === 2;
        if (b.mem.emit <= 0 && !gap) {
          b.mem.emit = 0.05;
          const a = b.angle + BEAM_SWEEP * b.mem.beamSign * ((b.t - wind) / BEAM_TIME);
          shot(c, u.pos, fromAngle(a), 370, { look: "holy", radius: 9 });
        }
      }
      if (b.t >= wind + BEAM_TIME + 0.3) rest(c, 1.2);
      break;
    }
    case "hook":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 0.5 / c.haste) {
        b.n = 2;
        shot(c, u.pos, aim(c), 600, { look: "bolt", radius: 12, pullTo: { ...u.pos } });
      }
      if (b.t >= 0.9) rest(c, 0.9);
      break;
    case "stakes":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 0.3) {
        b.n = 1;
        const spots = [c.target, add(c.target, fromAngle(w.rng() * 6.28, 260)), add(c.target, fromAngle(w.rng() * 6.28, 380))];
        for (const p of spots) addZone(w, { kind: "holyfire", pos: w.collideWorld(p, 60), radius: 70, life: 7, warn: 1, side: u.team, dps: 3, burst: 3, halves: 1 });
      }
      if (b.t > 1.2) rest(c, 1);
      break;
    case "penitents":
      w.moveUnit(u, vec(), dt);
      if (b.n === 0 && b.t >= 0.8) {
        b.n = 1;
        // his penitents: they whip themselves into a frenzy and die easily
        summon(c, "flagellant", vec(120, w.room.h / 2));
        summon(c, "flagellant", vec(w.room.w - 120, w.room.h / 2));
        b.mem.penitentCd = 20;
      }
      if (b.t > 1.2) rest(c, 1);
      break;
    case "blink": {
      // he steps into the holy light of a window
      const holy = w.lights.filter((l) => l.kind === "window" && l.holy);
      if (b.n === 0 && holy.length) {
        b.n = 1;
        const l = holy[Math.floor(w.rng() * holy.length)];
        w.events.push({ type: "dodge", pos: { ...u.pos }, dir: vec(0, -1) });
        u.pos = w.collideWorld(l.pos, u.radius);
        b.mem.blinkCd = 9;
      }
      if (b.t > 0.4) rest(c, 0.7);
      break;
    }
    default:
      rest(c, 1);
  }
}

// ------------------------------------------------------------------ the Holy Flame
function holyflame(c: Ctx): void {
  const { w, u, b, dt } = c;
  b.t += dt;
  tickCooldowns(c);
  // its braziers shield it: four or more burning and it barely feels a thing
  const burning = w.lights.filter((l) => l.kind === "brazier" && l.on).length;
  b.mem.shield = burning >= 4 ? 1 : 0;
  b.mem.burning = burning;
  // a tongue of fire relights one brazier now and then
  b.mem.feed = (b.mem.feed ?? 6) - dt;
  if (b.mem.feed <= 0) {
    b.mem.feed = b.phase >= 2 ? 7 : 9;
    const l = w.lights.filter((x) => x.kind === "brazier" && relightable(x)).sort((a, z) => dist(a.pos, u.pos) - dist(z.pos, u.pos))[0];
    if (l) {
      b.mem.tongue = l.id;
      b.mem.tongueT = 1.2;
    }
  }
  if (b.mem.tongueT !== undefined && b.mem.tongueT > 0) {
    b.mem.tongueT -= dt;
    if (b.mem.tongueT <= 0) {
      const l = w.lights.find((x) => x.id === b.mem.tongue);
      if (l && relightable(l)) relight(w, l, u.id);
    }
  }
  // the third phase: an endless slow spiral under everything else
  if (b.phase >= 3) {
    b.mem.drip = (b.mem.drip ?? 0) - dt;
    if (b.mem.drip <= 0) {
      b.mem.drip = 0.22;
      b.mem.dripA = (b.mem.dripA ?? 0) + 0.5;
      shot(c, u.pos, fromAngle(b.mem.dripA), 150, { look: "fireball", radius: 10 });
    }
  }
  const hover = () => {
    if (b.phase >= 2) {
      const d = dist(u.pos, c.target);
      if (d > 260) moveTo(c, c.target, 55);
      else w.moveUnit(u, vec(), dt);
    } else {
      const home = vec(w.room.w / 2, w.room.h * 0.4 + Math.sin(w.time * 0.8) * 20);
      moveTo(c, home, 40);
    }
  };
  switch (b.step) {
    case "idle": {
      hover();
      b.next -= dt * c.haste;
      if (b.next > 0) break;
      const opts: [string, number][] = [["spiral", 3], ["pillars", 3], ["rings", 2], ["embers", 2]];
      if (b.phase >= 2 && cd(c, "sermonCd") <= 0) opts.push(["sermon", 2]);
      if (b.phase >= 2 && cd(c, "crowdCd") <= 0 && adds(c) < 3) opts.push(["crowd", 2]);
      start(c, choose(c, opts));
      break;
    }
    case "crowd":
      // the faithful walk into the fire for it
      hover();
      crowd(c, ["flagellant", "acolyte", "flagellant"], 18);
      break;
    case "spiral": {
      hover();
      const arms = b.phase >= 2 ? 3 : 2;
      b.mem.emit = (b.mem.emit ?? 0) - dt;
      if (b.mem.emit <= 0 && b.t >= 0.4 && b.t < 3.4) {
        b.mem.emit = 0.085;
        b.angle += 0.27;
        for (let k = 0; k < arms; k++) shot(c, u.pos, fromAngle(b.angle + (k / arms) * Math.PI * 2), 185, { look: "fireball", radius: 11 });
      }
      if (b.t > 3.8) rest(c, 1.2);
      break;
    }
    case "pillars":
      hover();
      if (b.n < 4 && b.t >= b.n * 0.45) {
        addZone(w, { kind: "holyfire", pos: { ...c.target }, radius: 85, life: 1.3, warn: 0.8, side: u.team, dps: 0, burst: 5, halves: 1 });
        b.n += 1;
      }
      if (b.t > 2.4) rest(c, 1);
      break;
    case "rings":
      hover();
      if (b.n < 3 && b.t >= b.n * 0.6) {
        const n = 22;
        const gapAt = Math.floor(w.rng() * n);
        for (let i = 0; i < n; i++) {
          if ((i - gapAt + n) % n < 4) continue; // a gap to slip through
          shot(c, u.pos, fromAngle((i / n) * Math.PI * 2 + b.n * 0.1), 200, { look: "holy", radius: 10 });
        }
        b.n += 1;
      }
      if (b.t > 2) rest(c, 1.1);
      break;
    case "embers":
      hover();
      if (b.n === 0 && b.t >= 0.3) {
        b.n = 1;
        for (let i = 0; i < 6; i++) shot(c, u.pos, fromAngle((i / 6) * Math.PI * 2 + w.rng()), 150, { look: "ember", radius: 10, homing: 1.5, life: 6 });
      }
      if (b.t > 1) rest(c, 1.2);
      break;
    case "sermon":
      // the Flame flares: two rings of holy fire
      w.moveUnit(u, vec(), dt);
      if (b.n === 0) {
        b.n = 1;
        telegraph(c);
      }
      if (b.n === 1 && b.t >= 1.2) {
        b.n = 2;
        ring(w, u.pos, 36, 230, w.rng(), B(c, { look: "holy", radius: 9 }));
        ring(w, u.pos, 24, 160, w.rng(), B(c, { look: "fireball", radius: 11 }));
        w.events.push({ type: "explosion", pos: { ...u.pos }, radius: 180 });
        b.mem.sermonCd = 16;
      }
      if (b.t > 1.8) rest(c, 1.2);
      break;
    default:
      rest(c, 1);
  }
}

const SCRIPTS: Partial<Record<UnitKind, (c: Ctx) => void>> = {
  executioner,
  captain,
  powdermaster,
  bishop,
  grandinquisitor,
  holyflame,
  ...SCRIPTS2,
};
