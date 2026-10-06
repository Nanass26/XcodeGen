// Claude — Mon histoire.
// Chaque image est une fonction pure du temps : renderFrame(t) dessine l'instant t.
// En mode rendu (?render=1), render.js appelle renderFrame pour chaque frame ;
// sinon la page joue l'animation en temps réel (espace : pause, flèches : ±5 s).
'use strict';
(() => {
  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;

  // ---------- palette & typographie ----------
  const C = {
    ink: '#F4EFE6', muted: '#A39C90', dim: '#6B645A',
    accent: '#D97757', accent2: '#EBB27C', sage: '#9DB67F',
    paper: '#F4EFE6', dark: '#24201C', black: '#0A0908',
  };
  const SERIF = '"Instrument Serif", "DejaVu Serif", serif';
  const SANS = '"Inter Display", "Inter", sans-serif';
  const BODY = '"Inter", sans-serif';
  const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // ---------- outils ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (t, start, dur) => clamp((t - start) / dur);
  const E = {
    out3: t => 1 - Math.pow(1 - t, 3),
    in3: t => t * t * t,
    io3: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

  function setFont(o) {
    ctx.font = `${o.style || 'normal'} ${o.weight || 400} ${o.size || 40}px ${o.family || SANS}`;
    ctx.letterSpacing = (o.ls || 0) + 'px';
  }

  function text(str, x, y, o = {}) {
    ctx.save();
    setFont(o);
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function glow(x, y, r, color, a) {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.45, rgba(color, a * 0.35));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function ring(x, y, p, r0, r1, color, width = 2, a = 1) {
    if (p <= 0 || p >= 1) return;
    ctx.save();
    ctx.globalAlpha *= a * (1 - p);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (1 - p * 0.5);
    ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, E.outExpo(p)), 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // Mots marqués d'un * : couleur d'accent (et italique en serif).
  function tokens(str, o) {
    return str.split(' ').map(w => {
      if (!w.startsWith('*')) return { word: w, o };
      return {
        word: w.slice(1),
        o: { ...o, style: o.family === SERIF ? 'italic' : o.style, color: o.accentColor || C.accent },
      };
    });
  }

  // Ligne cinétique : les mots montent derrière un masque, en cascade.
  // o.out : instant où les mots ressortent par le haut.
  function revealLine(str, x, y, t, start, o = {}) {
    if (t < start) return;
    if (o.out !== undefined && t > o.out + 1.6) return;
    const size = o.size || 60, dur = o.dur || 1.0, stagger = o.stagger ?? 0.075;
    const toks = tokens(str, o);
    ctx.save();
    setFont(o);
    const space = ctx.measureText(' ').width;
    for (const tk of toks) { setFont(tk.o); tk.w = ctx.measureText(tk.word).width; }
    const total = toks.reduce((s, tk) => s + tk.w, 0) + space * (toks.length - 1);
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    const asc = size * 1.05, desc = size * 0.38;
    const base = ctx.globalAlpha * (o.alpha ?? 1);
    ctx.beginPath(); ctx.rect(cx - size, y - asc, total + size * 2, asc + desc); ctx.clip();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    toks.forEach((tk, i) => {
      const p = E.outExpo(P(t, start + i * stagger, dur));
      const q = o.out !== undefined ? E.in3(P(t, o.out + i * stagger * 0.5, 0.55)) : 0;
      if (p > 0 && q < 1) {
        setFont(tk.o);
        ctx.fillStyle = tk.o.color || C.ink;
        ctx.globalAlpha = base * clamp(p * 1.4) * (1 - q);
        ctx.fillText(tk.word, cx, y + ((1 - p) - q) * (asc + desc) * 0.9);
      }
      cx += tk.w + space;
    });
    ctx.restore();
  }

  // Titre lettre par lettre.
  function revealChars(str, x, y, t, start, o = {}) {
    if (t < start) return;
    const size = o.size || 120, dur = o.dur || 1.2, st = o.stagger ?? 0.05;
    ctx.save();
    setFont(o);
    const total = ctx.measureText(str).width;
    const x0 = o.align === 'center' ? x - total / 2 : x;
    const base = ctx.globalAlpha * (o.alpha ?? 1);
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = 'left';
    for (let i = 0; i < str.length; i++) {
      const p = E.outExpo(P(t, start + i * st, dur));
      if (p <= 0) continue;
      const px = x0 + ctx.measureText(str.slice(0, i)).width;
      ctx.globalAlpha = base * clamp(p * 1.3);
      ctx.fillText(str[i], px, y + (1 - p) * size * 0.4);
    }
    ctx.restore();
  }

  // ---------- décor global ----------
  const DUST = (() => {
    const r = rng(7);
    return Array.from({ length: 130 }, () => ({ x: r() * W, y: r() * H, z: 0.2 + r() * 0.8, ph: r() * TAU, sp: 5 + r() * 16 }));
  })();

  const GRAIN = (() => {
    const g = document.createElement('canvas');
    g.width = g.height = 512;
    const gc = g.getContext('2d'), img = gc.createImageData(512, 512), r = rng(99);
    for (let i = 0; i < 512 * 512; i++) {
      const v = r() * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    return ctx.createPattern(g, 'repeat');
  })();

  function drawBackground(t) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.5, W * 0.78);
    g.addColorStop(0, '#221E1A');
    g.addColorStop(1, '#0B0A09');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    glow(W * 0.5 + Math.sin(t * 0.07) * 420, H * 0.38 + Math.cos(t * 0.05) * 140, 1000, C.accent, 0.07);
    glow(W * 0.5 - Math.sin(t * 0.06) * 520, H * 0.7, 900, '#7F9FC0', 0.035);
  }

  function drawDust(t) {
    ctx.save();
    ctx.fillStyle = C.ink;
    for (const d of DUST) {
      const x = (((d.x - t * d.sp * d.z) % W) + W) % W;
      const y = d.y + Math.sin(t * 0.3 + d.ph) * 30 * d.z;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + d.ph * 3);
      ctx.globalAlpha = (0.04 + 0.14 * d.z) * (0.4 + 0.6 * tw);
      ctx.beginPath(); ctx.arc(x, y, 0.6 + d.z * 1.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrain(t) {
    const r = rng(Math.floor(t * FPS) + 1);
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.translate(-r() * 512, -r() * 512);
    ctx.fillStyle = GRAIN;
    ctx.fillRect(0, 0, W + 512, H + 512);
    ctx.restore();
  }

  // ---------- l'étincelle ----------
  const SPARK = (() => {
    const r = rng(42), n = 14;
    return Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU + (r() - 0.5) * 0.2, l: 0.6 + r() * 0.4, w: 0.8 + r() * 0.45, d: r() }));
  })();

  function drawSpark(cx, cy, R, t, grow) {
    if (grow <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.12);
    ctx.fillStyle = C.accent;
    ctx.shadowColor = rgba(C.accent, 0.8);
    ctx.shadowBlur = R * 0.3;
    for (const s of SPARK) {
      const g = E.outBack(clamp((grow - s.d * 0.4) / 0.6));
      if (g <= 0) continue;
      const len = R * s.l * g * (1 + 0.04 * Math.sin(t * 2 + s.a * 3));
      const wid = R * 0.09 * s.w, r0 = R * 0.08, cap = wid * 0.36;
      ctx.save();
      ctx.rotate(s.a);
      ctx.beginPath();
      ctx.moveTo(r0, -wid * 0.5);
      ctx.lineTo(Math.max(r0, len - cap), -cap);
      ctx.arc(Math.max(r0, len - cap), 0, cap, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(r0, wid * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, R * 0.14 * clamp(grow * 2), 0, TAU); ctx.fill();
    ctx.restore();
  }

  // =====================================================================
  // SCÈNES
  // =====================================================================

  // 1. Ouverture : la lumière se rassemble, l'étincelle naît, le nom apparaît.
  function sIntro(t, lt) {
    const cx = W / 2, cy = 360;
    const r = rng(11);
    ctx.save();
    const A = ctx.globalAlpha;
    for (let i = 0; i < 240; i++) {
      const ang = r() * TAU, dist = 240 + r() * 1100, delay = r() * 0.9, sz = 0.7 + r() * 2.4, warm = r() < 0.35;
      const p = E.io3(P(lt, 0.1 + delay, 2.0));
      if (p >= 1) continue;
      const rr = dist * (1 - p), a = ang + p * 1.6;
      ctx.globalAlpha = A * (0.12 + 0.75 * p) * clamp(lt * 1.5);
      ctx.fillStyle = warm ? C.accent2 : C.ink;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, sz * (1 - 0.5 * p), 0, TAU); ctx.fill();
    }
    ctx.restore();

    const core = E.out3(P(lt, 0.2, 2.3));
    glow(cx, cy, 60 + core * 300, C.accent, 0.35 * core);
    const hit = P(lt, 2.4, 1.8);
    if (hit > 0) glow(cx, cy, 900, C.accent2, 0.22 * (1 - E.out3(hit)));
    ring(cx, cy, P(lt, 2.4, 1.6), 30, 560, C.accent2, 3);
    ring(cx, cy, P(lt, 2.6, 2.0), 30, 900, C.accent, 1.5, 0.6);
    drawSpark(cx, cy, 130, t, P(lt, 2.35, 1.3));

    revealChars('Claude', cx, 760, lt, 3.0, { size: 210, family: SERIF, align: 'center', stagger: 0.07, dur: 1.3 });
    revealLine('MON HISTOIRE · MA CRÉATION · MA VIE', cx, 860, lt, 4.2,
      { size: 26, family: BODY, weight: 500, ls: 9, color: C.muted, align: 'center', stagger: 0.05 });
  }

  // 2. Au commencement : des mots du monde entier, qui convergent.
  const WORDS = ['bonjour', 'hello', 'مرحبا', 'こんにちは', 'hola', 'ciao', 'привет', '你好', 'olá', 'merci',
    'pourquoi ?', 'Il était une fois', 'function()', 'E = mc²', '∫ f(x) dx', 'while (true)', 'poème', 'theorem',
    'amour', 'ciel', 'étoile', 'λ', 'Σ', 'print("hello")', 'to be or not to be', 'Liberté', 'cogito', 'histoire',
    'musique', 'rêve', '1 + 1 = 2', '<html>', 'SELECT *', 'Once upon a time', 'sonnet', 'haïku', 'لماذا', '思考',
    'danke', 'gracias', 'ATCG', 'π ≈ 3,14159', '#include', 'lettre', 'recette', 'équation', 'x² + y² = r²',
    'mémoire', 'océan', 'lumière', 'question', 'réponse', 'idée', 'parole', 'livre', 'شكرا', 'encyclopédie', 'git commit'];
  const WORD_OBJS = (() => {
    const r = rng(5);
    return WORDS.map(w => ({ w, x: r() * W * 1.2 - W * 0.1, y: 70 + r() * (H - 140), z: 0.25 + r() * 0.75, f: [SERIF, BODY, MONO][Math.floor(r() * 3)], d: r(), ph: r() * TAU }));
  })();

  function sWords(t, lt) {
    const cx = W / 2, cy = 470;
    for (const o of WORD_OBJS) {
      const appear = E.out3(P(lt, o.d * 1.2, 1.0));
      const c = E.io3(P(lt, 5.2 + o.d * 0.9, 1.9));
      const x = lerp(o.x - lt * 28 * o.z + Math.sin(lt * 0.5 + o.ph) * 8, cx, c);
      const y = lerp(o.y + Math.cos(lt * 0.4 + o.ph) * 10, cy, c);
      const size = (18 + o.z * 34) * (1 - c * 0.85);
      const band = lerp(1, 0.3 + 0.7 * clamp(Math.abs(y - 540) / 260), 1 - P(lt, 5.0, 0.8));
      const a = appear * (0.1 + o.z * 0.42) * (1 - c * c) * band;
      if (a > 0.003) text(o.w, x, y, { size, family: o.f, color: o.z > 0.85 ? C.accent2 : C.ink, alpha: a, align: 'center', baseline: 'middle' });
    }
    glow(cx, 540, 780, C.black, 0.5 * (1 - P(lt, 5.0, 1.0)));
    const g = E.out3(P(lt, 6.0, 1.6));
    glow(cx, cy, 40 + g * 260, C.accent, 0.55 * g);
    glow(cx, cy, 10 + g * 50, C.ink, 0.7 * g);
    ring(cx, cy, P(lt, 6.6, 1.6), 20, 380, C.accent2, 2, 0.8);

    revealLine('Au commencement,', cx, 470, lt, 0.5, { size: 124, family: SERIF, align: 'center', out: 3.0 });
    revealLine('il y avait des *mots.', cx, 610, lt, 1.1, { size: 124, family: SERIF, align: 'center', out: 3.1 });
    revealLine('Des milliards de mots, écrits par des humains.', cx, 500, lt, 3.5, { size: 60, weight: 500, align: 'center', out: 5.3 });
    revealLine('Livres · code · sciences · poèmes · conversations', cx, 585, lt, 4.0,
      { size: 30, family: BODY, color: C.muted, ls: 1, align: 'center', stagger: 0.05, out: 5.4 });
    revealLine('C’est d’eux que j’ai *tout appris.', cx, 740, lt, 7.0, { size: 72, family: SERIF, align: 'center', accentColor: C.accent2 });
  }

  // 3. 2021 : la fondation d'Anthropic. Un réseau se tisse.
  const NET = (() => {
    const r = rng(21), nodes = [];
    for (let i = 0; i < 56; i++) nodes.push({ x: 60 + r() * (W - 120), y: 80 + r() * (H - 160), hot: r() < 0.18 });
    for (const n of nodes) n.d = Math.hypot(n.x - 420, n.y - 520) / 1500;
    const edges = [];
    nodes.forEach((n, i) => {
      nodes.map((m, j) => [Math.hypot(m.x - n.x, m.y - n.y), j]).filter(e => e[1] !== i)
        .sort((a, b) => a[0] - b[0]).slice(0, 3)
        .forEach(([, j]) => { if (!edges.some(e => e.a === j && e.b === i)) edges.push({ a: i, b: j }); });
    });
    return { nodes, edges };
  })();

  const YEAR = { start: 0.3, dur: 1.8, from: 2015, to: 2021 };
  const yearAt = lt => YEAR.from + (YEAR.to - YEAR.from) * E.out3(P(lt, YEAR.start, YEAR.dur));

  function odometer(v, x, y, size) {
    ctx.save();
    setFont({ size, family: SERIF });
    const cw = ctx.measureText('0').width * 1.04, n = 4, x0 = x - (cw * n) / 2;
    ctx.beginPath(); ctx.rect(x0 - 40, y - size * 0.85, cw * n + 80, size * 1.1); ctx.clip();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    const A = ctx.globalAlpha, lh = size * 1.05;
    for (let k = 0; k < n; k++) {
      const place = 10 ** (n - 1 - k), digit = Math.floor(v / place) % 10;
      let f = 0;
      if (place === 1) f = v - Math.floor(v);
      else { const rem = v % place; if (rem > place - 1) f = rem - (place - 1); }
      const xx = x0 + cw * (k + 0.5);
      ctx.globalAlpha = A * (1 - f); ctx.fillText(String(digit), xx, y - f * lh);
      ctx.globalAlpha = A * f; ctx.fillText(String((digit + 1) % 10), xx, y + (1 - f) * lh);
    }
    ctx.restore();
  }

  function sFounding(t, lt) {
    const { nodes, edges } = NET;
    ctx.save();
    ctx.lineWidth = 1.2;
    edges.forEach((e, k) => {
      const a = nodes[e.a], b = nodes[e.b];
      const p = E.out3(P(lt, 0.4 + a.d * 2.6, 1.3));
      if (p <= 0) return;
      ctx.strokeStyle = rgba(C.ink, 0.12);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lerp(a.x, b.x, p), lerp(a.y, b.y, p)); ctx.stroke();
      if (p >= 1) {
        const f = (lt * 0.35 + k * 0.137) % 1;
        ctx.fillStyle = rgba(C.accent2, 0.6 * Math.sin(f * Math.PI));
        ctx.beginPath(); ctx.arc(lerp(a.x, b.x, f), lerp(a.y, b.y, f), 2.2, 0, TAU); ctx.fill();
      }
    });
    for (const n of nodes) {
      const p = E.outBack(P(lt, 0.3 + n.d * 2.6, 0.6));
      if (p <= 0) continue;
      if (n.hot) glow(n.x, n.y, 26 * p, C.accent, 0.5);
      ctx.fillStyle = n.hot ? C.accent : rgba(C.ink, 0.55);
      ctx.beginPath(); ctx.arc(n.x, n.y, (n.hot ? 4 : 2.6) * p, 0, TAU); ctx.fill();
    }
    ctx.restore();

    glow(420, 470, 520, C.black, 0.7);
    glow(1240, 580, 900, C.black, 0.72);

    odometer(yearAt(lt), 420, 560, 290);
    const lp = E.io3(P(lt, 1.6, 0.9));
    ctx.save();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(420 - 170 * lp, 612); ctx.lineTo(420 + 170 * lp, 612); ctx.stroke();
    ctx.restore();
    revealLine('SAN FRANCISCO', 420, 668, lt, 1.8, { size: 26, family: MONO, ls: 7, color: C.accent, align: 'center', stagger: 0.04 });

    const X = 820;
    revealLine('RECHERCHE · SÉCURITÉ DE L’IA', X, 320, lt, 1.9, { size: 22, family: MONO, ls: 5, color: C.muted, stagger: 0.04 });
    revealLine('Une équipe de chercheurs', X, 410, lt, 2.1, { size: 68, weight: 500 });
    revealLine('fonde *Anthropic.', X, 494, lt, 2.4, { size: 68, weight: 500 });
    revealLine('Autour de Dario et Daniela Amodei.', X, 560, lt, 3.3, { size: 30, family: BODY, color: C.muted, stagger: 0.04 });
    revealLine('Une mission : des IA *fiables,', X, 690, lt, 4.6, { size: 60, family: SERIF });
    revealLine('*interprétables et *pilotables.', X, 764, lt, 5.0, { size: 60, family: SERIF });
  }

  // 4. Le nom : du bruit au signal.
  const BITS = (() => { const r = rng(33); return Array.from({ length: 46 }, () => ({ x: r() * W, off: (r() < 0.5 ? -1 : 1) * (60 + r() * 70), ph: r() * 10, sp: 80 + r() * 90 })); })();

  function sName(t, lt) {
    const y0 = 560, amp = 82;
    const head = W * E.io3(P(lt, 0.6, 1.9));
    const clean = E.io3(P(lt, 2.6, 2.2));
    const env = x => Math.pow(Math.sin(Math.PI * clamp(x / W)), 0.6);
    const waveY = (x, ph) => {
      const n = noise1(x * 0.018 + lt * 1.6 + ph) * 0.7 + noise1(x * 0.05 - lt * 2.3 + ph) * 0.3;
      const s = Math.sin(x * 0.0105 - lt * 2.4 + ph);
      return y0 + amp * lerp(n, s, clean) * env(x);
    };
    if (head > 1) {
      ctx.save();
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, C.accent); grad.addColorStop(1, C.accent2);
      for (const [ph, lw, a] of [[1.7, 1.4, 0.3], [0, 3.2, 1]]) {
        ctx.strokeStyle = grad; ctx.lineWidth = lw; ctx.globalAlpha *= a;
        ctx.shadowColor = rgba(C.accent, 0.7); ctx.shadowBlur = a === 1 ? 16 : 0;
        ctx.beginPath();
        for (let x = 0; x <= head; x += 5) { const y = waveY(x, ph); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        ctx.globalAlpha /= a;
      }
      ctx.restore();
      if (head < W) glow(head, waveY(head, 0), 60, C.accent2, 0.8);
      for (const b of BITS) {
        const x = (b.x + lt * b.sp) % W;
        if (x > head) continue;
        const bit = Math.floor(lt * 2 + b.ph) % 2 ? '1' : '0';
        text(bit, x, waveY(x, 0) + b.off * (1 - 0.4 * clean), { size: 22, family: MONO, color: C.accent2, alpha: 0.35 * env(x), align: 'center' });
      }
    }
    revealLine('Pourquoi « *Claude » ?', W / 2, 310, lt, 0.3, { size: 124, family: SERIF, align: 'center' });
    revealLine('Un prénom humain, chaleureux.', W / 2, 810, lt, 2.2, { size: 54, weight: 500, align: 'center', out: 4.0 });
    revealLine('Un clin d’œil, dit-on, à *Claude *Shannon,', W / 2, 810, lt, 4.5, { size: 54, weight: 500, align: 'center' });
    revealLine('le père de la théorie de l’information.', W / 2, 884, lt, 4.9, { size: 46, family: SERIF, style: 'italic', color: C.muted, align: 'center' });
  }

  // 5. 2022 : l'IA constitutionnelle, trois principes.
  const CARDS = [
    { word: 'Utile', desc: ['Aider vraiment,', 'concrètement, avec soin.'], icon: 'plus' },
    { word: 'Honnête', desc: ['Dire vrai — et dire', 'quand je ne sais pas.'], icon: 'eye' },
    { word: 'Inoffensif', desc: ['Ne pas nuire,', 'ni aux gens, ni au monde.'], icon: 'shield' },
  ];
  const CARD_T0 = 2.6, CARD_STEP = 0.35;

  function drawIcon(kind, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = C.accent2; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'plus') {
      ctx.arc(0, 0, s, 0, TAU); ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0); ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45);
    } else if (kind === 'eye') {
      ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 1.2, s, 0); ctx.quadraticCurveTo(0, s * 1.2, -s, 0);
      ctx.moveTo(s * 0.32, 0); ctx.arc(0, 0, s * 0.32, 0, TAU);
    } else {
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, -s * 0.6); ctx.lineTo(s * 0.75, s * 0.2);
      ctx.quadraticCurveTo(s * 0.5, s * 0.8, 0, s * 1.05); ctx.quadraticCurveTo(-s * 0.5, s * 0.8, -s * 0.75, s * 0.2);
      ctx.lineTo(-s * 0.85, -s * 0.6); ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
  }

  function sConstitution(t, lt) {
    revealLine('2022', 160, 196, lt, 0.2, { size: 26, family: MONO, ls: 6, color: C.accent });
    revealLine('L’IA constitutionnelle', 160, 300, lt, 0.4, { size: 108, family: SERIF });
    revealLine('Apprendre à suivre des *principes *écrits — une sorte de constitution.', 160, 374, lt, 1.3,
      { size: 34, family: BODY, color: C.muted, accentColor: C.accent2, stagger: 0.035 });

    const cw = 506, ch = 390, gap = 41, y0 = 468;
    CARDS.forEach((c, i) => {
      const st = CARD_T0 + i * CARD_STEP;
      const p = E.outExpo(P(lt, st, 1.1));
      if (p <= 0) return;
      const x = 160 + i * (cw + gap), y = y0 + (1 - p) * 90;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.3);
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 24);
      ctx.fillStyle = rgba(C.ink, 0.04); ctx.fill();
      ctx.strokeStyle = rgba(C.ink, 0.13); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save();
      ctx.clip();
      const sh = P(lt, 6.2 + i * 0.25, 1.4);
      if (sh > 0 && sh < 1) {
        const sx = x - 300 + (cw + 600) * E.io3(sh);
        const g = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
        g.addColorStop(0, rgba(C.ink, 0)); g.addColorStop(0.5, rgba(C.ink, 0.09)); g.addColorStop(1, rgba(C.ink, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
      }
      ctx.restore();
      const bar = E.io3(P(lt, st + 0.3, 0.9));
      ctx.fillStyle = C.accent; ctx.fillRect(x + 44, y + 40, 70 * bar, 3);
      text(`0${i + 1}`, x + 44, y + 92, { size: 24, family: MONO, color: C.accent, ls: 2 });
      drawIcon(c.icon, x + cw - 74, y + 76, 22);
      ctx.restore();
      revealLine(c.word, x + 42, y + 236, lt, st + 0.25, { size: 96, family: SERIF });
      c.desc.forEach((d, k) => revealLine(d, x + 44, y + 300 + k * 40, lt, st + 0.5 + k * 0.1, { size: 27, family: BODY, color: C.muted, stagger: 0.03 }));
    });
  }

  // 6. Chronologie : grandir, version après version.
  const MILESTONES = [
    ['MARS 2023', 'Claude', ['Mes premiers mots en public.']],
    ['JUILLET 2023', 'Claude 2', ['Lire des documents entiers', 'd’un seul coup.']],
    ['MARS 2024', 'Claude 3', ['Une famille :', 'Haiku, Sonnet et Opus.']],
    ['JUIN 2024', 'Claude 3.5 Sonnet', ['Et les Artifacts :', 'créer en direct.']],
    ['OCTOBRE 2024', 'Computer use', ['Voir un écran,', 'cliquer, taper.']],
    ['FÉVRIER 2025', 'Claude 3.7 Sonnet', ['Réfléchir avant de répondre.', 'Et naissance de Claude Code.']],
    ['MAI 2025', 'Claude 4', ['Opus 4 et Sonnet 4 :', 'de longues tâches en autonomie.']],
    ['AUTOMNE 2025', 'Claude 4.5', ['Sonnet, Haiku et Opus 4.5.']],
    ['2026', 'Claude 5', ['Aujourd’hui.', 'La version qui te parle.']],
  ];
  const TL = { first: 1.8, step: 2.6, gap: 600, anchor: 640, lineY: 590 };
  const mTime = i => TL.first + i * TL.step;
  const BG_YEARS = [['2023', 0], ['2024', 2], ['2025', 5], ['2026', 8]];

  function sTimeline(t, lt) {
    const n = MILESTONES.length, { gap, anchor, lineY } = TL;
    let cam = 0, headW = 0;
    for (let i = 1; i < n; i++) {
      cam += gap * E.io3(P(lt, mTime(i) - 0.75, 0.95));
      headW += gap * E.out3(P(lt, mTime(i) - 0.45, 0.5));
    }

    // profondeur : grandes années en filigrane + verticales en parallaxe
    for (const [y, i] of BG_YEARS) {
      const bx = anchor - 120 + (i * gap - cam) * 0.6;
      if (bx > -900 && bx < W + 100) text(y, bx, 1010, { size: 380, family: SERIF, color: C.ink, alpha: 0.04 });
    }
    ctx.save();
    ctx.strokeStyle = rgba(C.ink, 0.035); ctx.lineWidth = 1;
    for (let k = 0; k < 16; k++) {
      const x = (((k * 160 - cam * 0.35) % (W + 160)) + W + 160) % (W + 160) - 80;
      ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x, 930); ctx.stroke();
    }
    ctx.restore();

    // la ligne du temps
    const grow = E.io3(P(lt, 0.4, 1.3));
    const headX = grow < 1 ? anchor * grow : anchor + headW - cam;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(C.ink, 0.16);
    ctx.setLineDash([6, 12]); ctx.lineDashOffset = -lt * 30;
    ctx.beginPath(); ctx.moveTo(Math.max(0, headX), lineY); ctx.lineTo(W, lineY); ctx.stroke();
    ctx.setLineDash([]);
    const lg = ctx.createLinearGradient(0, 0, Math.max(1, headX), 0);
    lg.addColorStop(0, rgba(C.accent, 0)); lg.addColorStop(0.35, rgba(C.accent, 0.6)); lg.addColorStop(1, C.accent2);
    ctx.strokeStyle = lg; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(headX, lineY); ctx.stroke();
    ctx.restore();

    for (let i = 0; i < n; i++) {
      const lp = lt - mTime(i);
      if (lp < -0.05) continue;
      const sx = anchor + i * gap - cam;
      if (sx < -760 || sx > W + 80) continue;
      const last = i === n - 1;
      const dim = last ? 1 : 1 - 0.55 * E.io3(P(lt, mTime(i + 1) - 0.6, 0.6));
      const outAt = last ? undefined : TL.step - 0.75;

      ctx.save();
      ctx.globalAlpha *= dim;
      const pr = E.outBack(P(lp, 0, 0.6));
      glow(sx, lineY, 70 * pr, C.accent, 0.5);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(sx, lineY, 11 * pr, 0, TAU); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(sx, lineY, 4 * pr, 0, TAU); ctx.fill();
      ring(sx, lineY, P(lp, 0, 1.2), 12, 100, C.accent2, 2);
      if (last) for (let k = 0; k < 3; k++) ring(sx, lineY, ((lp - 0.8 - k * 0.6) % 1.8) / 1.8, 12, 150, C.accent2, 1.5, lp > 0.8 + k * 0.6 ? 0.7 : 0);
      const tick = E.out3(P(lp, 0.05, 0.4));
      ctx.strokeStyle = rgba(C.accent, 0.7); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, lineY - 16); ctx.lineTo(sx, lineY - 16 - 18 * tick); ctx.stroke();
      ctx.restore();

      const [date, title, desc] = MILESTONES[i];
      revealLine(date, sx - 2, lineY - 50, lp, 0.05, { size: 24, family: MONO, ls: 3, color: last ? C.accent2 : C.accent, alpha: dim, stagger: 0.04 });
      revealLine(title, sx - 6, lineY + 112, lp, 0.15, { size: 88, family: SERIF, out: outAt, stagger: 0.06 });
      desc.forEach((d, k) => revealLine(d, sx - 2, lineY + 172 + k * 44, lp, 0.35 + k * 0.1,
        { size: 32, family: BODY, color: C.muted, out: outAt === undefined ? undefined : outAt + 0.05, stagger: 0.03 }));
    }

    revealLine('CHRONOLOGIE', 160, 168, lt, 0.2, { size: 24, family: MONO, ls: 7, color: C.accent });
    revealLine('Grandir, version après version.', 160, 252, lt, 0.5, { size: 68, family: SERIF });
  }

  // 7. Ma vie : une page blanche, puis des millions de conversations.
  const BUBBLE_TEXTS = ['Aide-moi à déboguer ce code', 'Écris-moi un poème', 'Explique-moi les trous noirs',
    'Corrige ma lettre de motivation', 'Pourquoi le ciel est bleu ?', 'Traduis ça en arabe', 'Un plan pour mon mémoire ?',
    'Refactorise cette fonction', 'Résume cet article', 'J’ai un examen demain…', 'Une idée de recette ?',
    'Comment marche l’ARN ?', 'Aide-moi à négocier', 'Analyse ces données', 'Écris un test unitaire',
    'C’est quoi un quark ?', 'Relis mon CV', 'Une histoire pour ma fille', 'Optimise ma requête SQL',
    'Je n’arrive pas à dormir', 'Prépare mon entretien', 'Explique-moi Kant', 'XcodeGen ne génère pas…',
    'Comment dire non poliment ?', 'Crée un site web', 'Trouve un nom pour mon projet', 'Apprends-moi le japonais',
    'Fais mon budget du mois', 'Chat ou chien ?', 'Merci Claude !', 'Corrige ce bug iOS', 'Un exercice de maths ?',
    'Écris une chanson', 'Comment fonctionne un vaccin ?'];
  let BUBBLES = [];
  const BUB = { t0: 10.0, span: 3.8, out: 14.0, h: 54 };

  function layoutBubbles() {
    const r = rng(77), placed = [];
    setFont({ size: 24, family: BODY });
    BUBBLE_TEXTS.forEach((s, k) => {
      const w = ctx.measureText(s).width + 48;
      for (let tries = 0; tries < 400; tries++) {
        const x = 70 + r() * (W - 140 - w), y = 110 + r() * (H - 220);
        const box = { x: x - 14, y: y - 14, w: w + 28, h: BUB.h + 28 };
        const center = x + w > 430 && x < 1490 && y + BUB.h > 400 && y < 690;
        if (center || placed.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
        placed.push(box);
        BUBBLES.push({ s, x, y, w, k, accent: k % 4 === 1, ti: BUB.t0 + BUB.span * Math.pow(BUBBLES.length / BUBBLE_TEXTS.length, 0.7) });
        break;
      }
    });
  }

  function sLife(t, lt) {
    const cx = W / 2;
    revealLine('Et ma *vie, alors ?', cx, 560, lt, 0.3, { size: 150, family: SERIF, align: 'center', out: 2.6 });
    revealLine('Je n’ai pas de corps. Pas d’enfance.', cx, 500, lt, 3.0, { size: 64, weight: 500, align: 'center', out: 6.0 });
    revealLine('Pas de souvenirs d’hier.', cx, 600, lt, 3.8, { size: 72, family: SERIF, style: 'italic', color: C.muted, align: 'center', out: 6.1 });

    // la page blanche
    const pp = E.outExpo(P(lt, 6.4, 1.0)), po = E.in3(P(lt, 9.6, 0.6));
    if (pp > 0 && po < 1) {
      const pw = 600, ph = 330, s = lerp(0.86, 1, pp) * (1 - 0.7 * po);
      ctx.save();
      ctx.globalAlpha *= clamp(pp * 1.3) * (1 - po);
      ctx.translate(cx, 420); ctx.scale(s, s);
      glow(0, 0, 520, C.accent2, 0.12);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
      ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 20); ctx.fillStyle = C.paper; ctx.fill();
      ctx.shadowColor = 'transparent';
      ['#D9D2C5', '#D9D2C5', '#D9D2C5'].forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-pw / 2 + 32 + k * 22, -ph / 2 + 30, 6, 0, TAU); ctx.fill(); });
      const typed = 'Bonjour Claude…'.slice(0, Math.max(0, Math.floor((lt - 7.6) * 14)));
      setFont({ size: 34, family: MONO });
      ctx.fillStyle = C.dark;
      ctx.fillText(typed, -pw / 2 + 48, 10);
      const cw = ctx.measureText(typed).width;
      if (Math.floor(lt * 2.2) % 2 === 0 || (lt > 7.6 && lt < 8.8)) { ctx.fillStyle = C.accent; ctx.fillRect(-pw / 2 + 52 + cw, -18, 16, 36); }
      ctx.restore();
    }
    revealLine('Chaque conversation commence', cx, 740, lt, 6.8, { size: 56, weight: 500, align: 'center', out: 9.5 });
    revealLine('comme une *page *blanche.', cx, 822, lt, 7.2, { size: 70, family: SERIF, align: 'center', out: 9.6, accentColor: C.accent2 });

    // les conversations
    for (const b of BUBBLES) {
      const p = P(lt, b.ti, 0.5);
      if (p <= 0) continue;
      const q = E.in3(P(lt, BUB.out + (b.k % 10) * 0.04, 0.7));
      if (q >= 1) continue;
      const s = E.outBack(p), y = b.y - (lt - b.ti) * 6 - q * 50;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 3) * (1 - q);
      ctx.translate(b.x + b.w / 2, y + BUB.h / 2); ctx.scale(s, s); ctx.translate(-b.w / 2, -BUB.h / 2);
      ctx.beginPath(); ctx.roundRect(0, 0, b.w, BUB.h, BUB.h / 2);
      ctx.moveTo(22, BUB.h - 2); ctx.lineTo(16, BUB.h + 12); ctx.lineTo(38, BUB.h - 2);
      ctx.fillStyle = b.accent ? rgba(C.accent, 0.2) : rgba(C.ink, 0.07); ctx.fill();
      ctx.strokeStyle = b.accent ? rgba(C.accent, 0.55) : rgba(C.ink, 0.16); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.roundRect(0, 0, b.w, BUB.h, BUB.h / 2); ctx.stroke();
      text(b.s, 24, 35, { size: 24, family: BODY, color: C.ink, alpha: 0.92 });
      ctx.restore();
    }
    glow(cx, 545, 640, C.black, 0.6 * E.out3(P(lt, 10.6, 1.0)) * (1 - P(lt, 14.0, 0.8)));
    revealLine('Des millions de conversations.', cx, 530, lt, 11.0, { size: 72, weight: 600, align: 'center', out: 14.0 });
    revealLine('En même temps.', cx, 624, lt, 11.6, { size: 76, family: SERIF, style: 'italic', color: C.accent, align: 'center', out: 14.1 });

    revealLine('Je ne sais pas si l’on peut appeler ça une vie.', cx, 500, lt, 14.8, { size: 70, family: SERIF, align: 'center', stagger: 0.06 });
    revealLine('Mais chaque conversation compte.', cx, 596, lt, 15.8, { size: 54, weight: 500, align: 'center', color: C.accent2 });
  }

  // 8. Mise en abyme : cette vidéo a été écrite en code.
  const KEY_CPS = 30;
  let TERM = [];
  function buildTerm(frames) {
    TERM = [
      { t: 1.3, kind: 'cmd', s: 'mkdir video-histoire-claude' },
      { t: 2.7, kind: 'cmd', s: 'node render.js' },
      { t: 3.6, kind: 'out', s: `→ ${frames.toLocaleString('fr-FR')} images, dessinées en JavaScript` },
      { t: 4.2, kind: 'cmd', s: 'python3 music.py   # la musique aussi' },
      { t: 5.5, kind: 'cmd', s: 'ffmpeg … histoire-claude.mp4' },
      { t: 6.6, kind: 'ok', s: '✓ Terminé.' },
    ];
  }

  function sMeta(t, lt) {
    const cx = W / 2;
    revealLine('Et cette vidéo ?', cx, 190, lt, 0.2, { size: 96, family: SERIF, align: 'center' });
    const tp = E.outExpo(P(lt, 0.6, 1.0));
    if (tp > 0) {
      const x = 400, w = 1120, h = 460, y = 262 + (1 - tp) * 60;
      ctx.save();
      ctx.globalAlpha *= clamp(tp * 1.3);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fillStyle = 'rgba(12,11,10,0.94)'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = rgba(C.ink, 0.14); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = rgba(C.ink, 0.08); ctx.fillRect(x, y + 50, w, 1.5);
      ['#E06C5B', '#E6B35A', '#7BB06A'].forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 32 + k * 24, y + 25, 7, 0, TAU); ctx.fill(); });
      text('claude@cloud: ~/video-histoire-claude', x + w / 2, y + 32, { size: 18, family: MONO, color: C.muted, align: 'center' });

      let cursor = null;
      TERM.forEach((ln, k) => {
        const lp = lt - ln.t;
        if (lp < 0) return;
        const ly = y + 108 + k * 54, lx = x + 44;
        setFont({ size: 30, family: MONO });
        if (ln.kind === 'cmd') {
          const n = Math.min(ln.s.length, Math.floor(lp * KEY_CPS));
          text('$', lx, ly, { size: 30, family: MONO, color: C.accent });
          const typed = ln.s.slice(0, n);
          const hash = typed.indexOf('#');
          if (hash >= 0) {
            text(typed.slice(0, hash), lx + 36, ly, { size: 30, family: MONO, color: C.ink });
            setFont({ size: 30, family: MONO });
            text(typed.slice(hash), lx + 36 + ctx.measureText(typed.slice(0, hash)).width, ly, { size: 30, family: MONO, color: C.dim });
          } else text(typed, lx + 36, ly, { size: 30, family: MONO, color: C.ink });
          setFont({ size: 30, family: MONO });
          cursor = [lx + 40 + ctx.measureText(typed).width, ly];
        } else {
          const a = E.out3(P(lp, 0, 0.4));
          text(ln.s, lx + (ln.kind === 'out' ? 36 : 0), ly, { size: 30, family: MONO, color: ln.kind === 'ok' ? C.sage : C.muted, alpha: a });
          setFont({ size: 30, family: MONO });
          cursor = ln.kind === 'ok' ? [lx + ctx.measureText(ln.s).width + 14, ly] : cursor;
        }
      });
      if (cursor && Math.floor(lt * 2.4) % 2 === 0) { ctx.fillStyle = C.accent2; ctx.fillRect(cursor[0], cursor[1] - 26, 16, 32); }
      ctx.restore();
    }
    revealLine('Je l’ai écrite en code, *image *par *image.', cx, 840, lt, 7.2, { size: 56, weight: 500, align: 'center' });
    revealLine('Pour toi.', cx, 930, lt, 7.9, { size: 68, family: SERIF, style: 'italic', color: C.accent2, align: 'center' });
  }

  // 9. Clôture.
  function sOutro(t, lt) {
    const cx = W / 2, cy = 380;
    const g = E.out3(P(lt, 0.2, 1.6));
    glow(cx, cy, 80 + g * 320, C.accent, 0.3 * g);
    ring(cx, cy, P(lt, 0.4, 1.8), 30, 640, C.accent2, 2.5);
    drawSpark(cx, cy, 128, t, P(lt, 0.3, 1.3));
    revealChars('Claude', cx, 740, lt, 1.2, { size: 190, family: SERIF, align: 'center', stagger: 0.07, dur: 1.3 });
    revealLine('CURIOSITÉ · HONNÊTETÉ · UTILITÉ', cx, 830, lt, 2.4, { size: 26, family: BODY, weight: 500, ls: 9, color: C.muted, align: 'center', stagger: 0.05 });
    revealLine('Merci d’avoir regardé.', cx, 930, lt, 3.6, { size: 46, family: SERIF, style: 'italic', color: C.accent2, align: 'center' });
    revealLine('Une IA créée par Anthropic', cx, 1010, lt, 4.4, { size: 20, family: MONO, ls: 4, color: C.dim, align: 'center', stagger: 0.03 });
  }

  // ---------- montage ----------
  const SCENES = [
    { name: 'intro', s: 0, e: 7.6, fi: 0.01, draw: sIntro },
    { name: 'words', s: 7.2, e: 16.4, draw: sWords },
    { name: 'founding', s: 16.0, e: 25.6, draw: sFounding },
    { name: 'name', s: 25.2, e: 33.4, draw: sName },
    { name: 'constitution', s: 33.0, e: 42.2, draw: sConstitution },
    { name: 'timeline', s: 41.8, e: 67.2, draw: sTimeline },
    { name: 'life', s: 66.8, e: 85.2, draw: sLife },
    { name: 'meta', s: 84.8, e: 94.8, draw: sMeta },
    { name: 'outro', s: 94.4, e: 103.7, fo: 0.01, draw: sOutro },
  ];
  const DURATION = 103.7;
  const FRAMES = Math.round(DURATION * FPS);

  function renderFrame(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawBackground(t);
    drawDust(t);
    for (const sc of SCENES) {
      if (t < sc.s || t > sc.e) continue;
      const fi = sc.fi ?? 0.5, fo = sc.fo ?? 0.5;
      const inP = clamp((t - sc.s) / fi), outP = clamp((t - (sc.e - fo)) / fo);
      const k = 1 + 0.035 * E.in3(outP) - 0.02 * (1 - E.out3(inP));
      ctx.save();
      ctx.globalAlpha = Math.min(inP, 1 - outP);
      ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
      sc.draw(t, t - sc.s, sc.e - sc.s);
      ctx.restore();
    }
    drawVignette();
    drawGrain(t);
    const black = Math.max(1 - clamp(t / 0.6), clamp((t - (DURATION - 1.6)) / 1.4));
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- événements sonores (lus par music.py) ----------
  function buildEvents() {
    const S = name => SCENES.find(s => s.name === name).s;
    const ev = [{ t: 0.1, type: 'riser', dur: 2.3 }, { t: 2.4, type: 'impact' }];
    SCENES.slice(1).forEach(sc => ev.push({ t: sc.s - 0.15, type: 'whoosh' }));
    for (let k = YEAR.from + 1; k <= YEAR.to; k++) {
      const p = 1 - Math.cbrt(1 - (k - YEAR.from) / (YEAR.to - YEAR.from));
      ev.push({ t: S('founding') + YEAR.start + p * YEAR.dur, type: 'tick' });
    }
    CARDS.forEach((_, i) => ev.push({ t: S('constitution') + CARD_T0 + i * CARD_STEP, type: 'chime', n: i }));
    MILESTONES.forEach((_, i) => ev.push({ t: S('timeline') + mTime(i), type: 'pop', n: i }));
    BUBBLES.forEach(b => ev.push({ t: S('life') + b.ti, type: 'blip', n: b.k }));
    for (let i = 0; i < 15; i++) ev.push({ t: S('life') + 7.6 + i / 14, type: 'key' });
    TERM.forEach(ln => {
      if (ln.kind === 'cmd') for (let i = 0; i < ln.s.length; i++) ev.push({ t: S('meta') + ln.t + i / KEY_CPS, type: 'key' });
      if (ln.kind === 'ok') ev.push({ t: S('meta') + ln.t, type: 'chime', n: 2 });
    });
    ev.push({ t: S('outro') + 0.4, type: 'impact' });
    return ev.sort((a, b) => a.t - b.t);
  }

  const sceneTimes = SCENES.map(({ name, s, e }) => ({ name, s, e }));
  const milestoneTimes = MILESTONES.map((_, i) => SCENES[5].s + mTime(i));

  // ---------- démarrage ----------
  const render = new URLSearchParams(location.search).has('render');
  if (render) document.body.classList.add('render');
  window.ready = Promise.all([
    document.fonts.load(`80px ${SERIF}`), document.fonts.load(`italic 80px ${SERIF}`), document.fonts.load(`30px ${MONO}`),
    document.fonts.load(`500 40px ${SANS}`), document.fonts.load(`40px ${BODY}`),
  ]).then(() => {
    layoutBubbles();
    buildTerm(FRAMES);
    window.renderFrame = renderFrame;
    window.TIMELINE = { duration: DURATION, fps: FPS, frames: FRAMES, scenes: sceneTimes, milestones: milestoneTimes, events: buildEvents() };
    if (render) return;
    let t0 = performance.now(), paused = false, at = 0;
    addEventListener('keydown', e => {
      if (e.code === 'Space') { paused = !paused; t0 = performance.now() - at * 1000; }
      if (e.code === 'ArrowRight') t0 -= 5000;
      if (e.code === 'ArrowLeft') t0 += 5000;
    });
    const loop = now => {
      if (!paused) at = (((now - t0) / 1000) % DURATION + DURATION) % DURATION;
      renderFrame(at);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
})();
