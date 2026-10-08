"use client";
import { useEffect, useMemo } from "react";
import { useData, useUI, type Mode } from "@/lib/store";
import { enterChapter, play, scrubTo, setMode, setPlaying, stepChapter, useStory } from "@/lib/story-controller";
import { DAYS } from "@/lib/story";
import { compass, montrealMs, sunPos, sunTimes } from "@/lib/sun";
import { montrealNow } from "@/lib/load";

const MODES: Array<[Mode, string]> = [["live", "Live"], ["flows", "Flows"], ["rhythm", "Rhythm"], ["stations", "Stations"]];
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m) % 60)}`;

function useSunText(mode: Mode, minute: number, liveMinute: number, date: string | undefined) {
  return useMemo(() => {
    if (!date) return null;
    const isLive = mode === "live";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
    const d = isLive ? today : date;
    const m = isLive ? liveMinute : mode === "stations" ? 1118 : minute;
    const p = sunPos(montrealMs(d, m));
    const alt = (p.alt * 180) / Math.PI;
    if (alt > -0.8) return { up: true, text: `${Math.round(alt)}°`, dir: compass(p.az) };
    return { up: false, text: "down", dir: `rises ${sunTimes(d).riseText}` };
    // minute is bucketed by the caller so this recomputes a few times per story hour
  }, [mode, minute, liveMinute, date]);
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
  const sun = useSunText(mode, Math.round(minute / 4) * 4, liveMinute, meta?.storyDay.date);

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
  const clockDay = mode === "live" ? DAYS[montrealNow().day] : mode === "rhythm" ? DAYS[day] : DAYS[storyWd];
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
      <div className="scrub">
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
      </div>
      <button className="play" aria-pressed={playing} aria-label={playing ? "Pause" : "Play the day"} onClick={play} disabled={mode === "live"}>
        <svg viewBox="0 0 24 24" fill="#f3dcb0">
          {playing ? (
            <><rect x="7" y="5.5" width="3.6" height="13" rx="1.2" /><rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2" /></>
          ) : (
            <path d="M8 5.5v13l11-6.5z" />
          )}
        </svg>
      </button>
      <div className="chapters">
        <div className="dots" role="group" aria-label="Chapters">
          {chapters.map((c, k) => (
            <button key={c.key} aria-label={`Chapter ${k + 1}: ${c.title}`} aria-current={k === chapter ? "step" : undefined} onClick={() => { setPlaying(false); enterChapter(k, false); }} />
          ))}
        </div>
        <span className="chtitle">
          {chapter < 0 ? (
            <><b>{chapters.length || 6} chapters</b>Press play for a real day in about two minutes</>
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
      </div>
    </section>
  );
}
