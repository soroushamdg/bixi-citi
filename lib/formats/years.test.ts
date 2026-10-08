import { describe, expect, it } from "vitest";
import { decodeYearPack, encodeYearPack } from "./years";

describe("year pack", () => {
  it("round-trips departures exactly, balance as −4…4 and the ride sample", () => {
    const N = 3, D = 4, first = 100;
    const dep = new Uint16Array(N * D), arr = new Uint16Array(N * D);
    // day-major: dep[d * N + i]
    const depRows = [[5, 0, 70000 % 65536, 12], [1, 2, 3, 4], [300, 290, 0, 1]];
    const arrRows = [[0, 0, 10, 12], [9, 2, 0, 4], [100, 600, 0, 3]];
    for (let i = 0; i < N; i++) for (let d = 0; d < D; d++) { dep[d * N + i] = depRows[i][d]; arr[d * N + i] = arrRows[i][d]; }
    const stations = { name: ["a", "b", "c"], lat: [45.5, 45.51, 45.52], lon: [-73.5, -73.51, -73.52], trips: [10, 20, 30] };
    const sample = { doy: [100, 100, 101, 103], minute: [5, 9, 1439, 0], from: [0, 1, 2, 0], to: [1, 2, 0, 2] };
    const pack = decodeYearPack(encodeYearPack(stations, D, first, dep, arr, sample).slice().buffer);
    expect(pack.stations).toEqual(stations);
    expect(Array.from(pack.days.dep)).toEqual(Array.from(dep));
    // station 0 day 0: lost everything → −4; station 2 day 1: 290 out, 600 in → gained
    expect(pack.days.bal[0 * N + 0]).toBe(-4);
    expect(pack.days.bal[1 * N + 2]).toBeGreaterThan(0);
    expect(pack.days.bal[2 * N + 2]).toBe(0);
    expect(Array.from(pack.sample.doy)).toEqual(sample.doy);
    expect(Array.from(pack.sample.minute)).toEqual(sample.minute);
    expect(Array.from(pack.sample.from)).toEqual(sample.from);
    expect(Array.from(pack.sample.to)).toEqual(sample.to);
  });
});
