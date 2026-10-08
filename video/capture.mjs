/**
 * Records the 3D footage for the showreel from the running app (npm run dev),
 * frame by frame on a virtual clock, at 1920×1080.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node video/capture.mjs [--only a,b] [--preview]
 *
 * --preview saves three stills per shot (start, middle, end) instead of every frame.
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "./shots.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const preview = args.includes("--preview");
const url = process.env.REEL_URL ?? "http://localhost:3000";
const W = 1920, H = 1080;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", `--window-size=${W},${H}`],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()); });
await page.addInitScript(() => {
  try {
    localStorage.setItem("bixi-tour", "done");
    localStorage.setItem("bixi-theme", "dark");
  } catch { /* ignore */ }
});
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__bixi?.scene?.capture, null, { timeout: 120000 });
// the map fills the frame; everything else stays out of the way
await page.addStyleTag({
  content: `.basin{position:fixed!important;inset:0!important;width:${W}px!important;height:${H}px!important;max-height:none!important;z-index:9999!important;border-radius:0!important;margin:0!important}
  .basin>*:not(canvas){visibility:hidden!important} body{overflow:hidden!important}`,
});
await page.addScriptTag({ path: join(here, "reel-runtime.js") });
await page.evaluate(() => window.REEL.begin());

const t0 = Date.now();
for (const shot of SHOTS) {
  if (only && !only.includes(shot.name)) continue;
  const dir = join(here, "build", preview ? "preview" : "footage", shot.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ts = Date.now();
  await page.evaluate((s) => window.REEL.prepare(s), shot);
  const picks = preview ? [0, Math.floor(shot.frames / 2), shot.frames - 1] : Array.from({ length: shot.frames }, (_, i) => i);
  for (const i of picks) {
    const url = await page.evaluate(([s, k]) => window.REEL.frame(s, k), [shot, i]);
    writeFileSync(join(dir, `${String(i).padStart(4, "0")}.jpg`), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    if (!preview && i % 30 === 0) process.stdout.write(`\r${shot.name} ${i}/${shot.frames}   `);
  }
  console.log(`\r${shot.name}: ${picks.length} frames in ${((Date.now() - ts) / 1000).toFixed(1)} s`);
}
await page.evaluate(() => window.REEL.end());
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
