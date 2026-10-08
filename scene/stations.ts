import * as THREE from "three";
import { EXZ, project } from "@/lib/geo";
import { groundAt, type Terrain } from "@/lib/formats/terrain";
import type { DataState, Mode, StationSet, UIState } from "@/lib/store";

export const COL = {
  outGlow: new THREE.Color("#ff9d6c"),
  inGlow: new THREE.Color("#6fd8ef"),
  out: new THREE.Color("#E0703F"),
  in: new THREE.Color("#2A9CB8"),
  neutral: new THREE.Color("#c9d2e3"),
  led: new THREE.Color("#f3dcb0"),
};
export const RAMP = ["#2b2624", "#4a2f24", "#6b3a26", "#8f4628", "#b5552c", "#d96836", "#f08a58", "#ffb38a"].map((c) => new THREE.Color(c));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** One set of station pillars (live GBFS network or trip-history stations). */
class PillarSet {
  n = 0;
  x = new Float32Array(0);
  z = new Float32Array(0);
  g = new Float32Array(0);
  hc = new Float32Array(0);
  ht = new Float32Array(0);
  pillars: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  colorKey = "";
  constructor(private parent: THREE.Object3D, max: number) {
    const pg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false).translate(0, 0.5, 0);
    this.pillars = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ toneMapped: false }), max);
    this.caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), max);
    for (const m of [this.pillars, this.caps]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, COL.neutral);
      parent.add(m);
    }
  }
  setPositions(lat: ArrayLike<number>, lon: ArrayLike<number>, terrain: Terrain) {
    const n = lat.length;
    this.n = n;
    this.x = new Float32Array(n); this.z = new Float32Array(n); this.g = new Float32Array(n);
    this.hc = new Float32Array(n); this.ht = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y] = project(lat[i], lon[i]);
      this.x[i] = x; this.z[i] = -y;
      this.g[i] = groundAt(terrain, x, y) * EXZ + 0.5;
    }
    this.pillars.count = this.caps.count = n;
    this.colorKey = "";
  }
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), tc = new THREE.Color();

export function createStations(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "stations";
  scene.add(group);
  const live = new PillarSet(group, 1600);
  const hist = new PillarSet(group, 2400);
  const year = new PillarSet(group, 2400);
  const setOf = (k: StationSet) => (k === "live" ? live : k === "hist" ? hist : year);
  /** Years mode: the 98th-percentile departures of one station-day, for scaling */
  let yearDepMax = 1;
  let radius = 10;

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf3dcb0, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  halo.visible = false;
  scene.add(halo);

  /** maximum |net| worth showing at full height (95th percentile) */
  let netMax = 1;
  /** max average departures per weekday hour, per hour */
  const depMax = new Float32Array(24).fill(1);

  function setHistory(d: DataState, terrain: Terrain) {
    if (!d.hist) return;
    hist.setPositions(d.hist.lat, d.hist.lon, terrain);
    const abs = d.hist.net.map(Math.abs).sort((a, b) => a - b);
    netMax = abs[Math.floor(abs.length * 0.95)] || 1;
    for (let h = 0; h < 24; h++) {
      let m = 0;
      for (let i = 0; i < hist.n; i++) m = Math.max(m, d.hist.depWd[i * 24 + h], d.hist.depWe[i * 24 + h]);
      depMax[h] = m || 1;
    }
  }
  function setYear(d: DataState, terrain: Terrain) {
    const s = d.yearSummary;
    if (!s) { year.n = 0; year.pillars.count = year.caps.count = 0; return; }
    year.setPositions(s.stations.lat, s.stations.lon, terrain);
    if (d.yearDays) {
      const v = Array.from(d.yearDays.dep).filter((x) => x > 0).sort((a, b) => a - b);
      yearDepMax = v[Math.floor(v.length * 0.98)] || 1;
    }
  }
  function setLive(d: DataState, terrain: Terrain) {
    if (d.info) live.setPositions(d.info.lat, d.info.lon, terrain);
  }

  function targets(ui: UIState, d: DataState) {
    const m: Mode = ui.mode;
    const hour = Math.floor(ui.minute / 60) % 24;
    const weekend = ui.day >= 5;
    for (let i = 0; i < live.n; i++) live.ht[i] = m === "live" && d.bikes[i] >= 0 ? 24 + d.bikes[i] * 7.5 : 0;
    const Y = d.yearDays;
    // Years: that day's departures, blended with the next day so the fast-forward flows
    const fd = Y ? ui.yday - Y.firstDoy : 0;
    const d0 = Y ? Math.max(0, Math.min(Y.days - 1, Math.floor(fd))) : 0, d1 = Y ? Math.min(Y.days - 1, d0 + 1) : 0, f = fd - Math.floor(fd);
    for (let i = 0; i < year.n; i++) {
      if (m !== "years" || !Y || i >= Y.stations) { year.ht[i] = 0; continue; }
      const dep = Y.dep[d0 * Y.stations + i] * (1 - f) + Y.dep[d1 * Y.stations + i] * f;
      year.ht[i] = dep > 0 ? 8 + 380 * Math.sqrt(Math.min(1.4, dep / yearDepMax)) : 0;
    }
    if (m === "years" && Y) {
      // colour by that day's balance: amber stations lost bikes, teal ones gained
      const key = `y|${ui.year}|${d0}`;
      if (key !== year.colorKey) {
        year.colorKey = key;
        for (let i = 0; i < Math.min(year.n, Y.stations); i++) {
          const k = d0 * Y.stations + i, dep = Y.dep[k], arr = Y.arr[k];
          const v = clamp((arr - dep) / Math.max(6, (arr + dep) * 0.5), -1, 1), av = Math.abs(v);
          if (av < 0.12) tc.copy(COL.neutral).multiplyScalar(0.55);
          else tc.copy(v < 0 ? COL.out : COL.in).lerp(v < 0 ? COL.outGlow : COL.inGlow, av * 0.5).multiplyScalar(0.6 + 0.6 * av);
          year.pillars.setColorAt(i, tc);
          year.caps.setColorAt(i, tc.multiplyScalar(1.3));
        }
        year.pillars.instanceColor!.needsUpdate = year.caps.instanceColor!.needsUpdate = true;
      }
    }
    const H = d.hist;
    for (let i = 0; i < hist.n; i++) {
      if (!H || m === "live" || m === "years") hist.ht[i] = 0;
      else if (m === "flows") hist.ht[i] = 6;
      else if (m === "rhythm") {
        const dep = (weekend ? H.depWe : H.depWd)[i * 24 + hour];
        hist.ht[i] = 10 + 460 * Math.sqrt(dep / depMax[hour]);
      } else hist.ht[i] = 12 + 330 * Math.sqrt(Math.min(1, Math.abs(H.net[i]) / netMax));
    }
    // colours only when something they depend on changed
    const lkey = `${m}|${d.status?.t ?? 0}`;
    if (lkey !== live.colorKey && m === "live") {
      live.colorKey = lkey;
      for (let i = 0; i < live.n; i++) {
        const b = d.bikes[i], k = d.docks[i], cap = d.info?.cap[i] ?? 1;
        if (b === 0) tc.copy(COL.outGlow).multiplyScalar(1.6);
        else if (k === 0) tc.copy(COL.inGlow).multiplyScalar(1.6);
        else tc.copy(COL.neutral).multiplyScalar(0.55 + 0.9 * Math.max(0, b) / Math.max(1, cap));
        live.pillars.setColorAt(i, tc);
        live.caps.setColorAt(i, tc.multiplyScalar(1.3));
      }
      live.pillars.instanceColor!.needsUpdate = live.caps.instanceColor!.needsUpdate = true;
    }
    const hkey = `${m}|${m === "rhythm" ? `${hour}|${weekend}` : ""}|${H ? 1 : 0}`;
    if (hkey !== hist.colorKey && H && m !== "live") {
      hist.colorKey = hkey;
      for (let i = 0; i < hist.n; i++) {
        if (m === "flows") tc.copy(COL.neutral).multiplyScalar(0.5);
        else if (m === "rhythm") {
          const a = Math.sqrt((weekend ? H.depWe : H.depWd)[i * 24 + hour] / depMax[hour]);
          tc.copy(RAMP[Math.min(7, Math.floor(a * 8))]).multiplyScalar(0.8 + 0.8 * a);
        } else {
          const v = clamp(H.net[i] / netMax, -1, 1), av = Math.abs(v);
          if (av < 0.06) tc.copy(COL.neutral).multiplyScalar(0.3);
          else tc.copy(v < 0 ? COL.out : COL.in).lerp(v < 0 ? COL.outGlow : COL.inGlow, av * 0.6).multiplyScalar(0.5 + 0.75 * av);
        }
        hist.pillars.setColorAt(i, tc);
        hist.caps.setColorAt(i, tc.multiplyScalar(1.3));
      }
      hist.pillars.instanceColor!.needsUpdate = hist.caps.instanceColor!.needsUpdate = true;
    }
  }

  function updateSet(s: PillarSet, k: number) {
    let any = false;
    for (let i = 0; i < s.n; i++) {
      s.hc[i] += (s.ht[i] - s.hc[i]) * k;
      const h = s.hc[i];
      const r = h < 0.5 ? 0 : radius;
      if (h >= 0.5) any = true;
      M4.compose(V.set(s.x[i], s.g[i], s.z[i]), Q, SC.set(r, Math.max(h, 0.01), r));
      s.pillars.setMatrixAt(i, M4);
      M4.compose(V.set(s.x[i], s.g[i] + h, s.z[i]), Q, SC.setScalar(r * 1.18));
      s.caps.setMatrixAt(i, M4);
    }
    s.pillars.visible = s.caps.visible = any;
    s.pillars.instanceMatrix.needsUpdate = s.caps.instanceMatrix.needsUpdate = true;
  }

  function update(ui: UIState, d: DataState, camDist: number, dt: number) {
    radius = clamp(camDist * 0.00115, 5, 48);
    targets(ui, d);
    const k = 1 - Math.pow(0.0035, dt);
    updateSet(live, k);
    updateSet(hist, k);
    updateSet(year, ui.mode === "years" && ui.playing ? 1 - Math.pow(0.0001, dt) : k);
    const sel = ui.selected ?? ui.hover;
    if (sel) {
      const s = setOf(sel.set);
      if (sel.i < s.n) {
        halo.visible = true;
        halo.position.set(s.x[sel.i], s.g[sel.i] + 3, s.z[sel.i]);
        halo.scale.setScalar(radius * 5 + 20);
        (halo.material as THREE.MeshBasicMaterial).color.set(ui.selected ? 0xf3dcb0 : 0xe9ebf1);
      } else halo.visible = false;
    } else halo.visible = false;
  }

  /** Screen-space picking: nearest pillar top or middle within `max` px. */
  const PV = new THREE.Vector3();
  function pick(camera: THREE.Camera, W: number, H: number, px: number, py: number, mode: Mode, max = 16): { set: StationSet; i: number } | null {
    const set: StationSet = mode === "live" ? "live" : mode === "years" ? "year" : "hist";
    const s = setOf(set);
    let best = -1, bd = max * max;
    for (let i = 0; i < s.n; i++) {
      if (s.hc[i] < 0.5) continue;
      for (const f of [1, 0.35]) {
        PV.set(s.x[i], s.g[i] + s.hc[i] * f, s.z[i]).project(camera);
        if (PV.z > 1) continue;
        const sx = ((PV.x + 1) / 2) * W, sy = ((1 - PV.y) / 2) * H;
        const dd = (sx - px) ** 2 + (sy - py) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
    }
    return best >= 0 ? { set, i: best } : null;
  }

  return {
    group,
    live,
    hist,
    year,
    setHistory,
    setLive,
    setYear,
    update,
    pick,
    /** world position of a station foot (scene coords) */
    foot(set: StationSet, i: number) {
      const s = setOf(set);
      return new THREE.Vector3(s.x[i], s.g[i], s.z[i]);
    },
    height(set: StationSet, i: number) {
      return setOf(set).hc[i];
    },
    get radius() { return radius; },
  };
}
export type Stations = ReturnType<typeof createStations>;
