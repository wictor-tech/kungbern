# VERAPEP V5 changes

- Admin-controlled test webshop with cart, checkout and order handling.
- A product becomes orderable only after admin enables publication and sale, assigns at least one allowed country, and enables a variant with EUR price and stock.
- Product visibility, name, descriptions, images, reports, sale status, prices, stock, reviews, trust signals and store settings are read from the admin-controlled data source.
- Open homepage and product pages receive storefront changes through Server-Sent Events and refresh their visible data automatically.
- Soft-delete/archive removes a product from the public storefront immediately.
- Homepage product and category counts update from current published data rather than static text.
- The goal finder supports simultaneous selections and combines matching products using OR/union logic.
- A subtle Samsung S24-inspired liquid atmosphere responds slowly to page scroll, is reduced on mobile and is disabled by `prefers-reduced-motion`.
- Live payment is not enabled by default. Local mock checkout and optional Stripe test mode remain available.
