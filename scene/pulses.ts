import * as THREE from "three";
import { COL } from "./stations";
import type { Stations } from "./stations";

/**
 * Live mode: a ring and a glow where a real bike left (amber) or docked (teal)
 * between two GBFS snapshots. Trucks get a bigger, slower ring.
 */
const MAX = 600;

interface Pulse { i: number; t0: number; life: number; r: number; dock: boolean; n: number }

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.25, "rgba(255,255,255,.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createPulses(scene: THREE.Scene, reduced: boolean) {
  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2), ringMat, MAX);
  const blobs = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    MAX,
  );
  for (const m of [rings, blobs]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 6;
    m.setColorAt(0, COL.outGlow);
    scene.add(m);
  }
  const list: Pulse[] = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();

  function add(i: number, dock: boolean, n: number, truck: boolean, t: number) {
    list.push({ i, t0: t, life: truck ? 4.2 : 2.6, r: truck ? 260 : 170, dock, n });
    if (list.length > MAX) list.shift();
  }

  function update(t: number, stations: Stations, camDist: number) {
    const zs = Math.min(2.6, Math.max(0.45, camDist / 9000));
    const L = stations.live;
    let n = 0;
    for (let k = list.length - 1; k >= 0; k--) if (t - list[k].t0 > list[k].life) list.splice(k, 1);
    for (const p of list) {
      if (p.i >= L.n || n >= MAX) continue;
      const e0 = (t - p.t0) / p.life, e = reduced ? 0.5 : 1 - Math.pow(1 - e0, 3), a = 1 - e0;
      const col = p.dock ? COL.inGlow : COL.outGlow;
      M.compose(V.set(L.x[p.i], L.g[p.i] + 4, L.z[p.i]), Q, S.setScalar((20 + p.r * e) * zs));
      rings.setMatrixAt(n, M);
      rings.setColorAt(n, C.copy(col).multiplyScalar(2.2 * a));
      M.compose(V.set(L.x[p.i], L.g[p.i] + L.hc[p.i] + 6, L.z[p.i]), Q, S.setScalar(70 * zs * (1 - e0 * 0.5) * Math.min(2, 1 + (p.n - 1) * 0.15)));
      blobs.setMatrixAt(n, M);
      blobs.setColorAt(n, C.copy(col).multiplyScalar(2.6 * a));
      n++;
    }
    rings.count = blobs.count = n;
    if (n) {
      rings.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;
      rings.instanceColor!.needsUpdate = blobs.instanceColor!.needsUpdate = true;
    }
  }

  return { add, update, clear: () => (list.length = 0) };
}
