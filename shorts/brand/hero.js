/* LUPNUMBER hero-film "LupnumberSiteDay" – en sammanhängande värld (sidovy), en lastbil (ABC 123), kamera som rör sig,
   telefon-närbilder för den digitala delen och en operatörsvy. Beats (längder) kommer från films/*.json så att samma
   mall bygger både 60-sekundersfilmen och 25-sekundersklippet. Allt är tidsstyrt (deterministiskt per frame). */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;
  const C = { muted: '#64748B', accent: '#0EA5E9', heading: '#0C4A6E', border: '#BAE6FD', tint: '#E0F2FE', tint2: '#F0F9FF', tint3: '#ECFDF5', card: '#FFFFFF', text: '#334155', bg: '#F5FAFE', grey: '#94A3B8', greyLight: '#CBD5E1' };
  const FONT = 'Inter, system-ui, sans-serif';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const NS = 'http://www.w3.org/2000/svg';
  const add = (parent, str) => { parent.insertAdjacentHTML('beforeend', str); return parent.lastElementChild; };
  const tr = (el, x, y, s = 1, r = 0) => el.setAttribute('transform', `translate(${x} ${y}) rotate(${r}) scale(${s})`);

  // ---------- Världen (enheter = px vid skala 1). Marklinje y=560. ----------
  const WORLD = { w: 3400, h: 700, ground: 560 };
  const GATE_X = 1000, SIGN_X = 1320, DOCKS = [1700, 2080, 2460, 2840], DOCK_W = 240;

  const TRUCK_LEN = 240;
  function truckSvg(id, plate, color) {
    // Dragbil + trailer, 240 enheter lång, framände vid x=240, hjul på marken (y=0 = mark)
    return `<g class="truck ${id}" style="color:${color}">
      <ellipse cx="120" cy="4" rx="122" ry="8" fill="rgba(12,74,110,0.10)"/>
      <rect x="0" y="-122" width="152" height="96" rx="8" fill="#fff" stroke="currentColor" stroke-width="5"/>
      <rect x="0" y="-122" width="152" height="14" fill="currentColor" opacity=".18"/>
      <text x="76" y="-68" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="27" fill="currentColor" opacity=".92">${esc(plate)}</text>
      <path d="M152 -96 h50 a12 12 0 0 1 11 7 l15 36 v27 h-76z" fill="#fff" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>
      <path d="M162 -88 h34 l12 30 h-46z" fill="currentColor" opacity=".22"/>
      <rect x="152" y="-26" width="76" height="14" rx="3" fill="currentColor" opacity=".9"/>
      <rect x="226" y="-20" width="12" height="10" rx="2" fill="currentColor"/>
      <g fill="#fff" stroke="currentColor" stroke-width="5"><circle cx="34" cy="-14" r="16"/><circle cx="76" cy="-14" r="16"/><circle cx="196" cy="-14" r="16"/></g>
      <g fill="currentColor"><circle cx="34" cy="-14" r="5"/><circle cx="76" cy="-14" r="5"/><circle cx="196" cy="-14" r="5"/></g>
    </g>`;
  }

  function buildWorld(far, near) {
    // Bakre lager (parallax 0.5): byggnader, silos, ljusmaster
    let f = '';
    for (const [x, w, h] of [[-300, 620, 230], [420, 380, 160], [900, 760, 210], [1750, 980, 260], [2800, 640, 190], [3500, 560, 220]])
      f += `<rect x="${x}" y="${WORLD.ground - h}" width="${w}" height="${h}" rx="6" fill="${C.tint2}" stroke="${C.border}" stroke-width="3"/>`;
    for (const x of [1500, 1540, 1580]) f += `<rect x="${x}" y="${WORLD.ground - 320}" width="30" height="320" rx="15" fill="${C.tint}" stroke="${C.border}" stroke-width="3"/>`;
    for (let x = -100; x < 3600; x += 450) f += `<rect x="${x}" y="${WORLD.ground - 300}" width="6" height="300" fill="${C.border}"/><rect x="${x - 22}" y="${WORLD.ground - 306}" width="50" height="10" rx="5" fill="${C.border}"/>`;
    far.innerHTML = `<svg width="${WORLD.w + 800}" height="${WORLD.h}" viewBox="-400 0 ${WORLD.w + 800} ${WORLD.h}" style="overflow:visible">${f}</svg>`;

    // Främre lager: mark, väg, staket, grind, bod, skylt, portar
    let n = '';
    n += `<rect x="-600" y="${WORLD.ground}" width="${WORLD.w + 1400}" height="140" fill="${C.tint2}"/>`;
    n += `<rect x="-600" y="${WORLD.ground - 2}" width="${WORLD.w + 1400}" height="26" fill="${C.border}"/>`;
    n += `<line x1="-600" y1="${WORLD.ground + 11}" x2="${WORLD.w + 800}" y2="${WORLD.ground + 11}" stroke="#fff" stroke-width="5" stroke-dasharray="40 34"/>`;
    // staket på insidan
    for (let x = GATE_X + 60; x < WORLD.w; x += 120) n += `<rect class="w" x="${x}" y="${WORLD.ground - 80}" width="6" height="80" fill="currentColor" opacity=".35"/>`;
    n += `<rect class="w" x="${GATE_X + 60}" y="${WORLD.ground - 76}" width="${WORLD.w - GATE_X}" height="5" fill="currentColor" opacity=".3"/><rect class="w" x="${GATE_X + 60}" y="${WORLD.ground - 40}" width="${WORLD.w - GATE_X}" height="5" fill="currentColor" opacity=".3"/>`;
    // vaktbod
    n += `<g class="w"><rect x="${GATE_X + 40}" y="${WORLD.ground - 200}" width="150" height="200" rx="10" fill="#fff" stroke="currentColor" stroke-width="5"/><rect x="${GATE_X + 60}" y="${WORLD.ground - 176}" width="110" height="70" rx="6" fill="${C.tint}" stroke="currentColor" stroke-width="4"/><rect x="${GATE_X + 20}" y="${WORLD.ground - 214}" width="190" height="16" rx="6" fill="currentColor"/></g>`;
    // grindstolpe + bom (pivot vid stolpens topp)
    n += `<g class="w"><rect x="${GATE_X - 14}" y="${WORLD.ground - 150}" width="28" height="150" rx="6" fill="#fff" stroke="currentColor" stroke-width="5"/>
      <g class="arm" transform-origin="${GATE_X} ${WORLD.ground - 128}"><rect x="${GATE_X - 240}" y="${WORLD.ground - 136}" width="246" height="16" rx="8" fill="#fff" stroke="currentColor" stroke-width="5"/>
      <rect x="${GATE_X - 210}" y="${WORLD.ground - 133}" width="30" height="10" fill="currentColor"/><rect x="${GATE_X - 150}" y="${WORLD.ground - 133}" width="30" height="10" fill="currentColor"/><rect x="${GATE_X - 90}" y="${WORLD.ground - 133}" width="30" height="10" fill="currentColor"/></g>
      <circle cx="${GATE_X}" cy="${WORLD.ground - 128}" r="9" fill="currentColor"/></g>`;
    // stopplinje
    n += `<rect class="w" x="${GATE_X - 262}" y="${WORLD.ground - 2}" width="14" height="26" fill="currentColor" opacity=".6"/>`;
    // skylt i yarden
    n += `<g class="w"><rect x="${SIGN_X}" y="${WORLD.ground - 250}" width="8" height="250" fill="currentColor" opacity=".6"/><rect x="${SIGN_X - 10}" y="${WORLD.ground - 300}" width="240" height="60" rx="10" fill="#fff" stroke="currentColor" stroke-width="4"/><text x="${SIGN_X + 108}" y="${WORLD.ground - 258}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="30" fill="currentColor">PORT 1–4 →</text></g>`;
    // portar: lastkaj med numrerade dörrar
    n += `<rect class="w" x="${DOCKS[0] - 120}" y="${WORLD.ground - 290}" width="${DOCKS[3] - DOCKS[0] + 360}" height="290" rx="8" fill="#fff" stroke="currentColor" stroke-width="5"/>`;
    n += `<rect class="w" x="${DOCKS[0] - 120}" y="${WORLD.ground - 290}" width="${DOCKS[3] - DOCKS[0] + 360}" height="18" fill="currentColor" opacity=".18"/>`;
    DOCKS.forEach((x, i) => {
      n += `<g class="dock dock${i + 1} w"><rect x="${x}" y="${WORLD.ground - 200}" width="${DOCK_W}" height="200" rx="6" fill="${C.tint2}" stroke="currentColor" stroke-width="4"/>
        <rect class="door" x="${x}" y="${WORLD.ground - 200}" width="${DOCK_W}" height="200" rx="6" fill="${C.tint}" stroke="currentColor" stroke-width="4" transform-origin="${x + DOCK_W / 2} ${WORLD.ground - 200}"/>
        <rect x="${x + 60}" y="${WORLD.ground - 254}" width="${DOCK_W - 120}" height="42" rx="21" fill="#fff" stroke="currentColor" stroke-width="4"/>
        <text x="${x + DOCK_W / 2}" y="${WORLD.ground - 222}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="30" fill="currentColor">PORT ${i + 1}</text></g>`;
    });
    near.innerHTML = `<svg width="${WORLD.w + 1200}" height="${WORLD.h + 200}" viewBox="-600 0 ${WORLD.w + 1200} ${WORLD.h + 200}" style="overflow:visible"><g class="statics">${n}</g><g class="trucks"></g><g class="fx"></g></svg>`;
    return near.querySelector('svg');
  }

  // ---------- Telefon-UI (DOM för skarp text). Skärm 380×760 vid skala 1. ----------
  const PL = {
    title: 'Zameldowanie kierowcy', plate: 'Numer rejestracyjny', lang: 'Wybierz język', next: 'Dalej', safety: 'Zasady bezpieczeństwa',
    rules: ['Kask i kamizelka odblaskowa', 'Maks. 20 km/h na terenie', 'Zatrzymaj się przy rampie', 'Zakaz palenia'], confirm: 'Potwierdzam', confirmed: 'Potwierdzono', route: 'Jedź do rampy 3', dist: '140 m', wait: 'Czekaj na zgodę operatora', go: 'Zgoda. Wjedź na teren.',
  };
  const SV = { title: 'Incheckning', plate: 'Registreringsnummer', lang: 'Välj språk', next: 'Nästa' };

  function buildPhone(root) {
    root.innerHTML = `
      <div class="ph-frame">
        <div class="ph-notch"></div>
        <div class="ph-screen">
          <div class="ph-head"><span class="ph-wm"><b>LUP</b>NUMBER</span><span class="ph-site">Grind 1</span></div>
          <div class="ph-body">
            <div class="ph-title"></div>
            <div class="ph-label"></div>
            <div class="ph-field"><span class="ph-plate"></span><span class="ph-caret">|</span></div>
            <div class="ph-langs"></div>
            <div class="ph-rules"></div>
            <div class="ph-route"></div>
            <div class="ph-btn"></div>
          </div>
        </div>
      </div>`;
    const q = (s) => root.querySelector(s);
    const langs = ['SV', 'PL', 'EN', 'DE'];
    q('.ph-langs').innerHTML = langs.map((l) => `<div class="ph-chip" data-l="${l}">${l}</div>`).join('');
    q('.ph-rules').innerHTML = PL.rules.map((r) => `<div class="ph-rule"><span class="ph-box">${LUP.icon('check')}</span><span>${r}</span></div>`).join('');
    return {
      el: root, title: q('.ph-title'), label: q('.ph-label'), field: q('.ph-field'), plate: q('.ph-plate'), caret: q('.ph-caret'), langs: q('.ph-langs'), chips: [...root.querySelectorAll('.ph-chip')],
      rules: q('.ph-rules'), ruleEls: [...root.querySelectorAll('.ph-rule')], route: q('.ph-route'), btn: q('.ph-btn'),
    };
  }

  // ---------- Operatörsvy (plattformen) ----------
  function buildPanel(root) {
    root.innerHTML = `
      <div class="op-head"><span class="ph-wm"><b>LUP</b>NUMBER</span><span class="op-title"></span><span class="op-live"><i></i>Realtid</span></div>
      <div class="op-rows"></div>
      <div class="op-stats"></div>`;
    return { el: root, title: root.querySelector('.op-title'), rows: root.querySelector('.op-rows'), stats: root.querySelector('.op-stats') };
  }

  LUP.initHero = function (brand, film, opts = {}) {
    const fps = brand.format.fps, W = brand.format.width, H = brand.format.height;
    const beats = film.beats.map((b) => ({ ...b }));
    let acc = 0; beats.forEach((b) => { b.start = acc; acc += b.duration; b.end = acc; });
    const total = acc;
    const cta = Object.assign({}, brand.cta, film.cta || {});
    const byId = Object.fromEntries(beats.map((b) => [b.id, b]));

    const stage = document.querySelector('.stage');
    stage.innerHTML = '';
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));

    // Världslager
    const view = U.css(U.el('div', 'hero-view'), {});
    const far = U.el('div', 'hero-layer far'), near = U.el('div', 'hero-layer near');
    view.append(far, near); stage.appendChild(view);
    const svg = buildWorld(far, near);
    const trucksG = svg.querySelector('.trucks'), fxG = svg.querySelector('.fx');
    const arm = svg.querySelector('.arm');
    const hero = add(trucksG, truckSvg('hero', film.plate || 'ABC 123', C.accent));
    const queue = [0, 1, 2].map((i) => add(trucksG, truckSvg('q' + i, ['KLM 456', 'XYZ 789', 'DEF 321'][i], C.grey)));
    const others = [0, 1, 2].map((i) => add(trucksG, truckSvg('o' + i, ['GHI 654', 'JKL 987', 'MNO 135'][i], C.accent)));
    trucksG.appendChild(hero); // hjälten ritas sist: framför parkerade bilar vid portarna
    // "idag"-rekvisita vid boden: klocka, papper, frågetecken
    const props = add(fxG, `<g class="props" style="color:${C.muted}">
      <g transform="translate(${GATE_X - 20} ${WORLD.ground - 345})"><circle r="46" fill="#fff" stroke="currentColor" stroke-width="5"/><line class="hm" y2="-34" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><line class="hh" y2="-22" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></g>
      <g class="paper" transform="translate(${GATE_X - 110} ${WORLD.ground - 250})"><rect x="-26" y="-34" width="52" height="68" rx="6" fill="#fff" stroke="currentColor" stroke-width="4"/><path d="M-14 -14h28M-14 0h28M-14 14h18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></g>
      <g class="qm" transform="translate(${GATE_X - 215} ${WORLD.ground - 330})"><text text-anchor="middle" y="22" font-family="${FONT}" font-weight="800" font-size="74" fill="currentColor">?</text></g>
    </g>`);
    const bridge = add(fxG, `<rect class="bridge" x="${DOCKS[2] + 60}" y="${WORLD.ground - 8}" width="${DOCK_W - 120}" height="10" rx="4" fill="${C.accent}" opacity="0"/>`);
    const hud = add(fxG, `<g class="hud" opacity="0"><rect x="-150" y="-70" width="300" height="60" rx="30" fill="#fff" stroke="${C.border}" stroke-width="4"/><text class="hud-t" text-anchor="middle" y="-28" font-family="${FONT}" font-weight="800" font-size="30" fill="${C.heading}">Port 3 · 140 m →</text></g>`);

    // Rubriker, telefon, panel, badge, outro, undertexter
    const dim = U.el('div', 'hero-dim'); stage.appendChild(dim);
    const titleEl = U.css(U.el('div', 'hero-title'), {});
    stage.appendChild(titleEl);
    const subEl = U.css(U.el('div', 'hero-sub'), {}); stage.appendChild(subEl);
    const phoneRoot = U.el('div', 'hero-phone'); stage.appendChild(phoneRoot); const ph = buildPhone(phoneRoot);
    const panelRoot = U.el('div', 'hero-panel'); stage.appendChild(panelRoot); const op = buildPanel(panelRoot);
    const tapEl = U.el('div', 'hero-tap'); stage.appendChild(tapEl);
    const badge = LUP.badge(brand); stage.appendChild(badge);
    const outroLayer = U.el('div', 'phase phase-outro'); stage.appendChild(outroLayer);
    const outroSeek = LUP.outro(outroLayer, brand, cta);
    let cueList = null, cueBox = null, cueEl = null;
    if (opts.captions !== false && LUP.captions) {
      cueList = LUP.captions.cuesFromBeats(beats.filter((b) => b.caption).map((b) => ({ key: b.id, start: b.start, end: b.end, text: b.caption })), brand.captions);
      cueBox = U.el('div', 'captions'); cueEl = U.el('div', 'cue', ''); cueBox.appendChild(cueEl); stage.appendChild(cueBox);
    }

    // ---------- Hjälpare ----------
    const setTitle = (() => { let cur = null; return (txt) => { if (txt === cur) return; cur = txt; titleEl.innerHTML = ''; if (!txt) return; U.words(titleEl, txt, 'w'); titleEl.style.fontSize = ''; LUP.fitText(titleEl, 936, 2, 48); }; })();
    const titleWords = () => [...titleEl.querySelectorAll('.w')];
    // Kamera: x = världs-x i bildens mitt, s = skala, g = var marklinjen hamnar i stage (px)
    let camera = { x: 600, s: 1.0, g: 990 };
    const lerpCam = (a, b, p) => ({ x: U.lerp(a.x, b.x, p), s: U.lerp(a.s, b.s, p), g: U.lerp(a.g ?? 990, b.g ?? 990, p) });
    const applyCamera = (cam) => {
      const cx = 540, g = cam.g ?? 990;
      // SVG-lagren har viewBox som börjar vid -600 (nära) respektive -400 (fjärran): kompensera
      near.style.transform = `translate(${cx - (cam.x + 600) * cam.s}px, ${g - WORLD.ground * cam.s}px) scale(${cam.s})`;
      const fs = cam.s * 0.9, fx = cam.x * 0.55 + 260;
      far.style.transform = `translate(${cx - (fx + 400) * fs}px, ${g - 10 - WORLD.ground * fs}px) scale(${fs})`;
    };
    const worldToStage = (wx, wy, cam) => ({ x: 540 + (wx - cam.x) * cam.s, y: (cam.g ?? 990) + (wy - WORLD.ground) * cam.s });
    const DOCK_DY = -70, DOCK_S = 0.86; // "inne vid porten": längre från kameran
    const heroAt = (x, dy = 0, sc = 1) => tr(hero, x - TRUCK_LEN * sc, WORLD.ground + dy, sc); // x = framände
    const place = (el, x, dy = 0, sc = 1) => tr(el, x - TRUCK_LEN * sc, WORLD.ground + dy, sc);
    const placeDock = (el, x) => tr(el, x - TRUCK_LEN * DOCK_S, WORLD.ground + DOCK_DY, DOCK_S);
    const toneWorld = (p) => { near.style.setProperty('color', U.mix(C.muted, C.accent, p)); near.style.setProperty('--wopacity', 1); far.style.opacity = U.lerp(0.75, 1, p); };
    const phoneState = { vis: 0, scale: 1, screen: null };
    const showPhone = (vis, scale, originX = 540, originY = 760) => {
      phoneRoot.style.opacity = vis; phoneRoot.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
      const s = U.lerp(0.18, 0.95, scale);
      const x = U.lerp(originX, 540, scale), y = U.lerp(originY, 775, scale);
      phoneRoot.style.transform = `translate(${x - 210 * s}px, ${y - 410 * s}px) scale(${s})`;
      dim.style.opacity = vis * scale * 0.55;
    };
    const showPanel = (vis, dy = 0) => { panelRoot.style.opacity = vis; panelRoot.style.visibility = vis > 0.001 ? 'visible' : 'hidden'; panelRoot.style.transform = `translateY(${dy}px)`; };
    const tap = (vis, x, y) => { tapEl.style.opacity = vis; tapEl.style.transform = `translate(${x - 30}px, ${y - 30}px) scale(${U.lerp(0.6, 1.1, vis)})`; };
    const phoneScreen = (mode) => {
      if (phoneState.screen === mode) return; phoneState.screen = mode;
      const show = (el, on) => (el.style.display = on ? '' : 'none');
      show(ph.field, mode === 'plate' || mode === 'lang'); show(ph.langs, mode === 'lang'); show(ph.rules, mode === 'safety'); show(ph.route, mode === 'route' || mode === 'wait' || mode === 'go'); show(ph.btn, mode !== 'plate');
      ph.label.textContent = mode === 'plate' ? SV.plate : mode === 'lang' ? SV.lang : mode === 'safety' ? PL.safety : '';
      ph.title.textContent = mode === 'plate' ? SV.title : mode === 'lang' ? SV.title : mode === 'safety' ? PL.title : mode === 'route' ? PL.route : mode === 'wait' ? PL.title : PL.title;
      ph.btn.textContent = mode === 'lang' ? SV.next : mode === 'safety' ? PL.confirm : mode === 'wait' ? PL.wait : mode === 'go' ? PL.go : PL.next;
      ph.btn.className = 'ph-btn' + (mode === 'wait' ? ' ghost' : '');
      ph.route.innerHTML = mode === 'route' ? `<div class="ph-dist">${PL.dist}</div><div class="ph-arrow">${LUP.icon('arrow')}</div>` : mode === 'wait' ? `<div class="ph-state">${LUP.icon('clock')}<span>${PL.wait}</span></div>` : mode === 'go' ? `<div class="ph-state ok">${LUP.icon('check')}<span>${PL.confirmed}</span></div>` : '';
    };
    const opRows = (() => { let cur = null; return (key, html) => { if (cur === key) return; cur = key; op.rows.innerHTML = html; }; })();
    const opStats = (() => { let cur = null; return (html) => { if (cur === html) return; cur = html; op.stats.innerHTML = html; }; })();

    // SFX-händelser (absoluta tider) – exporteras till ljudmixen
    const events = [];
    const ev = (t, sfx, gain = 0) => events.push({ t: +t.toFixed(2), sfx, gain });
    for (const b of beats) {
      const s = b.start, d = b.duration;
      if (b.id === 'arrival') { ev(s + 0.2, 'truck_pass', -4); }
      if (b.id === 'today') { ev(s + 0.6, 'air_brake', -6); ev(s + 1.2, 'truck_idle', -10); }
      if (b.id === 'reset') { ev(s + 0.1, 'whoosh', -4); ev(s + 0.3, 'lift', -6); }
      if (b.id === 'checkin') { ev(s + 0.3, 'air_brake', -8); ev(s + d * 0.12, 'tick', -6); ev(s + d * 0.55, 'tick', -6); ev(s + d * 0.62, 'confirm', -8); }
      if (b.id === 'safety') { for (let i = 0; i < 4; i++) ev(s + d * (0.22 + i * 0.1), 'tick', -8); ev(s + d * 0.72, 'confirm', -6); }
      if (b.id === 'gate') { ev(s + d * 0.45, 'tick', -6); ev(s + d * 0.55, 'confirm', -8); ev(s + d * 0.62, 'gate_open', -4); ev(s + d * 0.8, 'truck_pass', -6); }
      if (b.id === 'route') { ev(s + 0.2, 'cam_move', -10); ev(s + d * 0.9, 'air_brake', -10); ev(s + d * 0.96, 'confirm', -8); }
      if (b.id === 'overview') { ev(s + 0.1, 'cam_move', -8); }
      if (b.id === 'checkout') { ev(s + d * 0.3, 'beep', -10); ev(s + d * 0.5, 'truck_pass', -8); }
      if (b.id === 'close') { ev(s + 0.2, 'whoosh', -8); }
    }

    // ---------- Per-frame ----------
    const curBeat = (t) => { let b = beats[0]; for (const x of beats) if (t >= x.start) b = x; return b; };
    function seek(frame) {
      LUP._lastFrame = frame;
      const t = frame / fps;
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      const b = curBeat(t), l = t - b.start, d = b.duration, p = U.clamp(l / d, 0, 1);
      const inOut = (a0, a1) => Math.min(U.prog(l, 0, a0, U.easeOut), 1 - U.prog(l, d - a1, a1, U.easeIn));

      // Standardvärden varje frame
      let cam = camera, heroX = -400, heroDepth = 0, armOpen = 0, tone = 0, propsVis = 0, hudVis = 0, bridgeVis = 0, phVis = 0, phScale = 0, panelVis = 0;
      const qVis = [0, 0, 0], oVis = [0, 0, 0]; let qX = [GATE_X - 290, GATE_X - 290 - 250, -900], oX = [DOCKS[0] + 150, DOCKS[1] + 150, 600];
      const QV = (v) => { qVis[0] = v; qVis[1] = v; };
      let title = b.title || '', sub = b.sub || '';
      tap(0, 0, 0); hero.style.opacity = 1;
      const clockHands = (sec) => { props.querySelector('.hm').setAttribute('transform', `rotate(${sec * 120})`); props.querySelector('.hh').setAttribute('transform', `rotate(${sec * 10 + 210})`); };
      const prev = (id) => byId[id];

      switch (b.id) {
        case 'arrival': {
          // Grå värld, bilen kommer in från vänster (nära kameran) och rullar fram bakom kön
          heroX = U.lerp(-250, GATE_X - 290 - 500, U.easeInOut(p)); tone = 0; propsVis = 1; QV(1);
          cam = lerpCam({ x: -300, s: 1.5, g: 990 }, { x: 510, s: 0.95, g: 990 }, U.easeInOut(p));
          clockHands(t); break;
        }
        case 'today': {
          heroX = GATE_X - 290 - 500 + Math.sin(t * 9) * 0.6; tone = 0; propsVis = 1; QV(1);
          cam = lerpCam({ x: 510, s: 0.95, g: 990 }, { x: 530, s: 0.98, g: 990 }, U.easeInOut(p));
          clockHands(t);
          props.querySelector('.qm').setAttribute('transform', `translate(${GATE_X - 215} ${WORLD.ground - 330 + Math.sin(t * 3) * 6})`);
          break;
        }
        case 'reset': {
          // Svep: världen byter till LUPNUMBER-läge; samma bil kör fram till grinden utan kö
          const wipe = U.prog(l, 0, Math.min(1.0, d * 0.35), U.easeInOut);
          tone = wipe; propsVis = 1 - wipe; QV(1 - wipe);
          heroX = U.lerp(GATE_X - 290 - 500, GATE_X - 290, U.easeInOut(U.prog(l, d * 0.25, d * 0.75)));
          cam = lerpCam({ x: 530, s: 0.98, g: 990 }, { x: 820, s: 1.3, g: 990 }, U.easeInOut(p));
          dim.style.background = `linear-gradient(90deg, transparent ${wipe * 140 - 40}%, rgba(14,165,233,0.18) ${wipe * 140 - 20}%, transparent ${wipe * 140}%)`;
          break;
        }
        case 'checkin': {
          tone = 1; heroX = GATE_X - 290; 
          cam = lerpCam({ x: 820, s: 1.3, g: 990 }, { x: 880, s: 1.45, g: 1040 }, U.easeInOut(U.prog(l, 0, d * 0.25)));
          const rise = U.prog(l, d * 0.05, d * 0.14, U.easeInOut); phVis = U.prog(l, d * 0.03, 0.2); phScale = rise;
          const typed = U.prog(l, d * 0.16, d * 0.26); const plate = (film.plate || 'ABC 123');
          const nChars = Math.round(typed * plate.length);
          if (ph.plate.textContent !== plate.slice(0, nChars)) ph.plate.textContent = plate.slice(0, nChars);
          ph.caret.style.opacity = typed < 1 ? (Math.floor(l * 3) % 2 ? 1 : 0) : 0;
          const langPhase = l > d * 0.46; phoneScreen(langPhase ? 'lang' : 'plate');
          const sel = U.prog(l, d * 0.56, 0.3, U.back);
          ph.chips.forEach((c) => { c.classList.toggle('on', c.dataset.l === 'PL' && sel > 0.5); });
          if (langPhase && sel > 0 && sel < 1) tap(1 - sel, 540 - 40, 700 + 10);
          if (l > d * 0.72) { ph.title.textContent = PL.title; ph.label.textContent = PL.plate; ph.btn.textContent = PL.next; }
          break;
        }
        case 'safety': {
          tone = 1; heroX = GATE_X - 290; cam = { x: 880, s: 1.45, g: 1040 }; phVis = 1; phScale = 1 - U.prog(l, d - 0.9, 0.9, U.easeInOut);
          phoneScreen('safety');
          ph.ruleEls.forEach((r, i) => r.classList.toggle('on', l > d * (0.22 + i * 0.1)));
          const press = U.prog(l, d * 0.68, 0.25, U.back); if (press > 0 && press < 1) tap(1 - press, 540, 700 + 300);
          ph.btn.textContent = l > d * 0.72 ? PL.confirmed : PL.confirm; ph.btn.classList.toggle('done', l > d * 0.72);
          break;
        }
        case 'gate': {
          tone = 1; heroX = GATE_X - 290;
          cam = lerpCam({ x: 880, s: 1.45, g: 1040 }, { x: 1000, s: 1.0, g: 700 }, U.easeInOut(U.prog(l, 0, d * 0.3)));
          panelVis = inOut(0.5, 0.5);
          op.title.textContent = 'Grind 1 · Ankomster';
          const assigned = l > d * 0.55;
          opRows('gate' + (assigned ? 1 : 0), `
            <div class="op-row hi"><span class="op-plate">${film.plate || 'ABC 123'}</span><span>Nordfrakt AB</span><span class="op-tags"><i class="ok">Incheckad</i><i class="ok">Säkerhet ✓</i><i class="${assigned ? 'ok' : 'wait'}">${assigned ? 'Port 3 anvisad' : 'Väntar på port'}</i></span></div>
            <div class="op-row"><span class="op-plate">GHI 654</span><span>Transit AB</span><span class="op-tags"><i class="ok">Vid port 1</i></span></div>
            <div class="op-row"><span class="op-plate">JKL 987</span><span>Linjetrafik</span><span class="op-tags"><i class="ok">Vid port 2</i></span></div>`);
          opStats(`<div class="op-action${assigned ? ' done' : ''}">${assigned ? 'Port 3 anvisad · grinden öppnas' : 'Anvisa port'}</div>`);
          const press = U.prog(l, d * 0.44, 0.25, U.back); if (press > 0 && press < 1) tap(1 - press, 540, 1130);
          armOpen = U.prog(l, d * 0.62, Math.min(1.2, d * 0.18), U.easeInOut);
          heroX = GATE_X - 290 + U.easeIn(U.prog(l, d * 0.78, d * 0.22)) * 420;
          oVis[0] = 1; oVis[1] = 1; break;
        }
        case 'route': {
          tone = 1; const run = U.easeInOut(p); heroX = U.lerp(GATE_X + 130, DOCKS[2] + 150, run);
          cam = lerpCam({ x: 1000, s: 1.0, g: 700 }, { x: heroX - 40, s: 1.25, g: 990 }, U.easeInOut(U.prog(l, 0, Math.min(1.2, d * 0.2))));
          if (l > d * 0.2) cam = { x: heroX - 40, s: 1.25, g: 990 };
          hudVis = 1; hud.setAttribute('transform', `translate(${heroX - 150} ${WORLD.ground - 200 - 60 * U.prog(p, 0.86, 0.14)})`);
          const dist = Math.max(0, Math.round((DOCKS[2] + 150 - heroX) * 0.1 / 10) * 10);
          const ht = hud.querySelector('.hud-t'); const txt = p < 0.95 ? `Port 3 · ${dist} m →` : 'Vid port 3 ✓'; if (ht.textContent !== txt) ht.textContent = txt;
          heroDepth = U.prog(p, 0.86, 0.14, U.easeInOut); // backar in mot porten (djup)
          bridgeVis = U.prog(l, d * 0.94, 0.3); oVis[0] = 1; oVis[1] = 1; break;
        }
        case 'overview': {
          tone = 1; heroX = DOCKS[2] + 150; heroDepth = 1; bridgeVis = 1; oVis[0] = 1; oVis[1] = 1; oVis[2] = 1; oX[2] = U.lerp(300, GATE_X - 290, U.easeOut(p));
          cam = lerpCam({ x: heroX - 40, s: 1.25, g: 990 }, { x: 1800, s: 0.56, g: 700 }, U.easeInOut(U.prog(l, 0, d * 0.55)));
          panelVis = inOut(0.6, 0.4); op.title.textContent = 'Siten just nu';
          opRows('ov', `
            <div class="op-row hi"><span class="op-plate">${film.plate || 'ABC 123'}</span><span>Port 3</span><span class="op-tags"><i class="ok">Lastning pågår</i></span></div>
            <div class="op-row"><span class="op-plate">GHI 654</span><span>Port 1</span><span class="op-tags"><i class="ok">Lastning pågår</i></span></div>
            <div class="op-row"><span class="op-plate">MNO 135</span><span>Grind 1</span><span class="op-tags"><i class="wait">Incheckning</i></span></div>`);
          opStats(`<div class="op-kpi"><b>5</b><span>på siten</span></div><div class="op-kpi"><b>3</b><span>vid port</span></div><div class="op-kpi"><b>0</b><span>i kö</span></div>`);
          break;
        }
        case 'checkout': {
          tone = 1; bridgeVis = 1 - U.prog(l, 0, 0.4); oVis[0] = 1; oVis[1] = 1; oVis[2] = 1; oX[2] = GATE_X - 290;
          heroDepth = 1 - U.prog(l, d * 0.1, d * 0.3, U.easeInOut); // ut på körbanan igen
          heroX = DOCKS[2] + 150 + U.easeIn(U.prog(l, d * 0.35, d * 0.65)) * 900;
          cam = lerpCam({ x: 1800, s: 0.56, g: 700 }, { x: 2250, s: 0.62, g: 700 }, U.easeInOut(p));
          panelVis = inOut(0.5, 0.4); op.title.textContent = 'Logg · idag';
          opRows('log', `
            <div class="op-row hi"><span class="op-plate">${film.plate || 'ABC 123'}</span><span>In 06:58 · Ut 07:41</span><span class="op-tags"><i class="ok">Port 3</i><i class="ok">Utcheckad</i></span></div>
            <div class="op-row"><span class="op-plate">GHI 654</span><span>In 06:40</span><span class="op-tags"><i class="ok">Port 1</i></span></div>`);
          opStats(`<div class="op-kpi"><b>43</b><span>min på siten</span></div><div class="op-kpi"><b>0</b><span>papper</span></div>`);
          break;
        }
        case 'close': { tone = 1; cam = { x: 2250, s: 0.62, g: 700 }; heroX = DOCKS[2] + 1050 + l * 150; oVis[0] = 1; oVis[1] = 1; break; }
      }

      // Tillämpa
      camera = cam; applyCamera(cam);
      toneWorld(tone); hero.style.color = U.mix(C.heading, C.accent, tone);
      heroAt(heroX, DOCK_DY * heroDepth, U.lerp(1, DOCK_S, heroDepth));
      queue.forEach((q, i) => { q.style.opacity = qVis[i]; place(q, qX[i]); });
      others.forEach((o, i) => { o.style.opacity = oVis[i]; if (i < 2) placeDock(o, oX[i]); else place(o, oX[i]); });
      props.style.opacity = propsVis; arm.setAttribute('transform', `rotate(${-82 * armOpen})`);
      hud.setAttribute('opacity', hudVis); bridge.setAttribute('opacity', bridgeVis);
      const cab = worldToStage(GATE_X - 290 - 40, WORLD.ground - 70, cam); showPhone(phVis, phScale, cab.x, cab.y);
      if (b.id !== 'reset') dim.style.background = '';
      if (b.id !== 'reset') dim.style.opacity = phVis * phScale * 0.55; else dim.style.opacity = 1;
      showPanel(panelVis, (1 - panelVis) * 40);
      const isClose = b.id === 'close';
      view.style.opacity = isClose ? 1 - U.prog(l, 0, 0.5) : 1;
      badge.style.opacity = isClose ? 1 - U.prog(l, 0, 0.3) : 1;
      // Rubrik
      setTitle(isClose ? '' : title);
      const tw = titleWords(); const first = b === beats[0];
      tw.forEach((w, i) => { const pin = first ? 1 : U.prog(l, i * 0.04, 0.35, U.easeOut); U.enter(w, Math.min(pin, 1 - U.prog(l, d - 0.22, 0.22, U.easeIn)), { dy: first ? 0 : 16 }); if (first) w.style.transform = `translateY(${(1 - U.prog(l, i * 0.03, 0.4, U.easeOut)) * 8}px)`; });
      subEl.textContent = sub; subEl.style.opacity = sub ? Math.min(U.prog(l, 0.6, 0.4), 1 - U.prog(l, d - 0.35, 0.35)) : 0;
      // Outro
      outroLayer.style.visibility = isClose ? 'visible' : 'hidden'; outroLayer.style.opacity = isClose ? U.prog(l, 0.1, 0.4) : 0;
      if (isClose) outroSeek(l - 0.1);
      // Undertexter
      if (cueList) { const c = cueList.find((q) => t >= q.start && t < q.end); if (c) { if (cueEl.textContent !== c.text) cueEl.textContent = c.text; cueBox.style.opacity = Math.min(U.prog(t, c.start, 0.15), 1 - U.prog(t, c.end - 0.15, 0.15)); } else cueBox.style.opacity = 0; }
    }

    LUP.timeline = { total, fps, frames: Math.round(total * fps), beats: beats.map((b) => ({ id: b.id, start: b.start, end: b.end, title: b.title })), events };
    window.__seek = seek;
    window.__setRenderMode = () => document.body.classList.add('render');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { (LUP._refit || []).forEach((f) => f()); if (LUP._lastFrame != null) seek(LUP._lastFrame); });
    seek(0);
    return LUP.timeline;
  };
})();
