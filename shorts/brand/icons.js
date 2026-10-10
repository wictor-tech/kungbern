/* Ikonbibliotek – stroke-ikoner, 24x24, currentColor. Lägg till här, referera med namn i klipp-JSON. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const wrap = (inner, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
  LUP.icons = {
    clock: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),
    calendar: wrap('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9.5 15 1.8 1.8L15 13"/>'),
    phone: wrap('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="m9.5 10.5 1.8 1.8L15 8.8"/>'),
    gate: wrap('<path d="M4 21V9"/><path d="M2.5 21h3"/><path d="M4 11h16"/><circle cx="4" cy="11" r="1.6" fill="currentColor"/><path d="M9 11v-1.5M14 11v-1.5M19 11v-1.5"/>'),
    truck: wrap('<path d="M2 6h11v10H2z"/><path d="M13 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>'),
    check: wrap('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
    users: wrap('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>'),
    globe: wrap('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    chat: wrap('<path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
    map: wrap('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    clipboard: wrap('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M8.5 10h7M8.5 14h4.5"/>'),
    eye: wrap('<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/>'),
    bell: wrap('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    qr: wrap('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v1M17 20h4M20 17.5v.5"/>'),
    warning: wrap('<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4M12 17v.5"/>'),
    cloud: wrap('<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1 .4 9z"/>'),
    arrow: wrap('<path d="M5 12h14M13 6l6 6-6 6"/>', 'stroke-width="2.4"'),
    bolt: wrap('<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>'),
    shield: wrap('<path d="M12 2.5 4.5 5.5v5.5c0 4.8 3.2 8.4 7.5 10.5 4.3-2.1 7.5-5.7 7.5-10.5V5.5z"/><path d="m9 12 2 2 4-4"/>'),
  };
  LUP.icon = (name) => LUP.icons[name] || LUP.icons.check;
})();
