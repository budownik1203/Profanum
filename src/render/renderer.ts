/**
 * PixiJS v8 view of the World: the camera, the layers (floor, blood, things, actors, darkness,
 * glow, HUD), effects driven by the simulation's events, and world-space texts.
 * Blood and corpses are baked into a RenderTexture so the arena slowly turns into a slaughterhouse.
 */
import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from "pixi.js";
import { CONFIG } from "../game/config.js";
import type { Vec } from "../game/math.js";
import type { Bullet, Corpse, GameEvent, Soul } from "../game/types.js";
import { World } from "../game/world.js";
import { t } from "../i18n.js";
import { PAL } from "../palette.js";
import { CANDELABRA_ARMS, CHANDELIER_CANDLES, drawChest, drawCover, drawDoorsState, drawFixture, drawFloor, drawInteractable, drawPickup, drawZone } from "./env.js";
import { drawPlayer, drawUnit } from "./figures.js";
import { VIEW_H, VIEW_W } from "./hud.js";
import { TextPool } from "./text.js";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  kind: "smoke" | "blood" | "spark" | "chunk" | "mist" | "splinter" | "glass" | "ash";
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: number;
  size: number;
  life: number;
  max: number;
  vy: number;
}

export interface Prompt {
  text: string;
  sub?: string;
  pos: Vec;
}

export class GameRenderer {
  readonly root = new Container(); // screen space, scaled to fit the window
  readonly ui = new Container(); // menus, above everything
  readonly hudLayer = new Container();
  readonly hudG = new Graphics();
  readonly hudText: TextPool;
  private camLayer = new Container(); // world space
  private floorG = new Graphics();
  private decals: RenderTexture;
  private decalSprite: Sprite;
  private stamp = new Graphics(); // drawn into the decal texture, then cleared
  private stampDirty = false;
  private lowG = new Graphics();
  private actorsG = new Graphics();
  private overheadG = new Graphics();
  /** Darkness: a half-resolution 2D canvas with hard pools of light cut out of it. */
  private darkCanvas: HTMLCanvasElement;
  private darkTex: Texture;
  private darkSprite: Sprite;
  /** Above the darkness: things that glow (eyes, flames, souls, bullets, sparks). */
  private glowLayer = new Container();
  private glowG = new Graphics();
  private bulletsG = new Graphics();
  private fxG = new Graphics();
  private worldText: TextPool;
  private vignette: Sprite;
  private decalTextures = new Map<string, RenderTexture>();
  private floorFor: World | null = null;

  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private cam: Vec = { x: 0, y: 0 };
  private viewScale = 1;
  private viewOffset: Vec = { x: 0, y: 0 };
  private telegraphs = new Map<number, number>(); // enemy id -> seconds of red warning
  private rope: { from: Vec; to: Vec; life: number } | null = null;
  private flashWhite = 0;
  /** Player options. */
  shakeScale = 1;
  showNumbers = true;

  constructor(private renderer: Renderer) {
    this.decals = RenderTexture.create({ width: CONFIG.room.width, height: CONFIG.room.height });
    this.decalSprite = new Sprite(this.decals);
    this.camLayer.addChild(this.floorG, this.decalSprite, this.lowG, this.actorsG, this.overheadG);
    this.glowLayer.addChild(this.glowG, this.bulletsG, this.fxG);
    this.worldText = new TextPool(this.glowLayer);

    this.darkCanvas = document.createElement("canvas");
    this.darkCanvas.width = VIEW_W / 2;
    this.darkCanvas.height = VIEW_H / 2;
    this.darkTex = Texture.from(this.darkCanvas);
    this.darkSprite = new Sprite(this.darkTex);
    this.darkSprite.width = VIEW_W;
    this.darkSprite.height = VIEW_H;

    this.vignette = new Sprite(makeVignette());
    this.vignette.width = VIEW_W;
    this.vignette.height = VIEW_H;

    this.hudLayer.addChild(this.hudG);
    this.hudText = new TextPool(this.hudLayer);
    this.root.addChild(this.camLayer, this.darkSprite, this.glowLayer, this.vignette, this.hudLayer, this.ui);
  }

  /** Forget every room (a new run). */
  reset(): void {
    this.particles = [];
    this.floaters = [];
    this.telegraphs.clear();
    this.shake = 0;
    for (const rt of this.decalTextures.values()) rt.destroy();
    this.decalTextures.clear();
  }

  /** Switch to another room: its own blood texture, its floor, the camera snaps to the player. */
  setRoom(key: string, world: World): void {
    this.flushStamps(); // finish the old room's blood first
    let rt = this.decalTextures.get(key);
    if (!rt) {
      rt = RenderTexture.create({ width: world.room.w, height: world.room.h });
      this.decalTextures.set(key, rt);
    }
    this.decals = rt;
    this.decalSprite.texture = rt;
    this.floorFor = null;
    this.particles = [];
    this.floaters = [];
    this.cam = { ...world.player.pos };
  }

  /** Fit the 1920x1080 virtual view into the window (letterboxed). */
  resize(screenW: number, screenH: number): void {
    this.viewScale = Math.min(screenW / VIEW_W, screenH / VIEW_H);
    this.viewOffset = { x: (screenW - VIEW_W * this.viewScale) / 2, y: (screenH - VIEW_H * this.viewScale) / 2 };
    this.root.scale.set(this.viewScale);
    this.root.position.set(this.viewOffset.x, this.viewOffset.y);
  }

  /** Screen (canvas) pixels → virtual 1920x1080 coordinates (menus). */
  toView(s: Vec): Vec {
    return { x: (s.x - this.viewOffset.x) / this.viewScale, y: (s.y - this.viewOffset.y) / this.viewScale };
  }

  /** Screen (canvas) pixels → world coordinates. */
  screenToWorld(s: Vec): Vec {
    const v = this.toView(s);
    return { x: v.x - this.camLayer.position.x, y: v.y - this.camLayer.position.y };
  }

  /** A short line of text rising from a point in the world. */
  floatText(pos: Vec, text: string, color: number, size = 30, life = 1.1): void {
    this.floaters.push({ x: pos.x, y: pos.y - 70, text, color, size, life, max: life, vy: -40 });
  }

  addShake(v: number): void {
    this.shake = Math.min(28, this.shake + v * this.shakeScale);
  }

  // ---------------------------------------------------------------- events → effects
  handle(events: GameEvent[], world: World): void {
    const p = world.player;
    for (const e of events) {
      switch (e.type) {
        case "shot":
          if (e.weapon === "howler") {
            for (let i = 0; i < 16; i++) this.spawn(e.pos, e.dir.x * rnd(200, 600) + rnd(-200, 200), e.dir.y * rnd(200, 600) + rnd(-200, 200), rnd(0.2, 0.4), rnd(6, 12), 0xcfc4a8, "mist");
          } else if (!e.silent) {
            this.puff(e.pos, e.dir, e.fromPlayer ? 9 : 6);
          }
          this.addShake(e.fromPlayer ? (e.weapon === "hakownica" || e.weapon === "headsman" || e.weapon === "organ" ? 12 : 7) : 3);
          break;
        case "enemyHit":
          this.spray(e.pos, e.dir, 14, 1);
          this.addShake(5);
          if (this.showNumbers) this.number(e.pos, e.amount, e.crit || e.ambush);
          if (e.ambush) this.floatText(e.pos, t("float.ambush"), PAL.ember);
          break;
        case "enemyDeath":
          this.spray(e.pos, e.dir, e.boss ? 120 : 40, e.boss ? 2.4 : 1.6);
          this.chunks(e.pos, e.dir, e.boss ? 24 : 7);
          this.bloodPool(e.pos, e.dir);
          this.addShake(e.boss ? 26 : 12);
          if (e.ambush) this.floatText(e.pos, t("float.ambush"), PAL.ember);
          break;
        case "minionHit":
          for (let i = 0; i < 8; i++) this.spawn(e.pos, e.dir.x * rnd(80, 260) + rnd(-80, 80), e.dir.y * rnd(80, 260) + rnd(-80, 80), rnd(0.2, 0.5), rnd(2, 5), PAL.minion, "chunk");
          this.addShake(3);
          break;
        case "minionDeath":
          for (let i = 0; i < 18; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-200, 40), rnd(0.4, 0.9), rnd(6, 14), PAL.smoke, "smoke");
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-140, 140), rnd(-140, 140), rnd(0.3, 0.7), rnd(2, 4), PAL.soul, "spark");
          this.addShake(4);
          break;
        case "playerHit":
          if (e.armor) for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-200, 100), rnd(0.2, 0.5), rnd(3, 6), 0xcfc4a8, "splinter");
          else this.spray(e.pos, e.dir, 10, 0.8);
          this.addShake(14);
          break;
        case "playerDeath":
          this.spray(e.pos, { x: 0, y: -1 }, 30, 1.2);
          for (let i = 0; i < 40; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-260, 0), rnd(0.6, 1.4), rnd(4, 10), 0x6a6258, "ash");
          this.addShake(20);
          break;
        case "dodge":
          for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-60, 60), rnd(0.3, 0.6), rnd(10, 22), PAL.ink, "mist");
          break;
        case "alarm":
          this.floatText(e.pos, t("float.alarm"), PAL.telegraph, 34);
          this.addShake(10);
          break;
        case "bark":
          this.floatText(e.pos, t("float.bark"), PAL.telegraph, 30);
          break;
        case "telegraph":
          this.telegraphs.set(e.enemy, 0.7);
          break;
        case "coverFlip":
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-120, 120), rnd(0.3, 0.6), rnd(6, 14), PAL.smoke, "smoke");
          this.addShake(6);
          break;
        case "coverHit":
          for (let i = 0; i < 4; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-160, 160), rnd(0.2, 0.4), rnd(2, 5), PAL.woodHi, "splinter");
          break;
        case "coverBreak":
          for (let i = 0; i < 22; i++) this.spawn(e.pos, rnd(-260, 260), rnd(-260, 260), rnd(0.4, 0.9), rnd(4, 10), e.kind === "tomb" || e.kind === "pillar" ? 0x6a6a62 : PAL.wood, "splinter");
          this.addShake(9);
          break;
        case "explosion":
          for (let i = 0; i < 40; i++) this.spawn(e.pos, rnd(-1, 1) * e.radius * 3, rnd(-1, 1) * e.radius * 3, rnd(0.2, 0.6), rnd(2, 5), PAL.emberHot, "spark");
          for (let i = 0; i < 24; i++) this.spawn(e.pos, rnd(-1, 1) * e.radius, rnd(-1.4, 0.4) * e.radius, rnd(0.6, 1.4), rnd(12, 26), PAL.smoke, "smoke");
          this.splat(e.pos.x, e.pos.y, e.radius * 0.7, 0x120c08);
          this.addShake(Math.min(24, 8 + e.radius / 10));
          break;
        case "fire":
          for (let i = 0; i < 16; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-180, -20), rnd(0.3, 0.7), rnd(2, 4), PAL.ember, "spark");
          break;
        case "bulletWall":
          for (let i = 0; i < 5; i++) this.spawn(e.pos, rnd(-140, 140), rnd(-140, 140), rnd(0.1, 0.3), rnd(1.5, 3), PAL.emberHot, "spark");
          break;
        case "shieldBlock":
          for (let i = 0; i < 8; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-200, 200), rnd(0.1, 0.3), rnd(1.5, 3), 0xf4e2a8, "spark");
          break;
        case "soulPickup":
          for (let i = 0; i < 16; i++) this.spawn(e.pos, rnd(-180, 180), rnd(-180, 180), rnd(0.2, 0.5), rnd(1.5, 3.5), PAL.soul, "spark");
          break;
        case "raise":
          for (let i = 0; i < 24; i++) this.spawn(e.pos, rnd(-90, 90), rnd(-160, 20), rnd(0.4, 0.9), rnd(10, 24), PAL.ink, "mist");
          for (let i = 0; i < 20; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-260, -40), rnd(0.3, 0.8), rnd(1.5, 3.5), PAL.ember, "spark");
          this.addShake(8);
          break;
        case "raiseFail":
          for (let i = 0; i < 6; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-90, -20), rnd(0.2, 0.4), rnd(6, 10), PAL.smoke, "smoke");
          this.floatText(p.pos, e.reason === "noSouls" ? t("float.noSouls") : t("float.limit"), PAL.hudDim, 24);
          break;
        case "noSouls":
          this.floatText(p.pos, t("float.noSouls"), PAL.hudDim, 24, 0.8);
          break;
        case "empty":
          this.floatText(p.pos, t("float.empty"), PAL.hudDim, 24, 0.8);
          break;
        case "command":
          for (let i = 0; i < 12; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-120, 120), rnd(0.3, 0.6), rnd(1.5, 3), PAL.ember, "spark");
          break;
        case "exorcism":
          if (!e.warn) for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2;
            this.spawn({ x: e.pos.x + Math.cos(a) * e.radius, y: e.pos.y + Math.sin(a) * e.radius }, Math.cos(a) * -80, -120, rnd(0.3, 0.7), rnd(2, 4), PAL.holy, "spark");
          }
          break;
        case "heal":
          for (let i = 0; i < 12; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-160, -40), rnd(0.4, 0.8), rnd(2, 4), PAL.soul, "spark");
          break;
        case "bell":
          this.addShake(e.done ? 14 : 4);
          if (e.done) this.floatText(e.pos, t("float.bell"), PAL.telegraph, 28, 2);
          break;
        case "burn":
          for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-50, 50), rnd(-140, -40), rnd(0.5, 1), rnd(6, 12), PAL.smoke, "smoke");
          for (let i = 0; i < 8; i++) this.spawn(e.pos, rnd(-80, 80), rnd(-160, -40), rnd(0.2, 0.5), rnd(1.5, 3), PAL.ember, "spark");
          this.floatText(e.pos, t("float.burn"), PAL.ember, 24);
          this.addShake(6);
          break;
        case "lightOut": {
          const big = e.kind === "candle" ? 1 : 1.8;
          for (let i = 0; i < 10 * big; i++) this.spawn(e.pos, rnd(-30, 30) * big, rnd(-90, -30), rnd(0.6, 1.2), rnd(4, 9) * big, PAL.smoke, "smoke");
          for (let i = 0; i < 6 * big; i++) this.spawn(e.pos, rnd(-120, 120) * big, rnd(-120, 40), rnd(0.15, 0.35), rnd(1.5, 3), PAL.emberHot, "spark");
          this.addShake(2 * big);
          break;
        }
        case "lightHit":
          for (let i = 0; i < 8; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-160, 60), rnd(0.15, 0.4), rnd(1.5, 3), PAL.emberHot, "spark");
          for (let i = 0; i < 5; i++) this.spawn(e.pos, rnd(-30, 30), rnd(-70, -20), rnd(0.5, 1), rnd(4, 8), PAL.smoke, "smoke");
          this.addShake(2);
          break;
        case "chandelierFall":
          for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-240, 40), rnd(0.2, 0.5), rnd(1.5, 3.5), PAL.emberHot, "spark");
          this.floatText(e.pos, t("float.chain"), PAL.emberHot, 26);
          this.addShake(5);
          break;
        case "chandelierCrash":
          for (let i = 0; i < 40; i++) this.spawn(e.pos, rnd(-420, 420), rnd(-300, 200), rnd(0.25, 0.7), rnd(1.5, 4), PAL.emberHot, "spark");
          for (let i = 0; i < 26; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-200, 60), rnd(0.7, 1.4), rnd(10, 22), PAL.smoke, "smoke");
          for (let i = 0; i < 18; i++) this.spawn(e.pos, rnd(-320, 320), rnd(-200, 200), rnd(0.3, 0.7), rnd(3, 7), PAL.iron, "splinter");
          this.splat(e.pos.x, e.pos.y, 120, 0x15100c);
          for (let i = 0; i < 9; i++) this.splat(e.pos.x + rnd(-150, 150), e.pos.y + rnd(-90, 90), rnd(6, 14), PAL.wax);
          this.addShake(24);
          break;
        case "windowBreak":
          for (let i = 0; i < 46; i++) this.spawn(e.pos, rnd(-150, 150), rnd(120, 520), rnd(0.35, 0.8), rnd(2, 5), PAL.glass[i % PAL.glass.length], "glass");
          this.floatText({ x: e.pos.x, y: e.pos.y + 120 }, t("float.glass"), PAL.holy, 26);
          this.addShake(8);
          break;
        case "relight":
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-120, -20), rnd(0.2, 0.5), rnd(1.5, 3), PAL.ember, "spark");
          break;
        case "pickup":
          if (e.kind !== "gold") {
            for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-100, 100), rnd(-140, -20), rnd(0.2, 0.5), rnd(1.5, 3), e.kind === "echo" ? 0x8ab4ff : PAL.soul, "spark");
            this.floatText(e.pos, e.kind === "echo" ? `+${e.value} ${t("pickup.echo")}` : t(`pickup.${e.kind}`), e.kind === "echo" ? 0x8ab4ff : PAL.hudText, 22, 0.9);
          }
          break;
        case "buy":
          for (let i = 0; i < 12; i++) this.spawn(e.pos, rnd(-100, 100), rnd(-140, -20), rnd(0.2, 0.5), rnd(1.5, 3), 0xd8b04a, "spark");
          break;
        case "tooPoor":
          this.floatText(e.pos, t("float.tooPoor"), PAL.hudDim, 24, 0.9);
          break;
        case "needKey":
          this.floatText(e.pos, t("float.needKey"), PAL.hudDim, 24, 0.9);
          break;
        case "chestOpen":
          for (let i = 0; i < 20; i++) this.spawn(e.pos, rnd(-140, 140), rnd(-220, -40), rnd(0.3, 0.7), rnd(1.5, 3.5), 0xd8b04a, "spark");
          break;
        case "chestBreak":
          for (let i = 0; i < 20; i++) this.spawn(e.pos, rnd(-240, 240), rnd(-240, 100), rnd(0.3, 0.8), rnd(4, 9), PAL.wood, "splinter");
          if (e.ruined) this.floatText(e.pos, t("float.ruined"), PAL.hudDim, 24);
          this.addShake(6);
          break;
        case "mimic":
          this.floatText(e.pos, t("float.mimic"), PAL.telegraph, 34);
          this.addShake(12);
          break;
        case "relicUse":
          if (e.relic === "monstrance") this.flashWhite = 0.35;
          for (let i = 0; i < 30; i++) this.spawn(e.pos, rnd(-300, 300), rnd(-300, 300), rnd(0.3, 0.7), rnd(2, 4), e.relic === "monstrance" ? PAL.holy : 0xc88aff, "spark");
          this.addShake(6);
          break;
        case "relicReady":
          this.floatText(p.pos, t("float.relicReady"), 0xf4e2a8, 24);
          break;
        case "relicNotReady":
          this.floatText(p.pos, t("float.notReady"), PAL.hudDim, 22, 0.8);
          break;
        case "itemGet":
          for (let i = 0; i < 24; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-240, -20), rnd(0.3, 0.8), rnd(1.5, 3.5), e.kind === "remains" ? 0xc88aff : PAL.soul, "spark");
          this.floatText(p.pos, e.kind === "weapon" ? t(`weapon.${e.item}`) : e.kind === "item" ? t(`item.${e.item}`) : e.kind === "relic" ? t(`relic.${e.item}`) : t("remains", { name: t(`weapon.${e.item}`) }), 0xf4e2c8, 28, 1.8);
          break;
        case "legend":
          for (let i = 0; i < 60; i++) this.spawn(e.pos, rnd(-300, 300), rnd(-360, 60), rnd(0.4, 1.2), rnd(2, 5), 0xc88aff, "spark");
          this.floatText(e.pos, t("float.legend"), 0xc88aff, 34, 2);
          this.addShake(14);
          break;
        case "synergy":
          for (let i = 0; i < 50; i++) this.spawn(e.pos, rnd(-260, 260), rnd(-320, 40), rnd(0.4, 1.1), rnd(2, 4.5), i % 2 ? 0xc88aff : PAL.emberHot, "spark");
          this.floatText({ x: e.pos.x, y: e.pos.y - 40 }, t("float.synergy", { name: t(`synergy.${e.id}`) }), 0xe0c0ff, 30, 2.4);
          this.addShake(8);
          break;
        case "ritual":
          for (let i = 0; i < 40; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-300, 0), rnd(0.4, 1), rnd(2, 5), 0x9e1f14, "spark");
          this.floatText(e.pos, t("float.ritual"), 0xc88aff, 30, 2);
          this.addShake(10);
          break;
        case "abomination":
          for (let i = 0; i < 40; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-200, 40), rnd(0.5, 1.1), rnd(12, 28), PAL.ink, "mist");
          this.floatText(e.pos, t("float.abomination"), PAL.ember, 32, 1.6);
          this.addShake(12);
          break;
        case "secretOpen":
          for (let i = 0; i < 30; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-160, 160), rnd(0.5, 1.2), rnd(10, 20), 0x5a5048, "smoke");
          this.floatText(e.pos, t("float.secret"), 0x8ab4ff, 28, 1.8);
          this.addShake(10);
          break;
        case "special":
          this.rope = { from: { ...e.pos }, to: { ...e.target }, life: 0.25 };
          break;
        case "bossDeath":
          for (let i = 0; i < 80; i++) this.spawn(e.pos, rnd(-500, 500), rnd(-500, 300), rnd(0.4, 1.4), rnd(2, 6), PAL.emberHot, "spark");
          this.flashWhite = 0.5;
          this.addShake(28);
          break;
        case "shrine":
          for (let i = 0; i < 26; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-260, 40), rnd(0.4, 1), rnd(1.5, 3.5), PAL.soul, "spark");
          this.floatText(e.pos, e.halves > 0 ? t("float.shrine") : t("float.shrineSouls"), PAL.soul, 26);
          break;
        case "doorsShut":
          this.addShake(8);
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  drawWorld(world: World, dt: number, aim: Vec, prompt: Prompt | null): void {
    this.updateParticles(dt);
    for (const [id, tt] of this.telegraphs) {
      if (tt - dt <= 0) this.telegraphs.delete(id);
      else this.telegraphs.set(id, tt - dt);
    }
    this.flashWhite = Math.max(0, this.flashWhite - dt);
    if (this.floorFor !== world) {
      drawFloor(this.floorG, world, world.doors);
      this.floorFor = world;
    }

    // camera follows the player, leaning a little towards the aim point
    const p = world.player;
    const target = { x: p.pos.x + (aim.x - p.pos.x) * 0.18, y: p.pos.y + (aim.y - p.pos.y) * 0.18 };
    this.cam.x += (target.x - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (target.y - this.cam.y) * Math.min(1, dt * 8);
    const cx = clampCam(this.cam.x, world.room.w, VIEW_W);
    const cy = clampCam(this.cam.y, world.room.h, VIEW_H);
    this.shake = Math.max(0, this.shake - dt * 60);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.camLayer.position.set(Math.round(VIEW_W / 2 - cx + sx), Math.round(VIEW_H / 2 - cy + sy));
    this.glowLayer.position.set(this.camLayer.position.x, this.camLayer.position.y);

    this.flushStamps();
    this.glowG.clear(); // everything that glows is redrawn this frame
    this.drawLow(world);
    this.drawActors(world);
    this.drawOverhead(world);
    this.drawSouls(world.souls, world.time);
    this.drawOrder(world);
    this.drawBullets(world);
    this.drawParticles();
    this.drawLights(world);
    this.drawDarkness(world);
    this.drawWorldTexts(world, dt, prompt);
  }

  // ---------------------------------------------------------------- floor-level things
  private drawLow(world: World): void {
    const g = this.lowG;
    g.clear();
    for (const z of world.zones) drawZone(g, this.glowG, z, world.time);
    for (const c of world.corpses) this.drawCorpse(g, c, c === world.raisableCorpse(), world.time);
    for (const l of world.lights) drawFixture(g, l, world);
    const near = new Set<number>();
    for (const it of world.interactables) if (Math.hypot(it.pos.x - world.player.pos.x, it.pos.y - world.player.pos.y) < it.radius + 40) near.add(it.id);
    for (const it of world.interactables) drawInteractable(g, this.glowG, it, world, world.time, near.has(it.id));
    if (world.shrine) {
      const sh = world.shrine;
      g.ellipse(sh.pos.x, sh.pos.y + 30, 70, 18).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(sh.pos.x - 60, sh.pos.y - 10, 120, 40).fill(0x4a4038).stroke({ width: 5, color: PAL.ink });
      for (let i = -2; i <= 2; i++) g.circle(sh.pos.x + i * 22, sh.pos.y - 18, 10).fill(sh.used ? 0x6e665a : 0xcfc4a8).stroke({ width: 3, color: PAL.ink });
      if (!sh.used) this.glowG.circle(sh.pos.x, sh.pos.y - 20, 50).fill({ color: PAL.soul, alpha: 0.12 + 0.06 * Math.sin(world.time * 3) });
    }
    for (const c of world.chests) drawChest(g, c, world.time);
    for (const pk of world.pickups) drawPickup(g, this.glowG, pk, world.time);
    // covers are sorted by their bottom edge so tall ones overlap correctly
    const covers = world.covers.filter((c) => !c.broken).sort((a, b) => a.y + a.h - (b.y + b.h));
    for (const c of covers) drawCover(g, c, world.time);
    drawDoorsState(g, world);
  }

  /** Bodies on the floor. Fresh ones (still raisable) breathe a faint ember glow. */
  private drawCorpse(g: Graphics, c: Corpse, selected: boolean, time: number): void {
    const side = Math.sign(c.dir.x || 1);
    const x = c.pos.x + c.dir.x * 18;
    const y = c.pos.y + 10;
    const coat = c.fromMinion ? PAL.minionMid : CORPSE_COLORS[c.kind] ?? PAL.guardCoatMid;
    const big = c.big && c.echo <= 0 && c.raises < 2 ? 1.6 : 1;
    if (c.echo > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6 + c.id);
      const a = (selected ? 0.45 : 0.18) * (0.6 + 0.4 * pulse) * Math.min(1, c.echo / 1.5);
      g.ellipse(x, y, 44, 24).fill({ color: PAL.ember, alpha: a });
    }
    g.ellipse(x, y, 32 * big, 15 * big).fill(PAL.ink);
    g.ellipse(x - 3 * side, y - 2, 25 * big, 10 * big).fill(coat);
    g.circle(x + 24 * side * big, y - 3, 9 * big).fill(PAL.ink);
    g.circle(x + 24 * side * big, y - 4, 6 * big).fill(c.fromMinion ? PAL.minion : 0x6e5a48);
    g.moveTo(x - 6 * side, y + 6).lineTo(x - 30 * side, y + 14).stroke({ width: 4, color: PAL.ink, cap: "round" });
    if (selected) g.ellipse(x, y, 40, 20).stroke({ width: 2, color: PAL.ember, alpha: 0.8 });
  }

  // ---------------------------------------------------------------- actors
  private drawActors(world: World): void {
    const g = this.actorsG;
    g.clear();
    // draw back to front by y so overlaps read correctly in 3/4 view
    const actors: { y: number; draw: () => void }[] = world.units.map((u) => ({ y: u.pos.y, draw: () => drawUnit(g, this.glowG, u, world, this.telegraphs.get(u.id) ?? 0) }));
    if (world.player.alive) actors.push({ y: world.player.pos.y, draw: () => drawPlayer(g, this.glowG, world) });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
    if (this.rope) {
      this.rope.life -= 1 / 60;
      g.moveTo(this.rope.from.x, this.rope.from.y - 40).lineTo(this.rope.to.x, this.rope.to.y - 30).stroke({ width: 4, color: 0x8a6a3a, alpha: Math.max(0, this.rope.life * 4) });
      if (this.rope.life <= 0) this.rope = null;
    }
  }

  /** The hanging chandelier: drawn above the actors, falling once its chain snaps. */
  private drawOverhead(world: World): void {
    const g = this.overheadG;
    g.clear();
    for (const l of world.lights) {
      if (l.kind !== "chandelier" || l.fallen) continue;
      const hang = World.hitPoint(l);
      let fy = hang.y;
      if (l.falling !== undefined) {
        const tt = 1 - Math.max(0, l.falling) / CONFIG.chandelier.fallTime;
        fy = hang.y + (l.pos.y - hang.y) * tt * tt;
        g.ellipse(l.pos.x, l.pos.y, 60 + 40 * tt, 18 + 12 * tt).fill({ color: PAL.ink, alpha: 0.25 + 0.4 * tt });
      } else {
        g.moveTo(hang.x, fy - 26).lineTo(hang.x, fy - 420).stroke({ width: 7, color: PAL.ink });
        g.moveTo(hang.x, fy - 26).lineTo(hang.x, fy - 420).stroke({ width: 3, color: PAL.iron });
      }
      const x = hang.x;
      const sway = l.falling === undefined ? Math.sin(world.time * 1.3 + l.id) * 2 : 0;
      g.moveTo(x, fy - 26).lineTo(x - 70 + sway, fy).stroke({ width: 4, color: PAL.ink });
      g.moveTo(x, fy - 26).lineTo(x + 70 + sway, fy).stroke({ width: 4, color: PAL.ink });
      g.ellipse(x + sway, fy, 72, 18).stroke({ width: 10, color: PAL.ink });
      g.ellipse(x + sway, fy, 72, 18).stroke({ width: 5, color: PAL.iron });
      g.circle(x, fy - 26, 8).fill(PAL.iron).stroke({ width: 3, color: PAL.ink });
      const n = l.hp >= l.maxHp ? CHANDELIER_CANDLES : Math.ceil(CHANDELIER_CANDLES / 2);
      for (let i = 0; i < n; i++) {
        const a = (i / CHANDELIER_CANDLES) * Math.PI * 2;
        g.rect(x + sway + Math.cos(a) * 72 - 4, fy + Math.sin(a) * 18 - 16, 8, 16).fill(PAL.wax).stroke({ width: 2, color: PAL.ink });
      }
    }
  }

  /** Souls hover over fresh corpses: a pale flame the player must walk through. */
  private drawSouls(souls: Soul[], time: number): void {
    const g = this.glowG;
    for (const s of souls) {
      const fade = Math.min(1, s.life / 1.2);
      const bob = Math.sin(time * 4 + s.id) * 4;
      const x = s.pos.x;
      const y = s.pos.y + bob;
      g.circle(x, y, 22).fill({ color: PAL.soul, alpha: 0.12 * fade });
      g.circle(x, y, 13).fill({ color: PAL.soul, alpha: 0.25 * fade });
      g.poly([x - 7, y + 4, x, y - 16 - Math.sin(time * 9 + s.id) * 3, x + 7, y + 4, x, y + 9]).fill({ color: PAL.soul, alpha: 0.9 * fade });
      g.circle(x, y + 1, 3).fill({ color: 0xffffff, alpha: fade });
    }
  }

  /** Where the minions were sent with Q. */
  private drawOrder(world: World): void {
    if (!world.order) return;
    const g = this.glowG;
    const { pos, time } = world.order;
    const a = Math.min(1, time) * 0.7;
    g.circle(pos.x, pos.y, 28).stroke({ width: 3, color: PAL.ember, alpha: a });
    g.moveTo(pos.x - 12, pos.y).lineTo(pos.x + 12, pos.y).stroke({ width: 3, color: PAL.ember, alpha: a });
    g.moveTo(pos.x, pos.y - 12).lineTo(pos.x, pos.y + 12).stroke({ width: 3, color: PAL.ember, alpha: a });
  }

  private drawBullets(world: World): void {
    const g = this.bulletsG;
    g.clear();
    for (const b of world.bullets) {
      if (b.delay && b.delay > 0) {
        // a bullet waiting in a pattern: a faint ring
        g.circle(b.pos.x, b.pos.y, b.radius).stroke({ width: 2, color: PAL.telegraph, alpha: 0.5 });
        continue;
      }
      if (b.lob) {
        this.drawLob(g, b);
        continue;
      }
      drawBullet(g, b, world.time);
    }
  }

  private drawLob(g: Graphics, b: Bullet): void {
    const l = b.lob!;
    const tt = Math.min(1, l.t / l.dur);
    const h = Math.sin(tt * Math.PI) * l.height;
    g.ellipse(b.pos.x, b.pos.y, 10, 4).fill({ color: PAL.ink, alpha: 0.5 });
    // the landing spot is marked
    g.circle(l.to.x, l.to.y, l.radius * (0.4 + 0.6 * tt)).stroke({ width: 2, color: b.side === "minion" ? PAL.ember : PAL.telegraph, alpha: 0.5 });
    const x = b.pos.x;
    const y = b.pos.y - h;
    switch (b.look) {
      case "torch":
        g.moveTo(x - 8, y + 8).lineTo(x + 8, y - 8).stroke({ width: 5, color: PAL.wood });
        g.circle(x + 8, y - 8, 8).fill(PAL.ember);
        break;
      case "flask":
        g.circle(x, y, 8).fill(0x5a8a3a).stroke({ width: 3, color: PAL.ink });
        break;
      default:
        g.circle(x, y, b.radius).fill(0x2a2620).stroke({ width: 3, color: PAL.ink });
        g.circle(x + 4, y - 6, 3).fill(PAL.emberHot);
    }
  }

  // ---------------------------------------------------------------- lights and darkness
  /** Flames glow above the darkness. */
  private drawLights(world: World): void {
    const g = this.glowG;
    const flame = (x: number, y: number, size: number, flick: number, color: number = PAL.emberHot) => {
      g.circle(x, y - 4 * size, 12 * size).fill({ color: PAL.ember, alpha: 0.22 });
      g.poly([x - 4 * size, y, x, y - 14 * size - flick, x + 4 * size, y]).fill(color);
    };
    for (const l of world.lights) {
      if (l.kind === "flash" || !l.on) continue;
      const flick = Math.sin(world.time * 13 + l.id * 3) * 1.5;
      const { x, y } = l.pos;
      switch (l.kind) {
        case "candle":
          flame(x, y - 8, 1, flick);
          break;
        case "candelabra":
          for (const [dx, i] of CANDELABRA_ARMS) {
            if (l.hp < l.maxHp && i >= 2) continue;
            flame(x + dx, y - 42 + (dx === 0 ? -6 : 0), 0.85, flick * (i % 2 ? -1 : 1));
          }
          break;
        case "torch": {
          const h = World.hitPoint(l);
          g.circle(h.x, h.y - 10, 26).fill({ color: PAL.ember, alpha: 0.18 });
          flame(h.x - 3, h.y - 2, 1.5, flick * 2);
          flame(h.x + 4, h.y - 1, 1.1, -flick * 2);
          break;
        }
        case "brazier":
          g.circle(x, y - 34, 30).fill({ color: PAL.ember, alpha: 0.2 });
          for (let i = 0; i < (l.hp < l.maxHp ? 2 : 4); i++) flame(x - 15 + i * 10, y - 26, 1.4, flick * (i % 2 ? -2 : 2));
          break;
        case "pyre": {
          g.circle(x, y - 50, 70).fill({ color: PAL.holy, alpha: 0.14 });
          const n = 3 + l.hp * 2;
          for (let i = 0; i < n; i++) flame(x - 40 + (80 * i) / Math.max(1, n - 1), y - 18 - (i % 2) * 14, 2.4, flick * (i % 2 ? -3 : 3), i % 2 ? 0xfff0c0 : PAL.emberHot);
          break;
        }
        case "chandelier": {
          if (l.falling !== undefined) break;
          const h = World.hitPoint(l);
          const sway = Math.sin(world.time * 1.3 + l.id) * 2;
          const n = l.hp >= l.maxHp ? CHANDELIER_CANDLES : Math.ceil(CHANDELIER_CANDLES / 2);
          for (let i = 0; i < n; i++) {
            const a = (i / CHANDELIER_CANDLES) * Math.PI * 2;
            flame(h.x + sway + Math.cos(a) * 72, h.y + Math.sin(a) * 18 - 16, 0.8, flick * (i % 2 ? -1 : 1));
          }
          break;
        }
        case "window":
          if (l.holy) {
            const wp = world.windowPoint(l);
            const w = CONFIG.window.width / 2;
            const vertical = l.wall === "N" || l.wall === "S" || l.wall === undefined;
            const pts = vertical ? [wp.x - w, wp.y, wp.x + w, wp.y, x + l.radius * 0.6, y, x - l.radius * 0.6, y] : [wp.x, wp.y - w, wp.x, wp.y + w, x, y + l.radius * 0.5, x, y - l.radius * 0.5];
            g.poly(pts).fill({ color: PAL.holy, alpha: 0.05 + 0.015 * Math.sin(world.time * 0.8 + l.id) });
          }
          break;
        case "lantern": {
          const bearer = world.units.find((u) => u.id === l.owner);
          if (bearer?.lamplighter) break; // the lamplighter's taper is drawn with him
          g.circle(x, y, 16).fill({ color: PAL.ember, alpha: 0.3 });
          g.rect(x - 6, y - 9, 12, 16).fill(PAL.emberHot).stroke({ width: 3, color: PAL.ink });
          break;
        }
        case "censer":
          for (let i = 0; i < 4; i++) {
            const a = world.time * 0.8 + i * 1.6;
            g.circle(x + Math.cos(a) * 26, y - 40 + Math.sin(a) * 10, 18).fill({ color: 0xd8d0c0, alpha: 0.08 });
          }
          break;
        default:
          break;
      }
    }
  }

  /** The room in darkness: black everywhere except hard-edged pools of light. */
  private drawDarkness(world: World): void {
    this.darkSprite.visible = world.dark;
    if (!world.dark) return;
    const ctx = this.darkCanvas.getContext("2d");
    if (!ctx) return;
    const ox = this.camLayer.position.x;
    const oy = this.camLayer.position.y;
    const k = 0.5; // the canvas is half resolution
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    ctx.fillStyle = "rgba(6, 4, 3, 0.9)";
    ctx.fillRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    ctx.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number, a: number) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.arc((x + ox) * k, (y + oy) * k, Math.max(0, r) * k, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const l of world.lights) {
      if (!l.on) continue;
      const flick = l.kind === "window" || l.kind === "flash" ? 1 : 1 + Math.sin(world.time * 9 + l.id) * 0.02;
      hole(l.pos.x, l.pos.y, l.radius * flick, 0.72); // outer band
      hole(l.pos.x, l.pos.y, l.radius * 0.7 * flick, 1); // hard bright core
    }
    // the necromancer can always make out his own silhouette, faintly
    if (world.player.alive) hole(world.player.pos.x, world.player.pos.y - 30, 70, 0.4);
    ctx.globalCompositeOperation = "source-over";
    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,245,220,${Math.min(0.6, this.flashWhite)})`;
      ctx.fillRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    }
    this.darkTex.source.update();
  }

  // ---------------------------------------------------------------- texts in the world
  private drawWorldTexts(world: World, dt: number, prompt: Prompt | null): void {
    const tx = this.worldText;
    tx.begin();
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      const a = Math.max(0, Math.min(1, f.life / 0.4));
      tx.text(f.text, f.x, f.y, { size: f.size, color: f.color, bold: true, stroke: true, align: "center" }, 0.5, 0.5, a);
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    // prices on the fence's counter
    for (const pk of world.pickups) {
      if (pk.price === undefined) continue;
      const price = Math.max(1, Math.round(pk.price * world.player.stats.shopMul * (1 + CONFIG.loot.priceRise * (world.ctx.depth - 1))));
      tx.text(`${price}`, pk.pos.x, pk.pos.y + 34, { size: 20, color: world.player.gold >= price ? 0xd8b04a : 0x7a5a3a, stroke: true, align: "center" }, 0.5, 0);
    }
    if (prompt && world.player.alive) {
      tx.text(prompt.text, prompt.pos.x, prompt.pos.y - 62, { size: 22, color: PAL.ember, stroke: true, align: "center" }, 0.5, 1);
      if (prompt.sub) tx.text(prompt.sub, prompt.pos.x, prompt.pos.y - 40, { size: 17, color: PAL.hudText, stroke: true, align: "center", wrap: 420 }, 0.5, 1);
    }
    tx.end();
  }

  private number(pos: Vec, amount: number, crit: boolean): void {
    const n = Math.max(1, Math.round(amount));
    this.floaters.push({ x: pos.x + rnd(-14, 14), y: pos.y - 50, text: String(n), color: crit ? PAL.emberHot : 0xe8d8c0, size: crit ? 30 : 20, life: 0.7, max: 0.7, vy: -70 });
  }

  // ---------------------------------------------------------------- decals
  /** Bake this frame's blood and corpses into the floor texture. */
  private flushStamps(): void {
    if (!this.stampDirty) return;
    this.renderer.render({ container: this.stamp, target: this.decals, clear: false });
    this.stamp.clear();
    this.stampDirty = false;
  }

  private splat(x: number, y: number, r: number, color: number): void {
    const s = this.stamp;
    s.ellipse(x, y, r, r * 0.6).fill({ color, alpha: 0.9 });
    for (let i = 0; i < 4; i++) s.circle(x + rnd(-r * 1.4, r * 1.4), y + rnd(-r * 0.9, r * 0.9), rnd(r * 0.15, r * 0.4)).fill({ color, alpha: 0.85 });
    this.stampDirty = true;
  }

  /** The pool under a fresh corpse stays on the floor even after the body gets up. */
  private bloodPool(pos: Vec, dir: Vec): void {
    this.splat(pos.x + dir.x * 10, pos.y + 8, 46, PAL.bloodDark);
    this.splat(pos.x + dir.x * 40, pos.y + dir.y * 30, 28, PAL.blood);
  }

  // ---------------------------------------------------------------- particles
  private spawn(p: Vec, vx: number, vy: number, life: number, size: number, color: number, kind: Particle["kind"]): void {
    if (this.particles.length > 1400) return;
    this.particles.push({ x: p.x, y: p.y, vx, vy, life, max: life, size, color, kind });
  }

  private puff(pos: Vec, dir: Vec, n: number): void {
    for (let i = 0; i < n; i++) this.spawn(pos, dir.x * rnd(40, 160) + rnd(-40, 40), dir.y * rnd(40, 160) + rnd(-40, 40) - 20, rnd(0.5, 1.1), rnd(8, 18), PAL.smoke, "smoke");
    for (let i = 0; i < 6; i++) this.spawn(pos, dir.x * rnd(200, 500) + rnd(-80, 80), dir.y * rnd(200, 500) + rnd(-80, 80), rnd(0.08, 0.2), rnd(2, 4), PAL.emberHot, "spark");
  }

  private spray(pos: Vec, dir: Vec, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const sp = rnd(120, 520) * power;
      this.spawn(pos, dir.x * sp + rnd(-160, 160) * power, dir.y * sp + rnd(-160, 160) * power, rnd(0.2, 0.55), rnd(3, 8), Math.random() < 0.5 ? PAL.blood : PAL.bloodDark, "blood");
    }
  }

  private chunks(pos: Vec, dir: Vec, n: number): void {
    for (let i = 0; i < n; i++) this.spawn(pos, dir.x * rnd(150, 420) + rnd(-200, 200), dir.y * rnd(150, 420) + rnd(-200, 200), rnd(0.35, 0.7), rnd(5, 10), 0x6e2a22, "chunk");
  }

  private updateParticles(dt: number): void {
    const alive: Particle[] = [];
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const drag = q.kind === "smoke" || q.kind === "mist" || q.kind === "ash" ? 2.5 : q.kind === "glass" ? 1.5 : 5;
      q.vx *= Math.max(0, 1 - dt * drag);
      q.vy *= Math.max(0, 1 - dt * drag);
      if (q.kind === "smoke") q.size += dt * 22;
      if (q.life > 0) {
        alive.push(q);
      } else if (q.kind === "glass") {
        this.stamp.rect(q.x - q.size / 2, q.y - q.size / 3, q.size, q.size * 0.66).fill({ color: q.color, alpha: 0.8 });
        this.stampDirty = true;
      } else if (q.kind === "blood" || q.kind === "chunk") {
        // blood and gore land on the floor for good: the arena gets painted
        this.splat(q.x, q.y, q.kind === "chunk" ? q.size * 1.4 : q.size * 1.2, q.color);
        if (q.kind === "chunk") this.stamp.circle(q.x, q.y, q.size * 0.6).fill(0x4a1c16);
      }
    }
    this.particles = alive;
  }

  private drawParticles(): void {
    const g = this.fxG;
    g.clear();
    for (const q of this.particles) {
      const a = Math.max(0, q.life / q.max);
      switch (q.kind) {
        case "smoke":
          g.circle(q.x, q.y, q.size).fill({ color: q.color, alpha: 0.35 * a });
          break;
        case "mist":
          g.circle(q.x, q.y, q.size).fill({ color: q.color, alpha: 0.5 * a });
          break;
        case "spark":
          g.circle(q.x, q.y, q.size).fill({ color: q.color, alpha: a });
          break;
        case "ash":
          g.rect(q.x, q.y, q.size, q.size * 0.6).fill({ color: q.color, alpha: a });
          break;
        default:
          g.circle(q.x, q.y, q.size * (0.6 + 0.4 * a)).fill(q.color);
      }
    }
  }

}

const CORPSE_COLORS: Partial<Record<string, number>> = {
  halberdier: PAL.guardCoatMid,
  arquebusier: PAL.gunnerCoatMid,
  peasant: 0x3a2e1e,
  torchbearer: 0x30261a,
  witchhunter: 0x141210,
  gravedigger: 0x22221c,
  feral: 0x2a3024,
  cultist: 0x22122c,
  alchemist: 0x2a2016,
  monk: 0x382c22,
  flagellant: 0x5a3a2c,
  inquisitor: 0x320a0a,
  knight: 0x8a8070,
  bellringer: 0x2c221c,
  acolyte: 0x7a6e5e,
  sergeant: 0x451a12,
  dog: 0x3a2e24,
};

function drawBullet(g: Graphics, b: Bullet, time: number): void {
  const { x, y } = b.pos;
  const r = b.radius;
  const sp = Math.hypot(b.vel.x, b.vel.y) || 1;
  const dx = b.vel.x / sp;
  const dy = b.vel.y / sp;
  const mine = b.side === "minion";
  switch (b.look) {
    case "bolt":
      g.moveTo(x - dx * 18, y - dy * 18).lineTo(x + dx * 6, y + dy * 6).stroke({ width: 4, color: PAL.ink, cap: "round" });
      g.moveTo(x - dx * 16, y - dy * 16).lineTo(x + dx * 5, y + dy * 5).stroke({ width: 2, color: mine ? 0xd8c8a0 : 0xf2e2b0, cap: "round" });
      if (!mine) g.circle(x, y, r + 5).fill({ color: PAL.ember, alpha: 0.18 });
      break;
    case "holy":
      g.circle(x, y, r + 7).fill({ color: PAL.holy, alpha: 0.25 });
      g.circle(x, y, r).fill(0xfff8e8).stroke({ width: 2, color: PAL.ink });
      g.moveTo(x - r * 0.6, y).lineTo(x + r * 0.6, y).stroke({ width: 2, color: 0xd8b04a });
      g.moveTo(x, y - r * 0.6).lineTo(x, y + r * 0.6).stroke({ width: 2, color: 0xd8b04a });
      break;
    case "orb":
      g.circle(x, y, r + 8).fill({ color: 0xc88aff, alpha: 0.22 });
      g.circle(x, y, r).fill(0x9a5ac8).stroke({ width: 2, color: PAL.ink });
      g.circle(x - r * 0.3, y - r * 0.3, r * 0.35).fill(0xf0d8ff);
      break;
    case "ember":
    case "fireball":
      g.circle(x, y, r + 6).fill({ color: PAL.ember, alpha: 0.25 });
      g.circle(x, y, r).fill(mine ? PAL.ember : 0xffb060).stroke({ width: 2, color: PAL.ink });
      g.circle(x, y, r * 0.45).fill(0xfff0c0);
      break;
    case "tooth":
    case "bone":
      g.moveTo(x - dx * 8, y - dy * 8).lineTo(x + dx * 6, y + dy * 6).stroke({ width: r + 3, color: PAL.ink, cap: "round" });
      g.moveTo(x - dx * 7, y - dy * 7).lineTo(x + dx * 5, y + dy * 5).stroke({ width: r, color: 0xe8e0d0, cap: "round" });
      break;
    case "shard":
      g.poly([x + dx * r, y + dy * r, x - dy * r * 0.6, y + dx * r * 0.6, x - dx * r, y - dy * r, x + dy * r * 0.6, y - dx * r * 0.6]).fill(0x9a968c).stroke({ width: 2, color: PAL.ink });
      break;
    case "wave":
      g.circle(x, y, r).fill({ color: 0xcfc4a8, alpha: 0.35 });
      break;
    case "ash":
      g.circle(x, y, r + 5).fill({ color: PAL.ember, alpha: 0.2 });
      g.circle(x, y, r).fill(0x3a2418).stroke({ width: 2, color: PAL.ember });
      break;
    case "pellet":
      g.circle(x, y, r).fill(PAL.playerBullet).stroke({ width: 1.5, color: PAL.ink });
      break;
    case "rosette":
    case "cross":
      g.circle(x, y, r + 6).fill({ color: 0xd8b04a, alpha: 0.22 });
      g.circle(x, y, r).fill(0xf4e2a8).stroke({ width: 2, color: PAL.ink });
      break;
    default:
      if (mine) {
        const tail = { x: x - b.vel.x * 0.02, y: y - b.vel.y * 0.02 };
        g.moveTo(tail.x, tail.y).lineTo(x, y).stroke({ width: 5, color: PAL.ember, alpha: 0.6, cap: "round" });
        g.circle(x, y, r).fill(b.holy ? 0xfff8e8 : PAL.playerBullet).stroke({ width: 2, color: PAL.ink });
      } else {
        g.circle(x, y, r + 6).fill({ color: PAL.ember, alpha: 0.18 + 0.05 * Math.sin(time * 20) });
        g.circle(x, y, r).fill(PAL.enemyBullet).stroke({ width: 3, color: PAL.ink });
      }
  }
}

// ------------------------------------------------------------------ helpers
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function clampCam(c: number, worldSize: number, view: number): number {
  if (worldSize <= view) return worldSize / 2;
  return Math.max(view / 2, Math.min(worldSize - view / 2, c));
}

/** A radial darkening around the screen edges, drawn once on a canvas. */
function makeVignette(): Texture {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 270;
  const ctx = c.getContext("2d");
  if (ctx) {
    const grd = ctx.createRadialGradient(240, 125, 60, 240, 135, 300);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.6, "rgba(0,0,0,0.22)");
    grd.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 480, 270);
  }
  return Texture.from(c);
}
