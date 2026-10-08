/// <reference lib="webworker" />
/**
 * Builds building geometry off the main thread: inflate, decode, triangulate
 * roofs with earcut, extrude walls with flat normals, colour by kind.
 */
import earcut from "earcut";
import { decodeTile } from "@/lib/formats/city";
import { BUILDING_EX, EXZ } from "@/lib/geo";

const PALETTE: Array<[number, number, number]> = [
  [0.76, 0.722, 0.668], // house: warm limestone
  [0.68, 0.666, 0.64], // mid-rise
  [0.58, 0.624, 0.68], // tower: cool glass
  [0.75, 0.705, 0.625], // civic
  [0.65, 0.636, 0.607], // industrial
  [0.61, 0.645, 0.69], // building:part (mostly towers)
];
const ALT: [number, number, number] = [0.695, 0.655, 0.597];

async function inflate(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const h = new Uint8Array(buf, 0, 2);
  if (h[0] !== 0x1f || h[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

export interface TileGeometry {
  key: string;
  position: Float32Array;
  normal: Int8Array;
  color: Uint8Array;
  /** base y, grow delay 0..1, window density 0..1 */
  aB: Float32Array;
  index: Uint32Array;
  buildings: number;
}

async function build(url: string, key: string): Promise<TileGeometry> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const t = decodeTile(await inflate(await res.arrayBuffer()));
  // size the buffers
  let nv = 0, ni = 0;
  {
    let r = 0;
    for (let b = 0; b < t.count; b++) {
      let pts = 0;
      for (let k = 0; k < t.rings[b]; k++) { const n = t.ringPts[r + k]; pts += n; nv += n * 4; ni += n * 6; }
      nv += pts; ni += (pts - 2) * 3 + 6 * t.rings[b];
      r += t.rings[b];
    }
  }
  const position = new Float32Array(nv * 3), normal = new Int8Array(nv * 3), color = new Uint8Array(nv * 3), aB = new Float32Array(nv * 3);
  const index = new Uint32Array(ni);
  let vp = 0, ip = 0, ring = 0, cp = 0;
  for (let b = 0; b < t.count; b++) {
    const nR = t.rings[b];
    const base = t.base[b] * EXZ - 1.5;
    const y0 = base + (t.minHeight[b] > 0 ? t.minHeight[b] * BUILDING_EX + 1.5 : 0);
    const y1 = t.base[b] * EXZ + t.height[b] * BUILDING_EX;
    // ring coordinates -> world
    const rings: number[][] = [];
    for (let k = 0; k < nR; k++) {
      const n = t.ringPts[ring + k], arr: number[] = [];
      for (let p = 0; p < n; p++) { arr.push(t.coords[cp] + t.ox, t.coords[cp + 1] + t.oy); cp += 2; }
      rings.push(arr);
    }
    ring += nR;
    const ox = rings[0][0], oy = rings[0][1];
    const r = Math.abs(Math.sin(ox * 12.9898 + oy * 78.233) * 43758.5453) % 1;
    const kind = t.kind[b];
    const pc = PALETTE[Math.min(kind, PALETTE.length - 1)];
    const mix = kind === 0 ? r : r * 0.5;
    const shade = 1 + (r - 0.5) * 0.08;
    const R = Math.round(Math.min(1, (pc[0] + (ALT[0] - pc[0]) * mix) * shade) * 255);
    const G = Math.round(Math.min(1, (pc[1] + (ALT[1] - pc[1]) * mix) * shade) * 255);
    const B = Math.round(Math.min(1, (pc[2] + (ALT[2] - pc[2]) * mix) * shade) * 255);
    const win = t.height[b] > 40 ? 0.5 + 0.4 * r : kind === 4 ? 0.08 : 0.18 + 0.55 * r;
    const delay = r;
    const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
      const o = vp * 3;
      position[o] = x; position[o + 1] = y; position[o + 2] = z;
      normal[o] = nx; normal[o + 1] = ny; normal[o + 2] = nz;
      color[o] = R; color[o + 1] = G; color[o + 2] = B;
      aB[o] = y0; aB[o + 1] = delay; aB[o + 2] = win;
      return vp++;
    };
    // walls: outer ring counter-clockwise, holes clockwise (as the build script wrote them)
    for (let k = 0; k < rings.length; k++) {
      const a = rings[k], n = a.length / 2;
      let area = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += a[i * 2] * a[j * 2 + 1] - a[j * 2] * a[i * 2 + 1]; }
      const ccw = area > 0;
      const wantCcw = k === 0;
      for (let i = 0; i < n; i++) {
        let i0 = i, i1 = (i + 1) % n;
        if (ccw !== wantCcw) { i0 = (n - i) % n; i1 = (n - i - 1 + n) % n; }
        const x0 = a[i0 * 2], z0 = -a[i0 * 2 + 1], x1 = a[i1 * 2], z1 = -a[i1 * 2 + 1];
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
        // outward normal for a CCW ring in (x, y-north) is (dy, -dx) -> scene (x, -z)
        const nx = Math.round((-dz / L) * 127), nz = Math.round((dx / L) * 127);
        const sx = wantCcw ? nx : nx, sz = wantCcw ? nz : nz;
        const v0 = put(x0, y0, z0, sx, 0, sz), v1 = put(x1, y0, z1, sx, 0, sz);
        const v2 = put(x1, y1, z1, sx, 0, sz), v3 = put(x0, y1, z0, sx, 0, sz);
        index[ip++] = v0; index[ip++] = v1; index[ip++] = v2;
        index[ip++] = v0; index[ip++] = v2; index[ip++] = v3;
      }
    }
    // roof
    const flat: number[] = [], holes: number[] = [];
    for (let k = 0; k < rings.length; k++) {
      if (k > 0) holes.push(flat.length / 2);
      flat.push(...rings[k]);
    }
    const tri = earcut(flat, holes, 2);
    const first = vp;
    for (let p = 0; p < flat.length / 2; p++) put(flat[p * 2], y1, -flat[p * 2 + 1], 0, 127, 0);
    for (let k = 0; k < tri.length; k += 3) {
      // earcut keeps the input winding; make roofs face up in scene space (z = -north)
      const a = first + tri[k], b2 = first + tri[k + 1], c = first + tri[k + 2];
      const ax = position[a * 3], az = position[a * 3 + 2], bx = position[b2 * 3], bz = position[b2 * 3 + 2], cx = position[c * 3], cz = position[c * 3 + 2];
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny >= 0) { index[ip++] = a; index[ip++] = b2; index[ip++] = c; }
      else { index[ip++] = a; index[ip++] = c; index[ip++] = b2; }
    }
  }
  return {
    key,
    position: position.subarray(0, vp * 3),
    normal: normal.subarray(0, vp * 3),
    color: color.subarray(0, vp * 3),
    aB: aB.subarray(0, vp * 3),
    index: index.subarray(0, ip),
    buildings: t.count,
  };
}

self.onmessage = async (e: MessageEvent<{ url: string; key: string }>) => {
  try {
    const g = await build(e.data.url, e.data.key);
    // copy into exact-size buffers so the transfer is tight
    const out = {
      ...g,
      position: g.position.slice(), normal: g.normal.slice(), color: g.color.slice(), aB: g.aB.slice(), index: g.index.slice(),
    };
    (self as unknown as Worker).postMessage(out, [out.position.buffer, out.normal.buffer, out.color.buffer, out.aB.buffer, out.index.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ key: e.data.key, error: (err as Error).message });
  }
};
