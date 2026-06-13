/* LOTUS — pixelated lotus that blooms, holds, then scatters into particles. */
(() => {
  const canvas = document.getElementById("flower");
  const ctx = canvas.getContext("2d");

  // ---- Custom cursor ----------------------------------------------------
  const cursor = document.getElementById("cursor");
  let mx = window.innerWidth * 0.15;
  let my = window.innerHeight * 0.55;
  window.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
  });

  // ---- Offscreen flower render ------------------------------------------
  const FS = 720;                 // offscreen flower resolution
  const GRID = 9;                 // sampling cell size (px) -> ~80x80 dots
  const off = document.createElement("canvas");
  off.width = off.height = FS;
  const octx = off.getContext("2d");

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Draw one tapered petal pointing "up" from origin, length L, width W.
  function petal(c, L, W, grad) {
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(W, -L * 0.45, W * 0.18, -L);
    c.quadraticCurveTo(0, -L * 1.06, -W * 0.18, -L);
    c.quadraticCurveTo(-W, -L * 0.45, 0, 0);
    c.closePath();
    c.fillStyle = grad;
    c.fill();
  }

  function ringGrad(c, L, base, tip) {
    const g = c.createLinearGradient(0, 0, 0, -L);
    g.addColorStop(0, base);
    g.addColorStop(0.55, tip);
    g.addColorStop(1, "rgba(255,235,245,0.95)");
    return g;
  }

  // Render the fully-bloomed lotus into the offscreen canvas.
  function renderLotus() {
    octx.clearRect(0, 0, FS, FS);
    const cx = FS / 2;
    const cy = FS / 2;
    octx.save();
    octx.translate(cx, cy);

    const rings = [
      { n: 14, L: 300, W: 70, base: "#a8104a", tip: "#ff77b4" }, // outer
      { n: 12, L: 235, W: 62, base: "#c11457", tip: "#ff8cc0" },
      { n: 10, L: 170, W: 56, base: "#e01e6b", tip: "#ffa6cf" },
      { n: 8,  L: 110, W: 48, base: "#ff3b86", tip: "#ffd36b" }, // inner -> warm
    ];

    rings.forEach((r, ri) => {
      const offset = ri % 2 ? Math.PI / r.n : 0;
      for (let i = 0; i < r.n; i++) {
        octx.save();
        octx.rotate(offset + (i / r.n) * Math.PI * 2);
        petal(octx, r.L, r.W, ringGrad(octx, r.L, r.base, r.tip));
        octx.restore();
      }
    });

    // Glowing yellow core
    const core = octx.createRadialGradient(0, 0, 2, 0, 0, 90);
    core.addColorStop(0, "#fff6c8");
    core.addColorStop(0.4, "#ffd23f");
    core.addColorStop(0.8, "#ff9d2e");
    core.addColorStop(1, "rgba(255,120,40,0)");
    octx.beginPath();
    octx.arc(0, 0, 90, 0, Math.PI * 2);
    octx.fillStyle = core;
    octx.fill();

    octx.restore();
  }

  // ---- Build particles from rendered flower -----------------------------
  let particles = [];
  function buildParticles() {
    renderLotus();
    const img = octx.getImageData(0, 0, FS, FS).data;
    particles = [];
    const half = FS / 2;
    let maxD = 1;
    for (let y = GRID / 2; y < FS; y += GRID) {
      for (let x = GRID / 2; x < FS; x += GRID) {
        const idx = (Math.floor(y) * FS + Math.floor(x)) * 4;
        const a = img[idx + 3];
        if (a < 40) continue;
        const r = img[idx], g = img[idx + 1], b = img[idx + 2];
        if (r + g + b < 36) continue;
        const hx = x - half;
        const hy = y - half;
        const d = Math.hypot(hx, hy);
        if (d > maxD) maxD = d;
        const ang = Math.atan2(hy, hx);
        particles.push({
          hx, hy, d, ang,
          r, g, b, a: a / 255,
          // scatter velocity (outward + slight downward bias)
          vx: Math.cos(ang) * (0.6 + Math.random() * 1.4),
          vy: Math.sin(ang) * (0.6 + Math.random() * 1.4) + 0.8 + Math.random(),
          spin: (Math.random() - 0.5) * 0.4,
          seed: Math.random(),
        });
      }
    }
    particles.forEach((p) => (p.dn = p.d / maxD)); // normalized distance 0..1
  }
  buildParticles();

  // ---- Resize -----------------------------------------------------------
  let W, H, DPR, scale, cx, cy, dot;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const disp = Math.min(H * 0.92, W * 0.62);
    scale = disp / FS;
    dot = Math.max(2, GRID * scale - 1.4);
    cx = W * (W < 760 ? 0.5 : 0.62);
    cy = H * 0.54;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Animation loop ---------------------------------------------------
  // Timeline (ms): bloom -> hold -> scatter -> tiny gap -> repeat
  const BLOOM = 2600, HOLD = 1500, SCATTER = 1900, GAP = 350;
  const LOOP = BLOOM + HOLD + SCATTER + GAP;
  let start = performance.now();

  function draw(now) {
    const t = (now - start) % LOOP;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    let phase, p;
    if (t < BLOOM) { phase = "bloom"; p = t / BLOOM; }
    else if (t < BLOOM + HOLD) { phase = "hold"; p = (t - BLOOM) / HOLD; }
    else if (t < BLOOM + HOLD + SCATTER) { phase = "scatter"; p = (t - BLOOM - HOLD) / SCATTER; }
    else { phase = "gap"; p = 1; }

    const shimmer = Math.sin(now * 0.004);

    for (let i = 0; i < particles.length; i++) {
      const part = particles[i];
      let px, py, alpha, size = dot;

      if (phase === "bloom") {
        // Flower scales up from a small bud and resolves, staggered by ring.
        const delay = part.dn * 0.3;
        let local = (p - delay) / (1 - delay);
        local = Math.max(0, Math.min(1, local));
        const e = easeOut(local);
        const grow = 0.22 + 0.78 * easeInOut(p); // keeps petal shape while growing
        px = cx + part.hx * scale * grow;
        py = cy + part.hy * scale * grow;
        alpha = part.a * e * 0.9;
        size = (dot * (0.45 + 0.55 * e)) * (0.7 + 0.3 * grow);
      } else if (phase === "hold") {
        const tw = 0.92 + 0.08 * Math.sin(now * 0.006 + part.seed * 6.28);
        px = cx + part.hx * scale;
        py = cy + part.hy * scale;
        alpha = part.a * tw;
      } else if (phase === "scatter") {
        // Dissolve from bottom up: lower petals leave first.
        const bottomBias = (part.hy + FS / 2) / FS; // 0 top .. 1 bottom
        const delay = (1 - bottomBias) * 0.45;
        let local = (p - delay) / (1 - delay);
        local = Math.max(0, Math.min(1, local));
        const e = local;
        const fly = e * e * 140;
        px = cx + part.hx * scale + part.vx * fly + part.spin * fly;
        py = cy + part.hy * scale + part.vy * fly + 0.6 * fly * e;
        alpha = part.a * (1 - e);
        size = dot * (1 - 0.3 * e);
      } else {
        continue; // gap: blank
      }

      if (alpha <= 0.01) continue;
      const glow = 1 + 0.12 * shimmer;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${Math.min(255, part.r * glow)},${Math.min(255, part.g * glow)},${Math.min(255, part.b * glow)})`;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }

    ctx.restore();
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
