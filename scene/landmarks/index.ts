import * as THREE from "three";
import { BUILDING_EX, EXZ, project } from "@/lib/geo";
import { groundAt, surfaceAt, type Terrain } from "@/lib/formats/terrain";
import { LANDMARKS, type Landmark } from "@/lib/landmarks";
import { landmarkMaterials } from "./kit";
import { BUILDERS, type Animator } from "./models";

const RAD = Math.PI / 180;
/** round things keep true proportions; everything else matches the city's 1.15× building height */
const TRUE_SCALE = new Set(["biosphere", "wheel", "calder", "cross"]);

export function createLandmarks(scene: THREE.Scene, terrain: Terrain, shared: { uNight: { value: number } }) {
  const group = new THREE.Group();
  group.name = "landmarks";
  scene.add(group);
  const M = landmarkMaterials(shared.uNight);
  const animators: Animator[] = [];
  const placed: Array<{ l: Landmark; pos: THREE.Vector3; top: number }> = [];

  for (const l of LANDMARKS) {
    try {
      const built = BUILDERS[l.kind](l, M);
      const [x, y] = project(l.lat, l.lon);
      // sit on the lowest ground under the footprint so nothing floats on slopes
      const a = l.axis * RAD, ux = Math.sin(a), uy = Math.cos(a);
      let g = Infinity;
      for (const [du, dv] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]])
        g = Math.min(g, groundAt(terrain, x + (du * l.L * ux - dv * l.W * uy) / 2, y + (du * l.L * uy + dv * l.W * ux) / 2));
      if (l.kind === "wheel" || l.kind === "clocktower") g = Math.max(g, surfaceAt(terrain, x, y));
      const o = built.object;
      o.position.set(x, g * EXZ - 1, -y);
      o.rotation.y = (90 - l.axis) * RAD;
      if (!TRUE_SCALE.has(l.kind)) o.scale.y = BUILDING_EX;
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = c.castShadow || !((c as THREE.Mesh).material as THREE.Material).transparent;
          c.receiveShadow = true;
        }
      });
      o.userData.landmark = l.key;
      group.add(o);
      if (built.animate) animators.push(built.animate);
      placed.push({ l, pos: o.position.clone(), top: o.position.y + l.H * (TRUE_SCALE.has(l.kind) ? 1 : BUILDING_EX) });
    } catch (err) {
      console.error(`landmark ${l.key}`, err);
    }
  }

  // everything that lights up after dusk, including the signs' own materials
  const glowing = new Set<THREE.MeshStandardMaterial>();
  group.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && (m.userData as { glow?: unknown }).glow) glowing.add(m);
  });

  return {
    group,
    placed,
    update(t: number, night: number) {
      for (const m of glowing) {
        const [day, n] = (m.userData as { glow: [number, number] }).glow;
        m.emissiveIntensity = day + (n - day) * night;
      }
      for (const a of animators) a(t, night);
    },
  };
}
export type Landmarks = ReturnType<typeof createLandmarks>;
