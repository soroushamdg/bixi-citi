/**
 * Fallback OSM source: a regional .osm.pbf extract (BBBike's "Montreal",
 * 45.30–45.75 N, 74.09–73.27 W), decoded here with a minimal reader of the
 * OSM PBF format. It yields the same element shape as Overpass `out geom`,
 * so the rest of the build does not care where the data came from.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PbfReader } from "pbf";
import { REGION } from "../../lib/geo";
import { cached, fetchRetry } from "../lib/net";
import type { OsmElement, OsmGeomPoint } from "../lib/overpass";

export const PBF_URL = "https://download.bbbike.org/osm/bbbike/Montreal/Montreal.osm.pbf";
export const PBF_PATH = ".cache/osm/Montreal.osm.pbf";

type Keep = (tags: Record<string, string>) => boolean;

/** Iterate the uncompressed PrimitiveBlocks of a .osm.pbf file. */
function* blocks(file: Uint8Array): Generator<PbfReader> {
  let pos = 0;
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  while (pos < file.length) {
    const headerLen = dv.getInt32(pos, false);
    pos += 4;
    const header = new PbfReader(file.subarray(pos, pos + headerLen)).readFields(
      (tag, h: { type: string; size: number }, p) => {
        if (tag === 1) h.type = p.readString();
        else if (tag === 3) h.size = p.readVarint();
      },
      { type: "", size: 0 },
    );
    pos += headerLen;
    const blob = new PbfReader(file.subarray(pos, pos + header.size)).readFields(
      (tag, b: { raw?: Uint8Array; zlib?: Uint8Array }, p) => {
        if (tag === 1) b.raw = p.readBytes();
        else if (tag === 3) b.zlib = p.readBytes();
        else if (tag === 4 || tag === 6 || tag === 7) throw new Error("only raw and zlib PBF blobs are supported");
      },
      {},
    );
    pos += header.size;
    if (header.type !== "OSMData") continue;
    yield new PbfReader(blob.raw ?? inflateSync(blob.zlib!));
  }
}

interface Block {
  strings: string[];
  gran: number;
  latOff: number;
  lonOff: number;
  groups: Array<[number, number]>; // [start, end] of each PrimitiveGroup
}
function readBlock(p: PbfReader): Block {
  const b: Block = { strings: [], gran: 100, latOff: 0, lonOff: 0, groups: [] };
  p.readFields((tag, r: Block, q) => {
    if (tag === 1) q.readMessage((t, arr: string[], x) => { if (t === 1) arr.push(x.readString()); }, r.strings);
    else if (tag === 2) {
      const len = q.readVarint();
      r.groups.push([q.pos, q.pos + len]);
      q.pos += len;
    } else if (tag === 17) r.gran = q.readVarint();
    else if (tag === 19) r.latOff = q.readVarint(true);
    else if (tag === 20) r.lonOff = q.readVarint(true);
  }, b);
  return b;
}

const tagsOf = (keys: number[], vals: number[], s: string[]) => {
  const t: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) t[s[keys[i]]] = s[vals[i]];
  return t;
};

/** All elements that pass `keep`, with geometry, clipped to features touching REGION. */
export async function loadPbf(keep: Keep): Promise<OsmElement[]> {
  if (!existsSync(PBF_PATH)) await cached(PBF_PATH, () => fetchRetry(PBF_URL, {}, { label: "Montreal.osm.pbf", timeoutMs: 1_800_000 }));
  const file = new Uint8Array(await readFile(PBF_PATH));
  const t0 = Date.now();

  // pass 1: relations we want, and the ways they are built from
  const rels: Array<{ id: number; tags: Record<string, string>; members: Array<{ type: "way" | "node" | "relation"; ref: number; role: string }> }> = [];
  const memberWays = new Set<number>();
  for (const p of blocks(file)) {
    const b = readBlock(p);
    for (const [s, e] of b.groups) {
      p.pos = s;
      p.readFields((tag, _r, q) => {
        if (tag !== 4) return;
        const rel = q.readMessage(
          (t, r: { id: number; keys: number[]; vals: number[]; roles: number[]; mem: number[]; types: number[] }, x) => {
            if (t === 1) r.id = x.readVarint();
            else if (t === 2) x.readPackedVarint(r.keys);
            else if (t === 3) x.readPackedVarint(r.vals);
            else if (t === 8) x.readPackedVarint(r.roles, true);
            else if (t === 9) x.readPackedSVarint(r.mem);
            else if (t === 10) x.readPackedVarint(r.types);
          },
          { id: 0, keys: [], vals: [], roles: [], mem: [], types: [] },
        );
        const tags = tagsOf(rel.keys, rel.vals, b.strings);
        if (!keep(tags)) return;
        let ref = 0;
        const members = rel.mem.map((d, i) => {
          ref += d;
          const type = (["node", "way", "relation"] as const)[rel.types[i]];
          if (type === "way") memberWays.add(ref);
          return { type, ref, role: b.strings[rel.roles[i]] };
        });
        rels.push({ id: rel.id, tags, members });
      }, null, e);
    }
  }

  // pass 2: every node (sorted ids → binary search), and the ways we need
  let nCap = 1 << 23, nLen = 0;
  let nIds = new Float64Array(nCap), nLat = new Int32Array(nCap), nLon = new Int32Array(nCap);
  const pushNode = (id: number, lat: number, lon: number) => {
    if (nLen === nCap) {
      nCap *= 2;
      const a = new Float64Array(nCap); a.set(nIds); nIds = a;
      const b2 = new Int32Array(nCap); b2.set(nLat); nLat = b2;
      const c = new Int32Array(nCap); c.set(nLon); nLon = c;
    }
    nIds[nLen] = id; nLat[nLen] = lat; nLon[nLen] = lon; nLen++;
  };
  const ways = new Map<number, { tags: Record<string, string>; refs: number[]; keep: boolean }>();
  for (const p of blocks(file)) {
    const b = readBlock(p);
    const toE7 = (v: number, off: number) => Math.round((off + b.gran * v) / 100); // 1e-7 degrees
    for (const [s, e] of b.groups) {
      p.pos = s;
      p.readFields((tag, _r, q) => {
        if (tag === 2) {
          const d = q.readMessage((t, r: { id: number[]; lat: number[]; lon: number[] }, x) => {
            if (t === 1) x.readPackedSVarint(r.id);
            else if (t === 8) x.readPackedSVarint(r.lat);
            else if (t === 9) x.readPackedSVarint(r.lon);
          }, { id: [], lat: [], lon: [] });
          let id = 0, lat = 0, lon = 0;
          for (let i = 0; i < d.id.length; i++) {
            id += d.id[i]; lat += d.lat[i]; lon += d.lon[i];
            pushNode(id, toE7(lat, b.latOff), toE7(lon, b.lonOff));
          }
        } else if (tag === 1) {
          const n = q.readMessage((t, r: { id: number; lat: number; lon: number }, x) => {
            if (t === 1) r.id = x.readSVarint();
            else if (t === 8) r.lat = x.readSVarint();
            else if (t === 9) r.lon = x.readSVarint();
          }, { id: 0, lat: 0, lon: 0 });
          pushNode(n.id, toE7(n.lat, b.latOff), toE7(n.lon, b.lonOff));
        } else if (tag === 3) {
          const w = q.readMessage((t, r: { id: number; keys: number[]; vals: number[]; refs: number[] }, x) => {
            if (t === 1) r.id = x.readVarint();
            else if (t === 2) x.readPackedVarint(r.keys);
            else if (t === 3) x.readPackedVarint(r.vals);
            else if (t === 8) x.readPackedSVarint(r.refs);
          }, { id: 0, keys: [], vals: [], refs: [] });
          const tags = tagsOf(w.keys, w.vals, b.strings);
          const k = keep(tags);
          if (!k && !memberWays.has(w.id)) return;
          let ref = 0;
          ways.set(w.id, { tags, refs: w.refs.map((dd) => (ref += dd)), keep: k });
        }
      }, null, e);
    }
  }
  // PBF writers sort nodes by id, but don't trust it blindly
  let sorted = true;
  for (let i = 1; i < nLen && sorted; i++) if (nIds[i] < nIds[i - 1]) sorted = false;
  if (!sorted) throw new Error("PBF nodes are not sorted by id");
  const find = (id: number) => {
    let lo = 0, hi = nLen - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, v = nIds[mid];
      if (v === id) return mid;
      if (v < id) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  };
  const geom = (refs: number[]): OsmGeomPoint[] => {
    const out: OsmGeomPoint[] = [];
    for (const r of refs) {
      const k = find(r);
      if (k >= 0) out.push({ lat: nLat[k] / 1e7, lon: nLon[k] / 1e7 });
    }
    return out;
  };
  const inRegion = (g: OsmGeomPoint[]) => g.some((p) => p.lat >= REGION.s && p.lat <= REGION.n && p.lon >= REGION.w && p.lon <= REGION.e);

  const out: OsmElement[] = [];
  for (const [id, w] of ways) {
    if (!w.keep) continue;
    const g = geom(w.refs);
    if (g.length >= 2 && inRegion(g)) out.push({ type: "way", id, tags: w.tags, geometry: g });
  }
  for (const r of rels) {
    const members = r.members
      .filter((m) => m.type === "way" && ways.has(m.ref))
      .map((m) => ({ type: "way" as const, ref: m.ref, role: m.role, geometry: geom(ways.get(m.ref)!.refs) }));
    if (members.some((m) => inRegion(m.geometry))) out.push({ type: "relation", id: r.id, tags: r.tags, members });
  }
  console.log(`  pbf: ${nLen.toLocaleString()} nodes, ${out.length.toLocaleString()} features in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return out;
}
