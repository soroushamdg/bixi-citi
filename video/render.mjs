/**
 * Renders the composition (video/comp) frame by frame in headless Chromium and
 * encodes it with ffmpeg, in parallel segments.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node video/render.mjs            → video/bixi-story-showreel.mp4
 *   PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node video/render.mjs --stills 1.2,4,9.5   → video/build/stills/*.png
 *   node video/render.mjs --mux    → picture.mp4 + audio.wav → video/bixi-story-showreel.mp4 (+ -master.mp4)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "build");
const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const args = process.argv.slice(2);
const stills = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;
const WORKERS = Number(process.env.WORKERS ?? 4);

/* a tiny static server for video/ */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const p = normalize(join(here, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!p.startsWith(here) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "max-age=3600" });
  createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/comp/index.html`;

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb"] });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.compReady === true);
  return page;
}

const OUT = join(here, "bixi-story-showreel.mp4");
const MASTER = join(here, "bixi-story-showreel-master.mp4");
const ff = (a) => new Promise((r, j) => spawn(FFMPEG, ["-loglevel", "error", "-y", ...a], { stdio: "inherit" }).on("close", (c) => (c ? j(new Error("ffmpeg")) : r())));
const BT709 = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
/**
 * Two files: a high-quality master (CRF 19, not committed), and the web copy at
 * 12 Mbit/s, two-pass (YouTube's recommended rate for 1080p60), small enough for git.
 */
async function mux() {
  const pic = join(build, "picture.mp4"), wav = join(build, "audio.wav");
  await ff(["-i", pic, "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-tune", "film", "-pix_fmt", "yuv420p", ...BT709,
    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", MASTER]);
  const rate = ["-c:v", "libx264", "-preset", "slower", "-b:v", "12M", "-maxrate", "18M", "-bufsize", "24M", "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film", "-passlogfile", join(build, "x264pass")];
  await ff(["-i", pic, ...rate, "-pass", "1", "-an", "-f", "mp4", "/dev/null"]);
  await ff(["-i", pic, "-i", wav, ...rate, "-pass", "2", ...BT709, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", OUT]);
}

if (args.includes("--mux")) {
  await mux();
  console.log(`→ ${OUT}\n→ ${MASTER}`);
} else if (stills) {
  const dir = join(build, "stills");
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  for (const t of stills) {
    await page.evaluate((x) => window.seek(x), t);
    await page.screenshot({ path: join(dir, `${t.toFixed(2).padStart(5, "0")}.png`) });
  }
  console.log(`stills → ${dir}`);
} else {
  const total = 30 * 60;
  const seg = Math.ceil(total / WORKERS);
  const t0 = Date.now();
  let done = 0;
  const parts = await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      const a = w * seg, b = Math.min(total, a + seg);
      const out = join(build, `part-${w}.mp4`);
      const ff = spawn(FFMPEG, ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", "60", "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", out], { stdio: ["pipe", "inherit", "inherit"] });
      const page = await openPage();
      for (let i = a; i < b; i++) {
        await page.evaluate((x) => window.seek(x), i / 60);
        const png = await page.screenshot({ type: "png" });
        if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
        done++;
        if (done % 60 === 0) process.stdout.write(`\r${done}/${total} frames · ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
      }
      ff.stdin.end();
      await new Promise((r) => ff.on("close", r));
      await page.close();
      return out;
    }),
  );
  const list = join(build, "parts.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  await new Promise((r, j) => spawn(FFMPEG, ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(build, "picture.mp4")], { stdio: "inherit" }).on("close", (c) => (c ? j(new Error("concat")) : r())));
  parts.forEach((p) => rmSync(p));
  console.log(`\npicture → ${join(build, "picture.mp4")} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (existsSync(join(build, "audio.wav"))) { await mux(); console.log(`→ ${OUT}\n→ ${MASTER}`); }
  else console.log("no video/build/audio.wav yet: run node video/audio.mjs, then node video/render.mjs --mux");
}
await browser.close();
server.close();
