"use client";
import { useEffect, useRef, useState } from "react";
import { data, ui, useData, useUI, type Sel } from "@/lib/store";
import { SAMPLE_PER_DAY } from "@/lib/formats/years";
import { LANDMARKS } from "@/lib/landmarks";
import { attachScene, getScene, play, resetView, showBridge, showLandmark, useStory } from "@/lib/story-controller";
import { BRIDGES } from "@/lib/bridges";
import { HOME } from "@/lib/chapters";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { StationCard } from "./StationCard";

function YearsLegend() {
  const y = useData((d) => d.yearSummary);
  const day = useUI((s) => Math.floor(s.yday));
  const n = y?.daily[day] ?? 0;
  const per = n ? Math.max(1, Math.round(n / SAMPLE_PER_DAY)) : 0;
  return (
    <>
      <span className="li"><span className="sw" style={{ background: "#E0703F" }} />Lost bikes</span>
      <span className="li"><span className="sw" style={{ background: "#2A9CB8" }} />Gained</span>
      <span className="li">height = departures that day</span>
      {per > 0 && <span className="li">1 arc ≈ {per} rides</span>}
    </>
  );
}

const LEGEND = {
  live: (
    <>
      <span className="li"><span className="sw" style={{ background: "#ff9d6c" }} />Bike leaves</span>
      <span className="li"><span className="sw" style={{ background: "#6fd8ef" }} />Bike docks</span>
      <span className="li">height = bikes docked</span>
    </>
  ),
  flows: (
    <>
      <span className="li"><span className="grad" style={{ background: "linear-gradient(90deg,#ff9d6c,#6fd8ef)" }} />Start → dock</span>
      <span className="li">1 arc = 1 real ride</span>
    </>
  ),
  rhythm: (
    <>
      <span className="li"><span className="grad" style={{ background: "linear-gradient(90deg,#4a2f24,#b5552c,#ffb38a)" }} />Departures this hour</span>
      <span className="li">arcs = busiest corridors</span>
    </>
  ),
  stations: (
    <>
      <span className="li"><span className="sw" style={{ background: "#E0703F" }} />Loses bikes</span>
      <span className="li"><span className="sw" style={{ background: "#2A9CB8" }} />Gains bikes</span>
      <span className="li">height = average net per day</span>
    </>
  ),
  years: <YearsLegend />,
};

function stationTip(sel: Sel) {
  const d = data.getState(), s = ui.getState();
  if (sel.set === "year") {
    const y = d.yearSummary, Y = d.yearDays;
    if (!y) return "";
    let html = title(y.stations.name[sel.i] ?? "Station");
    const k = Math.floor(s.yday) - (Y?.firstDoy ?? 0);
    if (Y && k >= 0 && k < Y.days && sel.i < Y.stations) {
      html += row("Bikes taken that day", Y.dep[k * Y.stations + sel.i]) + row("Bikes returned", Y.arr[k * Y.stations + sel.i]);
    }
    const tot = (y.stations as { trips?: number[] }).trips?.[sel.i];
    if (tot) html += row(`Departures in ${y.year}`, tot.toLocaleString("en-CA"));
    return html;
  }
  const live = sel.set === "live" ? sel.i : d.histToLive[sel.i] ?? -1;
  const hi = sel.set === "hist" ? sel.i : d.liveToHist[sel.i] ?? -1;
  const name = sel.set === "live" ? d.info?.name[sel.i] : d.hist?.name[sel.i];
  let html = title(name ?? "Station");
  if (d.info && live >= 0 && d.bikes[live] >= 0) {
    html += row("Bikes", d.bikes[live] - d.ebikes[live]) + row("E-bikes", d.ebikes[live]) + row("Open docks", `${d.docks[live]} of ${d.info.cap[live]}`);
  }
  if (d.hist && hi >= 0) {
    if (s.mode === "stations") html += row("Average net per day", `${d.hist.net[hi] > 0 ? "+" : "−"}${Math.abs(d.hist.net[hi]).toFixed(1)}`);
    if (s.mode === "rhythm") {
      const h = Math.floor(s.minute / 60) % 24;
      html += row(`Departures ${String(h).padStart(2, "0")}:00`, (s.day >= 5 ? d.hist.depWe : d.hist.depWd)[hi * 24 + h].toFixed(1));
    }
  }
  return html;
}

export function Basin() {
  const host = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const needle = useRef<SVGSVGElement>(null);
  const status = useUI((s) => s.sceneStatus);
  const progress = useUI((s) => s.loadProgress);
  const loadText = useUI((s) => s.loadText);
  const mode = useUI((s) => s.mode);
  const caption = useStory((s) => s.caption);
  const [failed, setFailed] = useState<string | null>(null);
  const [places, setPlaces] = useState(false);

  useEffect(() => {
    let disposed = false;
    let handle: Awaited<ReturnType<typeof import("@/scene").createScene>> | null = null;
    (async () => {
      try {
        const { createScene } = await import("@/scene");
        if (disposed || !host.current || !canvas.current) return;
        handle = await createScene(host.current, canvas.current, {
          onHover(sel, x, y) {
            ui.setState({ hover: sel });
            if (sel) showTip(stationTip(sel), x, y);
            else hideTip();
          },
          onSelect(sel) {
            ui.setState({ selected: sel });
          },
          onBearing(deg) {
            if (needle.current) needle.current.style.transform = `rotate(${-deg}deg)`;
          },
        }, HOME);
        if (disposed) { handle.dispose(); return; }
        attachScene(handle);
        // dev-only handle for scripted screenshots (scripts/dev/shot.mjs)
        if (process.env.NODE_ENV !== "production") Object.assign(window, { __bixi: { scene: handle, ui, data } });
      } catch (err) {
        console.error(err);
        ui.setState({ sceneStatus: "failed" });
        setFailed(/webgl/i.test(String(err)) ? "This view needs WebGL. The dashboard around it still works." : "The 3D view hit an error. The dashboard around it still works.");
      }
    })();
    return () => {
      disposed = true;
      attachScene(null);
      handle?.dispose();
    };
  }, []);

  return (
    <section className="basin" ref={host} aria-label="3D model of Montréal with BIXI stations">
      <canvas ref={canvas} aria-hidden="true" tabIndex={-1} />
      <div className={`loader${status !== "loading" ? " done" : ""}`}>
        <div className="loader-card">
          <span className="label">{loadText}</span>
          <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
      </div>
      {failed && <div className="fallback">{failed}</div>}

      <div className={`float caption${caption.compact ? " compact" : ""}`} aria-live="polite">
        <div className="eyebrow">
          <span className="tag">{caption.tag}</span>
          <span className="label">{caption.step}</span>
        </div>
        <h2>{caption.title}</h2>
        <p>{caption.body}</p>
        {caption.cta && (
          <button className="cta" onClick={play}>
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg>Play the day
          </button>
        )}
      </div>

      <div className="mapctl">
        <button className="mapbtn" aria-label="Zoom in" onClick={() => getScene()?.zoom(0.62)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className="mapbtn" aria-label="Zoom out" onClick={() => getScene()?.zoom(1.6)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <button className="mapbtn" aria-label="Landmarks" aria-expanded={places} onClick={() => setPlaces((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>
        </button>
        <button className="mapbtn" aria-label="Reset view" onClick={resetView}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>
        </button>
      </div>

      {places && (
        <div className="float places" role="dialog" aria-label="Landmarks">
          <span className="label">Landmarks · modelled by hand</span>
          <ul>
            {LANDMARKS.map((l) => (
              <li key={l.key}>
                <button onClick={() => { showLandmark(l.key); setPlaces(false); }} title={l.blurb}>
                  <b>{l.name}</b>
                  <span>{l.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          <span className="label">Bridges</span>
          <ul>
            {BRIDGES.filter((b) => b.famous).map((b) => (
              <li key={b.osm}>
                <button onClick={() => { showBridge(b.name, b.blurb ?? ""); setPlaces(false); }} title={b.blurb}>
                  <b>{b.name}</b>
                  <span>{b.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="float legend">{LEGEND[mode]}</div>
      <div className="compass" title="True north">
        <svg ref={needle} viewBox="0 0 26 26">
          <path d="M13 3l3.2 9.5H9.8z" fill="#f3dcb0" />
          <path d="M13 23l-3.2-9.5h6.4z" fill="#6e778a" />
          <circle cx="13" cy="13" r="1.6" fill="#1c2029" />
        </svg>
      </div>
      <StationCard />
      <div className="watermark">Unofficial · Map © OpenStreetMap contributors</div>
    </section>
  );
}
