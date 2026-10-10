/* Complete five-step sandbox checkout. */
(() => {
  'use strict';

  const state = {
    step: 1,
    storefront: null,
    quote: null,
    shippingMethodId: 'sandbox-standard',
    busy: false,
    idempotencyKey: (globalThis.crypto?.randomUUID?.() || `vp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  };

  const message = document.getElementById('checkout-message');
  const cartItemsNode = document.getElementById('checkout-cart-items');
  const summaryLines = document.getElementById('checkout-summary-lines');
  const deliveryOptions = document.getElementById('delivery-options');
  const countrySelect = document.getElementById('address-country');
  const placeOrderButton = document.getElementById('place-order');

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: state.storefront?.config.currency || 'EUR' }).format((Number(cents) || 0) / 100);
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `checkout-message checkout-message--${type}`;
    message.hidden = !text;
    if (text) message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearMessage() {
    showMessage('');
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'The request could not be completed.');
    return payload;
  }

  function showStep(step) {
    state.step = step;
    document.querySelectorAll('[data-step]').forEach(section => {
      const active = Number(section.dataset.step) === step;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    const progress = document.getElementById('checkout-steps');
    const labels = ['Cart','Details','Delivery','Payment','Complete'];
    if (progress) progress.dataset.mobileLabel = `Step ${step} of 5 · ${labels[step - 1]}`;
    document.querySelectorAll('[data-step-indicator]').forEach(indicator => {
      const number = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle('is-active', number === step);
      indicator.classList.toggle('is-complete', number < step);
    });
    clearMessage();
    document.querySelector(`[data-step="${step}"]`)?.focus?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function currentCart() {
    return window.VerapepeCart.getItems().filter(item => !item.missing);
  }

  function renderCart() {
    const items = currentCart();
    if (!items.length) {
      cartItemsNode.innerHTML = '<div class="checkout-empty"><h3>Your cart is empty</h3><p>Return to the catalogue and add at least one listed variant.</p><a class="button button--primary" href="index.html#catalogue">Browse products</a></div>';
      document.querySelector('[data-next-step="2"]')?.setAttribute('disabled', '');
      return;
    }
    document.querySelector('[data-next-step="2"]')?.removeAttribute('disabled');
    cartItemsNode.innerHTML = items.map(item => `
      <article class="checkout-line">
        <div class="checkout-line__symbol">${escapeHtml(item.category.short)}</div>
        <div class="checkout-line__details"><strong>${escapeHtml(item.product.name)}</strong><span>${escapeHtml(item.variant.specification)}</span><small>${escapeHtml(item.variant.catalogueNo || 'No catalogue number')} · ${item.variant.retailPriceCents ? formatMoney(item.variant.retailPriceCents) : 'Price revalidated at checkout'} each</small></div>
        <div class="quantity-control"><button type="button" data-checkout-quantity="decrease" data-variant-id="${escapeHtml(item.variantId)}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-checkout-quantity="increase" data-variant-id="${escapeHtml(item.variantId)}" aria-label="Increase quantity">+</button></div>
        <button class="text-button" type="button" data-checkout-remove="${escapeHtml(item.variantId)}">Remove</button>
      </article>`).join('');
  }

  async function updateQuote() {
    const items = window.VerapepeCart.getRawItems();
    if (!items.length) {
      state.quote = null;
      renderSummary();
      return;
    }
    state.quote = await requestJson('/api/quote', {
      method: 'POST',
      body: JSON.stringify({ items, shippingMethodId: state.shippingMethodId })
    });
    renderDeliveryOptions();
    renderSummary();
  }

  function renderDeliveryOptions() {
    if (!state.quote) {
      deliveryOptions.innerHTML = '';
      return;
    }
    deliveryOptions.innerHTML = state.quote.shippingOptions.map(method => `
      <label class="option-card">
        <input type="radio" name="shipping-method" value="${escapeHtml(method.id)}" ${method.id === state.shippingMethodId ? 'checked' : ''}>
        <span><strong>${escapeHtml(method.name)} <em>${method.quotedPriceCents === 0 ? 'Free' : formatMoney(method.quotedPriceCents)}</em></strong><small>${escapeHtml(method.description)} · ${escapeHtml(method.estimatedDays)}</small></span>
      </label>`).join('');
  }

  function renderSummary() {
    if (!state.quote) {
      summaryLines.innerHTML = '<p class="summary-empty">No products in the cart.</p>';
      document.getElementById('summary-subtotal').textContent = formatMoney(0);
      document.getElementById('summary-shipping').textContent = '—';
      document.getElementById('summary-tax').textContent = 'Not configured';
      document.getElementById('summary-total').textContent = formatMoney(0);
      return;
    }
    summaryLines.innerHTML = state.quote.lines.map(line => `
      <div class="summary-line"><span><strong>${escapeHtml(line.productName)}</strong><small>${escapeHtml(line.specification)} · Qty ${line.quantity}</small></span><strong>${formatMoney(line.lineTotalCents)}</strong></div>`).join('');
    document.getElementById('summary-subtotal').textContent = formatMoney(state.quote.subtotalCents);
    document.getElementById('summary-shipping').textContent = state.quote.shippingCents === 0 ? 'Free' : formatMoney(state.quote.shippingCents);
    document.getElementById('summary-tax').textContent = state.quote.taxConfigured ? formatMoney(state.quote.taxCents) : 'Not configured';
    document.getElementById('summary-total').textContent = formatMoney(state.quote.totalCents);
  }

  function validateStep(step) {
    if (step === 1 && currentCart().length === 0) throw new Error('Add at least one product variant before continuing.');
    if (step === 2) {
      const name = document.getElementById('customer-name');
      const email = document.getElementById('customer-email');
      if (name.value.trim().length < 2) { name.focus(); throw new Error('Enter the customer name.'); }
      if (!email.validity.valid || !email.value.trim()) { email.focus(); throw new Error('Enter a valid email address.'); }
    }
    if (step === 3) {
      const required = [
        ['address-line1', 'Enter the delivery address.'],
        ['address-city', 'Enter the city.'],
        ['address-postal', 'Enter the postal code.'],
        ['address-country', 'Choose a country.']
      ];
      for (const [id, error] of required) {
        const control = document.getElementById(id);
        if (!control.value.trim()) { control.focus(); throw new Error(error); }
      }
    }
  }

  function checkoutBody() {
    return {
      items: window.VerapepeCart.getRawItems(),
      shippingMethodId: state.shippingMethodId,
      customer: {
        name: document.getElementById('customer-name').value,
        email: document.getElementById('customer-email').value,
        phone: document.getElementById('customer-phone').value
      },
      shippingAddress: {
        line1: document.getElementById('address-line1').value,
        line2: document.getElementById('address-line2').value,
        city: document.getElementById('address-city').value,
        postalCode: document.getElementById('address-postal').value,
        country: document.getElementById('address-country').value
      },
      acceptTerms: document.getElementById('accept-terms').checked,
      acceptSandboxNotice: document.getElementById('accept-sandbox').checked
    };
  }

  async function placeOrder() {
    if (state.busy) return;
    clearMessage();
    if (!document.getElementById('accept-terms').checked || !document.getElementById('accept-sandbox').checked) {
      showMessage('Accept both sandbox confirmations before creating the demo order.');
      return;
    }
    state.busy = true;
    placeOrderButton.disabled = true;
    placeOrderButton.textContent = 'Creating demo order…';
    try {
      const created = await requestJson('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': state.idempotencyKey }, body: JSON.stringify({ ...checkoutBody(), idempotencyKey: state.idempotencyKey }) });
      const { order, accessToken } = created;
      sessionStorage.setItem('verapep_last_order', JSON.stringify({ orderId: order.id, token: accessToken }));
      const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'mock';
      if (paymentMethod === 'stripe_test') {
        const session = await requestJson('/api/payments/stripe/session', { method: 'POST', body: JSON.stringify({ orderId: order.id, token: accessToken }) });
        location.assign(session.url);
        return;
      }
      await requestJson(`/api/orders/${encodeURIComponent(order.id)}/payments/mock`, { method: 'POST', body: JSON.stringify({ token: accessToken }) });
      window.VerapepeCart.clear();
      showStep(5);
      document.getElementById('checkout-complete-copy').textContent = `Test order ${order.id} is confirmed. Opening its tracking page.`;
      // v18: the order access token stays out of the URL (history, referrers, logs).
      try { sessionStorage.setItem('vp-order-access', JSON.stringify({ orderId: order.id, token: accessToken })); } catch {}
      window.setTimeout(() => location.assign(`/order.html?order=${encodeURIComponent(order.id)}`), 600);
    } catch (error) {
      showMessage(error.message);
      state.busy = false;
      placeOrderButton.disabled = false;
      placeOrderButton.textContent = 'Create and pay demo order';
    }
  }

  async function initialise() {
    try {
      state.storefront = await window.VerapepeCart.ready;
      countrySelect.innerHTML = '<option value="">Choose a sandbox country</option>' + state.storefront.config.allowedCountries.map(country => `<option value="${escapeHtml(country.code)}">${escapeHtml(country.name)}</option>`).join('');
      const stripeAvailable = state.storefront.stripeTestConfigured && state.storefront.stripeTestEligible;
      const stripeInput = document.querySelector('#stripe-option input');
      stripeInput.disabled = !stripeAvailable;
      document.getElementById('stripe-option').classList.toggle('option-card--disabled', !stripeAvailable);
      document.getElementById('stripe-option-note').textContent = stripeAvailable
        ? 'Configured with a Stripe test key and explicit variant allowlist.'
        : 'Disabled until a test key, legal acknowledgement and per-variant allowlist are configured.';
      renderCart();
      await updateQuote();
    } catch (error) {
      showMessage(error.message || 'Start the local server with npm start.');
    }
  }

  document.addEventListener('click', async event => {
    const next = event.target.closest('[data-next-step]');
    if (next) {
      try {
        validateStep(state.step);
        await updateQuote();
        showStep(Number(next.dataset.nextStep));
      } catch (error) {
        showMessage(error.message);
      }
    }
    const previous = event.target.closest('[data-prev-step]');
    if (previous) showStep(Number(previous.dataset.prevStep));

    const quantity = event.target.closest('[data-checkout-quantity]');
    if (quantity) {
      const item = window.VerapepeCart.getRawItems().find(entry => entry.variantId === quantity.dataset.variantId);
      if (!item) return;
      window.VerapepeCart.updateQuantity(item.variantId, item.quantity + (quantity.dataset.checkoutQuantity === 'increase' ? 1 : -1));
      renderCart();
      await updateQuote().catch(error => showMessage(error.message));
    }

    const remove = event.target.closest('[data-checkout-remove]');
    if (remove) {
      window.VerapepeCart.removeItem(remove.dataset.checkoutRemove);
      renderCart();
      await updateQuote().catch(error => showMessage(error.message));
    }
  });

  deliveryOptions.addEventListener('change', async event => {
    if (event.target.name !== 'shipping-method') return;
    state.shippingMethodId = event.target.value;
    await updateQuote().catch(error => showMessage(error.message));
  });

  placeOrderButton.addEventListener('click', placeOrder);
  window.addEventListener('verapep:cart-changed', () => { renderCart(); updateQuote().catch(error => showMessage(error.message)); });
  initialise();
})();
