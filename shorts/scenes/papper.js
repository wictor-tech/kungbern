/* Scen: Pärmar och papperslogg → digital logg, sök på sekunder.
   Samma kamera: ett stort kort. Problem = pappershögar, pärm och frågetecken. Lösning = loggtabell, sökning, träff. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, Y = LUP.yard;
  LUP.scenes = LUP.scenes || {};

  LUP.scenes['papper'] = {
    mount(root) {
      const svg = Y.svg(root);
      const desk = Y.card(svg, { x: 118, y: 0, w: 700, h: 400, r: 28 });
      const sheets = [{ x: 170, y: 80, r: -7 }, { x: 205, y: 66, r: 4 }, { x: 240, y: 54, r: -1 }].map((o) => Y.sheet(svg, { x: o.x, y: o.y, w: 200, h: 240, lines: 6, rotate: o.r }));
      const binder = Y.icon(svg, { name: 'clipboard', x: 640, y: 116, size: 96 });
      const mag = Y.icon(svg, { name: 'search', x: 560, y: 250, size: 72 });
      const q = Y.qmark(svg, { x: 700, y: 236, size: 66 });
      const status = Y.pill(svg, { x: 300, y: 330, text: 'Tisdag 14:10 – vem var det?', icon: 'clock', fontSize: 28 });
      const cols = [{ x: 24, text: 'Tid' }, { x: 130, text: 'Reg' }, { x: 290, text: 'Bolag' }, { x: 496, text: 'Port' }];
      const header = Y.row(svg, { x: 150, y: 18, w: 636, h: 40, fontSize: 22, cols: cols.map((c) => ({ ...c, weight: 700, fill: Y.C.muted })) });
      const data = [['13:40', 'ABC 123', 'Nordfrakt', 'Port 1'], ['13:55', 'KLM 456', 'Transit AB', 'Port 3'], ['14:10', 'XYZ 789', 'Frakt & Co', 'Port 2'], ['14:25', 'DEF 321', 'Nordfrakt', 'Port 1'], ['14:40', 'GHI 654', 'Linjetrafik', 'Port 4']];
      const rows = data.map((d, i) => Y.row(svg, { x: 150, y: 62 + i * 54, w: 636, h: 50, cols: cols.map((c, j) => ({ x: c.x, text: d[j], weight: j === 1 ? 700 : 600, fill: j === 1 ? Y.C.heading : Y.C.text })) }));
      const hit = Y.check(svg, { x: 766, y: 62 + 2 * 54 + 25, r: 16 });
      const search = Y.pill(svg, { x: 520, y: 336, text: 'XYZ 789', icon: 'search', fontSize: 26, h: 52 });
      const cloud = Y.icon(svg, { name: 'cloud', x: 776, y: 362, size: 48, color: Y.C.accent });
      return (s) => {
        const { t, p, l } = s;
        desk.style({ border: U.mix(Y.C.border, Y.C.tint, p) });
        sheets.forEach((sh, i) => { sh.pop(t, 0.3 + i * 0.2); sh.set({ opacity: Math.min(sh.s.opacity, 1 - p), rotate: [-7, 4, -1][i] + Math.sin(t * 2 + i) * 1.5 }); });
        binder.pop(t, 0.8); binder.set({ opacity: Math.min(binder.s.opacity, 1 - p) });
        mag.pop(t, 1.3); mag.set({ opacity: Math.min(mag.s.opacity, 1 - p), x: 560 + Math.sin(t * 2.5) * 10, y: 250 + Math.cos(t * 2.5) * 8 });
        q.pop(t, 1.7); q.set({ opacity: Math.min(q.s.opacity, 1 - p), y: 240 + Math.sin(t * 3) * 5 });
        status.fadeIn(t, 1.0); status.set({ opacity: Math.min(status.s.opacity, 1 - p) });
        header.set({ opacity: p });
        rows.forEach((r, i) => { const rp = s.phase === 'solution' ? U.prog(l, 0.3 + i * 0.16, 0.4, U.easeOut) : 0; r.set({ opacity: rp, x: 150 + (1 - rp) * 20 }); r.bg(i === 2 ? U.mix('#FFFFFF', Y.C.tint, s.phase === 'solution' ? U.prog(l, 2.2, 0.4) : 0) : 'transparent'); });
        const hp = s.phase === 'solution' ? U.prog(l, 2.4, 0.4, U.back) : 0;
        hit.set({ scale: Math.max(0.001, hp), opacity: hp });
        const sp = s.phase === 'solution' ? U.prog(l, 1.6, 0.4, U.easeOut) : 0;
        search.set({ opacity: sp, y: 336 + (1 - sp) * 10 }).toneStyle(1);
        const cp = s.phase === 'solution' ? U.prog(l, 2.8, 0.5, U.back) : 0;
        cloud.set({ scale: Math.max(0.001, cp), opacity: cp });
      };
    },
  };
})();
