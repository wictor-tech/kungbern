/* Yard-primitiver: färdiga delar att komponera scenvisualer av. Hero-ytan är 936×400 px.
   Alla primitiver returnerar ett Item med .set({x,y,scale,rotate,opacity,color}) och .tone(p) (muted→accent). */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;
  const C = { muted: '#64748B', accent: '#0EA5E9', heading: '#0C4A6E', border: '#BAE6FD', tint: '#E0F2FE', tint2: '#F0F9FF', tint3: '#ECFDF5', card: '#FFFFFF', text: '#334155', bg: '#F5FAFE' };
  const FONT = 'Inter, system-ui, sans-serif';
  const add = (parent, str) => { parent.insertAdjacentHTML('beforeend', str); return parent.lastElementChild; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const tone = (p) => U.mix(C.muted, C.accent, p);
  const toneBg = (p) => U.mix(C.card, C.tint, p);
  const fo = (inner, w, h, x = -w / 2, y = -h / 2) => `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;color:inherit">${inner}</div></foreignObject>`;

  class Item {
    constructor(el, o = {}) { this.el = el; this.s = Object.assign({ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, color: null }, o); this.apply(); }
    set(o) { Object.assign(this.s, o); this.apply(); return this; }
    apply() { const s = this.s; this.el.setAttribute('transform', `translate(${s.x} ${s.y}) rotate(${s.rotate}) scale(${s.scale})`); this.el.style.opacity = U.clamp(s.opacity, 0, 1); if (s.color) this.el.style.color = s.color; }
    tone(p) { return this.set({ color: tone(p) }); }
    // "poppar" in med back-easing från start; returnerar progress
    pop(t, start, dur = 0.5) { const p = U.prog(t, start, dur, U.back); this.set({ scale: Math.max(0.001, p) * (this.base || 1), opacity: U.clamp(p * 2, 0, 1) }); return p; }
    fadeIn(t, start, dur = 0.4, dy = 14) { const p = U.prog(t, start, dur, U.easeOut); this.set({ opacity: p, y: (this.y0 ?? this.s.y) + (1 - p) * dy }); if (this.y0 == null) this.y0 = this.s.y; return p; }
    q(sel) { return this.el.querySelector(sel); }
  }
  const item = (svg, inner, o) => new Item(add(svg, `<g>${inner}</g>`), o);

  const Y = {
    C, tone, toneBg, Item, FONT,
    svg(root, w = 936, h = 400) { const s = add(root, `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible"></svg>`); return s; },

    // Väg: rundad bana med streckad mittlinje. Origin uppe till vänster.
    road(svg, { x = 0, y = 300, w = 936, h = 16 } = {}) {
      return item(svg, `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="${C.border}"/><line x1="20" y1="${h / 2}" x2="${w - 20}" y2="${h / 2}" stroke="#fff" stroke-width="4" stroke-dasharray="26 22"/>`, { x, y });
    },

    // Lastbil, sidovy. 132 bred, marken vid y=63 (origin uppe till vänster).
    truck(svg, o = {}) {
      return item(svg, `
        <rect x="0" y="4" width="92" height="46" rx="8" fill="#fff" stroke="currentColor" stroke-width="4"/>
        <path d="M92 20h24l16 16v14H92z" fill="#fff" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
        <rect x="99" y="24" width="12" height="11" rx="2" fill="currentColor" opacity=".35"/>
        <circle cx="24" cy="54" r="9" fill="#fff" stroke="currentColor" stroke-width="4"/>
        <circle cx="112" cy="54" r="9" fill="#fff" stroke="currentColor" stroke-width="4"/>`, Object.assign({ color: C.muted }, o));
    },
    // Lastbil uppifrån (för kartor). 64×30, origin i mitten, pekar åt höger.
    truckTop(svg, o = {}) {
      return item(svg, `<rect x="-40" y="-19" width="54" height="38" rx="6" fill="#fff" stroke="currentColor" stroke-width="4"/><rect x="17" y="-15" width="23" height="30" rx="5" fill="currentColor" opacity=".9"/>`, Object.assign({ color: C.muted }, o));
    },

    // Bom. Stolpe 22×120, pivot (11,24). .open(p) fäller upp armen.
    gate(svg, { len = 160, ...o } = {}) {
      const it = item(svg, `
        <rect x="0" y="0" width="22" height="120" rx="6" fill="#fff" stroke="currentColor" stroke-width="4"/>
        <g class="arm" transform-origin="11 24">
          <rect x="11" y="18" width="${len}" height="12" rx="6" fill="#fff" stroke="currentColor" stroke-width="4"/>
          <rect x="36" y="20" width="22" height="8" fill="currentColor"/><rect x="${36 + (len - 40) / 3}" y="20" width="22" height="8" fill="currentColor"/><rect x="${36 + (2 * (len - 40)) / 3}" y="20" width="22" height="8" fill="currentColor"/>
        </g>
        <circle cx="11" cy="24" r="7" fill="currentColor"/>`, Object.assign({ color: C.muted }, o));
      it.arm = it.q('.arm');
      it.open = (p) => { it.arm.setAttribute('transform', `rotate(${-82 * U.clamp(p, 0, 1)})`); return it; };
      return it;
    },

    // Klocka, origin i mitten. .time(sek) snurrar visarna.
    clock(svg, { r = 50, ...o } = {}) {
      const it = item(svg, `<circle r="${r}" fill="#fff" stroke="currentColor" stroke-width="5"/><line class="h" y2="${-r * 0.5}" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line class="m" y2="${-r * 0.74}" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle r="5" fill="currentColor"/>`, Object.assign({ color: C.muted }, o));
      const h = it.q('.h'), m = it.q('.m');
      it.time = (s) => { m.setAttribute('transform', `rotate(${s * 150})`); h.setAttribute('transform', `rotate(${s * 12 + 60})`); return it; };
      return it;
    },

    // Ikon ur biblioteket, centrerad i origin.
    icon(svg, { name, size = 64, ...o }) {
      return item(svg, fo(`<div style="width:${size}px;height:${size}px">${LUP.icon(name)}</div>`, size, size), Object.assign({ color: C.muted }, o));
    },

    // Piller med valfri ikon och text, origin uppe till vänster. .text(str) byter text.
    pill(svg, { text, icon = null, fontSize = 30, h = 60, bg = C.card, border = C.border, fg = C.heading, w = null, ...o }) {
      const pad = 24, ic = icon ? 38 : 0;
      const approx = (s) => s.length * fontSize * 0.58;
      const width = w || Math.round(pad * 2 + ic + (icon ? 10 : 0) + approx(text));
      const it = item(svg, `
        <rect class="bg" width="${width}" height="${h}" rx="${h / 2}" fill="${bg}" stroke="${border}" stroke-width="3"/>
        ${icon ? `<g class="ic" style="color:${fg}" transform="translate(${pad + ic / 2} ${h / 2})">${fo(`<div style="width:${ic - 6}px;height:${ic - 6}px">${LUP.icon(icon)}</div>`, ic, ic)}</g>` : ''}
        <text class="tx" x="${pad + ic + (icon ? 10 : 0)}" y="${h / 2 + fontSize * 0.36}" font-family="${FONT}" font-weight="700" font-size="${fontSize}" fill="${fg}">${esc(text)}</text>`, o);
      it.w = width; it.h = h;
      const tx = it.q('.tx'), bgEl = it.q('.bg');
      try { const real = tx.getComputedTextLength(); if (real > 0 && !w) { it.w = Math.round(pad * 2 + ic + (icon ? 10 : 0) + real); bgEl.setAttribute('width', it.w); } } catch (e) {}
      it.text = (s, extra = 0) => { tx.textContent = s; try { const real = tx.getComputedTextLength(); it.w = Math.round(pad * 2 + ic + (icon ? 10 : 0) + real + extra); bgEl.setAttribute('width', it.w); } catch (e) {} return it; };
      it.style = ({ bg: b, border: bd, fg: f }) => { if (b) bgEl.setAttribute('fill', b); if (bd) bgEl.setAttribute('stroke', bd); if (f) { tx.setAttribute('fill', f); const ic2 = it.q('.ic'); if (ic2) ic2.style.color = f; } return it; };
      it.icon = (name) => { const d = it.q('.ic div div'); if (d) d.innerHTML = LUP.icon(name); return it; };
      // Byt text/ikon när p passerar 0.5 (problem→lösning), utan att skriva om DOM varje frame
      it.swap = (p, a, b) => { const want = p > 0.5 ? 1 : 0; if (it._sw !== want) { it._sw = want; const v = want ? b : a; if (v.text != null) it.text(v.text, v.extra || 0); if (v.icon) it.icon(v.icon); } return it; };
      // problem→lösning: vit/muted → tint/heading
      it.toneStyle = (p) => it.style({ bg: U.mix(C.card, C.tint, p), border: U.mix(C.border, C.tint, p), fg: U.mix(C.muted, C.heading, p) });
      return it;
    },

    // Pratbubbla. Origin uppe till vänster, svans åt 'left' eller 'right'.
    bubble(svg, { w = 300, h = 86, text, side = 'left', fontSize = 30, bg = C.card, border = C.border, fg = C.text, ...o }) {
      const tail = side === 'left' ? `M26 ${h} l-14 22 l34 -22z` : `M${w - 26} ${h} l14 22 l-34 -22z`;
      const it = item(svg, `
        <path class="bg" d="M20 0 h${w - 40} a20 20 0 0 1 20 20 v${h - 40} a20 20 0 0 1 -20 20 h-${w - 40} a20 20 0 0 1 -20 -20 v-${h - 40} a20 20 0 0 1 20 -20z ${tail}" fill="${bg}" stroke="${border}" stroke-width="3" stroke-linejoin="round"/>
        <text class="tx" x="${w / 2}" y="${h / 2 + fontSize * 0.36}" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="${fontSize}" fill="${fg}">${esc(text)}</text>`, o);
      it.w = w; it.h = h;
      it.text = (s) => { it.q('.tx').textContent = s; return it; };
      it.style = ({ bg: b, border: bd, fg: f }) => { const e = it.q('.bg'); if (b) e.setAttribute('fill', b); if (bd) e.setAttribute('stroke', bd); if (f) it.q('.tx').setAttribute('fill', f); return it; };
      it.toneStyle = (p) => it.style({ bg: U.mix(C.card, C.tint, p), border: U.mix(C.border, C.tint, p), fg: U.mix(C.muted, C.heading, p) });
      it.swap = (p, a, b) => { const want = p > 0.5 ? 1 : 0; if (it._sw !== want) { it._sw = want; it.text(want ? b : a); } return it; };
      return it;
    },

    // Kort (vit yta med kant). Origin uppe till vänster.
    card(svg, { w, h, r = 24, bg = C.card, border = C.border, ...o }) {
      const it = item(svg, `<rect class="bg" width="${w}" height="${h}" rx="${r}" fill="${bg}" stroke="${border}" stroke-width="3"/>`, o);
      it.style = ({ bg: b, border: bd }) => { const e = it.q('.bg'); if (b) e.setAttribute('fill', b); if (bd) e.setAttribute('stroke', bd); return it; };
      return it;
    },

    // Text. anchor: start|middle|end
    label(svg, { text, size = 28, weight = 700, fill = C.heading, anchor = 'start', ...o }) {
      const it = item(svg, `<text class="tx" text-anchor="${anchor}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${fill}" y="${size * 0.36}">${esc(text)}</text>`, o);
      it.text = (s) => { it.q('.tx').textContent = s; return it; };
      it.fill = (f) => { it.q('.tx').setAttribute('fill', f); return it; };
      return it;
    },

    // Frågetecken, origin i mitten.
    qmark(svg, { size = 56, ...o } = {}) {
      return item(svg, `<text text-anchor="middle" y="${size * 0.36}" font-family="${FONT}" font-weight="800" font-size="${size}" fill="currentColor">?</text>`, Object.assign({ color: C.muted }, o));
    },

    // Checkmärke i cirkel, origin i mitten.
    check(svg, { r = 22, ...o } = {}) {
      return item(svg, `<circle r="${r}" fill="currentColor"/><path d="M${-r * 0.42} ${r * 0.05} l${r * 0.3} ${r * 0.3} l${r * 0.55} -${r * 0.6}" fill="none" stroke="#fff" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`, Object.assign({ color: C.accent }, o));
    },

    // Lastport (sedd uppifrån): docka med öppning nedåt och etikett. Origin uppe till vänster.
    dock(svg, { w = 150, h = 68, text = '', fontSize = 28, ...o }) {
      const it = item(svg, `
        <rect width="${w}" height="${h}" rx="12" fill="#fff" stroke="currentColor" stroke-width="3.5"/>
        <rect x="${w * 0.2}" y="${h - 8}" width="${w * 0.6}" height="10" rx="3" fill="currentColor" opacity=".9"/>
        <text x="${w / 2}" y="${h / 2 + fontSize * 0.1}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${fontSize}" fill="currentColor">${esc(text)}</text>`, Object.assign({ color: C.muted }, o));
      return it;
    },

    // Kart-rutnät (ljust). Origin uppe till vänster.
    grid(svg, { w, h, cell = 48, ...o }) {
      let d = '';
      for (let x = cell; x < w; x += cell) d += `M${x} 0 V${h} `;
      for (let y = cell; y < h; y += cell) d += `M0 ${y} H${w} `;
      return item(svg, `<path d="${d}" stroke="${C.tint}" stroke-width="2" fill="none"/>`, o);
    },

    // Sträcka (väg på karta eller kopplingslinje). .draw(p) ritar fram den, .at(p) ger punkt längs den.
    path(svg, { d, width = 10, dash = null, ...o }) {
      const it = item(svg, `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`, Object.assign({ color: C.muted }, o));
      const p = it.q('path'); const L = p.getTotalLength();
      it.len = L;
      if (!dash) { p.setAttribute('stroke-dasharray', L); p.setAttribute('stroke-dashoffset', L); }
      it.draw = (q) => { if (!dash) p.setAttribute('stroke-dashoffset', L * (1 - U.clamp(q, 0, 1))); else it.set({ opacity: U.clamp(q * 2, 0, 1) }); return it; };
      it.at = (q) => p.getPointAtLength(L * U.clamp(q, 0, 1));
      it.angleAt = (q) => { const a = p.getPointAtLength(L * U.clamp(q, 0, 1)), b = p.getPointAtLength(L * U.clamp(q + 0.01, 0, 1)); return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI; };
      return it;
    },

    // Kartnål, spetsen i origin.
    pin(svg, o = {}) {
      return item(svg, `<path d="M0 0 C-16 -22 -22 -30 -22 -42 a22 22 0 0 1 44 0 c0 12 -6 20 -22 42z" fill="currentColor"/><circle cy="-42" r="9" fill="#fff"/>`, Object.assign({ color: C.accent }, o));
    },

    // Telefon med skärm. Origin uppe till vänster. .screen är en <g> för eget innehåll (0,0 = skärmens övre vänstra hörn).
    phone(svg, { w = 150, h = 270, ...o } = {}) {
      const it = item(svg, `
        <rect width="${w}" height="${h}" rx="22" fill="#fff" stroke="currentColor" stroke-width="4"/>
        <rect x="${w / 2 - 22}" y="12" width="44" height="6" rx="3" fill="currentColor" opacity=".5"/>
        <rect x="${w / 2 - 28}" y="${h - 16}" width="56" height="5" rx="2.5" fill="currentColor" opacity=".5"/>
        <g class="screen" transform="translate(14 32)"></g>`, Object.assign({ color: C.muted }, o));
      it.screen = it.q('.screen'); it.sw = w - 28; it.sh = h - 60;
      return it;
    },

    // Pappersark med textrader. Origin uppe till vänster.
    sheet(svg, { w = 200, h = 250, lines = 6, title = true, ...o } = {}) {
      let rows = '';
      const top = title ? 54 : 26;
      if (title) rows += `<rect x="20" y="22" width="${w * 0.55}" height="12" rx="6" fill="currentColor" opacity=".7"/>`;
      for (let i = 0; i < lines; i++) rows += `<rect x="20" y="${top + i * 26}" width="${w - 40 - (i % 3) * 22}" height="8" rx="4" fill="currentColor" opacity=".35"/>`;
      return item(svg, `<rect width="${w}" height="${h}" rx="12" fill="#fff" stroke="currentColor" stroke-width="3.5"/>${rows}`, Object.assign({ color: C.muted }, o));
    },

    // Pulserande punkt ("live"). .pulse(t)
    dot(svg, { r = 8, ...o } = {}) {
      const it = item(svg, `<circle class="ring" r="${r}" fill="currentColor" opacity=".3"/><circle r="${r}" fill="currentColor"/>`, Object.assign({ color: C.accent }, o));
      const ring = it.q('.ring');
      it.pulse = (t) => { const q = (t % 1.4) / 1.4; ring.setAttribute('r', r * (1 + q * 2.2)); ring.setAttribute('opacity', (1 - q) * 0.45); return it; };
      return it;
    },

    // Enkel rad i en lista/tabell: origin uppe till vänster, w bred, 50 hög. cols = [{x, text, weight?}]
    row(svg, { w, cols, h = 54, bg = 'transparent', fg = C.text, fontSize = 26, ...o }) {
      const it = item(svg, `<rect class="bg" width="${w}" height="${h}" rx="12" fill="${bg}"/>${cols.map((c) => `<text x="${c.x}" y="${h / 2 + fontSize * 0.36}" font-family="${FONT}" font-weight="${c.weight || 600}" font-size="${fontSize}" fill="${c.fill || fg}">${esc(c.text)}</text>`).join('')}`, o);
      it.bg = (f) => { it.q('.bg').setAttribute('fill', f); return it; };
      return it;
    },
  };
  LUP.yard = Y;
})();
