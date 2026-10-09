/*
  Shared cart
  ------------------------------------------------------------------
  Injected on the homepage, product pages and checkout pages. The cart
  stores only product/variant IDs and quantities in localStorage; prices
  and eligibility are always revalidated by the server.
*/
(() => {
  'use strict';

  const STORAGE_KEY = 'verapep_webshop_cart_v2';
  const state = {
    storefront: null,
    variants: new Map(),
    products: new Map(),
    cart: loadCart(),
    ready: null
  };

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.variantId === 'string') : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
    window.dispatchEvent(new CustomEvent('verapep:cart-changed', { detail: { items: getItems() } }));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: state.storefront?.config.currency || 'USD' }).format((Number(cents) || 0) / 100);
  }

  function createUi() {
    if (document.getElementById('sandbox-cart-drawer')) return;
    const nav = document.getElementById('site-nav');
    if (nav) {
      const button = document.createElement('button');
      button.id = 'cart-header-button';
      button.className = 'header-icon-button cart-header-button';
      button.type = 'button';
      button.setAttribute('aria-controls', 'sandbox-cart-drawer');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open cart');
      button.innerHTML = '<span class="sr-only">Cart</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.3 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7"></path><circle cx="10" cy="20" r="1"></circle><circle cx="18" cy="20" r="1"></circle></svg><strong id="cart-header-count">0</strong>';
      const actions = nav.querySelector('.nav__actions');
      const cta = nav.querySelector('.header-cta');
      if (actions) actions.appendChild(button);
      else nav.insertBefore(button, cta || null);
      const headerInner = document.querySelector('.header-inner--v11, .header-inner');
      if (headerInner && !document.getElementById('mobile-cart-button')) {
        const mobileButton = button.cloneNode(true);
        mobileButton.id = 'mobile-cart-button';
        mobileButton.classList.add('mobile-cart-button');
        mobileButton.querySelector('#cart-header-count')?.setAttribute('id','mobile-cart-count');
        const menuButton = headerInner.querySelector('.menu-button');
        headerInner.insertBefore(mobileButton, menuButton || null);
      }
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div class="cart-overlay" id="cart-overlay" hidden></div>
      <aside class="cart-drawer" id="sandbox-cart-drawer" aria-labelledby="cart-drawer-title" aria-hidden="true">
        <header class="cart-drawer__header">
          <div><p class="eyebrow">Webshop</p><h2 id="cart-drawer-title">Cart</h2></div>
          <button class="icon-button" id="cart-close" type="button" aria-label="Close cart">×</button>
        </header>
        <div class="sandbox-alert sandbox-alert--compact"><strong>Preview checkout.</strong><span>No live payment is processed.</span></div>
        <div class="cart-drawer__items" id="cart-drawer-items"></div>
        <footer class="cart-drawer__footer">
          <div class="cart-subtotal"><span>Subtotal</span><strong id="cart-subtotal">$0.00</strong></div>
          <p>Shipping and tax configuration are reviewed at checkout.</p>
          <a class="button button--primary cart-checkout-button" id="cart-checkout-link" href="/checkout.html">Continue to checkout</a>
          <button class="text-button" id="cart-clear" type="button">Clear cart</button>
        </footer>
      </aside>
      <div class="cart-toast" id="cart-toast" role="status" aria-live="polite" hidden></div>
    `);

    document.getElementById('cart-header-button')?.addEventListener('click', openDrawer);
    document.getElementById('mobile-cart-button')?.addEventListener('click', openDrawer);
    document.getElementById('cart-close')?.addEventListener('click', closeDrawer);
    document.getElementById('cart-overlay')?.addEventListener('click', closeDrawer);
    document.getElementById('cart-clear')?.addEventListener('click', () => {
      state.cart = [];
      saveCart();
      render();
    });
    document.getElementById('cart-checkout-link')?.addEventListener('click', event => {
      if (cartCount() === 0) event.preventDefault();
    });
    document.getElementById('cart-drawer-items')?.addEventListener('click', event => {
      const control = event.target.closest('[data-cart-action]');
      if (!control) return;
      const variantId = control.dataset.variantId;
      const action = control.dataset.cartAction;
      const item = state.cart.find(entry => entry.variantId === variantId);
      if (!item) return;
      if (action === 'increase') updateQuantity(variantId, item.quantity + 1);
      if (action === 'decrease') updateQuantity(variantId, item.quantity - 1);
      if (action === 'remove') removeItem(variantId);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDrawer();
    });
  }

  function openDrawer() {
    const drawer = document.getElementById('sandbox-cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    const button = document.getElementById('cart-header-button');
    if (!drawer || !overlay) return;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('is-open');
      overlay.classList.add('is-open');
    });
    drawer.setAttribute('aria-hidden', 'false');
    button?.setAttribute('aria-expanded', 'true');
    document.getElementById('mobile-cart-button')?.setAttribute('aria-expanded','true');
    document.body.classList.add('cart-open');
    document.getElementById('cart-close')?.focus();
  }

  function closeDrawer() {
    const drawer = document.getElementById('sandbox-cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    const button = document.getElementById('cart-header-button');
    if (!drawer || !overlay || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    button?.setAttribute('aria-expanded', 'false');
    document.getElementById('mobile-cart-button')?.setAttribute('aria-expanded','false');
    document.body.classList.remove('cart-open');
    window.setTimeout(() => { overlay.hidden = true; }, 180);
    (document.getElementById('mobile-cart-button') || button)?.focus();
  }

  function showToast(message) {
    const toast = document.getElementById('cart-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function getItems() {
    return state.cart.map(entry => {
      const found = state.variants.get(entry.variantId);
      return found ? { ...entry, ...found } : { ...entry, missing: true };
    });
  }

  function cartCount() {
    return state.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  function subtotalCents() {
    return getItems().reduce((sum, item) => sum + (item.missing ? 0 : Number(item.variant.retailPriceCents || 0) * item.quantity), 0);
  }

  function render() {
    const count = cartCount();
    const countNode = document.getElementById('cart-header-count');
    const mobileCountNode = document.getElementById('mobile-cart-count');
    const subtotalNode = document.getElementById('cart-subtotal');
    const container = document.getElementById('cart-drawer-items');
    const checkout = document.getElementById('cart-checkout-link');
    if (countNode) countNode.textContent = String(count);
    if (mobileCountNode) mobileCountNode.textContent = String(count);
    if (subtotalNode) subtotalNode.textContent = formatMoney(subtotalCents());
    if (checkout) {
      checkout.classList.toggle('is-disabled', count === 0);
      checkout.setAttribute('aria-disabled', String(count === 0));
    }
    if (!container) return;
    const items = getItems();
    if (!items.length) {
      container.innerHTML = '<div class="cart-empty"><span aria-hidden="true">○</span><h3>Your cart is empty</h3><p>Open a product page, choose a listed variant and add it to the cart.</p><a href="/index.html#catalogue">Browse products</a></div>';
      return;
    }
    container.innerHTML = items.map(item => {
      if (item.missing) return `<article class="cart-line cart-line--missing"><p>This stored variant is no longer available.</p><button class="text-button" data-cart-action="remove" data-variant-id="${escapeHtml(item.variantId)}">Remove</button></article>`;
      const priceCents = Number(item.variant.retailPriceCents || 0);
      return `
        <article class="cart-line">
          ${window.VerapepeVialRenderer?.render(item.product,{instance:`cart-${item.variantId}`,mode:'cart'}) || `<div class="cart-line__symbol">${escapeHtml(item.category.short)}</div>`}
          <div class="cart-line__content">
            <div class="cart-line__heading"><div><strong>${escapeHtml(item.product.content?.displayName || item.product.name)}</strong><span>${escapeHtml(item.variant.specification)}</span><small>${escapeHtml(item.variant.catalogueNo || 'No catalogue number')}</small></div><strong>${formatMoney(priceCents * item.quantity)}</strong></div>
            <div class="cart-line__controls">
              <div class="quantity-control" aria-label="Quantity for ${escapeHtml(item.product.content?.displayName || item.product.name)}">
                <button type="button" data-cart-action="decrease" data-variant-id="${escapeHtml(item.variantId)}" aria-label="Decrease quantity">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-action="increase" data-variant-id="${escapeHtml(item.variantId)}" aria-label="Increase quantity">+</button>
              </div>
              <button class="text-button" type="button" data-cart-action="remove" data-variant-id="${escapeHtml(item.variantId)}">Remove</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function addItem(variantId, quantity = 1) {
    const found = state.variants.get(variantId);
    if (!found) throw new Error('That variant is not available in the current catalogue.');
    if (!found.product.commerce.checkoutEnabled || !found.variant.checkoutEnabled) throw new Error('This variant is not enabled for webshop checkout.');
    const requested = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const existing = state.cart.find(item => item.variantId === variantId);
    const nextQuantity = Math.min(99, (existing?.quantity || 0) + requested);
    if (nextQuantity > found.variant.sandboxStock) throw new Error(`Only ${found.variant.sandboxStock} sandbox units are available.`);
    if (existing) existing.quantity = nextQuantity;
    else state.cart.push({ variantId, quantity: requested });
    saveCart();
    render();
    showToast(`${found.product.content?.displayName || found.product.name} added to the cart.`);
    return getItems();
  }

  function updateQuantity(variantId, quantity) {
    const item = state.cart.find(entry => entry.variantId === variantId);
    if (!item) return;
    if (quantity <= 0) return removeItem(variantId);
    const found = state.variants.get(variantId);
    item.quantity = Math.min(99, Math.max(1, Number.parseInt(quantity, 10) || 1), found?.variant.sandboxStock ?? 99);
    saveCart();
    render();
  }

  function removeItem(variantId) {
    state.cart = state.cart.filter(item => item.variantId !== variantId);
    saveCart();
    render();
  }

  function clear() {
    state.cart = [];
    saveCart();
    render();
  }

  async function refreshStorefront() {
    const response = await fetch('/api/storefront', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Storefront API unavailable.');
    state.storefront = await response.json(); state.products.clear(); state.variants.clear();
    for (const product of state.storefront.products) {
      state.products.set(product.id, product);
      const category = state.storefront.categories.find(item => item.id === product.category);
      for (const variant of product.variants) state.variants.set(variant.variantId, { product, variant, category });
    }
    state.cart = state.cart.filter(item => state.variants.get(item.variantId)?.variant.checkoutEnabled);
    saveCart(); render(); document.documentElement.dataset.storeMode = state.storefront.mode;
    return state.storefront;
  }

  async function initialise() {
    createUi();
    try {
      const storefront = await refreshStorefront();
      if ('EventSource' in window) {
        const events = new EventSource('/api/storefront/events');
        let connected = false;
        events.addEventListener('storefront', event => { const update = JSON.parse(event.data || '{}'); if (update.reason === 'connected') { connected = true; return; } if (connected) refreshStorefront().catch(console.warn); });
      }
      return storefront;
    } catch (error) {
      state.storefront = null;
      render();
      const container = document.getElementById('cart-drawer-items');
      if (container) container.innerHTML = '<div class="cart-empty"><h3>Start the local server</h3><p>The webshop features require <code>npm start</code> and cannot run from a file:// address.</p></div>';
      console.warn(error);
      throw error;
    }
  }

  state.ready = initialise();
  window.VerapepeCart = {
    ready: state.ready,
    open: openDrawer,
    close: closeDrawer,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    getItems,
    getRawItems: () => state.cart.map(item => ({ ...item })),
    getStorefront: () => state.storefront,
    formatMoney,
    render
  };
})();
