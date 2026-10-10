/* LUPNUMBER shorts – LÅST MALL (hook först).
   Frame 0 = badge + hook. Sedan Problem → Lösning → Outro (wordmark byggs upp, fråga, handling).
   Problem och lösning delar EN hero-visual ("samma kamera") som tonar från grått till sky.
   Ett klipp byter bara text + ikon + scenvisual + CTA. Rör inte tider/layout här per klipp. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;

  // Minska fontstorlek tills texten ryms (bredd och antal rader). Används för hook och rubriker.
  LUP.fitText = function (el, maxWidth, maxLines, minSize) {
    let size = parseFloat(getComputedStyle(el).fontSize);
    const lh = parseFloat(getComputedStyle(el).lineHeight) / size;
    for (let i = 0; i < 24; i++) {
      el.style.fontSize = size + 'px';
      const lines = Math.round(el.offsetHeight / (size * lh));
      if ((el.scrollWidth <= maxWidth && lines <= maxLines) || size <= minSize) break;
      size -= 3;
    }
  };

  // Badge: liten wordmark + serienamn (används av klipp och film)
  LUP.badge = function (brand) {
    const badge = U.el('div', 'badge');
    const wm = U.wordmark(34, brand); wm._letters.forEach((l) => (l.style.opacity = 1));
    badge.append(wm, U.el('div', 'sep'), U.el('div', 'ep', brand.seriesName));
    return badge;
  };

  // Outro: wordmark byggs upp, accentlinje, tagline, CTA-fråga, handling, URL, bolag. Identisk layout varje gång.
  LUP.outro = function (layer, brand, cta) {
    const wrap = U.css(U.el('div'), { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '22px' });
    const wm = U.wordmark(120, brand);
    const bar = U.css(U.el('div', 'wm-bar'), { width: '200px' });
    const tag = U.el('div', 'tagline', brand.tagline); tag.style.fontSize = '26px';
    const q = U.el('div', 'cta-question', (cta.question || '').replace(/\*(.+?)\*/g, '<em>$1</em>'));
    U.css(q, { marginTop: cta.question ? '44px' : '0', display: cta.question ? 'block' : 'none' });
    // Omröstning: A/B/C-chips under frågan
    const opts = U.css(U.el('div'), { display: cta.options ? 'flex' : 'none', gap: '16px', marginTop: '6px' });
    const optEls = (cta.options || []).map((o, i) => { const c = U.el('div', 'chip', `<span class="dot" style="background:var(--accent);color:#fff">${'ABC'[i]}</span><span>${o}</span>`); opts.appendChild(c); return c; });
    const pill = U.css(U.el('div', 'cta-pill', `<span>${cta.label}</span>${LUP.icon(cta.icon || 'chat')}`), { marginTop: cta.question ? '10px' : '34px' });
    const url = U.el('div', 'url', cta.url);
    const co = U.css(U.el('div', 'company', brand.company), { marginTop: '30px' });
    wrap.append(wm, bar, tag, q, opts, pill, url, co); layer.append(wrap);
    q.style.width = '900px'; LUP.fitText(q, 900, 2, 44); (LUP._refit = LUP._refit || []).push(() => { q.style.fontSize = ''; LUP.fitText(q, 900, 2, 44); });
    return (l) => {
      U.animateWordmark(wm, l, 0.05, 0.045, 0.5);
      const barP = U.prog(l, 0.55, 0.4, U.easeInOut); bar.style.transform = `scaleX(${barP})`; bar.style.opacity = barP > 0 ? 1 : 0;
      U.enter(tag, U.prog(l, 0.8, 0.4, U.easeOut), { dy: 12 });
      U.enter(q, U.prog(l, 1.15, 0.5, U.easeOut), { dy: 22 });
      optEls.forEach((c, i) => U.enter(c, U.prog(l, 1.5 + i * 0.15, 0.45, U.back), { dy: 0, dx: -20, scale: 0.9 }));
      const pillAt = cta.question ? (cta.options ? 2.05 : 1.75) : 1.2;
      U.enter(pill, U.prog(l, pillAt, 0.6, U.back), { dy: 0, scale: 0.7 });
      U.enter(url, U.prog(l, pillAt + 0.35, 0.45, U.easeOut), { dy: 12 });
      U.enter(co, U.prog(l, pillAt + 0.55, 0.5, U.easeOut), { dy: 10 });
    };
  };

  LUP.init = function (brand, clip, opts = {}) {
    const T = brand.timeline;
    const fps = brand.format.fps;
    const W = brand.format.width, H = brand.format.height;
    const starts = {}; let acc = 0;
    for (const k of Object.keys(T)) { starts[k] = acc; acc += T[k]; }
    const total = acc;
    const IN = 0.4, OUT = 0.3, LAP = 0.2;
    const HERO = { left: 72, top: 320, width: 936, height: 400 };
    const cta = Object.assign({}, brand.cta, clip.cta || {});

    const stage = document.querySelector('.stage');
    stage.innerHTML = '';
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));
    const layer = (name) => { const p = U.el('div', 'phase phase-' + name); stage.appendChild(p); return p; };
    const P = { hook: layer('hook'), problem: layer('problem'), solution: layer('solution'), outro: layer('outro') };

    // ---- Badge från frame 0 ----
    const badge = LUP.badge(brand); stage.appendChild(badge);

    // ---- HOOK (synlig från frame 0) ----
    const hookWrap = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
    const hookIcon = U.css(U.el('div', 'icon-circle', LUP.icon(clip.icon)), { width: '180px', height: '180px', marginBottom: '56px' });
    const hookText = U.el('div', 'hook-text');
    const hookWords = U.words(hookText, clip.hook.text);
    const hookSub = U.el('div', 'hook-sub', clip.hook.sub || '');
    hookWrap.append(hookIcon, hookText, hookSub); P.hook.appendChild(hookWrap);
    hookText.style.width = '936px'; LUP.fitText(hookText, 936, 2, 64);

    // ---- HERO (problem + lösning) ----
    const scene = (clip.scene && LUP.scenes && LUP.scenes[clip.scene]) || null;
    const hero = U.css(U.el('div', 'hero'), { top: HERO.top + 'px', left: HERO.left + 'px', width: HERO.width + 'px', height: HERO.height + 'px', right: 'auto', opacity: 0, visibility: 'hidden' });
    stage.appendChild(hero);
    const heroSeek = scene ? scene.mount(hero, clip, brand) : null;
    if (!heroSeek) hero.remove();
    const hasHero = !!heroSeek;

    // ---- PROBLEM ----
    const probTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', width: '936px', top: '170px' });
    U.words(probTitle, clip.problem.title, 'w'); LUP.fitText(probTitle, 936, 2, 40);
    const probTitleWords = [...probTitle.querySelectorAll('.w')];
    const probChips = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: hasHero ? '850px' : '480px', display: 'flex', flexDirection: 'column', gap: '22px', alignItems: 'flex-start' });
    const chipEls = (clip.problem.pains || []).map((txt) => {
      const c = U.el('div', 'chip');
      c.appendChild(U.el('span', 'dot', LUP.icon('warning')));
      c.appendChild(U.el('span', null, txt));
      probChips.appendChild(c); return c;
    });
    P.problem.append(probTitle, probChips);

    // ---- LÖSNING ----
    const solTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', width: '936px', top: '170px' });
    U.words(solTitle, clip.solution.title, 'w'); LUP.fitText(solTitle, 936, 2, 40);
    const solTitleWords = [...solTitle.querySelectorAll('.w')];
    const flowTop = hasHero ? 800 : 520;
    const flow = U.css(U.el('div', 'flow'), { position: 'absolute', left: '72px', right: '72px', top: flowTop + 'px' });
    const flowGhost = U.el('div', 'flow-line ghost');
    const flowLine = U.el('div', 'flow-line');
    flow.append(flowGhost, flowLine);
    const stepEls = clip.solution.steps.map((s, i) => {
      const st = U.el('div', 'card step');
      st.appendChild(U.el('div', 'num', String(i + 1)));
      st.appendChild(U.el('div', 'ico', LUP.icon(s.icon)));
      st.appendChild(U.el('div', 'label', s.label));
      st.appendChild(U.el('div', 'sub', s.sub || ''));
      flow.appendChild(st); return st;
    });
    const kicker = U.css(U.el('div', 'kicker'), { position: 'absolute', left: '72px', right: '72px', top: flowTop + 316 + 'px', textAlign: 'center' });
    kicker.innerHTML = (clip.solution.kicker || '').replace(/\*(.+?)\*/g, '<em>$1</em>');
    P.solution.append(solTitle, flow, kicker);

    // ---- OUTRO ----
    const outroSeek = LUP.outro(P.outro, brand, cta);

    // ---- Undertexter (standard på) ----
    let cueList = null, cueBox = null, cueEl = null;
    if (opts.captions !== false && LUP.captions) {
      cueList = LUP.captions.cues(brand, clip);
      cueBox = U.el('div', 'captions'); cueEl = U.el('div', 'cue', '');
      cueBox.appendChild(cueEl); stage.appendChild(cueBox);
    }

    const setPhase = (ph, name, t) => {
      const s = Math.max(0, starts[name] - LAP), e = starts[name] + T[name];
      if (LUP._overlay) { const on = name === 'hook'; ph.style.visibility = on ? 'visible' : 'hidden'; ph.style.opacity = on ? 1 : 0; ph.style.transform = 'none'; return on ? t : null; }
      const v = name === 'hook' ? 1 - U.prog(t, e - OUT, OUT, U.easeIn) : U.window(t, s, e, IN, name === 'outro' ? 0.001 : OUT);
      const vis = t >= s && t < e + 0.001;
      ph.style.visibility = vis ? 'visible' : 'hidden';
      ph.style.opacity = vis ? v : 0;
      ph.style.transform = name === 'hook' ? 'none' : `translateY(${(1 - U.prog(t, s, IN, U.easeOut)) * 30}px)`;
      return vis ? t - starts[name] : null;
    };

    function seek(frame) {
      LUP._lastFrame = frame;
      const t = frame / fps;
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      blobs[2].style.transform = `translate(${Math.sin(t * 0.3) * 18}px, ${Math.cos(t * 0.26) * 16}px)`;
      badge.style.opacity = 1 - U.prog(t, starts.outro - 0.3, 0.3);

      // HOOK: allt synligt från frame 0, med en liten "landning"
      let l = setPhase(P.hook, 'hook', t);
      if (l !== null) {
        const settle = U.prog(l, 0, 0.6, U.easeOut);
        hookIcon.style.transform = `scale(${U.lerp(0.86, 1, U.back(settle))})`; hookIcon.style.opacity = 1;
        hookWords.forEach((w, i) => { const p = U.prog(l, i * 0.04, 0.45, U.easeOut); w.style.opacity = 1; w.style.transform = `translateY(${(1 - p) * 10}px)`; });
        U.enter(hookSub, U.prog(l, 0.35, 0.45, U.easeOut), { dy: 14 });
      }

      // HERO
      if (hasHero && !LUP._overlay) {
        const hs = starts.problem - LAP, he = starts.solution + T.solution;
        const vis = t >= hs && t < he;
        hero.style.visibility = vis ? 'visible' : 'hidden';
        hero.style.opacity = U.window(t, hs, he, IN, OUT);
        hero.style.transform = `translateY(${(1 - U.prog(t, hs, IN, U.easeOut)) * 30}px)`;
        if (vis) {
          const inSol = t >= starts.solution;
          heroSeek({ t: t - starts.problem, phase: inSol ? 'solution' : 'problem', l: inSol ? t - starts.solution : t - starts.problem, p: U.prog(t, starts.solution - 0.1, 0.9, U.easeInOut), P: T.problem, S: T.solution });
        }
      }

      // PROBLEM
      l = setPhase(P.problem, 'problem', t);
      if (l !== null) {
        probTitleWords.forEach((w, i) => U.enter(w, U.prog(l, 0.1 + i * 0.06, 0.45, U.easeOut), { dy: 24 }));
        const chipStart = hasHero ? 1.5 : 0.8;
        chipEls.forEach((c, i) => U.enter(c, U.prog(l, chipStart + i * 0.35, 0.5, U.back), { dy: 0, dx: -40, scale: 0.9 }));
      }

      // LÖSNING
      l = setPhase(P.solution, 'solution', t);
      if (l !== null) {
        solTitleWords.forEach((w, i) => U.enter(w, U.prog(l, 0.1 + i * 0.06, 0.45, U.easeOut), { dy: 24 }));
        const f0 = hasHero ? 1.2 : 0.6;
        flowGhost.style.opacity = U.prog(l, f0, 0.3);
        flowLine.style.transform = `scaleX(${U.prog(l, f0 + 0.2, 1.2, U.easeInOut)})`;
        stepEls.forEach((s, i) => U.enter(s, U.prog(l, f0 + 0.25 + i * 0.45, 0.6, U.back), { dy: 36, scale: 0.92 }));
        U.enter(kicker, U.prog(l, f0 + 1.9, 0.6, U.easeOut), { dy: 22 });
      }

      // OUTRO
      l = setPhase(P.outro, 'outro', t);
      if (l !== null) outroSeek(l);

      // UNDERTEXTER
      if (cueList) {
        const c = cueList.find((q) => t >= q.start && t < q.end);
        if (c) { if (cueEl.textContent !== c.text) cueEl.textContent = c.text; cueBox.style.opacity = Math.min(U.prog(t, c.start, 0.15), 1 - U.prog(t, c.end - 0.15, 0.15)); }
        else cueBox.style.opacity = 0;
      }
    }

    LUP.timeline = { starts, durations: T, total, fps, frames: Math.round(total * fps) };
    window.__seek = seek;
    window.__setRenderMode = () => document.body.classList.add('render');
    // Overlay: bara badge + hook på transparent bakgrund (läggs ovanpå egen film i klippprogram)
    window.__setOverlayMode = (variant) => { LUP._overlay = true; document.body.classList.add('render', 'overlay'); if (variant === 'light') document.body.classList.add('overlay-light'); if (cueBox) cueBox.style.display = 'none'; blobs.forEach((b) => (b.style.display = 'none')); if (hasHero) hero.style.display = 'none'; seek(LUP._lastFrame || 0); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { [hookText, probTitle, solTitle].forEach((e) => { e.style.fontSize = ''; }); LUP.fitText(hookText, 936, 2, 64); LUP.fitText(probTitle, 936, 2, 40); LUP.fitText(solTitle, 936, 2, 40); (LUP._refit || []).forEach((f) => f()); if (LUP._lastFrame != null) seek(LUP._lastFrame); });
    seek(0);
    return LUP.timeline;
  };
})();
