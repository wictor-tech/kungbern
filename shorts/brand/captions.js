/* Undertexts-cues ur voiceover + tidslinje. Körs både i Node (SRT) och i webbläsaren (inbrända undertexter). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.LUP = root.LUP || {}).captions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function phases(brand) {
    const T = brand.timeline; const list = []; let t = 0;
    for (const k of Object.keys(T)) { list.push({ key: k, start: t, end: t + T[k] }); t += T[k]; }
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
    const merged = [];
    for (const c of out) {
      const prev = merged[merged.length - 1];
      if (prev && words(prev).length <= 2 && words(prev).length + words(c).length <= maxWords) merged[merged.length - 1] = prev + ' ' + c;
      else merged.push(c);
    }
    return merged;
  }
  // beats: [{ key, start, end, text }] → cues tidsatta inom varje beat, proportionellt mot ordantal
  function cuesFromBeats(beats, cfgIn) {
    const cfg = Object.assign({ maxWordsPerCue: 7, minCueSeconds: 0.9 }, cfgIn || {});
    const all = [];
    for (const b of beats) {
      if (!b.text) continue;
      const parts = splitCue(b.text, cfg.maxWordsPerCue);
      const total = parts.reduce((a, p) => a + words(p).length, 0);
      const w0 = b.start + 0.25, w1 = b.end - 0.15, span = w1 - w0;
      let t = w0;
      parts.forEach((p, i) => {
        let d = Math.max(cfg.minCueSeconds, (words(p).length / total) * span);
        if (i === parts.length - 1) d = w1 - t;
        all.push({ beat: b.key, start: +t.toFixed(3), end: +Math.min(w1, t + d).toFixed(3), text: p });
        t += d;
      });
    }
    return all;
  }
  function cues(brand, clip) {
    const { byKey } = phases(brand);
    const beats = ['hook', 'problem', 'solution', 'outro'].filter((k) => byKey[k] && clip.voiceover && clip.voiceover[k]).map((k) => ({ key: k, start: byKey[k].start, end: byKey[k].end, text: clip.voiceover[k] }));
    return cuesFromBeats(beats, brand.captions);
  }
  return { phases, splitCue, cues, cuesFromBeats, words };
});
