"use client";
import { data, ui, type HistStations, type Rhythm } from "./store";
import { decodeDay, decodeFlows, DAY_CHUNKS } from "./formats/history";
import { diffSnapshots, scheduleReplay, type ReplayPulse } from "./live/diff";
import type { LiveStatus, StationInfo } from "./gbfs";
import type { HistoryMeta } from "./story";
import { project } from "./geo";

/** Fetch a pre-gzipped static file and inflate it in the browser. */
export async function fetchGz(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  // some proxies decode Content-Encoding for us; only inflate real gzip
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

const HIST = "/data/history";

export async function loadHistory() {
  const [meta, hist, rhythm] = await Promise.all([
    fetch(`${HIST}/meta.json`).then((r) => r.json() as Promise<HistoryMeta>),
    fetch(`${HIST}/stations.json`).then((r) => r.json() as Promise<HistStations>),
    fetch(`${HIST}/rhythm.json`).then((r) => r.json() as Promise<Rhythm>),
  ]);
  data.setState({ meta, hist, rhythm });
  matchStations();
  // the story starts in the morning: load that chunk first
  const order = [1, 2, 3, 0].slice(0, DAY_CHUNKS);
  for (const k of order) {
    const day = decodeDay(await fetchGz(`${HIST}/day/${k}.bin.gz`));
    const next = data.getState().day.slice();
    next[k] = day;
    data.setState({ day: next });
  }
  data.setState({ flows: decodeFlows(await fetchGz(`${HIST}/flows.bin.gz`)) });
}

/** Pair every history station with the live station within 60 m (same dock, maybe renamed). */
export function matchStations() {
  const { info, hist } = data.getState();
  if (!info || !hist) return;
  const C = 60, cells = new Map<string, number[]>();
  const lx = info.lat.map((lat, i) => project(lat, info.lon[i]));
  lx.forEach(([x, y], i) => {
    const k = `${Math.floor(x / C)},${Math.floor(y / C)}`;
    const l = cells.get(k);
    if (l) l.push(i); else cells.set(k, [i]);
  });
  const h2l = new Int32Array(hist.name.length).fill(-1);
  const l2h = new Int32Array(info.ids.length).fill(-1);
  const best = new Float64Array(info.ids.length).fill(Infinity);
  hist.lat.forEach((lat, h) => {
    const [x, y] = project(lat, hist.lon[h]);
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    let bi = -1, bd = C * C;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const i of cells.get(`${cx + a},${cy + b}`) ?? []) {
          const d = (lx[i][0] - x) ** 2 + (lx[i][1] - y) ** 2;
          if (d < bd) { bd = d; bi = i; }
        }
    h2l[h] = bi;
    // the busiest history station wins when two share a dock
    if (bi >= 0 && (l2h[bi] < 0 || hist.trips[h] > hist.trips[l2h[bi]] || bd < best[bi] * 0.25)) { l2h[bi] = h; best[bi] = bd; }
  });
  data.setState({ histToLive: h2l, liveToHist: l2h });
}

/* ---------- live ---------- */
type PulseListener = (p: ReplayPulse & { index: number }) => void;
const pulseListeners = new Set<PulseListener>();
export const onLivePulse = (fn: PulseListener) => {
  pulseListeners.add(fn);
  return () => pulseListeners.delete(fn);
};

const POLL_MS = 15_000;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let replayTimers: ReturnType<typeof setTimeout>[] = [];

function applyStatus(s: LiveStatus) {
  const { info, idIndex } = data.getState();
  if (!info) return;
  const n = info.ids.length;
  const bikes = new Int16Array(n).fill(-1), ebikes = new Int16Array(n), docks = new Int16Array(n);
  s.ids.forEach((id, j) => {
    const i = idIndex.get(id);
    if (i === undefined) return;
    bikes[i] = s.b[j]; ebikes[i] = s.e[j]; docks[i] = s.d[j];
  });
  data.setState({ status: s, bikes, ebikes, docks, liveError: null });
}

async function pollOnce() {
  try {
    const res = await fetch("/api/gbfs/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`status HTTP ${res.status}`);
    const next = (await res.json()) as LiveStatus;
    const prev = data.getState().status;
    if (prev && next.t <= prev.t) return; // the CDN served the same snapshot
    applyStatus(next);
    if (prev) {
      const diff = diffSnapshots(prev, next);
      const activity = [...data.getState().activity, { ...diff, at: Date.now() }].slice(-60);
      data.setState({ activity });
      replayTimers.forEach(clearTimeout);
      replayTimers = [];
      const { idIndex } = data.getState();
      for (const p of scheduleReplay(diff, Math.min(next.t - prev.t, 45))) {
        const index = idIndex.get(p.id);
        if (index === undefined) continue;
        replayTimers.push(setTimeout(() => pulseListeners.forEach((fn) => fn({ ...p, index })), p.at * 1000));
      }
    }
  } catch (err) {
    data.setState({ liveError: (err as Error).message });
  }
}

export async function startLive() {
  try {
    const info = (await fetch("/api/gbfs/stations").then((r) => {
      if (!r.ok) throw new Error(`stations HTTP ${r.status}`);
      return r.json();
    })) as StationInfo;
    data.setState({ info, idIndex: new Map(info.ids.map((id, i) => [id, i])) });
    matchStations();
  } catch (err) {
    data.setState({ liveError: (err as Error).message });
    return;
  }
  const loop = async () => {
    if (document.visibilityState === "visible") await pollOnce();
    pollTimer = setTimeout(loop, POLL_MS);
  };
  await loop();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pollTimer) {
      clearTimeout(pollTimer);
      loop();
    }
  });
}

/** Montréal wall clock, refreshed by the UI tick. */
const tzF = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function montrealNow() {
  const p = Object.fromEntries(tzF.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: Math.max(0, WD.indexOf(p.weekday.slice(0, 3))), minute: (+p.hour % 24) * 60 + +p.minute };
}
export function tickLiveClock() {
  ui.setState({ liveMinute: montrealNow().minute });
}
