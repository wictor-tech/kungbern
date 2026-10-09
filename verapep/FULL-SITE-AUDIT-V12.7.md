# VERAPEP v12.7 — Full-site design, image and formatting audit

## Scope
Audited all eight HTML templates and the shared dynamic product route:
- Homepage (`index.html`)
- Product detail (`product.html`, serving all 84 product routes)
- Product Guide (`guide.html`)
- Ask Vera (`support.html`)
- My Pages (`my-pages.html`)
- Checkout (`checkout.html`)
- Order tracking (`order.html`)
- Administration (`admin.html`)

The audit covered local images and SVGs, CSS image references, mapped product images, dynamic glass-vial rendering, internal links/anchors, duplicate IDs, product naming, label line breaks, category/effect colours, shared navigation and cross-page visual consistency.

## Results summary
- HTML templates checked: **8**
- Catalogue products checked: **84**
- Product variants checked: **170**
- Local image/SVG assets integrity-checked: **15**
- HTML image references: **4**
- CSS image references: **13**
- Explicit product-vial image-map references: **5**
- Missing referenced assets: **0**
- Broken static internal links/anchors: **0**
- Duplicate HTML IDs: **0**
- Dynamic/legacy product routes: **84/84 passed regression coverage**
- Glass-vial labels: **84/84 passed layout checks**
- Maximum vial label lines: **3**
- Maximum generated label line length: **21 characters**
- Regression tests: **20/20 passed**

## Image audit
### Homepage hero
`assets/media/bubbles-hero-v12.png` is present, valid and used as the primary homepage hero artwork. The source is 2048 × 948 RGBA and retains transparency.

### Homepage information cards
All three illustrated assets are present and valid SVG files:
- `quality-lab.svg`
- `world-network.svg`
- `vera-guide.svg`

No missing image references were found in the homepage HTML.

### Product vial system
The catalogue no longer requires 84 separate product photos. Products without a dedicated source image intentionally use the shared photorealistic glass-vial renderer. The neutral base files are present and valid:
- `premium-glass-vial-neutral.png`
- `premium-glass-vial-cropped.png`
- `premium-glass-vial.png`

Five dedicated source renders are also present and valid:
- Semaglutide
- BPC-157
- CJC-1295 With DAC
- Melanotan 2
- NAD

The older `product-image-audit.csv` marks products without `content.imageUrl` as `missing_image`. This is a **legacy false positive** under the current renderer and does not represent a broken storefront image.

## Line breaks and text layout
The dynamic vial renderer was checked against all 84 products. It produces deterministic line breaks at word/token boundaries and does not split product names at arbitrary characters. No label exceeded three lines in the current catalogue.

Cross-page heading rules now use balanced wrapping and prevent arbitrary mid-word breaks. Long product names on product detail, guide results and My Pages now use the same presentation-name function as the homepage.

## Colour consistency
All 84 catalogue products resolve to a valid primary colour group through their existing `discoveryGoals` / category data. The same colour system is used by the homepage goal controls and the vial renderer:
- Weight & metabolism — teal
- Skin appearance — pink
- Strength & recovery — green
- Energy — gold
- Sleep & focus — indigo
- Healthy ageing — blue
- Hormonal & specialist — purple

Products with multiple goals use one primary colour and a limited secondary accent rather than an uncontrolled full gradient.

## Catalogue source-name anomalies
Twelve raw catalogue names contain legacy spacing/spelling/punctuation inconsistencies. The source database is intentionally unchanged; the storefront presentation layer normalises these for display where the shared renderer/name helper is used.

1. `cagrilintide5mg+ semaglutide5mg` — joined dose/spacing around `+`
2. `Retatrutide5mg+cagrilintide5mg` — joined dose/spacing around `+`
3. `BPC10mg+TB10mg` — joined dose/spacing around `+`
4. `BPC157-10mg+GHK-CU50mg +TB500 10mg` — mixed spacing
5. `BPC157-10mg+GHK-CU50mg +TB500 10mg+KPV10mg` — mixed spacing
6. `BPC2mg+TB2mg` — joined dose/spacing
7. `BPC5mg+TB5mg` — joined dose/spacing
8. `CJC-1295 Whitout DAC` — probable source spelling error (`Whitout`)
9. `CJC-1295without DAC5mg+IPA 5mg` — missing spaces/joined dose
10. `HGH 191AA(Somatropin）` — mixed-width parenthesis
11. `TB500 (FRAG）` — full-width closing parenthesis
12. `TB500(Thymosin B4 Acetate）` — spacing and full-width parenthesis

These were not written back to SQLite because this release is a frontend/design consistency pass.

## Cross-page design discrepancies found and fixed
### Product Guide
**Before:** older VP icon header, older navigation labels and older trust-bar language.
**Fixed:** current homepage VERAPEP wordmark, homepage navigation, search, My Pages, saved count, cart integration, homepage assurance bar, bubble/glass visual language and current typography.

### Ask Vera
**Before:** older header/navigation and product context displayed by transforming the URL slug instead of using the catalogue name.
**Fixed:** homepage shell and catalogue-based product naming in Vera context.

### My Pages
**Before:** v7/v10 header generation and saved-count state could drift after removing a favourite.
**Fixed:** homepage shell and live saved-count synchronisation.

### Product detail
**Before:** older header generation; the API could replace the trust bar with a different set of signals; product H1 naming did not use the same display-name normalisation as homepage cards/vials.
**Fixed:** homepage shell, fixed assurance bar, matching name formatting and current vial renderer.

### Checkout and order tracking
**Before:** separate legacy announcement bars plus a different header generation created a visually stacked/inconsistent top area.
**Fixed:** homepage shell is now primary; redundant announcement bars are suppressed; typography/cards receive the current glass/bubble treatment.

### Administration
**Before:** older site shell.
**Fixed:** updated to the same brand/navigation framework while retaining the operational/admin content structure.

### Homepage
The v12.7 global QA stylesheet is loaded on the homepage too, so line-breaking, image sizing, heading wrapping and shared visual rules are applied consistently at the source of the design system.

## Link and asset integrity
Static validation found no missing local `src`/`href` targets, no missing anchor targets and no duplicate IDs. Existing automated route regression also validates public product routes, legacy product URLs, guide/support APIs and customer/admin pages.

## Testing
- `python3 tests/static-validation.py` — passed
- `node --test tests/*.test.mjs` — **20/20 passed**
- Backend/database checksums against v12.6 — unchanged for `server.mjs`, `database.mjs` and `data/verapep.sqlite`

## Visual-browser limitation
A new full-page Playwright screenshot pass was attempted, but this execution environment blocks localhost browser navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Therefore this audit combines source-level HTML/CSS/JS inspection, raster/SVG integrity validation, deterministic vial-layout checks and the existing server regression suite. No claim is made that a new pixel-by-pixel browser comparison was completed for every subpage in this environment.
