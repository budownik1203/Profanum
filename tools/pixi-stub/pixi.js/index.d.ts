// Loose local stub of the parts of the PixiJS v8 API used by the game (type-check only).
type Num = number;
interface FillStyle { color?: Num; alpha?: Num }
interface StrokeStyle { width?: Num; color?: Num; alpha?: Num; join?: string; cap?: string }
export class Container {
  position: { set(x: Num, y?: Num): void; x: Num; y: Num };
  scale: { set(x: Num, y?: Num): void };
  children: unknown[];
  alpha: Num;
  visible: boolean;
  addChild(...c: Container[]): void;
  destroy(): void;
}
export class Graphics extends Container {
  clear(): this;
  rect(x: Num, y: Num, w: Num, h: Num): this;
  circle(x: Num, y: Num, r: Num): this;
  ellipse(x: Num, y: Num, rx: Num, ry: Num): this;
  poly(points: Num[], close?: boolean): this;
  moveTo(x: Num, y: Num): this;
  lineTo(x: Num, y: Num): this;
  quadraticCurveTo(cpx: Num, cpy: Num, x: Num, y: Num): this;
  arc(x: Num, y: Num, r: Num, start: Num, end: Num, ccw?: boolean): this;
  fill(style?: Num | FillStyle): this;
  stroke(style?: StrokeStyle): this;
}
export class Texture { static from(src: HTMLCanvasElement): Texture; source: { update(): void } }
export class RenderTexture extends Texture { static create(o: { width: Num; height: Num }): RenderTexture }
export class Sprite extends Container { constructor(t: Texture); width: Num; height: Num; texture: Texture }
export class Text extends Container {
  constructor(o: { text: string; style: Record<string, unknown> });
  text: string;
  anchor: { set(x: Num, y?: Num): void };
}
export interface Renderer { render(o: { container: Container; target: RenderTexture; clear?: boolean }): void }
export class Application {
  init(o: Record<string, unknown>): Promise<void>;
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  stage: Container;
  screen: { width: Num; height: Num };
  ticker: { add(fn: (t: { deltaMS: Num }) => void): void };
}
