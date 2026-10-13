/**
 * Runs the built page in headless Chromium and takes screenshots along a scenario.
 * PixiJS from the CDN is replaced by tools/pixi-canvas-shim.js (no network needed), so the
 * pictures are close to, not identical with, the real WebGL rendering.
 *
 *   node tools/shot.mjs <page.html> <outDir> <scenario.mjs>
 *
 * A scenario exports `async function run({ page, shot, sleep, game })`; `game(js)` evaluates an
 * expression against `window.__profanum` (the debug hook in src/debug.ts).
 * Any page error fails the run (exit code 1).
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(process.env.PLAYWRIGHT_PATH || "/opt/npm-tools/node_modules/playwright");
}

const [pageHtml, outDir, scenarioPath] = process.argv.slice(2);
if (!pageHtml || !outDir || !scenarioPath) {
  console.error("usage: node tools/shot.mjs <page.html> <outDir> <scenario.mjs>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const shim = readFileSync(resolve(root, "tools/pixi-canvas-shim.js"), "utf8");

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.stack || e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (process.env.SHOT_LOG && m.type() === "log") console.log("[page]", m.text());
});
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("file:")) return route.continue();
  if (/pixi(\.min)?\.js/.test(url)) return route.fulfill({ body: shim, contentType: "application/javascript" });
  return route.fulfill({ body: "", contentType: url.includes("css") ? "text/css" : "text/plain" });
});
await page.goto(pathToFileURL(resolve(pageHtml)).href);
await page.waitForFunction(() => window.__profanum !== undefined, null, { timeout: 15000 });

let n = 0;
const shot = async (name) => {
  const p = `${outDir}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: p });
  console.log("shot", p);
  return p;
};
const sleep = (ms) => page.waitForTimeout(ms);
const game = (js) => page.evaluate(`(function(g){ return (${js}); })(window.__profanum)`);
const scenario = await import(pathToFileURL(resolve(scenarioPath)).href);
try {
  await scenario.run({ page, shot, sleep, game });
} catch (e) {
  errors.push("SCENARIO: " + (e.stack || e));
}
await browser.close();
if (errors.length) {
  console.error("PAGE ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("no page errors");
}
