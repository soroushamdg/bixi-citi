import { cached, sleep, UA } from "./net";

/**
 * Public Overpass servers get overloaded. Rotate through mirrors, back off on
 * 429/504, and cache every successful answer on disk so a rerun is free.
 */
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface OsmGeomPoint {
  lat: number;
  lon: number;
}
export interface OsmMember {
  type: "way" | "node" | "relation";
  ref: number;
  role: string;
  geometry?: OsmGeomPoint[];
}
export interface OsmElement {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmGeomPoint[];
  members?: OsmMember[];
}

/** The query itself is too heavy for one request: the caller should split it. */
export class TooBig extends Error {}

export async function overpass(query: string, cachePath: string, { attempts = 16 } = {}): Promise<OsmElement[]> {
  const buf = await cached(cachePath, async () => {
    // Start every query on the main instance; mirrors are the fallback.
    for (let attempt = 0; attempt < attempts; attempt++) {
      // the main instance is the most reliable; every third try goes to a mirror
      const url = attempt % 3 === 2 ? MIRRORS[1 + (Math.floor(attempt / 3) % (MIRRORS.length - 1))] : MIRRORS[0];
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(400_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = Buffer.from(await res.arrayBuffer());
        // Overpass reports timeouts and memory errors inside a 200 response.
        const tail = body.subarray(Math.max(0, body.length - 2000)).toString("utf8");
        const remark = tail.match(/"remark":\s*"([^"]*)"/)?.[1];
        if (remark && /timed out|out of memory/i.test(remark)) throw new TooBig(remark);
        if (remark && /runtime (error|remark)/.test(remark)) throw new Error(remark);
        JSON.parse(body.toString("utf8")); // validate before caching
        return body;
      } catch (err) {
        if (err instanceof TooBig) throw err;
        const host = new URL(url).host;
        const wait = Math.min(30_000, 3000 + attempt * 2500);
        console.warn(`  ↻ overpass ${host}: ${(err as Error).message.slice(0, 160)}; next in ${(wait / 1000).toFixed(0)} s`);
        await sleep(wait);
      }
    }
    throw new Error("All Overpass mirrors failed for " + cachePath);
  });
  return (JSON.parse(buf.toString("utf8")) as { elements: OsmElement[] }).elements;
}
