/* VERAPEP legal information pages (privacy, terms, shipping & returns).
   Fills company details and store settings from the existing APIs, so the
   pages always show the configured values and never hard-coded legal facts. */
(() => {
  'use strict';
  const text = (value, fallback = 'Pending') => {
    const clean = String(value ?? '').trim();
    return !clean || /^pending$/i.test(clean) ? fallback : clean;
  };
  const el = (tag, content, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  fetch('/api/legal', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then(legal => {
      document.querySelectorAll('[data-legal]').forEach(node => {
        const key = node.dataset.legal;
        const value = text(legal[key]);
        node.textContent = value;
        node.classList.toggle('is-pending', value === 'Pending' || /pending/i.test(value));
      });
      document.querySelectorAll('[data-legal-mail]').forEach(node => {
        const email = text(legal[node.dataset.legalMail], '');
        if (!email) return;
        node.textContent = email;
        node.href = `mailto:${email}`;
      });
    })
    .catch(() => {
      document.querySelectorAll('[data-legal]').forEach(node => { node.textContent = 'Unavailable — please contact support'; });
    });

  const needsStorefront = document.querySelector('[data-storefront]');
  if (!needsStorefront) return;
  fetch('/api/storefront', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then(storefront => {
      const config = storefront.config || {};
      const methods = document.querySelector('[data-storefront="shippingMethods"]');
      if (methods) {
        methods.replaceChildren();
        (config.shippingMethods || []).forEach(method => {
          const card = el('div', undefined, 'legal-method');
          card.append(el('strong', method.name));
          if (method.estimatedDays) card.append(el('span', `Estimated delivery: ${method.estimatedDays}`, 'legal-method__meta'));
          if (method.description) card.append(el('p', method.description));
          methods.append(card);
        });
        if (!methods.children.length) methods.append(el('p', 'No delivery method has been configured yet.'));
      }
      const countries = config.allowedCountries || [];
      const countList = document.querySelector('[data-storefront="countries"]');
      if (countList) countList.replaceChildren(...countries.map(country => el('li', country.name)));
      const count = document.querySelector('[data-storefront="countryCount"]');
      if (count) count.textContent = countries.length
        ? `Delivery is configured for ${countries.length} countries. Availability is confirmed per product before checkout.`
        : 'No delivery countries have been configured yet.';
      const available = document.querySelector('[data-storefront="availableCount"]');
      if (available) {
        const n = (storefront.products || []).filter(product => product.commerce?.checkoutEnabled && product.variants?.some(variant => variant.checkoutEnabled)).length;
        available.textContent = n
          ? `${n} product${n === 1 ? ' is' : 's are'} currently enabled in the preview checkout.`
          : 'No products are currently available to order.';
      }
    })
    .catch(() => {
      const methods = document.querySelector('[data-storefront="shippingMethods"]');
      if (methods) methods.replaceChildren(el('p', 'Delivery settings could not be loaded. Please try again or contact support.'));
    });
})();
