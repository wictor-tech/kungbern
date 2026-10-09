/* VERAPEP V7 frontend interactions. No backend or commerce behaviour is changed here. */
(() => {
  'use strict';
  const headerSearch = document.getElementById('header-product-search');
  const catalogueSearch = document.getElementById('catalogue-search');
  const catalogue = document.getElementById('catalogue');
  const hero = document.getElementById('top');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (headerSearch && catalogueSearch) {
    const submitSearch = () => {
      catalogueSearch.value = headerSearch.value;
      catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
      catalogue?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };
    headerSearch.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitSearch();
      }
    });
    headerSearch.addEventListener('search', submitSearch);
  }

  if (hero && !reduceMotion) {
    let pointerFrame = 0;
    hero.addEventListener('pointermove', event => {
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = (event.clientX - rect.left) / Math.max(rect.width, 1) - .5;
        const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - .5;
        hero.style.setProperty('--v7-pointer-x', `${(x * 12).toFixed(2)}px`);
        hero.style.setProperty('--v7-pointer-y', `${(y * 9).toFixed(2)}px`);
        const svg = hero.querySelector('.hero-fluid-svg');
        if (svg) svg.style.translate = `var(--v7-pointer-x) var(--v7-pointer-y)`;
        pointerFrame = 0;
      });
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      const svg = hero.querySelector('.hero-fluid-svg');
      if (svg) svg.style.translate = '0 0';
    });
  }
})();
