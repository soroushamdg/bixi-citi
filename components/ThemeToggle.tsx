"use client";
import { useEffect, useState } from "react";

export type ThemePref = "auto" | "light" | "dark";
const KEY = "bixi-theme";
const NEXT: Record<ThemePref, ThemePref> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<ThemePref, string> = { auto: "Theme: automatic (follows your system)", light: "Theme: light", dark: "Theme: dark" };

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark")t="auto";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="auto"}`;

function read(): ThemePref {
  const t = typeof document !== "undefined" ? document.documentElement.dataset.theme : "auto";
  return t === "light" || t === "dark" ? t : "auto";
}

/** Auto → light → dark. Auto follows the operating system and updates live. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("auto");
  useEffect(() => {
    const id = setTimeout(() => setPref(read()), 0);
    return () => clearTimeout(id);
  }, []);
  const set = (p: ThemePref) => {
    setPref(p);
    document.documentElement.dataset.theme = p;
    try {
      if (p === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  };
  return (
    <button className="theme" data-pref={pref} aria-label={`${LABEL[pref]}. Switch to ${NEXT[pref]}.`} title={LABEL[pref]} onClick={() => set(NEXT[pref])}>
      {pref === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : pref === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8.2" />
          <path className="a-mark" d="M12 3.8a8.2 8.2 0 0 1 0 16.4z" stroke="none" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
