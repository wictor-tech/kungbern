# VERAPEP v9 implementation decisions

## Preserved

- VERAPEP brand and the light aqua visual system.
- EUR as the customer-facing currency.
- The 84-product, 170-variant catalogue.
- Multi-goal OR filtering, Ask Vera, saved products, comparison and live admin synchronisation.
- Admin-controlled sale eligibility: a product is never made purchasable only by frontend code.

## Changed in v9

- SQLite is the runtime source of truth.
- One dynamic product template replaces duplicated static product pages.
- Admin uses four public product states.
- Admin accounts use server-enforced roles and scrypt password hashes.
- Important changes are written to an audit history.
- Checkout reserves inventory and uses idempotency controls.
- Product images support responsive sources and approved admin-managed media.

## External dependencies deliberately not fabricated

- No live payment credentials are included.
- No production email account is included.
- No managed hosting or managed database account is included.
- No photorealistic product photography is invented; the generated vial remains a fallback until approved assets are uploaded.

## Excluded scope

The separate product-regulatory/legal redesign previously described as item 12 was not changed in this version.
