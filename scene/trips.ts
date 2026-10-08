import * as THREE from "three";
import type { DayTrips, Flows } from "@/lib/formats/history";
import type { Stations } from "./stations";

/**
 * Every ride of the story day, animated entirely on the GPU.
 * Each trip is one instance: start/end station, start minute, duration.
 * The vertex shader works out where its head and tail are at uNow, so the
 * CPU only flips which hourly buckets are visible.
 */
const SEG = 16;

const ARC_GLSL = /* glsl */ `
uniform float uNow, uWidth, uLift;
attribute vec4 iA; // x0 y0 z0 startMin
attribute vec4 iB; // x1 y1 z1 durMin
vec3 ctrl(vec3 a, vec3 b){ vec2 d = b.xz - a.xz; return vec3((a.xz + b.xz) * .5 + vec2(-d.y, d.x) * .17, 0.).xzy; }
float arcH(vec3 a, vec3 b){ return (70. + length(b.xz - a.xz) / 1000. * 95.) * uLift; }
vec3 arcAt(vec3 a, vec3 b, float u){
  vec3 c = ctrl(a, b);
  vec2 xz = (1. - u) * (1. - u) * a.xz + 2. * (1. - u) * u * c.xz + u * u * b.xz;
  return vec3(xz.x, mix(a.y, b.y, u) + arcH(a, b) * 4. * u * (1. - u), xz.y);
}
vec3 arcTan(vec3 a, vec3 b, float u){
  vec3 c = ctrl(a, b);
  vec2 t = 2. * (1. - u) * (c.xz - a.xz) + 2. * u * (b.xz - c.xz);
  return normalize(vec3(t.x, (b.y - a.y) + arcH(a, b) * (4. - 8. * u), t.y));
}`;

// glow ends of the leave/dock pair, a touch more saturated than the UI swatches so they hold up in daylight
const COLORS = /* glsl */ `const vec3 OUTG = vec3(1., .52, .3); const vec3 ING = vec3(.3, .8, .95);`;

function ribbonBase() {
  const g = new THREE.InstancedBufferGeometry();
  const u = new Float32Array((SEG + 1) * 2), side = new Float32Array((SEG + 1) * 2);
  for (let q = 0; q <= SEG; q++) { u[q * 2] = u[q * 2 + 1] = q / SEG; side[q * 2] = -1; side[q * 2 + 1] = 1; }
  const idx: number[] = [];
  for (let q = 0; q < SEG; q++) { const a = q * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute("aU", new THREE.BufferAttribute(u, 1));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  // three needs a position attribute to size the draw
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  g.setIndex(idx);
  return g;
}
function quadBase() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("aCorner", new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export interface TripsOptions {
  /** tail length as a share of the ride */
  trail?: number;
  /** how long a dock ring lasts, in timeline units */
  ring?: number;
  /** bucket size in timeline units (buckets toggle visibility) */
  bucket?: number;
}

/** Rides in timeline units (story minutes for Flows, year-minutes for Years). */
export interface TripBatch {
  start: ArrayLike<number>;
  dur: ArrayLike<number>;
  from: ArrayLike<number>;
  to: ArrayLike<number>;
}

export function createTrips(scene: THREE.Scene, opts: TripsOptions = {}) {
  const TRAIL = opts.trail ?? 0.42, RING = opts.ring ?? 3.5, BUCKET = opts.bucket ?? 60;
  const uniforms = {
    uTrail: { value: TRAIL },
    uRing: { value: RING },
    uNow: { value: 0 },
    uWidth: { value: 6 },
    uLift: { value: 1 },
    uHead: { value: 60 },
    uOpacity: { value: 1 },
  };
  const ribbonMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */ `${ARC_GLSL}${COLORS}
      uniform float uTrail;
      attribute float aU, aSide;
      varying vec3 vCol; varying float vSide;
      void main(){
        float p = (uNow - iA.w) / max(iB.w, .5);
        float head = clamp(p, 0., 1.), tail = clamp(p - uTrail, 0., 1.);
        if (p < 0. || head - tail < 1e-4) { gl_Position = vec4(2., 2., 2., 1.); return; }
        float u = mix(tail, head, aU);
        vec3 P = arcAt(iA.xyz, iB.xyz, u), T = arcTan(iA.xyz, iB.xyz, u);
        vec3 V = normalize(cameraPosition - P);
        vec3 S = normalize(cross(T, V) + 1e-5) * uWidth * (.2 + .8 * aU) * aSide;
        vCol = mix(OUTG, ING, u) * (.03 + .8 * aU * aU * aU);
        vSide = aSide;
        gl_Position = projectionMatrix * viewMatrix * vec4(P + S, 1.);
      }`,
    fragmentShader: /* glsl */ `uniform float uOpacity; varying vec3 vCol; varying float vSide;
      void main(){ float e = 1. - vSide * vSide; gl_FragColor = vec4(vCol * (.35 + .65 * e) * uOpacity, 1.); }`,
  });
  const headMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */ `${ARC_GLSL}${COLORS}
      uniform float uHead, uRing;
      attribute vec2 aCorner;
      varying vec2 vC; varying vec3 vCol; varying float vRing;
      void main(){
        float p = (uNow - iA.w) / max(iB.w, .5);
        float after = uNow - (iA.w + iB.w);
        if (p < 0. || after > uRing) { gl_Position = vec4(2., 2., 2., 1.); return; }
        vec3 P;
        vC = aCorner;
        if (p <= 1.) {
          vec3 H = arcAt(iA.xyz, iB.xyz, p);
          vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float flash = 1. + 1.6 * (1. - smoothstep(0., .1, p));
          P = H + (R * aCorner.x + U * aCorner.y) * uHead * .5 * flash;
          vCol = mix(OUTG, ING, p) * 1.7;
          vRing = 0.;
        } else {
          float e = clamp(after / uRing, 0., 1.);
          float r = (14. + 70. * (1. - pow(1. - e, 3.))) * uHead / 60.;
          P = iB.xyz + vec3(aCorner.x * r, 2., aCorner.y * r);
          vCol = ING * 2.2 * (1. - e);
          vRing = 1.;
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.);
      }`,
    fragmentShader: /* glsl */ `uniform float uOpacity; varying vec2 vC; varying vec3 vCol; varying float vRing;
      void main(){
        float d = length(vC);
        float a = vRing > .5 ? smoothstep(.72, .84, d) * (1. - smoothstep(.9, 1., d)) : exp(-d * d * 5.) + .5 * exp(-d * d * 40.);
        if (a < .003) discard;
        gl_FragColor = vec4(vCol * a * uOpacity, 1.);
      }`,
  });

  interface Bucket { from: number; to: number; ribbons: THREE.Mesh; heads: THREE.Mesh }
  const buckets: Bucket[] = [];
  const group = new THREE.Group();
  group.name = "trips";
  scene.add(group);

  /** Add rides; positions come from a pillar set (station feet). Round trips have no arc. */
  function addTrips(batch: TripBatch, set: { n: number; x: Float32Array; g: Float32Array; z: Float32Array }) {
    if (!set.n) return;
    const byBucket = new Map<number, number[]>();
    for (let k = 0; k < batch.start.length; k++) {
      if (batch.from[k] === batch.to[k] || batch.from[k] >= set.n || batch.to[k] >= set.n) continue;
      const b = Math.floor(batch.start[k] / BUCKET);
      const l = byBucket.get(b);
      if (l) l.push(k); else byBucket.set(b, [k]);
    }
    for (const [b, list] of byBucket) {
      const A = new Float32Array(list.length * 4), B = new Float32Array(list.length * 4);
      let maxEnd = 0;
      list.forEach((k, j) => {
        const s = batch.from[k], e = batch.to[k];
        const start = batch.start[k], dur = Math.max(0.5, batch.dur[k]);
        A.set([set.x[s], set.g[s] + 4, set.z[s], start], j * 4);
        B.set([set.x[e], set.g[e] + 4, set.z[e], dur], j * 4);
        maxEnd = Math.max(maxEnd, start + dur * (1 + TRAIL) + RING);
      });
      const mk = (base: THREE.InstancedBufferGeometry, mat: THREE.ShaderMaterial) => {
        base.setAttribute("iA", new THREE.InstancedBufferAttribute(A, 4));
        base.setAttribute("iB", new THREE.InstancedBufferAttribute(B, 4));
        base.instanceCount = list.length;
        const m = new THREE.Mesh(base, mat);
        m.frustumCulled = false;
        m.renderOrder = 5;
        group.add(m);
        return m;
      };
      buckets.push({ from: b * BUCKET, to: maxEnd, ribbons: mk(ribbonBase(), ribbonMat), heads: mk(quadBase(), headMat) });
    }
  }

  /** Add one decoded chunk of the story day (seconds → story minutes). */
  function addChunk(day: DayTrips, stations: Stations) {
    const start = Float32Array.from(day.start, (v) => v / 60);
    const dur = Float32Array.from(day.dur, (v) => v / 60);
    addTrips({ start, dur, from: day.from, to: day.to }, stations.hist);
  }

  function update(now: number, visible: boolean, camDist: number) {
    uniforms.uNow.value = now;
    uniforms.uWidth.value = Math.min(22, Math.max(1.2, camDist * 0.0007));
    uniforms.uHead.value = 46 * Math.min(2.6, Math.max(0.16, camDist / 9000));
    uniforms.uOpacity.value += ((visible ? 1 : 0) - uniforms.uOpacity.value) * 0.15;
    const show = uniforms.uOpacity.value > 0.01;
    for (const b of buckets) {
      const on = show && now >= b.from - 1 && now <= b.to;
      b.ribbons.visible = b.heads.visible = on;
    }
  }

  function clear() {
    for (const b of buckets) {
      group.remove(b.ribbons, b.heads);
      b.ribbons.geometry.dispose();
      b.heads.geometry.dispose();
    }
    buckets.length = 0;
  }

  return { group, addChunk, addTrips, update, clear, uniforms };
}

/**
 * Rhythm mode: the busiest real corridors for one hour of the week, as
 * steady arcs whose width follows average volume and whose dashes flow
 * from origin to destination.
 */
export function createCorridors(scene: THREE.Scene) {
  const uniforms = { uNow: { value: 0 }, uWidth: { value: 6 }, uLift: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */ `${ARC_GLSL}${COLORS}
      attribute float aU, aSide; attribute float iW;
      varying vec3 vCol; varying float vSide; varying float vU; varying float vLen;
      void main(){
        vec3 P = arcAt(iA.xyz, iB.xyz, aU), T = arcTan(iA.xyz, iB.xyz, aU);
        vec3 V = normalize(cameraPosition - P);
        vec3 S = normalize(cross(T, V) + 1e-5) * uWidth * (.5 + 1.8 * iW) * aSide;
        vCol = mix(OUTG, ING, aU) * (.25 + .9 * iW);
        vSide = aSide; vU = aU; vLen = length(iB.xz - iA.xz);
        gl_Position = projectionMatrix * viewMatrix * vec4(P + S, 1.);
      }`,
    fragmentShader: /* glsl */ `uniform float uTime, uOpacity; varying vec3 vCol; varying float vSide; varying float vU; varying float vLen;
      void main(){
        float e = 1. - vSide * vSide;
        float dash = .35 + .65 * smoothstep(.55, 1., fract(vU * vLen / 240. - uTime * .6));
        gl_FragColor = vec4(vCol * e * dash * uOpacity, 1.);
      }`,
  });
  const geo = ribbonBase();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  let key = "";

  /** hourOfWeek: Monday 00:00 = 0 */
  function set(flows: Flows, hourOfWeek: number, stations: Stations) {
    const k = `${hourOfWeek}|${stations.hist.n}`;
    if (k === key) return;
    key = k;
    const H = stations.hist, K = flows.perHour;
    const A: number[] = [], B: number[] = [], W: number[] = [];
    let max = 0;
    for (let j = 0; j < K; j++) max = Math.max(max, flows.data[(hourOfWeek * K + j) * 3 + 2]);
    for (let j = 0; j < K; j++) {
      const o = (hourOfWeek * K + j) * 3;
      const s = flows.data[o], e = flows.data[o + 1], v = flows.data[o + 2];
      if (!v || s >= H.n || e >= H.n) continue;
      A.push(H.x[s], H.g[s] + 4, H.z[s], 0);
      B.push(H.x[e], H.g[e] + 4, H.z[e], 0);
      W.push(Math.sqrt(v / Math.max(1, max)));
    }
    geo.setAttribute("iA", new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
    geo.setAttribute("iB", new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
    geo.setAttribute("iW", new THREE.InstancedBufferAttribute(new Float32Array(W), 1));
    geo.instanceCount = W.length;
  }

  function update(visible: boolean, t: number, camDist: number) {
    uniforms.uTime.value = t;
    uniforms.uWidth.value = Math.min(34, Math.max(3, camDist * 0.0011));
    uniforms.uOpacity.value += ((visible ? 1 : 0) - uniforms.uOpacity.value) * 0.12;
    mesh.visible = uniforms.uOpacity.value > 0.01 && !!key;
  }
  return { mesh, set, update };
}
