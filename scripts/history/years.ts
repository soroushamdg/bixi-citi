/**
 * The per-year archive: one summary, a station-by-day matrix and a daily ride
 * sample for every year of BIXI open data.
 *
 *   npx tsx scripts/history/years.ts --zip .cache/history/X.zip [--year 2019] [--url …] [--etag …] [--last-modified …]
 *   npx tsx scripts/history/years.ts --all      # every zip in .cache/history (urls from .cache/history/urls.txt)
 *   npx tsx scripts/history/years.ts --index    # rebuild index.json from the per-year files
 */
import { mkdir, readFile, readdir, stat as fsStat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { haversine, project } from "../../lib/geo";
import { decodeTerrain, surfaceAt } from "../../lib/formats/terrain";
import {
  SAMPLE_PER_DAY, encodeYearDays, encodeYearSample, type DayStat, type YearSummary, type YearsIndex,
} from "../../lib/formats/years";
import { StationRegistry, dayISO, readTrips, weekdayOf } from "./read-trips";

const OUT = "public/data/years";
const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? "1" : all[i + 1] ?? "1"]] : acc), []),
);
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${s}`);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export const yearOfZip = (file: string) => +(basename(file).match(/(?:Historique-BIXI-|DonneesOuvertes?)(\d{4})/i)?.[1] ?? 0);

/** small deterministic PRNG so samples don't change between runs */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function processYear(zip: string, year: number, src: { url: string; etag: string | null; lastModified: string | null }) {
  const terrain = decodeTerrain(new Uint8Array(gunzipSync(await readFile("public/city/terrain.bin.gz"))).buffer);
  const reg = new StationRegistry();
  let cap = 1 << 21, n = 0;
  let cDay = new Int32Array(cap), cSod = new Int32Array(cap), cDur = new Uint32Array(cap), cS = new Uint16Array(cap), cE = new Uint16Array(cap), cM = new Int8Array(cap);
  const jan1 = Date.UTC(year, 0, 1) / 86400_000;
  const nDoy = (Date.UTC(year + 1, 0, 1) / 86400_000) - jan1;
  log(`${year}: reading ${basename(zip)}`);
  const stats = await readTrips(zip, reg, (t) => {
    const doy = t.day - jan1;
    if (doy < 0 || doy >= nDoy) return; // a few files spill over New Year
    if (n === cap) {
      cap *= 2;
      const g = <T extends Int32Array | Uint32Array | Uint16Array | Int8Array>(a: T, C: new (k: number) => T) => { const b = new C(cap); b.set(a); return b; };
      cDay = g(cDay, Int32Array); cSod = g(cSod, Int32Array); cDur = g(cDur, Uint32Array); cS = g(cS, Uint16Array); cE = g(cE, Uint16Array); cM = g(cM, Int8Array);
    }
    cDay[n] = doy; cSod[n] = t.sod; cDur[n] = t.dur; cS[n] = t.s; cE[n] = t.e; cM[n] = t.member; n++;
  });
  const N = reg.size;
  log(`${year}: ${stats.rows.toLocaleString()} rows → ${n.toLocaleString()} trips, ${N} stations`);
  if (!n) throw new Error(`${year}: no trips`);

  const elev = reg.lat.map((lat, i) => { const [x, y] = project(lat, reg.lon[i]); return surfaceAt(terrain, x, y); });
  const daily = new Array(nDoy).fill(0), monthly = new Array(12).fill(0);
  const hourly = new Float64Array(nDoy * 24);
  const stTrips = new Array(N).fill(0);
  let first = Infinity, last = -1, members = 0, known = 0, round = 0, down = 0, up = 0;
  const od = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const d = cDay[i];
    daily[d]++;
    hourly[d * 24 + Math.min(23, Math.floor(cSod[i] / 3600))]++;
    if (d < first) first = d;
    if (d > last) last = d;
    stTrips[cS[i]]++;
    if (cM[i] >= 0) { known++; members += cM[i]; }
    if (cS[i] === cE[i]) round++;
    else {
      const k = cS[i] * N + cE[i];
      od.set(k, (od.get(k) ?? 0) + 1);
      if (elev[cE[i]] < elev[cS[i]] - 2) down++;
      else if (elev[cE[i]] > elev[cS[i]] + 2) up++;
    }
  }
  for (let d = 0; d < nDoy; d++) monthly[new Date((jan1 + d) * 86400_000).getUTCMonth()] += daily[d];
  const months = monthly.map((v, m) => (v > 0 ? m + 1 : 0)).filter(Boolean);
  const served = daily.filter((v) => v > 0).sort((a, b) => a - b);
  const p95 = served[Math.floor(served.length * 0.95)] ?? 0;
  let sFrom = first, sTo = last;
  while (sFrom < last && daily[sFrom] < 0.25 * p95) sFrom++;
  while (sTo > sFrom && daily[sTo] < 0.25 * p95) sTo--;
  const stat = (d: number): DayStat => ({ date: dayISO(jan1 + d), trips: daily[d], weekday: weekdayOf(jan1 + d) });
  const all = Array.from({ length: nDoy }, (_, d) => d).filter((d) => daily[d] > 0);
  const peakDays = [...all].sort((a, b) => daily[b] - daily[a]).slice(0, 5).map(stat);
  const lowDays = all.filter((d) => d >= sFrom && d <= sTo).sort((a, b) => daily[a] - daily[b]).slice(0, 5).map(stat);
  let ph = 0;
  for (let k = 1; k < hourly.length; k++) if (hourly[k] > hourly[ph]) ph = k;
  const how = new Array(168).fill(0), wdCount = new Array(7).fill(0);
  let wdSum = 0, wdN = 0, weSum = 0, weN = 0;
  for (let d = sFrom; d <= sTo; d++) {
    if (!daily[d]) continue;
    const wd = weekdayOf(jan1 + d);
    wdCount[wd]++;
    for (let h = 0; h < 24; h++) how[wd * 24 + h] += hourly[d * 24 + h];
    if (wd < 5) { wdSum += daily[d]; wdN++; } else { weSum += daily[d]; weN++; }
  }
  for (let k = 0; k < 168; k++) how[k] = r1(how[k] / Math.max(1, wdCount[Math.floor(k / 24)]));

  const rand = mulberry32(year);
  const durs: number[] = [], kms: number[] = [];
  for (let i = 0; i < n; i += 7) {
    durs.push(cDur[i] / 60);
    if (cS[i] !== cE[i]) kms.push(haversine(reg.lat[cS[i]], reg.lon[cS[i]], reg.lat[cE[i]], reg.lon[cE[i]]) / 1000);
  }
  const topStations = stTrips.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i, v]) => ({ i, name: reg.name[i], departures: v }));
  const topRoutes = [...od].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => {
    const s = Math.floor(k / N), e = k % N;
    return { from: s, to: e, fromName: reg.name[s], toName: reg.name[e], trips: v };
  });

  /* station × day matrix over the service window */
  const days = last - first + 1;
  const dep = new Uint16Array(days * N), arr = new Uint16Array(days * N);
  const bump = (a: Uint16Array, k: number) => { if (a[k] < 65535) a[k]++; };
  for (let i = 0; i < n; i++) {
    const row = (cDay[i] - first) * N;
    bump(dep, row + cS[i]);
    // arrivals are counted on the day the ride started; overnight rides are rare
    bump(arr, row + cE[i]);
  }

  /* a fixed number of random rides per day for the fast-forward */
  const byDay: number[][] = Array.from({ length: nDoy }, () => []);
  for (let i = 0; i < n; i++) if (cS[i] !== cE[i]) byDay[cDay[i]].push(i);
  const sDoy: number[] = [], sMin: number[] = [], sSt: number[] = [], sEn: number[] = [];
  for (let d = 0; d < nDoy; d++) {
    const list = byDay[d];
    for (let k = 0; k < Math.min(SAMPLE_PER_DAY, list.length); k++) {
      const j = k + Math.floor(rand() * (list.length - k));
      [list[k], list[j]] = [list[j], list[k]];
    }
    const pickd = list.slice(0, SAMPLE_PER_DAY).sort((a, b) => cSod[a] - cSod[b]);
    for (const i of pickd) { sDoy.push(d); sMin.push(Math.floor(cSod[i] / 60)); sSt.push(cS[i]); sEn.push(cE[i]); }
  }

  const zipStat = await fsStat(zip);
  const summary: YearSummary = {
    year,
    source: { url: src.url, file: basename(src.url || zip), bytes: zipStat.size, etag: src.etag, lastModified: src.lastModified },
    generatedAt: new Date().toISOString(),
    rows: stats.rows,
    trips: n,
    excluded: stats.excluded,
    months,
    // only a year that is still being published can be incomplete; index.json has the final say
    partial: year >= new Date().getUTCFullYear() && last < Date.UTC(year, 11, 1) / 86400_000 - jan1,
    firstDay: dayISO(jan1 + first),
    lastDay: dayISO(jan1 + last),
    serviceDays: served.length,
    seasonFrom: dayISO(jan1 + sFrom),
    seasonTo: dayISO(jan1 + sTo),
    daily,
    monthly,
    peakDays,
    lowDays,
    peakHour: { date: dayISO(jan1 + Math.floor(ph / 24)), hour: ph % 24, trips: hourly[ph] },
    how,
    weekdayAvg: Math.round(wdSum / Math.max(1, wdN)),
    weekendAvg: Math.round(weSum / Math.max(1, weN)),
    medianMin: r1(median(durs)),
    medianKm: r2(median(kms)),
    downhill: r3(down / Math.max(1, down + up)),
    roundTrips: r3(round / n),
    memberShare: known > n * 0.5 ? r3(members / known) : null,
    stationsActive: stTrips.filter((v) => v > 0).length,
    topStations,
    topRoutes,
    stations: { name: reg.name, lat: reg.lat.map((v) => +v.toFixed(6)), lon: reg.lon.map((v) => +v.toFixed(6)) },
  };
  // per-station totals ride along for tooltips and year-over-year station counts
  (summary.stations as YearSummary["stations"] & { trips: number[] }).trips = stTrips;

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, `${year}.json`), JSON.stringify(summary));
  await writeFile(join(OUT, `${year}.days.bin.gz`), gzipSync(encodeYearDays(N, days, first, dep, arr), { level: 9 }));
  await writeFile(join(OUT, `${year}.sample.bin.gz`), gzipSync(encodeYearSample(sDoy, sMin, sSt, sEn, SAMPLE_PER_DAY), { level: 9 }));
  log(`${year}: ${n.toLocaleString()} trips, peak ${peakDays[0].date} (${peakDays[0].trips}), ${summary.stationsActive} stations, ${sDoy.length} sampled rides`);
}

async function buildIndex() {
  const files = (await readdir(OUT)).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  const ys: Array<YearSummary & { stations: YearSummary["stations"] & { trips?: number[] } }> = [];
  for (const f of files) ys.push(JSON.parse(await readFile(join(OUT, f), "utf8")));
  const idx: YearsIndex = {
    generatedAt: new Date().toISOString(),
    years: ys.map((y, k) => {
      const latest = k === ys.length - 1;
      const prev = ys[k - 1];
      let newStations: number | null = null, growth: number | null = null;
      if (prev && prev.year === y.year - 1) {
        const pa = prev.stations.lat.map((lat, i) => [lat, prev.stations.lon[i], prev.stations.trips?.[i] ?? 1]).filter((s) => s[2] > 0);
        newStations = y.stations.lat.filter((lat, i) => (y.stations.trips?.[i] ?? 1) > 0 && !pa.some((p) => Math.abs(p[0] - lat) < 0.0008 && Math.abs(p[1] - y.stations.lon[i]) < 0.0011)).length;
        const both = y.months.filter((m) => prev.months.includes(m));
        const a = both.reduce((s, m) => s + y.monthly[m - 1], 0), b = both.reduce((s, m) => s + prev.monthly[m - 1], 0);
        growth = b ? r3(a / b - 1) : null;
      }
      return {
        year: y.year, trips: y.trips, partial: latest && y.lastDay < `${y.year}-12-01`, months: y.months, stationsActive: y.stationsActive, newStations,
        peak: y.peakDays[0], medianMin: y.medianMin, memberShare: y.memberShare, growth, url: y.source.url, etag: y.source.etag,
      };
    }),
    allTimePeak: ys.map((y) => ({ ...y.peakDays[0], year: y.year })).sort((a, b) => b.trips - a.trips)[0],
  };
  await writeFile(join(OUT, "index.json"), JSON.stringify(idx, null, 1));
  log(`index.json: ${idx.years.length} years, all-time peak ${idx.allTimePeak.date} (${idx.allTimePeak.trips})`);
}

async function main() {
  if (args.index) return buildIndex();
  if (args.all) {
    const urls = existsSync(".cache/history/urls.txt") ? (await readFile(".cache/history/urls.txt", "utf8")).split("\n").filter(Boolean) : [];
    const zips = (await readdir(".cache/history")).filter((f) => f.endsWith(".zip")).sort();
    for (const z of zips) {
      const year = yearOfZip(z);
      if (!year || (args.only && !String(args.only).split(",").includes(String(year)))) continue;
      const url = urls.find((u) => u.endsWith("/" + z)) ?? "";
      await processYear(join(".cache/history", z), year, { url, etag: null, lastModified: null });
    }
    return buildIndex();
  }
  if (!args.zip) throw new Error("--zip, --all or --index is required");
  const year = +args.year || yearOfZip(args.url || args.zip);
  await processYear(args.zip, year, { url: args.url ?? "", etag: args.etag ?? null, lastModified: args["last-modified"] ?? null });
  await buildIndex();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
