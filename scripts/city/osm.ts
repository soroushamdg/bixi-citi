import { existsSync } from "node:fs";
import { REGION } from "../../lib/geo";
import { overpass, TooBig, type OsmElement } from "../lib/overpass";

export const CACHE = ".cache/osm";

type BBox = { s: number; w: number; n: number; e: number };
const bboxStr = (b: BBox) => `${b.s.toFixed(5)},${b.w.toFixed(5)},${b.n.toFixed(5)},${b.e.toFixed(5)}`;

/**
 * Busy Overpass servers refuse queries that declare a long timeout, so every
 * query declares 60 s and covers a small tile (~2.8 × 2.7 km). A tile that
 * still fails is split into four, down to ~700 m.
 */
export const FETCH_DLAT = 0.025;
export const FETCH_DLON = 0.035;

export function fetchTiles() {
  const tiles: (BBox & { key: string })[] = [];
  const nj = Math.ceil((REGION.n - REGION.s) / FETCH_DLAT - 1e-9);
  const ni = Math.ceil((REGION.e - REGION.w) / FETCH_DLON - 1e-9);
  for (let j = 0; j < nj; j++)
    for (let i = 0; i < ni; i++) {
      const s = REGION.s + j * FETCH_DLAT, w = REGION.w + i * FETCH_DLON;
      tiles.push({ key: `${j}_${i}`, s, w, n: Math.min(REGION.n, s + FETCH_DLAT), e: Math.min(REGION.e, w + FETCH_DLON) });
    }
  return tiles;
}

/**
 * One query per tile fetches every layer at once: on a busy server the cost is
 * getting a request accepted, not running it, so fewer requests win.
 */
const ALL = `(
  way["building"];
  way["building:part"];
  relation["building"];
  relation["building:part"];
  way["natural"~"^(water|wood|scrub|grassland|wetland|heath)$"];
  relation["natural"~"^(water|wood|scrub|grassland|wetland|heath)$"];
  way["waterway"="riverbank"];
  relation["waterway"="riverbank"];
  way["landuse"~"^(reservoir|basin|grass|forest|recreation_ground|cemetery|meadow|village_green)$"];
  relation["landuse"~"^(reservoir|basin|grass|forest|recreation_ground|cemetery|meadow|village_green)$"];
  way["leisure"~"^(park|garden|golf_course|nature_reserve)$"];
  relation["leisure"~"^(park|garden|golf_course|nature_reserve)$"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|motorway_link|trunk_link|primary_link)$"];
  way["highway"]["cycleway"~"^(track|lane|separate)$"];
  way["highway"]["cycleway:both"];
);`;

const ROAD = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|motorway_link|trunk_link|primary_link)$/;
export const LAYER_TEST = {
  buildings: (t: Record<string, string>) => !!t.building || !!t["building:part"],
  water: (t: Record<string, string>) => t.natural === "water" || t.waterway === "riverbank" || t.landuse === "reservoir" || t.landuse === "basin",
  green: (t: Record<string, string>) =>
    /^(park|garden|golf_course|nature_reserve)$/.test(t.leisure ?? "") ||
    /^(grass|forest|recreation_ground|cemetery|meadow|village_green)$/.test(t.landuse ?? "") ||
    /^(wood|scrub|grassland|wetland|heath)$/.test(t.natural ?? ""),
  roads: (t: Record<string, string>) => !!t.highway && (ROAD.test(t.highway) || /track|lane|separate/.test(t.cycleway ?? "") || !!t["cycleway:both"]),
} as const;
export type Layer = keyof typeof LAYER_TEST;

const query = (b: BBox) => `[out:json][timeout:60][bbox:${bboxStr(b)}];\n${ALL}\nout geom qt;`;

/** Fetch one tile, splitting into quadrants when the server keeps failing. */
async function fetchLeaf(b: BBox, key: string, depth: number): Promise<OsmElement[]> {
  const path = `${CACHE}/all/${key}.json.gz`;
  const marker = `${CACHE}/all/${key}.split`;
  if (!existsSync(marker)) {
    try {
      // a busy server is retried; only a query that is too heavy gets split
      return await overpass(query(b), path, { attempts: 40 });
    } catch (err) {
      if (!(err instanceof TooBig) || depth >= 2) throw err;
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(`${CACHE}/all`, { recursive: true });
      await writeFile(marker, "");
      console.warn(`  ✂ splitting ${key}`);
    }
  }
  const ms = (b.s + b.n) / 2, mw = (b.w + b.e) / 2;
  const quads: BBox[] = [
    { s: b.s, w: b.w, n: ms, e: mw }, { s: b.s, w: mw, n: ms, e: b.e },
    { s: ms, w: b.w, n: b.n, e: mw }, { s: ms, w: mw, n: b.n, e: b.e },
  ];
  const out: OsmElement[] = [];
  for (let q = 0; q < 4; q++) out.push(...(await fetchLeaf(quads[q], `${key}-${q}`, depth + 1)));
  return out;
}

export async function fetchTile(t: ReturnType<typeof fetchTiles>[number]) {
  return fetchLeaf(t, t.key, 0);
}

export function tileCached(t: ReturnType<typeof fetchTiles>[number]) {
  return existsSync(`${CACHE}/all/${t.key}.json.gz`) || existsSync(`${CACHE}/all/${t.key}.split`);
}

/**
 * Where the build reads OSM from. Overpass is the primary source; when its
 * tile cache is incomplete (busy or unreachable servers), the regional PBF
 * extract stands in. OSM_SOURCE=overpass|pbf forces one.
 */
export function osmSource(): "overpass" | "pbf" {
  const forced = process.env.OSM_SOURCE;
  if (forced === "overpass" || forced === "pbf") return forced;
  return fetchTiles().every(tileCached) ? "overpass" : "pbf";
}

let pbfAll: Promise<OsmElement[]> | null = null;
const anyLayer = (t: Record<string, string>) => Object.values(LAYER_TEST).some((f) => f(t));

/** Every element of a layer over the whole region, deduplicated across tiles. */
export async function loadLayer(layer: Layer, onlyCached = false): Promise<{ elements: OsmElement[]; missing: number }> {
  if (osmSource() === "pbf") {
    const { loadPbf } = await import("./pbf");
    pbfAll ??= loadPbf(anyLayer);
    const test = LAYER_TEST[layer];
    return { elements: (await pbfAll).filter((el) => test(el.tags ?? {})), missing: 0 };
  }
  const seen = new Set<string>();
  const elements: OsmElement[] = [];
  const test = LAYER_TEST[layer];
  let missing = 0;
  for (const t of fetchTiles()) {
    if (onlyCached && !tileCached(t)) { missing++; continue; }
    for (const el of await fetchTile(t)) {
      if (!test(el.tags ?? {})) continue;
      const id = el.type[0] + el.id;
      if (seen.has(id)) continue;
      seen.add(id);
      elements.push(el);
    }
  }
  return { elements, missing };
}
