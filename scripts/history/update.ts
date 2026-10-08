/**
 * The daily CI job, end to end:
 *   1. read BIXI's open-data page and list every yearly trip zip
 *   2. compare each with what public/data/years/index.json was built from (URL + ETag)
 *   3. for each new or changed year: download into .cache/history, build its archive entry,
 *      and, for the newest year with a full riding month, rebuild the story day too
 *
 *   npx tsx scripts/history/update.ts [--force-year 2026] [--dry]
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { basename } from "node:path";
import { UA, fetchRetry, sleep } from "../lib/net";
import type { YearsIndex } from "../../lib/formats/years";

const PAGES = ["https://bixi.com/en/open-data/", "https://bixi.com/fr/donnees-ouvertes/"];
const args = process.argv.slice(2);
const forceYear = args.includes("--force-year") ? +args[args.indexOf("--force-year") + 1] : 0;
const dry = args.includes("--dry");
const yearOf = (url: string) => +(url.match(/(?:DonneesOuvertes?|Historique-BIXI-)(\d{4})/i)?.[1] ?? 0);

async function listZips() {
  for (const p of PAGES) {
    try {
      const html = (await fetchRetry(p, { headers: { "User-Agent": `Mozilla/5.0 ${UA}` } }, { tries: 3, label: p })).toString("utf8");
      const urls = [...new Set([...html.matchAll(/https?:\/\/[^"'\s>]+?\.zip/gi)].map((m) => m[0]))].filter((u) => yearOf(u) > 2000);
      if (urls.length) {
        // one file per year: if a year is listed twice, the longest month suffix wins
        const byYear = new Map<number, string>();
        for (const u of urls) {
          const y = yearOf(u), cur = byYear.get(y);
          if (!cur || basename(u).length > basename(cur).length) byYear.set(y, u);
        }
        return [...byYear].sort((a, b) => a[0] - b[0]);
      }
    } catch (err) {
      console.warn(`could not read ${p}: ${(err as Error).message}`);
    }
  }
  throw new Error("no trip-history zips found on the open-data page");
}

async function head(url: string) {
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": `Mozilla/5.0 ${UA}` } });
  return { etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
}

async function download(url: string, path: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": `Mozilla/5.0 ${UA}` } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(path + ".part"));
      await rename(path + ".part", path);
      return;
    } catch (err) {
      console.warn(`  ↻ ${basename(path)}: ${(err as Error).message}`);
      await sleep(15_000 * (attempt + 1));
    }
  }
  throw new Error(`could not download ${url}`);
}

function run(script: string, extra: string[]) {
  const r = spawnSync("npx", ["tsx", script, ...extra], { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=12288" } });
  return r.status ?? 1;
}

async function main() {
  const zips = await listZips();
  const idx: YearsIndex | null = existsSync("public/data/years/index.json") ? JSON.parse(await readFile("public/data/years/index.json", "utf8")) : null;
  const story = existsSync("public/data/history/source.json") ? JSON.parse(await readFile("public/data/history/source.json", "utf8")) : null;
  const todo: Array<{ year: number; url: string; etag: string | null; lastModified: string | null }> = [];
  for (const [year, url] of zips) {
    const h = await head(url);
    const known = idx?.years.find((y) => y.year === year);
    const changed = year === forceYear || !known || known.url !== url || (!!h.etag && !!known.etag && h.etag !== known.etag);
    console.log(`${year}  ${changed ? "CHANGED" : "same   "}  ${basename(url)}`);
    if (changed) todo.push({ year, url, ...h });
  }
  // the story day always comes from the newest year
  const newest = zips[zips.length - 1];
  const storyStale = !story || story.url !== newest[1] || forceYear === newest[0];
  if (storyStale && !todo.some((t) => t.year === newest[0])) todo.push({ year: newest[0], url: newest[1], ...(await head(newest[1])) });
  if (dry || !todo.length) {
    console.log(todo.length ? "dry run: nothing downloaded" : "everything is up to date");
    return;
  }
  await mkdir(".cache/history", { recursive: true });
  for (const t of todo) {
    const zip = `.cache/history/${basename(t.url)}`;
    if (!existsSync(zip)) {
      console.log(`downloading ${basename(t.url)}`);
      await download(t.url, zip);
    }
    const meta = ["--url", t.url, ...(t.etag ? ["--etag", t.etag] : []), ...(t.lastModified ? ["--last-modified", t.lastModified] : [])];
    if (run("scripts/history/years.ts", ["--zip", zip, "--year", String(t.year), ...meta]) !== 0) throw new Error(`years.ts failed for ${t.year}`);
    if (t.year === newest[0]) {
      const code = run("scripts/history/aggregate.ts", ["--zip", zip, ...meta]);
      // 3 = no complete riding-season month yet: keep the current story day
      if (code !== 0 && code !== 3) throw new Error(`aggregate.ts failed (${code})`);
    }
    if (process.env.CI) await rm(zip, { force: true }); // runners have limited disk
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
