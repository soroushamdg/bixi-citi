"use client";
import { useMemo } from "react";
import { ui, useData } from "@/lib/store";
import { getScene } from "@/lib/story-controller";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { IN, INK, INK2, INK3, MONO, OUT, signed } from "./common";

const RH = 21, CX = 238, HW = 70;

/** The six stations that lose the most bikes on an average day, and the six that gain the most. */
export function NetStations() {
  const hist = useData((d) => d.hist);
  const rows = useMemo(() => {
    if (!hist) return [];
    const idx = hist.net.map((_, i) => i).sort((a, b) => hist.net[a] - hist.net[b]);
    return [...idx.slice(0, 6), ...idx.slice(-6).reverse()];
  }, [hist]);
  if (!hist || !rows.length) return <div className="chart-empty label">Loading stations…</div>;
  const mx = Math.max(Math.abs(hist.net[rows[0]]), Math.abs(hist.net[rows[6]])) || 1;
  const select = (i: number) => {
    ui.setState({ selected: { set: "hist", i } });
    getScene()?.focus({ set: "hist", i });
  };
  return (
    <svg viewBox={`0 0 330 ${rows.length * RH + 18}`} role="img" aria-label="Stations that lose and gain the most bikes on an average day" onPointerLeave={() => { hideTip(); ui.setState({ hover: null }); }}>
      {rows.map((i, k) => {
        const y = k * RH + (k >= 6 ? 12 : 0), v = hist.net[i], w = (Math.abs(v) / mx) * HW;
        const nm = hist.name[i].length > 27 ? hist.name[i].slice(0, 26) + "…" : hist.name[i];
        return (
          <g
            key={i}
            style={{ cursor: "pointer" }}
            onPointerMove={(e) => {
              ui.setState({ hover: { set: "hist", i } });
              showTip(title(hist.name[i]) + row("Average net per day", `${signed(v)} bikes`) + row("Elevation", `${Math.round(hist.elev[i])} m`) + row("Borough", hist.boro[i]), e.clientX, e.clientY);
            }}
            onClick={() => select(i)}
          >
            <rect x={0} y={y} width={330} height={RH} fill="transparent" />
            <text x={0} y={y + 14} fill={INK2} fontFamily="var(--body)" fontSize="10.5">{nm}</text>
            {v < 0 ? (
              <>
                <rect x={CX - w} y={y + 5} width={Math.max(1, w)} height={11} rx={3} fill={OUT} />
                <text x={CX - w - 4} y={y + 14} textAnchor="end" fill={INK} fontFamily={MONO} fontSize="9">{signed(v)}</text>
              </>
            ) : (
              <>
                <rect x={CX} y={y + 5} width={Math.max(1, w)} height={11} rx={3} fill={IN} />
                <text x={CX + w + 4} y={y + 14} fill={INK} fontFamily={MONO} fontSize="9">{signed(v)}</text>
              </>
            )}
          </g>
        );
      })}
      <line x1={CX} x2={CX} y1={0} y2={rows.length * RH + 12} stroke={INK3} strokeOpacity=".6" />
    </svg>
  );
}
