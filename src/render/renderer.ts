/**
 * PixiJS v8 view of the World. Everything is a stylised placeholder in the game palette:
 * thick ink outlines, flat tones, ember accents. Blood and corpses are baked into a
 * RenderTexture so the arena slowly turns into a slaughterhouse during the fight.
 */
import { Container, Graphics, RenderTexture, Sprite, Text, Texture, type Renderer } from "pixi.js";
import { CONFIG } from "../game/config.js";
import type { Corpse, Cover, Door, GameEvent, Soul, Unit, World } from "../game/world.js";
import type { Floor } from "../game/floor.js";
import type { Vec } from "../game/math.js";
import { PAL } from "../palette.js";

export const VIEW_W = 1920;
export const VIEW_H = 1080;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  kind: "smoke" | "blood" | "spark" | "chunk" | "mist" | "splinter";
}

const OUT = 5; // ink outline width

export class GameRenderer {
  readonly root = new Container(); // screen space, scaled to fit the window
  private camLayer = new Container(); // world space
  private floor = new Graphics();
  private decals: RenderTexture;
  private decalSprite: Sprite;
  private stamp = new Graphics(); // drawn into the decal texture, then cleared
  private stampDirty = false;
  private coversG = new Graphics();
  private corpsesG = new Graphics();
  private soulsG = new Graphics();
  private hintText: Text;
  /** Darkness: a half-resolution 2D canvas with hard pools of light cut out of it. */
  private darkCanvas: HTMLCanvasElement;
  private darkTex: Texture;
  private darkSprite: Sprite;
  /** Above the darkness: things that glow (eyes, flames, souls, bullets, sparks). */
  private glowLayer = new Container();
  private glowG = new Graphics();
  private floaters: { text: Text; life: number; vy: number }[] = [];
  /** Every room keeps its own blood-soaked floor. */
  private decalTextures = new Map<number, RenderTexture>();
  private actorsG = new Graphics();
  private bulletsG = new Graphics();
  private fxG = new Graphics();
  private hudG = new Graphics();
  private hudText: Text;
  private bannerText: Text;
  private bossText: Text;
  private vignette: Sprite;

  private particles: Particle[] = [];
  private shake = 0;
  private cam: Vec = { x: 0, y: 0 };
  private viewScale = 1;
  private viewOffset: Vec = { x: 0, y: 0 };
  private telegraphs = new Map<number, number>(); // enemy id -> seconds of red warning
  private failText = "";
  private failTime = 0;

  constructor(private renderer: Renderer) {
    const { width, height } = CONFIG.room;
    this.decals = RenderTexture.create({ width, height });
    this.decalTextures.set(-1, this.decals);
    this.decalSprite = new Sprite(this.decals);
    this.drawFloor([]);
    this.camLayer.addChild(this.floor, this.decalSprite, this.corpsesG, this.coversG, this.actorsG);
    this.glowLayer.addChild(this.glowG, this.soulsG, this.bulletsG, this.fxG);

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

    const style = { fontFamily: "Georgia, 'Times New Roman', serif", fill: PAL.hudText };
    this.hudText = new Text({ text: "", style: { ...style, fontSize: 26 } });
    this.hudText.position.set(40, 96);
    this.hintText = new Text({ text: "", style: { ...style, fontSize: 22, fill: PAL.ember } });
    this.hintText.anchor.set(0.5);
    this.glowLayer.addChild(this.hintText);
    this.bannerText = new Text({ text: "", style: { ...style, fontSize: 56, align: "center" } });
    this.bannerText.anchor.set(0.5);
    this.bannerText.position.set(VIEW_W / 2, VIEW_H * 0.42);

    this.bossText = new Text({ text: "", style: { ...style, fontSize: 26 } });
    this.bossText.anchor.set(0.5);
    this.root.addChild(this.camLayer, this.darkSprite, this.glowLayer, this.vignette, this.hudG, this.hudText, this.bannerText, this.bossText);
  }

  /** Forget every room (a new floor / a new run). */
  reset(): void {
    this.particles = [];
    for (const f of this.floaters) f.text.destroy();
    this.floaters = [];
    this.telegraphs.clear();
    this.shake = 0;
    const clear = new Graphics().rect(0, 0, 1, 1).fill({ color: 0, alpha: 0 });
    for (const rt of this.decalTextures.values()) this.renderer.render({ container: clear, target: rt, clear: true });
    clear.destroy();
  }

  /** Switch to another room: its own blood texture, its doorways, the camera snaps to the player. */
  setRoom(id: number, world: World): void {
    let rt = this.decalTextures.get(id);
    if (!rt) {
      rt = RenderTexture.create({ width: CONFIG.room.width, height: CONFIG.room.height });
      this.decalTextures.set(id, rt);
    }
    this.flushStamps(); // finish the old room's blood first
    this.decals = rt;
    this.decalSprite.texture = rt;
    this.drawFloor(world.doors);
    this.particles = [];
    this.cam = { ...world.player.pos };
  }

  /** A line of text over the necromancer (room names, "room cleared"). */
  announce(world: World, text: string, color: number = PAL.hudText): void {
    this.floatText({ x: world.player.pos.x, y: world.player.pos.y - 40 }, text, color, 32);
  }

  /** Fit the 1920x1080 virtual view into the window (letterboxed). */
  resize(screenW: number, screenH: number): void {
    this.viewScale = Math.min(screenW / VIEW_W, screenH / VIEW_H);
    this.viewOffset = { x: (screenW - VIEW_W * this.viewScale) / 2, y: (screenH - VIEW_H * this.viewScale) / 2 };
    this.root.scale.set(this.viewScale);
    this.root.position.set(this.viewOffset.x, this.viewOffset.y);
  }

  /** Screen (canvas) pixels → world coordinates. */
  screenToWorld(s: Vec): Vec {
    const vx = (s.x - this.viewOffset.x) / this.viewScale;
    const vy = (s.y - this.viewOffset.y) / this.viewScale;
    return { x: vx - this.camLayer.position.x, y: vy - this.camLayer.position.y };
  }

  /** A short line of text rising from a point in the world ("ZASADZKA!", "ALARM!"). */
  private floatText(pos: Vec, text: string, color: number, size = 30): void {
    const t = new Text({ text, style: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: size, fill: color, fontWeight: "bold" } });
    t.anchor.set(0.5);
    t.position.set(pos.x, pos.y - 70);
    this.glowLayer.addChild(t);
    this.floaters.push({ text: t, life: 1.1, vy: -40 });
  }

  private updateFloaters(dt: number): void {
    for (const f of this.floaters) {
      f.life -= dt;
      f.text.position.y += f.vy * dt;
      f.text.alpha = Math.max(0, Math.min(1, f.life / 0.4));
      if (f.life <= 0) f.text.destroy();
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  // ---------------------------------------------------------------- events → effects
  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "shot":
          this.puff(e.pos, e.dir, e.from === "player" ? 9 : 6);
          this.addShake(e.from === "player" ? 7 : 3);
          break;
        case "enemyHit":
          this.spray(e.pos, e.dir, 14, 1);
          this.addShake(5);
          if (e.ambush) this.floatText(e.pos, "ZASADZKA!", PAL.ember);
          break;
        case "enemyDeath":
          this.spray(e.pos, e.dir, 40, 1.6);
          this.chunks(e.pos, e.dir, 7);
          this.bloodPool(e.pos, e.dir);
          this.addShake(12);
          if (e.ambush) this.floatText(e.pos, "ZASADZKA!", PAL.ember);
          break;
        case "alarm":
          this.floatText(e.pos, "ALARM!", PAL.telegraph, 34);
          this.addShake(10);
          break;
        case "candleOut":
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-30, 30), rnd(-90, -30), rnd(0.6, 1.2), rnd(4, 9), PAL.smoke, "smoke");
          for (let i = 0; i < 6; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-120, 40), rnd(0.15, 0.35), rnd(1.5, 3), PAL.emberHot, "spark");
          break;
        case "burn":
          for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-50, 50), rnd(-140, -40), rnd(0.5, 1), rnd(6, 12), PAL.smoke, "smoke");
          for (let i = 0; i < 8; i++) this.spawn(e.pos, rnd(-80, 80), rnd(-160, -40), rnd(0.2, 0.5), rnd(1.5, 3), PAL.ember, "spark");
          this.floatText(e.pos, "Światło parzy", PAL.ember, 24);
          this.addShake(6);
          break;
        case "minionHit":
          for (let i = 0; i < 8; i++) this.spawn(e.pos, e.dir.x * rnd(80, 260) + rnd(-80, 80), e.dir.y * rnd(80, 260) + rnd(-80, 80), rnd(0.2, 0.5), rnd(2, 5), PAL.minion, "chunk");
          this.addShake(3);
          break;
        case "minionDeath":
          // the dead fall apart into ash and bone dust
          for (let i = 0; i < 18; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-200, 40), rnd(0.4, 0.9), rnd(6, 14), PAL.smoke, "smoke");
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-140, 140), rnd(-140, 140), rnd(0.3, 0.7), rnd(2, 4), PAL.soul, "spark");
          this.addShake(4);
          break;
        case "soulPickup":
          for (let i = 0; i < 16; i++) this.spawn(e.pos, rnd(-180, 180), rnd(-180, 180), rnd(0.2, 0.5), rnd(1.5, 3.5), PAL.soul, "spark");
          break;
        case "raise":
          // the corpse stands up in a burst of black mist and embers
          for (let i = 0; i < 24; i++) this.spawn(e.pos, rnd(-90, 90), rnd(-160, 20), rnd(0.4, 0.9), rnd(10, 24), PAL.ink, "mist");
          for (let i = 0; i < 20; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-260, -40), rnd(0.3, 0.8), rnd(1.5, 3.5), PAL.ember, "spark");
          this.addShake(8);
          break;
        case "raiseFail":
          for (let i = 0; i < 6; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-90, -20), rnd(0.2, 0.4), rnd(6, 10), PAL.smoke, "smoke");
          this.failText = e.reason === "noSouls" ? "Brak dusz" : "Limit sług";
          this.failTime = 1.2;
          break;
        case "command":
          for (let i = 0; i < 12; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-120, 120), rnd(0.3, 0.6), rnd(1.5, 3), PAL.ember, "spark");
          break;
        case "playerHit":
          this.spray(e.pos, e.dir, 10, 0.8);
          this.addShake(14);
          break;
        case "playerDeath":
          this.spray(e.pos, { x: 0, y: -1 }, 30, 1.2);
          this.addShake(20);
          break;
        case "dodge":
          for (let i = 0; i < 14; i++) this.spawn(e.pos, rnd(-60, 60), rnd(-60, 60), rnd(0.3, 0.6), rnd(10, 22), PAL.ink, "mist");
          break;
        case "coverFlip":
          for (let i = 0; i < 10; i++) this.spawn(e.pos, rnd(-120, 120), rnd(-120, 120), rnd(0.3, 0.6), rnd(6, 14), PAL.smoke, "smoke");
          this.addShake(6);
          break;
        case "coverHit":
          for (let i = 0; i < 4; i++) this.spawn(e.pos, rnd(-160, 160), rnd(-160, 160), rnd(0.2, 0.4), rnd(2, 5), PAL.woodHi, "splinter");
          break;
        case "coverBreak":
          for (let i = 0; i < 22; i++) this.spawn(e.pos, rnd(-260, 260), rnd(-260, 260), rnd(0.4, 0.9), rnd(4, 10), PAL.wood, "splinter");
          this.addShake(9);
          break;
        case "bulletWall":
          for (let i = 0; i < 5; i++) this.spawn(e.pos, rnd(-140, 140), rnd(-140, 140), rnd(0.1, 0.3), rnd(1.5, 3), PAL.emberHot, "spark");
          break;
        case "telegraph":
          this.telegraphs.set(e.enemy, 0.7);
          break;
        case "doorsShut":
          this.addShake(8);
          break;
        case "shrine":
          for (let i = 0; i < 26; i++) this.spawn(e.pos, rnd(-200, 200), rnd(-260, 40), rnd(0.4, 1), rnd(1.5, 3.5), PAL.soul, "spark");
          this.floatText(e.pos, e.halves > 0 ? "+2 dusze, rany zasklepione" : "+2 dusze", PAL.soul, 26);
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  draw(world: World, dt: number, aim: Vec, started = true, floor?: Floor): void {
    this.updateParticles(dt);
    for (const [id, t] of this.telegraphs) {
      if (t - dt <= 0) this.telegraphs.delete(id);
      else this.telegraphs.set(id, t - dt);
    }

    // camera follows the player, leaning a little towards the aim point
    const p = world.player;
    const target = { x: p.pos.x + (aim.x - p.pos.x) * 0.18, y: p.pos.y + (aim.y - p.pos.y) * 0.18 };
    this.cam.x += (target.x - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (target.y - this.cam.y) * Math.min(1, dt * 8);
    const { width, height } = CONFIG.room;
    const cx = clampCam(this.cam.x, width, VIEW_W);
    const cy = clampCam(this.cam.y, height, VIEW_H);
    this.shake = Math.max(0, this.shake - dt * 60);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.camLayer.position.set(Math.round(VIEW_W / 2 - cx + sx), Math.round(VIEW_H / 2 - cy + sy));
    this.glowLayer.position.set(this.camLayer.position.x, this.camLayer.position.y);
    this.updateFloaters(dt);

    this.flushStamps();
    this.glowG.clear(); // everything that glows is redrawn this frame
    this.drawCovers(world.covers, world);
    this.drawCorpses(world);
    this.drawActors(world);
    this.drawSouls(world.souls, world.time);
    this.drawOrder(world);
    this.drawBullets(world);
    this.drawParticles();
    this.drawLights(world);
    this.drawDarkness(world);
    this.drawHud(world, started, floor);
  }

  // ---------------------------------------------------------------- floor and decals
  private drawFloor(doors: Door[]): void {
    const g = this.floor;
    g.clear();
    const { width: W, height: H, wall } = CONFIG.room;
    g.rect(0, 0, W, H).fill(PAL.floor[0]);
    // flagstones in staggered rows
    const th = 64;
    let row = 0;
    for (let y = 0; y < H; y += th, row++) {
      const off = (row % 2) * 48;
      for (let x = -off; x < W; x += 96) {
        const c = PAL.floor[(Math.abs(Math.floor(x * 7 + y * 13)) >> 4) % PAL.floor.length];
        g.rect(x + 2, y + 2, 92, th - 4).fill(c);
      }
    }
    for (let y = 0; y < H; y += th) g.rect(0, y, W, 3).fill(PAL.floorLine);
    // walls with a lighter top edge
    g.rect(0, 0, W, wall).fill(PAL.wall);
    g.rect(0, H - wall, W, wall).fill(PAL.wall);
    g.rect(0, 0, wall, H).fill(PAL.wall);
    g.rect(W - wall, 0, wall, H).fill(PAL.wall);
    g.rect(wall, wall - 10, W - wall * 2, 10).fill(PAL.wallTop);
    g.rect(wall - 4, wall - 4, W - wall * 2 + 8, H - wall * 2 + 8).stroke({ width: 8, color: PAL.ink });
    // doorways: a dark gap in the wall with stone jambs
    const half = CONFIG.room.door / 2;
    for (const d of doors) {
      const r =
        d.side === "N" ? { x: W / 2 - half, y: 0, w: half * 2, h: wall + 4 }
        : d.side === "S" ? { x: W / 2 - half, y: H - wall - 4, w: half * 2, h: wall + 4 }
        : d.side === "W" ? { x: 0, y: H / 2 - half, w: wall + 4, h: half * 2 }
        : { x: W - wall - 4, y: H / 2 - half, w: wall + 4, h: half * 2 };
      g.rect(r.x, r.y, r.w, r.h).fill(0x070505);
      const horizontal = d.side === "N" || d.side === "S";
      if (horizontal) {
        g.rect(r.x - 14, r.y, 14, r.h).fill(PAL.wallTop).stroke({ width: 4, color: PAL.ink });
        g.rect(r.x + r.w, r.y, 14, r.h).fill(PAL.wallTop).stroke({ width: 4, color: PAL.ink });
      } else {
        g.rect(r.x, r.y - 14, r.w, 14).fill(PAL.wallTop).stroke({ width: 4, color: PAL.ink });
        g.rect(r.x, r.y + r.h, r.w, 14).fill(PAL.wallTop).stroke({ width: 4, color: PAL.ink });
      }
    }
  }

  /** Bake this frame's blood and corpses into the floor texture. */
  private flushStamps(): void {
    if (!this.stampDirty) return;
    this.renderer.render({ container: this.stamp, target: this.decals, clear: false });
    this.stamp.clear();
    this.stampDirty = false;
  }

  private markStamp(): void {
    this.stampDirty = true;
  }

  private splat(x: number, y: number, r: number, color: number): void {
    const s = this.stamp;
    s.ellipse(x, y, r, r * 0.6).fill({ color, alpha: 0.9 });
    for (let i = 0; i < 4; i++) {
      s.circle(x + rnd(-r * 1.4, r * 1.4), y + rnd(-r * 0.9, r * 0.9), rnd(r * 0.15, r * 0.4)).fill({ color, alpha: 0.85 });
    }
    this.markStamp();
  }

  /** The pool under a fresh corpse stays on the floor even after the body gets up. */
  private bloodPool(pos: Vec, dir: Vec): void {
    this.splat(pos.x + dir.x * 10, pos.y + 8, 46, PAL.bloodDark);
    this.splat(pos.x + dir.x * 40, pos.y + dir.y * 30, 28, PAL.blood);
  }

  /** Bodies on the floor. Fresh ones (still raisable) breathe a faint ember glow. */
  private drawCorpses(world: World): void {
    const g = this.corpsesG;
    g.clear();
    const best = world.raisableCorpse();
    for (const c of world.corpses) this.drawCorpse(g, c, c === best, world.time);
    if (best && world.player.alive) {
      this.hintText.text = `[E] wskrześ (${world.player.souls} ${soulsWord(world.player.souls)})`;
      this.hintText.position.set(best.pos.x, best.pos.y - 46);
    } else {
      this.hintText.text = "";
    }
  }

  private drawCorpse(g: Graphics, c: Corpse, selected: boolean, time: number): void {
    const side = Math.sign(c.dir.x || 1);
    const x = c.pos.x + c.dir.x * 18;
    const y = c.pos.y + 10;
    const coat = c.fromMinion ? PAL.minionMid : c.kind === "halberdier" ? PAL.guardCoatMid : PAL.gunnerCoatMid;
    if (c.echo > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6 + c.id);
      const a = (selected ? 0.45 : 0.18) * (0.6 + 0.4 * pulse) * Math.min(1, c.echo / 1.5);
      g.ellipse(x, y, 44, 24).fill({ color: PAL.ember, alpha: a });
    }
    g.ellipse(x, y, 32, 15).fill(PAL.ink);
    g.ellipse(x - 3 * side, y - 2, 25, 10).fill(coat);
    g.circle(x + 24 * side, y - 3, 9).fill(PAL.ink);
    g.circle(x + 24 * side, y - 4, 6).fill(c.fromMinion ? PAL.minion : 0x6e5a48);
    // limp arm and the dropped weapon
    g.moveTo(x - 6 * side, y + 6).lineTo(x - 30 * side, y + 14).stroke({ width: 4, color: PAL.ink, cap: "round" });
    if (selected) g.ellipse(x, y, 40, 20).stroke({ width: 2, color: PAL.ember, alpha: 0.8 });
  }

  /** Souls hover over fresh corpses: a pale flame the player must walk through. */
  private drawSouls(souls: Soul[], time: number): void {
    const g = this.soulsG;
    g.clear();
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

  // ---------------------------------------------------------------- actors
  private drawCovers(covers: Cover[], world?: World): void {
    const g = this.coversG;
    g.clear();
    if (world) {
      // shut doors: an iron portcullis drops across the doorway
      if (!world.doorsOpen) {
        const { width: W, height: H, wall } = CONFIG.room;
        const half = CONFIG.room.door / 2;
        for (const d of world.doors) {
          const horizontal = d.side === "N" || d.side === "S";
          const base = d.side === "N" ? wall / 2 : d.side === "S" ? H - wall / 2 : d.side === "W" ? wall / 2 : W - wall / 2;
          for (let i = -half + 12; i <= half - 12; i += 22) {
            if (horizontal) g.rect(W / 2 + i - 4, base - wall / 2, 8, wall).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
            else g.rect(base - wall / 2, H / 2 + i - 4, wall, 8).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
          }
        }
      }
      // the bone altar
      const sh = world.shrine;
      if (sh) {
        g.ellipse(sh.pos.x, sh.pos.y + 30, 70, 18).fill({ color: PAL.ink, alpha: 0.6 });
        g.rect(sh.pos.x - 60, sh.pos.y - 10, 120, 40).fill(0x4a4038).stroke({ width: 5, color: PAL.ink });
        for (let i = -2; i <= 2; i++) {
          g.circle(sh.pos.x + i * 22, sh.pos.y - 18, 10).fill(sh.used ? 0x6e665a : 0xcfc4a8).stroke({ width: 3, color: PAL.ink });
        }
        if (!sh.used) {
          this.glowG.circle(sh.pos.x, sh.pos.y - 20, 50).fill({ color: PAL.soul, alpha: 0.12 + 0.06 * Math.sin(world.time * 3) });
        }
      }
    }
    for (const l of world?.lights ?? []) {
      if (l.kind !== "candle") continue;
      g.ellipse(l.pos.x, l.pos.y + 22, 18, 6).fill({ color: PAL.ink, alpha: 0.6 });
      g.rect(l.pos.x - 10, l.pos.y + 14, 20, 8).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
      g.rect(l.pos.x - 4, l.pos.y - 6, 8, 22).fill(0xe8dcc0).stroke({ width: 3, color: PAL.ink });
    }
    for (const c of covers) {
      if (c.broken) continue;
      if (!c.flipped) {
        // a pew seen from above: planks
        g.rect(c.x, c.y, c.w, c.h).fill(PAL.wood).stroke({ width: OUT, color: PAL.ink });
        const horizontal = c.w > c.h;
        for (let i = 1; i < 3; i++) {
          if (horizontal) g.rect(c.x + 4, c.y + (c.h * i) / 3 - 1, c.w - 8, 2).fill(PAL.woodMid);
          else g.rect(c.x + (c.w * i) / 3 - 1, c.y + 4, 2, c.h - 8).fill(PAL.woodMid);
        }
        g.rect(c.x + 4, c.y + 4, horizontal ? c.w - 8 : 4, horizontal ? 4 : c.h - 8).fill(PAL.woodHi);
      } else {
        // toppled: the seat faces us as a wall, cracks grow as it takes hits
        const lift = 26;
        g.rect(c.x, c.y - lift, c.w, c.h + lift).fill(PAL.woodMid).stroke({ width: OUT, color: PAL.ink });
        g.rect(c.x + 4, c.y - lift + 4, c.w - 8, 8).fill(PAL.woodHi);
        g.rect(c.x, c.y + c.h - 8, c.w, 8).fill(PAL.ink);
        const damage = 1 - c.hp / CONFIG.cover.hp;
        const cracks = Math.floor(damage * 6);
        for (let i = 0; i < cracks; i++) {
          const cx = c.x + ((i * 37) % Math.max(1, c.w - 16)) + 8;
          g.moveTo(cx, c.y - lift + 10).lineTo(cx + 6, c.y).lineTo(cx - 3, c.y + c.h - 10).stroke({ width: 2, color: PAL.ink });
        }
      }
    }
  }

  /** Candle flames and lanterns glow above the darkness. */
  private drawLights(world: World): void {
    const g = this.glowG;
    for (const l of world.lights) {
      if (l.kind === "flash") continue;
      const flick = Math.sin(world.time * 13 + l.id * 3) * 1.5;
      if (l.kind === "candle") {
        if (!l.on) continue;
        g.circle(l.pos.x, l.pos.y - 12, 14).fill({ color: PAL.ember, alpha: 0.25 });
        g.poly([l.pos.x - 4, l.pos.y - 8, l.pos.x, l.pos.y - 22 - flick, l.pos.x + 4, l.pos.y - 8]).fill(PAL.emberHot);
      } else {
        g.circle(l.pos.x, l.pos.y, 16).fill({ color: PAL.ember, alpha: 0.3 });
        g.rect(l.pos.x - 6, l.pos.y - 9, 12, 16).fill(PAL.emberHot).stroke({ width: 3, color: PAL.ink });
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
    ctx.fillStyle = "rgba(6, 4, 3, 0.92)";
    ctx.fillRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    ctx.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number, a: number) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.arc((x + ox) * k, (y + oy) * k, r * k, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const l of world.lights) {
      if (!l.on) continue;
      const flick = l.kind === "candle" ? 1 + Math.sin(world.time * 9 + l.id) * 0.02 : 1;
      hole(l.pos.x, l.pos.y, l.radius * flick, 0.55); // outer band
      hole(l.pos.x, l.pos.y, l.radius * 0.6 * flick, 1); // hard bright core
    }
    // the necromancer can always make out his own silhouette, faintly
    if (world.player.alive) hole(world.player.pos.x, world.player.pos.y - 30, 70, 0.4);
    ctx.globalCompositeOperation = "source-over";
    this.darkTex.source.update();
  }

  /** Where the minions were sent with Q. */
  private drawOrder(world: World): void {
    if (!world.order) return;
    const g = this.soulsG; // cleared in drawSouls just before, never by the particle pass
    const { pos, time } = world.order;
    const a = Math.min(1, time) * 0.7;
    g.circle(pos.x, pos.y, 28).stroke({ width: 3, color: PAL.ember, alpha: a });
    g.moveTo(pos.x - 12, pos.y).lineTo(pos.x + 12, pos.y).stroke({ width: 3, color: PAL.ember, alpha: a });
    g.moveTo(pos.x, pos.y - 12).lineTo(pos.x, pos.y + 12).stroke({ width: 3, color: PAL.ember, alpha: a });
  }

  private drawActors(world: World): void {
    const g = this.actorsG;
    g.clear();
    // draw back to front by y so overlaps read correctly in 3/4 view
    const actors: { y: number; draw: () => void }[] = world.units.map((u) => ({ y: u.pos.y, draw: () => this.drawUnit(u, world) }));
    if (world.player.alive) actors.push({ y: world.player.pos.y, draw: () => this.drawPlayer(world) });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
  }

  private drawPlayer(world: World): void {
    const g = this.actorsG;
    const p = world.player;
    const { x, y } = p.pos;
    const face = Math.cos(p.facing) >= 0 ? 1 : -1;
    // ground shadow
    g.ellipse(x, y + 18, 26, 9).fill({ color: PAL.ink, alpha: 0.6 });
    if (p.dodgeLeft > 0) {
      // dissolved into mist: only a dark smear and the eyes
      g.ellipse(x, y - 20, 26, 34).fill({ color: PAL.ink, alpha: 0.55 });
      g.circle(x + face * 6, y - 40, 3).fill(PAL.ember);
      return;
    }
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return; // hit blink

    const top = y - 78; // ~96 px tall sprite
    // bell-shaped shroud: narrow hood, wide cape, robe to the ground
    const body = [
      x - 8 * face, top, x + 14 * face, top + 6, x + 20 * face, top + 26, x + 18 * face, top + 40,
      x + 30 * face, top + 54, x + 26 * face, top + 70, x + 24 * face, top + 92,
      x - 24 * face, top + 92, x - 28 * face, top + 66, x - 32 * face, top + 54,
      x - 18 * face, top + 40, x - 20 * face, top + 22, x - 26 * face, top + 14,
    ];
    g.poly(body).fill(PAL.shroud).stroke({ width: OUT, color: PAL.ink, join: "round" });
    // shadow half (light from the upper left)
    g.poly([x + 4, top + 4, x + 18 * face, top + 24, x + 28 * face, top + 54, x + 24 * face, top + 92, x + 4, top + 92])
      .fill({ color: PAL.ink, alpha: 0.55 });
    // cape hem and belt
    g.moveTo(x - 30 * face, top + 56).lineTo(x + 28 * face, top + 56).stroke({ width: 3, color: PAL.ink });
    g.rect(x - 22, top + 66, 44, 4).fill(PAL.wood);
    // face hole and ember eyes
    g.ellipse(x + 6 * face, top + 22, 10, 12).fill(PAL.ink);
    // the eyes glow through the darkness
    const eg = this.glowG;
    eg.circle(x + 6 * face, top + 21, 10).fill({ color: PAL.ember, alpha: 0.18 });
    eg.circle(x + 3 * face, top + 21, 2.4).fill(PAL.ember);
    eg.circle(x + 11 * face, top + 20, 1.8).fill(PAL.ember);

    // arm + flintlock towards the aim
    const ax = Math.cos(p.facing);
    const ay = Math.sin(p.facing);
    const sx = x + face * 4;
    const sy = top + 46;
    g.moveTo(sx, sy).lineTo(sx + ax * 30, sy + ay * 30).stroke({ width: 9, color: PAL.ink, cap: "round" });
    g.moveTo(sx, sy).lineTo(sx + ax * 28, sy + ay * 28).stroke({ width: 5, color: PAL.shroudMid, cap: "round" });
    g.moveTo(sx + ax * 26, sy + ay * 26).lineTo(sx + ax * 46, sy + ay * 46).stroke({ width: 6, color: PAL.ink, cap: "round" });
    g.moveTo(sx + ax * 26, sy + ay * 26).lineTo(sx + ax * 45, sy + ay * 45).stroke({ width: 3, color: PAL.steel, cap: "round" });

    // reload bar above the hood
    const w = p.weapon;
    if (w.reloadLeft > 0) {
      const t = 1 - w.reloadLeft / CONFIG.flintlock.reload;
      g.rect(x - 26, top - 18, 52, 7).fill(PAL.ink);
      g.rect(x - 24, top - 16, 48 * t, 3).fill(PAL.hudText);
    }
  }

  private drawUnit(e: Unit, world: World): void {
    const g = this.actorsG;
    const { x, y } = e.pos;
    const minion = e.team === "minion";
    const face = minion ? (e.dir.x >= 0 ? 1 : -1) : world.player.pos.x >= x ? 1 : -1;
    const flash = e.flash > 0;
    const coat = flash ? 0xffffff : minion ? PAL.minion : e.kind === "halberdier" ? PAL.guardCoat : PAL.gunnerCoat;
    const coatMid = flash ? 0xffffff : minion ? PAL.minionMid : e.kind === "halberdier" ? PAL.guardCoatMid : PAL.gunnerCoatMid;
    const top = y - 70;
    g.ellipse(x, y + 16, 24, 8).fill({ color: PAL.ink, alpha: 0.6 });
    if (minion) {
      // black mist curling at the feet; it thins out as the body nears its end
      const left = Math.min(1, e.lifetime / 6);
      g.ellipse(x, y + 12, 34, 12).fill({ color: PAL.ink, alpha: 0.35 + 0.25 * left });
      if (e.lifetime < 6 && Math.floor(world.time * 8) % 2 === 0) return; // flickers before crumbling
    }

    // telegraph: a red line along the attack direction (only hostile guards warn the player)
    const warn = this.telegraphs.get(e.id) ?? 0;
    if (!minion && (e.state === "windup" || e.state === "aim" || warn > 0)) {
      const reach = e.kind === "halberdier" ? 260 : 900;
      const a = e.state === "windup" || e.state === "aim" ? 0.55 : 0.25;
      g.moveTo(x, y - 30).lineTo(x + e.dir.x * reach, y - 30 + e.dir.y * reach).stroke({ width: e.kind === "halberdier" ? 10 : 2, color: PAL.telegraph, alpha: a });
    }

    // body: coat, belt, legs hidden under the coat skirt
    g.poly([x - 18, top + 20, x + 18, top + 20, x + 24, top + 82, x - 24, top + 82]).fill(coat).stroke({ width: OUT, color: PAL.ink, join: "round" });
    g.poly([x + 2 * face, top + 20, x + 18 * face, top + 20, x + 24 * face, top + 82, x + 2 * face, top + 82]).fill({ color: coatMid, alpha: 0.9 });
    g.rect(x - 20, top + 50, 40, 5).fill(PAL.ink);
    // head: morion helmet (halberdier) or wide hat (arquebusier)
    g.circle(x + 2 * face, top + 12, 11).fill(flash ? 0xffffff : minion ? PAL.minion : 0x8a6e58).stroke({ width: 4, color: PAL.ink });
    if (minion) {
      const eg = this.glowG;
      eg.circle(x + 6 * face, top + 12, 8).fill({ color: PAL.ember, alpha: 0.22 });
      eg.circle(x + 3 * face, top + 11, 2).fill(PAL.ember);
      eg.circle(x + 9 * face, top + 11, 1.6).fill(PAL.ember);
    }
    if (e.kind === "halberdier") {
      g.poly([x - 18, top + 6, x - 8, top - 6, x + 10, top - 8, x + 20, top + 4, x + 2, top + 2]).fill(PAL.steel).stroke({ width: 4, color: PAL.ink });
      if (e.elite) {
        // the Captain of the Guard: a crimson crest and a gilded gorget
        g.poly([x - 2, top - 6, x + 6, top - 34, x + 14, top - 30, x + 8, top - 6]).fill(PAL.heart).stroke({ width: 3, color: PAL.ink });
        g.rect(x - 16, top + 22, 32, 8).fill(0xa8823e).stroke({ width: 3, color: PAL.ink });
      }
      // halberd: pole and blade along e.dir (raised during the wind-up)
      const raise = e.state === "windup" ? -40 : 0;
      const hx = x + e.dir.x * 18;
      const hy = top + 40 + e.dir.y * 18 + raise * 0.3;
      const tx = hx + e.dir.x * 70;
      const ty = hy + e.dir.y * 70 + raise;
      g.moveTo(hx - e.dir.x * 30, hy - e.dir.y * 30).lineTo(tx, ty).stroke({ width: 8, color: PAL.ink, cap: "round" });
      g.moveTo(hx - e.dir.x * 30, hy - e.dir.y * 30).lineTo(tx, ty).stroke({ width: 4, color: PAL.wood, cap: "round" });
      g.poly([tx, ty, tx - e.dir.y * 14, ty + e.dir.x * 14, tx + e.dir.x * 16, ty + e.dir.y * 16]).fill(PAL.steel).stroke({ width: 3, color: PAL.ink });
      if (e.state === "charge") {
        for (let i = 1; i <= 3; i++) {
          g.moveTo(x - e.dir.x * 20 * i, top + 40 - e.dir.y * 20 * i).lineTo(x - e.dir.x * 20 * (i + 1), top + 40 - e.dir.y * 20 * (i + 1)).stroke({ width: 3, color: PAL.ink, alpha: 0.5 / i });
        }
      }
    } else {
      g.ellipse(x + 2 * face, top + 2, 20, 6).fill(0x2a2420).stroke({ width: 4, color: PAL.ink });
      g.rect(x - 7 + 2 * face, top - 10, 18, 12).fill(0x2a2420).stroke({ width: 3, color: PAL.ink });
      // long arquebus pointing where it aims
      const gx = x + face * 6;
      const gy = top + 38;
      g.moveTo(gx, gy).lineTo(gx + e.dir.x * 62, gy + e.dir.y * 62).stroke({ width: 7, color: PAL.ink, cap: "round" });
      g.moveTo(gx, gy).lineTo(gx + e.dir.x * 60, gy + e.dir.y * 60).stroke({ width: 3, color: PAL.steel, cap: "round" });
      if (e.state === "aim") g.circle(gx + e.dir.x * 62, gy + e.dir.y * 62, 4 + 4 * (1 - e.timer / CONFIG.arquebusier.aim)).fill({ color: PAL.ember, alpha: 0.8 });
    }
  }

  private drawBullets(world: World): void {
    const g = this.bulletsG;
    g.clear();
    for (const b of world.bullets) {
      if (b.from === "player") {
        const t = { x: b.pos.x - b.vel.x * 0.02, y: b.pos.y - b.vel.y * 0.02 };
        g.moveTo(t.x, t.y).lineTo(b.pos.x, b.pos.y).stroke({ width: 5, color: PAL.ember, alpha: 0.6, cap: "round" });
        g.circle(b.pos.x, b.pos.y, b.radius).fill(PAL.playerBullet).stroke({ width: 2, color: PAL.ink });
      } else {
        g.circle(b.pos.x, b.pos.y, b.radius + 6).fill({ color: PAL.ember, alpha: 0.18 });
        g.circle(b.pos.x, b.pos.y, b.radius).fill(PAL.enemyBullet).stroke({ width: 3, color: PAL.ink });
      }
    }
  }

  // ---------------------------------------------------------------- particles
  private spawn(p: Vec, vx: number, vy: number, life: number, size: number, color: number, kind: Particle["kind"]): void {
    this.particles.push({ x: p.x, y: p.y, vx, vy, life, max: life, size, color, kind });
  }

  private puff(pos: Vec, dir: Vec, n: number): void {
    for (let i = 0; i < n; i++) {
      this.spawn(pos, dir.x * rnd(40, 160) + rnd(-40, 40), dir.y * rnd(40, 160) + rnd(-40, 40) - 20, rnd(0.5, 1.1), rnd(8, 18), PAL.smoke, "smoke");
    }
    for (let i = 0; i < 6; i++) this.spawn(pos, dir.x * rnd(200, 500) + rnd(-80, 80), dir.y * rnd(200, 500) + rnd(-80, 80), rnd(0.08, 0.2), rnd(2, 4), PAL.emberHot, "spark");
  }

  private spray(pos: Vec, dir: Vec, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const sp = rnd(120, 520) * power;
      this.spawn(pos, dir.x * sp + rnd(-160, 160) * power, dir.y * sp + rnd(-160, 160) * power, rnd(0.2, 0.55), rnd(3, 8), Math.random() < 0.5 ? PAL.blood : PAL.bloodDark, "blood");
    }
  }

  private chunks(pos: Vec, dir: Vec, n: number): void {
    for (let i = 0; i < n; i++) {
      this.spawn(pos, dir.x * rnd(150, 420) + rnd(-200, 200), dir.y * rnd(150, 420) + rnd(-200, 200), rnd(0.35, 0.7), rnd(5, 10), 0x6e2a22, "chunk");
    }
  }

  private updateParticles(dt: number): void {
    const alive: Particle[] = [];
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      const drag = q.kind === "smoke" || q.kind === "mist" ? 2.5 : 5;
      q.vx *= Math.max(0, 1 - dt * drag);
      q.vy *= Math.max(0, 1 - dt * drag);
      if (q.kind === "smoke") q.size += dt * 22;
      if (q.life > 0) {
        alive.push(q);
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
        default:
          g.circle(q.x, q.y, q.size * (0.6 + 0.4 * a)).fill(q.color);
      }
    }
  }

  // ---------------------------------------------------------------- HUD
  private drawHud(world: World, started: boolean, floor?: Floor): void {
    const g = this.hudG;
    g.clear();
    if (floor) this.drawMinimap(g, floor);
    // boss health bar
    const elite = world.units.find((u) => u.elite && u.team === "enemy");
    if (elite) {
      const bw = 720;
      const bx = (VIEW_W - bw) / 2;
      const by = VIEW_H - 70;
      g.rect(bx - 4, by - 4, bw + 8, 22).fill(PAL.ink);
      g.rect(bx, by, bw * Math.max(0, elite.hp / elite.maxHp), 14).fill(PAL.heart);
      this.bossText.text = "Kapitan Straży Miejskiej";
      this.bossText.position.set(VIEW_W / 2, by - 24);
    } else {
      this.bossText.text = "";
    }
    this.failTime = Math.max(0, this.failTime - 1 / 60);
    const p = world.player;
    // hearts, two halves each
    for (let i = 0; i < CONFIG.player.maxHalves / 2; i++) {
      const hx = 48 + i * 52;
      const hy = 52;
      const left = p.halves >= i * 2 + 1;
      const right = p.halves >= i * 2 + 2;
      heart(g, hx, hy, PAL.heartEmpty);
      if (left) halfHeart(g, hx, hy, PAL.heart, -1);
      if (right) halfHeart(g, hx, hy, PAL.heart, 1);
      heartOutline(g, hx, hy);
    }
    const w = p.weapon;
    const status = w.reloadLeft > 0 ? "ładuje…" : `${w.loaded}/${w.capacity}`;
    const minions = world.minions.length;
    let stealth = "";
    if (world.dark && p.alive) {
      const lit = world.isLit(p.pos, false);
      const seen = world.alarm ? "wykryty" : "ukryty";
      const burning = world.exposure > CONFIG.darkness.burnDelay * 0.5 ? "  ·  światło parzy!" : "";
      stealth = `\n${lit ? "W ŚWIETLE" : "w mroku"}  ·  ${seen}${burning}`;
    }
    this.hudText.text =
      `${w.name}  ·  ${status}\n` +
      `Dusze: ${p.souls}   Sługi: ${minions}/${CONFIG.necro.minionLimit}   Strażników: ${world.enemies.length}` +
      stealth +
      (this.failTime > 0 ? `\n${this.failText}` : "");

    if (!started) this.bannerText.text = "PROFANUM\nKliknij, aby zacząć";
    else if (!p.alive) this.bannerText.text = "NIE ŻYJESZ\n[Enter] od nowa";
    else if (floor ? floor.cleared : world.cleared) this.bannerText.text = "PIĘTRO OCZYSZCZONE\n[Enter] nowe piętro";
    else this.bannerText.text = "";
  }

  /** Rooms seen so far: visited ones filled, their neighbours as outlines. */
  private drawMinimap(g: Graphics, floor: Floor): void {
    const known = floor.known();
    const cell = 34;
    const gap = 8;
    const xs = floor.rooms.map((r) => r.gx);
    const ys = floor.rooms.map((r) => r.gy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const ox = VIEW_W - 48 - (maxX - minX + 1) * (cell + gap);
    const oy = 40;
    const at = (gx: number, gy: number) => ({ x: ox + (gx - minX) * (cell + gap), y: oy + (gy - minY) * (cell + gap) });
    for (const r of known) {
      const p = at(r.gx, r.gy);
      // corridors to neighbours
      for (const [side, to] of Object.entries(r.doors)) {
        if (to === undefined || !r.visited) continue;
        const cx = p.x + cell / 2;
        const cy = p.y + cell / 2;
        const dx = side === "E" ? 1 : side === "W" ? -1 : 0;
        const dy = side === "S" ? 1 : side === "N" ? -1 : 0;
        g.moveTo(cx + (dx * cell) / 2, cy + (dy * cell) / 2).lineTo(cx + dx * (cell / 2 + gap), cy + dy * (cell / 2 + gap)).stroke({ width: 4, color: PAL.hudDim });
      }
    }
    for (const r of known) {
      const p = at(r.gx, r.gy);
      const cleared = r.world?.cleared && r.world.hadEnemies;
      const fill = r.id === floor.current ? PAL.ember : r.visited ? (cleared ? 0x3a322a : 0x6a5c4c) : PAL.ink;
      g.rect(p.x, p.y, cell, cell).fill({ color: fill, alpha: r.visited ? 0.95 : 0.5 }).stroke({ width: 3, color: r.visited ? PAL.hudText : PAL.hudDim });
      if (r.type === "boss") g.circle(p.x + cell / 2, p.y + cell / 2, 7).fill(PAL.heart).stroke({ width: 2, color: PAL.ink });
      if (r.type === "treasure") g.circle(p.x + cell / 2, p.y + cell / 2, 6).fill(PAL.soul).stroke({ width: 2, color: PAL.ink });
    }
  }

  private addShake(v: number): void {
    this.shake = Math.min(28, this.shake + v);
  }
}

// ------------------------------------------------------------------ helpers
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Polish plural for "dusza" (soul). */
function soulsWord(n: number): string {
  if (n === 1) return "dusza";
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "dusze" : "dusz";
}

function clampCam(c: number, worldSize: number, view: number): number {
  if (worldSize <= view) return worldSize / 2;
  return Math.max(view / 2, Math.min(worldSize - view / 2, c));
}

function heartPoints(x: number, y: number): number[] {
  return [x, y + 16, x - 18, y - 2, x - 18, y - 10, x - 10, y - 16, x, y - 9, x + 10, y - 16, x + 18, y - 10, x + 18, y - 2];
}

function heart(g: Graphics, x: number, y: number, color: number): void {
  g.poly(heartPoints(x, y)).fill(color);
}

function halfHeart(g: Graphics, x: number, y: number, color: number, side: -1 | 1): void {
  const pts = heartPoints(x, y);
  const half: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    half.push(side < 0 ? Math.min(pts[i], x) : Math.max(pts[i], x), pts[i + 1]);
  }
  g.poly(half).fill(color);
}

function heartOutline(g: Graphics, x: number, y: number): void {
  g.poly(heartPoints(x, y)).stroke({ width: 4, color: PAL.ink, join: "round" });
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
    grd.addColorStop(0.6, "rgba(0,0,0,0.25)");
    grd.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 480, 270);
  }
  return Texture.from(c);
}
