# VERAPEP V8 test report

## Passed

- Node syntax validation for server and all JavaScript files.
- Static validation of 91 HTML pages.
- Catalogue integrity: 84 products and 170 variants.
- Discovery-tag completeness.
- Nine automated API assertions, including:
  - multi-goal OR filtering;
  - one-click product enable and disable;
  - admin-to-storefront synchronisation;
  - cart quote using admin price and stock;
  - local sandbox order and mock payment;
  - hidden and archived product removal;
  - settings and moderated-review synchronisation;
  - protection of private data files.
- Liquid WebM and MP4 assets return HTTP 200 with correct MIME types.
- ZIP integrity validation.

## Browser automation limitation

The hosted Chromium environment blocks navigation to local loopback addresses with `ERR_BLOCKED_BY_ADMINISTRATOR`. The included Playwright test remains available for local execution with `npm run test:e2e`.
