// Scène 10 — Générique (provisoire : à remplacer).
'use strict';
(() => {
  const { W, H, C, F } = R;
  R.scene({
    id: '10', title: 'Générique', tag: 'GÉNÉRIQUE', bars: 9, theme: 'dark', accent: C.coral,
  hud: false,
    events: [],
    draw(lt, d) {
      const ctx = R.ctx;
      ctx.fillStyle = 'dark' === 'light' ? C.paper : C.night;
      ctx.fillRect(0, 0, W, H);
      R.text('Générique', W / 2, H / 2, { size: 90, weight: 800, align: 'center', color: 'dark' === 'light' ? C.ink : C.white });
      R.text('À VENIR — ' + lt.toFixed(1) + ' / ' + d.toFixed(0) + ' s', W / 2, H / 2 + 70, { size: 24, family: F.mono, align: 'center', color: C.grey });
    },
  });
})();
