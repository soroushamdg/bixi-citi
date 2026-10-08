"use client";
import { useEffect, useState } from "react";
import { ui, useData, useUI } from "@/lib/store";
import { getScene } from "@/lib/story-controller";
import { MTLN } from "@/lib/chapters";
import { BixiLogo } from "./BixiLogo";
import { ThemeToggle } from "./ThemeToggle";

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
        <div>
          <h1 className="wordmark">
            <span
              className="glass"
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
                e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
              }}
            >
              <BixiLogo className="glass-logo" title="BIXI" />
              <i className="glass-sheen" aria-hidden="true" />
            </span>
            <span>STORY</span>
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
        <ThemeToggle />
      </div>
    </header>
  );
}
