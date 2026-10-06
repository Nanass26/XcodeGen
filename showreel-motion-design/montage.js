// Montage : enchaîne les scènes (durées en mesures), dessine l'habillage
// (timecode, étiquette de chapitre, repères de cadre), exporte la timeline
// pour la musique et pilote l'aperçu temps réel.
'use strict';
(() => {
  const { W, H, FPS, BAR, C, F, E, P, clamp, lerp } = R;
  const ctx = R.main;
  let SEQ = [], DURATION = 0;

  function build() {
    let t = 0;
    SEQ = R.scenes.map((def, i) => {
      const it = { def, i, s: t, d: def.bars * BAR };
      it.e = t + it.d;
      t = it.e;
      return it;
    });
    DURATION = t;
  }

  const sceneAt = t => SEQ.find(sc => t >= sc.s && t < sc.e) || SEQ[SEQ.length - 1];

  function timecode(t) {
    const f = Math.floor(t * FPS + 1e-6), s = Math.floor(f / FPS);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f % FPS].map(n => String(n).padStart(2, '0')).join(':');
  }

  function resetState(c) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    c.setLineDash([]);
    c.lineCap = 'butt'; c.lineJoin = 'miter'; c.lineWidth = 1;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.letterSpacing = '0px';
  }

  // Habillage façon showreel : repères de cadre, marque, timecode, chapitre.
  function hud(t, sc) {
    if (sc.def.hud === false) return;
    const lt = t - sc.s, ink = sc.def.theme === 'light' ? C.ink : C.white;
    const a = E.out3(P(lt, 0.05, 0.35));
    ctx.save();
    ctx.globalAlpha = 0.85 * a;
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    const m = 40, k = 26;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * k); ctx.lineTo(x, y); ctx.lineTo(x + sx * k, y); ctx.stroke();
    }
    R.text('CLAUDE — MOTION REEL ’26', 84, 92, { size: 18, family: F.mono, weight: 600, ls: 3, color: ink, alpha: 0.75 });
    R.text(`TC ${timecode(t)}`, W - 84, 92, { size: 18, family: F.mono, weight: 500, ls: 2, color: ink, alpha: 0.75, align: 'right' });

    // étiquette de chapitre : numéro + intitulé + barre de progression de la scène
    const num = sc.def.id;
    const slide = E.outExpo(P(lt, 0.15, 0.7));
    const x0 = lerp(-420, 84, slide), y0 = H - 92;
    ctx.fillStyle = sc.def.accent || C.coral;
    ctx.fillRect(x0, y0 - 26, 52, 34);
    R.text(num, x0 + 26, y0 - 2, { size: 20, family: F.mono, weight: 700, color: C.ink, align: 'center' });
    R.text(sc.def.tag || sc.def.title, x0 + 68, y0 - 2, { size: 20, family: F.mono, weight: 600, ls: 3, color: ink });
    ctx.globalAlpha = 0.85 * a * 0.25; ctx.fillStyle = ink;
    ctx.fillRect(x0, y0 + 18, 360, 2);
    ctx.globalAlpha = 0.85 * a; ctx.fillStyle = sc.def.accent || C.coral;
    ctx.fillRect(x0, y0 + 18, 360 * clamp(lt / sc.d), 2);
    R.text('100 % CODE', W - 84, y0 - 2, { size: 18, family: F.mono, weight: 500, ls: 3, color: ink, alpha: 0.6, align: 'right' });
    ctx.restore();
  }

  function renderFrame(t) {
    const sc = sceneAt(t), lt = t - sc.s;
    resetState(ctx);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    sc.def.draw(lt, sc.d, t);
    ctx.restore();
    resetState(ctx);
    hud(t, sc);
    // flash de coupe, sur le temps
    if (sc.i > 0 && sc.def.flash !== false) {
      const f = 1 - P(lt, 0, 0.14);
      if (f > 0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * f * f})`; ctx.fillRect(0, 0, W, H); }
    }
    // fondu final
    const out = P(t, DURATION - 0.6, 0.6);
    if (out > 0) { ctx.fillStyle = `rgba(0,0,0,${out})`; ctx.fillRect(0, 0, W, H); }
  }

  function buildEvents() {
    const ev = [];
    for (const sc of SEQ) {
      ev.push({ t: sc.s, type: 'cut', scene: sc.def.id });
      const list = typeof sc.def.events === 'function' ? sc.def.events(sc.d) : sc.def.events || [];
      for (const e of list) ev.push({ ...e, t: sc.s + e.t, scene: sc.def.id });
    }
    return ev.filter(e => e.t >= 0 && e.t < DURATION).sort((a, b) => a.t - b.t);
  }

  // Planche contact (pour vérifier une scène d'un coup d'œil) : renvoie un PNG en data URL.
  function contactSheet(times, cols = 3) {
    const tw = 640, th = 360, rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = tw * cols; sheet.height = th * rows;
    const sc2 = sheet.getContext('2d');
    times.forEach((t, k) => {
      renderFrame(t);
      const x = (k % cols) * tw, y = Math.floor(k / cols) * th;
      sc2.drawImage(R.canvas, x, y, tw, th);
      const sc = sceneAt(t);
      sc2.fillStyle = 'rgba(0,0,0,0.7)'; sc2.fillRect(x, y, 250, 26);
      sc2.fillStyle = '#C6FF3D'; sc2.font = '600 16px "JetBrains Mono"';
      sc2.fillText(`t=${t.toFixed(2)}  ${sc.def.id}@${(t - sc.s).toFixed(2)}`, x + 8, y + 18);
      sc2.strokeStyle = 'rgba(255,255,255,0.4)'; sc2.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    });
    return sheet.toDataURL('image/png');
  }

  // ---------- démarrage ----------
  const render = new URLSearchParams(location.search).has('render');
  if (render) document.body.classList.add('render');
  window.ready = Promise.all([
    document.fonts.load(`80px ${F.serif}`), document.fonts.load(`italic 80px ${F.serif}`),
    document.fonts.load(`30px ${F.mono}`), document.fonts.load(`700 30px ${F.mono}`),
    document.fonts.load(`80px ${F.condensed}`),
    document.fonts.load(`900 80px ${F.display}`), document.fonts.load(`500 40px ${F.body}`),
  ]).then(() => {
    for (const def of R.scenes) if (def.setup) def.setup();
    build();
    window.renderFrame = renderFrame;
    window.contactSheet = contactSheet;
    window.TIMELINE = {
      duration: DURATION, fps: FPS, bpm: R.BPM, frames: Math.round(DURATION * FPS),
      scenes: SEQ.map(sc => ({ id: sc.def.id, title: sc.def.title, tag: sc.def.tag, s: sc.s, e: sc.e, bars: sc.def.bars })),
      events: buildEvents(),
    };
    if (render) return;
    // aperçu : espace = pause, flèches = ±2 s, 1-9/0 = aller au chapitre
    let t0 = performance.now(), paused = false, at = 0;
    addEventListener('keydown', e => {
      if (e.code === 'Space') { paused = !paused; t0 = performance.now() - at * 1000; }
      if (e.code === 'ArrowRight') t0 -= 2000;
      if (e.code === 'ArrowLeft') t0 += 2000;
      const n = '1234567890'.indexOf(e.key);
      if (n >= 0 && SEQ[n]) { at = SEQ[n].s; t0 = performance.now() - at * 1000; }
    });
    const loop = now => {
      if (!paused) at = ((((now - t0) / 1000) % DURATION) + DURATION) % DURATION;
      renderFrame(at);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
})();
