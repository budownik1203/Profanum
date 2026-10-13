/**
 * Profanum: boot, the screens (title → the crypt → a run → its summary → the crypt), the fixed-step
 * simulation loop, saving, pause and options. The simulation lives in src/game, the view in src/render.
 */
import { Application } from "pixi.js";
import { CHARACTERS, UNLOCKABLES, type CharacterId } from "./game/data/items.js";
import { WEAPONS } from "./game/data/weapons.js";
import { ITEMS } from "./game/data/items.js";
import type { Floor } from "./game/floor.js";
import { buildHub } from "./game/hub.js";
import { altarOffer, interactTarget, shopPrice } from "./game/loot.js";
import {
  buyCharacter, buyUnlock, characterState, clearRun, finishRun, loadMeta, loadRun, makeStore, poolOf, saveMeta, saveRun, type Meta,
} from "./game/meta.js";
import { Run } from "./game/run.js";
import { giveItem, giveRelic, giveWeapon, makePlayer } from "./game/stats.js";
import type { GameEvent, InputState } from "./game/types.js";
import { World, idleInput } from "./game/world.js";
import { CONFIG } from "./game/config.js";
import { setLang, soulsWord, t } from "./i18n.js";
import { Input } from "./input.js";
import { Narrator, SKULL, lineOf } from "./narrator.js";
import { noteText } from "./notes.js";
import { PAL } from "./palette.js";
import { drawHud } from "./render/hud.js";
import { GameRenderer, type Prompt } from "./render/renderer.js";
import { Screens, type MenuView } from "./render/screens.js";
import type { ItemId, RelicId } from "./game/data/items.js";
import type { WeaponId } from "./game/data/weapons.js";

const STEP = 1 / 60;
const MAX_STEPS = 5;

type Mode = "title" | "hub" | "run" | "summary";
type Overlay = null | "pause" | "options" | "note" | "echoAltar";

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
  const applySettings = () => {
    view.shakeScale = meta.settings.shake;
    view.showNumbers = meta.settings.numbers;
    setLang(meta.settings.lang);
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
  let lastFloor: Floor | null = null;
  let time = 0;

  const showBanner = (text: string, sub?: string, seconds = 2.6) => {
    banner = { text, sub, time: seconds };
  };

  const world = (): World | null => (mode === "hub" ? hub : run ? run.world : null);

  // ---------------------------------------------------------------- transitions
  const enterHub = () => {
    hub = buildHub(meta.selected);
    mode = "hub";
    overlay = null;
    view.reset();
    view.setRoom("hub", hub);
    showBanner(t("hub.title"), t("hub.stats", { runs: meta.stats.runs, wins: meta.stats.wins, kills: meta.stats.kills }));
  };

  const roomKey = (r: Run) => `${r.seed}:${r.depth}:${r.floor.current}`;

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
    if (fresh) narrator.say("intro", 0, true);
    else narrator.newFloor(r.world.theme);
  };

  const floorBanner = (r: Run) => {
    const theme = r.world.theme;
    showBanner(t(`floor.${theme}`), r.depth <= 5 ? t("floorNum", { n: r.depth }) : undefined, 3.2);
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
    overlay = null;
  };

  // ---------------------------------------------------------------- menus
  const titleMenu = (): MenuView => {
    const saved = loadRun(store);
    const items = [
      ...(saved ? [{ label: `${t("title.continue")} · ${t(`floor.${saved.depth >= 6 ? "sanktuarium" : ["cmentarz", "slumsy", "kupiecka", "klasztor", "katedra"][saved.depth - 1]}`)}` }] : []),
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
      case 4: s.grace = !s.grace; break;
      case 5: s.lang = s.lang === "pl" ? "en" : "pl"; break;
      default:
        overlay = overlayBack;
        sel = 0;
    }
    applySettings();
    persist();
  };

  const pauseMenu = (): MenuView => {
    const items = [{ label: t("pause.resume") }, { label: t("pause.options") }, ...(mode === "run" ? [{ label: t("pause.abandon") }] : []), { label: t("pause.quit") }];
    return { title: t("pause.title"), items, selected: Math.min(sel, items.length - 1) };
  };

  const pauseAction = (i: number) => {
    const acts: (() => void)[] = [
      () => (overlay = null),
      () => {
        overlay = "options";
        overlayBack = "pause";
        sel = 0;
      },
    ];
    if (mode === "run") acts.push(() => endRun(true));
    acts.push(() => {
      // the run stays saved at the start of its floor
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
      narrator.show(lineOf(SKULL[meta.skull % SKULL.length]), 6);
      meta.skull += 1;
      persist();
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
          case "sarcophagus":
            return null; // the sarcophagus panel says it all
          default:
            return null;
        }
      }
    }
  };

  /** The panel shown at a sarcophagus in the crypt. */
  const sarcophagusPanel = (w: World) => {
    const near = w.interactables.find((it) => it.kind === "sarcophagus" && Math.hypot(it.pos.x - w.player.pos.x, it.pos.y - w.player.pos.y) < it.radius + 30);
    if (!near) return;
    const id = near.ref as CharacterId;
    const def = CHARACTERS[id];
    const st = characterState(meta, id);
    const lines = [t(`charDesc.${id}`), `${t(`weapon.${def.weapon}`)} · ${def.hearts} ♥`];
    let footer: string;
    if (st === "owned") footer = meta.selected === id ? t("hub.chosen", { name: t(`char.${id}`) }) : t("hub.select");
    else if (st === "buyable") footer = meta.echo >= def.unlock!.echo ? t("hub.buy", { n: def.unlock!.echo }) : t("hub.need", { n: def.unlock!.echo });
    else footer = t("hub.locked", { challenge: t(`challenge.${def.unlock!.challenge}`) });
    screens.panel(st === "sealed" ? "???" : t(`char.${id}`), st === "sealed" ? [t(`challenge.${def.unlock!.challenge}`)] : lines, footer, st === "owned" ? 0xf4e2c8 : 0x8a8070);
  };

  // ---------------------------------------------------------------- simulation events → presentation
  const react = (events: GameEvent[], w: World) => {
    view.handle(events, w);
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
        case "doorsShut":
          if (!banner || banner.time < 1) showBanner(t("banner.doorsShut"), undefined, 1.4);
          break;
        case "bossIntro":
          showBanner(t(`unit.${e.boss}`), undefined, 3);
          break;
        case "bossDeath":
          showBanner(t("banner.bossDown", { name: t(`unit.${e.boss}`) }), undefined, 3);
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

  const roomTitle = (r: Run): string => {
    const n = r.floor.node;
    if (n.type === "start") return r.depth === 1 ? t("room.start1") : t("room.start");
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
    startRun(character: CharacterId = "grabarz", seed = 7) {
      meta.selected = character;
      startRun(new Run({ seed, character, pool: poolOf(meta) }), true);
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
    get overlay() {
      return overlay;
    },
  };

  // ---------------------------------------------------------------- the loop
  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    time += dt;
    const mouse = view.toView(input.mouse);
    const clicked = input.wasPressed("Mouse0");
    const up = input.wasPressed("KeyW") || input.wasPressed("ArrowUp");
    const down = input.wasPressed("KeyS") || input.wasPressed("ArrowDown");
    const accept = input.wasPressed("Enter") || input.wasPressed("Space") || input.wasPressed("KeyE");
    const esc = input.wasPressed("Escape");
    narrator.update(dt);
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
      if (up) sel = (sel - 1 + count) % count;
      if (down) sel = (sel + 1) % count;
      if (hovered >= 0) sel = hovered;
      if (accept || (clicked && hovered >= 0)) {
        input.releaseMouse();
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
    if (overlay === null && mode !== "summary") {
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
          const stepInput: InputState = first ? held : { ...idleInput(aim), move: held.move, shoot: held.shoot };
          let events: GameEvent[];
          if (mode === "hub" && hub) {
            hub.update(STEP, stepInput);
            events = hub.events;
            react(events, hub);
          } else if (run) {
            events = run.update(STEP, stepInput);
            react(events, run.world);
            if (run.floor !== lastFloor) {
              // down the stairs: a new floor, saved at its start
              lastFloor = run.floor;
              view.setRoom(roomKey(run), run.world);
              saveRun(store, run.snapshot());
              floorBanner(run);
              narrator.newFloor(run.world.theme);
            } else if (events.some((e) => e.type === "enterRoom")) {
              view.setRoom(roomKey(run), run.world);
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
      banner: banner ? { text: banner.text, sub: banner.sub, alpha: Math.min(1, banner.time / 0.6) } : null,
      echo: mode === "hub" ? meta.echo : undefined,
      started: true,
    });
    if (mode === "hub" && hub && overlay === null) {
      sarcophagusPanel(hub);
      screens.controls(CONTROLS(), t("legend.title"));
    }

    // ---- overlays
    if (mode === "summary" && summary) {
      screens.summary(summary.victory ? t("sum.victory") : t("sum.death"), summary.lines, summary.victory, t("sum.continue"));
      if (accept || clicked) {
        input.releaseMouse();
        summary = null;
        enterHub();
      }
    } else if (overlay === "pause") {
      screens.dim(0.5);
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
