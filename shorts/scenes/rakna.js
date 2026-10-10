/* Scen: Räknehook – kostnaden för kön räknas upp i bild ur klippets siffror (clip.calc).
   Samma kamera: tre tal (bilar × minuter × dagar) och ett resultat. Lösningen byter minuterna och räknar ned resultatet. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['rakna'] = {
    mount(root, clip) {
      const c = Object.assign({ trucks: 12, minutes: 35, days: 22, minutesAfter: 5, unit: 'timmar i kö', period: 'per månad', note: 'Räkneexempel' }, (clip && clip.calc) || {});
      const hours = (m) => Math.round((c.trucks * m * c.days) / 60);
      const before = hours(c.minutes), after = hours(c.minutesAfter), saved = before - after;
      const svg = Y.svg(root);
      const cards = [
        { x: 0, big: c.trucks, label: 'bilar per dag' },
        { x: 332, big: c.minutes, label: 'min vid grinden' },
        { x: 664, big: c.days, label: 'arbetsdagar' },
      ].map((d) => {
        const card = Y.card(svg, { x: d.x, y: 44, w: 272, h: 160, r: 24 });
        const num = Y.label(svg, { x: d.x + 136, y: 112, text: String(d.big), size: 84, weight: 800, anchor: 'middle' });
        const lab = Y.label(svg, { x: d.x + 136, y: 170, text: d.label, size: 24, weight: 600, fill: Y.C.muted, anchor: 'middle' });
        return { card, num, lab, v: d.big };
      });
      const times = [302, 634].map((x) => Y.label(svg, { x, y: 124, text: '×', size: 56, weight: 800, fill: Y.C.muted, anchor: 'middle' }));
      const result = Y.card(svg, { x: 0, y: 248, w: 936, h: 112, r: 28 });
      const eq = Y.label(svg, { x: 40, y: 304, text: '=', size: 60, weight: 800, fill: Y.C.muted });
      const resNum = Y.label(svg, { x: 300, y: 306, text: '0', size: 72, weight: 800, anchor: 'end' });
      const resLab = Y.label(svg, { x: 324, y: 296, text: `${c.unit}`, size: 30, weight: 700, fill: Y.C.heading });
      const resPer = Y.label(svg, { x: 324, y: 332, text: c.period, size: 24, weight: 600, fill: Y.C.muted });
      const saving = Y.pill(svg, { x: 620, y: 274, text: `${saved} timmar tillbaka`, icon: 'check', fontSize: 28, h: 60 });
      const note = Y.pill(svg, { x: 736, y: -4, text: c.note, fontSize: 20, h: 40, fg: Y.C.muted });
      return (s) => {
        const { t, p, l } = s;
        cards.forEach((cd, i) => {
          const a = U.prog(t, 0.2 + i * 0.3, 0.5, U.back);
          [cd.card, cd.num, cd.lab].forEach((it) => it.set({ opacity: a }));
          cd.card.set({ scale: U.lerp(0.9, 1, a) });
        });
        times.forEach((x, i) => x.set({ opacity: U.prog(t, 0.5 + i * 0.3, 0.3) }));
        // minuter: räknas ned i lösningen
        const mid = cards[1];
        const q = s.phase === 'solution' ? U.prog(l, 0.4, 1.0, U.easeInOut) : 0;
        mid.num.text(String(Math.round(U.lerp(c.minutes, c.minutesAfter, q))));
        mid.num.fill(U.mix(Y.C.heading, Y.C.accent, q));
        mid.card.style({ bg: U.mix(Y.C.card, Y.C.tint, q), border: U.mix(Y.C.border, Y.C.accent, q) });
        // resultat
        const ra = U.prog(t, 1.2, 0.4, U.easeOut);
        [result, eq, resNum, resLab, resPer].forEach((it) => it.set({ opacity: ra }));
        const up = U.prog(t, 1.3, 1.3, U.easeOut);
        const val = s.phase === 'solution' ? U.lerp(before, after, q) : before * up;
        resNum.text(String(Math.round(val)));
        resNum.fill(U.mix(Y.C.heading, Y.C.accent, q));
        result.style({ border: U.mix(Y.C.border, Y.C.accent, q) });
        const sp = s.phase === 'solution' ? U.prog(l, 1.5, 0.5, U.back) : 0;
        saving.set({ scale: Math.max(0.001, sp), opacity: sp }).toneStyle(1);
        note.set({ opacity: U.prog(t, 0.1, 0.3) * 0.9 });
      };
    },
  };
})();
