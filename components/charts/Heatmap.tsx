"use client";
import { useMemo } from "react";
import { DAYS } from "@/lib/story";
import { ui, useData, useUI } from "@/lib/store";
import { scrubTo } from "@/lib/story-controller";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { INK2, INK3, LED, MONO, RAMP, fmt, pad } from "./common";

const CW = 12.33, CH = 16, X0 = 32, Y0 = 4;

/** Average trips per hour for each hour of the week, over the season. */
export function Heatmap() {
  const rhythm = useData((d) => d.rhythm);
  const day = useUI((s) => s.day);
  const hour = useUI((s) => Math.floor(s.minute / 60) % 24);
  const stats = useMemo(() => {
    if (!rhythm) return null;
    let mx = 0, pk = [0, 0];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) { const v = rhythm.how[d * 24 + h]; if (v > mx) { mx = v; pk = [d, h]; } }
    return { mx, pk };
  }, [rhythm]);
  if (!rhythm || !stats) return <div className="chart-empty label">Loading rhythm…</div>;
  const yb = Y0 + 7 * (CH + 3) + 10;
  return (
    <svg
      viewBox={`0 0 330 ${Y0 + 7 * (CH + 3) + 40}`}
      role="img"
      aria-label={`Average trips by hour of the week. Peak: ${DAYS[stats.pk[0]]} ${pad(stats.pk[1])}:00`}
      onPointerLeave={hideTip}
    >
      {DAYS.map((name, d) => (
        <g key={name}>
          <text x={0} y={Y0 + d * (CH + 3) + CH / 2 + 3} fill={d === day ? LED : INK2} fontFamily={MONO} fontSize="9">{name}</text>
          {Array.from({ length: 24 }, (_, h) => {
            const v = rhythm.how[d * 24 + h];
            const qn = Math.min(7, Math.floor((v / stats.mx) * 8));
            const cur = d === day && h === hour;
            return (
              <rect
                key={h}
                x={X0 + h * CW}
                y={Y0 + d * (CH + 3)}
                width={CW - 2}
                height={CH}
                rx={3}
                fill={RAMP[qn]}
                stroke={cur ? LED : undefined}
                strokeWidth={cur ? 1.6 : undefined}
                style={{ cursor: "pointer" }}
                onPointerMove={(e) => showTip(title(`${DAYS[d]} ${pad(h)}:00`) + row("Average trips", fmt.format(Math.round(v / 10) * 10)), e.clientX, e.clientY)}
                onClick={() => { ui.setState({ day: d }); scrubTo(h * 60 + 30); }}
              />
            );
          })}
        </g>
      ))}
      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={X0 + h * CW} y={yb} fill={INK3} fontFamily={MONO} fontSize="8.5">{pad(h)}</text>
      ))}
      <text x={X0 + 24 * CW - 2} y={yb} textAnchor="end" fill={INK3} fontFamily={MONO} fontSize="8.5">24</text>
      {RAMP.map((c, k) => <rect key={c} x={X0 + k * 16} y={yb + 10} width={14} height={7} rx={2} fill={c} />)}
      <text x={X0 + 8 * 16 + 6} y={yb + 16.5} fill={INK3} fontFamily={MONO} fontSize="8.5">fewer → more trips</text>
    </svg>
  );
}

export function useRhythmPeak() {
  const rhythm = useData((d) => d.rhythm);
  return useMemo(() => {
    if (!rhythm) return "";
    let mx = 0, pk = 0;
    rhythm.how.forEach((v, i) => { if (v > mx) { mx = v; pk = i; } });
    return `Peak · ${DAYS[Math.floor(pk / 24)]} ${pad(pk % 24)}:00`;
  }, [rhythm]);
}
