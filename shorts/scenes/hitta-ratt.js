/* Scen: Chauffören hittar inte rätt port → vägvisning i mobilen.
   Samma kamera: yard-karta med fyra portar. Problem = irrande streckad väg med frågetecken. Lösning = rak rutt till rätt port. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['hitta-ratt'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.card(svg, { x: 0, y: 0, w: 936, h: 400, r: 28 });
      Y.grid(svg, { x: 2, y: 2, w: 932, h: 396, cell: 52 });
      const docks = [120, 330, 540, 750].map((x, i) => Y.dock(svg, { x, y: 12, w: 160, h: 68, text: `Port ${i + 1}` }));
      const entry = Y.pill(svg, { x: 20, y: 344, text: 'Grind', icon: 'gate', fontSize: 24, h: 48 });
      const wander = Y.path(svg, { d: 'M70 318 L70 290 L300 290 L300 180 L560 180 L560 120 L440 120 L440 240 L700 240 L700 110', width: 9, dash: '18 16' });
      const route = Y.path(svg, { d: 'M70 318 L70 260 L620 260 L620 112', width: 12, color: Y.C.accent });
      const truck = Y.truckTop(svg, { x: 70, y: 318 });
      const qs = [0.3, 0.6, 0.85].map(() => Y.qmark(svg, { size: 56 }));
      const target = Y.check(svg, { x: 706, y: 18, r: 19 });
      const status = Y.pill(svg, { x: 600, y: 320, text: 'Vilken port?', icon: 'map' });
      const done = Y.check(svg, { r: 22 });
      return (s) => {
        const { t, p, l } = s;
        docks.forEach((d, i) => { d.fadeIn(t, 0.1 + i * 0.1); d.tone(i === 2 ? p : 0); });
        entry.fadeIn(t, 0.3); entry.toneStyle(p);
        wander.draw(U.prog(t, 0.5, 3.2)); wander.set({ opacity: Math.min(wander.s.opacity, 1 - p) });
        const wq = U.prog(t, 0.7, 3.2, U.easeInOut);
        route.draw(s.phase === 'solution' ? U.prog(l, 0.3, 1.1, U.easeInOut) : 0);
        const rq = s.phase === 'solution' ? U.prog(l, 0.8, 2.2, U.easeInOut) : 0;
        const pt = s.phase === 'solution' ? route.at(rq) : wander.at(wq);
        const ang = s.phase === 'solution' ? route.angleAt(rq) : wander.angleAt(wq);
        const tv = s.phase === 'problem' ? 1 - U.prog(l, s.P - 0.35, 0.3) : U.prog(l, 0.55, 0.3);
        truck.tone(p).set({ x: pt.x, y: pt.y, rotate: ang, opacity: tv });
        qs.forEach((q, i) => { const at = wander.at([0.3, 0.6, 0.85][i]); const qp = U.prog(wq, [0.3, 0.6, 0.85][i], 0.08, U.back); q.set({ x: at.x + 36, y: at.y - 36 + Math.sin(t * 3 + i) * 4, scale: Math.max(0.001, qp), opacity: qp * (1 - p) }); });
        const tp = s.phase === 'solution' ? U.prog(l, 0.4, 0.5, U.back) : 0;
        target.set({ scale: Math.max(0.001, tp), opacity: tp });
        status.fadeIn(t, 1.2); status.swap(p, { text: 'Vilken port?', icon: 'map' }, { text: 'Port 3 · 140 m', icon: 'map' }).toneStyle(p);
        const dp = s.phase === 'solution' ? U.prog(l, 3.0, 0.4, U.back) : 0;
        done.set({ x: pt.x + 44, y: pt.y + 14, scale: Math.max(0.001, dp), opacity: dp });
      };
    },
  };
})();
