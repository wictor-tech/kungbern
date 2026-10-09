# VERAPEP v9 changes

## Architecture

- Replaced runtime JSON persistence with SQLite using Node's built-in `node:sqlite` module.
- Added atomic multi-document writes for order and inventory transitions.
- Added a migration command for importing v8/v8.1 JSON data.
- Consolidated all product pages into one dynamic template.
- Preserved legacy `/shop/<id>.html` URLs through server-side compatibility routing.

## Admin

- Added Owner, Admin, Editor and Support roles with server-side permission checks.
- Added Admin team management.
- Added an audit log with actor, action, entity, before/after data and timestamp.
- Added four clear public product states.
- Added readiness feedback before a product can be sold.
- Added responsive product image fields and search aliases.

## Commerce

- Added 30-minute inventory reservations.
- Added idempotent order creation.
- Added idempotent Stripe webhook event handling.
- Added stock release after cancellation/expiry and stock restoration after refund.
- Corrected checkout display to use the server-controlled EUR retail price.
- Retained local/mock checkout and optional Stripe test mode.

## Storefront

- Improved search synonyms and multi-goal relevance explanations.
- Added responsive image attributes, lazy loading and generated vial fallback.
- Improved mobile checkout, focus visibility, reduced motion and rendering performance.
- Kept live Server-Sent Events synchronisation between admin and open storefront pages.

## Intentionally unchanged

- The separate product-regulatory/legal policy work described as item 12 was not redesigned.
- No live payment provider, production email provider or managed hosting credentials are bundled.
- Photorealistic product images are not invented; admin-managed approved images replace the fallback vial automatically.
