/**
 * The necromancer's weapons: switching, reloading, firing every kind of gun the arsenal holds
 * (pellet fans, volleys, crossbow bursts, lobbed shells, occult pieces paid for in souls).
 */
import { CONFIG } from "./config.js";
import { type Vec, add, clamp, fromAngle, norm, scale, sub } from "./math.js";
import { WEAPONS, type WeaponDef } from "./data/weapons.js";
import type { InputState, WeaponSlot } from "./types.js";
import type { World } from "./world.js";
import { lob, spawnBullet } from "./combat.js";

export function updateShooting(w: World, input: InputState, dt: number): void {
  const p = w.player;
  if (p.weapons.length === 0) return;
  // switching: 1-9 or the wheel; a reload in progress is lost
  let next = p.current;
  if (input.slot >= 0 && input.slot < p.weapons.length) next = input.slot;
  else if (input.cycle !== 0) next = (p.current + input.cycle + p.weapons.length) % p.weapons.length;
  if (next !== p.current) {
    const old = p.weapons[p.current];
    old.reloadLeft = 0;
    old.burstLeft = 0;
    old.pendingVolley = undefined;
    p.current = next;
    p.weapons[next].cooldown = Math.max(p.weapons[next].cooldown, 0.15);
    w.events.push({ type: "weaponSwitch", weapon: p.weapons[next].id });
  }

  const slot = p.weapons[p.current];
  const def = WEAPONS[slot.id];
  slot.cooldown = Math.max(0, slot.cooldown - dt);
  if (slot.reloadLeft > 0) {
    slot.reloadLeft -= dt;
    if (slot.reloadLeft <= 0) {
      slot.reloadLeft = 0;
      slot.loaded = Math.min(def.capacity, slot.ammo);
      w.events.push({ type: "reloadDone", pos: { ...p.pos }, weapon: slot.id });
    }
  } else if (input.reload && def.kind !== "occult" && slot.loaded < Math.min(def.capacity, slot.ammo)) {
    startReload(w, slot);
  }

  // the rest of a crossbow burst, the second volley of the martyrs' organ
  if (slot.burstLeft && slot.burstLeft > 0 && slot.cooldown <= 0 && slot.reloadLeft <= 0) {
    if (slot.loaded > 0) {
      slot.burstLeft -= 1;
      fire(w, slot, def, input.aim, false);
      slot.cooldown = slot.burstLeft > 0 ? def.burstGap ?? 0.1 : def.fireDelay;
      if (slot.loaded === 0 && slot.ammo > 0) startReload(w, slot);
    } else {
      slot.burstLeft = 0;
    }
    return;
  }
  if (slot.pendingVolley !== undefined) {
    slot.pendingVolley -= dt;
    if (slot.pendingVolley <= 0) {
      slot.pendingVolley = undefined;
      fire(w, slot, def, input.aim, true);
    }
  }

  const canShoot = p.dodgeLeft <= 0 && slot.reloadLeft <= 0 && slot.cooldown <= 0;
  if (!input.shoot || !canShoot) return;

  if (def.kind === "occult") {
    const cost = soulCost(w, slot, def);
    if (p.souls < cost) {
      slot.cooldown = 0.4;
      w.events.push({ type: "noSouls", pos: { ...p.pos } });
      return;
    }
    p.souls -= cost;
    fire(w, slot, def, input.aim, false);
    slot.cooldown = def.fireDelay;
    return;
  }
  // the ducat pistol shoots gold
  const gold = goldCostOf(w, def);
  if (gold > 0 && p.gold < gold) {
    slot.cooldown = 0.45;
    w.events.push({ type: "tooPoor", pos: { ...p.pos } });
    return;
  }
  if (slot.loaded <= 0) {
    if (slot.ammo <= 0) {
      slot.cooldown = 0.45;
      w.events.push({ type: "empty", pos: { ...p.pos } });
    } else {
      startReload(w, slot);
    }
    return;
  }
  if (def.burst && def.burst > 1) slot.burstLeft = def.burst - 1;
  fire(w, slot, def, input.aim, false);
  slot.cooldown = slot.burstLeft ? def.burstGap ?? 0.1 : def.fireDelay;
  if (slot.loaded === 0 && slot.ammo > 0 && !slot.burstLeft) startReload(w, slot);
}

/** Gold one shot costs (the ducat pistol; free with the gold tooth). */
export function goldCostOf(w: World, def: WeaponDef): number {
  if (!def.goldCost || w.player.stats.synergies.includes("dukaty")) return 0;
  return def.goldCost;
}

/** Souls one shot of an occult weapon costs here (half in the dark, never below one). */
export function soulCost(w: World, slot: WeaponSlot, def: WeaponDef): number {
  if (slot.starter) return 0;
  let cost = Math.max(1, (def.soulCost ?? 1) + w.player.stats.occultCostDelta);
  if (w.dark && !w.isLit(w.player.pos, false)) cost = Math.max(1, Math.ceil(cost / 2));
  return cost;
}

export function reloadTime(w: World, slot: WeaponSlot): number {
  const def = WEAPONS[slot.id];
  let t = def.reload * w.player.stats.reloadMul;
  if (def.curse === "slowReload") t *= CONFIG.curses.slowReloadMul;
  if (slot.id === "organ" && w.player.stats.synergies.includes("salwa")) t *= 0.5;
  return t;
}

export function startReload(w: World, slot: WeaponSlot): void {
  if (slot.reloadLeft > 0 || slot.ammo <= 0) return;
  slot.reloadLeft = reloadTime(w, slot);
  slot.burstLeft = 0;
  w.events.push({ type: "reloadStart", pos: { ...w.player.pos }, weapon: slot.id });
}

/** One trigger pull: bullets out, ammunition down, recoil, flash. */
function fire(w: World, slot: WeaponSlot, def: WeaponDef, aim: Vec, echo: boolean): void {
  const p = w.player;
  const stats = p.stats;
  const inDark = w.dark && !w.isLit(p.pos, false);
  const dark = inDark && def.dark ? def.dark : undefined;
  const dir = fromAngle(p.facing);
  const muzzle = add(p.pos, scale(dir, CONFIG.player.radius + 18));
  const ambush = w.dark && !w.alarm;
  const crit = ambush || w.rng() < stats.critChance;
  let damage = (dark?.damage ?? def.damage) * stats.damageMul * (def.kind === "firearm" ? stats.firearmDamageMul : 1) * w.sideMul(p.pos, false);
  if (ambush) damage *= stats.ambushMul;
  else if (crit) damage *= CONFIG.crit.mul;
  const pellets = dark?.pellets ?? def.pellets;
  const fanAngle = dark?.fan ?? def.fan;
  const effect = def.execute ? "execute" : dark?.effect ?? def.effect;
  const effectTime = def.execute ? dark?.execute ?? def.execute : dark?.effectTime ?? def.effectTime;
  let pierce = dark?.pierce ?? def.pierce;
  if (slot.ritual === "inquisitor") pierce += 3;
  const blast = slot.ritual === "monk" ? 60 : undefined;
  const syn = stats.synergies;
  const bounce = (def.bounce ?? 0) + stats.bounce + (def.id === "glassgun" && syn.includes("witraz") ? 2 : 0);
  const stunMul = def.id === "abbotbell" && syn.includes("dzwony") ? 2 : 1;

  if (def.lob) {
    // a shell lobbed at the cursor (within reach)
    const reach = 650;
    const want = sub(aim, muzzle);
    const d = Math.min(reach, Math.hypot(want.x, want.y));
    const to = add(muzzle, scale(norm(want), Math.max(80, d)));
    lob(w, muzzle, w.collideWorld(to, 10), { side: "minion", fromPlayer: true, damage, halves: 0, look: def.look, radius: def.radius, crit, ambush }, def.lob.land, def.lob.radius, def.lob.dur, def.lob.height);
  } else {
    for (let i = 0; i < pellets; i++) {
      const offset = pellets === 1 ? 0 : -fanAngle / 2 + (fanAngle * i) / (pellets - 1);
      const a = p.facing + offset + (w.rng() - 0.5) * 2 * def.spread + (echo ? (w.rng() - 0.5) * 0.12 : 0);
      const speed = def.speed * (1 + (w.rng() - 0.5) * 2 * def.speedJitter);
      spawnBullet(w, {
        pos: { ...muzzle },
        vel: fromAngle(a, speed),
        radius: def.radius,
        damage,
        halves: 0,
        side: "minion",
        fromPlayer: true,
        life: def.life,
        look: def.look,
        ambush,
        crit,
        pierce,
        holy: def.holy,
        effect,
        effectTime: effectTime !== undefined ? effectTime * stunMul : undefined,
        knock: def.knock,
        blast,
        weapon: def.id,
        homing: def.homing,
        bounce: bounce || undefined,
        snuff: def.snuff,
        tint: def.tint,
      });
    }
  }
  if (!echo) {
    if (def.kind !== "occult") {
      slot.loaded -= 1;
      if (Number.isFinite(slot.ammo)) slot.ammo -= 1;
      p.gold = Math.max(0, p.gold - goldCostOf(w, def));
    }
    p.push = add(p.push, scale(dir, -def.recoil * 10)); // push decays at 10/s, so v0 = distance * 10
    if (dark?.twice) slot.pendingVolley = 0.25;
    // the Lamentation's noise carries to the neighbouring rooms (its curse)
    if (def.curse === "noise") w.ctx.alarmNeighbours?.();
  }
  if (w.dark && !def.silent) w.addLight("flash", muzzle);
  w.events.push({ type: "shot", pos: muzzle, dir, side: "minion", weapon: def.id, fromPlayer: true, silent: def.silent });
}

/** Where a weapon is aimed from, for the renderer's barrel. */
export function muzzleOf(w: World): Vec {
  const p = w.player;
  return add(p.pos, scale(fromAngle(p.facing), CONFIG.player.radius + 18));
}

/** Seconds to the end of the current reload as a share 0..1 (for the HUD). */
export function reloadShare(w: World): number {
  const slot = w.player.weapons[w.player.current];
  if (!slot || slot.reloadLeft <= 0) return 0;
  return clamp(1 - slot.reloadLeft / reloadTime(w, slot), 0, 1);
}
