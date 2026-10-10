/* VERAPEP v21 — payment-flow regression tests (see V21-LAUNCH-AUDIT.md, section "Betalflödet").
   Stripe is mocked: every call to api.stripe.com is answered locally, nothing leaves the machine. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STRIPE_SECRET_KEY = 'sk_test_v21_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_v21_mock';
process.env.LEGAL_REVIEW_ACK = 'true';

const realFetch = globalThis.fetch;
const stripe = { sessions: 0, calls: 0, delayMs: 0, sessionAnswer: {} };
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (!target.startsWith('https://api.stripe.com')) return realFetch(url, options);
  stripe.calls += 1;
  if (stripe.delayMs) await new Promise(resolve => setTimeout(resolve, stripe.delayMs));
  if (target.endsWith('/v1/checkout/sessions')) {
    stripe.sessions += 1;
    return new Response(JSON.stringify({ id: `cs_test_v21_${stripe.sessions}`, url: `https://checkout.stripe.com/c/pay/cs_test_v21_${stripe.sessions}`, expires_at: Math.floor(Date.now() / 1000) + 1800 }), { status: 200 });
  }
  const id = target.split('/sessions/')[1]?.split('?')[0];
  return new Response(JSON.stringify({ id, payment_status: 'paid', livemode: false, ...stripe.sessionAnswer[id] }), { status: 200 });
};

const { createVerapepServer } = await import('../server.mjs');
const { approveForSale } = await import('./support/compliance.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json','product-compliance.json'];
const customer = { customer: { name: 'Test Customer', email: 'customer@example.com', phone: '' }, shippingAddress: { line1: 'Gatan 1', line2: '', city: 'Stockholm', postalCode: '11122', country: 'SE' }, acceptTerms: true, acceptSandboxNotice: true };

async function request(baseUrl, pathname, options = {}) {
  const response = await realFetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  return { status: response.status, payload: await response.json().catch(() => ({})), response };
}
const post = (ctx, pathname, body = {}, headers = {}) => request(ctx.baseUrl, pathname, { method: 'POST', headers, body: JSON.stringify(body) });
const patch = (ctx, pathname, body = {}) => request(ctx.baseUrl, pathname, { method: 'PATCH', headers: ctx.admin, body: JSON.stringify(body) });

async function setup() {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v21-pay-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(dataDir, name));
  const server = createVerapepServer({ rootDir: root, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const ctx = { server, dataDir, baseUrl: `http://127.0.0.1:${server.address().port}` };
  const login = await request(ctx.baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) });
  ctx.admin = { Cookie: login.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': login.payload.csrf };
  const store = (await request(ctx.baseUrl, '/api/storefront')).payload;
  const product = store.products.find(item => item.variants.length >= 2) || store.products[0];
  ctx.product = product;
  ctx.variants = product.variants.slice(0, 2);
  await approveForSale(ctx.baseUrl, ctx.admin, product.id, ['SE', 'DE']);
  await patch(ctx, `/api/admin/product-content/${encodeURIComponent(product.id)}`, { published: true, availableForSale: true, stockStatus: 'available', allowedCountries: ['SE', 'DE'] });
  for (const variant of ctx.variants) {
    const result = await patch(ctx, '/api/admin/inventory', { variantId: variant.variantId, onHand: 50, retailPrice: 49.95, saleEnabled: true });
    assert.equal(result.status, 200, JSON.stringify(result.payload));
  }
  process.env.COMMERCE_ALLOWLIST = ctx.variants.map(variant => variant.variantId).join(',');
  ctx.state = () => server.verapep.getState();
  ctx.order = id => ctx.state().orders.find(order => order.id === id);
  ctx.stock = variantId => ctx.state().inventory.variants[variantId];
  ctx.close = () => new Promise(resolve => server.close(resolve));
  return ctx;
}

async function createOrder(ctx, items = null, headers = {}) {
  const result = await post(ctx, '/api/orders', { items: items || [{ variantId: ctx.variants[0].variantId, quantity: 1 }], ...customer }, headers);
  assert.ok([200, 201].includes(result.status), JSON.stringify(result.payload));
  return result.payload;
}
const openSession = (ctx, created) => post(ctx, '/api/payments/stripe/session', { orderId: created.order.id, token: created.accessToken });
function sign(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
}
async function webhook(ctx, eventId, type, orderId, sessionId, extra = {}) {
  const body = JSON.stringify({ id: eventId, type, livemode: false, data: { object: { id: sessionId, client_reference_id: orderId, metadata: { order_id: orderId }, payment_status: 'paid', livemode: false, ...extra } } });
  return request(ctx.baseUrl, '/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(body) }, body });
}
const expectedTotal = order => order.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) + order.shippingCents + order.taxCents;

test('v21 P1: one Stripe session per order — concurrent clicks and reopening reuse it; closed orders are refused', async () => {
  const ctx = await setup();
  try {
    const created = await createOrder(ctx);
    const before = stripe.sessions;
    stripe.delayMs = 50;
    const [first, second] = await Promise.all([openSession(ctx, created), openSession(ctx, created)]);
    stripe.delayMs = 0;
    assert.equal(stripe.sessions - before, 1, 'only one Stripe session may be created');
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const again = await openSession(ctx, created);
    assert.equal(again.status, 200);
    assert.equal(again.payload.reused, true);
    assert.equal(again.payload.sessionId, ctx.order(created.order.id).paymentReference);
    assert.equal(stripe.sessions - before, 1, 'reopening the payment page reuses the open session');

    const paid = await createOrder(ctx);
    assert.equal((await post(ctx, `/api/orders/${paid.order.id}/payments/mock`, { token: paid.accessToken })).status, 200);
    assert.equal((await openSession(ctx, paid)).status, 409, 'a paid order cannot get a new payment session');
  } finally { await ctx.close(); }
});

test('v21 P1: a payment for a cancelled order is accepted, kept cancelled and flagged for refund (no endless Stripe retries)', async () => {
  const ctx = await setup();
  try {
    const created = await createOrder(ctx);
    const session = await openSession(ctx, created);
    const variantId = ctx.variants[0].variantId;
    const onHandBefore = ctx.stock(variantId).onHand;
    assert.equal((await patch(ctx, `/api/admin/orders/${created.order.id}`, { status: 'cancelled' })).status, 200);
    const order = ctx.order(created.order.id);
    assert.equal(order.inventoryReserved, false, 'cancelling a pending checkout gives its stock back');

    const hook = await webhook(ctx, 'evt_v21_cancelled', 'checkout.session.completed', created.order.id, session.payload.sessionId, { amount_total: expectedTotal(order), currency: order.currency.toLowerCase() });
    assert.equal(hook.status, 200, 'Stripe must get a 2xx so it does not retry for days');
    assert.equal(order.orderStatus, 'cancelled');
    assert.equal(order.paymentStatus, 'paid', 'the payment is recorded so the refund action can be used');
    assert.equal(order.paymentIssues[0].code, 'paid_after_cancel');
    assert.equal(ctx.stock(variantId).onHand, onHandBefore, 'no stock is taken for a cancelled order');
    assert.equal((await webhook(ctx, 'evt_v21_cancelled', 'checkout.session.completed', created.order.id, session.payload.sessionId)).payload.duplicate, true);

    const customerView = await request(ctx.baseUrl, `/api/orders/${created.order.id}?token=${encodeURIComponent(created.accessToken)}`);
    assert.equal(customerView.payload.order?.paymentIssues, undefined, 'internal review notes are not shown to the customer');
    const dashboard = await request(ctx.baseUrl, '/api/admin/dashboard', { headers: ctx.admin });
    assert.equal(dashboard.payload.orders.find(item => item.id === created.order.id).paymentIssues.length, 1, 'the admin sees the issue');
  } finally { await ctx.close(); }
});

test('v21 P1: an old session expiring does not cancel the order, and a wrong amount or currency is not accepted as payment', async () => {
  const ctx = await setup();
  try {
    const created = await createOrder(ctx);
    const session = await openSession(ctx, created);
    const order = ctx.order(created.order.id);
    assert.equal((await webhook(ctx, 'evt_v21_old', 'checkout.session.expired', created.order.id, 'cs_test_some_older_session')).status, 200);
    assert.equal(order.orderStatus, 'awaiting_payment', 'only the current session may cancel the order');

    await webhook(ctx, 'evt_v21_amount', 'checkout.session.completed', created.order.id, session.payload.sessionId, { amount_total: 1, currency: order.currency.toLowerCase() });
    assert.notEqual(order.paymentStatus, 'paid');
    assert.equal(order.paymentIssues.at(-1).code, 'payment_mismatch');
    await webhook(ctx, 'evt_v21_currency', 'checkout.session.completed', created.order.id, session.payload.sessionId, { amount_total: expectedTotal(order), currency: 'usd' === order.currency.toLowerCase() ? 'eur' : 'usd' });
    assert.notEqual(order.paymentStatus, 'paid');

    stripe.sessionAnswer[session.payload.sessionId] = { client_reference_id: order.id, amount_total: 5, currency: order.currency.toLowerCase() };
    const confirm = await post(ctx, '/api/payments/stripe/confirm', { orderId: order.id, token: created.accessToken, sessionId: session.payload.sessionId });
    assert.equal(confirm.status, 409);
    assert.equal(confirm.payload.error, 'payment_mismatch');

    await webhook(ctx, 'evt_v21_ok', 'checkout.session.completed', created.order.id, session.payload.sessionId, { amount_total: expectedTotal(order), currency: order.currency.toLowerCase() });
    assert.equal(order.paymentStatus, 'paid');
    assert.equal((await webhook(ctx, 'evt_v21_expired_late', 'checkout.session.expired', created.order.id, session.payload.sessionId)).status, 200);
    assert.equal(order.orderStatus, 'processing', 'a paid order is never cancelled by a late expiry event');

    await webhook(ctx, 'evt_v21_second', 'checkout.session.completed', created.order.id, 'cs_test_second_payment', { amount_total: expectedTotal(order), currency: order.currency.toLowerCase() });
    assert.equal(order.paymentIssues.at(-1).code, 'duplicate_payment', 'a second payment for the same order is flagged for refund');
  } finally { await ctx.close(); }
});

test('v21 P1: webhook and redirect confirmation arriving together confirm the order once', async () => {
  const ctx = await setup();
  try {
    const created = await createOrder(ctx);
    const session = await openSession(ctx, created);
    const order = ctx.order(created.order.id);
    stripe.sessionAnswer[session.payload.sessionId] = { client_reference_id: order.id, amount_total: expectedTotal(order), currency: order.currency.toLowerCase() };
    const onHandBefore = ctx.stock(ctx.variants[0].variantId).onHand;
    await Promise.all([
      webhook(ctx, 'evt_v21_race', 'checkout.session.completed', order.id, session.payload.sessionId, { amount_total: expectedTotal(order), currency: order.currency.toLowerCase() }),
      post(ctx, '/api/payments/stripe/confirm', { orderId: order.id, token: created.accessToken, sessionId: session.payload.sessionId }),
      post(ctx, `/api/orders/${order.id}/payments/mock`, { token: created.accessToken })
    ]);
    assert.equal(order.timeline.filter(entry => entry.status === 'payment_confirmed').length, 1);
    assert.equal(ctx.stock(ctx.variants[0].variantId).onHand, onHandBefore - 1);
  } finally { await ctx.close(); }
});

test('v21 P2: stock shortfalls never leave inventory half-updated; charged orders are settled and flagged; admin cannot cut below reserved stock', async () => {
  const ctx = await setup();
  try {
    const [first, second] = ctx.variants;
    const items = [{ variantId: first.variantId, quantity: 1 }, ...(second ? [{ variantId: second.variantId, quantity: 2 }] : [])];
    const lastVariant = items.at(-1).variantId;
    const created = await createOrder(ctx, items);
    const lowered = await patch(ctx, '/api/admin/inventory', { variantId: lastVariant, onHand: 0 });
    assert.equal(lowered.status, 409);
    assert.equal(lowered.payload.error, 'below_reserved');

    // Simulate stock disappearing outside the admin (e.g. a manual database correction).
    ctx.stock(lastVariant).onHand = 1;
    const snapshot = structuredClone(ctx.state().inventory.variants);
    const mock = await post(ctx, `/api/orders/${created.order.id}/payments/mock`, { token: created.accessToken });
    assert.equal(mock.status, 409);
    assert.equal(mock.payload.error, 'inventory_changed');
    assert.deepEqual(ctx.state().inventory.variants, snapshot, 'a refused payment changes no stock at all');
    assert.notEqual(ctx.order(created.order.id).paymentStatus, 'paid');

    const session = await openSession(ctx, created);
    const order = ctx.order(created.order.id);
    const hook = await webhook(ctx, 'evt_v21_oversold', 'checkout.session.completed', order.id, session.payload.sessionId, { amount_total: expectedTotal(order), currency: order.currency.toLowerCase() });
    assert.equal(hook.status, 200);
    assert.equal(order.paymentStatus, 'paid', 'the customer has paid, so the order is kept');
    assert.equal(order.paymentIssues.at(-1).code, 'oversold');
    assert.ok(ctx.stock(lastVariant).onHand >= 0);
  } finally { await ctx.close(); }
});

test('v21 P4: an idempotency key creates one order even for concurrent requests, and cannot be reused for another basket', async () => {
  const ctx = await setup();
  try {
    const variantId = ctx.variants[0].variantId;
    const reservedBefore = ctx.stock(variantId).reserved || 0;
    const body = JSON.stringify({ items: [{ variantId, quantity: 1 }], ...customer });
    const results = await Promise.all([1, 2, 3].map(() => request(ctx.baseUrl, '/api/orders', { method: 'POST', headers: { 'Idempotency-Key': 'v21-key-1' }, body })));
    assert.equal(new Set(results.map(result => result.payload.order.id)).size, 1);
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(ctx.stock(variantId).reserved - reservedBefore, 1, 'only one reservation');
    assert.equal(results[0].payload.requestHash, undefined);
    const other = await request(ctx.baseUrl, '/api/orders', { method: 'POST', headers: { 'Idempotency-Key': 'v21-key-1' }, body: JSON.stringify({ items: [{ variantId, quantity: 3 }], ...customer }) });
    assert.equal(other.status, 422);
    assert.equal(other.payload.error, 'idempotency_key_reused');
  } finally { await ctx.close(); }
});

test('v21 P5: admin status changes follow the payment state', async () => {
  const ctx = await setup();
  try {
    const unpaid = await createOrder(ctx);
    const shipUnpaid = await patch(ctx, `/api/admin/orders/${unpaid.order.id}`, { status: 'shipped' });
    assert.equal(shipUnpaid.status, 409, 'an unpaid order cannot be shipped');
    assert.equal(shipUnpaid.payload.error, 'invalid_status_transition');
    assert.equal((await patch(ctx, `/api/admin/orders/${unpaid.order.id}`, { status: 'cancelled' })).status, 200);
    assert.equal((await patch(ctx, `/api/admin/orders/${unpaid.order.id}`, { status: 'processing' })).status, 409, 'a cancelled order is final');

    const paid = await createOrder(ctx);
    await post(ctx, `/api/orders/${paid.order.id}/payments/mock`, { token: paid.accessToken });
    assert.equal((await patch(ctx, `/api/admin/orders/${paid.order.id}`, { status: 'cancelled' })).status, 409, 'paid orders are cancelled through the refund action');
    assert.equal((await patch(ctx, `/api/admin/orders/${paid.order.id}`, { status: 'awaiting_payment' })).status, 409);
    assert.equal((await patch(ctx, `/api/admin/orders/${paid.order.id}`, { status: 'shipped', carrier: 'PostNord', trackingNumber: 'ABC123' })).status, 200);
    const sameStatus = await patch(ctx, `/api/admin/orders/${paid.order.id}`, { status: 'shipped', trackingNumber: 'ABC124' });
    assert.equal(sameStatus.status, 200, 'saving tracking details without a status change is allowed');
    assert.equal(ctx.order(paid.order.id).trackingNumber, 'ABC124');
  } finally { await ctx.close(); }
});

test('v21 P3: a Stripe checkout whose expiry webhook was lost releases its stock', async () => {
  const ctx = await setup();
  try {
    const variantId = ctx.variants[0].variantId;
    const created = await createOrder(ctx);
    await openSession(ctx, created);
    const reservedWhileOpen = ctx.stock(variantId).reserved;
    const order = ctx.order(created.order.id);
    order.createdAt = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    order.stripeSessionExpiresAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await post(ctx, '/api/quote', { items: [{ variantId, quantity: 1 }] });
    await createOrder(ctx);
    assert.equal(order.orderStatus, 'cancelled');
    assert.equal(order.paymentStatus, 'expired');
    assert.equal(ctx.stock(variantId).reserved, reservedWhileOpen, 'the stale reservation was released (and the new order reserved one)');
  } finally { await ctx.close(); }
});

test('v21 P9: shutdown ends live-update streams, closes the server and the database', async () => {
  const ctx = await setup();
  const controller = new AbortController();
  const stream = await realFetch(`${ctx.baseUrl}/api/storefront/events`, { signal: controller.signal }).catch(() => null);
  await ctx.server.verapep.shutdown(2000);
  assert.equal(ctx.server.listening, false);
  await assert.rejects(realFetch(`${ctx.baseUrl}/api/health`));
  controller.abort();
  void stream;
  await assert.rejects(fsp.access(path.join(ctx.dataDir, '.server.pid')));
});

test('v21 L2: Stripe webhooks reach the server behind the demo lock (their signature is the authentication); health checks the database', async () => {
  process.env.SITE_ACCESS_PASSWORD = 'demo-lock-password-v21';
  const ctxPromise = (async () => {
    const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v21-lock-'));
    for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(dataDir, name));
    const server = createVerapepServer({ rootDir: root, dataDir });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
  })();
  const { server, baseUrl } = await ctxPromise;
  delete process.env.SITE_ACCESS_PASSWORD;
  try {
    assert.equal((await realFetch(`${baseUrl}/api/storefront`)).status, 401, 'the rest of the site stays locked');
    const unsigned = await realFetch(`${baseUrl}/api/webhooks/stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unsigned.status, 400, 'an unsigned webhook is refused by the signature check, not the lock');
    const health = await (await realFetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.version, '21.0.0');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
