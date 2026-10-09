# VERAPEP V14 — Production launch checklist

Use this as the final operational sign-off. Do not mark an item complete based on intention; require evidence.

## P0 — must be complete before taking real money

- [ ] Managed production PostgreSQL provisioned.
- [ ] Runtime migrated from SQLite to PostgreSQL.
- [ ] Exact 84-product / 170-variant migration reconciliation completed.
- [ ] Database backup/PITR enabled.
- [ ] Restore rehearsal completed successfully.
- [ ] Production Render service is paid/non-sleeping.
- [ ] Strong unique owner password configured.
- [ ] Every enabled owner/admin account has per-user TOTP MFA enrolled and tested.
- [ ] `MFA_ENCRYPTION_KEY` is configured as a strong production secret and encrypted MFA login has been tested.
- [ ] Company legal name, registration number and address configured.
- [ ] Terms reviewed/approved and versioned.
- [ ] Privacy policy reviewed/approved and versioned.
- [ ] Tax/VAT matrix reviewed by accountant/tax owner.
- [ ] Launch countries and shipping rules confirmed.
- [ ] Every live product has complete mandatory content.
- [ ] Every live product has external legal/commercial review reference.
- [ ] Every live product has explicit approved destination countries.
- [ ] Only approved variants have `saleEnabled=true`.
- [ ] Stripe live account approved/configured.
- [ ] Stripe live secret stored only as production secret.
- [ ] Stripe webhook signing secret configured.
- [ ] `COMMERCE_ALLOWLIST` contains only approved live variant IDs.
- [ ] No information-only/research/restricted product can create a live session.
- [ ] Full production-like checkout rehearsal completed.
- [ ] Admin operational queues verified against real order states.
- [ ] Privacy customer export tested for a known order/customer.
- [ ] `/api/ready` returns HTTP 200 before launch.

## P1 — operations

- [ ] Transactional email provider configured.
- [ ] Failed transactional email retry procedure tested with idempotency protection.
- [ ] SPF/DKIM/DMARC configured and checked.
- [ ] Order-confirmation delivery tested.
- [ ] Shipping/tracking email tested.
- [ ] Withdrawal receipt tested.
- [ ] Refund confirmation tested.
- [ ] Monitoring/uptime provider configured.
- [ ] 5xx alert delivered to a real person/channel.
- [ ] Stripe webhook failure alert configured.
- [ ] Backup failure alert configured.
- [ ] Carrier/label workflow tested.
- [ ] Refund operational policy defined.
- [ ] Return/withdrawal support responsibility assigned.
- [ ] Canonical production domain connected.

## Failure tests

- [ ] Card payment succeeds.
- [ ] Card payment fails.
- [ ] 3DS/authentication path tested where applicable.
- [ ] Checkout expires and inventory releases.
- [ ] Delayed payment succeeds.
- [ ] Delayed payment fails and inventory releases.
- [ ] Stripe webhook is delivered twice; fulfilment happens once.
- [ ] Two customers attempt to buy final unit; only one can own it.
- [ ] Email provider outage does not lose paid order.
- [ ] Stripe API timeout does not falsely mark order paid/refunded.
- [ ] Refund retry does not duplicate refund/restock.
- [ ] Unsupported destination cannot pay.
- [ ] Withdrawal duplicate submission is safely handled.

## Mobile/browser acceptance

- [ ] iPhone physical-device test.
- [ ] Android physical-device test.
- [ ] 360 px width.
- [ ] 390 px width.
- [ ] 430 px width.
- [ ] Autofill/keyboard checkout.
- [ ] Cart quantity changes.
- [ ] Country change/requote.
- [ ] Stripe redirect/back behavior.
- [ ] Confirmation/order lookup.
- [ ] Withdrawal flow.
- [ ] No horizontal overflow.
- [ ] No blocking console errors.
- [ ] Lighthouse/field performance reviewed.

## Launch controls

- [ ] `APP_ENV=production`.
- [ ] `ENABLE_LIVE_COMMERCE=true` only at final launch.
- [ ] `LIVE_COMMERCE_ACK` exact required value.
- [ ] `PRODUCTION_CHECKOUT_TEST_ACK=true` only after rehearsal.
- [ ] `PRIVACY_REVIEW_ACK=true` only after review.
- [ ] `LEGAL_TERMS_REVIEW_ACK=true` only after review.
- [ ] `PRODUCTION_SEO_INDEXING=false` for initial launch/cutover.
- [ ] After final content verification, SEO indexing deliberately enabled if desired.
