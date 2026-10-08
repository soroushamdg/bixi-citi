/**
 * The 3D shots of the showreel. Cameras are [lat, lon, distance m, bearing the
 * camera faces °, tilt from vertical °] keys over the shot (t 0…1), the same
 * View the app uses. Time-of-day and data come from the app's real state.
 */
const DAY = "2026-08-06"; // the story day: a real Thursday, 82,616 rides
const NIGHT = { date: DAY, minute: 22 * 60 + 40 };
const GOLDEN = { date: DAY, minute: 19 * 60 + 20 };

/** landmark specs from lib/landmarks.ts: lat, lon, axis (front), height, framing distance */
const LM = {
  biosphere: [45.514094, -73.531427, 122.5, 62, 900],
  stadium: [45.557759, -73.551635, 346.5, 60, 2400],
  habitat: [45.499897, -73.543635, 4.3, 38, 1300],
  oratory: [45.491762, -73.618237, 216.7, 78, 1100],
  pvm: [45.501585, -73.568632, 124.4, 188, 1500],
  fiveroses: [45.49197, -73.55067, 305, 46, 700],
  wheel: [45.508476, -73.54866, 268.2, 60, 650],
};

/** a slow orbit in front of a landmark */
const orbit = (key, { side = [12, 38], dist = 1, tilt = [63, 67], lift = 0.35 } = {}) => {
  const [lat, lon, axis, H, view] = LM[key];
  return [0, 1].map((t) => ({
    t,
    v: [lat, lon, view * dist * (t ? 0.9 : 1), (axis + 180 + side[t] + 360) % 360, tilt[t]],
    lift: H * lift,
  }));
};

export const SHOTS = [
  {
    // dusk over the Old Port, pushing in on downtown with the evening rides
    name: "city", frames: 270, mode: "flows", minute: [1165, 1195], t0: 10,
    cam: [
      { t: 0, v: [45.493, -73.552, 6400, 322, 61] },
      { t: 0.55, v: [45.4985, -73.5615, 3900, 309, 68], lift: 30 },
      { t: 1, v: [45.503, -73.5685, 2350, 300, 73], lift: 70 },
    ],
  },
  {
    // the network right now: pillars rise out of the city at night
    name: "live", frames: 240, mode: "live", from: "flows", minute: 1360, t0: 30,
    sun: { date: "2026-10-08", minute: 20 * 60 + 45 },
    cam: [
      { t: 0, v: [45.5105, -73.5745, 3700, 250, 63] },
      { t: 1, v: [45.5105, -73.5745, 2800, 296, 69] },
    ],
    ease: "sine",
  },
  {
    // a whole real day, 05:30 → 23:30, sunrise to night
    name: "day", frames: 300, mode: "flows", minute: [330, 1410], t0: 50, sub: 3,
    cam: [
      { t: 0, v: [45.519, -73.6, 16500, 294, 50] },
      { t: 1, v: [45.516, -73.598, 13000, 316, 56] },
    ],
    ease: "sine",
  },
  {
    name: "jcb", frames: 66, mode: "flows", minute: 1225, sun: { date: DAY, minute: 1225 }, t0: 70,
    cam: [
      { t: 0, v: [45.5218, -73.5418, 720, 4, 80], lift: 50 },
      { t: 1, v: [45.5218, -73.5418, 640, 18, 80], lift: 50 },
    ],
    ease: "linear",
  },
  {
    name: "pvm", frames: 66, mode: "flows", minute: NIGHT.minute, sun: NIGHT, t0: 80,
    cam: orbit("pvm", { side: [-10, 8], dist: 1.25, tilt: [76, 77], lift: 0.55 }), ease: "linear",
  },
  {
    name: "roses", frames: 66, mode: "flows", minute: NIGHT.minute, sun: NIGHT, t0: 90,
    cam: orbit("fiveroses", { side: [16, 30], dist: 0.32, tilt: [74, 75], lift: 0.95 }), ease: "linear",
  },
  {
    name: "wheel", frames: 66, mode: "flows", minute: NIGHT.minute, sun: NIGHT, t0: 100,
    cam: orbit("wheel", { side: [30, 14], dist: 0.8, tilt: [73, 75], lift: 0.5 }), ease: "linear",
  },
  {
    // fast-forward through the busiest season on record
    name: "years", frames: 270, mode: "years", year: 2025, yday: [105, 318], t0: 120,
    cam: [
      { t: 0, v: [45.516, -73.6, 18500, 300, 48] },
      { t: 1, v: [45.514, -73.598, 15000, 320, 53] },
    ],
    ease: "sine",
  },
  {
    name: "biosphere", frames: 66, mode: "flows", minute: GOLDEN.minute, sun: GOLDEN, t0: 140,
    cam: orbit("biosphere", { side: [10, 30], dist: 0.7, tilt: [66, 68] }), ease: "linear",
  },
  {
    name: "stadium", frames: 66, mode: "flows", minute: GOLDEN.minute, sun: GOLDEN, t0: 150,
    cam: orbit("stadium", { side: [40, 56], dist: 0.5, tilt: [68, 70] }), ease: "linear",
  },
  {
    name: "habitat", frames: 66, mode: "flows", minute: GOLDEN.minute, sun: GOLDEN, t0: 160,
    cam: orbit("habitat", { side: [-24, -6], dist: 0.38, tilt: [71, 73], lift: 0.5 }), ease: "linear",
  },
  {
    name: "oratory", frames: 66, mode: "flows", minute: GOLDEN.minute, sun: GOLDEN, t0: 170,
    cam: orbit("oratory", { side: [8, 24], dist: 0.6, tilt: [71, 73], lift: 0.5 }), ease: "linear",
  },
  {
    // pull back from downtown to the whole region at night
    name: "outro", frames: 300, mode: "flows", minute: [1330, 1370], sun: { date: DAY, minute: [1330, 1370] }, t0: 190,
    cam: [
      { t: 0, v: [45.5035, -73.569, 2600, 300, 72], lift: 60 },
      { t: 0.45, v: [45.508, -73.585, 9000, 304, 62] },
      { t: 1, v: [45.522, -73.64, 40000, 312, 44] },
    ],
    ease: "inout",
  },
];
