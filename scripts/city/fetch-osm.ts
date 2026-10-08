/**
 * Step 1 of the city build: download everything from Overpass into .cache/osm.
 * Resumable: cached tiles are skipped. Run: npx tsx scripts/city/fetch-osm.ts [layers…]
 */
import { fetchLayerTile, fetchTiles, layerTileCached, type Layer } from "./osm";

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s] ${s}`);
const layers = (process.argv.slice(2).length ? process.argv.slice(2) : ["water", "green", "buildings", "roads"]) as Layer[];

async function main() {
  const tiles = fetchTiles();
  for (const layer of layers) {
    const todo = tiles.filter((t) => !layerTileCached(layer, t));
    log(`${layer}: ${tiles.length - todo.length}/${tiles.length} cached`);
    let done = tiles.length - todo.length, total = 0;
    // two requests in flight: polite to a 4-slot public server
    await Promise.all(
      [0, 1].map(async () => {
        for (let t = todo.shift(); t; t = todo.shift()) {
          const els = await fetchLayerTile(layer, t);
          total += els.length;
          log(`${layer} ${++done}/${tiles.length} ${t.key}: ${els.length}`);
        }
      }),
    );
    log(`${layer} complete (${total} new elements)`);
  }
  log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
