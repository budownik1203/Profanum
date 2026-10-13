/**
 * A tiny Canvas2D stand-in for the part of the PixiJS v8 API Profanum uses.
 * Only for headless screenshots and runtime checks where the PixiJS CDN can't be reached
 * (tools/shot.mjs serves this file in place of pixi.min.js). The real game uses real PixiJS.
 *
 * Graphics follows the v8 rule: shapes collect into a path; fill()/stroke() paint it; a fill or
 * stroke straight after another one reuses the same path; the next shape starts a new path.
 */
(function () {
  const css = (color, alpha = 1) => {
    if (typeof color === "string") return color;
    const c = (color ?? 0) >>> 0;
    return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
  };

  class Point {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y === undefined ? x : y;
    }
  }

  class Container {
    constructor() {
      this.children = [];
      this.position = new Point();
      this.scale = new Point(1, 1);
      this.pivot = new Point();
      this.rotation = 0;
      this.alpha = 1;
      this.visible = true;
      this.parent = null;
      this.filters = null;
      this.destroyed = false;
      this.eventMode = "auto";
      this.tint = 0xffffff;
      this.blendMode = "normal";
    }
    get x() { return this.position.x; }
    set x(v) { this.position.x = v; }
    get y() { return this.position.y; }
    set y(v) { this.position.y = v; }
    addChild(...cs) {
      for (const c of cs) {
        if (c.parent) c.parent.removeChild(c);
        c.parent = this;
        this.children.push(c);
      }
      return cs[0];
    }
    addChildAt(c, i) {
      if (c.parent) c.parent.removeChild(c);
      c.parent = this;
      this.children.splice(i, 0, c);
      return c;
    }
    removeChild(...cs) {
      for (const c of cs) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);
        c.parent = null;
      }
      return cs[0];
    }
    removeChildren() {
      const old = this.children;
      this.children = [];
      for (const c of old) c.parent = null;
      return old;
    }
    destroy(opts) {
      if (this.parent) this.parent.removeChild(this);
      this.destroyed = true;
      if (opts && opts.children) for (const c of [...this.children]) c.destroy(opts);
    }
    _render(ctx) {
      if (!this.visible || this.alpha <= 0 || this.destroyed) return;
      ctx.save();
      ctx.translate(this.position.x, this.position.y);
      if (this.rotation) ctx.rotate(this.rotation);
      ctx.scale(this.scale.x, this.scale.y);
      if (this.pivot.x || this.pivot.y) ctx.translate(-this.pivot.x, -this.pivot.y);
      ctx.globalAlpha *= this.alpha;
      if (this.blendMode === "add") ctx.globalCompositeOperation = "lighter";
      this._draw(ctx);
      for (const c of this.children) c._render(ctx);
      ctx.restore();
    }
    _draw() {}
  }

  const tracePath = (ctx, path) => {
    for (const op of path) {
      switch (op[0]) {
        case "rect":
          ctx.rect(op[1], op[2], op[3], op[4]);
          break;
        case "roundRect":
          if (ctx.roundRect) ctx.roundRect(op[1], op[2], op[3], op[4], op[5]);
          else ctx.rect(op[1], op[2], op[3], op[4]);
          break;
        case "circle":
          ctx.moveTo(op[1] + op[3], op[2]);
          ctx.arc(op[1], op[2], Math.max(0, op[3]), 0, Math.PI * 2);
          ctx.closePath();
          break;
        case "ellipse":
          ctx.moveTo(op[1] + op[3], op[2]);
          ctx.ellipse(op[1], op[2], Math.max(0, op[3]), Math.max(0, op[4]), 0, 0, Math.PI * 2);
          ctx.closePath();
          break;
        case "poly": {
          const p = op[1];
          if (p.length < 4) break;
          ctx.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
          if (op[2]) ctx.closePath();
          break;
        }
        case "moveTo":
          ctx.moveTo(op[1], op[2]);
          break;
        case "lineTo":
          ctx.lineTo(op[1], op[2]);
          break;
        case "quad":
          ctx.quadraticCurveTo(op[1], op[2], op[3], op[4]);
          break;
        case "bezier":
          ctx.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
          break;
        case "arc":
          ctx.arc(op[1], op[2], Math.max(0, op[3]), op[4], op[5], op[6]);
          break;
        case "close":
          ctx.closePath();
          break;
      }
    }
  };

  class Graphics extends Container {
    constructor() {
      super();
      this._cmds = [];
      this._path = [];
      this._lastPath = null;
      this._painted = false;
    }
    clear() {
      this._cmds = [];
      this._path = [];
      this._lastPath = null;
      this._painted = false;
      return this;
    }
    _shape(op) {
      if (this._painted) {
        this._path = [];
        this._painted = false;
      }
      this._path.push(op);
      return this;
    }
    rect(x, y, w, h) { return this._shape(["rect", x, y, w, h]); }
    roundRect(x, y, w, h, r) { return this._shape(["roundRect", x, y, w, h, r ?? 0]); }
    circle(x, y, r) { return this._shape(["circle", x, y, r]); }
    ellipse(x, y, rx, ry) { return this._shape(["ellipse", x, y, rx, ry]); }
    poly(points, close = true) {
      const flat = typeof points[0] === "object" ? points.flatMap((p) => [p.x, p.y]) : points.slice();
      return this._shape(["poly", flat, close]);
    }
    moveTo(x, y) { return this._shape(["moveTo", x, y]); }
    lineTo(x, y) { return this._shape(["lineTo", x, y]); }
    quadraticCurveTo(cx, cy, x, y) { return this._shape(["quad", cx, cy, x, y]); }
    bezierCurveTo(a, b, c, d, x, y) { return this._shape(["bezier", a, b, c, d, x, y]); }
    arc(x, y, r, a0, a1, ccw) { return this._shape(["arc", x, y, r, a0, a1, !!ccw]); }
    closePath() { return this._shape(["close"]); }
    fill(style) { return this._paint("fill", style); }
    stroke(style) { return this._paint("stroke", style); }
    _paint(kind, style) {
      const path = this._painted ? this._lastPath : this._path;
      this._cmds.push([kind, path, style]);
      this._lastPath = path;
      this._painted = true;
      return this;
    }
    /** The painted shapes' extent in local space (curves by their control points, strokes padded). */
    getLocalBounds() {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const add = (x, y, pad) => {
        minX = Math.min(minX, x - pad);
        minY = Math.min(minY, y - pad);
        maxX = Math.max(maxX, x + pad);
        maxY = Math.max(maxY, y + pad);
      };
      for (const [kind, path, style] of this._cmds) {
        if (!path) continue;
        const pad = kind === "stroke" ? ((style && style.width) || 1) / 2 : 0;
        for (const op of path) {
          switch (op[0]) {
            case "rect":
            case "roundRect":
              add(op[1], op[2], pad);
              add(op[1] + op[3], op[2] + op[4], pad);
              break;
            case "circle":
            case "arc":
              add(op[1] - op[3], op[2] - op[3], pad);
              add(op[1] + op[3], op[2] + op[3], pad);
              break;
            case "ellipse":
              add(op[1] - op[3], op[2] - op[4], pad);
              add(op[1] + op[3], op[2] + op[4], pad);
              break;
            case "poly":
              for (let i = 0; i + 1 < op[1].length; i += 2) add(op[1][i], op[1][i + 1], pad);
              break;
            case "moveTo":
            case "lineTo":
              add(op[1], op[2], pad);
              break;
            case "quad":
              add(op[1], op[2], pad);
              add(op[3], op[4], pad);
              break;
            case "bezier":
              add(op[1], op[2], pad);
              add(op[3], op[4], pad);
              add(op[5], op[6], pad);
              break;
          }
        }
      }
      if (minX > maxX) minX = maxX = minY = maxY = 0;
      return { minX, minY, maxX, maxY, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    _draw(ctx) {
      for (const [kind, path, style] of this._cmds) {
        if (!path || path.length === 0) continue;
        ctx.beginPath();
        tracePath(ctx, path);
        if (kind === "fill") {
          const s = typeof style === "object" && style !== null ? style : { color: style };
          ctx.fillStyle = css(s.color ?? 0xffffff, s.alpha ?? 1);
          ctx.fill();
        } else {
          const s = style || {};
          ctx.lineWidth = s.width ?? 1;
          ctx.strokeStyle = css(s.color ?? 0, s.alpha ?? 1);
          ctx.lineCap = s.cap || "butt";
          ctx.lineJoin = s.join || "miter";
          ctx.stroke();
        }
      }
    }
  }

  const measureCtx = document.createElement("canvas").getContext("2d");

  class Text extends Container {
    constructor(o = {}) {
      super();
      this._text = String(o.text ?? "");
      this.style = Object.assign({ fontFamily: "serif", fontSize: 26, fill: 0xffffff }, o.style || {});
      this.anchor = new Point();
      this.resolution = 1;
    }
    get text() { return this._text; }
    set text(v) { this._text = String(v); }
    _font() {
      const s = this.style;
      const fam = Array.isArray(s.fontFamily) ? s.fontFamily.join(",") : s.fontFamily;
      return `${s.fontStyle || "normal"} ${s.fontWeight || "normal"} ${s.fontSize}px ${fam}`;
    }
    _lines() {
      const s = this.style;
      measureCtx.font = this._font();
      const raw = this._text.split("\n");
      if (!s.wordWrap) return raw;
      const out = [];
      for (const para of raw) {
        let line = "";
        for (const word of para.split(" ")) {
          const test = line ? line + " " + word : word;
          if (line && measureCtx.measureText(test).width > (s.wordWrapWidth || 400)) {
            out.push(line);
            line = word;
          } else line = test;
        }
        out.push(line);
      }
      return out;
    }
    get width() {
      measureCtx.font = this._font();
      return Math.max(0, ...this._lines().map((l) => measureCtx.measureText(l).width)) * this.scale.x;
    }
    get height() {
      return this._lines().length * this.style.fontSize * (this.style.lineHeight ? this.style.lineHeight / this.style.fontSize : 1.2) * this.scale.y;
    }
    _draw(ctx) {
      const s = this.style;
      const lines = this._lines();
      ctx.font = this._font();
      const lh = s.lineHeight || s.fontSize * 1.2;
      const w = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
      const h = lines.length * lh;
      ctx.textBaseline = "top";
      const fill = typeof s.fill === "object" && s.fill !== null ? s.fill.color : s.fill;
      lines.forEach((l, i) => {
        const lw = ctx.measureText(l).width;
        const ax = s.align === "center" ? (w - lw) / 2 : s.align === "right" ? w - lw : 0;
        const x = -this.anchor.x * w + ax;
        const y = -this.anchor.y * h + i * lh;
        if (s.stroke) {
          const st = typeof s.stroke === "object" ? s.stroke : { color: s.stroke, width: s.strokeThickness || 2 };
          ctx.lineWidth = st.width ?? 2;
          ctx.strokeStyle = css(st.color ?? 0);
          ctx.lineJoin = "round";
          ctx.strokeText(l, x, y);
        }
        ctx.fillStyle = css(fill ?? 0xffffff);
        ctx.fillText(l, x, y);
      });
    }
  }

  class Texture {
    constructor(canvas) {
      this._canvas = canvas;
      this.source = { update() {} };
    }
    get width() { return this._canvas ? this._canvas.width : 1; }
    get height() { return this._canvas ? this._canvas.height : 1; }
    static from(src) { return new Texture(src); }
    destroy() {}
  }
  const white = document.createElement("canvas");
  white.width = white.height = 1;
  white.getContext("2d").fillStyle = "#fff";
  white.getContext("2d").fillRect(0, 0, 1, 1);
  Texture.WHITE = new Texture(white);
  Texture.EMPTY = new Texture(null);

  class RenderTexture extends Texture {
    static create(o) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(o.width));
      c.height = Math.max(1, Math.ceil(o.height));
      return new RenderTexture(c);
    }
  }

  class Sprite extends Container {
    constructor(tex) {
      super();
      this.texture = tex || Texture.EMPTY;
      this.anchor = new Point();
      this._w = null;
      this._h = null;
    }
    get width() { return this._w ?? this.texture.width; }
    set width(v) { this._w = v; }
    get height() { return this._h ?? this.texture.height; }
    set height(v) { this._h = v; }
    _draw(ctx) {
      const src = this.texture && this.texture._canvas;
      if (!src) return;
      const w = this._w ?? src.width;
      const h = this._h ?? src.height;
      ctx.drawImage(src, -this.anchor.x * w, -this.anchor.y * h, w, h);
    }
  }

  class Filter {}
  class ColorMatrixFilter extends Filter {
    desaturate() {}
    saturate() {}
    brightness() {}
    contrast() {}
    sepia() {}
    reset() {}
  }
  class NoiseFilter extends Filter {
    constructor(o = {}) {
      super();
      this.noise = o.noise ?? 0.5;
      this.seed = Math.random();
    }
  }
  class BlurFilter extends Filter {}
  class Rectangle {
    constructor(x = 0, y = 0, w = 0, h = 0) {
      Object.assign(this, { x, y, width: w, height: h });
    }
  }

  class Application {
    async init(o = {}) {
      this.canvas = document.createElement("canvas");
      this._bg = o.background ?? 0;
      this.stage = new Container();
      this.screen = { width: 0, height: 0 };
      const ctx = this.canvas.getContext("2d");
      const resize = () => {
        this.screen.width = window.innerWidth;
        this.screen.height = window.innerHeight;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + "px";
        this.canvas.style.height = window.innerHeight + "px";
      };
      resize();
      window.addEventListener("resize", resize);
      this.renderer = {
        render: ({ container, target, clear }) => {
          const c = target._canvas;
          const t = c.getContext("2d");
          if (clear) t.clearRect(0, 0, c.width, c.height);
          t.save();
          container._render(t);
          t.restore();
        },
      };
      const fns = [];
      this.ticker = { add: (fn) => fns.push(fn), deltaMS: 16.7, FPS: 60, maxFPS: 0 };
      let last = performance.now();
      const loop = (now) => {
        this.ticker.deltaMS = Math.min(100, now - last);
        last = now;
        for (const f of fns) f(this.ticker);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = css(this._bg);
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.stage._render(ctx);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  window.PIXI = { Application, Container, Graphics, Text, Sprite, Texture, RenderTexture, ColorMatrixFilter, NoiseFilter, BlurFilter, Rectangle, __shim: true };
})();
