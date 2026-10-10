/* Scen: Ingen vet när bilen kommer → slotbokning i förväg, planerad lastning.
   Samma kamera: planeringstavla (tre portar × förmiddag) och vägen under. Problem = klumpar och frågetecken. Lösning = jämnt fördelade slottar. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['eta'] = {
    mount(root) {
      const svg = Y.svg(root);
      Y.card(svg, { x: 0, y: 0, w: 936, h: 206, r: 24 });
      const X0 = 130, HW = 180; // 08:00 vid X0, en timme = HW px
      ['08', '09', '10', '11', '12'].forEach((h, i) => Y.label(svg, { x: X0 + i * HW, y: 26, text: h, size: 24, weight: 700, fill: Y.C.muted, anchor: 'middle' }));
      const lanes = [0, 1, 2].map((i) => { const y = 62 + i * 48; Y.path(svg, { d: `M${X0} ${y} H${X0 + 4 * HW}`, width: 2, color: Y.C.border, dash: '1 0' }).set({ opacity: 1 }); return Y.label(svg, { x: 18, y, text: `Port ${i + 1}`, size: 24, weight: 700, fill: Y.C.heading }); });
      // problem: 9 block som klumpar ihop sig (ingen vet när) → lösning: jämnt fördelade slottar
      const chaos = [[0, 0.0], [0, 0.2], [0, 0.4], [0, 0.1], [1, 0.05], [1, 0.35], [2, 0.15], [2, 0.5], [0, 0.3]];
      const plan = [[0, 0], [1, 0.5], [2, 1], [0, 1.2], [1, 2], [2, 2.5], [0, 2.4], [1, 3.4], [2, 3.4]];
      const regs = ['ABC 123', 'KLM 456', 'XYZ 789', 'DEF 321', 'GHI 654', 'JKL 987', 'MNO 135', 'PQR 246', 'STU 357'];
      const blocks = chaos.map((c, i) => { const b = Y.pill(svg, { x: 0, y: 0, text: regs[i], fontSize: 22, h: 40, w: 124, bg: Y.C.card, border: Y.C.muted, fg: Y.C.muted }); return b; });
      const qs = [0, 1, 2].map(() => Y.qmark(svg, { size: 48 }));
      Y.road(svg, { y: 330 });
      const trucks = [0, 1, 2].map(() => Y.truck(svg));
      const etas = ['ETA 09:40', 'ETA 10:10', 'ETA 10:40'].map((e) => Y.pill(svg, { x: 0, y: 0, text: e, icon: 'clock', fontSize: 26, h: 50 }));
      const status = Y.pill(svg, { x: 690, y: 38, text: 'Alla kl 07', icon: 'warning', fontSize: 24, h: 48 });
      const clock = Y.clock(svg, { x: 886, y: 292, r: 34 });
      return (s) => {
        const { t, p, l } = s;
        blocks.forEach((b, i) => {
          const a = U.prog(t, 0.3 + i * 0.12, 0.4, U.back);
          const q = U.easeInOut(U.clamp((p - i * 0.04) / 0.7, 0, 1));
          const cx = X0 + chaos[i][1] * HW + (i % 3) * 6, cy = 62 + chaos[i][0] * 48 - 20 + ((i % 4) - 1.5) * 6;
          const px = X0 + plan[i][1] * HW, py = 62 + plan[i][0] * 48 - 20;
          b.set({ x: U.lerp(cx, px, q), y: U.lerp(cy, py, q), scale: Math.max(0.001, a), opacity: a });
          b.style({ bg: U.mix(Y.C.card, Y.C.accent, q), border: U.mix(Y.C.muted, Y.C.accent, q), fg: U.mix(Y.C.muted, '#FFFFFF', q) });
        });
        qs.forEach((q, i) => { const qp = U.prog(t, 1.4 + i * 0.3, 0.4, U.back); q.set({ x: [X0 + 2.4 * HW, X0 + 1.8 * HW, X0 + 3.2 * HW][i], y: [62, 110, 158][i] - 2 + Math.sin(t * 3 + i) * 4, scale: Math.max(0.001, qp), opacity: qp * (1 - p) }); });
        trucks.forEach((tr, i) => {
          // problem: tre bilar kommer i klump och stannar. lösning: jämnt mellanrum, rullar lugnt.
          const arrive = U.prog(t, 0.2 + i * 0.1, 1.2, U.easeOut);
          const bunched = U.lerp(-260 - i * 150, 60 + i * 150, arrive);
          const spread = 40 + i * 300 + Math.max(0, l - 0.6) * 90;
          let x = U.lerp(bunched, spread, U.easeInOut(p));
          if (s.phase === 'solution') { const span = 936 + 400; x = ((x + 200) % span + span) % span - 200; }
          const edge = Math.min(U.clamp((x + 150) / 120, 0, 1), U.clamp((936 - 10 - x) / 120, 0, 1));
          tr.tone(p).set({ x, y: 267, opacity: edge });
          etas[i].set({ x: x - 14, y: 212, opacity: edge * p }).toneStyle(1);
        });
        status.fadeIn(t, 1.0); status.swap(p, { text: 'Alla kl 07', icon: 'warning' }, { text: 'Planerat', icon: 'check' }).toneStyle(p);
        clock.pop(t, 0.6); clock.set({ opacity: Math.min(clock.s.opacity, 1 - p) }).time(Math.max(0, t - 0.6));
      };
    },
  };
})();
