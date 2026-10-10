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
      const docks = [80, 380, 680].map((x, i) => Y.dock(svg, { x, y: 16, w: 180, h: 72, text: `Port ${i + 1}` }));
      Y.road(svg, { x: 24, y: 206, w: 888, h: 14 });
      const spots = [{ x: 170, y: 136 }, { x: 470, y: 136 }, { x: 770, y: 136 }, { x: 300, y: 213 }, { x: 640, y: 213 }];
      const trucks = spots.map((sp, i) => Y.truckTop(svg, { x: sp.x, y: sp.y, rotate: i < 3 ? -90 : 0 }));
      const qs = spots.map((sp) => Y.qmark(svg, { x: sp.x + 44, y: sp.y - 34, size: 60 }));
      const pins = spots.map((sp, i) => Y.check(svg, { x: i < 3 ? sp.x + 46 : sp.x, y: i < 3 ? sp.y - 26 : sp.y + 42, r: 17 }));
      const radio = Y.icon(svg, { name: 'chat', x: 76, y: 332, size: 64 });
      const dots3 = Y.label(svg, { x: 122, y: 318, text: '…', size: 44, weight: 800, fill: Y.C.muted });
      const status = Y.pill(svg, { x: 540, y: 314, text: 'Vem? Var? Hur många?', icon: 'eye' });
      const live = Y.dot(svg, { x: 586, y: 344, r: 9 });
      return (s) => {
        const { t, p } = s;
        docks.forEach((d, i) => { d.tone(p); d.fadeIn(t, 0.1 + i * 0.1); });
        trucks.forEach((tr, i) => {
          const a = tr.pop(t, 0.5 + i * 0.22, 0.5);
          tr.base = 1; tr.tone(p);
          let x = spots[i].x;
          if (i >= 3 && s.phase === 'solution') x += Math.max(0, s.l - 0.4) * (i === 3 ? 36 : 20); // på vägen rullar bilarna i lösningen, samma håll, olika fart
          tr.set({ x });
          const q = qs[i]; const qp = U.prog(t, 1.0 + i * 0.2, 0.4, U.back);
          q.set({ x: x + 44, y: spots[i].y - 34 + Math.sin(t * 3 + i) * 5, scale: Math.max(0.001, qp), opacity: qp * (1 - p) });
          const pin = pins[i]; const pp = s.phase === 'solution' ? U.prog(s.l, 0.5 + i * 0.15, 0.5, U.back) : 0;
          pin.set({ x: i < 3 ? x + 46 : x, y: i < 3 ? spots[i].y - 26 : spots[i].y + 42, scale: Math.max(0.001, pp), opacity: pp });
        });
        radio.pop(t, 1.6); radio.set({ opacity: Math.min(radio.s.opacity, 1 - p), rotate: Math.sin(t * 12) * (1 - p) * 6 });
        dots3.set({ opacity: U.prog(t, 1.8, 0.3) * (1 - p) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2))) });
        status.fadeIn(t, 1.3);
        status.swap(p, { text: 'Vem? Var? Hur många?', icon: 'eye' }, { text: '5 på siten · just nu', icon: 'users', extra: 34 }).toneStyle(p);
        live.set({ x: status.s.x + status.w - 30, y: status.s.y + 30, opacity: p }).pulse(t);
      };
    },
  };
})();
