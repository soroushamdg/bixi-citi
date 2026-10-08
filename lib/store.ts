"use client";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { LiveStatus, StationInfo } from "./gbfs";
import type { SnapshotDiff } from "./live/diff";
import type { DayTrips, Flows } from "./formats/history";
import type { HistoryMeta } from "./story";

export type Mode = "live" | "flows" | "rhythm" | "stations";
/** a station is either in the live GBFS network or in the trip history */
export type StationSet = "live" | "hist";
export interface Sel { set: StationSet; i: number }

export interface UIState {
  mode: Mode;
  /** minutes after midnight on the story day (Flows) or within the chosen weekday (Rhythm) */
  minute: number;
  /** weekday for Rhythm, 0 = Monday */
  day: number;
  playing: boolean;
  /** -1 = free exploration */
  chapter: number;
  selected: Sel | null;
  hover: Sel | null;
  mtlNorth: boolean;
  /** where a live minute lives when the mode is Live (Montréal wall clock) */
  liveMinute: number;
  /** Montréal weekday (0 = Monday) and date (YYYY-MM-DD); empty until the browser sets the clock */
  liveDay: number;
  liveDate: string;
  sceneStatus: "loading" | "ready" | "failed";
  loadProgress: number;
  loadText: string;
}

export const ui = createStore<UIState>(() => ({
  mode: "live",
  minute: 495,
  day: 3,
  playing: false,
  chapter: -1,
  selected: null,
  hover: null,
  mtlNorth: true,
  liveMinute: 0,
  liveDay: 0,
  liveDate: "",
  sceneStatus: "loading",
  loadProgress: 0,
  loadText: "Raising Montréal",
}));
export const useUI = <T,>(sel: (s: UIState) => T) => useStore(ui, sel);

export interface HistStations {
  name: string[];
  boro: string[];
  lat: number[];
  lon: number[];
  elev: number[];
  net: number[];
  trips: number[];
  depWd: number[];
  arrWd: number[];
  depWe: number[];
  arrWe: number[];
}
export interface Rhythm {
  how: number[];
  curveWd: number[];
  curveWe: number[];
  story: number[];
  weekdays: number[];
}

export interface DataState {
  info: StationInfo | null;
  status: LiveStatus | null;
  /** id -> index into info */
  idIndex: Map<string, number>;
  /** per info index: bikes / e-bikes / docks from the latest status */
  bikes: Int16Array;
  ebikes: Int16Array;
  docks: Int16Array;
  liveError: string | null;
  /** snapshot diffs since the page opened, oldest first */
  activity: Array<SnapshotDiff & { at: number }>;
  meta: HistoryMeta | null;
  hist: HistStations | null;
  rhythm: Rhythm | null;
  flows: Flows | null;
  day: Array<DayTrips | null>;
  /** history index -> live index (or -1) and back */
  histToLive: Int32Array;
  liveToHist: Int32Array;
}

export const data = createStore<DataState>(() => ({
  info: null,
  status: null,
  idIndex: new Map(),
  bikes: new Int16Array(0),
  ebikes: new Int16Array(0),
  docks: new Int16Array(0),
  liveError: null,
  activity: [],
  meta: null,
  hist: null,
  rhythm: null,
  flows: null,
  day: [null, null, null, null],
  histToLive: new Int32Array(0),
  liveToHist: new Int32Array(0),
}));
export const useData = <T,>(sel: (s: DataState) => T) => useStore(data, sel);
