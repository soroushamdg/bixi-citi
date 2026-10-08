/**
 * Binary formats for the history playback (written by CI, read by the browser).
 *
 * day/{k}.bin.gz  every trip of the story day that starts in chunk k
 *   Int32 magic 'BXDY', count, firstStart (s after local midnight), 0
 *   Uint16[count] start delta (s) · Uint16[count] duration (s) · Uint16[count] from · Uint16[count] to
 *
 * flows.bin.gz  top OD pairs for every hour of the week (Mon 00h = 0)
 *   Int32 magic 'BXFL', perHour
 *   Uint16[168 * perHour * 3] (from, to, average trips × 10); unused slots are 0,0,0
 */
export const DAY_CHUNKS = 4;
export const FLOWS_PER_HOUR = 140;
const DAY_MAGIC = 0x59445842;
const FLOW_MAGIC = 0x4c465842;

export interface DayTrips {
  start: Uint32Array; // seconds after local midnight
  dur: Uint16Array;
  from: Uint16Array;
  to: Uint16Array;
}

export function encodeDay(start: number[], dur: number[], from: number[], to: number[]): Uint8Array {
  const n = start.length;
  const buf = new ArrayBuffer(16 + n * 8);
  const h = new Int32Array(buf, 0, 4);
  h[0] = DAY_MAGIC; h[1] = n; h[2] = n ? start[0] : 0;
  const ds = new Uint16Array(buf, 16, n), du = new Uint16Array(buf, 16 + n * 2, n);
  const f = new Uint16Array(buf, 16 + n * 4, n), t = new Uint16Array(buf, 16 + n * 6, n);
  let prev = n ? start[0] : 0;
  for (let i = 0; i < n; i++) {
    ds[i] = start[i] - prev; prev = start[i];
    du[i] = Math.min(65535, dur[i]); f[i] = from[i]; t[i] = to[i];
  }
  return new Uint8Array(buf);
}

export function decodeDay(buf: ArrayBuffer): DayTrips {
  const h = new Int32Array(buf, 0, 4);
  if (h[0] !== DAY_MAGIC) throw new Error("not a day file");
  const n = h[1];
  const ds = new Uint16Array(buf, 16, n);
  const start = new Uint32Array(n);
  let acc = h[2];
  for (let i = 0; i < n; i++) { acc += ds[i]; start[i] = acc; }
  return {
    start,
    dur: new Uint16Array(buf, 16 + n * 2, n).slice(),
    from: new Uint16Array(buf, 16 + n * 4, n).slice(),
    to: new Uint16Array(buf, 16 + n * 6, n).slice(),
  };
}

export function encodeFlows(flows: Array<Array<[number, number, number]>>): Uint8Array {
  const K = FLOWS_PER_HOUR;
  const buf = new ArrayBuffer(8 + 168 * K * 6);
  const h = new Int32Array(buf, 0, 2);
  h[0] = FLOW_MAGIC; h[1] = K;
  const a = new Uint16Array(buf, 8);
  flows.forEach((list, hw) =>
    list.forEach(([s, e, v], k) => {
      const o = (hw * K + k) * 3;
      a[o] = s; a[o + 1] = e; a[o + 2] = Math.min(65535, Math.round(v * 10));
    }),
  );
  return new Uint8Array(buf);
}

export interface Flows { perHour: number; data: Uint16Array }
export function decodeFlows(buf: ArrayBuffer): Flows {
  const h = new Int32Array(buf, 0, 2);
  if (h[0] !== FLOW_MAGIC) throw new Error("not a flows file");
  return { perHour: h[1], data: new Uint16Array(buf, 8) };
}
