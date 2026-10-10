/* Sandbox order lookup, confirmation, tracking and return request. */
(() => {
  'use strict';

  const state = { order: null, token: null, email: null };
  const params = new URLSearchParams(location.search);
  const message = document.getElementById('order-message');
  const detail = document.getElementById('order-detail');
  const loading = document.getElementById('order-loading');
  const lookupCard = document.getElementById('lookup-card');

  const STATUS_LABELS = {
    awaiting_payment: 'Awaiting test payment',
    processing: 'Processing demo order',
    packed: 'Packed',
    shipped: 'Shipped',
    in_transit: 'In transit',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded'
  };

  const STATUS_COPY = {
    awaiting_payment: 'The demo order exists, but payment has not been confirmed.',
    processing: 'The sandbox payment is confirmed and synthetic inventory has been adjusted.',
    packed: 'The demo order has been marked as packed in the admin view.',
    shipped: 'A simulated shipment has been created.',
    in_transit: 'The demo order is moving through the simulated delivery timeline.',
    out_for_delivery: 'The simulated delivery is marked as out for delivery.',
    delivered: 'The demo order has reached the final simulated delivery stage.',
    cancelled: 'This demo order was cancelled.',
    refunded: 'A sandbox refund was recorded. No real funds moved.'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatMoney(cents, currency = 'EUR') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((Number(cents) || 0) / 100);
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `checkout-message checkout-message--${type}`;
    message.hidden = !text;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'The request could not be completed.');
    return payload;
  }

  function addressText(address) {
    if (!address) return 'Address unavailable.';
    return [address.line1, address.line2, `${address.postalCode || ''} ${address.city || ''}`.trim(), address.country].filter(Boolean).map(escapeHtml).join('<br>');
  }

  function renderOrder(order) {
    state.order = order;
    detail.hidden = false;
    lookupCard.hidden = true;
    loading.hidden = true;
    showMessage('');

    document.title = `${order.id} — VERAPEP Test Order`;
    document.getElementById('order-id').textContent = order.id;
    document.getElementById('order-status-title').textContent = STATUS_LABELS[order.orderStatus] || order.orderStatus.replaceAll('_', ' ');
    document.getElementById('order-status-copy').textContent = STATUS_COPY[order.orderStatus] || 'The sandbox order status was updated.';
    const badge = document.getElementById('order-status-badge');
    badge.textContent = STATUS_LABELS[order.orderStatus] || order.orderStatus;
    badge.className = `order-status-badge order-status-badge--${escapeHtml(order.orderStatus)}`;

    document.getElementById('tracking-timeline').innerHTML = order.timeline.map((event, index) => `
      <li class="${index === order.timeline.length - 1 ? 'is-current' : ''}"><span></span><div><strong>${escapeHtml(event.label || event.status)}</strong><time>${escapeHtml(formatDate(event.at))}</time>${event.note ? `<p>${escapeHtml(event.note)}</p>` : ''}</div></li>`).join('');

    document.getElementById('order-lines').innerHTML = order.items.map(item => `
      <article class="order-line"><div><strong>${escapeHtml(item.productName)}</strong><span>${escapeHtml(item.specification)}</span><small>${escapeHtml(item.catalogueNo || 'No catalogue number')} · Qty ${item.quantity}</small></div><strong>${formatMoney(item.lineTotalCents, order.currency)}</strong></article>`).join('');

    document.getElementById('order-subtotal').textContent = formatMoney(order.subtotalCents, order.currency);
    document.getElementById('order-shipping').textContent = order.shippingCents === 0 ? 'Free' : formatMoney(order.shippingCents, order.currency);
    document.getElementById('order-tax').textContent = order.taxConfigured ? formatMoney(order.taxCents, order.currency) : 'Not configured';
    document.getElementById('order-total').textContent = formatMoney(order.totalCents, order.currency);
    document.getElementById('payment-status').textContent = order.paymentStatus.replaceAll('_', ' ');
    document.getElementById('payment-reference').textContent = order.paymentReference ? `${order.paymentProvider || 'payment'} · ${order.paymentReference}` : 'No payment reference yet.';
    document.getElementById('shipping-method').textContent = order.shippingMethod?.name || 'No delivery method';
    document.getElementById('shipping-address').innerHTML = addressText(order.shippingAddress);
    document.getElementById('tracking-reference').textContent = order.trackingNumber ? `${order.carrier || 'Carrier'} · ${order.trackingNumber}` : 'No tracking number assigned.';
    document.getElementById('customer-name').textContent = order.customer?.name || 'Customer';
    document.getElementById('customer-contact').textContent = [order.customer?.email, order.customer?.phone].filter(Boolean).join(' · ');

    const returnCard = document.getElementById('return-card');
    returnCard.hidden = !['paid', 'refunded'].includes(order.paymentStatus);
  }

  /* v18: personal data and access tokens never go in request URLs. A token is sent as a header;
     an email lookup uses POST. Tokens/emails that arrive in the page URL (payment redirect, old
     links) are moved to this tab's sessionStorage and removed from the address bar. */
  async function fetchOrder(orderId, token = null, email = null) {
    loading.hidden = false;
    detail.hidden = true;
    const payload = email && !token
      ? await requestJson('/api/orders/lookup', { method: 'POST', body: JSON.stringify({ orderId, email }) })
      // With a token: header. Without token or email: works only for a signed-in admin (cookie).
      : await requestJson(`/api/orders/${encodeURIComponent(orderId)}`, { headers: token ? { 'X-Order-Token': token } : {} });
    renderOrder(payload.order);
  }

  function takeAccessFromUrl() {
    let stored = {};
    try { stored = JSON.parse(sessionStorage.getItem('vp-order-access') || '{}'); } catch {}
    const orderId = params.get('order') || stored.orderId || null;
    const access = { orderId, token: params.get('token') || (stored.orderId === orderId ? stored.token : null), email: params.get('email') || (stored.orderId === orderId ? stored.email : null) };
    if (params.has('token') || params.has('email')) {
      try { sessionStorage.setItem('vp-order-access', JSON.stringify(access)); } catch {}
      const clean = new URL(location.href);
      clean.searchParams.delete('token');
      clean.searchParams.delete('email');
      history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
    }
    return access;
  }

  async function initialise() {
    const { orderId, token, email } = takeAccessFromUrl();
    const stripeSessionId = params.get('stripe_session_id');
    if (!orderId) return;
    if (!token && !email) {
      // Admin "Open" links carry only the order number; customers get the lookup form, prefilled.
      try { await fetchOrder(orderId); lookupCard.hidden = true; } catch { loading.hidden = true; const field = document.getElementById('lookup-order'); if (field) field.value = orderId; }
      return;
    }
    state.token = token;
    state.email = email;
    lookupCard.hidden = true;
    loading.hidden = false;
    try {
      if (stripeSessionId && token) {
        await requestJson('/api/payments/stripe/confirm', {
          method: 'POST',
          body: JSON.stringify({ orderId, token, sessionId: stripeSessionId })
        });
      }
      await fetchOrder(orderId, token, email);
    } catch (error) {
      loading.hidden = true;
      lookupCard.hidden = false;
      showMessage(error.message);
    }
  }

  document.getElementById('lookup-form').addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('');
    const orderId = document.getElementById('lookup-order').value.trim();
    const email = document.getElementById('lookup-email').value.trim();
    try {
      loading.hidden = false;
      const payload = await requestJson('/api/orders/lookup', { method: 'POST', body: JSON.stringify({ orderId, email }) });
      state.email = email;
      renderOrder(payload.order);
    } catch (error) {
      loading.hidden = true;
      showMessage(error.message);
    }
  });

  document.getElementById('return-form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.getElementById('return-message');
    const reason = document.getElementById('return-reason').value.trim();
    status.textContent = '';
    if (!state.order) return;
    try {
      const payload = await requestJson(`/api/orders/${encodeURIComponent(state.order.id)}/returns`, {
        method: 'POST',
        body: JSON.stringify({ token: state.token, email: state.email, reason })
      });
      status.textContent = `Return request ${payload.returnRequest.id} created.`;
      renderOrder(payload.order);
      document.getElementById('return-reason').value = '';
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.getElementById('print-order').addEventListener('click', () => window.print());
  initialise();
})();
