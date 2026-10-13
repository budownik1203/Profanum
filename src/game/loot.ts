/**
 * Everything the necromancer takes: souls aside, gold, ammunition, hearts, keys, weapons and items
 * on the floor; chests (opened with a key or smashed), the fence's shop, the desecrated altar
 * (legends, rituals), stairs down. Also raising the dead and stitching abominations, since E
 * does all of it: it acts on whatever is nearest.
 */
import { CONFIG } from "./config.js";
import { type Vec, add, dist, fromAngle, norm, scale, sub, vec } from "./math.js";
import { ITEMS, LEGEND_COST, RELICS, STARTING_POOL, type ItemId, type LegendId, type RelicId } from "./data/items.js";
import { UNITS, type UnitKind } from "./data/units.js";
import { WEAPONS, type WeaponId } from "./data/weapons.js";
import type { Chest, ChestTier, Corpse, Interactable, Pickup, PickupKind, RitualForm, Unit } from "./types.js";
import type { World } from "./world.js";
import { nextId, pick, randInt } from "./shared.js";
import { giveItem, giveRelic, giveWeapon, maxAmmo } from "./stats.js";

// ------------------------------------------------------------------ raising the dead
/** The corpse E would raise right now, if any. */
export function raisableCorpse(w: World): Corpse | undefined {
  let best: Corpse | undefined;
  let bestD: number = CONFIG.necro.raiseRange;
  for (const c of w.corpses) {
    if (c.echo <= 0 || c.raises >= CONFIG.necro.maxRaises || c.big) continue;
    const d = dist(c.pos, w.player.pos);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Minions that count against the limit (ash-grimoire minis and the abomination don't). */
export function boundMinions(w: World): number {
  return w.units.filter((u) => u.team === "minion" && !u.mini && u.kind !== "abomination").length;
}

export function tryRaise(w: World): boolean {
  const c = raisableCorpse(w);
  if (!c) return false;
  const stats = w.player.stats;
  if (boundMinions(w) >= stats.minionLimit) {
    w.events.push({ type: "raiseFail", pos: { ...c.pos }, reason: "limit" });
    return true;
  }
  if (w.player.souls < stats.raiseCost) {
    w.events.push({ type: "raiseFail", pos: { ...c.pos }, reason: "noSouls" });
    return true;
  }
  w.player.souls -= stats.raiseCost;
  raiseCorpse(w, c);
  return true;
}

function raiseCorpse(w: World, c: Corpse, free = false): Unit {
  const u = w.spawn(c.kind, c.pos, "minion");
  u.raises = c.raises + 1;
  w.corpses = w.corpses.filter((x) => x !== c);
  w.events.push({ type: "raise", pos: { ...c.pos }, kind: c.kind, unit: u.id, free });
  return u;
}

/** The plague doctor's infected and the ash grimoire's victims get up on their own. */
export function autoRaise(w: World, dead: Unit, mini: boolean): void {
  const c = w.corpses.find((x) => x.kind === dead.kind && dist(x.pos, dead.pos) < 1 && x.echo > 0);
  if (!c) return;
  if (mini) {
    if (w.units.filter((u) => u.team === "minion" && u.mini && u.alive).length >= 4) return;
    const u = w.spawn(c.kind, c.pos, "minion", { mini: true });
    w.corpses = w.corpses.filter((x) => x !== c);
    w.events.push({ type: "raise", pos: { ...c.pos }, kind: c.kind, unit: u.id, free: true });
    return;
  }
  if (boundMinions(w) >= w.player.stats.minionLimit) return;
  raiseCorpse(w, c, true);
}

/** Stitch the bodies lying around into one abomination (design doc: Abominacje). */
function tryAbomination(w: World): boolean {
  const n = CONFIG.necro;
  if (w.units.some((u) => u.alive && u.kind === "abomination")) return false;
  const near = w.corpses.filter((c) => dist(c.pos, w.player.pos) < n.abominationRange && !c.big).slice(0, 6);
  if (near.length < n.abominationCorpses) return false;
  if (w.player.souls < n.abominationCost) {
    w.events.push({ type: "raiseFail", pos: { ...w.player.pos }, reason: "noSouls" });
    return true;
  }
  w.player.souls -= n.abominationCost;
  const at = near.reduce((s, c) => add(s, scale(c.pos, 1 / near.length)), vec());
  // better bodies make a stronger brute
  const quality = near.reduce((s, c) => s + UNITS[c.kind].hp, 0);
  const u = w.spawn("abomination", at, "minion");
  u.maxHp = u.hp = 20 + quality * 1.2;
  u.stitched = near.length;
  u.lifetime = Infinity;
  w.corpses = w.corpses.filter((c) => !near.includes(c));
  w.events.push({ type: "abomination", pos: at, corpses: near.length });
  return true;
}

// ------------------------------------------------------------------ drops
function drop(w: World, kind: PickupKind, at: Vec, value = 1, ref?: string, price?: number): Pickup {
  const a = w.rng() * Math.PI * 2;
  const speed = price !== undefined ? 0 : 140 + w.rng() * 160;
  const p: Pickup = { id: nextId(), kind, pos: { ...at }, vel: fromAngle(a, speed), value, ref, price, delay: price !== undefined ? 0 : 0.35 };
  w.pickups.push(p);
  return p;
}

export function placePickup(w: World, kind: PickupKind, at: Vec, value = 1, ref?: string, price?: number): Pickup {
  const p = drop(w, kind, at, value, ref, price);
  p.vel = vec();
  p.delay = 0;
  return p;
}

/** What a dead enemy leaves: gold, sometimes ammunition, a key or a heart; elites carry weapon remains. */
export function dropLoot(w: World, u: Unit): void {
  const l = CONFIG.loot;
  const [g0, g1] = u.def.gold;
  let gold = Math.round(randInt(w.rng, g0, g1) * (u.elite ? 3 : 1) * w.player.stats.goldMul);
  while (gold > 0) {
    const coin = gold >= 5 && w.rng() < 0.5 ? 5 : 1;
    drop(w, "gold", u.pos, coin);
    gold -= coin;
  }
  if (u.def.boss) return; // bosses have their own rewards (onBossDeath)
  if (w.rng() < l.ammoDropChance) drop(w, "ammo", u.pos);
  if (w.rng() < l.keyDropChance) drop(w, "key", u.pos);
  if (w.rng() < l.heartDropChance) drop(w, "halfHeart", u.pos);
  if (u.elite) {
    const legend = freshLegend(w);
    if (legend) drop(w, "remains", u.pos, 1, legend);
    else drop(w, "ammoBox", u.pos);
  }
}

/** Remains of a legend the necromancer doesn't own yet. */
function freshLegend(w: World): LegendId | null {
  const p = w.player;
  const all: LegendId[] = ["gerwazy", "lament", "martyrs", "headsman"];
  const free = all.filter((id) => !p.remains.includes(id) && !p.weapons.some((s) => s.id === id) && !w.pickups.some((x) => x.ref === id));
  return free.length ? pick(w.rng, free) : null;
}

/** Each boss leaves its prize, Echo of Souls (kept after death) and the way down. */
export const BOSS_PRIZE: Partial<Record<UnitKind, { weapon?: WeaponId; remains?: LegendId; echo: number }>> = {
  executioner: { remains: "headsman", echo: 10 },
  exorcist: { remains: "gerwazy", echo: 10 },
  mourner: { remains: "lament", echo: 10 },
  captain: { weapon: "captainarq", echo: 12 },
  ratcatcher: { weapon: "ratgun", echo: 12 },
  mobleader: { weapon: "sling", echo: 12 },
  powdermaster: { weapon: "mortar", echo: 14 },
  usurer: { weapon: "coingun", echo: 14 },
  lampmaster: { weapon: "snuffer", echo: 14 },
  bishop: { remains: "martyrs", echo: 16 },
  abbot: { weapon: "abbotbell", echo: 16 },
  scriptor: { weapon: "ashbook", echo: 16 },
  grandinquisitor: { weapon: "inqcrossbow", remains: "gerwazy", echo: 18 },
  organist: { weapon: "organ", echo: 18 },
  glassangel: { weapon: "glassgun", echo: 18 },
  holyflame: { echo: 40 },
};

export function onBossDeath(w: World, u: Unit): void {
  const prize = BOSS_PRIZE[u.kind];
  const at = u.pos;
  w.events.push({ type: "bossDeath", boss: u.kind, pos: { ...at } });
  if (!prize) return;
  placePickup(w, "echo", add(at, vec(-60, 30)), prize.echo);
  if (prize.weapon && !w.player.weapons.some((s) => s.id === prize.weapon)) placePickup(w, "weapon", add(at, vec(60, 30)), 1, prize.weapon);
  if (prize.remains && !w.player.remains.includes(prize.remains)) placePickup(w, "remains", add(at, vec(0, 70)), 1, prize.remains);
  placePickup(w, "heart", add(at, vec(-60, 90)));
  if (u.kind !== "holyflame") {
    w.addInteractable("stairs", { x: w.room.w / 2, y: w.room.h / 2 }, { radius: 80 });
  }
}

/** Cleared room: the relic charges, and sometimes something is left behind. */
export function onRoomCleared(w: World): void {
  const p = w.player;
  if (p.relic) {
    const max = RELICS[p.relic.id].charge;
    const before = p.relic.charge;
    p.relic.charge = Math.min(max, p.relic.charge + 1 + p.stats.relicChargeBonus);
    if (before < max && p.relic.charge >= max) w.events.push({ type: "relicReady", relic: p.relic.id });
  }
  if (w.roomType === "combat" && w.rng() < CONFIG.loot.roomRewardChance) {
    const r = w.rng();
    const kind: PickupKind = r < 0.35 ? "ammoBox" : r < 0.6 ? "halfHeart" : r < 0.8 ? "gold" : r < 0.92 ? "key" : "heart";
    drop(w, kind, add(p.pos, vec(0, -60)), kind === "gold" ? 5 : 1);
  }
}

// ------------------------------------------------------------------ pickups
function wantsAmmo(w: World): number {
  const p = w.player;
  const cur = p.weapons[p.current];
  const can = (i: number) => {
    const s = p.weapons[i];
    return Number.isFinite(maxAmmo(p, s)) && s.ammo < maxAmmo(p, s);
  };
  if (cur && can(p.current)) return p.current;
  return p.weapons.findIndex((_, i) => can(i));
}

function autoCollect(w: World, pk: Pickup): boolean {
  const p = w.player;
  switch (pk.kind) {
    case "gold":
      p.gold += pk.value;
      return true;
    case "echo":
      return true; // counted by the run (see run.ts) from the pickup event
    case "key":
      p.keys += 1;
      return true;
    case "armor":
      p.armor += 1;
      return true;
    case "heart":
    case "halfHeart": {
      if (p.halves >= p.maxHalves) return false;
      p.halves = Math.min(p.maxHalves, p.halves + (pk.kind === "heart" ? 2 : 1));
      return true;
    }
    case "ammo":
    case "ammoBox": {
      const i = wantsAmmo(w);
      if (i < 0) return false;
      const s = p.weapons[i];
      const max = maxAmmo(p, s);
      const add = pk.kind === "ammoBox" ? max : Math.max(1, Math.round(max * CONFIG.loot.ammoShare));
      s.ammo = Math.min(max, s.ammo + add);
      return true;
    }
    default:
      return false;
  }
}

const MANUAL: readonly PickupKind[] = ["weapon", "item", "relic", "remains", "note"];

export function updatePickups(w: World, dt: number): void {
  const p = w.player;
  const l = CONFIG.loot;
  for (const pk of w.pickups) {
    pk.vel = scale(pk.vel, Math.max(0, 1 - dt * 6));
    pk.pos = w.collideWorld(add(pk.pos, scale(pk.vel, dt)), 8);
    if (pk.delay > 0) {
      pk.delay -= dt;
      continue;
    }
    if (!p.alive || pk.price !== undefined || MANUAL.includes(pk.kind)) continue;
    const d = dist(pk.pos, p.pos);
    if ((pk.kind === "gold" || pk.kind === "echo") && d < l.magnet) {
      pk.vel = add(pk.vel, scale(norm(sub(p.pos, pk.pos)), 1600 * dt));
    }
    if (d < l.pickupRange && autoCollect(w, pk)) {
      pk.value = -Math.abs(pk.value) - 0.5; // mark as taken
      w.events.push({ type: "pickup", pos: { ...pk.pos }, kind: pk.kind, value: Math.abs(pk.value + 0.5), ref: pk.ref });
    }
  }
  w.pickups = w.pickups.filter((pk) => pk.value >= 0);
}

// ------------------------------------------------------------------ interaction (E)
export type InteractTarget =
  | { kind: "pickup"; pickup: Pickup; pos: Vec }
  | { kind: "chest"; chest: Chest; pos: Vec }
  | { kind: "thing"; thing: Interactable; pos: Vec }
  | { kind: "corpse"; corpse: Corpse; pos: Vec }
  | { kind: "abomination"; pos: Vec };

/** What E would act on right now (the renderer shows it as a hint). */
export function interactTarget(w: World): InteractTarget | null {
  const p = w.player;
  const range = CONFIG.loot.interactRange;
  let best: InteractTarget | null = null;
  let bestD = Infinity;
  const consider = (t: InteractTarget, d: number, r: number) => {
    if (d < r && d < bestD) {
      bestD = d;
      best = t;
    }
  };
  for (const pk of w.pickups) if (pk.delay <= 0 && (pk.price !== undefined || MANUAL.includes(pk.kind))) consider({ kind: "pickup", pickup: pk, pos: pk.pos }, dist(pk.pos, p.pos), range);
  for (const c of w.chests) if (!c.opened && !c.broken) consider({ kind: "chest", chest: c, pos: c.pos }, dist(c.pos, p.pos), range);
  for (const it of w.interactables) {
    if (it.kind === "bell" || it.kind === "secret" || (it.used && it.kind !== "stairs" && it.kind !== "altar" && it.kind !== "fence")) continue;
    consider({ kind: "thing", thing: it, pos: it.pos }, dist(it.pos, p.pos), Math.max(range, it.radius));
  }
  const corpse = raisableCorpse(w);
  if (corpse) consider({ kind: "corpse", corpse, pos: corpse.pos }, dist(corpse.pos, p.pos) + 0.1, CONFIG.necro.raiseRange);
  if (!best) {
    const n = CONFIG.necro;
    const near = w.corpses.filter((c) => dist(c.pos, p.pos) < n.abominationRange && !c.big);
    if (near.length >= n.abominationCorpses && !w.units.some((u) => u.alive && u.kind === "abomination")) best = { kind: "abomination", pos: { ...p.pos } };
  }
  return best;
}

/** E pressed: act on the nearest thing. Returns false if there was nothing to do. */
export function interact(w: World): boolean {
  const t = interactTarget(w);
  if (!t) return false;
  switch (t.kind) {
    case "corpse":
      return tryRaise(w);
    case "abomination":
      return tryAbomination(w);
    case "pickup":
      return takePickup(w, t.pickup);
    case "chest":
      return openChest(w, t.chest);
    case "thing":
      return useThing(w, t.thing);
  }
}

function takePickup(w: World, pk: Pickup): boolean {
  const p = w.player;
  if (pk.price !== undefined) {
    const price = shopPrice(w, pk.price);
    if (p.gold < price) {
      w.events.push({ type: "tooPoor", pos: { ...pk.pos } });
      return true;
    }
    // something you can't use right now stays on the counter
    if ((pk.kind === "heart" || pk.kind === "halfHeart") && p.halves >= p.maxHalves) return true;
    if ((pk.kind === "ammo" || pk.kind === "ammoBox") && wantsAmmo(w) < 0) return true;
    p.gold -= price;
    w.events.push({ type: "buy", pos: { ...pk.pos }, price });
    pk.price = undefined;
    if (!MANUAL.includes(pk.kind)) {
      autoCollect(w, pk);
      w.events.push({ type: "pickup", pos: { ...pk.pos }, kind: pk.kind, value: pk.value, ref: pk.ref });
      w.pickups = w.pickups.filter((x) => x !== pk);
      return true;
    }
  }
  switch (pk.kind) {
    case "weapon": {
      const r = giveWeapon(p, pk.ref as WeaponId);
      w.events.push({ type: "itemGet", pos: { ...pk.pos }, item: pk.ref!, kind: "weapon" });
      if (r === "ammo") w.events.push({ type: "pickup", pos: { ...pk.pos }, kind: "ammoBox", value: 1 });
      break;
    }
    case "item":
      giveItem(p, pk.ref as ItemId);
      w.events.push({ type: "itemGet", pos: { ...pk.pos }, item: pk.ref!, kind: "item" });
      break;
    case "relic": {
      const old = giveRelic(p, pk.ref as RelicId);
      w.events.push({ type: "itemGet", pos: { ...pk.pos }, item: pk.ref!, kind: "relic" });
      if (old) placePickup(w, "relic", add(pk.pos, vec(0, 50)), 1, old);
      break;
    }
    case "remains":
      p.remains.push(pk.ref as LegendId);
      w.events.push({ type: "itemGet", pos: { ...pk.pos }, item: pk.ref!, kind: "remains" });
      break;
    case "note":
      w.events.push({ type: "note", index: pk.value });
      break;
    default:
      break;
  }
  w.pickups = w.pickups.filter((x) => x !== pk);
  return true;
}

export function shopPrice(w: World, base: number): number {
  return Math.max(1, Math.round(base * w.player.stats.shopMul * (1 + CONFIG.loot.priceRise * (w.ctx.depth - 1))));
}

function useThing(w: World, it: Interactable): boolean {
  switch (it.kind) {
    case "stairs":
      w.events.push({ type: "stairs" });
      return true;
    case "altar":
      return useAltar(w, it);
    case "note":
      it.used = true;
      w.events.push({ type: "note", index: Number(it.ref ?? 0) });
      return true;
    default:
      w.events.push({ type: "station", ref: it.ref ?? it.kind });
      return true;
  }
}

/** What the altar would do for the necromancer right now. */
export function altarOffer(w: World, it: Interactable): { kind: "legend"; legend: LegendId; cost: number } | { kind: "ritual"; form: RitualForm; minion: Unit } | { kind: "none" } {
  const p = w.player;
  if (p.remains.length > 0) return { kind: "legend", legend: p.remains[0], cost: LEGEND_COST[p.remains[0]] };
  const slot = p.weapons[p.current];
  if (slot && WEAPONS[slot.id].rarity === "legend" && !slot.ritual) {
    const victim = w.units.filter((u) => u.alive && u.team === "minion" && u.kind !== "abomination" && dist(u.pos, it.pos) < 260).sort((a, b) => dist(a.pos, it.pos) - dist(b.pos, it.pos))[0];
    if (victim) return { kind: "ritual", form: ritualFormOf(victim.kind), minion: victim };
  }
  return { kind: "none" };
}

/** The sacrificed minion's role decides the legend's final form (design doc: Ścieżka legendy). */
export function ritualFormOf(kind: UnitKind): RitualForm {
  const f = UNITS[kind];
  if (kind === "inquisitor" || kind === "witchhunter" || kind === "arquebusier" || kind === "sergeant") return "inquisitor";
  if (f.faction === "church") return "monk";
  return "guard";
}

function useAltar(w: World, it: Interactable): boolean {
  const p = w.player;
  const offer = altarOffer(w, it);
  if (offer.kind === "legend") {
    if (p.souls < offer.cost) {
      w.events.push({ type: "raiseFail", pos: { ...it.pos }, reason: "noSouls" });
      return true;
    }
    p.souls -= offer.cost;
    p.remains.shift();
    giveWeapon(p, offer.legend);
    w.events.push({ type: "legend", pos: { ...it.pos }, legend: offer.legend });
    return true;
  }
  if (offer.kind === "ritual") {
    const slot = p.weapons[p.current];
    slot.ritual = offer.form;
    offer.minion.alive = false;
    offer.minion.hp = 0;
    w.events.push({ type: "minionDeath", pos: { ...offer.minion.pos }, dir: vec(0, -1), kind: offer.minion.kind, crumbled: true });
    w.events.push({ type: "ritual", pos: { ...it.pos }, form: offer.form });
    return true;
  }
  w.events.push({ type: "station", ref: "altarEmpty" });
  return true;
}

// ------------------------------------------------------------------ chests
export function addChest(w: World, tier: ChestTier, pos: Vec): Chest {
  const mimic = tier !== "reliquary" && w.rng() < CONFIG.loot.mimicChance;
  const c: Chest = { id: nextId(), tier, pos: { ...pos }, hp: tier === "wood" ? 3 : 6, opened: false, broken: false, mimic };
  w.chests.push(c);
  return c;
}

function openChest(w: World, c: Chest): boolean {
  const p = w.player;
  if (p.keys <= 0) {
    w.events.push({ type: "needKey", pos: { ...c.pos } });
    return true;
  }
  p.keys -= 1;
  if (c.mimic) {
    springMimic(w, c);
    return true;
  }
  c.opened = true;
  w.events.push({ type: "chestOpen", pos: { ...c.pos }, tier: c.tier });
  spill(w, c);
  return true;
}

/** Smashed by bullets: no key needed, but the contents may be ruined. */
export function breakChest(w: World, c: Chest): void {
  if (c.mimic) {
    springMimic(w, c);
    return;
  }
  c.broken = true;
  const ruined = w.rng() < CONFIG.loot.chestBreakRuin;
  w.events.push({ type: "chestBreak", pos: { ...c.pos }, ruined });
  if (ruined) {
    for (let i = 0; i < 3 + Math.floor(w.rng() * 5); i++) drop(w, "gold", c.pos, 1);
  } else {
    spill(w, c);
  }
}

function springMimic(w: World, c: Chest): void {
  c.broken = true;
  c.opened = true;
  const m = w.spawn("mimic", c.pos, "enemy");
  w.cleared = false;
  if (!w.alarm) w.raiseAlarm(m);
  w.events.push({ type: "mimic", pos: { ...c.pos } });
}

function spill(w: World, c: Chest): void {
  const roll = rollLoot(w, c.tier);
  if (roll) placePickup(w, roll.kind, add(c.pos, vec(0, 56)), 1, roll.id);
  const gold = c.tier === "wood" ? 3 + Math.floor(w.rng() * 4) : 5 + Math.floor(w.rng() * 6);
  for (let i = 0; i < gold; i++) drop(w, "gold", c.pos, 1);
  if (c.tier !== "wood") drop(w, w.rng() < 0.5 ? "ammoBox" : "halfHeart", c.pos);
}

/** Pick something the necromancer doesn't own yet from the unlocked pool, by chest quality. */
export function rollLoot(w: World, tier: ChestTier | "shop"): { kind: "weapon" | "item" | "relic"; id: string } | null {
  const p = w.player;
  const pool = w.ctx.pool ?? STARTING_POOL;
  const ownedWeapon = (id: string) => p.weapons.some((s) => s.id === id);
  const ownedItem = (id: string) => p.items.includes(id as ItemId);
  const weapons = pool.filter((id) => id in WEAPONS && !ownedWeapon(id)) as WeaponId[];
  const items = pool.filter((id) => id in ITEMS && !ownedItem(id)) as ItemId[];
  const relics = pool.filter((id) => id in RELICS && p.relic?.id !== id) as RelicId[];
  const byRarity = (r: string[]) => weapons.filter((id) => r.includes(WEAPONS[id].rarity));
  const itemsOf = (r: "common" | "rare") => items.filter((id) => ITEMS[id].rarity === r);
  const r = w.rng();
  let choice: { kind: "weapon" | "item" | "relic"; list: string[] }[];
  if (tier === "wood") choice = r < 0.55 ? [{ kind: "weapon", list: byRarity(["common"]) }, { kind: "item", list: itemsOf("common") }] : [{ kind: "item", list: itemsOf("common") }, { kind: "weapon", list: byRarity(["common"]) }];
  else if (tier === "iron") choice = r < 0.5 ? [{ kind: "weapon", list: byRarity(["rare"]) }, { kind: "item", list: itemsOf("rare") }, { kind: "item", list: itemsOf("common") }] : [{ kind: "item", list: itemsOf("rare") }, { kind: "weapon", list: byRarity(["rare", "common"]) }];
  else if (tier === "reliquary") choice = r < 0.45 ? [{ kind: "relic", list: relics }, { kind: "weapon", list: byRarity(["occult"]) }] : r < 0.8 ? [{ kind: "weapon", list: byRarity(["occult", "rare"]) }, { kind: "relic", list: relics }] : [{ kind: "item", list: itemsOf("rare") }, { kind: "relic", list: relics }];
  else choice = [{ kind: r < 0.5 ? "weapon" : "item", list: r < 0.5 ? byRarity(["common", "rare"]) : items }, { kind: "item", list: items }];
  for (const c of choice) if (c.list.length) return { kind: c.kind, id: pick(w.rng, c.list) };
  return null;
}

/** Fill the fence's counter (design doc: Paser). */
export function stockShop(w: World, at: Vec): void {
  const slots: Vec[] = [-300, -150, 0, 150, 300].map((dx) => add(at, vec(dx, 120)));
  placePickup(w, "heart", slots[0], 1, undefined, 25);
  placePickup(w, "ammoBox", slots[1], 1, undefined, 18);
  placePickup(w, w.rng() < 0.5 ? "key" : "armor", slots[2], 1, undefined, 25);
  const a = rollLoot(w, "shop");
  if (a) placePickup(w, a.kind, slots[3], 1, a.id, a.kind === "weapon" ? WEAPONS[a.id as WeaponId].price : a.kind === "item" ? ITEMS[a.id as ItemId].price : RELICS[a.id as RelicId].price);
  const b = rollLoot(w, w.rng() < 0.35 ? "reliquary" : "iron");
  if (b && b.id !== a?.id) placePickup(w, b.kind, slots[4], 1, b.id, b.kind === "weapon" ? WEAPONS[b.id as WeaponId].price : b.kind === "item" ? ITEMS[b.id as ItemId].price : RELICS[b.id as RelicId].price);
}

// ------------------------------------------------------------------ secret walls
/** A shot hit the wall: a cracked section there gives way after a few hits. */
export function hitSecretWall(w: World, at: Vec, side: string): void {
  for (const it of w.interactables) {
    if (it.kind !== "secret" || it.used || it.side !== side) continue;
    const along = side === "N" || side === "S" ? Math.abs(at.x - it.pos.x) : Math.abs(at.y - it.pos.y);
    if (along > 90) continue;
    it.hp = (it.hp ?? 3) - 1;
    it.hidden = false;
    if (it.hp <= 0) {
      it.used = true;
      w.events.push({ type: "secretOpen", pos: { ...it.pos } });
      w.makeNoise(it.pos);
    }
  }
}

