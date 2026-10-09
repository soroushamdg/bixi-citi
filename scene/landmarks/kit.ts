import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HASH } from "../glsl";

/**
 * A tiny modelling kit: parts are added in the landmark's local frame
 * (x = toward the front, y = up, z = across), then merged into one mesh per
 * material so a landmark costs a handful of draw calls.
 */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  readonly group = new THREE.Group();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(this.m);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count) * 2), 2));
    const list = this.parts.get(mat);
    if (list) list.push(g); else this.parts.set(mat, [g]);
    return this;
  }
  /** box: size (x, y, z), base at y */
  box(mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, ry = 0) {
    return this.add(BOX, mat, x, y + sy / 2, z, 0, ry, 0, sx, sy, sz);
  }
  /** vertical cylinder, base at y */
  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, x = 0, y = 0, z = 0, seg = 16) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), mat, x, y + h / 2, z);
  }
  /** a cylinder between two points */
  strut(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    this.m.compose(mid, q, new THREE.Vector3(1, 1, 1));
    const ng = g.toNonIndexed().applyMatrix4(this.m);
    const list = this.parts.get(mat);
    if (list) list.push(ng); else this.parts.set(mat, [ng]);
    return this;
  }
  /** gable roof prism along x: base width w (z), length l (x), ridge height h */
  gable(mat: THREE.Material, l: number, w: number, h: number, x = 0, y = 0, z = 0, ry = 0) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
    g.translate(0, 0, -l / 2);
    return this.add(g, mat, x, y, z, 0, ry + Math.PI / 2, 0);
  }
  pyramid(mat: THREE.Material, w: number, h: number, x = 0, y = 0, z = 0, sides = 4) {
    return this.add(new THREE.ConeGeometry(w / Math.SQRT2, h, sides, 1), mat, x, y + h / 2, z, 0, Math.PI / sides, 0);
  }
  build(castShadow = true) {
    for (const [mat, geos] of this.parts) {
      const g = mergeGeometries(geos, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = castShadow && !(mat as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.parts.clear();
    return this.group;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** Materials shared by every landmark; `night` drives everything that lights up. */
export function landmarkMaterials(night: { value: number }) {
  const std = (color: string, roughness = 0.85, metalness = 0.02, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  /** facade with a window grid in object space; panes glow at night */
  const facade = (color: string, floor: number, bay: number, glass: string, lit: number, metal = 0.05) => {
    const m = std(color, 0.75, metal);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = night;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vObj; varying vec3 vObjN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position; vObjN = normal;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uNight; varying vec3 vObj; varying vec3 vObjN; ${HASH}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float paneMask = 0.;
          if (abs(vObjN.y) < .5) {
            float u = abs(vObjN.x) > abs(vObjN.z) ? vObj.z : vObj.x;
            float fl = vObj.y / ${floor.toFixed(2)}, bc = u / ${bay.toFixed(2)};
            paneMask = step(.3, fract(fl)) * step(fract(fl), .85) * step(.18, fract(bc)) * step(fract(bc), .82) * step(4., vObj.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${new THREE.Color(glass).toArray().map((v) => v.toFixed(3)).join(",")}), paneMask * .85);
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          float on = step(1. - ${lit.toFixed(2)}, h21(floor(vec2(vObj.y / ${floor.toFixed(2)}, (abs(vObjN.x) > abs(vObjN.z) ? vObj.z : vObj.x) / ${bay.toFixed(2)})) + vObjN.xz * 7.));
          totalEmissiveRadiance += vec3(1., .72, .42) * paneMask * on * uNight * 1.8;`,
        );
    };
    m.customProgramCacheKey = () => `facade-${color}-${floor}-${bay}-${glass}-${lit}`;
    return m;
  };
  const glow = (color: string, day: number, nightI: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = std(color, 0.5, 0, { emissive: new THREE.Color(color), emissiveIntensity: day, ...extra });
    (m.userData as { glow: [number, number] }).glow = [day, nightI];
    return m;
  };
  /** a light fitting: its own colour by day, `light` at `nightI` after dusk */
  const lamp = (color: string, light: string, nightI: number, roughness = 0.5, metalness = 0.3) => {
    const m = std(color, roughness, metalness, { emissive: new THREE.Color(light), emissiveIntensity: 0 });
    (m.userData as { glow: [number, number] }).glow = [0, nightI];
    return m;
  };
  return {
    stone: std("#cdc4b3", 0.9),
    greystone: std("#b6afa3", 0.9),
    granite: std("#c4c0b8", 0.85),
    darkStone: std("#7f796f", 0.9),
    roof: std("#5f6a7a", 0.62, 0.12),
    copper: std("#6c9e89", 0.55, 0.35),
    concrete: std("#d5d0c5", 0.95),
    darkConcrete: std("#9e9a92", 0.95),
    brick: std("#8f4a39", 0.9),
    cream: std("#ddd2bb", 0.85),
    steel: std("#c9cfd5", 0.35, 0.45),
    darkSteel: std("#59616b", 0.45, 0.7),
    field: std("#4f7c4f", 0.9),
    canopy: std("#4e7d5b", 0.7),
    white: std("#e9e6df", 0.7),
    wood: std("#6a4b35", 0.8),
    glass: std("#88a8bf", 0.12, 0.6, { transparent: true, opacity: 0.55, depthWrite: false }),
    membrane: std("#eef0ec", 0.6, 0, { transparent: true, opacity: 0.85 }),
    sunlife: facade("#c9c3b6", 3.9, 3.2, "#3a4552", 0.35),
    pvm: facade("#c3cad1", 3.65, 1.6, "#56636f", 0.5, 0.45),
    bell: facade("#b3bcc6", 4.5, 2.4, "#4b5968", 0.45, 0.3),
    swp: facade("#5d5a56", 4.2, 3.6, "#2c2a28", 0.6),
    brickFacade: facade("#8f4a39", 3.2, 2.6, "#26221f", 0.7),
    cdTower: facade("#bdb5a6", 3.8, 1.7, "#2a2f35", 0.45),
    cdBase: facade("#aaa296", 5.4, 4.2, "#2b2e33", 0.55),
    hotel: facade("#c9c1b2", 3.0, 3.6, "#363a40", 0.6),
    hall: facade("#8e8b85", 6.0, 5.0, "#2f2d2b", 0.4),
    windows: glow("#ffcf8a", 0.05, 2.2),
    clockFace: glow("#f4f0e2", 0.25, 2.6),
    crossLights: glow("#f6f4ff", 0.15, 4.5),
    neonRed: glow("#ff2a1f", 0.7, 5),
    rimLights: glow("#fff3d6", 0.1, 3),
    bioGlow: glow("#9fe6ff", 0.02, 1.4),
    // Complexe Desjardins: LED lines that turn the tower crowns green after dusk
    // Complexe Desjardins after dusk: LED fins (dark metal by day), and the crown's glass washed green from inside
    desjardinsGreen: lamp("#3d4642", "#2ee27a", 3.4),
    desjardinsSoft: lamp("#3d4642", "#22c06a", 1.6),
    desjardinsCrown: lamp("#2c3431", "#1c9a55", 0.22, 0.35, 0.4),
    foyer: glow("#f0b878", 0.06, 2.1),
    water: std("#1d3a4e", 0.08, 0.35),
    jets: glow("#e4f6ff", 0.25, 2.2, { transparent: true, opacity: 0.62, depthWrite: false }),
  };
}
export type LandmarkMaterials = ReturnType<typeof landmarkMaterials>;

/** A sign painted on a canvas: text in the given colour on a dark or clear board. */
export function signTexture(lines: Array<{ text: string; size: number; color: string; font?: string }>, w: number, h: number, board: string | null) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  if (board) { g.fillStyle = board; g.fillRect(0, 0, w, h); }
  const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
  let y = (h - total) / 2;
  for (const l of lines) {
    g.font = l.font ?? `800 ${l.size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = l.color;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(l.text, w / 2, y, w * 0.94);
    y += l.size * 1.15;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
