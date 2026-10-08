/**
 * BIXI GBFS 2.2, trimmed to what the dashboard needs. The upstream
 * station_status is ~0.5 MB; the trimmed, columnar form is ~25 KB.
 */
export const GBFS_ROOT = "https://gbfs.velobixi.com/gbfs/2-2/en";

export interface LiveStatus {
  /** upstream last_updated, epoch seconds */
  t: number;
  /** when our proxy fetched it, epoch seconds */
  fetched: number;
  ids: string[];
  /** bikes available (includes e-bikes) */
  b: number[];
  /** e-bikes available */
  e: number[];
  /** docks available */
  d: number[];
  /** bit 0 renting, bit 1 returning, bit 2 installed */
  f: number[];
}

export interface StationInfo {
  t: number;
  ids: string[];
  name: string[];
  lat: number[];
  lon: number[];
  cap: number[];
}

interface RawStatus {
  last_updated: number;
  data: {
    stations: Array<{
      station_id: string;
      num_bikes_available: number;
      num_ebikes_available?: number;
      num_docks_available: number;
      is_installed: number;
      is_renting: number;
      is_returning: number;
    }>;
  };
}
interface RawInfo {
  last_updated: number;
  data: { stations: Array<{ station_id: string; name: string; lat: number; lon: number; capacity: number }> };
}

export function trimStatus(raw: RawStatus, fetched: number): LiveStatus {
  const s = raw.data.stations;
  return {
    t: raw.last_updated,
    fetched,
    ids: s.map((x) => x.station_id),
    b: s.map((x) => x.num_bikes_available | 0),
    e: s.map((x) => (x.num_ebikes_available ?? 0) | 0),
    d: s.map((x) => x.num_docks_available | 0),
    f: s.map((x) => (x.is_renting ? 1 : 0) | (x.is_returning ? 2 : 0) | (x.is_installed ? 4 : 0)),
  };
}

/** Test and depot stations sit at (0, 0) or far outside the service area. */
const inService = (lat: number, lon: number) => lat > 45.2 && lat < 45.9 && lon > -74.2 && lon < -73.2;

export function trimInfo(raw: RawInfo): StationInfo {
  const s = raw.data.stations.filter((x) => inService(x.lat, x.lon));
  return {
    t: raw.last_updated,
    ids: s.map((x) => x.station_id),
    name: s.map((x) => x.name.trim()),
    lat: s.map((x) => +x.lat.toFixed(6)),
    lon: s.map((x) => +x.lon.toFixed(6)),
    cap: s.map((x) => x.capacity | 0),
  };
}

export async function fetchUpstream<T>(feed: "station_status" | "station_information"): Promise<T> {
  const res = await fetch(`${GBFS_ROOT}/${feed}.json`, {
    cache: "no-store",
    headers: { "User-Agent": "bixi-story (unofficial portfolio dashboard)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GBFS ${feed}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type { RawStatus, RawInfo };
