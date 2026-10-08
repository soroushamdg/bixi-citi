/**
 * Per-year archive (public/data/years/), written by scripts/history/years.ts.
 *
 * {year}.json           YearSummary (below), including the station table
 * {year}.days.bin.gz    departures and arrivals per station per day
 *   Int32 magic 'BXYD', stations, days, firstDoy (day of year of row 0, Jan 1 = 0)
 *   Uint16 dep [days × stations] · Uint16 arr [days × stations]
 * {year}.sample.bin.gz  a fixed-size random sample of each day's rides, for the fast-forward
 *   Int32 magic 'BXYS', count, perDay, 0
 *   Uint16 doy [count] · Uint16 minute of day [count] · Uint16 from [count] · Uint16 to [count]
 * index.json            YearsIndex: one line per year, oldest first
 */
export const YDAYS_MAGIC = 0x44595842;
export const YSAMPLE_MAGIC = 0x53595842;
export const SAMPLE_PER_DAY = 320;

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
  stations: { name: string[]; lat: number[]; lon: number[] };
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
  }>;
  allTimePeak: DayStat & { year: number };
}

export interface YearDays { stations: number; days: number; firstDoy: number; dep: Uint16Array; arr: Uint16Array }
export interface YearSample { count: number; doy: Uint16Array; minute: Uint16Array; from: Uint16Array; to: Uint16Array }

export function encodeYearDays(stations: number, days: number, firstDoy: number, dep: Uint16Array, arr: Uint16Array): Uint8Array {
  const buf = new ArrayBuffer(16 + stations * days * 4);
  new Int32Array(buf, 0, 4).set([YDAYS_MAGIC, stations, days, firstDoy]);
  new Uint16Array(buf, 16, stations * days).set(dep);
  new Uint16Array(buf, 16 + stations * days * 2, stations * days).set(arr);
  return new Uint8Array(buf);
}
export function decodeYearDays(buf: ArrayBuffer): YearDays {
  const [magic, stations, days, firstDoy] = new Int32Array(buf, 0, 4);
  if (magic !== YDAYS_MAGIC) throw new Error("not a year-days file");
  return { stations, days, firstDoy, dep: new Uint16Array(buf, 16, stations * days), arr: new Uint16Array(buf, 16 + stations * days * 2, stations * days) };
}

export function encodeYearSample(doy: number[], minute: number[], from: number[], to: number[], perDay: number): Uint8Array {
  const n = doy.length;
  const buf = new ArrayBuffer(16 + n * 8);
  new Int32Array(buf, 0, 4).set([YSAMPLE_MAGIC, n, perDay, 0]);
  new Uint16Array(buf, 16, n).set(doy);
  new Uint16Array(buf, 16 + n * 2, n).set(minute);
  new Uint16Array(buf, 16 + n * 4, n).set(from);
  new Uint16Array(buf, 16 + n * 6, n).set(to);
  return new Uint8Array(buf);
}
export function decodeYearSample(buf: ArrayBuffer): YearSample {
  const [magic, count] = new Int32Array(buf, 0, 2);
  if (magic !== YSAMPLE_MAGIC) throw new Error("not a year-sample file");
  return {
    count,
    doy: new Uint16Array(buf, 16, count),
    minute: new Uint16Array(buf, 16 + count * 2, count),
    from: new Uint16Array(buf, 16 + count * 4, count),
    to: new Uint16Array(buf, 16 + count * 6, count),
  };
}
