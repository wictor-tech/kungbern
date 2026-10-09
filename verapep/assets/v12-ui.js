(() => {
  'use strict';
  const hero = document.querySelector('.hero--v11');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let frame = 0;
  hero.addEventListener('pointermove', event => {
    if (innerWidth < 781) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - .5) * -10;
      const y = ((event.clientY - rect.top) / rect.height - .5) * -8;
      hero.style.setProperty('--v12-bubble-x', `${x.toFixed(2)}px`);
      hero.style.setProperty('--v12-bubble-y', `${y.toFixed(2)}px`);
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--v12-bubble-x', '0px');
    hero.style.setProperty('--v12-bubble-y', '0px');
  });
})();
