/* VERAPEP V5 administration with live storefront synchronisation. */
(() => {
  'use strict';

  const state = { csrf: null, dashboard: null, activeTab: 'orders', orderQueue: 'all' };
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

  function formatMoney(value, currency = 'USD') {
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
    if (!response.ok) throw new Error(payload.message || 'The request could not be completed.');
    return payload;
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
        <td><span class="admin-badge admin-badge--${escapeHtml(order.paymentStatus)}">${escapeHtml(label(order.paymentStatus))}</span><small>${escapeHtml(order.paymentProvider || 'No provider')}</small></td>
        <td><select data-order-status>${statusOptions(ORDER_STATUSES, order.orderStatus)}</select><input data-order-carrier value="${escapeHtml(order.carrier || '')}" placeholder="Carrier"><input data-order-tracking value="${escapeHtml(order.trackingNumber || '')}" placeholder="Tracking number"></td>
        <td><div class="admin-actions"><button type="button" data-save-order>Save status</button><a href="order.html?order=${encodeURIComponent(order.id)}&email=${encodeURIComponent(order.customer?.email || '')}" target="_blank" rel="noopener">Open</a>${order.paymentStatus === 'paid' ? `<button class="danger-button" type="button" data-refund-order>${refundLabel}</button>` : ''}</div></td>
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
    document.getElementById('support-entries').value = (state.dashboard.supportKb?.entries || []).map(entry => [entry.question, entry.answer, entry.url].join(' | ')).join('\n');
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
    const mapping = { settings:'settings', products:'products', inventory:'inventory', orders:'orders', returns:'returns', reviews:'reviews', guide:'guide', audit:'audit', team:'users', outbox:'orders', privacy:'privacy' };
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
    applyPermissions();
  }

  async function loadDashboard() {
    const payload = await requestJson('/api/admin/dashboard');
    state.dashboard = payload;
    renderDashboard();
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    showMessage('');
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
    state.activeTab = button.dataset.adminTab;
    document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.toggle('is-active', item === button));
    document.querySelectorAll('[data-admin-panel]').forEach(panel => {
      const active = panel.dataset.adminPanel === state.activeTab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  });

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

  document.getElementById('support-form').addEventListener('submit', async event => {
    event.preventDefault();
    const entries = document.getElementById('support-entries').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => { const [question, answer, url] = line.split('|').map(part => part.trim()); return { id: `kb-${index+1}`, question, answer, url }; });
    try { await requestJson('/api/admin/support-kb', { method: 'PATCH', body: JSON.stringify({ entries, fallback: document.getElementById('support-fallback').value }) }); await loadDashboard(); showMessage('Approved AI knowledge saved.', 'success'); } catch (error) { showMessage(error.message); }
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
})();
