# VERAPEP V14.1 — Security and commerce boundaries

## Safe defaults

The packaged build is a preview/sandbox by default. It does not silently become a live shop when deployed.

- All 84 products are live-disabled in the packaged data.
- Live commerce requires `APP_ENV=production`, explicit live-commerce flags/acknowledgement, live Stripe configuration and a variant allowlist.
- Production readiness is exposed by `/api/ready` and remains blocked while critical requirements are missing.
- Mock payment is unavailable in live mode.

## Application controls

- Admin passwords are scrypt-hashed.
- Owner/Admin/Editor/Support permissions are enforced server-side.
- Important admin/order/payment actions are audited.
- Product, price, stock, destination and checkout eligibility are revalidated server-side.
- Inventory is reserved before payment and release/settlement is idempotent.
- Stripe webhook signatures are verified.
- Stripe event IDs/idempotency controls prevent duplicate business processing.
- Provider-side refund must succeed before a live local refund/restock is finalized.
- Customer/order data, database files and local outbox data are blocked from static web access.
- Admin session cookies are HttpOnly/SameSite=Strict and Secure when HTTPS is used.
- Per-user TOTP MFA enrollment is supported for every admin account; production readiness requires enabled owner/admin accounts to have MFA.
- TOTP seeds can be encrypted at rest with `MFA_ENCRYPTION_KEY`; production readiness requires a strong encryption secret.
- One-time recovery codes are stored only as hashes and are consumed after use.
- Public order/return/withdrawal endpoints are rate-limited.

## Secrets

Never commit `.env`, Stripe credentials, webhook secrets, TOTP secrets, database credentials, email-provider tokens or monitoring tokens.

Use environment secrets in the hosting platform. `.env.example` contains placeholders only.

## Live product approval boundary

Live approval is owner-only and requires:

- exact confirmation phrase
- traceable external review reference
- complete product content
- explicit destination countries
- explicit variants
- valid price/stock

Any subsequent normal product-content edit disables live status again so the prior approval cannot silently cover changed material.

## Remaining production work

Before public commerce:

- migrate runtime persistence to managed PostgreSQL
- configure backups and perform a restore rehearsal
- complete product-by-product legal/commercial review
- configure real tax/shipping rules
- configure transactional email and monitoring
- review final Privacy/Terms/Returns wording
- perform deployed browser/payment/refund failure testing
- commission an independent security review

See `PRODUCTION-READINESS-AUDIT-V14.md`, `V14.1-OPERATIONAL-HARDENING.md` and `PRODUCTION-CHECKLIST-V14.md`.

## v17 additions

See `V17-SECURITY-REPORT.md` for the full review. In short:

- Static files are served from an allowlist (top-level pages and `/assets` only); server code, scripts, tests and internal documents return 404.
- Products come only from `/api/storefront`; the full source catalogue is no longer shipped to browsers.
- Publication and any sale require an owner-recorded compliance approval (`lib/compliance.mjs`); unreviewed high-risk products are hidden, and production shows only approved products.
- Admin user responses and audit entries never include password hashes or MFA secrets.
- Rate limits for Ask Vera, reviews, the guide and email-based order access; set `TRUST_PROXY=true` behind a reverse proxy.
- Admin-entered links are restricted to site paths, `https:` and (knowledge base) `mailto:`.
- Ask Vera questions are processed in memory only and never stored.
