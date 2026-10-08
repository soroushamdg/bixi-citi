/**
 * Shared projection for the scene, the UI and the build scripts.
 * World space is metres on a local tangent plane around the Plateau:
 * x = east, y = north. The 3D scene uses (x, up, -y).
 */

export const LAT0 = 45.515;
export const LON0 = -73.585;
const RAD = Math.PI / 180;
/** metres per degree of longitude / latitude at LAT0 */
export const KX = 111320 * Math.cos(LAT0 * RAD);
export const KY = 110574;

export const project = (lat: number, lon: number): [number, number] => [
  (lon - LON0) * KX,
  (lat - LAT0) * KY,
];
export const toLon = (x: number) => LON0 + x / KX;
export const toLat = (y: number) => LAT0 + y / KY;

/** Everything we render: Montréal island, Laval, the South Shore. */
export const REGION = { s: 45.37, n: 45.71, w: -73.98, e: -73.42 } as const;

/**
 * Boulevard Saint-Laurent, fitted from station coordinates, runs at a bearing
 * of ~302° ("Montréal north"). Buildings, blocks and LOD tiles all live on
 * this rotated grid so the far-field blocks line up with the streets.
 */
export const GRID_BEARING = 302;
const G = GRID_BEARING * RAD;
/** unit vectors of the street grid in world (east, north) */
export const GRID_N: [number, number] = [Math.sin(G), Math.cos(G)];
export const GRID_E: [number, number] = [Math.cos(G), -Math.sin(G)];

/** world (x, y) -> grid (u, v): u along Montréal east, v along Montréal north */
export const toGrid = (x: number, y: number): [number, number] => [
  x * GRID_E[0] + y * GRID_E[1],
  x * GRID_N[0] + y * GRID_N[1],
];
export const fromGrid = (u: number, v: number): [number, number] => [
  u * GRID_E[0] + v * GRID_N[0],
  u * GRID_E[1] + v * GRID_N[1],
];

/** Vertical exaggeration of terrain (buildings keep true height × BUILDING_EX). */
export const EXZ = 2.4;
export const BUILDING_EX = 1.15;

/** LOD tiles: square in grid space. Blocks are nested cells inside tiles. */
export const TILE = 1000;
export const BLOCK = 62.5;
export const BLOCKS_PER_TILE = TILE / BLOCK;

export const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
};
