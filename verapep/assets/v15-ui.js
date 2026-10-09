/* VERAPEP V15 — shared navigation and interaction refinements.
   Progressive enhancement only: every page works without this file. */
(() => {
  'use strict';
  const body = document.body;
  const header = document.getElementById('site-header');
  const nav = document.getElementById('site-nav');
  const menuButton = document.getElementById('menu-button');
  const mobileQuery = matchMedia('(max-width: 900px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* Mobile menu sheet starts exactly under the header (trust bar height varies). */
  const syncHeaderOffset = () => {
    if (!header) return;
    const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
    document.documentElement.style.setProperty('--vp-header-bottom', `${bottom}px`);
  };
  syncHeaderOffset();
  addEventListener('resize', syncHeaderOffset, { passive: true });
  addEventListener('scroll', () => { if (nav?.classList.contains('is-open')) syncHeaderOffset(); }, { passive: true });

  const isMenuOpen = () => menuButton?.getAttribute('aria-expanded') === 'true';
  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!menuButton || !nav || !isMenuOpen()) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('is-open');
    body.classList.remove('menu-open');
    if (restoreFocus) menuButton.focus();
  };
  if (menuButton && nav) {
    // Existing scripts toggle the menu; this only keeps labels, offset and focus in sync.
    menuButton.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const open = isMenuOpen();
        menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        if (open) {
          syncHeaderOffset();
          body.classList.add('menu-open');
          if (mobileQuery.matches) nav.querySelector('a, input, button')?.focus({ preventScroll: true });
        } else {
          body.classList.remove('menu-open');
        }
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isMenuOpen()) closeMenu({ restoreFocus: true });
      if (event.key === 'Tab' && isMenuOpen() && mobileQuery.matches) {
        const focusable = [menuButton, ...nav.querySelectorAll('a[href], button:not([disabled]), input')].filter(el => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    mobileQuery.addEventListener?.('change', event => { if (!event.matches) closeMenu(); });
    nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  }

  /* Hide "0" count badges; animate when a count changes. */
  const counters = document.querySelectorAll('#saved-count, [data-saved-count], #cart-header-count, #mobile-cart-count');
  const syncCounter = node => {
    const empty = !Number.parseInt(node.textContent, 10);
    node.dataset.empty = String(empty);
  };
  const watchCounters = root => {
    root.querySelectorAll('#saved-count, [data-saved-count], #cart-header-count, #mobile-cart-count').forEach(node => {
      if (node.dataset.vpWatched) return;
      node.dataset.vpWatched = '1';
      syncCounter(node);
      new MutationObserver(() => syncCounter(node)).observe(node, { childList: true, characterData: true, subtree: true });
    });
  };
  watchCounters(document);
  if (!counters.length || !document.getElementById('cart-header-count')) {
    // cart.js injects its buttons after load.
    addEventListener('load', () => watchCounters(document), { once: true });
  }

  /* Active section in the primary navigation on the home page. */
  const sectionLinks = nav ? [...nav.querySelectorAll('.nav__links--v11 a[href*="#"]')] : [];
  const onHome = body.classList.contains('home-page');
  if (onHome && sectionLinks.length && 'IntersectionObserver' in window) {
    const targets = sectionLinks
      .map(link => ({ link, section: document.getElementById(link.hash.slice(1)) }))
      .filter(item => item.section);
    const visible = new Map();
    const update = () => {
      let best = null;
      visible.forEach((ratio, section) => { if (!best || ratio > visible.get(best)) best = section; });
      targets.forEach(({ link, section }) => {
        if (section === best) link.setAttribute('aria-current', 'location');
        else if (link.getAttribute('aria-current') === 'location') link.removeAttribute('aria-current');
      });
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visible.set(entry.target, entry.intersectionRatio);
        else visible.delete(entry.target);
      });
      update();
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, .25, .5, 1] });
    targets.forEach(({ section }) => io.observe(section));
  }

  /* My pages icon reflects the current page too. */
  if (/\/my-pages\.html$/.test(location.pathname)) {
    document.querySelector('.header-account-link')?.setAttribute('aria-current', 'page');
  }

  /* "/" focuses product search from anywhere (desktop). */
  const search = document.getElementById('header-product-search');
  if (search) {
    document.addEventListener('keydown', event => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement?.isContentEditable) return;
      if (mobileQuery.matches) return;
      event.preventDefault();
      search.focus();
    });
  }

  /* Back to top: smooth (unless reduced motion) and moves focus to the page start. */
  document.querySelectorAll('[data-back-to-top]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      const main = document.getElementById('main');
      if (main) { if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    });
  });

  /* Reveal safety net: earlier observers used threshold .1, which tall sections
     (the full catalogue) may never reach on short screens. */
  const reveals = document.querySelectorAll('.reveal-section:not(.is-visible)');
  if (!('IntersectionObserver' in window)) {
    body.classList.add('vp-reveal-off');
  } else if (reveals.length) {
    const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }), { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(section => revealObserver.observe(section));
    // Deep links (e.g. /#catalogue) must never land on an invisible section.
    const revealTarget = () => {
      const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      target?.closest('.reveal-section')?.classList.add('is-visible');
    };
    revealTarget();
    addEventListener('hashchange', revealTarget);
  }
})();
