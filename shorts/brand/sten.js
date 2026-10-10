/* LUPNUMBER – "This is Sten." (60 s komedi, engelsk speaker). Mallen återanvänder hero-filmens värld, kamera, lastbilar,
   telefon-UI (polska) och ljudpipeline via LUP.heroParts och lägger till karaktärsriggar (Sten, Dariusz, chefen, chaufförer),
   interiörer (boden) och 14 scener exakt enligt shorts/manus/this-is-sten.md. Allt är tidsstyrt (deterministiskt per frame). */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util, HP = LUP.heroParts;
  const { WORLD, GATE_X, DOCK_W, TRUCK_LEN, C, FONT, esc, add, tr, truckSvg, buildWorld, buildPhone, PL } = HP;
  const DOCKS = Array.from({ length: 8 }, (_, i) => 1700 + i * 300);
  const H = C.heading, SW = 4;
  const SK = { sten: '#F2D6BF', dar: '#E8C2A2', man: '#F6DCC8', ro: '#D7AC86', lt: '#F3D4BF', vis: '#EFC9B0' };
  const COL = { vest: '#FACC15', fleece: '#1E3A5F', red: '#F87171', orange: '#FB923C', lime: '#A3E635', shirt: '#60A5FA', beanie: '#0C4A6E', hairDark: '#374151', hairBrown: '#6B4F3A', grey: '#9CA3AF', pants: '#334155', jeans: '#475569' };
  const svgWrap = (inner, w = 1080, h = 1350) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;overflow:visible">${inner}</svg>`;
  const txt = (x, y, s, size, o = {}) => `<text${o.cls ? ` class="${o.cls}"` : ''} x="${x}" y="${y}" font-family="${FONT}" font-weight="${o.w || 800}" font-size="${size}" fill="${o.fill || H}" text-anchor="${o.anchor || 'start'}"${o.op != null ? ` opacity="${o.op}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.tf ? ` transform="${o.tf}"` : ''}>${esc(s)}</text>`;
  const q = (el, s) => el.querySelector(s), qa = (el, s) => [...el.querySelectorAll(s)];
  const setT = (el, s) => el.setAttribute('transform', s), setO = (el, v) => el.setAttribute('opacity', v);
  const blinkAt = (l, times, dur = 0.18) => { let v = 0; for (const tt of times) { const a = Math.abs(l - tt); if (a < dur / 2) v = Math.max(v, 1 - a / (dur / 2)); } return v; };
  const nodAt = (l, times, amp = 8, dur = 0.45) => { let v = 0; for (const tt of times) { const p = (l - tt) / dur; if (p >= 0 && p <= 1) v = amp * Math.sin(Math.PI * p); } return v; };
  const between = (l, a, b) => l >= a && l < b;

  // ======================= Karaktärsrigg (enhet: huvudbredd 100) =======================
  function headFront(o) {
    const skin = o.skin; let s = `<g class="head">`;
    s += `<ellipse cx="-50" cy="8" rx="9" ry="13" fill="${skin}" stroke="${H}" stroke-width="${SW}"/><ellipse cx="50" cy="8" rx="9" ry="13" fill="${skin}" stroke="${H}" stroke-width="${SW}"/>`;
    s += `<path d="M -46 -36 Q -53 48 0 57 Q 53 48 46 -36 Z" fill="${skin}" stroke="${H}" stroke-width="${SW}"/>`;
    if (o.stubble) s += `<path d="M -43 12 Q -36 50 0 55 Q 36 50 43 12 Q 22 34 0 36 Q -22 34 -43 12 Z" fill="${COL.grey}" opacity=".42"/>`;
    s += `<g class="eyes"><circle cx="-18" cy="0" r="5.5" fill="${H}"/><circle cx="18" cy="0" r="5.5" fill="${H}"/></g>`;
    s += `<g class="lids"><rect x="-31" y="-11" width="26" height="0" fill="${skin}"/><rect x="5" y="-11" width="26" height="0" fill="${skin}"/></g>`;
    s += `<path class="bl" d="M -31 -15 q 13 -7 25 -3" stroke="${H}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path class="br" d="M 6 -18 q 12 -4 25 3" stroke="${H}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M 1 -1 q -7 14 4 17" stroke="${H}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    s += `<path class="mouth" d="M -15 31 Q 0 34 15 31" stroke="${H}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    if (o.hair === 'beanie') {
      s += `<path d="M -54 -30 Q -56 -78 0 -80 Q 56 -78 54 -30 Z" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-57" y="-46" width="114" height="24" rx="10" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-57" y="-36" width="114" height="5" fill="${C.accent}"/>`;
      s += `<g transform="translate(0 -33)" fill="rgba(255,255,255,.16)" stroke="#E2E8F0" stroke-width="3"><circle cx="-18" r="12"/><circle cx="18" r="12"/><path d="M -6 0 h 12 M -30 0 h -16 M 30 0 h 16" fill="none"/></g>`;
    } else if (o.hair === 'short') s += `<path d="M -47 -28 Q -46 -66 0 -68 Q 46 -66 47 -28 Q 30 -42 0 -44 Q -30 -42 -47 -28 Z" fill="${o.hairColor || COL.hairDark}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    else if (o.hair === 'cap') s += `<path d="M -50 -30 Q -50 -70 0 -72 Q 50 -70 50 -30 Z" fill="${o.hairColor || C.grey}" stroke="${H}" stroke-width="${SW}"/><path d="M -54 -32 h 108 l 42 10 q 6 2 2 8 l -46 -6 h -106 z" fill="${o.hairColor || C.grey}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    if (o.glasses) s += `<g fill="none" stroke="${H}" stroke-width="3"><circle cx="-18" cy="0" r="13"/><circle cx="18" cy="0" r="13"/><path d="M -5 0 h 10"/></g>`;
    return s + `</g>`;
  }
  // Ansiktsuttryck: blink 0–1, brow [v,h] −1..1 (upp), smile −1..1, ex/ey = blickriktning
  function face(headEl, f) {
    const b = U.clamp(f.blink || 0, 0, 1);
    qa(headEl, '.lids rect').forEach((r) => r.setAttribute('height', (17 * b).toFixed(2)));
    qa(headEl, '.eyes circle').forEach((e, i) => { e.setAttribute('cx', (i ? 18 : -18) + (f.ex || 0)); e.setAttribute('cy', f.ey || 0); });
    const br = f.brow || [0, 0];
    q(headEl, '.bl').setAttribute('transform', `translate(0 ${(-br[0] * 7).toFixed(2)})`); q(headEl, '.br').setAttribute('transform', `translate(0 ${(-br[1] * 7).toFixed(2)})`);
    const sm = f.smile || 0; q(headEl, '.mouth').setAttribute('d', `M -15 31 Q 0 ${(34 + sm * 11).toFixed(2)} 15 ${(31 - Math.max(0, sm) * 7).toFixed(2)}`);
  }
  function torsoFront(o) {
    const top = o.top || COL.fleece; let s = `<g class="torso">`;
    s += `<rect x="-17" y="-14" width="34" height="30" fill="${o.skin}" stroke="${H}" stroke-width="${SW}"/>`;
    s += `<path d="M -94 28 Q -94 4 -66 4 L -22 4 Q 0 24 22 4 L 66 4 Q 94 4 94 28 L 94 210 L -94 210 Z" fill="${top}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    if (o.vest) {
      s += `<path d="M -78 8 Q -94 8 -94 26 L -94 210 L -32 210 L -32 64 L -60 8 Z" fill="${o.vest}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/><path d="M 78 8 Q 94 8 94 26 L 94 210 L 32 210 L 32 64 L 60 8 Z" fill="${o.vest}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
      s += `<g fill="#F8FAFC" opacity=".95"><rect x="-94" y="118" width="62" height="13"/><rect x="32" y="118" width="62" height="13"/><rect x="-94" y="146" width="62" height="13"/><rect x="32" y="146" width="62" height="13"/><rect x="-72" y="14" width="13" height="104"/><rect x="59" y="14" width="13" height="104"/></g>`;
    }
    if (o.collar) s += `<path d="M -22 4 L -6 34 L 0 24 L 6 34 L 22 4" fill="none" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    return s + `</g>`;
  }
  // Arm = polyline axel→armbåge→hand (2-leds IK), hand med plats för föremål (.held)
  const armSvg = (cls, color, skin, w = 36) => `<g class="arm ${cls}"><polyline points="0,0 0,0 0,0" fill="none" stroke="${H}" stroke-width="${w + SW * 2}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="0,0 0,0 0,0" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><g class="hand"><circle r="${(w * 0.56).toFixed(1)}" fill="${skin}" stroke="${H}" stroke-width="${SW}"/><g class="held"></g></g></g>`;
  function ik(S, Hd, a, b, bend) {
    let dx = Hd.x - S.x, dy = Hd.y - S.y, d = Math.hypot(dx, dy) || 0.001; const m = a + b - 0.5;
    if (d > m) { dx *= m / d; dy *= m / d; d = m; }
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x)), ux = dx / d, uy = dy / d;
    return { ex: S.x + ux * x - uy * h * bend, ey: S.y + uy * x + ux * h * bend, hx: S.x + dx, hy: S.y + dy };
  }
  function setArm(el, S, Hd, a, b, bend = 1, rot = 0) {
    const e = ik(S, Hd, a, b, bend); const pts = `${S.x.toFixed(1)},${S.y.toFixed(1)} ${e.ex.toFixed(1)},${e.ey.toFixed(1)} ${e.hx.toFixed(1)},${e.hy.toFixed(1)}`;
    qa(el, 'polyline').forEach((p) => p.setAttribute('points', pts));
    setT(q(el, '.hand'), `translate(${e.hx.toFixed(1)} ${e.hy.toFixed(1)}) rotate(${rot})`);
  }
  const held = (armEl, html) => { const h = q(armEl, '.held'); if (h.getAttribute('data-k') !== html.length + '') { h.innerHTML = html; h.setAttribute('data-k', html.length + ''); } return h; };
  // Rekvisita
  const ringsSvg = () => `<g class="rings" opacity="0" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round"><path d="M -40 -26 q -12 14 0 28"/><path d="M -54 -36 q -20 24 0 48"/><path d="M 40 -26 q 12 14 0 28"/><path d="M 54 -36 q 20 24 0 48"/></g>`;
  const mugSvg = (s = 1) => `<g class="mug" transform="scale(${s})"><circle cx="66" cy="-2" r="24" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><rect x="-40" y="-50" width="80" height="96" rx="10" fill="#fff" stroke="${H}" stroke-width="${SW}"/><path d="M 40 -26 q 32 0 32 24 q 0 24 -32 24" fill="none" stroke="${H}" stroke-width="5"/><g font-family="${FONT}" font-weight="800" fill="${H}" text-anchor="middle" font-size="11"><text y="-16">WORLD'S</text><text y="-2">OKAYEST</text><text y="12">GATE</text></g><ellipse cx="0" cy="-50" rx="40" ry="8" fill="${C.tint}" stroke="${H}" stroke-width="${SW}"/><ellipse cx="0" cy="-50" rx="31" ry="5" fill="#6B4F3A"/><path d="M 44 -40 q -4 -22 18 -24 q 16 0 14 18" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/></g>`;
  const handsetSvg = (s = 1) => `<g class="handset" transform="scale(${s})"><rect x="-46" y="-11" width="92" height="22" rx="11" fill="#fff" stroke="${H}" stroke-width="${SW}"/><ellipse cx="-40" cy="0" rx="18" ry="14" fill="#fff" stroke="${H}" stroke-width="${SW}"/><ellipse cx="40" cy="0" rx="18" ry="14" fill="#fff" stroke="${H}" stroke-width="${SW}"/><circle cx="-40" r="5" fill="${H}"/><circle cx="40" r="5" fill="${H}"/>${ringsSvg()}</g>`;
  const mobileSvg = (s = 1, on = false) => `<g class="mobile" transform="scale(${s})"><rect x="-17" y="-32" width="34" height="64" rx="6" fill="${H}"/><rect class="scr" x="-13" y="-26" width="26" height="48" rx="3" fill="${on ? C.accent : '#CBD5E1'}"/>${ringsSvg()}</g>`;
  const radioSvg = (s = 1) => `<g class="radio" transform="scale(${s})"><rect x="-16" y="-30" width="32" height="60" rx="6" fill="${H}"/><line x1="10" y1="-30" x2="14" y2="-62" stroke="${H}" stroke-width="5" stroke-linecap="round"/><g stroke="#94A3B8" stroke-width="2"><line x1="-10" y1="-14" x2="10" y2="-14"/><line x1="-10" y1="-8" x2="10" y2="-8"/><line x1="-10" y1="-2" x2="10" y2="-2"/></g><circle cx="0" cy="16" r="5" fill="${C.accent}"/>${ringsSvg()}</g>`;
  const phoneBaseSvg = (s = 1) => `<g class="pbase" transform="scale(${s})"><path d="M -60 20 L -50 -20 L 50 -20 L 60 20 Z" fill="#fff" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/><rect x="-26" y="-8" width="52" height="20" rx="4" fill="${C.tint}" stroke="${H}" stroke-width="3"/><g class="cradle" transform="translate(0 -26)">${handsetSvg(0.9)}</g>${ringsSvg()}</g>`;
  const thumbSvg = (s = 1) => `<g class="thumbup" transform="scale(${s})"><rect x="-34" y="-26" width="68" height="62" rx="20" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><rect x="-12" y="-74" width="26" height="60" rx="12" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><path d="M -34 -6 h 60 M -34 10 h 60" stroke="${H}" stroke-width="3" opacity=".5"/></g>`;
  function flipClock(id, hh, mm) {
    const tile = (x, cls, v, flip) => {
      if (!flip) return `<g class="tile ${cls}" transform="translate(${x} 0)"><rect x="0" y="0" width="100" height="110" rx="12" fill="#fff" stroke="${H}" stroke-width="${SW}"/><text class="v" x="50" y="86" font-family="${FONT}" font-weight="800" font-size="78" fill="${H}" text-anchor="middle">${v}</text><line x1="0" y1="55" x2="100" y2="55" stroke="${H}" stroke-width="3"/></g>`;
      const half = (c, clip) => `<g class="${c}"${clip ? ` clip-path="url(#${id}-${clip})"` : ''} transform-origin="50 55"><rect x="0" y="0" width="100" height="110" rx="12" fill="#fff" stroke="${H}" stroke-width="${SW}"/><text class="v" x="50" y="86" font-family="${FONT}" font-weight="800" font-size="78" fill="${H}" text-anchor="middle">${v}</text></g>`;
      return `<g class="tile ${cls}" transform="translate(${x} 0)"><defs><clipPath id="${id}-top"><rect x="-4" y="-4" width="108" height="59"/></clipPath><clipPath id="${id}-bot"><rect x="-4" y="55" width="108" height="60"/></clipPath></defs>${half('baseTop', 'top')}${half('baseBot', 'bot')}${half('flapTop', 'top')}${half('flapBot', 'bot')}<line x1="0" y1="55" x2="100" y2="55" stroke="${H}" stroke-width="3"/></g>`;
    };
    return `<g class="clock ${id}"><rect x="-16" y="-16" width="272" height="142" rx="18" fill="${COL.beanie}"/>${tile(0, 'hh', hh, false)}<circle cx="120" cy="40" r="6" fill="#fff"/><circle cx="120" cy="72" r="6" fill="#fff"/>${tile(140, 'mm', mm, true)}</g>`;
  }
  function setFlip(clockEl, oldV, newV, p) {
    const g = (c) => q(clockEl, '.mm .' + c); const v = (c, val) => { const e = q(g(c), '.v'); if (e.textContent !== String(val)) e.textContent = val; };
    const cur = p <= 0 ? oldV : newV;
    if (p <= 0 || p >= 1) { ['baseTop', 'baseBot', 'flapTop', 'flapBot'].forEach((c) => v(c, cur)); setT(g('flapTop'), 'scale(1 1)'); setT(g('flapBot'), 'scale(1 1)'); return; }
    v('baseTop', newV); v('baseBot', oldV); v('flapTop', oldV); v('flapBot', newV);
    setT(g('flapTop'), `scale(1 ${Math.max(0.001, 1 - 2 * p).toFixed(3)})`); setT(g('flapBot'), `scale(1 ${Math.max(0.001, 2 * p - 1).toFixed(3)})`);
  }
  function bubble(x, y, text, o = {}) { // spetsen vid (x, y), bubblan ovanför
    const size = o.size || 30, w = o.w || Math.round(text.length * size * 0.56 + 60), h = Math.round(size * 1.3 + 34);
    const bx = x - w / 2 + (o.dx || 0), by = y - h - 24;
    return `<g class="bubble ${o.cls || ''}" opacity="0" transform-origin="${x} ${y}"><rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="22" fill="#fff" stroke="${C.border}" stroke-width="4"/><path d="M ${x - 18} ${by + h - 3} L ${x} ${y} L ${x + 18} ${by + h - 3} Z" fill="#fff" stroke="${C.border}" stroke-width="4" stroke-linejoin="round"/><rect x="${x - 16}" y="${by + h - 8}" width="32" height="10" fill="#fff"/>${txt(bx + w / 2, by + h / 2 + size * 0.36, text, size, { anchor: 'middle' })}</g>`;
  }
  // Person i profil (vänd åt höger), origo vid fötterna, höjd ≈ 344 (hjässa) · armar: .ab (bakre), .af (främre), ben .lb/.lf, huvud .head
  function personSide(o) {
    const top = o.top || COL.fleece, pants = o.pants || COL.pants, skin = o.skin; let s = `<g class="person side">`;
    s += armSvg('ab', top, skin, 30);
    s += `<g class="leg lb" transform-origin="-4 -150"><rect x="-22" y="-156" width="34" height="142" rx="15" fill="${pants}" stroke="${H}" stroke-width="${SW}"/><rect x="-28" y="-18" width="56" height="20" rx="8" fill="${H}"/></g>`;
    s += `<g class="leg lf" transform-origin="4 -150"><rect x="-10" y="-156" width="34" height="142" rx="15" fill="${pants}" stroke="${H}" stroke-width="${SW}"/><rect x="-14" y="-18" width="60" height="20" rx="8" fill="${H}"/></g>`;
    s += `<path d="M -38 -300 L 38 -300 Q 50 -300 50 -288 L 46 -146 L -46 -146 L -50 -288 Q -50 -300 -38 -300 Z" fill="${top}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    if (o.vest) s += `<path d="M 4 -296 L 38 -296 Q 50 -296 50 -284 L 46 -146 L 4 -146 Z" fill="${o.vest}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/><rect x="5" y="-222" width="42" height="12" fill="#F8FAFC" opacity=".95"/><rect x="5" y="-198" width="42" height="12" fill="#F8FAFC" opacity=".95"/>`;
    if (o.pockets) s += `<path d="M 10 -210 q 0 -5 5 -5 h 26" fill="none" stroke="${H}" stroke-width="3" opacity=".55"/>`;
    s += `<rect x="-8" y="-320" width="26" height="28" fill="${skin}" stroke="${H}" stroke-width="${SW}"/>`;
    s += `<g class="head" transform="translate(0 -344)"><circle r="46" fill="${skin}" stroke="${H}" stroke-width="${SW}"/><ellipse cx="-36" cy="4" rx="8" ry="12" fill="${skin}" stroke="${H}" stroke-width="${SW}"/>`;
    if (o.stubble) s += `<path d="M -16 14 Q 4 50 42 24 Q 26 36 -16 14 Z" fill="${COL.grey}" opacity=".42"/>`;
    s += `<path d="M 42 -4 q 16 8 2 20" fill="none" stroke="${H}" stroke-width="3.5" stroke-linecap="round"/><circle class="eye" cx="24" cy="-8" r="5" fill="${H}"/><path class="brow" d="M 12 -24 q 12 -6 22 0" fill="none" stroke="${H}" stroke-width="4.5" stroke-linecap="round"/><path class="mouth" d="M 24 22 q 8 2 14 -2" fill="none" stroke="${H}" stroke-width="4" stroke-linecap="round"/>`;
    if (o.hair === 'beanie') s += `<path d="M -50 -14 Q -52 -66 0 -68 Q 52 -66 50 -14 Z" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-52" y="-30" width="104" height="22" rx="9" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-52" y="-21" width="104" height="4" fill="${C.accent}"/><g fill="rgba(255,255,255,.16)" stroke="#E2E8F0" stroke-width="3"><circle cx="34" cy="-19" r="10"/><path d="M 24 -19 h -62" fill="none"/></g>`;
    else if (o.hair === 'short') s += `<path d="M -48 -8 Q -50 -60 0 -62 Q 50 -60 46 -22 Q 20 -38 -8 -32 Q -40 -26 -48 -8 Z" fill="${o.hairColor || COL.hairDark}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    else if (o.hair === 'cap') s += `<path d="M -48 -14 Q -50 -64 0 -66 Q 50 -64 48 -14 Z" fill="${o.hairColor || C.grey}" stroke="${H}" stroke-width="${SW}"/><path d="M 20 -22 h 54 q 8 0 6 8 l -60 2 z" fill="${o.hairColor || C.grey}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    s += `</g>`;
    s += armSvg('af', top, skin, 30);
    return s + `</g>`;
  }
  // Person framifrån, origo vid fötterna (höjd ≈ 340): ben + torso + armar + huvud
  function personFront(o) {
    const pants = o.pants || COL.pants;
    return `<g class="person front"><g transform="translate(0 -300)"><rect x="-70" y="200" width="56" height="112" rx="18" fill="${pants}" stroke="${H}" stroke-width="${SW}"/><rect x="14" y="200" width="56" height="112" rx="18" fill="${pants}" stroke="${H}" stroke-width="${SW}"/><rect x="-78" y="290" width="70" height="20" rx="8" fill="${H}"/><rect x="8" y="290" width="70" height="20" rx="8" fill="${H}"/>${torsoFront(o)}${armSvg('ar', o.top || COL.fleece, o.skin)}${armSvg('al', o.top || COL.fleece, o.skin)}<g class="headg" transform="translate(0 -58)">${headFront(o)}</g></g></g>`;
  }
  // Sten bakifrån (origo vid fötterna): rygg med reflexer, mössa, armar
  function stenBack() {
    let s = `<g class="person back">`;
    s += `<rect x="-62" y="-156" width="48" height="156" rx="18" fill="${COL.pants}" stroke="${H}" stroke-width="${SW}"/><rect x="14" y="-156" width="48" height="156" rx="18" fill="${COL.pants}" stroke="${H}" stroke-width="${SW}"/>`;
    s += `<path d="M -98 -300 L 98 -300 Q 112 -300 112 -286 L 104 -140 L -104 -140 L -112 -286 Q -112 -300 -98 -300 Z" fill="${COL.vest}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    s += `<g fill="#F8FAFC" opacity=".95"><rect x="-108" y="-230" width="216" height="16"/><rect x="-108" y="-200" width="216" height="16"/><rect x="-76" y="-298" width="16" height="70"/><rect x="60" y="-298" width="16" height="70"/></g>`;
    s += `<path d="M -98 -300 L -64 -300 L -64 -140 L -104 -140 L -112 -286 Q -112 -300 -98 -300 Z M 98 -300 L 64 -300 L 64 -140 L 104 -140 L 112 -286 Q 112 -300 98 -300 Z" fill="${COL.fleece}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round" opacity=".0"/>`;
    s += `<rect x="-16" y="-326" width="32" height="30" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/>`;
    s += `<g transform="translate(0 -364)"><circle r="50" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><ellipse cx="-50" cy="10" rx="9" ry="13" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><ellipse cx="50" cy="10" rx="9" ry="13" fill="${SK.sten}" stroke="${H}" stroke-width="${SW}"/><path d="M -54 -10 Q -56 -72 0 -74 Q 56 -72 54 -10 Z" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-57" y="-26" width="114" height="24" rx="10" fill="${COL.beanie}" stroke="${H}" stroke-width="${SW}"/><rect x="-57" y="-16" width="114" height="5" fill="${C.accent}"/><path d="M -56 -14 q -2 -14 10 -16 M 56 -14 q 2 -14 -10 -16" fill="none" stroke="#E2E8F0" stroke-width="3"/></g>`;
    s += armSvg('al', COL.fleece, SK.sten, 30) + armSvg('ar', COL.fleece, SK.sten, 30);
    return s + `</g>`;
  }
  const forkliftSvg = () => `<g class="fl"><rect x="-70" y="-120" width="130" height="92" rx="10" fill="#fff" stroke="${H}" stroke-width="5"/><rect x="-70" y="-120" width="130" height="14" fill="${COL.orange}"/><rect x="60" y="-196" width="14" height="196" fill="${H}"/><rect x="74" y="-14" width="96" height="10" fill="${H}"/><rect x="-44" y="-176" width="76" height="56" rx="8" fill="${C.tint}" stroke="${H}" stroke-width="4"/><circle cx="-10" cy="-150" r="18" fill="${SK.ro}" stroke="${H}" stroke-width="4"/><path d="M -28 -168 q 18 -14 36 0" fill="none" stroke="${H}" stroke-width="4"/><g fill="#fff" stroke="${H}" stroke-width="5"><circle cx="-40" cy="-6" r="22"/><circle cx="30" cy="-6" r="22"/></g><g class="honk" opacity="0" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round"><path d="M 96 -150 q 14 16 0 32"/><path d="M 112 -164 q 26 30 0 60"/></g></g>`;
  const RULES_SV = ['Varselväst och hjälm på hela området', 'Max 20 km/h på området', 'Stanna vid stopplinjen', 'Följ anvisad port', 'Motorn av vid lastning', 'Rökning förbjuden', 'Avvikelser anmäls i grinden'];
  const sheetSvg = () => `<g class="sheetg"><rect x="-156" y="-206" width="312" height="412" rx="8" fill="#fff" stroke="#CBD5E1" stroke-width="8"/><rect x="-150" y="-200" width="300" height="400" rx="4" fill="#fff" stroke="${H}" stroke-width="3"/><rect x="-150" y="-200" width="300" height="52" fill="${C.tint}"/>${txt(0, -164, 'SÄKERHETSREGLER', 29, { anchor: 'middle', ls: '0.02em' })}${RULES_SV.map((r, i) => `<circle cx="-126" cy="${-110 + i * 42}" r="12" fill="${C.accent}"/>${txt(-126, -105 + i * 42, String(i + 1), 14, { anchor: 'middle', fill: '#fff' })}${txt(-104, -104 + i * 42, r, 15.5, { w: 600, fill: C.text })}`).join('')}<path d="M -156 -206 l 312 412" stroke="#fff" stroke-width="2" opacity=".35"/></g>`;

  // ======================= Mallen =======================
  LUP.initSten = function (brand, film, opts = {}) {
    const fps = brand.format.fps, W = brand.format.width, Hh = brand.format.height;
    const beats = film.beats.map((b) => ({ ...b })); let acc = 0; beats.forEach((b) => { b.start = acc; acc += b.duration; b.end = acc; }); const total = acc;
    const byId = Object.fromEntries(beats.map((b) => [b.id, b]));
    const cta = Object.assign({}, brand.cta, film.cta || {});
    const brandEn = Object.assign({}, brand, { tagline: film.tagline || brand.tagline });
    const PLATE = film.plate || 'WGM 4521';

    const stage = document.querySelector('.stage');
    stage.innerHTML = ''; stage.style.width = W + 'px'; stage.style.height = Hh + 'px';
    const blobs = ['blob-1', 'blob-2', 'blob-3'].map((c) => stage.appendChild(U.el('div', 'blob ' + c)));

    // ---------- Världen (samma anläggning som hero-filmen, åtta portar) ----------
    const dawnEl = U.el('div', 'sten-dawn'); stage.appendChild(dawnEl);
    const view = U.el('div', 'hero-view'); const far = U.el('div', 'hero-layer far'), near = U.el('div', 'hero-layer near'); view.append(far, near); stage.appendChild(view);
    const svg = buildWorld(far, near, { docks: DOCKS, sign: 'PORT 1–8 →', width: 4600 });
    const statics = q(svg, '.statics'), trucksG = q(svg, '.trucks'), fxG = q(svg, '.fx'), arm = q(svg, '.arm');
    statics.insertAdjacentHTML('afterbegin', `<rect x="-1400" y="${WORLD.ground + 138}" width="7400" height="1800" fill="${C.tint2}"/>`);
    svg.insertAdjacentHTML('afterbegin', `<defs><linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FDE68A" stop-opacity=".6"/><stop offset="1" stop-color="#FDE68A" stop-opacity="0"/></linearGradient><clipPath id="winclip"><rect x="${GATE_X + 62}" y="${WORLD.ground - 174}" width="106" height="66"/></clipPath></defs>`);
    // större portskyltar (läsbara i vida bilder)
    qa(statics, '.dock').forEach((d, i) => { const x = DOCKS[i]; const pill = qa(d, 'rect')[2]; pill.setAttribute('x', x + 30); pill.setAttribute('width', DOCK_W - 60); pill.setAttribute('y', WORLD.ground - 262); pill.setAttribute('height', 56); pill.setAttribute('rx', 28); const t = q(d, 'text'); t.setAttribute('font-size', 42); t.setAttribute('y', WORLD.ground - 219); });
    // Sten i bodens fönster (mini), ovanpå boden men bakom lastbilarna
    const mini = add(statics, `<g class="mini" clip-path="url(#winclip)"><g class="minib" transform="translate(${GATE_X + 115} ${WORLD.ground - 104}) scale(0.4)">${torsoFront({ skin: SK.sten, vest: COL.vest })}${armSvg('ar', COL.fleece, SK.sten)}${armSvg('al', COL.fleece, SK.sten)}<g class="headg" transform="translate(0 -58)">${headFront({ skin: SK.sten, hair: 'beanie', stubble: true })}</g></g></g>`);
    const miniArms = { r: q(mini, '.ar'), l: q(mini, '.al') };
    const headlight = `<g class="hl" opacity="0"><circle cx="236" cy="-44" r="8" fill="#FDE68A"/><path d="M 238 -44 L 600 -130 L 600 40 Z" fill="url(#beam)"/></g>`;
    const PLATES = ['RKL 7712', 'LTV 203', 'KHM 918', 'ZTA 4410', 'BVG 77', 'ODR 5519', 'PJX 302', 'MRA 6681', 'GNT 140', 'SLK 9027', 'HWB 214', 'TFR 3368', 'QEL 905', 'XNA 7703', 'YDK 61', 'CPR 4482', 'NBH 330', 'UVE 1207', 'LKO 59', 'ASD 7841'];
    const queue = PLATES.map((p, i) => { const t = add(trucksG, truckSvg('q' + i, p, C.muted)); add(t, headlight); return t; });
    const t5a = add(trucksG, truckSvg('t5a', 'KHM 918', C.muted)), t5b = add(trucksG, truckSvg('t5b', 'ZTA 4410', C.muted));
    const parked = [0, 4].map((i) => add(trucksG, truckSvg('p' + i, ['RKL 7712', 'LTV 203'][i ? 1 : 0], C.accent)));
    const passer = add(trucksG, truckSvg('pass', 'ODR 5519', C.accent));
    const dar = add(trucksG, truckSvg('dar', PLATE, C.grey)); add(dar, headlight);
    add(dar, `<g class="drv"><circle cx="178" cy="-80" r="9" fill="${SK.dar}" stroke="${H}" stroke-width="3"/><path d="M 169 -84 q 9 -10 18 0" fill="${COL.hairDark}" stroke="${H}" stroke-width="2"/><rect x="170" y="-72" width="16" height="12" fill="${COL.red}"/></g>`);
    [...queue, t5a, t5b, dar, passer, ...parked].forEach((t) => (t.style.opacity = 0));
    // mini-telefoner i hytterna (scen 10) och tumme upp
    const miniPhone = (id, label) => add(fxG, `<g class="mphone ${id}" opacity="0"><rect x="-74" y="-128" width="148" height="92" rx="18" fill="#fff" stroke="${C.border}" stroke-width="4"/><path d="M -14 -38 L 0 -18 L 14 -38 Z" fill="#fff" stroke="${C.border}" stroke-width="4"/><rect x="-12" y="-42" width="24" height="8" fill="#fff"/><rect x="-62" y="-116" width="124" height="34" rx="17" fill="${C.accent}"/>${txt(0, -92, label, 21, { anchor: 'middle', fill: '#fff' })}<g transform="translate(0 -56)"><circle r="14" fill="${C.accent}"/><path d="M -6 0 l 4 4 l 8 -8" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g></g>`);
    const mp2 = miniPhone('mp2', 'Română'), mp3 = miniPhone('mp3', 'Lietuvių');
    const thumbB = add(fxG, `<g class="thumbb" opacity="0"><rect x="-44" y="-112" width="88" height="80" rx="18" fill="#fff" stroke="${C.border}" stroke-width="4"/><path d="M -12 -34 L 0 -16 L 12 -34 Z" fill="#fff" stroke="${C.border}" stroke-width="4"/><rect x="-10" y="-38" width="20" height="8" fill="#fff"/><g transform="translate(0 -70) scale(0.5)">${thumbSvg(1)}</g></g>`);
    // Sten gående + Dariusz vid rampen (scen 13), i världen
    const wSten = add(fxG, `<g class="wsten" opacity="0">${personSide({ skin: SK.sten, vest: COL.vest, hair: 'beanie', stubble: true })}</g>`);
    const wDar = add(fxG, `<g class="wdar" opacity="0"><g transform="scale(-1 1)">${personSide({ skin: SK.dar, vest: COL.red, top: '#334155', pants: COL.jeans, hair: 'short', pockets: true })}</g></g>`);
    const strap = add(fxG, `<g class="strap" opacity="0"><circle r="16" fill="${C.accent}" opacity=".25"/><circle r="7" fill="${C.accent}"/></g>`);

    // ---------- Scenlager ----------
    const S = {};
    const scene = (id) => { const d = U.el('div', 'sc sc-' + id); stage.appendChild(d); S[id] = d; return d; };

    // Scen 1 & 14: extrem närbild
    function buildFaceShot(id, hh, mm) {
      const el = scene(id);
      el.innerHTML = svgWrap(`<defs><linearGradient id="${id}-lg" x1="0" x2="1"><stop offset="0" stop-color="#DDEFFC"/><stop offset="1" stop-color="#F8FBFF"/></linearGradient></defs>
        <rect width="1080" height="1350" fill="url(#${id}-lg)"/>
        <g style="filter: blur(7px)" opacity=".92" transform="translate(70 230) scale(1.1)">${flipClock(id + 'c', hh, mm)}</g>
        <g class="body" transform="translate(540 1082) scale(6.4)">${torsoFront({ skin: SK.sten, vest: COL.vest })}</g>
        <g class="headg" transform="translate(540 700) scale(6.4)">${headFront({ skin: SK.sten, hair: 'beanie', stubble: true })}</g>
        <g class="mugg">${mugSvg(3.1)}<g class="steam" opacity="0" stroke="${C.grey}" stroke-width="6" fill="none" stroke-linecap="round"><path d="M -44 -166 q 22 -36 0 -72 q -22 -36 0 -72"/><path d="M 24 -186 q 22 -36 0 -72 q -22 -36 0 -72"/></g></g>`);
      return { el, head: q(el, '.headg .head'), headg: q(el, '.headg'), mug: q(el, '.mugg'), steam: q(el, '.steam') };
    }
    const F1 = buildFaceShot('intro', '06', '58'), F14 = buildFaceShot('fine', '07', '04');

    // Scen 3: genom skjutfönstret
    const W3 = (() => {
      const id = 'loves'; const el = scene(id);
      const refl = [0, 1, 2, 3, 4].map((i) => `<g transform="translate(${1060 - i * 236} 600) scale(-0.8 0.8)">${truckSvg('r' + i, '', C.grey)}</g>`).join('');
      el.innerHTML = svgWrap(`<defs><clipPath id="${id}-glass"><rect x="84" y="224" width="912" height="712" rx="10"/></clipPath></defs>
        <rect width="1080" height="1350" fill="${C.tint2}"/>
        <g class="push" transform-origin="540 650">
          <rect x="50" y="190" width="980" height="830" rx="22" fill="#fff" stroke="${H}" stroke-width="6"/>
          <rect x="84" y="224" width="912" height="712" rx="10" fill="#E6F3FC"/>
          <g clip-path="url(#${id}-glass)">
            <rect x="84" y="224" width="912" height="712" fill="#F4F9FD"/><rect x="84" y="224" width="912" height="40" fill="${C.tint}"/>
            <g class="sten" transform="translate(540 600) scale(2.3)">${torsoFront({ skin: SK.sten, vest: COL.vest })}${armSvg('ar', COL.fleece, SK.sten)}${armSvg('al', COL.fleece, SK.sten)}<g class="headg" transform="translate(0 -58)">${headFront({ skin: SK.sten, hair: 'beanie', stubble: true })}</g></g>
            <rect x="84" y="896" width="912" height="40" fill="#fff" stroke="${H}" stroke-width="4"/>
            <g class="landline" transform="translate(262 890) scale(1.35)">${phoneBaseSvg(1)}</g>
            <g class="mobile" transform="translate(540 884) rotate(90) scale(1.5)">${mobileSvg(1)}</g>
            <g class="radio" transform="translate(800 860) scale(1.45)">${radioSvg(1)}</g>
            <g class="refl" opacity=".13">${refl}</g>
          </g>
          <line x1="540" y1="224" x2="540" y2="936" stroke="${H}" stroke-width="4" opacity=".35"/>
        </g>`);
      const sten = q(el, '.sten');
      return { el, push: q(el, '.push'), head: q(sten, '.head'), ar: q(sten, '.ar'), al: q(sten, '.al'), landline: q(el, '.landline'), cradle: q(el, '.landline .cradle'), mobile: q(el, '.mobile') };
    })();

    // Scen 4: utanför fönstret, tre chaufförer
    const W4 = (() => {
      const id = 'languages'; const el = scene(id);
      const drv = [
        { x: 330, o: { skin: SK.dar, vest: COL.red, top: '#334155', pants: COL.jeans, hair: 'short', pockets: true }, say: 'Dzień dobry, brama trzy?' },
        { x: 690, o: { skin: SK.ro, vest: COL.orange, top: '#1F2937', pants: COL.pants, hair: 'cap', hairColor: '#4B5563' }, say: 'Unde descarc?' },
        { x: 1050, o: { skin: SK.lt, vest: COL.lime, top: '#3F3F46', pants: COL.jeans, hair: 'short', hairColor: COL.hairBrown }, say: 'Kur man važiuoti?' },
      ];
      el.innerHTML = svgWrap(`<defs><clipPath id="${id}-win"><rect x="424" y="304" width="752" height="312" rx="10"/></clipPath></defs>
        <rect width="1080" height="1350" fill="${C.bg}"/>
        <g class="wide">
          <rect x="-600" y="1040" width="2800" height="500" fill="${C.tint2}"/><rect x="-600" y="1036" width="2800" height="22" fill="${C.border}"/>
          <rect x="60" y="236" width="1480" height="30" rx="10" fill="${H}"/>
          <rect x="80" y="260" width="1440" height="790" rx="18" fill="#fff" stroke="${H}" stroke-width="6"/>
          <rect x="420" y="300" width="760" height="320" rx="12" fill="#E6F3FC" stroke="${H}" stroke-width="6"/>
          <g clip-path="url(#${id}-win)"><rect x="424" y="304" width="752" height="40" fill="${C.tint}"/><g class="sten" transform="translate(800 560) scale(1.6)">${torsoFront({ skin: SK.sten, vest: COL.vest })}${armSvg('ar', COL.fleece, SK.sten)}${armSvg('al', COL.fleece, SK.sten)}<g class="radiochin" transform="translate(0 -4) rotate(14)">${radioSvg(0.78)}</g><g class="headg" transform="translate(0 -58)">${headFront({ skin: SK.sten, hair: 'beanie', stubble: true })}</g></g></g>
          <line x1="800" y1="300" x2="800" y2="620" stroke="${H}" stroke-width="4" opacity=".4"/>
          <rect x="120" y="300" width="230" height="60" rx="12" fill="#fff" stroke="${H}" stroke-width="4"/>${txt(235, 342, 'GRIND 1', 30, { anchor: 'middle' })}
          ${drv.map((d, i) => `<g class="drv d${i}" transform="translate(${d.x} 1040) scale(0.95)">${personSide(d.o)}</g>`).join('')}
          ${drv.map((d, i) => bubble(d.x + 44, 1040 - 344 * 0.95 - 16, d.say, { cls: 'b' + i, size: 30 })).join('')}
        </g>`);
      const sten = q(el, '.sten');
      return { el, wide: q(el, '.wide'), head: q(sten, '.head'), headg: q(sten, '.headg'), ar: q(sten, '.ar'), al: q(sten, '.al'), radio: q(sten, '.radiochin'), drv: qa(el, '.drv'), bub: qa(el, '.bubble') };
    })();

    // Scen 6 / 8b / 12: över Stens axel mot skärmen
    function buildOts(id, variant) {
      const el = scene(id); const live = variant === 'live', alarm = variant === 'alarm';
      const [hh, mm] = live ? ['07', '03'] : alarm ? ['07', '00'] : ['06', '59'];
      const win = `<g clip-path="url(#${id}-win)"><rect x="430" y="110" width="420" height="340" fill="${C.bg}"/><rect x="430" y="382" width="420" height="68" fill="${C.tint2}"/><rect x="430" y="378" width="420" height="10" fill="${C.border}"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${446 + i * 96}" y="326" width="5" height="54" fill="${C.grey}" opacity=".45"/>`).join('')}<rect x="430" y="328" width="420" height="4" fill="${C.grey}" opacity=".4"/><rect x="430" y="356" width="420" height="4" fill="${C.grey}" opacity=".4"/>
        <path d="M 540 420 h 170 m -26 -16 l 26 16 l -26 16" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <g class="wrong" opacity="0">${truckSvg('w' + id, '', C.grey)}</g>
        ${live ? `<g class="winok" transform="translate(600 382) scale(0.42)">${truckSvg('wo' + id, 'LTV 203', C.accent)}</g>` : ''}</g>`;
      const screenOld = `<rect x="240" y="470" width="620" height="470" rx="18" fill="#CBD5E1" stroke="${H}" stroke-width="5"/><rect x="290" y="512" width="520" height="380" rx="6" fill="#F8FAFC" stroke="${H}" stroke-width="4"/><rect x="480" y="938" width="140" height="30" fill="#94A3B8" stroke="${H}" stroke-width="4"/><rect x="430" y="964" width="240" height="14" rx="6" fill="#94A3B8" stroke="${H}" stroke-width="4"/>`;
      const screenNew = `<rect x="250" y="470" width="600" height="440" rx="12" fill="${H}"/><rect x="262" y="482" width="576" height="416" rx="6" fill="#fff"/><rect x="520" y="908" width="60" height="44" fill="${H}"/><rect x="440" y="948" width="220" height="14" rx="7" fill="${H}"/>`;
      const cols = ['IN', 'UT', 'REG', 'PORT', 'SPRÅK?'], cx = [292, 372, 452, 582, 672], cw = [80, 80, 130, 90, 128];
      const rows = [['06:31', '07:12', 'GHI 654', '1', ''], ['06:40', '', 'JKL 987', '2', ''], ['06:52', '', 'KHM 918', '7?', 'PL?'], ['06:55', '', 'RKL 7712', '', 'RO?'], ['06:57', '', 'LTV 203', '5', '??']];
      const tabs = ['Blad1', 'Blad1 (2)', 'Kopia av Blad1', 'mars', 'mars (2)', 'april', 'FINAL', 'FINAL2', 'FINAL_v3'];
      let tx = 292; const tabsSvg = tabs.map((t) => { const w = t.length * 11 + 26; const s = `<rect x="${tx}" y="866" width="${w}" height="26" fill="${tx === 292 ? '#fff' : '#E2E8F0'}" stroke="${H}" stroke-width="2"/>${txt(tx + 12, 884, t, 14, { w: 600, fill: C.text })}`; tx += w + 2; return s; }).join('');
      const excel = `<g clip-path="url(#${id}-scr)"><rect x="290" y="512" width="520" height="26" fill="${C.tint}"/>${txt(300, 531, 'siffror_v3_FINAL(2).xlsx', 15, { w: 700 })}<g fill="${C.grey}"><circle cx="770" cy="525" r="5"/><circle cx="786" cy="525" r="5"/><circle cx="802" cy="525" r="5"/></g>
        <rect x="290" y="538" width="520" height="28" fill="#E2E8F0"/>${cols.map((c, i) => txt(cx[i] + 6, 558, c, 16, { w: 800 })).join('')}
        ${rows.map((r, ri) => `<line x1="290" y1="${566 + ri * 30}" x2="810" y2="${566 + ri * 30}" stroke="#E2E8F0" stroke-width="2"/>${r.map((v, i) => txt(cx[i] + 6, 587 + ri * 30, v, 16, { w: 600, fill: C.text })).join('')}`).join('')}
        ${cx.map((x) => `<line x1="${x}" y1="538" x2="${x}" y2="866" stroke="#E2E8F0" stroke-width="2"/>`).join('')}
        <line x1="290" y1="716" x2="810" y2="716" stroke="#E2E8F0" stroke-width="2"/><rect class="cur" x="292" y="718" width="78" height="26" fill="none" stroke="${C.accent}" stroke-width="3"/>
        ${cols.map((_, i) => txt(cx[i] + 6, 737, '', 16, { cls: 'cell c' + i, w: 600, fill: C.text })).join('')}
        ${tabsSvg}
        <g class="dialog" opacity="0"><rect x="380" y="640" width="340" height="124" rx="10" fill="#fff" stroke="${H}" stroke-width="3"/><rect x="380" y="640" width="340" height="30" rx="10" fill="#E2E8F0"/>${txt(396, 661, 'Kalkylark', 14, { w: 700 })}<circle cx="416" cy="708" r="16" fill="#FCA5A5" stroke="${H}" stroke-width="3"/>${txt(416, 714, '!', 20, { anchor: 'middle' })}${txt(444, 714, 'Autosave failed', 24, { w: 800 })}<rect x="610" y="730" width="96" height="26" rx="6" fill="${C.tint}" stroke="${H}" stroke-width="2"/>${txt(658, 749, 'Retry', 15, { anchor: 'middle', w: 700 })}</g></g>`;
      const liveUi = `<g clip-path="url(#${id}-scr2)"><rect x="262" y="482" width="576" height="46" fill="${C.tint2}"/>${txt(278, 513, 'LUP', 24, { fill: C.accent })}${txt(324, 513, 'NUMBER', 24)}${txt(455, 513, 'Site · live', 24)}<circle cx="790" cy="505" r="7" fill="${C.accent}"/>${txt(804, 512, 'Live', 18, { fill: C.accent, w: 700 })}
        <rect x="278" y="548" width="360" height="300" rx="10" fill="${C.tint2}" stroke="${C.border}" stroke-width="2"/>
        <rect x="278" y="660" width="360" height="52" fill="#E2E8F0"/><rect x="278" y="684" width="360" height="4" fill="#fff" opacity=".9"/>
        ${DOCKS.map((_, i) => `<rect x="${292 + i * 42}" y="562" width="34" height="48" rx="5" fill="${i === 2 ? C.accent : '#fff'}" stroke="${i === 2 ? C.accent : C.border}" stroke-width="2"/>${txt(309 + i * 42, 593, String(i + 1), 18, { anchor: 'middle', fill: i === 2 ? '#fff' : H })}`).join('')}
        ${[0, 4].map((i) => `<rect x="${288 + i * 42}" y="616" width="42" height="18" rx="9" fill="${C.accent}" opacity=".85"/>`).join('')}
        <rect x="372" y="616" width="42" height="18" rx="9" fill="${C.accent}"/>${txt(393, 646, PLATE, 12, { anchor: 'middle', w: 800 })}
        <rect x="300" y="668" width="40" height="18" rx="9" fill="${C.accent}"/>${txt(320, 731, 'Gate', 13, { anchor: 'middle', w: 700, fill: C.muted })}
        ${txt(292, 775, 'On site', 15, { w: 700, fill: C.muted })}${txt(292, 806, '4', 34, { fill: C.accent })}${txt(360, 775, 'At dock', 15, { w: 700, fill: C.muted })}${txt(360, 806, '3', 34, { fill: C.accent })}${txt(440, 775, 'Queue', 15, { w: 700, fill: C.muted })}${txt(440, 806, '0', 34, { fill: C.accent })}${txt(520, 775, 'Paper', 15, { w: 700, fill: C.muted })}${txt(520, 806, '0', 34, { fill: C.accent })}
        <g class="log">${[['06:58', 'IN', 'WGM 4521', 'Dock 3'], ['07:00', 'IN', 'RKL 7712', 'Dock 1'], ['07:02', 'IN', 'LTV 203', 'Dock 5'], ['07:03', 'OUT', 'GHI 654', '']].map((r, i) => `<g class="lrow" opacity="0"><rect x="652" y="${550 + i * 58}" width="178" height="50" rx="10" fill="${C.tint2}" stroke="${C.border}" stroke-width="2"/>${txt(664, 571 + i * 58, r[0] + ' · ' + r[1], 14, { w: 700, fill: C.muted })}${txt(664, 592 + i * 58, r[2] + (r[3] ? ' · ' + r[3] : ''), 15, { w: 800 })}</g>`).join('')}</g>
        <g class="report"><rect x="278" y="862" width="552" height="30" rx="15" fill="${C.tint}" stroke="${C.border}" stroke-width="2"/>${txt(554, 883, 'Report · today · building…', 16, { anchor: 'middle', w: 800, cls: 'rtext' })}</g></g>`;
      el.innerHTML = svgWrap(`<defs><clipPath id="${id}-win"><rect x="430" y="110" width="420" height="340" rx="8"/></clipPath><clipPath id="${id}-scr"><rect x="290" y="512" width="520" height="380" rx="6"/></clipPath><clipPath id="${id}-scr2"><rect x="262" y="482" width="576" height="416" rx="6"/></clipPath><clipPath id="${id}-door"><rect x="932" y="120" width="148" height="880"/></clipPath></defs>
        <rect width="1080" height="1350" fill="${C.tint2}"/>
        <g class="cam" transform-origin="550 700">
          <rect x="0" y="1150" width="1080" height="14" fill="${C.border}"/>
          <rect x="422" y="102" width="436" height="356" rx="12" fill="#fff" stroke="${H}" stroke-width="6"/>${win}
          <g transform="translate(96 126) scale(1.0)">${flipClock(id + 'c', hh, mm)}</g>
          <rect x="930" y="118" width="150" height="884" fill="${H}" opacity=".82"/><rect x="896" y="118" width="40" height="884" rx="6" fill="#fff" stroke="${H}" stroke-width="5"/>
          <g clip-path="url(#${id}-door)"><g class="mgr" transform="translate(1180 630)"><path d="M -70 60 L 70 60 L 120 120 L 120 420 L -120 420 L -120 120 Z" fill="${COL.shirt}" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/><path d="M -24 58 L -8 96 L 0 84 L 8 96 L 24 58" fill="#fff" stroke="${H}" stroke-width="${SW}" stroke-linejoin="round"/><g transform="scale(1.5)">${headFront({ skin: SK.man, hair: 'short', hairColor: COL.hairBrown, glasses: true })}</g></g></g>
          <rect x="0" y="950" width="1080" height="400" fill="#fff" stroke="${H}" stroke-width="5"/><rect x="0" y="950" width="1080" height="18" fill="${C.border}" opacity=".6"/>
          ${live ? screenNew + liveUi : screenOld + excel}
          <g transform="translate(330 985)"><rect x="0" y="0" width="460" height="86" rx="10" fill="#E2E8F0" stroke="${H}" stroke-width="4"/>${Array.from({ length: 36 }, (_, k) => `<rect x="${12 + (k % 12) * 37}" y="${10 + Math.floor(k / 12) * 24}" width="30" height="18" rx="4" fill="#fff" stroke="${H}" stroke-width="2"/>`).join('')}</g>
          ${live ? `<g transform="translate(850 1010) scale(1.2)">${mugSvg(1)}</g><g transform="translate(975 1002) scale(1.1)">${mobileSvg(1)}</g><g transform="translate(1030 1000) scale(1.0)">${radioSvg(1)}</g>` : `<g class="landline" transform="translate(850 1012) scale(1.3)">${phoneBaseSvg(1)}</g>${alarm ? `<g class="mobile" transform="translate(760 1004) scale(1.2)">${mobileSvg(1)}</g><g class="radio" transform="translate(690 996) scale(1.1)">${radioSvg(1)}</g>` : ''}`}
          ${live ? '' : `<path class="cord" d="M 836 1040 q 0 70 -60 76 c -40 4 -40 -30 -80 -26 c -40 4 -40 34 -80 30 c -40 -4 -40 -34 -80 -30 c -40 4 -40 34 -80 30 c -40 -4 -40 -34 -80 -30 q -40 6 -40 50" fill="none" stroke="${H}" stroke-width="5" stroke-linecap="round"/>`}
          <g class="ots" transform="translate(170 1270)"><path d="M -320 400 L -320 20 Q -320 -70 -230 -70 L 190 -70 Q 280 -70 280 20 L 280 400 Z" fill="${COL.fleece}" stroke="${H}" stroke-width="5"/><path d="M 60 -66 L 190 -70 Q 280 -70 280 20 L 280 400 L 60 400 Z" fill="${COL.vest}" stroke="${H}" stroke-width="5"/><rect x="60" y="60" width="220" height="26" fill="#F8FAFC" opacity=".95"/><rect x="60" y="120" width="220" height="26" fill="#F8FAFC" opacity=".95"/><rect x="150" y="-66" width="26" height="130" fill="#F8FAFC" opacity=".95"/>
            <rect x="-40" y="-120" width="80" height="60" fill="${SK.sten}" stroke="${H}" stroke-width="5"/>
            <g transform="translate(0 -250)"><circle r="170" fill="${SK.sten}" stroke="${H}" stroke-width="5"/><ellipse cx="166" cy="30" rx="22" ry="34" fill="${SK.sten}" stroke="${H}" stroke-width="5"/><path d="M -176 -30 Q -180 -238 0 -244 Q 180 -238 176 -30 Z" fill="${COL.beanie}" stroke="${H}" stroke-width="5"/><rect x="-184" y="-84" width="368" height="64" rx="26" fill="${COL.beanie}" stroke="${H}" stroke-width="5"/><rect x="-184" y="-56" width="368" height="12" fill="${C.accent}"/><path d="M 120 -52 q 50 -10 72 6" fill="none" stroke="#E2E8F0" stroke-width="5"/></g>
            ${live ? '' : `<g class="shoulderset" transform="translate(228 -92) rotate(62) scale(1.5)">${handsetSvg(1)}</g>`}
          </g>
          <g class="typearm"><polyline points="0,0 0,0 0,0" fill="none" stroke="${H}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/><polyline points="0,0 0,0 0,0" fill="none" stroke="${COL.fleece}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/><g class="hand"><circle r="32" fill="${SK.sten}" stroke="${H}" stroke-width="5"/><rect x="-10" y="-62" width="22" height="50" rx="11" fill="${SK.sten}" stroke="${H}" stroke-width="5"/></g></g>
          <g class="thumb" opacity="0" transform="translate(330 1000)">${thumbSvg(1.2)}</g>
          ${bubble(960, 560, 'Sten? The numbers by nine?', { cls: 'mb', size: 30, dx: -150 })}
        </g>`);
      return { el, cam: q(el, '.cam'), wrong: q(el, '.wrong'), mgr: q(el, '.mgr'), mgrHead: q(el, '.mgr .head'), bub: q(el, '.mb'), typearm: q(el, '.typearm'), thumb: q(el, '.thumb'), cells: qa(el, '.cell'), cur: q(el, '.cur'), dialog: q(el, '.dialog'), landline: q(el, '.landline'), mobile: q(el, '.mobile'), radio: q(el, '.radio'), lrows: qa(el, '.lrow'), report: q(el, '.report'), rtext: q(el, '.rtext'), clock: q(el, '.clock'), live };
    }
    const O6 = buildOts('numbers', 'excel'), O8 = buildOts('tenmoreB', 'alarm'), O12 = buildOts('live', 'live');

    // Scen 7: tvåbild i profil med lappen
    const W7 = (() => {
      const id = 'safety'; const el = scene(id);
      el.innerHTML = svgWrap(`<rect width="1080" height="1350" fill="${C.bg}"/>
        <g class="zoom" transform-origin="545 640">
          <g class="bgd">
            <rect x="-800" y="1000" width="2700" height="700" fill="${C.tint2}"/><rect x="-800" y="996" width="2700" height="22" fill="${C.border}"/>
            <g opacity=".9"><rect x="700" y="690" width="1200" height="310" fill="#fff" stroke="${H}" stroke-width="5"/><rect x="700" y="690" width="1200" height="20" fill="${H}" opacity=".15"/>${[0, 1, 2, 3].map((i) => `<rect x="${760 + i * 280}" y="790" width="190" height="210" rx="6" fill="${C.tint}" stroke="${H}" stroke-width="4"/><rect x="${800 + i * 280}" y="740" width="110" height="36" rx="18" fill="#fff" stroke="${H}" stroke-width="3"/>${txt(855 + i * 280, 766, 'PORT ' + (i + 1), 20, { anchor: 'middle' })}`).join('')}</g>
            ${Array.from({ length: 26 }, (_, i) => `<rect x="${-800 + i * 100}" y="880" width="6" height="120" fill="${C.grey}" opacity=".45"/>`).join('')}<rect x="-800" y="890" width="1500" height="5" fill="${C.grey}" opacity=".4"/><rect x="-800" y="950" width="1500" height="5" fill="${C.grey}" opacity=".4"/>
            <rect x="20" y="760" width="28" height="240" rx="6" fill="#fff" stroke="${H}" stroke-width="5"/><rect x="-300" y="786" width="330" height="18" rx="9" fill="#fff" stroke="${H}" stroke-width="5"/><rect x="-260" y="789" width="40" height="12" fill="${H}"/><rect x="-180" y="789" width="40" height="12" fill="${H}"/><rect x="-100" y="789" width="40" height="12" fill="${H}"/>
            <g class="forklift" opacity="0"><g transform="scale(-0.8 0.8)">${forkliftSvg()}</g></g>
            <g class="visitor" opacity="0">${personSide({ skin: SK.vis, top: '#94A3B8', pants: COL.jeans, hair: 'short', hairColor: '#6B7280' })}</g>
          </g>
          <g class="dar" transform="translate(770 1000) scale(1.9)"><g transform="scale(-1 1)">${personSide({ skin: SK.dar, vest: COL.red, top: '#334155', pants: COL.jeans, hair: 'short', pockets: true })}</g></g>
          <g class="sten" transform="translate(330 1000) scale(1.9)">${personSide({ skin: SK.sten, vest: COL.vest, hair: 'beanie', stubble: true })}</g>
          <g class="belt" transform="translate(372 690) rotate(-8)">${radioSvg(0.9)}</g>
          <g class="sheet" transform="translate(545 640) rotate(-3)">${sheetSvg()}</g>
          <g class="parm"><polyline points="0,0 0,0 0,0" fill="none" stroke="${H}" stroke-width="66" stroke-linecap="round" stroke-linejoin="round"/><polyline points="0,0 0,0 0,0" fill="none" stroke="${COL.fleece}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/><g class="hand"><circle r="32" fill="${SK.sten}" stroke="${H}" stroke-width="5"/><rect x="10" y="-11" width="58" height="22" rx="11" fill="${SK.sten}" stroke="${H}" stroke-width="5"/></g></g>
        </g>`);
      const sten = q(el, '.sten'), darg = q(el, '.dar');
      return { el, zoom: q(el, '.zoom'), forklift: q(el, '.forklift'), honk: q(el, '.honk'), visitor: q(el, '.visitor'), visLegs: [q(el, '.visitor .lb'), q(el, '.visitor .lf')], visArms: [q(el, '.visitor .ab'), q(el, '.visitor .af')], sten, stenHead: q(sten, '.head'), stenArms: { ab: q(sten, '.ab'), af: q(sten, '.af') }, darHead: q(darg, '.head'), darArms: { ab: q(darg, '.ab'), af: q(darg, '.af') }, parm: q(el, '.parm'), belt: q(el, '.belt') };
    })();

    // Scen 8c + 9: klockan, Sten, Dariusz i fönstret
    function buildClockShot(id, host) {
      host.innerHTML = svgWrap(`<defs><clipPath id="${id}-win"><rect x="694" y="524" width="352" height="392" rx="8"/></clipPath><radialGradient id="${id}-glow"><stop offset="0" stop-color="${C.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient></defs>
        <rect width="1080" height="1350" fill="${C.tint2}"/>
        <g class="cam">
          <rect x="0" y="1150" width="1080" height="14" fill="${C.border}"/>
          <g transform="translate(260 180) scale(2.2)">${flipClock(id + 'c', '07', '00')}</g>
          <rect x="686" y="516" width="368" height="408" rx="12" fill="#fff" stroke="${H}" stroke-width="6"/>
          <g clip-path="url(#${id}-win)"><rect x="694" y="524" width="352" height="392" fill="${C.bg}"/><rect x="694" y="850" width="352" height="70" fill="${C.tint2}"/><rect x="694" y="846" width="352" height="10" fill="${C.border}"/>
            <g transform="translate(1000 846) scale(0.5)">${truckSvg('cw' + id, PLATE, C.grey)}</g>
            <g class="darw" transform="translate(860 866) scale(0.86)">${personFront({ skin: SK.dar, vest: COL.red, top: '#334155', pants: COL.jeans, hair: 'short' })}</g>
            <circle class="glow" cx="860" cy="700" r="150" fill="url(#${id}-glow)" opacity="0"/>
            <g class="dphone" transform="translate(860 700) rotate(-10) scale(1.25)">${mobileSvg(1, true)}</g>
          </g>
          <g class="sten" transform="translate(400 1000) scale(2.2)">${torsoFront({ skin: SK.sten, vest: COL.vest })}${armSvg('ar', COL.fleece, SK.sten)}${armSvg('al', COL.fleece, SK.sten)}<g class="headg" transform="translate(0 -58)">${headFront({ skin: SK.sten, hair: 'beanie', stubble: true })}</g></g>
        </g>`);
      const sten = q(host, '.sten'), darw = q(host, '.darw');
      return { el: host, cam: q(host, '.cam'), clock: q(host, '.clock'), head: q(sten, '.head'), ar: q(sten, '.ar'), al: q(sten, '.al'), darHead: q(darw, '.head'), darArms: { r: q(darw, '.ar'), l: q(darw, '.al') }, glow: q(host, '.glow') };
    }
    const sc8c = scene('tenmoreC'); const K8 = buildClockShot('k8', sc8c);
    const scF = scene('freeze'); const fw = U.el('div', 'freeze-wrap'); scF.appendChild(fw);
    const cGrey = U.el('div', 'copy grey'), cCol = U.el('div', 'copy color'); fw.append(cGrey, cCol);
    const KG = buildClockShot('kg', cGrey), KC = buildClockShot('kc', cCol);
    cGrey.style.filter = 'grayscale(1) contrast(.92) brightness(1.04)';
    const sc8a = scene('tenmoreA'); // världen (ingen egen DOM)
    const scDock = scene('dock'); scDock.innerHTML = svgWrap(`<g class="back" transform="translate(430 1420) scale(2.0)">${stenBack()}</g>`);
    const B5 = { el: scDock, g: q(scDock, '.back'), al: q(scDock, '.al'), ar: q(scDock, '.ar') };
    // Världsscener utan egen DOM får tomma lager (för enhetlig hantering)
    ['fleet', 'checkin', 'before', 'realjob'].forEach((id) => scene(id));

    // ---------- Gemensamma DOM-lager ----------
    const dim = U.el('div', 'hero-dim'); stage.appendChild(dim);
    const split = U.el('div', 'split-left'); split.innerHTML = '<div class="split-label">Kierowca · WGM 4521</div>'; stage.appendChild(split);
    const phoneRoot = U.el('div', 'hero-phone'); stage.appendChild(phoneRoot); const ph = buildPhone(phoneRoot);
    const LANGS = ['Polski', 'Română', 'Lietuvių', 'English', 'Svenska', 'Deutsch', 'Українська', 'Latviešu', '+18'];
    ph.langs.innerHTML = LANGS.map((l) => `<div class="ph-chip" data-l="${l}">${l}</div>`).join(''); ph.chips = qa(phoneRoot, '.ph-chip');
    q(phoneRoot, '.ph-site').textContent = 'Gate 1';
    const tapEl = U.el('div', 'hero-tap'); stage.appendChild(tapEl);
    const stamp = U.el('div', 'sten-stamp', '06:58'); stage.appendChild(stamp);
    const rubber = U.el('div', 'sten-rubber', 'according to management'); stage.appendChild(rubber);
    const titleCard = U.el('div', 'sten-title', 'This is Sten.'); stage.appendChild(titleCard);
    const outroLayer = U.el('div', 'phase phase-outro'); outroLayer.style.zIndex = 7; stage.appendChild(outroLayer);
    const outroSeek = LUP.outro(outroLayer, brandEn, cta);
    let cueList = null, cueBox = null, cueEl = null;
    if (opts.captions !== false && LUP.captions) {
      cueList = LUP.captions.cuesFromScript(beats.map((b) => ({ key: b.id, start: b.start, end: b.end, text: b.en, cues: b.cues })), brand.captions);
      cueBox = U.el('div', 'captions'); cueBox.style.zIndex = 8; cueEl = U.el('div', 'cue', ''); cueBox.appendChild(cueEl); stage.appendChild(cueBox);
    }

    // ---------- Hjälpare ----------
    let camera = { x: 600, s: 1, g: 1010 };
    const lerpCam = (a, b, p) => ({ x: U.lerp(a.x, b.x, p), s: U.lerp(a.s, b.s, p), g: U.lerp(a.g ?? 1010, b.g ?? 1010, p) });
    const applyCamera = (cam) => {
      const cx = 540, g = cam.g ?? 1010;
      near.style.transform = `translate(${cx - (cam.x + 600) * cam.s}px, ${g - WORLD.ground * cam.s}px) scale(${cam.s})`;
      const fs = cam.s * 0.9, fx = cam.x * 0.55 + 260;
      far.style.transform = `translate(${cx - (fx + 400) * fs}px, ${g - 10 - WORLD.ground * fs}px) scale(${fs})`;
    };
    const worldToStage = (wx, wy, cam) => ({ x: 540 + (wx - cam.x) * cam.s, y: (cam.g ?? 1010) + (wy - WORLD.ground) * cam.s });
    const DOCK_DY = -70, DOCK_S = 0.86;
    const place = (el, xFront, depth = 0) => { const sc = U.lerp(1, DOCK_S, depth); tr(el, xFront - TRUCK_LEN * sc, WORLD.ground + DOCK_DY * depth, sc); };
    const show = (el, v) => { el.style.opacity = v; };
    const toneWorld = (p, dawn) => { near.style.setProperty('color', U.mix(C.muted, C.accent, p)); far.style.opacity = U.lerp(0.75, 1, p); qa(trucksG, '.hl').forEach((h) => h.setAttribute('opacity', dawn)); };
    const phoneState = { screen: null };
    const showPhone = (vis, scale, originX = 540, originY = 760) => {
      phoneRoot.style.opacity = vis; phoneRoot.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
      const s = U.lerp(0.18, 0.95, scale), x = U.lerp(originX, 560, scale), y = U.lerp(originY, 760, scale);
      phoneRoot.style.transform = `translate(${x - 210 * s}px, ${y - 410 * s}px) scale(${s})`;
    };
    const phoneFixed = (vis, x, y, s) => { phoneRoot.style.opacity = vis; phoneRoot.style.visibility = vis > 0.001 ? 'visible' : 'hidden'; phoneRoot.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
    const tap = (vis, x, y) => { tapEl.style.opacity = vis; tapEl.style.transform = `translate(${x - 30}px, ${y - 30}px) scale(${U.lerp(0.6, 1.1, vis)})`; };
    const EN = { title: 'Check-in', plate: 'Registration number', lang: 'Choose language', next: 'Next' };
    const phoneScreen = (mode) => {
      if (phoneState.screen === mode) return; phoneState.screen = mode;
      const sh = (el, on) => (el.style.display = on ? '' : 'none');
      sh(ph.field, mode === 'plate' || mode === 'lang'); sh(ph.langs, mode === 'lang'); sh(ph.rules, mode === 'pl' || mode === 'before'); sh(ph.route, false); sh(ph.btn, true);
      ph.title.textContent = mode === 'plate' || mode === 'lang' ? EN.title : mode === 'before' ? 'Rampa 3 →' : PL.title;
      ph.label.textContent = mode === 'plate' ? EN.plate : mode === 'lang' ? EN.lang : PL.safety;
      ph.btn.textContent = mode === 'plate' ? EN.next : mode === 'lang' ? EN.next : mode === 'before' ? PL.confirm : PL.next;
      ph.btn.className = 'ph-btn'; ph.title.style.fontSize = mode === 'before' ? '56px' : ''; ph.title.style.color = mode === 'before' ? C.accent : '';
      if (mode !== 'before') ph.ruleEls.forEach((r) => r.classList.remove('on'));
    };
    const ringAnim = (el, on, t, amp = 5) => { if (!el) return; const r = q(el, '.rings'); if (r) setO(r, on ? (Math.sin(t * 34) > 0 ? 1 : 0.35) : 0); el.style.transform = on ? `rotate(${(Math.sin(t * 72) * amp).toFixed(2)}deg)` : ''; };
    const walk = (legs, arms, t, speed = 1.6, amp = 26, armAmp = 18) => { const ph_ = Math.sin(t * Math.PI * 2 * speed); if (legs[0]) setT(legs[0], `rotate(${(ph_ * amp).toFixed(2)})`); if (legs[1]) setT(legs[1], `rotate(${(-ph_ * amp).toFixed(2)})`); return ph_; };
    const sideArmsIdle = (g, swing = 0) => { const ab = q(g, '.ab'), af = q(g, '.af'); if (ab) setArm(ab, { x: -10, y: -282 }, { x: -22 + swing, y: -124 }, 90, 86, -1); if (af) setArm(af, { x: 10, y: -282 }, { x: 20 - swing, y: -124 }, 90, 86, 1); };
    const sideArmsPockets = (g) => { const ab = q(g, '.ab'), af = q(g, '.af'); if (ab) setArm(ab, { x: -10, y: -282 }, { x: -2, y: -154 }, 90, 86, -1); if (af) setArm(af, { x: 10, y: -282 }, { x: 28, y: -150 }, 90, 86, 1); };

    // ---------- Ljudhändelser (absoluta tider) ----------
    const B = Object.fromEntries(beats.map((b) => [b.id, b.start]));
    const events = [];
    const ev = (t, sfx, gain = 0) => events.push({ t: +t.toFixed(2), sfx, gain });
    [[0.4, 'chirp', -14], [1.1, 'beeper', -24], [0.2, 'truck_idle', -20], [2.85, 'ring', -8]].forEach(([t, s, g]) => ev(B.intro + t, s, g));
    [[0.0, 'truck_idle', -10], [0.4, 'beeper', -14], [0.9, 'beeper', -18], [1.5, 'air_brake', -10], [1.8, 'beeper', -16], [2.5, 'ring', -16], [2.9, 'beeper', -18], [3.7, 'ring', -16], [3.9, 'air_brake', -14], [4.4, 'beeper', -20]].forEach(([t, s, g]) => ev(B.fleet + t, s, g));
    [[0.0, 'ring', -6], [1.2, 'ring', -6], [1.95, 'tick', -10], [2.4, 'cup', -6], [2.8, 'ring_mobile', -8]].forEach(([t, s, g]) => ev(B.loves + t, s, g));
    [[0.3, 'ring', -10], [0.9, 'ring_mobile', -8], [1.6, 'radio', -8], [2.3, 'ring', -10], [2.6, 'ring_mobile', -8], [3.0, 'radio', -8], [3.5, 'ring', -10], [4.1, 'ring_mobile', -8]].forEach(([t, s, g]) => ev(B.languages + t, s, g));
    [[0.3, 'beeper', -8], [1.2, 'beeper', -8], [1.9, 'air_brake', -6], [2.7, 'beeper', -10], [3.5, 'air_brake', -8]].forEach(([t, s, g]) => ev(B.dock + t, s, g));
    [[0.25, 'typing', -8], [1.85, 'typing', -8], [2.0, 'beeper', -18], [3.45, 'typing', -8]].forEach(([t, s, g]) => ev(B.numbers + t, s, g));
    [[1.3, 'horn', -8], [2.6, 'radio', -6], [3.4, 'radio', -6], [4.6, 'horn', -12], [5.6, 'radio', -4]].forEach(([t, s, g]) => ev(B.safety + t, s, g));
    [[0.0, 'cam_move', -10], [0.2, 'beeper', -14], [0.6, 'beeper', -16], [1.0, 'beeper', -18], [1.35, 'ring', -6], [1.45, 'ring_mobile', -6], [1.6, 'radio', -6], [1.9, 'beep', -8], [2.95, 'tick', -4], [3.05, 'ring', -12], [3.45, 'ring_mobile', -14]].forEach(([t, s, g]) => ev(B.tenmore + t, s, g));
    [[0.0, 'truck_idle', -16], [1.4, 'tick', -8], [2.8, 'tick', -8], [3.3, 'confirm', -8], [4.9, 'confirm', -10], [5.5, 'confirm', -10]].forEach(([t, s, g]) => ev(B.checkin + t, s, g));
    [[0.4, 'tick', -8], [0.8, 'tick', -8], [1.2, 'tick', -8], [1.6, 'tick', -8], [1.2, 'gate_open', -4], [2.0, 'confirm', -8], [2.4, 'truck_pass', -10]].forEach(([t, s, g]) => ev(B.before + t, s, g));
    [[2.2, 'confirm', -10]].forEach(([t, s, g]) => ev(B.live + t, s, g));
    [[0.2, 'steps', -8], [2.4, 'truck_pass', -12], [3.6, 'beep', -14]].forEach(([t, s, g]) => ev(B.realjob + t, s, g));
    [[0.5, 'beeper', -22], [1.9, 'logo', -8]].forEach(([t, s, g]) => ev(B.fine + t, s, g));
    events.sort((a, b) => a.t - b.t);

    // ---------- Scenuppdateringar ----------
    const stenMugArm = (armEl, S, Hd, a, b, bend, rot, mugScale) => { held(armEl, mugSvg(mugScale)); setArm(armEl, S, Hd, a, b, bend, rot); };
    const SH_R = { x: -84, y: 22 }, SH_L = { x: 84, y: 22 }; // axlar (torsoFront-koordinater)

    function faceShot(F, l, d, which) {
      if (which === 'intro') {
        const rise = U.easeInOut(U.prog(l, 0.25, 2.55));
        setT(F.mug, `translate(${U.lerp(800, 648, rise).toFixed(1)} ${U.lerp(1540, 1072, rise).toFixed(1)}) rotate(${U.lerp(-3, -9, rise).toFixed(1)})`);
        setO(F.steam, (0.5 * U.prog(l, 0.9, 0.6) * (1 - rise * 0.4)).toFixed(3)); qa(F.steam, 'path').forEach((p, i) => setT(p, `translate(0 ${(-((l * 60 + i * 30) % 70)).toFixed(1)})`));
        face(F.head, { blink: blinkAt(l, [1.35]), brow: [0, 0], smile: 0, ex: 0, ey: 0 });
        setT(F.headg, `translate(540 ${(700 + Math.sin(l * 1.2) * 2).toFixed(1)}) scale(6.4)`);
      } else {
        const rise = U.easeInOut(U.prog(l, 0.0, 0.5)), sip = U.prog(l, 0.6, 0.6, U.easeInOut), down = U.prog(l, 1.25, 0.3, U.easeInOut);
        const tilt = Math.sin(Math.PI * sip) * 1; // 0→1→0
        setT(F.mug, `translate(${U.lerp(760, 648, rise).toFixed(1)} ${(U.lerp(1400, 1072, rise) - tilt * 26 + down * 30).toFixed(1)}) rotate(${(-9 - tilt * 26).toFixed(1)})`);
        setO(F.steam, 0);
        const cold = U.prog(l, 1.2, 0.18) * (1 - U.prog(l, 1.5, 0.3)); // kort rynkning: kaffet är kallt
        const smile = U.prog(l, 1.5, 0.45, U.easeOut) * 0.75;
        face(F.head, { blink: Math.max(sip > 0.1 && sip < 0.9 ? 1 : 0, blinkAt(l, [2.5])), brow: [-0.6 * cold + 0.4 * smile, -0.6 * cold + 0.15 * smile], smile, ex: 0, ey: 0 });
        setT(F.headg, `translate(540 ${(700 - tilt * 10).toFixed(1)}) scale(6.4) rotate(${(-tilt * 2).toFixed(2)})`);
      }
    }

    function windowShot(l, d, t) {
      const W = W3; const picked = l >= 2.0;
      const toPhone = U.prog(l, 1.72, 0.28, U.easeInOut), toEar = U.prog(l, 2.0, 0.35, U.easeInOut);
      const hr = toEar > 0 ? { x: U.lerp(-122, -60, toEar), y: U.lerp(125, -46, toEar) } : { x: U.lerp(-112, -122, toPhone), y: U.lerp(150, 125, toPhone) };
      held(W.ar, picked ? handsetSvg(0.55) : ''); setArm(W.ar, SH_R, hr, 100, 96, 1, picked ? U.lerp(0, 68, toEar) : 0);
      W.cradle.style.opacity = picked ? 0 : 1;
      const setDown = U.prog(l, 2.35, 0.35, U.easeInOut);
      stenMugArm(W.al, SH_L, { x: U.lerp(68, 84, setDown), y: U.lerp(58, 94, setDown) }, 100, 96, -1, 0, 0.62);
      let ex = 0, ey = 0;
      if (between(l, 0.25, 0.75)) { ex = -6; ey = 4; } else if (between(l, 0.95, 1.4)) { ex = 6; ey = 5; } else if (between(l, 1.45, 1.95)) { ex = -6; ey = 4; }
      const browUp = U.prog(l, 2.05, 0.25, U.easeOut) * 0.75;
      face(W.head, { blink: Math.max(blinkAt(l, [0.9]), blinkAt(l, [2.2], 0.42)), brow: [browUp, 0], smile: U.prog(l, 2.4, 0.4) * 0.25, ex, ey });
      ringAnim(W.landline, l < 1.95, t, 4); ringAnim(W.mobile, l >= 2.75, t, 6);
      const push = 1 + 0.06 * U.prog(l, d - 0.67, 0.67, U.easeInOut); setT(W.push, `scale(${push.toFixed(4)})`);
    }

    function outsideShot(l, d, t) {
      const W = W4;
      const tx = U.lerp(40, -356, U.easeInOut(U.prog(l, 0.1, 2.7))) + U.lerp(0, 50, U.easeInOut(U.prog(l, 4.4, 0.6)));
      setT(W.wide, `translate(${tx.toFixed(1)} -120) scale(1.12)`);
      const nod = Math.sin(t * 7) * 3; setT(W.headg, `translate(0 -58) rotate(${nod.toFixed(2)})`);
      const point = U.prog(l, 4.35, 0.45, U.easeInOut);
      held(W.ar, handsetSvg(0.6)); setArm(W.ar, SH_R, { x: U.lerp(-62, -168, point), y: U.lerp(-44, -40, point) }, 100, 96, 1, U.lerp(-62, -10, point));
      held(W.al, mobileSvg(0.95)); setArm(W.al, SH_L, { x: 62, y: -44 }, 100, 96, -1, 18);
      ringAnim(q(W.ar, '.handset'), true, t, 4); ringAnim(q(W.al, '.mobile'), l > 0.8, t, 5); ringAnim(W.radio, l > 1.6, t + 1, 4);
      face(W.head, { blink: blinkAt(l, [1.2, 3.9]), brow: [0, l > 3.0 ? 0.5 : 0], smile: 0.15, ex: l < 2.7 ? -3 : 0, ey: 3 });
      W.drv.forEach((g, i) => { const hd = q(g, '.head'); setT(hd, `translate(0 -344) rotate(${nodAt(l, [0.6 + i * 0.7, 3.0 + i * 0.3], 6, 0.5).toFixed(2)})`); if (i === 0) sideArmsPockets(g); else sideArmsIdle(g); });
      W.bub.forEach((bb, i) => { const p = U.prog(l, 0.35 + i * 0.7, 0.4, U.back); setO(bb, Math.min(1, p * 2)); setT(bb, `scale(${Math.max(0.01, p).toFixed(3)})`); });
    }

    const TYPE_STR = '06:58\tWGM 4521\t3'; const TAPS = []; [0.25, 1.85, 3.45].forEach((s) => { for (let k = 0; k < 6; k++) TAPS.push(s + k * 0.22); });
    function otsShot(O, l, d, t, variant) {
      const alarm = variant === 'alarm', live = variant === 'live';
      const jitter = alarm ? { x: Math.sin(t * 23) * 4 + Math.sin(t * 7.3) * 3, y: Math.cos(t * 19) * 3 } : { x: 0, y: 0 };
      const sc = alarm ? 1 + 0.1 * U.prog(l, 0, 1.3, U.easeIn) : live ? 1 + 0.05 * U.prog(l, 0, d, U.easeInOut) : 1 + 0.07 * U.prog(l, 0, d, U.easeInOut);
      setT(O.cam, `translate(${jitter.x.toFixed(2)} ${jitter.y.toFixed(2)}) scale(${sc.toFixed(4)})`);
      // chefen i dörren
      let mgrIn = 0, nod = 0;
      if (variant === 'excel') { mgrIn = U.prog(l, 0.7, 0.4, U.easeOut) * (1 - U.prog(l, 3.6, 0.4, U.easeIn)); }
      else if (alarm) { mgrIn = U.prog(l, 0.15, 0.3, U.easeOut); nod = 0; }
      else { mgrIn = U.prog(l, 1.4, 0.4, U.easeOut) * (1 - U.prog(l, 3.1, 0.4, U.easeIn)); nod = nodAt(l, [2.2, 2.55], 7, 0.35); }
      setT(O.mgr, `translate(${U.lerp(1180, 1000, mgrIn).toFixed(1)} 630) rotate(${(-10 * mgrIn + nod).toFixed(2)})`);
      face(O.mgrHead, { blink: blinkAt(l, [2.0]), brow: live ? [0.3, 0.3] : [0.6, 0.1], smile: live ? 0.5 : -0.2, ex: live ? -4 : -5, ey: live ? 3 : 1 });
      const bp = variant === 'excel' ? U.prog(l, 1.05, 0.35, U.back) * (1 - U.prog(l, 3.3, 0.3)) : 0; setO(O.bub, Math.min(1, bp * 2)); setT(O.bub, `scale(${Math.max(0.01, bp).toFixed(3)})`);
      // skrivande finger / tumme upp
      if (!live) {
        let n = 0; for (const tt of TAPS) if (l >= tt) n++;
        const chars = TYPE_STR.slice(0, n).split('\t'); O.cells.forEach((c, i) => { const v = chars[i] || ''; if (c.textContent !== v) c.textContent = v; });
        const curCol = Math.min(chars.length - 1, 4); O.cur.setAttribute('x', [292, 372, 452, 582, 672][curCol]); O.cur.setAttribute('width', [78, 78, 128, 88, 126][curCol]);
        const k = Math.max(0, n - 1), key = { x: 360 + ((k * 7) % 11) * 37, y: 1003 + ((k * 5) % 3) * 24 }; let dip = 0; const last = TAPS[n - 1]; if (last != null && l - last < 0.09) dip = 1 - (l - last) / 0.09;
        const S = { x: 330, y: 1190 }, Hd = { x: key.x, y: key.y - 30 + dip * 10 }; const e = ik(S, Hd, 190, 180, -1);
        qa(O.typearm, 'polyline').forEach((p) => p.setAttribute('points', `${S.x},${S.y} ${e.ex.toFixed(1)},${e.ey.toFixed(1)} ${e.hx.toFixed(1)},${e.hy.toFixed(1)}`)); setT(q(O.typearm, '.hand'), `translate(${e.hx.toFixed(1)} ${e.hy.toFixed(1)}) rotate(-12)`);
        const th = variant === 'excel' ? U.prog(l, 2.25, 0.35, U.back) * (1 - U.prog(l, 3.6, 0.3)) : 0; setO(O.thumb, Math.min(1, th * 2)); setT(O.thumb, `translate(330 ${(1150 - 150 * th).toFixed(1)})`);
        const wrongP = U.prog(l, 2.0, 2.6); setO(O.wrong, wrongP > 0 && wrongP < 1 ? 1 : 0); setT(O.wrong, `translate(${U.lerp(1040, 330, wrongP).toFixed(1)} 382) scale(-0.5 0.5)`);
        if (alarm) { setO(O.dialog, Math.sin(t * 14) > 0 ? 1 : 0.4); ringAnim(O.landline, true, t, 4); ringAnim(O.mobile, true, t + 0.4, 6); ringAnim(O.radio, true, t + 0.8, 5); } else { setO(O.dialog, 0); ringAnim(O.landline, false, t); }
      } else {
        O.typearm.style.opacity = 0; setO(O.thumb, 0);
        O.lrows.forEach((r, i) => setO(r, U.prog(l, 0.5 + i * 0.55, 0.3)));
        const ready = l >= 2.2; const v = ready ? 'Report · today · ready ✓' : 'Report · today · building…'; if (O.rtext.textContent !== v) O.rtext.textContent = v;
        q(O.report, 'rect').setAttribute('fill', ready ? C.accent : C.tint); O.rtext.setAttribute('fill', ready ? '#fff' : H);
      }
    }

    const POINT_T = [0.6, 1.02, 1.44, 1.86, 2.28, 2.7, 4.3]; // punkt 1–6 i följd, punkt 7 lite senare
    function twoShot(l, d, t) {
      const W = W7; const z = U.lerp(1.14, 0.84, U.easeInOut(U.prog(l, 4.0, 2.0))); setT(W.zoom, `scale(${z.toFixed(4)})`);
      // Sten håller lappen med främre handen; bakre armen ersätts av pekarmen (ritas framför lappen)
      const af = W.stenArms.af; setArm(af, { x: 10, y: -282 }, { x: 28, y: -180 }, 90, 86, 1); W.stenArms.ab.style.opacity = 0;
      let idx = 0; for (let i = 0; i < POINT_T.length; i++) if (l >= POINT_T[i]) idx = i;
      const prevT = POINT_T[idx], nextIdx = Math.min(idx + 1, 6);
      const moveP = l < POINT_T[0] ? 0 : U.prog(l, prevT, 0.18, U.easeInOut);
      const yFrom = l < POINT_T[0] ? 420 : 524 + Math.max(0, idx - 1) * 42, yTo = l < POINT_T[0] ? 420 : 524 + idx * 42;
      const tip = { x: l < POINT_T[0] ? 380 : 436, y: U.lerp(yFrom, yTo, moveP) };
      const S = { x: 311, y: 468 }, Hd = { x: tip.x - 30, y: tip.y - 44 }; const e = ik(S, Hd, 150, 150, 1);
      qa(W.parm, 'polyline').forEach((p) => p.setAttribute('points', `${S.x},${S.y} ${e.ex.toFixed(1)},${e.ey.toFixed(1)} ${e.hx.toFixed(1)},${e.hy.toFixed(1)}`)); setT(q(W.parm, '.hand'), `translate(${e.hx.toFixed(1)} ${e.hy.toFixed(1)}) rotate(48)`);
      setT(W.stenHead, `translate(0 -344) rotate(${(4 + nodAt(l, [4.3], 4, 0.4)).toFixed(2)})`);
      // Dariusz nickar vid varje punkt
      const nod = nodAt(l, POINT_T.map((x) => x + 0.12), 8, 0.4) + nodAt(l, [4.75], 8, 0.5);
      setT(W.darHead, `translate(0 -344) rotate(${(-nod).toFixed(2)})`); sideArmsPockets(W.darArms.af.parentNode);
      // bakgrund: truck (tutar), besökare utan väst, komradio som sprakar
      const fp = U.prog(l, 1.1, 1.0) * 0.2 + U.prog(l, 3.6, 2.4) * 0.8; setO(W.forklift, fp > 0 && fp < 1 ? 1 : 0); setT(W.forklift, `translate(${U.lerp(1450, 880, fp).toFixed(1)} 1000)`); setO(W.honk, (between(l, 1.3, 1.9) || between(l, 4.6, 5.0)) && Math.sin(t * 30) > 0 ? 1 : 0);
      const vp = U.prog(l, 2.2, 3.6); setO(W.visitor, vp > 0 && vp < 1 ? 1 : 0); setT(W.visitor, `translate(${U.lerp(-150, 1350, vp).toFixed(1)} 1000) scale(0.72)`); walk(W.visLegs, null, t, 1.7, 24); sideArmsIdle(W.visitor, Math.sin(t * Math.PI * 3.4) * 14);
      const crackle = (between(l, 2.6, 3.1) || between(l, 3.4, 3.9) || between(l, 5.6, 6.0)) && Math.sin(t * 40) > -0.2; const rr = q(W.belt, '.rings'); if (rr) setO(rr, crackle ? 1 : 0);
    }

    function clockShot(K, l) {
      // 0–0.55: extrem närbild på klockan, slår om vid 0.35; 0.55–1.3: ut/ned till Sten och fönstret
      const z = U.lerp(2.0, 1.0, U.easeInOut(U.prog(l, 0.55, 0.75))), cx = 524, cy = 301;
      setT(K.cam, `translate(${(cx - cx * z).toFixed(2)} ${(cy - cy * z).toFixed(2)}) scale(${z.toFixed(4)})`);
      setFlip(K.clock, '00', '01', U.prog(l, 0.35, 0.3));
      face(K.head, { blink: blinkAt(l, [1.1]), brow: [0.3, 0.3], smile: 0, ex: 4, ey: -7 });
      stenMugArm(K.al, SH_L, { x: 70, y: 46 }, 100, 96, -1, 0, 0.62); setArm(K.ar, SH_R, { x: -108, y: 160 }, 100, 96, 1);
      setArm(K.darArms.r, SH_R, { x: -24, y: 112 }, 100, 96, 1); setArm(K.darArms.l, SH_L, { x: 24, y: 112 }, 100, 96, -1);
      face(K.darHead, { blink: 0, brow: [0, 0], smile: 0.2, ex: 0, ey: 6 });
    }

    // ---------- Per-frame ----------
    const curBeat = (t) => { let b = beats[0]; for (const x of beats) if (t >= x.start) b = x; return b; };
    const allScenes = () => Object.values(S);
    function seek(frame) {
      LUP._lastFrame = frame;
      const t = frame / fps;
      blobs[0].style.transform = `translate(${Math.sin(t * 0.25) * 30}px, ${Math.cos(t * 0.2) * 24}px)`;
      blobs[1].style.transform = `translate(${Math.cos(t * 0.22) * -28}px, ${Math.sin(t * 0.18) * -20}px)`;
      const b = curBeat(t), l = t - b.start, d = b.duration, p = U.clamp(l / d, 0, 1);

      // standardvärden
      let cam = camera, worldOn = false, tone = 0, dawn = 0, armOpen = 0, phVis = 0, phScale = 0, phOrigin = null, splitOn = false, stampV = 0, rubberV = 0, titleV = 0, dimV = 0, outroV = 0, outroL = -1, capOn = true;
      const qVis = Array(queue.length).fill(0), qX = queue.map((_, i) => GATE_X - 290 - i * 292);
      let darV = 0, darX = GATE_X - 290, darDepth = 0, t5aV = 0, t5aX = 0, t5aD = 0, t5bV = 0, t5bX = 0, t5bD = 0, parkedV = 0, passerV = 0, passerX = 0, miniV = 1, miniMode = 'phone', wStenV = 0, wDarV = 0, strapV = 0, thumbV = 0, mp2V = 0, mp3V = 0;
      tap(0, 0, 0); allScenes().forEach((s) => s.classList.remove('on'));
      const on = (id) => S[id].classList.add('on');
      view.style.clipPath = '';

      switch (b.id) {
        case 'intro': { on('intro'); faceShot(F1, l, d, 'intro'); titleV = Math.min(U.prog(l, 0.3, 0.3), 1); capOn = false; break; }
        case 'fleet': {
          on('fleet'); worldOn = true; tone = 0; dawn = 1;
          cam = lerpCam({ x: 820, s: 1.0, g: 1080 }, { x: 380, s: 0.75, g: 1000 }, U.easeInOut(p));
          for (let i = 0; i < 10; i++) { qVis[i] = 1; const arr = U.easeOut(U.prog(l, 0.0 + i * 0.05, 1.9)); qX[i] = GATE_X - 290 - i * 292 - (1 - arr) * 760; }
          stampV = Math.min(U.prog(l, 0.4, 0.3), 1); miniMode = 'phone'; break;
        }
        case 'loves': { on('loves'); windowShot(l, d, t); break; }
        case 'languages': { on('languages'); outsideShot(l, d, t); rubberV = U.prog(l, 3.2, 0.35, U.back); break; }
        case 'dock': {
          on('dock'); worldOn = true; tone = 0; dawn = 0.7; cam = { x: 3000, s: 0.72, g: 1010 };
          const drive = U.easeInOut(U.prog(l, 0, 1.9)); t5aV = 1; t5aX = U.lerp(2150, DOCKS[6] + 150, drive); t5aD = U.prog(l, 1.95, 0.85, U.easeInOut);
          const drive2 = U.easeInOut(U.prog(l, 0.3, 2.3)); t5bV = 1; t5bX = U.lerp(1500, DOCKS[5] + 150, drive2); t5bD = U.prog(l, 2.7, 0.9, U.easeInOut);
          const lower = U.easeInOut(U.prog(l, 2.6, 0.5)); const bob = Math.sin(t * 2) * 2;
          setT(B5.g, `translate(430 ${(1420 + bob).toFixed(1)}) scale(2.0)`);
          setArm(B5.al, { x: -84, y: -286 }, { x: U.lerp(-244, -132, lower), y: U.lerp(-432, -128, lower) }, 100, 96, -1);
          setArm(B5.ar, { x: 84, y: -286 }, { x: U.lerp(118, 132, lower), y: U.lerp(-480, -132, lower) }, 100, 96, 1);
          miniV = 0; capOn = false; break;
        }
        case 'numbers': { on('numbers'); otsShot(O6, l, d, t, 'excel'); break; }
        case 'safety': { on('safety'); twoShot(l, d, t); break; }
        case 'tenmore': {
          if (l < 1.3) {
            on('tenmoreA'); worldOn = true; tone = 0; dawn = 1;
            cam = lerpCam({ x: -1000, s: 0.7, g: 1000 }, { x: -1750, s: 0.7, g: 1000 }, U.easeInOut(U.prog(l, 0, 1.3)));
            for (let i = 0; i < queue.length; i++) { qVis[i] = 1; if (i >= 10) { const arr = U.easeOut(U.prog(l, 0.05 + (i - 10) * 0.09, 1.0)); qX[i] = GATE_X - 290 - i * 292 - (1 - arr) * 1400; } }
            miniMode = 'phone';
          } else if (l < 2.6) { on('tenmoreB'); otsShot(O8, l - 1.3, 1.3, t, 'alarm'); }
          else { on('tenmoreC'); clockShot(K8, l - 2.6); }
          break;
        }
        case 'freeze': {
          on('freeze'); clockShot(KG, 1.4); clockShot(KC, 1.4);
          const drain = U.prog(l, 0.0, 0.6, U.easeInOut), back = U.prog(l, 2.6, 0.4, U.easeIn);
          const r = back > 0 ? U.lerp(46, 1700, back) : U.lerp(1700, 46, drain);
          cCol.style.clipPath = `circle(${r.toFixed(0)}px at 860px 700px)`;
          const z = 1 + 0.32 * U.easeInOut(U.prog(l, 0.3, 2.5)); fw.style.transform = `translate(${(860 - 860 * z).toFixed(2)}px, ${(700 - 700 * z).toFixed(2)}px) scale(${z.toFixed(4)})`;
          setO(KC.glow, ((0.75 + 0.25 * Math.sin(t * 5)) * drain * (1 - back)).toFixed(3)); setO(KG.glow, 0);
          break;
        }
        case 'checkin': {
          on('checkin'); worldOn = true; tone = 1; dawn = 0; miniMode = 'mug';
          darV = 1; darX = GATE_X - 290 + U.prog(l, 0, d) * 8; qVis[0] = 1; qVis[1] = 1; qX[0] = GATE_X - 290 - 560 + U.prog(l, 0, d) * 30; qX[1] = GATE_X - 290 - 1120 + U.prog(l, 0, d) * 30;
          dar.style.color = C.accent;
          const glide = U.easeInOut(U.prog(l, 4.4, 1.5));
          cam = lerpCam({ x: 860, s: 1.4, g: 1070 }, { x: 860 - 1050, s: 1.25, g: 1070 }, glide);
          phVis = U.prog(l, 0.25, 0.2) * (1 - U.prog(l, 4.4, 0.4)); phScale = U.prog(l, 0.3, 0.45, U.easeInOut) * (1 - U.prog(l, 4.3, 0.5, U.easeInOut)); phOrigin = worldToStage(GATE_X - 290 - 40, WORLD.ground - 70, cam);
          const typed = U.prog(l, 0.6, 0.9); const n = Math.round(typed * PLATE.length); if (ph.plate.textContent !== PLATE.slice(0, n)) ph.plate.textContent = PLATE.slice(0, n);
          ph.caret.style.opacity = typed < 1 ? (Math.floor(l * 3) % 2 ? 1 : 0) : 0;
          const mode = l < 2.2 ? 'plate' : l < 3.3 ? 'lang' : 'pl'; phoneScreen(mode);
          const sel = U.prog(l, 2.75, 0.3, U.back); ph.chips.forEach((c) => c.classList.toggle('on', c.dataset.l === 'Polski' && sel > 0.5));
          if (mode === 'lang' && sel > 0 && sel < 1) tap(1 - sel, 470, 620);
          thumbV = U.prog(l, 3.75, 0.3, U.back) * (1 - U.prog(l, 4.5, 0.3)); setT(thumbB, `translate(${GATE_X - 290 - 60} ${WORLD.ground - 130}) scale(${Math.max(0.01, thumbV).toFixed(3)})`);
          mp2V = U.prog(l, 4.85, 0.3, U.back); setT(mp2, `translate(${qX[0] - 60} ${WORLD.ground - 130}) scale(${Math.max(0.01, mp2V).toFixed(3)})`);
          mp3V = U.prog(l, 5.45, 0.3, U.back); setT(mp3, `translate(${qX[1] - 60} ${WORLD.ground - 130}) scale(${Math.max(0.01, mp3V).toFixed(3)})`);
          dimV = phVis * phScale * 0.45; break;
        }
        case 'before': {
          on('before'); worldOn = true; tone = 1; dawn = 0; miniMode = 'crossed'; splitOn = true; dar.style.color = C.accent;
          phoneScreen('before'); ph.ruleEls.forEach((r, i) => r.classList.toggle('on', l > 0.4 + i * 0.4)); ph.btn.textContent = l > 2.0 ? PL.confirmed : PL.confirm; ph.btn.classList.toggle('done', l > 2.0);
          phoneFixed(1, 60, 265, 1);
          armOpen = U.prog(l, 0.9, 0.8, U.easeInOut);
          const run = U.easeInOut(U.prog(l, 1.5, 1.8)); darV = 1; darX = U.lerp(GATE_X - 290, DOCKS[2] + 150, run); darDepth = U.prog(l, 3.3, 0.65, U.easeInOut);
          const focus = l < 1.5 ? GATE_X - 120 : U.lerp(GATE_X - 120, DOCKS[2] + 100, run); const s = 0.7; cam = { x: focus - 270 / s, s, g: 1010 };
          parkedV = 1; view.style.clipPath = 'inset(0 0 0 540px)'; break;
        }
        case 'live': { on('live'); otsShot(O12, l, d, t, 'live'); break; }
        case 'realjob': {
          on('realjob'); worldOn = true; tone = 1; dawn = 0; miniV = 0; parkedV = 1; dar.style.color = C.accent;
          darV = 1; darX = DOCKS[2] + 150; darDepth = 1;
          const walkP = U.prog(l, 0, 2.6, (x) => x < 0.1 ? U.easeIn(x / 0.1) * 0.1 : x > 0.9 ? 0.9 + U.easeOut((x - 0.9) / 0.1) * 0.1 : x);
          const sx = U.lerp(1500, 2235, walkP); wStenV = 1; wDarV = 1;
          const moving = l < 2.6; const ph_ = moving ? walk([q(wSten, '.lb'), q(wSten, '.lf')], null, t, 1.7, 26) : (setT(q(wSten, '.lb'), 'rotate(0)'), setT(q(wSten, '.lf'), 'rotate(0)'), 0);
          setT(wSten, `translate(${sx.toFixed(1)} ${(WORLD.ground - (moving ? Math.abs(ph_) * 3 : 0)).toFixed(1)}) scale(0.56)`);
          const point = U.prog(l, 2.9, 0.5, U.easeInOut) * (1 - U.prog(l, 4.2, 0.4, U.easeInOut));
          setArm(q(wSten, '.ab'), { x: -10, y: -282 }, { x: U.lerp(-22 + Math.sin(t * Math.PI * 3.4) * 14 * (moving ? 1 : 0), 150, point), y: U.lerp(-124, -300, point) }, 90, 86, -1);
          held(q(wSten, '.af'), mugSvg(0.5)); setArm(q(wSten, '.af'), { x: 10, y: -282 }, { x: 54, y: -200 }, 90, 86, 1, -6);
          setT(q(wSten, '.head'), `translate(0 -344) rotate(${nodAt(l, [4.35], 6, 0.45).toFixed(2)})`);
          setT(wDar, `translate(${DOCKS[2] + 125} ${WORLD.ground}) scale(0.56)`);
          const fix = U.prog(l, 3.5, 0.45, U.easeInOut) * (1 - U.prog(l, 4.1, 0.4, U.easeInOut));
          setArm(q(wDar, '.af'), { x: 10, y: -282 }, { x: U.lerp(30, 150, fix), y: U.lerp(-192, -310, fix) }, 90, 86, 1); setArm(q(wDar, '.ab'), { x: -10, y: -282 }, { x: 18, y: -196 }, 90, 86, -1);
          setT(q(wDar, '.head'), `translate(0 -344) rotate(${(-nodAt(l, [4.45], 6, 0.45)).toFixed(2)})`);
          strapV = U.prog(l, 3.0, 0.3) * (1 - U.prog(l, 4.1, 0.3)); setT(strap, `translate(${DOCKS[2] + 70} ${WORLD.ground - 70 - 108})`);
          const pp = U.prog(l, 2.2, 2.4); passerV = pp > 0 && pp < 1 ? 1 : 0; passerX = U.lerp(1300, 3300, pp);
          const follow = U.easeInOut(U.prog(l, 0, 2.6)), push = U.easeInOut(U.prog(l, 2.6, 1.0));
          cam = lerpCam(lerpCam({ x: 1640, s: 1.15, g: 1110 }, { x: 2130, s: 1.15, g: 1110 }, follow), { x: 2300, s: 2.1, g: 1190 }, push);
          break;
        }
        case 'fine': {
          on('fine'); faceShot(F14, l, d, 'fine');
          const fade = U.prog(l, 1.4, 0.4, U.easeInOut); S.fine.style.opacity = 1 - fade; outroV = fade; outroL = (l - 1.45) * 2.6;
          break;
        }
      }
      if (b.id !== 'fine') S.fine.style.opacity = 1;

      // ---- Tillämpa världen ----
      view.style.visibility = worldOn ? 'visible' : 'hidden'; dawnEl.style.opacity = worldOn ? dawn : 0;
      if (worldOn) {
        camera = cam; applyCamera(cam); toneWorld(tone, dawn);
        queue.forEach((qq, i) => { show(qq, qVis[i]); if (qVis[i]) place(qq, qX[i]); });
        show(dar, darV); if (darV) { place(dar, darX, darDepth); q(dar, '.drv').style.opacity = tone; }
        show(t5a, t5aV); if (t5aV) place(t5a, t5aX, t5aD); show(t5b, t5bV); if (t5bV) place(t5b, t5bX, t5bD);
        parked.forEach((pk, i) => { show(pk, parkedV); if (parkedV) place(pk, DOCKS[i ? 4 : 0] + 150, 1); });
        show(passer, passerV); if (passerV) place(passer, passerX, 1);
        arm.setAttribute('transform', `rotate(${-82 * armOpen})`);
        mini.style.opacity = miniV;
        if (miniV) {
          const hd = q(mini, '.head'); face(hd, { blink: 0, brow: [0, 0], smile: miniMode === 'phone' ? 0 : 0.3, ex: 0, ey: 2 });
          if (miniMode === 'phone') { held(miniArms.r, handsetSvg(0.55)); setArm(miniArms.r, SH_R, { x: -60, y: -46 }, 100, 96, 1, 68); held(miniArms.l, ''); setArm(miniArms.l, SH_L, { x: 100, y: 160 }, 100, 96, -1); }
          else if (miniMode === 'mug') { held(miniArms.r, ''); setArm(miniArms.r, SH_R, { x: -100, y: 160 }, 100, 96, 1); stenMugArm(miniArms.l, SH_L, { x: 66, y: 50 }, 100, 96, -1, 0, 0.62); }
          else { held(miniArms.r, ''); held(miniArms.l, ''); setArm(miniArms.r, SH_R, { x: 40, y: 92 }, 100, 96, 1); setArm(miniArms.l, SH_L, { x: -40, y: 96 }, 100, 96, -1); }
        }
        wSten.setAttribute('opacity', wStenV); wDar.setAttribute('opacity', wDarV); setO(strap, strapV); setO(thumbB, Math.min(1, thumbV * 2)); setO(mp2, Math.min(1, mp2V * 2)); setO(mp3, Math.min(1, mp3V * 2));
      }
      // ---- Telefon, delad bild, dim ----
      if (b.id === 'checkin') { showPhone(phVis, phScale, phOrigin.x, phOrigin.y); }
      else if (b.id !== 'before') phoneRoot.style.visibility = 'hidden';
      split.style.opacity = splitOn ? 1 : 0; split.style.visibility = splitOn ? 'visible' : 'hidden';
      dim.style.opacity = dimV;
      // ---- Stämplar, titelkort, slutkort ----
      stamp.style.opacity = stampV; stamp.textContent = '06:58';
      rubber.style.opacity = Math.min(1, rubberV * 2); rubber.style.transform = `rotate(-8deg) scale(${U.lerp(1.8, 1, Math.min(1, rubberV)).toFixed(3)})`;
      titleCard.style.opacity = titleV; titleCard.style.transform = `translateY(${((1 - titleV) * 10).toFixed(1)}px)`;
      outroLayer.style.visibility = outroV > 0 ? 'visible' : 'hidden'; outroLayer.style.opacity = outroV; if (outroV > 0) outroSeek(Math.max(0, outroL));
      // ---- Undertexter ----
      if (cueList) {
        const c = capOn ? cueList.find((x) => t >= x.start && t < x.end) : null;
        if (c) { const html = esc(c.text).replace(/ \/ /g, '<br>'); if (cueEl.innerHTML !== html) cueEl.innerHTML = html; cueBox.style.opacity = Math.min(U.prog(t, c.start, 0.12), 1 - U.prog(t, c.end - 0.12, 0.12)); }
        else cueBox.style.opacity = 0;
      }
    }

    LUP.timeline = { total, fps, frames: Math.round(total * fps), beats: beats.map((b) => ({ id: b.id, start: b.start, end: b.end, title: b.scene || '' })), events };
    window.__seek = seek;
    window.__setRenderMode = () => document.body.classList.add('render');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { (LUP._refit || []).forEach((f) => f()); if (LUP._lastFrame != null) seek(LUP._lastFrame); });
    seek(0);
    return LUP.timeline;
  };
})();
