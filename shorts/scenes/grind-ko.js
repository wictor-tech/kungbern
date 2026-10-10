/* Scen: Köer och väntetid vid grinden → incheckning/slotbokning.
   Problem: lastbilar står i kö framför stängd bom, klockan tickar, papper vid grinden.
   Lösning: bommen går upp, incheckade bilar rullar igenom med jämna mellanrum. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;
  LUP.scenes = LUP.scenes || {};

  const W = 936; // hero-bredd (1080 - 2*72)
  const truck = (cls, extra = '') => `
    <g class="truck ${cls}" ${extra}>
      <rect x="0" y="4" width="92" height="46" rx="8" fill="#fff" stroke="currentColor" stroke-width="4"/>
      <path d="M92 20h24l16 16v14H92z" fill="#fff" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
      <rect x="99" y="24" width="12" height="11" rx="2" fill="currentColor" opacity=".35"/>
      <circle cx="24" cy="54" r="9" fill="#fff" stroke="currentColor" stroke-width="4"/>
      <circle cx="112" cy="54" r="9" fill="#fff" stroke="currentColor" stroke-width="4"/>
    </g>`;
  const gate = (color, len = 160) => `
    <g class="gate">
      <rect x="0" y="0" width="22" height="120" rx="6" fill="#fff" stroke="${color}" stroke-width="4"/>
      <g class="arm" transform-origin="11 24">
        <rect x="11" y="18" width="${len}" height="12" rx="6" fill="#fff" stroke="${color}" stroke-width="4"/>
        <rect x="36" y="20" width="22" height="8" fill="${color}"/><rect x="${36 + (len - 40) / 3}" y="20" width="22" height="8" fill="${color}"/><rect x="${36 + 2 * (len - 40) / 3}" y="20" width="22" height="8" fill="${color}"/>
      </g>
      <circle cx="11" cy="24" r="7" fill="${color}"/>
    </g>`;
  const road = (y, w) => `
    <rect class="hero-road" x="0" y="${y}" width="${w}" height="16" rx="8"/>
    <line class="hero-dash" x1="20" y1="${y + 8}" x2="${w - 20}" y2="${y + 8}"/>`;

  LUP.scenes['grind-ko'] = {
    problem: {
      mount(root) {
        const DW = 780; // designbredd; skalas upp 1.2x till hero-bredden
        root.innerHTML = `
          <svg width="${W}" height="460" viewBox="0 0 ${DW} 383">
            ${road(270, DW)}
            <g transform="translate(625 146)">${gate('#64748B', 150)}</g>
            <g class="clock hero-muted" transform="translate(545 56)">
              <circle cx="0" cy="0" r="54" fill="#fff" stroke="currentColor" stroke-width="5"/>
              <line class="hand-h" x1="0" y1="0" x2="0" y2="-26" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
              <line class="hand-m" x1="0" y1="0" x2="0" y2="-40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
              <circle cx="0" cy="0" r="5" fill="currentColor"/>
            </g>
            <g class="paper hero-muted" transform="translate(695 92)">
              <foreignObject x="-30" y="-30" width="60" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="width:60px;height:60px;color:#64748B">${LUP.icon('clipboard')}</div></foreignObject>
            </g>
            <g class="trucks hero-muted">
              ${[0, 1, 2, 3].map((i) => truck('q' + i)).join('')}
            </g>
            <g class="tag" transform="translate(290 18)">
              <rect x="-10" y="-10" width="190" height="56" rx="28" fill="#fff" stroke="#BAE6FD" stroke-width="3"/>
              <text x="85" y="28" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="26" fill="#64748B">Väntar…</text>
            </g>
          </svg>`;
        const svg = root.firstElementChild;
        const trucks = [...svg.querySelectorAll('.truck')];
        const hm = svg.querySelector('.hand-m'), hh = svg.querySelector('.hand-h');
        const clock = svg.querySelector('.clock'), paper = svg.querySelector('.paper'), tag = svg.querySelector('.tag');
        const stops = [478, 338, 198, 58]; // kö framför bommen (lastbil = 132 bred)
        return (l) => {
          trucks.forEach((tr, i) => {
            const p = U.prog(l, 0.2 + i * 0.35, 1.1, U.easeOut);
            const x = U.lerp(-200 - i * 40, stops[i], p);
            const bob = p >= 1 ? Math.sin((l + i) * 9) * 1.2 : 0;
            tr.setAttribute('transform', `translate(${x} ${210 + bob})`);
            tr.style.opacity = U.clamp((x + 150) / 120, 0, 1); // tonar in vid vänsterkanten
          });
          const cp = U.prog(l, 0.8, 0.5, U.back);
          clock.style.opacity = cp; clock.setAttribute('transform', `translate(545 56) scale(${cp})`);
          hm.setAttribute('transform', `rotate(${(l - 1.2) * 150})`);
          hh.setAttribute('transform', `rotate(${(l - 1.2) * 12 + 60})`);
          const pp = U.prog(l, 1.3, 0.5, U.back);
          paper.style.opacity = pp; paper.setAttribute('transform', `translate(695 92) scale(${pp}) rotate(${Math.sin(l * 4) * 4})`);
          const tp = U.prog(l, 1.7, 0.4, U.easeOut);
          tag.style.opacity = tp; tag.setAttribute('transform', `translate(290 ${18 + (1 - tp) * 14})`);
        };
      },
    },
    solution: {
      mount(root) {
        const DW = 814; // designbredd; skalas upp 1.15x
        const slotTime = (i) => { const m = 40 + i * 10; return `0${8 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
        root.innerHTML = `
          <svg width="${W}" height="400" viewBox="0 0 ${DW} 348">
            ${road(250, DW)}
            <g transform="translate(470 126)">${gate('#0EA5E9', 160)}</g>
            <g class="phone hero-accent" transform="translate(585 52)">
              <foreignObject x="-36" y="-36" width="72" height="72"><div xmlns="http://www.w3.org/1999/xhtml" style="width:72px;height:72px;color:#0EA5E9">${LUP.icon('phone')}</div></foreignObject>
            </g>
            <g class="trucks hero-accent">
              ${[0, 1, 2, 3].map((i) => truck('f' + i) + `
                <g class="slot s${i}">
                  <rect x="0" y="0" width="150" height="46" rx="23" fill="#fff" stroke="#BAE6FD" stroke-width="3"/>
                  <foreignObject x="10" y="9" width="28" height="28"><div xmlns="http://www.w3.org/1999/xhtml" style="width:28px;height:28px;color:#0EA5E9">${LUP.icon('check')}</div></foreignObject>
                  <text x="46" y="31" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="24" fill="#0C4A6E">${slotTime(i)}</text>
                </g>`).join('')}
            </g>
            <g class="tag" transform="translate(640 26)">
              <rect x="-10" y="-10" width="236" height="56" rx="28" fill="#E0F2FE"/>
              <text x="108" y="28" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="26" fill="#0C4A6E">Incheckad ✓</text>
            </g>
          </svg>`;
        const svg = root.firstElementChild;
        const trucks = [...svg.querySelectorAll('.truck')];
        const slots = [...svg.querySelectorAll('.slot')];
        const arm = svg.querySelector('.arm'), phone = svg.querySelector('.phone'), tag = svg.querySelector('.tag');
        const spacing = 265, speed = 210;
        return (l) => {
          const open = U.prog(l, 0.3, 0.8, U.easeInOut);
          arm.setAttribute('transform', `rotate(${-82 * open})`);
          const pp = U.prog(l, 0.6, 0.5, U.back);
          phone.style.opacity = pp; phone.setAttribute('transform', `translate(585 ${52 - (1 - pp) * 10}) scale(${pp})`);
          const run = Math.max(0, l - 0.5);
          trucks.forEach((tr, i) => {
            const x = ((run * speed + i * spacing + 180) % (spacing * 4)) - 240;
            tr.setAttribute('transform', `translate(${x} 190)`);
            slots[i].setAttribute('transform', `translate(${x - 10} 110)`);
            const fade = Math.min(U.clamp((x + 150) / 120, 0, 1), U.clamp((DW - 20 - x) / 120, 0, 1)); // mjuk in-/uttoning vid kanterna
            tr.style.opacity = fade; slots[i].style.opacity = fade;
          });
          const tp = U.prog(l, 1.1, 0.4, U.easeOut);
          tag.style.opacity = tp; tag.setAttribute('transform', `translate(640 ${26 + (1 - tp) * 14})`);
        };
      },
    },
  };
})();
