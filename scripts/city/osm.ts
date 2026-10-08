import { existsSync } from "node:fs";
import { REGION } from "../../lib/geo";
import { overpass, type OsmElement } from "../lib/overpass";

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

const LAYERS = {
  buildings: `(
  way["building"];
  way["building:part"];
  relation["building"];
  relation["building:part"];
);`,
  water: `(
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
  relation["waterway"="riverbank"];
  way["landuse"~"^(reservoir|basin)$"];
  relation["landuse"~"^(reservoir|basin)$"];
);`,
  green: `(
  way["leisure"~"^(park|garden|golf_course|nature_reserve)$"];
  relation["leisure"~"^(park|garden|golf_course|nature_reserve)$"];
  way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"];
  relation["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"];
  way["natural"~"^(wood|scrub|grassland|wetland|heath)$"];
  relation["natural"~"^(wood|scrub|grassland|wetland|heath)$"];
);`,
  roads: `(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|cycleway|motorway_link|trunk_link|primary_link)$"];
  way["highway"]["cycleway"~"^(track|lane|separate)$"];
  way["highway"]["cycleway:both"];
);`,
} as const;
export type Layer = keyof typeof LAYERS;

const query = (layer: Layer, b: BBox) => `[out:json][timeout:60][bbox:${bboxStr(b)}];\n${LAYERS[layer]}\nout geom qt;`;

/** Fetch one tile of one layer, splitting into quadrants when the server keeps failing. */
async function fetchLeaf(layer: Layer, b: BBox, key: string, depth: number): Promise<OsmElement[]> {
  const path = `${CACHE}/${layer}/${key}.json.gz`;
  const marker = `${CACHE}/${layer}/${key}.split`;
  if (!existsSync(marker)) {
    try {
      return await overpass(query(layer, b), path, { attempts: depth < 2 ? 6 : 16 });
    } catch (err) {
      if (depth >= 2) throw err;
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(`${CACHE}/${layer}`, { recursive: true });
      await writeFile(marker, "");
      console.warn(`  ✂ splitting ${layer} ${key}`);
    }
  }
  const ms = (b.s + b.n) / 2, mw = (b.w + b.e) / 2;
  const quads: BBox[] = [
    { s: b.s, w: b.w, n: ms, e: mw }, { s: b.s, w: mw, n: ms, e: b.e },
    { s: ms, w: b.w, n: b.n, e: mw }, { s: ms, w: mw, n: b.n, e: b.e },
  ];
  const out: OsmElement[] = [];
  for (let q = 0; q < 4; q++) out.push(...(await fetchLeaf(layer, quads[q], `${key}-${q}`, depth + 1)));
  return out;
}

export async function fetchLayerTile(layer: Layer, t: ReturnType<typeof fetchTiles>[number]) {
  return fetchLeaf(layer, t, t.key, 0);
}

export function layerTileCached(layer: Layer, t: ReturnType<typeof fetchTiles>[number]) {
  return existsSync(`${CACHE}/${layer}/${t.key}.json.gz`) || existsSync(`${CACHE}/${layer}/${t.key}.split`);
}

/** Every element of a layer over the whole region, deduplicated across tiles. */
export async function loadLayer(layer: Layer, onlyCached = false): Promise<{ elements: OsmElement[]; missing: number }> {
  const seen = new Set<string>();
  const elements: OsmElement[] = [];
  let missing = 0;
  for (const t of fetchTiles()) {
    if (onlyCached && !layerTileCached(layer, t)) { missing++; continue; }
    for (const el of await fetchLayerTile(layer, t)) {
      const id = el.type[0] + el.id;
      if (seen.has(id)) continue;
      seen.add(id);
      elements.push(el);
    }
  }
  return { elements, missing };
}
