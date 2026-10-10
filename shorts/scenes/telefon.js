/* Scen: Telefonen i vakten ringer hela dagen → chauffören får besked i mobilen.
   Samma kamera: vaktkortet i mitten med lur, chaufförernas frågor som bubblor runt om. Lösning = bubblorna blir besked med bock. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['telefon'] = {
    mount(root) {
      const svg = Y.svg(root);
      const desk = Y.card(svg, { x: 318, y: 36, w: 300, h: 330, r: 28 });
      Y.label(svg, { x: 468, y: 72, text: 'VAKTEN', size: 22, weight: 700, fill: Y.C.muted, anchor: 'middle' });
      const handset = Y.icon(svg, { name: 'handset', x: 468, y: 170, size: 110 });
      const rings = [0, 1].map((i) => new Y.Item((svg.insertAdjacentHTML('beforeend', `<g><path d="M-78 -20 a40 40 0 0 0 0 40" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M78 -20 a40 40 0 0 1 0 40" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></g>`), svg.lastElementChild), { x: 468, y: 170, color: Y.C.muted, scale: 1 + i * 0.35 }));
      const bell = Y.icon(svg, { name: 'bell', x: 468, y: 170, size: 96, color: Y.C.accent });
      const counter = Y.pill(svg, { x: 0, y: 290, text: '12 missade', icon: 'handset', fontSize: 26, h: 52 }); counter.set({ x: 468 - counter.w / 2 });
      const Q = [{ x: 14, y: 40, side: 'right', q: 'Var ska jag?', a: 'Port 7 · 10:20' }, { x: 642, y: 40, side: 'left', q: 'Är det min tur?', a: 'Din tur. Kör fram.' }, { x: 14, y: 262, side: 'right', q: 'Vilken port?', a: 'Port 2. Backa in.' }, { x: 642, y: 262, side: 'left', q: 'Hallå?', a: 'Vänta 10 min.' }];
      const bubbles = Q.map((o) => Y.bubble(svg, { x: o.x, y: o.y, w: 280, h: 80, text: o.q, side: o.side, fontSize: 27 }));
      const checks = Q.map((o) => Y.check(svg, { x: o.x + 256, y: o.y + 8, r: 16 }));
      return (s) => {
        const { t, p, l } = s;
        desk.style({ border: U.mix(Y.C.border, Y.C.tint, p) });
        const ringing = (1 - p);
        handset.set({ rotate: Math.sin(t * 40) * 9 * ringing, opacity: 1 - p, scale: 1 + Math.abs(Math.sin(t * 20)) * 0.04 * ringing });
        rings.forEach((r, i) => { const q = ((t * 1.6 + i * 0.5) % 1); r.set({ scale: 1 + q * 0.5 + i * 0.25, opacity: (1 - q) * 0.8 * ringing * U.prog(t, 0.4, 0.3) }); });
        bell.set({ opacity: p, scale: U.lerp(0.6, 1, U.back(p)), rotate: s.phase === 'solution' ? Math.sin(Math.max(0, 1.2 - l) * 30) * 10 : 0 });
        counter.fadeIn(t, 0.9); counter.swap(p, { text: '12 missade', icon: 'handset' }, { text: '0 missade', icon: 'check' }).toneStyle(p); counter.set({ x: 468 - counter.w / 2 });
        bubbles.forEach((b, i) => {
          const start = 0.5 + i * 0.4;
          const loop = s.phase === 'problem' ? ((t - start) % 2.6 + 2.6) % 2.6 : 9;
          const bp = t < start ? 0 : (s.phase === 'problem' ? U.prog(loop, 0, 0.45, U.back) : 1);
          const o = s.phase === 'problem' ? bp * (loop > 2.2 ? 1 - (loop - 2.2) / 0.4 : 1) : 1;
          b.set({ scale: Math.max(0.001, s.phase === 'problem' ? bp : 1), opacity: o, x: Q[i].x + (s.phase === 'problem' ? Math.sin(t * 25 + i) * 2 * (1 - p) : 0) });
          b.swap(p, Q[i].q, Q[i].a); b.toneStyle(p);
          const cp = s.phase === 'solution' ? U.prog(l, 0.5 + i * 0.2, 0.4, U.back) : 0;
          checks[i].set({ scale: Math.max(0.001, cp), opacity: cp });
        });
      };
    },
  };
})();
