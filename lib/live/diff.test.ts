import { describe, expect, it } from "vitest";
import type { LiveStatus } from "../gbfs";
import { diffSnapshots, scheduleReplay } from "./diff";

const snap = (t: number, rows: Array<[string, number, number?]>): LiveStatus => ({
  t,
  fetched: t,
  ids: rows.map((r) => r[0]),
  b: rows.map((r) => r[1]),
  e: rows.map(() => 0),
  d: rows.map(() => 10),
  f: rows.map((r) => r[2] ?? 7),
});

describe("diffSnapshots", () => {
  it("counts bikes leaving and docking per station", () => {
    const d = diffSnapshots(snap(0, [["a", 5], ["b", 3], ["c", 1]]), snap(30, [["a", 3], ["b", 4], ["c", 1]]));
    expect(d.changes).toEqual([
      { id: "a", delta: -2, truck: false },
      { id: "b", delta: 1, truck: false },
    ]);
    expect(d.left).toBe(2);
    expect(d.docked).toBe(1);
    expect(d.trucked).toBe(0);
  });

  it("flags big jumps as trucks and keeps them out of ride counts", () => {
    const d = diffSnapshots(snap(0, [["a", 18]]), snap(30, [["a", 2]]));
    expect(d.changes[0].truck).toBe(true);
    expect(d.left).toBe(0);
    expect(d.trucked).toBe(16);
  });

  it("ignores stations that change service state or appear/disappear", () => {
    const d = diffSnapshots(snap(0, [["a", 5, 7], ["gone", 3]]), snap(30, [["a", 0, 4], ["new", 9]]));
    expect(d.changes).toHaveLength(0);
  });
});

describe("scheduleReplay", () => {
  it("emits one pulse per ride inside the interval and one per truck", () => {
    const d = diffSnapshots(snap(0, [["a", 5], ["b", 20]]), snap(30, [["a", 2], ["b", 30]]));
    let k = 0;
    const pulses = scheduleReplay(d, 30, () => [0.9, 0.1, 0.5, 0.3][k++ % 4]);
    expect(pulses).toHaveLength(4);
    expect(pulses.filter((p) => p.kind === "leave")).toHaveLength(3);
    expect(pulses.filter((p) => p.truck)).toEqual([expect.objectContaining({ id: "b", n: 10, kind: "dock" })]);
    expect(pulses.every((p, i) => i === 0 || p.at >= pulses[i - 1].at)).toBe(true);
    expect(pulses.every((p) => p.at >= 0 && p.at <= 30)).toBe(true);
  });
});
