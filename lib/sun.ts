/** Solar position (SunCalc's formulas) for Montréal, driven by the story clock. */
const RAD = Math.PI / 180;
const OBL = RAD * 23.4397;
export const MTL = { lat: 45.508, lon: -73.57 };

/** altitude (rad, above horizon) and azimuth (rad, clockwise from north) */
export function sunPos(ms: number, lat = MTL.lat, lng = MTL.lon) {
  const lw = RAD * -lng, phi = RAD * lat;
  const d = ms / 86400000 - 0.5 + 2440588 - 2451545;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBL) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBL), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  return {
    alt: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)),
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI,
  };
}

const offF = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** UTC epoch ms of a Montréal wall-clock minute on a given date (YYYY-MM-DD) */
export function montrealMs(dateISO: string, minute: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const noonUtc = Date.UTC(y, m - 1, d, 16, 0);
  const p = Object.fromEntries(offF.formatToParts(new Date(noonUtc)).map((x) => [x.type, x.value]));
  const offsetMs = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - noonUtc;
  return Date.UTC(y, m - 1, d, 0, 0) + minute * 60000 - offsetMs;
}

const WINDS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (azRad: number) => WINDS[Math.round((((azRad / RAD) % 360) + 360) % 360 / 22.5) % 16];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

/** sunrise and sunset (minutes after local midnight) for a date, with the −0.833° refraction horizon */
export function sunTimes(dateISO: string) {
  let rise = -1, set = -1, prev = -90;
  for (let m = 0; m <= 1440; m += 1) {
    const a = sunPos(montrealMs(dateISO, m)).alt / RAD;
    if (prev < -0.833 && a >= -0.833 && rise < 0) rise = m;
    if (prev >= -0.833 && a < -0.833 && rise >= 0) set = m;
    prev = a;
  }
  return { rise, set, riseText: rise >= 0 ? hhmm(rise) : "—", setText: set >= 0 ? hhmm(set) : "—" };
}
