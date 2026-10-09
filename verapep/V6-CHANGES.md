# VERAPEP V6 frontend refresh

V6 keeps the V5 backend, admin API, live storefront events, product database, cart, checkout, reviews, saved products and multi-goal filtering. The main change is the public storefront design.

## Frontend changes

- Light aqua VERAPEP header and trust bar inspired by the approved visual reference.
- New hero with visible liquid-glass forms, bubbles and subtle scroll parallax.
- Seven compact goal cards with multi-select retained.
- Cleaner refinement and priority panels.
- Compact popular-category shortcuts.
- Six-column desktop product catalogue with responsive four- and two-column layouts.
- Stylised vial visuals generated from catalogue data when no admin image is supplied.
- Admin product images automatically replace the generated vial visual.
- Compact ratings, price/status and save/compare/cart actions.
- Teal storefront palette carried into product pages.
- Mobile layout tested without horizontal overflow.
- Cart script restored on the homepage so admin-enabled variants can be added directly from product cards.

## Backend retained

No server routes, admin endpoints or persistent data formats were replaced. Existing live synchronisation remains active through `/api/storefront/events`.

Admin changes to visibility, names, images, pricing, inventory, checkout eligibility, ratings, trust signals and product information continue to update the public storefront.
