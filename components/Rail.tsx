"use client";
import { useMemo, useState } from "react";
import { ui, useData, useUI, type Sel } from "@/lib/store";
import { getScene } from "@/lib/story-controller";
import { DAYS } from "@/lib/story";
import { storyDateLong } from "@/lib/chapters";
import { TripsPerHour } from "./charts/TripsPerHour";
import { Heatmap, useRhythmPeak } from "./charts/Heatmap";
import { NetStations } from "./charts/NetStations";
import { LiveActivity } from "./charts/LiveActivity";
import { AnnualBars } from "./charts/AnnualBars";
import { YearCalendar } from "./charts/YearCalendar";
import { scrubDay } from "@/lib/story-controller";
import { dayLong, dayShort, fmtMillions, monthDay, pct, signedPct } from "@/lib/years-copy";
import type { DayStat } from "@/lib/formats/years";
import { Chip } from "./Kpis";
import { Meter } from "./StationCard";

const fmt = new Intl.NumberFormat("en-CA");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function focus(sel: Sel) {
  ui.setState({ selected: sel });
  getScene()?.focus(sel);
}

function LivePanel() {
  const info = useData((d) => d.info);
  const bikes = useData((d) => d.bikes);
  const ebikes = useData((d) => d.ebikes);
  const activity = useData((d) => d.activity);
  const low = useMemo(() => {
    if (!info || !bikes.length) return [];
    return info.ids
      .map((_, i) => i)
      .filter((i) => info.cap[i] >= 15 && bikes[i] >= 0)
      .sort((a, b) => bikes[a] / info.cap[a] - bikes[b] / info.cap[b] || info.cap[b] - info.cap[a])
      .slice(0, 5);
  }, [info, bikes]);
  const tD = activity.reduce((s, a) => s + a.left, 0), tA = activity.reduce((s, a) => s + a.docked, 0);
  return (
    <section className="panel">
      <div>
        <span className="label">Mode 01 · Live</span>
        <h2>The network breathing</h2>
        <p className="lede">
          Pillars show bikes docked right now. A pulse is a real change at a station between two feed snapshots, about 30 s apart, replayed across that
          interval. BIXI publishes no trips live, so no rides are drawn here.
        </p>
      </div>
      <div className="well chart">
        <div className="well-head"><span className="label">Since you arrived <Chip kind="live" /></span><span className="v">{tD} out · {tA} in</span></div>
        <LiveActivity />
      </div>
      <div className="well">
        <div className="well-head"><span className="label">Running low now</span><span className="v">bikes / docks</span></div>
        <ul className="list">
          {low.map((i) => (
            <li key={info!.ids[i]}>
              <button onClick={() => focus({ set: "live", i })}>
                <span className="nm">{info!.name[i]}</span>
                <span className="ct">{bikes[i]} / {info!.cap[i]}</span>
                <Meter bikes={bikes[i]} ebikes={ebikes[i]} cap={info!.cap[i]} />
              </button>
            </li>
          ))}
          {!low.length && <li className="label">Waiting for the live feed…</li>}
        </ul>
      </div>
    </section>
  );
}

/** The story day's busiest origins and destinations in the current hour. */
function BusyDocks() {
  const day = useData((d) => d.day);
  const hist = useData((d) => d.hist);
  const hour = useUI((s) => Math.floor(s.minute / 60) % 24);
  const top = useMemo(() => {
    if (!hist) return null;
    const from = new Map<number, number>(), to = new Map<number, number>();
    for (const c of day) {
      if (!c) continue;
      for (let i = 0; i < c.start.length; i++) {
        if (Math.floor(c.start[i] / 3600) !== hour) continue;
        from.set(c.from[i], (from.get(c.from[i]) ?? 0) + 1);
        to.set(c.to[i], (to.get(c.to[i]) ?? 0) + 1);
      }
    }
    const best = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { from: best(from), to: best(to) };
  }, [day, hist, hour]);
  if (!top || !hist) return null;
  const h = String(hour).padStart(2, "0");
  const item = ([i, n]: [number, number], kind: "from" | "to") => (
    <li key={kind + i}>
      <button onClick={() => focus({ set: "hist", i })}>
        <span className="nm"><span className="sw" style={{ background: kind === "from" ? "var(--out)" : "var(--in)" }} />{hist.name[i]}</span>
        <span className="ct">{n}</span>
      </button>
    </li>
  );
  return (
    <div className="well">
      <div className="well-head"><span className="label">Busiest docks {h}:00 <Chip kind="real" /></span><span className="v">rides</span></div>
      <ul className="list busy">
        {top.from.map((e) => item(e, "from"))}
        {top.to.map((e) => item(e, "to"))}
        {!top.from.length && <li className="label">Loading this hour…</li>}
      </ul>
    </div>
  );
}

function FlowsPanel() {
  const meta = useData((d) => d.meta);
  const date = meta ? storyDateLong(meta) : "";
  const shortDate = meta
    ? new Intl.DateTimeFormat("en-CA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(meta.storyDay.date + "T12:00:00Z"))
    : "Story day";
  return (
    <section className="panel">
      <div>
        <span className="label">Mode 02 · Flows</span>
        <h2>Where the city goes</h2>
        <p className="lede">
          Every ride of {date || "one real day"}{meta ? `, ${fmt.format(meta.storyDay.trips)} trips` : ""}. Each arc is one ride, amber where it starts and teal
          where it docks, timed to the minute.
        </p>
      </div>
      <div className="well chart">
        <div className="well-head"><span className="label">Trips per hour <Chip kind="real" /></span><span className="v">{meta ? `peak ${String(meta.storyDay.peakHour).padStart(2, "0")}:00` : ""}</span></div>
        <TripsPerHour label={shortDate} />
      </div>
      <div className="stats">
        <div className="stat"><b>{meta ? fmt.format(meta.storyDay.trips) : "…"}</b><span>Rides that day</span></div>
        <div className="stat"><b>{meta ? `${Math.round(meta.medianMin)} min` : "…"}</b><span>Median ride</span></div>
        <div className="stat" title="Of rides that ended more than 2 m higher or lower than they started, over the season"><b>{meta ? `${Math.round(meta.downhill * 100)}%` : "…"}</b><span>End downhill</span></div>
      </div>
      <BusyDocks />
    </section>
  );
}

function RhythmPanel() {
  const meta = useData((d) => d.meta);
  const day = useUI((s) => s.day);
  const peak = useRhythmPeak();
  return (
    <section className="panel">
      <div>
        <span className="label">Mode 03 · Rhythm</span>
        <h2>The weekly heartbeat</h2>
        <p className="lede">
          Average trips for each hour of the week{meta ? `, over ${meta.seasonDays} days since ${new Date(meta.seasonFrom + "T12:00:00Z").toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "UTC" })}` : ""}.
          Weekdays have two sharp commutes; weekends drift into one long afternoon. Pick a cell to see that hour&apos;s busiest corridors.
        </p>
      </div>
      <div className="well chart">
        <div className="well-head"><span className="label">Trips by hour <Chip kind="avg" /></span><span className="v">{peak}</span></div>
        <Heatmap />
      </div>
      <div className="daychips" role="group" aria-label="Day of week">
        {DAYS.map((d, k) => (
          <button key={d} aria-pressed={k === day} onClick={() => ui.setState({ day: k })}>{d}</button>
        ))}
      </div>
    </section>
  );
}

function StationsPanel() {
  const hist = useData((d) => d.hist);
  const info = useData((d) => d.info);
  const l2h = useData((d) => d.liveToHist);
  const [q, setQ] = useState("");
  const names = useMemo(() => hist?.name.map(norm) ?? [], [hist]);
  const hits = useMemo(() => {
    const k = norm(q.trim());
    if (k.length < 2 || !hist) return [];
    const out: number[] = [];
    for (let i = 0; i < names.length && out.length < 6; i++) if (names[i].includes(k)) out.push(i);
    return out;
  }, [q, names, hist]);
  const liveCount = info ? l2h.filter((h) => h >= 0).length : 0;
  return (
    <section className="panel">
      <div>
        <span className="label">Mode 04 · Stations</span>
        <h2>The mountain problem</h2>
        <p className="lede">
          Riders roll downhill more often than up. Over an average day, bikes drain from stations on the slopes and collect near the river, and trucks carry them
          back.{info ? ` ${fmt.format(liveCount)} of today's stations have a trip history.` : ""}
        </p>
      </div>
      <label className="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
        <input type="search" placeholder="Find a station, e.g. Mont-Royal" autoComplete="off" aria-label="Find a station" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {q.trim().length >= 2 && (
        <div className="results">
          {hits.map((i) => (
            <button key={i} onClick={() => focus({ set: "hist", i })}>
              <span>{hist!.name[i]}</span>
              <span>{hist!.net[i] >= 0 ? "+" : "−"}{Math.abs(hist!.net[i]).toFixed(1)}/day</span>
            </button>
          ))}
          {!hits.length && <p className="label" style={{ margin: "4px 4px 0" }}>No station matches</p>}
        </div>
      )}
      <div className="well chart">
        <div className="well-head"><span className="label">Net bikes per day <Chip kind="avg" /></span><span className="v">lose · gain</span></div>
        <NetStations />
      </div>
    </section>
  );
}

function YearsPanel() {
  const idx = useData((d) => d.years);
  const y = useData((d) => d.yearSummary);
  const year = useUI((s) => s.year);
  const line = idx?.years.find((e) => e.year === year);
  const jump = (d: DayStat) => scrubDay((Date.parse(d.date + "T00:00:00Z") - Date.UTC(+d.date.slice(0, 4), 0, 1)) / 86400_000);
  const dayList = (list: DayStat[], cls: string) => (
    <ul className={`list days ${cls}`}>
      {list.map((d) => (
        <li key={d.date}>
          <button onClick={() => jump(d)}>
            <span className="nm">{dayShort(d)}</span>
            <span className="ct">{fmt.format(d.trips)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="panel">
      <div>
        <span className="label">Mode 05 · Years</span>
        <h2>{idx ? `${idx.years.length} seasons of BIXI` : "Every season of BIXI"}</h2>
        <p className="lede">
          Every year of open trip data since {idx?.years[0]?.year ?? 2014}. Pick a year and press play: the season runs at a day per half second, stations rise
          with that day&apos;s departures, a sample of its rides flashes across the city, and play rolls on into the next year.
        </p>
      </div>
      <div className="well chart">
        <div className="well-head"><span className="label">Rides per year <Chip kind="real" /></span><span className="v">{idx ? `peak ${idx.allTimePeak.date}` : ""}</span></div>
        <AnnualBars />
      </div>
      {y && line ? (
        <>
          <div className="year-head">
            <b>{y.year}</b>
            <span>
              {fmtMillions(y.trips)} rides{line.partial ? " so far" : ""}
              {line.growth != null && <em className={line.growth >= 0 ? "up" : "down"}>{signedPct(line.growth)} vs {y.year - 1}</em>}
            </span>
            <small>
              {dayLong(y.firstDay)} → {dayLong(y.lastDay)} · {fmt.format(y.stationsActive)} stations{line.newStations ? ` (${fmt.format(line.newStations)} new)` : ""}
            </small>
          </div>
          <div className="well chart">
            <div className="well-head"><span className="label">Rides per day <Chip kind="real" /></span><span className="v">{y.serviceDays} days of service</span></div>
            <YearCalendar />
          </div>
          <div className="stats">
            <div className="stat"><b>{fmt.format(y.peakDays[0].trips)}</b><span>Busiest day · {dayShort(y.peakDays[0])}</span></div>
            <div className="stat"><b>{fmt.format(y.peakHour.trips)}</b><span>Busiest hour · {monthDay(y.peakHour.date)}, {String(y.peakHour.hour).padStart(2, "0")}h</span></div>
            <div className="stat"><b>{y.medianMin.toFixed(0)} min</b><span>Median ride</span></div>
            <div className="stat"><b>{fmt.format(y.weekdayAvg)}</b><span>Avg weekday</span></div>
            <div className="stat"><b>{fmt.format(y.weekendAvg)}</b><span>Avg weekend day</span></div>
            <div className="stat"><b>{y.memberShare != null ? pct(y.memberShare) : "—"}</b><span>{y.memberShare != null ? "Rides by members" : "Members not published"}</span></div>
          </div>
          <div className="well two">
            <div>
              <div className="well-head"><span className="label">Peak days</span></div>
              {dayList(y.peakDays, "peak")}
            </div>
            <div>
              <div className="well-head"><span className="label">Quietest in season</span></div>
              {dayList(y.lowDays, "low")}
            </div>
          </div>
          <div className="well">
            <div className="well-head"><span className="label">Busiest routes <Chip kind="real" /></span><span className="v">rides</span></div>
            <ul className="list">
              {y.topRoutes.slice(0, 3).map((r) => (
                <li key={`${r.from}-${r.to}`}>
                  <span className="nm" title={`${r.fromName} → ${r.toName}`}>{r.fromName} → {r.toName}</span>
                  <span className="ct">{fmt.format(r.trips)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="chart-empty label">Loading {year || "the year"}…</div>
      )}
    </section>
  );
}

function Provenance() {
  const meta = useData((d) => d.meta);
  const years = useData((d) => d.years);
  const info = useData((d) => d.info);
  const months = meta ? `${new Date(Date.UTC(meta.year, meta.months[0] - 1, 1)).toLocaleString("en-CA", { month: "short", timeZone: "UTC" })}–${new Date(Date.UTC(meta.year, meta.months[meta.months.length - 1] - 1, 1)).toLocaleString("en-CA", { month: "short", timeZone: "UTC" })} ${meta.year}` : "";
  return (
    <div className="prov">
      <div className="row"><Chip kind="live" /><span><b>Stations and counts.</b> {info ? fmt.format(info.ids.length) : "About 1,100"} stations from BIXI&apos;s GBFS 2.2 feed, cached about 30 s.</span></div>
      <div className="row"><Chip kind="real" /><span><b>Rides.</b> {meta ? `${fmt.format(meta.trips)} trips from BIXI's open data (${months}); ${storyDateLong(meta)} is played back in full.` : "BIXI's open trip history."}</span></div>
      <div className="row"><Chip kind="real" /><span><b>Archive.</b> {years ? `${fmtMillions(years.years.reduce((a, y) => a + y.trips, 0))} trips from ${years.years.length} yearly files (${years.years[0].year}–${years.years[years.years.length - 1].year}); the fast-forward draws a fixed random sample of each day.` : "Every yearly file BIXI has published."}</span></div>
      <div className="row"><Chip kind="avg" /><span><b>Averages and slopes.</b> Season averages from the same trips. Elevations from AWS Terrain Tiles; the model is 2.4× vertical.</span></div>
      <div className="row"><span className="chip">MAP</span><span><b>City.</b> Buildings, water, parks and streets © OpenStreetMap contributors.</span></div>
    </div>
  );
}

export function Rail() {
  const mode = useUI((s) => s.mode);
  return (
    <aside className="rail" aria-label="Mode details">
      {mode === "live" && <LivePanel />}
      {mode === "flows" && <FlowsPanel />}
      {mode === "rhythm" && <RhythmPanel />}
      {mode === "stations" && <StationsPanel />}
      {mode === "years" && <YearsPanel />}
      <Provenance />
    </aside>
  );
}
