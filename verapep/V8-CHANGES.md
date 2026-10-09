# VERAPEP V8 changes

## Liquid hero frontend

- Replaced the illustrated SVG-only hero background with a layered liquid-media system.
- Added a lightweight looping WebM video with MP4 fallback.
- Added a high-resolution WebP poster and a mobile-specific crop.
- Added a subtle SVG displacement layer, animated glass bubbles, caustic highlights, scroll parallax and pointer parallax.
- Motion pauses when the hero or browser tab is not visible.
- Video and animated distortion are disabled when the user prefers reduced motion.
- Backend, product catalogue, admin, saved products, cart and checkout remain unchanged.

## Webshop activation fix

Products were not purchasable because every product initially required several independent conditions:

1. Sandbox checkout mode.
2. Product visible and not archived.
3. Product approved for webshop sale and no longer information-only.
4. At least one allowed country.
5. At least one variant with a valid EUR price, stock and variant sale enabled.

V8 adds a single **Enable for local webshop** action in the product editor. It applies the local sandbox settings, uses the configured European countries, and enables every variant that already has both price and stock. A readiness panel shows exactly which condition is still missing.

This action does not enable live payments or live commerce.
