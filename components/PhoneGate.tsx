"use client";
import { useState } from "react";
import { BixiLogo } from "./BixiLogo";
import { AUTHOR } from "./Footer";

/** Shown instead of the console on phones (CSS decides, see PHONE_QUERY in lib/device.ts). */
export function PhoneGate() {
  const [copied, setCopied] = useState(false);
  const send = async () => {
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title: "BIXI Citi", text: "Open BIXI Citi on a desktop", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* share sheet dismissed, or no clipboard access */
    }
  };
  return (
    <main className="phone-gate" aria-labelledby="gate-title">
      <div className="gate-card">
        <span className="glass gate-glass">
          <BixiLogo className="glass-logo" title="BIXI" />
          <i className="glass-sheen" aria-hidden="true" />
        </span>
        <span className="label gate-kicker">BIXI Citi · desktop only</span>
        <h1 id="gate-title">Open this on a bigger screen</h1>
        <p>
          BIXI Citi tells the story of BIXI data on a live 3D model of Montréal: 600,000 buildings, every station and millions of real rides. It is made for a laptop or
          desktop, so it does not run on phones.
        </p>
        <button className="gate-btn" onClick={send}>{copied ? "Link copied" : "Send the link to yourself"}</button>
        <p className="gate-legal">
          Unofficial. Not affiliated with BIXI Montréal. By <a href={AUTHOR.links} target="_blank" rel="noreferrer">{AUTHOR.name} ({AUTHOR.full})</a>
        </p>
      </div>
    </main>
  );
}
