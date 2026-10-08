/**
 * City LOD formats, written by scripts/city/build-city.ts.
 *
 * tiles/{u}_{v}.bin.gz  detailed buildings of one 1 km grid tile
 *   Int32 magic 'BXCT', version, count, nRings, nPts, 0 · Float32 ox, oy (world origin)
 *   Uint16 height dm [count] · Uint16 minHeight dm [count] · Int16 base dm [count]
 *   Uint8 kind [count] · Uint8 rings [count]          (each padded to 4 bytes)
 *   Uint16 ringPts [nRings]                             (padded to 4 bytes)
 *   Int16 coords [nPts * 2], 0.25 m units, delta-coded within each ring, first point relative to origin
 *
 * blocks.bin.gz  the far LOD: one box per 62.5 m grid cell with buildings (layout below)
 */
export const TILE_MAGIC = 0x54435842;
export const BLOCK_MAGIC = 0x4b425842;
const pad4 = (n: number) => (n + 3) & ~3;

export const KIND = { house: 0, mid: 1, tower: 2, civic: 3, industrial: 4, part: 5, plateau: 6 } as const;

export interface TileBuilding {
  height: number; // m above base
  minHeight: number; // m above base (building:part floating sections)
  base: number; // m, true ground elevation
  kind: number;
  rings: Array<Array<[number, number]>>; // world metres; ring 0 = outer
}

export function encodeTile(ox: number, oy: number, list: TileBuilding[]): Uint8Array {
  const count = list.length;
  let nRings = 0, nPts = 0;
  for (const b of list) { nRings += b.rings.length; for (const r of b.rings) nPts += r.length; }
  const offH = 32, offM = offH + pad4(count * 2), offB = offM + pad4(count * 2), offK = offB + pad4(count * 2);
  const offR = offK + pad4(count), offRP = offR + pad4(count), offC = offRP + pad4(nRings * 2);
  const size = offC + nPts * 4;
  const buf = new ArrayBuffer(size);
  const head = new Int32Array(buf, 0, 6);
  head.set([TILE_MAGIC, 1, count, nRings, nPts, 0]);
  new Float32Array(buf, 24, 2).set([ox, oy]);
  const H = new Uint16Array(buf, offH, count), M = new Uint16Array(buf, offM, count), B = new Int16Array(buf, offB, count);
  const K = new Uint8Array(buf, offK, count), R = new Uint8Array(buf, offR, count);
  const RP = new Uint16Array(buf, offRP, nRings), C = new Int16Array(buf, offC, nPts * 2);
  let ri = 0, ci = 0;
  list.forEach((b, i) => {
    H[i] = Math.min(65535, Math.round(b.height * 10));
    M[i] = Math.min(65535, Math.round(b.minHeight * 10));
    B[i] = Math.round(b.base * 10);
    K[i] = b.kind;
    R[i] = Math.min(255, b.rings.length);
    for (const ring of b.rings.slice(0, 255)) {
      RP[ri++] = ring.length;
      let px = 0, py = 0;
      for (const [x, y] of ring) {
        const qx = Math.round((x - ox) * 4), qy = Math.round((y - oy) * 4);
        C[ci++] = qx - px; C[ci++] = qy - py;
        px = qx; py = qy;
      }
    }
  });
  return new Uint8Array(buf);
}

export interface DecodedTile {
  ox: number;
  oy: number;
  count: number;
  height: Float32Array;
  minHeight: Float32Array;
  base: Float32Array;
  kind: Uint8Array;
  rings: Uint8Array;
  ringPts: Uint16Array;
  /** absolute coordinates relative to (ox, oy), metres */
  coords: Float32Array;
}

export function decodeTile(buf: ArrayBuffer): DecodedTile {
  const head = new Int32Array(buf, 0, 6);
  if (head[0] !== TILE_MAGIC) throw new Error("not a tile file");
  const [, , count, nRings, nPts] = head;
  const [ox, oy] = new Float32Array(buf, 24, 2);
  const offH = 32, offM = offH + pad4(count * 2), offB = offM + pad4(count * 2), offK = offB + pad4(count * 2);
  const offR = offK + pad4(count), offRP = offR + pad4(count), offC = offRP + pad4(nRings * 2);
  const H = new Uint16Array(buf, offH, count), M = new Uint16Array(buf, offM, count), B = new Int16Array(buf, offB, count);
  const ringPts = new Uint16Array(buf, offRP, nRings).slice();
  const C = new Int16Array(buf, offC, nPts * 2);
  const coords = new Float32Array(nPts * 2);
  let ci = 0;
  for (let r = 0; r < nRings; r++) {
    let x = 0, y = 0;
    for (let p = 0; p < ringPts[r]; p++) {
      x += C[ci]; y += C[ci + 1];
      coords[ci] = x / 4; coords[ci + 1] = y / 4;
      ci += 2;
    }
  }
  return {
    ox, oy, count,
    height: Float32Array.from(H, (v) => v / 10),
    minHeight: Float32Array.from(M, (v) => v / 10),
    base: Float32Array.from(B, (v) => v / 10),
    kind: new Uint8Array(buf, offK, count).slice(),
    rings: new Uint8Array(buf, offR, count).slice(),
    ringPts,
    coords,
  };
}

export interface Blocks {
  count: number;
  x: Float32Array;
  y: Float32Array;
  size: Float32Array;
  height: Float32Array;
  base: Float32Array;
  tile: Uint16Array;
}

/*
 * v2 layout: Int32 magic, count, version, 0 · Float32 ox, oy (origin, metres)
 *   Uint16 x m [n] · Uint16 y m [n] · Uint16 height dm [n] · Int16 base dm [n] · Uint16 tile [n] · Uint8 size (¼ m) [n]
 * Blocks are sorted by tile so the tile column compresses to almost nothing.
 */
export function encodeBlocks(b: { x: number[]; y: number[]; size: number[]; height: number[]; base: number[]; tile: number[] }): Uint8Array {
  const n = b.x.length;
  const order = b.x.map((_, i) => i).sort((p, q) => b.tile[p] - b.tile[q] || b.y[p] - b.y[q] || b.x[p] - b.x[q]);
  const ox = Math.floor(b.x.reduce((m, v) => Math.min(m, v), Infinity)), oy = Math.floor(b.y.reduce((m, v) => Math.min(m, v), Infinity));
  const off = (k: number) => 24 + k * pad4(n * 2);
  const buf = new ArrayBuffer(off(5) + pad4(n));
  new Int32Array(buf, 0, 4).set([BLOCK_MAGIC, n, 2, 0]);
  new Float32Array(buf, 16, 2).set([ox, oy]);
  const X = new Uint16Array(buf, off(0), n), Y = new Uint16Array(buf, off(1), n), H = new Uint16Array(buf, off(2), n);
  const B = new Int16Array(buf, off(3), n), T = new Uint16Array(buf, off(4), n), S = new Uint8Array(buf, off(5), n);
  order.forEach((i, k) => {
    X[k] = Math.round(b.x[i] - ox);
    Y[k] = Math.round(b.y[i] - oy);
    H[k] = Math.min(65535, Math.round(b.height[i] * 10));
    B[k] = Math.round(b.base[i] * 10);
    T[k] = b.tile[i];
    S[k] = Math.min(255, Math.round(b.size[i] * 4));
  });
  return new Uint8Array(buf);
}

export function decodeBlocks(buf: ArrayBuffer): Blocks {
  const [magic, n, version] = new Int32Array(buf, 0, 3);
  if (magic !== BLOCK_MAGIC || version !== 2) throw new Error("not a v2 blocks file");
  const [ox, oy] = new Float32Array(buf, 16, 2);
  const off = (k: number) => 24 + k * pad4(n * 2);
  return {
    count: n,
    x: Float32Array.from(new Uint16Array(buf, off(0), n), (v) => v + ox),
    y: Float32Array.from(new Uint16Array(buf, off(1), n), (v) => v + oy),
    height: Float32Array.from(new Uint16Array(buf, off(2), n), (v) => v / 10),
    base: Float32Array.from(new Int16Array(buf, off(3), n), (v) => v / 10),
    tile: new Uint16Array(buf, off(4), n),
    size: Float32Array.from(new Uint8Array(buf, off(5), n), (v) => v / 4),
  };
}

export interface CityIndex {
  version: number;
  generatedAt: string;
  region: { s: number; w: number; n: number; e: number };
  bounds: { x0: number; y0: number; x1: number; y1: number };
  gridBearing: number;
  tile: number;
  block: number;
  /** ground texture: size in px, metres per px; its top-left is (bounds.x0, bounds.y1) */
  mask: { file: string; bikes: string; width: number; height: number; m: number };
  terrain: { file: string };
  blocks: { file: string; count: number };
  /** u, v grid tile coords, world centre, buildings, tallest (m), gz bytes */
  tiles: Array<{ u: number; v: number; x: number; y: number; n: number; maxH: number; bytes: number }>;
  stats: { buildings: number; parts: number; water: number; green: number; roads: number };
}
