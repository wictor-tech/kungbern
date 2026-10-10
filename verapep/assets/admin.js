/* VERAPEP V5 administration with live storefront synchronisation. */
(() => {
  'use strict';

  const state = { csrf: null, dashboard: null, activeTab: 'overview', orderQueue: 'all' };
  const message = document.getElementById('admin-message');
  const loginSection = document.getElementById('admin-login');
  const dashboardSection = document.getElementById('admin-dashboard');

  const ORDER_STATUSES = ['awaiting_payment', 'processing', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'];
  const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded'];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatMoney(value, currency = state.dashboard?.config?.currency || 'EUR') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
  }

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  }

  function label(value) {
    return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `checkout-message checkout-message--${type}`;
    message.hidden = !text;
  }

  async function requestJson(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (state.csrf && ['POST', 'PATCH', 'DELETE'].includes(options.method || 'GET') && !url.endsWith('/login') && !url.endsWith('/logout')) headers['X-CSRF-Token'] = state.csrf;
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && !/\/(login|session|auth-config)$/.test(url)) sessionExpired();
    if (!response.ok) throw Object.assign(new Error(payload.message || 'The request could not be completed.'), { status: response.status, payload });
    return payload;
  }

  /* v20: when the session ends mid-task, show the sign-in form in place. The dashboard (and any
     unsaved text in it) is only hidden, so signing in again returns to exactly where you were. */
  function sessionExpired() {
    if (dashboardSection.hidden) return;
    state.csrf = null;
    dashboardSection.hidden = true;
    loginSection.hidden = false;
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-password').focus();
  }

  function renderStats(stats) {
    const cards = [
      ['Orders', stats.orders],
      ['Paid tests', stats.paidOrders],
      ['Test revenue', formatMoney(stats.testRevenue)],
      ['Open orders', stats.openOrders],
      ['Low stock', stats.lowStock],
      ['Returns', stats.returns],
      ['Pending reviews', stats.pendingReviews || 0]
    ];
    document.getElementById('admin-stats').innerHTML = cards.map(([name, value]) => `<article><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
  }

  function statusOptions(values, current) {
    return values.map(value => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label(value))}</option>`).join('');
  }

  function orderMatchesQueue(order, queue) {
    if (queue === 'awaitingPayment') return order.paymentStatus === 'unpaid' && order.orderStatus === 'awaiting_payment';
    if (queue === 'toPack') return order.paymentStatus === 'paid' && order.orderStatus === 'processing';
    if (queue === 'readyToShip') return order.paymentStatus === 'paid' && order.orderStatus === 'packed';
    if (queue === 'inTransit') return ['shipped','in_transit','out_for_delivery'].includes(order.orderStatus);
    if (queue === 'completed') return order.orderStatus === 'delivered';
    if (queue === 'attention') return ['failed','refunded'].includes(order.paymentStatus) || ['cancelled','refunded'].includes(order.orderStatus);
    return true;
  }

  function renderOrderQueues() {
    const container = document.getElementById('admin-order-queues');
    if (!container) return;
    const queues = state.dashboard.orderQueues || {};
    const cards = [
      ['awaitingPayment','Awaiting payment'], ['toPack','To pack'], ['readyToShip','Ready to ship'],
      ['inTransit','In transit'], ['completed','Completed'], ['attention','Needs attention']
    ];
    container.innerHTML = cards.map(([key, text]) => `<button type="button" data-order-queue="${key}" class="${state.orderQueue === key ? 'is-active' : ''}"><span>${escapeHtml(text)}</span><strong>${escapeHtml(queues[key] || 0)}</strong></button>`).join('');
  }

  function renderOrders(query = '') {
    const needle = query.trim().toLowerCase();
    const rows = state.dashboard.orders.filter(order => orderMatchesQueue(order, state.orderQueue) && (!needle || [order.id, order.customer?.name, order.customer?.email, order.orderStatus, order.paymentStatus].join(' ').toLowerCase().includes(needle)));
    const body = document.getElementById('admin-orders');
    const refundLabel = state.dashboard.mode === 'live' ? 'Refund' : 'Preview refund';
    body.innerHTML = rows.length ? rows.map(order => `
      <tr data-order-id="${escapeHtml(order.id)}">
        <td><strong>${escapeHtml(order.id)}</strong><small>${escapeHtml(formatDate(order.createdAt))}</small></td>
        <td><strong>${escapeHtml(order.customer?.name)}</strong><small>${escapeHtml(order.customer?.email)}</small></td>
        <td><strong>${escapeHtml(formatMoney(order.totalCents / 100, order.currency))}</strong><small>${order.items.length} line${order.items.length === 1 ? '' : 's'}</small></td>
        <td><span class="admin-badge admin-badge--${escapeHtml(order.paymentStatus)}">${escapeHtml(label(order.paymentStatus))}</span><small>${escapeHtml(order.paymentProvider || 'No provider')}</small>${(order.paymentIssues || []).map(issue => `<small class="admin-alert" role="note"><strong>Review:</strong> ${escapeHtml(issue.message)}</small>`).join('')}</td>
        <td><select data-order-status>${statusOptions(ORDER_STATUSES, order.orderStatus)}</select><input data-order-carrier value="${escapeHtml(order.carrier || '')}" placeholder="Carrier"><input data-order-tracking value="${escapeHtml(order.trackingNumber || '')}" placeholder="Tracking number"></td>
        <td><div class="admin-actions"><button type="button" data-save-order>Save status</button><a href="order.html?order=${encodeURIComponent(order.id)}" target="_blank" rel="noopener">Open</a>${order.paymentStatus === 'paid' ? `<button class="danger-button" type="button" data-refund-order>${refundLabel}</button>` : ''}</div></td>
      </tr>`).join('') : '<tr><td colspan="6">No orders match this queue/filter.</td></tr>';
  }

  function renderInventory(query = '') {
    const needle = query.trim().toLowerCase();
    const rows = state.dashboard.inventory.filter(item => !needle || [item.productName, item.catalogueNo, item.specification].join(' ').toLowerCase().includes(needle));
    const body = document.getElementById('admin-inventory');
    body.innerHTML = rows.length ? rows.map(item => `
      <tr data-variant-id="${escapeHtml(item.variantId)}">
        <td><strong>${escapeHtml(item.productName)}</strong><small>Admin-controlled test stock</small></td>
        <td>${escapeHtml(item.catalogueNo || '—')}</td>
        <td>${escapeHtml(item.specification || '—')}</td>
        <td><input class="stock-input" data-stock-input type="number" min="0" max="1000000" value="${escapeHtml(item.onHand)}"></td>
        <td><input class="stock-input" data-price-input type="number" min="0" step="0.01" value="${escapeHtml(item.retailPriceCents ? (item.retailPriceCents/100).toFixed(2) : '')}" placeholder="0.00"></td>
        <td><label class="admin-inline-check"><input data-sale-enabled type="checkbox" ${item.saleEnabled ? 'checked' : ''}> Enabled</label></td>
        <td><button type="button" data-save-stock>Save</button></td>
      </tr>`).join('') : '<tr><td colspan="6">No matching inventory variants.</td></tr>';
  }

  function renderProducts(query = '') {
    // v19: the product workspace (admin-v19.js) renders the list with checklist progress and filters.
    if (window.VerapepAdmin?.renderProductList?.(query)) return;
    const needle = query.trim().toLowerCase();
    const rows = state.dashboard.products.filter(item => !needle || [item.name, item.category, item.content?.shortDescription, item.content?.stockStatus].join(' ').toLowerCase().includes(needle));
    const container = document.getElementById('admin-products');
    container.innerHTML = rows.length ? rows.map(item => `
      <button class="admin-product-list__item" type="button" data-edit-product="${escapeHtml(item.id)}">
        <span><strong>${escapeHtml(item.content?.displayName || item.name)}</strong><small>${escapeHtml(label(item.category))}</small></span>
        <span class="admin-product-statuses"><span class="admin-badge">${escapeHtml(label(item.content?.publicStatus || (item.content?.archived?'archived':item.content?.published===false?'draft':item.content?.availableForSale?'available_for_sale':'information_only')))}</span>${item.content?.availableForSale?'<span class="admin-badge admin-badge--paid">Webshop</span>':''}</span>
      </button>`).join('') : '<div class="admin-empty">No matching products.</div>';
  }

  function labReportsToText(reports = []) {
    return reports.map(report => [report.title, report.url, report.date, report.batch].map(value => value || '').join(' | ')).join('\n');
  }

  function textToLabReports(value) {
    return String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [title, url, date, batch] = line.split('|').map(part => part.trim());
      return { title, url, date, batch, published: true };
    });
  }

  function getProductReadiness(item) {
    const content = item?.content || {};
    const variants = (state.dashboard?.inventory || []).filter(variant => variant.productId === item?.id);
    const sellableVariants = variants.filter(variant => variant.saleEnabled === true && Number(variant.retailPriceCents) > 0 && Number(variant.onHand) > Number(variant.reserved || 0));
    const checks = [
      { label: 'Store checkout is in local sandbox mode', ready: state.dashboard?.mode === 'sandbox' && state.dashboard?.config?.checkoutMode === 'sandbox' },
      { label: 'Product is visible and not archived', ready: content.published !== false && content.archived !== true && content.stockStatus !== 'archived' },
      { label: 'Product is approved for webshop display', ready: content.availableForSale === true && content.informationOnly === false && item?.commerce?.sandboxEnabled === true },
      { label: 'At least one European country is enabled', ready: Array.isArray(content.allowedCountries) && content.allowedCountries.length > 0 },
      { label: 'At least one variant has price, stock and sale enabled', ready: sellableVariants.length > 0 }
    ];
    return { checks, ready: checks.every(check => check.ready), variants, sellableVariants };
  }

  function renderProductReadiness(item) {
    const panel = document.getElementById('product-webshop-readiness');
    if (!panel || !item) return;
    const readiness = getProductReadiness(item);
    panel.classList.toggle('is-ready', readiness.ready);
    panel.innerHTML = `
      <h4>${readiness.ready ? 'Ready for local webshop checkout' : 'Webshop setup is incomplete'}</h4>
      <p>${readiness.ready ? `${readiness.sellableVariants.length} variant${readiness.sellableVariants.length === 1 ? '' : 's'} can be added to the cart.` : 'Use the quick-enable button to apply the required local sandbox settings. No live payment is enabled.'}</p>
      <ul>${readiness.checks.map(check => `<li class="${check.ready ? 'is-ready' : ''}">${escapeHtml(check.label)}</li>`).join('')}</ul>`;
    const enableButton = document.getElementById('enable-webshop-product');
    const disableButton = document.getElementById('disable-webshop-product');
    if (enableButton) enableButton.hidden = readiness.ready;
    if (disableButton) disableButton.hidden = !readiness.ready && item.content?.availableForSale !== true;
  }

  function openProductEditor(productId) {
    const item = state.dashboard.products.find(product => product.id === productId);
    if (!item) return;
    const content = item.content || {};
    document.getElementById('product-editor').hidden = false;
    document.getElementById('editor-product-id').value = item.id;
    document.getElementById('editor-product-name').textContent = item.name;
    document.getElementById('editor-product-link').href = `/product/${encodeURIComponent(item.id)}`;
    document.getElementById('editor-display-name').value = content.displayName || item.name;
    document.getElementById('editor-short-description').value = content.shortDescription || '';
    document.getElementById('editor-full-description').value = content.fullDescription || '';
    document.getElementById('editor-delivery').value = content.deliveryEstimate || state.dashboard.config.shippingMethods?.[0]?.estimatedDays || '7–10 days';
    document.getElementById('editor-stock-status').value = content.stockStatus || 'information_only';
    document.getElementById('editor-public-status').value = content.publicStatus || (content.archived ? 'archived' : content.published === false ? 'draft' : content.availableForSale ? 'available_for_sale' : 'information_only');
    document.getElementById('editor-ingredients').value = content.ingredients || '';
    document.getElementById('editor-storage').value = content.storage || '';
    document.getElementById('editor-usage').value = content.usage || '';
    document.getElementById('editor-warnings').value = content.warnings || '';
    document.getElementById('editor-image-url').value = content.imageUrl || '';
    document.getElementById('editor-image-alt').value = content.imageAlt || item.name;
    document.getElementById('editor-image-srcset').value = content.imageSrcset || '';
    document.getElementById('editor-image-sizes').value = content.imageSizes || '';
    document.getElementById('editor-image-focal').value = content.imageFocalPoint || '50% 50%';
    document.getElementById('editor-search-aliases').value = (content.searchAliases || []).join(', ');
    document.getElementById('editor-goals').value = (content.discoveryGoals || []).join(', ');
    document.getElementById('editor-needs').value = (content.discoveryNeeds || []).join(', ');
    document.getElementById('editor-completeness').value = content.informationCompleteness || 'basic';
    document.getElementById('editor-countries').value = (content.allowedCountries || []).join(', ');
    document.getElementById('editor-lab-reports').value = labReportsToText(content.labReports);
    document.getElementById('editor-published').checked = content.published !== false;
    document.getElementById('editor-info-only').checked = content.informationOnly !== false;
    document.getElementById('editor-specialist').checked = content.specialistOnly === true;
    document.getElementById('editor-sale').checked = content.availableForSale === true;
    document.getElementById('editor-archived').checked = content.archived === true || content.stockStatus === 'archived';
    renderProductReadiness(item);
    document.querySelectorAll('[data-edit-product]').forEach(button => button.classList.toggle('is-selected', button.dataset.editProduct === productId));
  }

  function renderSettings() {
    const config = state.dashboard.config;
    document.getElementById('setting-store-name').value = config.storeName || 'VERAPEP';
    document.getElementById('setting-currency').value = config.currency || 'EUR';
    document.getElementById('setting-price-source').value = config.priceSource || 'priceUsd1';
    document.getElementById('setting-price-label').value = config.priceSourceLabel || 'Pricing under review';
    document.getElementById('setting-delivery').value = config.shippingMethods?.[0]?.estimatedDays || '7–10 days';
    document.getElementById('setting-assistant-name').value = config.assistantName || 'Ask Vera';
    document.getElementById('setting-checkout-mode').value = config.checkoutMode || 'sandbox';
    document.getElementById('setting-trust-signals').value = (config.trustSignals || []).join('\n');
  }

  function renderReviews() {
    const container = document.getElementById('admin-reviews');
    const filter = document.getElementById('review-status-filter')?.value || 'all';
    const all = state.dashboard.reviews || [];
    const reviews = all.filter(review => filter === 'all' || review.status === filter);
    const approved = all.filter(review => review.status === 'approved');
    const average = approved.length ? approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / approved.length : 0;
    const summary = document.getElementById('review-summary');
    if (summary) summary.innerHTML = `<article><span>Submitted</span><strong>${all.length}</strong></article><article><span>Pending</span><strong>${all.filter(r=>r.status==='pending').length}</strong></article><article><span>Published</span><strong>${approved.length}</strong></article><article><span>Public average</span><strong>${approved.length ? average.toFixed(1) : '—'}</strong></article>`;
    container.innerHTML = reviews.length ? reviews.map(review => `
      <article class="admin-review-card" data-review-id="${escapeHtml(review.id)}">
        <div><strong class="rating-stars" aria-label="${escapeHtml(review.rating)} out of 5">${'★'.repeat(Number(review.rating || 0))}${'☆'.repeat(5-Number(review.rating || 0))}</strong><span class="admin-badge">${escapeHtml(label(review.status))}</span></div>
        <h3>${escapeHtml(state.dashboard.products.find(product => product.id === review.productId)?.name || review.productId)}</h3>
        <p>${escapeHtml(review.text)}</p><small>${escapeHtml(review.name)} · ${escapeHtml(formatDate(review.createdAt))}</small>
        <div class="admin-actions"><button type="button" data-review-status="approved">Approve</button><button type="button" data-review-status="rejected">Reject</button><button type="button" data-review-status="hidden">Hide</button></div>
      </article>`).join('') : '<div class="admin-empty">No reviews match this status.</div>';
  }

  function renderGuideAndSupport() {
    document.getElementById('guide-enabled').checked = state.dashboard.guide?.enabled === true;
    const preview = document.getElementById('guide-taxonomy-preview');
    if (preview) preview.innerHTML = (state.dashboard.guide?.focusAreas || []).map(area => `<article><strong>${escapeHtml(area.label)}</strong><small>${escapeHtml((area.needs || []).map(item => item.label).join(' · '))}</small></article>`).join('');
    document.getElementById('support-fallback').value = state.dashboard.supportKb?.fallback || '';
    renderKbEditor(state.dashboard.supportKb?.entries || []);
    renderVeraStats();
    loadKbMigration();
  }

  /* ---------- v17: structured Ask Vera knowledge editor (ids are preserved) ---------- */
  function kbEntryMarkup(entry = {}) {
    const keywords = Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords.join(', ') : String(entry.question || '').split(/\s+/).filter(Boolean).join(', ');
    return `<details class="kb-entry" data-kb-id="${escapeHtml(entry.id || '')}" ${entry.id ? '' : 'open'}>
      <summary><strong>${escapeHtml(entry.title || entry.id || 'New answer')}</strong>${entry.locked ? ' <span class="kb-entry__lock">Locked</span>' : ''} <small>${escapeHtml(String(entry.answer || '').slice(0, 90))}${String(entry.answer || '').length > 90 ? '…' : ''}</small></summary>
      <div class="admin-form-grid">
        <label class="field"><span>Title</span><input data-kb="title" value="${escapeHtml(entry.title || '')}" maxlength="120"/></label>
        <label class="field"><span>Link (site path or https://)</span><input data-kb="url" value="${escapeHtml(entry.url || '')}" maxlength="500"/></label>
        <label class="field field--wide"><span>Keywords and phrases (comma separated)</span><input data-kb="keywords" value="${escapeHtml(keywords)}"/></label>
        <label class="field field--wide"><span>Approved answer</span><textarea data-kb="answer" rows="3" maxlength="3000">${escapeHtml(entry.answer || '')}</textarea></label>
      </div>
      <div class="kb-entry__actions"><label><input data-kb="locked" type="checkbox" ${entry.locked ? 'checked' : ''}/> Keep my wording during knowledge updates</label><button class="button button--light" data-kb-remove type="button">Remove</button></div>
    </details>`;
  }

  function renderKbEditor(entries) {
    const list = document.getElementById('kb-entries');
    if (list) list.innerHTML = entries.map(kbEntryMarkup).join('') || '<p class="muted">No answers yet.</p>';
  }

  function collectKbEntries() {
    return [...document.querySelectorAll('#kb-entries .kb-entry')].map(node => ({
      id: node.dataset.kbId,
      title: node.querySelector('[data-kb="title"]').value,
      url: node.querySelector('[data-kb="url"]').value,
      keywords: node.querySelector('[data-kb="keywords"]').value.split(',').map(value => value.trim()).filter(Boolean),
      answer: node.querySelector('[data-kb="answer"]').value,
      locked: node.querySelector('[data-kb="locked"]').checked
    }));
  }

  function renderVeraStats() {
    const box = document.getElementById('vera-stats');
    const stats = state.dashboard.veraStats;
    if (!box) return;
    if (!stats) { box.hidden = true; return; }
    const kinds = { knowledge: 'Answered from knowledge', product: 'Product facts', safety: 'Refused (medical/dosing)', fallback: 'No answer found', unknown_product: 'Unknown or hidden product', greeting: 'Greetings', empty: 'Empty' };
    box.innerHTML = `<h3>Ask Vera usage</h3><p class="muted">Counts since ${escapeHtml(formatDate(stats.since))}. Question text is never stored.</p>
      <dl class="status-dl"><div><dt>Questions</dt><dd>${escapeHtml(stats.total)}</dd></div>${Object.entries(stats.byKind || {}).map(([kind, count]) => `<div><dt>${escapeHtml(kinds[kind] || label(kind))}</dt><dd>${escapeHtml(count)}</dd></div>`).join('')}</dl>
      ${(stats.byKind?.fallback || 0) > 0 ? '<p class="muted">Many unanswered questions suggest an answer is missing. Ask visitors (or support emails) what they needed and add an approved answer.</p>' : ''}`;
  }

  async function loadKbMigration() {
    const box = document.getElementById('kb-migration');
    if (!box) return;
    try {
      const { plan, snapshots } = await requestJson('/api/admin/support-kb/migration');
      const changed = plan.changes.filter(change => ['update', 'add', 'rename'].includes(change.action));
      const kept = plan.changes.filter(change => ['keep_customised', 'keep_locked'].includes(change.action));
      box.innerHTML = `<h3>Knowledge updates</h3>
        <p>${plan.upToDate ? `Up to date with version ${escapeHtml(plan.to.contentVersion)}.` : `Version ${escapeHtml(plan.to.contentVersion)} has ${plan.writes} update(s) for the stored answers (stored: ${escapeHtml(plan.from.contentVersion || `schema v${plan.from.version}`)}).`}</p>
        ${changed.length ? `<ul class="status-list">${changed.map(change => `<li><strong>${escapeHtml(label(change.action))}</strong> · ${escapeHtml(change.title || change.id)}<br/><small>${escapeHtml(change.reason)}</small></li>`).join('')}</ul>` : ''}
        ${kept.length ? `<p class="muted">Kept unchanged (edited or locked by an admin): ${kept.map(change => escapeHtml(change.title || change.id)).join(', ')}.</p>` : ''}
        ${plan.upToDate ? '' : `<button class="button button--primary" data-kb-apply="${plan.writes}" type="button">Back up and apply ${plan.writes} update(s)</button>`}
        ${snapshots.length ? `<details><summary>Backups (${snapshots.length})</summary><ul class="status-list">${snapshots.map(item => `<li>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.entries)} answers · <small>${escapeHtml(item.reason || '')}</small> <button class="button button--light" data-kb-rollback="${escapeHtml(item.name)}" type="button">Restore</button></li>`).join('')}</ul></details>` : ''}`;
    } catch (error) {
      box.innerHTML = `<h3>Knowledge updates</h3><p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  /* ---------- v17: compliance review ---------- */
  const compliance = { data: null, selected: new Set(), openId: null };
  const STATUS_TEXT = { not_reviewed: 'Not reviewed', needs_evidence: 'Needs evidence', in_legal_review: 'In legal review', approved_for_publication: 'Approved (specific)', do_not_publish: 'Do not publish' };

  async function loadCompliance() {
    if (!(state.dashboard?.permissions || []).includes('products')) return;
    try {
      compliance.data = await requestJson('/api/admin/compliance');
      renderCompliance();
    } catch (error) { showMessage(error.message); }
  }

  function filteredComplianceRows() {
    const query = (document.getElementById('compliance-search')?.value || '').trim().toLowerCase();
    const status = document.getElementById('compliance-status-filter')?.value || '';
    const risk = document.getElementById('compliance-risk-filter')?.value || '';
    const visible = document.getElementById('compliance-visible-filter')?.value || '';
    return (compliance.data?.rows || []).filter(row => (!query || `${row.name} ${row.displayName} ${row.id}`.toLowerCase().includes(query))
      && (!status || row.review.status === status) && (!risk || row.suggestion.level === risk)
      && (!visible || (visible === 'yes') === row.publiclyVisible));
  }

  function renderCompliance() {
    const data = compliance.data;
    if (!data) return;
    const summary = document.getElementById('compliance-summary');
    summary.innerHTML = `<article><span>Publication gate</span><strong>${escapeHtml(label(data.gate))}</strong></article>
      <article><span>Publicly visible</span><strong>${data.summary.publiclyVisible} / ${data.summary.total}</strong></article>
      <article><span>High-risk indicator</span><strong>${data.summary.highRisk}</strong></article>
      ${data.statuses.map(status => `<article><span>${escapeHtml(STATUS_TEXT[status])}</span><strong>${data.summary[status] || 0}</strong></article>`).join('')}`;
    const statusFilter = document.getElementById('compliance-status-filter');
    if (statusFilter.options.length === 1) statusFilter.insertAdjacentHTML('beforeend', data.statuses.map(status => `<option value="${status}">${escapeHtml(STATUS_TEXT[status])}</option>`).join(''));
    const bulkStatus = document.getElementById('compliance-bulk-status');
    if (!bulkStatus.options.length) bulkStatus.innerHTML = data.statuses.filter(status => status !== 'approved_for_publication').map(status => `<option value="${status}">${escapeHtml(STATUS_TEXT[status])}</option>`).join('');
    const rows = filteredComplianceRows();
    document.getElementById('compliance-rows').innerHTML = rows.map(row => `<tr data-compliance-id="${escapeHtml(row.id)}" class="${compliance.openId === row.id ? 'is-selected' : ''}">
      <td><input type="checkbox" data-compliance-select ${compliance.selected.has(row.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(row.displayName)}"/></td>
      <td><button class="link-button" data-compliance-open type="button"><strong>${escapeHtml(row.displayName)}</strong></button><br/><small>${escapeHtml(row.id)} · ${escapeHtml(label(row.category))}</small></td>
      <td><span class="risk-pill risk-pill--${escapeHtml(row.suggestion.level)}">${escapeHtml(label(row.suggestion.level))}</span></td>
      <td><span class="status-pill status-pill--${escapeHtml(row.review.status)}">${escapeHtml(STATUS_TEXT[row.review.status] || row.review.status)}</span>${row.review.contentChangedAfterApproval ? '<br/><small class="warning-text">Changed after approval</small>' : ''}</td>
      <td>${row.publiclyVisible ? 'Visible' : 'Hidden'}<br/><small>${escapeHtml(label(row.visibilityReason))}</small></td>
      <td>${row.publishedLabReports} report(s) · ${row.approvedDocuments} doc(s)<br/><small>${row.verifiedContentFields.length ? escapeHtml(row.verifiedContentFields.join(', ')) : 'No verified content'}</small></td>
      <td>${row.unsupportedClaims.length ? `<span class="warning-text">${escapeHtml(row.unsupportedClaims.join('; '))}</span>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">No products match these filters.</td></tr>';
    const bulk = document.getElementById('compliance-bulk');
    bulk.hidden = compliance.selected.size === 0;
    document.getElementById('compliance-bulk-count').textContent = `${compliance.selected.size} selected`;
    renderComplianceDetail();
  }

  async function renderComplianceDetail() {
    const box = document.getElementById('compliance-detail');
    const row = (compliance.data?.rows || []).find(item => item.id === compliance.openId);
    if (!row) { box.hidden = true; return; }
    let history = [];
    try { history = (await requestJson(`/api/admin/compliance/${encodeURIComponent(row.id)}`)).history || []; } catch {}
    const canApprove = compliance.data.canApprove;
    const countries = (state.dashboard.config?.allowedCountries || []);
    box.hidden = false;
    box.innerHTML = `<div class="admin-editor-heading"><div><h3>${escapeHtml(row.displayName)}</h3><p class="muted">${escapeHtml(row.id)} · ${row.variants.length} specification(s): ${escapeHtml(row.variants.map(variant => variant.specification).join(', '))}</p></div><button class="button button--light" data-compliance-close type="button">Close</button></div>
      <div class="compliance-suggestion"><h4>Automated suggestion — not a decision</h4><p><strong>${escapeHtml(label(row.suggestion.level))} risk indicator</strong>, suggested status: ${escapeHtml(STATUS_TEXT[row.suggestion.suggestedStatus])}.</p><ul>${row.suggestion.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul><p class="muted">${escapeHtml(row.suggestion.basis)}</p></div>
      <form class="compliance-form" data-compliance-form="${escapeHtml(row.id)}">
        <div class="admin-form-grid">
          <label class="field"><span>Decision</span><select name="status">${compliance.data.statuses.filter(status => canApprove || status !== 'approved_for_publication' || row.review.status === status).map(status => `<option value="${status}" ${row.review.status === status ? 'selected' : ''}>${escapeHtml(STATUS_TEXT[status])}</option>`).join('')}</select></label>
          <label class="field"><span>Note</span><input name="note" value="${escapeHtml(row.review.note || '')}" maxlength="1000"/></label>
          <label class="field field--wide"><span>Evidence on file (one per line: title | https:// link | date)</span><textarea name="evidence" rows="2">${escapeHtml((row.review.evidence || []).map(item => [item.title, item.url, item.date].join(' | ')).join('\n'))}</textarea></label>
        </div>
        <fieldset class="compliance-approval" ${canApprove ? '' : 'disabled'}><legend>Approval for specific publication ${canApprove ? '(owner)' : '— only the owner can approve'}</legend>
          <div class="admin-form-grid">
            <label class="field"><span>Approved scope</span><select name="scope"><option value="information" ${row.review.scope === 'information' ? 'selected' : ''}>Information page only</option><option value="sale" ${row.review.scope === 'sale' ? 'selected' : ''}>Information and sale</option></select></label>
            <label class="field"><span>Qualified reviewer or firm</span><input name="reviewer" value="${escapeHtml(row.review.reviewer || '')}"/></label>
            <label class="field"><span>Review reference</span><input name="reviewReference" value="${escapeHtml(row.review.reviewReference || '')}"/></label>
            <label class="field"><span>Type ${escapeHtml(compliance.data.approvalConfirmation)} to confirm</span><input name="confirmation" autocomplete="off"/></label>
          </div>
          <div class="compliance-markets">${countries.map(country => `<label><input type="checkbox" name="markets" value="${escapeHtml(country.code)}" ${(row.review.markets || []).includes(country.code) ? 'checked' : ''}/> ${escapeHtml(country.code)}</label>`).join('')}</div>
        </fieldset>
        <button class="button button--primary" type="submit">Save decision</button>
      </form>
      <h4>History</h4>${history.length ? `<ol class="status-list">${history.slice().reverse().map(item => `<li>${escapeHtml(formatDate(item.at))} · ${escapeHtml(item.by)} · ${escapeHtml(STATUS_TEXT[item.from] || item.from || item.event || '')} → ${escapeHtml(STATUS_TEXT[item.to] || item.to || '')}${item.note ? ` · ${escapeHtml(item.note)}` : ''}${item.bulk ? ' (bulk)' : ''}</li>`).join('')}</ol>` : '<p class="muted">No decisions recorded yet.</p>'}`;
  }

  /* ---------- v17: system status ---------- */
  function renderStatus() {
    const dash = state.dashboard;
    const readiness = dash.productionReadiness || {};
    const overview = document.getElementById('status-overview');
    if (!overview) return;
    overview.innerHTML = `<article><span>Launch</span><strong class="${readiness.ready ? '' : 'warning-text'}">${readiness.ready ? 'Ready' : 'Not approved for launch'}</strong></article>
      <article><span>Mode</span><strong>${escapeHtml(label(dash.mode))}</strong></article>
      <article><span>Publication gate</span><strong>${escapeHtml(label(dash.publication?.gate))}</strong></article>
      <article><span>Public products</span><strong>${escapeHtml(dash.publication?.visibleProducts)} / ${escapeHtml(dash.publication?.totalProducts)}</strong></article>
      <article><span>Ask Vera knowledge</span><strong>${dash.supportKbStatus ? (dash.supportKbStatus.upToDate ? 'Up to date' : `${dash.supportKbStatus.pendingWrites} update(s) available`) : '—'}</strong></article>
      <article><span>Server started</span><strong>${escapeHtml(formatDate(dash.startedAt))}</strong></article>`;
    // v18: grouped by who can resolve each blocker; the list itself is unchanged.
    const groups = {};
    for (const item of readiness.blockerDetails || (readiness.blockers || []).map(text => ({ text, categoryLabel: 'Blockers', action: '' }))) (groups[item.categoryLabel] ||= []).push(item);
    document.getElementById('status-blockers').innerHTML = Object.entries(groups).map(([group, items]) => `<li class="status-group"><strong>${escapeHtml(group)} (${items.length})</strong><ul>${items.map(item => `<li>${escapeHtml(item.text)}${item.action ? `<br/><small>${escapeHtml(item.action)}</small>` : ''}</li>`).join('')}</ul></li>`).join('') || '<li>None</li>';
    document.getElementById('status-warnings').innerHTML = (readiness.warnings || []).map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>None</li>';
    document.getElementById('status-errors').innerHTML = (dash.recentErrors || []).map(item => `<li>${escapeHtml(formatDate(item.at))} · ${escapeHtml(item.method)} ${escapeHtml(item.path)} · ${escapeHtml(item.status)} ${escapeHtml(item.code)}</li>`).join('') || '<li>No server errors since the last restart.</li>';
  }

  function renderReturns() {
    const body = document.getElementById('admin-returns');
    body.innerHTML = state.dashboard.returns.length ? state.dashboard.returns.map(item => `
      <tr data-return-id="${escapeHtml(item.id)}">
        <td><strong>${escapeHtml(item.id)}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></td>
        <td>${escapeHtml(item.orderId)}</td>
        <td>${escapeHtml(item.reason)}</td>
        <td><select data-return-status>${statusOptions(RETURN_STATUSES, item.status)}</select></td>
        <td><button type="button" data-save-return>Save</button></td>
      </tr>`).join('') : '<tr><td colspan="5">No sandbox return requests.</td></tr>';
  }

  function renderOutbox() {
    const container = document.getElementById('admin-outbox');
    container.innerHTML = state.dashboard.outbox.length ? state.dashboard.outbox.map(item => `
      <article class="outbox-card"><div><span class="admin-badge">${escapeHtml(label(item.type))}</span><time>${escapeHtml(formatDate(item.createdAt))}</time></div><h3>${escapeHtml(item.subject)}</h3><p><strong>To:</strong> ${escapeHtml(item.to)}</p><p>${escapeHtml(item.content)}</p><small>${escapeHtml(item.id)} · ${escapeHtml(item.delivery)}</small></article>`).join('') : '<div class="admin-empty">The local email outbox is empty.</div>';
  }

  function renderAudit() {
    const container = document.getElementById('admin-audit');
    if (!container) return;
    const rows = state.dashboard.audit || [];
    container.innerHTML = rows.length ? rows.map(item => `<article class="audit-card"><div><strong>${escapeHtml(label(item.action))}</strong><time>${escapeHtml(formatDate(item.createdAt))}</time></div><p>${escapeHtml(item.actorEmail)} · ${escapeHtml(label(item.actorRole))}</p><small>${escapeHtml(label(item.entityType))}${item.entityId ? ` · ${escapeHtml(item.entityId)}` : ''}</small></article>`).join('') : '<div class="admin-empty">No audit entries are available for this role.</div>';
  }

  function renderUsers() {
    const container = document.getElementById('admin-users');
    if (!container) return;
    const users = state.dashboard.users || [];
    container.innerHTML = users.length ? users.map(user => `<article class="admin-user-card"><div><strong>${escapeHtml(user.displayName)}</strong><span class="admin-badge">${escapeHtml(label(user.role))}</span></div><p>${escapeHtml(user.email)}</p><small>${user.enabled ? 'Enabled' : 'Disabled'} · MFA ${user.mfaEnabled ? 'enabled' : 'not enabled'} · Updated ${escapeHtml(formatDate(user.updatedAt))}</small></article>`).join('') : '<div class="admin-empty">Only the owner can view and manage admin accounts.</div>';
  }

  function renderMfaStatus() {
    const current = state.dashboard?.currentUser;
    const status = document.getElementById('admin-mfa-status');
    const setup = document.getElementById('admin-mfa-setup');
    if (!current || !status || !setup) return;
    status.textContent = current.mfaEnabled ? `MFA is enabled for ${current.email}. Login method: ${label(current.mfaMethod || 'totp')}.` : `MFA is not yet enrolled for ${current.email}.`;
    setup.textContent = current.mfaEnabled ? 'Replace authenticator setup' : 'Set up authenticator';
  }

  function applyPermissions() {
    const permissions = new Set(state.dashboard.permissions || []);
    const mapping = { overview:'products', settings:'settings', products:'products', 'review-queue':'products', compliance:'products', inventory:'inventory', orders:'orders', returns:'returns', reviews:'reviews', guide:'guide', audit:'audit', team:'users', outbox:'orders', privacy:'privacy' };
    const tabs = [...document.querySelectorAll('[data-admin-tab]')];
    tabs.forEach(button => {
      const needed = mapping[button.dataset.adminTab];
      button.hidden = needed ? !permissions.has(needed) : false;
    });
    const activeButton = tabs.find(button => button.dataset.adminTab === state.activeTab && !button.hidden) || tabs.find(button => !button.hidden);
    if (activeButton) {
      state.activeTab = activeButton.dataset.adminTab;
      tabs.forEach(button => button.classList.toggle('is-active', button === activeButton));
      document.querySelectorAll('[data-admin-panel]').forEach(panel => { const active = panel.dataset.adminPanel === state.activeTab; panel.hidden = !active; panel.classList.toggle('is-active', active); });
    }
    const current = state.dashboard.currentUser;
    const node = document.getElementById('admin-current-user');
    if (node && current) node.textContent = `${current.displayName || current.email} · ${label(current.role)}`;
  }

  function renderDashboard() {
    renderStats(state.dashboard.stats);
    renderOrderQueues();
    renderOrders(document.getElementById('order-search').value);
    renderInventory(document.getElementById('inventory-search').value);
    renderProducts(document.getElementById('product-search').value);
    renderSettings();
    renderReviews();
    renderGuideAndSupport();
    renderReturns();
    renderOutbox();
    renderAudit();
    renderUsers();
    renderMfaStatus();
    renderStatus();
    applyPermissions();
    loadCompliance();
  }

  async function loadDashboard() {
    const payload = await requestJson('/api/admin/dashboard');
    state.dashboard = payload;
    renderDashboard();
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    showMessage('');
    document.dispatchEvent(new CustomEvent('verapep:dashboard', { detail: payload }));
  }

  async function checkSession() {
    const session = await requestJson('/api/admin/session');
    if (!session.authenticated) return;
    state.csrf = session.csrf;
    await loadDashboard();
  }

  requestJson('/api/admin/auth-config').then(config => {
    const field = document.getElementById('admin-mfa-field');
    const input = document.getElementById('admin-mfa-code');
    if (field) field.hidden = config.mfaSupported === false;
    if (input) input.required = Boolean(config.mfaRequired);
  }).catch(() => {});

  document.getElementById('admin-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('');
    try {
      const payload = await requestJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: document.getElementById('admin-email').value, password: document.getElementById('admin-password').value, mfaCode: document.getElementById('admin-mfa-code')?.value || '' })
      });
      state.csrf = payload.csrf;
      await loadDashboard();
    } catch (error) {
      showMessage(error.message);
    }
  });

  document.getElementById('admin-logout').addEventListener('click', async () => {
    await requestJson('/api/admin/logout', { method: 'POST' });
    state.csrf = null;
    state.dashboard = null;
    dashboardSection.hidden = true;
    loginSection.hidden = false;
  });

  document.getElementById('admin-refresh').addEventListener('click', () => loadDashboard().catch(error => showMessage(error.message)));

  document.querySelector('.admin-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-admin-tab]');
    if (!button) return;
    showTab(button.dataset.adminTab);
  });

  function showTab(tab) {
    const button = document.querySelector(`[data-admin-tab="${tab}"]`);
    if (!button || button.hidden) return;
    state.activeTab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-current', item === button ? 'page' : 'false'); });
    document.querySelectorAll('[data-admin-panel]').forEach(panel => {
      const active = panel.dataset.adminPanel === state.activeTab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    button.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    document.dispatchEvent(new CustomEvent('verapep:tab', { detail: tab }));
  }

  document.getElementById('order-search').addEventListener('input', event => renderOrders(event.target.value));
  document.getElementById('order-queue-filter')?.addEventListener('change', event => { state.orderQueue = event.target.value; renderOrderQueues(); renderOrders(document.getElementById('order-search').value); });
  document.getElementById('admin-order-queues')?.addEventListener('click', event => {
    const button = event.target.closest('[data-order-queue]');
    if (!button) return;
    state.orderQueue = button.dataset.orderQueue;
    const select = document.getElementById('order-queue-filter');
    if (select) select.value = state.orderQueue;
    renderOrderQueues();
    renderOrders(document.getElementById('order-search').value);
  });
  document.getElementById('inventory-search').addEventListener('input', event => renderInventory(event.target.value));
  document.getElementById('product-search').addEventListener('input', event => renderProducts(event.target.value));
  document.getElementById('review-status-filter')?.addEventListener('change', renderReviews);

  document.getElementById('admin-orders').addEventListener('click', async event => {
    const row = event.target.closest('[data-order-id]');
    if (!row) return;
    try {
      if (event.target.closest('[data-save-order]')) {
        await requestJson(`/api/admin/orders/${encodeURIComponent(row.dataset.orderId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: row.querySelector('[data-order-status]').value, carrier: row.querySelector('[data-order-carrier]').value, trackingNumber: row.querySelector('[data-order-tracking]').value })
        });
        await loadDashboard();
        showMessage('Sandbox order status saved.', 'success');
      }
      if (event.target.closest('[data-refund-order]')) {
        if (!confirm('Record a mock refund and restore synthetic stock?')) return;
        await requestJson(`/api/admin/orders/${encodeURIComponent(row.dataset.orderId)}/refund`, { method: 'POST', body: JSON.stringify({ reason: 'Admin sandbox refund' }) });
        await loadDashboard();
        showMessage('Sandbox refund recorded.', 'success');
      }
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-inventory').addEventListener('click', async event => {
    const row = event.target.closest('[data-variant-id]');
    if (!row || !event.target.closest('[data-save-stock]')) return;
    try {
      await requestJson('/api/admin/inventory', { method: 'PATCH', body: JSON.stringify({ variantId: row.dataset.variantId, onHand: row.querySelector('[data-stock-input]').value, retailPrice: row.querySelector('[data-price-input]').value, saleEnabled: row.querySelector('[data-sale-enabled]').checked }) });
      await loadDashboard();
      showMessage('Inventory saved.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-products').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-product]');
    if (button) openProductEditor(button.dataset.editProduct);
  });

  document.getElementById('editor-public-status')?.addEventListener('change', event => {
    const value = event.target.value;
    document.getElementById('editor-published').checked = !['draft','archived'].includes(value);
    document.getElementById('editor-info-only').checked = value !== 'available_for_sale';
    document.getElementById('editor-sale').checked = value === 'available_for_sale';
    document.getElementById('editor-archived').checked = value === 'archived';
    if (value === 'available_for_sale') document.getElementById('editor-stock-status').value = 'available';
    if (value === 'archived') document.getElementById('editor-stock-status').value = 'archived';
  });

  document.getElementById('product-editor').addEventListener('submit', async event => {
    event.preventDefault();
    const productId = document.getElementById('editor-product-id').value;
    const countries = document.getElementById('editor-countries').value.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
    const discoveryGoals = document.getElementById('editor-goals').value.split(',').map(value => value.trim()).filter(Boolean);
    const discoveryNeeds = document.getElementById('editor-needs').value.split(',').map(value => value.trim()).filter(Boolean);
    const searchAliases = document.getElementById('editor-search-aliases').value.split(',').map(value => value.trim()).filter(Boolean);
    const publicStatus = document.getElementById('editor-public-status').value;
    const statusFlags = {
      draft: { published:false, informationOnly:true, availableForSale:false, archived:false, stockStatus:'information_only' },
      information_only: { published:true, informationOnly:true, availableForSale:false, archived:false, stockStatus:document.getElementById('editor-stock-status').value === 'archived' ? 'information_only' : document.getElementById('editor-stock-status').value },
      available_for_sale: { published:true, informationOnly:false, availableForSale:true, archived:false, stockStatus:'available' },
      archived: { published:false, informationOnly:true, availableForSale:false, archived:true, stockStatus:'archived' }
    }[publicStatus];
    try {
      await requestJson(`/api/admin/product-content/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({
        displayName: document.getElementById('editor-display-name').value,
        shortDescription: document.getElementById('editor-short-description').value,
        fullDescription: document.getElementById('editor-full-description').value,
        deliveryEstimate: document.getElementById('editor-delivery').value,
        stockStatus: document.getElementById('editor-stock-status').value,
        ingredients: document.getElementById('editor-ingredients').value,
        storage: document.getElementById('editor-storage').value,
        usage: document.getElementById('editor-usage').value,
        warnings: document.getElementById('editor-warnings').value,
        imageUrl: document.getElementById('editor-image-url').value,
        imageAlt: document.getElementById('editor-image-alt').value,
        imageSrcset: document.getElementById('editor-image-srcset').value,
        imageSizes: document.getElementById('editor-image-sizes').value,
        imageFocalPoint: document.getElementById('editor-image-focal').value,
        searchAliases,
        discoveryGoals,
        discoveryNeeds,
        informationCompleteness: document.getElementById('editor-completeness').value,
        specialistOnly: document.getElementById('editor-specialist').checked,
        allowedCountries: countries,
        labReports: textToLabReports(document.getElementById('editor-lab-reports').value),
        published: statusFlags.published,
        informationOnly: statusFlags.informationOnly,
        availableForSale: statusFlags.availableForSale,
        archived: statusFlags.archived,
        stockStatus: statusFlags.stockStatus
      }) });
      await loadDashboard(); openProductEditor(productId); showMessage('Product information saved.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('enable-webshop-product').addEventListener('click', async () => {
    const productId = document.getElementById('editor-product-id').value;
    if (!productId || !confirm('Enable this product and every eligible variant for the local sandbox webshop? This does not enable live payments.')) return;
    try {
      const result = await requestJson(`/api/admin/products/${encodeURIComponent(productId)}/webshop`, { method: 'POST', body: JSON.stringify({ enabled: true }) });
      await loadDashboard();
      openProductEditor(productId);
      const enabledCount = result.enabledVariants?.length || 0;
      const blockedCount = result.blockedVariants?.length || 0;
      showMessage(`${enabledCount} variant${enabledCount === 1 ? '' : 's'} enabled for local checkout${blockedCount ? `; ${blockedCount} still need price or stock` : ''}.`, enabledCount ? 'success' : 'error');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('disable-webshop-product').addEventListener('click', async () => {
    const productId = document.getElementById('editor-product-id').value;
    if (!productId || !confirm('Disable this product and all its variants from the local webshop?')) return;
    try {
      await requestJson(`/api/admin/products/${encodeURIComponent(productId)}/webshop`, { method: 'POST', body: JSON.stringify({ enabled: false }) });
      await loadDashboard();
      openProductEditor(productId);
      showMessage('Product disabled from local checkout and synced to the storefront.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('archive-product').addEventListener('click', async () => {
    const productId = document.getElementById('editor-product-id').value;
    if (!productId || !confirm('Remove this product from the storefront? It can be restored by editing it and clearing Archived.')) return;
    try { await requestJson(`/api/admin/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }); await loadDashboard(); document.getElementById('product-editor').hidden = true; showMessage('Product removed from the storefront and synced to open pages.', 'success'); } catch (error) { showMessage(error.message); }
  });

  document.getElementById('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await requestJson('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ storeName: document.getElementById('setting-store-name').value, currency: 'EUR', priceSource: document.getElementById('setting-price-source').value, priceSourceLabel: document.getElementById('setting-price-label').value, defaultDelivery: document.getElementById('setting-delivery').value, assistantName: document.getElementById('setting-assistant-name').value, checkoutMode: document.getElementById('setting-checkout-mode').value, trustSignals: document.getElementById('setting-trust-signals').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }) });
      await loadDashboard(); showMessage('Store settings saved.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-reviews').addEventListener('click', async event => {
    const button = event.target.closest('[data-review-status]'); const card = event.target.closest('[data-review-id]');
    if (!button || !card) return;
    try { await requestJson(`/api/admin/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.reviewStatus }) }); await loadDashboard(); showMessage('Review status updated.', 'success'); } catch (error) { showMessage(error.message); }
  });

  document.getElementById('guide-form').addEventListener('submit', async event => {
    event.preventDefault();
    try { await requestJson('/api/admin/guide', { method: 'PATCH', body: JSON.stringify({ enabled: document.getElementById('guide-enabled').checked, rules: state.dashboard.guide.rules }) }); await loadDashboard(); showMessage('Product guide settings saved.', 'success'); } catch (error) { showMessage(error.message); }
  });

  async function saveKnowledge(confirmRemoved) {
    const body = { entries: collectKbEntries(), fallback: document.getElementById('support-fallback').value, ...(confirmRemoved ? { confirmRemoved } : {}) };
    try {
      await requestJson('/api/admin/support-kb', { method: 'PATCH', body: JSON.stringify(body) });
      await loadDashboard();
      showMessage('Ask Vera knowledge saved.', 'success');
    } catch (error) {
      if (error.payload?.error === 'bulk_removal_confirmation_required' && confirm(`${error.message}\n\nRemove these answers?`)) return saveKnowledge(error.payload.removed);
      showMessage(error.message);
    }
  }
  document.getElementById('support-form').addEventListener('submit', event => { event.preventDefault(); saveKnowledge(); });
  document.getElementById('kb-add')?.addEventListener('click', () => {
    document.getElementById('kb-entries').insertAdjacentHTML('beforeend', kbEntryMarkup({ title: '' }));
    document.querySelector('#kb-entries .kb-entry:last-child [data-kb="title"]')?.focus();
  });
  document.getElementById('kb-entries')?.addEventListener('click', event => {
    if (event.target.closest('[data-kb-remove]')) event.target.closest('.kb-entry').remove();
  });
  document.getElementById('kb-migration')?.addEventListener('click', async event => {
    const apply = event.target.closest('[data-kb-apply]');
    const rollback = event.target.closest('[data-kb-rollback]');
    try {
      if (apply) {
        if (!confirm(`Apply ${apply.dataset.kbApply} knowledge update(s)? A backup is made first and can be restored here.`)) return;
        const result = await requestJson('/api/admin/support-kb/migration', { method: 'POST', body: JSON.stringify({ confirmWrites: Number(apply.dataset.kbApply) }) });
        await loadDashboard();
        showMessage(result.applied ? `Knowledge updated. Backup: ${result.snapshot}.` : result.message, 'success');
      }
      if (rollback) {
        if (!confirm('Restore the knowledge base from this backup? The current answers are backed up first.')) return;
        await requestJson('/api/admin/support-kb/rollback', { method: 'POST', body: JSON.stringify({ snapshot: rollback.dataset.kbRollback, confirm: true }) });
        await loadDashboard();
        showMessage('Knowledge base restored from backup.', 'success');
      }
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('status-refresh')?.addEventListener('click', () => loadDashboard().catch(error => showMessage(error.message)));
  ['compliance-search', 'compliance-status-filter', 'compliance-risk-filter', 'compliance-visible-filter'].forEach(id => document.getElementById(id)?.addEventListener('input', renderCompliance));
  document.getElementById('compliance-rows')?.addEventListener('click', event => {
    const row = event.target.closest('[data-compliance-id]');
    if (!row) return;
    if (event.target.closest('[data-compliance-select]')) {
      if (event.target.checked) compliance.selected.add(row.dataset.complianceId); else compliance.selected.delete(row.dataset.complianceId);
      renderCompliance();
    } else if (event.target.closest('[data-compliance-open]')) {
      compliance.openId = row.dataset.complianceId;
      renderCompliance();
      document.getElementById('compliance-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.getElementById('compliance-select-all')?.addEventListener('change', event => {
    filteredComplianceRows().forEach(row => event.target.checked ? compliance.selected.add(row.id) : compliance.selected.delete(row.id));
    renderCompliance();
  });
  async function applyBulk(confirmCount) {
    const body = { productIds: [...compliance.selected], status: document.getElementById('compliance-bulk-status').value, note: document.getElementById('compliance-bulk-note').value, ...(confirmCount ? { confirmCount } : {}) };
    try {
      const result = await requestJson('/api/admin/compliance/bulk', { method: 'POST', body: JSON.stringify(body) });
      compliance.selected.clear();
      await loadDashboard();
      showMessage(`${result.updated} product(s) set to ${STATUS_TEXT[result.status]}.${result.revokedSales ? ` Sale switched off for ${result.revokedSales}.` : ''}`, 'success');
    } catch (error) {
      if (error.payload?.error === 'bulk_confirmation_required' && confirm(error.message)) return applyBulk(error.payload.count);
      showMessage(error.message);
    }
  }
  document.getElementById('compliance-bulk-apply')?.addEventListener('click', () => applyBulk());
  document.getElementById('compliance-detail')?.addEventListener('click', event => {
    if (event.target.closest('[data-compliance-close]')) { compliance.openId = null; renderCompliance(); }
  });
  document.getElementById('compliance-detail')?.addEventListener('submit', async event => {
    const form = event.target.closest('[data-compliance-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const body = {
      status: data.get('status'), note: data.get('note'),
      evidence: String(data.get('evidence') || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts[0]).map(([title, url, date]) => ({ title, url: url || '', date: date || '' })),
      scope: data.get('scope'), reviewer: data.get('reviewer'), reviewReference: data.get('reviewReference'), confirmation: data.get('confirmation'), markets: data.getAll('markets')
    };
    try {
      const result = await requestJson(`/api/admin/compliance/${encodeURIComponent(form.dataset.complianceForm)}`, { method: 'PATCH', body: JSON.stringify(body) });
      await loadDashboard();
      showMessage(`Decision saved for ${result.row.displayName}.${result.commerceRevoked ? ' Sale was switched off.' : ''}`, 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-returns').addEventListener('click', async event => {
    const row = event.target.closest('[data-return-id]');
    if (!row || !event.target.closest('[data-save-return]')) return;
    try {
      await requestJson(`/api/admin/returns/${encodeURIComponent(row.dataset.returnId)}`, { method: 'PATCH', body: JSON.stringify({ status: row.querySelector('[data-return-status]').value }) });
      await loadDashboard();
      showMessage('Return status saved.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-user-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await requestJson('/api/admin/users', { method:'POST', body: JSON.stringify({
        email: document.getElementById('admin-user-email').value,
        displayName: document.getElementById('admin-user-name').value,
        role: document.getElementById('admin-user-role').value,
        password: document.getElementById('admin-user-password').value,
        enabled: document.getElementById('admin-user-enabled').checked
      }) });
      event.target.reset(); document.getElementById('admin-user-enabled').checked = true;
      await loadDashboard(); showMessage('Admin account saved.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-mfa-setup')?.addEventListener('click', async () => {
    try {
      const payload = await requestJson('/api/admin/me/mfa/setup', { method:'POST', body:'{}' });
      document.getElementById('admin-mfa-secret').textContent = payload.secret;
      document.getElementById('admin-mfa-uri').textContent = payload.otpauthUri;
      document.getElementById('admin-mfa-setup-box').hidden = false;
      document.getElementById('admin-recovery-codes').hidden = true;
      document.getElementById('admin-mfa-confirm-code').focus();
      showMessage('Authenticator setup started. Confirm with a fresh 6-digit code.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('admin-mfa-confirm')?.addEventListener('click', async () => {
    try {
      const payload = await requestJson('/api/admin/me/mfa/confirm', { method:'POST', body:JSON.stringify({ code: document.getElementById('admin-mfa-confirm-code').value }) });
      document.getElementById('admin-mfa-setup-box').hidden = true;
      document.getElementById('admin-recovery-code-list').textContent = (payload.recoveryCodes || []).join('\n');
      document.getElementById('admin-recovery-codes').hidden = false;
      await loadDashboard();
      showMessage('MFA enabled. Save the recovery codes before leaving this page.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  document.getElementById('privacy-export-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const email = document.getElementById('privacy-export-email').value.trim();
      const payload = await requestJson(`/api/admin/privacy/customer-export?email=${encodeURIComponent(email)}`);
      const result = document.getElementById('privacy-export-result');
      result.textContent = JSON.stringify(payload, null, 2);
      result.hidden = false;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `verapep-customer-export-${Date.now()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showMessage('Customer data export generated and downloaded.', 'success');
    } catch (error) { showMessage(error.message); }
  });

  checkSession().catch(error => showMessage(error.message));
  // v19: shared helpers for the Owner Control Center and product workspace (assets/admin-v19.js).
  window.VerapepAdmin = Object.assign(window.VerapepAdmin || {}, { state, requestJson, sessionExpired, escapeHtml, formatDate, label, showMessage, showTab, loadDashboard, openProductEditor, renderProducts });
})();
