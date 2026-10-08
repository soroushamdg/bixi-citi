/**
 * Find the newest yearly trip-history zip on BIXI's open-data page and say
 * whether it differs from what public/data/history was built from.
 *
 *   npx tsx scripts/history/latest.ts [--force]
 *
 * Prints JSON and, under GitHub Actions, writes changed/url/etag/last_modified
 * to $GITHUB_OUTPUT. The filename grows as months are added
 * (…2026_010203.zip → …2026_01020304.zip), so the URL itself is the version.
 */
import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { UA, fetchRetry } from "../lib/net";

const PAGES = ["https://bixi.com/en/open-data/", "https://bixi.com/fr/donnees-ouvertes/"];

async function main() {
  let html = "";
  for (const p of PAGES) {
    try {
      html = (await fetchRetry(p, { headers: { "User-Agent": `Mozilla/5.0 ${UA}` } }, { tries: 3, label: p })).toString("utf8");
      if (html.includes(".zip")) break;
    } catch (err) {
      console.warn(`could not read ${p}: ${(err as Error).message}`);
    }
  }
  const links = [...new Set([...html.matchAll(/https?:\/\/[^"'\s>]+?\.zip/gi)].map((m) => m[0]))];
  const yearly = links
    .map((url) => ({ url, year: +(url.match(/(?:DonneesOuvertes?|Historique-BIXI-)(\d{4})/i)?.[1] ?? 0), months: (url.match(/\d{4}_(\d+)\.zip$/)?.[1].length ?? 24) / 2 }))
    .filter((z) => z.year > 2000)
    .sort((a, b) => b.year - a.year || b.months - a.months);
  if (!yearly.length) throw new Error("no trip-history zip found on the open-data page");
  const latest = yearly[0];

  // HEAD for validators: catches a re-upload under the same name
  const head = await fetch(latest.url, { method: "HEAD", headers: { "User-Agent": `Mozilla/5.0 ${UA}` } });
  const etag = head.headers.get("etag");
  const lastModified = head.headers.get("last-modified");
  const bytes = +(head.headers.get("content-length") ?? 0);

  const current = existsSync("public/data/history/source.json")
    ? (JSON.parse(await readFile("public/data/history/source.json", "utf8")) as { url: string; etag: string | null })
    : null;
  const changed = process.argv.includes("--force") || !current || current.url !== latest.url || (!!etag && !!current.etag && etag !== current.etag);
  const result = { changed, url: latest.url, year: latest.year, etag, lastModified, bytes, current: current?.url ?? null };
  console.log(JSON.stringify(result, null, 1));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${changed}\nurl=${latest.url}\netag=${etag ?? ""}\nlast_modified=${lastModified ?? ""}\nfile=${latest.url.split("/").pop()}\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
