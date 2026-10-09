# VERAPEP V11 — Frontend recreation

V11 is a frontend-only update based on the supplied homepage reference.

## Updated

- Compact assurance bar and navigation matching the supplied layout.
- Responsive liquid hero with the existing animation assets.
- Seven-area goal strip, preserving multi-select and match-all filtering.
- Six preferred featured products in the reference order when no filters are active.
- Dynamic price, stock, ratings, saved products and cart data remain sourced from the existing storefront API.
- Compact quality, European settings and Ask Vera cards.
- Responsive desktop, tablet and mobile layouts.
- Keyboard focus, semantic headings, labels and reduced-motion handling.

## Unchanged

- `server.mjs`
- `database.mjs`
- SQLite schema and data model
- API routes and dynamic product routing
- Admin, inventory, checkout, roles and audit logging

## Run locally

Requires Node.js 22 or later.

```bash
npm start
```

Open the local address printed by the server. On Windows, `start-webshop.cmd` may also be used.
