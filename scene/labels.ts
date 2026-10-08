import * as THREE from "three";
import { EXZ, project } from "@/lib/geo";
import { surfaceAt, type Terrain } from "@/lib/formats/terrain";

/** Place names floating over the model: [text, lat, lon, class, min zoom-out (m), max (m)] */
const PLACES: Array<[string, number, number, "" | "major" | "water" | "minor", number, number]> = [
  ["Mont Royal", 45.5062, -73.5885, "major", 0, 60000],
  ["Fleuve Saint-Laurent", 45.5005, -73.5345, "water", 0, 60000],
  ["Rivière des Prairies", 45.586, -73.66, "water", 0, 60000],
  ["Lac Saint-Louis", 45.415, -73.8, "water", 9000, 60000],
  ["Ville-Marie", 45.499, -73.565, "", 0, 26000],
  ["Vieux-Port", 45.505, -73.55, "minor", 0, 12000],
  ["Plateau", 45.525, -73.58, "", 0, 26000],
  ["Mile End", 45.5262, -73.601, "minor", 0, 12000],
  ["Rosemont", 45.548, -73.58, "", 0, 26000],
  ["Villeray", 45.548, -73.6215, "", 0, 26000],
  ["Hochelaga", 45.5445, -73.542, "", 0, 26000],
  ["Verdun", 45.4585, -73.57, "", 0, 26000],
  ["Saint-Henri", 45.477, -73.587, "minor", 0, 12000],
  ["Côte-des-Neiges", 45.495, -73.627, "", 0, 26000],
  ["Outremont", 45.5185, -73.609, "minor", 0, 14000],
  ["NDG", 45.4735, -73.615, "minor", 0, 16000],
  ["Westmount", 45.4835, -73.598, "minor", 0, 14000],
  ["Saint-Laurent", 45.5135, -73.69, "", 6000, 40000],
  ["Ahuntsic", 45.556, -73.665, "", 4000, 40000],
  ["Montréal-Nord", 45.5975, -73.632, "", 6000, 40000],
  ["Anjou", 45.6045, -73.56, "", 6000, 40000],
  ["Saint-Léonard", 45.587, -73.595, "", 6000, 40000],
  ["LaSalle", 45.43, -73.63, "", 6000, 40000],
  ["Lachine", 45.44, -73.69, "", 6000, 40000],
  ["Dorval", 45.448, -73.75, "", 9000, 60000],
  ["Pointe-Claire", 45.455, -73.815, "", 9000, 60000],
  ["Pierrefonds", 45.495, -73.85, "", 9000, 60000],
  ["Laval", 45.575, -73.74, "major", 9000, 60000],
  ["Longueuil", 45.533, -73.51, "major", 6000, 60000],
  ["Brossard", 45.455, -73.465, "", 9000, 60000],
  ["Parc Jean-Drapeau", 45.5135, -73.5335, "minor", 0, 14000],
  ["Pointe-aux-Trembles", 45.65, -73.505, "", 9000, 60000],
];

export function createLabels(host: HTMLElement, terrain: Terrain) {
  const el = document.createElement("div");
  el.className = "labels";
  el.setAttribute("aria-hidden", "true");
  host.appendChild(el);
  const items = PLACES.map(([text, lat, lon, cls, min, max]) => {
    const d = document.createElement("div");
    d.className = "lbl" + (cls ? " " + cls : "");
    d.textContent = text;
    el.appendChild(d);
    const [x, y] = project(lat, lon);
    return { d, min, max, major: cls === "major" || cls === "water", v: new THREE.Vector3(x, surfaceAt(terrain, x, y) * EXZ + (cls === "major" ? 70 : 30), -y) };
  });
  const PV = new THREE.Vector3();
  function update(camera: THREE.PerspectiveCamera, W: number, H: number, camDist: number) {
    for (const L of items) {
      PV.copy(L.v).project(camera);
      const inView = PV.z < 1 && PV.x > -1.1 && PV.x < 1.1 && PV.y > -1.1 && PV.y < 1.1;
      const zoomOk = camDist >= L.min * 0.8 && camDist <= L.max;
      if (!inView || !zoomOk) { L.d.style.opacity = "0"; continue; }
      const d = camera.position.distanceTo(L.v);
      const fade = Math.min(1, (camDist - L.min * 0.8) / Math.max(1, L.min * 0.2 + 1)) * Math.min(1, (L.max - camDist) / (L.max * 0.2));
      const op = Math.max(0, Math.min(1, 1.5 - d / 40000)) * Math.max(0, Math.min(1, fade)) * (camDist < 1800 && !L.major ? 0.45 : 1);
      L.d.style.opacity = op.toFixed(2);
      L.d.style.transform = `translate(${(((PV.x + 1) / 2) * W).toFixed(1)}px,${(((1 - PV.y) / 2) * H).toFixed(1)}px) translate(-50%,-50%)`;
    }
  }
  return { update, dispose: () => el.remove() };
}
