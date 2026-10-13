/**
 * Used only by the single-file browser build (tools/build-artifact.mjs): there PixiJS comes from a
 * <script> tag as `window.PIXI`, so every `import ... from "pixi.js"` is pointed at this file.
 * The normal Vite build imports the real package and never sees this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = (globalThis as any).PIXI;

export const Application = P.Application;
export const Container = P.Container;
export const Graphics = P.Graphics;
export const RenderTexture = P.RenderTexture;
export const Sprite = P.Sprite;
export const Text = P.Text;
export const Texture = P.Texture;
export const ColorMatrixFilter = P.ColorMatrixFilter;
export const NoiseFilter = P.NoiseFilter;
export const BlurFilter = P.BlurFilter;
export const Rectangle = P.Rectangle;
