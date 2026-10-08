"use client";
import { useEffect, useState } from "react";
import { ui, useData, useUI } from "@/lib/store";
import { getScene } from "@/lib/story-controller";
import { MTLN } from "@/lib/chapters";

const fmt = new Intl.NumberFormat("en-CA");

function LivePill() {
  const status = useData((d) => d.status);
  const err = useData((d) => d.liveError);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now() / 1000);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  let text = "Connecting to GBFS…";
  let state = "wait";
  if (status) {
    const age = now ? Math.max(0, Math.round(now - status.t)) : 0;
    const at = new Date(status.t * 1000).toLocaleTimeString("en-CA", { timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    text = `Live · GBFS ${at}${age > 120 ? ` · ${Math.round(age / 60)} min old` : ""}`;
    state = age > 180 ? "stale" : "live";
  } else if (err) {
    text = "Live feed unavailable";
    state = "error";
  }
  return (
    <span className="pill" data-state={state} title={err ?? "BIXI GBFS 2.2 station_status, cached ~30 s"}>
      <span className="dot" aria-hidden="true" />
      <span aria-live="polite">{text}</span>
    </span>
  );
}

export function Header({ stationsHint, tripsHint, dateHint }: { stationsHint: number; tripsHint: number; dateHint: string }) {
  const info = useData((d) => d.info);
  const mtl = useUI((s) => s.mtlNorth);
  const n = info?.ids.length ?? stationsHint;
  return (
    <header className="head">
      <div className="mark">
        <div className="mark-disc" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="16" r="3.6" stroke="#a6aebd" />
            <circle cx="18" cy="16" r="3.6" stroke="#a6aebd" />
            <path d="M6 16l4.2-7.5h5.6L18 16M10.2 8.5L12.8 16h1.2M14.6 6.2h2.6" stroke="#f3dcb0" />
          </svg>
        </div>
        <div>
          <h1 className="wordmark">
            BIXI <span>STORY</span>
          </h1>
          <p className="tagline">
            Montréal, ride by ride. {fmt.format(n)} stations live, {fmt.format(tripsHint)} real rides on {dateHint}.
          </p>
        </div>
      </div>
      <div className="head-right">
        <LivePill />
        <button
          className="switch"
          role="switch"
          aria-checked={mtl}
          title="Rotate the map so Montréal's street grid points up"
          onClick={() => {
            const next = !ui.getState().mtlNorth;
            ui.setState({ mtlNorth: next });
            getScene()?.setBearing(next ? MTLN : 0);
          }}
        >
          Montréal north
          <span className="track" aria-hidden="true">
            <span className="knob" />
          </span>
        </button>
      </div>
    </header>
  );
}
