"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { ui } from "@/lib/store";
import { isPhone } from "@/lib/device";
import { exitImmersive } from "./Immersive";

/**
 * A short first-visit tour: one idea per step, with a spotlight on the part of
 * the page it talks about. It shows once (remembered in localStorage) and can be
 * replayed from the ? button in the header.
 */
interface Step {
  /** CSS selector of what to light up; none = centred card */
  target?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { title: "Welcome to BIXI Citi", body: "Montréal's bike share, live right now and across every season since 2014. Here is where to start: it takes under a minute." },
  { target: ".basin", title: "The city", body: "Drag to turn, scroll or pinch to zoom. Every pillar is a BIXI station." },
  { target: ".deck .seg", title: "Five ways to look", body: "Live now, a real day of Flows, the weekly Rhythm, which Stations gain or lose bikes, and every past Year." },
  { target: ".deck .play", title: "Press play", body: "Play a real summer day as a short story, or fast-forward through a whole season in Years." },
  { target: ".deck .scrub", title: "Move through time", body: "Drag the timeline. The sun, the light and the rides follow it." },
  { target: ".kpis", title: "The numbers", body: "Key figures for what you are looking at. The chips say where each comes from: LIVE, REAL or DERIVED." },
  { target: ".rail", title: "Details", body: "Charts for the current mode. Hover for exact values; click a day, hour or station to jump to it." },
  { target: '.mapctl [aria-label="Landmarks"]', title: "Landmarks and views", body: "Fly to hand-modelled places, from Notre-Dame to the Jacques Cartier Bridge, or to a postcard view like the Quartier des spectacles at night." },
  { target: '.mapctl [aria-label="Full screen"]', title: "Full screen", body: "Give the city the whole screen (or press F). The dashboard steps aside while you watch and comes back when you move the mouse. The button above it flies back to the overview." },
  { target: ".head-right", title: "Make it yours", body: "Turn the map to Montréal north, switch between light and dark, replay this tour with ?, or share it." },
  { title: "You're set", body: "Start with Live to see the network breathing, or press play for a day of real rides." },
];

const KEY = "bixi-tour";
const tour = createStore<{ open: boolean; step: number }>(() => ({ open: false, step: 0 }));
export const startTour = () => {
  exitImmersive(); // the tour points at the console in its normal layout
  tour.setState({ open: true, step: 0 });
};

type Box = { x: number; y: number; w: number; h: number } | null;
const PAD = 10;

function rectOf(sel?: string): Box {
  if (!sel) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/** Where the card goes: below, above, right or left of the spotlight, clamped to the screen. */
function placeCard(box: Box, cw: number, ch: number) {
  const vw = innerWidth, vh = innerHeight, m = 16;
  if (!box) return { left: (vw - cw) / 2, top: (vh - ch) / 2 };
  const clampX = (x: number) => Math.max(m, Math.min(vw - cw - m, x));
  const clampY = (y: number) => Math.max(m, Math.min(vh - ch - m, y));
  if (box.y + box.h + ch + m < vh) return { left: clampX(box.x + box.w / 2 - cw / 2), top: box.y + box.h + 12 };
  if (box.y - ch - m > 0) return { left: clampX(box.x + box.w / 2 - cw / 2), top: box.y - ch - 12 };
  if (box.x + box.w + cw + m < vw) return { left: box.x + box.w + 12, top: clampY(box.y + box.h / 2 - ch / 2) };
  if (box.x - cw - m > 0) return { left: box.x - cw - 12, top: clampY(box.y + box.h / 2 - ch / 2) };
  // the target fills the screen (the map on a phone): float over its lower part
  return { left: clampX(vw / 2 - cw / 2), top: clampY(vh - ch - 24) };
}

export function Tour() {
  const { open, step } = useStore(tour);
  const [box, setBox] = useState<Box>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const card = useRef<HTMLDivElement>(null);
  const s = STEPS[step];

  const close = useCallback((done = true) => {
    tour.setState({ open: false });
    if (done) try { localStorage.setItem(KEY, "done"); } catch { /* private mode */ }
  }, []);
  const go = useCallback((d: number) => {
    const n = tour.getState().step + d;
    if (n < 0) return;
    if (n >= STEPS.length) close();
    else tour.setState({ step: n });
  }, [close]);

  // first visit: wait for the 3D city to be up, then offer the tour
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "done"; } catch { /* ignore */ }
    if (seen || isPhone()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => { timer = setTimeout(() => { if (!tour.getState().open) tour.setState({ open: true, step: 0 }); }, 1200); };
    if (ui.getState().sceneStatus !== "loading") kick();
    const unsub = ui.subscribe((st, prev) => { if (st.sceneStatus !== prev.sceneStatus && st.sceneStatus !== "loading") kick(); });
    // if the scene never loads (no WebGL), still offer it
    const fallback = setTimeout(() => { if (!tour.getState().open) tour.setState({ open: true, step: 0 }); }, 9000);
    return () => { unsub(); clearTimeout(timer); clearTimeout(fallback); };
  }, []);

  // bring the target into view, then keep the spotlight on it as the page moves
  useEffect(() => {
    if (!open) return;
    const el = s.target ? document.querySelector(s.target) : null;
    el?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    let raf = 0;
    const loop = () => {
      setBox(rectOf(s.target));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, s]);

  useLayoutEffect(() => {
    if (!open || !card.current) return;
    const r = card.current.getBoundingClientRect();
    setPos(placeCard(box, r.width, r.height));
  }, [open, box, step]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, step, close, go]);

  if (!open) return null;
  const vw = typeof innerWidth === "number" ? innerWidth : 0, vh = typeof innerHeight === "number" ? innerHeight : 0;
  return (
    <div className="tour" role="presentation">
      <svg className="tour-veil" width={vw} height={vh} aria-hidden="true" onClick={() => go(1)}>
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={22} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#tour-hole)" />
      </svg>
      {box && <div className="tour-ring" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
      <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} style={{ left: pos.left, top: pos.top }}>
        <span className="label">Step {step + 1} of {STEPS.length}</span>
        <h2 id="tour-title">{s.title}</h2>
        <p aria-live="polite">{s.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((_, k) => <i key={k} className={k === step ? "on" : k < step ? "past" : ""} />)}
          </div>
          <div className="tour-btns">
            {step === 0 ? (
              <button className="ghost" onClick={() => close()}>Skip</button>
            ) : (
              <button className="ghost" onClick={() => go(-1)}>Back</button>
            )}
            <button className="next" onClick={() => go(1)}>{step === STEPS.length - 1 ? "Start exploring" : step === 0 ? "Show me" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The ? in the header: replay the tour any time. */
export function TourButton() {
  return (
    <button className="theme" aria-label="Take the tour" title="Take the tour" onClick={startTour}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.6" />
        <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" />
        <circle cx="12" cy="16.9" r=".5" fill="currentColor" />
      </svg>
    </button>
  );
}
