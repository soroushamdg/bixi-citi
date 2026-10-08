export const INK3 = "#6e778a";
export const INK2 = "#a6aebd";
export const INK = "#e9ebf1";
export const OUT = "#E0703F";
export const IN = "#2A9CB8";
export const LED = "#f3dcb0";
export const MONO = "var(--mono)";
export const RAMP = ["#2b2624", "#4a2f24", "#6b3a26", "#8f4628", "#b5552c", "#d96836", "#f08a58", "#ffb38a"];
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
