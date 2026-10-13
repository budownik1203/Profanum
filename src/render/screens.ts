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

export class Screens {
  readonly layer = new Container();
  private g = new Graphics();
  private tx: TextPool;

  constructor() {
    this.layer.addChild(this.g);
    this.tx = new TextPool(this.layer);
  }

  begin(): void {
    this.g.clear();
    this.tx.begin();
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
    if (menu.subtitle) this.tx.text(menu.subtitle, VIEW_W / 2, VIEW_H * 0.3 + 96, { size: 28, color: PAL.hudDim, align: "center" }, 0.5, 0.5);
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
      const col = r.state === "bought" ? PAL.hudDim : r.state === "locked" ? 0x5a4a40 : PAL.hudText;
      this.tx.text(r.label, x + 40, ry + 6, { size: 24, color: col, font: "display" });
      this.tx.text(r.detail, x + 40, ry + 32, { size: 15, color: PAL.hudDim });
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
  inventory(title: string, sections: InvSection[], more: (n: number) => string): void {
    const w = 560;
    const x = VIEW_W - w - 24;
    const y = 24;
    const maxH = VIEW_H - 48;
    // lay out first, to know how tall the frame is and what does not fit
    const lines: { kind: "head" | "row"; s?: InvSection; r?: InvRow; h: number }[] = [];
    for (const sec of sections) {
      lines.push({ kind: "head", s: sec, h: 40 });
      for (const r of sec.rows) {
        // a rough count of the wrapped lines of the description (15 px serif ≈ 7.2 px a letter)
        const perLine = Math.floor((w - 80 - (r.icon ? 44 : 0)) / 7.2);
        const rows = r.detail ? Math.ceil(r.detail.length / perLine) : 0;
        lines.push({ kind: "row", r, h: 32 + rows * 19 });
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
        if (r.detail) this.tx.text(r.detail, x + 36 + ix, cy + 28, { size: 15, color: PAL.hudDim, wrap: w - 80 - ix });
      }
      cy += l.h;
    }
    if (hidden > 0) this.tx.text(more(hidden), x + 36, cy + 6, { size: 18, color: PAL.hudDim });
  }

  /** The controls, shown in the crypt and on request. */
  controls(lines: [string, string][], title: string): void {
    const w = 520;
    const h = 64 + lines.length * 30;
    const x = 24;
    const y = 160;
    frame(this.g, x, y, w, h, 0.7);
    this.tx.text(title, x + 24, y + 16, { size: 24, font: "display" });
    lines.forEach(([k, v], i) => {
      this.tx.text(k, x + 24, y + 52 + i * 30, { size: 18, color: PAL.ember, bold: true });
      this.tx.text(v, x + 150, y + 52 + i * 30, { size: 18 });
    });
  }
}
