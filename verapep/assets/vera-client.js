/* VERAPEP v17 — shared Ask Vera client (support page and the floating panel).
   Shows a pending state, renders answers with links and follow-up suggestions,
   explains errors in plain language and never stores the conversation. */
(() => {
  'use strict';
  const TIMEOUT_MS = 8000;
  const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const safeHref = url => /^(https:\/\/|mailto:|\/(?!\/)|[\w-]+\.html)/i.test(String(url || '')) ? String(url) : null;

  async function ask(question, { productId } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/api/support/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, ...(productId ? { productId } : {}) }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429) return { error: 'rate', message: payload.message || 'You are asking very quickly. Please wait a few seconds and try again.' };
      if (!response.ok) return { error: 'server', message: 'Something went wrong on our side, so I could not answer. Please try again in a moment.' };
      return payload;
    } catch (error) {
      return { error: error.name === 'AbortError' ? 'timeout' : 'network', message: error.name === 'AbortError' ? 'This is taking longer than expected. Please try again.' : 'I could not reach the answer service. Check your connection and try again.' };
    } finally {
      clearTimeout(timer);
    }
  }

  function bubble(log, html, className = '') {
    const node = document.createElement('div');
    node.className = `assistant-message ${className}`.trim();
    node.innerHTML = html;
    log.append(node);
    node.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return node;
  }

  function answerHtml(result) {
    const links = (result.links || []).map(link => ({ ...link, href: safeHref(link.url) })).filter(link => link.href);
    const suggestions = (result.suggestions || []).slice(0, 3);
    return `
      ${result.kind === 'safety' ? '<span class="vera-answer__badge">Not medical advice</span>' : ''}
      <p lang="${result.language === 'sv' ? 'sv' : 'en'}">${escapeHtml(result.answer)}</p>
      ${result.notice ? `<p class="vera-answer__notice">${escapeHtml(result.notice)}</p>` : ''}
      ${result.languageNotice ? `<p class="vera-answer__notice" lang="sv">${escapeHtml(result.languageNotice)}</p>` : ''}
      ${links.length ? `<p class="vera-answer__links">${links.map(link => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)} <span aria-hidden="true">→</span></a>`).join('')}</p>` : ''}
      ${suggestions.length ? `<div class="vera-answer__suggestions" role="group" aria-label="Related questions">${suggestions.map(text => `<button type="button" data-vera-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>` : ''}`;
  }

  /* Wires a form + log. options: { form, input, log, submit, productId, onAnswer } */
  function attach({ form, input, log, submit, productId, onAnswer }) {
    if (!form || !input || !log) return;
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    let pending = false;
    let lastQuestion = '';

    async function send(question) {
      const text = String(question || '').trim();
      if (!text || pending) return;
      pending = true;
      lastQuestion = text;
      form.setAttribute('aria-busy', 'true');
      if (submit) submit.disabled = true;
      bubble(log, escapeHtml(text), 'assistant-message--user');
      const waiting = bubble(log, '<span class="vera-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Vera is looking up an answer</span>', 'assistant-message--pending is-pending');
      const result = await ask(text, { productId });
      waiting.remove();
      if (result.error) {
        bubble(log, `<p>${escapeHtml(result.message)}</p>${result.error === 'rate' ? '' : '<p class="vera-answer__links"><button type="button" class="vera-retry" data-vera-retry>Try again</button></p>'}`, 'assistant-message--error');
      } else {
        bubble(log, answerHtml(result), `vera-answer vera-answer--${escapeHtml(result.kind || 'answer')}`);
        onAnswer?.(result);
      }
      pending = false;
      form.removeAttribute('aria-busy');
      if (submit) submit.disabled = false;
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value;
      input.value = '';
      send(text);
      input.focus({ preventScroll: true });
    });
    // Enter sends, Shift+Enter adds a line (textarea on the support page).
    if (input.tagName === 'TEXTAREA') {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
      });
    }
    log.addEventListener('click', event => {
      const suggestion = event.target.closest('[data-vera-suggestion]');
      if (suggestion) send(suggestion.dataset.veraSuggestion);
      if (event.target.closest('[data-vera-retry]')) send(lastQuestion);
    });
    return { send };
  }

  window.VeraClient = { ask, attach };
})();
