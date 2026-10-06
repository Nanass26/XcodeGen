// Scène 01 — Ouverture (4 mesures, 8 s).
// Un curseur clignote, s'étire en ligne, la ligne s'ouvre comme un letterbox et
// révèle le nom ; échos colorés sur le temps ; « MOTION DESIGN » ; chargement des
// compétences ; zoom final vers le blanc, coupe sur le temps.
'use strict';
(() => {
  const { W, H, C, F, E, P, clamp, lerp } = R;
  const SKILLS = ['TYPOGRAPHIE', 'MORPHING', 'PARTICULES', 'ESPACE 3D', 'DATA', 'UI', 'FLUIDES', 'GLITCH'];
  const SKILL_T0 = 6.0, SKILL_STEP = 0.2;
  const ECHO = [C.coral, C.blue, C.lime];

  R.scene({
    id: '01', title: 'Ouverture', tag: 'OUVERTURE', bars: 4, theme: 'dark', accent: C.coral, hud: false, flash: false,
    events: [
      { t: 0.0, type: 'click' }, { t: 0.25, type: 'click' },
      { t: 0.5, type: 'whoosh' },
      { t: 1.0, type: 'impact' },
      { t: 4.0, type: 'hit' }, { t: 4.25, type: 'whoosh' },
      { t: 6.0, type: 'riser', dur: 2.0 },
      ...SKILLS.map((_, k) => ({ t: SKILL_T0 + k * SKILL_STEP, type: 'click' })),
    ],
    draw(lt, d, t) {
      const ctx = R.ctx, cx = W / 2, cy = H / 2;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, W, H);

      // trame de points qui apparaît depuis le centre (mesure 2)
      const gp = E.out3(P(lt, 3.8, 1.4));
      if (gp > 0) {
        ctx.fillStyle = C.white;
        for (let y = 60; y < H; y += 60) for (let x = 60; x < W; x += 60) {
          const dd = Math.hypot(x - cx, y - cy) / 1100;
          const a = clamp((gp - dd) * 3) * 0.16;
          if (a > 0.005) { ctx.globalAlpha = a; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
        }
        ctx.globalAlpha = 1;
      }

      // zoom de sortie
      const z = E.inExpo(P(lt, 7.2, 0.8));
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1 + z * 5, 1 + z * 5); ctx.translate(-cx, -cy);

      // groupe titre : se déplace et rétrécit à la mesure 2
      const g = E.ioExpo(P(lt, 4.0, 0.8));
      ctx.save();
      ctx.translate(cx, lerp(cy, 370, g));
      ctx.scale(lerp(1, 0.6, g), lerp(1, 0.6, g));

      if (lt < 0.5) {
        // curseur qui clignote en croches
        if (Math.floor(lt / 0.25) % 2 === 0) { ctx.fillStyle = C.white; ctx.fillRect(-9, -9, 18, 18); }
      } else {
        const stretch = E.outExpo(P(lt, 0.5, 0.45));
        const len = lerp(18, 1560, stretch) + 300 * E.io3(P(lt, 1.6, 2.2));
        const gap = lerp(0, 330, E.outExpo(P(lt, 1.0, 0.6)));
        const th = lerp(18, 4, stretch);
        ctx.fillStyle = C.white;
        ctx.fillRect(-len / 2, -gap / 2 - th / 2, len, th);
        if (gap > 0.5) ctx.fillRect(-len / 2, gap / 2 - th / 2, len, th);

        // le nom, révélé dans la bande, avec des échos colorés sur le temps
        const ls = lerp(-8, 26, E.io3(P(lt, 1.3, 3)));
        const o = { size: 300, weight: 900, family: F.display, ls, align: 'center' };
        const echoIn = E.out3(P(lt, 1.6, 0.4));
        if (echoIn > 0) {
          const amp = echoIn * (0.35 + 0.65 * R.pulse(t, 5));
          for (let k = 3; k >= 1; k--) {
            R.text('CLAUDE', 0, 108 + k * 34 * amp, { ...o, color: null, stroke: ECHO[k - 1], lineWidth: 3, alpha: echoIn * (1 - k * 0.18) });
          }
        }
        ctx.save();
        ctx.beginPath(); ctx.rect(-W, -gap / 2 + 2, W * 2, Math.max(0, gap - 4)); ctx.clip();
        R.revealChars('CLAUDE', 0, 108, lt, 1.05, { ...o, color: C.white, mask: true, stagger: 0.05, dur: 0.75 });
        ctx.restore();
      }
      ctx.restore();

      // MOTION DESIGN + sous-titres (mesure 2)
      R.revealChars('MOTION DESIGN', cx, 735, lt, 4.3, { size: 230, family: F.condensed, color: C.coral, align: 'center', mask: true, stagger: 0.035, dur: 0.7, ls: 6 });
      R.revealLine('SHOWREEL — 2026', cx, 820, lt, 4.9, { size: 30, family: F.mono, weight: 600, ls: 16, color: C.white, align: 'center' });
      R.revealLine('Le portfolio d’une *intelligence *artificielle.', cx, 892, lt, 5.3, { size: 44, family: F.serif, color: C.grey, accent: C.white, align: 'center' });

      // chargement des compétences (mesure 4)
      const lp = P(lt, SKILL_T0, SKILLS.length * SKILL_STEP);
      if (lt > SKILL_T0 - 0.1) {
        const appear = E.outExpo(P(lt, SKILL_T0 - 0.1, 0.4));
        const x0 = 560, x1 = 1360, y = 985;
        ctx.save();
        ctx.globalAlpha = appear;
        R.text('CHARGEMENT DES COMPÉTENCES', x0, y - 22, { size: 18, family: F.mono, weight: 600, ls: 4, color: C.grey });
        R.text(`${Math.round(E.io3(lp) * 100)} %`, x1, y - 22, { size: 18, family: F.mono, weight: 700, color: C.white, align: 'right' });
        ctx.fillStyle = C.smoke; ctx.fillRect(x0, y - 4, x1 - x0, 6);
        ctx.fillStyle = C.lime; ctx.fillRect(x0, y - 4, (x1 - x0) * E.io3(lp), 6);
        const k = Math.min(SKILLS.length - 1, Math.floor((lt - SKILL_T0) / SKILL_STEP));
        if (k >= 0) R.text('> ' + SKILLS[k], x0, y + 36, { size: 18, family: F.mono, weight: 700, ls: 3, color: C.lime });
        ctx.restore();
      }
      ctx.restore();

      // montée vers le blanc avant la coupe
      const w = E.in3(P(lt, 7.55, 0.45));
      if (w > 0) { ctx.fillStyle = `rgba(255,255,255,${w * 0.95})`; ctx.fillRect(0, 0, W, H); }
    },
  });
})();
