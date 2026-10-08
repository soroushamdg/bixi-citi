"use client";
/** One shared tooltip element, driven imperatively (pointermove is too hot for React state). */
let el: HTMLElement | null = null;
export const bindTip = (node: HTMLElement | null) => { el = node; };

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function showTip(html: string, x: number, y: number) {
  if (!el) return;
  el.innerHTML = html;
  el.classList.add("on");
  const r = el.getBoundingClientRect();
  let L = x + 16, T = y + 16;
  if (L + r.width > innerWidth - 8) L = x - r.width - 14;
  if (T + r.height > innerHeight - 8) T = y - r.height - 14;
  el.style.left = Math.max(8, L) + "px";
  el.style.top = Math.max(8, T) + "px";
}
export function hideTip() {
  el?.classList.remove("on");
}

export const row = (k: string, v: string | number) => `<div class="r"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`;
export const title = (t: string) => `<div class="t">${esc(t)}</div>`;
