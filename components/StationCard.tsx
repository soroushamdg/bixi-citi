"use client";
import { ui, useData, useUI } from "@/lib/store";
import { StationSpark } from "./charts/StationSpark";
import { Chip } from "./Kpis";

const signed = (v: number) => (v < 0 ? "−" : "+") + Math.abs(v).toFixed(1);

export function Meter({ bikes, ebikes, cap }: { bikes: number; ebikes: number; cap: number }) {
  const c = Math.max(1, cap);
  return (
    <span className="meter" aria-hidden="true">
      <i style={{ width: `${((bikes - ebikes) / c) * 100}%`, background: "var(--ink-2)" }} />
      <i style={{ width: `${(ebikes / c) * 100}%`, background: "var(--led)" }} />
    </span>
  );
}

export function StationCard() {
  const sel = useUI((s) => s.selected);
  const mode = useUI((s) => s.mode);
  const info = useData((d) => d.info);
  const hist = useData((d) => d.hist);
  const bikes = useData((d) => d.bikes);
  const ebikes = useData((d) => d.ebikes);
  const docks = useData((d) => d.docks);
  const h2l = useData((d) => d.histToLive);
  const l2h = useData((d) => d.liveToHist);
  if (!sel || sel.set === "year") return null;
  const li = sel.set === "live" ? sel.i : (h2l[sel.i] ?? -1);
  const hi = sel.set === "hist" ? sel.i : (l2h[sel.i] ?? -1);
  const name = sel.set === "live" ? info?.name[sel.i] : hist?.name[sel.i];
  if (!name) return null;
  const hasLive = !!info && li >= 0 && bikes[li] >= 0;
  const weekend = ui.getState().day >= 5 && mode === "rhythm";
  return (
    <div className="float station" role="dialog" aria-label={`Station ${name}`}>
      <button className="x" aria-label="Close station" onClick={() => ui.setState({ selected: null })}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <span className="label">
        {hasLive ? `Station · ${info!.cap[li]} docks` : "Station · no longer in the live network"}
      </span>
      <h3>{name}</h3>
      {hasLive && (
        <>
          <Meter bikes={bikes[li]} ebikes={ebikes[li]} cap={info!.cap[li]} />
          <div className="srow">
            <div><b>{bikes[li] - ebikes[li]}</b><span>Bikes</span></div>
            <div><b>{ebikes[li]}</b><span>E-bikes</span></div>
            <div><b>{docks[li]}</b><span>Open docks</span></div>
          </div>
        </>
      )}
      {hist && hi >= 0 && (
        <>
          <div className="well-head">
            <span className="label">{weekend ? "Average weekend day" : "Average weekday"} <Chip kind="avg" /></span>
            <span className="mono net">{signed(hist.net[hi])} bikes/day</span>
          </div>
          <StationSpark
            label={name}
            dep={(weekend ? hist.depWe : hist.depWd).slice(hi * 24, hi * 24 + 24)}
            arr={(weekend ? hist.arrWe : hist.arrWd).slice(hi * 24, hi * 24 + 24)}
          />
          <p className="card-foot">{hist.boro[hi]} · {Math.round(hist.elev[hi])} m above sea level</p>
        </>
      )}
    </div>
  );
}
