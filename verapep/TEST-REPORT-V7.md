# VERAPEP V7 test report

## Passed

- Node syntax validation for `assets/app.js` and `assets/v7-ui.js`.
- Static validation: 91 HTML pages, 84 products, 170 variants and complete discovery tags.
- Automated API and admin-synchronisation suite: 8 tests passed, 0 failed.
- Multi-goal OR matching retained.
- Admin-controlled product visibility and archive behaviour retained.
- Admin price, stock and webshop eligibility rules retained.
- Cart quote and local sandbox checkout retained.
- Product image URL override retained.
- Reduced-motion CSS included.

## Environment limitation

Automated Chromium navigation to localhost is blocked in the hosted execution environment with `ERR_BLOCKED_BY_ADMINISTRATOR`. The local Playwright test expectation was updated for the new hero heading and remains available through `npm run test:e2e` on a local machine.
