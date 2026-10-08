/**
 * Per-year archive.
 *
 * Build side (committed, not served): data/years/{year}.json, the full YearSummary with its station table.
 * Served (public/data/years/):
 *   index.json                   YearsIndex: one line per year + the file names below (short cache)
 *   summaries.{hash}.json        every YearSummary without stations, so the panel switches instantly
 *   {year}.{hash}.pack.gz        one file per year for the map: stations, departures per station-day,
 *                                that day's balance, and a fixed random sample of rides
 * Hashed files never change, so browsers keep them for a year; past years are built once.
 *
 * pack (little-endian, then gzip):
 *   Int32 magic 'BXYP', version, stations, days, firstDoy, sampleCount, jsonBytes, 0
 *   UTF-8 JSON {name[], lat[], lon[], trips[]}, padded to 4
 *   departures: station-major, delta-coded along time, as two byte planes (low, high)   [stations × days × 2]
 *   balance: Int8 −4…4 (lost … gained), station-major                                    [stations × days]
 *   sample: Uint16 rides per day [days] · Uint16 minute delta within the day · Uint16 from · Uint16 to
 */
export const YPACK_MAGIC = 0x50595842;
export const SAMPLE_PER_DAY = 200;

export interface DayStat { date: string; trips: number; weekday: number }

export interface YearSummary {
  year: number;
  source: { url: string; file: string; bytes: number; etag: string | null; lastModified: string | null };
  generatedAt: string;
  rows: number;
  trips: number;
  excluded: { short: number; long: number; invalid: number };
  months: number[];
  /** the file stops before the season ends (the current year, usually) */
  partial: boolean;
  firstDay: string;
  lastDay: string;
  serviceDays: number;
  /** busy-season window: first and last day above a quarter of the 95th-percentile day */
  seasonFrom: string;
  seasonTo: string;
  /** trips per day of year, index 0 = 1 January */
  daily: number[];
  monthly: number[];
  peakDays: DayStat[];
  /** quietest days inside the busy season */
  lowDays: DayStat[];
  peakHour: { date: string; hour: number; trips: number };
  /** average trips per hour of week over the season, Monday 00h first */
  how: number[];
  weekdayAvg: number;
  weekendAvg: number;
  medianMin: number;
  medianKm: number;
  /** of rides that changed height by > 2 m, the share that ended lower */
  downhill: number;
  roundTrips: number;
  /** null when the year's file has no membership column */
  memberShare: number | null;
  stationsActive: number;
  topStations: Array<{ i: number; name: string; departures: number }>;
  topRoutes: Array<{ from: number; to: number; fromName: string; toName: string; trips: number }>;
  /** build side only; the browser gets stations from the year's pack */
  stations?: YearStations;
  /** build side: this year's pack file */
  pack?: { file: string; bytes: number };
}

export interface YearsIndex {
  generatedAt: string;
  years: Array<{
    year: number;
    trips: number;
    partial: boolean;
    months: number[];
    stationsActive: number;
    /** stations with no station within 80 m the previous year */
    newStations: number | null;
    peak: DayStat;
    medianMin: number;
    memberShare: number | null;
    /** change in trips over the previous year, same months only */
    growth: number | null;
    url: string;
    etag: string | null;
    pack: { file: string; bytes: number };
  }>;
  allTimePeak: DayStat & { year: number };
  /** every year's summary in one file */
  summaries: { file: string; bytes: number };
}

export interface YearDays {
  stations: number;
  days: number;
  firstDoy: number;
  /** departures, day-major: dep[day * stations + station] */
  dep: Uint16Array;
  /** that day's balance, −4 (lost bikes) … 4 (gained), day-major */
  bal: Int8Array;
}
export interface YearSample { count: number; doy: Uint16Array; minute: Uint16Array; from: Uint16Array; to: Uint16Array }
export interface YearStations { name: string[]; lat: number[]; lon: number[]; trips: number[] }
export interface YearPack { stations: YearStations; days: YearDays; sample: YearSample }

const pad4 = (n: number) => (n + 3) & ~3;

export function encodeYearPack(st: YearStations, days: number, firstDoy: number, depDayMajor: Uint16Array, arrDayMajor: Uint16Array, sample: { doy: number[]; minute: number[]; from: number[]; to: number[] }): Uint8Array {
  const N = st.name.length, D = days, S = sample.doy.length;
  const json = new TextEncoder().encode(JSON.stringify(st));
  const offJson = 32, offDep = offJson + pad4(json.length), offBal = offDep + N * D * 2, offCnt = offBal + pad4(N * D);
  const offMin = offCnt + pad4(D * 2), offFrom = offMin + pad4(S * 2), offTo = offFrom + pad4(S * 2), size = offTo + pad4(S * 2);
  const buf = new ArrayBuffer(size), u8 = new Uint8Array(buf);
  new Int32Array(buf, 0, 8).set([YPACK_MAGIC, 1, N, D, firstDoy, S, json.length, 0]);
  u8.set(json, offJson);
  const bal = new Int8Array(buf, offBal, N * D);
  for (let i = 0; i < N; i++) {
    let prev = 0;
    for (let d = 0; d < D; d++) {
      const k = d * N + i, o = i * D + d, a = depDayMajor[k], b = arrDayMajor[k];
      const delta = (a - prev) & 0xffff;
      prev = a;
      u8[offDep + o] = delta & 255;
      u8[offDep + N * D + o] = delta >> 8;
      bal[o] = a + b ? Math.round(((b - a) / (a + b)) * 4) : 0;
    }
  }
  const cnt = new Uint16Array(buf, offCnt, D), mins = new Uint16Array(buf, offMin, S), from = new Uint16Array(buf, offFrom, S), to = new Uint16Array(buf, offTo, S);
  let prevDay = -1, prevMin = 0;
  for (let k = 0; k < S; k++) {
    const d = sample.doy[k] - firstDoy;
    cnt[d]++;
    if (d !== prevDay) { prevDay = d; prevMin = 0; }
    mins[k] = sample.minute[k] - prevMin;
    prevMin = sample.minute[k];
    from[k] = sample.from[k];
    to[k] = sample.to[k];
  }
  return u8;
}

export function decodeYearPack(buf: ArrayBuffer): YearPack {
  const [magic, , N, D, firstDoy, S, jsonBytes] = new Int32Array(buf, 0, 8);
  if (magic !== YPACK_MAGIC) throw new Error("not a year pack");
  const u8 = new Uint8Array(buf);
  const offJson = 32, offDep = offJson + pad4(jsonBytes), offBal = offDep + N * D * 2, offCnt = offBal + pad4(N * D);
  const offMin = offCnt + pad4(D * 2), offFrom = offMin + pad4(S * 2), offTo = offFrom + pad4(S * 2);
  const stations = JSON.parse(new TextDecoder().decode(u8.subarray(offJson, offJson + jsonBytes))) as YearStations;
  const balS = new Int8Array(buf, offBal, N * D);
  const dep = new Uint16Array(N * D), bal = new Int8Array(N * D);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let d = 0; d < D; d++) {
      const o = i * D + d;
      acc = (acc + (u8[offDep + o] | (u8[offDep + N * D + o] << 8))) & 0xffff;
      dep[d * N + i] = acc;
      bal[d * N + i] = balS[o];
    }
  }
  const cnt = new Uint16Array(buf, offCnt, D), mins = new Uint16Array(buf, offMin, S);
  const doy = new Uint16Array(S), minute = new Uint16Array(S);
  let k = 0;
  for (let d = 0; d < D; d++) {
    let m = 0;
    for (let c = 0; c < cnt[d]; c++, k++) { m += mins[k]; doy[k] = d + firstDoy; minute[k] = m; }
  }
  return {
    stations,
    days: { stations: N, days: D, firstDoy, dep, bal },
    sample: { count: S, doy, minute, from: new Uint16Array(buf, offFrom, S).slice(), to: new Uint16Array(buf, offTo, S).slice() },
  };
}
