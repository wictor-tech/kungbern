/* LUPNUMBER flödesfilm – LÅST MALL.
   Hook (frame 0) → N steg i sitens flöde, varje steg med samma scen två gånger:
   överst "IDAG" (problemläget, grått) och nederst "MED LUPNUMBER" (lösningsläget, sky) → Outro. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;

  LUP.initFilm = function (brand, film, opts = {}) {
    const fps = brand.format.fps;
    const W = brand.format.width, H = brand.format.height;
    const HOOK = film.hookDuration || 2.5, OUTRO = brand.timeline.outro || 4.0;
    const segs = film.segments.map((sg) => ({ ...sg, duration: sg.duration || film.segmentDuration || 6.5 }));
    const starts = { hook: 0, segments: [], outro: 0 };
    let acc = HOOK; segs.forEach((sg) => { starts.segments.push(acc); acc += sg.duration; });
    starts.outro = acc; const total = acc + OUTRO;
    const IN = 0.4, OUT = 0.3, LAP = 0.2;
    const cta = Object.assign({}, brand.cta, film.cta || {});
    const STAG = film.stagger ?? 2.0; // sekunder som "idag" spelar ensam innan LUPNUMBER-panelen glider in
    const PANEL = { top: 238, hTop: 430, hBot: 530, gap: 20 };
    const scaleFor = (h) => (h - 24 - 44 - 8 - 10 - 40 - 20) / 400;

    const stage = document.querySelector('.stage');
    stage.innerHTML = '';
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));
    const layer = (name) => { const p = U.el('div', 'phase phase-' + name); stage.appendChild(p); return p; };
    const hookLayer = layer('hook'), flowLayer = layer('flow'), outroLayer = layer('outro');
    const badge = LUP.badge(brand); stage.appendChild(badge);

    // ---- HOOK (frame 0) ----
    const hookWrap = U.css(U.el('div'), { position: 'absolute', left: '72px', right: '72px', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });
    const hookIcon = U.css(U.el('div', 'icon-circle', LUP.icon(film.icon || 'truck')), { width: '180px', height: '180px', marginBottom: '56px' });
    const hookText = U.el('div', 'hook-text'); const hookWords = U.words(hookText, film.hook.text);
    const hookSub = U.el('div', 'hook-sub', film.hook.sub || '');
    hookWrap.append(hookIcon, hookText, hookSub); hookLayer.appendChild(hookWrap);
    hookText.style.width = '936px'; LUP.fitText(hookText, 936, 2, 64);

    // ---- STEPPER + steglabel ----
    const stepper = U.css(U.el('div', 'stepper'), { top: '124px' });
    stepper.append(U.el('div', 'track'), U.el('div', 'fill'));
    const dots = segs.map((_, i) => { const d = U.el('div', 'dot', String(i + 1)); stepper.appendChild(d); return d; });
    U.css(stepper, { justifyContent: 'space-between' });
    const stepLabel = U.css(U.el('div', 'step-label'), { top: '178px' });
    flowLayer.append(stepper, stepLabel);

    // ---- PANELER ----
    const mkPanel = (cls, tag, top, h) => {
      const p = U.css(U.el('div', 'panel ' + cls), { top: top + 'px', height: h + 'px' });
      p.appendChild(U.el('div', 'tag', tag));
      const line = U.el('div', 'line', '');
      p.appendChild(line);
      return { el: p, line, slots: [], _scale: scaleFor(h) };
    };
    const topP = mkPanel('today', film.labels?.today || 'Idag', PANEL.top, PANEL.hTop);
    const botP = mkPanel('lup', film.labels?.lup || 'Med ' + brand.product, PANEL.top + PANEL.hTop + PANEL.gap, PANEL.hBot);
    flowLayer.append(topP.el, botP.el);
    const seeks = segs.map((sg) => {
      const scene = LUP.scenes && LUP.scenes[sg.scene];
      const mk = (panel) => {
        const slot = U.el('div', 'hero-slot');
        slot.style.transform = `translateX(-50%) scale(${panel._scale})`;
        const hero = U.css(U.el('div', 'hero'), { left: 0, top: 0, width: '936px', height: '400px', right: 'auto' });
        slot.appendChild(hero); panel.el.appendChild(slot); panel.slots.push(slot);
        return { slot, seek: scene ? scene.mount(hero, sg, brand) : null };
      };
      return { top: mk(topP), bot: mk(botP) };
    });

    // ---- OUTRO ----
    const outroSeek = LUP.outro(outroLayer, brand, cta);

    // ---- Undertexter ----
    let cueList = null, cueBox = null, cueEl = null;
    if (opts.captions !== false && LUP.captions) {
      const beats = [{ key: 'hook', start: 0, end: HOOK, text: film.voiceover?.hook }];
      segs.forEach((sg, i) => beats.push({ key: 'seg' + i, start: starts.segments[i], end: starts.segments[i] + sg.duration, text: sg.voiceover }));
      beats.push({ key: 'outro', start: starts.outro, end: total, text: film.voiceover?.outro });
      cueList = LUP.captions.cuesFromBeats(beats, brand.captions);
      cueBox = U.css(U.el('div', 'captions'), { top: PANEL.top + PANEL.hTop + PANEL.hBot + PANEL.gap + 16 + 'px' });
      cueEl = U.el('div', 'cue', ''); cueEl.style.fontSize = '27px'; cueEl.style.padding = '10px 24px';
      cueBox.appendChild(cueEl); stage.appendChild(cueBox);
    }

    const setLayer = (ph, s, e, t, hard) => {
      const v = hard ? 1 - U.prog(t, e - OUT, OUT, U.easeIn) : U.window(t, s, e, IN, ph === outroLayer ? 0.001 : OUT);
      const vis = t >= s && t < e + 0.001;
      ph.style.visibility = vis ? 'visible' : 'hidden';
      ph.style.opacity = vis ? v : 0;
      ph.style.transform = hard ? 'none' : `translateY(${(1 - U.prog(t, s, IN, U.easeOut)) * 30}px)`;
      return vis;
    };

    let currentIdx = -1;
    function seek(frame) {
      LUP._lastFrame = frame;
      const t = frame / fps;
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      blobs[2].style.transform = `translate(${Math.sin(t * 0.3) * 18}px, ${Math.cos(t * 0.26) * 16}px)`;
      badge.style.opacity = 1 - U.prog(t, starts.outro - 0.3, 0.3);

      // HOOK
      if (setLayer(hookLayer, 0, HOOK, t, true)) {
        const l = t; const settle = U.prog(l, 0, 0.6, U.easeOut);
        hookIcon.style.transform = `scale(${U.lerp(0.86, 1, U.back(settle))})`;
        hookWords.forEach((w, i) => { const p = U.prog(l, i * 0.04, 0.45, U.easeOut); w.style.opacity = 1; w.style.transform = `translateY(${(1 - p) * 10}px)`; });
        U.enter(hookSub, U.prog(l, 0.35, 0.45, U.easeOut), { dy: 14 });
      }

      // FLÖDE
      const fs0 = starts.segments[0] - LAP, fe = starts.outro;
      if (setLayer(flowLayer, fs0, fe, t, false)) {
        // vilket steg?
        let idx = 0; for (let i = 0; i < segs.length; i++) if (t >= starts.segments[i] - LAP) idx = i;
        const sg = segs[idx], s0 = starts.segments[idx], local = U.clamp((t - s0) / sg.duration, 0, 1);
        const fill = segs.length > 1 ? (idx + U.prog(t, s0 + sg.duration - 0.6, 0.6, U.easeInOut)) / (segs.length - 1) : 1;
        stepper.querySelector('.fill').style.width = `calc((100% - 40px) * ${Math.min(fill, 1)})`;
        dots.forEach((d, i) => { d.className = 'dot' + (i < idx ? ' done' : i === idx ? ' now' : ''); });
        if (currentIdx !== idx) { currentIdx = idx; stepLabel.textContent = sg.label; topP.line.innerHTML = sg.today; botP.line.innerHTML = sg.lup.replace(/\*(.+?)\*/g, '<em style="font-style:normal;color:var(--accent)">$1</em>'); }
        const lp = U.prog(t, s0 - LAP + 0.1, 0.45, U.easeOut) * (1 - U.prog(t, s0 + sg.duration - 0.3, 0.3, U.easeIn));
        [stepLabel, topP.line].forEach((e, k) => { e.style.opacity = lp; e.style.transform = `translateY(${(1 - lp) * (k ? 10 : -10)}px)`; });
        // LUPNUMBER-panelen kommer in efter STAG sekunder och "löser" bilden ovanför
        const bp = U.prog(t, s0 + STAG, 0.55, U.easeOut) * (1 - U.prog(t, s0 + sg.duration - 0.3, 0.3, U.easeIn));
        botP.el.style.opacity = bp; botP.el.style.transform = `translateY(${(1 - bp) * 60}px)`;
        botP.line.style.opacity = U.prog(t, s0 + STAG + 0.3, 0.4, U.easeOut);
        seeks.forEach((pair, i) => {
          const si = starts.segments[i], ei = si + segs[i].duration;
          const vis = t >= si - LAP && t < ei + 0.001;
          const o = vis ? U.window(t, si - LAP, ei, IN, OUT) : 0;
          [pair.top, pair.bot].forEach((h) => { h.slot.style.visibility = vis ? 'visible' : 'hidden'; h.slot.style.opacity = o; });
          if (!vis) return;
          const lt = Math.max(0, t - si), lb = Math.max(0, lt - STAG), dur = segs[i].duration;
          if (pair.top.seek) pair.top.seek({ t: lt, l: lt, phase: 'problem', p: 0, P: dur, S: dur });
          if (pair.bot.seek) pair.bot.seek({ t: lb, l: lb, phase: 'solution', p: 1, P: dur - STAG, S: dur - STAG });
        });
      }

      // OUTRO
      if (setLayer(outroLayer, starts.outro - LAP, total, t, false)) outroSeek(t - starts.outro);

      if (cueList) {
        const c = cueList.find((q) => t >= q.start && t < q.end);
        if (c) { if (cueEl.textContent !== c.text) cueEl.textContent = c.text; cueBox.style.opacity = Math.min(U.prog(t, c.start, 0.15), 1 - U.prog(t, c.end - 0.15, 0.15)); }
        else cueBox.style.opacity = 0;
      }
    }

    LUP.timeline = { starts, total, fps, frames: Math.round(total * fps), segments: segs.map((sg, i) => ({ label: sg.label, start: starts.segments[i], end: starts.segments[i] + sg.duration })) };
    window.__seek = seek;
    window.__setRenderMode = () => document.body.classList.add('render');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { hookText.style.fontSize = ''; LUP.fitText(hookText, 936, 2, 64); (LUP._refit || []).forEach((f) => f()); if (LUP._lastFrame != null) seek(LUP._lastFrame); });
    seek(0);
    return LUP.timeline;
  };
})();
