/* VERAPEP V5 multi-goal discovery, live admin sync, ratings, saved products, comparison and cart. */
(() => {
  'use strict';

  const embedded = window.VERAPEP_CATALOGUE;
  const $ = id => document.getElementById(id);
  const els = {
    grid: $('product-grid'), search: $('catalogue-search'), category: $('category-filter'),
    rating: $('rating-filter'), report: $('report-filter'), sort: $('sort-filter'),
    count: $('result-count'), reset: $('reset-filters'), load: $('load-more'), empty: $('empty-state'),
    filters: $('active-filters'), menu: $('menu-button'), nav: $('site-nav'), header: $('site-header'),
    focusOptions: $('focus-options'), finderFocusOptions: $('finder-focus-options'), needOptions: $('need-options'), priorityOptions: $('priority-options'),
    needHelper: $('need-helper'), finderSummary: $('finder-summary'), finderReset: $('finder-reset'),
    savedButton: $('saved-products-button'), savedCount: $('saved-count'), savedDrawer: $('saved-drawer'),
    savedList: $('saved-products-list'), savedClose: $('saved-close'), clearSaved: $('clear-saved'),
    backdrop: $('drawer-backdrop'), compareBar: $('compare-bar'), compareCount: $('compare-count'),
    clearCompare: $('clear-compare'), openCompare: $('open-compare'), compareDialog: $('compare-dialog'),
    compareContent: $('compare-content'), veraLauncher: $('vera-launcher'), veraPanel: $('vera-panel'),
    veraClose: $('vera-close'), veraQuick: $('vera-quick'), veraLog: $('vera-log'), veraForm: $('vera-form'),
    veraQuestion: $('vera-question'), trustSignals: $('trust-signals'),
    featuredGrid: $('featured-product-grid'), finderPreview: $('finder-preview'), goalSelectionCopy: $('goal-selection-copy')
  };

  const categories = Object.fromEntries(embedded.categories.map(item => [item.id, item]));
  const tones = { metabolism: 'mint', strength: 'amber', skin: 'lilac', specialist: 'blue' };
  const focusIcons = {
    'weight-metabolism': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 18h20l2 21H12l2-21Z"/><path d="M18 18v-4a6 6 0 0 1 12 0v4M18 27h12M24 23v8"/></svg>',
    'skin-appearance': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7c-7 0-12 6-12 14 0 10 5 20 12 20s12-10 12-20C36 13 31 7 24 7Z"/><path d="M18 22c2 2 4 3 6 3s4-1 6-3M20 16h.1M28 16h.1"/></svg>',
    'strength-recovery': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 30h7l5-11 6 15 4-8h8"/><path d="M9 38h30M12 34v8M36 34v8"/></svg>',
    'energy-vitality': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m27 5-14 22h10l-2 16 14-23H25l2-15Z"/></svg>',
    'sleep-focus': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M35 31A16 16 0 0 1 17 9a16 16 0 1 0 18 22Z"/><path d="M31 10h8M35 6v8"/></svg>',
    'healthy-ageing': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6v36M6 24h36M11 11l26 26M37 11 11 37"/><circle cx="24" cy="24" r="9"/></svg>',
    'hormonal-specialist': '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 8c-5 7-8 12-8 18a8 8 0 0 0 16 0c0-6-3-11-8-18ZM33 12c-4 6-6 10-6 14a6 6 0 0 0 12 0c0-4-2-8-6-14Z"/></svg>'
  };
  const pageSize = matchMedia('(max-width:700px)').matches ? 6 : 12;
  const state = { focuses: new Set(), needs: new Set(), priorities: new Set() };
  let visibleLimit = pageSize;
  // v17: products come only from /api/storefront (publication and compliance rules are applied there).
  let products = [];
  let catalogueState = 'loading'; // loading | ready | failed
  let guide = window.VERAPEP_GUIDE_FALLBACK || { focusAreas: [], priorities: [], disclaimer: '' };
  let saved = new Set(JSON.parse(localStorage.getItem('vp-saved-products') || '[]'));
  let compared = new Set(JSON.parse(localStorage.getItem('vp-compare-products') || '[]'));

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const productName = product => window.VerapepeVialRenderer?.displayName(product) || product.content?.displayName || product.name;
  const productUrl = product => `/product/${encodeURIComponent(product.id)}`;
  const hasReports = product => (product.content?.labReports || []).some(report => report.published && report.url);
  const isComplete = product => product.content?.informationCompleteness === 'complete';
  const informationScore = product => [product.content?.shortDescription, product.content?.fullDescription, product.content?.ingredients, product.content?.storage, product.content?.warnings].filter(Boolean).length * 4 + (hasReports(product) ? 6 : 0) + Math.min(4, product.variants.length);
  const selectedAreas = () => guide.focusAreas.filter(item => state.focuses.has(item.id));
  const needLabel = id => guide.focusAreas.flatMap(item => item.needs || []).find(item => item.id === id)?.label || id;
  const priorityLabel = id => guide.priorities.find(item => item.id === id)?.label || id;
  const stars = value => {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
  };
  const catalogueNumbers = product => {
    const values = product.variants.map(variant => variant.catalogueNo).filter(Boolean);
    return values.length ? `${values.slice(0, 3).join(' · ')}${values.length > 3 ? ` +${values.length - 3}` : ''}` : 'No catalogue number listed';
  };
  const searchSynonyms = {
    'gå ner i vikt': ['weight','metabolism','appetite'], 'vikt': ['weight','metabolism'], 'smalare': ['weight','metabolism'],
    'starkare': ['strength','recovery','muscle'], 'styrka': ['strength','recovery'], 'hud': ['skin','appearance'],
    'rynkor': ['healthy ageing','fine lines'], 'finnar': ['skin','appearance'], 'sömn': ['sleep'], 'fokus': ['focus'],
    'energi': ['energy','vitality']
  };
  const normaliseSearch = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const expandSearch = value => { const q=normaliseSearch(value); const stop=new Set(['och','att','jag','vill','bli','ga','ner','i','for','the','and']); const additions=Object.entries(searchSynonyms).filter(([key])=>q.includes(normaliseSearch(key))).flatMap(([,words])=>words); return [...new Set([...q.split(/\s+/),...additions].filter(word=>word.length>2&&!stop.has(word)))]; };
  const searchMatches = (product, tokens) => !tokens.length || tokens.some(token => searchText(product).includes(token));
  const searchText = product => [
    product.name, product.content?.displayName, product.content?.shortDescription,
    categories[product.category]?.label, ...(product.content?.discoveryNeeds || []), ...(product.content?.searchAliases || []),
    ...product.variants.flatMap(variant => [variant.catalogueNo, variant.specification])
  ].filter(Boolean).join(' ').toLowerCase();


  const vialProfile = product => {
    const name = `${productName(product)} ${product.id}`.toLowerCase();
    if (/(melanotan|melatonin)/.test(name)) return { tone: 'rose', liquid: '#f6d7e5', liquidDeep: '#d89ab9', accent: '#a16f89', capBand: '#14939c', stopper: '#aeb6b8' };
    if (/(tb-?500|tb500)/.test(name)) return { tone: 'gold', liquid: '#f6e8b4', liquidDeep: '#d8b652', accent: '#987d35', capBand: '#14939c', stopper: '#aeb6b8' };
    if (/(cjc|ghk|glow|skin|epitalon)/.test(name)) return { tone: 'sage', liquid: '#d8eed6', liquidDeep: '#a0ce98', accent: '#6c9f73', capBand: '#14939c', stopper: '#aeb6b8' };
    if (/(semaglutide|tirzepatide|retatrutide|slu-pp|slupp)/.test(name)) return { tone: 'aqua', liquid: '#c6efef', liquidDeep: '#73d2d0', accent: '#188b95', capBand: '#14939c', stopper: '#aeb6b8' };
    if (/(nad)/.test(name)) return { tone: 'crystal', liquid: '#edf6f8', liquidDeep: '#d4e5e8', accent: '#0f8791', capBand: '#14939c', stopper: '#aeb6b8' };
    if (/(bpc|selank|semax|pt-141|dsip)/.test(name)) return { tone: 'clear', liquid: '#eef6f8', liquidDeep: '#d7e6ea', accent: '#10848d', capBand: '#14939c', stopper: '#aeb6b8' };
    const fallback = [
      { tone: 'clear', liquid: '#eef6f8', liquidDeep: '#d7e6ea', accent: '#10848d', capBand: '#14939c', stopper: '#aeb6b8' },
      { tone: 'aqua', liquid: '#c6efef', liquidDeep: '#73d2d0', accent: '#188b95', capBand: '#14939c', stopper: '#aeb6b8' },
      { tone: 'sage', liquid: '#d8eed6', liquidDeep: '#a0ce98', accent: '#6c9f73', capBand: '#14939c', stopper: '#aeb6b8' },
      { tone: 'gold', liquid: '#f6e8b4', liquidDeep: '#d8b652', accent: '#987d35', capBand: '#14939c', stopper: '#aeb6b8' },
      { tone: 'rose', liquid: '#f6d7e5', liquidDeep: '#d89ab9', accent: '#a16f89', capBand: '#14939c', stopper: '#aeb6b8' }
    ];
    const hash = [...product.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return fallback[hash % fallback.length];
  };
  const vialLabel = product => {
    const name = productName(product).replace(/\s+/g, ' ').trim().toUpperCase();
    return name.length > 18 ? `${name.slice(0, 18)}…` : name;
  };
  function vialMarkup(product, instance = 'card') {
    const unifiedVial = window.VerapepeVialRenderer?.render(product, { instance, mode: 'card' });
    if (unifiedVial) return unifiedVial;
    const mappedImage = window.VerapepeProductImages?.get(product);
    if (mappedImage) return `<img class="product-photo product-photo--official" src="${escapeHtml(mappedImage)}" alt="${escapeHtml(productName(product))} VERAPEP vial" loading="lazy" decoding="async">`;
    if (product.content?.imageUrl) return `<img class="product-photo" src="${escapeHtml(product.content.imageUrl)}" ${product.content.imageSrcset?`srcset="${escapeHtml(product.content.imageSrcset)}"`:''} sizes="${escapeHtml(product.content.imageSizes||'(max-width:700px) 80vw, 260px')}" alt="${escapeHtml(product.content.imageAlt || productName(product))}" loading="lazy" decoding="async">`;
    const id = `${String(product.id).replace(/[^a-z0-9_-]/gi, '-')}-${String(instance).replace(/[^a-z0-9_-]/gi, '-')}`;
    const palette = vialProfile(product);
    const spec = String(product.variants?.[0]?.specification || categories[product.category]?.short || '10 mg').replace(/\s+/g, ' ').trim();
    const dose = spec.length > 14 ? `${spec.slice(0, 14)}…` : spec;
    const label = vialLabel(product);
    return `<svg class="product-vial-svg product-vial-svg--${palette.tone}" viewBox="0 0 150 220" role="img" aria-label="VERAPEP vial for ${escapeHtml(productName(product))}">
      <defs>
        <linearGradient id="capMetal-${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fcfcfc"/>
          <stop offset="0.16" stop-color="#d7dbdc"/>
          <stop offset="0.34" stop-color="#8f989b"/>
          <stop offset="0.5" stop-color="#f7f7f7"/>
          <stop offset="0.68" stop-color="#8f989b"/>
          <stop offset="1" stop-color="#d4d8d9"/>
        </linearGradient>
        <linearGradient id="glass-${id}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e4f1f3" stop-opacity="0.88"/>
          <stop offset="0.16" stop-color="#ffffff" stop-opacity="0.96"/>
          <stop offset="0.32" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="0.58" stop-color="#ffffff" stop-opacity="0.10"/>
          <stop offset="0.82" stop-color="#ffffff" stop-opacity="0.90"/>
          <stop offset="1" stop-color="#9ab7bc" stop-opacity="0.40"/>
        </linearGradient>
        <linearGradient id="liquid-${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${palette.liquid}"/>
          <stop offset="1" stop-color="${palette.liquidDeep}"/>
        </linearGradient>
        <radialGradient id="shine-${id}" cx="40%" cy="24%" r="62%">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <filter id="shadow-${id}" x="-50%" y="-40%" width="200%" height="200%"><feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#173d43" flood-opacity="0.17"/></filter>
        <filter id="blur-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
        <clipPath id="clip-${id}"><path d="M43 49h64c8 0 14 7 14 15v95c0 22-18 40-40 40H69c-22 0-40-18-40-40V64c0-8 6-15 14-15Z"/></clipPath>
      </defs>
      <ellipse cx="75" cy="202" rx="40" ry="8" fill="#123d43" opacity="0.11" filter="url(#blur-${id})"/>
      <g filter="url(#shadow-${id})">
        <rect x="50" y="34" width="50" height="16" rx="3" fill="${palette.stopper}" stroke="#98a4a7" stroke-width="1"/>
        <path d="M38 9c0-5 4-9 9-9h56c5 0 9 4 9 9v24c0 5-4 9-9 9H47c-5 0-9-4-9-9V9Z" fill="url(#capMetal-${id})" stroke="#80878b" stroke-width="1.25"/>
        <g stroke="#697175" stroke-width="1" opacity="0.44">
          <path d="M51 4v34"/><path d="M61 3v36"/><path d="M71 3v36"/><path d="M81 3v36"/><path d="M91 3v36"/><path d="M101 4v34"/>
        </g>
        <rect x="43" y="4.5" width="64" height="8.5" rx="4.25" fill="${palette.capBand}"/>
        <path d="M43 49h64c8 0 14 7 14 15v95c0 22-18 40-40 40H69c-22 0-40-18-40-40V64c0-8 6-15 14-15Z" fill="url(#glass-${id})" stroke="#8eaeb3" stroke-width="1.5"/>
        <g clip-path="url(#clip-${id})">
          <path d="M29 138c22-2.2 70-2.2 92 0v53H29Z" fill="url(#liquid-${id})" opacity="0.94"/>
          <ellipse cx="75" cy="138" rx="46" ry="5.5" fill="${palette.liquid}" opacity="0.97"/>
          <ellipse cx="75" cy="140.5" rx="45" ry="4.6" fill="#ffffff" opacity="0.13"/>
          <path d="M44 55c-5 26-6 83 1 126" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" opacity="0.78"/>
          <path d="M57 55c-3 24-4 79 .3 121" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" opacity="0.26"/>
          <path d="M103 56c5 24 6 79 .2 122" fill="none" stroke="#73969a" stroke-width="2.8" stroke-linecap="round" opacity="0.15"/>
          <ellipse cx="78" cy="78" rx="28" ry="34" fill="url(#shine-${id})" opacity="0.36"/>
        </g>
        <rect x="36" y="83" width="78" height="67" rx="2.5" fill="#fdfdfa" stroke="#dde4e4"/>
        <rect x="36" y="83" width="78" height="6" rx="2" fill="${palette.accent}"/>
        <text x="75" y="103" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8.7" font-weight="700" letter-spacing="1.35" fill="#1a717a">VERAPEP</text>
        <text x="75" y="121" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7.8" font-weight="800" fill="#23373b">${escapeHtml(label)}</text>
        <text x="75" y="138" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="6.1" font-weight="600" fill="#6d8186">${escapeHtml(dose)}</text>
        <path d="M44 144h62" stroke="#e8ecec" stroke-width="1"/>
        <text x="49" y="152.5" font-family="Arial, Helvetica, sans-serif" font-size="4.4" font-weight="700" fill="#7b8f94">BATCH</text>
        <text x="66" y="152.5" font-family="Arial, Helvetica, sans-serif" font-size="4.4" fill="#7b8f94">VP-${escapeHtml(String(product.id).slice(0,4).toUpperCase())}</text>
        <circle cx="103" cy="61" r="3" fill="#fff" opacity="0.62"/>
        <circle cx="108" cy="69" r="1.8" fill="#fff" opacity="0.54"/>
      </g>
    </svg>`;
  }

  function persist() {
    localStorage.setItem('vp-saved-products', JSON.stringify([...saved]));
    localStorage.setItem('vp-compare-products', JSON.stringify([...compared]));
    localStorage.setItem('vp-guide-selection', JSON.stringify({ focuses: [...state.focuses], needs: [...state.needs], priorities: [...state.priorities] }));
  }

  function ratingMarkup(product) {
    const rating = product.reviews || {};
    if (!rating.count) return '';
    return `<div class="product-rating" aria-label="Rated ${rating.average.toFixed(1)} out of 5 from ${rating.count} reviews"><span class="rating-stars" aria-hidden="true">${stars(rating.average)}</span><strong class="rating-score">${rating.average.toFixed(1)}</strong><span class="rating-count">${rating.count} review${rating.count === 1 ? '' : 's'}</span></div>`;
  }

  function relevanceScore(product) {
    let score = 0;
    score += [...state.focuses].filter(value => (product.content?.discoveryGoals || []).includes(value)).length * 40;
    score += [...state.needs].filter(value => (product.content?.discoveryNeeds || []).includes(value)).length * 25;
    if (state.priorities.has('lab-report') && hasReports(product)) score += 15;
    if (state.priorities.has('complete-information') && isComplete(product)) score += 10;
    score += Math.min(5, Number(product.reviews?.average || 0));
    return score;
  }

  const availabilityScore = product => {
    const enabled = (product.variants || []).filter(variant => variant.checkoutEnabled);
    if (enabled.some(variant => Number(variant.sandboxStock || 0) > 0)) return 2;
    if (enabled.length) return 1;
    return 0;
  };

  function filteredProducts() {
    const query = expandSearch(els.search.value);
    const category = els.category.value;
    const minimumRating = els.rating.value;
    const reportFilter = els.report.value;
    const list = products.filter(product => {
      if (product.content?.published === false) return false;
      if (!searchMatches(product, query)) return false;
      if (category !== 'all' && product.category !== category) return false;
      if (state.focuses.size && ![...state.focuses].every(value => (product.content?.discoveryGoals || []).includes(value))) return false;
      if (state.needs.size && ![...state.needs].every(value => (product.content?.discoveryNeeds || []).includes(value))) return false;
      if (minimumRating === 'unrated' && product.reviews.count !== 0) return false;
      if (!['0', 'unrated'].includes(minimumRating) && !(product.reviews.count > 0 && product.reviews.average >= Number(minimumRating))) return false;
      if (reportFilter === 'reports' && !hasReports(product)) return false;
      if (state.priorities.has('lab-report') && !hasReports(product)) return false;
      if (state.priorities.has('non-specialist') && product.content?.specialistOnly === true) return false;
      return true;
    });

    const sort = state.priorities.has('highest-rated') ? 'rating'
      : state.priorities.has('most-reviewed') ? 'reviews'
      : state.priorities.has('complete-information') ? 'complete'
      : els.sort.value;
    list.sort((a, b) => {
      if (sort === 'relevance') return availabilityScore(b) - availabilityScore(a) || relevanceScore(b) - relevanceScore(a) || productName(a).localeCompare(productName(b));
      if (sort === 'rating') return b.reviews.average - a.reviews.average || b.reviews.count - a.reviews.count || productName(a).localeCompare(productName(b));
      if (sort === 'reviews') return b.reviews.count - a.reviews.count || b.reviews.average - a.reviews.average || productName(a).localeCompare(productName(b));
      if (sort === 'complete') return informationScore(b) - informationScore(a) || productName(a).localeCompare(productName(b));
      if (sort === 'category') return categories[a.category].label.localeCompare(categories[b.category].label) || productName(a).localeCompare(productName(b));
      return productName(a).localeCompare(productName(b));
    });
    return list;
  }

  function renderFinder() {
    const focusMarkup = guide.focusAreas.map((area, index) => `
      <button type="button" class="focus-option${state.focuses.has(area.id) ? ' is-selected' : ''}" data-focus="${escapeHtml(area.id)}" aria-pressed="${state.focuses.has(area.id)}">
        <span class="focus-option__icon" aria-hidden="true">${focusIcons[area.id] || `<span>${String(index + 1).padStart(2, '0')}</span>`}</span>
        <strong>${escapeHtml(area.label)}</strong><small>${escapeHtml(area.description)}</small><span class="focus-option__check" aria-hidden="true">✓</span>
      </button>`).join('');
    if (els.focusOptions) els.focusOptions.innerHTML = focusMarkup;
    if (els.finderFocusOptions) els.finderFocusOptions.innerHTML = focusMarkup;

    const areas = selectedAreas();
    els.needOptions.innerHTML = areas.length
      ? areas.map(area => `<div class="need-group"><strong>${escapeHtml(area.label)}</strong><div>${(area.needs || []).map(need => `<button type="button" class="need-option${state.needs.has(need.id) ? ' is-selected' : ''}" data-need="${escapeHtml(need.id)}" aria-pressed="${state.needs.has(need.id)}">${escapeHtml(need.label)}</button>`).join('')}</div></div>`).join('')
      : '<div class="finder-empty-prompt"><strong>No goals selected yet</strong><span>Choose one or more goals here to get started.</span></div>';
    els.needHelper.textContent = areas.length ? 'Choose any specific areas that should influence your matches.' : 'Choose a goal first.';

    els.priorityOptions.innerHTML = guide.priorities.map(priority => `
      <button type="button" class="priority-option${state.priorities.has(priority.id) ? ' is-selected' : ''}" data-priority="${escapeHtml(priority.id)}" aria-pressed="${state.priorities.has(priority.id)}"><span aria-hidden="true">${state.priorities.has(priority.id) ? '✓' : '+'}</span>${escapeHtml(priority.label)}</button>`).join('');

    document.querySelector('[data-finder-step="2"]')?.classList.toggle('finder-step--active', state.focuses.size > 0);
    document.querySelector('[data-finder-step="3"]')?.classList.toggle('finder-step--active', state.focuses.size > 0);
    const progress1 = document.querySelector('[data-finder-progress="1"]');
    const progress2 = document.querySelector('[data-finder-progress="2"]');
    const progress3 = document.querySelector('[data-finder-progress="3"]');
    progress1?.classList.toggle('is-complete', state.focuses.size > 0);
    progress1?.classList.toggle('is-active', state.focuses.size === 0);
    progress2?.classList.toggle('is-active', state.focuses.size > 0 && state.needs.size === 0);
    progress2?.classList.toggle('is-complete', state.focuses.size > 0 && state.needs.size > 0);
    progress3?.classList.toggle('is-active', state.focuses.size > 0 && state.needs.size > 0);

    const matches = filteredProducts();
    const selections = [...areas.map(area => area.label), ...[...state.needs].map(needLabel), ...[...state.priorities].map(priorityLabel)];
    if (els.goalSelectionCopy) els.goalSelectionCopy.textContent = state.focuses.size
      ? `${state.focuses.size} goal${state.focuses.size === 1 ? '' : 's'} selected · ${matches.length} peptide${matches.length === 1 ? '' : 's'} match all selected choices`
      : 'Choose as many goals as you need.';
    els.finderSummary.innerHTML = `<div><strong>${state.focuses.size ? `${matches.length} matching peptide${matches.length === 1 ? '' : 's'}` : 'Start by choosing one or more goals.'}</strong><span>${selections.length ? escapeHtml(selections.join(' · ')) : 'Selected goals, interests and priorities will be combined.'}${state.focuses.size ? ' · Results only include peptides that match every selected goal.' : ''}</span></div><div class="finder-summary__actions"><button class="reset-button" id="finder-reset" type="button">Reset</button><button class="button button--teal" id="finder-show-results" type="button" ${state.focuses.size ? '' : 'disabled'}>Show my matches</button></div>`;
    els.finderReset = $('finder-reset');

    if (els.finderPreview) {
      const preview = state.focuses.size ? matches.slice(0, 3) : [];
      els.finderPreview.innerHTML = preview.length ? preview.map(product => `<a class="finder-preview-card" href="${productUrl(product)}"><span>${escapeHtml(categories[product.category]?.short || product.category)}</span><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(matchReason(product) || 'Matches your current filters')}</small></a>`).join('') : '';
    }
  }

  function renderActiveFilters() {
    const chips = [];
    state.focuses.forEach(focus => chips.push([`focus:${focus}`, guide.focusAreas.find(area => area.id === focus)?.label || focus]));
    state.needs.forEach(need => chips.push([`need:${need}`, needLabel(need)]));
    state.priorities.forEach(priority => chips.push([`priority:${priority}`, priorityLabel(priority)]));
    if (els.search.value.trim()) chips.push(['search', `Search: ${els.search.value.trim()}`]);
    if (els.category.value !== 'all') chips.push(['category', categories[els.category.value].label]);
    if (els.rating.value !== '0') chips.push(['rating', els.rating.value === 'unrated' ? 'Not yet rated' : `${els.rating.value}+ stars`]);
    if (els.report.value !== 'all') chips.push(['report', 'Lab report available']);
    els.filters.innerHTML = chips.map(([key, label]) => `<button type="button" data-remove-filter="${escapeHtml(key)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('');
  }

  function matchReason(product) {
    const matchedFocuses = guide.focusAreas.filter(area => state.focuses.has(area.id) && (product.content?.discoveryGoals || []).includes(area.id)).map(area => area.label);
    const matchedNeeds = [...state.needs].filter(id => (product.content?.discoveryNeeds || []).includes(id)).map(needLabel);
    if (matchedFocuses.length > 1) return `Matches ${matchedFocuses.length} selected goals: ${matchedFocuses.join(' + ')}`;
    if (matchedFocuses.length === 1 && matchedNeeds.length) return `${matchedFocuses[0]} · ${matchedNeeds.slice(0,2).join(' · ')}`;
    if (matchedFocuses.length === 1) return `Related to ${matchedFocuses[0]}`;
    if (matchedNeeds.length) return `Related to ${matchedNeeds.slice(0,2).join(' · ')}`;
    return '';
  }

  function productBadges(product) {
    const badges = [product.commerce?.checkoutEnabled ? '<span>Available to order</span>' : '<span>Information only</span>'];
    if (hasReports(product)) badges.push('<span>Lab report</span>');
    if (product.content?.specialistOnly) badges.push('<span>Specialist</span>');
    return badges.join('');
  }

  function productCardMarkup(product, featured = false) {
    const enabled = (product.variants || []).filter(variant => variant.checkoutEnabled);
    const inStock = enabled.filter(variant => Number(variant.sandboxStock || 0) > 0);
    const cheapest = inStock.slice().sort((a, b) => a.retailPriceCents - b.retailPriceCents)[0];
    const totalStock = inStock.reduce((sum, variant) => sum + Number(variant.sandboxStock || 0), 0);
    const price = cheapest ? `<strong class="product-price">From ${new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cheapest.retailPriceCents/100)}</strong>` : '';
    const stockClass = cheapest ? 'is-in-stock' : enabled.length ? 'is-out-of-stock' : 'is-info-only';
    const stockCopy = cheapest ? `${totalStock} in stock` : enabled.length ? 'Currently unavailable' : 'Information only';
    const deliveryCopy = cheapest ? `<small>${escapeHtml(product.content?.deliveryEstimate || '7–10 days')}</small>` : '';
    const primaryAction = cheapest ? `<button type="button" class="card-cart-button" data-add-variant="${escapeHtml(cheapest.variantId)}">Add to cart</button>` : `<a href="${productUrl(product)}">View product</a>`;
    return `<article class="product-card product-card--${tones[product.category]}${featured ? ' product-card--featured' : ''}" data-product-id="${escapeHtml(product.id)}">
      <button class="heart-button${saved.has(product.id) ? ' is-saved' : ''}" type="button" data-save-product="${escapeHtml(product.id)}" aria-pressed="${saved.has(product.id)}" aria-label="${saved.has(product.id) ? 'Remove' : 'Save'} ${escapeHtml(productName(product))}"><span aria-hidden="true">${saved.has(product.id) ? '♥' : '♡'}</span></button>
      <a class="product-card__link" href="${productUrl(product)}">
        <div class="product-card__visual">${vialMarkup(product, featured ? 'featured' : 'catalogue')}</div>
        <div class="product-card__content">
          <span class="product-category product-category--compact">${escapeHtml(categories[product.category].label)}</span>
          <h3>${escapeHtml(productName(product))}</h3>
          ${ratingMarkup(product)}
          <div class="product-card__status"><span class="stock-status ${stockClass}">${escapeHtml(stockCopy)}</span>${deliveryCopy}</div>
          ${hasReports(product) || product.content?.specialistOnly ? `<div class="product-card__badges">${hasReports(product) ? '<span>Lab report</span>' : ''}${product.content?.specialistOnly ? '<span>Specialist</span>' : ''}</div>` : ''}
          ${matchReason(product) ? `<div class="product-card__match-reason">${escapeHtml(matchReason(product))}</div>` : ''}
          <div class="product-card__bottom"><span>${price}</span><span class="variant-count">${enabled.length || product.variants.length} variant${(enabled.length || product.variants.length) === 1 ? '' : 's'}</span></div>
        </div>
      </a>
      <div class="product-card__actions product-card__actions--two">${primaryAction}<button class="compare-secondary" type="button" data-compare-product="${escapeHtml(product.id)}" aria-pressed="${compared.has(product.id)}">${compared.has(product.id) ? 'Selected' : 'Compare'}</button></div>
    </article>`;
  }

  function renderFeatured() {
    if (!els.featuredGrid) return;
    const filtersActive = state.focuses.size || state.needs.size || state.priorities.size || els.search.value.trim() || els.category.value !== 'all' || els.rating.value !== '0' || els.report.value !== 'all';
    const preferred = [
      'semaglutide-003',
      'bpc-157-009',
      'cjc-1295-with-dac-032',
      'tb500-thymosin-b4-acetate-013',
      'mt-2-melanotan-2-acetate-007',
      'nad-064'
    ];
    let featured;
    if (!filtersActive) {
      const preferredIds = new Set(preferred);
      const preferredProducts = preferred.map(id => products.find(item => item.id === id && item.content?.published !== false)).filter(Boolean);
      const fallback = products
        .filter(product => product.content?.published !== false && !preferredIds.has(product.id))
        .slice()
        .sort((a, b) => {
          const aAvailable = a.variants?.some(variant => variant.checkoutEnabled && Number(variant.sandboxStock || 0) > 0) ? 1 : 0;
          const bAvailable = b.variants?.some(variant => variant.checkoutEnabled && Number(variant.sandboxStock || 0) > 0) ? 1 : 0;
          return bAvailable - aAvailable || b.reviews.count - a.reviews.count || b.reviews.average - a.reviews.average || informationScore(b) - informationScore(a);
        });
      featured = [...preferredProducts, ...fallback].slice(0, 6);
    } else {
      featured = filteredProducts().slice(0, 6);
    }
    els.featuredGrid.innerHTML = featured.length
      ? featured.map(product => productCardMarkup(product, true)).join('')
      : '<div class="catalogue-empty-inline"><strong>No matching peptides yet</strong><p>Try removing one goal or one interest to widen the results.</p></div>';
  }

  function renderCatalogueStatus() {
    if (catalogueState === 'ready') return false;
    els.grid.setAttribute('aria-busy', String(catalogueState === 'loading'));
    els.grid.innerHTML = catalogueState === 'loading'
      ? Array.from({ length: Math.min(pageSize, 8) }, () => '<div class="product-card product-card--skeleton" aria-hidden="true"><span></span><span></span><span></span></div>').join('')
      : '<div class="catalogue-load-error" role="alert"><strong>The catalogue could not be loaded.</strong><p>Check your connection and try again. Nothing in your saved products or cart has been lost.</p><button class="button button--primary" type="button" data-catalogue-retry>Try again</button></div>';
    els.count.textContent = catalogueState === 'loading' ? 'Loading products…' : 'Catalogue unavailable';
    els.empty.hidden = true;
    els.load.hidden = true;
    if (els.featuredGrid) els.featuredGrid.innerHTML = '';
    return true;
  }

  function render() {
    if (renderCatalogueStatus()) { renderActiveFilters(); renderFinder(); return; }
    els.grid.setAttribute('aria-busy', 'false');
    const matches = filteredProducts();
    const shown = matches.slice(0, visibleLimit);
    els.grid.classList.add('is-updating');
    els.grid.innerHTML = shown.map(product => productCardMarkup(product)).join('');
    requestAnimationFrame(() => els.grid.classList.remove('is-updating'));
    els.count.textContent = `${matches.length} product${matches.length === 1 ? '' : 's'} found · ${shown.length} shown`;
    els.empty.hidden = matches.length !== 0;
    els.load.hidden = shown.length >= matches.length;
    renderFeatured(); renderActiveFilters(); renderSaved(); renderCompareBar(); renderFinder();
  }

  function syncSavedButtons() {
    document.querySelectorAll('[data-save-product]').forEach(button => {
      const id = button.dataset.saveProduct;
      const on = saved.has(id);
      const product = products.find(item => item.id === id);
      button.classList.toggle('is-saved', on);
      button.setAttribute('aria-pressed', String(on));
      if (product) button.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${productName(product)}`);
      const glyph = button.querySelector('span');
      if (glyph) glyph.textContent = on ? '♥' : '♡';
    });
  }

  function renderSaved() {
    const list = products.filter(product => saved.has(product.id));
    els.savedCount.textContent = String(list.length);
    els.savedList.innerHTML = list.length ? list.map(product => `<article><div><span>${escapeHtml(categories[product.category].label)}</span><a href="${productUrl(product)}">${escapeHtml(productName(product))}</a><small>${product.content?.specialistOnly ? 'Specialist information · ' : ''}${hasReports(product) ? 'Lab report available' : 'Information only'}</small></div><button type="button" data-remove-saved="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(productName(product))}">×</button></article>`).join('') : '<div class="saved-empty"><strong>No saved products yet</strong><p>Use the heart on any product card to build a separate shortlist.</p></div>';
  }

  function syncCompareButtons() {
    document.querySelectorAll('[data-compare-product]').forEach(button => {
      const on = compared.has(button.dataset.compareProduct);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Selected' : 'Compare';
    });
  }

  let compareLimitTimer;
  function flashCompareLimit() {
    const hint = els.compareBar?.querySelector('span');
    if (!hint) return;
    els.compareBar.classList.add('is-limit');
    hint.textContent = 'Maximum reached — remove a product to add another.';
    clearTimeout(compareLimitTimer);
    compareLimitTimer = setTimeout(() => { els.compareBar.classList.remove('is-limit'); hint.textContent = 'Compare up to three products.'; }, 3200);
  }

  function renderCompareBar() {
    const count = compared.size;
    els.compareBar.hidden = count === 0;
    els.compareCount.textContent = `${count} product${count === 1 ? '' : 's'} selected`;
  }

  function resetFinder(renderNow = true) {
    state.focuses.clear();
    state.needs.clear();
    state.priorities.clear();
    persist();
    if (renderNow) render();
  }

  function resetAll() {
    resetFinder(false);
    els.search.value = '';
    els.category.value = 'all';
    els.rating.value = '0';
    els.report.value = 'all';
    els.sort.value = 'relevance';
    visibleLimit = pageSize;
    render();
  }

  function applyCategory(category) {
    resetFinder(false);
    els.category.value = category;
    visibleLimit = pageSize;
    render();
    $('catalogue').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function applyFocus(focus, scroll = true) {
    if (state.focuses.has(focus)) {
      state.focuses.delete(focus);
      const area = guide.focusAreas.find(item => item.id === focus);
      for (const need of area?.needs || []) state.needs.delete(need.id);
    } else state.focuses.add(focus);
    els.category.value = 'all'; visibleLimit = pageSize; persist(); render();
    if (scroll) $('finder').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openSaved() {
    els.savedDrawer.setAttribute('aria-hidden', 'false');
    els.savedDrawer.classList.add('is-open');
    els.backdrop.hidden = false;
    document.body.classList.add('drawer-open');
  }
  function closeSaved() {
    els.savedDrawer.setAttribute('aria-hidden', 'true');
    els.savedDrawer.classList.remove('is-open');
    els.backdrop.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function openComparison() {
    const list = products.filter(product => compared.has(product.id));
    els.compareContent.innerHTML = `<table><thead><tr><th>Information</th>${list.map(product => `<th><a href="${productUrl(product)}">${escapeHtml(productName(product))}</a></th>`).join('')}</tr></thead><tbody>
      <tr><th>Category</th>${list.map(product => `<td>${escapeHtml(categories[product.category].label)}</td>`).join('')}</tr>
      <tr><th>Rating</th>${list.map(product => `<td>${product.reviews.count ? `${product.reviews.average.toFixed(1)} / 5 (${product.reviews.count})` : 'No ratings yet'}</td>`).join('')}</tr>
      <tr><th>Variants</th>${list.map(product => `<td>${product.variants.length}</td>`).join('')}</tr>
      <tr><th>Delivery estimate</th>${list.map(product => `<td>${escapeHtml(product.content?.deliveryEstimate || '7–10 days')}</td>`).join('')}</tr>
      <tr><th>Lab report</th>${list.map(product => `<td>${hasReports(product) ? 'Available' : 'Not published'}</td>`).join('')}</tr>
      <tr><th>Product status</th>${list.map(product => `<td>${product.content?.specialistOnly ? 'Specialist information' : 'Information only'}</td>`).join('')}</tr>
    </tbody></table>`;
    els.compareDialog.showModal();
  }

  function openVera() {
    els.veraPanel.hidden = false;
    els.veraLauncher.setAttribute('aria-expanded', 'true');
    els.veraQuestion.focus();
  }
  function closeVera() {
    els.veraPanel.hidden = true;
    els.veraLauncher.setAttribute('aria-expanded', 'false');
  }
  function setupMotion() {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) document.body.classList.add('motion-ready');
    const ambient = document.getElementById('ambient-liquid');
    // The scroll-driven variables are only consumed by the v6/v7 liquid shapes. Writing them on :root
    // restyles the whole document every frame, so skip the work when none of those shapes is rendered.
    const ambientConsumers = document.querySelector('.ambient-liquid__shape, .ambient-liquid__sheen, .liquid-blob, .liquid-bubble, .fluid-group--front, .fluid-group--back');
    if (ambient && ambientConsumers && !reduceMotion) {
      let ambientTicking = false;
      const updateAmbient = () => {
        const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const progress = Math.min(1, Math.max(0, scrollY / range));
        const heroProgress = Math.min(1, Math.max(0, scrollY / 760));
        const wave = Math.sin(progress * Math.PI * 2);
        const root = document.documentElement;
        root.style.setProperty('--ambient-mint-x', `${(-18 + progress * 34).toFixed(2)}px`);
        root.style.setProperty('--ambient-mint-y', `${(progress * 58).toFixed(2)}px`);
        root.style.setProperty('--ambient-mint-r', `${(-3 + progress * 8).toFixed(2)}deg`);
        root.style.setProperty('--ambient-blue-x', `${(16 - progress * 30).toFixed(2)}px`);
        root.style.setProperty('--ambient-blue-y', `${(-progress * 44).toFixed(2)}px`);
        root.style.setProperty('--ambient-pearl-x', `${(wave * 18).toFixed(2)}px`);
        root.style.setProperty('--ambient-pearl-y', `${(-progress * 72).toFixed(2)}px`);
        root.style.setProperty('--ambient-amber-x', `${(-wave * 13).toFixed(2)}px`);
        root.style.setProperty('--ambient-amber-y', `${(progress * 34).toFixed(2)}px`);
        root.style.setProperty('--ambient-sheen-y', `${(-progress * 11).toFixed(2)}vh`);
        root.style.setProperty('--hero-liquid-x', `${(heroProgress * -28).toFixed(2)}px`);
        root.style.setProperty('--hero-liquid-y', `${(heroProgress * 44).toFixed(2)}px`);
        root.style.setProperty('--hero-liquid-r', `${(heroProgress * 3).toFixed(2)}deg`);
        root.style.setProperty('--hero-bubble-y', `${(heroProgress * -64).toFixed(2)}px`);
        ambientTicking = false;
      };
      const requestAmbientUpdate = () => {
        if (ambientTicking) return;
        ambientTicking = true;
        requestAnimationFrame(updateAmbient);
      };
      addEventListener('scroll', requestAmbientUpdate, { passive: true });
      addEventListener('resize', requestAmbientUpdate, { passive: true });
      updateAmbient();
    }

    const trustItems = [...els.trustSignals.querySelectorAll('span')];
    if (trustItems.length) {
      trustItems.forEach((item, index) => item.classList.toggle('is-active', index === 0));
      if (matchMedia('(max-width:780px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let activeTrust = 0;
        setInterval(() => {
          trustItems[activeTrust]?.classList.remove('is-active');
          activeTrust = (activeTrust + 1) % trustItems.length;
          trustItems[activeTrust]?.classList.add('is-active');
        }, 5000);
      }
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.1 });
    document.querySelectorAll('.reveal-section').forEach(section => observer.observe(section));
    const updateMobileFloating = () => {
      const tag = document.activeElement?.tagName || '';
      const editing = ['INPUT','SELECT','TEXTAREA'].includes(tag);
      els.veraLauncher?.classList.toggle('is-compact', scrollY > 120 || editing);
    };
    addEventListener('scroll', () => { els.header?.classList.toggle('is-compact', scrollY > 40); updateMobileFloating(); }, { passive: true });
    document.addEventListener('focusin', updateMobileFloating);
    document.addEventListener('focusout', () => setTimeout(updateMobileFloating, 0));
    updateMobileFloating();
  }

  [els.search, els.category, els.rating, els.report, els.sort].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => {
    visibleLimit = pageSize;
    render();
  }));
  els.reset.addEventListener('click', resetAll);
  els.load.addEventListener('click', () => { visibleLimit += pageSize; render(); });

  document.addEventListener('click', event => {
    const category = event.target.closest('[data-category-target]');
    if (category) applyCategory(category.dataset.categoryTarget);

    const focus = event.target.closest('[data-focus]');
    if (focus) applyFocus(focus.dataset.focus, false);

    const need = event.target.closest('[data-need]');
    if (need) {
      state.needs.has(need.dataset.need) ? state.needs.delete(need.dataset.need) : state.needs.add(need.dataset.need);
      visibleLimit = pageSize;
      persist();
      render();
    }

    const priority = event.target.closest('[data-priority]');
    if (priority) {
      const id = priority.dataset.priority;
      state.priorities.has(id) ? state.priorities.delete(id) : state.priorities.add(id);
      visibleLimit = pageSize;
      persist();
      render();
    }

    if (event.target.closest('#finder-reset')) resetFinder();
    if (event.target.closest('#finder-show-results')) $('catalogue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const remove = event.target.closest('[data-remove-filter]');
    if (remove) {
      const key = remove.dataset.removeFilter;
      if (key.startsWith('focus:')) { const id=key.split(':')[1]; state.focuses.delete(id); const area=guide.focusAreas.find(item=>item.id===id); for(const need of area?.needs||[]) state.needs.delete(need.id); }
      if (key.startsWith('need:')) state.needs.delete(key.split(':')[1]);
      if (key.startsWith('priority:')) state.priorities.delete(key.split(':')[1]);
      if (key === 'search') els.search.value = '';
      if (key === 'category') els.category.value = 'all';
      if (key === 'rating') els.rating.value = '0';
      if (key === 'report') els.report.value = 'all';
      persist(); render();
    }

    const add = event.target.closest('[data-add-variant]');
    if (add) { event.preventDefault(); window.VerapepeCart?.addItem(add.dataset.addVariant, 1); window.VerapepeCart?.open(); }

    const save = event.target.closest('[data-save-product]');
    if (save) {
      const id = save.dataset.saveProduct;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      // Saving does not change which products match, so update in place instead of
      // re-rendering every card (faster, and keeps keyboard focus on the button).
      persist(); syncSavedButtons(); renderSaved();
    }
    const unsave = event.target.closest('[data-remove-saved]');
    if (unsave) { saved.delete(unsave.dataset.removeSaved); persist(); render(); }

    const compare = event.target.closest('[data-compare-product]');
    if (compare) {
      const id = compare.dataset.compareProduct;
      if (compared.has(id)) compared.delete(id);
      else if (compared.size < 3) compared.add(id);
      else { flashCompareLimit(); return; }
      persist(); syncCompareButtons(); renderCompareBar();
    }
  });

  els.savedButton.addEventListener('click', openSaved);
  els.savedClose.addEventListener('click', closeSaved);
  els.backdrop.addEventListener('click', closeSaved);
  els.clearSaved.addEventListener('click', () => { saved.clear(); persist(); render(); });
  els.clearCompare.addEventListener('click', () => { compared.clear(); persist(); render(); });
  els.openCompare.addEventListener('click', openComparison);
  els.veraLauncher.addEventListener('click', () => els.veraPanel.hidden ? openVera() : closeVera());
  els.veraClose.addEventListener('click', closeVera);
  $('hero-ask-vera')?.addEventListener('click', openVera);
  $('hero-ask-vera-card')?.addEventListener('click', openVera);
  $('section-ask-vera')?.addEventListener('click', openVera);
  $('info-ask-vera')?.addEventListener('click', openVera);
  // v17: the panel uses the shared Vera client (pending state, links, suggestions, plain-language errors).
  // Quick buttons ask common questions instead of applying health-area filters.
  const veraChat = window.VeraClient?.attach({ form: els.veraForm, input: els.veraQuestion, log: els.veraLog, submit: els.veraForm.querySelector('button[type="submit"]') });
  els.veraQuick.addEventListener('click', event => {
    const quick = event.target.closest('[data-vera-ask]');
    if (quick) veraChat?.send(quick.dataset.veraAsk);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !els.veraPanel.hidden) { closeVera(); els.veraLauncher.focus(); }
  });
  els.menu.addEventListener('click', () => {
    const expanded = els.menu.getAttribute('aria-expanded') === 'true';
    els.menu.setAttribute('aria-expanded', String(!expanded));
    els.nav.classList.toggle('is-open', !expanded);
  });
  const filterToggle = document.querySelector('[data-filter-toggle]');
  const filterPanel = $('catalogue-filters');
  filterToggle?.addEventListener('click', () => {
    const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', String(!expanded));
    filterPanel?.classList.toggle('is-open', !expanded);
  });

  async function refreshStorefront() {
    const response = await fetch('/api/storefront', { cache: 'no-store' });
    if (!response.ok) throw new Error('Storefront API unavailable.');
    const storefront = await response.json();
    products = storefront.products; guide = storefront.guide || guide;
    catalogueState = 'ready';
    const publicVariantCount = products.reduce((sum, product) => sum + (product.variants?.length || 0), 0);
    const purchasableProducts = products.filter(product => product.commerce?.checkoutEnabled && product.variants?.some(variant => variant.checkoutEnabled)).length;
    const heroCount = $('hero-catalogue-count');
    if (heroCount) heroCount.textContent = `${products.length} products · ${publicVariantCount} catalogue variants`;
    const catalogueSummary = $('catalogue-summary');
    if (catalogueSummary) catalogueSummary.textContent = `${products.length} products · ${publicVariantCount} variants`;
    const orbitCount = $('orbit-product-count');
    if (orbitCount) orbitCount.textContent = String(products.length);
    const commerceStatus = $('hero-commerce-status');
    if (commerceStatus) commerceStatus.textContent = storefront.mode === 'sandbox' ? `${purchasableProducts} product${purchasableProducts === 1 ? '' : 's'} available in preview checkout` : 'Catalogue preview';
    const footerStatus = $('footer-store-status');
    if (footerStatus) footerStatus.textContent = `${storefront.config?.storeName || 'VERAPEP'} · ${storefront.mode === 'sandbox' ? 'Preview environment' : 'Catalogue mode'}`;
    document.querySelectorAll('[data-category-count]').forEach(node => {
      const categoryId = node.dataset.categoryCount;
      const categoryProducts = products.filter(product => product.category === categoryId);
      const categoryVariants = categoryProducts.reduce((sum, product) => sum + (product.variants?.length || 0), 0);
      node.textContent = `${categoryProducts.length} product${categoryProducts.length === 1 ? '' : 's'} · ${categoryVariants} variant${categoryVariants === 1 ? '' : 's'}`;
    });
    const signals = storefront.config?.trustSignals || [];
    const currentSignals = [...els.trustSignals.querySelectorAll('span')].map(node => node.textContent.trim());
    if (signals.length && signals.join('|') !== currentSignals.join('|')) { const trustMarkup = signals.map(signal => `<span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7"/></svg> ${escapeHtml(signal)}</span>`).join(''); els.trustSignals.innerHTML = trustMarkup; }
    const stat = (key, value) => document.querySelectorAll(`[data-stat="${key}"]`).forEach(node => { node.textContent = String(value); });
    stat('products', products.length); stat('variants', publicVariantCount); stat('countries', (storefront.config?.allowedCountries || []).length);
    document.querySelectorAll('.brand > span:last-child').forEach(node => { node.textContent = storefront.config?.storeName || 'VERAPEP'; });
    const assistantName = storefront.config?.assistantName || 'Ask Vera';
    if (els.veraLauncher) els.veraLauncher.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg> ${escapeHtml(assistantName)}`;
    const veraTitle = els.veraPanel?.querySelector('.vera-panel__header strong'); if (veraTitle) veraTitle.textContent = assistantName;
    saved = new Set([...saved].filter(id => products.some(product => product.id === id)));
    compared = new Set([...compared].filter(id => products.some(product => product.id === id)));
    render();
    return storefront;
  }

  async function init() {
    try { await refreshStorefront(); } catch (error) { catalogueState = 'failed'; console.warn('Storefront could not be loaded.', error); }
    els.grid.addEventListener('click', async event => {
      if (!event.target.closest('[data-catalogue-retry]')) return;
      catalogueState = 'loading'; render();
      try { await refreshStorefront(); } catch { catalogueState = 'failed'; render(); }
    });

    const previous = JSON.parse(localStorage.getItem('vp-guide-selection') || '{}');
    const previousFocuses = previous.focuses || (previous.focus ? [previous.focus] : []);
    const previousNeeds = previous.needs || (previous.need ? [previous.need] : []);
    state.focuses = new Set(previousFocuses.filter(id => guide.focusAreas.some(area => area.id === id)));
    state.needs = new Set(previousNeeds);
    state.priorities = new Set((previous.priorities || []).filter(id => guide.priorities.some(item => item.id === id)));

    const params = new URLSearchParams(location.search);
    const paramFocuses = (params.get('focuses') || params.get('focus') || '').split(',').filter(Boolean);
    if (paramFocuses.length) state.focuses = new Set(paramFocuses.filter(id => guide.focusAreas.some(area => area.id === id)));
    const paramNeeds = (params.get('needs') || params.get('need') || '').split(',').filter(Boolean);
    if (paramNeeds.length) state.needs = new Set(paramNeeds);
    if (params.has('category') && categories[params.get('category')]) els.category.value = params.get('category');
    if (params.get('rating')) els.rating.value = params.get('rating');
    if (params.get('reports') === 'yes') els.report.value = 'reports';
    if (params.get('search')) els.search.value = params.get('search');

    saved = new Set([...saved].filter(id => products.some(product => product.id === id)));
    compared = new Set([...compared].filter(id => products.some(product => product.id === id)));
    persist(); render();
    setupMotion();
    if ([...params.keys()].length) $('catalogue').scrollIntoView({ block: 'start' });
    if ('EventSource' in window && !params.has('preview')) {
      const events = new EventSource('/api/storefront/events');
      let lastRevision = 0;
      events.addEventListener('storefront', async event => {
        const update = JSON.parse(event.data || '{}');
        if (update.reason === 'connected' || update.revision <= lastRevision) return;
        lastRevision = update.revision;
        try { await refreshStorefront(); } catch (error) { console.warn(error); }
      });
    }
  }

  init();
})();
