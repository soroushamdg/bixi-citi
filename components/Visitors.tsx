"use client";
import { useEffect, useState } from "react";
import type { Stats } from "@/lib/presence";

/**
 * Bottom-left corner: how many people have the site open right now. Hover (or
 * focus) for today's and all-time unique visitors. Anonymous: a random id in
 * localStorage, no cookies.
 */
const KEY = "bixi-visitor";
const BEAT = 45_000, POLL = 30_000;
const fmt = new Intl.NumberFormat("en-CA");

function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID(); // private mode: counted for this visit only
  }
}

export function Visitors() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    const id = visitorId();
    let alive = true;
    const take = (j: Stats | null) => { if (alive && j) setS(j); };
    const send = (kind: "hello" | "beat") =>
      fetch("/api/presence", { method: "POST", body: JSON.stringify({ id, kind }), keepalive: true });
    const hello = () => send("hello").then((r) => (r.ok && r.status === 200 ? r.json() : null)).then(take).catch(() => undefined);
    const poll = () => fetch("/api/presence").then((r) => (r.ok ? r.json() : null)).then(take).catch(() => undefined);

    hello();
    const beat = setInterval(() => { if (!document.hidden) send("beat").catch(() => undefined); }, BEAT);
    const refresh = setInterval(() => { if (!document.hidden) poll(); }, POLL);
    // back on the tab: count again straight away
    const onVisible = () => { if (!document.hidden) hello(); };
    // leaving: drop out of "online now" without waiting for the window to lapse
    const onHide = () => navigator.sendBeacon?.("/api/presence", JSON.stringify({ id, kind: "bye" }));
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) hello(); };
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("pagehide", onHide);
    addEventListener("pageshow", onShow);
    return () => {
      alive = false;
      clearInterval(beat);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("pagehide", onHide);
      removeEventListener("pageshow", onShow);
    };
  }, []);

  if (!s?.enabled) return null;
  // the person reading this is online, whatever a cached count says
  const online = Math.max(1, s.online), today = Math.max(online, s.today), total = Math.max(today, s.total);
  return (
    <div
      className="visitors"
      tabIndex={0}
      aria-label={`${fmt.format(online)} online now, ${fmt.format(today)} visitors today, ${fmt.format(total)} visitors in total`}
    >
      <div className="vis-card" aria-hidden="true">
        <span className="label">Visitors</span>
        <dl>
          <div className="now"><dt>Online now</dt><dd>{fmt.format(online)}</dd></div>
          <div><dt>Online today</dt><dd>{fmt.format(today)}</dd></div>
          <div><dt>Total visitors</dt><dd>{fmt.format(total)}</dd></div>
        </dl>
        <p>Unique visitors, counted anonymously. Today starts at midnight in Montréal.</p>
      </div>
      <div className="vis-pill" aria-hidden="true">
        <i className="vis-dot" />
        <b key={online}>{fmt.format(online)}</b>
        <span>online</span>
      </div>
    </div>
  );
}
