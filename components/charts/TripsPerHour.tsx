"use client";
import { useMemo, useState } from "react";
import { useData, useUI } from "@/lib/store";
import { scrubTo } from "@/lib/story-controller";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { INK3, LED, MONO, OUT, fmt, hhmm, pad, svgX } from "./common";
import { SrTable } from "./SrTable";

const X0 = 34, X1 = 326, Y0 = 10, Y1 = 100, VB = 330;

/** Story-day trips per hour (10-minute resolution) against the season's average weekday. */
export function TripsPerHour({ label }: { label: string }) {
  const rhythm = useData((d) => d.rhythm);
  const minute = useUI((s) => s.minute);
  const [hx, setHx] = useState<number | null>(null);
  const geo = useMemo(() => {
    if (!rhythm) return null;
    const max = Math.ceil(Math.max(...rhythm.story, ...rhythm.curveWd) / 2000) * 2000 || 2000;
    const X = (m: number) => X0 + ((X1 - X0) * m) / 1440;
    const Y = (v: number) => Y1 - ((Y1 - Y0) * v) / max;
    const path = (a: number[]) => a.map((v, k) => `${k ? "L" : "M"}${X(k * 10 + 5).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    return { max, X, Y, story: path(rhythm.story), avg: path(rhythm.curveWd) };
  }, [rhythm]);
  if (!rhythm || !geo) return <div className="chart-empty label">Loading trips…</div>;
  const { X, Y, max } = geo;
  const bucket = Math.min(143, Math.max(0, Math.floor(minute / 10)));
  const px = X(minute), py = Y(rhythm.story[bucket]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const vx = svgX(e, VB);
    if (vx < X0 || vx > X1) return null;
    return Math.round((((vx - X0) / (X1 - X0)) * 1440) / 10) * 10;
  };
  return (
    <>
      <svg
        viewBox={`0 0 ${VB} 128`}
        role="img"
        aria-label={`${label}: rides per hour across the story day, with the season's average weekday for comparison`}
        onPointerMove={(e) => {
          const m = at(e);
          if (m === null) { hideTip(); setHx(null); return; }
          setHx(m);
          const k = Math.min(143, m / 10);
          showTip(title(hhmm(m)) + row(label, `${fmt.format(Math.round(rhythm.story[k] / 10) * 10)}/h`) + row("Average weekday", `${fmt.format(Math.round(rhythm.curveWd[k] / 10) * 10)}/h`), e.clientX, e.clientY);
        }}
        onPointerLeave={() => { hideTip(); setHx(null); }}
        onClick={(e) => { const m = at(e); if (m !== null) scrubTo(m); }}
        style={{ cursor: "pointer" }}
      >
        <defs>
          <linearGradient id="tph" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={OUT} stopOpacity=".42" />
            <stop offset="1" stopColor={OUT} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={Y(v)} y2={Y(v)} stroke={INK3} strokeOpacity={v ? 0.18 : 0.45} />
            <text x={X0 - 6} y={Y(v) + 3} textAnchor="end" fill={INK3} fontFamily={MONO} fontSize="8.5">{v ? `${v / 1000}k` : "0"}</text>
          </g>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={X(h * 60)} y={116} textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"} fill={INK3} fontFamily={MONO} fontSize="8.5">{pad(h)}</text>
        ))}
        <path d={`${geo.story}L${X1} ${Y1}L${X0} ${Y1}Z`} fill="url(#tph)" />
        <path d={geo.avg} fill="none" stroke={INK3} strokeWidth="1.5" strokeDasharray="3 3" />
        <path d={geo.story} fill="none" stroke={OUT} strokeWidth="2" strokeLinejoin="round" />
        {hx !== null && <line x1={X(hx)} x2={X(hx)} y1={Y0} y2={Y1} stroke="#a6aebd" strokeOpacity=".5" strokeDasharray="2 3" />}
        <line x1={px} x2={px} y1={Y0 - 4} y2={Y1} stroke={LED} strokeWidth="1.4" />
        <circle cx={px} cy={py} r="4" fill={LED} stroke="#1c2029" strokeWidth="2" />
        <rect x={X0} y={0} width={X1 - X0} height={Y1 + 6} fill="transparent" />
      </svg>
      <SrTable
        caption={`Rides per hour, ${label} and the average weekday`}
        head={["Hour", label, "Average weekday"]}
        rows={Array.from({ length: 24 }, (_, h) => [
          `${pad(h)}:00`,
          fmt.format(Math.round(rhythm.story.slice(h * 6, h * 6 + 6).reduce((a, b) => a + b, 0) / 6)),
          fmt.format(Math.round(rhythm.curveWd.slice(h * 6, h * 6 + 6).reduce((a, b) => a + b, 0) / 6)),
        ])}
      />
      <div className="legend-inline">
        <span><i style={{ background: OUT }} />{label}</span>
        <span><i className="dash" />Average weekday</span>
      </div>
    </>
  );
}
