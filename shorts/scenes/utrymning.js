/* Scen: Larmet går – är alla ute? → närvarolista i realtid, räkna in vid samlingsplatsen.
   Samma kamera: områdeskarta med två byggnader och samlingsplats. Problem = utspridda prickar och frågetecken. Lösning = alla samlas, räknaren fylls. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['utrymning'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.card(svg, { x: 0, y: 0, w: 936, h: 400, r: 28 });
      Y.grid(svg, { x: 2, y: 2, w: 932, h: 396, cell: 52 });
      const bA = Y.card(svg, { x: 60, y: 40, w: 300, h: 120, r: 16, border: Y.C.muted });
      const bB = Y.card(svg, { x: 60, y: 240, w: 300, h: 120, r: 16, border: Y.C.muted });
      Y.label(svg, { x: 76, y: 62, text: 'LAGER A', size: 16, weight: 700, fill: Y.C.muted });
      Y.label(svg, { x: 76, y: 262, text: 'LAGER B', size: 16, weight: 700, fill: Y.C.muted });
      const assembly = new Y.Item((svg.insertAdjacentHTML('beforeend', `<g><circle r="78" fill="#fff" stroke="currentColor" stroke-width="4" stroke-dasharray="14 12"/></g>`), svg.lastElementChild), { x: 790, y: 200, color: Y.C.muted });
      const flag = Y.icon(svg, { name: 'flag', x: 790, y: 108, size: 44 });
      const bell = Y.icon(svg, { name: 'bell', x: 470, y: 70, size: 80 });
      const shield = Y.icon(svg, { name: 'shield', x: 470, y: 70, size: 84, color: Y.C.accent });
      const N = 12;
      const scatter = [[120, 110], [250, 90], [320, 140], [140, 300], [230, 330], [330, 290], [440, 180], [520, 250], [600, 130], [640, 300], [480, 330], [560, 60]];
      const dots = scatter.map(([x, y]) => new Y.Item((svg.insertAdjacentHTML('beforeend', `<g><circle r="13" fill="currentColor"/><circle r="5" fill="#fff"/></g>`), svg.lastElementChild), { x, y, color: Y.C.muted }));
      const qs = [0, 4, 8].map(() => Y.qmark(svg, { size: 40 }));
      const status = Y.pill(svg, { x: 400, y: 318, text: 'Vem är kvar?', icon: 'clipboard' });
      return (s) => {
        const { t, p, l } = s;
        [bA, bB].forEach((b) => b.style({ border: U.mix(Y.C.muted, Y.C.border, p) }));
        assembly.tone(p); flag.tone(p);
        bell.pop(t, 0.2); bell.set({ opacity: Math.min(bell.s.opacity, 1 - p), rotate: Math.sin(t * 30) * 12 * (1 - p), scale: 1 + Math.abs(Math.sin(t * 15)) * 0.06 });
        const sp = s.phase === 'solution' ? U.prog(l, 3.2, 0.5, U.back) : 0;
        shield.set({ scale: Math.max(0.001, sp), opacity: sp });
        let arrived = 0;
        dots.forEach((d, i) => {
          const a = U.prog(t, 0.6 + i * 0.1, 0.35, U.back);
          const mv = s.phase === 'solution' ? U.prog(l, 0.3 + i * 0.2, 0.9, U.easeInOut) : 0;
          if (mv >= 1) arrived++;
          const ang = (i / N) * Math.PI * 2, r = i % 2 ? 48 : 22;
          const tx = 790 + Math.cos(ang) * r, ty = 200 + Math.sin(ang) * r;
          d.set({ x: U.lerp(scatter[i][0], tx, mv), y: U.lerp(scatter[i][1], ty, mv), scale: Math.max(0.001, a), opacity: a, color: U.mix(Y.C.muted, Y.C.accent, mv) });
        });
        qs.forEach((q, j) => { const i = [0, 4, 8][j]; const qp = U.prog(t, 1.4 + j * 0.3, 0.4, U.back); q.set({ x: scatter[i][0] + 26, y: scatter[i][1] - 26 + Math.sin(t * 3 + j) * 4, scale: Math.max(0.001, qp), opacity: qp * (1 - p) }); });
        status.fadeIn(t, 1.0);
        if (s.phase === 'solution') { const txt = `${arrived} / ${N} samlade`; if (status._last !== txt) { status.text(txt); status._last = txt; status.icon(arrived === N ? 'check' : 'users'); } }
        else if (status._last) { status.text('Vem är kvar?'); status.icon('clipboard'); status._last = null; }
        status.toneStyle(p);
      };
    },
  };
})();
