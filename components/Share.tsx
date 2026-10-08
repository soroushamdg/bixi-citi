"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRAND } from "./brand-icons";

/**
 * Share sheet: the showreel on top (a small custom player), the site link ready
 * to copy, and one-click posts to the usual networks.
 */
export const SITE = "https://bixi-citi.vercel.app";
const VIDEO = "/video/bixi-citi-showreel.mp4";
const POSTER = "/video/poster.jpg";
const TITLE = "BIXI Citi";
const TEXT = "BIXI Citi: storytelling with BIXI Montréal data. Live stations, real rides and 13 seasons, over a 3D Montréal.";

/** the public address, also when running locally */
const siteUrl = () => (typeof location === "undefined" || /^(localhost|127\.|\[::1\])/.test(location.hostname) ? SITE : location.origin);
const enc = encodeURIComponent;

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers, or no permission: copy through a hidden field
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback((text: string) => {
    writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    });
  }, []);
  return [copied, copy];
}

const TARGETS: Array<{ key: string; name: string; color: string; href: (url: string) => string }> = [
  { key: "x", name: "X", color: "var(--ink)", href: (u) => `https://x.com/intent/post?text=${enc(TEXT)}&url=${enc(u)}` },
  { key: "linkedin", name: "LinkedIn", color: "#0A66C2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
  { key: "facebook", name: "Facebook", color: "#0866FF", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { key: "reddit", name: "Reddit", color: "#FF4500", href: (u) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(TITLE + ": storytelling with BIXI Montréal data")}` },
  { key: "bluesky", name: "Bluesky", color: "#1185FE", href: (u) => `https://bsky.app/intent/compose?text=${enc(`${TEXT} ${u}`)}` },
  { key: "threads", name: "Threads", color: "var(--ink)", href: (u) => `https://www.threads.net/intent/post?text=${enc(`${TEXT} ${u}`)}` },
  { key: "whatsapp", name: "WhatsApp", color: "#25D366", href: (u) => `https://wa.me/?text=${enc(`${TEXT} ${u}`)}` },
  { key: "email", name: "Email", color: "var(--brand)", href: (u) => `mailto:?subject=${enc(TITLE)}&body=${enc(`${TEXT}\n\n${u}`)}` },
];

const mmss = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

/* ---------- icons ---------- */
const Ico = {
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5v11.5M7.8 7.6 12 3.4l4.2 4.2M5.5 12.5v5.6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5.6" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.2-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="4.8" width="4" height="14.4" rx="1.2" />
      <rect x="13.5" y="4.8" width="4" height="14.4" rx="1.2" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.6 12a7.6 7.6 0 1 0 2.3-5.4" />
      <path d="M4.4 3.8v3.6H8" />
      <text x="12.2" y="15.4" textAnchor="middle" fontSize="7.2" fontWeight="600" fill="currentColor" stroke="none" fontFamily="var(--mono)">15</text>
    </svg>
  ),
  fwd: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.4 12a7.6 7.6 0 1 1-2.3-5.4" />
      <path d="M19.6 3.8v3.6H16" />
      <text x="11.8" y="15.4" textAnchor="middle" fontSize="7.2" fontWeight="600" fill="currentColor" stroke="none" fontFamily="var(--mono)">15</text>
    </svg>
  ),
  full: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 9V5.6c0-.6.5-1.1 1.1-1.1H9M15 4.5h3.4c.6 0 1.1.5 1.1 1.1V9M19.5 15v3.4c0 .6-.5 1.1-1.1 1.1H15M9 19.5H5.6c-.6 0-1.1-.5-1.1-1.1V15" />
    </svg>
  ),
  exitFull: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4.5v3.4c0 .6-.5 1.1-1.1 1.1H4.5M19.5 9h-3.4c-.6 0-1.1-.5-1.1-1.1V4.5M15 19.5v-3.4c0-.6.5-1.1 1.1-1.1h3.4M4.5 15h3.4c.6 0 1.1.5 1.1 1.1v3.4" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" />
      <path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
      <path d="M4.2 7l7.8 6 7.8-6" strokeLinecap="round" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  ),
};

/* ---------- player ---------- */
function Player() {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(30);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const [nudge, setNudge] = useState<{ dir: -1 | 1; n: number } | null>(null);
  const [copied, copy] = useCopy();

  const paint = useCallback(() => {
    const v = vid.current;
    if (v && track.current) track.current.style.setProperty("--p", String(v.duration ? v.currentTime / v.duration : 0));
  }, []);
  // the progress line follows playback every frame, not just on timeupdate
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => { paint(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint]);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); clearTimeout(idleTimer.current); };
  }, []);

  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2200);
  };
  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => undefined);
    else v.pause();
    wake();
  };
  const skip = (dir: -1 | 1) => {
    const v = vid.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + dir * 15), (v.duration || dur) - 0.05);
    setTime(v.currentTime);
    setNudge((n) => ({ dir, n: (n?.n ?? 0) + 1 }));
    paint();
    wake();
  };
  const toggleFull = () => {
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };
  const seekAt = (clientX: number) => {
    const v = vid.current, t = track.current;
    if (!v || !t || !v.duration) return;
    const r = t.getBoundingClientRect();
    v.currentTime = Math.min(Math.max(0, (clientX - r.left) / r.width), 0.999) * v.duration;
    setTime(v.currentTime);
    paint();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") toggle();
    else if (k === "arrowleft" || k === "j") skip(-1);
    else if (k === "arrowright" || k === "l") skip(1);
    else if (k === "f") toggleFull();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={box}
      className="player"
      data-playing={playing}
      data-idle={idle}
      tabIndex={0}
      aria-label="BIXI Citi showreel. Space plays or pauses, arrow keys skip 15 seconds, F toggles full screen."
      onKeyDown={onKey}
      onPointerMove={wake}
    >
      <video
        ref={vid}
        src={VIDEO}
        poster={POSTER}
        preload="metadata"
        playsInline
        onClick={toggle}
        onPlay={() => { setPlaying(true); wake(); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 30)}
        onSeeked={paint}
      >
        A 30-second showreel of BIXI Citi.
      </video>

      <button className="player-big" aria-label="Play" tabIndex={playing ? -1 : 0} onClick={toggle}>{Ico.play}</button>

      {nudge && (
        <span key={nudge.n} className="player-nudge" data-dir={nudge.dir} aria-hidden="true">
          {nudge.dir < 0 ? "−15 s" : "+15 s"}
        </span>
      )}

      <button
        className="player-copy"
        data-copied={copied}
        aria-label={copied ? "Video link copied" : "Copy the video file link"}
        onClick={() => copy(siteUrl() + VIDEO)}
      >
        <span>{copied ? "Copied" : "Copy video link"}</span>
        {copied ? Ico.check : Ico.share}
      </button>

      <div className="player-bar">
        <button className="pbtn" aria-label="Back 15 seconds" onClick={() => skip(-1)}>{Ico.back}</button>
        <button className="pbtn pmain" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? Ico.pause : Ico.play}</button>
        <button className="pbtn" aria-label="Forward 15 seconds" onClick={() => skip(1)}>{Ico.fwd}</button>
        <span className="ptime">{mmss(time)}</span>
        <div
          ref={track}
          className="ptrack"
          role="slider"
          tabIndex={-1}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${mmss(time)} of ${mmss(dur)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.dataset.drag = "true";
            seekAt(e.clientX);
          }}
          onPointerMove={(e) => { if (e.currentTarget.dataset.drag === "true") seekAt(e.clientX); }}
          onPointerUp={(e) => { e.currentTarget.dataset.drag = "false"; }}
        >
          <i className="pfill" />
          <i className="pknob" />
        </div>
        <span className="ptime">{mmss(dur)}</span>
        <button className="pbtn" aria-label={full ? "Exit full screen" : "Full screen"} onClick={toggleFull}>{full ? Ico.exitFull : Ico.full}</button>
      </div>
    </div>
  );
}

/* ---------- sheet ---------- */
function ShareSheet({ onClose }: { onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [copied, copy] = useCopy();
  const [url] = useState(siteUrl);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 170);
  }, [onClose]);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) { e.preventDefault(); close(); }
      if (e.key !== "Tab" || !card.current) return;
      // keep focus inside the sheet
      const f = [...card.current.querySelectorAll<HTMLElement>("button:not([tabindex='-1']),a[href],input,[tabindex='0']")].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", onKey);
    return () => { root.style.overflow = prev; removeEventListener("keydown", onKey); };
  }, [close]);

  return (
    <div className="share" data-leaving={leaving} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={card} className="share-card" role="dialog" aria-modal="true" aria-labelledby="share-title" tabIndex={-1}>
        <div className="share-head">
          <div>
            <span className="label share-kicker">Share</span>
            <h2 id="share-title">BIXI Citi</h2>
            <p>Storytelling with BIXI Montréal data. Thirty seconds of it below.</p>
          </div>
          <button className="share-x" aria-label="Close" onClick={close}>{Ico.close}</button>
        </div>

        <Player />

        <div className="share-sec">
          <label className="label" htmlFor="share-url">Link</label>
          <div className="share-field">
            {Ico.globe}
            <input id="share-url" readOnly value={url.replace(/^https?:\/\//, "")} onFocus={(e) => e.currentTarget.select()} aria-describedby="share-title" />
            <button className="share-copy" data-copied={copied} onClick={() => copy(url)}>
              {copied ? Ico.check : Ico.link}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="share-sec">
          <span className="label">Post it</span>
          <div className="share-targets">
            {TARGETS.map((t) => (
              <a key={t.key} className="share-target" href={t.href(url)} target="_blank" rel="noreferrer noopener" style={{ "--c": t.color } as React.CSSProperties}>
                <i>
                  {t.key === "email" ? Ico.mail : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={BRAND[t.key]} /></svg>
                  )}
                </i>
                {t.name}
              </a>
            ))}
            {canShare && (
              <button className="share-target" onClick={() => navigator.share({ title: TITLE, text: TEXT, url }).catch(() => undefined)}>
                <i>{Ico.more}</i>
                More
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The share button, top right of the header. */
export function ShareButton() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  return (
    <>
      <button ref={btn} className="theme share-btn" aria-label="Share" title="Share" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {Ico.share}
      </button>
      {open && createPortal(<ShareSheet onClose={close} />, document.body)}
    </>
  );
}
