import { PNG } from "pngjs";
import { cached, fetchRetry } from "./net";

/**
 * Real elevation from the AWS Terrain Tiles (Terrarium encoding:
 * metres = R*256 + G + B/256 - 32768). Zoom 13 is ~13 m per pixel here.
 */
const Z = 13;
const N = 2 ** Z;
const lon2x = (lon: number) => ((lon + 180) / 360) * N;
const lat2y = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N;
};

export interface Dem {
  /** metres above sea level, bilinear */
  at(lat: number, lon: number): number;
}

export async function loadDem(bbox: { s: number; w: number; n: number; e: number }, cacheDir: string): Promise<Dem> {
  const x0 = Math.floor(lon2x(bbox.w)), x1 = Math.floor(lon2x(bbox.e));
  const y0 = Math.floor(lat2y(bbox.n)), y1 = Math.floor(lat2y(bbox.s));
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const W = tw * 256, H = th * 256;
  const grid = new Float32Array(W * H);
  const jobs: Array<[number, number]> = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push([tx, ty]);
  let done = 0;
  const worker = async () => {
    for (;;) {
      const job = jobs.pop();
      if (!job) return;
      const [tx, ty] = job;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`;
      const buf = await cached(`${cacheDir}/${Z}_${tx}_${ty}.png`, () => fetchRetry(url, {}, { label: `dem ${tx}/${ty}` }));
      const png = PNG.sync.read(buf);
      const ox = (tx - x0) * 256, oy = (ty - y0) * 256;
      for (let j = 0; j < 256; j++)
        for (let i = 0; i < 256; i++) {
          const k = (j * 256 + i) * 4;
          grid[(oy + j) * W + ox + i] = png.data[k] * 256 + png.data[k + 1] + png.data[k + 2] / 256 - 32768;
        }
      done++;
      if (done % 20 === 0) console.log(`  dem ${done}/${tw * th}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return {
    at(lat, lon) {
      const px = (lon2x(lon) - x0) * 256 - 0.5;
      const py = (lat2y(lat) - y0) * 256 - 0.5;
      const ix = Math.max(0, Math.min(W - 2, Math.floor(px)));
      const iy = Math.max(0, Math.min(H - 2, Math.floor(py)));
      const fx = Math.max(0, Math.min(1, px - ix)), fy = Math.max(0, Math.min(1, py - iy));
      const a = grid[iy * W + ix], b = grid[iy * W + ix + 1];
      const c = grid[(iy + 1) * W + ix], d = grid[(iy + 1) * W + ix + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    },
  };
}
