"use client";
import { useEffect, useState } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { useData, useUI } from "@/lib/store";
import { DAYS } from "@/lib/story";
import { startedBetween } from "@/lib/history/query";
import { dayLong } from "@/lib/years-copy";
import { useModeKpi, useNet } from "./Kpis";

/**
 * Full screen: the city fills the screen (the browser's full screen where it
 * allows it). The dashboard floats over it while the pointer moves, steps
 * aside after a few still seconds, and a slim readout keeps the essentials.
 *
 * The page reads two attributes on <html>: data-immersive and data-idle.
 */
const IDLE_MS = 2800;
const store = createStore<{ on: boolean; idle: boolean; since: number }>(() => ({ on: false, idle: false, since: 0 }));
export const useImmersive = <T,>(sel: (s: { on: boolean; idle: boolean; since: number }) => T) => useStore(store, sel);

let usedBrowserFs = false;
export function enterImmersive() {
  if (store.getState().on) return;
  scrollTo({ top: 0 });
  store.setState({ on: true, idle: false, since: performance.now() });
  usedBrowserFs = false;
  const root = document.documentElement;
  if (root.requestFullscreen && document.fullscreenEnabled && !document.fullscreenElement) {
    root.requestFullscreen({ navigationUI: "hide" }).then(() => { usedBrowserFs = true; }).catch(() => undefined);
  }
}
export function exitImmersive() {
  if (!store.getState().on) return;
  store.setState({ on: false, idle: false });
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
export const toggleImmersive = () => (store.getState().on ? exitImmersive() : enterImmersive());

/** what keeps the dashboard up while the pointer rests on it */
const HOLD = ".head,.kpis,.deck,.rail,.mapctl,.places,.station,.tour,.share,.visitors";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m) % 60)}`;
const fmt = new Intl.NumberFormat("en-CA");
const MODE_NAME = { live: "Live", flows: "Flows", rhythm: "Rhythm", stations: "Stations", years: "Years" } as const;

/** The slim readout shown while the dashboard is away. */
function Readout() {
  const mode = useUI((s) => s.mode);
  const minute = useUI((s) => s.minute);
  const liveMinute = useUI((s) => s.liveMinute);
  const liveDay = useUI((s) => s.liveDay);
  const liveDate = useUI((s) => s.liveDate);
  const wd = useUI((s) => s.day);
  const yday = useUI((s) => s.yday);
  const playing = useUI((s) => s.playing);
  const meta = useData((d) => d.meta);
  const day = useData((d) => d.day);
  const ys = useData((d) => d.yearSummary);
  const net = useNet();
  const k = useModeKpi();

  let when: React.ReactNode, lead: React.ReactNode, progress = -1;
  if (mode === "live") {
    when = <><em>{liveDate ? DAYS[liveDay] : "—"}</em>{hhmm(liveMinute)}</>;
    lead = net ? <><b>{fmt.format(net.bk)}</b> bikes docked · <b>{fmt.format(net.eb)}</b> electric</> : <>Waiting for the live feed</>;
  } else if (mode === "flows") {
    const so = startedBetween(day, 0, Math.floor(minute));
    when = <><em>{DAYS[meta?.storyDay.weekday ?? 3]}</em>{hhmm(minute)}</>;
    lead = <><b>{fmt.format(so)}</b> rides so far{meta ? <> of {fmt.format(meta.storyDay.trips)}</> : null}</>;
    progress = minute / 1440;
  } else if (mode === "rhythm") {
    when = <><em>{DAYS[wd]}</em>{hhmm(Math.floor(minute / 60) * 60)}</>;
    lead = <>The average week</>;
  } else if (mode === "stations") {
    when = <><em>Avg</em>24 h</>;
    lead = <>Where bikes pile up and run out</>;
  } else {
    const iso = ys ? new Date(Date.UTC(ys.year, 0, 1) + Math.floor(yday) * 86400_000).toISOString().slice(0, 10) : "";
    when = ys ? <>{dayLong(iso)}</> : <>Loading</>;
    lead = ys ? <><b>{fmt.format(ys.trips)}</b> rides in {ys.year}</> : null;
    if (ys) {
      const a = Date.parse(ys.firstDay + "T00:00:00Z"), b = Date.parse(ys.lastDay + "T00:00:00Z");
      const t = Date.UTC(ys.year, 0, 1) + yday * 86400_000;
      progress = Math.min(1, Math.max(0, (t - a) / Math.max(1, b - a)));
    }
  }
  return (
    <div className="imm-readout" data-mode={mode}>
      <span className="imm-mode"><i className={playing || mode === "live" ? "on" : ""} />{MODE_NAME[mode]}</span>
      <span className="imm-when">{when}</span>
      <span className="imm-lead">{lead}</span>
      <span className="imm-k">
        <span className="label">{k.label}</span>
        <b>{k.value}</b>
        {k.small && <small>{k.small}</small>}
      </span>
      {progress >= 0 && <i className="imm-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />}
    </div>
  );
}

/** Wires full-screen mode to the page and renders the readout. Mounted once by the console. */
export function ImmersiveLayer() {
  const on = useImmersive((s) => s.on);
  const idle = useImmersive((s) => s.idle);
  const since = useImmersive((s) => s.since);
  const [hint, setHint] = useState(false);

  // the page restyles itself from these two attributes
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.immersive = "true"; else delete root.dataset.immersive;
    if (on && idle) root.dataset.idle = "true"; else delete root.dataset.idle;
  }, [on, idle]);

  // F toggles full screen anywhere outside a text field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || document.querySelector(".share,.tour")) return;
      e.preventDefault();
      toggleImmersive();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let held = false;
    const sleep = () => { clearTimeout(timer); if (!held) timer = setTimeout(() => store.setState({ idle: true }), IDLE_MS); };
    const wake = () => { if (store.getState().idle) store.setState({ idle: false }); sleep(); };
    const onMove = (e: PointerEvent) => {
      // dragging the city is watching, not reaching for the controls
      if (e.buttons && (e.target as Element).tagName === "CANVAS") return;
      held = !!(e.target as Element).closest?.(HOLD);
      wake();
    };
    const onKey = (e: KeyboardEvent) => {
      // the browser's own full screen exits on Esc; without it, Esc leaves our layout
      if (e.key === "Escape" && !document.fullscreenElement && !document.querySelector(".share,.tour,.places")) exitImmersive();
      else wake();
    };
    const onFs = () => { if (!document.fullscreenElement && usedBrowserFs) exitImmersive(); };
    const onLeave = () => { held = false; sleep(); };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onMove, { passive: true });
    addEventListener("wheel", wake, { passive: true });
    addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    document.documentElement.addEventListener("pointerleave", onLeave);
    sleep();

    // overlay edges as CSS variables, so the map's own cards sit clear of the dashboard
    const root = document.documentElement;
    const measure = () => {
      const kp = document.querySelector<HTMLElement>(".kpis"), rail = document.querySelector<HTMLElement>(".rail"), deck = document.querySelector<HTMLElement>(".deck");
      if (kp) root.style.setProperty("--imm-top", `${kp.offsetTop + kp.offsetHeight}px`);
      if (rail) root.style.setProperty("--imm-right", `${innerWidth - rail.offsetLeft}px`);
      if (deck) root.style.setProperty("--imm-bottom", `${innerHeight - deck.offsetTop}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const sel of [".kpis", ".rail", ".deck"]) { const el = document.querySelector(sel); if (el) ro.observe(el); }
    addEventListener("resize", measure);
    requestAnimationFrame(measure);
    return () => {
      clearTimeout(timer);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onMove);
      removeEventListener("wheel", wake);
      removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      removeEventListener("resize", measure);
      ro.disconnect();
      for (const v of ["--imm-top", "--imm-right", "--imm-bottom"]) root.style.removeProperty(v);
    };
  }, [on]);

  // a short note the first time the dashboard steps aside
  useEffect(() => {
    if (!on || !idle || performance.now() - since > 15_000) return;
    const show = setTimeout(() => setHint(true), 0);
    const hide = setTimeout(() => setHint(false), 4200);
    return () => { clearTimeout(show); clearTimeout(hide); setHint(false); };
  }, [on, idle, since]);

  if (!on) return null;
  return (
    <div className="imm" aria-hidden={!idle}>
      <Readout />
      <p className={`imm-hint${hint ? " show" : ""}`}>Move the mouse to bring the dashboard back · <kbd>Esc</kbd> or <kbd>F</kbd> to leave full screen</p>
    </div>
  );
}

/** The full-screen button on the map. */
export function FullscreenButton() {
  const on = useImmersive((s) => s.on);
  return (
    <button className="mapbtn" aria-label={on ? "Exit full screen" : "Full screen"} title={on ? "Exit full screen (F)" : "Full screen (F)"} aria-pressed={on} onClick={(e) => { e.currentTarget.blur(); toggleImmersive(); }}>
      {on ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 20v-5h5M9 9 3.5 3.5M15 15l5.5 5.5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>
      )}
    </button>
  );
}
