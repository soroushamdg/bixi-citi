/**
 * Step 1 of the city build: download everything from Overpass into .cache/osm.
 * Resumable: cached tiles are skipped. Run: npx tsx scripts/city/fetch-osm.ts
 */
import { fetchTile, fetchTiles, tileCached } from "./osm";

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s] ${s}`);

async function main() {
  const tiles = fetchTiles();
  // downtown first, so a partial cache already covers the story
  const centre = { lat: 45.508, lon: -73.57 };
  const todo = tiles
    .filter((t) => !tileCached(t))
    .sort((a, b) => Math.hypot((a.s + a.n) / 2 - centre.lat, ((a.w + a.e) / 2 - centre.lon) * 0.7) - Math.hypot((b.s + b.n) / 2 - centre.lat, ((b.w + b.e) / 2 - centre.lon) * 0.7));
  let done = tiles.length - todo.length;
  log(`${done}/${tiles.length} tiles cached`);
  // one request at a time with a pause: a public server banned us once for less
  for (let t = todo.shift(); t; t = todo.shift()) {
    const els = await fetchTile(t);
    log(`${++done}/${tiles.length} ${t.key}: ${els.length}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
