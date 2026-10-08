"use client";
import { useMemo } from "react";
import { useData, useUI } from "@/lib/store";
import { scrubDay } from "@/lib/story-controller";
import { DAYS } from "@/lib/story";
import { dayLong } from "@/lib/years-copy";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { INK3, LED, MONO, RAMP } from "./common";

const X0 = 22, Y0 = 14, C = 5, G = 0.7;
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** One cell per day of the year, coloured by rides; the cursor day is outlined. */
export function YearCalendar() {
  const y = useData((d) => d.yearSummary);
  const yday = useUI((s) => Math.floor(s.yday));
  const geo = useMemo(() => {
    if (!y) return null;
    const jan1 = Date.UTC(y.year, 0, 1);
    const wd0 = (new Date(jan1).getUTCDay() + 6) % 7; // Monday = 0
    const max = Math.max(...y.daily);
    const rank = y.daily.map((v, i) => [v, i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
    const rankOf = new Map(rank.map(([, i], k) => [i, k + 1]));
    const cells = y.daily.map((v, d) => {
      const pos = d + wd0;
      return { d, v, x: X0 + Math.floor(pos / 7) * (C + G), y: Y0 + (pos % 7) * (C + G) };
    });
    const monthX = Array.from({ length: 12 }, (_, m) => {
      const d = (Date.UTC(y.year, m, 1) - jan1) / 86400_000;
      return X0 + Math.floor((d + wd0) / 7) * (C + G);
    });
    return { cells, max, rankOf, served: rank.length, monthX, jan1 };
  }, [y]);
  if (!y || !geo) return <div className="chart-empty label">Loading the year…</div>;
  const q = (v: number) => (v <= 0 ? -1 : Math.min(7, Math.floor(Math.sqrt(v / geo.max) * 8)));
  return (
    <svg viewBox={`0 0 330 ${Y0 + 7 * (C + G) + 4}`} role="img" aria-label={`Rides per day in ${y.year}`} onPointerLeave={hideTip}>
      {geo.monthX.map((x, m) => (
        <text key={m} x={x} y={9} fill={INK3} fontFamily={MONO} fontSize="7.5">{MONTHS[m]}</text>
      ))}
      {[0, 2, 4, 6].map((r) => (
        <text key={r} x={0} y={Y0 + r * (C + G) + C - 0.5} fill={INK3} fontFamily={MONO} fontSize="6.5">{DAYS[r]}</text>
      ))}
      {geo.cells.map((c) => {
        const k = q(c.v);
        const iso = new Date(geo.jan1 + c.d * 86400_000).toISOString().slice(0, 10);
        return (
          <rect
            key={c.d}
            x={c.x}
            y={c.y}
            width={C}
            height={C}
            rx={1.2}
            fill={k < 0 ? "#232833" : RAMP[k]}
            stroke={c.d === yday ? LED : undefined}
            strokeWidth={c.d === yday ? 1.1 : undefined}
            style={{ cursor: c.v > 0 ? "pointer" : "default" }}
            onPointerMove={(e) => showTip(title(dayLong(iso)) + row("Rides", c.v.toLocaleString("en-CA")) + (c.v > 0 ? row("Rank", `#${geo.rankOf.get(c.d)} of ${geo.served}`) : ""), e.clientX, e.clientY)}
            onClick={() => c.v > 0 && scrubDay(c.d)}
          />
        );
      })}
    </svg>
  );
}
