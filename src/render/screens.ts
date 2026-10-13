/**
 * Menus and overlays in screen space: the title, pause and options, the run summary, notes from the
 * catacombs, the crypt's Echo altar and the sarcophagus panel. Each returns the item under the mouse
 * so the caller can handle clicks.
 */
import { Container, Graphics } from "pixi.js";
import type { Vec } from "../game/math.js";
import { PAL } from "../palette.js";
import { frame, VIEW_H, VIEW_W } from "./hud.js";
import { TextPool } from "./text.js";

export interface MenuItem {
  label: string;
  enabled?: boolean;
}

export interface MenuView {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  selected: number;
  footer?: string;
}

export interface ListRow {
  label: string;
  detail: string;
  right: string;
  state: "available" | "bought" | "locked";
}

export interface InvRow {
  name: string;
  detail?: string;
  right?: string;
  color?: number;
  /** Draws a small icon centred on (x, y). */
  icon?: (g: Graphics, x: number, y: number) => void;
}

export interface InvSection {
  title: string;
  rows: InvRow[];
}

/**
 * A picture drawn into its own graphics, then scaled and moved to fit its box. The fit is measured
 * from the drawing's bounds once per key and box, so a figure that moves doesn't breathe in size.
 */
export interface Picture {
  key: string;
  draw: (g: Graphics) => void;
  /** The largest scale (a small icon isn't blown up past it). */
  max: number;
}

export interface CodexCell {
  known: boolean;
  picture?: Picture;
}

/** The Grimoire's page: tabs, a grid of entries and the one looked at. */
export interface CodexView {
  title: string;
  progress: string;
  tabs: string[];
  tab: number;
  cells: CodexCell[];
  selected: number;
  detail: {
    name: string;
    sub?: string;
    lore?: string;
    lines: string[];
    known: boolean;
    picture?: Picture;
    /** The picture is a figure standing on its feet (otherwise an icon centred in the box). */
    feet?: boolean;
  };
  hint: string;
}

export class Screens {
  readonly layer = new Container();
  private g = new Graphics();
  /** Scaled pictures (figures and icons in the Grimoire), each in its own graphics. */
  private pics = new Container();
  private picPool: Graphics[] = [];
  private picsUsed = 0;
  private fits = new Map<string, { s: number; cx: number; cy: number; bottom: number }>();
  private tx: TextPool;

  constructor() {
    this.layer.addChild(this.g);
    this.layer.addChild(this.pics);
    this.tx = new TextPool(this.layer);
  }

  begin(): void {
    this.g.clear();
    for (const p of this.picPool) {
      p.clear();
      p.visible = false;
    }
    this.picsUsed = 0;
    this.tx.begin();
  }

  /** Draw a picture fitted into the box (x, y, w, h): centred, or standing on the box's floor. */
  private picture(pic: Picture, x: number, y: number, w: number, h: number, stand = false): void {
    let g = this.picPool[this.picsUsed];
    if (!g) {
      g = new Graphics();
      this.picPool.push(g);
      this.pics.addChild(g);
    }
    this.picsUsed += 1;
    g.visible = true;
    pic.draw(g);
    const key = `${pic.key}@${w}x${h}`;
    let fit = this.fits.get(key);
    if (!fit) {
      const b = g.getLocalBounds();
      const bw = Math.max(1, b.width);
      const bh = Math.max(1, b.height);
      fit = { s: Math.min(w / bw, h / bh, pic.max), cx: b.x + bw / 2, cy: b.y + bh / 2, bottom: b.y + bh };
      this.fits.set(key, fit);
    }
    g.scale.set(fit.s);
    g.position.set(x + w / 2 - fit.cx * fit.s, stand ? y + h - fit.bottom * fit.s : y + h / 2 - fit.cy * fit.s);
  }

  end(): void {
    this.tx.end();
  }

  dim(alpha: number): void {
    this.g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: PAL.ink, alpha });
  }

  /** The title screen: ash drifting over the pyres of the square. */
  title(menu: MenuView, time: number, mouse: Vec): number {
    const g = this.g;
    g.rect(0, 0, VIEW_W, VIEW_H).fill(0x0a0807);
    g.circle(VIEW_W / 2, VIEW_H * 0.36, 420).fill({ color: PAL.ember, alpha: 0.05 });
    g.circle(VIEW_W / 2, VIEW_H * 0.36, 260).fill({ color: PAL.ember, alpha: 0.05 });
    // pyres on the horizon
    for (let i = 0; i < 7; i++) {
      const x = 140 + i * 275;
      const y = VIEW_H - 120 + (i % 2) * 16;
      g.rect(x - 4, y - 90, 8, 90).fill(0x1a1210);
      g.poly([x - 60, y, x, y - 40, x + 60, y]).fill(0x140e0c);
      const h = 60 + 20 * Math.sin(time * 3 + i);
      g.poly([x - 26, y - 30, x, y - 30 - h, x + 26, y - 30]).fill({ color: PAL.ember, alpha: 0.5 });
      g.poly([x - 12, y - 34, x, y - 34 - h * 0.6, x + 12, y - 34]).fill({ color: PAL.emberHot, alpha: 0.6 });
    }
    // ash falling
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5 + Math.sin(time * 0.7 + i) * 40) % VIEW_W;
      const y = (i * 61 + time * (18 + (i % 5) * 6)) % VIEW_H;
      g.circle(x, y, 1.5 + (i % 3)).fill({ color: i % 4 === 0 ? PAL.ember : 0x8a8278, alpha: 0.45 });
    }
    this.tx.text("PROFANUM", VIEW_W / 2, VIEW_H * 0.3, { size: 140, font: "display", color: 0xe8d8b8, align: "center", stroke: true }, 0.5, 0.5);
    if (menu.subtitle) this.tx.text(menu.subtitle, VIEW_W / 2, VIEW_H * 0.3 + 96, { size: 28, color: PAL.hudText, align: "center" }, 0.5, 0.5, 0.85);
    return this.items(menu, VIEW_H * 0.56, mouse, false);
  }

  /** A framed menu in the middle of the screen (pause, options). */
  menu(menu: MenuView, mouse: Vec): number {
    const h = 130 + menu.items.length * 58 + (menu.footer ? 60 : 0);
    const top = (VIEW_H - h) / 2;
    frame(this.g, VIEW_W / 2 - 360, top, 720, h, 0.88);
    this.tx.text(menu.title, VIEW_W / 2, top + 50, { size: 52, font: "display", align: "center" }, 0.5, 0.5);
    const hovered = this.items(menu, top + 110, mouse, true);
    if (menu.footer) this.tx.text(menu.footer, VIEW_W / 2, top + h - 44, { size: 20, color: PAL.hudDim, align: "center", wrap: 640 }, 0.5, 0.5);
    return hovered;
  }

  private items(menu: MenuView, y0: number, mouse: Vec, framed: boolean): number {
    let hovered = -1;
    menu.items.forEach((it, i) => {
      const y = y0 + i * 58;
      const over = mouse.x > VIEW_W / 2 - 320 && mouse.x < VIEW_W / 2 + 320 && mouse.y > y - 6 && mouse.y < y + 46;
      if (over) hovered = i;
      const sel = i === menu.selected;
      if (sel) {
        this.g.rect(VIEW_W / 2 - 300, y, 600, 44).fill({ color: PAL.ember, alpha: framed ? 0.16 : 0.12 });
        this.g.poly([VIEW_W / 2 - 290, y + 22, VIEW_W / 2 - 276, y + 12, VIEW_W / 2 - 276, y + 32]).fill(PAL.ember);
      }
      const color = it.enabled === false ? 0x4a4038 : sel ? 0xf4e2c8 : PAL.hudText;
      this.tx.text(it.label, VIEW_W / 2, y + 22, { size: 30, color, align: "center", font: "display" }, 0.5, 0.5);
    });
    return hovered;
  }

  /** A framed list of lines in the middle of the screen: the end of a run, the crypt's ledger. */
  summary(title: string, lines: string[], color: number, footer: string): void {
    this.dim(0.7);
    const h = 220 + lines.length * 44;
    const top = (VIEW_H - h) / 2;
    frame(this.g, VIEW_W / 2 - 460, top, 920, h, 0.9);
    this.tx.text(title, VIEW_W / 2, top + 64, { size: 64, font: "display", color, align: "center", stroke: true }, 0.5, 0.5);
    lines.forEach((l, i) => this.tx.text(l, VIEW_W / 2, top + 140 + i * 44, { size: 27, align: "center", wrap: 860 }, 0.5, 0.5));
    this.tx.text(footer, VIEW_W / 2, top + h - 40, { size: 24, color: PAL.ember, align: "center" }, 0.5, 0.5);
  }

  /** A note from the catacombs on old parchment. */
  note(text: string, footer: string): void {
    this.dim(0.6);
    const w = 900;
    const h = 520;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    this.g.rect(x, y, w, h).fill(0xc8b890).stroke({ width: 6, color: PAL.ink });
    this.g.rect(x + 14, y + 14, w - 28, h - 28).stroke({ width: 2, color: 0x6a5a40 });
    for (let i = 0; i < 9; i++) this.g.circle(x + ((i * 97) % w), y + ((i * 53) % h), 12 + (i % 3) * 8).fill({ color: 0x8a7a50, alpha: 0.18 });
    this.tx.text(text, x + 60, y + 60, { size: 30, color: 0x2a1e14, wrap: w - 120, font: "body" });
    this.tx.text(footer, VIEW_W / 2, y + h - 40, { size: 20, color: 0x5a4a30, align: "center" }, 0.5, 0.5);
  }

  /** The Echo altar's list of things to unlock. */
  list(title: string, sub: string, rows: ListRow[], selected: number, hint: string, mouse: Vec): number {
    this.dim(0.55);
    const w = 900;
    const rowH = 52;
    const h = 170 + rows.length * rowH;
    const x = (VIEW_W - w) / 2;
    const y = Math.max(20, (VIEW_H - h) / 2);
    frame(this.g, x, y, w, h, 0.92);
    this.tx.text(title, VIEW_W / 2, y + 44, { size: 44, font: "display", align: "center" }, 0.5, 0.5);
    this.tx.text(sub, VIEW_W / 2, y + 88, { size: 24, color: 0x8ab4ff, align: "center" }, 0.5, 0.5);
    let hovered = -1;
    rows.forEach((r, i) => {
      const ry = y + 120 + i * rowH;
      if (mouse.x > x && mouse.x < x + w && mouse.y > ry && mouse.y < ry + rowH) hovered = i;
      if (i === selected) this.g.rect(x + 20, ry, w - 40, rowH - 6).fill({ color: PAL.ember, alpha: 0.14 });
      const col = r.state === "bought" ? PAL.hudFaint : r.state === "locked" ? 0x5a4a40 : PAL.hudText;
      this.tx.text(r.label, x + 40, ry + 6, { size: 24, color: col, font: "display" });
      this.tx.text(r.detail, x + 40, ry + 32, { size: 16, color: PAL.hudDim });
      this.tx.text(r.right, x + w - 40, ry + 12, { size: 22, color: r.state === "bought" ? PAL.hudDim : 0x8ab4ff, align: "right" }, 1, 0);
    });
    this.tx.text(hint, VIEW_W / 2, y + h - 26, { size: 18, color: PAL.hudDim, align: "center" }, 0.5, 0.5);
    return hovered;
  }

  /** What the sarcophagus the necromancer stands at holds (a long last line is its story, in italics). */
  panel(title: string, lines: string[], footer: string, accent: number): void {
    const w = 820;
    const perLine = Math.floor((w - 60) / 9.5);
    const heights = lines.map((l) => 32 * Math.max(1, Math.ceil(l.length / perLine)));
    const h = 110 + heights.reduce((a, b) => a + b, 0);
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H - h - 190;
    frame(this.g, x, y, w, h, 0.88);
    this.tx.text(title, VIEW_W / 2, y + 36, { size: 36, font: "display", color: accent, align: "center" }, 0.5, 0.5);
    let ly = y + 64;
    lines.forEach((l, i) => {
      const story = i === lines.length - 1 && lines.length > 2;
      this.tx.text(l, VIEW_W / 2, ly + heights[i] / 2, { size: story ? 19 : 21, color: story ? 0xb8a890 : PAL.hudText, italic: story, align: "center", wrap: w - 60 }, 0.5, 0.5);
      ly += heights[i];
    });
    this.tx.text(footer, VIEW_W / 2, y + h - 26, { size: 22, color: PAL.ember, align: "center" }, 0.5, 0.5);
  }

  /** What the necromancer carries (on the pause screen, to the right of the menu). */
  inventory(title: string, sections: InvSection[], more: (n: number) => string, top = 24): void {
    const w = 560;
    const x = VIEW_W - w - 24;
    const y = top;
    const maxH = VIEW_H - top - 24;
    // lay out first, to know how tall the frame is and what does not fit
    const lines: { kind: "head" | "row"; s?: InvSection; r?: InvRow; h: number }[] = [];
    for (const sec of sections) {
      lines.push({ kind: "head", s: sec, h: 40 });
      for (const r of sec.rows) {
        // a rough count of the wrapped lines of the description (16 px serif ≈ 7.7 px a letter)
        const perLine = Math.floor((w - 80 - (r.icon ? 44 : 0)) / 7.7);
        const rows = r.detail ? Math.ceil(r.detail.length / perLine) : 0;
        lines.push({ kind: "row", r, h: 32 + rows * 21 });
      }
    }
    let used = 70;
    let shown = 0;
    for (const l of lines) {
      if (used + l.h > maxH - 40) break;
      used += l.h;
      shown += 1;
    }
    const hidden = lines.slice(shown).filter((l) => l.kind === "row").length;
    const h = Math.min(maxH, used + (hidden > 0 ? 40 : 16));
    frame(this.g, x, y, w, h, 0.9);
    this.tx.text(title, x + 28, y + 18, { size: 34, font: "display" });
    let cy = y + 70;
    for (const l of lines.slice(0, shown)) {
      if (l.kind === "head") {
        this.tx.text(l.s!.title, x + 28, cy + 10, { size: 20, color: PAL.ember, bold: true });
        this.g.moveTo(x + 28, cy + 36).lineTo(x + w - 28, cy + 36).stroke({ width: 1, color: PAL.hudDim, alpha: 0.5 });
      } else {
        const r = l.r!;
        const ix = r.icon ? 44 : 0;
        if (r.icon) r.icon(this.g, x + 52, cy + (r.detail ? 24 : 14));
        this.tx.text(r.name, x + 36 + ix, cy + 4, { size: 21, color: r.color ?? PAL.hudText, font: "display" });
        if (r.right) this.tx.text(r.right, x + w - 32, cy + 6, { size: 18, color: PAL.hudDim, align: "right" }, 1, 0);
        if (r.detail) this.tx.text(r.detail, x + 36 + ix, cy + 28, { size: 16, color: PAL.hudDim, wrap: w - 80 - ix });
      }
      cy += l.h;
    }
    if (hidden > 0) this.tx.text(more(hidden), x + 36, cy + 6, { size: 18, color: PAL.hudDim });
  }

  /** The Grimoire: chapters as tabs, a grid of entries on the left, the chosen one on the right. */
  codex(v: CodexView, mouse: Vec): { tab: number; cell: number } {
    this.dim(0.6);
    const x0 = 80;
    const y0 = 40;
    const W = VIEW_W - 160;
    const H = VIEW_H - 80;
    frame(this.g, x0, y0, W, H, 0.94);
    this.tx.text(v.title, x0 + 40, y0 + 22, { size: 48, font: "display", color: 0xe8d8b8 });
    this.tx.text(v.progress, x0 + W - 40, y0 + 40, { size: 22, color: PAL.hudDim, align: "right" }, 1, 0);
    // the chapters
    let hoverTab = -1;
    const tabW = (W - 80) / v.tabs.length;
    v.tabs.forEach((label, i) => {
      const tx = x0 + 40 + i * tabW;
      const ty = y0 + 92;
      const over = mouse.x > tx && mouse.x < tx + tabW - 8 && mouse.y > ty && mouse.y < ty + 46;
      if (over) hoverTab = i;
      const sel = i === v.tab;
      this.g.rect(tx, ty, tabW - 8, 46).fill({ color: sel ? 0x3a2418 : 0x16110e, alpha: 0.95 }).stroke({ width: 2, color: sel ? PAL.ember : 0x3a2e26 });
      this.tx.text(label, tx + (tabW - 8) / 2, ty + 23, { size: 21, color: sel ? 0xf4e2c8 : over ? PAL.hudText : PAL.hudDim, align: "center", font: "display" }, 0.5, 0.5);
    });
    // the entries of this chapter
    const cell = 108;
    const cols = 6;
    const gx = x0 + 40;
    const gy = y0 + 166;
    let hoverCell = -1;
    v.cells.forEach((c, i) => {
      const cx = gx + (i % cols) * (cell + 8);
      const cy = gy + Math.floor(i / cols) * (cell + 8);
      const over = mouse.x > cx && mouse.x < cx + cell && mouse.y > cy && mouse.y < cy + cell;
      if (over) hoverCell = i;
      const sel = i === v.selected;
      this.g.rect(cx, cy, cell, cell).fill({ color: c.known ? 0x1e1814 : 0x0e0b0a, alpha: 0.95 }).stroke({ width: sel ? 3 : 2, color: sel ? PAL.ember : over ? 0x6a5040 : 0x2e2622 });
      if (c.known && c.picture) this.picture(c.picture, cx + 10, cy + 10, cell - 20, cell - 20);
      else this.tx.text("?", cx + cell / 2, cy + cell / 2, { size: 40, color: 0x3a302a, align: "center", font: "display" }, 0.5, 0.5);
    });
    // the chosen entry
    const d = v.detail;
    const dx = x0 + 40 + cols * (cell + 8) + 40;
    const dw = x0 + W - 40 - dx;
    const box = { x: dx, y: gy, w: dw, h: 330 };
    this.g.rect(box.x, box.y, box.w, box.h).fill({ color: 0x0c0908, alpha: 0.9 }).stroke({ width: 2, color: 0x3a2e26 });
    this.g.ellipse(box.x + box.w / 2, box.y + box.h - 40, 150, 24).fill({ color: PAL.ember, alpha: d.known ? 0.06 : 0.02 });
    if (d.known && d.picture) this.picture(d.picture, box.x + 30, box.y + 24, box.w - 60, d.feet ? box.h - 56 : box.h - 48, d.feet);
    else this.tx.text("?", box.x + box.w / 2, box.y + box.h / 2, { size: 120, color: 0x2a221e, align: "center", font: "display" }, 0.5, 0.5);
    let ty = box.y + box.h + 22;
    this.tx.text(d.name, dx, ty, { size: 38, font: "display", color: d.known ? 0xf4e2c8 : PAL.hudDim });
    ty += 52;
    if (d.sub) {
      this.tx.text(d.sub, dx, ty, { size: 20, color: PAL.ember });
      ty += 36;
    }
    if (d.lore) {
      this.tx.text(d.lore, dx, ty, { size: 21, color: 0xb8a890, italic: true, wrap: dw });
      ty += 30 * Math.max(1, Math.ceil(d.lore.length / (dw / 10.5))) + 14;
    }
    for (const line of d.lines) {
      this.tx.text(line, dx, ty, { size: 19, color: PAL.hudText, wrap: dw });
      ty += 27 * Math.max(1, Math.ceil(line.length / (dw / 9.6)));
    }
    this.tx.text(v.hint, VIEW_W / 2, y0 + H - 30, { size: 18, color: PAL.hudDim, align: "center" }, 0.5, 0.5);
    return { tab: hoverTab, cell: hoverCell };
  }

  /** The controls, shown in the crypt and on request. */
  controls(lines: [string, string][], title: string, y = 160): void {
    const w = 520;
    const h = 64 + lines.length * 30;
    const x = 24;
    frame(this.g, x, y, w, h, 0.7);
    this.tx.text(title, x + 24, y + 16, { size: 24, font: "display" });
    lines.forEach(([k, v], i) => {
      this.tx.text(k, x + 24, y + 52 + i * 30, { size: 18, color: PAL.ember, bold: true });
      this.tx.text(v, x + 150, y + 52 + i * 30, { size: 18 });
    });
  }
}
