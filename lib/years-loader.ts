"use client";
/**
 * Years data in the browser.
 *
 * - index.json (small, short cache) names the immutable files.
 * - summaries.{hash}.json: every year's numbers in one go, so the panel switches instantly.
 * - {year}.{hash}.pack.gz: one file per year for the map. Hashed names are cached by the
 *   browser for a year, so past years download once, ever.
 *
 * Packs stream with byte-level progress, the last few stay decoded in memory, and the
 * neighbours of the selected year are fetched in the background so switching (and
 * rolling from one season into the next) does not wait.
 */
import { data, ui } from "./store";
import { decodeYearPack, type YearPack, type YearSummary, type YearsIndex } from "./formats/years";

const BASE = "/data/years";
const KEEP = 4;

export type LoadPhase = "queued" | "waiting" | "fetch" | "decode" | "ready" | "error";
export interface YearLoad {
  year: number;
  phase: LoadPhase;
  received: number;
  total: number;
  /** bytes per second, smoothed */
  speed: number;
  /** came from the browser cache (no meaningful transfer) */
  cached: boolean;
  /** started by the user rather than a background prefetch */
  foreground: boolean;
  error?: string;
}

const packs = new Map<number, YearPack>();
const inflight = new Map<number, Promise<YearPack>>();
const queue: number[] = [];
/** background downloads give way when the user asks for another year */
const background = new Map<number, AbortController>();
let prefetching = false;

function setLoad(year: number, patch: Partial<YearLoad>) {
  const cur = data.getState().yearLoads[year] ?? { year, phase: "queued", received: 0, total: 0, speed: 0, cached: false, foreground: false };
  data.setState({ yearLoads: { ...data.getState().yearLoads, [year]: { ...cur, ...patch } } });
}

export async function loadYearsIndex() {
  const res = await fetch(`${BASE}/index.json`, { cache: "no-cache" });
  if (!res.ok) return;
  const years = (await res.json()) as YearsIndex;
  data.setState({ years });
  if (!ui.getState().year && years.years.length) {
    // start on the latest complete year
    const full = [...years.years].reverse().find((y) => !y.partial) ?? years.years[years.years.length - 1];
    ui.setState({ year: full.year });
  }
  const sres = await fetch(`${BASE}/${years.summaries.file}`);
  if (!sres.ok) return;
  const list = (await sres.json()) as YearSummary[];
  const map = new Map(list.map((y) => [y.year, y]));
  data.setState({ yearSummaries: map });
  const sel = ui.getState().year;
  if (sel && map.get(sel)) data.setState({ yearSummary: map.get(sel)! });
}

/** Read a response body with progress callbacks. */
async function readWithProgress(res: Response, expected: number, on: (got: number, total: number) => void) {
  const total = +(res.headers.get("content-length") ?? 0) || expected;
  if (!res.body) return new Uint8Array(await res.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    on(got, Math.max(total, got));
  }
  const out = new Uint8Array(new ArrayBuffer(got));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function inflate(u8: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8.slice().buffer;
  return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/** Fetch and decode one year's pack (deduplicated, cached in memory). */
export function loadPack(year: number, foreground: boolean): Promise<YearPack> {
  const have = packs.get(year);
  if (have) {
    packs.delete(year);
    packs.set(year, have); // LRU touch
    if (foreground) setLoad(year, { phase: "ready", foreground });
    return Promise.resolve(have);
  }
  const running = inflight.get(year);
  if (running) {
    if (foreground) setLoad(year, { foreground: true });
    return running;
  }
  const entry = data.getState().years?.years.find((y) => y.year === year);
  if (!entry) return Promise.reject(new Error(`no pack for ${year}`));
  if (foreground) {
    for (const [y, c] of background) { c.abort(); background.delete(y); if (!queue.includes(y)) queue.unshift(y); }
  }
  const ctl = new AbortController();
  if (!foreground) background.set(year, ctl);
  const p = (async () => {
    const url = `${BASE}/${entry.pack.file}`;
    setLoad(year, { phase: "waiting", received: 0, total: entry.pack.bytes, speed: 0, cached: false, foreground, error: undefined });
    const t0 = performance.now();
    let lastT = t0, lastB = 0, speed = 0;
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const firstByte = performance.now() - t0;
    const raw = await readWithProgress(res, entry.pack.bytes, (got, total) => {
      const now = performance.now();
      if (now - lastT > 60) {
        const inst = ((got - lastB) / (now - lastT)) * 1000;
        speed = speed ? speed * 0.7 + inst * 0.3 : inst;
        lastT = now;
        lastB = got;
      }
      setLoad(year, { phase: "fetch", received: got, total, speed });
    });
    const took = performance.now() - t0;
    // a hit in the browser cache arrives in one gulp, almost instantly
    const cached = took < 60 || (firstByte < 15 && took < 120);
    setLoad(year, { phase: "decode", received: raw.length, total: raw.length, cached });
    // let the bar paint "decoding" before the main thread is busy
    await new Promise((r) => setTimeout(r, 0));
    const pack = decodeYearPack(await inflate(raw));
    packs.set(year, pack);
    while (packs.size > KEEP) {
      const oldest = packs.keys().next().value as number;
      if (oldest === ui.getState().year) { packs.delete(oldest); packs.set(oldest, pack); break; }
      packs.delete(oldest);
    }
    setLoad(year, { phase: "ready" });
    return pack;
  })();
  inflight.set(year, p);
  p.catch((err) => {
    // an aborted prefetch is not an error: forget it, it is back in the queue
    if ((err as Error).name === "AbortError") {
      const loads = { ...data.getState().yearLoads };
      delete loads[year];
      data.setState({ yearLoads: loads });
    } else setLoad(year, { phase: "error", error: (err as Error).message });
  }).finally(() => { inflight.delete(year); background.delete(year); });
  return p;
}

export const isPackReady = (year: number) => packs.has(year);

/** Background fetches, one at a time, after the foreground load is done. */
export function prefetch(years: number[]) {
  for (const y of years) if (!packs.has(y) && !inflight.has(y) && !queue.includes(y)) queue.push(y);
  void pump();
}
async function pump() {
  if (prefetching) return;
  prefetching = true;
  try {
    for (let y = queue.shift(); y !== undefined; y = queue.shift()) {
      // let a foreground load go first
      while ([...inflight.keys()].some((k) => data.getState().yearLoads[k]?.foreground)) await new Promise((r) => setTimeout(r, 200));
      await new Promise((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(null), { timeout: 1500 }) : setTimeout(r, 300)));
      await loadPack(y, false).catch(() => undefined);
    }
  } finally {
    prefetching = false;
  }
}

/** Neighbours worth having ready: the next season first, then the previous one. */
export function neighbours(year: number) {
  const ys = data.getState().years?.years.map((y) => y.year) ?? [];
  const i = ys.indexOf(year);
  return [ys[i + 1], ys[i - 1]].filter((y): y is number => y !== undefined);
}

/**
 * Make `year` the selected year: numbers appear at once from the summaries,
 * the map data arrives when its pack is ready. Resolves when the pack is in.
 */
export async function showYear(year: number): Promise<boolean> {
  const sum = data.getState().yearSummaries?.get(year) ?? null;
  const cachedPack = packs.get(year);
  data.setState({
    yearSummary: sum,
    yearDays: cachedPack?.days ?? null,
    yearSample: cachedPack?.sample ?? null,
    yearStations: cachedPack?.stations ?? null,
  });
  try {
    const pack = await loadPack(year, true);
    if (ui.getState().year !== year) return false;
    if (data.getState().yearDays !== pack.days)
      data.setState({ yearDays: pack.days, yearSample: pack.sample, yearStations: pack.stations, yearSummary: data.getState().yearSummaries?.get(year) ?? sum });
    prefetch(neighbours(year));
    return true;
  } catch {
    return false;
  }
}
