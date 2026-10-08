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
 * blocks.bin.gz  the far LOD: one box per 62.5 m grid cell with buildings
 *   Int32 magic 'BXBK', count
 *   Float32 x [count] · Float32 y [count] · Uint16 size dm [count] · Uint16 height dm [count]
 *   Int16 base dm [count] · Uint16 tile [count]
 */
export const TILE_MAGIC = 0x54435842;
export const BLOCK_MAGIC = 0x4b425842;
const pad4 = (n: number) => (n + 3) & ~3;

export const KIND = { house: 0, mid: 1, tower: 2, civic: 3, industrial: 4, part: 5 } as const;

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

export function encodeBlocks(b: { x: number[]; y: number[]; size: number[]; height: number[]; base: number[]; tile: number[] }): Uint8Array {
  const n = b.x.length;
  const off = [8, 8 + n * 4, 8 + n * 8, 8 + n * 8 + pad4(n * 2), 8 + n * 8 + 2 * pad4(n * 2), 8 + n * 8 + 3 * pad4(n * 2)];
  const buf = new ArrayBuffer(off[5] + pad4(n * 2));
  new Int32Array(buf, 0, 2).set([BLOCK_MAGIC, n]);
  new Float32Array(buf, off[0], n).set(b.x);
  new Float32Array(buf, off[1], n).set(b.y);
  new Uint16Array(buf, off[2], n).set(b.size.map((v) => Math.round(v * 10)));
  new Uint16Array(buf, off[3], n).set(b.height.map((v) => Math.min(65535, Math.round(v * 10))));
  new Int16Array(buf, off[4], n).set(b.base.map((v) => Math.round(v * 10)));
  new Uint16Array(buf, off[5], n).set(b.tile);
  return new Uint8Array(buf);
}

export function decodeBlocks(buf: ArrayBuffer): Blocks {
  const [magic, n] = new Int32Array(buf, 0, 2);
  if (magic !== BLOCK_MAGIC) throw new Error("not a blocks file");
  const off = [8, 8 + n * 4, 8 + n * 8, 8 + n * 8 + pad4(n * 2), 8 + n * 8 + 2 * pad4(n * 2), 8 + n * 8 + 3 * pad4(n * 2)];
  return {
    count: n,
    x: new Float32Array(buf, off[0], n),
    y: new Float32Array(buf, off[1], n),
    size: Float32Array.from(new Uint16Array(buf, off[2], n), (v) => v / 10),
    height: Float32Array.from(new Uint16Array(buf, off[3], n), (v) => v / 10),
    base: Float32Array.from(new Int16Array(buf, off[4], n), (v) => v / 10),
    tile: new Uint16Array(buf, off[5], n),
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
  mask: { file: string; width: number; height: number };
  terrain: { file: string };
  blocks: { file: string; count: number };
  /** u, v grid tile coords, world centre, buildings, tallest (m), gz bytes */
  tiles: Array<{ u: number; v: number; x: number; y: number; n: number; maxH: number; bytes: number }>;
  stats: { buildings: number; parts: number; water: number; green: number; roads: number };
}
