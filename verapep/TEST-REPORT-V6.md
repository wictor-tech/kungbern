# VERAPEP V6 test report

## Automated API tests

- 8 tests passed
- 0 tests failed
- Multi-goal OR filtering passed
- Admin-controlled checkout eligibility passed
- Cart quote and local checkout validation passed
- Hidden and archived product removal passed
- Store settings and review synchronisation passed
- Protected data paths passed

## Static validation

- 91 HTML pages validated
- 84 products retained
- 170 variants retained
- Discovery tags complete
- Required homepage IDs present
- JavaScript syntax validation passed

## Visual validation

The frontend was rendered in Chromium through an in-memory preview harness because direct localhost navigation is restricted in the hosted environment.

- Desktop hero and guided finder inspected
- Desktop six-column catalogue inspected
- Mobile hero inspected at 390 × 844
- Mobile document width matched viewport width; no horizontal overflow detected

Preview images are included in `previews/`.
