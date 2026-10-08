/**
 * Read any BIXI yearly trip-history zip into plain trips.
 *
 * BIXI's open data has changed shape over the years:
 *   2014–2020  OD_*.csv  start_date, start_station_code, end_date, end_station_code, duration_sec, is_member
 *              + Stations_*.csv  code, name, latitude, longitude   (local wall-clock times)
 *   2021       start_date, emplacement_pk_start, …, is_member  + stations.csv  pk, name, latitude, longitude
 *   2023→      STARTSTATIONNAME, …ARRONDISSEMENT, …LATITUDE, …LONGITUDE, STARTTIMEMS, ENDTIMEMS   (epoch ms)
 * Columns are found by name, so in-between variants work as long as they use one of these vocabularies.
 */
import { spawn, execFileSync } from "node:child_process";

export interface Trip {
  /** local day number (days since 1970-01-01 in Montréal wall-clock time) */
  day: number;
  /** seconds after local midnight */
  sod: number;
  /** seconds */
  dur: number;
  s: number;
  e: number;
  /** 1 member, 0 occasional, -1 unknown */
  member: number;
}

/* ---------- time ---------- */
const tzParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const offsetCache = new Map<number, number>();
export function tzOffset(sec: number): number {
  const h = Math.floor(sec / 3600);
  let off = offsetCache.get(h);
  if (off === undefined) {
    const p = Object.fromEntries(tzParts.formatToParts(new Date(h * 3600_000)).map((x) => [x.type, x.value]));
    off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 1000 - h * 3600;
    offsetCache.set(h, off);
  }
  return off;
}
export const dayISO = (day: number) => new Date(day * 86400_000).toISOString().slice(0, 10);
export const weekdayOf = (day: number) => (new Date(day * 86400_000).getUTCDay() + 6) % 7;

/** "2019-04-14 07:55:22(.123)" (local) → [day, sod]; null if malformed */
function parseLocal(v: string): [number, number] | null {
  if (v.length < 16 || v.charCodeAt(4) !== 45) return null;
  const y = +v.slice(0, 4), mo = +v.slice(5, 7), d = +v.slice(8, 10), h = +v.slice(11, 13), mi = +v.slice(14, 16);
  const s = v.length >= 19 ? +v.slice(17, 19) : 0;
  if (!(y > 2000) || !(mo >= 1) || !(d >= 1)) return null;
  return [Date.UTC(y, mo - 1, d) / 86400_000, h * 3600 + mi * 60 + (s || 0)];
}
function parseTime(v: string): [number, number, number] | null {
  // returns [day, sod, epochSecondsish] — the third value is only used for differences
  const c = v.charCodeAt(0);
  if (c >= 48 && c <= 57 && v.indexOf("-") === -1) {
    const ms = +v;
    if (!(ms > 1e11)) return null;
    const sec = Math.floor(ms / 1000);
    const w = sec + tzOffset(sec);
    const day = Math.floor(w / 86400);
    return [day, w - day * 86400, ms / 1000];
  }
  const p = parseLocal(v);
  return p ? [p[0], p[1], p[0] * 86400 + p[1]] : null;
}

/* ---------- csv ---------- */
export function splitCsv(line: string): string[] {
  if (line.indexOf('"') === -1) return line.split(",");
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function streamLines(zip: string, entry: string, onLine: (line: string) => void) {
  const child = spawn("unzip", ["-p", zip, entry], { stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.setEncoding("utf8");
  let rest = "";
  for await (const chunk of child.stdout as AsyncIterable<string>) {
    const text = rest + chunk;
    let a = 0, b: number;
    while ((b = text.indexOf("\n", a)) !== -1) {
      onLine(text.charCodeAt(b - 1) === 13 ? text.slice(a, b - 1) : text.slice(a, b));
      a = b + 1;
    }
    rest = text.slice(a);
  }
  if (rest) onLine(rest.replace(/\r$/, ""));
  const code: number = await new Promise((r) => child.on("close", r));
  if (code !== 0) throw new Error(`unzip ${entry} exited with ${code}`);
}

/* ---------- stations ---------- */
export class StationRegistry {
  name: string[] = [];
  boro: string[] = [];
  lat: number[] = [];
  lon: number[] = [];
  n: number[] = [];
  private byName = new Map<string, number[]>();
  /** same name within ~80 m is the same station; a moved station gets a new index */
  add(name: string, lat: number, lon: number, boro = ""): number {
    const key = name.trim();
    const list = this.byName.get(key);
    if (list)
      for (const k of list)
        if (Math.abs(this.lat[k] - lat) < 0.0008 && Math.abs(this.lon[k] - lon) < 0.0011) {
          const c = ++this.n[k];
          if (c < 50) { this.lat[k] += (lat - this.lat[k]) / c; this.lon[k] += (lon - this.lon[k]) / c; }
          return k;
        }
    const k = this.name.length;
    this.name.push(key); this.boro.push(boro); this.lat.push(lat); this.lon.push(lon); this.n.push(1);
    if (list) list.push(k); else this.byName.set(key, [k]);
    return k;
  }
  get size() { return this.name.length; }
}

const pick = (col: Record<string, number>, ...names: string[]) => {
  for (const n of names) if (n in col) return col[n];
  return -1;
};

export interface ReadStats { rows: number; excluded: { short: number; long: number; invalid: number } }

export async function readTrips(zip: string, reg: StationRegistry, onTrip: (t: Trip) => void): Promise<ReadStats> {
  const entries = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8", maxBuffer: 1 << 24 })
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /\.csv$/i.test(s) && !s.includes("__MACOSX"));
  const stationFiles = entries.filter((e) => /station/i.test(e.split("/").pop()!));
  const tripFiles = entries.filter((e) => !stationFiles.includes(e)).sort();

  // station code → registry index (code-based years)
  const byCode = new Map<string, number>();
  for (const f of stationFiles) {
    let col: Record<string, number> | null = null;
    await streamLines(zip, f, (line) => {
      if (!line.trim()) return;
      const v = splitCsv(line.replace(/^﻿/, ""));
      if (!col) { col = Object.fromEntries(v.map((h, i) => [h.trim().toLowerCase(), i])); return; }
      const code = v[pick(col, "code", "pk", "emplacement_pk")]?.trim();
      const lat = +v[pick(col, "latitude", "lat")], lon = +v[pick(col, "longitude", "lon")];
      if (!code || !(lat > 40) || !(lon < -60)) return;
      byCode.set(code, reg.add(v[pick(col, "name", "nom")] ?? code, lat, lon));
    });
  }

  const stats: ReadStats = { rows: 0, excluded: { short: 0, long: 0, invalid: 0 } };
  for (const f of tripFiles) {
    let col: Record<string, number> | null = null;
    let iS = -1, iE = -1, iSs = -1, iEs = -1, iSn = -1, iSb = -1, iSlat = -1, iSlon = -1, iEn = -1, iEb = -1, iElat = -1, iElon = -1, iDur = -1, iMem = -1;
    await streamLines(zip, f, (line) => {
      if (!line) return;
      const v = splitCsv(col ? line : line.replace(/^﻿/, ""));
      if (!col) {
        col = Object.fromEntries(v.map((h, i) => [h.trim().toLowerCase(), i]));
        iS = pick(col, "starttimems", "start_date", "start_time", "starttime");
        iE = pick(col, "endtimems", "end_date", "end_time", "endtime");
        iSs = pick(col, "start_station_code", "emplacement_pk_start", "startstationcode");
        iEs = pick(col, "end_station_code", "emplacement_pk_end", "endstationcode");
        iSn = pick(col, "startstationname"); iSb = pick(col, "startstationarrondissement");
        iSlat = pick(col, "startstationlatitude"); iSlon = pick(col, "startstationlongitude");
        iEn = pick(col, "endstationname"); iEb = pick(col, "endstationarrondissement");
        iElat = pick(col, "endstationlatitude"); iElon = pick(col, "endstationlongitude");
        iDur = pick(col, "duration_sec", "durationsec");
        iMem = pick(col, "is_member", "ismember");
        if (iS < 0 || (iSs < 0 && iSn < 0)) throw new Error(`${f}: unknown columns ${line.slice(0, 200)}`);
        return;
      }
      stats.rows++;
      const st = parseTime(v[iS]);
      let s = -1, e = -1;
      if (iSs >= 0) { s = byCode.get(v[iSs]?.trim()) ?? -1; e = byCode.get(v[iEs]?.trim()) ?? -1; }
      else {
        const sLat = +v[iSlat], sLon = +v[iSlon], eLat = +v[iElat], eLon = +v[iElon];
        if (sLat > 40 && sLon < -60 && v[iSn]) s = reg.add(v[iSn], sLat, sLon, iSb >= 0 ? v[iSb] : "");
        if (eLat > 40 && eLon < -60 && v[iEn]) e = reg.add(v[iEn], eLat, eLon, iEb >= 0 ? v[iEb] : "");
      }
      if (!st || s < 0 || e < 0) { stats.excluded.invalid++; return; }
      let dur: number;
      if (iDur >= 0 && v[iDur] !== "") dur = Math.round(+v[iDur]);
      else {
        const en = iE >= 0 ? parseTime(v[iE]) : null;
        if (!en) { stats.excluded.invalid++; return; }
        dur = Math.round(en[2] - st[2]);
      }
      if (!(dur >= 60)) { stats.excluded.short++; return; }
      if (dur > 4 * 3600) { stats.excluded.long++; return; }
      const m = iMem >= 0 ? v[iMem]?.trim() : "";
      onTrip({ day: st[0], sod: st[1], dur, s, e, member: m === "1" || m === "True" || m === "true" ? 1 : m === "0" || m === "False" || m === "false" ? 0 : -1 });
    });
  }
  return stats;
}
