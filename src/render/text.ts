/**
 * Pixi Text objects are costly to create, so every layer keeps a pool and reuses them frame to frame.
 */
import { Container, Text } from "pixi.js";
import { PAL } from "../palette.js";

export interface TStyle {
  size: number;
  color?: number;
  font?: "display" | "body";
  bold?: boolean;
  align?: "left" | "center" | "right";
  /** Word-wrap width in px. */
  wrap?: number;
  /** Dark outline for legibility over the arena. */
  stroke?: boolean;
  italic?: boolean;
}

const FONTS = {
  display: "'IM Fell English SC', Georgia, 'Times New Roman', serif",
  body: "Spectral, Georgia, 'Times New Roman', serif",
};

const keyOf = (s: TStyle) => `${s.size}|${s.color ?? PAL.hudText}|${s.font ?? "body"}|${s.bold ? 1 : 0}|${s.align ?? "left"}|${s.wrap ?? 0}|${s.stroke ? 1 : 0}|${s.italic ? 1 : 0}`;

function styleOf(s: TStyle): Record<string, unknown> {
  const st: Record<string, unknown> = {
    fontFamily: FONTS[s.font ?? "body"],
    fontSize: s.size,
    fill: s.color ?? PAL.hudText,
    fontWeight: s.bold ? "bold" : "normal",
    fontStyle: s.italic ? "italic" : "normal",
    align: s.align ?? "left",
    lineHeight: Math.round(s.size * 1.25),
  };
  if (s.wrap) {
    st.wordWrap = true;
    st.wordWrapWidth = s.wrap;
  }
  if (s.stroke) st.stroke = { color: PAL.ink, width: Math.max(3, Math.round(s.size / 7)) };
  return st;
}

export class TextPool {
  private items: { t: Text; key: string }[] = [];
  private used = 0;

  constructor(private parent: Container) {}

  begin(): void {
    this.used = 0;
  }

  text(str: string, x: number, y: number, style: TStyle, ax = 0, ay = 0, alpha = 1): Text {
    const key = keyOf(style);
    let it = this.items[this.used];
    if (!it) {
      const t = new Text({ text: str, style: styleOf(style) });
      this.parent.addChild(t);
      it = { t, key };
      this.items.push(it);
    } else {
      if (it.key !== key) {
        it.t.style = styleOf(style);
        it.key = key;
      }
      if (it.t.text !== str) it.t.text = str;
    }
    it.t.visible = true;
    it.t.position.set(Math.round(x), Math.round(y));
    it.t.anchor.set(ax, ay);
    it.t.alpha = alpha;
    this.used += 1;
    return it.t;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].t.visible = false;
  }
}
