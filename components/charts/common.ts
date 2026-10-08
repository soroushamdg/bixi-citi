/* theme tokens (see app/globals.css): charts follow light and dark mode */
export const INK3 = "var(--ink-3)";
export const INK2 = "var(--ink-2)";
export const INK = "var(--ink)";
export const OUT = "var(--out)";
export const IN = "var(--in)";
export const LED = "var(--led)";
export const MONO = "var(--mono)";
export const RAMP = Array.from({ length: 8 }, (_, k) => `var(--ramp-${k})`);
export const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (m: number) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
};
export const fmt = new Intl.NumberFormat("en-CA");
export const signed = (v: number) => (v < 0 ? "−" : "+") + fmt.format(Math.abs(Math.round(v)));
/** pointer x inside an SVG with a fixed viewBox width */
export const svgX = (e: React.PointerEvent | React.MouseEvent, vbWidth: number) => {
  const svg = (e.currentTarget as Element).closest("svg") ?? (e.currentTarget as Element).querySelector("svg");
  if (!svg) return -1;
  const r = svg.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * vbWidth;
};
