// Moteur du showreel : outils partagés par toutes les scènes.
// Règle d'or : l'image à l'instant t ne dépend QUE de t. Pas de Math.random, pas
// de Date, pas d'état qui s'accumule d'une frame à l'autre. Les précalculs
// déterministes (rng seedé) sont permis dans setup().
'use strict';
window.R = (() => {
  const W = 1920, H = 1080, FPS = 30, BPM = 120;
  const BEAT = 60 / BPM, BAR = BEAT * 4, TAU = Math.PI * 2;

  const canvas = document.getElementById('c');
  const main = canvas.getContext('2d');
  let ctx = main; // contexte courant (voir R.use)

  // ---------- palette & typographies ----------
  const C = {
    ink: '#0B0B0F', night: '#14141B', paper: '#F2EFE9', white: '#FFFFFF', grey: '#8A8A93', smoke: '#2A2A33',
    coral: '#D97757', orange: '#FF5A36', blue: '#3D5AFE', lime: '#C6FF3D', pink: '#FF4FA3',
    yellow: '#FFC93C', violet: '#7B61FF', teal: '#14C8B4',
  };
  const F = {
    display: '"Inter Display", "Inter", sans-serif', // poids 100 à 900
    body: '"Inter", sans-serif',
    serif: '"Instrument Serif", serif',              // normal + italic
    mono: '"JetBrains Mono", monospace',
    condensed: '"Anton", "Inter Display", sans-serif',
  };

  // ---------- maths ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, x) => (x - a) / (b - a);
  const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
  const P = (t, start, dur) => clamp((t - start) / dur);
  const fract = x => x - Math.floor(x);
  const smooth = x => x * x * (3 - 2 * x);

  const E = {
    lin: t => t,
    inQuad: t => t * t, outQuad: t => 1 - (1 - t) * (1 - t), ioQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    in3: t => t * t * t, out3: t => 1 - Math.pow(1 - t, 3), io3: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    in4: t => t ** 4, out4: t => 1 - Math.pow(1 - t, 4), io4: t => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    in5: t => t ** 5, out5: t => 1 - Math.pow(1 - t, 5), io5: t => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
    inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    ioExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    inSine: t => 1 - Math.cos((t * Math.PI) / 2), outSine: t => Math.sin((t * Math.PI) / 2), ioSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inBack: t => 2.70158 * t ** 3 - 1.70158 * t * t,
    outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    ioBack: t => { const c = 2.5949095; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; },
    outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    outBounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  // Ressort amorti analytique (pas d'état) : 0 -> 1 avec dépassement.
  const spring = (t, freq = 3, damp = 5) => (t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(TAU * freq * t));

  function rng(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

  // Bruit de gradient 2D (Perlin) déterministe, valeurs ~[-1, 1].
  const PERM = (() => { const r = rng(1337), p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p.concat(p); })();
  const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const g = (h, dx, dy) => { const q = GRAD[h & 7]; return q[0] * dx + q[1] * dy; };
    const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1], ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
    return lerp(lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u), lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u), v) * 1.4;
  }
  const noise1 = x => noise2(x, 0.5);
  const fbm = (x, y, oct = 4) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2; a *= 0.5; } return s; };
  // Champ de rotationnel (curl) : écoulement sans divergence, idéal pour les particules.
  function curl(x, y, z = 0) {
    const e = 0.01, n = (a, b) => noise2(a + z, b - z * 0.7);
    return [(n(x, y + e) - n(x, y - e)) / (2 * e), -(n(x + e, y) - n(x - e, y)) / (2 * e)];
  }

  // ---------- couleurs ----------
  const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a = 1) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const mix = (h1, h2, t, a = 1) => { const p = hexRgb(h1), q = hexRgb(h2); return `rgba(${Math.round(lerp(p[0], q[0], t))},${Math.round(lerp(p[1], q[1], t))},${Math.round(lerp(p[2], q[2], t))},${a})`; };
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

  // ---------- contexte ----------
  // R.use(autreCtx, () => { ... }) : les helpers dessinent dans autreCtx le temps de la fonction.
  function use(c, fn) { const prev = ctx; ctx = c; try { return fn(); } finally { ctx = prev; } }
  const LAYERS = {};
  // Calque hors écran 1920x1080 réutilisable (non effacé automatiquement).
  function layer(id, w = W, h = H) {
    if (!LAYERS[id]) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; LAYERS[id] = { canvas: cv, ctx: cv.getContext('2d') }; }
    return LAYERS[id];
  }

  // ---------- texte ----------
  function font(o = {}) {
    ctx.font = `${o.style || 'normal'} ${o.weight || 400} ${o.size || 40}px ${o.family || F.display}`;
    ctx.letterSpacing = (o.ls || 0) + 'px';
  }
  function measure(str, o = {}) { ctx.save(); font(o); const w = ctx.measureText(str).width; ctx.restore(); return w; }
  function text(str, x, y, o = {}) {
    ctx.save();
    font(o);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lineWidth || 2; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    if (o.color !== null) { ctx.fillStyle = o.color || C.white; ctx.fillText(str, x, y); }
    ctx.restore();
  }

  // Mots marqués d'un * : couleur o.accent (italique si serif).
  function tokens(str, o) {
    return str.split(' ').map(w => (w.startsWith('*')
      ? { word: w.slice(1), o: { ...o, style: o.family === F.serif ? 'italic' : o.style, color: o.accent || C.coral } }
      : { word: w, o }));
  }
  // Ligne cinétique : les mots montent derrière un masque, en cascade ; o.out = instant de sortie.
  function revealLine(str, x, y, t, start, o = {}) {
    if (t < start) return;
    if (o.out !== undefined && t > o.out + 2) return;
    const size = o.size || 60, dur = o.dur || 0.8, st = o.stagger ?? 0.06;
    const toks = tokens(str, o);
    ctx.save();
    font(o);
    const space = ctx.measureText(' ').width;
    for (const tk of toks) { font(tk.o); tk.w = ctx.measureText(tk.word).width; }
    const total = toks.reduce((s, tk) => s + tk.w, 0) + space * (toks.length - 1);
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    const asc = size * 1.05, desc = size * 0.38, base = ctx.globalAlpha * (o.alpha ?? 1);
    ctx.beginPath(); ctx.rect(cx - size, y - asc, total + size * 2, asc + desc); ctx.clip();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    toks.forEach((tk, i) => {
      const p = (o.ease || E.outExpo)(P(t, start + i * st, dur));
      const q = o.out !== undefined ? E.in3(P(t, o.out + i * st * 0.5, 0.45)) : 0;
      if (p > 0 && q < 1) {
        font(tk.o);
        ctx.fillStyle = tk.o.color || C.white;
        ctx.globalAlpha = base * clamp(p * 1.4) * (1 - q);
        ctx.fillText(tk.word, cx, y + (1 - p - q) * (asc + desc) * 0.9);
      }
      cx += tk.w + space;
    });
    ctx.restore();
  }
  // Lettre par lettre (o.from : 'bottom' | 'top' | 'scale').
  function revealChars(str, x, y, t, start, o = {}) {
    if (t < start) return;
    const size = o.size || 120, dur = o.dur || 0.9, st = o.stagger ?? 0.04;
    ctx.save();
    font(o);
    const total = ctx.measureText(str).width;
    const x0 = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    const base = ctx.globalAlpha * (o.alpha ?? 1);
    ctx.fillStyle = o.color || C.white;
    ctx.textAlign = 'left';
    if (o.mask) { ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.05, total + size * 2, size * 1.4); ctx.clip(); }
    for (let i = 0; i < str.length; i++) {
      const p = (o.ease || E.outExpo)(P(t, start + i * st, dur));
      if (p <= 0) continue;
      const px = x0 + ctx.measureText(str.slice(0, i)).width;
      ctx.globalAlpha = base * (o.mask ? 1 : clamp(p * 1.3));
      if (o.from === 'scale') {
        const cw = ctx.measureText(str[i]).width;
        ctx.save(); ctx.translate(px + cw / 2, y - size * 0.35); ctx.scale(p, p); ctx.fillText(str[i], -cw / 2, size * 0.35); ctx.restore();
      } else {
        const dir = o.from === 'top' ? -1 : 1;
        ctx.fillText(str[i], px, y + dir * (1 - p) * size * (o.mask ? 1.1 : 0.4));
      }
    }
    ctx.restore();
  }

  // ---------- formes ----------
  function glow(x, y, r, color, a = 1) {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.35)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function ring(x, y, p, r0, r1, color, width = 2, a = 1) {
    if (p <= 0 || p >= 1) return;
    ctx.save(); ctx.globalAlpha *= a * (1 - p); ctx.strokeStyle = color; ctx.lineWidth = width * (1 - p * 0.5);
    ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, E.outExpo(p)), 0, TAU); ctx.stroke(); ctx.restore();
  }
  function path(pts, close = true) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (close) ctx.closePath();
  }
  const polygon = (n, r, rot = -Math.PI / 2, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + (i / n) * TAU) * r, cy + Math.sin(rot + (i / n) * TAU) * r]);
  const star = (n, r1, r2, rot = -Math.PI / 2, cx = 0, cy = 0) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? r2 : r1, a = rot + (i / (n * 2)) * TAU; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const circlePts = (r, n = 128, cx = 0, cy = 0) => polygon(n, r, -Math.PI / 2, cx, cy);
  // Rééchantillonne un contour fermé en n points équidistants (pour les morphings).
  function resample(pts, n) {
    const seg = [], m = pts.length; let total = 0;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); total += l; }
    const out = []; let i = 0, acc = 0;
    for (let k = 0; k < n; k++) {
      const d = (k / n) * total;
      while (acc + seg[i] < d && i < m - 1) { acc += seg[i]; i++; }
      const a = pts[i], b = pts[(i + 1) % m], f = seg[i] ? (d - acc) / seg[i] : 0;
      out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    }
    return out;
  }
  const morph = (a, b, t) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]);

  // ---------- rythme (120 BPM : 1 temps = 0,5 s, 1 mesure = 2 s) ----------
  const beatOf = t => t / BEAT;
  // Impulsion qui retombe après chaque temps (div=2 : croches, div=0.25 : chaque mesure).
  const pulse = (t, decay = 6, div = 1) => Math.exp(-fract(t / (BEAT / div)) * decay);

  // ---------- scènes ----------
  const scenes = [];
  function scene(def) { scenes.push(def); }

  return {
    W, H, FPS, BPM, BEAT, BAR, TAU, C, F, E, canvas, main,
    get ctx() { return ctx; },
    clamp, lerp, invLerp, remap, P, fract, smooth, spring, rng, hash, hash2, noise1, noise2, fbm, curl,
    hexRgb, rgba, mix, hsl, use, layer,
    font, measure, text, revealLine, revealChars,
    glow, ring, path, polygon, star, circlePts, resample, morph,
    beatOf, pulse, scenes, scene,
  };
})();
