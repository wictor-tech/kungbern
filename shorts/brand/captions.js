/* Undertexts-cues ur voiceover + tidslinje. Körs både i Node (SRT) och i webbläsaren (inbrända undertexter). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.LUP = root.LUP || {}).captions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ORDER = ['intro', 'hook', 'problem', 'solution', 'outro'];
  function phases(brand) {
    const T = brand.timeline; const list = []; let t = 0;
    for (const k of ORDER) { list.push({ key: k, start: t, end: t + T[k] }); t += T[k]; }
    return { list, total: t, byKey: Object.fromEntries(list.map((p) => [p.key, p])) };
  }
  const words = (s) => (String(s).trim().match(/\S+/g) || []);
  // Dela text i cues: först per mening, sedan i jämna bitar om max maxWords ord.
  function splitCue(text, maxWords) {
    const sentences = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*/g) || [text];
    const out = [];
    for (const s of sentences) {
      const w = words(s); if (!w.length) continue;
      const parts = Math.ceil(w.length / maxWords), per = Math.ceil(w.length / parts);
      for (let i = 0; i < w.length; i += per) out.push(w.slice(i, i + per).join(' '));
    }
    // slå ihop mycket korta cues (≤2 ord) med nästa om det ryms
    const merged = [];
    for (const c of out) {
      const prev = merged[merged.length - 1];
      if (prev && words(prev).length <= 2 && words(prev).length + words(c).length <= maxWords) merged[merged.length - 1] = prev + ' ' + c;
      else merged.push(c);
    }
    return merged;
  }
  function cues(brand, clip) {
    const cfg = Object.assign({ maxWordsPerCue: 7, minCueSeconds: 0.9 }, brand.captions || {});
    const { byKey } = phases(brand);
    const all = [];
    for (const k of ['hook', 'problem', 'solution', 'outro']) {
      const text = clip.voiceover && clip.voiceover[k]; if (!text) continue;
      const ph = byKey[k];
      const parts = splitCue(text, cfg.maxWordsPerCue);
      const total = parts.reduce((a, p) => a + words(p).length, 0);
      const w0 = ph.start + 0.25, w1 = ph.end - 0.15, span = w1 - w0;
      let t = w0;
      parts.forEach((p, i) => {
        let d = Math.max(cfg.minCueSeconds, (words(p).length / total) * span);
        if (i === parts.length - 1) d = w1 - t; // sista cuen fyller ut beaten
        all.push({ beat: k, start: +t.toFixed(3), end: +Math.min(w1, t + d).toFixed(3), text: p });
        t += d;
      });
    }
    return all;
  }
  return { ORDER, phases, splitCue, cues, words };
});
