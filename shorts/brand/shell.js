/* LUPNUMBER shorts – LÅST MALL.
   Intro (wordmark byggs upp och morfar in i badgen) → Hook → Problem → Lösning → Outro.
   Problem och lösning delar EN hero-visual ("samma kamera") som tonar från grått till sky.
   Ett klipp byter bara text + ikon + (valfri) scenvisual. Rör inte tider/layout här per klipp. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;

  LUP.init = function (brand, clip, opts = {}) {
    const T = brand.timeline;
    const fps = brand.format.fps;
    const W = brand.format.width, H = brand.format.height;
    const starts = {}; let acc = 0;
    for (const k of ['intro', 'hook', 'problem', 'solution', 'outro']) { starts[k] = acc; acc += T[k]; }
    const total = acc;
    const IN = 0.4, OUT = 0.3; // fasövergång (sek)
    const HERO = { left: 72, top: 320, width: 936, height: 400 };
    const BADGE = { left: 72, top: 64, size: 34 };
    const INTRO_WM = 132;

    const stage = document.querySelector('.stage');
    stage.innerHTML = '';
    stage.style.width = W + 'px'; stage.style.height = H + 'px';

    // ---- Bakgrund ----
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));

    const layer = (name) => { const p = U.el('div', 'phase phase-' + name); stage.appendChild(p); return p; };
    const P = { hook: layer('hook'), problem: layer('problem'), solution: layer('solution'), outro: layer('outro') };
    const introLayer = layer('intro');

    // ---- INTRO: accentlinje + tagline (wordmarken ligger i ett eget lager som morfar till badgen) ----
    const introBar = U.css(U.el('div', 'wm-bar'), { position: 'absolute', width: '220px', left: (W - 220) / 2 + 'px' });
    const introTag = U.css(U.el('div', 'tagline', brand.tagline), { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: '30px' });
    introLayer.append(introBar, introTag);

    // ---- Wordmark-lager (intro → badge) ----
    const wmLayer = U.el('div', 'wm-layer');
    const wm = U.wordmark(INTRO_WM, brand);
    wmLayer.appendChild(wm);
    stage.appendChild(wmLayer);
    const badge = U.el('div', 'badge');
    const badgeSep = U.el('div', 'sep');
    const badgeEp = U.el('div', 'ep', `${brand.seriesLabel} ${String(clip.episode).padStart(2, '0')}`);
    badge.append(badgeSep, badgeEp);
    stage.appendChild(badge);
    const geo = { wmW: 0, wmH: 0, x0: 0, y0: 0, scale: BADGE.size / INTRO_WM };
    const layout = () => {
      wmLayer.style.transform = 'none';
      geo.wmW = wm.offsetWidth; geo.wmH = wm.offsetHeight;
      geo.x0 = (W - geo.wmW) / 2; geo.y0 = H / 2 - geo.wmH / 2 - 60;
      introBar.style.top = geo.y0 + geo.wmH + 28 + 'px';
      introTag.style.top = geo.y0 + geo.wmH + 66 + 'px';
      const smallH = geo.wmH * geo.scale, smallW = geo.wmW * geo.scale;
      badge.style.left = BADGE.left + smallW + 18 + 'px';
      badge.style.top = BADGE.top + (smallH - 26) / 2 + 'px';
    };
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); if (LUP._lastFrame != null) seek(LUP._lastFrame); });

    // ---- HOOK ----
    const hookWrap = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
    const hookIcon = U.css(U.el('div', 'icon-circle', LUP.icon(clip.icon)), { width: '180px', height: '180px', marginBottom: '56px' });
    const hookText = U.el('div', 'hook-text');
    const hookWords = U.words(hookText, clip.hook.text);
    const hookSub = U.el('div', 'hook-sub', clip.hook.sub || '');
    hookWrap.append(hookIcon, hookText, hookSub); P.hook.appendChild(hookWrap);

    // ---- HERO (delas av problem + lösning) ----
    const scene = (clip.scene && LUP.scenes && LUP.scenes[clip.scene]) || null;
    const hero = U.css(U.el('div', 'hero'), { top: HERO.top + 'px', left: HERO.left + 'px', width: HERO.width + 'px', height: HERO.height + 'px', right: 'auto', opacity: 0, visibility: 'hidden' });
    stage.appendChild(hero);
    const heroSeek = scene ? scene.mount(hero, clip, brand) : null;
    if (!heroSeek) hero.remove();
    const hasHero = !!heroSeek;

    // ---- PROBLEM ----
    const probTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', right: '72px', top: '170px' });
    U.words(probTitle, clip.problem.title, 'w');
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
    const solTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', right: '72px', top: '170px' });
    U.words(solTitle, clip.solution.title, 'w');
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

    // ---- OUTRO (identisk varje gång) ----
    const outWrap = U.css(U.el('div'), { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '26px' });
    const outWm = U.wordmark(120, brand);
    const outTag = U.el('div', 'tagline', brand.tagline); outTag.style.fontSize = '26px';
    const outCta = U.css(U.el('div', 'cta-pill', `<span>${brand.cta.label}</span>${LUP.icon('arrow')}`), { marginTop: '34px' });
    const outUrl = U.el('div', 'url', brand.cta.url);
    const outCo = U.css(U.el('div', 'company', brand.company), { position: 'absolute', bottom: '72px', left: 0, right: 0, textAlign: 'center' });
    outWrap.append(outWm, outTag, outCta, outUrl); P.outro.append(outWrap, outCo);

    // ---- Undertexter (valfritt) ----
    let cueList = null, cueBox = null, cueEl = null;
    if (opts.captions && LUP.captions) {
      cueList = LUP.captions.cues(brand, clip);
      cueBox = U.el('div', 'captions'); cueEl = U.el('div', 'cue', '');
      cueBox.appendChild(cueEl); stage.appendChild(cueBox);
    }

    // ---- Per-frame ----
    // Faserna överlappar med LAP sekunder så att nästa fas börjar tona in innan den förra är helt borta (inget tomt hål).
    const LAP = 0.2;
    const setPhase = (ph, name, t) => {
      const s = starts[name] - (name === 'intro' ? 0 : LAP), e = starts[name] + T[name];
      const v = U.window(t, s, e, IN, OUT);
      const vis = t >= s && t < e + 0.001;
      ph.style.visibility = vis ? 'visible' : 'hidden';
      ph.style.opacity = vis ? v : 0;
      ph.style.transform = `translateY(${(1 - U.prog(t, s, IN, U.easeOut)) * 30}px)`;
      return vis ? t - starts[name] : null; // l kan vara svagt negativt under överlappet; prog() klampar till 0
    };

    function seek(frame) {
      LUP._lastFrame = frame;
      const t = frame / fps;
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      blobs[2].style.transform = `translate(${Math.sin(t * 0.3) * 18}px, ${Math.cos(t * 0.26) * 16}px)`;

      // Wordmark: byggs upp, morfar till badge-position, tonar ut vid outro
      U.animateWordmark(wm, t, 0.15, 0.06, 0.5);
      const m = U.prog(t, T.intro - 0.55, 0.7, U.easeInOut);
      const sc = U.lerp(1, geo.scale, m);
      wmLayer.style.transform = `translate(${U.lerp(geo.x0, BADGE.left, m)}px, ${U.lerp(geo.y0, BADGE.top, m)}px) scale(${sc})`;
      wmLayer.style.opacity = 1 - U.prog(t, starts.outro - 0.3, 0.3);
      // Badge-sep + avsnitt: in när morfen landat
      const bp = U.prog(t, T.intro + 0.05, 0.4, U.easeOut);
      badge.style.opacity = Math.min(bp, 1 - U.prog(t, starts.outro - 0.3, 0.3));
      badge.style.transform = `translateX(${(1 - bp) * -16}px)`;

      // INTRO (bar + tagline)
      let l = setPhase(introLayer, 'intro', t);
      if (l !== null) {
        const barP = U.prog(l, 0.8, 0.45, U.easeInOut);
        introBar.style.transform = `scaleX(${barP})`;
        const outP = U.prog(l, T.intro - 0.6, 0.3, U.easeIn);
        introBar.style.opacity = (barP > 0 ? 1 : 0) * (1 - outP);
        U.enter(introTag, U.prog(l, 0.95, 0.45, U.easeOut), { dy: 14 });
        introTag.style.opacity = U.prog(l, 0.95, 0.45) * (1 - outP);
      }

      // HOOK
      l = setPhase(P.hook, 'hook', t);
      if (l !== null) {
        U.enter(hookIcon, U.prog(l, 0.1, 0.6, U.back), { dy: 0, scale: 0.4 });
        hookWords.forEach((w, i) => U.enter(w, U.prog(l, 0.3 + i * 0.09, 0.5, U.easeOut), { dy: 40 }));
        U.enter(hookSub, U.prog(l, 0.3 + hookWords.length * 0.09 + 0.25, 0.5, U.easeOut), { dy: 18 });
      }

      // HERO (problem + lösning, samma kamera)
      if (hasHero) {
        const hs = starts.problem - LAP, he = starts.solution + T.solution;
        const vis = t >= hs && t < he;
        hero.style.visibility = vis ? 'visible' : 'hidden';
        hero.style.opacity = U.window(t, hs, he, IN, OUT);
        hero.style.transform = `translateY(${(1 - U.prog(t, hs, IN, U.easeOut)) * 30}px)`;
        if (vis) {
          const inSol = t >= starts.solution;
          heroSeek({
            t: t - starts.problem,                       // sek sedan problemfasen började (svagt negativt under intoningen)
            phase: inSol ? 'solution' : 'problem',
            l: inSol ? t - starts.solution : t - starts.problem, // sek in i aktuell fas
            p: U.prog(t, starts.solution - 0.1, 0.9, U.easeInOut), // 0 = problem (grått), 1 = lösning (sky)
            P: T.problem, S: T.solution,
          });
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
      if (l !== null) {
        U.animateWordmark(outWm, l, 0.1, 0.045, 0.5);
        U.enter(outTag, U.prog(l, 0.6, 0.45, U.easeOut), { dy: 14 });
        U.enter(outCta, U.prog(l, 0.95, 0.6, U.back), { dy: 0, scale: 0.7 });
        U.enter(outUrl, U.prog(l, 1.3, 0.45, U.easeOut), { dy: 14 });
        U.enter(outCo, U.prog(l, 1.6, 0.5, U.easeOut), { dy: 10 });
      }

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
    seek(0);
    return LUP.timeline;
  };
})();
