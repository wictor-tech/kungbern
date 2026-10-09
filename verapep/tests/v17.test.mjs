import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';
import { APPROVAL_CONFIRMATION, approveForSale } from './support/compliance.mjs';
import { suggestRisk } from '../lib/compliance.mjs';
import { answerQuestion } from '../lib/vera.mjs';
import { hashEntry, planMigration, applyPlan, loadShipped } from '../lib/support-kb-migration.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json','product-compliance.json'];
const nodeBin = process.execPath;

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function tempData(overrides = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v17-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(dir, name));
  for (const [name, content] of Object.entries(overrides)) await fsp.writeFile(path.join(dir, name), content);
  return dir;
}
async function start(dataDir) {
  const server = createVerapepServer({ rootDir: root, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}
const stop = server => new Promise(resolve => server.close(resolve));
async function login(baseUrl, email = 'admin@verapep.local', password = 'ChangeMe-123!') {
  const result = await jsonRequest(baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.response.status, 200, `login ${email}`);
  return { Cookie: result.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.payload.csrf };
}

test('v17 publication gate: regulatory high-risk products are not public until reviewed', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalogue.json'), 'utf8'));
  const highRisk = catalogue.products.filter(product => suggestRisk(product).level === 'high');
  const store = (await jsonRequest(baseUrl, '/api/storefront')).payload;

  await t.test('storefront, counts and categories only describe visible products', () => {
    assert.ok(highRisk.length >= 40, 'expected the known prescription/hormone substances to be flagged');
    const ids = new Set(store.products.map(product => product.id));
    for (const product of highRisk) assert.equal(ids.has(product.id), false, `${product.name} must be hidden`);
    assert.equal(store.productCount, catalogue.products.length - highRisk.length);
    assert.equal(store.categories.reduce((sum, category) => sum + category.count, 0), store.productCount);
    assert.equal(store.publication.gate, 'preview');
  });

  await t.test('hidden products are unreachable through every public route', async () => {
    const hidden = catalogue.products.find(product => product.id === 'semaglutide-003');
    assert.equal((await fetch(`${baseUrl}/product/${hidden.id}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/shop/${hidden.id}.html`)).status, 404);
    const content = (await jsonRequest(baseUrl, '/api/product-content')).payload;
    assert.equal(Object.hasOwn(content.products, hidden.id), false);
    const review = await jsonRequest(baseUrl, '/api/reviews', { method: 'POST', body: JSON.stringify({ productId: hidden.id, rating: 5, text: 'Trying to post on a hidden product.' }) });
    assert.equal(review.response.status, 404);
    const quote = await jsonRequest(baseUrl, '/api/quote', { method: 'POST', body: JSON.stringify({ items: [{ variantId: hidden.variants[0].variantId, quantity: 1 }] }) });
    assert.equal(quote.response.status, 400);
    const guide = await jsonRequest(baseUrl, '/api/guide/recommendations', { method: 'POST', body: JSON.stringify({ focuses: ['weight-metabolism'] }) });
    assert.ok(guide.payload.products.every(product => !highRisk.some(item => item.id === product.id)));
    const vera = await jsonRequest(baseUrl, '/api/support/ask', { method: 'POST', body: JSON.stringify({ question: 'Tell me about semaglutide' }) });
    assert.equal(vera.payload.kind, 'unknown_product');
    assert.doesNotMatch(JSON.stringify(vera.payload), /semaglutide-003/);
  });

  await t.test('renaming or aliasing a product to a regulated substance cannot bypass the gate', async () => {
    const owner = await login(baseUrl);
    const visible = store.products.find(product => product.id === 'bpc-157-009');
    assert.ok(visible);
    const renamed = await jsonRequest(baseUrl, `/api/admin/product-content/${visible.id}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ searchAliases: ['semaglutide alternative'] }) });
    assert.equal(renamed.response.status, 200);
    assert.equal((await fetch(`${baseUrl}/product/${visible.id}`)).status, 404);
    await jsonRequest(baseUrl, `/api/admin/product-content/${visible.id}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ searchAliases: [] }) });
    assert.equal((await fetch(`${baseUrl}/product/${visible.id}`)).status, 200);
  });
});

test('v17 review workflow: only a recorded owner approval unlocks publication or sale', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const owner = await login(baseUrl);
  const created = await jsonRequest(baseUrl, '/api/admin/users', { method: 'POST', headers: owner, body: JSON.stringify({ email: 'editor17@example.com', password: 'Editor-password-17', role: 'editor', displayName: 'Editor' }) });
  assert.equal(created.response.status, 201);
  const editor = await login(baseUrl, 'editor17@example.com', 'Editor-password-17');
  const productId = 'ghk-cu-043';

  await t.test('sale cannot be switched on without approval', async () => {
    const quick = await jsonRequest(baseUrl, `/api/admin/products/${productId}/webshop`, { method: 'POST', headers: owner, body: JSON.stringify({ enabled: true }) });
    assert.equal(quick.response.status, 409);
    assert.equal(quick.payload.error, 'compliance_approval_required');
    const content = await jsonRequest(baseUrl, `/api/admin/product-content/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ availableForSale: true }) });
    assert.equal(content.response.status, 409);
    const policy = await jsonRequest(baseUrl, `/api/admin/products/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ sandboxEnabled: true }) });
    assert.equal(policy.response.status, 409);
    const fakeLive = await jsonRequest(baseUrl, `/api/admin/products/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ status: 'live_approved' }) });
    assert.equal(fakeLive.response.status, 400);
  });

  await t.test('editors can triage but cannot approve; approval needs reference, reviewer, scope and markets', async () => {
    const triage = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { method: 'PATCH', headers: editor, body: JSON.stringify({ status: 'needs_evidence', note: 'No documentation on file.' }) });
    assert.equal(triage.response.status, 200);
    assert.equal(triage.payload.row.review.status, 'needs_evidence');
    const editorApproval = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { method: 'PATCH', headers: editor, body: JSON.stringify({ status: 'approved_for_publication', confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-1', reviewer: 'Someone', scope: 'sale', markets: ['SE'] }) });
    assert.equal(editorApproval.response.status, 403);
    for (const [body, error] of [
      [{ reviewReference: 'REF-1', reviewer: 'Law firm', scope: 'sale', markets: ['SE'] }, 'approval_confirmation_required'],
      [{ confirmation: APPROVAL_CONFIRMATION, reviewer: 'Law firm', scope: 'sale', markets: ['SE'] }, 'review_reference_required'],
      [{ confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-1', scope: 'sale', markets: ['SE'] }, 'reviewer_required'],
      [{ confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-1', reviewer: 'Law firm', markets: ['SE'] }, 'approval_scope_required'],
      [{ confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-1', reviewer: 'Law firm', scope: 'sale', markets: ['US'] }, 'approval_markets_required']
    ]) {
      const result = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ status: 'approved_for_publication', ...body }) });
      assert.equal(result.response.status, 400, error);
      assert.equal(result.payload.error, error);
    }
  });

  await t.test('an approval for information only still does not allow sale', async () => {
    const info = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ status: 'approved_for_publication', confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-INFO', reviewer: 'Law firm', scope: 'information', markets: ['SE'] }) });
    assert.equal(info.response.status, 200);
    const quick = await jsonRequest(baseUrl, `/api/admin/products/${productId}/webshop`, { method: 'POST', headers: owner, body: JSON.stringify({ enabled: true }) });
    assert.equal(quick.response.status, 409);
  });

  await t.test('a sale approval is market-specific and revoking it switches sale off', async () => {
    await approveForSale(baseUrl, owner, productId, ['SE']);
    const quick = await jsonRequest(baseUrl, `/api/admin/products/${productId}/webshop`, { method: 'POST', headers: owner, body: JSON.stringify({ enabled: true }) });
    assert.equal(quick.response.status, 200);
    const variant = quick.payload.product.variants.find(item => item.checkoutEnabled);
    assert.ok(variant);
    const base = { items: [{ variantId: variant.variantId, quantity: 1 }], customer: { name: 'Test', email: 't17@example.com' }, acceptTerms: true, acceptSandboxNotice: true };
    const blocked = await jsonRequest(baseUrl, '/api/orders', { method: 'POST', body: JSON.stringify({ ...base, shippingAddress: { line1: 'Teststrasse 1', city: 'Berlin', postalCode: '10115', country: 'DE' } }) });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.payload.error, 'country_not_approved');
    const revoked = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ status: 'in_legal_review', note: 'Re-review requested.' }) });
    assert.equal(revoked.response.status, 200);
    assert.equal(revoked.payload.commerceRevoked, true);
    const store = (await jsonRequest(baseUrl, '/api/storefront')).payload;
    assert.equal(store.products.find(item => item.id === productId).commerce.checkoutEnabled, false);
    const detail = await jsonRequest(baseUrl, `/api/admin/compliance/${productId}`, { headers: owner });
    assert.ok(detail.payload.history.length >= 4, 'every decision is kept in the history');
  });

  await t.test('bulk changes need an explicit count and never approve', async () => {
    const ids = ['nad-064', 'kpv-071', 'selank-021'];
    const unconfirmed = await jsonRequest(baseUrl, '/api/admin/compliance/bulk', { method: 'POST', headers: owner, body: JSON.stringify({ productIds: ids, status: 'needs_evidence', note: 'No documents yet' }) });
    assert.equal(unconfirmed.response.status, 409);
    assert.equal(unconfirmed.payload.count, 3);
    const confirmed = await jsonRequest(baseUrl, '/api/admin/compliance/bulk', { method: 'POST', headers: owner, body: JSON.stringify({ productIds: ids, status: 'needs_evidence', note: 'No documents yet', confirmCount: 3 }) });
    assert.equal(confirmed.response.status, 200);
    const approve = await jsonRequest(baseUrl, '/api/admin/compliance/bulk', { method: 'POST', headers: owner, body: JSON.stringify({ productIds: ids, status: 'approved_for_publication', note: 'x', confirmCount: 3 }) });
    assert.equal(approve.response.status, 400);
    const hide = await jsonRequest(baseUrl, '/api/admin/compliance/bulk', { method: 'POST', headers: owner, body: JSON.stringify({ productIds: ['nad-064'], status: 'do_not_publish', note: 'Owner decision', confirmCount: 1 }) });
    assert.equal(hide.response.status, 200);
    assert.equal((await fetch(`${baseUrl}/product/nad-064`)).status, 404);
  });

  await t.test('launch readiness reports the missing compliance approvals', async () => {
    const ready = await jsonRequest(baseUrl, '/api/ready');
    assert.equal(ready.response.status, 503);
    assert.equal(ready.payload.ready, false);
    assert.ok(ready.payload.warnings.some(item => /no final compliance decision/.test(item)));
  });
});

test('v17 strict gate (production behaviour) hides everything that is not approved', async t => {
  const previous = process.env.PUBLICATION_GATE;
  process.env.PUBLICATION_GATE = 'strict';
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); if (previous === undefined) delete process.env.PUBLICATION_GATE; else process.env.PUBLICATION_GATE = previous; await fsp.rm(dataDir, { recursive: true, force: true }); });
  let store = (await jsonRequest(baseUrl, '/api/storefront')).payload;
  assert.equal(store.products.length, 0);
  assert.equal(store.publication.gate, 'strict');
  const owner = await login(baseUrl);
  const approved = await jsonRequest(baseUrl, '/api/admin/compliance/kpv-071', { method: 'PATCH', headers: owner, body: JSON.stringify({ status: 'approved_for_publication', confirmation: APPROVAL_CONFIRMATION, reviewReference: 'REF-STRICT', reviewer: 'Law firm', scope: 'information', markets: ['SE'] }) });
  assert.equal(approved.response.status, 200);
  store = (await jsonRequest(baseUrl, '/api/storefront')).payload;
  assert.deepEqual(store.products.map(product => product.id), ['kpv-071']);
  assert.equal(store.products[0].commerce.checkoutEnabled, false);
});

test('v17 Ask Vera answers safely, honestly and without storing questions', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const ask = async (question, extra = {}) => (await jsonRequest(baseUrl, '/api/support/ask', { method: 'POST', body: JSON.stringify({ question, ...extra }) })).payload;

  await t.test('medical, dosing and health-goal questions are refused before anything else', async () => {
    for (const question of ['How much semaglutide should I inject to lose weight?', 'what is the dosage of BPC 157', 'Which peptide should I take for my diabetes?', 'Hur mycket ska jag ta för att gå ner i vikt?', 'side effects of GHK-Cu', 'best product to build muscle for me']) {
      const answer = await ask(question);
      assert.equal(answer.kind, 'safety', question);
      assert.match(answer.answer, /does not give medical advice/);
      assert.ok(!answer.links.some(link => /product|catalogue|focus/.test(link.url)), `no product links for: ${question}`);
    }
  });

  await t.test('site questions in English and Swedish get approved answers with configured values', async () => {
    const delivery = await ask('How long does delivery take?');
    assert.equal(delivery.source, 'delivery');
    assert.match(delivery.answer, /7–10 days/);
    assert.match(delivery.answer, /27 EU countries/);
    assert.doesNotMatch(delivery.answer, /\{\w+\}/);
    const contact = await ask('hur kontaktar jag er?');
    assert.equal(contact.source, 'contact');
    assert.match(contact.answer, /hello@verapep\.eu/);
    assert.equal((await ask('vem står bakom sidan?')).source, 'company');
    assert.equal((await ask('var är min beställning')).source, 'track-order');
    assert.equal((await ask('Can I pay with Klarna?')).source, 'payment');
  });

  await t.test('product answers use published facts only', async () => {
    const answer = await ask('Is there a lab report for GHK-CU?');
    assert.equal(answer.kind, 'product');
    assert.match(answer.answer, /No lab report has been published/);
    assert.equal(answer.url, '/product/ghk-cu-043');
    const overview = await ask('tell me about BPC 157');
    assert.match(overview.answer, /No product description has been published yet/);
    assert.match(overview.answer, /cannot be ordered/);
    const context = await ask('is there a lab report?', { productId: 'kpv-071' });
    assert.equal(context.source, 'product:kpv-071');
  });

  await t.test('unknown questions get an honest fallback, personal data a notice', async () => {
    const fallback = await ask('What is the airspeed velocity of an unladen swallow?');
    assert.equal(fallback.answered, false);
    assert.equal(fallback.kind, 'fallback');
    assert.ok(fallback.suggestions.length > 0);
    assert.match(fallback.liveSupport, /^mailto:/);
    const personal = await ask('my email is anna@example.com, where is my order?');
    assert.ok(personal.notice);
    assert.equal(personal.source, 'track-order');
  });

  await t.test('questions are not written to the database or logs', async () => {
    const marker = `vera-marker-${Date.now()}`;
    await ask(`${marker} delivery`);
    const db = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'), { readOnly: true });
    const rows = db.prepare('SELECT value_json FROM documents UNION ALL SELECT COALESCE(after_json, \'\') FROM audit_log').all();
    db.close();
    assert.ok(rows.every(row => !Object.values(row)[0].includes(marker)));
  });

  await t.test('rate limiting protects the endpoint', async () => {
    let limited = null;
    for (let index = 0; index < 35 && !limited; index += 1) {
      const result = await jsonRequest(baseUrl, '/api/support/ask', { method: 'POST', body: JSON.stringify({ question: 'delivery' }) });
      if (result.response.status === 429) limited = result;
    }
    assert.ok(limited, 'expected a 429 within 35 requests');
    assert.ok(limited.response.headers.get('retry-after'));
  });
});

test('v17 knowledge migration updates old answers, keeps admin edits, is idempotent and reversible', async t => {
  const v16Kb = JSON.stringify({
    version: 2,
    entries: [
      { id: 'kb-1', question: 'delivery shipping time', answer: 'The estimated delivery time is 7–10 days to the configured European countries. Final delivery terms are published on the Shipping & returns page before sales open.', url: 'shipping-returns.html' },
      { id: 'kb-2', question: 'price pricing vat shipping', answer: 'Our own wording about prices.', url: '' },
      { id: 'kb-3', question: 'opening hours', answer: 'We answer email on weekdays.', url: '' },
      { id: 'kb-4', question: 'rating ratings review reviews stars', answer: 'Only admin-approved reviews appear publicly and affect product averages. Products without approved reviews show “No ratings yet”.', url: 'index.html#catalogue' }
    ],
    fallback: 'I could not find an approved answer for that question. Please contact live support.'
  });
  const dataDir = await tempData({ 'support-kb.json': v16Kb });
  let running = await start(dataDir);
  t.after(async () => { await stop(running.server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const owner = await login(running.baseUrl);

  await t.test('the server reports pending updates but never applies them by itself', async () => {
    const dashboard = (await jsonRequest(running.baseUrl, '/api/admin/dashboard', { headers: owner })).payload;
    assert.equal(dashboard.supportKbStatus.upToDate, false);
    assert.ok(dashboard.supportKbStatus.pendingWrites > 0);
    const kb = dashboard.supportKb;
    assert.equal(kb.version, 2, 'stored knowledge is untouched until someone applies the update');
  });

  let snapshot;
  await t.test('dry run shows exactly what changes and what is kept', async () => {
    const { payload } = await jsonRequest(running.baseUrl, '/api/admin/support-kb/migration', { headers: owner });
    const byId = Object.fromEntries(payload.plan.changes.map(change => [change.currentId || change.id, change]));
    assert.equal(byId['kb-1'].action, 'update');
    assert.equal(byId['kb-1'].id, 'delivery');
    assert.equal(byId['kb-2'].action, 'keep_customised');
    assert.equal(byId['kb-3'].action, 'keep_custom');
    assert.equal(byId['kb-4'].action, 'update', 'v14.1 wording is recognised as previously shipped');
    assert.ok(payload.plan.changes.some(change => change.action === 'add' && change.id === 'contact'));
    assert.ok(!payload.plan.changes.some(change => change.action === 'add' && change.id === 'pricing'), 'an edited shipped answer is not duplicated');
    assert.equal(payload.plan.fallback.action, 'update');
    const unconfirmed = await jsonRequest(running.baseUrl, '/api/admin/support-kb/migration', { method: 'POST', headers: owner, body: JSON.stringify({}) });
    assert.equal(unconfirmed.response.status, 409);
    const applied = await jsonRequest(running.baseUrl, '/api/admin/support-kb/migration', { method: 'POST', headers: owner, body: JSON.stringify({ confirmWrites: payload.plan.writes }) });
    assert.equal(applied.response.status, 200);
    assert.equal(applied.payload.applied, true);
    snapshot = applied.payload.snapshot;
    assert.ok(fs.existsSync(path.join(dataDir, 'backups', snapshot)));
    assert.ok(fs.existsSync(path.join(dataDir, 'backups', applied.payload.databaseBackup)), 'a full database backup is taken first');
    const kb = applied.payload.supportKb;
    assert.equal(kb.entries.find(entry => entry.id === 'kb-2').answer, 'Our own wording about prices.');
    assert.equal(kb.entries.find(entry => entry.id === 'kb-3').answer, 'We answer email on weekdays.');
    assert.equal(new Set(kb.entries.map(entry => entry.id)).size, kb.entries.length, 'no duplicate ids');
    assert.equal((await jsonRequest(running.baseUrl, '/api/support/ask', { method: 'POST', body: JSON.stringify({ question: 'how do I contact you' }) })).payload.source, 'contact');
  });

  await t.test('running it again changes nothing, also after a restart', async () => {
    const again = await jsonRequest(running.baseUrl, '/api/admin/support-kb/migration', { method: 'POST', headers: owner, body: JSON.stringify({ confirmWrites: 0 }) });
    assert.equal(again.payload.applied, false);
    await stop(running.server);
    running = await start(dataDir);
    const owner2 = await login(running.baseUrl);
    const plan = (await jsonRequest(running.baseUrl, '/api/admin/support-kb/migration', { headers: owner2 })).payload.plan;
    assert.equal(plan.upToDate, true);
    const cli = execFileSync(nodeBin, ['--no-warnings', 'scripts/migrate-support-kb.mjs', '--data-dir', dataDir], { cwd: root, encoding: 'utf8' });
    assert.match(cli, /Nothing to change/);
  });

  await t.test('rollback restores the previous answers and keeps a safety snapshot', async () => {
    const owner3 = await login(running.baseUrl);
    const traversal = await jsonRequest(running.baseUrl, '/api/admin/support-kb/rollback', { method: 'POST', headers: owner3, body: JSON.stringify({ snapshot: '../verapep.sqlite', confirm: true }) });
    assert.equal(traversal.response.status, 400);
    const restored = await jsonRequest(running.baseUrl, '/api/admin/support-kb/rollback', { method: 'POST', headers: owner3, body: JSON.stringify({ snapshot, confirm: true }) });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.supportKb.version, 2);
    assert.equal(restored.payload.supportKb.entries.length, 4);
    assert.ok(fs.existsSync(path.join(dataDir, 'backups', restored.payload.safetySnapshot)));
  });
});

test('v17 knowledge editor keeps ids, validates links and protects against mass removal', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });
  const owner = await login(baseUrl);
  const kb = (await jsonRequest(baseUrl, '/api/admin/dashboard', { headers: owner })).payload.supportKb;
  const bad = await jsonRequest(baseUrl, '/api/admin/support-kb', { method: 'PATCH', headers: owner, body: JSON.stringify({ entries: [...kb.entries, { title: 'x', keywords: ['x'], answer: 'x', url: 'javascript:alert(1)' }] }) });
  assert.equal(bad.response.status, 400);
  const fewer = kb.entries.slice(3);
  const unconfirmed = await jsonRequest(baseUrl, '/api/admin/support-kb', { method: 'PATCH', headers: owner, body: JSON.stringify({ entries: fewer }) });
  assert.equal(unconfirmed.response.status, 409);
  const saved = await jsonRequest(baseUrl, '/api/admin/support-kb', { method: 'PATCH', headers: owner, body: JSON.stringify({ entries: fewer.map((entry, index) => index === 0 ? { ...entry, answer: `${entry.answer} Edited.`, locked: true } : entry), confirmRemoved: 3 }) });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.payload.supportKb.entries.map(entry => entry.id), fewer.map(entry => entry.id));
  assert.deepEqual(saved.payload.supportKb.removedShippedIds.sort(), kb.entries.slice(0, 3).map(entry => entry.id).sort());
  const plan = (await jsonRequest(baseUrl, '/api/admin/support-kb/migration', { headers: owner })).payload.plan;
  assert.equal(plan.changes.filter(change => change.action === 'skip_removed').length, 3, 'deliberately removed answers are not re-added');
  assert.equal(plan.changes.find(change => change.id === fewer[0].id).action, 'keep_locked');
});

test('v17 knowledge migration library is pure and deterministic', () => {
  const { shipped, history } = loadShipped(root);
  const fresh = structuredClone(shipped);
  assert.equal(planMigration(fresh, shipped, history).upToDate, true);
  const changed = structuredClone(shipped);
  changed.entries[0].answer = 'edited';
  const plan = planMigration(changed, shipped, history);
  assert.equal(plan.changes[0].action, 'keep_customised');
  const applied = applyPlan(changed, shipped, plan, { by: 'test' });
  assert.equal(applied.entries[0].answer, 'edited');
  assert.equal(hashEntry({ question: ' a  b ', answer: 'c', url: '' }), hashEntry({ question: 'a b', answer: 'c ', url: '' }));
});

test('v17 security: closed public file surface, no secrets in responses or audit, safe inputs', async t => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  t.after(async () => { await stop(server); await fsp.rm(dataDir, { recursive: true, force: true }); });

  await t.test('server code, scripts, tests and internal documents are not served', async () => {
    for (const pathname of ['/server.mjs', '/database.mjs', '/lib/vera.mjs', '/package.json', '/README.md', '/SECURITY.md', '/scripts/backup-sqlite.mjs', '/scripts/source/catalogue-data.js', '/tests/e2e.py', '/sql/postgres-schema.sql', '/catalogue-audit.csv', '/docs/v16-before-after/home-before.jpg', '/data/verapep.sqlite', '/.env']) {
      assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 404, pathname);
    }
    for (const pathname of ['/', '/support.html', '/assets/app.js', '/assets/bundle-pages.css', '/robots.txt']) assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 200, pathname);
    const shell = await (await fetch(`${baseUrl}/assets/catalogue-data.js`)).text();
    assert.doesNotMatch(shell, /semaglutide|priceUsd|variantId/i, 'the static catalogue shell exposes no products or prices');
  });

  await t.test('admin user responses and the audit log never contain password hashes or MFA secrets', async () => {
    const owner = await login(baseUrl);
    const created = await jsonRequest(baseUrl, '/api/admin/users', { method: 'POST', headers: owner, body: JSON.stringify({ email: 'support17@example.com', password: 'Support-password-17', role: 'support' }) });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.user.passwordHash, undefined);
    const updated = await jsonRequest(baseUrl, '/api/admin/users/support17%40example.com', { method: 'PATCH', headers: owner, body: JSON.stringify({ password: 'Another-password-17' }) });
    assert.equal(updated.payload.user.passwordHash, undefined);
    const audit = await jsonRequest(baseUrl, '/api/admin/audit', { headers: owner });
    assert.doesNotMatch(JSON.stringify(audit.payload), /scrypt\$|passwordHash|mfaSecret/);
  });

  await t.test('reviews reject contact details; stored links must be safe', async () => {
    const review = await jsonRequest(baseUrl, '/api/reviews', { method: 'POST', body: JSON.stringify({ productId: 'kpv-071', rating: 4, text: 'Call me on +46 70 123 45 67 for details' }) });
    assert.equal(review.response.status, 400);
    assert.equal(review.payload.error, 'review_contains_personal_data');
    const dated = await jsonRequest(baseUrl, '/api/reviews', { method: 'POST', body: JSON.stringify({ productId: 'kpv-071', rating: 4, text: 'Arrived 2026-10-01, well packed.' }) });
    assert.equal(dated.response.status, 201);
    const owner = await login(baseUrl);
    const image = await jsonRequest(baseUrl, '/api/admin/product-content/kpv-071', { method: 'PATCH', headers: owner, body: JSON.stringify({ imageUrl: 'javascript:alert(1)' }) });
    assert.equal(image.response.status, 400);
    const reports = await jsonRequest(baseUrl, '/api/admin/product-content/kpv-071', { method: 'PATCH', headers: owner, body: JSON.stringify({ labReports: [{ title: 'bad', url: 'javascript:alert(1)', published: true }, { title: 'ok', url: 'https://example.com/report.pdf', published: false }] }) });
    assert.equal(reports.response.status, 200);
    assert.deepEqual(reports.payload.content.labReports.map(item => item.title), ['ok']);
  });

  await t.test('an editor cannot switch store-wide checkout on as a side effect', async () => {
    const owner = await login(baseUrl);
    await jsonRequest(baseUrl, '/api/admin/settings', { method: 'PATCH', headers: owner, body: JSON.stringify({ checkoutMode: 'catalogue_only' }) });
    await approveForSale(baseUrl, owner, 'kpv-071');
    await jsonRequest(baseUrl, '/api/admin/users', { method: 'POST', headers: owner, body: JSON.stringify({ email: 'ed@example.com', password: 'Editor-password-17', role: 'editor' }) });
    const editor = await login(baseUrl, 'ed@example.com', 'Editor-password-17');
    const result = await jsonRequest(baseUrl, '/api/admin/products/kpv-071/webshop', { method: 'POST', headers: editor, body: JSON.stringify({ enabled: true }) });
    assert.equal(result.response.status, 403);
  });
});

test('v17 backup and restore drill on a test database', async t => {
  const dataDir = await tempData();
  t.after(() => fsp.rm(dataDir, { recursive: true, force: true }));
  let running = await start(dataDir);
  let owner = await login(running.baseUrl);
  await jsonRequest(running.baseUrl, '/api/admin/settings', { method: 'PATCH', headers: owner, body: JSON.stringify({ storeName: 'Before backup' }) });
  const backupOut = execFileSync(nodeBin, ['--no-warnings', 'scripts/backup-sqlite.mjs'], { cwd: root, env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8' });
  const backupFile = backupOut.match(/Backup written: (.+?\.sqlite)/)[1];
  await jsonRequest(running.baseUrl, '/api/admin/settings', { method: 'PATCH', headers: owner, body: JSON.stringify({ storeName: 'After backup' }) });
  await stop(running.server);

  const dry = execFileSync(nodeBin, ['--no-warnings', 'scripts/restore-sqlite.mjs', backupFile, '--data-dir', dataDir], { cwd: root, encoding: 'utf8' });
  assert.match(dry, /Dry run/);
  const restored = execFileSync(nodeBin, ['--no-warnings', 'scripts/restore-sqlite.mjs', backupFile, '--yes', '--data-dir', dataDir], { cwd: root, encoding: 'utf8' });
  assert.match(restored, /Restored/);
  const safety = restored.match(/Current database saved as (.+?\.sqlite)/)[1];
  assert.ok(fs.existsSync(safety));

  running = await start(dataDir);
  t.after(() => stop(running.server));
  assert.equal((await jsonRequest(running.baseUrl, '/api/storefront')).payload.config.storeName, 'Before backup');
  owner = await login(running.baseUrl);
  assert.equal((await jsonRequest(running.baseUrl, '/api/admin/dashboard', { headers: owner })).response.status, 200, 'admin accounts survive the restore');

  const bogus = path.join(dataDir, 'not-a-db.sqlite');
  fs.writeFileSync(bogus, 'not a database');
  assert.throws(() => execFileSync(nodeBin, ['--no-warnings', 'scripts/restore-sqlite.mjs', bogus, '--yes', '--data-dir', dataDir], { cwd: root, stdio: 'pipe' }));
});

test('v17 Vera engine unit behaviour', () => {
  const kb = JSON.parse(fs.readFileSync(path.join(root, 'data', 'support-kb.json'), 'utf8'));
  const ctx = { kb, products: [], hiddenNames: [], vars: { supportEmail: 'help@example.com' } };
  assert.equal(answerQuestion('How long does it take to ship?', ctx).source, 'delivery', '"how long … take" about delivery is not a dosing question');
  assert.equal(answerQuestion('how do I inject this', ctx).kind, 'safety');
  assert.equal(answerQuestion('Is my health data stored?', ctx).source, 'privacy');
  assert.equal(answerQuestion('hej', ctx).kind, 'greeting');
  assert.doesNotMatch(answerQuestion('who runs this', ctx).answer, /\{\w+\}/, 'unknown placeholders are never shown');
});
