# VERAPEP v9 test report

## Automated API and integration tests

Command:

```text
npm test
```

Result:

- 14 tests passed
- 0 tests failed

Coverage includes:

- Existing storefront and admin synchronisation
- Multi-goal OR filtering
- Product webshop enable/disable flow
- Price, stock, cart and local checkout
- Hidden and archived product behaviour
- Store settings and reviews
- Protected data paths
- Dynamic product routes and legacy route compatibility
- Role restrictions and admin account creation
- Audit history
- Idempotent order creation
- Inventory reservation and payment settlement
- SQLite persistence after restart

## Static validation

Command:

```text
npm run test:static
```

Result:

- 8 HTML templates validated
- 84 products validated
- 170 variants validated
- Dynamic product routing validated
- Discovery tags validated

## Syntax validation

All JavaScript and MJS source files were checked with `node --check`.

## Known external limitations

- Full live payment cannot be tested without provider credentials.
- Real email delivery cannot be tested without an email provider.
- The product-image audit reports missing approved product photography where only generated vial fallbacks exist.
- Full Playwright browser navigation was not used as evidence for this build; API and static tests are the verified results above.
