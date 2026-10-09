# VERAPEP product-image workflow

The storefront supports a primary image URL, alternative text, responsive `srcset`, `sizes`, and a focal point for every product. A generated vial remains the fallback until an approved photograph or 3D render is added in admin.

Recommended master asset:

- 1600 x 1600 pixels
- WebP, transparent or light neutral background
- one consistent camera angle and lighting setup
- product and variant text verified before publishing

Recommended derivatives:

- 400 x 400 for catalogue cards
- 800 x 800 for mobile product pages
- 1200 x 1200 for desktop product pages
- 1600 x 1600 for high-density displays

Example admin values:

```text
Image URL: /assets/products/bpc-157-1200.webp
Responsive srcset: /assets/products/bpc-157-400.webp 400w, /assets/products/bpc-157-800.webp 800w, /assets/products/bpc-157-1200.webp 1200w
Image sizes: (max-width: 700px) 88vw, 520px
Image focal point: 50% 50%
```

Run `npm run audit:images` to create `product-image-audit.csv` and find products that still need approved imagery or alt text.
