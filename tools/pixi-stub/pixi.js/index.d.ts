// Loose local stub of the parts of the PixiJS v8 API used by the game (type-check only, no npm here).
type Num = number;
interface FillStyle { color?: Num; alpha?: Num }
interface StrokeStyle { width?: Num; color?: Num; alpha?: Num; join?: string; cap?: string }
interface PointLike { set(x: Num, y?: Num): void; x: Num; y: Num }
export class Container {
  position: PointLike;
  scale: PointLike;
  pivot: PointLike;
  rotation: Num;
  children: Container[];
  alpha: Num;
  visible: boolean;
  x: Num;
  y: Num;
  filters: unknown[] | null;
  addChild(...c: Container[]): Container;
  removeChild(...c: Container[]): Container;
  destroy(opts?: unknown): void;
}
export class Graphics extends Container {
  clear(): this;
  rect(x: Num, y: Num, w: Num, h: Num): this;
  roundRect(x: Num, y: Num, w: Num, h: Num, r?: Num): this;
  circle(x: Num, y: Num, r: Num): this;
  ellipse(x: Num, y: Num, rx: Num, ry: Num): this;
  poly(points: Num[], close?: boolean): this;
  moveTo(x: Num, y: Num): this;
  lineTo(x: Num, y: Num): this;
  quadraticCurveTo(cpx: Num, cpy: Num, x: Num, y: Num): this;
  bezierCurveTo(a: Num, b: Num, c: Num, d: Num, x: Num, y: Num): this;
  arc(x: Num, y: Num, r: Num, start: Num, end: Num, ccw?: boolean): this;
  fill(style?: Num | FillStyle): this;
  stroke(style?: StrokeStyle): this;
}
export class Texture {
  static from(src: HTMLCanvasElement): Texture;
  source: { update(): void };
  width: Num;
  height: Num;
  destroy(): void;
}
export class RenderTexture extends Texture {
  static create(o: { width: Num; height: Num }): RenderTexture;
}
export class Sprite extends Container {
  constructor(t: Texture);
  width: Num;
  height: Num;
  texture: Texture;
  anchor: PointLike;
}
export class Text extends Container {
  constructor(o: { text: string; style: Record<string, unknown> });
  text: string;
  style: Record<string, unknown>;
  anchor: PointLike;
  width: Num;
  height: Num;
}
export interface Renderer {
  render(o: { container: Container; target: RenderTexture; clear?: boolean }): void;
}
export class Application {
  init(o: Record<string, unknown>): Promise<void>;
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  stage: Container;
  screen: { width: Num; height: Num };
  ticker: { add(fn: (t: { deltaMS: Num }) => void): void };
}
export class ColorMatrixFilter {
  desaturate(): void;
  saturate(amount: Num, multiply?: boolean): void;
  brightness(b: Num, multiply?: boolean): void;
  contrast(c: Num, multiply?: boolean): void;
}
export class NoiseFilter {
  constructor(o?: { noise?: Num; seed?: Num });
  noise: Num;
  seed: Num;
}
