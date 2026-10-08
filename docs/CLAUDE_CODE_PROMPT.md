# BIXI Story: build brief

## What this is
An unofficial, interactive dashboard of BIXI Montréal (bike share) open data, built as a portfolio piece. Its job is to show my design and engineering ability, so craft and UI quality matter more than feature count.

## What I want
- A 3D map of Montréal as the hero, with two data sections:
  1. **Live**: current station status from BIXI's GBFS feed. Stations flash when a bike leaves (count drops) or docks (count rises). GBFS has no trip feed, so never draw fake live trips.
  2. **History**: real trips from BIXI's yearly open-data zips, played back as a story. Press play and lines flash across the city from start station to end station, with a time scrubber.
- A few strong charts, not a chart grid: trips per hour, an hour-of-week heatmap, stations that lose or gain bikes.
- Story chapters (morning commute downhill, lunch, evening, night, where bikes pile up), with the sun position driven by the clock.
- Real vs. derived data clearly labeled. Unofficial; credit BIXI open data and OpenStreetMap.

## References
- `docs/bixi-story-mockup.html`: working mockup; open it in a browser. Use it as the design and interaction reference (dark neumorphic console, 3D diorama, modes Live / Flows / Rhythm / Stations, chapters). In the mockup, trips, rhythm and live pulses are simulated; production uses real data.
- Design inspiration (three.js, procedural geometry, ambient occlusion and bloom):
  - https://sael.net/token-town/
  - https://sael.net/apple-park/
- Data:
  - Yearly trip history zips: https://bixi.com/en/open-data/
  - Live GBFS feed: https://gbfs.velobixi.com/gbfs/2-2/gbfs.json
  - City geometry: OpenStreetMap (buildings, water, parks) via Overpass

## Stack and how it should work
- **Next.js on Vercel free tier.** No separate server.
- **Live:** a Next.js route handler proxies `station_status` and `station_information`, trims them, and caches about 30 s at the edge (`s-maxage` + `stale-while-revalidate`). The client polls and diffs snapshots to flash stations.
- **History:** a GitHub Actions job runs daily. It scrapes the open-data page for the latest year's zip (the filename changes as months are added) and, only when it changed, downloads it, aggregates trips into compact static files (flows by hour of week, per-station stats, sampled trips for playback), and publishes them (repo or Vercel Blob). Never process the zip inside Vercel functions.
- **Map:** three.js. City geometry prepared at build time from OpenStreetMap: detailed buildings in the core, simplified blocks elsewhere (levels of detail), shipped as compressed static assets.
- **Performance:** fast first load, adaptive quality, works on phones.

## Known facts
- GBFS 2.2 here has no trip feed and no free-floating bikes; about 1,100 stations; `station_status` is about 0.5 MB with a 10 s TTL.
- `cdn.bixi.com` (the zips) blocks browser requests, so downloads must happen in CI.
- Public Overpass servers get overloaded; fetch at build time with retries and mirrors.

Plan the architecture and implementation yourself. Ask me only about decisions that are mine to make.
