/* LUPNUMBER shorts – animationsmotor. Allt styrs av tiden t (sekunder), inget beror på klockan. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeIn = (p) => p * p * p;
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const back = (p) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  // 0..1 mellan start och start+dur, valfri easing
  const prog = (t, start, dur, ease) => { const p = clamp((t - start) / dur, 0, 1); return ease ? ease(p) : p; };
  // in/ut-kurva: tonar in över inDur, håller, tonar ut över outDur innan end
  const window_ = (t, start, end, inDur, outDur) => {
    if (t < start || t > end) return 0;
    const a = prog(t, start, inDur, easeOut);
    const b = 1 - prog(t, end - outDur, outDur, easeIn);
    return Math.min(a, b);
  };

  // Färgblandning mellan två hexfärger, p = 0..1 (används för problem→lösning-toning)
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, p) => { const A = hex(a), B = hex(b), q = clamp(p, 0, 1); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], q))).join(',')})`; };
  const stagger = (t, start, i, step, dur, ease) => prog(t, start + i * step, dur, ease);

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const css = (e, obj) => { for (const k in obj) e.style[k] = obj[k]; return e; };

  // Standardentré: fade + slide upp (+ liten skala). p = 0..1
  const enter = (e, p, opts = {}) => {
    const dy = opts.dy ?? 28, s0 = opts.scale ?? 1, dx = opts.dx ?? 0;
    e.style.opacity = clamp(p, 0, 1);
    e.style.transform = `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px) scale(${lerp(s0, 1, p)})`;
  };
  const hide = (e) => { e.style.opacity = 0; };

  // Splittar text i rader (\n) och ord, returnerar array av ord-spans
  const words = (container, text, cls = 'w') => {
    container.innerHTML = '';
    const out = [];
    text.split('\n').forEach((line, li) => {
      if (li) container.appendChild(el('br'));
      line.split(/\s+/).filter(Boolean).forEach((w, wi, arr) => {
        const s = el('span', cls, w);
        container.appendChild(s);
        if (wi < arr.length - 1) container.appendChild(document.createTextNode(' '));
        out.push(s);
      });
    });
    return out;
  };

  // Wordmark: LUP (accent) + NUMBER (heading), bokstav för bokstav
  const wordmark = (size, brand) => {
    const w = el('div', 'wordmark');
    w.style.fontSize = size + 'px';
    const a = el('span', 'wm-lup'), b = el('span', 'wm-number');
    [...brand.wordmark.accent].forEach((ch) => a.appendChild(el('i', null, ch)));
    [...brand.wordmark.heading].forEach((ch) => b.appendChild(el('i', null, ch)));
    w.appendChild(a); w.appendChild(b);
    w._letters = [...w.querySelectorAll('i')];
    return w;
  };
  // Bygger upp wordmark: start = när första bokstaven kommer, stagger per bokstav
  const animateWordmark = (w, t, start, stagger = 0.07, dur = 0.5) => {
    w._letters.forEach((L, i) => {
      const p = prog(t, start + i * stagger, dur, back);
      L.style.opacity = clamp(p * 1.5, 0, 1);
      L.style.transform = `translateY(${(1 - p) * 0.35}em) scale(${lerp(0.7, 1, p)})`;
    });
  };

  LUP.util = { clamp, lerp, easeOut, easeIn, easeInOut, back, prog, window: window_, mix, stagger, el, css, enter, hide, words, wordmark, animateWordmark };
})();
