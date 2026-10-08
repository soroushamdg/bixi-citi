"use client";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { IN, INK3, MONO, OUT, pad } from "./common";

/** Average departures (up, amber) and arrivals (down, teal) by hour for one station. */
export function StationSpark({ dep, arr, label }: { dep: number[]; arr: number[]; label: string }) {
  const W = 264, H0 = 30;
  const mx = Math.max(0.1, ...dep, ...arr);
  return (
    <svg viewBox={`0 0 ${W} 64`} role="img" aria-label={`${label}: average departures and arrivals by hour`} onPointerLeave={hideTip}>
      <line x1={0} x2={W} y1={H0} y2={H0} stroke={INK3} strokeOpacity=".5" />
      {dep.map((d, h) => {
        const x = h * (W / 24) + 1, bw = W / 24 - 2, dh = (d / mx) * 26, ah = (arr[h] / mx) * 26;
        return (
          <g key={h} onPointerMove={(e) => showTip(title(`${pad(h)}:00 · ${label}`) + row("Bikes taken", d.toFixed(1)) + row("Bikes returned", arr[h].toFixed(1)), e.clientX, e.clientY)}>
            <rect x={x - 1} y={0} width={W / 24} height={60} fill="transparent" />
            <rect x={x} y={H0 - 1 - dh} width={bw} height={Math.max(0.5, dh)} rx={1.5} fill={OUT} />
            <rect x={x} y={H0 + 1} width={bw} height={Math.max(0.5, ah)} rx={1.5} fill={IN} />
          </g>
        );
      })}
      <text x={0} y={62} fill={INK3} fontFamily={MONO} fontSize="8.5">00</text>
      <text x={W / 2} y={62} textAnchor="middle" fill={INK3} fontFamily={MONO} fontSize="8.5">12</text>
      <text x={W} y={62} textAnchor="end" fill={INK3} fontFamily={MONO} fontSize="8.5">24</text>
    </svg>
  );
}
