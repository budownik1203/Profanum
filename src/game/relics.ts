/**
 * Active relics (F, charged by clearing rooms) and the witch's rope (C).
 */
import { CONFIG } from "./config.js";
import { throwHanged } from "./necro.js";
import { type Vec, add, dist, norm, scale, sub, vec } from "./math.js";
import { RELICS } from "./data/items.js";
import type { World } from "./world.js";
import { applyEffect, lob } from "./combat.js";
import { PUTOUT_KINDS } from "./lighting.js";
import { boundMinions } from "./loot.js";

export function relicReady(w: World): boolean {
  const r = w.player.relic;
  return !!r && r.charge >= RELICS[r.id].charge;
}

export function useRelic(w: World, aim: Vec): void {
  const p = w.player;
  const r = p.relic;
  if (!r) return;
  if (!relicReady(w)) {
    w.events.push({ type: "relicNotReady" });
    return;
  }
  r.charge = 0;
  w.events.push({ type: "relicUse", pos: { ...p.pos }, relic: r.id });
  switch (r.id) {
    case "monstrance":
      // a desecrated monstrance flashes: every enemy in sight stands blinded
      for (const u of w.units) if (u.alive && u.team !== "minion" && dist(u.pos, p.pos) < 560) applyEffect(u, "stun", 3);
      if (!w.alarm) {
        const first = w.enemies[0];
        if (first) w.raiseAlarm(first);
      }
      break;
    case "finger":
      // the floor reveals its map and secrets (handled by the floor through the event)
      for (const it of w.interactables) if (it.kind === "secret") it.hidden = false;
      break;
    case "plague":
      lob(w, p.pos, aim, { side: "minion", fromPlayer: true, damage: 0, halves: 0, look: "flask", radius: 9 }, "plague", 150, 0.6, 120);
      break;
    case "nightshroud":
      for (const l of w.lights) {
        if (dist(l.pos, p.pos) > 520) continue;
        if (PUTOUT_KINDS.includes(l.kind) && l.on) {
          l.on = false;
          l.hp = 0;
          w.events.push({ type: "lightOut", pos: { ...l.pos }, light: l.id, kind: l.kind });
        } else if ((l.kind === "lantern" || l.kind === "censer" || l.kind === "carried") && l.on) {
          l.on = false;
          l.dimmed = 8;
        }
      }
      break;
    case "prophet": {
      // every fresh body in the room gets up, a few more than the limit allows
      let free = w.player.stats.minionLimit + 2 - boundMinions(w);
      for (const c of [...w.corpses]) {
        if (free <= 0) break;
        if (c.echo <= 0 || c.big || c.raises >= CONFIG.necro.maxRaises) continue;
        const u = w.spawn(c.kind, c.pos, "minion");
        u.raises = c.raises + 1;
        w.corpses = w.corpses.filter((x) => x !== c);
        w.events.push({ type: "raise", pos: { ...c.pos }, kind: c.kind, unit: u.id, free: true });
        free -= 1;
      }
      break;
    }
    case "vial":
      p.halves = Math.min(p.maxHalves, p.halves + 2);
      w.events.push({ type: "heal", pos: { ...p.pos } });
      break;
    case "rope":
      pullNearest(w, aim);
      break;
    case "chain": {
      // the penitent's chain: everything near is dragged to your feet and left reeling
      for (const u of w.units) {
        if (!u.alive || u.team === "minion" || dist(u.pos, p.pos) > CONFIG.relics.chainRange) continue;
        if (!u.def.boss) {
          const to = add(p.pos, scale(norm(sub(u.pos, p.pos)), 80));
          u.pos = w.collideWorld(to, u.radius);
        }
        applyEffect(u, "stun", CONFIG.relics.chainStun);
        if (!w.alarm) w.raiseAlarm(u);
      }
      break;
    }
    case "knell":
      // the death knell: the dead are made whole and fight like the damned
      for (const u of w.units) {
        if (!u.alive || u.team !== "minion") continue;
        u.hp = u.maxHp;
        u.st.frenzy = CONFIG.relics.knellTime;
        w.events.push({ type: "heal", pos: { ...u.pos } });
      }
      break;
    case "wail":
      // a wail from the grave: every bullet in the air shatters, the living stagger back
      for (const b of w.bullets) {
        if (b.side === "minion" || b.fromPlayer) continue;
        b.life = 0;
        w.events.push({ type: "bulletWall", pos: { ...b.pos } });
      }
      w.bullets = w.bullets.filter((b) => b.life > 0);
      for (const u of w.units) {
        if (!u.alive || u.team === "minion" || dist(u.pos, p.pos) > CONFIG.relics.wailRange) continue;
        u.push = add(u.push, scale(norm(sub(u.pos, p.pos)), u.def.boss ? 200 : 1400));
      }
      w.events.push({ type: "exorcism", pos: { ...p.pos }, radius: CONFIG.relics.wailRange, warn: false });
      break;
  }
}

/** The witch's own rope (C): drags the enemy nearest to the cursor, or a corpse, to her feet. */
export function useSpecial(w: World, aim: Vec): void {
  const p = w.player;
  if (p.character !== "wiedzma" || p.specialCooldown > 0) return;
  // her hanged first: throw the nearest at the aim, or pull them all back; else the old rope
  if (throwHanged(w, aim)) p.specialCooldown = CONFIG.rope.hangedCooldown;
  else if (pullNearest(w, aim)) p.specialCooldown = CONFIG.rope.cooldown;
}

function pullNearest(w: World, aim: Vec): boolean {
  const p = w.player;
  const range = CONFIG.rope.range;
  let best: { pos: Vec; pull: (to: Vec) => void } | null = null;
  let bestD = Infinity;
  for (const u of w.units) {
    if (!u.alive || u.team === "minion" || u.def.boss || dist(u.pos, p.pos) > range) continue;
    const d = dist(u.pos, aim);
    if (d < bestD) {
      bestD = d;
      best = {
        pos: u.pos,
        pull: (to) => {
          u.pos = w.collideWorld(to, u.radius);
          applyEffect(u, "stun", CONFIG.rope.stun);
          if (!w.alarm) w.raiseAlarm(u);
        },
      };
    }
  }
  if (!best) {
    for (const c of w.corpses) {
      if (dist(c.pos, p.pos) > range || c.big) continue;
      const d = dist(c.pos, aim);
      if (d < bestD) {
        bestD = d;
        best = { pos: c.pos, pull: (to) => (c.pos = w.collideWorld(to, 16)) };
      }
    }
  }
  if (!best) return false;
  const from = { ...best.pos };
  const to = add(p.pos, scale(norm(sub(from, p.pos)), 70));
  best.pull(to.x || to.y ? to : add(p.pos, vec(0, 70)));
  w.events.push({ type: "special", pos: { ...p.pos }, target: from });
  return true;
}
