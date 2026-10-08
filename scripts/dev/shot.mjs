/**
 * Dev helper: open the app in headless Chromium (GPU via ANGLE/Metal on macOS),
 * run a few steps, save screenshots, print console errors.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node scripts/dev/shot.mjs [url] [steps…]
 * steps: wait:ms · click:selector · key:Space · shot:name · eval:js · size:WxH · throttle:kbps
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [url = "http://localhost:3000", ...steps] = process.argv.slice(2);
const out = ".cache/shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "load" });
for (const s of steps.length ? steps : ["wait:12000", "shot:home"]) {
  const [k, ...rest] = s.split(":");
  const v = rest.join(":");
  if (k === "wait") await page.waitForTimeout(+v);
  else if (k === "click") await page.click(v);
  else if (k === "key") await page.keyboard.press(v);
  else if (k === "shot") { await page.screenshot({ path: `${out}/${v}.png` }); console.log(`shot ${out}/${v}.png`); }
  else if (k === "eval") console.log("eval:", JSON.stringify(await page.evaluate(v)));
  else if (k === "size") { const [w, h] = v.split("x").map(Number); await page.setViewportSize({ width: w, height: h }); }
  else if (k === "throttle") {
    // throttle:kbps — slow the network to watch progress UI
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (+v * 1000) / 8, uploadThroughput: 100000 });
  }
}
console.log(logs.slice(0, 40).join("\n") || "no console errors");
await browser.close();
