/**
 * Story windows on the story day, in minutes after local midnight.
 * Shared by the CI aggregation (which computes the real numbers for each
 * window) and the UI (which plays them back).
 */
export const WINDOWS = {
  wake: [330, 450],
  morning: [450, 570],
  lunch: [705, 810],
  evening: [990, 1125],
  night: [1290, 1440],
} as const;

export type WindowKey = keyof typeof WINDOWS;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface WindowStats {
  trips: number;
  /** of trips that changed elevation by more than 2 m, the share that ended lower */
  downhill: number;
  down: number;
  up: number;
  /** median straight-line distance, km */
  medianKm: number;
  medianMin: number;
  /** average elevation change per trip, metres (negative = downhill) */
  meanDrop: number;
  /** boroughs over-represented as origins / destinations in this window */
  topFrom: string[];
  topTo: string[];
  topFromStations: string[];
  topToStations: string[];
}

export interface HistoryMeta {
  year: number;
  months: number[];
  source: { url: string; file: string; bytes: number; lastModified: string | null; etag: string | null };
  generatedAt: string;
  rows: number;
  trips: number;
  excluded: { short: number; long: number; invalid: number };
  firstDay: string;
  lastDay: string;
  seasonFrom: string;
  seasonDays: number;
  stations: number;
  medianMin: number;
  medianKm: number;
  downhill: number;
  /** share of trips that changed elevation by more than 2 m */
  slopeShare: number;
  roundTrips: number;
  busiestDay: { date: string; trips: number };
  storyDay: { date: string; weekday: number; trips: number; percentile: number; peakHour: number; peakTrips: number };
  windows: Record<WindowKey, WindowStats>;
  pile: { gainers: number; losers: number; haulPerDay: number };
}
