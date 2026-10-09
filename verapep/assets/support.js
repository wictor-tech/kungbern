/* Ask Vera page (v17): shared Vera client, question shortcuts and product context. */
(() => {
  'use strict';
  const form = document.getElementById('assistant-form');
  const log = document.getElementById('assistant-log');
  const question = document.getElementById('assistant-question');
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const productId = new URLSearchParams(location.search).get('product');
  const chat = window.VeraClient?.attach({ form, input: question, log, submit: form?.querySelector('button[type="submit"]'), productId });

  document.querySelector('.assistant-shortcuts')?.addEventListener('click', event => {
    const button = event.target.closest('[data-vera-ask]');
    if (button) { chat?.send(button.dataset.veraAsk); question?.focus({ preventScroll: true }); }
  });

  if (productId && log) {
    question.placeholder = 'Ask about this product’s published information';
    fetch('/api/storefront').then(response => response.ok ? response.json() : null).then(payload => {
      const product = (payload?.products || []).find(item => item.id === productId);
      if (!product) return; // hidden or unknown products are not mentioned
      const label = window.VerapepeVialRenderer?.displayName(product) || product.content?.displayName || product.name;
      log.insertAdjacentHTML('beforeend', `<div class="assistant-message">You opened Vera from <strong>${escape(label)}</strong>. Ask about its published information, for example “Is there a lab report?”, or <a href="/product/${encodeURIComponent(productId)}">return to the product page</a>.</div>`);
    }).catch(() => {});
  }
})();
