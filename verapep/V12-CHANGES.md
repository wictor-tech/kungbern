# VERAPEP V12

Frontend refinement based on the selected Mockup 1.

## Main changes

- Uses the supplied 4K bubble artwork as the real homepage hero asset.
- Simplified navigation: Shop, Product guide, Ask Vera, Science, My pages.
- Larger search and labelled account / wishlist / cart actions.
- Direct assurance strip below the hero CTAs.
- Seven goal areas remain multi-select and use match-all filtering.
- Featured products keep six-column desktop layout.
- Add to cart is always visible on purchasable featured products.
- Existing product, pricing, stock, cart, checkout, admin and API behaviour is preserved.
- Subtle pointer parallax is applied to the bubble artwork and disabled with reduced-motion preferences.

## Backend

No backend files or data files were intentionally changed for V12.

## v12.1 official vial render pass

- Added supplied high-resolution vial renders for Semaglutide, BPC 157, CJC-1295 With DAC, MT-2 (Melanotan 2 Acetate) and NAD.
- Image mapping is frontend-only and keyed by stable catalogue product IDs.
- Featured products now use catalogue/database display names instead of mockup aliases.
- Featured CJC entry uses the With DAC product so the supplied label and catalogue entry stay consistent.
- Official vial renders are reused on catalogue cards, product pages and cart thumbnails.
- Products without a supplied official render continue using the existing generated premium vial fallback.
