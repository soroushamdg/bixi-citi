import type { LiveStatus } from "../gbfs";

/** A change in docked bikes at one station between two GBFS snapshots. */
export interface StationChange {
  id: string;
  /** bikes after − bikes before: < 0 bikes left, > 0 bikes docked */
  delta: number;
  /** a jump this large in 30 s is almost always a rebalancing truck */
  truck: boolean;
}

export interface SnapshotDiff {
  from: number;
  to: number;
  changes: StationChange[];
  left: number;
  docked: number;
  /** bikes moved by changes flagged as trucks (counted separately) */
  trucked: number;
}

export const TRUCK_THRESHOLD = 5;

/**
 * Compare two snapshots. Stations that switch in or out of service are
 * ignored: their counts change for operational reasons, not rides.
 */
export function diffSnapshots(prev: LiveStatus, next: LiveStatus): SnapshotDiff {
  const before = new Map<string, number>();
  prev.ids.forEach((id, i) => before.set(id, i));
  const changes: StationChange[] = [];
  let left = 0, docked = 0, trucked = 0;
  next.ids.forEach((id, j) => {
    const i = before.get(id);
    if (i === undefined) return;
    if (prev.f[i] !== next.f[j] || (next.f[j] & 4) === 0) return;
    const delta = next.b[j] - prev.b[i];
    if (!delta) return;
    const truck = Math.abs(delta) >= TRUCK_THRESHOLD;
    changes.push({ id, delta, truck });
    if (truck) trucked += Math.abs(delta);
    else if (delta < 0) left -= delta;
    else docked += delta;
  });
  return { from: prev.t, to: next.t, changes, left, docked, trucked };
}

export interface ReplayPulse {
  id: string;
  /** seconds after the diff is applied */
  at: number;
  kind: "leave" | "dock";
  /** bikes represented by this pulse (1 for a ride, |Δ| for a truck) */
  n: number;
  truck: boolean;
}

/**
 * Real changes happened somewhere inside the snapshot interval; we know
 * which, not exactly when. Spread them across the interval so the map
 * breathes instead of flashing once every 30 s. `rand` is injectable for tests.
 */
export function scheduleReplay(diff: SnapshotDiff, intervalS: number, rand: () => number = Math.random): ReplayPulse[] {
  const span = Math.max(5, Math.min(90, intervalS));
  const out: ReplayPulse[] = [];
  for (const c of diff.changes) {
    const kind = c.delta < 0 ? "leave" : "dock";
    if (c.truck) out.push({ id: c.id, at: rand() * span, kind, n: Math.abs(c.delta), truck: true });
    else for (let k = 0; k < Math.abs(c.delta); k++) out.push({ id: c.id, at: rand() * span, kind, n: 1, truck: false });
  }
  return out.sort((a, b) => a.at - b.at);
}
