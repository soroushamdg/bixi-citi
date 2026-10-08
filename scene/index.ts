import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { EXZ, project } from "@/lib/geo";
import { surfaceAt, type Terrain } from "@/lib/formats/terrain";
import type { CityIndex } from "@/lib/formats/city";
import { data, ui, type Sel, type UIState } from "@/lib/store";
import { onLivePulse } from "@/lib/load";
import { montrealMs } from "@/lib/sun";
import { detectQuality, createGovernor } from "./quality";
import { createSky } from "./sky";
import { createTerrain, createWater, loadMaskTexture, loadTerrain, type Shared } from "./terrain";
import { createCity } from "./city";
import { createStations } from "./stations";
import { createCorridors, createTrips } from "./trips";
import { createPulses } from "./pulses";
import { createLabels } from "./labels";
import { createLandmarks } from "./landmarks";
import { createBridges } from "./bridges";
import { LANDMARKS } from "@/lib/landmarks";

/** [lat, lon, distance m, bearing the camera faces (° from true north), tilt from vertical °] */
export type View = [number, number, number, number, number];

export interface SceneHooks {
  onHover(sel: Sel | null, clientX: number, clientY: number): void;
  onSelect(sel: Sel | null): void;
  onBearing(deg: number): void;
}

const RAD = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export async function createScene(host: HTMLElement, canvas: HTMLCanvasElement, hooks: SceneHooks, home: View) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const q = detectQuality();
  const setLoad = (p: number, t?: string) => ui.setState(t ? { loadProgress: p, loadText: t } : { loadProgress: p });

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  let dpr = q.dpr;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 20, 400000);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.07, maxPolarAngle: 1.36, minDistance: 350, maxDistance: 52000,
    screenSpacePanning: false, zoomToCursor: true, rotateSpeed: 0.55, panSpeed: 0.9,
  });

  const sky = createSky(scene);
  sky.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);

  /* ---------- post ---------- */
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao: GTAOPass | null = null;
  if (q.ao) {
    try {
      gtao = new GTAOPass(scene, camera, 4, 4);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 60, distanceExponent: 1.5, thickness: 18, scale: 1, samples: 10, distanceFallOff: 1 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(gtao);
    } catch {
      gtao = null;
    }
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.6, 0.55, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- camera flights ---------- */
  let terrain: Terrain | null = null;
  const groundY = (x: number, y: number) => (terrain ? surfaceAt(terrain, x, y) * EXZ : 30);
  interface CamState { target: THREE.Vector3; r: number; theta: number; phi: number }
  const viewToCam = (v: View): CamState => {
    const [lat, lon, dist, bear, tilt] = v;
    const [x, y] = project(lat, lon);
    return { target: new THREE.Vector3(x, groundY(x, y), -y), r: dist, theta: (bear + 180) * RAD, phi: tilt * RAD };
  };
  const camState = (): CamState => {
    const off = camera.position.clone().sub(controls.target), r = off.length();
    return { target: controls.target.clone(), r, theta: Math.atan2(off.x, -off.z), phi: Math.acos(clamp(off.y / r, -1, 1)) };
  };
  const placeCam = (s: CamState) => {
    const sp = Math.sin(s.phi);
    camera.position.set(s.target.x + s.r * sp * Math.sin(s.theta), s.target.y + s.r * Math.cos(s.phi), s.target.z - s.r * sp * Math.cos(s.theta));
    controls.target.copy(s.target);
    camera.lookAt(s.target);
  };
  let flight: { a: CamState; b: CamState; t0: number; dur: number } | null = null;
  let idle = true;
  const flyState = (b: CamState, dur: number) => {
    const a = camState();
    let dt = b.theta - a.theta;
    dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    b.theta = a.theta + dt;
    if (reduced || !dur) { placeCam(b); flight = null; return; }
    flight = { a, b, t0: performance.now(), dur };
  };
  const stepFlight = (now: number) => {
    if (!flight) return;
    const k = clamp((now - flight.t0) / flight.dur, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const { a, b } = flight;
    const lift = Math.sin(Math.PI * e) * 0.18 * Math.min(1, a.target.distanceTo(b.target) / 3000);
    placeCam({
      target: a.target.clone().lerp(b.target, e),
      r: Math.exp(lerp(Math.log(a.r), Math.log(b.r), e)) * (1 + lift),
      theta: lerp(a.theta, b.theta, e),
      phi: lerp(a.phi, b.phi, e) - lift * 0.3,
    });
    if (k >= 1) flight = null;
  };
  controls.addEventListener("start", () => { flight = null; idle = false; controls.autoRotate = false; });
  placeCam(viewToCam(home));

  /* ---------- sizing ---------- */
  let W = 1, H = 1;
  const resize = () => {
    const r = host.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width));
    H = Math.max(2, Math.round(r.height));
    renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  /* ---------- content ---------- */
  setLoad(0.04, "Reading the river");
  const index = (await (await fetch("/city/index.json")).json()) as CityIndex;
  const [t, mask, bikes] = await Promise.all([
    loadTerrain(index),
    loadMaskTexture(`/city/${index.mask.file}`, renderer),
    loadMaskTexture(`/city/${index.mask.bikes}`, renderer),
  ]);
  terrain = t;
  const mpp = index.mask.m ?? 10;
  const shared: Shared = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uHorizon: { value: new THREE.Color() },
    uMask: { value: mask },
    uBikes: { value: bikes },
    uMaskRect: { value: new THREE.Vector4(index.bounds.x0, index.bounds.y1 - index.mask.height * mpp, index.mask.width * mpp, index.mask.height * mpp) },
    uLed: { value: new THREE.Color("#f3dcb0") },
    uCycleGlow: { value: 0.7 },
  };
  setLoad(0.2, "Shaping the island");
  const ground = createTerrain(terrain, shared, q);
  scene.add(ground.group);
  scene.add(createWater(terrain, shared));
  placeCam(viewToCam(home));

  const stations = createStations(scene);
  const trips = createTrips(scene);
  // Years: sampled rides on a year-long timeline (minutes since 1 January); each arc flashes for ~0.4 day
  const YEAR_ARC = 600;
  const yearTrips = createTrips(scene, { trail: 0.5, ring: 140, bucket: 1440 * 7 });
  const corridors = createCorridors(scene);
  const pulses = createPulses(scene, reduced);
  const landmarks = createLandmarks(scene, terrain, shared);
  const bridges = await createBridges(scene, terrain, shared.uNight).catch((e) => { console.error("bridges", e); return null; });
  const labels = createLabels(
    host,
    terrain,
    [
      ...landmarks.placed.map((p) => ({ text: p.l.name, pos: new THREE.Vector3(p.pos.x, p.top + 14, p.pos.z), min: 0, max: 5200, cls: "landmark" })),
      ...(bridges?.views ?? []).map((v) => ({ text: v.name, pos: new THREE.Vector3(v.x, v.deck + 60, -v.y), min: 0, max: 9000, cls: "landmark" })),
    ],
  );

  // wire data as it arrives (live and history load independently)
  const addedChunks = new Set<number>();
  let yearKey = "";
  const syncData = () => {
    const d = data.getState();
    const yk = `${d.yearSummary?.year ?? 0}|${d.yearStations?.name.length ?? 0}|${d.yearDays ? d.yearDays.firstDoy : -1}|${d.yearSample?.count ?? 0}`;
    if (yk !== yearKey) {
      yearKey = yk;
      stations.setYear(d, terrain!);
      yearTrips.clear();
      if (d.yearStations && d.yearSample) {
        const S = d.yearSample;
        const start = new Float32Array(S.count), dur = new Float32Array(S.count).fill(YEAR_ARC);
        for (let k = 0; k < S.count; k++) start[k] = S.doy[k] * 1440 + S.minute[k];
        yearTrips.addTrips({ start, dur, from: S.from, to: S.to }, stations.year);
      }
    }
    if (d.info && stations.live.n !== d.info.ids.length) stations.setLive(d, terrain!);
    if (d.hist && stations.hist.n !== d.hist.name.length) {
      stations.setHistory(d, terrain!);
      trips.clear();
      addedChunks.clear();
    }
    if (d.hist && stations.hist.n)
      d.day.forEach((chunk, k) => {
        if (chunk && !addedChunks.has(k)) { addedChunks.add(k); trips.addChunk(chunk, stations); }
      });
  };
  syncData();
  const unsubData = data.subscribe(syncData);
  // capture mode (video/): a virtual clock and an optional pinned sun
  let manual = false, virtualNow = 0, sunOverride: number | null = null;
  // pulses share the render clock, so they stay in step when the showreel drives time
  const clock = () => (manual ? virtualNow : performance.now());
  const unsubPulse = onLivePulse((p) => {
    if (ui.getState().mode === "live") pulses.add(p.index, p.kind === "dock", p.n, p.truck, clock() / 1000);
  });

  setLoad(0.35, "Raising the city");
  const city = await createCity(scene, index, shared, q);
  setLoad(1, "Ready");
  ui.setState({ sceneStatus: "ready" });

  /* ---------- picking ---------- */
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
    down = null;
    if (moved > 5) return;
    const r = canvas.getBoundingClientRect();
    hooks.onSelect(stations.pick(camera, W, H, e.clientX - r.left, e.clientY - r.top, ui.getState().mode, 18));
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons) { hooks.onHover(null, 0, 0); return; }
    const r = canvas.getBoundingClientRect();
    hooks.onHover(stations.pick(camera, W, H, e.clientX - r.left, e.clientY - r.top, ui.getState().mode), e.clientX, e.clientY);
  };
  const onLeave = () => hooks.onHover(null, 0, 0);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  /* ---------- quality governor ---------- */
  const governor = createGovernor((step) => {
    if (step === 1 && gtao) gtao.enabled = false;
    else if (step === 2) { dpr = Math.max(1, dpr * 0.75); renderer.setPixelRatio(dpr); resize(); }
    else if (step === 3) city.setBudget(Math.max(8, Math.round(q.tileBudget * 0.5)));
    else if (step === 4) { renderer.shadowMap.enabled = false; }
  });

  /* ---------- loop ---------- */
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);
  let raf = 0, last = performance.now(), lastBearing = NaN;
  let storyDate = data.getState().meta?.storyDay.date ?? "2026-08-06";
  const focus = new THREE.Vector3();

  const sunMs = (s: UIState) => {
    storyDate = data.getState().meta?.storyDay.date ?? storyDate;
    if (s.mode === "live") return Date.now();
    if (s.mode === "stations") return montrealMs(storyDate, 1118);
    if (s.mode === "years" && s.year) {
      // the evening rush of the day under the cursor: long June light, dark November
      const d = new Date(Date.UTC(s.year, 0, 1) + Math.floor(s.yday) * 86400_000).toISOString().slice(0, 10);
      return montrealMs(d, 17 * 60 + 30);
    }
    return montrealMs(storyDate, s.minute);
  };

  /**
   * One frame. `now` drives animation (ms); in capture mode it is a virtual clock
   * so recorded footage is frame-exact, while tile streaming keeps real time.
   */
  const render = (now: number, dtMs: number, realNow: number) => {
    const s = ui.getState(), d = data.getState();
    virtualNow = now;
    if (!manual) {
      stepFlight(now);
      controls.autoRotate = idle && s.chapter < 0 && !reduced && !s.playing;
      controls.autoRotateSpeed = 0.22;
      controls.update();
    }
    const camDist = camera.position.distanceTo(controls.target);
    const near = clamp(camDist / 250, 5, 120);
    if (Math.abs(camera.near - near) > near * 0.2) { camera.near = near; camera.updateProjectionMatrix(); }

    focus.copy(controls.target);
    sky.apply(sunOverride ?? sunMs(s), focus, camDist * 0.9);
    shared.uTime.value = now / 1000;
    shared.uNight.value = sky.nightGlow();
    shared.uHorizon.value.copy(sky.horizon);
    renderer.toneMappingExposure = sky.exposure();
    const bl = sky.bloom();
    bloom.strength = bl.strength;
    bloom.threshold = bl.threshold;
    bloom.radius = 0.35;
    sky.sky.position.copy(camera.position);

    stations.update(s, d, camDist, dtMs / 1000);
    trips.update(s.minute, s.mode === "flows", camDist);
    yearTrips.update(s.yday * 1440, s.mode === "years", camDist);
    if (s.mode === "rhythm" && d.flows) corridors.set(d.flows, s.day * 24 + Math.floor(s.minute / 60), stations);
    corridors.update(s.mode === "rhythm", now / 1000, camDist);
    pulses.update(now / 1000, stations, camDist);
    landmarks.update(now / 1000, shared.uNight.value);
    bridges?.update(now / 1000);
    city.update(camera, controls.target, realNow);
    labels.update(camera, W, H, camDist);

    const off = camera.position.clone().sub(controls.target);
    const bearing = Math.atan2(-off.x, off.z) / RAD;
    if (Math.abs(bearing - lastBearing) > 0.2) { lastBearing = bearing; hooks.onBearing(bearing); }

    composer.render();
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (manual || !visible || document.hidden) { last = now; return; }
    const dtMs = Math.min(100, now - last);
    last = now;
    render(now, dtMs, now);
    governor(dtMs);
  };
  raf = requestAnimationFrame(frame);

  return {
    flyTo(v: View, ms = 1800) { flyState(viewToCam(v), ms); idle = false; },
    /** fly to a landmark, looking at its front */
    flyToLandmark(key: string, distance = 1, side = 25, tilt = 62) {
      const l = LANDMARKS.find((x) => x.key === key);
      if (!l) return;
      const st = viewToCam([l.lat, l.lon, (l.view ?? Math.max(500, Math.max(l.L, l.H) * 6)) * distance, (l.axis + 180 + side) % 360, tilt]);
      // aim a little above the base, and nudge the subject right of the caption card
      const look = (l.axis + 180 + side) * RAD, right = new THREE.Vector3(Math.cos(look), 0, Math.sin(look));
      st.target.y += l.H * 0.35;
      st.target.addScaledVector(right, -st.r * 0.14);
      flyState(st, 2000);
      idle = false;
    },
    /** fly alongside a famous bridge, looking across its main span */
    flyToBridge(name: string) {
      const v = bridges?.views.find((b) => b.name === name);
      if (!v) return;
      const st = camState();
      st.target = new THREE.Vector3(v.x, v.deck, -v.y);
      st.r = 1300;
      st.theta = ((v.along / RAD + 90 + 180) % 360) * RAD;
      st.phi = 66 * RAD;
      flyState(st, 2200);
      idle = false;
    },
    get bridgeViews() { return bridges?.views ?? []; },
    zoom(f: number) { const st = camState(); st.r = clamp(st.r * f, controls.minDistance, controls.maxDistance); flyState(st, 600); },
    setBearing(b: number) { const st = camState(); st.theta = (b + 180) * RAD; flyState(st, 1200); },
    focus(sel: Sel) {
      const st = camState();
      st.target = stations.foot(sel.set, sel.i);
      st.r = Math.min(st.r, 2400);
      st.phi = Math.min(st.phi, 62 * RAD);
      flyState(st, 1300);
      idle = false;
    },
    get quality() { return q; },
    /**
     * Frame-exact capture for the showreel (video/): stop the live loop, then
     * render any moment from any camera on demand.
     */
    capture: {
      begin(pixelRatio = 1) { manual = true; dpr = pixelRatio; renderer.setPixelRatio(dpr); resize(); },
      end() { manual = false; sunOverride = null; },
      /** pin the sun to a moment (epoch ms), or null to follow the mode again */
      sun(ms: number | null) { sunOverride = ms; },
      frame(tSec: number, view: View, lift = 0, dtMs = 1000 / 60) {
        const st = viewToCam(view);
        st.target.y += lift;
        placeCam(st);
        render(tSec * 1000, dtMs, performance.now());
      },
      /** detail tiles still loading or growing in (wait for false before saving a frame) */
      get busy() { return city.stats.pending + city.stats.growing > 0; },
      replan() { city.replan(); },
      budget(n: number) { city.setBudget(n); },
    },
    /** dev: raw access for debugging */
    get debug() { return { scene, camera, renderer, sky }; },
    /** dev: toggle post passes */
    post(opts: { ao?: boolean; bloom?: boolean }) {
      if (gtao && opts.ao !== undefined) gtao.enabled = opts.ao;
      if (opts.bloom !== undefined) bloom.enabled = opts.bloom;
    },
    get stats() { return city.stats; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      unsubData();
      unsubPulse();
      city.dispose();
      labels.dispose();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      renderer.dispose();
    },
  };
}
export type SceneHandle = Awaited<ReturnType<typeof createScene>>;
