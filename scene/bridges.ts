import * as THREE from "three";
import { BUILDING_EX, EXZ } from "@/lib/geo";
import { groundAt, type Terrain } from "@/lib/formats/terrain";
import type { BuiltBridge } from "@/lib/bridges";
import { Kit } from "./landmarks/kit";

/**
 * Bridge decks on piers along their OpenStreetMap paths, plus hand-built
 * superstructures for the famous ones: the Jacques Cartier cantilever truss
 * (with its colour-changing lights), the Samuel De Champlain and
 * Papineau-Leblanc cable-stayed pylons, and the Victoria and Honoré Mercier trusses.
 */
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DECK = 2.6;

export interface BridgeView { name: string; blurb: string; x: number; y: number; deck: number; along: number }

export async function createBridges(scene: THREE.Scene, terrain: Terrain, night: { value: number }) {
  const res = await fetch("/city/bridges.json");
  if (!res.ok) return null;
  const bridges = (await res.json()) as BuiltBridge[];
  const group = new THREE.Group();
  group.name = "bridges";
  scene.add(group);

  const concrete = new THREE.MeshStandardMaterial({ color: "#bdb8ae", roughness: 0.9 });
  const deckSides = new THREE.MeshStandardMaterial({ color: "#b3aea4", roughness: 0.9, side: THREE.DoubleSide });
  const asphalt = new THREE.MeshStandardMaterial({ color: "#3b3f46", roughness: 0.95 });
  const steelGreen = new THREE.MeshStandardMaterial({ color: "#6d8a80", roughness: 0.55, metalness: 0.35 });
  const steelGrey = new THREE.MeshStandardMaterial({ color: "#6f757d", roughness: 0.55, metalness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: "#ecebe6", roughness: 0.6 });
  const cable = new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.4, metalness: 0.3 });
  const lamps = new THREE.MeshStandardMaterial({ color: "#ffe2b0", emissive: new THREE.Color("#ffd391"), emissiveIntensity: 0.05, roughness: 0.6 });
  // Jacques Cartier's LEDs: one material whose colour drifts through the evening
  const leds = new THREE.MeshStandardMaterial({ color: "#7fd6ff", emissive: new THREE.Color("#7fd6ff"), emissiveIntensity: 0.1, roughness: 0.5 });

  const pierMatrices: THREE.Matrix4[] = [];
  const views: BridgeView[] = [];
  const deckGeo: THREE.BufferGeometry[] = [], roadGeo: THREE.BufferGeometry[] = [];

  for (const b of bridges) {
    const kit = new Kit();
    for (const [pi, path] of b.paths.entries()) {
      const p = path.pts;
      if (p.length < 2) continue;
      const hw = path.w / 2;
      // left/right edge points in scene space (x, y, z = −north)
      const L: THREE.Vector3[] = [], R: THREE.Vector3[] = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)], c = p[Math.min(p.length - 1, i + 1)];
        let dx = c[0] - a[0], dy = c[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        // left normal of the direction (x east, y north) → scene (x, −z)
        L.push(V(p[i][0] - dy * hw, p[i][2], -(p[i][1] + dx * hw)));
        R.push(V(p[i][0] + dy * hw, p[i][2], -(p[i][1] - dx * hw)));
      }
      // deck: road surface on top, concrete sides and parapets
      const top: number[] = [], side: number[] = [];
      const quad = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
        arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const down = (v: THREE.Vector3, h: number) => V(v.x, v.y - h, v.z);
      const up = (v: THREE.Vector3, h: number) => V(v.x, v.y + h, v.z);
      for (let i = 0; i + 1 < p.length; i++) {
        quad(top, L[i], R[i], R[i + 1], L[i + 1]);
        quad(side, down(L[i + 1], DECK), down(L[i], DECK), L[i], L[i + 1]);
        quad(side, down(R[i], DECK), down(R[i + 1], DECK), R[i + 1], R[i]);
        quad(side, down(L[i], DECK), down(L[i + 1], DECK), down(R[i + 1], DECK), down(R[i], DECK));
        quad(side, L[i + 1], L[i], up(L[i], 1.2), up(L[i + 1], 1.2));
        quad(side, R[i], R[i + 1], up(R[i + 1], 1.2), up(R[i], 1.2));
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
      tg.computeVertexNormals();
      roadGeo.push(tg);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.Float32BufferAttribute(side, 3));
      sg.computeVertexNormals();
      deckGeo.push(sg);
      // piers every ~60 m where the deck is well above the ground or river bed
      let since = 30;
      for (let i = 1; i < p.length; i++) {
        since += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        if (since < 60) continue;
        const g = groundAt(terrain, p[i][0], p[i][1]) * EXZ;
        const h = p[i][2] - DECK - g;
        if (h < 4) continue;
        since = 0;
        const dir = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]);
        const m = new THREE.Matrix4().compose(V(p[i][0], g + h / 2, -p[i][1]), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), dir), V(5, h, Math.max(4, path.w * 0.6)));
        pierMatrices.push(m);
      }
      // a line of lamps along famous decks
      if (b.famous && pi < 2)
        for (let i = 0; i < p.length; i += 3) {
          kit.box(lamps, 0.5, 0.5, 0.5, L[i].x, L[i].y + 1.2, L[i].z);
          kit.box(lamps, 0.5, 0.5, 0.5, R[i].x, R[i].y + 1.2, R[i].z);
        }
    }

    /* superstructure on the main span */
    if (b.main && b.paths[0]) {
      const p = b.paths[0].pts;
      const dist = [0];
      for (let i = 1; i < p.length; i++) dist.push(dist[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      const at = (d: number) => {
        const k = Math.max(1, Math.min(p.length - 1, dist.findIndex((x) => x >= d)));
        const f = (d - dist[k - 1]) / Math.max(1e-6, dist[k] - dist[k - 1]);
        const x = p[k - 1][0] + (p[k][0] - p[k - 1][0]) * f, y = p[k - 1][1] + (p[k][1] - p[k - 1][1]) * f, h = p[k - 1][2] + (p[k][2] - p[k - 1][2]) * f;
        let dx = p[k][0] - p[k - 1][0], dy = p[k][1] - p[k - 1][1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        return { x, y, h, dx, dy };
      };
      // how wide all carriageways are around the span centre (the pylons straddle them)
      const c0 = at((b.main.a + b.main.b) / 2);
      let spread = b.paths[0].w / 2;
      for (const path of b.paths.slice(1))
        for (const q of path.pts) {
          const ox = q[0] - c0.x, oy = q[1] - c0.y;
          if (Math.abs(ox * c0.dx + oy * c0.dy) < 60) spread = Math.max(spread, Math.abs(-ox * c0.dy + oy * c0.dx) + path.w / 2);
        }
      spread = Math.min(spread, 45);
      const side = (s: { x: number; y: number; h: number; dx: number; dy: number }, off: number, up: number) => V(s.x - s.dy * off, s.h + up, -(s.y + s.dx * off));
      const span = b.main.b - b.main.a;
      views.push({ name: b.name, blurb: b.blurb, x: c0.x, y: c0.y, deck: c0.h, along: Math.atan2(c0.dx, c0.dy) });

      if (b.kind === "cantilever" || b.kind === "truss") {
        const mat = b.kind === "cantilever" ? steelGreen : steelGrey;
        const panel = b.kind === "cantilever" ? 14 : 16;
        const n = Math.max(4, Math.round(span / panel));
        const height = (t: number) =>
          b.kind === "cantilever"
            ? (12 + 30 * Math.exp(-(((t - 0.22) / 0.1) ** 2)) + 30 * Math.exp(-(((t - 0.78) / 0.1) ** 2)) + 6 * Math.sin(Math.PI * t)) * BUILDING_EX
            : (b.clearance > 25 ? 10 + 16 * Math.sin(Math.PI * t) : 12) * BUILDING_EX;
        const off = spread + 0.6;
        for (const sgn of [-1, 1]) {
          let prevTop: THREE.Vector3 | null = null, prevBot: THREE.Vector3 | null = null;
          for (let i = 0; i <= n; i++) {
            const t = i / n, s = at(b.main.a + span * t);
            const bot = side(s, sgn * off, 0), top = side(s, sgn * off, height(t));
            kit.strut(mat, bot, top, 0.5, 4);
            if (prevTop && prevBot) {
              kit.strut(mat, prevTop, top, 0.8, 4);
              kit.strut(mat, prevBot, bot, 0.8, 4);
              kit.strut(mat, i % 2 ? prevBot : prevTop, i % 2 ? top : bot, 0.4, 4);
              if (b.kind === "cantilever") kit.strut(leds, prevTop.clone().setY(prevTop.y + 0.9), top.clone().setY(top.y + 0.9), 0.35, 4);
            }
            prevTop = top; prevBot = bot;
          }
        }
        // top bracing between the two trusses
        for (let i = 0; i <= n; i += 2) {
          const t = i / n, s = at(b.main.a + span * t);
          kit.strut(mat, side(s, -off, height(t)), side(s, off, height(t)), 0.35, 4);
        }
        // the little steel pinnacles on Jacques Cartier's main piers
        if (b.kind === "cantilever")
          for (const t of [0.22, 0.78]) {
            const s = at(b.main.a + span * t);
            for (const sgn of [-1, 1]) {
              const base = side(s, sgn * off, height(t));
              kit.strut(mat, base, base.clone().setY(base.y + 12), 0.9, 6);
              kit.add(new THREE.ConeGeometry(1.4, 4, 6), leds, base.x, base.y + 14, base.z);
            }
          }
      }

      if (b.kind === "cablestayed") {
        const H = (b.name.includes("Champlain") ? 170 : 55) * BUILDING_EX;
        const legs = spread + 3;
        // the pylon: two legs rising from below the deck to meet at the top
        const base = c0.h - DECK - 6;
        const topP = V(c0.x, c0.h + H, -c0.y);
        const footL = side(c0, -legs, base - c0.h), footR = side(c0, legs, base - c0.h);
        kit.strut(white, footL, topP, 2.6, 8);
        kit.strut(white, footR, topP, 2.6, 8);
        kit.strut(white, side(c0, -legs * 0.8, -DECK - 1), side(c0, legs * 0.8, -DECK - 1), 1.6, 6);
        // the bed under the pylon
        const g = groundAt(terrain, c0.x, c0.y) * EXZ;
        kit.box(concrete, 14, Math.max(2, base - g), legs * 2.2, c0.x, g, -c0.y, Math.atan2(c0.dy, c0.dx));
        // harp of stays on both sides of the pylon, both edges of the deck
        const reach = Math.min(span / 2, b.name.includes("Champlain") ? 250 : 110);
        const N = b.name.includes("Champlain") ? 14 : 8;
        for (const dir of [-1, 1])
          for (let i = 1; i <= N; i++) {
            const d = (b.main.a + b.main.b) / 2 + dir * reach * (i / N);
            const s = at(d);
            const anchorY = c0.h + H * (0.55 + 0.42 * (i / N));
            for (const sgn of [-1, 1]) {
              const anchor = V(c0.x - c0.dy * sgn * legs * (1 - (anchorY - base) / (topP.y - base)), anchorY, -(c0.y + c0.dx * sgn * legs * (1 - (anchorY - base) / (topP.y - base))));
              kit.strut(cable, anchor, side(s, sgn * (spread - 1), 1), 0.22, 4);
            }
          }
        kit.add(new THREE.SphereGeometry(2.2, 10, 6), lamps, topP.x, topP.y + 1, topP.z);
      }
    }
    group.add(kit.build());
  }

  // all decks in two meshes, all piers in one
  const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
  if (deckGeo.length) {
    const d = new THREE.Mesh(mergeGeometries(deckGeo)!, deckSides);
    const r = new THREE.Mesh(mergeGeometries(roadGeo)!, asphalt);
    for (const m of [d, r]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  }
  if (pierMatrices.length) {
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, pierMatrices.length);
    pierMatrices.forEach((m, i) => piers.setMatrixAt(i, m));
    piers.castShadow = piers.receiveShadow = true;
    group.add(piers);
  }

  const hue = new THREE.Color();
  return {
    group,
    views,
    update(t: number) {
      const n = night.value;
      lamps.emissiveIntensity = 0.05 + 2.4 * n;
      // the LEDs drift slowly through the palette, brighter after dusk
      hue.setHSL((0.55 + 0.25 * Math.sin(t * 0.05) + 0.1 * Math.sin(t * 0.013)) % 1, 0.75, 0.6);
      leds.color.copy(hue);
      leds.emissive.copy(hue);
      leds.emissiveIntensity = 0.15 + 3.2 * n;
    },
  };
}
export type Bridges = NonNullable<Awaited<ReturnType<typeof createBridges>>>;
