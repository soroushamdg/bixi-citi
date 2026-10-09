import * as THREE from "three";
import type { Landmark } from "@/lib/landmarks";
import { project } from "@/lib/geo";
import { Kit, signTexture, type LandmarkMaterials } from "./kit";

/** Something that moves every frame (a wheel, a beacon, smoke). */
export type Animator = (t: number, night: number) => void;
export interface Built { object: THREE.Object3D; animate?: Animator }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** deterministic noise for the procedural bits */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/* ---------------- Notre-Dame Basilica ---------------- */
function basilica(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const { L, W } = l;
  const front = L / 2, towerW = 15, nave = W * 0.82;
  // nave and aisles
  k.box(M.greystone, L - 16, 26, nave, -8, 0, 0);
  k.gable(M.roof, L - 18, nave + 1.5, 15, -9, 26, 0);
  // apse
  // half-cylinders bulge toward +x by default; turn them to face the back (−x)
  k.add(new THREE.CylinderGeometry(nave / 2, nave / 2, 24, 20, 1, false, 0, Math.PI), M.greystone, -L / 2 + 8, 12, 0, 0, Math.PI, 0);
  k.add(new THREE.ConeGeometry(nave / 2 + 0.5, 12, 20, 1, false, 0, Math.PI), M.roof, -L / 2 + 8, 30, 0, 0, Math.PI, 0);
  // buttresses with pinnacles along both sides
  for (let x = -L / 2 + 14; x < front - 18; x += 9) {
    for (const s of [-1, 1]) {
      k.box(M.greystone, 2.2, 22, 3, x, 0, s * (nave / 2 + 1.2));
      k.pyramid(M.greystone, 1.8, 6, x, 22, s * (nave / 2 + 1.2));
    }
  }
  // façade: twin towers, gallery, three portals
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - towerW / 2);
    k.box(M.greystone, towerW, 52, towerW, front - towerW / 2, 0, z);
    k.box(M.greystone, towerW - 2, 10, towerW - 2, front - towerW / 2, 52, z);
    k.box(M.darkStone, towerW + 0.6, 1.2, towerW + 0.6, front - towerW / 2, 52, z);
    // belfry openings
    for (const dz of [-3, 3]) k.box(M.roof, 0.6, 7, 2.2, front + 0.1, 53.5, z + dz);
    // corner pinnacles to 69 m
    for (const a of [-1, 1]) for (const b of [-1, 1]) k.pyramid(M.greystone, 2.4, 7, front - towerW / 2 + a * (towerW / 2 - 1.6), 62, z + b * (towerW / 2 - 1.6));
    k.pyramid(M.roof, 6, 3, front - towerW / 2, 62, z);
  }
  k.box(M.greystone, 8, 36, W - 2 * towerW, front - 4, 0, 0);
  k.gable(M.greystone, 6, W - 2 * towerW, 7, front - 3, 36, 0, Math.PI / 2);
  // arcade of three portals and the statue niches above
  for (const dz of [-8, 0, 8]) {
    k.box(M.roof, 0.8, 11, 5.2, front + 0.1, 0, dz);
    k.box(M.darkStone, 0.8, 4.5, 3.2, front + 0.1, 17, dz);
  }
  k.box(M.windows, 0.4, 6, 9, front + 0.2, 25, 0);
  return { object: k.build() };
}

/* ---------------- Saint Joseph's Oratory ---------------- */
function oratory(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const domeX = 19.5;
  // the stairs climb toward the front from below the footprint
  for (let i = 0; i < 10; i++) k.box(M.granite, 4, 2 + i * 1.6, 44 - i * 1.2, l.L / 2 + 26 - i * 3.2, -12, 0);
  // main block under the dome
  k.box(M.granite, 64, 34, 54, domeX, 0, 0);
  k.box(M.darkStone, 66, 1.4, 56, domeX, 34, 0);
  // portico with Corinthian-ish columns and pediment
  const px = domeX + 32 + 6;
  k.box(M.granite, 12, 3, 46, px, 0, 0);
  for (let i = 0; i < 8; i++) k.cyl(M.granite, 1.1, 1.3, 20, px + 3, 3, -19.25 + i * 5.5, 14);
  k.box(M.granite, 12, 3, 46, px, 23, 0);
  k.gable(M.granite, 12, 46, 8, px, 26, 0, Math.PI / 2);
  // drum, dome, lantern, cross
  k.cyl(M.granite, 23, 23, 14, domeX, 35, 0, 40);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    k.box(M.granite, 1.4, 14, 1.4, domeX + Math.cos(a) * 23.6, 35, Math.sin(a) * 23.6);
  }
  k.box(M.darkStone, 0.5, 1, 0.5, domeX, 49, 0);
  k.add(new THREE.SphereGeometry(21.5, 40, 20, 0, TAU, 0, Math.PI / 2), M.copper, domeX, 49, 0, 0, 0, 0, 1, 1.15, 1);
  k.cyl(M.copper, 3.2, 3.6, 7, domeX, 73.5, 0, 16);
  k.add(new THREE.SphereGeometry(3.3, 16, 8, 0, TAU, 0, Math.PI / 2), M.copper, domeX, 80.5, 0);
  k.box(M.granite, 0.6, 6, 0.6, domeX, 83, 0);
  k.box(M.granite, 0.6, 0.6, 3, domeX, 87, 0);
  // the rear (uphill) block and its roof
  k.box(M.granite, 50, 26, 40, domeX - 60, 0, 0);
  k.gable(M.copper, 50, 40, 9, domeX - 60, 26, 0);
  k.box(M.granite, 14, 30, 18, domeX - 34, 0, 0);
  // two small bell towers flanking the dome block's front
  for (const s of [-1, 1]) {
    k.box(M.granite, 8, 40, 8, domeX + 28, 0, s * 24);
    k.add(new THREE.SphereGeometry(4, 16, 8, 0, TAU, 0, Math.PI / 2), M.copper, domeX + 28, 40, s * 24);
  }
  k.box(M.windows, 0.4, 10, 4, px + 6.3, 6, 0);
  return { object: k.build() };
}

/* ---------------- Habitat 67 ---------------- */
function habitat(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const r = rng(67);
  const C = 6, NI = Math.floor(l.L / C), NJ = Math.floor(l.W / C), LEVELS = 12;
  const occ: Uint8Array[] = Array.from({ length: LEVELS }, () => new Uint8Array(NI * NJ));
  // three stepped "hills" along the pier
  const hills = [{ c: 0.2, h: 12, s: 0.13 }, { c: 0.52, h: 10, s: 0.12 }, { c: 0.82, h: 8, s: 0.1 }];
  const allow = (lv: number, i: number, j: number) => {
    const x = i / NI, z = j / NJ;
    for (const hl of hills) {
      const reach = hl.s * (1 - lv / (hl.h + 1));
      if (lv < hl.h && Math.abs(x - hl.c) < reach * 1.6 && Math.abs(z - 0.5) < 0.42 - lv * 0.025) return true;
    }
    return false;
  };
  let modules = 0;
  for (let lv = 0; lv < LEVELS; lv++) {
    for (let i = 0; i < NI - 1; i++)
      for (let j = 0; j < NJ - 1; j++) {
        if (occ[lv][i * NJ + j] || !allow(lv, i, j) || r() < 0.38) continue;
        const alongX = r() < 0.5;
        const i2 = alongX ? i + 1 : i, j2 = alongX ? j : j + 1;
        if (occ[lv][i2 * NJ + j2] || !allow(lv, i2, j2)) continue;
        // needs something under at least one end (or the ground)
        if (lv > 0 && !occ[lv - 1][i * NJ + j] && !occ[lv - 1][i2 * NJ + j2]) continue;
        occ[lv][i * NJ + j] = occ[lv][i2 * NJ + j2] = 1;
        const x = -l.L / 2 + (i + (alongX ? 1 : 0.5)) * C, z = -l.W / 2 + (j + (alongX ? 0.5 : 1)) * C;
        const sx = alongX ? 11.7 : 5.3, sz = alongX ? 5.3 : 11.7;
        k.box(M.concrete, sx, 3.05, sz, x, lv * 3.15, z);
        // a glazed end and a planter edge on the roof below it
        k.box(M.windows, alongX ? 0.2 : 4, 2, alongX ? 4 : 0.2, x + (alongX ? 5.9 : 0), lv * 3.15 + 0.6, z + (alongX ? 0 : 5.9));
        modules++;
      }
  }
  // the pedestrian streets that tie the hills together
  k.box(M.darkConcrete, l.L * 0.86, 0.6, 3, 0, 9.4, 0);
  k.box(M.darkConcrete, l.L * 0.7, 0.6, 3, 0, 21.9, 0);
  const obj = k.build();
  obj.userData.modules = modules;
  return { object: obj };
}

/* ---------------- Olympic Stadium and tower ---------------- */
function stadium(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const a = l.L / 2, b = l.W / 2;
  // elliptical shell, seating bowl and field
  k.add(new THREE.CylinderGeometry(1, 1, 22, 64, 1, true), M.concrete, 0, 11, 0, 0, 0, 0, a * 0.93, 1, b * 0.93);
  k.add(new THREE.CylinderGeometry(0.92, 0.5, 34, 64, 1, true), M.darkConcrete, 0, 17, 0, 0, 0, 0, a, 1, b);
  k.add(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), M.field, 0, 1.2, 0, 0, 0, 0, a * 0.5, 1, b * 0.5);
  // the 34 cantilevered ribs
  const prof = new THREE.Shape();
  prof.moveTo(0, 0); prof.quadraticCurveTo(-4, 30, -26, 50); prof.lineTo(-34, 50); prof.lineTo(-34, 46); prof.lineTo(-27, 45); prof.quadraticCurveTo(-8, 26, -5, 0); prof.closePath();
  const rib = new THREE.ExtrudeGeometry(prof, { depth: 4, bevelEnabled: false }).translate(0, 0, -2);
  for (let i = 0; i < 34; i++) {
    const t = (i / 34) * TAU, x = Math.cos(t) * a * 1.02, z = Math.sin(t) * b * 1.02;
    // the rib's −x side faces the centre
    k.add(rib, M.concrete, x, 0, z, 0, -Math.atan2(z, x), 0);
  }
  // roof: a pale membrane over the ring
  k.add(new THREE.SphereGeometry(1, 48, 12, 0, TAU, 0, 0.42), M.membrane, 0, 30, 0, 0, 0, 0, a * 0.72, 55, b * 0.72);
  k.add(new THREE.TorusGeometry(1, 0.012, 6, 64).rotateX(Math.PI / 2), M.concrete, 0, 50.5, 0, 0, 0, 0, a * 0.78, 3, b * 0.78);
  // the inclined tower at the north end, leaning 45° over the stadium
  const foot = V(a + 26, 0, 0);
  const segs = 10;
  let prev = foot.clone();
  for (let s = 1; s <= segs; s++) {
    const u = s / segs;
    // curved spine: steep at the base, about 45° at the top
    const p = V(a + 26 - 118 * Math.pow(u, 1.35), 165 * u, 0);
    const w = 26 - 12 * u, d = 18 - 8 * u;
    const mid = prev.clone().add(p).multiplyScalar(0.5), len = prev.distanceTo(p);
    const ang = Math.atan2(p.x - prev.x, p.y - prev.y);
    k.add(BOXG, M.concrete, mid.x, mid.y, mid.z, 0, 0, -ang, w * 0.7, len * 1.04, d);
    k.add(BOXG, M.concrete, mid.x - Math.cos(ang) * w * 0.35, mid.y + Math.sin(ang) * w * 0.35, 0, 0, 0, -ang, w * 0.3, len * 1.04, d * 0.6);
    prev = p;
  }
  // observatory and the cables to the roof
  k.box(M.darkSteel, 22, 9, 22, prev.x, prev.y - 7, 0);
  k.box(M.windows, 22.4, 3, 22.4, prev.x, prev.y - 4.5, 0);
  for (let i = 0; i < 26; i++) {
    const t = (i / 25 - 0.5) * 2.2;
    const end = V(Math.cos(t) * a * 0.55 - a * 0.1, 46, Math.sin(t) * b * 0.55);
    k.strut(M.darkSteel, V(prev.x + 6, prev.y - 20 - i * 1.5, 0), end, 0.35, 4);
  }
  k.box(M.concrete, 46, 14, 40, a + 30, 0, 0);
  return { object: k.build() };
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);

/* ---------------- Biosphere ---------------- */
function biosphere(l: Landmark, M: LandmarkMaterials): Built {
  const R = l.L / 2, cy = l.H - R;
  const ico = new THREE.IcosahedronGeometry(R, 7);
  const pos = ico.getAttribute("position");
  const key = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const seen = new Set<string>();
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, i + 1); C.fromBufferAttribute(pos, i + 2);
    for (const [p, q] of [[A, B], [B, C], [C, A]] as const) {
      if (p.y + cy < 0.5 && q.y + cy < 0.5) continue;
      const kk = [key(p), key(q)].sort().join("|");
      if (seen.has(kk)) continue;
      seen.add(kk);
      edges.push([p.clone(), q.clone()]);
    }
  }
  // struts as one instanced mesh (thousands of them)
  const strut = new THREE.CylinderGeometry(0.28, 0.28, 1, 5, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(strut, M.steel, edges.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  edges.forEach(([p, r], i) => {
    d.copy(r).sub(p);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    m.compose(V(p.x, p.y + cy, p.z), q, V(1, len, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  // a faint inner shell catches the light, and glows at night
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 24), M.bioGlow);
  (shell.material as THREE.MeshStandardMaterial).transparent = true;
  (shell.material as THREE.MeshStandardMaterial).opacity = 0.18;
  shell.position.y = cy;
  g.add(shell);
  // the museum inside
  const k = new Kit();
  k.box(M.white, R * 0.9, 18, R * 0.9, 0, 0, 0);
  k.box(M.windows, R * 0.92, 2, R * 0.92, 0, 12, 0);
  g.add(k.build());
  return { object: g };
}

/* ---------------- Sailors' Memorial Clock Tower ---------------- */
function clocktower(_l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.white, 11, 4, 11);
  k.box(M.white, 7, 34, 7, 0, 4, 0);
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(M.white, 1.4, 36, 1.4, a * 3.6, 4, b * 3.6);
  k.box(M.white, 8.4, 6, 8.4, 0, 38, 0);
  for (const [x, z, ry] of [[4.25, 0, 0], [-4.25, 0, 0], [0, 4.25, Math.PI / 2], [0, -4.25, Math.PI / 2]] as const)
    k.add(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 24), M.clockFace, x, 41, z, 0, ry, Math.PI / 2);
  k.cyl(M.white, 2.6, 3.2, 4, 0, 44, 0, 8);
  k.add(new THREE.SphereGeometry(2.6, 12, 6, 0, TAU, 0, Math.PI / 2), M.copper, 0, 48, 0);
  return { object: k.build() };
}

/* ---------------- Sun Life Building ---------------- */
function sunlife(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const { L, W } = l;
  const tiers: Array<[number, number, number, number]> = [[L, W, 0, 30], [L - 12, W - 8, 30, 78], [L - 36, W - 22, 78, 98], [L - 60, W - 32, 98, 112], [L - 80, W - 40, 112, 122]];
  for (const [x, z, y0, y1] of tiers) {
    k.box(M.sunlife, x, y1 - y0, z, 0, y0, 0);
    k.box(M.granite, x + 1.6, 1.4, z + 1.6, 0, y1 - 1.4, 0);
  }
  // the colonnade wrapping the base
  for (let x = -L / 2 + 4; x <= L / 2 - 4; x += 6.4) for (const s of [-1, 1]) k.cyl(M.granite, 1.2, 1.35, 22, x, 4, s * (W / 2 + 1.8), 12);
  for (let z = -W / 2 + 5; z <= W / 2 - 5; z += 6.4) for (const s of [-1, 1]) k.cyl(M.granite, 1.2, 1.35, 22, s * (L / 2 + 1.8), 4, z, 12);
  k.box(M.granite, L + 6, 4, W + 6, 0, 0, 0);
  k.box(M.granite, L + 5, 3, W + 5, 0, 26, 0);
  k.pyramid(M.roof, 26, 8, 0, 122, 0);
  return { object: k.build() };
}

/* ---------------- Place Ville Marie, with the rooftop beacon ---------------- */
function pvm(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const S = l.L, arm = 33, H = l.H;
  k.box(M.pvm, S, H, arm, 0, 0, 0);
  k.box(M.pvm, arm, H, S, 0, 0, 0);
  // the notched ends of the cross and the fins that run its full height
  for (const [x, z] of [[S / 2, 0], [-S / 2, 0], [0, S / 2], [0, -S / 2]] as const) {
    const alongX = z === 0;
    k.box(M.darkSteel, alongX ? 1.5 : arm + 6, H + 2, alongX ? arm + 6 : 1.5, x, 0, z);
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(M.pvm, arm * 0.5, H - 4, arm * 0.5, a * arm * 0.75, 0, b * arm * 0.75);
  k.box(M.darkSteel, arm + 10, 8, arm + 10, 0, H, 0);
  k.box(M.darkSteel, 10, 6, 10, 0, H + 8, 0);
  const obj = k.build();
  // the beacon: four beams sweeping slowly, only after dusk. They climb a few
  // degrees so they read in the sky, and fade along their length.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */ `varying float vV; void main(){ vV = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform float uI; varying float vV; void main(){ gl_FragColor = vec4(vec3(1., .94, .84) * uI * vV * vV * vV, 1.); }`,
  });
  const beam = new THREE.ConeGeometry(26, 2200, 20, 1, true).translate(0, -1100, 0).rotateZ(Math.PI / 2 + 0.13);
  const beacon = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(beam, beamMat);
    m.rotation.y = (i * Math.PI) / 2;
    m.frustumCulled = false;
    m.renderOrder = 7;
    beacon.add(m);
  }
  beacon.position.y = H + 14;
  obj.add(beacon);
  return {
    object: obj,
    animate(t, night) {
      beacon.rotation.y = t * 0.35;
      beamMat.uniforms.uI.value = 0.22 * Math.max(0, night - 0.3) / 0.7;
      beacon.visible = beamMat.uniforms.uI.value > 0.002;
    },
  };
}

/* ---------------- Mount Royal Cross ---------------- */
function cross(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const H = l.H;
  k.box(M.darkConcrete, 6, 2, 6);
  // steel lattice: four chords per member, lights on the face toward the city
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(M.darkSteel, 0.35, H - 2, 0.35, a * 0.7, 2, b * 0.7);
  for (let y = 3; y < H; y += 1.6) k.box(M.darkSteel, 1.6, 0.2, 1.6, 0, y, 0);
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(M.darkSteel, 0.35, 0.35, 11, a * 0.7, H - 9.5 + b * 0.7, 0);
  for (let z = -5.2; z <= 5.2; z += 1.6) k.box(M.darkSteel, 1.6, 1.6, 0.2, 0, H - 9.5 - 0.8, z);
  k.box(M.crossLights, 0.25, H - 3, 0.6, 0.95, 3, 0);
  k.box(M.crossLights, 0.25, 0.6, 11, 0.95, H - 9.8, 0);
  return { object: k.build() };
}

/* ---------------- Chalet du Mont-Royal and Kondiaronk Belvedere ---------------- */
function chalet(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.stone, l.L, 11, l.W);
  k.gable(M.wood, l.W + 3, l.L + 3, 7, 0, 11, 0, Math.PI / 2);
  for (const dz of [-14, -7, 0, 7, 14]) k.box(M.windows, 0.3, 7, 4, l.L / 2 + 0.1, 1.5, dz);
  // the semicircular belvedere in front, with its balustrade
  const bx = 36;
  k.add(new THREE.CylinderGeometry(30, 30, 1.6, 40, 1, false, 0, Math.PI), M.granite, bx, 0.8 - 4, 0, 0, 0, 0, 1, 5, 1);
  k.add(new THREE.TorusGeometry(30, 0.35, 6, 40, Math.PI), M.granite, bx, 5.6, 0, Math.PI / 2, 0, -Math.PI / 2);
  k.box(M.granite, 4, 4.5, 60, bx - 2, 0, 0);
  return { object: k.build() };
}

/* ---------------- La Grande Roue ---------------- */
function wheel(_l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const R = 27, hub = 31.5;
  // A-frame legs
  for (const x of [-4, 4]) for (const z of [-14, 14]) k.strut(M.steel, V(x, 0, z), V(x * 0.3, hub, 0), 0.7, 8);
  k.box(M.darkConcrete, 16, 3, 34);
  const base = k.build();
  const rot = new THREE.Group();
  rot.position.y = hub;
  const w = new Kit();
  for (const x of [-1.6, 1.6]) w.add(new THREE.TorusGeometry(R, 0.45, 6, 72), M.steel, x, 0, 0, 0, Math.PI / 2, 0);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    for (const x of [-1.6, 1.6]) w.strut(M.steel, V(x * 0.4, 0, 0), V(x, Math.sin(a) * R, Math.cos(a) * R), 0.18, 4);
  }
  w.cyl(M.darkSteel, 1.6, 1.6, 5, 0, -2.5, 0, 12);
  w.add(new THREE.TorusGeometry(R + 0.6, 0.25, 4, 96), M.rimLights, 0, 0, 0, 0, Math.PI / 2, 0);
  rot.add(w.build(false));
  // 42 gondolas that stay level as the wheel turns
  const gondolas: THREE.Object3D[] = [];
  const gk = new Kit();
  gk.box(M.white, 2.4, 2.6, 2.6, 0, -2.8, 0);
  gk.box(M.windows, 2.5, 1, 2.7, 0, -1.9, 0);
  const proto = gk.build(false);
  for (let i = 0; i < 42; i++) {
    const g = proto.clone();
    const a = (i / 42) * TAU;
    g.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
    g.userData.a = a;
    rot.add(g);
    gondolas.push(g);
  }
  const obj = new THREE.Group();
  obj.add(base, rot);
  return {
    object: obj,
    animate(t) {
      rot.rotation.x = -t * 0.06;
      for (const g of gondolas) g.rotation.x = t * 0.06;
    },
  };
}

/* ---------------- Botanical Garden exhibition greenhouses ---------------- */
function greenhouses(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  // stone headhouse in the middle, glass houses on both wings
  k.box(M.stone, 22, 13, 40, l.L / 2 - 14, 0, 0);
  k.gable(M.copper, 24, 42, 5, l.L / 2 - 14, 13, 0, Math.PI / 2);
  // a glass vault: half-cylinder laid along x, open side down
  k.add(new THREE.CylinderGeometry(14, 14, 44, 24, 1, false, 0, Math.PI), M.glass, -6, 6, 0, 0, 0, Math.PI / 2);
  k.box(M.stone, 44, 6, 30, -6, 0, 0);
  const houses = 9;
  for (let i = 0; i < houses; i++) {
    for (const s of [-1, 1]) {
      const z = s * (24 + i * 11.4);
      if (Math.abs(z) > l.W / 2 - 4) continue;
      const len = 40 + ((i * 7) % 3) * 6;
      k.box(M.stone, len, 1.4, 10, -l.L / 2 + len / 2 + 6, 0, z);
      k.box(M.glass, len, 4, 10, -l.L / 2 + len / 2 + 6, 1.4, z);
      k.gable(M.glass, len, 10.4, 4.5 + (i % 3), -l.L / 2 + len / 2 + 6, 5.4, z);
    }
  }
  return { object: k.build() };
}

/* ---------------- Atwater Market ---------------- */
function atwater(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.cream, l.L, 11, l.W);
  k.box(M.brick, l.L - 4, 2.5, l.W + 0.4, 0, 3.5, 0);
  k.box(M.windows, l.L - 6, 2.2, l.W + 0.6, 0, 6.8, 0);
  // the stepped art deco clock tower over the entrance
  const x = l.L / 2 - 6;
  k.box(M.cream, 11, 24, 11, x, 0, 0);
  k.box(M.cream, 8.5, 6, 8.5, x, 24, 0);
  k.box(M.cream, 6, 4, 6, x, 30, 0);
  k.pyramid(M.copper, 4.5, 3, x, 34, 0);
  for (const [dx, dz, ry] of [[5.6, 0, 0], [-5.6, 0, 0], [0, 5.6, Math.PI / 2], [0, -5.6, Math.PI / 2]] as const)
    k.add(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 24), M.clockFace, x + dx, 19, dz, 0, ry, Math.PI / 2);
  for (let i = -2; i <= 2; i++) k.box(M.cream, 0.6, 22, 0.8, x + 5.6, 0, i * 2);
  return { object: k.build() };
}

/* ---------------- Calder's L'Homme (Trois disques) ---------------- */
function calder(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  // three arched legs of folded plate meeting high up, three discs above
  const leg = new THREE.Shape();
  leg.moveTo(0, 0); leg.lineTo(3.2, 0); leg.quadraticCurveTo(4, 9, 1.2, 15); leg.lineTo(0.2, 15); leg.quadraticCurveTo(1.6, 8, 0, 0);
  const legG = new THREE.ExtrudeGeometry(leg, { depth: 0.25, bevelEnabled: false });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    k.add(legG, M.steel, Math.cos(a) * 7, 0, Math.sin(a) * 7, 0, -a + Math.PI, 0);
  }
  k.add(new THREE.CylinderGeometry(3.2, 3.2, 0.25, 32), M.steel, 0.5, 18.5, 0.5, 0.2, 0, 1.3);
  k.add(new THREE.CylinderGeometry(2.6, 2.6, 0.25, 32), M.steel, -1.8, 17, 1.6, -0.4, 0.8, 1.1);
  k.add(new THREE.CylinderGeometry(2.2, 2.2, 0.25, 32), M.steel, 1.4, 16.2, -2, 0.6, -0.5, 1.4);
  k.cyl(M.steel, 0.5, 0.8, 4, 0, 13.5, 0, 8);
  return { object: k.build() };
}

/* ---------------- Farine Five Roses ---------------- */
function fiveroses(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  // the elevator silos it stands on
  for (let i = 0; i < 6; i++) k.cyl(M.concrete, 4.2, 4.2, 34, -6, 0, -21 + i * 8.4, 16);
  k.box(M.concrete, 12, 34, 50, 4, 0, 0);
  k.box(M.darkConcrete, 16, 6, 30, 0, 34, 0);
  // lattice frame
  for (let z = -26; z <= 26; z += 4.3) k.box(M.darkSteel, 0.4, 13, 0.4, 1, 40, z);
  for (const y of [40.2, 46, 52.6]) k.box(M.darkSteel, 0.4, 0.4, 52, 1, y, 0);
  const obj = k.build();
  // letters on both faces; neon at night
  const tex = signTexture([{ text: "FARINE FIVE ROSES", size: 150, color: "#ff3324", font: '900 150px "Arial Black", Impact, sans-serif' }], 2600, 220, null);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ff3a2a"), emissiveIntensity: 0.6, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.6 });
  (mat.userData as { glow: [number, number] }).glow = [0.6, 4.5];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(52, 4.4), mat);
  sign.position.set(1.4, 46.4, 0);
  sign.rotation.y = Math.PI / 2;
  obj.add(sign);
  return { object: obj };
}

/* ---------------- Centre Bell ---------------- */
function arena(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const s = new THREE.Shape();
  const hx = l.L / 2, hz = l.W / 2, r = 18;
  s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r); s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz);
  s.lineTo(-hx + r, hz); s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  const body = new THREE.ExtrudeGeometry(s, { depth: 36, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
  k.add(body, M.bell);
  k.add(new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), M.darkSteel, 0, 36, 0, 0, 0, 0, 0.94, 1, 0.92);
  // glass atrium and canopy on the main entrance
  k.box(M.glass, 6, 18, l.W * 0.6, hx + 2, 0, 0);
  k.box(M.darkSteel, 12, 1, l.W * 0.66, hx + 4, 18, 0);
  k.box(M.windows, 0.4, 14, l.W * 0.56, hx + 4.9, 1, 0);
  return { object: k.build() };
}

/* ---------------- Jean-Talon Market ---------------- */
function market(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const rows = 5, rowW = 13, gap = (l.W - rows * rowW) / (rows - 1);
  for (let i = 0; i < rows; i++) {
    const z = -l.W / 2 + rowW / 2 + i * (rowW + gap);
    const len = l.L - 24;
    for (let x = -len / 2; x <= len / 2; x += 6) for (const s of [-1, 1]) k.cyl(M.darkSteel, 0.18, 0.18, 4.2, x, 0, z + s * (rowW / 2 - 0.5), 6);
    k.gable(i % 2 ? M.white : M.canopy, len, rowW, 2.6, 0, 4.2, z);
    // stalls: crates of colour under the roofs
    for (let x = -len / 2 + 3; x < len / 2; x += 6) k.box(i % 2 ? M.brick : M.wood, 4.6, 1, rowW - 3, x, 0, z);
  }
  k.box(M.cream, 22, 9, l.W * 0.7, -l.L / 2 + 11, 0, 0);
  k.gable(M.canopy, 24, l.W * 0.72, 4, -l.L / 2 + 11, 9, 0, Math.PI / 2);
  return { object: k.build() };
}

/* ---------------- Place des Arts: Salle Wilfrid-Pelletier ---------------- */
function swp(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.swp, l.L - 12, 30, l.W);
  k.box(M.darkStone, l.L - 8, 3, l.W + 4, 0, 30, 0);
  // the colonnade on the esplanade side, under a deep cornice
  const fx = l.L / 2 - 4;
  k.box(M.glass, 1, 24, l.W - 8, fx - 2, 0, 0);
  k.box(M.windows, 0.4, 20, l.W - 10, fx - 1.4, 1, 0);
  for (let z = -l.W / 2 + 4; z <= l.W / 2 - 4; z += 5.4) k.cyl(M.white, 0.7, 0.7, 26, fx + 3, 0, z, 10);
  k.box(M.white, 10, 3, l.W + 2, fx + 2, 26, 0);
  // the esplanade
  k.box(M.granite, 40, 1, l.W + 30, fx + 24, -0.6, 0);
  return { object: k.build() };
}

/** where a point (lat, lon) falls in a landmark's own frame: [x toward its front, z across] */
function localOf(l: Landmark, lat: number, lon: number): [number, number] {
  const [cx, cy] = project(l.lat, l.lon), [px, py] = project(lat, lon);
  const a = (l.axis * Math.PI) / 180, dx = px - cx, dy = py - cy;
  return [dx * Math.sin(a) + dy * Math.cos(a), dx * Math.cos(a) - dy * Math.sin(a)];
}

/* ---------------- Place des Arts: Théâtre Maisonneuve, and the esplanade fountain ---------------- */
function theatre(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const { L, W } = l;
  const front = L / 2;
  // the dark hall block, its fly tower, and the Cinquième Salle on the roof
  k.box(M.swp, L - 10, 26, W, -5, 0, 0);
  k.box(M.darkStone, L - 7, 2.4, W + 2, -5, 26, 0);
  k.box(M.swp, 24, 8, 34, -10, 28.4, 0);
  k.box(M.darkSteel, 25, 1.2, 35, -10, 36.4, 0);
  // the glass lobby on the esplanade, lit from within at night
  k.box(M.glass, 9, 19, W - 6, front - 4.5, 0, 0);
  k.box(M.foyer, 0.4, 16, W - 10, front - 8.6, 1, 0);
  for (let z = -W / 2 + 4; z <= W / 2 - 4; z += 4.8) k.box(M.darkSteel, 0.5, 19, 0.5, front, 0, z);
  k.box(M.darkSteel, 10, 1.2, W - 4, front - 4.5, 19, 0);
  // the esplanade and its fountain pool (OSM: 26 × 32 m, just west of the lobby)
  const [px, pz] = localOf(l, 45.508213, -73.565961);
  // (the model sits 1 m below the ground, so paving and pool are raised to show)
  k.box(M.granite, 46, 0.6, W + 20, front + 22, 0.6, 0);
  k.box(M.granite, 27.4, 1.1, 32.8, px, 0.6, pz);
  k.box(M.water, 26, 1.0, 31.4, px, 0.62, pz);
  const obj = k.build();

  // jets in a 4 × 5 grid that rise and fall in a slow travelling wave
  const cols = 5, rows = 4, n = cols * rows;
  const jet = new THREE.CylinderGeometry(0.16, 0.32, 1, 8, 1, true).translate(0, 0.5, 0);
  const jets = new THREE.InstancedMesh(jet, M.jets, n);
  jets.castShadow = false;
  jets.renderOrder = 6;
  obj.add(jets);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const spots = Array.from({ length: n }, (_, i) => [px - 9 + (i % cols) * 4.5, pz - 9 + Math.floor(i / cols) * 6] as const);
  return {
    object: obj,
    animate(t) {
      spots.forEach(([x, z], i) => {
        const h = 1.2 + 4.4 * (0.5 + 0.5 * Math.sin(t * 1.3 - x * 0.35 + z * 0.12));
        jets.setMatrixAt(i, m.compose(p.set(x, 1.6, z), q, sc.set(1, h, 1)));
      });
      jets.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------- Place des Arts: Maison symphonique ---------------- */
function symphony(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  const { L, W } = l;
  const front = L / 2;
  // the shoebox hall, a step up over the stage, and the roof plant
  k.box(M.hall, L - 10, 28, W - 6, -5, 0, 0);
  k.box(M.hall, L - 16, 6, W - 30, -6, 28, -6);
  k.box(M.darkSteel, L - 9, 1, W - 5, -5, 28, 0);
  // the long glass foyer on Saint-Urbain with its wooden fins; the beech glows through at night
  k.box(M.glass, 9, 24, W - 2, front - 4.5, 0, 0);
  k.box(M.foyer, 0.4, 21, W - 8, front - 8.4, 1, 0);
  for (let z = -W / 2 + 2; z <= W / 2 - 2; z += 2.6) k.box(M.wood, 0.9, 24, 0.35, front - 0.3, 0, z);
  k.box(M.darkSteel, 11, 1.4, W, front - 4.5, 24, 0);
  return { object: k.build() };
}

/* ---------------- Complexe Desjardins: three towers, a hotel, an atrium ---------------- */
/** the towers' square plan with cut-and-notched corners (OSM outline, 47.4 m) */
function notchedSquare(): THREE.Shape {
  const s = new THREE.Shape();
  const q: Array<[number, number]> = [[23.7, 15.7], [21.1, 18.6], [19.4, 18.6], [18.5, 19.6], [18.5, 21.2], [15.7, 23.8]];
  const pts: Array<[number, number]> = [];
  for (const [sx, sy, flip] of [[1, 1, false], [-1, 1, true], [-1, -1, false], [1, -1, true]] as const) {
    const corner = q.map(([a, b]) => [sx * a, sy * b] as [number, number]);
    pts.push(...(flip ? corner.reverse() : corner));
  }
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
function desjardins(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  // the shopping podium, four tall storeys over the whole block, with its glass atrium roof
  k.box(M.cdBase, 168, 22, 168);
  k.box(M.darkConcrete, 170, 1.4, 170, 0, 22, 0);
  k.pyramid(M.glass, 42, 10, 8, 23.4, -2);
  k.box(M.windows, 38, 0.3, 38, 8, 22.2, -2);
  // the hotel (DoubleTree, ex-Hyatt): an L in plan, 60 m
  const [hx, hz] = localOf(l, 45.507249, -73.565025);
  k.box(M.hotel, 19.4, 60, 58, hx + 37.5, 0, hz);
  k.box(M.hotel, 75, 60, 19.4, hx - 9.6, 0, hz - 10.3);
  k.box(M.darkConcrete, 12, 4, 12, hx + 37.5, 60, hz);
  // the towers: notched squares; green LED fins on the crown, green lines up the corners
  const plan = notchedSquare();
  const towers: Array<[number, number, number]> = [[45.506863, -73.564075, 152], [45.507576, -73.563706, 130], [45.508107, -73.564470, 108]];
  for (const [lat, lon, h] of towers) {
    const [x, z] = localOf(l, lat, lon);
    const top = h - 5, fin = 18;
    const prism = (depth: number) => new THREE.ExtrudeGeometry(plan, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
    k.add(prism(top - fin), M.cdTower, x, 0, z);
    // the crown: dark glass washed green inside, ribbed with bright fins, the roofline traced in light
    k.add(prism(fin), M.desjardinsCrown, x, top - fin, z);
    k.add(prism(5), M.darkConcrete, x, top, z, 0, 0, 0, 0.94, 1, 0.94);
    k.box(M.darkSteel, 18, 6, 18, x, h, z);
    for (let t = -14.4; t <= 14.4; t += 2.4) {
      k.box(M.desjardinsGreen, 0.45, fin, 0.45, x + 23.95, top - fin, z + t);
      k.box(M.desjardinsGreen, 0.45, fin, 0.45, x - 23.95, top - fin, z + t);
      k.box(M.desjardinsGreen, 0.45, fin, 0.45, x + t, top - fin, z + 24.05);
      k.box(M.desjardinsGreen, 0.45, fin, 0.45, x + t, top - fin, z - 24.05);
    }
    for (const s of [-1, 1]) for (const y of [top - fin, top - 0.6]) {
      k.box(M.desjardinsGreen, 0.5, 0.6, 32, x + s * 24, y, z);
      k.box(M.desjardinsGreen, 32, 0.6, 0.5, x, y, z + s * 24.1);
    }
    // the notched corners carry a softer line all the way up
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) k.box(M.desjardinsSoft, 0.45, top - fin - 22, 0.45, x + sx * 19.2, 22, z + sz * 19.2);
  }
  return { object: k.build() };
}

/* ---------------- Schwartz's ---------------- */
function deli(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.brickFacade, l.L, l.H, l.W);
  k.box(M.darkStone, l.L + 0.4, 0.6, l.W + 0.4, 0, l.H, 0);
  k.box(M.windows, 0.3, 2.6, l.W - 2, l.L / 2 + 0.1, 0.8, 0);
  const obj = k.build();
  const tex = signTexture([{ text: "SCHWARTZ'S", size: 120, color: "#fff4dc" }, { text: "CHARCUTERIE HÉBRAÏQUE DE MONTRÉAL", size: 34, color: "#ff5a3c" }], 1024, 256, "#14161b");
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.3, roughness: 0.6 });
  (mat.userData as { glow: [number, number] }).glow = [0.3, 1.8];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(l.W - 0.4, 1.6), mat);
  sign.position.set(l.L / 2 + 0.25, 4.1, 0);
  sign.rotation.y = Math.PI / 2;
  obj.add(sign);
  return { object: obj };
}

/* ---------------- Fairmount / St-Viateur Bagel ---------------- */
function bagel(l: Landmark, M: LandmarkMaterials): Built {
  const k = new Kit();
  k.box(M.brickFacade, l.L, l.H, l.W);
  k.box(M.windows, 0.3, 2.4, l.W - 1.6, l.L / 2 + 0.1, 0.6, 0);
  k.box(M.darkStone, 1.4, 4, 1.4, -l.L / 2 + 2, l.H, l.W / 2 - 1.6);
  const obj = k.build();
  const label = l.key === "fairmount" ? "FAIRMOUNT BAGEL" : "ST-VIATEUR BAGEL";
  const tex = signTexture([{ text: label, size: 90, color: l.key === "fairmount" ? "#ffd27a" : "#ffffff" }, { text: "BAGEL · 24 H", size: 44, color: "#ff8a5a" }], 1024, 220, l.key === "fairmount" ? "#2a1c14" : "#1e2a3a");
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25, roughness: 0.6 });
  (mat.userData as { glow: [number, number] }).glow = [0.25, 1.6];
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(l.W - 0.6, 1.3), mat);
  sign.position.set(l.L / 2 + 0.25, 3.6, 0);
  sign.rotation.y = Math.PI / 2;
  obj.add(sign);
  // wood-fired ovens: a little smoke from the chimney, day and night
  const smokeMat = new THREE.SpriteMaterial({ color: 0xd8d4cc, transparent: true, opacity: 0.25, depthWrite: false });
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(smokeMat.clone());
    sp.userData.p = i / 5;
    obj.add(sp);
    puffs.push(sp);
  }
  const cx = -l.L / 2 + 2, cz = l.W / 2 - 1.6;
  return {
    object: obj,
    animate(t) {
      for (const sp of puffs) {
        const p = (t * 0.12 + sp.userData.p) % 1;
        sp.position.set(cx + p * 3, l.H + 4.5 + p * 14, cz + Math.sin(p * 6) * 0.8);
        sp.scale.setScalar(1.5 + p * 6);
        (sp.material as THREE.SpriteMaterial).opacity = 0.28 * (1 - p);
      }
    },
  };
}

export const BUILDERS: Record<Landmark["kind"], (l: Landmark, M: LandmarkMaterials) => Built> = {
  basilica, oratory, habitat, stadium, biosphere, clocktower, sunlife, pvm, cross, chalet, wheel, greenhouses, atwater, calder, fiveroses, arena, market, swp, deli, bagel,
  desjardins, theatre, symphony,
};
