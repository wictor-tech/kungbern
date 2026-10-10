/* Scen: "Vem är på siten just nu?" → realtidsöverblick.
   Samma kamera: en yard-karta med tre portar och en väg. Problem = grå bilar med frågetecken. Lösning = nålar, regnummer, räknare. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['yard-overblick'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.card(svg, { x: 0, y: 0, w: 936, h: 400, r: 28 });
      Y.grid(svg, { x: 2, y: 2, w: 932, h: 396, cell: 52 });
      const docks = [90, 390, 690].map((x, i) => Y.dock(svg, { x, y: 16, w: 160, h: 64, text: `Port ${i + 1}` }));
      Y.road(svg, { x: 24, y: 206, w: 888, h: 14 });
      const spots = [{ x: 170, y: 128 }, { x: 470, y: 128 }, { x: 770, y: 128 }, { x: 300, y: 213 }, { x: 640, y: 213 }];
      const trucks = spots.map((sp, i) => Y.truckTop(svg, { x: sp.x, y: sp.y, rotate: i < 3 ? -90 : 0 }));
      const qs = spots.map((sp) => Y.qmark(svg, { x: sp.x + 36, y: sp.y - 30, size: 48 }));
      const pins = spots.map((sp, i) => (i < 3 ? Y.pin(svg, { x: sp.x, y: sp.y - 8 }) : Y.check(svg, { x: sp.x, y: sp.y + 36, r: 13 })));
      const regs = ['ABC 123 · Port 1', 'KLM 456 · Port 2', 'XYZ 789 · Port 3'];
      const tags = regs.map((r, i) => Y.pill(svg, { x: spots[i].x - 70, y: spots[i].y + 30, text: r, fontSize: 20, h: 40 }));
      const radio = Y.icon(svg, { name: 'chat', x: 72, y: 332, size: 54 });
      const dots3 = Y.label(svg, { x: 112, y: 320, text: '…', size: 36, weight: 800, fill: Y.C.muted });
      const status = Y.pill(svg, { x: 560, y: 318, text: 'Vem? Var? Hur många?', icon: 'eye' });
      const live = Y.dot(svg, { x: 586, y: 344 });
      return (s) => {
        const { t, p } = s;
        docks.forEach((d, i) => { d.tone(p); d.fadeIn(t, 0.1 + i * 0.1); });
        trucks.forEach((tr, i) => {
          const a = tr.pop(t, 0.5 + i * 0.22, 0.5);
          tr.base = 1; tr.tone(p);
          let x = spots[i].x;
          if (i >= 3) x += Math.max(0, t - s.P - 0.4) * (i === 3 ? 36 : 20); // på vägen rullar bilarna i lösningen, samma håll, olika fart
          tr.set({ x });
          const q = qs[i]; const qp = U.prog(t, 1.0 + i * 0.2, 0.4, U.back);
          q.set({ x: x + 36, y: spots[i].y - 30 + Math.sin(t * 3 + i) * 5, scale: Math.max(0.001, qp), opacity: qp * (1 - p) });
          const pin = pins[i]; const pp = U.prog(t, s.P + 0.5 + i * 0.15, 0.5, U.back);
          pin.set({ x, y: i < 3 ? spots[i].y - 8 : spots[i].y + 36, scale: Math.max(0.001, pp), opacity: pp });
          if (i < 3) { const tp = U.prog(t, s.P + 1.1 + i * 0.15, 0.4, U.easeOut); tags[i].set({ opacity: tp, y: spots[i].y + 30 + (1 - tp) * 10 }).toneStyle(1); }
        });
        radio.pop(t, 1.6); radio.set({ opacity: Math.min(radio.s.opacity, 1 - p), rotate: Math.sin(t * 12) * (1 - p) * 6 });
        dots3.set({ opacity: U.prog(t, 1.8, 0.3) * (1 - p) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2))) });
        status.fadeIn(t, 1.3);
        status.swap(p, { text: 'Vem? Var? Hur många?', icon: 'eye' }, { text: '5 på siten · just nu', icon: 'users', extra: 30 }).toneStyle(p);
        live.set({ x: status.s.x + status.w - 28, y: status.s.y + 26, opacity: p }).pulse(t);
      };
    },
  };
})();
