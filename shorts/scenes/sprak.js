/* Scen: Språkförbistring → instruktioner på chaufförens språk.
   Samma kamera: telefon i mitten, pratbubbla från siten till vänster, från chauffören till höger. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['sprak'] = {
    mount(root) {
      const svg = Y.svg(root);
      const site = Y.bubble(svg, { x: 16, y: 70, w: 340, h: 96, text: 'Kör till port 4', side: 'right', fontSize: 32 });
      const driver = Y.bubble(svg, { x: 580, y: 190, w: 340, h: 96, text: '???', side: 'left', fontSize: 34 });
      const phone = Y.phone(svg, { x: 373, y: 24, w: 190, h: 312 });
      // skärm (problem)
      const noChat = Y.icon(phone.screen, { name: 'chat', x: 81, y: 80, size: 76 });
      const noQ = Y.qmark(phone.screen, { x: 81, y: 180, size: 80 });
      // skärm (lösning)
      const lang = Y.pill(phone.screen, { x: 10, y: 6, text: 'PL', icon: 'globe', fontSize: 24, h: 44, w: 122 });
      const l1 = Y.label(phone.screen, { x: 81, y: 104, text: 'Jedź do', size: 30, weight: 700, anchor: 'middle' });
      const l2 = Y.label(phone.screen, { x: 81, y: 142, text: 'bramy 4', size: 30, weight: 700, anchor: 'middle' });
      const ok = Y.check(phone.screen, { x: 81, y: 206, r: 26 });
      const floats = [0, 1, 2].map(() => Y.qmark(svg, { size: 52 }));
      const langs = ['PL', 'RO', 'LT', 'DE', 'UA'].map((c, i) => Y.pill(svg, { x: 108 + i * 150, y: 346, text: c, icon: 'globe', fontSize: 26, h: 50, w: 124 }));
      const checks = langs.map((pl) => Y.check(svg, { x: pl.s.x + 112, y: pl.s.y + 2, r: 15 }));
      return (s) => {
        const { t, p } = s;
        site.fadeIn(t, 0.2); site.toneStyle(p); site.style({ fg: U.mix(Y.C.muted, Y.C.heading, p) });
        driver.fadeIn(t, 0.9); driver.swap(p, '???', 'OK ✓'); driver.toneStyle(p);
        phone.pop(t, 0.5); phone.tone(p);
        noChat.set({ opacity: 1 - p }); noQ.set({ opacity: (1 - p) * (0.6 + 0.4 * Math.abs(Math.sin(t * 3))), scale: 1 + Math.sin(t * 3) * 0.06 });
        lang.set({ opacity: p }).toneStyle(1); lang.style({ fg: Y.C.accent });
        [l1, l2].forEach((L, i) => { const q = U.prog(s.l, 0.3 + i * 0.2, 0.4, U.easeOut) * p; L.set({ opacity: q, y: (i ? 142 : 104) + (1 - q) * 8 }); });
        ok.pop(s.phase === 'solution' ? s.l : -1, 0.9); ok.set({ opacity: Math.min(ok.s.opacity, p) });
        floats.forEach((q, i) => { const lf = ((t - 1.3 - i * 0.5) % 1.8 + 1.8) % 1.8; const on = t > 1.3 + i * 0.5; q.set({ x: 690 + i * 60, y: 180 - lf * 60, opacity: on ? (1 - lf / 1.8) * (1 - p) : 0, scale: 0.8 + lf * 0.3 }); });
        langs.forEach((pl, i) => { pl.fadeIn(t, 1.6 + i * 0.15); pl.toneStyle(p); const c = checks[i]; c.pop(s.phase === 'solution' ? s.l : -1, 0.5 + i * 0.12); });
      };
    },
  };
})();
