# VERAPEP Information Platform v17

VERAPEP V14.1 is the production-readiness and operational-hardening release built on top of the V13 mobile-conversion storefront. The friend-test experience remains available, while live commerce is now protected by explicit infrastructure, legal, product, payment and security gates.

## Current status

- **Not approved for launch.** See `V17-LAUNCH-READINESS.md` for blocking legal and security items.
- Live commerce: **blocked by default** until `/api/ready` reports no blockers.
- Catalogue: 84 product families / 170 variants. **No product has a compliance approval.** The publication gate lists 40 in preview (44 high-risk products hidden) and 0 in production until products are approved in Admin → Compliance review.
- Orderable products in the packaged build: **0** (sale of any kind requires an owner-recorded approval with scope "sale").

Read these first:

- `V17-REPORT.md` (v17 overview, test results, links to all reports)
- `V17-LAUNCH-READINESS.md` (what blocks launch, grouped by owner)
- `V16-IMPROVEMENT-REPORT.md`
- `PRODUCTION-CHECKLIST-V14.md`
- `V14.1-OPERATIONAL-HARDENING.md`
- `SECURITY.md`

Not included in any delivered package or in the GitHub history (listed in the v14.1 `FILE-MANIFEST.txt` but never shipped): `PRODUCTION-READINESS-AUDIT-V14.md`, `V14-PRODUCTION-READINESS.md`, `POSTGRES-MIGRATION-PLAN-V14.md`. Obtain them from the original author if they are needed.

## Requirements

- Node.js 22 or later.

## Run locally / preview

```bash
npm install
npm start
```

Open:

- Storefront: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`
- Checkout: `http://localhost:3000/checkout.html`
- Health: `http://localhost:3000/api/health`
- Production readiness: `http://localhost:3000/api/ready`

Local preview defaults are documented in `.env.example`. Production refuses the packaged default password and requires explicit production configuration.

## Data

Preview/staging can use SQLite. The first runtime start creates the SQLite source of truth under `DATA_DIR` (or the local data directory in preview).

For production, V14.1 deliberately blocks SQLite by default and provides:

- `sql/postgres-schema.sql`

A managed PostgreSQL runtime migration still requires an actual database instance and cutover testing.

## Backup while using SQLite

```bash
npm run backup:sqlite
npm run restore:sqlite -- <backup.sqlite>          # validates only
npm run restore:sqlite -- <backup.sqlite> --yes    # stop the server first; saves the current DB before replacing it
```

The backup script checkpoints WAL, creates a consistent copy and runs an SQLite integrity check. The restore script validates integrity and schema, keeps a `pre-restore-*.sqlite` copy and removes stale WAL files.

## Ask Vera knowledge updates

Answers are seeded into the database on first start only. Existing databases are updated with a versioned migration that never runs automatically:

```bash
npm run migrate:kb                  # dry run: exactly what would change
npm run migrate:kb -- --apply       # snapshot + full DB backup, then apply (or use Admin → Guide & AI)
npm run migrate:kb -- --rollback <support-kb-….json>
```

Admin edits, locked answers and deliberately removed answers are preserved. See `V17-ASK-VERA.md`.

## Compliance inventory

```bash
npm run inventory:compliance        # writes docs/v17/PRODUCT-COMPLIANCE-INVENTORY.{md,csv}
```

## Tests

```bash
npm test               # unit/API (node:test)
npm run test:static
npm run test:e2e       # browser journeys, axe accessibility
npm run test:personas  # simulated persona navigation (not real user research)
```

The source/static regression suite passes in the packaged build.

`npm run test:e2e` starts the server on a temporary copy of `data/` and drives Chromium (requires Python 3 with `pip install playwright==1.56.0` and `python3 -m playwright install chromium`). It waits for application state instead of network idleness, so the open Server-Sent Events stream does not stall it. It covers navigation, search, catalogue, every publicly listed product page, the publication gate, Ask Vera, mobile search, compliance admin, cart states, mobile menu, forms, legal pages, broken links, accessibility (axe-core, vendored under `tests/vendor`) and administration. `E2E_ONLY=search,legal` runs selected tests.

## CSS

Stylesheets are edited in `assets/*.css` and served as three ordered bundles (`bundle-storefront.css`, `bundle-pages.css`, `bundle-admin.css`). After editing a stylesheet run `npm run build:css`; `npm test` fails if a bundle is out of date.

## Payments

Preview/mock payment remains available only outside live mode. V14.1 contains guarded Stripe test/live Checkout support, signed webhook processing, inventory settlement/release and provider-side refund handling. Real live credentials are not bundled and must never be committed.

## Product safety boundary

A normal admin content/status edit is not enough to make a product live. Live commerce requires an owner-recorded review reference, explicitly approved destination countries, complete mandatory content, approved variants, stock, server-side price, production payment configuration and the live variant allowlist.

Do not bulk-enable the catalogue.

## V14.1 operational hardening

V14.1 adds application-side work that does not require external provider credentials:

- per-admin authenticator enrollment with one-time recovery codes
- production readiness checks for per-user MFA and MFA secret encryption
- operational order queues in admin
- read-only customer privacy export tooling
- guarded retry tooling for failed transactional-email webhook deliveries
- PostgreSQL target schema updated for per-user MFA fields

These changes do not remove the remaining external launch blockers: managed PostgreSQL provisioning/runtime cutover, real Stripe/email/monitoring accounts, final tax/shipping configuration, legal/company data and product-by-product approval.
