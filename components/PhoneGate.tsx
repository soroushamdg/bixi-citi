"use client";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { BixiLogo } from "./BixiLogo";
import { AUTHOR } from "./Footer";
import { Ico, Player, ShareSheet, TEXT, TITLE, siteUrl, useCopy } from "./Share";
import { PHONE_QUERY } from "@/lib/device";

const subscribe = (cb: () => void) => {
  const mq = matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Shown instead of the console on phones (CSS decides, see PHONE_QUERY in
 * lib/device.ts): the showreel, and ways to pass the link on to a bigger screen.
 */
export function PhoneGate() {
  // only phones mount the player, so desktops never fetch the film for a hidden page
  const phone = useSyncExternalStore(subscribe, () => matchMedia(PHONE_QUERY).matches, () => false);
  const [copied, copy] = useCopy();
  const [sheet, setSheet] = useState(false);
  const share = () => {
    const url = siteUrl();
    if (navigator.share) navigator.share({ title: TITLE, text: TEXT, url }).catch(() => undefined);
    else setSheet(true);
  };
  return (
    <main className="phone-gate" aria-labelledby="gate-title">
      <div className="gate-card">
        <span className="glass gate-glass">
          <BixiLogo className="glass-logo" title="BIXI" />
          <i className="glass-sheen" aria-hidden="true" />
        </span>
        <span className="label gate-kicker">BIXI Citi · made for desktop</span>
        <h1 id="gate-title">Open this on a bigger screen</h1>
        <p>
          BIXI Citi tells the story of BIXI data on a live 3D model of Montréal: 600,000 buildings, every station and millions of real rides. It
          needs a laptop or desktop. Here are 30 seconds of it.
        </p>
        {phone && <Player />}
        <div className="gate-actions">
          <button className="gate-btn" onClick={share}>
            {Ico.share}
            Share
          </button>
          <button className="gate-ghost" data-copied={copied} onClick={() => copy(siteUrl())}>
            {copied ? Ico.check : Ico.link}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="gate-legal">
          Unofficial. Not affiliated with BIXI Montréal. By <a href={AUTHOR.links} target="_blank" rel="noreferrer">{AUTHOR.name} ({AUTHOR.full})</a>
        </p>
      </div>
      {sheet && createPortal(<ShareSheet video={false} onClose={() => setSheet(false)} />, document.body)}
    </main>
  );
}
