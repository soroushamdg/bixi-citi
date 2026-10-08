/**
 * Screenshots of the real interface (dark and light, whole page and each panel
 * on a transparent background) plus the real numbers the showreel quotes.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node video/ui.mjs
 *
 * Writes video/build/ui/*.png and video/comp/data.js.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "build", "ui");
mkdirSync(out, { recursive: true });
// tall enough for the whole console (header to deck); the reel scales it into the frame
const W = 1920, H = 1540;

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  localStorage.setItem("bixi-tour", "done");
  localStorage.setItem("bixi-theme", "dark");
});
await page.goto(process.env.REEL_URL ?? "http://localhost:3000", { waitUntil: "load" });
await page.waitForFunction(() => window.__bixi?.scene && window.__bixi.data.getState().hist && window.__bixi.data.getState().status, null, { timeout: 120000 });
await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });

// Years, 2025: the season the reel fast-forwards through
await page.evaluate(() => { window.__bixi.story.setMode("years"); window.__bixi.story.selectYear(2025); });
await page.waitForFunction(() => { const d = window.__bixi.data.getState(); return d.yearSummary?.year === 2025 && d.yearDays && d.yearSample; }, null, { timeout: 120000 });
await page.evaluate(() => window.__bixi.ui.setState({ yday: 161, playing: false }));
await page.waitForTimeout(6000);

const rects = await page.evaluate(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
  return { head: r(".head"), kpis: r(".kpis"), basin: r(".basin"), deck: r(".deck"), rail: r(".rail"), theme: r("button.theme[data-pref]"), seg: r(".deck .seg") };
});

for (const theme of ["dark", "light"]) {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `page-${theme}.png`), clip: { x: 0, y: 0, width: W, height: H } });
}
// each panel alone, on transparent, with room for its shadow
await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
await page.waitForTimeout(800);
const PAD = 36;
const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
const layers = {};
for (const key of ["head", "kpis", "basin", "deck", "rail"]) {
  await page.addStyleTag({ content: `html,body,.app{background:transparent!important} .app>*{visibility:hidden!important} .app>.${key}, .app>.${key} *{visibility:visible!important}` });
  const b = rects[key];
  const x = Math.max(0, Math.floor(b.x - PAD)), y = Math.max(0, Math.floor(b.y - PAD));
  const clip = { x, y, width: Math.min(W, Math.ceil(b.x + b.w + PAD)) - x, height: Math.min(pageH, Math.ceil(b.y + b.h + PAD)) - y };
  await page.screenshot({ path: join(out, `layer-${key}.png`), omitBackground: true, fullPage: true, clip });
  layers[key] = clip;
  if (key === "basin") {
    // the map's own overlays (caption, controls, legend) without the 3D: the reel puts its footage underneath
    await page.addStyleTag({ content: "html .app>.basin canvas, html .app>.basin .labels, html .app>.basin .labels *{visibility:hidden!important} html .app>.basin{background:transparent!important}" });
    await page.screenshot({ path: join(out, "layer-basin-ui.png"), omitBackground: true, fullPage: true, clip });
    await page.evaluate(() => document.head.lastElementChild.remove());
  }
  await page.evaluate(() => document.head.lastElementChild.remove());
}

// real numbers
const live = await page.evaluate(() => {
  const d = window.__bixi.data.getState();
  const s = d.status, info = d.info;
  let bikes = 0, ebikes = 0, docks = 0;
  for (let i = 0; i < d.bikes.length; i++) { bikes += Math.max(0, d.bikes[i]); ebikes += Math.max(0, d.ebikes[i]); docks += Math.max(0, d.docks[i]); }
  // a real snapshot for the ticker: busy downtown stations and what they hold now
  const rows = [];
  for (let i = 0; i < info.ids.length; i++) rows.push({ name: info.name[i], bikes: d.bikes[i], ebikes: d.ebikes[i], cap: info.cap?.[i] ?? d.bikes[i] + d.docks[i], lat: info.lat[i], lon: info.lon[i] });
  const near = rows
    .filter((r) => Math.hypot((r.lat - 45.506) * 111, (r.lon + 73.572) * 78) < 2.2)
    .sort((a, b) => b.bikes - a.bikes)
    .slice(0, 16);
  return { t: s.t, stations: info.ids.length, bikes, ebikes, docks, ticker: near };
});
const day = await page.evaluate(() => {
  const d = window.__bixi.data.getState();
  const hours = new Array(24).fill(0);
  const perMin = new Array(1440).fill(0);
  for (const c of d.day) {
    if (!c) continue;
    for (let i = 0; i < c.start.length; i++) {
      const m = Math.floor(c.start[i] / 60) % 1440;
      hours[Math.floor(m / 60)]++;
      perMin[m]++;
    }
  }
  return { hours, perMin };
});
const meta = JSON.parse(readFileSync(join(root, "public/data/history/meta.json"), "utf8"));
const rhythm = JSON.parse(readFileSync(join(root, "public/data/history/rhythm.json"), "utf8"));
const yIndex = JSON.parse(readFileSync(join(root, "public/data/years/index.json"), "utf8"));
const sumFile = readdirSync(join(root, "public/data/years")).find((f) => f.startsWith("summaries."));
const summaries = JSON.parse(readFileSync(join(root, "public/data/years", sumFile), "utf8"));
const city = JSON.parse(readFileSync(join(root, "public/city/index.json"), "utf8"));
const y2025 = summaries.find((s) => s.year === 2025);

const DATA = {
  screen: { w: W, h: H },
  rects,
  layers,
  live,
  storyDay: { ...meta.storyDay, hours: day.hours, cumulative: day.perMin.reduce((a, v, i) => (a.push((a[i - 1] ?? 0) + v), a), []) },
  rhythm: rhythm.how,
  years: yIndex.years.map((y) => ({ year: y.year, trips: y.trips, partial: y.partial, peak: y.peak, stations: y.stationsActive })),
  total: yIndex.years.reduce((a, y) => a + y.trips, 0),
  y2025: { daily: y2025.daily, peak: yIndex.years.find((y) => y.year === 2025).peak },
  city: city.stats,
  bridges: JSON.parse(readFileSync(join(root, "public/city/bridges.json"), "utf8")).length,
  landmarks: (readFileSync(join(root, "lib/landmarks.ts"), "utf8").match(/^\s*\{ key: "/gm) ?? []).length,
  meta: { trips: meta.trips, stations: meta.stations, medianMin: meta.medianMin, medianKm: meta.medianKm, downhill: meta.downhill },
};
writeFileSync(join(here, "comp", "data.js"), `// generated by video/ui.mjs from the app's real data\nwindow.DATA = ${JSON.stringify(DATA)};\n`);
console.log(JSON.stringify({ rects, live: { ...live, ticker: live.ticker.length }, hours: day.hours, total: DATA.total }, null, 1));
await browser.close();
