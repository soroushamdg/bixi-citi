"use client";
import { useData, useUI } from "@/lib/store";
import { selectYear } from "@/lib/story-controller";
import { fmtMillions, signedPct } from "@/lib/years-copy";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { INK2, INK3, LED, MONO, OUT } from "./common";
import { SrTable } from "./SrTable";

const W = 330, H = 118, X0 = 30, Y0 = 8, Y1 = 92;

/** Trips per year, every year of open data. Click a bar to open that year. */
export function AnnualBars() {
  const idx = useData((d) => d.years);
  const year = useUI((s) => s.year);
  if (!idx) return <div className="chart-empty label">Loading years…</div>;
  const ys = idx.years;
  const max = Math.max(...ys.map((y) => y.trips));
  const top = Math.ceil(max / 2e6) * 2e6;
  const bw = (W - X0) / ys.length;
  const Y = (v: number) => Y1 - ((Y1 - Y0) * v) / top;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trips per year since 2014" onPointerLeave={hideTip}>
        <defs>
          <pattern id="partial" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill={OUT} fillOpacity=".25" />
            <line x1="0" y1="0" x2="0" y2="5" stroke={OUT} strokeWidth="2.2" />
          </pattern>
        </defs>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={X0} x2={W} y1={Y(v)} y2={Y(v)} stroke={INK3} strokeOpacity={v ? 0.18 : 0.45} />
            <text x={X0 - 5} y={Y(v) + 3} textAnchor="end" fill={INK3} fontFamily={MONO} fontSize="8.5">{v ? `${v / 1e6}M` : "0"}</text>
          </g>
        ))}
        {ys.map((y, k) => {
          const x = X0 + k * bw + 2, w = bw - 4, sel = y.year === year;
          return (
            <g
              key={y.year}
              style={{ cursor: "pointer" }}
              onClick={() => selectYear(y.year)}
              onPointerMove={(e) =>
                showTip(
                  title(`${y.year}${y.partial ? " (so far)" : ""}`) +
                    row("Rides", fmtMillions(y.trips)) +
                    (y.growth != null ? row(`vs ${y.year - 1}, same months`, signedPct(y.growth)) : "") +
                    row("Stations", y.stationsActive.toLocaleString("en-CA")),
                  e.clientX,
                  e.clientY,
                )
              }
            >
              <rect x={x - 2} y={0} width={bw} height={H} fill="transparent" />
              <rect x={x} y={Y(y.trips)} width={w} height={Math.max(1, Y1 - Y(y.trips))} rx={3} fill={y.partial ? "url(#partial)" : OUT} fillOpacity={sel ? 1 : 0.5} />
              {sel && <rect x={x - 1.5} y={Y(y.trips) - 1.5} width={w + 3} height={Y1 - Y(y.trips) + 3} rx={4} fill="none" stroke={LED} strokeWidth="1.4" />}
              <text x={x + w / 2} y={H - 12} textAnchor="middle" fill={sel ? LED : INK2} fontFamily={MONO} fontSize="8.5">{`’${String(y.year).slice(2)}`}</text>
            </g>
          );
        })}
      </svg>
      <SrTable caption="Rides per year" head={["Year", "Rides", "Stations"]} rows={ys.map((y) => [`${y.year}${y.partial ? " (so far)" : ""}`, y.trips, y.stationsActive])} />
    </>
  );
}
