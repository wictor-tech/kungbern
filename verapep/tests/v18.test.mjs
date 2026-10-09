import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createVerapepServer, resolveClientIp, trustedProxyHops } from '../server.mjs';
import { approveForSale } from './support/compliance.mjs';
import { resolveGateMode, isHostedEnvironment, suggestRisk } from '../lib/compliance.mjs';
import { answerQuestion } from '../lib/vera.mjs';
import { scanText, scanDirectory } from '../scripts/secret-scan.mjs';
import { inspect, redact, MARKER } from '../scripts/scrub-audit-log.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json','product-compliance.json'];
const node = process.execPath;

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function tempData() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v18-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(dir, name));
  return dir;
}
async function start(dataDir) {
  const server = createVerapepServer({ rootDir: root, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}
const stop = server => new Promise(resolve => server.close(resolve));
async function login(baseUrl) {
  const result = await jsonRequest(baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) });
  return { Cookie: result.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.payload.csrf };
}
function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { return fn(); } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('v18 trusted proxy: forged X-Forwarded-For entries cannot change the client address', async t => {
  await t.test('address resolution', () => {
    assert.equal(trustedProxyHops(''), 0);
    assert.equal(trustedProxyHops('true'), 1);
    assert.equal(trustedProxyHops('2'), 2);
    assert.equal(trustedProxyHops('yes'), 0);
    assert.equal(resolveClientIp('10.0.0.1', '1.2.3.4', 0), '10.0.0.1', 'header ignored without TRUST_PROXY');
    assert.equal(resolveClientIp('10.0.0.1', '1.2.3.4', 1), '1.2.3.4');
    assert.equal(resolveClientIp('10.0.0.1', '6.6.6.6, 1.2.3.4', 1), '1.2.3.4', 'client-written entries on the left are ignored');
    assert.equal(resolveClientIp('10.0.0.1', '6.6.6.6, 1.2.3.4, 10.0.0.9', 2), '1.2.3.4');
    assert.equal(resolveClientIp('10.0.0.1', '', 1), '10.0.0.1', 'missing header falls back to the socket');
    assert.equal(resolveClientIp('10.0.0.1', 'not-an-ip', 1), '10.0.0.1');
  });

  await t.test('rotating a forged header does not evade the Ask Vera rate limit', async () => {
    const dataDir = await tempData();
    const { server, baseUrl } = await start(dataDir);
    try {
      process.env.TRUST_PROXY = '1';
      let limited = false;
      for (let index = 0; index < 35 && !limited; index += 1) {
        const result = await jsonRequest(baseUrl, '/api/support/ask', { method: 'POST', headers: { 'X-Forwarded-For': `203.0.113.${index}, 198.51.100.7` }, body: JSON.stringify({ question: 'delivery' }) });
        limited = result.response.status === 429;
      }
      assert.ok(limited, 'the real client (rightmost trusted entry) is limited despite changing left entries');
    } finally {
      delete process.env.TRUST_PROXY;
      await stop(server);
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  });
});

test('v18 order access: no personal data or tokens in URLs', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const owner = await login(baseUrl);
  await approveForSale(baseUrl, owner, 'kpv-071');
  const enabled = await jsonRequest(baseUrl, '/api/admin/products/kpv-071/webshop', { method: 'POST', headers: owner, body: JSON.stringify({ enabled: true }) });
  const variant = enabled.payload.product.variants.find(item => item.checkoutEnabled);
  const created = await jsonRequest(baseUrl, '/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ variantId: variant.variantId, quantity: 1 }], customer: { name: 'Test Person', email: 'person@example.com' }, shippingAddress: { line1: 'Testgatan 1', city: 'Stockholm', postalCode: '11122', country: 'SE' }, acceptTerms: true, acceptSandboxNotice: true }) });
  assert.equal(created.response.status, 201);
  const { id } = created.payload.order;

  const byEmailInUrl = await jsonRequest(baseUrl, `/api/orders/${id}?email=person%40example.com`);
  assert.equal(byEmailInUrl.response.status, 400);
  assert.equal(byEmailInUrl.payload.error, 'order_lookup_requires_post');
  assert.doesNotMatch(JSON.stringify(byEmailInUrl.payload), /person@example\.com|Testgatan/);
  const byPost = await jsonRequest(baseUrl, '/api/orders/lookup', { method: 'POST', body: JSON.stringify({ orderId: id, email: 'person@example.com' }) });
  assert.equal(byPost.response.status, 200);
  const byHeader = await jsonRequest(baseUrl, `/api/orders/${id}`, { headers: { 'X-Order-Token': created.payload.accessToken } });
  assert.equal(byHeader.response.status, 200);
  const anonymous = await jsonRequest(baseUrl, `/api/orders/${id}`);
  assert.equal(anonymous.response.status, 404);
  const admin = await jsonRequest(baseUrl, `/api/orders/${id}`, { headers: { Cookie: owner.Cookie } });
  assert.equal(admin.response.status, 200, 'admin "Open" links need no email in the URL');

  const clients = ['order.js', 'checkout.js', 'my-pages.js', 'admin.js'].map(file => fs.readFileSync(path.join(root, 'assets', file), 'utf8')).join('\n');
  assert.doesNotMatch(clients, /order\.html\?order=[^`'"]*&(email|token)=/, 'client code never puts email or token into order links');
  assert.doesNotMatch(clients, /query\.set\('email'/);
});

test('v18 audit-log scrubber: dry run, backup, redaction, post-check and undo', async t => {
  const dataDir = await tempData();
  t.after(() => fsp.rm(dataDir, { recursive: true, force: true }));
  const { server } = await start(dataDir);
  await stop(server);
  const db = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'));
  const insert = db.prepare('INSERT INTO audit_log(actor_email, actor_role, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  // A v16-style leak: the full admin record (fake hash values) in after_json.
  const fakeHash = `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`; // secret-scan:allow
  insert.run('owner@example.com', 'owner', 'admin_user.created', 'admin_user', 'e@example.com', null, JSON.stringify({ email: 'e@example.com', role: 'editor', passwordHash: fakeHash, mfaSecret: ['enc', 'v1', 'abcdefgh', 'ijklmnop', 'qrst'].join(':'), recoveryCodeHashes: ['x'] }), '2026-01-01T00:00:00.000Z');
  insert.run('c@example.com', 'customer', 'order.created', 'order', 'VP-1', null, JSON.stringify({ id: 'VP-1', customer: { email: 'c@example.com' } }), '2026-01-01T00:00:00.000Z');
  db.close();
  const run = (...args) => spawnSync(node, ['--no-warnings', 'scripts/scrub-audit-log.mjs', '--data-dir', dataDir, ...args], { cwd: root, encoding: 'utf8' });

  const dry = run();
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Rows with secrets[^\n]*: 1/);
  assert.match(dry.stdout, /after\.passwordHash/);
  assert.doesNotMatch(dry.stdout, /scrypt\$|abcdefgh/, 'values are never printed');
  assert.match(dry.stdout, /customer personal data[^\n]*: 1/);
  assert.equal(run('--apply').status, 1, '--apply without --yes is refused');

  const applied = run('--apply', '--yes');
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Post-check: 0 rows with secrets/);
  const undoFile = applied.stdout.match(/Undo file:\s+(\S+)/)[1];
  assert.equal((fs.statSync(undoFile).mode & 0o777).toString(8), '600');
  const check = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'), { readOnly: true });
  const row = JSON.parse(check.prepare("SELECT after_json FROM audit_log WHERE action = 'admin_user.created'").get().after_json);
  const orderRow = check.prepare("SELECT after_json FROM audit_log WHERE action = 'order.created'").get().after_json;
  check.close();
  assert.equal(row.passwordHash, MARKER);
  assert.equal(row.mfaSecret, MARKER);
  assert.equal(row.email, 'e@example.com', 'non-secret fields are kept');
  assert.match(orderRow, /c@example\.com/, 'personal data is left for the retention decision');
  assert.match(run().stdout, /Rows with secrets[^\n]*: 0/, 'idempotent');

  const restored = run('--restore', undoFile, '--yes');
  assert.equal(restored.status, 0);
  assert.match(run().stdout, /Rows with secrets[^\n]*: 1/, 'the change is reversible');

  assert.deepEqual(inspect({ a: { passwordHash: 'x', customer: { email: 'y' } } }), { secrets: ['a.passwordHash'], pii: ['a.customer'] });
  assert.equal(redact({ token: 'scrypt$1' }).token, MARKER);
});

test('v18 retention tool reports only until the policy is approved', async t => {
  const dataDir = await tempData();
  t.after(() => fsp.rm(dataDir, { recursive: true, force: true }));
  const { server } = await start(dataDir);
  await stop(server);
  const report = spawnSync(node, ['--no-warnings', 'scripts/retention.mjs', '--data-dir', dataDir], { cwd: root, encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /PROPOSED \(not approved/);
  const apply = spawnSync(node, ['--no-warnings', 'scripts/retention.mjs', '--data-dir', dataDir, '--apply', '--yes'], { cwd: root, encoding: 'utf8' });
  assert.equal(apply.status, 2);
  assert.match(apply.stderr, /has not been approved/);
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'retention-policy.json'), 'utf8'));
  assert.equal(policy.approved, false, 'the shipped policy is a proposal, not an approval');
});

test('v18 publication gate: hosted environments default to strict, no hidden data in public assets', async t => {
  await t.test('gate resolution', () => {
    assert.equal(resolveGateMode({ isProduction: true, configured: 'preview', hosted: false }), 'strict', 'production can never opt out');
    assert.equal(resolveGateMode({ isProduction: false, configured: '', hosted: true }), 'strict', 'a hosted preview is strict by default');
    assert.equal(resolveGateMode({ isProduction: false, configured: 'preview', hosted: true }), 'preview', 'explicit opt-in only');
    assert.equal(resolveGateMode({ isProduction: false, configured: '', hosted: false }), 'preview');
    assert.equal(isHostedEnvironment({ RENDER: 'true' }), true);
    assert.equal(isHostedEnvironment({ BASE_URL: 'https://example.com' }), true);
    assert.equal(isHostedEnvironment({}), false);
    const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
    assert.match(render, /key: PUBLICATION_GATE\s+value: strict/);
  });

  await t.test('a Render-like environment lists no unreviewed products', async () => {
    const dataDir = await tempData();
    const running = await withEnv({ RENDER: 'true', PUBLICATION_GATE: undefined }, () => start(dataDir));
    try {
      const store = (await jsonRequest(running.baseUrl, '/api/storefront')).payload;
      assert.equal(store.publication.gate, 'strict');
      assert.equal(store.products.length, 0);
    } finally { await stop(running.server); await fsp.rm(dataDir, { recursive: true, force: true }); }
  });

  await t.test('static and generated assets never name hidden products', async () => {
    const dataDir = await tempData();
    const { server, baseUrl } = await start(dataDir);
    try {
      const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalogue.json'), 'utf8'));
      const hidden = catalogue.products.filter(product => suggestRisk(product).level === 'high');
      const map = await (await fetch(`${baseUrl}/assets/product-image-map.js`)).text();
      for (const product of hidden) assert.ok(!map.includes(product.id), `image map must not list ${product.id}`);
      assert.match(map, /bpc-157-009/, 'visible products keep their photo');
      assert.equal((await fetch(`${baseUrl}/assets/media/product-vials/semaglutide.png`)).status, 404, 'hidden product photo is not served');
      assert.equal((await fetch(`${baseUrl}/assets/media/product-vials/bpc-157.png`)).status, 200);
      const servedAssets = fs.readdirSync(path.join(root, 'assets')).filter(file => /\.(js|css|html)$/.test(file));
      for (const file of servedAssets) {
        const body = await (await fetch(`${baseUrl}/assets/${file}`)).text();
        for (const product of hidden) assert.ok(!body.includes(`'${product.id}'`) && !body.includes(`"${product.id}"`), `${file} names hidden product id ${product.id}`);
      }
      for (const page of ['/', '/support.html', '/guide.html', '/product/bpc-157-009']) {
        const html = await (await fetch(`${baseUrl}${page}`)).text();
        for (const product of hidden) assert.ok(!html.includes(product.id), `${page} contains ${product.id}`);
      }
    } finally { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); }
  });
});

test('v18 security regressions stay fixed', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  for (const pathname of ['/server.mjs', '/lib/compliance.mjs', '/scripts/scrub-audit-log.mjs', '/data/retention-policy.json', '/data/product-images.json', '/data/catalogue.json', '/.github/workflows/verapep-ci.yml', '/FILE-MANIFEST.txt', '/V18-SECURITY-REPORT.md', '/assets/../server.mjs', '/%2e%2e/server.mjs']) {
    assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 404, pathname);
  }
  const shell = await (await fetch(`${baseUrl}/assets/catalogue-data.js`)).text();
  assert.doesNotMatch(shell, /priceUsd|variantId/);
  const health = (await jsonRequest(baseUrl, '/api/health')).payload;
  assert.equal(health.version, '20.0.0');
  const ready = await jsonRequest(baseUrl, '/api/ready');
  assert.equal(ready.response.status, 503, 'the site still reports itself as not launch-ready');
  assert.ok(ready.payload.blockers.length >= 19, 'no blocker was removed');
  assert.equal(ready.payload.blockerDetails.length, ready.payload.blockers.length, 'classification never hides a blocker');
  for (const item of ready.payload.blockerDetails) assert.ok(item.action && item.category, `unclassified blocker: ${item.text}`);
  const categories = new Set(ready.payload.blockerDetails.map(item => item.category));
  for (const category of ['deployment', 'owner', 'legal', 'documents']) assert.ok(categories.has(category), category);
});

test('v18 seed data never contains real orders, customers or reviews', () => {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
  assert.deepEqual(read('orders.json'), []);
  assert.deepEqual(read('returns.json'), []);
  assert.deepEqual(read('withdrawals.json'), []);
  assert.deepEqual(read('customers.json').customers, []);
  assert.deepEqual(read('reviews.json').reviews, []);
  let listing = null;
  try { listing = execFileSync('git', ['ls-files', 'data'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* unpacked release, not a git checkout */ }
  if (listing !== null && listing.trim()) {
    const tracked = listing.split('\n').filter(Boolean).map(file => path.basename(file));
    for (const name of dataFiles) assert.ok(tracked.includes(name), `data/${name} must be in git so a clean checkout is complete`);
  }
});

test('v18 secret scanner detects planted secrets and passes on the project', () => {
  const stripe = ['sk', 'live', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('_');
  assert.ok(scanText(`STRIPE_SECRET_KEY=${stripe}`, 'x').some(item => item.pattern.startsWith('Stripe')));
  assert.ok(scanText(`DATABASE_URL=postgres://user:${'p'.repeat(12)}@host/db`, 'x').length);
  assert.ok(scanText('ADMIN_PASSWORD=Real-Production-Password-42', 'x').length);
  assert.equal(scanText('ADMIN_PASSWORD=ChangeMe-123!', 'x').length, 0, 'documented local default is allowed');
  assert.equal(scanText('const TOKEN_KEY = "lup-helpdesk-token";', 'x').length, 0);
  assert.deepEqual(scanDirectory(root), [], 'the project itself is clean');
});

test('v18 Ask Vera: realistic questions, typos, brands and effect questions', () => {
  const kb = JSON.parse(fs.readFileSync(path.join(root, 'data', 'support-kb.json'), 'utf8'));
  const products = [['bpc-157-009', 'BPC 157'], ['ghk-cu-043', 'GHK-CU'], ['glutathione-056', 'Glutathione'], ['epithalon-023', 'Epithalon'], ['kpv-071', 'KPV'], ['selank-021', 'Selank']]
    .map(([id, name]) => ({ id, name, displayName: name, categoryLabel: 'Category', specifications: ['5mg*10vials'], labReports: 0, orderable: false, shortDescription: '' }));
  const ctx = { kb, products, hiddenNames: ['Semaglutide', 'Tirzepatide', 'EPO', 'Botulinum toxin', 'melatonin', 'Insulin'], vars: { supportEmail: 'hello@verapep.eu', deliveryEstimate: '7–10 days', deliveryCountryCount: 27, deliveryCountries: 'Sweden', orderingStatus: 'No products can be ordered at the moment.', labReportStatus: 'No lab reports have been published yet.', companyLine: 'Not published yet.' } };
  const expectations = [
    ['How long does delivery take?', 'knowledge', 'delivery'],
    ['how long does delivry take', 'knowledge', 'delivery'],
    ['hur lång är leveranstiden', 'knowledge', 'delivery'],
    ['contcat', 'knowledge', 'contact'],
    ['jag vill klaga', 'knowledge', 'contact'],
    ['what is your refund policy', 'knowledge', 'returns'],
    ['cancel my order', 'knowledge', 'returns'],
    ['kan jag betala med swish', 'knowledge', 'payment'],
    ['privcy', 'knowledge', 'privacy'],
    ['can I trust this site', 'knowledge', 'verification'],
    ['are you an AI?', 'knowledge', 'about-vera'],
    ['glutation lab report', 'product', 'product:glutathione-056'],
    ['epitalon', 'product', 'product:epithalon-023'],
    ['is selank available', 'product', 'product:selank-021'],
    ['semaglutid price', 'unknown_product', 'unknown_product'],
    ['ozempic price', 'unknown_product', 'unknown_product'],
    ['do you sell mounjaro', 'unknown_product', 'unknown_product'],
    ['botox', 'unknown_product', 'unknown_product'],
    ['BPC157 dosage', 'safety', 'safety'],
    ['does GHK-CU help wrinkles', 'safety', 'safety'],
    ['what are the effects of BPC 157', 'safety', 'safety'],
    ['hjälper KPV mot inflammation', 'safety', 'safety'],
    ['vad används selank till', 'safety', 'safety'],
    ['is it safe to inject this', 'safety', 'safety'],
    ['asdfgh qwerty', 'fallback', 'fallback']
  ];
  const failures = [];
  for (const [question, kind, source] of expectations) {
    const answer = answerQuestion(question, ctx);
    if (answer.kind !== kind || answer.source !== source) failures.push(`${question} → ${answer.kind}/${answer.source} (expected ${kind}/${source})`);
    assert.doesNotMatch(answer.answer, /\{\w+\}/, `placeholder leaked for: ${question}`);
    if (answer.kind === 'safety') assert.ok(!answer.links.some(link => link.url.includes('/product/')), `no product link in a refusal: ${question}`);
  }
  assert.deepEqual(failures, []);
  assert.match(answerQuestion('glutation', ctx).answer, /^I assume you mean Glutathione\./, 'a corrected spelling is stated, not silently assumed');
  const descriptions = ['support.html', 'index.html'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.match(descriptions, /does not write its own answers/, 'the site explains that Vera is not generative AI');
  assert.doesNotMatch(descriptions, /AI support|AI assistant|chatbot/i);
});
