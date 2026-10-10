/* VERAPEP v20 — regression tests for the defects found in the independent audit.
   Each test names the finding it guards (see V20-INDEPENDENT-AUDIT.md). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';
import { answerQuestion } from '../lib/vera.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json','product-compliance.json'];

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload, response };
}
async function tempData() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v20-'));
  for (const name of dataFiles) await fsp.copyFile(path.join(root, 'data', name), path.join(dir, name));
  return dir;
}
async function start(dataDir) {
  const server = createVerapepServer({ rootDir: root, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}
const stop = server => new Promise(resolve => server.close(resolve));
async function login(baseUrl, email = 'admin@verapep.local', password = 'ChangeMe-123!') {
  const result = await request(baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.status, 200, `login ${email}: ${JSON.stringify(result.payload)}`);
  return { Cookie: result.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.payload.csrf };
}
async function addUser(baseUrl, owner, email, role) {
  const password = `${role}-password-v20!`;
  assert.equal((await request(baseUrl, '/api/admin/users', { method: 'POST', headers: owner, body: JSON.stringify({ email, password, role }) })).status, 201);
  return { headers: await login(baseUrl, email, password), password };
}
const post = (baseUrl, headers, pathname, body = {}) => request(baseUrl, pathname, { method: 'POST', headers, body: JSON.stringify(body) });
const patch = (baseUrl, headers, pathname, body = {}) => request(baseUrl, pathname, { method: 'PATCH', headers, body: JSON.stringify(body) });
const fakePdf = text => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
function fakePng(width, height) {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'latin1'); buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
}
const upload = (baseUrl, headers, productId, buffer, extra = {}) => request(baseUrl, `/api/admin/products/${productId}/documents`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Document-Kind': extra.kind || 'lab_report', 'X-Document-Title': encodeURIComponent(extra.title || 'COA batch A'), ...(extra.supersedes ? { 'X-Supersedes': extra.supersedes } : {}) }, body: buffer });

test('v20 S1: encoded slashes cannot reach files outside /assets; bad encodings are 400, not 500', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    for (const attack of ['/assets%2F..%2Fserver.mjs', '/assets%2F..%2Fdata%2Fcatalogue.json', '/assets%2f..%2fpackage.json', '/assets/%2e%2e/server.mjs', '/assets%5C..%5Cserver.mjs', '/assets/..%2F..%2Fetc%2Fpasswd']) {
      const response = await fetch(`${baseUrl}${attack}`);
      assert.ok([400, 403, 404].includes(response.status), `${attack} -> ${response.status}`);
      assert.doesNotMatch(await response.text(), /createVerapepServer|"products"\s*:/, `${attack} leaked content`);
    }
    assert.equal((await fetch(`${baseUrl}/a%ZZ`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/orders/%ZZ`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/`, { headers: { Cookie: 'vp_admin=%ZZ; other=1' } })).status, 200, 'a malformed cookie does not break the site');
    assert.equal((await fetch(`${baseUrl}/assets/app.js`)).status, 200);
    const overview = await request(baseUrl, '/api/admin/overview', { headers: await login(baseUrl) });
    assert.equal(overview.payload.health.errors.length, 0, 'client errors are not logged as server errors');
  } finally { await stop(server); }
});

test('v20 S2/S3: account changes end sessions at once; the last owner is protected', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const editor = await addUser(baseUrl, owner, 'ed@example.com', 'editor');
    assert.equal((await request(baseUrl, '/api/admin/workspace/products', { headers: editor.headers })).status, 200);
    assert.equal((await patch(baseUrl, owner, '/api/admin/users/ed%40example.com', { role: 'support' })).status, 200);
    assert.equal((await request(baseUrl, '/api/admin/session', { headers: editor.headers })).payload.role, 'support', 'role change applies to the open session');
    assert.equal((await request(baseUrl, '/api/admin/workspace/products', { headers: editor.headers })).status, 403);
    assert.equal((await patch(baseUrl, owner, '/api/admin/users/ed%40example.com', { enabled: false })).status, 200);
    assert.equal((await request(baseUrl, '/api/admin/workspace/products', { headers: editor.headers })).status, 401, 'disabled account is signed out');
    // Password change ends other sessions.
    const admin = await addUser(baseUrl, owner, 'ad@example.com', 'admin');
    assert.equal((await patch(baseUrl, owner, '/api/admin/users/ad%40example.com', { password: 'A-new-password-v20!' })).status, 200);
    assert.equal((await request(baseUrl, '/api/admin/overview', { headers: admin.headers })).status, 401);
    // Last owner.
    const demote = await patch(baseUrl, owner, '/api/admin/users/admin%40verapep.local', { role: 'admin' });
    assert.equal(demote.status, 409);
    assert.equal(demote.payload.error, 'last_owner');
    assert.equal((await patch(baseUrl, owner, '/api/admin/users/admin%40verapep.local', { enabled: false })).status, 409);
    const overwrite = await post(baseUrl, owner, '/api/admin/users', { email: 'admin@verapep.local', password: 'Overwrite-password-1', role: 'support' });
    assert.equal(overwrite.status, 409, '"add user" cannot overwrite an existing account');
    assert.equal((await request(baseUrl, '/api/admin/session', { headers: owner })).payload.role, 'owner');
    // Login form must be JSON (no cross-site form login).
    const formLogin = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) });
    assert.equal(formLogin.status, 415);
  } finally { await stop(server); }
});

test('v20 S4/S5: editors cannot publish or change visible content directly, nor undo owner decisions', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const editor = (await addUser(baseUrl, owner, 'ed@example.com', 'editor')).headers;
    const productId = (await (await fetch(`${baseUrl}/api/storefront`)).json()).products[0].id;
    for (const body of [{ imageUrl: 'https://evil.example/x.png' }, { labReports: [{ title: 'COA 99.9%', url: 'https://evil.example/coa.pdf', published: true }] }, { imageAlt: 'cures everything' }, { storage: 'Keep forever' }, { published: false }, { imageSrcset: 'https://evil.example/a.png 400w' }]) {
      const result = await patch(baseUrl, editor, `/api/admin/product-content/${productId}`, body);
      assert.equal(result.status, 403, `editor change ${Object.keys(body)[0]} must be refused`);
    }
    assert.equal((await patch(baseUrl, editor, `/api/admin/product-content/${productId}`, { searchAliases: ['alias'], imageSrcset: 'image-400.webp 400w' })).status, 200, 'search aliases and own-site srcset stay editable');
    const storefront = await (await fetch(`${baseUrl}/api/storefront`)).text();
    assert.doesNotMatch(storefront, /evil\.example|cures everything/);

    // Owner hides a product; the editor cannot bring it back.
    assert.equal((await patch(baseUrl, owner, `/api/admin/compliance/${productId}`, { status: 'do_not_publish', note: 'Owner decision' })).status, 200);
    assert.equal((await patch(baseUrl, editor, `/api/admin/compliance/${productId}`, { status: 'not_reviewed', note: 'Editor attempt' })).status, 403);
    const bulk = await post(baseUrl, editor, '/api/admin/compliance/bulk', { productIds: [productId], status: 'in_legal_review', note: 'Editor attempt', confirmCount: 1 });
    assert.equal(bulk.status, 403);
    assert.ok(!(await (await fetch(`${baseUrl}/api/storefront`)).json()).products.some(product => product.id === productId), 'product stays hidden');
    assert.equal((await patch(baseUrl, owner, `/api/admin/compliance/${productId}`, { status: 'not_reviewed', note: 'Owner reverses' })).status, 200, 'the owner can still change it');
  } finally { await stop(server); }
});

test('v20 S6: whoever edited or submitted a draft cannot approve it (four eyes)', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const editor = (await addUser(baseUrl, owner, 'ed@example.com', 'editor')).headers;
    const admin = (await addUser(baseUrl, owner, 'ad@example.com', 'admin')).headers;
    const draft = (await post(baseUrl, editor, '/api/admin/products/kpv-071/drafts', { fields: { storage: 'Store cold.' } })).payload.draft;
    assert.equal((await patch(baseUrl, admin, `/api/admin/drafts/${draft.id}`, { fields: { storage: 'Store at -20 °C, rewritten by the admin.' } })).status, 200);
    await post(baseUrl, admin, `/api/admin/drafts/${draft.id}/submit`);
    const self = await post(baseUrl, admin, `/api/admin/drafts/${draft.id}/review`, { decision: 'approve' });
    assert.equal(self.status, 409);
    assert.equal(self.payload.error, 'self_review_not_allowed');
    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${draft.id}/review`, { decision: 'approve' })).payload.draft.status, 'approved', 'an independent reviewer can approve');
  } finally { await stop(server); }
});

test('v20 A1: a refused apply changes nothing; apply is all-or-nothing', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const productId = 'kpv-071';
    const photo = (await upload(baseUrl, owner, productId, fakePng(1600, 1600), { kind: 'product_image', title: 'Front photo' })).payload.document;
    await patch(baseUrl, owner, `/api/admin/documents/${photo.id}`, { status: 'verified', note: 'Real product photo.' });
    const draft = (await post(baseUrl, owner, `/api/admin/products/${productId}/drafts`, { fields: { storage: 'UNREVIEWED TEXT MUST NOT GO LIVE', imageDocumentId: photo.id, imageAlt: 'Vial' } })).payload.draft;
    await post(baseUrl, owner, `/api/admin/drafts/${draft.id}/submit`);
    await post(baseUrl, owner, `/api/admin/drafts/${draft.id}/review`, { decision: 'approve', selfReviewConfirmed: true });
    await patch(baseUrl, owner, `/api/admin/documents/${photo.id}`, { status: 'rejected', note: 'Wrong batch on label.' });
    const refused = await post(baseUrl, owner, `/api/admin/drafts/${draft.id}/apply`, { confirm: true });
    assert.equal(refused.status, 409);
    const workspace = (await request(baseUrl, `/api/admin/products/${productId}/workspace`, { headers: owner })).payload;
    assert.notEqual(workspace.live.storage, 'UNREVIEWED TEXT MUST NOT GO LIVE', 'memory unchanged');
    assert.equal(workspace.versions.length, 0);
    // An unrelated save must not persist the refused text either.
    await patch(baseUrl, owner, '/api/admin/product-content/aicar-025', { deliveryEstimate: '5–8 days' });
    await stop(server);
    const again = await start(dataDir);
    try {
      const reloaded = (await request(again.baseUrl, `/api/admin/products/${productId}/workspace`, { headers: await login(again.baseUrl) })).payload;
      assert.notEqual(reloaded.live.storage, 'UNREVIEWED TEXT MUST NOT GO LIVE', 'database unchanged');
      assert.equal(reloaded.drafts.find(item => item.id === draft.id).status, 'approved');
    } finally { await stop(again.server); }
  } finally { if (server.listening) await stop(server); }
});

test('v20 A2: when the database is locked, nothing half-saved stays in memory', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const before = (await request(baseUrl, '/api/admin/products/kpv-071/workspace', { headers: owner })).payload.live.storage;
    const holder = spawn(process.execPath, ['--no-warnings', '-e', `const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(${JSON.stringify(path.join(dataDir, 'verapep.sqlite'))}); db.exec('BEGIN IMMEDIATE'); console.log('locked'); setTimeout(() => { db.exec('ROLLBACK'); process.exit(0); }, 7000);`], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise(resolve => holder.stdout.once('data', resolve));
    const failed = await patch(baseUrl, owner, '/api/admin/product-content/kpv-071', { storage: 'Written while the database was locked' });
    assert.equal(failed.status, 503, JSON.stringify(failed.payload));
    assert.match(failed.payload.message, /Nothing was saved/);
    await new Promise(resolve => holder.once('exit', resolve));
    const after = (await request(baseUrl, '/api/admin/products/kpv-071/workspace', { headers: owner })).payload.live.storage;
    assert.equal(after, before, 'memory was reloaded from the database after the failed write');
  } finally { await stop(server); }
});

test('v20 A3/A4: fresh DATA_DIR starts; restore brings documents back; scripts refuse while the server runs', async () => {
  const empty = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v20-empty-'));
  const fresh = await start(empty);
  try {
    assert.equal((await fetch(`${fresh.baseUrl}/api/health`)).status, 200, 'an empty persistent disk can boot');
    assert.ok((await (await fetch(`${fresh.baseUrl}/api/storefront`)).json()).products.length > 0);
    assert.ok(fs.existsSync(path.join(empty, '.server.pid')));
    const refused = spawnSync(process.execPath, [path.join(root, 'scripts', 'migrate-support-kb.mjs'), '--apply', '--data-dir', empty], { encoding: 'utf8' });
    assert.equal(refused.status, 3, refused.stderr);
    assert.match(refused.stderr, /server .* is running/);
    const restoreRefused = spawnSync(process.execPath, [path.join(root, 'scripts', 'restore-sqlite.mjs'), path.join(empty, 'verapep.sqlite'), '--yes', '--data-dir', empty], { encoding: 'utf8' });
    assert.notEqual(restoreRefused.status, 0);

    const owner = await login(fresh.baseUrl);
    const doc = (await upload(fresh.baseUrl, owner, 'kpv-071', fakePdf('one'))).payload.document;
    const backup = spawnSync(process.execPath, [path.join(root, 'scripts', 'backup-sqlite.mjs')], { encoding: 'utf8', env: { ...process.env, DATA_DIR: empty } });
    assert.equal(backup.status, 0, backup.stderr);
    const backupFile = backup.stdout.match(/Backup written: (\S+\.sqlite)/)[1];
    fs.rmSync(path.join(empty, 'documents'), { recursive: true });
    const missing = await fetch(`${fresh.baseUrl}/api/admin/documents/${doc.id}/file`, { headers: owner });
    assert.equal(missing.status, 404, 'a missing file is a clear 404, not a 500');
    assert.equal((await missing.json()).error, 'document_file_missing');
    await stop(fresh.server);
    assert.ok(!fs.existsSync(path.join(empty, '.server.pid')), 'the marker is removed on shutdown');
    const restore = spawnSync(process.execPath, [path.join(root, 'scripts', 'restore-sqlite.mjs'), backupFile, '--yes', '--data-dir', empty], { encoding: 'utf8' });
    assert.equal(restore.status, 0, restore.stderr);
    assert.match(restore.stdout, /Restored 1 product document/);
    const again = await start(empty);
    try {
      assert.equal((await fetch(`${again.baseUrl}/api/admin/documents/${doc.id}/file`, { headers: await login(again.baseUrl) })).status, 200);
    } finally { await stop(again.server); }
  } finally { if (fresh.server.listening) await stop(fresh.server); }
});

test('v20 D1: only the newest version of a document can be replaced; support has no overview', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const first = (await upload(baseUrl, owner, 'kpv-071', fakePdf('v1'))).payload.document;
    assert.equal((await upload(baseUrl, owner, 'kpv-071', fakePdf('v2'), { supersedes: first.id })).status, 201);
    const twice = await upload(baseUrl, owner, 'kpv-071', fakePdf('v3'), { supersedes: first.id });
    assert.equal(twice.status, 409);
    assert.equal(twice.payload.error, 'document_already_replaced');
    const current = (await request(baseUrl, '/api/admin/products/kpv-071/documents', { headers: owner })).payload.documents.filter(doc => !doc.supersededBy);
    assert.equal(current.length, 1, 'exactly one current version');
    const support = (await addUser(baseUrl, owner, 'sup@example.com', 'support')).headers;
    assert.equal((await request(baseUrl, '/api/admin/overview', { headers: support })).status, 403);
  } finally { await stop(server); }
});

test('v20 V1: Ask Vera — Swedish typos, multilingual dosing refusals, no hidden-name oracle', () => {
  const kb = JSON.parse(fs.readFileSync(path.join(root, 'data', 'support-kb.json'), 'utf8'));
  const ctx = { kb, products: [], hiddenNames: ['Ipamorelin'], vars: { supportEmail: 'help@example.com' } };
  const ask = question => answerQuestion(question, ctx);
  for (const [question, source] of [['leverns tid', 'delivery'], ['retrunera en vara', 'returns'], ['betalnig', 'payment'], ['integritte', 'privacy']]) assert.equal(ask(question).source, source, question);
  for (const question of ['hur doserar jag bpc', 'hur ofta ska man ta kpv', 'wie dosiere ich bpc', 'nebenwirkungen', 'dosis de bpc', 'efectos secundarios', 'd0sage of bpc', 'inj3ct bpc', 'mg per kg', 'hur blandar jag pulvret med vatten', 'bakteriostatiskt vatten', 'bästa peptiden för muskler', 'recommend something for sleep', 'kan barn använda']) {
    assert.equal(ask(question).kind, 'safety', question);
  }
  for (const question of ['how long does delivery take', 'hur lång är leveranstiden', 'can I compare products', 'how do I mix products in the comparison', 'hur returnerar jag', 'What is the airspeed velocity of an unladen swallow?']) {
    assert.notEqual(ask(question).kind, 'safety', `false refusal: ${question}`);
  }
  assert.equal(ask('tell me about ipamorelin').kind, ask('tell me about xylophonide').kind, 'hidden and unknown names look the same');
  assert.equal(ask('What is the airspeed velocity of an unladen swallow?').kind, 'fallback');
});

test('v20 C1: no unapproved "Research Use Only" claim in the vial illustration; cache versions match file contents', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'assets', 'vial-renderer.js'), 'utf8'), /research use only/i);
  const check = spawnSync(process.execPath, [path.join(root, 'scripts', 'asset-versions.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});

test('v20 I1: an import row for an unknown product reports only that problem', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const preview = await post(baseUrl, await login(baseUrl), '/api/admin/import/preview', { format: 'csv', content: 'name,desc\nfoo,bar' });
    assert.deepEqual(preview.payload.rows[0].errors, ['Missing productId.']);
  } finally { await stop(server); }
});

test('v20 H1: public deployments never accept the built-in admin password; Vercel gets no live stream', async () => {
  const dataDir = await tempData();
  const saved = { VERCEL: process.env.VERCEL, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD };
  process.env.VERCEL = '1';
  delete process.env.ADMIN_PASSWORD;
  const { server, baseUrl } = await start(dataDir);
  try {
    const login = await request(baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email: 'admin@verapep.local', password: 'ChangeMe-123!' }) });
    assert.equal(login.status, 503);
    assert.equal(login.payload.error, 'admin_password_not_configured');
    assert.equal((await fetch(`${baseUrl}/api/storefront/events`)).status, 204);
    assert.equal((await request(baseUrl, '/api/health')).payload.publicationGate, 'strict', 'hosted previews only list approved products');
  } finally {
    await stop(server);
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('v20 H2: private demo mode — unreviewed products only behind a site-wide password on public hosts', async () => {
  const keys = ['RENDER', 'PUBLICATION_GATE', 'SITE_ACCESS_PASSWORD', 'ADMIN_PASSWORD'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const restore = () => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  try {
    Object.assign(process.env, { RENDER: 'true', PUBLICATION_GATE: 'preview' });
    delete process.env.SITE_ACCESS_PASSWORD;
    let { server, baseUrl } = await start(await tempData());
    try {
      assert.equal((await request(baseUrl, '/api/health')).payload.publicationGate, 'strict', 'without the lock a public host stays strict');
      assert.equal((await (await fetch(`${baseUrl}/api/storefront`)).json()).products.length, 0);
    } finally { await stop(server); }

    process.env.SITE_ACCESS_PASSWORD = 'Demo-lock-password-1';
    ({ server, baseUrl } = await start(await tempData()));
    try {
      assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200, 'the platform health check stays open');
      for (const pathname of ['/', '/admin.html', '/api/storefront', '/product/aicar-025']) {
        const response = await fetch(`${baseUrl}${pathname}`);
        assert.equal(response.status, 401, pathname);
        assert.match(response.headers.get('www-authenticate'), /Basic/);
      }
      const wrong = { Authorization: `Basic ${Buffer.from('x:wrong').toString('base64')}` };
      assert.equal((await fetch(`${baseUrl}/`, { headers: wrong })).status, 401);
      const auth = { Authorization: `Basic ${Buffer.from('colleague:Demo-lock-password-1').toString('base64')}` };
      const storefront = await (await fetch(`${baseUrl}/api/storefront`, { headers: auth })).json();
      assert.equal(storefront.products.length, 40, 'behind the lock the preview gate lists the non-high-risk products');
      assert.ok(!storefront.products.some(product => product.commerce?.checkoutEnabled), 'nothing becomes purchasable');
      assert.equal((await fetch(`${baseUrl}/`, { headers: auth })).status, 200);
    } finally { await stop(server); }
  } finally { restore(); }
});

test('v20 H3: demo-all shows every product as information only, and only behind the site password', async () => {
  const keys = ['RENDER', 'PUBLICATION_GATE', 'SITE_ACCESS_PASSWORD'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const restore = () => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  try {
    Object.assign(process.env, { RENDER: 'true', PUBLICATION_GATE: 'demo-all' });
    delete process.env.SITE_ACCESS_PASSWORD;
    let { server, baseUrl } = await start(await tempData());
    try {
      assert.equal((await request(baseUrl, '/api/health')).payload.publicationGate, 'strict', 'demo-all without the lock falls back to strict');
    } finally { await stop(server); }

    process.env.SITE_ACCESS_PASSWORD = 'Demo-lock-password-1';
    const dataDir = await tempData();
    ({ server, baseUrl } = await start(dataDir));
    try {
      const auth = { Authorization: `Basic ${Buffer.from('demo:Demo-lock-password-1').toString('base64')}` };
      assert.equal((await fetch(`${baseUrl}/api/storefront`)).status, 401);
      const storefront = await (await fetch(`${baseUrl}/api/storefront`, { headers: auth })).json();
      assert.equal(storefront.products.length, 84, 'all products are listed in the private demo');
      assert.equal((await fetch(`${baseUrl}/product/semaglutide-003`, { headers: auth })).status, 200);
      const variant = storefront.products.flatMap(product => product.variants).find(item => item.variantId);
      assert.ok(storefront.products.every(product => product.variants.every(item => !item.checkoutEnabled)), 'nothing can be ordered');
      const order = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ variantId: variant.variantId, quantity: 1 }], customer: { name: 'Demo', email: 'demo@example.com' }, shippingAddress: { line1: 'x', city: 'x', postalCode: '1', country: 'SE' }, acceptTerms: true, acceptSandboxNotice: true }) });
      assert.notEqual(order.status, 201, 'ordering is refused');
    } finally { await stop(server); }
  } finally { restore(); }
});

test('v20 H4: DEMO_SHOW_ALL_PRODUCTS selects demo-all even when PUBLICATION_GATE is pinned to strict, still only behind the lock', async () => {
  const keys = ['RENDER', 'PUBLICATION_GATE', 'SITE_ACCESS_PASSWORD', 'DEMO_SHOW_ALL_PRODUCTS'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { RENDER: 'true', PUBLICATION_GATE: 'strict', DEMO_SHOW_ALL_PRODUCTS: 'true' });
    delete process.env.SITE_ACCESS_PASSWORD;
    let { server, baseUrl } = await start(await tempData());
    try { assert.equal((await request(baseUrl, '/api/health')).payload.publicationGate, 'strict'); } finally { await stop(server); }
    process.env.SITE_ACCESS_PASSWORD = 'Demo-lock-password-1';
    ({ server, baseUrl } = await start(await tempData()));
    // v21: /api/health only shows details to visitors who passed the lock.
    const auth = { Authorization: `Basic ${Buffer.from('demo:Demo-lock-password-1').toString('base64')}` };
    try { assert.equal((await request(baseUrl, '/api/health', { headers: auth })).payload.publicationGate, 'demo-all'); } finally { await stop(server); }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('v21 L1: the demo lock resists guessing, hides details, and cannot be misconfigured into a public demo', async () => {
  const keys = ['RENDER', 'APP_ENV', 'SITE_ACCESS_PASSWORD', 'DEMO_SHOW_ALL_PRODUCTS', 'TRUST_PROXY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { RENDER: 'true', APP_ENV: 'demo', DEMO_SHOW_ALL_PRODUCTS: 'true' });
    delete process.env.SITE_ACCESS_PASSWORD;
    await assert.rejects(tempData().then(start), /requires SITE_ACCESS_PASSWORD/, 'a public demo without the lock does not start');
    process.env.SITE_ACCESS_PASSWORD = ' ';
    await assert.rejects(tempData().then(start), /at least 10 characters/);
    process.env.SITE_ACCESS_PASSWORD = 'Demo-lock-password-1';
    const { server, baseUrl } = await start(await tempData());
    try {
      const outside = await request(baseUrl, '/api/health');
      assert.deepEqual(Object.keys(outside.payload).sort(), ['locked', 'ok', 'version'], 'no catalogue or mode details without the password');
      const wrong = { Authorization: `Basic ${Buffer.from('x:wrong-guess').toString('base64')}` };
      let last = 0;
      for (let attempt = 0; attempt < 32; attempt += 1) last = (await fetch(`${baseUrl}/`, { headers: wrong })).status;
      assert.equal(last, 429, 'repeated wrong passwords are rate limited');
      const right = { Authorization: `basic ${Buffer.from('anyone:Demo-lock-password-1').toString('base64')}` };
      assert.equal((await fetch(`${baseUrl}/api/storefront`, { headers: right })).status, 200, 'the scheme name is case-insensitive');
    } finally { await stop(server); }
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
