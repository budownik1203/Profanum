/**
 * Profanum: boot, the screens (title → the crypt → a run → its summary → the crypt), the fixed-step
 * simulation loop, saving, pause and options. The simulation lives in src/game, the view in src/render.
 */
import { Application } from "pixi.js";
import { CHARACTERS, RELICS, UNLOCKABLES, type CharacterId } from "./game/data/items.js";
import { WEAPONS } from "./game/data/weapons.js";
import { ITEMS } from "./game/data/items.js";
import type { Floor } from "./game/floor.js";
import { buildHub } from "./game/hub.js";
import { altarOffer, interactTarget, placePickup, shopPrice } from "./game/loot.js";
import {
  buyCharacter, buyUnlock, characterState, clearRun, finishRun, loadMeta, loadRun, makeStore, poolOf, saveMeta, saveRun, type Meta,
} from "./game/meta.js";
import { Run, type RunOptions } from "./game/run.js";
import { giveItem, giveRelic, giveWeapon, makePlayer } from "./game/stats.js";
import type { GameEvent, InputState, PickupKind, Player } from "./game/types.js";
import { World, idleInput } from "./game/world.js";
import { CONFIG } from "./game/config.js";
import { setLang, soulsWord, t } from "./i18n.js";
import { Input } from "./input.js";
import { Narrator, lineOf, nextSkullLine } from "./narrator.js";
import { noteText } from "./notes.js";
import { PAL } from "./palette.js";
import { drawHud } from "./render/hud.js";
import { GameAudio, type MusicState } from "./audio.js";
import { drawItemIcon, drawRelicIcon } from "./render/icons.js";
import { GameRenderer, type Prompt } from "./render/renderer.js";
import { Screens, type InvRow, type InvSection, type MenuView } from "./render/screens.js";
import { buildCodexView } from "./render/codexview.js";
import { CODEX_SECTIONS, noteEvents, noteWorld } from "./game/codex.js";
import { type Drill, formSquads } from "./game/tactics.js";
import { planRoom } from "./game/reinforce.js";
import { floorDef } from "./game/data/floors.js";
import type { UnitKind } from "./game/data/units.js";
import type { ItemId, RelicId } from "./game/data/items.js";
import type { WeaponId } from "./game/data/weapons.js";

const STEP = 1 / 60;
const MAX_STEPS = 5;

type Mode = "title" | "hub" | "run" | "summary";
type Overlay = null | "pause" | "options" | "note" | "echoAltar" | "ledger" | "codex";

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ background: PAL.bg, resizeTo: window, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.body.appendChild(app.canvas);

  const input = new Input(app.canvas);
  const view = new GameRenderer(app.renderer);
  const screens = new Screens();
  view.ui.addChild(screens.layer);
  app.stage.addChild(view.root);
  const fit = () => view.resize(app.screen.width, app.screen.height);
  fit();
  window.addEventListener("resize", fit);

  const store = makeStore();
  const meta: Meta = loadMeta(store);
  setLang(meta.settings.lang);
  const audio = new GameAudio();
  // browsers allow sound only after the player touches something
  for (const ev of ["pointerdown", "keydown"] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });
  const applySettings = () => {
    view.shakeScale = meta.settings.shake;
    view.showNumbers = meta.settings.numbers;
    setLang(meta.settings.lang);
    audio.setVolumes(meta.settings.volume, meta.settings.music);
    view.setFilm(meta.settings.film);
  };
  applySettings();
  const persist = () => saveMeta(store, meta);

  const narrator = new Narrator();
  let mode: Mode = "title";
  let overlay: Overlay = null;
  let overlayBack: Overlay = null;
  let sel = 0;
  let run: Run | null = null;
  let hub: World | null = null;
  let note = "";
  let banner: { text: string; sub?: string; time: number } | null = null;
  let summary: { victory: boolean; lines: string[] } | null = null;
  let endTimer = 0;
  let acc = 0;
  let hitstop = 0;
  /** Debug only (screenshots): the simulation stands still while everything is still drawn. */
  let frozen = false;
  let lastFloor: Floor | null = null;
  let time = 0;
  /** When the run summary appeared (it ignores input for a moment, so a dying click does not skip it). */
  let summaryAt = 0;
  /** The Grimoire: the open chapter and entry, and whether its records need saving. */
  let codexTab = 0;
  let codexSel = 0;
  let codexDirty = false;
  // closing the tab mid-room keeps what the grimoire saw
  window.addEventListener("pagehide", () => {
    if (codexDirty) persist();
  });
  const openCodex = (back: Overlay) => {
    overlay = "codex";
    overlayBack = back;
    if (codexDirty) {
      persist();
      codexDirty = false;
    }
    input.releaseMouse();
  };

  const showBanner = (text: string, sub?: string, seconds = 2.6) => {
    banner = { text, sub, time: seconds };
  };

  const world = (): World | null => (mode === "hub" ? hub : run ? run.world : null);

  // ---------------------------------------------------------------- transitions
  /** The sarcophagi show who sleeps, who can be woken and who is chosen. */
  const refreshHub = () => {
    if (!hub) return;
    for (const it of hub.interactables) {
      if (it.kind !== "sarcophagus") continue;
      const id = it.ref as CharacterId;
      const st = characterState(meta, id);
      it.look = st === "owned" && meta.selected === id ? "chosen" : st;
    }
  };

  const enterHub = () => {
    hub = buildHub(meta.selected);
    refreshHub();
    if (noteWorld(meta.codex, hub)) persist();
    mode = "hub";
    overlay = null;
    view.reset();
    view.setRoom("hub", hub);
    showBanner(t("hub.title"), t("hub.stats", { runs: meta.stats.runs, wins: meta.stats.wins, kills: meta.stats.kills }));
  };

  const roomKey = (r: Run) => `${r.seed}:${r.depth}:${r.secret ?? ""}:${r.floor.current}`;

  const startRun = (r: Run, fresh: boolean) => {
    run = r;
    mode = "run";
    overlay = null;
    endTimer = 0;
    view.reset();
    view.setRoom(roomKey(r), r.world);
    lastFloor = r.floor;
    saveRun(store, r.snapshot());
    floorBanner(r);
    // half the time the narrator remembers who exactly crawled out of the grave
    if (fresh) narrator.say(Math.random() < 0.5 ? `intro.${r.character}` : "intro", 0, true);
    else narrator.newFloor(r.world.theme);
  };

  const floorBanner = (r: Run) => {
    const theme = r.world.theme;
    showBanner(t(`floor.${theme}`), r.secret ? t("floorSecret") : r.depth <= 5 ? t("floorNum", { n: r.depth }) : undefined, 3.2);
  };

  const newRun = () => {
    const r = new Run({ character: meta.selected, pool: poolOf(meta), grace: meta.settings.grace });
    clearRun(store);
    startRun(r, true);
  };

  const endRun = (abandoned = false) => {
    if (!run) return;
    const r = run;
    if (abandoned) r.over = true;
    finishRun(meta, r);
    clearRun(store);
    persist();
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    summary = {
      victory: r.victory,
      lines: [
        t("sum.floor", { floor: t(`floor.${r.world.theme}`) }),
        t("sum.kills", { n: r.stats.kills }),
        t("sum.raised", { n: r.stats.raised }),
        t("sum.time", { t: fmt(r.stats.time) }),
        t("sum.bosses", { n: r.stats.bosses.length }),
        t("sum.echo", { n: r.echo }),
      ],
    };
    mode = "summary";
    summaryAt = time;
    input.releaseMouse();
    overlay = null;
  };

  // ---------------------------------------------------------------- menus
  const titleMenu = (): MenuView => {
    const saved = loadRun(store);
    const items = [
      ...(saved ? [{ label: `${t("title.continue")} · ${t(`floor.${saved.secret ?? (saved.depth >= 6 ? "sanktuarium" : ["cmentarz", "slumsy", "kupiecka", "klasztor", "katedra"][saved.depth - 1])}`)}` }] : []),
      { label: t("title.crypt") },
      { label: t("title.options") },
      { label: t("title.lang") },
    ];
    return { title: "PROFANUM", subtitle: t("title.sub"), items, selected: Math.min(sel, items.length - 1) };
  };

  const titleAction = (i: number) => {
    const saved = loadRun(store);
    const actions: (() => void)[] = [];
    if (saved) actions.push(() => startRun(new Run({ pool: poolOf(meta) }, saved), false));
    actions.push(() => enterHub());
    actions.push(() => {
      overlay = "options";
      overlayBack = null;
      sel = 0;
    });
    actions.push(() => {
      meta.settings.lang = meta.settings.lang === "pl" ? "en" : "pl";
      applySettings();
      persist();
    });
    actions[i]?.();
  };

  const onOff = (b: boolean) => (b ? t("opt.on") : t("opt.off"));
  const optionsMenu = (): MenuView => {
    const s = meta.settings;
    const items = [
      { label: t("opt.shake", { v: `${Math.round(s.shake * 100)}%` }) },
      { label: t("opt.volume", { v: `${Math.round(s.volume * 100)}%` }) },
      { label: t("opt.music", { v: `${Math.round(s.music * 100)}%` }) },
      { label: t("opt.numbers", { v: onOff(s.numbers) }) },
      { label: t("opt.film", { v: onOff(s.film) }) },
      { label: t("opt.grace", { v: onOff(s.grace) }) },
      { label: t("opt.lang") },
      { label: t("opt.back") },
    ];
    return { title: t("opt.title"), items, selected: Math.min(sel, items.length - 1), footer: t("opt.graceDesc") };
  };

  const cycle = (v: number, steps: number[]) => steps[(steps.findIndex((x) => Math.abs(x - v) < 0.01) + 1) % steps.length];
  const optionsAction = (i: number) => {
    const s = meta.settings;
    switch (i) {
      case 0: s.shake = cycle(s.shake, [1, 0.5, 0]); break;
      case 1: s.volume = cycle(s.volume, [1, 0.8, 0.5, 0.25, 0]); break;
      case 2: s.music = cycle(s.music, [1, 0.6, 0.3, 0]); break;
      case 3: s.numbers = !s.numbers; break;
      case 4: s.film = !s.film; break;
      case 5: s.grace = !s.grace; break;
      case 6: s.lang = s.lang === "pl" ? "en" : "pl"; break;
      default:
        overlay = overlayBack;
        sel = 0;
    }
    applySettings();
    persist();
  };

  const pauseMenu = (): MenuView => {
    const items = [{ label: t("pause.resume") }, { label: t("pause.codex") }, { label: t("pause.options") }, ...(mode === "run" ? [{ label: t("pause.abandon") }] : []), { label: t("pause.quit") }];
    return { title: t("pause.title"), items, selected: Math.min(sel, items.length - 1) };
  };

  const pauseAction = (i: number) => {
    const acts: (() => void)[] = [
      () => (overlay = null),
      () => openCodex("pause"),
      () => {
        overlay = "options";
        overlayBack = "pause";
        sel = 0;
      },
    ];
    if (mode === "run") acts.push(() => endRun(true));
    acts.push(() => {
      // the run stays saved at the start of its floor, the grimoire keeps what was seen since
      if (codexDirty) {
        persist();
        codexDirty = false;
      }
      overlay = null;
      mode = "title";
      sel = 0;
    });
    acts[i]?.();
  };

  const altarRows = () =>
    UNLOCKABLES.map((u) => {
      const name = u.id in WEAPONS ? t(`weapon.${u.id}`) : u.id in ITEMS ? t(`item.${u.id}`) : t(`relic.${u.id}`);
      const desc = u.id in WEAPONS ? t(`weaponDesc.${u.id}`) : u.id in ITEMS ? t(`itemDesc.${u.id}`) : t(`relicDesc.${u.id}`);
      const bought = meta.unlocked.includes(u.id);
      return { label: name, detail: desc, right: bought ? t("hub.bought") : `${u.echo} ✦`, state: bought ? ("bought" as const) : meta.echo >= u.echo ? ("available" as const) : ("locked" as const) };
    });

  // ---------------------------------------------------------------- the crypt's stations
  const hubStation = (ref: string) => {
    if (!hub) return;
    if (ref === "echoAltar") {
      overlay = "echoAltar";
      sel = 0;
      return;
    }
    if (ref === "skull") {
      const next = nextSkullLine(meta.skullHeard, { ...meta.stats });
      narrator.show(lineOf(next.line), 7);
      if (next.index >= 0) meta.skullHeard.push(next.index);
      meta.skull += 1;
      persist();
      return;
    }
    if (ref === "ledger") {
      overlay = "ledger";
      input.releaseMouse();
      return;
    }
    if (ref === "codex") {
      openCodex(null);
      return;
    }
    if (ref in CHARACTERS) {
      const id = ref as CharacterId;
      const st = characterState(meta, id);
      if (st === "owned") {
        meta.selected = id;
      } else if (st === "buyable") {
        if (!buyCharacter(meta, id)) view.floatText(hub.player.pos, t("hub.need", { n: CHARACTERS[id].unlock!.echo }), PAL.hudDim, 24);
      } else {
        view.floatText(hub.player.pos, t("hub.locked", { challenge: t(`challenge.${CHARACTERS[id].unlock!.challenge}`) }), PAL.hudDim, 22, 1.6);
        return;
      }
      const pos = { ...hub.player.pos };
      hub.player = makePlayer(meta.selected, pos);
      refreshHub();
      persist();
    }
  };

  // ---------------------------------------------------------------- prompts above things
  const computePrompt = (w: World): Prompt | null => {
    const target = interactTarget(w);
    if (!target) return null;
    const pos = target.pos;
    switch (target.kind) {
      case "corpse":
        return { text: t("prompt.raise", { n: w.player.stats.raiseCost, w: soulsWord(w.player.stats.raiseCost) }), pos };
      case "abomination":
        return { text: t("prompt.abomination", { n: CONFIG.necro.abominationCost, w: soulsWord(CONFIG.necro.abominationCost) }), pos };
      case "chest":
        return { text: w.player.keys > 0 ? t("prompt.open") : t("prompt.openNoKey"), pos };
      case "pickup": {
        const pk = target.pickup;
        const ref = pk.ref ?? "";
        const name =
          pk.kind === "weapon" ? t(`weapon.${ref}`) : pk.kind === "item" ? t(`item.${ref}`) : pk.kind === "relic" ? t(`relic.${ref}`) : pk.kind === "remains" ? t("remains", { name: t(`weapon.${ref}`) }) : t(`pickup.${pk.kind}`);
        const sub =
          pk.kind === "weapon" ? t(`weaponDesc.${ref}`) : pk.kind === "item" ? t(`itemDesc.${ref}`) : pk.kind === "relic" ? t(`relicDesc.${ref}`) : pk.kind === "remains" ? t("remainsDesc") : undefined;
        if (pk.kind === "note") return { text: t("prompt.read"), pos };
        if (pk.price !== undefined) return { text: t("prompt.buy", { name, price: shopPrice(w, pk.price) }), sub, pos };
        return { text: t("prompt.take", { name }), sub, pos };
      }
      case "thing": {
        const it = target.thing;
        switch (it.kind) {
          case "stairs":
            if (w.roomType === "hub") {
              return { text: t("hub.stairs", { name: t(`char.${meta.selected}`) }), pos };
            }
            return { text: t("prompt.stairs"), pos };
          case "hatch":
            return { text: t(w.player.keys > 0 ? "prompt.hatch" : "prompt.hatchNoKey"), sub: t("prompt.hatchSub"), pos };
          case "altar": {
            const o = altarOffer(w, it);
            if (o.kind === "legend") return { text: t("prompt.altarLegend", { name: t(`weapon.${o.legend}`), n: o.cost, w: soulsWord(o.cost) }), sub: t(`weaponDesc.${o.legend}`), pos };
            if (o.kind === "ritual") return { text: t("prompt.altarRitual", { form: t(`form.${o.form}`) }), pos };
            return { text: t("prompt.altarNone"), pos };
          }
          case "fence":
            return { text: t("prompt.fence"), pos };
          case "note":
            return { text: t("prompt.read"), pos };
          case "echoAltar":
            return { text: t("hub.altar"), pos };
          case "skull":
            return { text: t("hub.skull"), pos };
          case "ledger":
            return { text: t("hub.ledger"), pos };
          case "codex":
            return { text: t("hub.codex"), pos };
          case "trial":
            return { text: t("prompt.trial"), sub: t("prompt.trialSub"), pos };
          case "sarcophagus":
            return null; // the sarcophagus panel says it all
          default:
            return null;
        }
      }
    }
  };

  /** The panel shown at a sarcophagus in the crypt. */
  const ledgerLines = (): string[] => {
    const st = meta.stats;
    const floors = ["cmentarz", "slumsy", "kupiecka", "klasztor", "katedra", "sanktuarium"];
    const deepest = st.deepest > 0 ? t(`floor.${floors[Math.min(floors.length, st.deepest) - 1]}`) : t("ledger.never");
    const bosses = st.bosses.length ? st.bosses.map((b) => t(`unit.${b}`)).join(", ") : t("ledger.none");
    return [
      t("ledger.runs", { runs: st.runs, wins: st.wins, deaths: st.deaths }),
      t("ledger.kills", { n: st.kills }),
      t("ledger.raised", { n: st.raised }),
      t("ledger.deepest", { floor: deepest }),
      t("ledger.bosses", { list: bosses }),
      t("ledger.woken", { n: meta.characters.length }),
      t("ledger.unlocked", { n: meta.unlocked.length, m: UNLOCKABLES.length }),
      t("ledger.echo", { n: meta.echo }),
    ];
  };

  const sarcophagusPanel = (w: World) => {
    const near = w.interactables.find((it) => it.kind === "sarcophagus" && Math.hypot(it.pos.x - w.player.pos.x, it.pos.y - w.player.pos.y) < it.radius + 30);
    if (!near) return;
    const id = near.ref as CharacterId;
    const def = CHARACTERS[id];
    const st = characterState(meta, id);
    const lines = [t(`charDesc.${id}`), `${t(`weapon.${def.weapon}`)} · ${def.hearts} ♥`, t(`charStory.${id}`)];
    let footer: string;
    if (st === "owned") footer = meta.selected === id ? t("hub.chosen", { name: t(`char.${id}`) }) : t("hub.select");
    else if (st === "buyable") footer = meta.echo >= def.unlock!.echo ? t("hub.buy", { n: def.unlock!.echo }) : t("hub.need", { n: def.unlock!.echo });
    else footer = t("hub.locked", { challenge: t(`challenge.${def.unlock!.challenge}`) });
    screens.panel(st === "sealed" ? "???" : t(`char.${id}`), st === "sealed" ? [t("hub.sealed")] : lines, footer, st === "owned" ? 0xf4e2c8 : 0x8a8070);
  };

  // ---------------------------------------------------------------- simulation events → presentation
  const react = (events: GameEvent[], w: World) => {
    view.handle(events, w);
    audio.hear(events, w);
    narrator.hear(events, w.player.halves);
    for (const e of events) {
      switch (e.type) {
        case "enemyDeath":
          if (e.boss) hitstop = Math.max(hitstop, 0.3);
          else hitstop = Math.max(hitstop, 0.06);
          break;
        case "playerHit":
          hitstop = Math.max(hitstop, 0.05);
          break;
        case "roomCleared":
          showBanner(t("banner.cleared"), undefined, 1.8);
          break;
        case "hold":
          if (e.stage === "start") showBanner(t("banner.hold"), t("banner.holdSub", { n: Math.round(e.left) }), 2.4);
          else if (e.stage === "over") showBanner(t("banner.holdOver"), t("banner.holdOverSub"), 2);
          else showBanner(t("banner.holdWon"), undefined, 2);
          break;
        case "trial":
          if (e.stage === "start") showBanner(t("banner.trial"), t("banner.trialSub", { n: e.waves }), 2.2);
          else if (e.stage === "wave") showBanner(t("banner.trialWave", { n: e.wave, m: e.waves }), undefined, 1.4);
          else showBanner(t("banner.trialDone"), t("banner.trialDoneSub"), 2.4);
          break;
        case "doorsShut":
          if (!banner || banner.time < 1) showBanner(t("banner.doorsShut"), undefined, 1.4);
          break;
        case "bossIntro":
          showBanner(t(`unit.${e.boss}`), undefined, 3);
          break;
        case "bossDeath":
          showBanner(t("banner.bossDown", { name: t(`unit.${e.boss}`) }), undefined, 3);
          break;
        case "synergy":
          showBanner(t(`synergy.${e.id}`), t(`synergyDesc.${e.id}`), 3.5);
          break;
        case "itemGet":
          // what was just picked up, and what it does
          if (e.kind === "item") showBanner(t(`item.${e.item}`), t(`itemDesc.${e.item}`), 2.6);
          else if (e.kind === "relic") showBanner(t(`relic.${e.item}`), t(`relicDesc.${e.item}`), 2.6);
          else if (e.kind === "weapon") showBanner(t(`weapon.${e.item}`), t(`weaponDesc.${e.item}`), 2.6);
          break;
        case "note":
          note = noteText(e.index);
          overlay = "note";
          input.releaseMouse();
          break;
        case "station":
          if (e.ref === "fence") narrator.say("shop", 0, true);
          else if (mode === "hub") hubStation(e.ref);
          break;
        case "stairs":
          if (mode === "hub") newRun();
          break;
        default:
          break;
      }
    }
  };

  /** The mood of the music: quiet exploring, a fight, a boss, the crypt, the title. */
  const musicState = (): MusicState => {
    if (mode === "title") return "title";
    if (mode === "hub") return "crypt";
    if (mode === "summary" || !run || run.over) return "silent";
    const w = run.world;
    if (w.units.some((u) => u.def.boss && u.alive)) return "boss";
    return w.alarm && w.enemies.length > 0 ? "combat" : "explore";
  };

  const roomTitle = (r: Run): string => {
    const n = r.floor.node;
    if (n.type === "start") return r.secret ? t("room.landing") : r.depth === 1 ? t("room.start1") : t("room.start");
    if (n.type === "guardian") return t("room.guardian");
    if (n.type === "combat") return t(`room.${n.layout}`);
    if (n.type === "boss") return t(`unit.${r.world.units.find((u) => u.def.boss)?.kind ?? "captain"}`);
    return t(`room.${n.type}`);
  };

  // ---------------------------------------------------------------- the debug hook for browser checks
  (window as unknown as { __profanum: unknown }).__profanum = {
    get mode() {
      return mode;
    },
    get run() {
      return run;
    },
    get hub() {
      return hub;
    },
    get meta() {
      return meta;
    },
    startRun(character: CharacterId = "grabarz", seed = 7, bosses?: Record<number, string>) {
      meta.selected = character;
      startRun(new Run({ seed, character, pool: poolOf(meta), bosses: bosses as RunOptions["bosses"] }), true);
    },
    enterHub,
    descendTo(depth: number) {
      if (!run) return;
      while (run.depth < depth) run.descend();
      view.setRoom(roomKey(run), run.world);
      lastFloor = run.floor;
      floorBanner(run);
    },
    goto(type: string) {
      if (!run) return false;
      const node = run.floor.rooms.find((r) => r.type === type);
      if (!node) return false;
      run.floor.travel("N", node.id);
      view.setRoom(roomKey(run), run.world);
      return true;
    },
    give(kind: string, id: string) {
      const p = run ? run.player : hub?.player;
      if (!p) return;
      if (kind === "weapon") giveWeapon(p, id as WeaponId);
      if (kind === "item") giveItem(p, id as ItemId);
      if (kind === "relic") giveRelic(p, id as RelicId);
    },
    god() {
      const p = run ? run.player : hub?.player;
      if (p) {
        p.maxHalves = 40;
        p.halves = 40;
      }
    },
    killAll() {
      const w = world();
      if (!w) return;
      for (const u of w.units) if (u.team !== "minion") u.hp = 0.001;
    },
    pause() {
      overlay = "pause";
      sel = 0;
    },
    /** Start a boss attack right now (and optionally set its health share). */
    boss(step?: string, hpShare?: number) {
      const u = world()?.units.find((x) => x.def.boss && x.alive);
      if (!u?.boss) return false;
      u.boss.intro = 0;
      if (hpShare !== undefined) u.hp = u.maxHp * hpShare;
      if (step) {
        u.boss.step = step;
        u.boss.t = 0;
        u.boss.n = 0;
      }
      return true;
    },
    freeze(on = true) {
      frozen = on;
    },
    /** Run the simulation for a while with the necromancer standing still. */
    advance(seconds: number) {
      if (!run) return;
      for (let i = 0; i < Math.round(seconds / STEP); i++) react(run.update(STEP, idleInput(run.world.player.pos)), run.world);
    },
    /** Put a pickup on the floor (screenshots of every item). */
    drop(kind: string, ref: string, x: number, y: number) {
      const w = world();
      if (w) placePickup(w, kind as PickupKind, { x, y }, 1, ref);
    },
    place(x: number, y: number) {
      const w = world();
      if (w) w.player.pos = { x, y };
    },
    get overlay() {
      return overlay;
    },
    get audio() {
      return audio.status;
    },
    measureAudio() {
      return GameAudio.measure();
    },
    /** No banners or narration on screen (screenshots). */
    quiet() {
      banner = null;
      narrator.text = "";
      narrator.time = 0;
    },
    /** Open an overlay directly (screenshots). */
    show(o: string) {
      overlay = o as Overlay;
      sel = 0;
    },
    get codexSections() {
      return CODEX_SECTIONS;
    },
    /** Switch the language (screenshots of both). */
    lang(l: "pl" | "en") {
      meta.settings.lang = l;
      applySettings();
    },
    /** Replace the room's guards with these (idle) and drill them (screenshots of formations). */
    squad(spec: [string, number, number][], drill?: Drill) {
      const w = world();
      if (!w) return;
      w.units = w.units.filter((u) => u.team === "minion");
      w.squads = [];
      w.alarm = false;
      for (const [kind, x, y] of spec) w.spawn(kind as UnitKind, { x, y }, undefined, { state: "idle" });
      formSquads(w, Math.random, run?.depth ?? 1, drill ?? null);
    },
    /** Turn the room into a last stand (screenshots). */
    hold() {
      const w = world();
      if (!w || !run) return;
      w.units = w.units.filter((u) => u.team === "minion");
      planRoom(w, floorDef(Math.min(run.depth, 5)), Math.random, { hold: true });
    },
    /** Sound the alarm in the room. */
    alarm() {
      const w = world();
      const u = w?.enemies[0];
      if (w && u) w.raiseAlarm(u);
    },
    /** Open the Grimoire at a chapter and entry (screenshots). */
    codex(tab = 0, entry = 0) {
      codexTab = tab;
      codexSel = entry;
      openCodex(null);
    },
  };

  // ---------------------------------------------------------------- the loop
  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    time += dt;
    const mouse = view.toView(input.mouse);
    let clicked = input.wasPressed("Mouse0");
    let up = input.wasPressed("KeyW") || input.wasPressed("ArrowUp");
    let down = input.wasPressed("KeyS") || input.wasPressed("ArrowDown");
    let accept = input.wasPressed("Enter") || input.wasPressed("Space") || input.wasPressed("KeyE");
    let esc = input.wasPressed("Escape");
    const overlayAtStart = overlay;
    narrator.update(dt);
    audio.update(musicState(), overlay !== null);
    if (banner) {
      banner.time -= dt;
      if (banner.time <= 0) banner = null;
    }
    screens.begin();
    const showWorld = mode !== "title";
    view.root.children.forEach((c) => {
      if (c !== view.ui) c.visible = showWorld;
    });

    // a generic menu handler: keys, hover, click
    const runMenu = (count: number, hovered: number, action: (i: number) => void) => {
      const before = sel;
      if (up) sel = (sel - 1 + count) % count;
      if (down) sel = (sel + 1) % count;
      if (hovered >= 0) sel = hovered;
      if (sel !== before) audio.ui("move");
      if (accept || (clicked && hovered >= 0)) {
        input.releaseMouse();
        audio.ui("accept");
        action(sel);
      }
    };

    if (mode === "title") {
      if (overlay === "options") {
        const m = optionsMenu();
        screens.title({ ...titleMenu(), items: [] }, time, mouse);
        const h = screens.menu(m, mouse);
        runMenu(m.items.length, h, optionsAction);
        if (esc) overlay = null;
      } else {
        const m = titleMenu();
        const h = screens.title(m, time, mouse);
        runMenu(m.items.length, h, titleAction);
      }
      screens.end();
      input.endFrame();
      return;
    }

    const w = world();
    if (!w) {
      screens.end();
      input.endFrame();
      return;
    }

    // ---- simulation (only when nothing is open)
    if (overlay === null && mode !== "summary" && !frozen) {
      if (esc) {
        overlay = "pause";
        sel = 0;
      } else if (hitstop > 0) {
        hitstop -= dt;
      } else {
        acc += dt;
        let steps = 0;
        let first = true;
        while (acc >= STEP && steps < MAX_STEPS) {
          const aim = view.screenToWorld(input.mouse);
          const held = input.read(aim);
          const stepInput: InputState = first ? held : { ...idleInput(aim), move: held.move, shoot: input.mouseHeld }; // a click counts once per frame
          let events: GameEvent[];
          if (mode === "hub" && hub) {
            hub.update(STEP, stepInput);
            events = hub.events;
            react(events, hub);
          } else if (run) {
            events = run.update(STEP, stepInput);
            react(events, run.world);
            // the Grimoire notes who was met and killed, what was held
            if (noteEvents(meta.codex, events)) codexDirty = true;
            if (noteWorld(meta.codex, run.world)) codexDirty = true;
            if (run.floor !== lastFloor) {
              // down the stairs: a new floor, saved at its start
              lastFloor = run.floor;
              view.setRoom(roomKey(run), run.world);
              saveRun(store, run.snapshot());
              if (codexDirty) {
                persist();
                codexDirty = false;
              }
              floorBanner(run);
              narrator.newFloor(run.world.theme);
            } else if (events.some((e) => e.type === "enterRoom")) {
              view.setRoom(roomKey(run), run.world);
              if (codexDirty) {
                persist();
                codexDirty = false;
              }
              const alarmed = run.world.alarm && run.world.enemies.length > 0 && run.world.hadEnemies && run.floor.node.type !== "boss";
              showBanner(roomTitle(run), alarmed ? t("banner.alarmed") : undefined, 2.2);
              if (alarmed) narrator.say("alarmed", 30);
            }
          }
          acc -= STEP;
          steps++;
          if (first) {
            input.endFrame();
            first = false;
          }
          if (overlay !== null || mode !== "run" && mode !== "hub") break;
        }
        if (steps === MAX_STEPS) acc = 0;
      }
    }
    // a menu opened this frame must not see the key that opened it (Esc would close the pause
    // menu at once, E would close the ledger or buy at the altar)
    if (overlay !== overlayAtStart) clicked = up = down = accept = esc = false;
    if (mode === "run" && run && run.over && overlay === null) {
      endTimer += dt;
      if (endTimer > (run.victory ? 4 : 2.5)) endRun();
    }

    // ---- drawing the world and the HUD
    const ww = world() ?? w;
    const aim = view.screenToWorld(input.mouse);
    const prompt = overlay === null && mode !== "summary" ? computePrompt(ww) : null;
    view.drawWorld(ww, overlay === null && mode !== "summary" ? dt : 0, aim, prompt);
    drawHud(view.hudG, view.hudText, {
      world: ww,
      floor: mode === "run" && run ? run.floor : undefined,
      mode: mode === "hub" ? "hub" : "run",
      narrator: narrator.text,
      narratorAlpha: Math.min(1, narrator.time / 0.5),
      // a banner would show through an open menu, right behind its title
      banner: banner && overlay === null ? { text: banner.text, sub: banner.sub, alpha: Math.min(1, banner.time / 0.6) } : null,
      echo: mode === "hub" ? meta.echo : undefined,
      started: true,
    });
    if (mode === "hub" && hub && overlay === null) {
      sarcophagusPanel(hub);
      // the controls stay on the wall for the first descents (later: on the pause screen)
      if (meta.stats.runs < 2) screens.controls(CONTROLS(), t("legend.title"));
    }

    // ---- overlays
    if (mode === "summary" && summary) {
      screens.summary(summary.victory ? t("sum.victory") : t("sum.death"), summary.lines, summary.victory ? 0xf4e2a8 : PAL.heart, t("sum.continue"));
      if ((accept || clicked) && time - summaryAt > CONFIG.ui.summaryLock) {
        input.releaseMouse();
        summary = null;
        enterHub();
      }
    } else if (overlay === "pause") {
      screens.dim(0.5);
      if (mode === "run" && run) {
        screens.inventory(t("inv.title"), inventorySections(run.player), (n) => t("inv.more", { n }));
        screens.controls(CONTROLS(), t("legend.title"));
      }
      const m = pauseMenu();
      runMenu(m.items.length, screens.menu(m, mouse), pauseAction);
      if (esc) overlay = null;
    } else if (overlay === "options") {
      screens.dim(0.5);
      const m = optionsMenu();
      runMenu(m.items.length, screens.menu(m, mouse), optionsAction);
      if (esc) overlay = overlayBack;
    } else if (overlay === "note") {
      screens.note(note, t("note.close"));
      if (esc || accept || clicked) {
        overlay = null;
        input.releaseMouse();
      }
    } else if (overlay === "ledger") {
      screens.summary(t("ledger.title"), ledgerLines(), 0xe8d8b8, t("ledger.close"));
      if (esc || accept || clicked) {
        overlay = null;
        input.releaseMouse();
      }
    } else if (overlay === "codex") {
      const left = input.wasPressed("KeyA") || input.wasPressed("ArrowLeft");
      const right = input.wasPressed("KeyD") || input.wasPressed("ArrowRight");
      const count = CODEX_SECTIONS[codexTab].entries.length;
      const before = { tab: codexTab, sel: codexSel };
      if (input.wasPressed("KeyQ")) codexTab = (codexTab - 1 + CODEX_SECTIONS.length) % CODEX_SECTIONS.length;
      if (input.wasPressed("KeyE") || input.wasPressed("Tab")) codexTab = (codexTab + 1) % CODEX_SECTIONS.length;
      for (let i = 0; i < CODEX_SECTIONS.length; i++) if (input.wasPressed(`Digit${i + 1}`)) codexTab = i;
      if (codexTab !== before.tab) codexSel = 0;
      else {
        if (left) codexSel = (codexSel - 1 + count) % count;
        if (right) codexSel = (codexSel + 1) % count;
        if (up) codexSel = Math.max(0, codexSel - 6);
        if (down) codexSel = Math.min(count - 1, codexSel + 6);
      }
      const hover = screens.codex(buildCodexView(meta.codex, codexTab, codexSel, time), mouse);
      if (hover.cell >= 0 && hover.cell !== codexSel) codexSel = hover.cell;
      if (clicked && hover.tab >= 0 && hover.tab !== codexTab) {
        codexTab = hover.tab;
        codexSel = 0;
      }
      if (codexTab !== before.tab || codexSel !== before.sel) audio.ui("move");
      if (esc) {
        overlay = overlayBack;
        sel = 0;
      }
    } else if (overlay === "echoAltar") {
      const rows = altarRows();
      const h = screens.list(t("hub.altarTitle"), t("hub.echo", { n: meta.echo }), rows, sel, t("hub.altarHint"), mouse);
      runMenu(rows.length, h, (i) => {
        if (buyUnlock(meta, UNLOCKABLES[i].id)) persist();
      });
      if (esc) overlay = null;
    }
    screens.end();
    input.endFrame();
  });
}

/** The pause screen's list of what the necromancer carries. */
function inventorySections(p: Player): InvSection[] {
  const weapons: InvRow[] = p.weapons.map((s, i) => {
    const def = WEAPONS[s.id];
    return {
      name: `${i === p.current ? "▸ " : ""}${t(`weapon.${s.id}`)}`,
      detail: t(`weaponDesc.${s.id}`),
      right: def.kind === "occult" ? t("hud.cost", { n: def.soulCost ?? 1, w: soulsWord(def.soulCost ?? 1) }) : Number.isFinite(s.ammo) ? `${s.ammo}` : "∞",
      color: def.rarity === "legend" ? 0xc88aff : i === p.current ? 0xf4e2c8 : undefined,
    };
  });
  const counts = new Map<string, number>();
  for (const id of p.items) counts.set(id, (counts.get(id) ?? 0) + 1);
  const items: InvRow[] = [...counts].map(([id, n]) => ({
    name: t(`item.${id}`) + (n > 1 ? ` ×${n}` : ""),
    detail: t(`itemDesc.${id}`),
    icon: (g, x, y) => drawItemIcon(g, id as ItemId, x, y, 0.8),
  }));
  const sections: InvSection[] = [{ title: t("inv.weapons"), rows: weapons }];
  if (p.relic) {
    const relic = p.relic.id;
    sections.push({
      title: t("inv.relic"),
      rows: [{ name: t(`relic.${relic}`), detail: t(`relicDesc.${relic}`), right: `${p.relic.charge}/${RELICS[relic].charge}`, icon: (g, x, y) => drawRelicIcon(g, relic, x, y, 0.8) }],
    });
  }
  if (p.remains.length) sections.push({ title: t("inv.remains"), rows: p.remains.map((id) => ({ name: t("remains", { name: t(`weapon.${id}`) }), detail: t("remainsDesc"), color: 0xc88aff })) });
  if (p.stats.synergies.length) {
    sections.push({ title: t("inv.synergies"), rows: p.stats.synergies.map((id) => ({ name: t(`synergy.${id}`), detail: t(`synergyDesc.${id}`), color: 0xe0c0ff })) });
  }
  // the items last: a long list is the one that may not fit
  sections.push({ title: t("inv.items"), rows: items.length ? items : [{ name: t("inv.none"), color: PAL.hudDim }] });
  return sections;
}

const CONTROLS = (): [string, string][] => [
  ["WSAD", "ruch / move"],
  ["LPM / LMB", "strzał / shoot"],
  ["PPM / Shift", "rozpad w mgłę / mist dodge"],
  ["R", "przeładuj / reload"],
  ["E", "wskrześ, otwórz, weź / raise, open, take"],
  ["Q", "rozkaz dla sług / command minions"],
  ["F", "relikwia / relic"],
  ["Spacja", "przewróć osłonę / topple cover"],
  ["1-9, kółko", "zmiana broni / switch weapon"],
  ["Esc", "pauza / pause"],
];

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#d8c8a8;padding:2em">Nie udało się uruchomić gry:\n${String(err)}</pre>`;
});
