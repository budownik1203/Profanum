/**
 * PixiJS v8 view of the World. Everything is a stylised placeholder in the game palette:
 * thick ink outlines, flat tones, ember accents. Blood and corpses are baked into a
 * RenderTexture so the arena slowly turns into a slaughterhouse during the fight.
 */
import { Container, Graphics, RenderTexture, Sprite, Text, Texture, type Renderer } from "pixi.js";
import { CONFIG } from "../game/config.js";
import type { Cover, Enemy, GameEvent, World } from "../game/world.js";
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
  private actorsG = new Graphics();
  private bulletsG = new Graphics();
  private fxG = new Graphics();
  private hudG = new Graphics();
  private hudText: Text;
  private bannerText: Text;
  private vignette: Sprite;

  private particles: Particle[] = [];
  private shake = 0;
  private cam: Vec = { x: 0, y: 0 };
  private viewScale = 1;
  private viewOffset: Vec = { x: 0, y: 0 };
  private telegraphs = new Map<number, number>(); // enemy id -> seconds of red warning

  constructor(private renderer: Renderer) {
    const { width, height } = CONFIG.room;
    this.decals = RenderTexture.create({ width, height });
    this.decalSprite = new Sprite(this.decals);
    this.drawFloor();
    this.camLayer.addChild(this.floor, this.decalSprite, this.coversG, this.actorsG, this.bulletsG, this.fxG);

    this.vignette = new Sprite(makeVignette());
    this.vignette.width = VIEW_W;
    this.vignette.height = VIEW_H;

    const style = { fontFamily: "Georgia, 'Times New Roman', serif", fill: PAL.hudText };
    this.hudText = new Text({ text: "", style: { ...style, fontSize: 26 } });
    this.hudText.position.set(40, 96);
    this.bannerText = new Text({ text: "", style: { ...style, fontSize: 56, align: "center" } });
    this.bannerText.anchor.set(0.5);
    this.bannerText.position.set(VIEW_W / 2, VIEW_H * 0.42);

    this.root.addChild(this.camLayer, this.vignette, this.hudG, this.hudText, this.bannerText);
  }

  /** Reset per-room state (decals, particles) for a fresh world. */
  reset(): void {
    this.particles = [];
    this.telegraphs.clear();
    this.shake = 0;
    const clear = new Graphics().rect(0, 0, 1, 1).fill({ color: 0, alpha: 0 });
    this.renderer.render({ container: clear, target: this.decals, clear: true });
    clear.destroy();
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
          break;
        case "enemyDeath":
          this.spray(e.pos, e.dir, 40, 1.6);
          this.chunks(e.pos, e.dir, 7);
          this.corpse(e.pos, e.dir, e.kind === "halberdier" ? PAL.guardCoatMid : PAL.gunnerCoatMid);
          this.addShake(12);
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
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  draw(world: World, dt: number, aim: Vec, started = true): void {
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

    this.flushStamps();
    this.drawCovers(world.covers);
    this.drawActors(world);
    this.drawBullets(world);
    this.drawParticles();
    this.drawHud(world, started);
  }

  // ---------------------------------------------------------------- floor and decals
  private drawFloor(): void {
    const g = this.floor;
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

  private corpse(pos: Vec, dir: Vec, coat: number): void {
    const x = pos.x + dir.x * 20;
    const y = pos.y + dir.y * 20;
    this.splat(x, y + 6, 46, PAL.bloodDark);
    this.splat(x + dir.x * 30, y + dir.y * 30, 28, PAL.blood);
    const s = this.stamp;
    s.ellipse(x, y, 30, 16).fill(PAL.ink);
    s.ellipse(x - 4, y - 3, 24, 11).fill(coat);
    s.circle(x + 22 * Math.sign(dir.x || 1), y - 4, 9).fill(PAL.ink);
    this.markStamp();
  }

  // ---------------------------------------------------------------- actors
  private drawCovers(covers: Cover[]): void {
    const g = this.coversG;
    g.clear();
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

  private drawActors(world: World): void {
    const g = this.actorsG;
    g.clear();
    // draw back to front by y so overlaps read correctly in 3/4 view
    const actors: { y: number; draw: () => void }[] = world.enemies.map((e) => ({ y: e.pos.y, draw: () => this.drawEnemy(e, world) }));
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
    g.circle(x + 3 * face, top + 21, 2.4).fill(PAL.ember);
    g.circle(x + 11 * face, top + 20, 1.8).fill(PAL.ember);
    g.circle(x + 6 * face, top + 21, 9).fill({ color: PAL.ember, alpha: 0.12 });

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

  private drawEnemy(e: Enemy, world: World): void {
    const g = this.actorsG;
    const { x, y } = e.pos;
    const face = world.player.pos.x >= x ? 1 : -1;
    const flash = e.flash > 0;
    const coat = flash ? 0xffffff : e.kind === "halberdier" ? PAL.guardCoat : PAL.gunnerCoat;
    const coatMid = flash ? 0xffffff : e.kind === "halberdier" ? PAL.guardCoatMid : PAL.gunnerCoatMid;
    const top = y - 70;
    g.ellipse(x, y + 16, 24, 8).fill({ color: PAL.ink, alpha: 0.6 });

    // telegraph: a red line along the attack direction
    const warn = this.telegraphs.get(e.id) ?? 0;
    if (e.state === "windup" || e.state === "aim" || warn > 0) {
      const reach = e.kind === "halberdier" ? 260 : 900;
      const a = e.state === "windup" || e.state === "aim" ? 0.55 : 0.25;
      g.moveTo(x, y - 30).lineTo(x + e.dir.x * reach, y - 30 + e.dir.y * reach).stroke({ width: e.kind === "halberdier" ? 10 : 2, color: PAL.telegraph, alpha: a });
    }

    // body: coat, belt, legs hidden under the coat skirt
    g.poly([x - 18, top + 20, x + 18, top + 20, x + 24, top + 82, x - 24, top + 82]).fill(coat).stroke({ width: OUT, color: PAL.ink, join: "round" });
    g.poly([x + 2 * face, top + 20, x + 18 * face, top + 20, x + 24 * face, top + 82, x + 2 * face, top + 82]).fill({ color: coatMid, alpha: 0.9 });
    g.rect(x - 20, top + 50, 40, 5).fill(PAL.ink);
    // head: morion helmet (halberdier) or wide hat (arquebusier)
    g.circle(x + 2 * face, top + 12, 11).fill(flash ? 0xffffff : 0x8a6e58).stroke({ width: 4, color: PAL.ink });
    if (e.kind === "halberdier") {
      g.poly([x - 18, top + 6, x - 8, top - 6, x + 10, top - 8, x + 20, top + 4, x + 2, top + 2]).fill(PAL.steel).stroke({ width: 4, color: PAL.ink });
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
  private drawHud(world: World, started: boolean): void {
    const g = this.hudG;
    g.clear();
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
    this.hudText.text = `${w.name}  ·  ${status}\nStrażników: ${world.enemies.length}`;

    if (!started) this.bannerText.text = "PROFANUM\nKliknij, aby zacząć";
    else if (!p.alive) this.bannerText.text = "NIE ŻYJESZ\n[Enter] od nowa";
    else if (world.cleared) this.bannerText.text = "POKÓJ OCZYSZCZONY\n[Enter] od nowa";
    else this.bannerText.text = "";
  }

  private addShake(v: number): void {
    this.shake = Math.min(28, this.shake + v);
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
