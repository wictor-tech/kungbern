/* LUPNUMBER shorts – LÅST MALL.
   Intro (wordmark byggs upp) → Hook → Problem → Lösning → Outro.
   Ett klipp byter bara text + ikon + (valfri) scenvisual. Rör inte tider/layout här per klipp. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;

  LUP.init = function (brand, clip) {
    const T = brand.timeline;
    const fps = brand.format.fps;
    const starts = {};
    let acc = 0;
    for (const k of ['intro', 'hook', 'problem', 'solution', 'outro']) { starts[k] = acc; acc += T[k]; }
    const total = acc;
    const IN = 0.4, OUT = 0.3; // fas-övergång (sek)

    const stage = document.querySelector('.stage');
    stage.innerHTML = '';
    stage.style.width = brand.format.width + 'px';
    stage.style.height = brand.format.height + 'px';

    // ---- Bakgrund ----
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));

    const phase = (name) => { const p = U.el('div', 'phase phase-' + name); stage.appendChild(p); return p; };
    const P = { intro: phase('intro'), hook: phase('hook'), problem: phase('problem'), solution: phase('solution'), outro: phase('outro') };

    // ---- Badge (liten wordmark + avsnittsnummer) – syns under hook/problem/lösning ----
    const badge = U.el('div', 'badge');
    const bwm = U.wordmark(34, brand); bwm._letters.forEach((l) => (l.style.opacity = 1));
    badge.appendChild(bwm);
    badge.appendChild(U.el('div', 'sep'));
    badge.appendChild(U.el('div', 'ep', `${brand.seriesLabel} ${String(clip.episode).padStart(2, '0')}`));
    stage.appendChild(badge);

    // ---- INTRO ----
    const introWrap = U.css(U.el('div'), { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '30px' });
    const introWm = U.wordmark(132, brand);
    const introBar = U.css(U.el('div', 'wm-bar'), { width: '220px' });
    const introTag = U.el('div', 'tagline', brand.tagline); introTag.style.fontSize = '30px';
    introWrap.append(introWm, introBar, introTag); P.intro.appendChild(introWrap);

    // ---- HOOK ----
    const hookWrap = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: '0', bottom: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
    const hookIcon = U.css(U.el('div', 'icon-circle', LUP.icon(clip.icon)), { width: '180px', height: '180px', marginBottom: '56px' });
    const hookText = U.el('div', 'hook-text');
    const hookWords = U.words(hookText, clip.hook.text);
    const hookSub = U.el('div', 'hook-sub', clip.hook.sub || '');
    hookWrap.append(hookIcon, hookText, hookSub); P.hook.appendChild(hookWrap);

    // ---- PROBLEM ----
    const scene = (clip.scene && LUP.scenes && LUP.scenes[clip.scene]) || null;
    const probTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', right: '72px', top: '170px' });
    U.words(probTitle, clip.problem.title, 'w');
    const probTitleWords = [...probTitle.querySelectorAll('.w')];
    const probHero = U.css(U.el('div', 'hero'), { top: '340px', height: '460px' });
    const probChips = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: scene ? '880px' : '480px', display: 'flex', flexDirection: 'column', gap: '22px', alignItems: 'flex-start' });
    const chipEls = (clip.problem.pains || []).map((txt) => {
      const c = U.el('div', 'chip');
      c.appendChild(U.el('span', 'dot', LUP.icon('warning')));
      c.appendChild(U.el('span', null, txt));
      probChips.appendChild(c); return c;
    });
    P.problem.append(probTitle, probHero, probChips);
    const probSeek = scene && scene.problem ? scene.problem.mount(probHero, clip, brand) : null;
    if (!probSeek) probHero.remove();

    // ---- LÖSNING ----
    const solTitle = U.css(U.el('div', 'h1'), { position: 'absolute', left: '72px', right: '72px', top: '170px' });
    U.words(solTitle, clip.solution.title, 'w');
    const solTitleWords = [...solTitle.querySelectorAll('.w')];
    const solHero = U.css(U.el('div', 'hero'), { top: '300px', height: '400px' });
    const flowTop = scene ? 770 : 520;
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
    const kicker = U.css(U.el('div', 'kicker'), { position: 'absolute', left: '72px', right: '72px', top: flowTop + 320 + 'px', textAlign: 'center' });
    kicker.innerHTML = (clip.solution.kicker || '').replace(/\*(.+?)\*/g, '<em>$1</em>');
    P.solution.append(solTitle, solHero, flow, kicker);
    const solSeek = scene && scene.solution ? scene.solution.mount(solHero, clip, brand) : null;
    if (!solSeek) solHero.remove();

    // ---- OUTRO ----
    const outWrap = U.css(U.el('div'), { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '26px' });
    const outWm = U.wordmark(120, brand);
    const outTag = U.el('div', 'tagline', brand.tagline); outTag.style.fontSize = '26px';
    const outCta = U.css(U.el('div', 'cta-pill', `<span>${brand.cta.label}</span>${LUP.icon('arrow')}`), { marginTop: '34px' });
    const outUrl = U.el('div', 'url', brand.cta.url);
    const outCo = U.css(U.el('div', 'company', brand.company), { position: 'absolute', bottom: '72px', left: 0, right: 0, textAlign: 'center' });
    outWrap.append(outWm, outTag, outCta, outUrl); P.outro.append(outWrap, outCo);

    // ---- Per-frame uppdatering ----
    const setPhase = (ph, name, t) => {
      const s = starts[name], e = s + T[name];
      const v = U.window(t, s, e, IN, OUT);
      const vis = t >= s && t < e + 0.001;
      ph.style.visibility = vis ? 'visible' : 'hidden';
      ph.style.opacity = vis ? v : 0;
      const dy = (1 - U.prog(t, s, IN, U.easeOut)) * 30;
      ph.style.transform = `translateY(${dy}px)`;
      return vis ? t - s : -1;
    };

    function seek(frame) {
      const t = frame / fps;
      // bakgrund: långsam drift
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      blobs[2].style.transform = `translate(${Math.sin(t * 0.3) * 18}px, ${Math.cos(t * 0.26) * 16}px)`;

      // badge
      const bs = starts.hook, be = starts.outro;
      badge.style.opacity = U.window(t, bs, be, 0.5, 0.3);

      // INTRO
      let l = setPhase(P.intro, 'intro', t);
      if (l >= 0) {
        U.animateWordmark(introWm, l, 0.25, 0.075, 0.55);
        const barP = U.prog(l, 1.15, 0.55, U.easeInOut);
        introBar.style.transform = `scaleX(${barP})`; introBar.style.opacity = barP > 0 ? 1 : 0;
        U.enter(introTag, U.prog(l, 1.55, 0.5, U.easeOut), { dy: 16 });
        const outP = U.prog(l, T.intro - 0.35, 0.35, U.easeIn);
        introWrap.style.transform = `scale(${U.lerp(1, 0.94, outP)})`;
      }

      // HOOK
      l = setPhase(P.hook, 'hook', t);
      if (l >= 0) {
        U.enter(hookIcon, U.prog(l, 0.05, 0.6, U.back), { dy: 0, scale: 0.4 });
        hookWords.forEach((w, i) => U.enter(w, U.prog(l, 0.3 + i * 0.09, 0.5, U.easeOut), { dy: 40 }));
        U.enter(hookSub, U.prog(l, 0.3 + hookWords.length * 0.09 + 0.25, 0.5, U.easeOut), { dy: 18 });
      }

      // PROBLEM
      l = setPhase(P.problem, 'problem', t);
      if (l >= 0) {
        probTitleWords.forEach((w, i) => U.enter(w, U.prog(l, 0.1 + i * 0.06, 0.45, U.easeOut), { dy: 24 }));
        if (probSeek) probSeek(l, t);
        const chipStart = probSeek ? 1.9 : 1.0;
        chipEls.forEach((c, i) => U.enter(c, U.prog(l, chipStart + i * 0.38, 0.5, U.back), { dy: 0, dx: -40, scale: 0.9 }));
      }

      // LÖSNING
      l = setPhase(P.solution, 'solution', t);
      if (l >= 0) {
        solTitleWords.forEach((w, i) => U.enter(w, U.prog(l, 0.1 + i * 0.06, 0.45, U.easeOut), { dy: 24 }));
        if (solSeek) solSeek(l, t);
        const f0 = solSeek ? 1.4 : 0.6;
        flowGhost.style.opacity = U.prog(l, f0, 0.3);
        flowLine.style.transform = `scaleX(${U.prog(l, f0 + 0.2, 1.4, U.easeInOut)})`;
        stepEls.forEach((s, i) => U.enter(s, U.prog(l, f0 + 0.25 + i * 0.5, 0.6, U.back), { dy: 36, scale: 0.92 }));
        U.enter(kicker, U.prog(l, f0 + 2.1, 0.6, U.easeOut), { dy: 22 });
      }

      // OUTRO
      l = setPhase(P.outro, 'outro', t);
      if (l >= 0) {
        U.animateWordmark(outWm, l, 0.1, 0.045, 0.5);
        U.enter(outTag, U.prog(l, 0.6, 0.45, U.easeOut), { dy: 14 });
        U.enter(outCta, U.prog(l, 0.95, 0.6, U.back), { dy: 0, scale: 0.7 });
        U.enter(outUrl, U.prog(l, 1.3, 0.45, U.easeOut), { dy: 14 });
        U.enter(outCo, U.prog(l, 1.6, 0.5, U.easeOut), { dy: 10 });
      }
    }

    LUP.timeline = { starts, durations: T, total, fps, frames: Math.round(total * fps) };
    window.__seek = seek;
    window.__setRenderMode = () => document.body.classList.add('render');
    seek(0);
    return LUP.timeline;
  };
})();
