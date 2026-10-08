"use client";
import { useEffect, useMemo } from "react";
import { useData, useUI, type Mode } from "@/lib/store";
import { enterChapter, play, scrubDay, scrubTo, selectYear, setMode, setPlaying, setSecPerDay, stepChapter, useStory } from "@/lib/story-controller";
import { dayLong } from "@/lib/years-copy";
import { ChipProgress } from "./YearProgress";
import { DAYS } from "@/lib/story";
import { compass, montrealMs, sunPos, sunTimes } from "@/lib/sun";

const MODES: Array<[Mode, string]> = [["live", "Live"], ["flows", "Flows"], ["rhythm", "Rhythm"], ["stations", "Stations"], ["years", "Years"]];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const doyOf = (iso: string, year: number) => (Date.parse(iso + "T00:00:00Z") - Date.UTC(year, 0, 1)) / 86400_000;

/** Years mode: a scrubber over the year's days of service, with month ticks. */
function YearScrub() {
  const y = useData((d) => d.yearSummary);
  const yday = useUI((s) => Math.floor(s.yday));
  const sun = useMemo(() => {
    if (!y) return null;
    const iso = new Date(Date.UTC(y.year, 0, 1) + yday * 86400_000).toISOString().slice(0, 10);
    const p = sunPos(montrealMs(iso, 17 * 60 + 30));
    const alt = (p.alt * 180) / Math.PI;
    return { iso, alt, dir: compass(p.az) };
  }, [y, yday]);
  if (!y) return <div className="scrub"><span className="label">Loading the year…</span></div>;
  const first = doyOf(y.firstDay, y.year), last = doyOf(y.lastDay, y.year);
  const v = Math.max(first, Math.min(last, yday));
  const pctOf = (d: number) => ((d - first) / Math.max(1, last - first)) * 100;
  const ticks = Array.from({ length: 12 }, (_, m) => doyOf(`${y.year}-${String(m + 1).padStart(2, "0")}-01`, y.year)).map((d, m) => [d, m] as const).filter(([d]) => d >= first && d <= last);
  return (
    <div className="scrub">
      <div className="scrub-top">
        <span className="label">Season {y.year}</span>
        {sun && <span className="sun">17:30 sun <b>{sun.alt > -0.8 ? `${Math.round(sun.alt)}°` : "down"}</b> {sun.alt > -0.8 ? sun.dir : ""}</span>}
        <span className="clock">{sun ? dayLong(sun.iso) : ""}</span>
      </div>
      <input
        type="range"
        min={first}
        max={last}
        step={1}
        value={v}
        aria-label={`Day of ${y.year}`}
        style={{ ["--pct" as string]: `${pctOf(v)}%` }}
        onChange={(e) => scrubDay(+e.target.value)}
      />
      <div className="ticks month-ticks" aria-hidden="true">
        {ticks.map(([d, m]) => <span key={m} style={{ left: `${pctOf(d)}%` }}>{MON[m]}</span>)}
      </div>
    </div>
  );
}

function YearChips() {
  const idx = useData((d) => d.years);
  const year = useUI((s) => s.year);
  const spd = useUI((s) => s.secPerDay);
  return (
    <div className="chapters">
      <div className="yearchips" role="group" aria-label="Year">
        {idx?.years.map((y) => (
          <button key={y.year} aria-pressed={y.year === year} className={y.partial ? "partial" : undefined} title={y.partial ? `${y.year}, so far` : String(y.year)} onClick={() => selectYear(y.year)}>
            {y.year}
            <ChipProgress year={y.year} />
          </button>
        ))}
      </div>
      <button className="speed" onClick={() => setSecPerDay(spd > 0.3 ? 0.2 : 0.5)} aria-label="Fast-forward speed" title="Seconds of playback per day">
        {spd > 0.3 ? "½ s / day" : "⅕ s / day"}
      </button>
    </div>
  );
}
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m) % 60)}`;

function useSunText(mode: Mode, minute: number, liveMinute: number, date: string | undefined, liveDate: string) {
  return useMemo(() => {
    const isLive = mode === "live";
    const d = isLive ? liveDate : date;
    if (!d) return null;
    const m = isLive ? liveMinute : mode === "stations" ? 1118 : minute;
    const p = sunPos(montrealMs(d, m));
    const alt = (p.alt * 180) / Math.PI;
    if (alt > -0.8) return { up: true, text: `${Math.round(alt)}°`, dir: compass(p.az) };
    return { up: false, text: "down", dir: `rises ${sunTimes(d).riseText}` };
    // minute is bucketed by the caller so this recomputes a few times per story hour
  }, [mode, minute, liveMinute, date, liveDate]);
}

export function Deck() {
  const mode = useUI((s) => s.mode);
  const minute = useUI((s) => s.minute);
  const liveMinute = useUI((s) => s.liveMinute);
  const day = useUI((s) => s.day);
  const playing = useUI((s) => s.playing);
  const chapter = useUI((s) => s.chapter);
  const chapters = useStory((s) => s.chapters);
  const meta = useData((d) => d.meta);
  const liveDay = useUI((s) => s.liveDay);
  const liveDate = useUI((s) => s.liveDate);
  const sun = useSunText(mode, Math.round(minute / 4) * 4, liveMinute, meta?.storyDay.date, liveDate);

  // Space toggles playback when focus is not in a control
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !/INPUT|BUTTON|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        play();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const disabled = mode === "live" || mode === "stations";
  const value = mode === "live" ? liveMinute : Math.round(minute / 5) * 5;
  const storyWd = meta?.storyDay.weekday ?? 3;
  const clockDay = mode === "live" ? (liveDate ? DAYS[liveDay] : "—") : mode === "rhythm" ? DAYS[day] : DAYS[storyWd];
  const label = mode === "live" ? "Montréal time" : mode === "stations" ? "Season average" : mode === "rhythm" ? "Hour of the week" : "Story day";

  return (
    <section className="deck" aria-label="Playback controls">
      <div className="seg" role="tablist" aria-label="Map mode">
        {MODES.map(([m, name]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            <span className="led" />
            {name}
          </button>
        ))}
      </div>
      {mode === "years" ? <YearScrub /> : <div className="scrub">
        <div className="scrub-top">
          <span className="label">{label}</span>
          {sun && (
            <span className="sun">
              Sun <b>{sun.text}</b> {sun.dir}
            </span>
          )}
          <span className="clock">
            {mode === "stations" ? (
              <><em>Avg</em> 24 h</>
            ) : (
              <><em>{clockDay}</em> {hhmm(mode === "live" ? liveMinute : minute)}</>
            )}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1435}
          step={5}
          value={value}
          disabled={disabled}
          aria-label={label}
          style={{ ["--pct" as string]: `${(value / 1435) * 100}%` }}
          onChange={(e) => scrubTo(+e.target.value)}
        />
        <div className="ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>}
      <button className="play" aria-pressed={playing} aria-label={playing ? "Pause" : mode === "years" ? "Play the year" : "Play the day"} onClick={play}>
        <svg viewBox="0 0 24 24">
          {playing ? (
            <><rect x="7" y="5.5" width="3.6" height="13" rx="1.2" /><rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2" /></>
          ) : (
            <path d="M8 5.5v13l11-6.5z" />
          )}
        </svg>
      </button>
      {mode === "years" ? <YearChips /> : <div className="chapters">
        <div className="dots" role="group" aria-label="Chapters">
          {chapters.map((c, k) => (
            <button key={c.key} aria-label={`Chapter ${k + 1}: ${c.title}`} aria-current={k === chapter ? "step" : undefined} onClick={() => { setPlaying(false); enterChapter(k, false); }} />
          ))}
        </div>
        <span className="chtitle">
          {chapter < 0 ? (
            <><b>{chapters.length || 6} chapters</b>Press play for a real day in about 90 seconds</>
          ) : (
            <><b>{chapter + 1} / {chapters.length}</b>{chapters[chapter]?.title}</>
          )}
        </span>
        <button className="step" aria-label="Previous chapter" onClick={() => stepChapter(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button className="step" aria-label="Next chapter" onClick={() => stepChapter(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>}
    </section>
  );
}
