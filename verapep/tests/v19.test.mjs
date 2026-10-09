import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVerapepServer } from '../server.mjs';
import { diffWords, validateDraft, sanitiseFields } from '../lib/content-workflow.mjs';
import { detectType, imageSize } from '../lib/documents.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFiles = ['catalogue.json','commerce-policy.json','inventory.json','store-config.json','orders.json','returns.json','withdrawals.json','product-content.json','reviews.json','guide-config.json','support-kb.json','customers.json','product-compliance.json'];

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, status: response.status };
}
async function tempData() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'verapep-v19-'));
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
  const result = await jsonRequest(baseUrl, '/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(result.status, 200, `login ${email}`);
  return { Cookie: result.response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.payload.csrf };
}
async function addUser(baseUrl, owner, email, role) {
  const password = `${role}-password-v19!`;
  const created = await jsonRequest(baseUrl, '/api/admin/users', { method: 'POST', headers: owner, body: JSON.stringify({ email, password, role, displayName: role }) });
  assert.equal(created.status, 201);
  return login(baseUrl, email, password);
}
const post = (baseUrl, headers, pathname, body = {}) => jsonRequest(baseUrl, pathname, { method: 'POST', headers, body: JSON.stringify(body) });
const patch = (baseUrl, headers, pathname, body = {}) => jsonRequest(baseUrl, pathname, { method: 'PATCH', headers, body: JSON.stringify(body) });

function fakePng(width, height) {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
}
const fakePdf = text => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
async function upload(baseUrl, headers, productId, buffer, { kind, title, supersedes } = {}) {
  return jsonRequest(baseUrl, `/api/admin/products/${productId}/documents`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'X-Document-Kind': kind, 'X-Document-Title': encodeURIComponent(title), ...(supersedes ? { 'X-Supersedes': supersedes } : {}) }, body: buffer });
}

test('v19 content workflow library: diff, validation and sanitising', () => {
  const diff = diffWords('Store cold and dry.', 'Store cold, dark and dry.');
  assert.ok(diff.some(part => part.type === 'added' && /dark/.test(part.text)));
  assert.ok(diff.some(part => part.type === 'removed'));
  assert.equal(diff.filter(part => part.type !== 'removed').map(part => part.text).join(''), 'Store cold, dark and dry.');
  assert.deepEqual(validateDraft({}).errors, ['The draft does not change anything.']);
  assert.ok(validateDraft({ shortDescription: '<script>alert(1)</script>' }).errors.some(error => /scripts/.test(error)));
  assert.ok(validateDraft({ fullDescription: 'Lorem ipsum dolor' }).errors.some(error => /placeholder/.test(error)));
  const claim = validateDraft({ shortDescription: 'Clinically proven to heal injuries and cure inflammation.' });
  assert.equal(claim.needsExternalReview, true, 'therapeutic claims need an external review');
  assert.ok(validateDraft({ imageDocumentId: 'doc_x' }, { documents: [{ id: 'doc_x', kind: 'product_image', status: 'unverified' }] }).errors.some(error => /verified/.test(error)));
  assert.deepEqual(Object.keys(sanitiseFields({ shortDescription: 'a', published: true, availableForSale: true })), ['shortDescription'], 'drafts cannot carry publication or sale flags');
  assert.equal(detectType(fakePdf('x')).mime, 'application/pdf');
  assert.equal(detectType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.deepEqual(imageSize(fakePng(1200, 900), 'image/png'), { width: 1200, height: 900 });
});

test('v19 draft → internal review → apply: separate from legal approval, never publishes', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const editor = await addUser(baseUrl, owner, 'editor@example.com', 'editor');
    const productId = 'kpv-071';
    const before = await jsonRequest(baseUrl, `/api/admin/products/${productId}/workspace`, { headers: owner });
    assert.equal(before.status, 200);
    const visibleBefore = before.payload.summary.publiclyVisible;
    const legalBefore = before.payload.compliance.status;

    // Editors cannot change customer-visible text directly any more.
    const direct = await patch(baseUrl, editor, `/api/admin/product-content/${productId}`, { shortDescription: 'Changed directly by an editor.' });
    assert.equal(direct.status, 403);
    assert.equal(direct.payload.error, 'use_draft_workflow');

    const text = 'Peptide reference material supplied as a lyophilised powder in sealed vials.';
    const created = await post(baseUrl, editor, `/api/admin/products/${productId}/drafts`, { fields: { shortDescription: text, published: true }, sources: [{ field: 'shortDescription', kind: 'supplier', ref: 'Supplier sheet 2026-03' }] });
    assert.equal(created.status, 201);
    const id = created.payload.draft.id;
    assert.equal(created.payload.draft.status, 'draft');
    assert.equal(created.payload.draft.fields.published, undefined);

    assert.equal((await post(baseUrl, editor, `/api/admin/drafts/${id}/apply`, { confirm: true })).status, 409, 'a draft cannot be applied before review');
    assert.equal((await post(baseUrl, editor, `/api/admin/drafts/${id}/submit`)).payload.draft.status, 'internal_review');
    assert.equal((await post(baseUrl, editor, `/api/admin/drafts/${id}/review`, { decision: 'approve' })).status, 403, 'editors cannot approve');

    const queue = await jsonRequest(baseUrl, '/api/admin/review-queue', { headers: owner });
    const queued = queue.payload.items.find(item => item.id === id);
    assert.ok(queued, 'draft appears in the review queue');
    assert.ok(queued.diff[0].parts.some(part => part.type === 'added'), 'reviewer sees a word diff');

    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'request_changes' })).status, 400, 'asking for changes needs a note');
    const reviewed = await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'approve', note: 'Matches the supplier sheet.' });
    assert.equal(reviewed.payload.draft.status, 'approved');

    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, {})).payload.error, 'apply_confirmation_required');
    const applied = await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true });
    assert.equal(applied.status, 200);
    assert.equal(applied.payload.draft.status, 'applied');

    const after = await jsonRequest(baseUrl, `/api/admin/products/${productId}/workspace`, { headers: owner });
    assert.equal(after.payload.live.shortDescription, text);
    assert.equal(after.payload.summary.publiclyVisible, visibleBefore, 'applying text does not change visibility');
    assert.equal(after.payload.compliance.status, legalBefore, 'applying text does not change legal status');
    assert.deepEqual(after.payload.versions.map(version => version.workflow), ['draft', 'baseline'], 'earlier text is kept as a version');
    assert.ok(after.payload.activity.some(entry => entry.action === 'content.draft_applied'));

    // Applied drafts cannot be re-approved or re-applied.
    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true })).status, 409);
  } finally { await stop(server); }
});

test('v19 claims need an external review and nobody approves their own text by accident', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const admin = await addUser(baseUrl, owner, 'second@example.com', 'admin');
    const created = await post(baseUrl, admin, '/api/admin/products/kpv-071/drafts', { fields: { fullDescription: 'Clinically proven to heal injuries and reduce inflammation.' } });
    const id = created.payload.draft.id;
    assert.equal(created.payload.validation.needsExternalReview, true);
    await post(baseUrl, admin, `/api/admin/drafts/${id}/submit`);
    assert.equal((await post(baseUrl, admin, `/api/admin/drafts/${id}/review`, { decision: 'approve' })).payload.error, 'self_review_not_allowed');
    const internal = await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'approve', note: 'Editorially fine.' });
    assert.equal(internal.payload.draft.status, 'external_review', 'claim text is not approved by an internal review alone');
    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true })).status, 409);
    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${id}/external-review`, { decision: 'approve', reviewer: 'X' })).payload.error, 'external_reference_required');
    const external = await post(baseUrl, owner, `/api/admin/drafts/${id}/external-review`, { decision: 'request_changes', reviewer: 'Law firm AB', reference: 'Memo 2026-14', note: 'Remove the claim.' });
    assert.equal(external.payload.draft.status, 'rejected');

    // Owner self-review only with an explicit confirmation.
    const own = await post(baseUrl, owner, '/api/admin/products/kpv-071/drafts', { fields: { storage: 'Store at -20 °C, protected from light.' } });
    await post(baseUrl, owner, `/api/admin/drafts/${own.payload.draft.id}/submit`);
    assert.equal((await post(baseUrl, owner, `/api/admin/drafts/${own.payload.draft.id}/review`, { decision: 'approve' })).status, 409);
    const self = await post(baseUrl, owner, `/api/admin/drafts/${own.payload.draft.id}/review`, { decision: 'approve', selfReviewConfirmed: true });
    assert.equal(self.payload.draft.status, 'approved');
    assert.equal(self.payload.draft.reviews[0].selfReview, true, 'self-review is recorded as such');
  } finally { await stop(server); }
});

test('v19 documents are private, type-checked, and replacing one triggers re-review', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const productId = 'kpv-071';
    assert.equal((await upload(baseUrl, owner, productId, Buffer.from('<html>not a pdf</html>'), { kind: 'lab_report', title: 'COA batch A' })).status, 415, 'type is checked by content');
    assert.equal((await upload(baseUrl, owner, productId, fakePdf('a'), { kind: 'unknown', title: 'COA batch A' })).status, 400);
    assert.equal((await upload(baseUrl, {}, productId, fakePdf('a'), { kind: 'lab_report', title: 'COA batch A' })).status, 401);
    const first = await upload(baseUrl, owner, productId, fakePdf('a'), { kind: 'lab_report', title: 'COA batch A, Lab X' });
    assert.equal(first.status, 201);
    const doc = first.payload.document;
    assert.equal(doc.status, 'unverified');
    assert.equal(doc.visibility, 'internal');

    // Never public: not via static paths, not via product-media, not without a session.
    assert.equal((await fetch(`${baseUrl}/data/documents/${doc.storedAs}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/documents/${doc.storedAs}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/product-media/${doc.storedAs}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/admin/documents/${doc.id}/file`)).status, 401);
    const download = await fetch(`${baseUrl}/api/admin/documents/${doc.id}/file`, { headers: owner });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /^attachment/);
    assert.match(download.headers.get('content-security-policy'), /sandbox/);
    const storefront = await (await fetch(`${baseUrl}/api/storefront`)).text();
    assert.ok(!storefront.includes(doc.id), 'documents never appear in public data');
    assert.ok(fs.statSync(path.join(dataDir, 'documents', doc.storedAs)).mode & 0o600);

    assert.equal((await patch(baseUrl, owner, `/api/admin/documents/${doc.id}`, { status: 'verified' })).payload.error, 'verification_note_required');
    assert.equal((await patch(baseUrl, owner, `/api/admin/documents/${doc.id}`, { status: 'verified', note: 'Batch and lab match the label.' })).payload.document.status, 'verified');

    // A draft citing that document is approved; then the document is replaced.
    const draft = await post(baseUrl, owner, `/api/admin/products/${productId}/drafts`, { fields: { ingredients: 'KPV acetate, lyophilised.' }, sources: [{ field: 'ingredients', kind: 'document', ref: doc.id }] });
    const id = draft.payload.draft.id;
    await post(baseUrl, owner, `/api/admin/drafts/${id}/submit`);
    await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'approve', selfReviewConfirmed: true });
    const replaced = await upload(baseUrl, owner, productId, fakePdf('b'), { kind: 'lab_report', title: 'COA batch A, Lab X (corrected)', supersedes: doc.id });
    assert.equal(replaced.status, 201);
    assert.equal(replaced.payload.flaggedForReReview, 1);
    const blocked = await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true });
    assert.equal(blocked.payload.error, 're_review_required');
    const docs = await jsonRequest(baseUrl, `/api/admin/products/${productId}/documents`, { headers: owner });
    assert.equal(docs.payload.documents.find(item => item.id === doc.id).supersededBy, replaced.payload.document.id, 'the old version is kept and linked');

    // Support staff have no access to product documents.
    const support = await addUser(baseUrl, owner, 'support@example.com', 'support');
    assert.equal((await fetch(`${baseUrl}/api/admin/documents/${doc.id}/file`, { headers: support })).status, 403);
  } finally { await stop(server); }
});

test('v19 product photo: needs verification, review and a visible product before it is served', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const storefront = await (await fetch(`${baseUrl}/api/storefront`)).json();
    const visibleId = storefront.products[0].id;
    const small = await upload(baseUrl, owner, visibleId, fakePng(400, 400), { kind: 'product_image', title: 'Front photo' });
    assert.ok(small.payload.warnings.some(warning => /800 px/.test(warning)), 'low resolution is warned about');
    const photo = await upload(baseUrl, owner, visibleId, fakePng(1600, 1600), { kind: 'product_image', title: 'Front photo, studio' });
    const doc = photo.payload.document;
    assert.equal((await post(baseUrl, owner, `/api/admin/products/${visibleId}/drafts`, { fields: { imageDocumentId: doc.id, imageAlt: 'Vial front' } })).status, 400, 'unverified images cannot be chosen');
    await patch(baseUrl, owner, `/api/admin/documents/${doc.id}`, { status: 'verified', note: 'Photo of the actual product.' });
    assert.equal((await fetch(`${baseUrl}/product-media/${doc.storedAs}`)).status, 404, 'verified but not applied: still private');
    const draft = await post(baseUrl, owner, `/api/admin/products/${visibleId}/drafts`, { fields: { imageDocumentId: doc.id, imageAlt: 'Vial front' }, purpose: 'product_image' });
    const id = draft.payload.draft.id;
    await post(baseUrl, owner, `/api/admin/drafts/${id}/submit`);
    await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'approve', selfReviewConfirmed: true });
    await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true });
    const served = await fetch(`${baseUrl}/product-media/${doc.storedAs}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    // Hiding the product hides its photo.
    await patch(baseUrl, owner, `/api/admin/product-content/${visibleId}`, { published: false });
    assert.equal((await fetch(`${baseUrl}/product-media/${doc.storedAs}`)).status, 404);
  } finally { await stop(server); }
});

test('v19 import creates drafts only, after preview and an explicit count confirmation', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const csv = 'productId,shortDescription,storage,published\nkpv-071,"Reference material, lyophilised.",Store at -20 °C,true\nnope-000,Text,,\nghk-cu-043,<script>x</script>,,\n';
    const preview = await post(baseUrl, owner, '/api/admin/import/preview', { format: 'csv', content: csv, filename: 'supplier.csv' });
    assert.equal(preview.status, 200);
    assert.equal(preview.payload.valid, 1);
    assert.equal(preview.payload.invalid, 2);
    assert.ok(preview.payload.rows[0].warnings.some(warning => /published/.test(warning)), 'publication columns are ignored');
    const compliance = fs.readFileSync(path.join(dataDir, 'product-compliance.json'), 'utf8');
    const unconfirmed = await post(baseUrl, owner, '/api/admin/import/apply', { format: 'csv', content: csv, filename: 'supplier.csv' });
    assert.equal(unconfirmed.status, 409);
    const applied = await post(baseUrl, owner, '/api/admin/import/apply', { format: 'csv', content: csv, filename: 'supplier.csv', confirmCount: 1 });
    assert.equal(applied.status, 201);
    assert.equal(applied.payload.created.length, 1);
    const drafts = await jsonRequest(baseUrl, '/api/admin/products/kpv-071/drafts', { headers: owner });
    assert.equal(drafts.payload.drafts[0].status, 'draft', 'imported text is a draft, not live, not approved');
    assert.equal(drafts.payload.drafts[0].sources[0].kind, 'import');
    const content = await jsonRequest(baseUrl, '/api/admin/products/kpv-071/workspace', { headers: owner });
    assert.notEqual(content.payload.live.shortDescription, 'Reference material, lyophilised.');
    assert.equal(fs.readFileSync(path.join(dataDir, 'product-compliance.json'), 'utf8'), compliance, 'legal records untouched');
    assert.equal((await post(baseUrl, owner, '/api/admin/import/preview', { format: 'json', content: '{bad' })).status, 400);
  } finally { await stop(server); }
});

test('v19 overview separates technical checks from legal launch readiness', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const { status, payload } = await jsonRequest(baseUrl, '/api/admin/overview', { headers: owner });
    assert.equal(status, 200);
    assert.equal(payload.legal.approvedForLaunch, false);
    assert.ok(payload.technical.checks.length >= 6);
    assert.ok(payload.technical.checks.every(check => ['ok', 'attention', 'blocked'].includes(check.status)));
    assert.equal(JSON.stringify(payload).match(/percent|"score"/gi), null, 'no combined percentage');
    assert.equal(payload.documentation.total, 84);
    assert.ok(payload.documentation.byItem.find(item => item.id === 'lab').missing > 0);
    assert.equal(payload.health.database.integrity, 'ok');
    assert.ok(payload.content.images.flagged.length > 0, 'image audit is shown');
    assert.ok(payload.priorities.length > 0 && payload.priorities[0].rank === 1);
    assert.equal((await fetch(`${baseUrl}/api/admin/overview`)).status, 401);

    // A direct edit by the owner is recorded as an unreviewed live version and surfaced.
    await patch(baseUrl, owner, '/api/admin/product-content/kpv-071', { storage: 'Store frozen.' });
    const after = await jsonRequest(baseUrl, '/api/admin/overview', { headers: owner });
    assert.equal(after.payload.technical.checks.find(check => check.id === 'unreviewed').status, 'attention');
    const workspace = await jsonRequest(baseUrl, '/api/admin/products/kpv-071/workspace', { headers: owner });
    assert.equal(workspace.payload.versions[0].workflow, 'direct');
  } finally { await stop(server); }
});

test('v19 new admin features cannot bypass the legal gate', async () => {
  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const owner = await login(baseUrl);
    const hidden = (await jsonRequest(baseUrl, '/api/admin/workspace/products', { headers: owner })).payload.products.find(product => !product.publiclyVisible);
    assert.ok(hidden, 'some products are hidden by the gate');
    const draft = await post(baseUrl, owner, `/api/admin/products/${hidden.id}/drafts`, { fields: { shortDescription: 'Reference material in sealed vials, supplied for laboratory use.' } });
    const id = draft.payload.draft.id;
    await post(baseUrl, owner, `/api/admin/drafts/${id}/submit`);
    await post(baseUrl, owner, `/api/admin/drafts/${id}/review`, { decision: 'approve', selfReviewConfirmed: true });
    await post(baseUrl, owner, `/api/admin/drafts/${id}/apply`, { confirm: true });
    const storefront = await (await fetch(`${baseUrl}/api/storefront`)).json();
    assert.ok(!storefront.products.some(product => product.id === hidden.id), 'complete, approved text does not publish a hidden product');
    assert.equal((await fetch(`${baseUrl}/product/${hidden.id}`)).status, 404);
    // There is no bulk approval route for drafts.
    assert.equal((await post(baseUrl, owner, '/api/admin/drafts/bulk', { ids: [id], decision: 'approve' })).status, 404);
    // Workspace endpoints are admin-only.
    for (const pathname of ['/api/admin/workspace/products', `/api/admin/products/${hidden.id}/workspace`, '/api/admin/review-queue']) assert.equal((await fetch(`${baseUrl}${pathname}`)).status, 401);
  } finally { await stop(server); }
});

test('v19 image audit report is current', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-site-images.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('v19 Ask Vera answers in Swedish only with an approved, current translation', async () => {
  const { detectLanguage } = await import('../lib/vera-language.mjs');
  assert.equal(detectLanguage('Hur lång är leveranstiden?'), 'sv');
  assert.equal(detectLanguage('Vad kostar frakten till Sverige'), 'sv');
  assert.equal(detectLanguage('How long does delivery take?'), 'en');
  assert.equal(detectLanguage('BPC-157'), 'en');
  assert.equal(detectLanguage('delivery', 'sv'), 'sv', 'an explicit choice wins');

  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'data', 'vera-translations.json'), 'utf8'));
  assert.ok(Object.values(shipped.languages.sv.items).every(item => item.status === 'proposed'), 'shipped translations are proposals, not approvals');

  const dataDir = await tempData();
  const { server, baseUrl } = await start(dataDir);
  try {
    const ask = (question, extra = {}) => jsonRequest(baseUrl, '/api/support/ask', { method: 'POST', body: JSON.stringify({ question, ...extra }) }).then(result => result.payload);
    const before = await ask('Hur lång är leveranstiden?');
    assert.equal(before.language, 'en');
    assert.match(before.languageNotice, /granskad svensk översättning/);
    assert.equal(before.source, 'delivery');

    const owner = await login(baseUrl);
    const list = await jsonRequest(baseUrl, '/api/admin/vera-translations', { headers: owner });
    assert.equal(list.payload.items.find(item => item.key === 'entry:delivery').status, 'proposed');
    assert.equal((await patch(baseUrl, owner, '/api/admin/vera-translations/sv/entry:delivery', { action: 'approve' })).payload.error, 'approval_confirmation_required');
    const editor = await addUser(baseUrl, owner, 'kb-editor@example.com', 'editor');
    assert.equal((await patch(baseUrl, editor, '/api/admin/vera-translations/sv/entry:delivery', { action: 'approve', confirm: true })).status, 403, 'editors cannot approve');
    assert.equal((await patch(baseUrl, editor, '/api/admin/vera-translations/sv/entry:delivery', { action: 'save', text: 'Leverans tar {deliveryEstimate}.' })).payload.error, 'translation_placeholders', 'placeholders must match the source');
    assert.equal((await patch(baseUrl, owner, '/api/admin/vera-translations/sv/entry:delivery', { action: 'approve', confirm: true })).status, 200);

    const after = await ask('Hur lång är leveranstiden?');
    assert.equal(after.language, 'sv');
    assert.match(after.answer, /EU-länder/);
    assert.doesNotMatch(after.answer, /\b(No products can be ordered|days)\b/, 'placeholders are filled in Swedish');
    assert.equal(after.languageNotice, undefined);
    assert.equal((await ask('How long does delivery take?')).language, 'en', 'English questions stay English');

    // Safety refusals stay refusals in every language; unapproved safety text falls back to English.
    const safety = await ask('Hur mycket ska jag injicera per dag?');
    assert.equal(safety.kind, 'safety');
    assert.match(safety.answer, /medical advice/);

    // When the English source changes, the old approval is no longer used.
    const kb = await jsonRequest(baseUrl, '/api/admin/dashboard', { headers: owner });
    const entries = kb.payload.supportKb.entries.map(entry => entry.id === 'delivery' ? { ...entry, answer: `${entry.answer} Tracking is provided by the carrier.` } : entry);
    const saved = await patch(baseUrl, owner, '/api/admin/support-kb', { entries, fallback: kb.payload.supportKb.fallback });
    assert.equal(saved.status, 200, JSON.stringify(saved.payload));
    assert.equal((await ask('Hur lång är leveranstiden?')).language, 'en');
    const outdated = await jsonRequest(baseUrl, '/api/admin/vera-translations', { headers: owner });
    assert.equal(outdated.payload.items.find(item => item.key === 'entry:delivery').status, 'outdated');
  } finally { await stop(server); }
});
