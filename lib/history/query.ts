import type { DayTrips } from "../formats/history";

/** Rides of the story day in progress at a given minute (all loaded chunks). */
export function ridingAt(day: Array<DayTrips | null>, minute: number): number {
  const t = minute * 60;
  let n = 0;
  for (const c of day) {
    if (!c) continue;
    for (let i = 0; i < c.start.length; i++) {
      const s = c.start[i];
      if (s > t) break;
      if (s + c.dur[i] > t) n++;
    }
  }
  return n;
}

/** Rides that started within [from, to) minutes. */
export function startedBetween(day: Array<DayTrips | null>, from: number, to: number): number {
  let n = 0;
  for (const c of day) {
    if (!c) continue;
    for (let i = 0; i < c.start.length; i++) {
      const s = c.start[i] / 60;
      if (s >= to) break;
      if (s >= from) n++;
    }
  }
  return n;
}

export const loadedTrips = (day: Array<DayTrips | null>) => day.reduce((a, c) => a + (c?.start.length ?? 0), 0);
