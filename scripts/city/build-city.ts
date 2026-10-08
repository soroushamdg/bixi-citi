/**
 * Step 2 of the city build: turn the cached OSM + DEM into compressed static assets.
 *
 *   npx tsx scripts/city/build-city.ts [--only mask,terrain,buildings]
 *
 * Outputs (public/city/):
 *   mask.png         RGBA ground texture over the region: R land, G green, B streets, A bike network
 *   terrain.bin.gz   real DEM grid + water surface (lib/formats/terrain.ts)
 *   blocks.bin.gz    far LOD, one box per 62.5 m street-grid cell (lib/formats/city.ts)
 *   tiles/*.bin.gz   near LOD, detailed footprints per 1 km street-grid tile
 *   index.json       manifest the client reads first
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { PNG } from "pngjs";
import {
  BLOCK, BLOCKS_PER_TILE, GRID_BEARING, KX, KY, LAT0, LON0, REGION, TILE, fromGrid, project, toGrid,
} from "../../lib/geo";
import { encodeTerrain, type Terrain } from "../../lib/formats/terrain";
import { KIND, encodeBlocks, encodeTile, type CityIndex, type TileBuilding } from "../../lib/formats/city";
import { loadDem, type Dem } from "../lib/dem";
import type { OsmElement, OsmGeomPoint } from "../lib/overpass";
import { assembleRings, centroid, cleanRing, pointInRing, ringArea, simplifyRing, type Ring } from "./geom";
import { fetchTiles, layerTileCached, loadLayer } from "./osm";

const OUT = "public/city";
const WORK = ".cache/city";
const only = new Set((process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "mask,terrain,buildings").split(","));

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${s}`);

/* ---------- region in world metres ---------- */
const [X0, Y0] = project(REGION.s, REGION.w);
const [X1, Y1] = project(REGION.n, REGION.e);
const toXY = (p: OsmGeomPoint): [number, number] => [(p.lon - LON0) * KX, (p.lat - LAT0) * KY];
const toLL = (x: number, y: number) => ({ lat: LAT0 + y / KY, lon: LON0 + x / KX });

/* ---------- ground texture raster ---------- */
const MASK_M = 10; // metres per output pixel
const SS = 2; // supersampling for anti-aliased edges
const MW = Math.ceil((X1 - X0) / MASK_M), MH = Math.ceil((Y1 - Y0) / MASK_M);
const HW = MW * SS, HH = MH * SS;
const hp = (x: number, y: number): [number, number] => [((x - X0) / MASK_M) * SS, ((Y1 - y) / MASK_M) * SS];

/** Even–odd scanline fill of one polygon (all its rings) into a hi-res raster. */
function fillPolygon(rings: Ring[], raster: Uint8Array, value: number) {
  type Edge = { y0: number; y1: number; x: number; dxdy: number };
  const edges: Edge[] = [];
  let minY = Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = hp(...ring[i]);
      const [bx, by] = hp(...ring[(i + 1) % ring.length]);
      if (ay === by) continue;
      const top = ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay];
      edges.push({ y0: top[1], y1: top[3], x: top[0], dxdy: (top[2] - top[0]) / (top[3] - top[1]) });
      minY = Math.min(minY, top[1]); maxY = Math.max(maxY, top[3]);
    }
  }
  if (!edges.length) return;
  edges.sort((a, b) => a.y0 - b.y0);
  const jStart = Math.max(0, Math.floor(minY)), jEnd = Math.min(HH - 1, Math.ceil(maxY));
  let next = 0;
  let active: Edge[] = [];
  const xs: number[] = [];
  for (let j = jStart; j <= jEnd; j++) {
    const yc = j + 0.5;
    while (next < edges.length && edges[next].y0 <= yc) active.push(edges[next++]);
    active = active.filter((e) => e.y1 > yc);
    xs.length = 0;
    for (const e of active) if (e.y0 <= yc) xs.push(e.x + (yc - e.y0) * e.dxdy);
    xs.sort((a, b) => a - b);
    const row = j * HW;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(HW - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = a; i <= b; i++) raster[row + i] = value;
    }
  }
}

/** Thick polyline: every pixel within r of a segment gets max(value). */
function strokeLine(pts: Array<[number, number]>, r: number, raster: Uint8Array, value: number) {
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, ay] = hp(...pts[s]);
    const [bx, by] = hp(...pts[s + 1]);
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), i1 = Math.min(HW - 1, Math.ceil(Math.max(ax, bx) + r));
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), j1 = Math.min(HH - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5, py = j + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
        const d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
        if (d2 <= r * r) {
          const k = j * HW + i;
          if (raster[k] < value) raster[k] = value;
        }
      }
  }
}

/** Polygons (as ring lists) of an OSM area feature: closed way or multipolygon relation. */
function areaPolygons(el: OsmElement): Ring[][] {
  if (el.type === "way" && el.geometry && el.geometry.length >= 4) return [[cleanRing(el.geometry.map(toXY))]];
  if (el.type === "relation" && el.members) {
    const outer = assembleRings(el.members.filter((m) => m.type === "way" && m.geometry && m.role !== "inner").map((m) => m.geometry!.map(toXY)));
    const inner = assembleRings(el.members.filter((m) => m.type === "way" && m.geometry && m.role === "inner").map((m) => m.geometry!.map(toXY)));
    if (!outer.length) return [];
    // each outer with the inners whose first point it contains
    return outer.map((o) => [o, ...inner.filter((r) => pointInRing(r[0][0], r[0][1], o))]);
  }
  return [];
}

function downsample(hi: Uint8Array): Uint8Array {
  const out = new Uint8Array(MW * MH);
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      let s = 0;
      for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) s += hi[(j * SS + b) * HW + i * SS + a];
      out[j * MW + i] = Math.round(s / (SS * SS));
    }
  return out;
}

async function buildMask() {
  log(`mask ${MW}×${MH} px at ${MASK_M} m (hi-res ${HW}×${HH})`);
  const hi = new Uint8Array(HW * HH);

  // water → land = 255 - water
  const water = (await loadLayer("water")).elements;
  let nWater = 0;
  for (const el of water) {
    const t = el.tags ?? {};
    if (t.intermittent === "yes" || t.water === "wastewater" || t.water === "pool" || t.leisure === "swimming_pool") continue;
    for (const poly of areaPolygons(el)) { fillPolygon(poly, hi, 255); nWater++; }
  }
  const waterLayer = downsample(hi);
  log(`water polygons: ${nWater}`);

  hi.fill(0);
  const green = (await loadLayer("green")).elements;
  let nGreen = 0;
  for (const el of green) {
    const t = el.tags ?? {};
    const v = t.landuse === "cemetery" || t.leisure === "golf_course" ? 200 : t.natural === "wood" || t.landuse === "forest" ? 255 : 230;
    for (const poly of areaPolygons(el)) { fillPolygon(poly, hi, v); nGreen++; }
  }
  const greenLayer = downsample(hi);
  log(`green polygons: ${nGreen}`);

  // streets and bike network (only if every road tile is cached)
  const roadsReady = fetchTiles().every((t) => layerTileCached("roads", t));
  let streetLayer: Uint8Array = new Uint8Array(MW * MH), cycleLayer: Uint8Array = new Uint8Array(MW * MH), nRoads = 0;
  if (roadsReady) {
    const streets = new Uint8Array(HW * HH), cycles = new Uint8Array(HW * HH);
    const W: Record<string, [number, number]> = {
      motorway: [24, 255], trunk: [20, 245], motorway_link: [10, 200], trunk_link: [10, 200], primary: [15, 235], primary_link: [9, 200],
      secondary: [13, 220], tertiary: [11, 200], residential: [8, 165], unclassified: [8, 160], living_street: [6, 140],
    };
    {
      for (const el of (await loadLayer("roads")).elements) {
        if (!el.geometry) continue;
        const hw = el.tags?.highway ?? "";
        const pts = el.geometry.map(toXY);
        const tg = el.tags ?? {};
        const isCycle = hw === "cycleway" || /track|lane|separate/.test(tg.cycleway ?? "") || !!tg["cycleway:both"] || !!tg["cycleway:right"] || !!tg["cycleway:left"];
        if (W[hw] && tg.tunnel !== "yes") { strokeLine(pts, ((W[hw][0] / 2) * SS) / MASK_M, streets, W[hw][1]); nRoads++; }
        if (isCycle && tg.tunnel !== "yes") strokeLine(pts, Math.max(0.55, (2.2 * SS) / MASK_M), cycles, hw === "cycleway" ? 255 : 200);
      }
    }
    streetLayer = downsample(streets);
    cycleLayer = downsample(cycles);
    log(`roads: ${nRoads}`);
  } else log("roads: not fully cached yet, skipped");

  await mkdir(WORK, { recursive: true });
  await writeFile(`${WORK}/water.u8`, waterLayer);
  await writeFile(`${WORK}/mask.json`, JSON.stringify({ water: nWater, green: nGreen, roads: nRoads }));

  const png = new PNG({ width: MW, height: MH, colorType: 6 });
  for (let k = 0; k < MW * MH; k++) {
    png.data[k * 4] = 255 - waterLayer[k];
    png.data[k * 4 + 1] = greenLayer[k];
    png.data[k * 4 + 2] = streetLayer[k];
    png.data[k * 4 + 3] = cycleLayer[k];
  }
  const buf = PNG.sync.write(png, { deflateLevel: 9, colorType: 6 });
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/mask.png`, buf);
  log(`mask.png ${(buf.length / 1e6).toFixed(2)} MB`);
}

/* ---------- terrain + water surface ---------- */
const DX = 60;
async function buildTerrain(dem: Dem) {
  const water = new Uint8Array(await readFile(`${WORK}/water.u8`));
  const waterAt = (x: number, y: number) => {
    const px = (x - X0) / MASK_M - 0.5, py = (Y1 - y) / MASK_M - 0.5;
    const i = Math.max(0, Math.min(MW - 2, Math.floor(px))), j = Math.max(0, Math.min(MH - 2, Math.floor(py)));
    const u = Math.max(0, Math.min(1, px - i)), v = Math.max(0, Math.min(1, py - j));
    const k = j * MW + i;
    return ((water[k] * (1 - u) + water[k + 1] * u) * (1 - v) + (water[k + MW] * (1 - u) + water[k + MW + 1] * u) * v) / 255;
  };
  const nx = Math.ceil((X1 - X0) / DX) + 1, ny = Math.ceil((Y1 - Y0) / DX) + 1;
  log(`terrain grid ${nx}×${ny} at ${DX} m`);
  const raw = new Float32Array(nx * ny), cov = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = X0 + i * DX, y = Y0 + j * DX, { lat, lon } = toLL(x, y);
      raw[j * nx + i] = dem.at(lat, lon);
      // coverage over a small footprint so narrow channels still count
      let c = 0;
      for (const [a, b] of [[0, 0], [-15, -15], [15, -15], [-15, 15], [15, 15]]) c += waterAt(x + a, y + b);
      cov[j * nx + i] = c / 5;
    }
  const isW = (k: number) => cov[k] > 0.35;
  // local median of the DEM over water vertices (window 9×9 = 540 m) → smooth surface with rapids
  const level = new Float32Array(nx * ny).fill(NaN);
  const R = 4, tmp: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!isW(k)) continue;
      tmp.length = 0;
      for (let b = Math.max(0, j - R); b <= Math.min(ny - 1, j + R); b++)
        for (let a = Math.max(0, i - R); a <= Math.min(nx - 1, i + R); a++) if (isW(b * nx + a)) tmp.push(raw[b * nx + a]);
      tmp.sort((p, q) => p - q);
      // lower quartile: SRTM over water is biased up by shore and bridges
      level[k] = tmp[Math.floor(tmp.length * 0.3)];
    }
  for (let it = 0; it < 6; it++) {
    const prev = level.slice();
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (Number.isNaN(prev[k])) continue;
        let s = prev[k] * 2, n = 2;
        for (const d of [-1, 1, -nx, nx]) if (!Number.isNaN(prev[k + d])) { s += prev[k + d]; n++; }
        level[k] = s / n;
      }
  }
  // extend the surface three vertices under the shore so the mask, not the mesh, draws the coastline
  for (let step = 0; step < 3; step++) {
    const prev = level.slice();
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (!Number.isNaN(prev[k])) continue;
        let s = 0, n = 0;
        for (const d of [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1]) if (!Number.isNaN(prev[k + d])) { s += prev[k + d]; n++; }
        if (n) level[k] = s / n;
      }
  }
  const ground = new Float32Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    const w = level[k];
    if (Number.isNaN(w)) ground[k] = raw[k];
    else if (isW(k)) ground[k] = w - 4; // river bed
    else ground[k] = Math.max(Math.min(raw[k], raw[k] < w + 2 ? w + 0.4 : raw[k]), w - 1); // low banks hug the water
  }
  const t: Terrain = { nx, ny, x0: X0, y0: Y0, dx: DX, ground, water: level };
  const buf = gzipSync(encodeTerrain(t), { level: 9 });
  await writeFile(`${OUT}/terrain.bin.gz`, buf);
  let mn = Infinity, mx = -Infinity;
  for (const g of raw) { mn = Math.min(mn, g); mx = Math.max(mx, g); }
  log(`terrain.bin.gz ${(buf.length / 1e6).toFixed(2)} MB, ground ${mn.toFixed(0)}…${mx.toFixed(0)} m`);
}

/* ---------- buildings ---------- */
function parseLen(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.replace(",", ".").match(/^\s*(-?[\d.]+)\s*(m|ft|feet|')?/i);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (m[2] && /ft|feet|'/i.test(m[2])) n *= 0.3048;
  return Number.isFinite(n) ? n : undefined;
}
const DEFAULT_H: Record<string, number> = {
  house: 7.5, detached: 7.5, semidetached_house: 8, bungalow: 5, cabin: 4, residential: 10, terrace: 10, apartments: 13, dormitory: 14,
  garage: 3.5, garages: 3.5, shed: 3, carport: 3, roof: 5, hut: 3, kiosk: 3, service: 4, greenhouse: 4,
  commercial: 10, retail: 8, office: 16, supermarket: 7, hotel: 24, industrial: 10, warehouse: 10, manufacture: 11,
  church: 16, cathedral: 30, chapel: 10, mosque: 12, synagogue: 12, temple: 12, school: 12, university: 16, college: 14,
  hospital: 20, public: 14, civic: 14, government: 14, train_station: 12, transportation: 10, stadium: 25, parking: 9,
};
const CIVIC = new Set(["church", "cathedral", "chapel", "mosque", "synagogue", "temple", "school", "university", "college", "hospital", "public", "civic", "government", "train_station", "stadium"]);
const INDUSTRIAL = new Set(["industrial", "warehouse", "manufacture", "hangar", "storage_tank"]);

interface B { rings: Ring[]; height: number; min: number; kind: number; part: boolean; area: number; cx: number; cy: number; base: number }

function buildingFrom(el: OsmElement, polyRings: Ring[], dem: Dem): B | null {
  const t = el.tags ?? {};
  const part = !t.building && !!t["building:part"];
  const type = (t.building && t.building !== "yes" ? t.building : t["building:part"] !== "yes" ? t["building:part"] : "") ?? "";
  if (type === "no" || t.building === "no" || t["building:part"] === "no") return null;
  if (t.location === "underground") return null;
  const outer = polyRings[0];
  let area = ringArea(outer);
  if (area < 0) { outer.reverse(); area = -area; }
  const holes = polyRings.slice(1).map((h) => (ringArea(h) > 0 ? h.slice().reverse() : h));
  if (area < 15) return null;
  if ((type === "shed" || type === "carport" || type === "roof" || type === "hut") && area < 40) return null;
  const levels = parseLen(t["building:levels"]);
  const roofLevels = parseLen(t["roof:levels"]) ?? 0;
  let height = parseLen(t.height) ?? (levels !== undefined ? levels * 3.1 + (roofLevels ? roofLevels * 1.6 : 1) : undefined) ?? DEFAULT_H[type] ?? 8;
  height = Math.max(2.5, Math.min(330, height));
  let min = parseLen(t.min_height) ?? (t["building:min_level"] ? (parseLen(t["building:min_level"]) ?? 0) * 3.1 : 0);
  min = Math.max(0, Math.min(height - 1, min));
  const kind = part ? KIND.part : CIVIC.has(type) ? KIND.civic : INDUSTRIAL.has(type) ? KIND.industrial : height > 40 ? KIND.tower : height > 13 ? KIND.mid : KIND.house;
  const [cx, cy] = centroid(outer);
  let base = Infinity;
  for (const [x, y] of outer) { const { lat, lon } = toLL(x, y); base = Math.min(base, dem.at(lat, lon)); }
  return { rings: [outer, ...holes], height, min, kind, part, area, cx, cy, base };
}

async function buildBuildings(dem: Dem) {
  const all: B[] = [];
  const { elements, missing } = await loadLayer("buildings", true);
  for (const el of elements)
    for (const poly of areaPolygons(el)) {
      const b = buildingFrom(el, poly, dem);
      if (b) all.push(b);
    }
  if (missing) log(`WARNING: ${missing} building fetch tiles are not cached yet; output is partial`);
  log(`${all.length} footprints (${all.filter((b) => b.part).length} parts)`);

  // An outline that contains building:parts is drawn by its parts instead.
  const H = 100, hash = new Map<string, number[]>();
  all.forEach((b, i) => {
    if (!b.part) return;
    const k = `${Math.floor(b.cx / H)},${Math.floor(b.cy / H)}`;
    const l = hash.get(k); if (l) l.push(i); else hash.set(k, [i]);
  });
  const drop = new Uint8Array(all.length);
  all.forEach((b, i) => {
    if (b.part) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of b.rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    for (let gx = Math.floor(x0 / H); gx <= Math.floor(x1 / H); gx++)
      for (let gy = Math.floor(y0 / H); gy <= Math.floor(y1 / H); gy++)
        for (const p of hash.get(`${gx},${gy}`) ?? []) {
          const q = all[p];
          if (q.area < b.area * 1.05 && pointInRing(q.cx, q.cy, b.rings[0])) { drop[i] = 1; return; }
        }
  });
  const kept = all.filter((_, i) => !drop[i]);
  log(`${kept.length} after replacing outlines with their parts (${all.length - kept.length} outlines dropped)`);

  // group by street-grid tile and block
  const byTile = new Map<string, B[]>();
  type Acc = { a: number; ah: number; ab: number; u: number; v: number; maxH: number; tu: number; tv: number };
  const blocks = new Map<string, Acc>();
  for (const b of kept) {
    const [u, v] = toGrid(b.cx, b.cy);
    const tu = Math.floor(u / TILE), tv = Math.floor(v / TILE);
    const key = `${tu}_${tv}`;
    const l = byTile.get(key); if (l) l.push(b); else byTile.set(key, [b]);
    const bu = Math.floor(u / BLOCK), bv = Math.floor(v / BLOCK), bk = `${bu}_${bv}`;
    let acc = blocks.get(bk);
    if (!acc) blocks.set(bk, (acc = { a: 0, ah: 0, ab: 0, u: 0, v: 0, maxH: 0, tu, tv }));
    const fa = b.part ? b.area * 0.3 : b.area; // parts overlap their siblings
    acc.a += fa; acc.ah += fa * b.height; acc.ab += fa * b.base; acc.u += fa * u; acc.v += fa * v;
    acc.maxH = Math.max(acc.maxH, b.height);
  }

  await rm(`${OUT}/tiles`, { recursive: true, force: true });
  await mkdir(`${OUT}/tiles`, { recursive: true });
  const index: CityIndex["tiles"] = [];
  const tileId = new Map<string, number>();
  let bytes = 0;
  for (const [key, list] of [...byTile].sort()) {
    const [tu, tv] = key.split("_").map(Number);
    const [ox, oy] = fromGrid((tu + 0.5) * TILE, (tv + 0.5) * TILE);
    const tb: TileBuilding[] = list.map((b) => ({
      height: b.height, minHeight: b.min, base: b.base, kind: b.kind,
      rings: b.rings.map((r) => simplifyRing(r, b.height > 40 ? 0.25 : 0.6)).filter((r) => r.length >= 3),
    }));
    // tall first: the client can stop early on a triangle budget
    tb.sort((a, b) => b.height - a.height);
    const gz = gzipSync(encodeTile(ox, oy, tb), { level: 9 });
    await writeFile(`${OUT}/tiles/${key}.bin.gz`, gz);
    bytes += gz.length;
    tileId.set(key, index.length);
    index.push({ u: tu, v: tv, x: Math.round(ox), y: Math.round(oy), n: list.length, maxH: Math.round(Math.max(...list.map((b) => b.height))), bytes: gz.length });
  }
  log(`${index.length} detail tiles, ${(bytes / 1e6).toFixed(1)} MB total`);

  const bx: number[] = [], by: number[] = [], bs: number[] = [], bh: number[] = [], bb: number[] = [], bt: number[] = [];
  for (const acc of blocks.values()) {
    const cover = Math.min(1, acc.a / (BLOCK * BLOCK));
    if (cover < 0.02) continue;
    const [x, y] = fromGrid(acc.u / acc.a, acc.v / acc.a);
    bx.push(+x.toFixed(1)); by.push(+y.toFixed(1));
    bs.push(Math.max(8, Math.sqrt(cover) * BLOCK * 0.92));
    const mean = acc.ah / acc.a;
    bh.push(Math.min(330, mean * 0.7 + acc.maxH * 0.3));
    bb.push(acc.ab / acc.a);
    bt.push(tileId.get(`${acc.tu}_${acc.tv}`) ?? 0);
  }
  const bgz = gzipSync(encodeBlocks({ x: bx, y: by, size: bs, height: bh, base: bb, tile: bt }), { level: 9 });
  await writeFile(`${OUT}/blocks.bin.gz`, bgz);
  log(`blocks.bin.gz ${bx.length} blocks, ${(bgz.length / 1e6).toFixed(2)} MB (${BLOCKS_PER_TILE}² cells per tile)`);

  const maskInfo = existsSync(`${WORK}/mask.json`) ? JSON.parse(await readFile(`${WORK}/mask.json`, "utf8")) : { water: 0, green: 0, roads: 0 };
  const idx: CityIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    region: { ...REGION },
    bounds: { x0: X0, y0: Y0, x1: X1, y1: Y1 },
    gridBearing: GRID_BEARING,
    tile: TILE,
    block: BLOCK,
    mask: { file: "mask.png", width: MW, height: MH },
    terrain: { file: "terrain.bin.gz" },
    blocks: { file: "blocks.bin.gz", count: bx.length },
    tiles: index,
    stats: { buildings: kept.length, parts: kept.filter((b) => b.part).length, ...maskInfo },
  };
  await writeFile(`${OUT}/index.json`, JSON.stringify(idx));
  log("index.json written");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  if (only.has("mask")) await buildMask();
  let dem: Dem | null = null;
  const getDem = async () => (dem ??= await loadDem({ s: REGION.s - 0.01, w: REGION.w - 0.01, n: REGION.n + 0.01, e: REGION.e + 0.01 }, ".cache/dem"));
  if (only.has("terrain")) await buildTerrain(await getDem());
  if (only.has("buildings")) await buildBuildings(await getDem());
  log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
