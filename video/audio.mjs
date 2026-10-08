/**
 * The showreel soundtrack, synthesised from scratch (no samples): 120 BPM in
 * A minor, every hit, whoosh and blip placed on a cut or a move of the picture.
 *
 *   node video/audio.mjs   → video/build/audio.wav (48 kHz, 16-bit stereo, 30 s)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SR = 48000, DUR = 30, N = SR * DUR;
const TAU = Math.PI * 2;
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus(), music = bus(), fx = bus(), send = bus();
const duck = new Float32Array(N).fill(1);

/* ---------------------------------------------------------------- tools */
let seed = 1234567;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rand() * 2 - 1;
const S = (t) => Math.round(t * SR);
const panGains = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];
function put(b, i, v, pan = 0, sendAmt = 0) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = panGains(pan);
  b[0][i] += v * gl;
  b[1][i] += v * gr;
  if (sendAmt) { send[0][i] += v * gl * sendAmt; send[1][i] += v * gr * sendAmt; }
}
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set("lp", 1000, 0.707); }
  set(type, f, q = 0.707) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (TAU * f) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; } // band-pass, constant peak gain
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
/** band-limited saw (polyBLEP) */
function saw() {
  let ph = rand();
  return (f) => {
    const dt = f / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let v = 2 * ph - 1;
    if (ph < dt) { const x = ph / dt; v -= x + x - x * x - 1; }
    else if (ph > 1 - dt) { const x = (ph - 1) / dt; v -= x * x + x + x + 1; }
    return v;
  };
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ---------------------------------------------------------------- the score */
// chords (MIDI): root for the bass, voicing for the pad
const CH = {
  Am: { root: 45, pad: [57, 60, 64, 71] },
  F: { root: 41, pad: [53, 57, 60, 67] },
  C: { root: 48, pad: [55, 60, 64, 67] },
  G: { root: 43, pad: [55, 59, 62, 69] },
};
const CHORDS = [[0, "Am"], [3, "Am"], [5, "F"], [7, "C"], [9, "G"], [11, "Am"], [13, "F"], [15, "C"], [17, "G"], [19, "Am"], [21, "F"], [22.5, "C"], [24.5, "G"], [25.5, "Am"], [27, "F"], [28.25, "G"], [29, "Am"]];
const chordAt = (t) => { let c = CHORDS[0]; for (const k of CHORDS) if (t >= k[0]) c = k; return CH[c[1]]; };
/** where the full groove plays */
const GROOVE = [[3, 12.5], [15.5, 19], [22.5, 27]];
const NIGHT = [12.5, 15.5];
const inAny = (t, spans) => spans.some(([a, b]) => t >= a && t < b);

/* ---------------------------------------------------------------- drums */
function kick(t, amp = 1) {
  const i0 = S(t), len = S(0.55);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const f = 44 + 120 * Math.exp(-x * 32);
    ph += (TAU * f) / SR;
    const env = Math.exp(-x * 6.5);
    const click = k < 120 ? noise() * (1 - k / 120) * 0.35 : 0;
    put(drums, i0 + k, (Math.tanh(Math.sin(ph) * 1.6) * env + click) * 0.9 * amp);
    // sidechain the music under it
    const d = 1 - 0.62 * Math.exp(-x * 9) * amp;
    if (i0 + k < N) duck[i0 + k] = Math.min(duck[i0 + k], d);
  }
}
function clap(t, amp = 1) {
  const bp = new Biquad().set("bp", 1400, 0.9), i0 = S(t);
  for (let k = 0; k < S(0.32); k++) {
    const x = k / SR;
    const bursts = x < 0.03 ? (Math.floor(x / 0.01) % 2 === 0 ? 1 : 0.3) : 1;
    const env = Math.exp(-x * 18) * bursts;
    const v = bp.run(noise()) * env * 1.6 * amp;
    put(drums, i0 + k, v, 0.05, 0.35);
  }
}
function hat(t, open = false, amp = 1, pan = 0.15) {
  const hp = new Biquad().set("hp", 7000, 0.8), lp = new Biquad().set("lp", 12500, 0.7), i0 = S(t);
  const dec = open ? 14 : 60;
  for (let k = 0; k < S(open ? 0.22 : 0.05); k++) {
    const v = lp.run(hp.run(noise())) * Math.exp((-k / SR) * dec) * 0.24 * amp;
    put(drums, i0 + k, v, pan);
  }
}
function crash(t, amp = 1, len = 2.2) {
  const hp = new Biquad().set("hp", 3800, 0.6), lp = new Biquad().set("lp", 10500, 0.6), i0 = S(t);
  for (let k = 0; k < S(len); k++) {
    const x = k / SR;
    const v = lp.run(hp.run(noise())) * Math.exp(-x * 2.6) * 0.3 * amp;
    put(drums, i0 + k, v, (k % 2 ? 0.4 : -0.4) * 0.5, 0.4);
  }
}

/* ---------------------------------------------------------------- fx */
function boom(t, amp = 1) {
  const i0 = S(t);
  let ph = 0;
  const lp = new Biquad().set("lp", 900, 0.7);
  for (let k = 0; k < S(2.4); k++) {
    const x = k / SR;
    const f = 32 + 70 * Math.exp(-x * 7);
    ph += (TAU * f) / SR;
    const body = Math.tanh(Math.sin(ph) * 2) * Math.exp(-x * 1.9);
    const dust = lp.run(noise()) * Math.exp(-x * 4) * 0.5;
    put(fx, i0 + k, (body * 0.95 + dust) * amp, 0, 0.5);
    const d = 1 - 0.7 * Math.exp(-x * 3) * amp;
    if (i0 + k < N) duck[i0 + k] = Math.min(duck[i0 + k], d);
  }
}
/** filtered-noise sweep; pan moves from p0 to p1 */
function whoosh(t, len, f0, f1, amp = 1, p0 = 0, p1 = 0, shape = "swell") {
  const bp = new Biquad(), i0 = S(t), n = S(len);
  for (let k = 0; k < n; k++) {
    const u = k / n;
    if (k % 32 === 0) bp.set("bp", f0 * Math.pow(f1 / f0, u), 1.1);
    const env = shape === "rise" ? Math.pow(u, 2.2) : shape === "fall" ? Math.pow(1 - u, 2) : Math.sin(Math.PI * u) ** 1.5;
    put(fx, i0 + k, bp.run(noise()) * env * 0.9 * amp, p0 + (p1 - p0) * u, 0.35);
  }
}
function riser(t, len, amp = 1) {
  whoosh(t, len, 300, 9000, 0.8 * amp, -0.3, 0.3, "rise");
  const i0 = S(t), n = S(len);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    ph += (TAU * (110 * Math.pow(8, u))) / SR;
    put(fx, i0 + k, Math.sin(ph) * Math.pow(u, 3) * 0.16 * amp, 0, 0.4);
  }
}
/** FM bell / pluck */
function bell(t, f, amp = 0.2, pan = 0, dec = 3, ratio = 2, index = 2.2, sendAmt = 0.45, buf = music) {
  const i0 = S(t), n = S(Math.min(2.5, 6 / dec));
  let pc = 0, pm = 0;
  for (let k = 0; k < n; k++) {
    const x = k / SR;
    pm += (TAU * f * ratio) / SR;
    const I = index * Math.exp(-x * dec * 2.2);
    pc += (TAU * f) / SR;
    const env = Math.exp(-x * dec) * Math.min(1, k / 40);
    put(buf, i0 + k, Math.sin(pc + I * Math.sin(pm)) * env * amp, pan, sendAmt);
  }
}
function tick(t, amp = 0.25, f = 3200, pan = 0) {
  const i0 = S(t), bp = new Biquad().set("bp", f, 3);
  for (let k = 0; k < S(0.03); k++) put(fx, i0 + k, bp.run(noise()) * Math.exp((-k / SR) * 160) * amp * 3, pan, 0.15);
}
function glitch(t, len) {
  const i0 = S(t), n = S(len);
  let hold = 0, v = 0;
  for (let k = 0; k < n; k++) {
    if (hold-- <= 0) { hold = 40 + Math.floor(rand() * 400); v = (rand() * 2 - 1) * (rand() < 0.5 ? 1 : 0.2); }
    const env = Math.pow(1 - k / n, 1.5);
    put(fx, i0 + k, Math.round(v * 6) / 6 * 0.22 * env, rand() * 2 - 1);
  }
}
function shimmer(t, notes, step = 0.045, amp = 0.09) {
  notes.forEach((m, i) => bell(t + i * step, hz(m), amp, i % 2 ? 0.5 : -0.5, 1.6, 3.01, 1.2, 0.8, fx));
}

/* ---------------------------------------------------------------- music */
function pad() {
  // chord segments with soft attack and an overlapping release
  CHORDS.forEach(([t0, name], ci) => {
    const t1 = ci + 1 < CHORDS.length ? CHORDS[ci + 1][0] : DUR;
    const att = t0 === 0 ? 1.6 : 0.25, rel = 0.7;
    const notes = CH[name].pad;
    const oscs = notes.flatMap((m) => [-0.11, 0, 0.12].map((d) => ({ f: hz(m + d), o: saw(), pan: d * 5 })));
    const lp = [new Biquad(), new Biquad()];
    const i0 = S(t0), n = S(t1 - t0 + rel);
    for (let k = 0; k < n; k++) {
      const t = t0 + k / SR;
      if (k % 64 === 0) {
        // darker at night and in the breakdown, open in the day and the finale
        const open = t < 3 ? 400 + 900 * (t / 3) : inAny(t, [NIGHT]) ? 900 : t >= 19 && t < 22 ? 1300 : t >= 27 ? 2600 : 2000;
        lp[0].set("lp", open, 0.8); lp[1].set("lp", open * 1.05, 0.8);
      }
      const env = Math.min(1, k / S(att)) * (t > t1 ? Math.max(0, 1 - (t - t1) / rel) : 1);
      let l = 0, r = 0;
      for (const v of oscs) { const s = v.o(v.f); const [gl, gr] = panGains(v.pan); l += s * gl; r += s * gr; }
      const g = 0.03 * env * (t < 3 ? Math.min(1, t / 1.2) : 1);
      const i = i0 + k;
      if (i >= N) break;
      const yl = lp[0].run(l) * g, yr = lp[1].run(r) * g;
      music[0][i] += yl; music[1][i] += yr;
      send[0][i] += yl * 0.5; send[1][i] += yr * 0.5;
    }
  });
}
function bassline() {
  const sub = { ph: 0 };
  const o = saw(), lp = new Biquad();
  let lastRoot = 0, noteT = -1;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const on = inAny(t, GROOVE) || inAny(t, [NIGHT]) || (t >= 19 && t < 22.5) || (t >= 27 && t < 29.8);
    if (!on) continue;
    const ch = chordAt(t);
    const eighth = Math.floor((t - 3) / 0.25);
    const tIn = t - 3 - eighth * 0.25;
    const pattern = [0, 0, 12, 0, 0, 7, 0, 12];
    const night = inAny(t, [NIGHT]) || (t >= 19 && t < 22.5) || t >= 27;
    const m = ch.root + (night ? 0 : pattern[((eighth % 8) + 8) % 8]);
    if (noteT !== eighth) { noteT = eighth; lastRoot = m; }
    const f = hz(lastRoot);
    const env = night ? 0.85 : Math.exp(-tIn * 7) * 0.9 + 0.1;
    if (i % 32 === 0) lp.set("lp", night ? 260 : 300 + 900 * Math.exp(-tIn * 12), 1.1);
    sub.ph += (TAU * hz(ch.root - 12)) / SR;
    const v = lp.run(o(f)) * env * 0.16 + Math.sin(sub.ph) * 0.17;
    music[0][i] += v; music[1][i] += v;
  }
}
function arps() {
  // 16th notes over the chord, two octaves; quieter in the breakdown
  for (let t = 3; t < 27; t += 0.125) {
    const groove = inAny(t, GROOVE), night = inAny(t, [NIGHT]), brk = t >= 19 && t < 22.5;
    if (!groove && !night && !brk) continue;
    const k = Math.round((t - 3) / 0.125);
    if (night && k % 2) continue; // sparser at night
    const ch = chordAt(t).pad;
    const seq = [0, 1, 2, 3, 2, 1, 2, 3];
    const m = ch[seq[k % 8]] + 12 + (k % 16 >= 8 ? 12 : 0);
    const amp = (groove ? 0.085 : brk ? 0.06 : 0.07) * (k % 4 === 0 ? 1.25 : 1);
    bell(t, hz(m), amp, Math.sin(k * 0.9) * 0.6, groove ? 7 : 4, 2, 1.4, 0.4);
  }
}
function drumsPattern() {
  for (let t = 3; t < 27; t += 0.125) {
    const groove = inAny(t, GROOVE);
    const night = inAny(t, [NIGHT]);
    const brk = t >= 19 && t < 22.5;
    const beat = Math.abs(((t - 3) / 0.5) % 1) < 1e-6;
    const off = Math.abs(((t - 3.25) / 0.5) % 1) < 1e-6;
    const k16 = Math.round((t - 3) / 0.125);
    if (groove) {
      if (beat) kick(t);
      if (Math.abs(((t - 3.5) / 1) % 1) < 1e-6) clap(t);
      if (off) hat(t, true, 0.55);
      else hat(t, false, k16 % 2 ? 0.55 : 0.8, k16 % 2 ? 0.25 : -0.1);
    } else if (night) {
      if (Math.abs(((t - 12.5) / 1) % 1) < 1e-6) kick(t, 0.9);
      if (k16 % 2 === 0) hat(t, false, 0.4);
    } else if (brk) {
      if (k16 % 2 === 0) hat(t, false, 0.35, 0.3);
      if (t >= 20.0 && t < 21.0 && beat) kick(t, 0.5); // a heartbeat under the tilt
    }
  }
}

/* ---------------------------------------------------------------- the edit */
function picture() {
  // INTRO — rides fly into one point (same seeded timings as the picture)
  let s = 7;
  const r = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let q = Math.imul(s ^ (s >>> 15), 1 | s);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  const PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91];
  for (let i = 0, NA = 30; i < NA; i++) {
    r(); r(); r(); r();
    const start = 0.04 + (i / NA) * 0.62 + r() * 0.04, dur = 0.42 + r() * 0.12;
    bell(start + dur, hz(PENTA[i % PENTA.length]), 0.042, ((i * 7) % 11) / 5.5 - 1, 5, 3, 1.6, 0.6, fx);
    whoosh(start, dur, 2500, 600, 0.09, ((i * 5) % 9) / 4.5 - 1, 0, "swell");
  }
  boom(0.96, 0.9);
  crash(0.96, 0.35, 1.6);
  for (let k = 0; k < 7; k++) tick(1.02 + k * 0.045, 0.22, 2400 + k * 300, -0.3 + k * 0.1);
  // one note per letter of the word, one tick per typed character (same strings as the picture)
  const WORD = "CITI", TAG = "STORYTELLING WITH BIXI MONTRÉAL DATA".length;
  for (let i = 0; i < WORD.length; i++) bell(1.5 + i * 0.05, hz(81 + [0, 3, 5, 7, 10][i]), 0.05, -0.4 + i * 0.2, 6, 2, 1, 0.5, fx);
  for (let k = 0; k < TAG; k++) if (k % 2 === 0) tick(1.75 + (k / TAG) * 0.55, 0.12, 4200, 0.2);
  riser(2.2, 0.8);
  whoosh(2.55, 0.55, 400, 3200, 0.5, 0, 0, "swell");
  // drop into the city
  crash(3.0, 1);
  boom(3.0, 0.55);
  // LIVE — hard cut with a chromatic glitch
  crash(6.0, 0.7);
  glitch(5.98, 0.22);
  // DAY — diagonal wipe left → right
  whoosh(8.2, 0.5, 700, 6000, 0.7, -0.9, 0.9);
  crash(8.5, 0.45);
  // NIGHT — whip pans on each cut
  [[12.5, 1], [13.25, -1], [14.0, 1], [14.75, -1]].forEach(([t, d]) => {
    whoosh(t - 0.08, 0.32, 5000, 500, 0.8, 0.8 * d, -0.8 * d, "fall");
    boom(t, 0.28);
  });
  // YEARS — shutters, a hit, then a rising blip for each season
  for (let k = 0; k < 14; k++) tick(15.3 + k * 0.03, 0.3, 1800 + k * 120, (k % 2 ? 1 : -1) * 0.6);
  crash(15.5, 0.8);
  boom(15.5, 0.45);
  const UP = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];
  UP.forEach((m, i) => bell(15.75 + i * 0.075, hz(m), 0.06, -0.6 + i * 0.1, 5, 2, 1.2, 0.5, fx));
  bell(17.05, hz(88), 0.08, 0.5, 2.2, 3.5, 2, 0.7, fx);
  // INTERFACE — shrink, panels land, tilt, theme wipe, dive
  whoosh(18.9, 0.8, 4000, 300, 0.6, 0, 0, "swell");
  [19.15, 19.22, 19.29, 19.36].forEach((t, i) => whoosh(t, 0.35, 900, 2600, 0.25, [0, -0.2, 0.8, 0][i], 0));
  boom(19.7, 0.3);
  whoosh(19.85, 0.75, 200, 1400, 0.45, -0.3, 0.3);
  whoosh(21.05, 0.55, 1400, 200, 0.35, 0.3, -0.3);
  shimmer(21.55, [81, 84, 88, 91, 93, 96, 100, 103], 0.05, 0.07);
  riser(21.7, 0.8, 1.1);
  // LANDMARKS — drop, then whips
  crash(22.5, 0.9);
  boom(22.5, 0.6);
  [[23.25, 1], [24.0, -1], [24.75, 1]].forEach(([t, d]) => {
    whoosh(t - 0.08, 0.32, 5000, 500, 0.75, 0.8 * d, -0.8 * d, "fall");
    boom(t, 0.24);
  });
  // OUTRO — light leak swell, the stack, the logo, the URL
  whoosh(25.25, 0.7, 300, 2400, 0.5, -0.6, 0.6);
  crash(25.5, 0.6);
  for (let i = 0; i < 7; i++) bell(25.8 + i * 0.07, hz([76, 79, 81, 84, 86, 88, 91][i]), 0.045, -0.6 + i * 0.2, 7, 2, 1, 0.4, fx);
  boom(27.05, 1);
  crash(27.05, 0.6, 2.6);
  shimmer(27.1, [69, 76, 81, 84, 88, 93], 0.045, 0.06);
  for (let i = 0; i < WORD.length; i++) tick(27.3 + i * 0.05, 0.14, 3000, -0.3 + i * 0.15);
  for (let k = 0; k < 20; k++) tick(27.65 + (k / 20) * 0.5, 0.12, 4400, 0);
  bell(28.25, hz(76), 0.07, 0, 1.2, 2, 1.5, 0.8, fx);
  bell(29.0, hz(57), 0.1, -0.2, 0.7, 1, 0.8, 0.9, fx);
  bell(29.0, hz(64), 0.08, 0.2, 0.7, 1, 0.8, 0.9, fx);
  bell(29.0, hz(72), 0.06, 0, 0.7, 2, 0.8, 0.9, fx);
}

/* ---------------------------------------------------------------- reverb */
function reverb([inL, inR]) {
  const comb = (d, fb, damp) => { const b = new Float32Array(d); let i = 0, lp = 0; return (x) => { const y = b[i]; lp = y * (1 - damp) + lp * damp; b[i] = x + lp * fb; i = (i + 1) % d; return y; }; };
  const ap = (d) => { const b = new Float32Array(d); let i = 0; return (x) => { const y = b[i]; const v = -x + y; b[i] = x + y * 0.5; i = (i + 1) % d; return v; }; };
  const mk = (sp) => ({ c: [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => comb(Math.round((d + sp) * (SR / 44100)), 0.86, 0.3)), a: [556, 441, 341, 225].map((d) => ap(Math.round((d + sp) * (SR / 44100)))) });
  const L = mk(0), R = mk(23);
  const out = bus();
  const pre = S(0.02);
  for (let i = 0; i < N; i++) {
    const xl = (i >= pre ? inL[i - pre] : 0) * 0.12, xr = (i >= pre ? inR[i - pre] : 0) * 0.12;
    let yl = 0, yr = 0;
    for (const c of L.c) yl += c(xl);
    for (const c of R.c) yr += c(xr);
    for (const a of L.a) yl = a(yl);
    for (const a of R.a) yr = a(yr);
    out[0][i] = yl; out[1][i] = yr;
  }
  return out;
}

/* ---------------------------------------------------------------- mix */
console.time("synth");
pad();
bassline();
arps();
drumsPattern();
picture();
console.timeEnd("synth");
const rev = reverb(send);
const outL = new Float32Array(N), outR = new Float32Array(N);
const hpL = new Biquad().set("hp", 28, 0.7), hpR = new Biquad().set("hp", 28, 0.7);
const lpL = new Biquad().set("lp", 15000, 0.6), lpR = new Biquad().set("lp", 15000, 0.6);
// smooth the sidechain a touch so it never clicks
let d = 1;
for (let i = 0; i < N; i++) {
  d += (duck[i] - d) * (duck[i] < d ? 0.2 : 0.0012);
  outL[i] = lpL.run(hpL.run(drums[0][i] + music[0][i] * d + fx[0][i] + rev[0][i] * 0.9));
  outR[i] = lpR.run(hpR.run(drums[1][i] + music[1][i] * d + fx[1][i] + rev[1][i] * 0.9));
}
// glue compressor + soft limiter
let env = 0;
const att = Math.exp(-1 / (0.004 * SR)), relc = Math.exp(-1 / (0.15 * SR));
const thr = 0.35, ratio = 3;
for (let i = 0; i < N; i++) {
  const a = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
  env = a > env ? att * env + (1 - att) * a : relc * env + (1 - relc) * a;
  const g = env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1;
  outL[i] *= g; outR[i] *= g;
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const makeup = 1.25 / peak;
const fadeIn = S(0.02), fadeOut = S(0.45);
for (let i = 0; i < N; i++) {
  let g = makeup;
  if (i < fadeIn) g *= i / fadeIn;
  if (i > N - fadeOut) g *= Math.pow((N - i) / fadeOut, 1.5);
  outL[i] = Math.tanh(outL[i] * g) * 0.94;
  outR[i] = Math.tanh(outR[i] * g) * 0.94;
}

/* ---------------------------------------------------------------- wav */
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i])) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i])) * 32767), i * 4 + 2);
}
const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
head.write("data", 36); head.writeUInt32LE(data.length, 40);
mkdirSync(join(here, "build"), { recursive: true });
writeFileSync(join(here, "build", "audio.wav"), Buffer.concat([head, data]));
console.log("audio → video/build/audio.wav");
