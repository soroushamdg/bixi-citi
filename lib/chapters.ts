import type { HistStations, Mode } from "./store";
import type { HistoryMeta } from "./story";
import { WINDOWS } from "./story";
import { sunTimes } from "./sun";
import type { View } from "@/scene";

/** Montréal north: the bearing of boulevard Saint-Laurent */
export const MTLN = 302;
export const HOME: View = [45.5085, -73.5855, 10800, MTLN, 55];
export const REGION_VIEW: View = [45.525, -73.66, 42000, MTLN, 40];

export interface Chapter {
  key: string;
  mode: Mode;
  t0: number;
  t1: number;
  view: View;
  tag: string;
  title: string;
  body: string;
}

const fmt = new Intl.NumberFormat("en-CA");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const list = (a: string[]) => (a.length <= 1 ? a[0] ?? "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const short = (b: string) => b.replace("Rosemont - La Petite-Patrie", "Rosemont").replace("Le Plateau-Mont-Royal", "the Plateau").replace("Mercier - Hochelaga-Maisonneuve", "Hochelaga").replace("Côte-des-Neiges - Notre-Dame-de-Grâce", "Côte-des-Neiges").replace("Villeray—Saint-Michel—Parc-Extension", "Villeray").replace("Le Sud-Ouest", "the Sud-Ouest").replace("Ahuntsic-Cartierville", "Ahuntsic");

export function storyDateLong(meta: HistoryMeta) {
  const [y, m, d] = meta.storyDay.date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Where the day's imbalance sits: boroughs and mean elevation of the biggest losers vs gainers. */
export function pileSummary(hist: HistStations) {
  const idx = hist.net.map((_, i) => i).sort((a, b) => hist.net[a] - hist.net[b]);
  const losers = idx.slice(0, 15), gainers = idx.slice(-15);
  const mode = (ids: number[]) => {
    const c = new Map<string, number>();
    ids.forEach((i) => c.set(hist.boro[i], (c.get(hist.boro[i]) ?? 0) + 1));
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  const elev = (ids: number[]) => ids.reduce((s, i) => s + hist.elev[i], 0) / ids.length;
  return { loseBoro: short(mode(losers)), gainBoro: short(mode(gainers)), loseElev: Math.round(elev(losers)), gainElev: Math.round(elev(gainers)) };
}

export function buildChapters(meta: HistoryMeta, hist: HistStations | null): Chapter[] {
  const w = meta.windows;
  const sun = sunTimes(meta.storyDay.date);
  const date = storyDateLong(meta);
  const morningDown = w.morning.downhill >= 0.55;
  const eveningDown = w.evening.down > w.evening.up;
  const nightUp = w.night.up > w.night.down;
  const pile = hist ? pileSummary(hist) : null;
  return [
    {
      key: "wake", mode: "flows", t0: WINDOWS.wake[0], t1: WINDOWS.wake[1], view: [45.514, -73.589, 12500, MTLN, 54],
      tag: hhmm(WINDOWS.wake[0]), title: "The city wakes up",
      body: `${date}. The sun rose at ${sun.riseText}. By ${hhmm(WINDOWS.wake[1])}, ${fmt.format(w.wake.trips)} rides are already out, more from ${list(w.wake.topFrom.slice(0, 2).map(short))} than later in the day. Every arc is one real ride.`,
    },
    {
      key: "morning", mode: "flows", t0: WINDOWS.morning[0], t1: WINDOWS.morning[1], view: [45.507, -73.574, 5600, MTLN, 63],
      tag: hhmm(WINDOWS.morning[0] + 45), title: morningDown ? "Downhill to work" : "The morning push",
      body: `${fmt.format(w.morning.trips)} rides in two hours, heading for ${short(w.morning.topTo[0])}. Of the rides that changed height, ${pct(w.morning.downhill)} ended lower than they started: ${fmt.format(w.morning.down)} down, ${fmt.format(w.morning.up)} up. The busiest dock: ${w.morning.topToStations[0]}.`,
    },
    {
      key: "lunch", mode: "flows", t0: WINDOWS.lunch[0], t1: WINDOWS.lunch[1], view: [45.5035, -73.5665, 3100, 335, 57],
      tag: hhmm(WINDOWS.lunch[0] + 45), title: "Lunch loops",
      body: `Trips shrink. Around noon the median ride is ${w.lunch.medianKm.toFixed(2)} km in a straight line, against ${meta.medianKm.toFixed(2)} km over the season. ${fmt.format(w.lunch.trips)} short hops between offices, campuses and the Old Port.`,
    },
    {
      key: "evening", mode: "flows", t0: WINDOWS.evening[0], t1: WINDOWS.evening[1], view: [45.512, -73.582, 8200, 122, 61],
      tag: hhmm(WINDOWS.evening[0] + 60), title: eveningDown ? "Home, still downhill" : "The climb home",
      body: eveningDown
        ? `The biggest wave: ${fmt.format(w.evening.trips)} rides, peaking at ${String(meta.storyDay.peakHour).padStart(2, "0")}:00 with ${fmt.format(meta.storyDay.peakTrips)} in one hour. Even on the way home, more rides go down than up: ${fmt.format(w.evening.down)} against ${fmt.format(w.evening.up)}.`
        : `The biggest wave: ${fmt.format(w.evening.trips)} rides, peaking at ${String(meta.storyDay.peakHour).padStart(2, "0")}:00. Now the climb: ${fmt.format(w.evening.up)} rides end higher, ${fmt.format(w.evening.down)} lower.`,
    },
    {
      key: "night", mode: "flows", t0: WINDOWS.night[0], t1: WINDOWS.night[1] - 6, view: [45.519, -73.584, 4000, MTLN, 61],
      tag: hhmm(WINDOWS.night[0] + 60), title: "Last rides off the Main",
      body: nightUp
        ? `After ${hhmm(WINDOWS.night[0])}, ${fmt.format(w.night.trips)} more rides, and the only window of the day where more climb than descend: ${fmt.format(w.night.up)} up, ${fmt.format(w.night.down)} down. Late trips fan out toward ${list(w.night.topTo.slice(0, 2).map(short))}.`
        : `After ${hhmm(WINDOWS.night[0])}, ${fmt.format(w.night.trips)} more rides fan out toward ${list(w.night.topTo.slice(0, 2).map(short))}.`,
    },
    {
      key: "pile", mode: "stations", t0: 1118, t1: 1118, view: [45.509, -73.572, 7000, MTLN, 52],
      tag: "Season", title: "Where bikes pile up",
      body: pile
        ? `On an average day this season, ${fmt.format(meta.pile.losers)} stations lose more than two bikes and ${fmt.format(meta.pile.gainers)} gain more than two. The biggest losers sit in ${pile.loseBoro} at about ${pile.loseElev} m; the biggest gainers in ${pile.gainBoro} at about ${pile.gainElev} m. Trucks even out roughly ${fmt.format(meta.pile.haulPerDay)} bikes a day.`
        : `Amber pillars lose bikes over a day, teal ones gain them.`,
    },
  ];
}
