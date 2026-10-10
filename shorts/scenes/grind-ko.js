/* Scen: Köer och väntetid vid grinden → slotbokning/incheckning.
   Samma kamera: väg + bom. Problem = grå kö, tickande klocka, papper. Lösning = bommen upp, incheckade bilar rullar. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['grind-ko'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.road(svg, { y: 300 });
      const gate = Y.gate(svg, { x: 640, y: 176 });
      const clock = Y.clock(svg, { x: 560, y: 70 });
      const paper = Y.icon(svg, { name: 'clipboard', x: 700, y: 110, size: 56 });
      const phone = Y.icon(svg, { name: 'phone', x: 560, y: 70, size: 76, color: Y.C.accent });
      const status = Y.pill(svg, { x: 300, y: 18, text: 'Väntar…', icon: 'clock' });
      const stops = [490, 350, 210, 70];
      const trucks = stops.map(() => Y.truck(svg));
      const slots = stops.map((_, i) => { const m = 40 + i * 10; return Y.pill(svg, { x: 0, y: 0, text: `0${8 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, icon: 'check', fontSize: 28, h: 54 }); });
      return (s) => {
        const { t, p } = s;
        gate.tone(p).open(p);
        clock.set({ opacity: 1 - p, scale: 1 - p * 0.3 }).time(Math.max(0, t - 1));
        clock.pop(t, 0.7);
        if (p > 0) clock.set({ opacity: Math.min(clock.s.opacity, 1 - p) });
        paper.pop(t, 1.1); paper.set({ rotate: Math.sin(t * 4) * 5, opacity: Math.min(paper.s.opacity, 1 - p) });
        phone.set({ opacity: p, scale: U.lerp(0.5, 1, U.back(p)) });
        status.fadeIn(t, 1.5);
        status.swap(p, { text: 'Väntar…', icon: 'clock' }, { text: 'Incheckad', icon: 'check' }).toneStyle(p);
        trucks.forEach((tr, i) => {
          // Problem: kör in från vänster och stannar i kö. Lösning: rullar iväg en i taget, med jämna mellanrum.
          const arrive = U.prog(t, 0.2 + i * 0.3, 1.0, U.easeOut);
          let x = U.lerp(-220 - i * 40, stops[i], arrive);
          const go = s.phase === 'solution' ? Math.max(0, s.l - (0.35 + i * 0.42)) : 0;
          x += go * 210;
          const span = 936 + 520; x = ((x + 260) % span + span) % span - 260;
          const bob = arrive >= 1 && go === 0 ? Math.sin((t + i) * 9) * 1.2 : 0;
          const edge = Math.min(U.clamp((x + 150) / 120, 0, 1), U.clamp((936 - 10 - x) / 120, 0, 1));
          tr.tone(p).set({ x, y: 237 + bob, opacity: edge });
          slots[i].set({ x: x - 6, y: 164, opacity: edge * U.clamp((go - 0.05) * 3, 0, 1) * p }).toneStyle(1);
        });
      };
    },
  };
})();
