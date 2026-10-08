/**
 * BIXI Citi — 30 s showreel. A deterministic composition: `seek(t)` sets every
 * element for time t (seconds) from scratch, so any frame renders on its own.
 * The 3D footage is the real app (video/capture.mjs); every number is real data
 * exported from the app (video/ui.mjs → data.js).
 */
import { SHOTS } from "../shots.mjs";

const D = window.DATA;
const FPS = 60;
const W = 1920, H = 1080;
const stage = document.getElementById("stage");
const fmt = new Intl.NumberFormat("en-CA");

/* ---------------------------------------------------------------- timing */
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const E = {
  lin: (t) => t,
  in2: (t) => t * t,
  out2: (t) => 1 - (1 - t) * (1 - t),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  ioExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  ioSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
const P = (t, a, b, e = E.lin) => e(c01((t - a) / (b - a)));
const mix = (a, b, p) => a + (b - a) * p;
/** a flash envelope: rises over `att`, falls over `dec` */
const pulse = (t, a, att, dec) => (t < a ? 0 : t < a + att ? (t - a) / att : Math.max(0, 1 - (t - a - att) / dec) ** 2);
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};

/* acts (seconds) */
const T = {
  intro: [0, 3], city: [3, 6], live: [6, 8.5], day: [8.5, 12.5], night: [12.5, 15.5],
  years: [15.5, 19], ui: [19, 22.5], lm: [22.5, 25.5], outro: [25.5, 30],
};
const NIGHT_CUTS = [["jcb", 12.5], ["pvm", 13.25], ["roses", 14.0], ["wheel", 14.75]];
const LM_CUTS = [["biosphere", 22.05], ["stadium", 23.25], ["habitat", 24.0], ["oratory", 24.75]];

/* ---------------------------------------------------------------- DOM */
const el = (html, parent = stage) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const n = tpl.content.firstElementChild;
  parent.appendChild(n);
  return n;
};
/** SVG children must be parsed in the SVG namespace */
const sel = (html, parent) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${html.trim()}</svg>`;
  const n = tpl.content.firstElementChild.firstElementChild;
  parent.appendChild(n);
  return n;
};
const css = (n, o) => Object.assign(n.style, o);
const vis = (n, on) => { n.style.display = on ? "" : "none"; };
/** digits in fixed-width cells, so counters never jitter */
const numHTML = (s) => [...s].map((ch) => (/\d/.test(ch) ? `<i>${ch}</i>` : `<i class="p">${ch}</i>`)).join("");
const fixedHTML = numHTML;
/** masked lines that slide up into place */
const lines = (parent, texts) => texts.map((s) => el(`<span class="line"><span>${s}</span></span>`, parent).firstElementChild);
const letters = (parent, s) => [...s].map((ch) => el(`<span>${ch === " " ? "&nbsp;" : ch}</span>`, parent));
const slideLines = (spans, t, t0, stagger = 0.09, dur = 0.65, out = null) =>
  spans.forEach((s, i) => {
    const p = P(t, t0 + i * stagger, t0 + i * stagger + dur, E.outExpo);
    let y = (1 - p) * 112;
    if (out) y -= P(t, out + i * 0.04, out + i * 0.04 + 0.35, E.in3) * 112;
    s.style.transform = `translateY(${y}%)`;
  });
const kickerHTML = (n, text) => `<div class="kicker abs"><span class="rule"></span><span><b>${n}</b>&nbsp;&nbsp;${text}</span></div>`;
const kickerAnim = (k, t, t0, tOut) => {
  const rule = k.firstElementChild, txt = k.lastElementChild;
  rule.style.transform = `scaleX(${P(t, t0, t0 + 0.45, E.outExpo)})`;
  const p = P(t, t0 + 0.08, t0 + 0.5, E.out3);
  const o = tOut ? 1 - P(t, tOut, tOut + 0.25, E.in2) : 1;
  css(txt, { opacity: p * o, transform: `translateX(${(1 - p) * -18}px)` });
  rule.style.opacity = o;
};

const LOGO = [
  "M25.5874 9.46161H15.5629L19.2058 4.70482C20.1729 3.44285 19.9795 1.59837 18.7222 0.627576C17.4649 -0.375512 15.6596 -0.148996 14.6602 1.11305L8.21255 9.46161H4.47547C3.95963 9.46161 3.47605 9.72049 3.21813 10.044L0.96144 12.9241C0.477931 13.5389 0.96144 14.4449 1.79962 14.4449H4.3746L0.602733 19.2987C-0.364365 20.5607 -0.147788 22.4144 1.10956 23.3852C1.68982 23.8706 2.36682 24 3.14058 24H19.1629C20.7426 24 22.9993 22.7056 24.2243 21.12L28.6178 15.4804C30.6488 12.8593 28.9724 9.46161 25.5874 9.46161ZM21.332 15.8687L19.2491 18.499C18.9912 18.8226 18.6043 19.0167 18.153 19.0167H8.19139L11.7249 14.4449H20.5904C21.2675 14.4449 21.7833 15.2862 21.332 15.8687Z",
  "M47.5416 4.70482C48.5087 3.44285 48.3153 1.59837 47.0581 0.627576C45.8007 -0.375512 43.9954 -0.148996 42.996 1.11305L36.5484 9.46161H43.8987L47.5416 4.70482Z",
  "M74.1382 5.41673C75.5244 4.64008 76.008 2.86042 75.202 1.46897C74.3961 0.0775158 72.623 -0.407883 71.2367 0.40106L59.76 7.0347V2.89271C59.76 1.30712 58.4704 0.0127774 56.8585 0.0127774C55.2788 0.0127774 53.9571 1.30712 53.9571 2.89271V9.46161H67.1747L74.1382 5.41673Z",
  "M39.7722 18.5544C38.386 19.3635 37.9024 21.1431 38.7083 22.5346C39.4821 23.926 41.2552 24.4114 42.6414 23.6025L53.9571 17.066V21.0785C53.9571 22.6964 55.2788 23.9908 56.8585 23.9908C58.4704 23.9908 59.76 22.6964 59.76 21.0785V14.4449H46.8969L39.7722 18.5544Z",
  "M32.7121 14.4449L28.8435 19.2987C27.844 20.5283 28.1019 22.3728 29.3593 23.376C30.6166 24.3467 32.4219 24.1849 33.4213 22.8905L40.0623 14.4449H32.7121Z",
  "M66.347 19.2987C65.3476 20.5283 65.6055 22.3728 66.8628 23.376C68.12 24.3467 69.9254 24.1849 70.9248 22.8905L77.5659 14.4449H70.2156L66.347 19.2987Z",
  "M84.5616 0.627576C83.3043 -0.375512 81.4989 -0.148996 80.4996 1.11305L74.0519 9.46161H81.4022L85.0451 4.70482C86.0123 3.44285 85.8189 1.59837 84.5616 0.627576Z",
];
// draw order: left to right, top halves before bottom halves
const LOGO_ORDER = [0, 4, 1, 3, 2, 5, 6];

/** the glass capsule with the BIXI wordmark */
function makeCapsule(parent, w = 520, h = 190) {
  const cap = el(`<div class="glass" style="width:${w}px;height:${h}px;left:${-w / 2}px;top:${-h / 2}px">
    <i class="glow"></i>
    <svg viewBox="-1 -1 88 26" style="width:${w * 0.7}px">${LOGO.map((d) => `<path fill="currentColor" d="${d}"/>`).join("")}</svg>
    <i class="sheen"></i></div>`, parent);
  return { cap, paths: [...cap.querySelectorAll("path")], sheen: cap.querySelector(".sheen"), glow: cap.querySelector(".glow"), w, h };
}
function animCapsule(c, t, t0) {
  c.paths.forEach((p, i) => {
    const k = LOGO_ORDER.indexOf(i);
    const q = P(t, t0 + k * 0.045, t0 + k * 0.045 + 0.42, E.outExpo);
    p.style.transform = `translate(${(1 - q) * -14}px, ${(1 - q) * 4}px) skewX(${(1 - q) * -20}deg)`;
    p.style.opacity = q;
  });
  const s = P(t, t0 + 0.45, t0 + 1.25, E.io3);
  c.sheen.style.transform = `translateX(${mix(-55, 55, s)}%)`;
}

/* ---------------------------------------------------------------- layers */
const L = {
  foot: el(`<div class="full" id="foot" style="isolation:isolate"></div>`),
  ui: el(`<div class="full" id="uiStage" style="perspective:2600px;perspective-origin:960px 540px"></div>`),
  fx: el(`<svg class="full" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible"></svg>`),
  type: el(`<div class="full" style="isolation:isolate"></div>`),
  hud: el(`<div class="full"></div>`),
  top: el(`<div class="full"></div>`),
};

/* footage */
const SHOT = Object.fromEntries(SHOTS.map((s) => [s.name, s]));
const FEET = Object.fromEntries(SHOTS.map((s) => [s.name, el(`<img class="foot" alt="">`, L.foot)]));
let pending = [];
const allFeet = new Set(Object.values(FEET));
function foot(name, frame, style = {}, img = FEET[name]) {
  const s = SHOT[name];
  const f = Math.max(0, Math.min(s.frames - 1, Math.round(frame)));
  const src = `../build/footage/${name}/${String(f).padStart(4, "0")}.jpg`;
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.src = src;
    pending.push(img.decode().catch(() => undefined));
  }
  img._used = true;
  img.style.display = "block";
  Object.assign(img.style, style);
  return img;
}
const BLANK = { transform: "", opacity: "1", filter: "", clipPath: "", zIndex: "" };

/* ---------------------------------------------------------------- INTRO */
const intro = el(`<div class="full"></div>`, L.type);
const grid = el(`<svg class="full" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
  <radialGradient id="gfade"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="gmask"><rect width="${W}" height="${H}" fill="url(#gfade)"/></mask></defs>
  <g mask="url(#gmask)"><g id="gridlines" stroke="rgba(238,240,245,.07)" stroke-width="1.2"></g></g></svg>`, intro);
{
  // Montréal's street grid runs at 32° off true north (boulevard Saint-Laurent at 302°)
  const g = grid.querySelector("#gridlines");
  let s = "";
  for (let k = -40; k <= 40; k++) {
    const o = k * 46;
    s += `<line x1="${-1400}" y1="${o}" x2="${1400}" y2="${o}"/>`;
    s += `<line x1="${o}" y1="${-1400}" x2="${o}" y2="${1400}"/>`;
  }
  g.innerHTML = s;
}
const gridG = grid.querySelector("#gridlines");
const arcsSvg = el(`<svg class="full" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="filter:drop-shadow(0 0 6px rgba(111,216,239,.55))"></svg>`, intro);
const ARC_COLS = ["#6fd8ef", "#ff9d6c", "#f3dcb0", "#6fd8ef", "#ff7a6b", "#f3dcb0"];
const arcs = [];
{
  const r = rng(7);
  const N = 30;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + r() * 0.25;
    const R = 620 + r() * 520;
    const x0 = 960 + Math.cos(ang) * R * 1.25, y0 = 540 + Math.sin(ang) * R * 0.78;
    const mx = (x0 + 960) / 2, my = (y0 + 540) / 2;
    const nx = -(540 - y0), ny = 960 - x0, nl = Math.hypot(nx, ny);
    const bend = (r() - 0.5) * 0.7 * Math.hypot(960 - x0, 540 - y0);
    const cx = mx + (nx / nl) * bend, cy = my + (ny / nl) * bend - 60;
    const col = ARC_COLS[i % ARC_COLS.length];
    const path = sel(`<path d="M${x0} ${y0} Q${cx} ${cy} 960 540" fill="none" stroke="${col}" stroke-width="${2 + r() * 1.5}" stroke-linecap="round"/>`, arcsSvg);
    const head = sel(`<circle r="5" fill="#fff"/>`, arcsSvg);
    arcs.push({ path, head, len: 0, start: 0.04 + (i / N) * 0.62 + r() * 0.04, dur: 0.42 + r() * 0.12 });
  }
}
const core = el(`<div class="abs" style="left:948px;top:528px;width:24px;height:24px;border-radius:50%;background:#ff5a4c;box-shadow:0 0 30px 8px rgba(238,49,36,.55),0 0 90px 20px rgba(238,49,36,.25)"></div>`, intro);
/** the logo lockup is centred once the fonts are in: capsule (520) + gap (48) + word */
const WORD = "CITI";
let CAPX = 751, WORDX = 1060;
function layoutLockup() {
  const w = story.getBoundingClientRect().width;
  const left = 960 - (520 + 48 + w) / 2;
  CAPX = left + 260;
  WORDX = left + 568;
  introGroup.style.transformOrigin = `${CAPX}px 520px`;
  iris.setAttribute("cx", CAPX);
  story.style.left = storyB.style.left = `${WORDX}px`;
  capWrapB.style.left = `${CAPX}px`;
}
const introGroup = el(`<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;transform-origin:751px 520px"></div>`, intro);
const capWrap = el(`<div class="abs" style="left:960px;top:520px"></div>`, introGroup);
const capA = makeCapsule(capWrap);
const story = el(`<div class="wordStory abs" style="left:1060px;top:482px"></div>`, introGroup);
const storyL = letters(story, WORD);
const tagline = el(`<div class="abs label" style="left:0;width:${W}px;top:688px;text-align:center;letter-spacing:.34em;font-size:21px;color:#c7ccd6"></div>`, introGroup);
const TAG = "STORYTELLING WITH BIXI MONTRÉAL DATA";
const tagRule = el(`<div class="abs" style="left:760px;width:400px;top:736px;height:2px;background:linear-gradient(90deg,transparent,#e24b3f,transparent);transform-origin:50% 50%"></div>`, introGroup);
const iris = sel(`<circle cx="751" cy="520" r="0" fill="none" stroke="#ff7a6b" stroke-width="6" style="filter:drop-shadow(0 0 18px rgba(238,49,36,.9))"/>`, L.fx);

function sceneIntro(t) {
  const live = t < 3.15;
  vis(intro, live);
  if (!live) { iris.setAttribute("opacity", 0); return; }
  // background grid breathes in, slowly turning
  gridG.setAttribute("transform", `translate(960 540) rotate(${-32 + t * 1.6}) scale(${1 + t * 0.04})`);
  grid.style.opacity = P(t, 0, 0.8, E.out2) * (1 - P(t, 2.4, 2.9));

  // rides fly in from the edges and converge on one point
  let arrived = 0;
  for (const a of arcs) {
    if (!a.len) a.len = a.path.getTotalLength();
    const hp = P(t, a.start, a.start + a.dur, E.io3);
    const tp = P(t, a.start + a.dur * 0.35, a.start + a.dur * 1.05, E.in2);
    if (hp >= 1) arrived++;
    const seg = Math.max(0, (hp - tp) * a.len);
    a.path.setAttribute("stroke-dasharray", `${seg} ${a.len * 2}`);
    a.path.setAttribute("stroke-dashoffset", `${-tp * a.len}`);
    a.path.setAttribute("opacity", hp > 0 && tp < 1 ? 1 : 0);
    const pt = a.path.getPointAtLength(hp * a.len);
    a.head.setAttribute("cx", pt.x);
    a.head.setAttribute("cy", pt.y);
    a.head.setAttribute("opacity", hp > 0 && hp < 1 ? 1 : 0);
  }
  // the point swells with each arrival, then becomes the capsule
  const pop = P(t, 0.92, 1.32, E.outBack);
  const coreS = (0.35 + arrived * 0.045) * (1 + Math.sin(t * 40) * 0.04 * (1 - pop));
  css(core, { transform: `scale(${coreS * (1 + pop * 3)})`, opacity: P(t, 0, 0.15) * (1 - P(t, 0.95, 1.1)) });

  // capsule: pops at centre, then slides left to make room for STORY
  const slide = P(t, 1.3, 1.75, E.io3);
  css(capWrap, { left: `${mix(960, CAPX, slide)}px`, transform: `scale(${Math.max(0.001, pop)})`, opacity: P(t, 0.92, 1.0) });
  animCapsule(capA, t, 1.02);
  capA.glow.style.opacity = 0.6 + 0.4 * pulse(t, 0.95, 0.1, 0.8);
  storyL.forEach((s, i) => {
    const q = P(t, 1.5 + i * 0.05, 1.5 + i * 0.05 + 0.5, E.outExpo);
    css(s, { transform: `translateY(${(1 - q) * 46}px)`, opacity: q });
  });
  const n = Math.round(P(t, 1.75, 2.3) * TAG.length);
  tagline.innerHTML = TAG.slice(0, n) + (n < TAG.length && t > 1.75 ? '<span style="color:#e24b3f">▍</span>' : "");
  tagRule.style.transform = `scaleX(${P(t, 2.0, 2.5, E.outExpo)})`;

  // iris into the city, through the capsule
  const ip = P(t, 2.55, 3.1, E.io3);
  css(introGroup, { transform: `scale(${1 + ip * 0.35})`, opacity: 1 - P(t, 2.6, 2.95), filter: `blur(${ip * 10}px)` });
  arcsSvg.style.opacity = 1 - ip;
  iris.setAttribute("r", ip * 1300);
  iris.setAttribute("stroke-width", mix(10, 1, ip));
  iris.setAttribute("opacity", t > 2.55 ? 1 - P(t, 2.85, 3.1) : 0);
}

/* ---------------------------------------------------------------- CITY */
const city = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(90deg,rgba(7,9,13,.72),rgba(7,9,13,.2) 48%,transparent 70%),linear-gradient(0deg,rgba(7,9,13,.6),transparent 40%)"></div>`, city);
const cityK = el(kickerHTML("01", "The city"), city);
css(cityK, { left: "120px", top: "560px" });
const cityT = el(`<h1 class="title abs" style="left:116px;top:606px"></h1>`, city);
const cityL = lines(cityT, ["Montréal,", "in real 3D."]);
const cityN = el(`<div class="abs" style="left:120px;top:868px;display:flex;align-items:center;gap:28px"><div class="num" style="font-size:72px"><span></span></div><div><div class="label" style="font-size:17px;line-height:1.5">buildings from<br>OpenStreetMap</div></div><span class="chip real">Real</span></div>`, city);
const cityNum = cityN.querySelector(".num span");
function sceneCity(t) {
  const live = t >= 2.55 && t < 6.2;
  const fr = 30 + (t - 3) * FPS;
  if (live) {
    const ip = P(t, 2.55, 3.1, E.io3);
    foot("city", fr, {
      clipPath: ip < 1 ? `circle(${ip * 1300}px at ${CAPX}px 520px)` : "",
      transform: `scale(${mix(1.18, 1.0, P(t, 2.55, 4.2, E.out3))})`,
      zIndex: 2,
    });
  }
  vis(city, t >= 3 && t < 6.05);
  if (t < 3 || t >= 6.05) return;
  kickerAnim(cityK, t, 3.1, 5.7);
  slideLines(cityL, t, 3.18, 0.1, 0.7, 5.62);
  const q = P(t, 3.75, 4.9, E.outExpo);
  cityNum.innerHTML = numHTML(fmt.format(Math.round(D.city.buildings * q)));
  css(cityN, { opacity: P(t, 3.7, 3.95) * (1 - P(t, 5.68, 5.9)), transform: `translateY(${(1 - P(t, 3.7, 4.2, E.outExpo)) * 30}px)` });
  css(cityN.lastElementChild, { transform: `scale(${P(t, 4.4, 4.7, E.outBack)})` });
}

/* ---------------------------------------------------------------- LIVE */
const live = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(90deg,rgba(7,9,13,.86),rgba(7,9,13,.45) 40%,transparent 60%),linear-gradient(270deg,rgba(7,9,13,.8),transparent 34%)"></div>`, live);
const liveK = el(`<div class="kicker abs" style="left:120px;top:300px"><span class="rule"></span><span><b>02</b>&nbsp;&nbsp;Live, right now</span></div>`, live);
const liveN = el(`<div class="abs" style="left:112px;top:350px"><div class="num"><span></span></div></div>`, live);
const liveNum = liveN.querySelector("span");
const liveLab = el(`<div class="abs" style="left:120px;top:512px;display:flex;align-items:center;gap:22px"><span class="label" style="font-size:22px;color:#eef0f5">stations reporting</span><span class="chip live">Live · GBFS</span></div>`, live);
const liveSub = el(`<div class="abs body" style="left:120px;top:580px;width:700px">
  <div style="font:500 30px/1.35 var(--body);color:#eef0f5"><span class="lb"></span> bikes docked, <span class="le"></span> of them electric.</div>
  <div style="margin-top:14px;font-size:22px">Polled every 15 seconds. A station flashes only when its count really changes.</div></div>`, live);
const liveB = liveSub.querySelector(".lb"), liveE = liveSub.querySelector(".le");
const ticker = el(`<div class="abs" style="left:1330px;top:150px;width:470px;height:780px;overflow:hidden;
  -webkit-mask-image:linear-gradient(180deg,transparent,#000 14%,#000 80%,transparent)"></div>`, live);
const tickHead = el(`<div class="abs label" style="left:1330px;top:120px;font-size:15px;color:#6fd8ef">station_status.json · real snapshot <span></span></div>`, live);
const tickRows = el(`<div class="abs" style="left:0;top:0;width:470px"></div>`, ticker);
{
  const rows = [...D.live.ticker, ...D.live.ticker];
  for (const r of rows) {
    const cap = Math.min(14, Math.max(6, Math.round(r.cap / 3)));
    const on = Math.round((r.bikes / Math.max(1, r.cap)) * cap), e = Math.round((r.ebikes / Math.max(1, r.cap)) * cap);
    const cells = Array.from({ length: cap }, (_, k) => `<i class="${k < e ? "on e" : k < on ? "on" : ""}"></i>`).join("");
    const name = r.name.length > 30 ? r.name.slice(0, 29) + "…" : r.name;
    el(`<div class="tick"><div style="overflow:hidden;text-overflow:ellipsis"><b>${name}</b><div style="margin-top:8px" class="meter">${cells}</div></div><div style="text-align:right;font:500 30px/1 var(--display);color:#eef0f5">${r.bikes}</div></div>`, tickRows);
  }
}
function sceneLive(t) {
  const on = t >= 5.98 && t < 8.75;
  if (on) {
    const k = c01((t - 6) / 0.22);
    const dx = (1 - E.out3(k)) * 16;
    document.getElementById("rgbR").setAttribute("dx", dx);
    document.getElementById("rgbB").setAttribute("dx", -dx);
    foot("live", (t - 6) * FPS, {
      transform: `scale(${mix(1.12, 1, P(t, 6, 6.6, E.outExpo))})`,
      filter: dx > 0.2 ? "url(#rgb)" : "",
      zIndex: 3,
    });
  }
  vis(live, t >= 6 && t < 8.75);
  if (t < 6 || t >= 8.75) return;
  kickerAnim(liveK, t, 6.12);
  const q = P(t, 6.15, 7.05, E.outExpo);
  liveNum.innerHTML = numHTML(fmt.format(Math.round(D.live.stations * q)));
  css(liveN, { opacity: P(t, 6.12, 6.3), transform: `translateY(${(1 - P(t, 6.12, 6.6, E.outExpo)) * 40}px)` });
  css(liveLab, { opacity: P(t, 6.35, 6.6), transform: `translateY(${(1 - P(t, 6.35, 6.8, E.outExpo)) * 20}px)` });
  const s = P(t, 6.55, 7.4, E.outExpo);
  liveB.textContent = fmt.format(Math.round(D.live.bikes * s));
  liveE.textContent = fmt.format(Math.round(D.live.ebikes * s));
  css(liveSub, { opacity: P(t, 6.55, 6.8), transform: `translateY(${(1 - P(t, 6.55, 7.0, E.outExpo)) * 20}px)` });
  css(ticker, { opacity: P(t, 6.3, 6.7), transform: `translateX(${(1 - P(t, 6.3, 6.9, E.outExpo)) * 60}px)` });
  tickHead.style.opacity = P(t, 6.4, 6.7);
  tickRows.style.transform = `translateY(${-(t - 6.3) * 92}px)`;
}

/* ---------------------------------------------------------------- DAY */
const day = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(180deg,rgba(7,9,13,.66),transparent 40%),linear-gradient(0deg,rgba(7,9,13,.86),rgba(7,9,13,.4) 30%,transparent 50%),radial-gradient(40% 40% at 100% 25%,rgba(7,9,13,.6),transparent)"></div>`, day);
const dayK = el(kickerHTML("03", "One real day"), day);
css(dayK, { left: "120px", top: "112px" });
const clock = el(`<div class="abs num" style="left:112px;top:150px;font-size:190px;letter-spacing:-.02em"></div>`, day);
const dayDate = el(`<div class="abs label" style="left:120px;top:362px;font-size:20px;color:#eef0f5">Thursday 6 August 2026 <span style="color:#6e778a">· sun from the clock</span></div>`, day);
const dayR = el(`<div class="abs" style="right:120px;top:140px;text-align:right">
  <div class="label" style="font-size:18px">rides so far</div>
  <div class="num" style="font-size:96px;justify-content:flex-end;margin-top:10px"><span></span></div>
  <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:12px"><span class="chip real">Real · BIXI open data</span></div></div>`, day);
const dayNum = dayR.querySelector(".num span");
const dayCap = el(`<div class="abs body" style="right:120px;top:384px;width:520px;text-align:right;font-size:23px;color:#c7ccd6">Every arc is one real ride, from its station to its station, at the minute it happened.</div>`, day);
const BAR0 = 120, BARW = 1680 / 24, BARY = 1000, BARH = 230;
const dayGhosts = D.storyDay.hours.map((v, h) => el(`<div class="abs bar" style="left:${BAR0 + h * BARW + 10}px;width:${BARW - 20}px;top:${BARY - (v / D.storyDay.peakTrips) * BARH}px;height:${(v / D.storyDay.peakTrips) * BARH}px;background:rgba(238,240,245,.07);box-shadow:inset 0 0 0 1px rgba(238,240,245,.14)"></div>`, day));
const dayBars = D.storyDay.hours.map((v, h) => el(`<div class="abs bar" style="left:${BAR0 + h * BARW + 10}px;width:${BARW - 20}px;top:${BARY - (v / D.storyDay.peakTrips) * BARH}px;height:${(v / D.storyDay.peakTrips) * BARH}px;background:#f3dcb0"></div>`, day));
const dayAxis = [0, 6, 12, 18, 23].map((h) => el(`<div class="abs axis" style="left:${BAR0 + h * BARW + 10}px;top:${BARY + 14}px">${String(h).padStart(2, "0")}:00</div>`, day));
const dayBase = el(`<div class="abs" style="left:${BAR0}px;top:${BARY}px;width:1680px;height:1px;background:rgba(238,240,245,.25);transform-origin:0 0"></div>`, day);
const peakH = D.storyDay.peakHour;
const dayPeak = el(`<div class="abs" style="left:${BAR0 + peakH * BARW + BARW / 2 - 140}px;width:280px;top:${BARY - BARH - 64}px;text-align:center">
  <div class="label" style="font-size:16px;color:#ff7a6b">peak hour · ${String(peakH).padStart(2, "0")}:00</div>
  <div style="font:600 34px/1.1 var(--display);margin-top:6px">${fmt.format(D.storyDay.peakTrips)}</div></div>`, day);
const dayMin = (fr) => {
  const s = SHOT.day;
  const f = Math.max(0, Math.min(s.frames - 1, Math.round(fr)));
  return s.minute[0] + ((s.minute[1] - s.minute[0]) * f) / (s.frames - 1);
};
/* the diagonal wipe edge, at the street grid's angle */
const wipeEdge = el(`<div class="abs" style="top:-300px;height:1680px;width:10px;left:0;background:linear-gradient(90deg,transparent,#ff7a6b 40%,#fff 50%,#ff9d6c 60%,transparent);box-shadow:0 0 40px 10px rgba(238,49,36,.55);transform-origin:50% 50%"></div>`, L.top);
const SLOPE = Math.tan((32 * Math.PI) / 180) * 540;
function wipeAt(x0) {
  return `polygon(${-2000}px 0px, ${x0 + SLOPE}px 0px, ${x0 - SLOPE}px ${H}px, ${-2000}px ${H}px)`;
}
function sceneDay(t) {
  const wp = P(t, 8.22, 8.68, E.io3);
  const x0 = mix(-SLOPE - 60, W + SLOPE + 60, wp);
  const fr = 30 + (t - 8.5) * FPS;
  if (t >= 8.22 && t < 12.6) foot("day", fr, { clipPath: wp < 1 ? wipeAt(x0) : "", zIndex: 4, transform: `scale(${mix(1.06, 1, P(t, 8.3, 9.3, E.out3))})` });
  vis(wipeEdge, wp > 0 && wp < 1);
  css(wipeEdge, { left: `${x0 - 5}px`, transform: `rotate(32deg)` });
  vis(day, t >= 8.5 && t < 12.55);
  if (t < 8.5 || t >= 12.55) return;
  const m = dayMin(fr);
  const hh = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  clock.innerHTML = fixedHTML(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  const ex = P(t, 12.3, 12.52, E.in3);
  kickerAnim(dayK, t, 8.55, 12.3);
  css(clock, { opacity: P(t, 8.55, 8.8) * (1 - ex), transform: `translateY(${(1 - P(t, 8.55, 9.1, E.outExpo)) * 50 - ex * 30}px)` });
  css(dayDate, { opacity: P(t, 8.75, 9.0) * (1 - ex) });
  const cum = D.storyDay.cumulative[Math.min(1439, Math.floor(m))];
  dayNum.innerHTML = numHTML(fmt.format(cum));
  css(dayR, { opacity: P(t, 8.8, 9.05) * (1 - ex), transform: `translateY(${(1 - P(t, 8.8, 9.3, E.outExpo)) * 30}px)` });
  css(dayCap, { opacity: P(t, 9.6, 9.9) * (1 - ex), transform: `translateY(${(1 - P(t, 9.6, 10.1, E.outExpo)) * 20}px)` });
  dayBase.style.transform = `scaleX(${P(t, 8.7, 9.3, E.outExpo)})`;
  dayBase.style.opacity = 1 - ex;
  dayBars.forEach((b, h) => {
    const fill = c01((m - h * 60) / 60);
    const nowBar = m >= h * 60 && m < h * 60 + 60;
    css(b, {
      transform: `scaleY(${E.out3(fill)})`,
      background: nowBar ? "#ff5a4c" : h === peakH ? "#ff9d6c" : "#f3dcb0",
      boxShadow: nowBar ? "0 0 26px rgba(238,49,36,.7)" : "none",
      opacity: (nowBar ? 1 : 0.82) * (1 - ex),
    });
  });
  dayAxis.forEach((a) => (a.style.opacity = P(t, 8.9, 9.2) * (1 - ex)));
  dayGhosts.forEach((g, h) => {
    const q = P(t, 8.75 + h * 0.018, 9.15 + h * 0.018, E.outExpo);
    css(g, { transform: `scaleY(${q})`, opacity: 1 - ex });
  });
  const pq = P(m, (peakH + 1) * 60, (peakH + 1) * 60 + 40, E.outBack);
  css(dayPeak, { opacity: c01(pq) * (1 - ex), transform: `translateY(${(1 - pq) * 20}px) scale(${0.9 + 0.1 * pq})` });
}

/* ---------------------------------------------------------------- NIGHT */
const night = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(0deg,rgba(7,9,13,.75),transparent 36%),linear-gradient(180deg,rgba(7,9,13,.5),transparent 25%)"></div>`, night);
const nightK = el(kickerHTML("04", "After dark"), night);
css(nightK, { left: "120px", top: "112px" });
const nightSub = el(`<div class="abs label" style="left:120px;top:150px;font-size:17px;color:#a6aebd">Windows light up as the sun goes down. The sun follows the clock.</div>`, night);
const NIGHT_TXT = {
  jcb: ["Jacques Cartier Bridge", "1930 steel cantilever · LEDs that drift with the evening"],
  pvm: ["Place Ville Marie", "I. M. Pei, 1962 · its beacon sweeps the night"],
  roses: ["Farine Five Roses", "The red rooftop sign over the Ogilvie mill, since 1948"],
  wheel: ["La Grande Roue", "60 m over the Old Port · it turns"],
};
const lowerThird = (parent, idx) => {
  const box = el(`<div class="abs" style="left:120px;bottom:118px"></div>`, parent);
  const n = el(`<div class="label" style="font-size:16px;color:#ff7a6b;margin-bottom:14px">${idx}</div>`, box);
  const tl = el(`<div class="title md" style="font-size:66px"></div>`, box);
  const [line] = lines(tl, [""]);
  const sub = el(`<div class="body" style="font-size:22px;margin-top:14px"></div>`, box);
  return { box, n, line, sub };
};
const nightLT = lowerThird(night, "");
function cutFoot(cuts, t, filterId, extraZ) {
  // the clip on screen and the one pushing in over it
  let cur = -1;
  cuts.forEach(([, s], i) => { if (t >= s) cur = i; });
  if (cur < 0) return -1;
  for (let i = Math.max(0, cur - 1); i <= cur; i++) {
    const [name, s] = cuts[i];
    const fr = (t - s) * FPS + 6;
    if (i === cur) {
      const k = P(t, s, s + 0.24, E.outExpo);
      const blur = (1 - k) * 46;
      document.getElementById(filterId + "g").setAttribute("stdDeviation", `${blur} 0`);
      const dir = i % 2 ? -1 : 1;
      foot(name, fr, {
        transform: `translateX(${(1 - k) * dir * 340}px) scale(${mix(1.14, 1, P(t, s, s + 0.7, E.out3))})`,
        opacity: P(t, s, s + 0.06),
        filter: blur > 0.5 ? `url(#${filterId})` : "",
        zIndex: extraZ + 1,
      });
    } else if (t < cuts[cur][1] + 0.1) {
      foot(name, fr, { zIndex: extraZ, transform: `translateX(${-P(t, cuts[cur][1], cuts[cur][1] + 0.2, E.in2) * 120 * (cur % 2 ? -1 : 1)}px)` });
    }
  }
  return cur;
}
function sceneNight(t) {
  const on = t >= 12.5 && t < 15.75;
  if (!on) { vis(night, false); return; }
  const cur = cutFoot(NIGHT_CUTS, t, "xblurA", 6);
  vis(night, t < 15.5);
  kickerAnim(nightK, t, 12.55, 15.25);
  css(nightSub, { opacity: P(t, 12.75, 13.0) * (1 - P(t, 15.25, 15.45)) });
  const [name, s] = NIGHT_CUTS[cur];
  const [ttl, sub] = NIGHT_TXT[name];
  nightLT.n.textContent = `04.${cur + 1} / 04`;
  nightLT.line.textContent = ttl;
  nightLT.sub.textContent = sub;
  const end = cur < 3 ? NIGHT_CUTS[cur + 1][1] : 15.5;
  const q = P(t, s + 0.06, s + 0.5, E.outExpo), o = P(t, end - 0.14, end, E.in2);
  nightLT.line.style.transform = `translateY(${(1 - q) * 112 - o * 112}%)`;
  css(nightLT.sub, { opacity: P(t, s + 0.12, s + 0.3) * (1 - o) });
  css(nightLT.n, { opacity: P(t, s + 0.04, s + 0.2) * (1 - o) });
}

/* ---------------------------------------------------------------- YEARS */
const years = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(90deg,rgba(7,9,13,.82),rgba(7,9,13,.4) 55%,rgba(7,9,13,.2)),linear-gradient(0deg,rgba(7,9,13,.7),transparent 45%)"></div>`, years);
const yearsK = el(kickerHTML("05", "Every season since 2014"), years);
css(yearsK, { left: "120px", top: "112px" });
const yearsN = el(`<div class="abs" style="left:112px;top:150px"><div class="num" style="font-size:118px"><span></span></div></div>`, years);
const yearsNum = yearsN.querySelector("span");
const yearsLab = el(`<div class="abs" style="left:120px;top:292px;display:flex;gap:20px;align-items:center"><span class="label" style="font-size:21px;color:#eef0f5">rides in ${D.years.length} seasons of open data</span><span class="chip real">Real</span></div>`, years);
const YB0 = 120, YBW = 78, YBY = 905, YBH = 420;
const maxTrips = Math.max(...D.years.map((y) => y.trips));
const yearBars = D.years.map((y, i) => {
  const h = (y.trips / maxTrips) * YBH;
  const isMax = y.trips === maxTrips;
  const bg = y.partial ? "repeating-linear-gradient(135deg,rgba(243,220,176,.85) 0 6px,rgba(243,220,176,.25) 6px 12px)" : isMax ? "#ff5a4c" : y.year === 2020 ? "#E0703F" : "#f3dcb0";
  const b = el(`<div class="abs bar" style="left:${YB0 + i * YBW}px;width:${YBW - 22}px;top:${YBY - h}px;height:${h}px;background:${bg};${isMax ? "box-shadow:0 0 30px rgba(238,49,36,.55)" : ""}"></div>`, years);
  const lab = el(`<div class="abs axis" style="left:${YB0 + i * YBW - 6}px;width:${YBW - 10}px;text-align:center;top:${YBY + 14}px">${String(y.year).slice(2).padStart(3, "’")}</div>`, years);
  return { b, lab, y, h };
});
const yBase = el(`<div class="abs" style="left:${YB0 - 10}px;top:${YBY}px;width:${D.years.length * YBW}px;height:1px;background:rgba(238,240,245,.3);transform-origin:0 0"></div>`, years);
const tagFor = (i, html, dy = 0) => {
  const yb = yearBars[i];
  return el(`<div class="abs" style="left:${YB0 + i * YBW + (YBW - 22) / 2 - 120}px;width:240px;text-align:center;top:${YBY - yb.h - 62 + dy}px">${html}</div>`, years);
};
const iMax = D.years.findIndex((y) => y.trips === maxTrips);
const i2020 = D.years.findIndex((y) => y.year === 2020);
const iLast = D.years.length - 1;
const yTags = [
  [0, tagFor(0, `<div style="font:600 26px/1 var(--display)">${(D.years[0].trips / 1e6).toFixed(1)} M</div>`, 18)],
  [i2020, tagFor(i2020, `<div class="label" style="font-size:14px;color:#ff9d6c">2020</div><div style="font:600 24px/1.2 var(--display)">−44%</div>`, 2)],
  [iMax, tagFor(iMax, `<div class="label" style="font-size:14px;color:#ff7a6b">record</div><div style="font:600 30px/1.2 var(--display)">${(maxTrips / 1e6).toFixed(1)} M</div>`, -6)],
  [iLast, tagFor(iLast, `<div class="label" style="font-size:14px">so far</div><div style="font:600 24px/1.2 var(--display)">${(D.years[iLast].trips / 1e6).toFixed(1)} M</div>`, 2)],
];
/* 2025 day by day */
const CAL0X = 1196, CAL0Y = 700, CELL = 9.6, GAP = 2.4;
const yd = D.y2025.daily;
const jan1 = new Date(Date.UTC(2025, 0, 1)).getUTCDay();
const dmax = Math.max(...yd);
const RAMP = ["#2b2624", "#4a2f24", "#6b3a26", "#8f4628", "#b5552c", "#d96836", "#f08a58", "#ffb38a"];
const calWrap = el(`<div class="abs" style="left:${CAL0X}px;top:${CAL0Y - 70}px;width:${53 * (CELL + GAP)}px"></div>`, years);
el(`<div class="label" style="font-size:16px;margin-bottom:12px;display:flex;justify-content:space-between"><span style="color:#eef0f5">2025 · day by day</span><span class="calday"></span></div>`, calWrap);
const calDay = calWrap.querySelector(".calday");
const calGrid = el(`<div style="position:relative;height:${7 * (CELL + GAP)}px"></div>`, calWrap);
const cells = yd.map((v, d) => {
  const k = d + jan1, col = Math.floor(k / 7), row = k % 7;
  return el(`<i style="position:absolute;left:${col * (CELL + GAP)}px;top:${row * (CELL + GAP)}px;width:${CELL}px;height:${CELL}px;border-radius:2px"></i>`, calGrid);
});
const calMonths = el(`<div class="axis" style="position:relative;height:20px;margin-top:10px;font-size:13px"></div>`, calWrap);
["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].forEach((m, i) => {
  const d = Math.round((Date.UTC(2025, i, 1) - Date.UTC(2025, 0, 1)) / 864e5);
  el(`<span style="position:absolute;left:${Math.floor((d + jan1) / 7) * (CELL + GAP)}px">${m}</span>`, calMonths);
});
const pk = D.y2025.peak;
const pkDoy = Math.round((Date.UTC(2025, 5, 11) - Date.UTC(2025, 0, 1)) / 864e5);
const pkCell = cells[pkDoy];
const pkCall = el(`<div class="abs" style="left:${CAL0X}px;top:${CAL0Y + 7 * (CELL + GAP) + 54}px;width:660px">
  <div class="label" style="font-size:15px;color:#ff7a6b">busiest day on record</div>
  <div style="font:600 40px/1.15 var(--display);margin-top:8px">${fmt.format(pk.trips)} <span style="font:400 24px var(--body);color:#a6aebd">rides · Wed 11 Jun 2025</span></div></div>`, years);
const yearsDoy = (fr) => {
  const s = SHOT.years;
  const f = Math.max(0, Math.min(s.frames - 1, Math.round(fr)));
  return s.yday[0] + ((s.yday[1] - s.yday[0]) * f) / (s.frames - 1);
};
/** blinds: vertical strips open in a wave */
function blinds(p) {
  const N = 14, w = W / N;
  let d = "";
  for (let i = 0; i < N; i++) {
    const k = c01(p * 1.6 - (i / N) * 0.6);
    const h = E.io3(k) * H;
    const y = i % 2 ? 0 : H - h;
    d += `M${i * w - 0.5} ${y}H${(i + 1) * w + 0.5}V${y + h}H${i * w - 0.5}Z`;
  }
  return `path('${d}')`;
}
const YEARS_FR = (t) => 20 + (t - 15.5) * FPS;
function sceneYears(t) {
  const bp = P(t, 15.3, 15.75);
  if (t >= 15.3 && t < 19.0) {
    const dim = P(t, 15.55, 16.0) * (1 - P(t, 18.6, 19.0));
    foot("years", YEARS_FR(t), { clipPath: bp < 1 ? blinds(bp) : "", zIndex: 9, filter: `brightness(${1 - 0.4 * dim}) contrast(${1 + 0.18 * dim}) saturate(${1 + 0.15 * dim})`, transform: `scale(${mix(1.08, 1, P(t, 15.3, 16.5, E.out3))})` });
  }
  vis(years, t >= 15.5 && t < 19.05);
  if (t < 15.5 || t >= 19.05) return;
  const ex = P(t, 18.62, 18.95, E.in3);
  kickerAnim(yearsK, t, 15.58, 18.6);
  // bars rise one season at a time; the counter adds each season as it lands
  let sum = 0;
  yearBars.forEach(({ b, lab, y }, i) => {
    const s = 15.75 + i * 0.075;
    const g = P(t, s, s + 0.5, E.outExpo);
    sum += y.trips * g;
    css(b, { transform: `scaleY(${g * (1 - ex)})`, opacity: 1 - ex });
    css(lab, { opacity: P(t, s, s + 0.2) * (1 - ex) });
  });
  yearsNum.innerHTML = numHTML(fmt.format(Math.round(sum)));
  css(yearsN, { opacity: P(t, 15.7, 15.9) * (1 - ex), transform: `translateY(${(1 - P(t, 15.7, 16.2, E.outExpo)) * 40 - ex * 30}px)` });
  css(yearsLab, { opacity: P(t, 15.9, 16.15) * (1 - ex) });
  yBase.style.transform = `scaleX(${P(t, 15.65, 16.3, E.outExpo) * (1 - ex)})`;
  yTags.forEach(([i, n], k) => {
    const s = 15.75 + i * 0.075 + 0.35 + k * 0.02;
    const q = P(t, s, s + 0.35, E.outBack);
    css(n, { opacity: c01(q) * (1 - ex), transform: `translateY(${(1 - q) * 16}px)` });
  });
  // the calendar fills as the season plays in the background
  const doy = yearsDoy(YEARS_FR(t));
  const calOn = P(t, 16.2, 16.5);
  cells.forEach((c, d) => {
    const v = yd[d];
    const lit = d <= doy && v > 0;
    c.style.background = lit ? RAMP[Math.min(7, Math.floor((v / dmax) * 7.999))] : "rgba(238,240,245,.06)";
    c.style.boxShadow = d === pkDoy && lit ? "0 0 0 2px #fff, 0 0 14px rgba(255,255,255,.7)" : d === Math.floor(doy) ? "0 0 10px #ffb38a" : "";
  });
  const dt = new Date(Date.UTC(2025, 0, 1) + Math.floor(doy) * 864e5);
  calDay.textContent = dt.toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });
  css(calWrap, { opacity: calOn * (1 - ex), transform: `translateY(${(1 - P(t, 16.2, 16.7, E.outExpo)) * 30}px)` });
  const pq = doy >= pkDoy ? P(t, 17.0, 17.4, E.outExpo) : 0;
  css(pkCall, { opacity: pq * (1 - ex), transform: `translateY(${(1 - pq) * 24}px)` });
  pkCell.style.zIndex = 2;
}

/* ---------------------------------------------------------------- INTERFACE */
const S = D.screen, R = D.rects, LY = D.layers;
const UI_SCALE = 0.655;
const ui = el(`<div id="ui" style="width:${S.w}px;height:${S.h}px;transform-origin:0 0"></div>`, L.ui);
const plate = el(`<div class="layer" style="left:0;top:0;width:${S.w}px;height:${S.h}px;border-radius:44px;background:#1c2029;box-shadow:0 60px 160px rgba(0,0,0,.65),0 0 0 2px rgba(255,255,255,.05)"></div>`, ui);
const layer = (key, src, z) => {
  const c = LY[key];
  const n = el(`<div class="layer" style="left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px"><img src="${src}" style="width:${c.width}px;height:${c.height}px" alt=""></div>`, ui);
  return { n, c, z };
};
const LAYERS = {
  head: layer("head", "../build/ui/layer-head.png", 300),
  kpis: layer("kpis", "../build/ui/layer-kpis.png", 170),
  deck: layer("deck", "../build/ui/layer-deck.png", 170),
  rail: layer("rail", "../build/ui/layer-rail.png", 240),
};
// the map: live footage in a window, the map's own overlays above it
const basinL = el(`<div class="layer" style="left:0;top:0;width:${S.w}px;height:${S.h}px;pointer-events:none"></div>`, ui);
const basinWin = el(`<div class="win"></div>`, basinL);
const basinImg = el(`<img alt="">`, basinWin);
const basinUI = el(`<img alt="" style="position:absolute;left:${LY.basin.x}px;top:${LY.basin.y}px;width:${LY.basin.width}px;height:${LY.basin.height}px">`, basinL);
const lightPage = el(`<div class="layer" style="left:0;top:0;width:${S.w}px;height:${S.h}px;border-radius:44px;overflow:hidden"><img src="../build/ui/page-light.png" style="width:${S.w}px;height:${S.h}px" alt=""></div>`, ui);
const callout = (parent, x, y, text) => el(`<div class="callout" style="left:${x}px;top:${y}px;font-size:46px;gap:20px;text-shadow:0 2px 18px rgba(0,0,0,.8)">${text}</div>`, parent);
const CALLOUTS = [
  [LAYERS.head.n, R.head.x - LY.head.x + 900, R.head.y - LY.head.y - 84, "Live GBFS · every 15 s"],
  [LAYERS.kpis.n, R.kpis.x - LY.kpis.x, R.kpis.y - LY.kpis.y - 84, "Live · real · derived, always labelled"],
  [basinL, R.basin.x + 560, R.basin.y + 50, "three.js · GTAO · bloom · workers"],
  [LAYERS.rail.n, R.rail.x - LY.rail.x + 30, R.rail.y - LY.rail.y + R.rail.h + 40, "Hand-made SVG charts"],
].map(([p, x, y, txt]) => callout(p, x, y, txt));
const themeTag = el(`<div class="abs" style="left:1640px;top:430px;display:flex;flex-direction:column;align-items:flex-start;gap:14px"></div>`, L.top);
el(`<div class="label" style="font-size:15px;margin-bottom:6px">theme</div>`, themeTag);
const themeChips = ["Auto", "Light", "Dark"].map((s) => el(`<span class="chip plain" style="font-size:18px;padding:12px 18px">${s}</span>`, themeTag));
const uiK = el(`<div class="abs" style="left:96px;top:420px;width:250px"></div>`, L.top);
const uiKk = el(kickerHTML("06", "Interface"), uiK);
css(uiKk, { position: "relative" });
const uiKt = el(`<div class="title" style="font-size:44px;line-height:1.08;margin-top:26px"></div>`, uiK);
const uiKl = lines(uiKt, ["Five", "modes,", "one", "console."]);
/** UI-space rect of the whole frame when the UI sits flat at the given scale */
const frameRect = (s) => ({ x: (0 - 960) / s + S.w / 2, y: (0 - 540) / s + S.h / 2, w: W / s, h: H / s });
const lerpRect = (a, b, p) => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p) });
const UI_FR = (t) => 230 + (t - 19) * 14;

function sceneUI(t) {
  const on = t >= 18.95 && t < 22.62;
  vis(L.ui, on);
  vis(uiK, on && t < 22.2);
  vis(themeTag, on);
  if (!on) return;
  // 1 · the season footage shrinks into the map of the console, the panels gather around it
  const shrink = P(t, 18.95, 19.7, E.io3);
  // 2 · tilt and explode the layers, 3 · back flat, 4 · light theme, 5 · dive into the map
  const tilt = P(t, 19.85, 20.55, E.io3) * (1 - P(t, 21.05, 21.6, E.io3));
  const dive = P(t, 22.05, 22.55, E.inExpo);
  const s = UI_SCALE * (1 - 0.2 * tilt);
  const zoom = 1 + dive * 0; // the dive itself is the landmark window growing (sceneLandmarks)
  css(ui, {
    transform: `translate(${960 + tilt * 50}px, ${540 + tilt * 105}px) rotateX(${tilt * 50}deg) rotateZ(${tilt * -32}deg) scale(${s * zoom}) translate(${-S.w / 2}px, ${-S.h / 2}px)`,
    opacity: 1 - P(t, 22.25, 22.5),
  });
  plate.style.opacity = P(t, 19.05, 19.45);
  const fly = [["head", 0, -140], ["kpis", 0, -90], ["rail", 180, 0], ["deck", 0, 140]];
  fly.forEach(([k, dx, dy], i) => {
    const q = P(t, 19.15 + i * 0.07, 19.65 + i * 0.07, E.outExpo);
    const L0 = LAYERS[k];
    css(L0.n, { opacity: q, transform: `translate3d(${(1 - q) * dx}px, ${(1 - q) * dy}px, ${tilt * L0.z}px)` });
  });
  basinL.style.transform = `translate3d(0,0,${tilt * 60}px)`;
  const r = lerpRect(frameRect(UI_SCALE), { x: R.basin.x, y: R.basin.y, w: R.basin.w, h: R.basin.h }, shrink);
  css(basinWin, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${shrink * 30}px` });
  foot("years", t < 19 ? YEARS_FR(t) : UI_FR(t), { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", filter: `brightness(${mix(0.58, 1, P(t, 19.0, 19.6))})` }, basinImg);
  if (!basinUI.src) basinUI.src = "../build/ui/layer-basin-ui.png";
  basinUI.style.opacity = P(t, 19.5, 19.8);
  CALLOUTS.forEach((c, i) => {
    const q = P(t, 20.25 + i * 0.07, 20.55 + i * 0.07, E.outExpo) * (1 - P(t, 20.95, 21.15));
    css(c, { opacity: q, transform: `translateY(${(1 - q) * 20}px)` });
  });
  // light theme: a circle grows from the theme button
  const lp = P(t, 21.55, 22.05, E.io3);
  const cx = R.theme.x + R.theme.w / 2, cy = R.theme.y + R.theme.h / 2;
  css(lightPage, { clipPath: `circle(${lp * 2500}px at ${cx}px ${cy}px)`, opacity: lp > 0 ? 1 : 0 });
  css(themeTag, { opacity: P(t, 21.5, 21.7) * (1 - P(t, 22.1, 22.3)) });
  themeChips.forEach((c, i) => {
    const pick = t < 21.6 ? 2 : 1; // dark, then light
    c.style.color = i === pick ? "#ff7a6b" : "";
    c.style.borderColor = i === pick ? "rgba(255,122,107,.6)" : "";
  });
  kickerAnim(uiKk, t, 19.7, 21.25);
  slideLines(uiKl, t, 19.78, 0.07, 0.6, 21.2);
}

/* ---------------------------------------------------------------- LANDMARKS */
const lm = el(`<div class="full"></div>`, L.type);
el(`<div class="scrim" style="background:linear-gradient(0deg,rgba(7,9,13,.78),transparent 38%),linear-gradient(180deg,rgba(7,9,13,.45),transparent 22%)"></div>`, lm);
const lmK = el(kickerHTML("07", "Built by hand"), lm);
css(lmK, { left: "120px", top: "112px" });
const lmCount = el(`<div class="abs" style="right:120px;top:150px;text-align:right">
  <div style="font:600 64px/1 var(--display)">${D.landmarks} <span style="font:500 20px var(--mono);letter-spacing:.14em;color:#a6aebd">LANDMARKS</span></div>
  <div style="font:600 64px/1 var(--display);margin-top:10px">${D.bridges} <span style="font:500 20px var(--mono);letter-spacing:.14em;color:#a6aebd">BRIDGES</span></div></div>`, lm);
const LM_TXT = {
  biosphere: ["Biosphère", "45.5141° N · 73.5314° W", "Buckminster Fuller’s geodesic dome, Expo 67"],
  stadium: ["Olympic Stadium", "45.5578° N · 73.5516° W", "The tallest inclined tower in the world, 165 m"],
  habitat: ["Habitat 67", "45.4999° N · 73.5436° W", "Moshe Safdie’s stacked concrete boxes"],
  oratory: ["Saint Joseph’s Oratory", "45.4918° N · 73.6182° W", "The copper dome on Mount Royal’s western summit"],
};
const lmLT = lowerThird(lm, "");
const lmWin = el(`<div class="win"></div>`, L.type);
L.type.prepend(lmWin); // above the console, below the type
const lmWinImg = el(`<img alt="">`, lmWin);
function sceneLandmarks(t) {
  const on = t >= 22.05 && t < 25.75;
  vis(lmWin, false);
  if (!on) { vis(lm, false); return; }
  // the dive: the biosphere opens out of the console's map
  if (t < 22.62) {
    const g = P(t, 22.05, 22.55, E.io3);
    const s = UI_SCALE;
    const b = { x: 960 + (R.basin.x - S.w / 2) * s, y: 540 + (R.basin.y - S.h / 2) * s, w: R.basin.w * s, h: R.basin.h * s };
    const r = lerpRect(b, { x: 0, y: 0, w: W, h: H }, g);
    vis(lmWin, true);
    css(lmWin, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${(1 - g) * 20}px`, opacity: P(t, 22.05, 22.15) });
    foot("biosphere", (t - 22.05) * FPS + 6, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${mix(1.14, 1, P(t, 22.05, 22.75, E.out3))})` }, lmWinImg);
  } else {
    cutFoot(LM_CUTS, t, "xblurB", 20);
  }
  vis(lm, t >= 22.45 && t < 25.5);
  if (t < 22.45 || t >= 25.5) return;
  kickerAnim(lmK, t, 22.5, 25.25);
  const cq = P(t, 22.6, 23.1, E.outExpo);
  css(lmCount, { opacity: cq * (1 - P(t, 25.25, 25.45)), transform: `translateY(${(1 - cq) * -24}px)` });
  let cur = 0;
  LM_CUTS.forEach(([, s], i) => { if (t >= s) cur = i; });
  const [name, s0] = LM_CUTS[cur];
  const s = cur === 0 ? 22.45 : s0;
  const [ttl, coords, sub] = LM_TXT[name];
  lmLT.n.textContent = coords;
  lmLT.line.textContent = ttl;
  lmLT.sub.textContent = sub;
  const end = cur < 3 ? LM_CUTS[cur + 1][1] : 25.5;
  const q = P(t, s + 0.06, s + 0.5, E.outExpo), o = P(t, end - 0.14, end, E.in2);
  lmLT.line.style.transform = `translateY(${(1 - q) * 112 - o * 112}%)`;
  css(lmLT.sub, { opacity: P(t, s + 0.12, s + 0.3) * (1 - o) });
  css(lmLT.n, { opacity: P(t, s + 0.04, s + 0.2) * (1 - o) });
}

/* ---------------------------------------------------------------- OUTRO */
const outro = el(`<div class="full"></div>`, L.type);
const outroDim = el(`<div class="scrim" style="background:radial-gradient(70% 70% at 50% 46%,rgba(7,9,13,.55),rgba(7,9,13,.9))"></div>`, outro);
const outroLow = el(`<div class="scrim" style="background:linear-gradient(0deg,rgba(7,9,13,.85),rgba(7,9,13,.35) 26%,transparent 40%)"></div>`, outro);
const stack = el(`<div class="abs" style="left:0;width:${W}px;top:930px;display:flex;justify-content:center;gap:14px"></div>`, outro);
const stackLab = el(`<div class="abs label" style="left:0;width:${W}px;top:888px;text-align:center;font-size:16px">built with</div>`, outro);
const TECH = ["Next.js", "three.js", "WebGL · GTAO · bloom", "Web Workers", "GBFS 2.2", "GitHub Actions", "Vercel"];
const techChips = TECH.map((s) => el(`<span class="chip plain" style="font-size:17px;padding:12px 18px;color:#eef0f5">${s}</span>`, stack));
const outroGroup = el(`<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px"></div>`, outro);
const capWrapB = el(`<div class="abs" style="left:751px;top:420px"></div>`, outroGroup);
const capB = makeCapsule(capWrapB);
const storyB = el(`<div class="wordStory abs" style="left:1060px;top:382px"></div>`, outroGroup);
const storyBL = letters(storyB, WORD);
const url = el(`<div class="abs" style="left:0;width:${W}px;top:580px;text-align:center;font:500 46px/1 var(--mono);letter-spacing:.02em;color:#eef0f5"></div>`, outroGroup);
const URL_TXT = "bixi-citi.vercel.app";
const urlRule = el(`<div class="abs" style="left:700px;width:520px;top:648px;height:3px;background:#e24b3f;box-shadow:0 0 18px rgba(238,49,36,.8);transform-origin:50% 50%"></div>`, outroGroup);
const credit = el(`<div class="abs" style="left:0;width:${W}px;top:700px;text-align:center">
  <div class="label" style="font-size:17px">design &amp; build</div>
  <div style="font:600 44px/1.2 var(--display);margin-top:12px;letter-spacing:-.01em">Sora Bon <span style="font:400 30px var(--body);color:#a6aebd">(Soroush Bonab)</span></div>
  <div class="label" style="font-size:18px;margin-top:12px;color:#ff7a6b;letter-spacing:.2em">linktr.ee/soroucsh</div></div>`, outroGroup);
const legal = el(`<div class="abs" style="left:0;width:${W}px;top:982px;text-align:center;font:400 17px/1.6 var(--mono);letter-spacing:.05em;color:#8a92a3">
  Unofficial. Not affiliated with, endorsed or sponsored by BIXI Montréal. BIXI and the BIXI logo are trademarks of BIXI Montréal.<br>
  Trip and station data: BIXI Montréal open data · Map data © OpenStreetMap contributors · Elevation: AWS Terrain Tiles</div>`, outroGroup);
const blackout = el(`<div class="full" style="background:#000;opacity:0"></div>`, L.top);
const leak = el(`<div class="full" style="mix-blend-mode:screen;opacity:0;background:radial-gradient(40% 60% at 50% 50%,rgba(255,170,110,.95),rgba(238,49,36,.45) 45%,transparent 75%)"></div>`, L.top);
function sceneOutro(t) {
  // light leak across the cut from the oratory
  const lk = P(t, 25.3, 25.85);
  css(leak, { opacity: Math.sin(lk * Math.PI) * 0.85, transform: `translateX(${mix(-900, 900, lk)}px) scale(1.6, 1)` });
  if (t >= 25.45) foot("outro", (t - 25.5) * FPS, { zIndex: 40, opacity: P(t, 25.45, 25.62), filter: `brightness(${1 - 0.25 * P(t, 26.9, 27.4)})` });
  vis(outro, t >= 25.5);
  if (t < 25.5) { blackout.style.opacity = 0; return; }
  // the stack
  css(stackLab, { opacity: P(t, 25.75, 25.95) * (1 - P(t, 26.9, 27.1)) });
  techChips.forEach((c, i) => {
    const q = P(t, 25.8 + i * 0.07, 26.2 + i * 0.07, E.outBack);
    const o = P(t, 26.85 + i * 0.02, 27.05 + i * 0.02, E.in2);
    css(c, { opacity: c01(q) * (1 - o), transform: `translateY(${(1 - q) * 30 + o * 20}px)` });
  });
  outroDim.style.opacity = P(t, 26.9, 27.5, E.io3);
  outroLow.style.opacity = P(t, 25.6, 25.9);
  // logo, URL, credit, legal
  const pop = P(t, 27.05, 27.5, E.outBack);
  css(capWrapB, { transform: `scale(${Math.max(0.001, pop)})`, opacity: P(t, 27.05, 27.15) });
  animCapsule(capB, t, 27.1);
  storyBL.forEach((s, i) => {
    const q = P(t, 27.3 + i * 0.05, 27.3 + i * 0.05 + 0.5, E.outExpo);
    css(s, { transform: `translateY(${(1 - q) * 46}px)`, opacity: q });
  });
  const n = Math.round(P(t, 27.65, 28.15) * URL_TXT.length);
  url.innerHTML = URL_TXT.slice(0, n) + (t > 27.6 && (n < URL_TXT.length || Math.floor(t * 3) % 2) ? '<span style="color:#e24b3f">▍</span>' : "");
  urlRule.style.transform = `scaleX(${P(t, 28.05, 28.5, E.outExpo)})`;
  const cq = P(t, 28.25, 28.75, E.outExpo);
  css(credit, { opacity: cq, transform: `translateY(${(1 - cq) * 26}px)` });
  css(legal, { opacity: P(t, 28.55, 28.9) });
  blackout.style.opacity = P(t, 29.6, 30.0, E.in2);
}

/* ---------------------------------------------------------------- HUD + finish */
const hud = el(`<div class="full"></div>`, L.hud);
[[44, 44, "border-top-width:2px;border-left-width:2px"], [W - 78, 44, "border-top-width:2px;border-right-width:2px"], [44, H - 78, "border-bottom-width:2px;border-left-width:2px"], [W - 78, H - 78, "border-bottom-width:2px;border-right-width:2px"]]
  .map(([x, y, b]) => el(`<i class="corner" style="left:${x}px;top:${y}px;${b}"></i>`, hud));
const hudTL = el(`<div class="abs hud" style="left:96px;top:56px"><span class="rec"></span>BIXI Citi <span style="opacity:.55">— showreel</span></div>`, hud);
const hudTR = el(`<div class="abs hud" style="right:96px;top:56px;text-align:right"></div>`, hud);
const hudBR = el(`<div class="abs hud" style="right:96px;bottom:56px;text-align:right"></div>`, hud);
const hudBL = el(`<div class="abs hud" style="left:96px;bottom:56px"></div>`, hud);
// a thin timeline with a tick per act and a red playhead
const prog = el(`<div class="abs" style="left:760px;width:400px;bottom:62px;height:2px;background:rgba(238,240,245,.16)"></div>`, hud);
Object.values(T).slice(1).forEach(([a]) => el(`<i style="position:absolute;left:${(a / 30) * 400}px;top:-4px;width:1px;height:10px;background:rgba(238,240,245,.35)"></i>`, prog));
const progFill = el(`<i style="position:absolute;left:0;top:0;height:2px;background:#e24b3f;box-shadow:0 0 10px rgba(238,49,36,.8)"></i>`, prog);
const flash = el(`<div id="flash"></div>`, L.top);
const vignette = el(`<div id="vignette"></div>`, L.top);
const grain = el(`<canvas id="grain" width="640" height="360"></canvas>`, L.top);
const gctx = grain.getContext("2d");
const gimg = gctx.createImageData(640, 360);
const FLASHES = [[2.98, 0.04, 0.26, 0.28], [5.98, 0.03, 0.16, 0.5], [8.46, 0.04, 0.24, 0.24], [13.25, 0.02, 0.14, 0.2], [14.0, 0.02, 0.14, 0.2], [14.75, 0.02, 0.14, 0.2], [15.5, 0.03, 0.22, 0.22], [23.25, 0.02, 0.14, 0.2], [24.0, 0.02, 0.14, 0.2], [24.75, 0.02, 0.14, 0.2], [27.05, 0.03, 0.4, 0.22]];
/** where the camera is looking, for the HUD */
const camNow = (name, fr) => {
  const s = SHOT[name];
  const u = c01(fr / (s.frames - 1));
  const a = s.cam[0].v, b = s.cam[s.cam.length - 1].v;
  return [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
};
const ACT_NAMES = [["intro", "—"], ["city", "01 · city"], ["live", "02 · live"], ["day", "03 · one day"], ["night", "04 · after dark"], ["years", "05 · 13 seasons"], ["ui", "06 · interface"], ["lm", "07 · landmarks"], ["outro", "08 · fin"]];
function sceneHUD(t, frameIdx, shotOnTop) {
  const on = t >= 3.0 && t < 27.0;
  const o = P(t, 3.0, 3.4) * (1 - P(t, 26.8, 27.1));
  css(hud, { opacity: o });
  // the console fills the frame: keep only the corners
  const quiet = 1 - P(t, 18.9, 19.1) * (1 - P(t, 22.4, 22.6));
  [hudTL, hudTR, hudBL, hudBR].forEach((n) => (n.style.opacity = quiet));
  vis(hud, on);
  if (!on) return;
  progFill.style.width = `${(t / 30) * 400}px`;
  prog.style.opacity = 1 - P(t, 18.9, 19.1) * (1 - P(t, 22.4, 22.6));
  const sec = Math.floor(t), ff = frameIdx % FPS;
  hudTR.innerHTML = `TC <b>00:00:${String(sec).padStart(2, "0")}:${String(ff).padStart(2, "0")}</b> &nbsp;·&nbsp; 60 fps`;
  const act = ACT_NAMES.find(([k]) => t >= T[k][0] && t < T[k][1]);
  hudBL.textContent = act ? act[1] : "";
  if (shotOnTop) {
    const [lat, lon, dist] = camNow(shotOnTop.name, shotOnTop.frame);
    hudBR.innerHTML = `${lat.toFixed(4)}° N &nbsp;${Math.abs(lon).toFixed(4)}° W &nbsp;·&nbsp; <b>${dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist) + " m"}</b>`;
  } else hudBR.innerHTML = "";
  hudTL.querySelector(".rec").style.opacity = Math.floor(t * 2) % 2 ? 0.35 : 1;
}
function finish(t, frameIdx) {
  let f = 0;
  for (const [a, att, dec, amp] of FLASHES) f = Math.max(f, pulse(t, a, att, dec) * amp);
  flash.style.opacity = f;
  vignette.style.opacity = t >= 19.1 && t < 22.2 ? 0.55 : 1;
  // film grain at 30 Hz: alive, but cheap for the encoder
  const r = rng((frameIdx >> 1) * 7919 + 13);
  const px = gimg.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = 128 + (r() - 0.5) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);
}

/* ---------------------------------------------------------------- seek */
function topShot(t) {
  // which clip fills the screen, for the HUD readout
  if (t < 3) return null;
  if (t < 6) return { name: "city", frame: 30 + (t - 3) * FPS };
  if (t < 8.5) return { name: "live", frame: (t - 6) * FPS };
  if (t < 12.5) return { name: "day", frame: 30 + (t - 8.5) * FPS };
  if (t < 15.5) { const c = [...NIGHT_CUTS].reverse().find(([, s]) => t >= s); return { name: c[0], frame: (t - c[1]) * FPS + 6 }; }
  if (t < 19) return { name: "years", frame: YEARS_FR(t) };
  if (t < 22.5) return null;
  if (t < 25.5) { const c = [...LM_CUTS].reverse().find(([, s]) => t >= s); return { name: c[0], frame: (t - c[1]) * FPS + 6 }; }
  return { name: "outro", frame: (t - 25.5) * FPS };
}

const fontsReady = Promise.all([
  document.fonts.load("600 100px Unbounded"), document.fonts.load("500 20px 'Geist Mono'"), document.fonts.load("400 20px Geist"), document.fonts.load("600 20px Geist"),
]).then(() => document.fonts.ready);
const staticImgs = [...document.querySelectorAll("#ui img")].map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; })));

window.DURATION = 30;
window.FPS = FPS;
let laidOut = false;
window.seek = async (t) => {
  await fontsReady;
  await Promise.all(staticImgs);
  if (!laidOut) { layoutLockup(); laidOut = true; }
  const frameIdx = Math.round(t * FPS);
  pending = [];
  for (const img of allFeet) { img._used = false; Object.assign(img.style, BLANK); }
  basinImg._used = true;
  lmWinImg._used = true;
  sceneIntro(t);
  sceneCity(t);
  sceneLive(t);
  sceneDay(t);
  sceneNight(t);
  sceneYears(t);
  sceneUI(t);
  sceneLandmarks(t);
  sceneOutro(t);
  sceneHUD(t, frameIdx, topShot(t));
  finish(t, frameIdx);
  for (const img of allFeet) if (!img._used) img.style.display = "none";
  await Promise.all(pending);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return frameIdx;
};
window.compReady = true;
