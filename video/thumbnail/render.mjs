// Renders the YouTube thumbnails in index.html to video/thumbnail/thumbnail-{a,b,c}.jpg (1920×1080, under 2 MB).
// Usage: PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node video/thumbnail/render.mjs
// Also writes .cache/thumb/preview.png: each saved thumbnail at the sizes YouTube shows it, to check it still reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const IDS = ["a", "b", "c"];
const MAX_BYTES = 2 * 1024 * 1024; // YouTube's thumbnail limit

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(join(here, "index.html")).href);
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => im.decode()));
});

const shots = [];
for (const id of IDS) {
  const png = await page.locator(`#${id}`).screenshot();
  const out = join(here, `thumbnail-${id}.jpg`);
  // baseline JPEG for the widest decoder support; 4:4:4 chroma keeps the red tags' edges sharp
  const { size } = await sharp(png).resize(1920, 1080).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toFile(out);
  if (size > MAX_BYTES) throw new Error(`${out} is ${size} bytes, over YouTube's 2 MB limit`);
  console.log(`${out}  ${(size / 1024).toFixed(0)} KB`);
  shots.push(out);
}
// preview: the saved files as the browser scales them, at 360×202 (desktop grid), 246×138 (sidebar) and 168×94 (mobile list)
const SIZES = [[360, 202], [246, 138], [168, 94]];
const cells = shots.map((f) => SIZES.map(([w, h]) => `<img src="${pathToFileURL(f).href}" width="${w}" height="${h}">`).join("")).join("<br>");
const cache = join(here, "../../.cache/thumb");
mkdirSync(cache, { recursive: true });
writeFileSync(join(cache, "preview.html"), `<body style="margin:0;padding:16px;background:#0f0f0f;width:max-content;line-height:0">
  <style>img{margin:0 16px 16px 0;border-radius:8px;vertical-align:top}</style>${cells}</body>`);
const preview = await browser.newPage({ viewport: { width: 860, height: 700 } });
await preview.goto(pathToFileURL(join(cache, "preview.html")).href);
await preview.evaluate(() => Promise.all([...document.images].map((im) => im.decode())));
await preview.screenshot({ path: join(cache, "preview.png"), fullPage: true });
await browser.close();
console.log(join(cache, "preview.png"));
