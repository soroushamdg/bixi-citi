"use client";
import { useEffect, useRef, useState } from "react";
import { useData, useUI } from "@/lib/store";
import type { YearLoad } from "@/lib/years-loader";

const kb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/**
 * Where the bar should be for a load state. Bytes drive the middle 84 %;
 * waiting for the first byte and decoding creep forward on their own so the
 * bar never looks stuck, and never claims to be done before it is.
 */
function target(l: YearLoad | undefined, since: number): number {
  if (!l) return 0;
  const creep = (cap: number, tau: number) => cap * (1 - Math.exp(-since / tau));
  switch (l.phase) {
    case "queued":
    case "waiting": return creep(0.1, 900);
    case "fetch": return 0.1 + 0.82 * (l.total ? Math.min(1, l.received / l.total) : creep(0.8, 2500));
    case "decode": return 0.92 + creep(0.07, 400);
    case "ready": return 1;
    default: return 0;
  }
}

/** A smoothed fraction that eases toward the target every frame. */
function useSmoothProgress(load: YearLoad | undefined) {
  const [v, setV] = useState(0);
  const cur = useRef(0), phaseAt = useRef(0), phase = useRef<string | undefined>(undefined), year = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (load?.year !== year.current) { cur.current = 0; year.current = load?.year; }
    if (load?.phase !== phase.current) { phase.current = load?.phase; phaseAt.current = performance.now(); }
    let raf = 0;
    const step = () => {
      const t = target(load, performance.now() - phaseAt.current);
      // ease forward quickly, never backward (except on a new year)
      cur.current = Math.max(cur.current, cur.current + (t - cur.current) * 0.18);
      setV(cur.current);
      if (Math.abs(t - cur.current) > 0.001 || load?.phase === "waiting" || load?.phase === "decode") raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [load]);
  return v;
}

function detail(l: YearLoad) {
  if (l.phase === "waiting" || l.phase === "queued") return "Connecting…";
  if (l.phase === "fetch") {
    const eta = l.speed > 0 ? (l.total - l.received) / l.speed : NaN;
    return `${kb(l.received)} of ${kb(l.total)}${Number.isFinite(eta) && eta > 0.3 ? ` · ~${eta < 10 ? eta.toFixed(1) : Math.round(eta)} s left` : ""}`;
  }
  if (l.phase === "decode") return l.cached ? "From your browser cache · unpacking" : "Unpacking stations and rides";
  if (l.phase === "error") return `Could not load (${l.error ?? "network"})`;
  return l.cached ? "From your browser cache" : "Ready";
}

/** The loading card over the map while the selected year's pack comes in. */
export function YearProgress() {
  const mode = useUI((s) => s.mode);
  const year = useUI((s) => s.year);
  const load = useData((d) => d.yearLoads[year]);
  const ready = useData((d) => !!d.yearDays && d.yearSummary?.year === year);
  const v = useSmoothProgress(load);
  // after the pack is in, keep the card a moment so "ready" registers, then let it go
  const [doneYear, setDoneYear] = useState<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setDoneYear(year), 700);
    return () => clearTimeout(t);
  }, [ready, year]);
  if (mode !== "years" || !load || (ready && doneYear === year)) return null;
  const pct = Math.round(v * 100);
  return (
    <div className={`float yearload${ready ? " done" : ""}`} role="progressbar" aria-label={`Loading ${year}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="yl-top">
        <span className="label">{ready ? `${year} ready` : `Loading ${year} on the map`}</span>
        <span className="mono yl-pct">{pct}%</span>
      </div>
      <div className={`yl-track${load.phase === "waiting" || load.phase === "decode" ? " busy" : ""}`}>
        <i style={{ width: `${v * 100}%` }} />
      </div>
      <span className="yl-detail">{detail(load)}</span>
    </div>
  );
}

/** A hairline under a year chip: background downloads and what is ready. */
export function ChipProgress({ year }: { year: number }) {
  const load = useData((d) => d.yearLoads[year]);
  if (!load) return null;
  if (load.phase === "ready") return <span className="chip-ready" aria-hidden="true" />;
  const f = load.phase === "fetch" && load.total ? load.received / load.total : load.phase === "decode" ? 1 : 0.05;
  return (
    <span className="chip-load" aria-hidden="true">
      <i style={{ width: `${f * 100}%` }} />
    </span>
  );
}
