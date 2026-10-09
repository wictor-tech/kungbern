# VERAPEP V14.1 — Privacy data register template

This register is an operational template, not legal approval. Complete the `Decision needed` fields with the responsible privacy/legal owner before production.

| Processing flow | Data categories | Purpose | System/location | Proposed minimisation | Retention decision | Legal basis decision | Processor / recipient | Owner |
|---|---|---|---|---|---|---|---|---|
| Checkout/order | Name, email, phone, shipping address, ordered items | Create and fulfil order | Production database | Collect only fields needed for delivery/support | Decision needed | Decision needed | Hosting, payment, email, carrier | Decision needed |
| Payment | Provider reference, amount, currency, status | Reconcile payment/refund | VERAPEP + payment provider | Never store card number/CVC | Decision needed | Decision needed | Payment provider | Decision needed |
| Fulfilment | Order, carrier, tracking number, delivery status | Ship and track order | Production database + carrier | Send carrier only necessary delivery data | Decision needed | Decision needed | Carrier/label provider | Decision needed |
| Returns/withdrawal | Order ID, reason/note, email, status | Handle consumer request | Production database | Free text should avoid unnecessary sensitive data | Decision needed | Decision needed | Support/email | Decision needed |
| Customer support | Email, message, order reference | Resolve support issue | Support/email system | Avoid copying unnecessary order/payment data | Decision needed | Decision needed | Email/support provider | Decision needed |
| Ask Vera | Free-text question | Product-information support | Request processing only | Do not request diagnoses, medication lists, IDs or health records; do not persist raw text by default | Prefer no retention | Decision needed | Any external AI/provider must be reviewed | Decision needed |
| Reviews | Display name, rating, review text, product | Publish/moderate review | Production database | Do not require legal name | Decision needed | Decision needed | Hosting | Decision needed |
| Admin/security | Admin email, role, password hash, MFA seed, audit events | Secure administration | Production database | Encrypt TOTP seed; recovery codes hashed only | Employment/access period + decision | Decision needed | Hosting | Decision needed |
| Operational logs | IP/error metadata, request metadata | Security/debugging | Hosting/monitoring | Do not log passwords, tokens, card data or full sensitive payloads | Short, decision needed | Decision needed | Hosting/monitoring | Decision needed |
| Transactional email | Recipient, subject, order ID, delivery state | Customer communication | Outbox + email provider | Avoid sensitive content in subject lines | Decision needed | Decision needed | Email provider | Decision needed |
| Analytics/marketing | None intentionally in V14.1 | N/A | N/A | Keep absent until there is a defined purpose and consent model | N/A | N/A | N/A | N/A |

## Required operational decisions before launch

1. Assign a privacy owner.
2. Decide retention periods per processing flow, including accounting/legal retention that may override erasure requests.
3. Document the lawful basis for each processing activity.
4. List every processor/subprocessor and verify the applicable data-processing agreement.
5. Define the workflow for access, correction, deletion/restriction, objection and portability requests.
6. Define identity verification for privacy requests without collecting excessive additional data.
7. Define security-incident escalation and breach-assessment procedure.
8. Verify international transfers for any provider used outside the relevant jurisdiction.
9. Review Ask Vera separately before connecting any external AI service to identifiable customer data.
10. Reconcile this register with the final Privacy Policy version.

## V14.1 technical support

The owner/admin privacy tool can generate a read-only customer export by email from the admin interface. It includes matching customer records, orders, returns, withdrawals and stored transactional messages. It does not automatically erase records because the retention/legal decision has not yet been made.
