/* VERAPEP V8 liquid background motion. Commerce and backend logic remain separate. */
(() => {
  'use strict';
  const hero = document.getElementById('top');
  if (!hero) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;


  const video = hero.querySelector('.hero-liquid-video');
  if (video) {
    const syncPlayback = () => {
      const rect = hero.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight && !document.hidden;
      if (visible) video.play().catch(() => {});
      else video.pause();
    };
    document.addEventListener('visibilitychange', syncPlayback);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(syncPlayback, { threshold: 0.02 });
      observer.observe(hero);
    }
    video.addEventListener('error', () => hero.classList.add('video-fallback'));
  }

  let scrollFrame = 0;
  const updateScroll = () => {
    const rect = hero.getBoundingClientRect();
    const visibleProgress = Math.max(-1, Math.min(1, -rect.top / Math.max(rect.height, 1)));
    hero.style.setProperty('--liquid-scroll-y', `${(visibleProgress * 24).toFixed(2)}px`);
    scrollFrame = 0;
  };
  // Only animate on scroll when the current design actually applies the scroll offset.
  const media = hero.querySelector('.hero-liquid-media');
  const scrollDriven = media && getComputedStyle(media).transform !== 'none';
  if (scrollDriven) window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true });

  let pointerFrame = 0;
  hero.addEventListener('pointermove', event => {
    if (pointerFrame || event.pointerType === 'touch') return;
    pointerFrame = requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - .5) * 10;
      const y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - .5) * 7;
      hero.style.setProperty('--liquid-pointer-x', `${x.toFixed(2)}px`);
      hero.style.setProperty('--liquid-pointer-y', `${y.toFixed(2)}px`);
      pointerFrame = 0;
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--liquid-pointer-x', '0px');
    hero.style.setProperty('--liquid-pointer-y', '0px');
  });
  updateScroll();
})();
