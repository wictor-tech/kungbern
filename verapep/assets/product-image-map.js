(() => {
  'use strict';
  const images = Object.freeze({
    'semaglutide-003': '/assets/media/product-vials/semaglutide.png?v=12.2',
    'bpc-157-009': '/assets/media/product-vials/bpc-157.png?v=12.2',
    'cjc-1295-with-dac-032': '/assets/media/product-vials/cjc-1295-with-dac.png?v=12.2',
    'mt-2-melanotan-2-acetate-007': '/assets/media/product-vials/melanotan-2-acetate.png?v=12.2',
    'nad-064': '/assets/media/product-vials/nad.png?v=12.2'
  });

  window.VerapepeProductImages = Object.freeze({
    images,
    get(productOrId) {
      const id = typeof productOrId === 'string' ? productOrId : productOrId?.id;
      return id ? images[id] || '' : '';
    }
  });
})();
