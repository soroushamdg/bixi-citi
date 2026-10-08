/**
 * terrain.bin(.gz): a regular grid in world metres (x east, y north), row 0 = south.
 *   Int32  magic 'BXTR', version, nx, ny
 *   Float32 x0, y0, dx, seaLevelHint
 *   Int16[nx*ny] ground in decimetres, delta-coded along each row
 *   Int16[nx*ny] water surface in decimetres, NONE where there is no water nearby
 * Ground already sits a few metres below the water surface under rivers and lakes.
 */
export const TERRAIN_MAGIC = 0x52545842; // "BXTR"
export const WATER_NONE = -32768;

export interface Terrain {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  dx: number;
  ground: Float32Array; // metres
  water: Float32Array; // metres, NaN = no water
}

export function encodeTerrain(t: Terrain): Uint8Array {
  const n = t.nx * t.ny;
  const buf = new ArrayBuffer(32 + n * 4);
  const dv = new DataView(buf);
  dv.setInt32(0, TERRAIN_MAGIC, true);
  dv.setInt32(4, 1, true);
  dv.setInt32(8, t.nx, true);
  dv.setInt32(12, t.ny, true);
  dv.setFloat32(16, t.x0, true);
  dv.setFloat32(20, t.y0, true);
  dv.setFloat32(24, t.dx, true);
  dv.setFloat32(28, 0, true);
  const g = new Int16Array(buf, 32, n);
  const w = new Int16Array(buf, 32 + n * 2, n);
  for (let j = 0; j < t.ny; j++) {
    let prev = 0;
    for (let i = 0; i < t.nx; i++) {
      const k = j * t.nx + i;
      const v = Math.round(t.ground[k] * 10);
      g[k] = v - prev;
      prev = v;
      w[k] = Number.isNaN(t.water[k]) ? WATER_NONE : Math.round(t.water[k] * 10);
    }
  }
  return new Uint8Array(buf);
}

export function decodeTerrain(buf: ArrayBuffer): Terrain {
  const dv = new DataView(buf);
  if (dv.getInt32(0, true) !== TERRAIN_MAGIC) throw new Error("not a terrain file");
  const nx = dv.getInt32(8, true), ny = dv.getInt32(12, true);
  const x0 = dv.getFloat32(16, true), y0 = dv.getFloat32(20, true), dx = dv.getFloat32(24, true);
  const n = nx * ny;
  const g = new Int16Array(buf, 32, n);
  const w = new Int16Array(buf, 32 + n * 2, n);
  const ground = new Float32Array(n), water = new Float32Array(n);
  for (let j = 0; j < ny; j++) {
    let acc = 0;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      acc += g[k];
      ground[k] = acc / 10;
      water[k] = w[k] === WATER_NONE ? NaN : w[k] / 10;
    }
  }
  return { nx, ny, x0, y0, dx, ground, water };
}

/** Bilinear ground height in metres (true, not exaggerated). */
export function groundAt(t: Terrain, x: number, y: number): number {
  const fx = Math.max(0, Math.min(t.nx - 1.001, (x - t.x0) / t.dx));
  const fy = Math.max(0, Math.min(t.ny - 1.001, (y - t.y0) / t.dx));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const k = j * t.nx + i, G = t.ground;
  return (G[k] * (1 - u) + G[k + 1] * u) * (1 - v) + (G[k + t.nx] * (1 - u) + G[k + t.nx + 1] * u) * v;
}

/** Height a rider feels: the water surface where there is water, else ground. */
export function surfaceAt(t: Terrain, x: number, y: number): number {
  const i = Math.round((x - t.x0) / t.dx), j = Math.round((y - t.y0) / t.dx);
  const g = groundAt(t, x, y);
  if (i < 0 || j < 0 || i >= t.nx || j >= t.ny) return g;
  const w = t.water[j * t.nx + i];
  return Number.isNaN(w) ? g : Math.max(g, w);
}
