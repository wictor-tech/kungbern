/* Shared navigation, compact header and subtle reveal behaviour. */
(() => {
  'use strict';
  const menuButton = document.getElementById('menu-button');
  const nav = document.getElementById('site-nav');
  const header = document.getElementById('site-header') || document.querySelector('.site-header');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const expanded = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('is-open', !expanded);
      document.body.classList.toggle('menu-open', !expanded);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) {
        nav.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('menu-open');
      }
    });
  }
  if (header) addEventListener('scroll', () => header.classList.toggle('is-compact', scrollY > 40), { passive: true });
  const trustItems = [...document.querySelectorAll('.trust-bar__inner span')];
  if (trustItems.length) {
    trustItems.forEach((item, index) => item.classList.toggle('is-active', index === 0));
    if (matchMedia('(max-width:780px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let activeTrust = 0;
      setInterval(() => {
        trustItems[activeTrust]?.classList.remove('is-active');
        activeTrust = (activeTrust + 1) % trustItems.length;
        trustItems[activeTrust]?.classList.add('is-active');
      }, 5000);
    }
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .1 });
    document.querySelectorAll('.reveal-section').forEach(section => observer.observe(section));
  }
})();

/* V12.7 shared header behaviour for non-homepage pages. */
(() => {
  'use strict';
  const search = document.getElementById('header-product-search');
  if (search && !document.getElementById('catalogue-search')) {
    const go = () => {
      const q = search.value.trim();
      location.href = `/index.html${q ? `?search=${encodeURIComponent(q)}` : ''}#catalogue`;
    };
    search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); go(); } });
    search.addEventListener('search', () => { if (search.value.trim()) go(); });
  }
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('vp-saved-products') || '[]'); } catch {}
  document.querySelectorAll('[data-saved-count]').forEach(node => node.textContent = String(Array.isArray(saved) ? saved.length : 0));
})();
