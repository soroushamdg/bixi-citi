import type { DayStat, YearSummary, YearsIndex } from "./formats/years";
import { DAYS } from "./story";

const fmt = new Intl.NumberFormat("en-CA");
export const fmtMillions = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)} M` : fmt.format(n));
export const dayLong = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
export const dayShort = (d: DayStat) => `${DAYS[d.weekday]} ${new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d.date + "T12:00:00Z"))}`;
export const monthDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;

/** The caption for a year: every claim is a number from the summary. */
export function yearCaption(y: YearSummary, idx: YearsIndex | null) {
  const line = idx?.years.find((e) => e.year === y.year);
  const parts = [
    `Busiest day: ${dayLong(y.peakDays[0].date)}, ${fmt.format(y.peakDays[0].trips)} rides.`,
    y.lowDays[0] ? `Quietest in season: ${dayLong(y.lowDays[0].date)}, ${fmt.format(y.lowDays[0].trips)}.` : "",
    line?.growth != null ? `${signedPct(line.growth)} on ${y.year - 1} over the same months.` : "",
    line?.newStations ? `${fmt.format(line.newStations)} new stations.` : "",
  ].filter(Boolean);
  const through = line?.partial ? ` so far (to ${dayLong(y.lastDay)})` : "";
  return {
    tag: String(y.year),
    step: line?.partial ? "In progress" : "Season",
    title: `${fmtMillions(y.trips)} rides${through}`,
    body: parts.join(" "),
  };
}
