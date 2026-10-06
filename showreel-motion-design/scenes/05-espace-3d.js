// Scène 05 — Espace & 3D (provisoire : à remplacer).
'use strict';
(() => {
  const { W, H, C, F } = R;
  R.scene({
    id: '05', title: 'Espace & 3D', tag: 'ESPACE & 3D', bars: 6, theme: 'dark', accent: C.violet,
    events: [],
    draw(lt, d) {
      const ctx = R.ctx;
      ctx.fillStyle = 'dark' === 'light' ? C.paper : C.night;
      ctx.fillRect(0, 0, W, H);
      R.text('Espace & 3D', W / 2, H / 2, { size: 90, weight: 800, align: 'center', color: 'dark' === 'light' ? C.ink : C.white });
      R.text('À VENIR — ' + lt.toFixed(1) + ' / ' + d.toFixed(0) + ' s', W / 2, H / 2 + 70, { size: 24, family: F.mono, align: 'center', color: C.grey });
    },
  });
})();
