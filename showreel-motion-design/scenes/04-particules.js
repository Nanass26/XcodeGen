// Scène 04 — Particules & génératif (provisoire : à remplacer).
'use strict';
(() => {
  const { W, H, C, F } = R;
  R.scene({
    id: '04', title: 'Particules & génératif', tag: 'PARTICULES & GÉNÉRATIF', bars: 6, theme: 'dark', accent: C.teal,
    events: [],
    draw(lt, d) {
      const ctx = R.ctx;
      ctx.fillStyle = 'dark' === 'light' ? C.paper : C.night;
      ctx.fillRect(0, 0, W, H);
      R.text('Particules & génératif', W / 2, H / 2, { size: 90, weight: 800, align: 'center', color: 'dark' === 'light' ? C.ink : C.white });
      R.text('À VENIR — ' + lt.toFixed(1) + ' / ' + d.toFixed(0) + ' s', W / 2, H / 2 + 70, { size: 24, family: F.mono, align: 'center', color: C.grey });
    },
  });
})();
