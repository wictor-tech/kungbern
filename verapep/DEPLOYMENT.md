# VERAPEP v9 deployment notes

## Local

1. Install Node.js 22 or later.
2. Copy `.env.example` to `.env` and change the owner credentials before sharing the server.
3. Run `npm install`.
4. Run `npm start` or `node server.mjs`.
5. Open `http://localhost:3000`.

## Persistent data

Runtime state is stored in SQLite:

```text
data/verapep.sqlite
```

The `data/` directory must be backed up and mounted persistently in a container deployment. SQLite WAL files can exist while the server is running; stop the server or use a SQLite-aware backup process before copying the database.

## Docker

Run:

```text
docker compose up --build
```

Mount the complete `data/` directory as the persistent volume.

## Stripe test mode

Stripe remains optional and accepts `sk_test_` keys only. Configure `STRIPE_WEBHOOK_SECRET` and forward supported test webhook events to:

```text
/api/webhooks/stripe
```

Order creation uses idempotency keys and reserves inventory for 30 minutes.

## Production services still required

A public launch still needs provider-specific configuration for:

- managed hosting and TLS
- backups and monitoring
- transactional email
- live payment processing
- tax and carrier integrations
- secrets management
- preferably a managed PostgreSQL deployment when horizontal scaling is required

The application does not include these provider accounts or credentials.
