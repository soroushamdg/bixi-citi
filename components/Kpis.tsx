"use client";
import { useMemo } from "react";
import { useData, useUI } from "@/lib/store";
import { DAYS } from "@/lib/story";
import { ridingAt, startedBetween } from "@/lib/history/query";
import { dayLong } from "@/lib/years-copy";

const fmt = new Intl.NumberFormat("en-CA");
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m) % 60)}`;

export type ChipKind = "live" | "real" | "avg";
export const CHIP: Record<ChipKind, { text: string; title: string }> = {
  live: { text: "LIVE", title: "From BIXI's GBFS feed, refreshed about every 30 seconds" },
  real: { text: "REAL", title: "Counted from individual trips in BIXI's open trip history" },
  avg: { text: "DERIVED", title: "Averaged or derived from the trip history (and real terrain for elevation)" },
};
export function Chip({ kind }: { kind: ChipKind }) {
  return <span className={`chip ${kind}`} title={CHIP[kind].title}>{CHIP[kind].text}</span>;
}

function Kpi({ label, chip, value, small, sub }: { label: string; chip: ChipKind; value: string; small?: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="label">{label}</span>
        <Chip kind={chip} />
      </div>
      <div className="kpi-val">
        {value}
        {small && <small>{small}</small>}
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export function Kpis() {
  const info = useData((d) => d.info);
  const bikes = useData((d) => d.bikes);
  const ebikes = useData((d) => d.ebikes);
  const docks = useData((d) => d.docks);
  const activity = useData((d) => d.activity);
  const meta = useData((d) => d.meta);
  const rhythm = useData((d) => d.rhythm);
  const day = useData((d) => d.day);
  const mode = useUI((s) => s.mode);
  const minute = useUI((s) => Math.floor(s.minute));
  const wd = useUI((s) => s.day);
  const yday = useUI((s) => s.yday);
  const yearSummary = useData((d) => d.yearSummary);

  const net = useMemo(() => {
    if (!info || !bikes.length) return null;
    let cap = 0, bk = 0, eb = 0, empty = 0, full = 0;
    for (let i = 0; i < info.ids.length; i++) {
      if (bikes[i] < 0) continue;
      cap += info.cap[i]; bk += bikes[i]; eb += ebikes[i];
      if (bikes[i] === 0) empty++;
      if (docks[i] === 0) full++;
    }
    return { cap, bk, eb, empty, full };
  }, [info, bikes, ebikes, docks]);

  let dyn: Parameters<typeof Kpi>[0];
  if (mode === "live") {
    // the five minutes before the latest snapshot
    const since = (activity[activity.length - 1]?.to ?? 0) - 300;
    const recent = activity.filter((a) => a.to >= since);
    const n = recent.reduce((s, a) => s + a.left + a.docked, 0);
    dyn = { label: "Moves · 5 min", chip: "live", value: recent.length ? fmt.format(n) : "…", sub: recent.length ? "taken or returned, trucks excluded" : "measuring between snapshots" };
  } else if (mode === "flows") {
    const riding = ridingAt(day, minute);
    const hourTrips = startedBetween(day, Math.floor(minute / 60) * 60, Math.floor(minute / 60) * 60 + 60);
    dyn = { label: "Riding now", chip: "real", value: meta ? fmt.format(riding) : "…", sub: `${fmt.format(hourTrips)} rides started ${pad(Math.floor(minute / 60))}:00 to ${pad((Math.floor(minute / 60) + 1) % 24)}:00` };
  } else if (mode === "rhythm") {
    const h = Math.floor(minute / 60) % 24;
    const v = rhythm ? rhythm.how[wd * 24 + h] : 0;
    dyn = { label: "This hour", chip: "avg", value: rhythm ? fmt.format(Math.round(v / 10) * 10) : "…", small: "trips", sub: `average ${DAYS[wd]} ${pad(h)}:00 to ${pad((h + 1) % 24)}:00` };
  } else if (mode === "years") {
    const y = yearSummary;
    const d = Math.floor(yday);
    const v = y?.daily[d] ?? 0;
    const served = y ? y.daily.filter((x) => x > 0).length : 0;
    const rank = y && v ? y.daily.filter((x) => x > v).length + 1 : 0;
    const iso = y ? new Date(Date.UTC(y.year, 0, 1) + d * 86400_000).toISOString().slice(0, 10) : "";
    dyn = {
      label: "That day", chip: "real", value: y ? fmt.format(v) : "…", small: y ? "rides" : undefined,
      sub: y ? (v ? `${dayLong(iso)} · #${rank} of ${served} days` : `${dayLong(iso)} · no service`) : "loading the year",
    };
  } else {
    dyn = { label: "To rebalance", chip: "avg", value: meta ? fmt.format(Math.round(meta.pile.haulPerDay / 10) * 10) : "…", sub: "per day, net drift between stations" };
  }

  return (
    <section className="kpis" aria-label="Network at a glance">
      <Kpi label="Bikes docked" chip="live" value={net ? fmt.format(net.bk) : "…"} small={net ? `/ ${fmt.format(net.cap)}` : undefined} sub={net ? `${Math.round((net.bk / Math.max(1, net.cap)) * 100)}% of all docks hold a bike` : "waiting for the live feed"} />
      <Kpi label="E-bikes ready" chip="live" value={net ? fmt.format(net.eb) : "…"} sub={net ? `${Math.round((net.eb / Math.max(1, net.bk)) * 100)}% of docked bikes` : " "} />
      <Kpi label="Empty · Full" chip="live" value={net ? String(net.empty) : "…"} small={net ? `· ${net.full}` : undefined} sub="stations with no bike · no free dock" />
      <Kpi {...dyn} />
    </section>
  );
}

export { hhmm };
