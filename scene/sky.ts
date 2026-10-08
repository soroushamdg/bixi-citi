import * as THREE from "three";
import { sunPos } from "@/lib/sun";

const RAD = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ss = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** sky keyframes by solar altitude (deg): zenith, horizon */
const SKYK: Array<[number, string, string]> = [
  [-18, "#04060b", "#0a0e18"], [-8, "#08101f", "#18213b"], [-2, "#18264b", "#6e4c58"], [2, "#294372", "#e49a66"],
  [9, "#36609a", "#d6b08c"], [22, "#3d6ca5", "#a9bed1"], [60, "#3a68a3", "#9cb6cc"],
];

export interface SunState {
  alt: number; // degrees
  az: number; // radians from north
  day: number; // 0..1
  night: number; // 0..1
  gold: number; // 0..1
}

export function createSky(scene: THREE.Scene) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uSunI: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: /* glsl */ `uniform vec3 uTop,uHor,uSun,uSunCol;uniform float uSunI;varying vec3 vDir;
      void main(){vec3 d=normalize(vDir);float h=d.y;vec3 c=mix(uHor,uTop,pow(clamp(h,0.,1.),.5));if(h<0.)c=uHor*mix(1.,.55,clamp(-h*6.,0.,1.));
        float s=max(dot(d,normalize(uSun)),0.);c+=uSunCol*uSunI*(pow(s,900.)*6.+pow(s,10.)*.35+pow(s,2.)*.06);gl_FragColor=vec4(c,1.);}`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150000, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0x000000, 14000, 90000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2420, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 3;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x8fa7d6, 0);
  moon.position.set(-4000, 7000, 3000);
  scene.add(moon);

  const cA = new THREE.Color(), cB = new THREE.Color();
  const sunDir = new THREE.Vector3();
  const state: SunState = { alt: 0, az: 0, day: 0, night: 0, gold: 0 };
  let lastMs = NaN;

  function skyCols(a: number, top: THREE.Color, hor: THREE.Color) {
    let k = 0;
    while (k < SKYK.length - 2 && a > SKYK[k + 1][0]) k++;
    const A = SKYK[k], B = SKYK[k + 1], t = clamp((a - A[0]) / (B[0] - A[0]), 0, 1);
    top.copy(cA.set(A[1])).lerp(cB.set(B[1]), t);
    hor.copy(cA.set(A[2])).lerp(cB.set(B[2]), t);
  }

  /** Place the sun for a UTC instant. `focus` is where the shadow camera looks (scene coords). */
  function apply(ms: number, focus: THREE.Vector3, shadowSpan: number) {
    if (Math.abs(ms - lastMs) > 15000) {
      lastMs = ms;
      const p = sunPos(ms);
      const a = p.alt / RAD;
      sunDir.set(Math.sin(p.az) * Math.cos(p.alt), Math.sin(p.alt), -Math.cos(p.az) * Math.cos(p.alt)).normalize();
      state.alt = a; state.az = p.az;
      state.day = ss(-4, 10, a);
      state.night = 1 - ss(-9, 1, a);
      state.gold = a > -3 ? Math.exp(-0.5 * ((a - 5) / 6) ** 2) : 0;
      const u = skyMat.uniforms;
      skyCols(a, u.uTop.value, u.uHor.value);
      u.uSun.value.copy(sunDir);
      u.uSunCol.value.set(0xffc58a).lerp(cB.set(0xfff3e0), ss(5, 30, a));
      u.uSunI.value = ss(-6, 2, a);
      (scene.fog as THREE.Fog).color.copy(u.uHor.value).multiplyScalar(0.85);
      sun.color.set(0xffa25e).lerp(cB.set(0xfff1df), ss(3, 28, a));
      sun.intensity = 3.9 * ss(-1.5, 7, a) + 0.7 * state.gold;
      hemi.color.set(0x1b2645).lerp(cB.set(0xbcd0e6), state.day);
      hemi.groundColor.set(0x14110f).lerp(cB.set(0x4a4038), state.day);
      hemi.intensity = 0.32 + 0.5 * state.day;
      moon.intensity = 0.45 * state.night;
    }
    // the shadow box follows what the camera looks at
    const span = clamp(shadowSpan, 1500, 9000);
    const sc = sun.shadow.camera;
    if (sc.right !== span) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 100; sc.far = 40000;
      sc.updateProjectionMatrix();
    }
    sun.position.copy(sunDir).multiplyScalar(14000).add(focus);
    sun.target.position.copy(focus);
  }

  return {
    sky,
    horizon: skyMat.uniforms.uHor.value as THREE.Color,
    sun,
    hemi,
    state,
    sunDir,
    apply,
    exposure: () => 0.82 + 0.22 * state.day,
    bloom: () => ({ strength: 0.36 + 0.44 * state.night, threshold: lerp(0.92, 0.62, state.night) }),
    nightGlow: () => state.night * 0.95 + 0.25 * state.gold * (state.alt < 4 ? 1 : 0),
  };
}
export type Sky = ReturnType<typeof createSky>;
