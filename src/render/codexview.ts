/**
 * What the Grimoire shows: its chapters filled from the codex in the crypt's records, every entry
 * with its picture (the figure itself, the weapon, the icon), its story and what it does.
 */
import type { Graphics } from "pixi.js";
import { CODEX_SECTIONS, type Codex, codexProgress, entryKnown } from "../game/codex.js";
import { FLOORS, SECRET_FLOORS, type FloorDef, type SecretFloorDef } from "../game/data/floors.js";
import { ITEMS, RELICS, SYNERGIES, type ItemId, type RelicId } from "../game/data/items.js";
import { UNITS, type UnitKind } from "../game/data/units.js";
import { WEAPONS, type WeaponId } from "../game/data/weapons.js";
import { makeRng, vec } from "../game/math.js";
import type { Unit } from "../game/types.js";
import { World } from "../game/world.js";
import { lang, t } from "../i18n.js";
import { drawUnit } from "./figures.js";
import { drawItemIcon, drawRelicIcon } from "./icons.js";
import type { CodexView, Picture } from "./screens.js";
import { drawWeaponShape } from "./weapons.js";

/** A quiet room the figures are drawn from (never simulated). */
let stage: World | null = null;
const figures = new Map<string, Unit>();

function figure(kind: UnitKind, time: number): Unit {
  if (!stage) {
    stage = new World(makeRng(1), { w: 2000, h: 2000 });
    stage.player.pos = vec(600, -40);
  }
  stage.time = time;
  let u = figures.get(kind);
  if (!u) {
    u = stage.spawn(kind, vec(0, 0), "enemy");
    u.state = "approach";
    u.dir = vec(1, 0);
    if (UNITS[kind].boss) u.boss = { phase: 1, step: "idle", t: 0, n: 0, next: 1, angle: 0, intro: 0, mem: {} };
    if (kind === "abomination") u.stitched = 4;
    figures.set(kind, u);
  }
  return u;
}

/** A figure as it stands in a room (fitted to its frame by the screen). */
function figurePicture(kind: UnitKind, time: number, max: number): Picture {
  return {
    key: `unit:${kind}`,
    max,
    draw: (g: Graphics) => {
      const u = figure(kind, time);
      u.pos = vec(0, 0);
      drawUnit(g, g, u, stage!, 0);
    },
  };
}

function thingPicture(id: string, max: number): Picture {
  return {
    key: `thing:${id}`,
    max,
    draw: (g: Graphics) => {
      if (id in WEAPONS) drawWeaponShape(g, id as WeaponId, -WEAPONS[id as WeaponId].length / 2, 0, 0, 1);
      else if (id in ITEMS) drawItemIcon(g, id as ItemId, 0, 0, 1);
      else if (id in RELICS) drawRelicIcon(g, id as RelicId, 0, 0, 1);
    },
  };
}

/** The two halves of a synergy and a plus between them: side by side, or stacked in a small cell. */
function synergyPicture(id: string, max: number, stacked: boolean): Picture {
  const needs = SYNERGIES.find((s) => s.id === id)?.needs ?? ["", ""];
  return {
    key: `synergy:${id}:${stacked ? "s" : "w"}`,
    max,
    draw: (g: Graphics) => {
      needs.forEach((n, i) => {
        const x = stacked ? 0 : i === 0 ? -34 : 34;
        const y = stacked ? (i === 0 ? -22 : 22) : 0;
        if (n in WEAPONS) drawWeaponShape(g, n as WeaponId, x - WEAPONS[n as WeaponId].length * 0.35, y, 0, 0.7);
        else if (n in ITEMS) drawItemIcon(g, n as ItemId, x, y, 0.75);
        else if (n in RELICS) drawRelicIcon(g, n as RelicId, x, y, 0.75);
      });
      g.moveTo(-5, 0).lineTo(5, 0).stroke({ width: 3, color: 0xd8b04a });
      g.moveTo(0, -5).lineTo(0, 5).stroke({ width: 3, color: 0xd8b04a });
    },
  };
}

const nameOf = (id: string): string =>
  id in WEAPONS ? t(`weapon.${id}`) : id in ITEMS ? t(`item.${id}`) : id in RELICS ? t(`relic.${id}`) : t(`unit.${id}`);

/** A number as the language writes it (one decimal at most, a comma in Polish). */
const num = (x: number): string => {
  const s = String(Math.round(x * 10) / 10);
  return lang() === "pl" ? s.replace(".", ",") : s;
};

/** The floors (secret ones too) whose rooms this kind guards. */
function floorsOf(kind: UnitKind): string[] {
  const all: FloorDef[] = [...FLOORS, ...Object.values(SECRET_FLOORS)];
  const guards = (f: FloorDef) => [...f.melee, ...f.ranged, ...f.special, ...f.elite].includes(kind) || (f as SecretFloorDef).guardian === kind;
  return all.filter(guards).map((f) => t(`floor.${f.id}`));
}

/** What a weapon does in numbers: damage, magazine, reload, what each shot costs. */
function weaponLines(id: WeaponId): string[] {
  const d = WEAPONS[id];
  const dmg = d.pellets > 1 ? `${num(d.damage)}×${d.pellets}` : num(d.damage);
  const lines = [t("codex.weaponStats", { dmg, cap: d.capacity, reload: num(d.reload) })];
  if (d.goldCost) lines.push(t("codex.goldCost", { n: d.goldCost }));
  else if (d.soulCost) lines.push(t("codex.soulCost", { n: d.soulCost }));
  else lines.push(Number.isFinite(d.ammo) ? t("codex.ammo", { n: d.ammo }) : t("codex.ammoInf"));
  return lines;
}

function bossFloor(kind: string): string {
  if (kind === "holyflame") return t("floor.sanktuarium");
  const f = FLOORS.find((x) => (x.bosses as string[]).includes(kind));
  return f ? t(`floor.${f.id}`) : "";
}

export function buildCodexView(c: Codex, tab: number, selected: number, time: number): CodexView {
  const section = CODEX_SECTIONS[tab];
  const sid = section.id;
  const unitLike = sid === "enemies" || sid === "bosses";
  const cells = section.entries.map((id) => {
    const known = entryKnown(c, sid, id);
    const picture = unitLike ? figurePicture(id as UnitKind, time, 1.6) : sid === "synergies" ? synergyPicture(id, 1.6, true) : thingPicture(id, 2.6);
    return { known, picture };
  });
  const id = section.entries[Math.min(selected, section.entries.length - 1)];
  const known = entryKnown(c, sid, id);
  let detail: CodexView["detail"];
  if (!known) {
    const hint = sid === "bosses" ? t("codex.hintBoss", { floor: bossFloor(id) }) : unitLike ? t("codex.hintUnit") : sid === "synergies" ? t("codex.hintSynergy") : t("codex.hintThing");
    detail = { name: "???", lines: [hint], known: false };
  } else if (unitLike) {
    const kind = id as UnitKind;
    const kills = c.kills[kind] ?? 0;
    const lines = [t("codex.hp", { n: num(UNITS[kind].hp) })];
    const where = sid === "enemies" ? floorsOf(kind) : [];
    if (where.length > 0) lines.push(t("codex.where", { floors: where.join(", ") }));
    lines.push(sid === "bosses" ? t("codex.bossKills", { n: kills }) : t("codex.kills", { n: kills }));
    detail = {
      name: t(`unit.${kind}`),
      sub: sid === "bosses" ? bossFloor(kind) : t(`codex.faction.${UNITS[kind].faction}`),
      lore: t(`lore.unit.${kind}`),
      lines,
      known: true,
      picture: figurePicture(kind, time, 2.6),
      feet: true,
    };
  } else if (sid === "synergies") {
    const needs = SYNERGIES.find((s) => s.id === id)?.needs ?? ["", ""];
    detail = { name: t(`synergy.${id}`), sub: needs.map(nameOf).join(" + "), lines: [t(`synergyDesc.${id}`)], known: true, picture: synergyPicture(id, 3.4, false) };
  } else {
    const kind = id in WEAPONS ? "weapon" : id in ITEMS ? "item" : "relic";
    let sub = "";
    if (kind === "weapon") {
      const def = WEAPONS[id as WeaponId];
      sub = `${t(`codex.kind.${def.kind}`)} · ${t(`codex.rarity.${def.rarity}`)}`;
    } else if (kind === "item") {
      sub = t(`codex.itemRarity.${ITEMS[id as ItemId].rarity}`);
    } else {
      sub = t("codex.charge", { n: RELICS[id as RelicId].charge });
    }
    detail = {
      name: nameOf(id),
      sub,
      lore: t(`lore.${kind}.${id}`),
      lines: kind === "weapon" ? [t(`${kind}Desc.${id}`), ...weaponLines(id as WeaponId)] : [t(`${kind}Desc.${id}`)],
      known: true,
      picture: thingPicture(id, kind === "weapon" ? 4.4 : 5.5),
    };
  }
  const progress = codexProgress(c);
  return {
    title: t("codex.title"),
    progress: t("codex.progress", { n: progress.known, m: progress.total }),
    tabs: CODEX_SECTIONS.map((s) => `${t(`codex.tab.${s.id}`)} ${s.entries.filter((e) => entryKnown(c, s.id, e)).length}/${s.entries.length}`),
    tab,
    cells,
    selected: Math.min(selected, section.entries.length - 1),
    detail,
    hint: t("codex.hint"),
  };
}
