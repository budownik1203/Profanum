/**
 * Builds the whole game into ONE self-contained HTML page (the shareable browser version).
 * PixiJS is loaded on that page from a CDN, so `pixi.js` imports are mapped to window.PIXI.
 *
 *   node tools/build-artifact.mjs [out.html]
 *
 * esbuild is taken from node_modules when present (it comes with Vite), otherwise from ESBUILD_PATH.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  esbuild = require(process.env.ESBUILD_PATH || "/opt/npm-tools/node_modules/esbuild");
}

const out = resolve(process.argv[2] || resolve(root, "dist/profanum.html"));

const pixiGlobal = {
  name: "pixi-global",
  setup(b) {
    b.onResolve({ filter: /^pixi\.js$/ }, () => ({ path: resolve(root, "tools/pixi-global.ts") }));
  },
};

const result = await esbuild.build({
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
  plugins: [pixiGlobal],
  legalComments: "none",
  logLevel: "warning",
});
const js = result.outputFiles[0].text;
const template = readFileSync(resolve(root, "tools/page_template.html"), "utf8");
if (!template.includes("/*__GAME__*/")) throw new Error("page template lost its /*__GAME__*/ marker");
// a replacer function, so `$&` and friends inside the bundle are not treated as patterns
const page = template.replace("/*__GAME__*/", () => js);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`built ${out} (${(page.length / 1024).toFixed(0)} KiB, game ${(js.length / 1024).toFixed(0)} KiB)`);
