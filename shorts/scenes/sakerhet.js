/* Scen: Säkerhetsgenomgång på papper → läs, kvittera i mobilen, kör in.
   Samma kamera: bil väntar vid bommen; dokumentet till vänster går från pappersark till kvitterad checklista i mobilen. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['sakerhet'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.road(svg, { y: 300 });
      const gate = Y.gate(svg, { x: 700, y: 176 });
      const truck = Y.truck(svg, { x: -200, y: 237 });
      const sheet = Y.sheet(svg, { x: 70, y: 10, w: 280, h: 250, lines: 7 });
      const pen = Y.icon(svg, { name: 'pen', x: 330, y: 230, size: 52 });
      const slowChecks = [0, 1].map((i) => Y.check(svg, { x: 86, y: 68 + i * 26, r: 10, color: Y.C.muted }));
      const clock = Y.clock(svg, { x: 470, y: 90, r: 46 });
      const phone = Y.phone(svg, { x: 80, y: -6, w: 250, h: 290, color: Y.C.accent });
      const lang = Y.pill(phone.screen, { x: 6, y: 2, text: 'PL', icon: 'globe', fontSize: 22, h: 40, w: 112 });
      const rows = ['Hjälm och väst', 'Max 20 km/h', 'Stanna vid port', 'Ingen rökning'].map((txt, i) => ({
        c: Y.check(phone.screen, { x: 20, y: 70 + i * 44, r: 15 }),
        l: Y.label(phone.screen, { x: 44, y: 70 + i * 44, text: txt, size: 23, weight: 600, fill: Y.C.text }),
      }));
      const shield = Y.icon(svg, { name: 'shield', x: 440, y: 70, size: 80, color: Y.C.accent });
      const status = Y.pill(svg, { x: 360, y: 148, text: '10 min…', icon: 'clock' });
      return (s) => {
        const { t, p, l } = s;
        const arrive = U.prog(t, 0.1, 1.1, U.easeOut);
        const go = Math.max(0, l - 2.0) * (s.phase === 'solution' ? 1 : 0);
        truck.tone(p).set({ x: U.lerp(-200, 520, arrive) + go * 230, opacity: U.clamp((936 - 10 - (520 + go * 230)) / 120, 0, 1) });
        gate.tone(p).open(s.phase === 'solution' ? U.prog(l, 1.4, 0.7, U.easeInOut) : 0);
        sheet.pop(t, 0.4); sheet.set({ opacity: Math.min(sheet.s.opacity, 1 - p), rotate: -3 });
        pen.pop(t, 0.9); pen.set({ opacity: Math.min(pen.s.opacity, 1 - p), rotate: Math.sin(t * 5) * 8 - 10 });
        slowChecks.forEach((c, i) => { c.pop(t, 1.6 + i * 1.5, 0.4); c.set({ opacity: Math.min(c.s.opacity, 1 - p) }); });
        clock.pop(t, 0.7); clock.set({ opacity: Math.min(clock.s.opacity, 1 - p) }).time(Math.max(0, t - 0.7));
        phone.set({ opacity: p, scale: U.lerp(0.85, 1, p) });
        lang.set({ opacity: p }).toneStyle(1); lang.style({ fg: Y.C.accent });
        rows.forEach((r, i) => { const q = s.phase === 'solution' ? U.prog(l, 0.4 + i * 0.28, 0.4, U.back) : 0; r.c.set({ scale: Math.max(0.001, q), opacity: q }); r.l.set({ opacity: Math.min(1, p) }); });
        const sp = s.phase === 'solution' ? U.prog(l, 1.5, 0.5, U.back) : 0;
        shield.set({ scale: Math.max(0.001, sp), opacity: sp, rotate: (1 - sp) * -20 });
        status.fadeIn(t, 1.3); status.swap(p, { text: '10 min…', icon: 'clock' }, { text: 'Kvitterad', icon: 'check' }).toneStyle(p);
        status.set({ x: U.lerp(360, 480, p) });
      };
    },
  };
})();
