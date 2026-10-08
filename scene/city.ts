import * as THREE from "three";
import { BUILDING_EX, EXZ, GRID_BEARING, project } from "@/lib/geo";
import { decodeBlocks, type CityIndex } from "@/lib/formats/city";
import { fetchGz } from "@/lib/load";
import { HASH } from "./glsl";
import type { Quality } from "./quality";
import type { Shared } from "./terrain";
import type { TileGeometry } from "./city.worker";

const [DTX, DTY] = project(45.503, -73.569); // downtown, where the city rises first

/** Night windows: lit panes on walls, density per building, flicker-free. */
const WINDOWS = /* glsl */ `
  vec3 wn = normalize((vec4(normal, 0.) * viewMatrix).xyz);
  if (wn.y < .5 && uNight > .01) {
    float fl = vPosW.y / 3.4;
    float cc = (abs(wn.x) > abs(wn.z) ? vPosW.z : vPosW.x) / 2.7;
    float fy = fract(fl), fx = fract(cc);
    float w = step(.38, fy) * step(fy, .82) * step(.22, fx) * step(fx, .78);
    float r = h21(floor(vec2(fl, cc)) + floor(vWin * 97.));
    float lit = step(1. - vWin, r);
    totalEmissiveRadiance += vec3(1., .66, .36) * w * lit * uNight * 1.25;
  }`;

function detailMaterial(shared: Shared, grow: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uGrow = grow;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aB;uniform float uGrow;varying vec3 vPosW;varying float vWin;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float gg = clamp((uGrow * 1.6 - aB.y * .6), 0., 1.);
        gg = 1. - pow(1. - gg, 3.);
        transformed.y = aB.x + (transformed.y - aB.x) * max(gg, .002);
        vPosW = transformed; vWin = aB.z;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uNight;varying vec3 vPosW;varying float vWin;${HASH}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${WINDOWS}`);
  };
  m.customProgramCacheKey = () => "bixi-building";
  return m;
}

function blockMaterial(shared: Shared, grow: { value: number }, hidden: THREE.DataTexture) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uGrow = grow;
    sh.uniforms.uHidden = { value: hidden };
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aTile;attribute float aWin;uniform float uGrow;uniform sampler2D uHidden;varying vec3 vPosW;varying float vWin;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        float dd = clamp(length(wp0.xz - vec2(${DTX.toFixed(1)}, ${(-DTY).toFixed(1)})) / 22000., 0., 1.);
        float gg = clamp((uGrow * 1.7 - dd * .7) / .7, 0., 1.);
        gg = 1. - pow(1. - gg, 3.);
        int ti = int(aTile + .5);
        float hide = texelFetch(uHidden, ivec2(ti % 64, ti / 64), 0).r;
        transformed.y *= max(gg * (1. - hide), .001);
        if (hide > .99) transformed *= 0.;
        vWin = aWin;`,
      )
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvPosW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uNight;varying vec3 vPosW;varying float vWin;${HASH}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${WINDOWS}`);
  };
  return m;
}

interface Resident {
  mesh: THREE.Mesh;
  grow: { value: number };
  born: number;
  lastWanted: number;
}

export async function createCity(scene: THREE.Scene, index: CityIndex, shared: Shared, q: Quality) {
  const group = new THREE.Group();
  group.name = "city";
  scene.add(group);

  /* ---------- far LOD: blocks ---------- */
  const T = index.tiles.length;
  const hiddenData = new Uint8Array(64 * Math.max(1, Math.ceil(T / 64)));
  const hidden = new THREE.DataTexture(hiddenData, 64, Math.max(1, Math.ceil(T / 64)), THREE.RedFormat, THREE.UnsignedByteType);
  hidden.needsUpdate = true;
  const globalGrow = { value: 0 };

  const b = decodeBlocks(await fetchGz(`/city/${index.blocks.file}`));
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // no bottom face
  box.setIndex(Array.from(box.getIndex()!.array).filter((_, i) => Math.floor(i / 6) !== 3));
  const aTile = new Float32Array(b.count), aWin = new Float32Array(b.count);
  const blocks = new THREE.InstancedMesh(box, blockMaterial(shared, globalGrow, hidden), b.count);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -((GRID_BEARING - 360) * Math.PI) / 180);
  const P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  const low = new THREE.Color("#c2b8aa"), low2 = new THREE.Color("#b1a798"), mid = new THREE.Color("#ada9a3"), tow = new THREE.Color("#94a0ae");
  for (let i = 0; i < b.count; i++) {
    const h = b.height[i] * BUILDING_EX;
    P.set(b.x[i], b.base[i] * EXZ - 1.5, -b.y[i]);
    S.set(b.size[i], h + 1.5, b.size[i]);
    M.compose(P, Q, S);
    blocks.setMatrixAt(i, M);
    const r = Math.abs(Math.sin(b.x[i] * 12.9898 + b.y[i] * 78.233) * 43758.5453) % 1;
    if (b.height[i] > 40) C.copy(tow).offsetHSL(0, 0, (r - 0.5) * 0.06);
    else if (b.height[i] > 14) C.copy(mid).lerp(low2, r * 0.6);
    else C.copy(low).lerp(low2, r);
    blocks.setColorAt(i, C);
    aTile[i] = b.tile[i];
    aWin[i] = b.height[i] > 40 ? 0.5 + 0.4 * r : 0.18 + 0.5 * r;
  }
  box.setAttribute("aTile", new THREE.InstancedBufferAttribute(aTile, 1));
  box.setAttribute("aWin", new THREE.InstancedBufferAttribute(aWin, 1));
  blocks.instanceMatrix.needsUpdate = true;
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  blocks.frustumCulled = false;
  group.add(blocks);

  /* ---------- near LOD: detailed tiles, built in workers ---------- */
  const nWorkers = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
  const workers = Array.from({ length: nWorkers }, () => new Worker(new URL("./city.worker.ts", import.meta.url), { type: "module" }));
  const idle = [...workers];
  const queue: number[] = [];
  const pending = new Set<number>();
  const resident = new Map<number, Resident>();
  const tileKey = (i: number) => `${index.tiles[i].u}_${index.tiles[i].v}`;
  const keyToIdx = new Map(index.tiles.map((t, i) => [`${t.u}_${t.v}`, i]));
  const stats = { resident: 0, triangles: 0 };

  const onDone = (w: Worker) => (e: MessageEvent<TileGeometry & { error?: string }>) => {
    idle.push(w);
    const i = keyToIdx.get(e.data.key)!;
    pending.delete(i);
    pump();
    if (e.data.error || disposed) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(e.data.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(e.data.normal, 3, true));
    g.setAttribute("color", new THREE.BufferAttribute(e.data.color, 3, true));
    g.setAttribute("aB", new THREE.BufferAttribute(e.data.aB, 3));
    g.setIndex(new THREE.BufferAttribute(e.data.index, 1));
    g.computeBoundingSphere();
    const grow = { value: 0 };
    const mesh = new THREE.Mesh(g, detailMaterial(shared, grow));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    resident.set(i, { mesh, grow, born: performance.now(), lastWanted: performance.now() });
    stats.triangles += e.data.index.length / 3;
  };
  workers.forEach((w) => (w.onmessage = onDone(w)));

  function pump() {
    while (idle.length && queue.length) {
      const i = queue.shift()!;
      if (resident.has(i) || pending.has(i)) continue;
      pending.add(i);
      idle.pop()!.postMessage({ url: `/city/tiles/${tileKey(i)}.bin.gz`, key: tileKey(i) });
    }
  }

  const frustum = new THREE.Frustum(), PM = new THREE.Matrix4(), sphere = new THREE.Sphere(), center = new THREE.Vector3();
  let lastPlan = 0, budget = q.tileBudget, disposed = false;

  /** Decide which tiles deserve detail: near the camera, in view, or tall (the skyline). */
  function plan(camera: THREE.PerspectiveCamera, target: THREE.Vector3, now: number) {
    PM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(PM);
    const camDist = camera.position.distanceTo(target);
    const range = Math.max(2600, camDist * q.detailRange);
    const scored: Array<[number, number]> = [];
    for (let i = 0; i < T; i++) {
      const t = index.tiles[i];
      center.set(t.x, target.y, -t.y);
      const dTarget = Math.hypot(t.x - target.x, -t.y - target.z);
      const dCam = camera.position.distanceTo(center);
      sphere.set(center, 760 + t.maxH * 2);
      const inView = frustum.intersectsSphere(sphere);
      if (!inView && dTarget > 1400) continue;
      // towers stay detailed from further away
      const reach = range * (t.maxH > 80 ? 2.2 : t.maxH > 35 ? 1.4 : 1);
      if (dTarget > reach && dCam > reach) continue;
      scored.push([i, Math.min(dTarget, dCam) / (t.maxH > 80 ? 2.2 : 1)]);
    }
    scored.sort((a, b) => a[1] - b[1]);
    const wanted = new Set(scored.slice(0, budget).map(([i]) => i));
    queue.length = 0;
    for (const [i] of scored.slice(0, budget)) if (!resident.has(i) && !pending.has(i)) queue.push(i);
    pump();
    for (const [i, r] of resident) {
      if (wanted.has(i)) r.lastWanted = now;
      else if (now - r.lastWanted > 4000) {
        group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        stats.triangles -= (r.mesh.geometry.index?.count ?? 0) / 3;
        resident.delete(i);
        hiddenData[i] = 0;
        hidden.needsUpdate = true;
      }
    }
    stats.resident = resident.size;
  }

  let cityGrowStart = -1;
  function update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, now: number) {
    if (cityGrowStart < 0) cityGrowStart = now;
    globalGrow.value = Math.min(1, (now - cityGrowStart) / 3200);
    if (now - lastPlan > 300) { lastPlan = now; plan(camera, target, now); }
    let dirty = false;
    for (const [i, r] of resident) {
      const k = Math.min(1, (now - r.born) / 1100);
      r.grow.value = k;
      const h = Math.round(Math.min(1, k * 1.4) * 255);
      if (hiddenData[i] !== h) { hiddenData[i] = h; dirty = true; }
    }
    if (dirty) hidden.needsUpdate = true;
  }

  return {
    group,
    blocks,
    stats,
    update,
    setBudget(n: number) { budget = n; },
    dispose() {
      disposed = true;
      workers.forEach((w) => w.terminate());
    },
  };
}
export type City = Awaited<ReturnType<typeof createCity>>;
