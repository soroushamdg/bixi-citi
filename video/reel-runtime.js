/**
 * Runs inside the app page (dev server) during capture. It drives the real
 * scene through `__bixi.scene.capture`: a virtual clock, a scripted camera and
 * the app's own state, so every recorded frame is exactly what the site draws.
 */
(() => {
  const { scene, ui, data, story } = window.__bixi;
  const cap = scene.capture;
  const canvas = document.querySelector(".basin canvas");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const EASE = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    expo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  };

  /** Montréal wall-clock minute of a date → epoch ms (EDT in the season, EST otherwise) */
  const mtl = (date, minute) => {
    const [y, m, d] = date.split("-").map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d, 12));
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Montreal", timeZoneName: "short" }).format(probe);
    const off = name.includes("EDT") ? 4 : 5;
    return Date.UTC(y, m - 1, d) + (minute + off * 60) * 60000;
  };

  /** Catmull-Rom through camera keys; distance in log space, bearing unwrapped */
  const camAt = (keys, u) => {
    if (keys.length === 1) return { v: keys[0].v.slice(), lift: keys[0].lift ?? 0 };
    const ts = keys.map((k) => k.t);
    let j = 0;
    while (j < keys.length - 2 && u > ts[j + 1]) j++;
    const s = clamp((u - ts[j]) / (ts[j + 1] - ts[j] || 1), 0, 1);
    const P = (k) => {
      const q = keys[clamp(k, 0, keys.length - 1)];
      return [q.v[0], q.v[1], Math.log(q.v[2]), q.v[3], q.v[4], q.lift ?? 0];
    };
    const p0 = P(j - 1), p1 = P(j), p2 = P(j + 1), p3 = P(j + 2);
    // unwrap bearings around p1
    for (const p of [p0, p2, p3]) p[3] = p1[3] + (((p[3] - p1[3]) % 360) + 540) % 360 - 180;
    p3[3] = p2[3] + (((p3[3] - p2[3]) % 360) + 540) % 360 - 180;
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
    const r = p1.map((_, k) => cr(p0[k], p1[k], p2[k], p3[k]));
    return { v: [r[0], r[1], Math.exp(r[2]), ((r[3] % 360) + 360) % 360, r[4]], lift: r[5] };
  };

  const range = (x, u) => (Array.isArray(x) ? lerp(x[0], x[1], u) : x);

  /** everything a shot needs at progress u (0..1) */
  const stateAt = (shot, i) => {
    const n = Math.max(1, shot.frames - 1);
    const lin = i / n;
    const u = EASE[shot.ease ?? "inout"](lin);
    const cam = camAt(shot.cam, u);
    const tl = EASE[shot.timeEase ?? "linear"](lin);
    const st = {};
    if (shot.minute !== undefined) st.minute = range(shot.minute, tl);
    if (shot.yday !== undefined) st.yday = range(shot.yday, tl);
    let sun = null;
    if (shot.sun) sun = mtl(shot.sun.date, range(shot.sun.minute, tl));
    return { cam, st, sun, t: (shot.t0 ?? 0) + i / 60 };
  };

  const waitFor = async (ok, ms = 60000) => {
    const t0 = performance.now();
    while (!ok()) {
      if (performance.now() - t0 > ms) throw new Error("timeout waiting");
      await sleep(60);
    }
  };

  const draw = (s, dt) => {
    cap.sun(s.sun);
    if (Object.keys(s.st).length) ui.setState(s.st);
    cap.frame(s.t, s.cam.v, s.cam.lift, dt);
  };

  /** render until every tile on screen has loaded and grown in */
  const settle = async (s) => {
    cap.replan();
    draw(s, 0);
    const t0 = performance.now();
    while (cap.busy && performance.now() - t0 < 30000) {
      await sleep(40);
      draw(s, 0);
    }
    draw(s, 0);
  };

  window.REEL = {
    async begin(budget = 110) {
      cap.begin(1);
      cap.budget(budget);
      await waitFor(() => data.getState().info && data.getState().status);
      await waitFor(() => data.getState().hist && data.getState().day.every(Boolean));
    },
    async prepare(shot) {
      ui.setState({ playing: false, chapter: -1, selected: null, hover: null });
      if (shot.mode === "years") {
        story.setMode("years");
        story.selectYear(shot.year);
        await waitFor(() => {
          const d = data.getState();
          return d.yearSummary?.year === shot.year && d.yearSample && d.yearStations && d.yearDays;
        });
      } else story.setMode(shot.mode);
      ui.setState({ playing: false, chapter: -1 });
      if (shot.from) {
        // start from another mode so the pillars rise on camera
        ui.setState({ mode: shot.from });
        const s0 = stateAt(shot, 0);
        for (let k = 0; k < 90; k++) draw(s0, 1000 / 60);
        ui.setState({ mode: shot.mode });
      }
      // walk the camera path so the tiles it will see are already resident
      for (let k = 0; k <= 8; k++) await settle(stateAt(shot, Math.round((k / 8) * (shot.frames - 1))));
      const s0 = stateAt(shot, 0);
      await settle(s0);
      for (let k = 0; k < (shot.preroll ?? 0); k++) draw(s0, 1000 / 60);
      return true;
    },
    /** one frame (with optional sub-frame motion blur) as a JPEG data URL */
    async frame(shot, i, quality = 0.93) {
      const sub = shot.sub ?? 1;
      const s = stateAt(shot, i);
      // tiles first, with the clock frozen
      cap.replan();
      draw(s, 0);
      if (cap.busy) await settle(s);
      if (sub === 1) {
        draw(s, 1000 / 60);
        return canvas.toDataURL("image/jpeg", quality);
      }
      const acc = (this._acc ??= document.createElement("canvas"));
      acc.width = canvas.width;
      acc.height = canvas.height;
      const g = acc.getContext("2d");
      for (let k = 0; k < sub; k++) {
        const f = i - 0.5 + (k + 0.5) / sub;
        const sk = stateAt(shot, clamp(f, 0, shot.frames - 1));
        sk.cam = s.cam; // blur time, not the camera
        draw(sk, 1000 / 60 / sub);
        g.globalAlpha = 1 / (k + 1);
        g.drawImage(canvas, 0, 0);
      }
      g.globalAlpha = 1;
      return acc.toDataURL("image/jpeg", quality);
    },
    end() { cap.end(); },
    mtl,
  };
})();
