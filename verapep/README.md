# VERAPEP Information Platform v16

VERAPEP V14.1 is the production-readiness and operational-hardening release built on top of the V13 mobile-conversion storefront. The friend-test experience remains available, while live commerce is now protected by explicit infrastructure, legal, product, payment and security gates.

## Current status

- Friend/staging testing: **ready**.
- Live commerce: **blocked by default** until `/api/ready` reports no blockers.
- Catalogue: 84 product families / 170 variants.
- Live-enabled products in the packaged build: **0**.

Read these first:

- `V16-IMPROVEMENT-REPORT.md` (latest release notes)
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
```

The backup script checkpoints WAL, creates a consistent copy and runs an SQLite integrity check.

## Tests

```bash
npm test
npm run test:static
npm run test:e2e
```

The source/static regression suite passes in the packaged build. Browser E2E must also be run against a deployed staging URL before live launch.

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
