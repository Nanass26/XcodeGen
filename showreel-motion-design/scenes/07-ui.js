// Scène 07 — UI motion (provisoire : à remplacer).
'use strict';
(() => {
  const { W, H, C, F } = R;
  R.scene({
    id: '07', title: 'UI motion', tag: 'UI MOTION', bars: 6, theme: 'light', accent: C.pink,
    events: [],
    draw(lt, d) {
      const ctx = R.ctx;
      ctx.fillStyle = 'light' === 'light' ? C.paper : C.night;
      ctx.fillRect(0, 0, W, H);
      R.text('UI motion', W / 2, H / 2, { size: 90, weight: 800, align: 'center', color: 'light' === 'light' ? C.ink : C.white });
      R.text('À VENIR — ' + lt.toFixed(1) + ' / ' + d.toFixed(0) + ' s', W / 2, H / 2 + 70, { size: 24, family: F.mono, align: 'center', color: C.grey });
    },
  });
})();
