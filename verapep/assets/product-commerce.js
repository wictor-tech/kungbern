/* VERAPEP product page (v16).
   Renders one product from /api/storefront: catalogue facts, variant specifications,
   published information, documentation status, delivery, related products and
   moderated reviews. Only data that exists in the catalogue/admin content is shown;
   missing information is labelled as not yet published, never filled in. */
(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const productId = document.body.dataset.productId || decodeURIComponent((location.pathname.split('/').filter(Boolean).pop() || new URLSearchParams(location.search).get('id') || '').replace(/\.html$/i, ''));
  const readSet = key => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } };
  const saved = readSet('vp-saved-products');
  const compared = readSet('vp-compare-products');
  const persist = () => {
    try {
      localStorage.setItem('vp-saved-products', JSON.stringify([...saved]));
      localStorage.setItem('vp-compare-products', JSON.stringify([...compared]));
    } catch { /* storage unavailable: the page keeps working for this visit */ }
  };
  const money = cents => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
  const stars = value => { const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0))); return '★'.repeat(n) + '☆'.repeat(5 - n); };
  const icon = path => `<svg aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`;
  const ICONS = {
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'
  };

  /* Presentation-only parsing of the supplier specification ("5mg *10vials").
     Returns the original text when the pattern is not recognised. */
  const UNIT = { mg: 'mg', mcg: 'µg', ug: 'µg', 'µg': 'µg', iu: 'IU', ml: 'mL', g: 'g' };
  function parseSpec(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/^([\d.,]+)\s*(mg|mcg|ug|µg|iu|ml|g)\b\s*(?:[*x×]\s*(\d+)\s*(vials?|pcs|pieces|bottles?|pens?))?/i);
    if (!match) return { strength: text || '—', pack: '', raw: text };
    const unit = UNIT[match[2].toLowerCase()] || match[2];
    const pack = match[3] ? `${match[3]} ${/^vial/i.test(match[4]) ? (match[3] === '1' ? 'vial' : 'vials') : match[4].toLowerCase()}` : '';
    const rest = text.slice(match[0].length).replace(/^[\s*+,]+/, '').trim();
    return { strength: `${match[1]} ${unit}${rest ? ` ${rest}` : ''}`, pack, raw: text };
  }

  let toastTimer;
  function toast(message) {
    let node = document.getElementById('product-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'product-toast';
      node.className = 'product-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
  }

  function updateSave() {
    const on = saved.has(productId);
    document.querySelectorAll('[data-product-save]').forEach(button => {
      button.classList.toggle('is-saved', on);
      button.setAttribute('aria-pressed', String(on));
      button.innerHTML = on ? '<span aria-hidden="true">♥</span> Saved' : '<span aria-hidden="true">♡</span> Save product';
    });
    document.querySelectorAll('[data-saved-count]').forEach(node => { node.textContent = String(saved.size); });
  }
  function updateCompare() {
    const button = document.getElementById('product-compare');
    if (!button) return;
    const on = compared.has(productId);
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'In comparison ✓' : 'Compare';
  }

  function renderUnavailable() {
    document.querySelector('main').innerHTML = '<section class="shell product-unavailable"><p class="eyebrow">Not available</p><h1>This product is no longer published.</h1><p>It may have been removed from the catalogue. Browse the current products instead.</p><a class="button button--primary" href="/#catalogue">Return to products</a></section>';
  }

  function relatedProducts(storefront, product) {
    const goals = new Set(product.content?.discoveryGoals || []);
    return storefront.products
      .filter(other => other.id !== product.id && other.category === product.category && other.content?.published !== false)
      .map(other => ({ other, score: (other.content?.discoveryGoals || []).filter(goal => goals.has(goal)).length }))
      .sort((a, b) => b.score - a.score || String(a.other.name).localeCompare(String(b.other.name)))
      .slice(0, 4)
      .map(item => item.other);
  }

  let renderedFingerprint = null;
  async function renderPage() {
    const response = await fetch('/api/storefront', { cache: 'no-store' });
    const storefront = await response.json();
    const product = storefront.products.find(item => item.id === productId);
    renderedFingerprint = product ? JSON.stringify(product) : null;
    if (!product) { renderUnavailable(); return; }

    const content = product.content || {};
    const category = storefront.categories.find(item => item.id === product.category);
    const renderer = window.VerapepeVialRenderer;
    const name = renderer?.displayName(product) || content.displayName || product.name;
    const variants = product.variants || [];
    const specs = variants.map(variant => ({ variant, ...parseSpec(variant.specification) }));
    const orderable = variants.filter(variant => variant.checkoutEnabled && Number(variant.sandboxStock || 0) > 0);
    const lowest = orderable.slice().sort((a, b) => a.retailPriceCents - b.retailPriceCents)[0];
    const reports = (content.labReports || []).filter(report => report.published && report.url);
    const packs = [...new Set(specs.map(spec => spec.pack).filter(Boolean))];
    const strengths = specs.map(spec => spec.strength);
    const catalogueNos = variants.map(variant => variant.catalogueNo).filter(Boolean);
    const availability = orderable.length ? 'Available in preview' : 'Information only';
    const focusLabels = (content.discoveryGoals || []).map(id => storefront.guide?.focusAreas?.find(area => area.id === id)?.label || id);
    const needMap = new Map((storefront.guide?.focusAreas || []).flatMap(area => area.needs || []).map(need => [need.id, need.label]));
    const needLabels = (content.discoveryNeeds || []).map(id => needMap.get(id) || id);

    document.title = `${name} — VERAPEP`;
    const meta = document.querySelector('meta[name=description]');
    if (meta) meta.content = content.shortDescription || `${name}: catalogue specifications, availability and published documentation at VERAPEP.`;
    const crumb = document.getElementById('product-breadcrumb');
    if (crumb) crumb.textContent = name;
    const crumbCategory = document.getElementById('product-breadcrumb-category');
    if (crumbCategory && category) { crumbCategory.textContent = category.label; crumbCategory.href = `/index.html?category=${encodeURIComponent(category.id)}#catalogue`; }
    const askLink = `/support.html?product=${encodeURIComponent(productId)}`;
    const ask = document.getElementById('product-ask-vera');
    if (ask) ask.href = askLink;

    /* Hero */
    const hero = document.querySelector('.product-hero__copy');
    if (hero) {
      const lead = content.shortDescription
        || `${name} is listed in the ${category?.label || 'VERAPEP'} catalogue in ${variants.length} specification${variants.length === 1 ? '' : 's'}. A detailed description has not been published yet.`;
      const strengthFact = strengths.length > 1 ? `${strengths[0]} – ${strengths[strengths.length - 1]}` : (strengths[0] || '—');
      hero.innerHTML = `
        <span class="product-status-pill ${orderable.length ? 'is-available' : 'is-info'}">${escapeHtml(availability)}</span>
        <p class="eyebrow">${escapeHtml(category?.label || product.category)}</p>
        <h1>${escapeHtml(name)}</h1>
        <p class="product-lead">${escapeHtml(lead)}</p>
        ${product.reviews?.count ? `<div class="product-rating-summary"><span class="rating-stars" aria-hidden="true">${stars(product.reviews.average)}</span><span class="sr-only">Rated ${product.reviews.average.toFixed(1)} out of 5.</span><strong>${product.reviews.average.toFixed(1)}</strong><a href="#customer-reviews">${product.reviews.count} reviews</a></div>` : ''}
        <dl class="product-quick-facts product-quick-facts--v16">
          <div><dt>Specifications</dt><dd>${variants.length} · ${escapeHtml(strengthFact)}</dd></div>
          <div><dt>Pack size</dt><dd>${escapeHtml(packs.join(', ') || 'See specifications')}</dd></div>
          <div><dt>${lowest ? 'Price from' : 'Availability'}</dt><dd>${lowest ? escapeHtml(money(lowest.retailPriceCents)) : 'Not available to order yet'}</dd></div>
          <div><dt>Documentation</dt><dd>${reports.length ? `${reports.length} lab report${reports.length === 1 ? '' : 's'}` : 'No report published yet'}</dd></div>
        </dl>
        <div class="product-action-strip product-action-strip--v10">
          ${orderable.length ? '<a class="button button--teal" href="#specifications">Choose a variant</a>' : ''}
          <button class="button button--light" data-product-save type="button"></button>
          <button class="button button--light" id="product-compare" type="button" aria-pressed="false"></button>
          <a class="button button--light" href="${askLink}">Ask Vera</a>
        </div>
        ${orderable.length ? '' : `<p class="product-availability-note">${icon(ICONS.clock)}<span>This product is in the catalogue for information. It can be ordered once it has been individually approved and enabled.</span></p>`}`;
    }

    /* Visual */
    const summary = document.querySelector('.product-summary');
    if (summary) {
      const unifiedVial = renderer?.render(product, { instance: 'product-detail', mode: 'detail' });
      summary.className = 'product-summary product-visual-card product-visual-card--v10 product-visual-card--premium-vial';
      // v19: an approved photograph (content workflow) is shown before the generated illustration.
      if (content.imageUrl) summary.innerHTML = `<img class="product-main-image" src="${escapeHtml(content.imageUrl)}" ${content.imageSrcset ? `srcset="${escapeHtml(content.imageSrcset)}"` : ''} sizes="${escapeHtml(content.imageSizes || '(max-width: 720px) 92vw, 520px')}" alt="${escapeHtml(content.imageAlt || name)}" loading="eager" decoding="async">`;
      else if (unifiedVial) summary.innerHTML = unifiedVial;
      else summary.innerHTML = `<div class="product-visual-card__symbol">${escapeHtml(name.slice(0, 2).toUpperCase())}</div>`;
      summary.insertAdjacentHTML('beforeend', content.imageUrl ? '<p class="product-visual-caption">Product photograph approved by VERAPEP.</p>' : '<p class="product-visual-caption">Illustration of the VERAPEP vial label. Not a photograph of a specific batch.</p>');
    }

    /* In-page section navigation */
    const sections = [['specifications', 'Specifications'], ['information', 'Information'], ['documentation', 'Documentation'], ['delivery', 'Delivery'], ['customer-reviews', 'Reviews']];
    document.querySelector('.product-section-nav')?.remove();
    document.querySelector('.product-hero')?.insertAdjacentHTML('afterend', `<nav class="product-section-nav" aria-label="Product sections"><div class="shell">${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</div></nav>`);

    /* Specifications */
    const panel = document.querySelector('.variant-panel');
    if (panel) panel.id = 'specifications';
    const header = document.querySelector('.variant-panel__header');
    if (header) header.innerHTML = `<p class="eyebrow">Specifications</p><h2>Variants and reference prices</h2><p>${orderable.length ? 'Variants marked available can be added to the cart in the preview checkout.' : 'Listed for reference. None of these variants can be ordered yet.'}</p>`;
    const grid = document.getElementById('variant-selector-grid');
    if (grid) {
      grid.innerHTML = `<div class="spec-table" role="table" aria-label="${escapeHtml(name)} specifications">
        <div class="spec-table__row spec-table__row--head" role="row"><span role="columnheader">Catalogue no.</span><span role="columnheader">Strength</span><span role="columnheader">Pack</span><span role="columnheader">Reference price</span><span role="columnheader">Status</span></div>
        ${specs.map(({ variant, strength, pack }) => {
          const canBuy = variant.checkoutEnabled && Number(variant.sandboxStock || 0) > 0;
          const status = canBuy ? `${variant.sandboxStock} in stock` : variant.checkoutEnabled ? 'Out of stock' : 'Not available yet';
          return `<article class="variant-card spec-table__row" role="row">
            <span role="cell" data-label="Catalogue no." class="spec-table__cat">${escapeHtml(variant.catalogueNo || '—')}</span>
            <span role="cell" data-label="Strength" class="spec-table__strength"><strong>${escapeHtml(strength)}</strong></span>
            <span role="cell" data-label="Pack">${escapeHtml(pack || '—')}</span>
            <span role="cell" data-label="Reference price" class="spec-table__price">${variant.retailPriceCents ? escapeHtml(money(variant.retailPriceCents)) : '—'}</span>
            <span role="cell" data-label="Status" class="spec-table__status">${canBuy ? `<button class="button button--teal variant-add-button" data-add-variant="${escapeHtml(variant.variantId)}" type="button">Add to cart</button><small>${escapeHtml(status)}</small>` : `<span class="variant-card__stock is-unavailable">${escapeHtml(status)}</span>`}</span>
          </article>`;
        }).join('')}
      </div>
      <p class="spec-footnote">Specifications and catalogue numbers come from the VERAPEP catalogue. Prices are reference prices in EUR${catalogueNos.length ? '' : ''} and apply only once a variant is available to order.</p>`;
    }

    /* Information, documentation, delivery, reviews */
    const approved = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`).then(r => r.json()).then(x => x.reviews || []).catch(() => []);
    const infoRows = [
      ['Description', content.fullDescription || content.shortDescription],
      ['Contents', content.ingredients],
      ['Storage', content.storage],
      ['Handling and use', content.usage],
      ['Warnings and limitations', content.warnings]
    ];
    const published = infoRows.filter(([, value]) => value);
    const pending = infoRows.filter(([, value]) => !value).map(([label]) => label);
    document.querySelector('.product-details-shell')?.remove();
    const details = document.createElement('section');
    details.className = 'product-details-shell shell product-details-shell--v16';
    details.innerHTML = `
      <article class="product-details-card" id="information">
        <p class="eyebrow">Product information</p>
        <h2>About ${escapeHtml(name)}</h2>
        ${published.length ? published.map(([label, value]) => `<section class="product-info-block"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></section>`).join('') : ''}
        ${pending.length ? `<div class="product-pending">
          <div class="product-pending__icon">${icon(ICONS.doc)}</div>
          <div><h3>${published.length ? 'Not yet published' : 'Detailed information is being prepared'}</h3>
          <p>VERAPEP only publishes product information after review. The following has not been published for this product yet:</p>
          <ul class="product-pending__list">${pending.map(label => `<li>${escapeHtml(label)}</li>`).join('')}</ul>
          <p class="product-pending__help">Questions in the meantime? <a href="${askLink}">Ask Vera</a> or <a href="mailto:hello@verapep.eu">contact support</a>.</p></div>
        </div>` : ''}
        <section class="product-info-block"><h3>Catalogue classification</h3><p class="product-info-block__muted">Used by the product finder to group related products. This is a catalogue grouping, not a claim about effects.</p>
          <div class="product-tag-list">${[...focusLabels, ...needLabels].map(label => `<span>${escapeHtml(label)}</span>`).join('') || '<span>Not classified</span>'}</div>
        </section>
      </article>
      <div class="product-side-stack--v16">
        <article class="product-details-card product-details-card--compact" id="documentation">
          <p class="eyebrow">Documentation</p><h2>Lab reports</h2>
          ${reports.length
            ? `<div class="lab-report-list">${reports.map(report => `<a href="${escapeHtml(report.url)}" target="_blank" rel="noopener">${icon(ICONS.doc)}<span>${escapeHtml(report.title || 'Lab report')}</span><span aria-hidden="true">↗</span><span class="sr-only">(opens in a new tab)</span></a>`).join('')}</div>`
            : `<p>No lab report has been published for this product yet. Reports are only shown when they belong to this product and have been approved for publication.</p>`}
        </article>
        <article class="product-details-card product-details-card--compact" id="delivery">
          <p class="eyebrow">Delivery</p><h2>Shipping</h2>
          ${orderable.length
            ? `<p><strong>Estimated delivery:</strong> ${escapeHtml(content.deliveryEstimate || storefront.config?.shippingMethods?.[0]?.estimatedDays || '—')}</p>`
            : '<p>Delivery details apply once a variant is available to order.</p>'}
          <p>Delivery is configured for ${(storefront.config?.allowedCountries || []).length} European countries.</p>
          <a class="product-inline-link" href="/shipping-returns.html">Shipping &amp; returns ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a>
        </article>
      </div>
      <article class="product-review-card" id="customer-reviews">
        <p class="eyebrow">Moderated feedback</p><h2>Customer reviews</h2>
        <div class="review-list-public">${approved.length ? approved.map(review => `<article><header><div><span class="rating-stars" aria-hidden="true">${stars(review.rating)}</span><span class="sr-only">${Number(review.rating)} out of 5</span><strong>${Number(review.rating).toFixed(1)}</strong></div><small>${escapeHtml(review.name)}</small></header><p>${escapeHtml(review.text)}</p></article>`).join('') : '<p class="review-empty">No reviews have been published yet. Every review is checked before it appears.</p>'}</div>
        <details class="review-form-toggle"><summary>Write a review</summary>
        <form id="product-review-form" novalidate><div class="admin-form-grid"><label class="field"><span>Name</span><input id="review-name" autocomplete="name" required></label><label class="field"><span>Rating</span><select id="review-rating"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Average</option><option value="2">2 — Poor</option><option value="1">1 — Very poor</option></select></label><label class="field field--wide"><span>Review</span><textarea id="review-text" minlength="10" required aria-describedby="review-help"></textarea><small id="review-help">At least 10 characters. Reviews are published after moderation.</small></label></div><button class="button button--primary" type="submit">Submit for moderation</button><p id="review-message" role="status"></p></form>
        </details>
      </article>`;
    document.querySelector('.product-content')?.insertAdjacentElement('afterend', details);

    /* Related products */
    const related = relatedProducts(storefront, product);
    document.querySelector('.product-related')?.remove();
    if (related.length) {
      const relatedSection = document.createElement('section');
      relatedSection.className = 'product-related shell';
      relatedSection.setAttribute('aria-labelledby', 'related-title');
      relatedSection.innerHTML = `<div class="product-related__head"><div><p class="eyebrow">${escapeHtml(category?.label || 'Catalogue')}</p><h2 id="related-title">More in this category</h2></div><a href="/index.html?category=${encodeURIComponent(product.category)}#catalogue">View all ${escapeHtml(category?.label || '')} ${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a></div>
        <div class="product-related__grid">${related.map(other => {
          const otherName = renderer?.displayName(other) || other.content?.displayName || other.name;
          return `<a class="product-related__card" href="/product/${encodeURIComponent(other.id)}"><div class="product-related__visual">${renderer?.render(other, { instance: `related-${other.id}`, mode: 'card' }) || ''}</div><div><strong>${escapeHtml(otherName)}</strong><small>${(other.variants || []).length} specification${(other.variants || []).length === 1 ? '' : 's'}</small></div></a>`;
        }).join('')}</div>`;
      details.insertAdjacentElement('afterend', relatedSection);
    }

    /* Behaviour */
    document.querySelector('.product-hero')?.setAttribute('aria-busy', 'false');
    updateSave();
    updateCompare();
    document.querySelectorAll('[data-product-save]').forEach(button => {
      button.onclick = () => {
        if (saved.has(productId)) saved.delete(productId); else saved.add(productId);
        persist();
        updateSave();
        toast(saved.has(productId) ? `${name} saved. Find it under Saved products.` : `${name} removed from saved products.`);
      };
    });
    const compareButton = document.getElementById('product-compare');
    if (compareButton) compareButton.onclick = () => {
      if (compared.has(productId)) compared.delete(productId);
      else if (compared.size < 3) compared.add(productId);
      else { toast('You can compare up to three products. Remove one on the catalogue page first.'); return; }
      persist();
      updateCompare();
      toast(compared.has(productId) ? `Added to comparison (${compared.size} of 3).` : 'Removed from comparison.');
    };
    document.querySelectorAll('[data-add-variant]').forEach(button => {
      button.onclick = () => {
        try { window.VerapepeCart.addItem(button.dataset.addVariant, 1); window.VerapepeCart.open(); }
        catch (error) { toast(error.message); }
      };
    });
    document.getElementById('product-review-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = document.getElementById('review-message');
      const nameField = document.getElementById('review-name');
      const textField = document.getElementById('review-text');
      if (!nameField.value.trim()) { message.textContent = 'Please enter your name.'; nameField.focus(); return; }
      if (textField.value.trim().length < 10) { message.textContent = 'Please write at least 10 characters.'; textField.focus(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      try {
        const result = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, name: nameField.value, rating: document.getElementById('review-rating').value, text: textField.value }) });
        const payload = await result.json();
        message.textContent = payload.message || payload.error || 'Saved.';
        message.classList.toggle('is-success', result.ok);
        if (result.ok) form.reset();
      } catch {
        message.textContent = 'The review could not be sent. Please try again.';
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    });
    const sectionLinks = [...document.querySelectorAll('.product-section-nav a')];
    if ('IntersectionObserver' in window && sectionLinks.length) {
      const visible = new Map();
      const spy = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top); else visible.delete(entry.target.id); });
        const current = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
        sectionLinks.forEach(link => { if (link.hash.slice(1) === current) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
      }, { rootMargin: '-140px 0px -55% 0px' });
      sectionLinks.forEach(link => { const target = document.getElementById(link.hash.slice(1)); if (target) spy.observe(target); });
    }
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }

  if (window.VerapepeCart?.ready) window.VerapepeCart.ready.then(renderPage).catch(renderPage); else renderPage();
  /* Live updates: reload when the catalogue changes, but never throw away what the
     visitor is typing, and never react to the visitor's own review submission. */
  let ownReviewAt = 0;
  document.addEventListener('submit', event => { if (event.target?.id === 'product-review-form') ownReviewAt = Date.now(); }, true);
  const formIsDirty = () => [...document.querySelectorAll('#product-review-form input, #product-review-form textarea')].some(field => field.value.trim());
  function offerRefresh() {
    if (document.getElementById('product-refresh-notice')) return;
    const notice = document.createElement('div');
    notice.id = 'product-refresh-notice';
    notice.className = 'product-toast is-visible product-toast--action';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<span>This product was just updated.</span> <button type="button">Refresh</button>';
    notice.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(notice);
  }
  if ('EventSource' in window) {
    const events = new EventSource('/api/storefront/events');
    let connected = false;
    /* v20: the stream reports every change in the whole store (including other customers' orders).
       The page used to reload on each one, which threw a reading visitor back to the top. Now a burst
       of events is checked once, and only a change to *this* product offers a refresh. */
    let pending = null;
    events.addEventListener('storefront', event => {
      const data = JSON.parse(event.data || '{}');
      if (data.reason === 'connected') { connected = true; return; }
      if (!connected) return;
      if (data.reason === 'reviews') { if (Date.now() - ownReviewAt > 15000) offerRefresh(); return; }
      clearTimeout(pending);
      pending = setTimeout(async () => {
        try {
          const latest = await fetch('/api/storefront', { cache: 'no-store' }).then(response => response.json());
          const product = latest.products.find(item => item.id === productId);
          const fingerprint = product ? JSON.stringify(product) : null;
          if (fingerprint === renderedFingerprint) return;
          if (!product && !formIsDirty()) { location.reload(); return; }
          offerRefresh();
        } catch { /* offline: the visitor can refresh manually */ }
      }, 800);
    });
  }
})();
