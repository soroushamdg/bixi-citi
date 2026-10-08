"use client";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { ui, data, type Mode } from "./store";
import { buildChapters, HOME, HOME_YEARS, MTLN, type Chapter } from "./chapters";
import { loadYear, tickLiveClock } from "./load";
import { yearCaption } from "./years-copy";
import type { SceneHandle } from "@/scene";

/** A story hour lasts this many real seconds: a day in ~2.6 minutes. */
export const SEC_PER_HOUR = 6.5;

export interface Caption { tag: string; step: string; title: string; body: string; compact: boolean; cta: boolean }
interface StoryState { chapters: Chapter[]; caption: Caption }

const INTRO: Caption = {
  tag: "LIVE",
  step: "Right now",
  title: "Montréal's bikes, this minute",
  body: "Every pillar is a BIXI station, as tall as the bikes docked there now. A pulse is a real bike leaving or docking. Press play to watch one real summer day of rides, start to finish.",
  compact: false,
  cta: true,
};
const MODE_CAP: Record<Mode, Omit<Caption, "compact" | "cta">> = {
  live: { tag: "Live", step: "Explore", title: "The network right now", body: "Counts from BIXI's live feed. Pulses are real changes between snapshots." },
  flows: { tag: "Flows", step: "Explore", title: "Drag the clock", body: "The sun and the rides follow it." },
  rhythm: { tag: "Rhythm", step: "Explore", title: "Pick an hour of the week", body: "Pillars rise with average departures; arcs are the busiest corridors." },
  stations: { tag: "Stations", step: "Explore", title: "Follow the bikes downhill", body: "Tap any pillar for its average day." },
  years: { tag: "Years", step: "Archive", title: "Every season since 2014", body: "Pick a year and press play to fast-forward through it." },
};

export const story = createStore<StoryState>(() => ({ chapters: [], caption: INTRO }));
export const useStory = <T,>(sel: (s: StoryState) => T) => useStore(story, sel);

let scene: SceneHandle | null = null;
export const attachScene = (h: SceneHandle | null) => { scene = h; };
export const getScene = () => scene;

let chStart = 0;
/** true once the user drives the clock themselves: play then runs freely instead of the tour */
let freePlay = false;

export function refreshChapters() {
  const { meta, hist } = data.getState();
  if (meta) story.setState({ chapters: buildChapters(meta, hist) });
}

export function setCaption(c: Partial<Caption>) {
  story.setState({ caption: { ...story.getState().caption, ...c } });
}

export function setMode(m: Mode, fromTour = false) {
  const s = ui.getState();
  ui.setState({ mode: m, hover: null });
  if (m === "live") tickLiveClock();
  if (!fromTour) {
    freePlay = m === "flows" || m === "rhythm";
    setPlaying(false);
    ui.setState({ chapter: -1 });
    setCaption({ ...MODE_CAP[m], compact: true, cta: false });
  }
  if (s.selected && s.selected.set !== (m === "live" ? "live" : m === "years" ? "year" : "hist")) ui.setState({ selected: null });
  if (m === "years") {
    if (ui.getState().year) selectYear(ui.getState().year);
    if (!fromTour) scene?.flyTo(HOME_YEARS, 1600);
  }
}

/** Years mode: switch year, keep the cursor on the same calendar day when that day had service. */
export function selectYear(year: number, fromStart = false) {
  const s = ui.getState();
  ui.setState({ year, selected: null });
  void loadYear(year).then(() => {
    const y = data.getState().yearSummary;
    if (!y || y.year !== year) return;
    const doy = (iso: string) => (Date.parse(iso + "T00:00:00Z") - Date.UTC(year, 0, 1)) / 86400_000;
    const first = doy(y.firstDay), last = doy(y.lastDay);
    // keep the same calendar day across years when it had service; otherwise start with the season
    if (fromStart) ui.setState({ yday: first });
    else if (s.yday === 0 || s.yday < first || s.yday > last) ui.setState({ yday: doy(y.seasonFrom) });
    if (ui.getState().mode === "years") setCaption({ ...yearCaption(y, data.getState().years), compact: false, cta: false });
  });
}

export function setSecPerDay(v: number) {
  ui.setState({ secPerDay: v });
}

export function setPlaying(on: boolean) {
  ui.setState({ playing: on });
}

export function enterChapter(k: number, auto: boolean) {
  const c = story.getState().chapters[k];
  if (!c) return;
  freePlay = false;
  ui.setState({ chapter: k });
  if (ui.getState().mode !== c.mode) setMode(c.mode, true);
  const minute = auto ? c.t0 : c.t0 + (c.t1 - c.t0) * 0.45;
  const weekday = data.getState().meta?.storyDay.weekday ?? 3;
  ui.setState({ minute, day: weekday });
  chStart = performance.now() - (auto ? 0 : ((minute - c.t0) / 60) * SEC_PER_HOUR * 1000);
  scene?.flyTo(ui.getState().mtlNorth ? c.view : [c.view[0], c.view[1], c.view[2], c.view[3] === MTLN ? 0 : c.view[3], c.view[4]], auto ? 2600 : 1800);
  setCaption({ tag: c.tag, step: `Chapter ${k + 1} of ${story.getState().chapters.length}`, title: c.title, body: c.body, compact: false, cta: false });
}

export function play() {
  const s = ui.getState();
  const chapters = story.getState().chapters;
  if (s.playing) return setPlaying(false);
  if (!chapters.length) return;
  if (s.mode === "years") {
    const y = data.getState().yearSummary;
    if (!y) return;
    const last = (Date.parse(y.lastDay + "T00:00:00Z") - Date.UTC(y.year, 0, 1)) / 86400_000;
    if (s.yday >= last) ui.setState({ yday: (Date.parse(y.firstDay + "T00:00:00Z") - Date.UTC(y.year, 0, 1)) / 86400_000 });
    setPlaying(true);
    return;
  }
  if (s.chapter < 0 && freePlay && (s.mode === "flows" || s.mode === "rhythm")) {
    // free play from the scrubber position
    if (s.minute >= 1439) ui.setState({ minute: 0 });
    setPlaying(true);
    return;
  }
  if (s.chapter < 0 || s.chapter === chapters.length - 1) {
    setPlaying(true);
    enterChapter(0, true);
    return;
  }
  const c = chapters[s.chapter];
  if (s.mode !== c.mode) setMode(c.mode, true);
  chStart = performance.now() - ((s.minute - c.t0) / 60) * SEC_PER_HOUR * 1000;
  setPlaying(true);
}

export function stepChapter(dir: 1 | -1) {
  setPlaying(false);
  const s = ui.getState(), n = story.getState().chapters.length;
  const k = s.chapter < 0 ? 0 : Math.max(0, Math.min(n - 1, s.chapter + dir));
  enterChapter(k, false);
}

export function scrubDay(yday: number) {
  ui.setState({ yday });
  if (ui.getState().playing) setPlaying(false);
}

export function scrubTo(minute: number) {
  const s = ui.getState();
  freePlay = true;
  ui.setState({ minute });
  if (s.playing && s.chapter >= 0) setPlaying(false);
  if (s.chapter >= 0) {
    ui.setState({ chapter: -1 });
    setCaption({ ...MODE_CAP[s.mode], compact: true, cta: false });
  }
}

export function resetView() {
  scene?.flyTo(ui.getState().mtlNorth ? HOME : [HOME[0], HOME[1], HOME[2], 0, HOME[4]], 1400);
}

let last = 0, raf = 0, lastLive = 0;
function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const s = ui.getState();
  if (s.mode === "live" && now - lastLive > 5000) {
    lastLive = now;
    tickLiveClock();
  }
  if (!s.playing) return;
  const chapters = story.getState().chapters;
  if (s.chapter >= 0) {
    const c = chapters[s.chapter];
    const el = (now - chStart) / 1000, span = c.t1 - c.t0, need = (span / 60) * SEC_PER_HOUR;
    if (span > 0) ui.setState({ minute: c.t0 + Math.min(el / need, 1) * span });
    if (el > need + (span > 0 ? 1.4 : 9)) {
      if (s.chapter < chapters.length - 1) enterChapter(s.chapter + 1, true);
      else setPlaying(false);
    }
  } else if (s.mode === "flows" || s.mode === "rhythm") {
    let m = s.minute + (dt / SEC_PER_HOUR) * 60;
    if (m >= 1440) { m = 1439; setPlaying(false); }
    ui.setState({ minute: m });
  } else if (s.mode === "years") {
    const y = data.getState().yearSummary;
    if (!y || !data.getState().yearDays) return;
    const last = (Date.parse(y.lastDay + "T00:00:00Z") - Date.UTC(y.year, 0, 1)) / 86400_000 + 0.99;
    const d = s.yday + dt / s.secPerDay;
    if (d >= last) {
      // roll on into the next season, so play can run 2014 → today
      const next = data.getState().years?.years.find((e) => e.year > y.year);
      if (next) selectYear(next.year, true);
      else { ui.setState({ yday: last }); setPlaying(false); }
    } else ui.setState({ yday: d });
  } else setPlaying(false);
}

export function startStory() {
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function introCaption() {
  story.setState({ caption: INTRO });
}
