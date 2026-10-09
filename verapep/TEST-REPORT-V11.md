# VERAPEP V11.1 QA report

Test date: 2026-07-23

## Result

Passed after three frontend fixes.

## Fixed during QA

1. Added the missing `theme-v11` body class so the V11 stylesheet is actually active in the distributed homepage.
2. Added the missing `assets/v11-ui.js` script reference so the header search and featured-product rail interactions are enabled.
3. Corrected two links in checkout and order pages from the missing `#categories` anchor to the existing `#goals` section.

## Automated coverage

- 20 Node regression tests passed.
- Static validation passed for 8 HTML templates.
- All 84 public products were checked.
- All 170 variants were checked for unique IDs and product association.
- Every product was served successfully through both routes:
  - `/product/<product-id>`
  - `/shop/<product-id>.html`
- Admin login succeeded with the local test owner account.
- Admin dashboard returned all 84 products and 170 inventory rows.
- Admin product editing was saved, verified through the public storefront API and restored in an isolated temporary database.
- Inventory, settings, roles, audit log, review moderation, order creation, mock payment and SQLite persistence are covered by the existing regression suite.
- Product guide and Ask Vera API responses were verified.
- All local JavaScript and module files passed syntax checks.
- All local HTML links, anchors and referenced assets passed validation.
- Backend and core data checksums remain unchanged.

## Browser automation limitation

The execution environment blocks automated browsers from opening local network addresses (`ERR_BLOCKED_BY_ADMINISTRATOR`). For that reason, final click-by-click visual automation could not run here. HTTP routing, APIs, data mutations, HTML structure, JavaScript syntax, asset references and regression behavior were tested instead.
