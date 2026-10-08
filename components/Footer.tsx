"use client";
import { useEffect, useState } from "react";
import { useData } from "@/lib/store";
import { startTour } from "./Tour";
import { isPhone } from "@/lib/device";

export const AUTHOR = { name: "Sora Bon", full: "Soroush Bonab", links: "https://linktr.ee/soroucsh" };
export const REPO = "https://github.com/soroushamdg/bixi-citi";

const when = (iso: string | number | null | undefined, withTime = false) => {
  if (!iso) return "—";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal", year: "numeric", month: "short", day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(d);
};

function Row({ label, file, note, href }: { label: string; file: string; note: string; href?: string }) {
  return (
    <li>
      <b>{label}</b>
      {href ? <a href={href} target="_blank" rel="noreferrer">{file}</a> : <span className="file">{file}</span>}
      <em>{note}</em>
    </li>
  );
}

/** Two columns: where every piece of data comes from and when it was last refreshed; who made this. */
export function Footer() {
  const status = useData((d) => d.status);
  const info = useData((d) => d.info);
  const meta = useData((d) => d.meta);
  const years = useData((d) => d.years);
  const [city, setCity] = useState<{ generatedAt: string; buildings: number } | null>(null);
  useEffect(() => {
    if (isPhone()) return;
    // the scene has already fetched this; the browser serves it from cache
    fetch("/city/index.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCity({ generatedAt: j.generatedAt, buildings: j.stats?.buildings ?? 0 }))
      .catch(() => undefined);
  }, []);
  const fmt = new Intl.NumberFormat("en-CA");
  const first = years?.years[0]?.year, last = years?.years[years.years.length - 1]?.year;
  return (
    <footer className="foot">
      <section className="foot-col" aria-labelledby="foot-data">
        <h2 id="foot-data" className="label">Data · last updated</h2>
        <ul>
          <Row label="Live counts" file="station_status.json" href="https://gbfs.velobixi.com/gbfs/2-2/gbfs.json" note={status ? `snapshot ${when(status.t, true)}` : "connecting…"} />
          <Row label="Stations" file="station_information.json" note={info ? `${fmt.format(info.ids.length)} stations · ${when(info.t, true)}` : "—"} />
          <Row label="Story day" file={meta?.source.file ?? "—"} href="https://bixi.com/en/open-data/" note={meta ? `published ${when(meta.source.lastModified)} · processed ${when(meta.generatedAt)}` : "—"} />
          <Row label="Archive" file={years ? `${years.years.length} yearly files, ${first}–${last}` : "—"} href="https://bixi.com/en/open-data/" note={years ? `checked daily · rebuilt ${when(years.generatedAt)}` : "—"} />
          <Row label="City" file="OpenStreetMap + AWS Terrain Tiles" href="https://www.openstreetmap.org/copyright" note={city ? `${fmt.format(city.buildings)} buildings · built ${when(city.generatedAt)}` : "—"} />
        </ul>
      </section>
      <section className="foot-col" aria-labelledby="foot-project">
        <h2 id="foot-project" className="label">Project</h2>
        <p className="foot-credit">
          Design &amp; build by <b>{AUTHOR.name}</b> ({AUTHOR.full})
        </p>
        <div className="foot-links">
          <a href={AUTHOR.links} target="_blank" rel="noreferrer">linktr.ee/soroucsh</a>
          <a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a>
          <button type="button" onClick={startTour}>Take the tour</button>
        </div>
        <p className="foot-legal">
          <b>Unofficial.</b> Not affiliated with, endorsed or sponsored by BIXI Montréal. BIXI and the BIXI logo are trademarks of BIXI Montréal. Trip data
          from BIXI Montréal open data; map data © OpenStreetMap contributors (ODbL); elevation from AWS Terrain Tiles.
        </p>
      </section>
    </footer>
  );
}
