/* VERAPEP V11 homepage interactions. Existing API and commerce modules remain unchanged. */
(() => {
  'use strict';

  const headerSearch = document.getElementById('header-product-search');
  const catalogueSearch = document.getElementById('catalogue-search');
  const catalogue = document.getElementById('catalogue');
  const featuredGrid = document.getElementById('featured-product-grid');
  const featuredNext = document.getElementById('featured-next');

  if (headerSearch && catalogueSearch) {
    headerSearch.addEventListener('search', () => {
      catalogueSearch.value = headerSearch.value;
      catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
      if (headerSearch.value.trim()) catalogue?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    headerSearch.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      catalogueSearch.value = headerSearch.value;
      catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
      catalogue?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  featuredNext?.addEventListener('click', () => {
    if (!featuredGrid) return;
    featuredGrid.scrollBy({ left: Math.max(260, featuredGrid.clientWidth * 0.75), behavior: 'smooth' });
  });

  const updateFloatingVera = () => document.body.classList.toggle('is-past-hero', scrollY > 520);
  addEventListener('scroll', updateFloatingVera, { passive: true });
  updateFloatingVera();

  const updateFeaturedArrow = () => {
    if (!featuredGrid || !featuredNext) return;
    const scrollable = featuredGrid.scrollWidth > featuredGrid.clientWidth + 4;
    featuredNext.hidden = !scrollable && matchMedia('(max-width: 720px)').matches;
  };
  addEventListener('resize', updateFeaturedArrow, { passive: true });
  requestAnimationFrame(updateFeaturedArrow);
})();
