# BIXI Story — showreel

`bixi-story-showreel.mp4` is a 30-second, 1080p60 motion piece introducing the project (H.264 at 12 Mbit/s with AAC audio). Rendering also writes `bixi-story-showreel-master.mp4`, a higher-quality copy that is not committed. Everything in it is made from the project itself:

- **3D footage** is the real app, rendered frame by frame through a capture hook in the scene (`scene/index.ts`, `capture`). The camera, clock and sun are scripted, and the trips, stations and lights are whatever the app draws for that moment.
- **Numbers and charts** come from the app's real data (GBFS snapshot, the story day, 13 seasons of trips), exported by `ui.mjs`.
- **Interface shots** are screenshots of the console, dark and light.
- **Soundtrack** is synthesised in `audio.mjs` (no samples), with every hit placed on a cut.

## Rebuild

With the dev server running (`npm run dev`) and the Playwright browser in `.cache/playwright`:

```sh
export PLAYWRIGHT_BROWSERS_PATH=.cache/playwright
node video/capture.mjs     # 3D footage → video/build/footage (≈ 6 min, ~1.6 GB)
node video/ui.mjs          # UI screenshots → video/build/ui, real numbers → video/comp/data.js
node video/audio.mjs       # soundtrack → video/build/audio.wav
node video/render.mjs      # composition → video/bixi-story-showreel.mp4 (≈ 12 min)
```

- `node video/capture.mjs --preview --only city,live` saves three stills per shot.
- `node video/render.mjs --stills 3.6,7.2` renders single frames of the composition.

| File | Role |
| --- | --- |
| `shots.mjs` | the 3D shots: camera keys, time of day, mode |
| `reel-runtime.js` | runs in the app page and drives the scene frame by frame |
| `comp/` | the composition (HTML/CSS/JS). `seek(t)` draws any frame on its own. |
| `render.mjs` | renders the composition in parallel and encodes it with ffmpeg |

`video/build/` holds the intermediates and is not committed.
