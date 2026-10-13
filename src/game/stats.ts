/**
 * The necromancer's character sheet: creating him, his weapons, and the stats his character,
 * items and synergies add up to.
 */
import { type Vec, vec } from "./math.js";
import { BASE_STATS, CHARACTERS, ITEMS, RELICS, SYNERGIES, type CharacterId, type ItemId, type RelicId } from "./data/items.js";
import { WEAPONS, type WeaponId } from "./data/weapons.js";
import type { Player, Stats, WeaponSlot } from "./types.js";

export function makeSlot(id: WeaponId, starter = false): WeaponSlot {
  const def = WEAPONS[id];
  const ammo = starter || !Number.isFinite(def.ammo) ? Infinity : def.ammo;
  return { id, loaded: def.kind === "occult" ? 1 : Math.min(def.capacity, ammo), ammo, reloadLeft: 0, cooldown: 0, starter: starter || undefined };
}

export function makePlayer(character: CharacterId, pos: Vec): Player {
  const c = CHARACTERS[character];
  const p: Player = {
    pos,
    vel: vec(),
    push: vec(),
    facing: -Math.PI / 2,
    halves: c.hearts * 2,
    maxHalves: c.hearts * 2,
    armor: 0,
    invuln: 0,
    dodgeLeft: 0,
    dodgeCooldown: 0,
    dodgeDir: vec(),
    weapons: [makeSlot(c.weapon, true)],
    current: 0,
    souls: 0,
    gold: 0,
    keys: 1,
    items: [],
    relic: c.relic ? { id: c.relic, charge: RELICS[c.relic].charge } : null,
    remains: [],
    character,
    stats: { ...BASE_STATS, synergies: [] },
    specialCooldown: 0,
    alive: true,
    kills: 0,
  };
  recomputeStats(p);
  return p;
}

/** Character + items + synergies → stats. Call after anything in the inventory changes. */
export function recomputeStats(p: Player): void {
  const s: Stats = { ...BASE_STATS, synergies: [], ...CHARACTERS[p.character].stats };
  const bag = s as unknown as Record<string, number | boolean | string[]>;
  for (const id of p.items) {
    const def = ITEMS[id];
    for (const [k, v] of Object.entries(def.stats ?? {})) {
      if (typeof v === "boolean") bag[k] = v;
      else bag[k] = (bag[k] as number) + (v as number);
    }
    for (const [k, v] of Object.entries(def.mul ?? {})) bag[k] = (bag[k] as number) * (v as number);
  }
  const owned = new Set<string>([...p.items, ...p.weapons.map((w) => w.id)]);
  if (p.relic) owned.add(p.relic.id);
  s.synergies = SYNERGIES.filter((sy) => sy.needs.every((n) => owned.has(n))).map((sy) => sy.id);
  p.stats = s;
}

/** Most shots this weapon can hold for this player. */
export function maxAmmo(p: Player, slot: WeaponSlot): number {
  const def = WEAPONS[slot.id];
  if (slot.starter || !Number.isFinite(def.ammo)) return Infinity;
  return Math.round(def.ammo * p.stats.ammoMul);
}

/** A new weapon goes into the hands; one you already carry refills its ammunition instead. */
export function giveWeapon(p: Player, id: WeaponId): "new" | "ammo" {
  const have = p.weapons.findIndex((w) => w.id === id);
  if (have >= 0) {
    const slot = p.weapons[have];
    slot.ammo = maxAmmo(p, slot);
    return "ammo";
  }
  const slot = makeSlot(id);
  p.weapons.push(slot);
  p.current = p.weapons.length - 1;
  recomputeStats(p);
  if (Number.isFinite(slot.ammo)) slot.ammo = maxAmmo(p, slot);
  return "new";
}

export function giveItem(p: Player, id: ItemId): void {
  p.items.push(id);
  const def = ITEMS[id];
  if (def.onPickup === "armor") p.armor += 1;
  if (def.onPickup === "heart") {
    p.maxHalves += 2;
    p.halves = Math.min(p.maxHalves, p.halves + 2);
  }
  recomputeStats(p);
}

/** Take a relic in hand; returns the one it replaces (to be dropped on the floor). */
export function giveRelic(p: Player, id: RelicId): RelicId | null {
  const old = p.relic ? p.relic.id : null;
  p.relic = { id, charge: RELICS[id].charge };
  recomputeStats(p);
  return old;
}
