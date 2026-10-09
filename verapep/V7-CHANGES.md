# VERAPEP V7 — Frontend visual implementation

V7 keeps the V6.1 backend, admin portal, live synchronisation, product database, cart, checkout guardrails, saved products, comparison and multi-goal filtering unchanged.

## Frontend changes

- Rebuilt the public header and navigation in the lighter VERAPEP visual language.
- Moved the storefront assurance strip above the header.
- Added a usable header product search that forwards to the existing catalogue filter.
- Rebuilt the homepage hero with inline SVG liquid forms, layered highlights, bubbles, sparkle details and scroll-reactive movement.
- Added gentle independent motion to fluid layers and bubbles, with `prefers-reduced-motion` support.
- Restyled the multi-goal finder as a compact premium category rail while preserving OR-based multi-selection.
- Restyled the product catalogue and cards to match the supplied visual direction.
- Replaced basic CSS vial drawings with detailed inline SVG vial renderings using glass, metal, liquid, label and shadow layers.
- Real product image URLs configured in admin still override generated vial visuals.
- Added responsive desktop, tablet and mobile layouts.

## Technical scope

No backend endpoint, admin form, data schema, live-update mechanism, pricing rule, stock rule, country rule, checkout rule or authentication behaviour was changed.
