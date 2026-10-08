/** Small 2D geometry helpers for the city build. Points are [x, y] in metres. */
export type Pt = [number, number];
export type Ring = Pt[];

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2; // > 0 for counter-clockwise (x east, y north)
}

export function centroid(r: Ring): Pt {
  let x = 0, y = 0;
  for (const p of r) { x += p[0]; y += p[1]; }
  return [x / r.length, y / r.length];
}

export function pointInRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Remove the closing duplicate and consecutive duplicates. */
export function cleanRing(r: Ring, eps = 0.05): Ring {
  const out: Ring = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= eps && Math.abs(out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}

function dp(pts: Ring, a: number, b: number, tol2: number, keep: Uint8Array) {
  let max = -1, idx = -1;
  const [ax, ay] = pts[a], [bx, by] = pts[b];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  for (let i = a + 1; i < b; i++) {
    const [px, py] = pts[i];
    let d: number;
    if (L === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
    else {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
      d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
    }
    if (d > max) { max = d; idx = i; }
  }
  if (max > tol2 && idx > 0) {
    keep[idx] = 1;
    dp(pts, a, idx, tol2, keep);
    dp(pts, idx, b, tol2, keep);
  }
}

/** Douglas–Peucker for a closed ring (no closing duplicate). */
export function simplifyRing(r: Ring, tol: number): Ring {
  if (r.length <= 4) return r;
  // split at the point farthest from r[0]
  let far = 0, fd = -1;
  for (let i = 1; i < r.length; i++) {
    const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const pts = [...r, r[0]];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[far] = keep[pts.length - 1] = 1;
  dp(pts, 0, far, tol * tol, keep);
  dp(pts, far, pts.length - 1, tol * tol, keep);
  const out: Ring = [];
  for (let i = 0; i < pts.length - 1; i++) if (keep[i]) out.push(r[i]);
  return out.length >= 3 ? out : r;
}

/**
 * Join open ways into closed rings by matching endpoints (multipolygon assembly).
 * Ways that cannot be closed are closed by force: good enough for a raster mask.
 */
export function assembleRings(ways: Ring[]): Ring[] {
  const key = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const used = new Uint8Array(pool.length);
  const ends = new Map<string, number[]>();
  pool.forEach((w, i) => {
    for (const p of [w[0], w[w.length - 1]]) {
      const k = key(p);
      const l = ends.get(k);
      if (l) l.push(i); else ends.set(k, [i]);
    }
  });
  const rings: Ring[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const ring = pool[i].slice();
    for (let guard = 0; guard < 100000; guard++) {
      const head = key(ring[0]), tail = key(ring[ring.length - 1]);
      if (head === tail && ring.length > 3) break;
      const cand = (ends.get(tail) ?? []).find((j) => !used[j]);
      if (cand === undefined) break;
      used[cand] = 1;
      const w = pool[cand];
      if (key(w[0]) === tail) ring.push(...w.slice(1));
      else ring.push(...w.slice(0, -1).reverse());
    }
    const c = cleanRing(ring);
    if (c.length >= 3) rings.push(c);
  }
  return rings;
}
