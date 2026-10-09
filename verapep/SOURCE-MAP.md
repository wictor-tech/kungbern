# VERAPEP v9 source map

## Catalogue source

- 84 product records and 170 variants remain based on the existing VERAPEP catalogue data.
- Catalogue numbers, specifications and source pricing columns remain available for audit.
- Customer-facing EUR prices, stock and sale eligibility remain controlled by admin.

## Storefront

- `index.html`: homepage, guided multi-goal filtering and catalogue.
- `product.html`: the single dynamic product template for every product.
- `assets/app.js`: catalogue discovery, cards, save and compare behaviour.
- `assets/product-commerce.js`: dynamic product page and variant actions.
- `assets/cart.js`, `assets/checkout.js`, `assets/order.js`: cart, checkout and order tracking.
- `assets/v7.css`, `assets/v8.css`, `assets/v8-1.css`, `assets/v9.css`: layered visual and hardening styles.

## Server and data

- `server.mjs`: HTTP/API server, role checks, storefront events, commerce and dynamic routing.
- `database.mjs`: SQLite documents, admin users, audit history, idempotency and payment event storage.
- `data/*.json`: first-run seed and legacy-import source files.
- `data/verapep.sqlite`: runtime database created on first start and intentionally excluded from the ZIP.

## Administration

- `admin.html` and `assets/admin.js`: products, inventory, orders, returns, reviews, guide, settings, audit and admin team.

## Tests

- `tests/api.test.mjs`: existing storefront/admin regression coverage.
- `tests/v9.test.mjs`: SQLite, dynamic routing, roles, audit, idempotency and persistence.
- `tests/static-validation.py`: templates, links, catalogue and discovery validation.
