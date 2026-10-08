"use client";
import { useData } from "@/lib/store";
import { hideTip, row, showTip, title } from "@/lib/tip";
import { IN, INK2, INK3, MONO, OUT } from "./common";

const N = 40, W = 300, H = 120, MID = 60;

/** Real bikes leaving and docking between consecutive GBFS snapshots, since the page opened. */
export function LiveActivity() {
  const activity = useData((d) => d.activity);
  const slots = Array.from({ length: N }, (_, k) => activity[activity.length - N + k] ?? null);
  const mx = Math.max(3, ...activity.map((a) => Math.max(a.left, a.docked)));
  const bw = W / N;
  const tD = activity.reduce((s, a) => s + a.left, 0), tA = activity.reduce((s, a) => s + a.docked, 0);
  const fmtT = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-CA", { timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return (
    <svg viewBox={`0 0 ${W + 40} ${H + 14}`} role="img" aria-label={`Bikes leaving and docking per snapshot since you opened the page: ${tD} left, ${tA} docked`} onPointerLeave={hideTip}>
      <line x1={0} x2={W} y1={MID} y2={MID} stroke={INK3} strokeOpacity=".5" />
      {!activity.length && (
        <text x={W / 2} y={MID - 10} textAnchor="middle" fill={INK3} fontFamily={MONO} fontSize="9">waiting for the next snapshot…</text>
      )}
      {slots.map((a, k) => {
        if (!a) return null;
        const d = (a.left / mx) * 50, up = (a.docked / mx) * 50, x = k * bw + 0.5;
        return (
          <g key={a.to} onPointerMove={(e) => showTip(title(`${fmtT(a.from)} → ${fmtT(a.to)}`) + row("Bikes left", a.left) + row("Bikes docked", a.docked) + (a.trucked ? row("Moved by trucks", a.trucked) : ""), e.clientX, e.clientY)}>
            <rect x={x - 0.5} y={0} width={bw} height={H} fill="transparent" />
            {a.left > 0 && <rect x={x} y={MID - 1 - d} width={bw - 1.6} height={d} rx={1.4} fill={OUT} />}
            {a.docked > 0 && <rect x={x} y={MID + 1} width={bw - 1.6} height={up} rx={1.4} fill={IN} />}
          </g>
        );
      })}
      <circle cx={W + 8} cy={16} r={3.5} fill={OUT} />
      <text x={W + 15} y={19.5} fill={INK2} fontFamily={MONO} fontSize="9.5">{tD}</text>
      <circle cx={W + 8} cy={H - 16} r={3.5} fill={IN} />
      <text x={W + 15} y={H - 12.5} fill={INK2} fontFamily={MONO} fontSize="9.5">{tA}</text>
      <text x={0} y={H + 12} fill={INK3} fontFamily={MONO} fontSize="8.5">older</text>
      <text x={W} y={H + 12} textAnchor="end" fill={INK3} fontFamily={MONO} fontSize="8.5">latest snapshot</text>
    </svg>
  );
}
