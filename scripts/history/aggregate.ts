/**
 * Turn one BIXI open-data zip into the compact static files the site plays back.
 * Never runs on Vercel: CI (or you) runs it, the outputs are committed.
 *
 *   npx tsx scripts/history/aggregate.ts --zip .cache/history/X.zip --url https://cdn.bixi.com/... [--out public/data/history]
 *
 * Streams `unzip -p` (the CSV is ~2 GB), keeps trips as typed columns in memory
 * (~12 bytes per trip), then derives everything from those columns.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { haversine, project } from "../../lib/geo";
import { decodeTerrain, surfaceAt, type Terrain } from "../../lib/formats/terrain";
import { encodeDay, encodeFlows, DAY_CHUNKS, FLOWS_PER_HOUR } from "../../lib/formats/history";
import { WINDOWS, type HistoryMeta, type WindowKey, type WindowStats } from "../../lib/story";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const ZIP = args.zip;
const OUT = args.out ?? "public/data/history";
if (!ZIP) throw new Error("--zip is required");

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${s}`);

/* ---------- local time (America/Montreal) with an hourly offset cache ---------- */
const tzParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const offsetCache = new Map<number, number>();
/** seconds to add to a UTC epoch second to get Montréal wall-clock seconds */
function tzOffset(sec: number): number {
  const h = Math.floor(sec / 3600);
  let off = offsetCache.get(h);
  if (off === undefined) {
    const p = Object.fromEntries(tzParts.formatToParts(new Date(h * 3600_000)).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 1000;
    off = wall - h * 3600;
    offsetCache.set(h, off);
  }
  return off;
}
/** local day number (days since epoch in wall-clock time) and second of day */
const localOf = (sec: number) => {
  const w = sec + tzOffset(sec);
  const day = Math.floor(w / 86400);
  return { day, sod: w - day * 86400 };
};
const dayISO = (day: number) => new Date(day * 86400_000).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday */
const weekdayOf = (day: number) => (new Date(day * 86400_000).getUTCDay() + 6) % 7;

/* ---------- stations: keyed by name, split if the same name moves > 80 m ---------- */
interface St { name: string; boro: string; lat: number; lon: number; n: number }
const stations: St[] = [];
const byName = new Map<string, number[]>();
function stationIdx(name: string, boro: string, lat: number, lon: number): number {
  const list = byName.get(name);
  if (list) {
    for (const k of list) {
      const s = stations[k];
      if (Math.abs(s.lat - lat) < 0.0008 && Math.abs(s.lon - lon) < 0.0011) {
        // running mean keeps the position stable when coordinates jitter
        s.n++;
        if (s.n < 50) { s.lat += (lat - s.lat) / s.n; s.lon += (lon - s.lon) / s.n; }
        return k;
      }
    }
  }
  const k = stations.length;
  stations.push({ name, boro, lat, lon, n: 1 });
  if (list) list.push(k);
  else byName.set(name, [k]);
  return k;
}

/* ---------- growable typed columns ---------- */
let cap = 1 << 22, len = 0;
let cStart = new Uint32Array(cap), cDur = new Uint32Array(cap), cS = new Uint16Array(cap), cE = new Uint16Array(cap);
function push(start: number, dur: number, s: number, e: number) {
  if (len === cap) {
    cap *= 2;
    const g = <T extends Uint32Array | Uint16Array>(a: T, C: new (n: number) => T) => { const b = new C(cap); b.set(a); return b; };
    cStart = g(cStart, Uint32Array); cDur = g(cDur, Uint32Array); cS = g(cS, Uint16Array); cE = g(cE, Uint16Array);
  }
  cStart[len] = start; cDur[len] = dur; cS[len] = s; cE[len] = e; len++;
}

/* ---------- CSV ---------- */
function splitCsv(line: string): string[] {
  if (line.indexOf('"') === -1) return line.split(",");
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const excluded = { short: 0, long: 0, invalid: 0 };
let rows = 0;
let col: Record<string, number> = {};

function handleLine(line: string) {
  if (!line) return;
  if (rows === 0 && !Object.keys(col).length) {
    splitCsv(line.replace(/^﻿/, "")).forEach((h, i) => (col[h.trim().toUpperCase()] = i));
    for (const need of ["STARTSTATIONNAME", "STARTSTATIONLATITUDE", "STARTSTATIONLONGITUDE", "ENDSTATIONNAME", "ENDSTATIONLATITUDE", "ENDSTATIONLONGITUDE", "STARTTIMEMS", "ENDTIMEMS"])
      if (!(need in col)) throw new Error(`CSV is missing column ${need}; header was: ${line}`);
    return;
  }
  rows++;
  const f = splitCsv(line);
  const sLat = +f[col.STARTSTATIONLATITUDE], sLon = +f[col.STARTSTATIONLONGITUDE];
  const eLat = +f[col.ENDSTATIONLATITUDE], eLon = +f[col.ENDSTATIONLONGITUDE];
  const st = +f[col.STARTTIMEMS], en = +f[col.ENDTIMEMS];
  if (!(sLat > 40 && eLat > 40 && sLon < -60 && eLon < -60 && st > 1e12 && en >= st) || !f[col.STARTSTATIONNAME] || !f[col.ENDSTATIONNAME]) {
    excluded.invalid++;
    return;
  }
  const dur = Math.round((en - st) / 1000);
  if (dur < 60) { excluded.short++; return; }
  if (dur > 4 * 3600) { excluded.long++; return; }
  const s = stationIdx(f[col.STARTSTATIONNAME], f[col.STARTSTATIONARRONDISSEMENT] ?? "", sLat, sLon);
  const e = stationIdx(f[col.ENDSTATIONNAME], f[col.ENDSTATIONARRONDISSEMENT] ?? "", eLat, eLon);
  push(Math.floor(st / 1000), dur, s, e);
}

async function readZip(zip: string) {
  const child = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.setEncoding("utf8");
  let rest = "";
  for await (const chunk of child.stdout as AsyncIterable<string>) {
    const text = rest + chunk;
    let a = 0, b: number;
    while ((b = text.indexOf("\n", a)) !== -1) {
      handleLine(text.charCodeAt(b - 1) === 13 ? text.slice(a, b - 1) : text.slice(a, b));
      a = b + 1;
    }
    rest = text.slice(a);
    if (rows % 1_000_000 < 3000 && rows > 0) process.stdout.write(`\r  ${(rows / 1e6).toFixed(1)} M rows`);
  }
  if (rest) handleLine(rest);
  process.stdout.write("\n");
  const code: number = await new Promise((r) => child.on("close", r));
  if (code !== 0) throw new Error(`unzip exited with ${code}`);
}

const median = (a: ArrayLike<number>) => {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** a trip "goes downhill" when it ends at least this much lower (metres, true elevation) */
const SLOPE_M = 2;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

async function main() {
  const terrainPath = "public/city/terrain.bin.gz";
  if (!existsSync(terrainPath)) throw new Error(`${terrainPath} is missing; run the city build first (elevations come from it)`);
  const terrain: Terrain = decodeTerrain(new Uint8Array(gunzipSync(await readFile(terrainPath))).buffer);

  log(`reading ${ZIP}`);
  await readZip(ZIP);
  log(`${rows.toLocaleString()} rows → ${len.toLocaleString()} trips, ${stations.length} stations; excluded ${JSON.stringify(excluded)}`);

  const N = stations.length;
  const elev = new Float32Array(N), sx = new Float64Array(N), sy = new Float64Array(N);
  stations.forEach((s, i) => { const [x, y] = project(s.lat, s.lon); sx[i] = x; sy[i] = y; elev[i] = surfaceAt(terrain, x, y); });

  /* per-trip local day / second-of-day */
  const tDay = new Int32Array(len), tSod = new Int32Array(len);
  let minDay = Infinity, maxDay = -Infinity;
  for (let i = 0; i < len; i++) {
    const { day, sod } = localOf(cStart[i]);
    tDay[i] = day; tSod[i] = sod;
    if (day < minDay) minDay = day;
    if (day > maxDay) maxDay = day;
  }
  const nDays = maxDay - minDay + 1;
  const perDay = new Float64Array(nDays);
  for (let i = 0; i < len; i++) perDay[tDay[i] - minDay]++;
  const months = [...new Set(Array.from({ length: nDays }, (_, d) => (perDay[d] > 0 ? +dayISO(minDay + d).slice(5, 7) : 0)).filter(Boolean))].sort((a, b) => a - b);
  const year = +dayISO(minDay).slice(0, 4);

  /* season: the full network is out from the first day above 25% of the p95 day */
  const sortedDays = Array.from(perDay).filter((v) => v > 0).sort((a, b) => a - b);
  const p95 = sortedDays[Math.floor(sortedDays.length * 0.95)] ?? 0;
  let seasonStart = 0;
  while (seasonStart < nDays && perDay[seasonStart] < 0.25 * p95) seasonStart++;
  const inSeason = (d: number) => d >= seasonStart && perDay[d] > 0;
  const seasonDays = Array.from({ length: nDays }, (_, d) => d).filter(inSeason);
  const fullSeasonMonth = months.some((m) => m >= 4 && m <= 10 && seasonDays.filter((d) => +dayISO(minDay + d).slice(5, 7) === m).length >= 28);
  if (!fullSeasonMonth && !args.force) {
    console.log(`SKIP: ${basename(ZIP)} has no complete April–October month yet; keeping the current outputs.`);
    process.exitCode = 3;
    return;
  }
  const wdCount = new Float64Array(7);
  for (const d of seasonDays) wdCount[weekdayOf(minDay + d)]++;

  /* story day: Tue–Thu at the 90th percentile of weekday volume, skipping holidays */
  const HOLI = new Set(["06-24", "07-01", "09-07", "05-18", "10-12", "01-01", "12-25"]);
  const cands = seasonDays
    .filter((d) => [1, 2, 3].includes(weekdayOf(minDay + d)) && !HOLI.has(dayISO(minDay + d).slice(5)))
    .sort((a, b) => perDay[a] - perDay[b]);
  const pick = cands[Math.min(cands.length - 1, Math.floor(cands.length * 0.9))];
  const storyDay = minDay + pick;
  log(`story day ${dayISO(storyDay)} with ${perDay[pick]} trips (of ${cands.length} Tue–Thu candidates)`);

  /* ---------- per-station averages over the season ---------- */
  const isWeekend = (day: number) => weekdayOf(day) >= 5;
  const nWd = seasonDays.filter((d) => !isWeekend(minDay + d)).length;
  const nWe = seasonDays.length - nWd;
  const depWd = new Float64Array(N * 24), arrWd = new Float64Array(N * 24), depWe = new Float64Array(N * 24), arrWe = new Float64Array(N * 24);
  const how = new Float64Array(7 * 24);
  const curveWd = new Float64Array(144), curveWe = new Float64Array(144);
  const odHow = new Map<number, number>(); // (how * N + s) * N + e  -> count
  const durS: number[] = [], distS: number[] = [];
  let down = 0, up = 0, moved = 0, round = 0;
  for (let i = 0; i < len; i++) {
    const d = tDay[i] - minDay;
    if (!inSeason(d)) continue;
    const day = tDay[i], wd = weekdayOf(day), h = Math.floor(tSod[i] / 3600), we = wd >= 5;
    const s = cS[i], e = cE[i];
    const endSod = tSod[i] + cDur[i], eh = Math.floor(endSod / 3600) % 24;
    if (we) { depWe[s * 24 + h]++; arrWe[e * 24 + eh]++; curveWe[Math.floor(tSod[i] / 600)]++; }
    else { depWd[s * 24 + h]++; arrWd[e * 24 + eh]++; curveWd[Math.floor(tSod[i] / 600)]++; }
    how[wd * 24 + h]++;
    if (s !== e) {
      const key = ((wd * 24 + h) * N + s) * N + e;
      odHow.set(key, (odHow.get(key) ?? 0) + 1);
      moved++;
      if (elev[e] < elev[s] - SLOPE_M) down++;
      else if (elev[e] > elev[s] + SLOPE_M) up++;
    } else round++;
    if ((i & 7) === 0) { durS.push(cDur[i] / 60); if (s !== e) distS.push(haversine(stations[s].lat, stations[s].lon, stations[e].lat, stations[e].lon) / 1000); }
  }
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) how[wd * 24 + h] /= Math.max(1, wdCount[wd]);
  for (let k = 0; k < 144; k++) { curveWd[k] = (curveWd[k] / Math.max(1, nWd)) * 6; curveWe[k] = (curveWe[k] / Math.max(1, nWe)) * 6; }
  const net = new Float64Array(N), tot = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let a = 0, b = 0;
    for (let h = 0; h < 24; h++) { a += arrWd[i * 24 + h] + arrWe[i * 24 + h]; b += depWd[i * 24 + h] + depWe[i * 24 + h]; }
    net[i] = (a - b) / Math.max(1, seasonDays.length);
    tot[i] = a + b;
  }
  for (let k = 0; k < N * 24; k++) { depWd[k] /= Math.max(1, nWd); arrWd[k] /= Math.max(1, nWd); depWe[k] /= Math.max(1, nWe); arrWe[k] /= Math.max(1, nWe); }

  /* top OD pairs per hour of week */
  const flows: Array<Array<[number, number, number]>> = Array.from({ length: 168 }, () => []);
  for (const [key, c] of odHow) {
    const e = key % N, s = Math.floor(key / N) % N, hw = Math.floor(key / N / N);
    const avg = c / Math.max(1, wdCount[Math.floor(hw / 24)]);
    const list = flows[hw];
    list.push([s, e, avg]);
    if (list.length > FLOWS_PER_HOUR * 4) { list.sort((a, b) => b[2] - a[2]); list.length = FLOWS_PER_HOUR; }
  }
  for (const list of flows) { list.sort((a, b) => b[2] - a[2]); list.length = Math.min(list.length, FLOWS_PER_HOUR); }

  /* ---------- story day ---------- */
  const dayIdx: number[] = [];
  for (let i = 0; i < len; i++) if (tDay[i] === storyDay) dayIdx.push(i);
  dayIdx.sort((a, b) => tSod[a] - tSod[b]);
  const storyCurve = new Float64Array(144);
  for (const i of dayIdx) storyCurve[Math.floor(tSod[i] / 600)] += 6;
  let peakHour = 0;
  const perHour = new Float64Array(24);
  for (const i of dayIdx) perHour[Math.floor(tSod[i] / 3600)]++;
  perHour.forEach((v, h) => { if (v > perHour[peakHour]) peakHour = h; });

  // borough shares over the whole story day, to find what is special about each window
  const dayFrom = new Map<string, number>(), dayTo = new Map<string, number>();
  for (const i of dayIdx) {
    dayFrom.set(stations[cS[i]].boro, (dayFrom.get(stations[cS[i]].boro) ?? 0) + 1);
    dayTo.set(stations[cE[i]].boro, (dayTo.get(stations[cE[i]].boro) ?? 0) + 1);
  }
  const windowStats = (from: number, to: number): WindowStats => {
    const sel = dayIdx.filter((i) => tSod[i] >= from * 60 && tSod[i] < to * 60);
    let dn = 0, upc = 0, mv = 0, drop = 0;
    const km: number[] = [], mins: number[] = [];
    const fromBoro = new Map<string, number>(), toBoro = new Map<string, number>();
    const fromSt = new Map<number, number>(), toSt = new Map<number, number>();
    for (const i of sel) {
      const s = cS[i], e = cE[i];
      mins.push(cDur[i] / 60);
      fromBoro.set(stations[s].boro, (fromBoro.get(stations[s].boro) ?? 0) + 1);
      toBoro.set(stations[e].boro, (toBoro.get(stations[e].boro) ?? 0) + 1);
      fromSt.set(s, (fromSt.get(s) ?? 0) + 1);
      toSt.set(e, (toSt.get(e) ?? 0) + 1);
      if (s === e) continue;
      mv++;
      drop += elev[e] - elev[s];
      if (elev[e] < elev[s] - SLOPE_M) dn++;
      else if (elev[e] > elev[s] + SLOPE_M) upc++;
      km.push(haversine(stations[s].lat, stations[s].lon, stations[e].lat, stations[e].lon) / 1000);
    }
    // boroughs over-represented in this window compared with the whole day (≥ 3 % of the window)
    const lift = (m: Map<string, number>, day: Map<string, number>) =>
      [...m]
        .filter(([k, v]) => k && v >= sel.length * 0.03)
        .map(([k, v]) => [k, v / sel.length / ((day.get(k) ?? 1) / dayIdx.length)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);
    const topSt = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => stations[k].name);
    return {
      trips: sel.length, downhill: r3(dn / Math.max(1, dn + upc)), down: dn, up: upc,
      medianKm: r2(median(km)), medianMin: r1(median(mins)), meanDrop: r1(drop / Math.max(1, mv)),
      topFrom: lift(fromBoro, dayFrom), topTo: lift(toBoro, dayTo), topFromStations: topSt(fromSt), topToStations: topSt(toSt),
    };
  };
  const windows = Object.fromEntries((Object.keys(WINDOWS) as WindowKey[]).map((k) => [k, windowStats(WINDOWS[k][0], WINDOWS[k][1])])) as Record<WindowKey, WindowStats>;

  /* ---------- write ---------- */
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, "day"), { recursive: true });

  const busiest = perDay.reduce((b, v, d) => (v > perDay[b] ? d : b), 0);
  const zipStat = await stat(ZIP);
  const meta: HistoryMeta = {
    year,
    months,
    source: { url: args.url ?? "", file: basename(args.url ?? ZIP), bytes: zipStat.size, lastModified: args["last-modified"] ?? null, etag: args.etag ?? null },
    generatedAt: new Date().toISOString(),
    rows,
    trips: len,
    excluded,
    firstDay: dayISO(minDay),
    lastDay: dayISO(maxDay),
    seasonFrom: dayISO(minDay + seasonStart),
    seasonDays: seasonDays.length,
    stations: N,
    medianMin: r1(median(durS)),
    medianKm: r2(median(distS)),
    downhill: r3(down / Math.max(1, down + up)),
    slopeShare: r3((down + up) / Math.max(1, moved)),
    roundTrips: r3(round / Math.max(1, moved + round)),
    busiestDay: { date: dayISO(minDay + busiest), trips: perDay[busiest] },
    storyDay: { date: dayISO(storyDay), weekday: weekdayOf(storyDay), trips: dayIdx.length, percentile: 90, peakHour, peakTrips: perHour[peakHour] },
    windows,
    pile: {
      gainers: Array.from(net).filter((v) => v > 2).length,
      losers: Array.from(net).filter((v) => v < -2).length,
      haulPerDay: Math.round(Array.from(net).reduce((a, v) => a + (v > 0 ? v : 0), 0)),
    },
  };
  await writeFile(join(OUT, "meta.json"), JSON.stringify(meta, null, 1));

  const round1 = (a: Float64Array) => Array.from(a, (v) => Math.round(v * 10) / 10);
  await writeFile(
    join(OUT, "stations.json"),
    JSON.stringify({
      name: stations.map((s) => s.name),
      boro: stations.map((s) => s.boro),
      lat: stations.map((s) => +s.lat.toFixed(6)),
      lon: stations.map((s) => +s.lon.toFixed(6)),
      elev: Array.from(elev, (v) => Math.round(v * 10) / 10),
      net: round1(net),
      trips: Array.from(tot),
      depWd: round1(depWd), arrWd: round1(arrWd), depWe: round1(depWe), arrWe: round1(arrWe),
    }),
  );
  await writeFile(
    join(OUT, "rhythm.json"),
    JSON.stringify({ how: round1(how), curveWd: round1(curveWd), curveWe: round1(curveWe), story: Array.from(storyCurve), weekdays: Array.from(wdCount) }),
  );
  await writeFile(join(OUT, "flows.bin.gz"), gzipSync(encodeFlows(flows), { level: 9 }));

  for (let k = 0; k < DAY_CHUNKS; k++) {
    const span = 86400 / DAY_CHUNKS;
    const sel = dayIdx.filter((i) => tSod[i] >= k * span && tSod[i] < (k + 1) * span);
    const buf = encodeDay(sel.map((i) => tSod[i]), sel.map((i) => cDur[i]), sel.map((i) => cS[i]), sel.map((i) => cE[i]));
    await writeFile(join(OUT, "day", `${k}.bin.gz`), gzipSync(buf, { level: 9 }));
  }
  await writeFile(join(OUT, "source.json"), JSON.stringify({ url: meta.source.url, etag: meta.source.etag, lastModified: meta.source.lastModified }, null, 1));
  log(`wrote ${OUT}: story ${dayIdx.length} trips, ${N} stations, downhill ${(meta.downhill * 100).toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
