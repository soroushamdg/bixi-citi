import * as THREE from "three";
import { EXZ } from "@/lib/geo";
import { decodeTerrain, type Terrain } from "@/lib/formats/terrain";
import type { CityIndex } from "@/lib/formats/city";
import { fetchGz } from "@/lib/load";
import { SNOISE } from "./glsl";
import type { Quality } from "./quality";

export interface Shared {
  uTime: { value: number };
  uNight: { value: number };
  uHorizon: { value: THREE.Color };
  uMask: { value: THREE.Texture | null };
  uBikes: { value: THREE.Texture | null };
  /** world rect of the mask texture: x0, y0 (south), width, height in metres */
  uMaskRect: { value: THREE.Vector4 };
  uLed: { value: THREE.Color };
  uCycleGlow: { value: number };
}

export async function loadMaskTexture(url: string, renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  const blob = await (await fetch(url)).blob();
  // raw channels: no premultiplication or colour conversion, south at v = 0
  const bmp = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const tex = new THREE.Texture(bmp);
  tex.flipY = false;
  tex.premultiplyAlpha = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

const MASK_GLSL = /* glsl */ `
uniform sampler2D uMask, uBikes;
uniform vec4 uMaskRect;
/* r land, g green, b streets, a bike network */
vec4 maskAt(vec3 w){
  vec2 uv = vec2((w.x - uMaskRect.x) / uMaskRect.z, (-w.z - uMaskRect.y) / uMaskRect.w);
  return vec4(texture2D(uMask, uv).rgb, texture2D(uBikes, uv).r);
}
`;

export function createTerrain(t: Terrain, shared: Shared, q: Quality) {
  const S = q.terrainStride;
  const nx = Math.floor((t.nx - 1) / S) + 1, ny = Math.floor((t.ny - 1) / S) + 1;
  const pos = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = (j * S) * t.nx + i * S, o = (j * nx + i) * 3;
      pos[o] = t.x0 + i * S * t.dx;
      pos[o + 1] = t.ground[k] * EXZ;
      pos[o + 2] = -(t.y0 + j * S * t.dx);
    }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let p = 0;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = c; idx[p++] = b; idx[p++] = d; idx[p++] = c;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, {
      cLand: { value: new THREE.Color("#30353c") }, cHigh: { value: new THREE.Color("#4a4c4e") },
      cPark: { value: new THREE.Color("#34573a") }, cStreet: { value: new THREE.Color("#454a53") },
      cBed: { value: new THREE.Color("#0a131b") }, cBike: { value: new THREE.Color("#6a5c45") },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vW;${MASK_GLSL}uniform vec3 cLand,cHigh,cPark,cStreet,cBed,cBike,uLed;uniform float uNight,uCycleGlow;`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec4 m = maskAt(vW);
        float hTrue = vW.y / ${EXZ.toFixed(2)};
        vec3 c = mix(cLand, cHigh, smoothstep(60., 200., hTrue));
        c = mix(c, cPark, m.g * 0.9);
        c = mix(c, cStreet, m.b * 0.8);
        c = mix(c, cBike, m.a * 0.55);
        c = mix(cBed, c, smoothstep(.3, .6, m.r));
        diffuseColor.rgb = c;
        float bikeGlow = m.a * smoothstep(.3, .6, m.r);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLed * bikeGlow * uCycleGlow * (0.06 + uNight * 0.32);",
      );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";

  // a dark plinth so the region reads as a model sitting on the console
  const x0 = t.x0, x1 = t.x0 + (t.nx - 1) * t.dx, y0 = t.y0, y1 = t.y0 + (t.ny - 1) * t.dx;
  const skirt: number[] = [];
  const edge = (i: number, j: number) => {
    const k = (j * S) * t.nx + i * S;
    return [t.x0 + i * S * t.dx, Math.max(t.ground[k], Number.isNaN(t.water[k]) ? -1e9 : t.water[k]) * EXZ, -(t.y0 + j * S * t.dx)];
  };
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < nx; i++) ring.push([i, 0]);
  for (let j = 1; j < ny; j++) ring.push([nx - 1, j]);
  for (let i = nx - 2; i >= 0; i--) ring.push([i, ny - 1]);
  for (let j = ny - 2; j >= 0; j--) ring.push([0, j]);
  ring.push(ring[0]);
  const BOTTOM = -420;
  for (let r = 0; r < ring.length - 1; r++) {
    const a = edge(...ring[r]), b = edge(...ring[r + 1]);
    skirt.push(a[0], a[1], a[2], a[0], BOTTOM, a[2], b[0], b[1], b[2], b[0], b[1], b[2], a[0], BOTTOM, a[2], b[0], BOTTOM, b[2]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  sg.computeVertexNormals();
  const skirtMesh = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x171a21, roughness: 0.95, side: THREE.DoubleSide }));
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry((x1 - x0) * 1.03, (y1 - y0) * 1.03).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0c0e12 }),
  );
  base.position.set((x0 + x1) / 2, BOTTOM - 2, -(y0 + y1) / 2);

  const group = new THREE.Group();
  group.add(mesh, skirtMesh, base);
  return { group, mesh, bounds: { x0, x1, y0, y1 } };
}

/**
 * Water surfaces from the DEM-derived levels: a mesh over every grid cell with
 * water, clipped per pixel by the OSM mask. Flow follows the downhill gradient
 * of the surface, so the Lachine rapids run fast and white, lakes barely move.
 */
export function createWater(t: Terrain, shared: Shared) {
  const n = t.nx * t.ny;
  const map = new Int32Array(n).fill(-1);
  const pos: number[] = [], flow: number[] = [];
  const L = t.water;
  const lv = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= t.nx || j >= t.ny) return NaN;
    return L[j * t.nx + i];
  };
  for (let j = 0; j < t.ny; j++)
    for (let i = 0; i < t.nx; i++) {
      const k = j * t.nx + i;
      if (Number.isNaN(L[k])) continue;
      map[k] = pos.length / 3;
      pos.push(t.x0 + i * t.dx, L[k] * EXZ + 0.6, -(t.y0 + j * t.dx));
      // downhill gradient over ±3 cells (metres per metre)
      const R = 3;
      const ex = lv(i + R, j), wx = lv(i - R, j), nn = lv(i, j + R), sy = lv(i, j - R);
      // a jump of metres between neighbours is a lock or another water body, not a current
      const ok = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) < 2.5;
      const gx = ok(ex, wx) ? (wx - ex) / (2 * R * t.dx) : 0;
      const gy = ok(nn, sy) ? (sy - nn) / (2 * R * t.dx) : 0;
      // world (x, y north) -> scene (x, z = -y)
      flow.push(gx, -gy, Math.hypot(gx, gy));
    }
  const idx: number[] = [];
  for (let j = 0; j < t.ny - 1; j++)
    for (let i = 0; i < t.nx - 1; i++) {
      const a = map[j * t.nx + i], b = map[j * t.nx + i + 1], c = map[(j + 1) * t.nx + i], d = map[(j + 1) * t.nx + i + 1];
      // counter-clockwise seen from above, like the terrain
      if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c);
      if (b >= 0 && d >= 0 && c >= 0) idx.push(b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ color: 0x0c1f2b, roughness: 0.22, metalness: 0.2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aFlow;varying vec3 vW;varying vec3 vFlow;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;vFlow = aFlow;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vW;varying vec3 vFlow;uniform float uTime,uNight;uniform vec3 uHorizon;${MASK_GLSL}${SNOISE}
        float wH(vec2 p, vec2 adv, float spd){
          return snoise(p * .010 - adv) * .55 + snoise(p * .027 - adv * 1.9 + 7.3) * .3 + snoise(p * .07 - adv * 3.1 - 3.1) * .15 * (.4 + spd);
        }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        vec4 wm = maskAt(vW);
        float wet = 1. - wm.r;
        if (wet < .5) discard;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        float g = vFlow.z;
        float spd = smoothstep(.0003, .005, g);
        vec2 dir = g > 1e-6 ? vFlow.xy / g : vec2(.6, -.8);
        vec2 P = vW.xz;
        // flow map: two phases of bounded advection blended so offsets never grow,
        // which keeps the surface from shearing where the current turns
        float T = .045, ph0 = fract(uTime * T), ph1 = fract(uTime * T + .5);
        float reach = 30. + 140. * spd;
        vec2 o0 = dir * ph0 * reach, o1 = dir * ph1 * reach;
        vec2 wind = vec2(.011, .017) * uTime;
        float wgt = abs(ph0 - .5) * 2.;
        float e = 5.;
        #define WH(p) mix(wH((p) - o0, wind, spd), wH((p) - o1 + 41.3, wind, spd), wgt)
        float h0 = WH(P), hx = WH(P + vec2(e, 0.)), hz = WH(P + vec2(0., e));
        float k = 2.2 + 2.5 * spd;
        vec3 nW = normalize(vec3(-(hx - h0) / e * k, 1., -(hz - h0) / e * k));
        normal = normalize((viewMatrix * vec4(nW, 0.)).xyz);
        // soft streaks carried by the same flow
        float streak = smoothstep(.4, .95, mix(snoise((P - o0) * .006), snoise((P - o1) * .006 + 17.1), wgt));
        // white water only on real rapids, in soft patches that drift downstream
        float foam = smoothstep(.75, 1., spd) * smoothstep(.2, .85, mix(snoise((P - o0) * .0045), snoise((P - o1) * .0045 + 5.3), wgt) * .5 + .5);
        float shore = 1. - smoothstep(.5, .6, wet);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1. - clamp(dot(V, nW), 0., 1.), 4.);
        float day = 1. - uNight;
        // the sky, mirrored at grazing angles and broken up by the ripples
        totalEmissiveRadiance += uHorizon * (.025 + .32 * fres) * (.35 + .65 * day);
        totalEmissiveRadiance += uHorizon * streak * (.035 + .03 * spd) * day;
        totalEmissiveRadiance += vec3(.8, .87, .9) * (foam * .22 + shore * .05) * (.3 + .7 * day);`,
      );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = "water";
  return mesh;
}

export async function loadTerrain(index: CityIndex) {
  return decodeTerrain(await fetchGz(`/city/${index.terrain.file}`));
}
