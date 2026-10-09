/* VERAPEP v19 — Owner Control Center, product workspace, content workflow, documents and import.

   Mounted by server.mjs. Every route requires an admin session; mutating routes require the CSRF
   token. Nothing here can publish a product, enable sale or record a legal approval: those remain
   the compliance endpoints (owner-only, single product, external reference). Editorial approval of
   text and legal approval of a product are separate records. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CONTENT_FIELDS, CLAIM_FIELDS, DRAFT_STATUS_LABELS, PURPOSES, productEntry, snapshot, sanitiseFields, validateDraft, draftDiff, newDraft, assertTransition, recordLiveVersion, WorkflowError } from './content-workflow.mjs';
import { DOCUMENT_KINDS, MAX_DOCUMENT_BYTES, detectType, imageSize, storeFile, readStoredFile, cleanTitle } from './documents.mjs';
import { REVIEW_STATUS_LABELS } from './compliance.mjs';

const EDITORIAL_REVIEWERS = new Set(['owner', 'admin']);
const MIN_PRODUCT_IMAGE_WIDTH = 800;

export function createV19(ctx) {
  const {
    rootDir, dataDir, database, catalogue, productsById, sendJson, sendFile, readJsonBody, requireAdmin, requireCsrf, requireRole, audit,
    getContent, getCompliance, getPolicy, getConfig, persistProductContent, persistCompliance, isPubliclyVisible, inventoryRow, gateMode,
    productionReadiness, supportKbStatus, recentErrors, veraStats, serverStartedAt, legalInfo, nowIso
  } = ctx;

  let workflow = database.readDocument('productWorkflow', { version: 1, products: {} });
  let documents = database.readDocument('productDocuments', { version: 1, documents: [] });
  const persistWorkflow = () => database.writeDocument('productWorkflow', workflow);
  const persistDocuments = () => database.writeDocument('productDocuments', documents);
  const docsFor = productId => documents.documents.filter(doc => doc.productId === productId);
  const allDrafts = () => Object.values(workflow.products).flatMap(entry => entry.drafts);
  const findDraft = id => allDrafts().find(draft => draft.id === id);
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

  /* ---------- completion checklist (shared by the workspace and the overview) ---------- */
  function checklist(product) {
    const content = getContent().products[product.id] || {};
    const record = { status: 'not_reviewed', ...(getCompliance().products?.[product.id] || {}) };
    const docs = docsFor(product.id).filter(doc => !doc.supersededBy);
    const verified = kind => docs.some(doc => doc.kind === kind && doc.status === 'verified');
    const has = field => String(content[field] || '').trim().length > 0;
    const entry = workflow.products[product.id];
    const open = (entry?.drafts || []).filter(draft => ['draft', 'internal_review', 'external_review', 'approved'].includes(draft.status));
    const items = [
      { id: 'text', group: 'content', label: 'Product text (short and full description)', done: has('shortDescription') && has('fullDescription'), next: 'Create a draft from verified supplier information and send it for review.' },
      { id: 'contents', group: 'content', label: 'Contents / composition', done: has('ingredients'), next: 'Copy the composition from a verified document into a draft.' },
      { id: 'storage', group: 'content', label: 'Storage information', done: has('storage'), next: 'Add storage conditions from the supplier sheet.' },
      { id: 'warnings', group: 'content', label: 'Warnings and limitations', done: has('warnings'), next: 'Add warnings approved by your legal reviewer.' },
      { id: 'lab', group: 'documents', label: 'Verified lab report / certificate of analysis', done: verified('lab_report') || (content.labReports || []).some(report => report.published && report.url), next: 'Upload the lab report and mark it verified after checking batch and lab.' },
      { id: 'supplier', group: 'documents', label: 'Verified supplier documentation', done: verified('supplier_sheet'), next: 'Upload the manufacturer or supplier document.' },
      { id: 'image', group: 'content', label: 'Product photograph (optional)', done: has('imageUrl'), optional: true, next: 'Upload a photo of at least 800 px, verify it, and choose it in a draft.' },
      { id: 'legal', group: 'legal', label: 'Legal classification and approval for publication', done: record.status === 'approved_for_publication', next: 'A qualified reviewer classifies the product; the owner records the decision under Compliance review.' },
      { id: 'markets', group: 'legal', label: 'Approved markets', done: record.status === 'approved_for_publication' && (record.markets || []).length > 0, next: 'Recorded together with the legal approval.' }
    ];
    const required = items.filter(item => !item.optional);
    const remaining = required.filter(item => !item.done);
    return {
      items,
      contentDone: required.filter(item => item.group !== 'legal' && item.done).length,
      contentTotal: required.filter(item => item.group !== 'legal').length,
      legalDone: required.filter(item => item.group === 'legal' && item.done).length,
      legalTotal: required.filter(item => item.group === 'legal').length,
      nextStep: open.find(draft => draft.status === 'approved') ? 'Apply the approved draft.' : open.find(draft => ['internal_review', 'external_review'].includes(draft.status)) ? 'A draft is waiting under Changes to review.' : remaining[0]?.next || 'Everything on the checklist is done.',
      openDrafts: open.length,
      needsReReview: (entry?.drafts || []).some(draft => draft.requiresReReview)
    };
  }

  function productSummary(product) {
    const content = getContent().products[product.id] || {};
    const row = inventoryRow(product, content, { status: 'not_reviewed', markets: [], evidence: [], history: [], ...(getCompliance().products?.[product.id] || {}) }, gateMode, getPolicy().products?.[product.id] || {});
    const list = checklist(product);
    const latest = workflow.products[product.id]?.versions?.slice(-1)[0];
    return {
      id: product.id, name: product.name, displayName: content.displayName || product.name, category: product.category,
      publiclyVisible: row.publiclyVisible, visibilityReason: row.visibilityReason, risk: row.suggestion.level,
      reviewStatus: row.review.status, reviewStatusLabel: REVIEW_STATUS_LABELS[row.review.status],
      contentDone: list.contentDone, contentTotal: list.contentTotal, legalDone: list.legalDone, legalTotal: list.legalTotal,
      missing: list.items.filter(item => !item.done && !item.optional).map(item => item.id),
      openDrafts: list.openDrafts, needsReReview: list.needsReReview, nextStep: list.nextStep,
      documents: docsFor(product.id).filter(doc => !doc.supersededBy).length,
      liveChangedWithoutReview: latest?.workflow === 'direct',
      hasImage: Boolean(content.imageUrl)
    };
  }

  /* ---------- Owner Control Center ---------- */
  function contentQuality() {
    const legal = legalInfo();
    const config = getConfig();
    const visible = catalogue.products.filter(product => isPubliclyVisible(product));
    const content = getContent().products;
    const pages = [];
    const legalIssues = [];
    if (/pending/i.test(legal.companyLegalName) || legal.companyRegistrationNumber === 'pending') legalIssues.push('Company name, registration number and address are not provided.');
    if (String(process.env.LEGAL_TERMS_REVIEW_ACK || '') !== 'true') legalIssues.push('Terms of sale are not written and approved.');
    pages.push({ page: 'Terms', url: '/terms.html', issues: legalIssues });
    pages.push({ page: 'Privacy', url: '/privacy.html', issues: String(process.env.PRIVACY_REVIEW_ACK || '') === 'true' ? [] : ['Privacy policy is not written and approved.'] });
    pages.push({ page: 'Shipping & returns', url: '/shipping-returns.html', issues: ['Final delivery, withdrawal and returns terms are not published.'] });
    const reportsPublished = visible.filter(product => (content[product.id]?.labReports || []).some(report => report.published && report.url)).length;
    const homeIssues = [];
    if ((config.trustSignals || []).some(signal => /lab report/i.test(signal)) && reportsPublished === 0) homeIssues.push('The trust bar mentions lab reports, but no lab report is published.');
    pages.push({ page: 'Home and trust bar', url: '/', issues: homeIssues });
    const withoutText = visible.filter(product => !String(content[product.id]?.shortDescription || '').trim()).length;
    pages.push({ page: 'Product pages', url: '/index.html#catalogue', issues: withoutText ? [`${withoutText} of ${visible.length} publicly listed products have no description and show "Not yet published".`] : [] });
    const kb = supportKbStatus();
    pages.push({ page: 'Ask Vera', url: '/support.html', issues: [...(kb.available && !kb.upToDate ? [`${kb.pendingWrites} knowledge update(s) are waiting to be applied.`] : []), ...(veraStats.byKind?.fallback ? [`${veraStats.byKind.fallback} question(s) had no answer since the last restart.`] : [])] });
    let images = { totals: null, flagged: [] };
    try {
      const report = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'image-audit.json'), 'utf8'));
      images = { totals: report.totals, flagged: report.images.filter(item => item.flags.length).map(item => ({ file: item.file, width: item.width, kb: Math.round(item.bytes / 1024), flags: item.flags })) };
    } catch { /* report missing */ }
    return { pages, images };
  }

  function backups() {
    const dir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
    if (!fs.existsSync(dir)) return { count: 0, newest: null };
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.sqlite')).map(name => ({ name, at: fs.statSync(path.join(dir, name)).mtime.toISOString() })).sort((a, b) => b.at.localeCompare(a.at));
    return { count: files.length, newest: files[0] || null };
  }

  function manifestInfo() {
    try {
      const head = fs.readFileSync(path.join(rootDir, 'FILE-MANIFEST.txt'), 'utf8').split('\n').slice(0, 6).join(' ');
      return { generated: head.match(/Generated: (\S+)/)?.[1] || null, files: Number(head.match(/Files listed: (\d+)/)?.[1] || 0) };
    } catch { return { generated: null, files: 0 }; }
  }

  function overview(session) {
    const readiness = productionReadiness();
    const health = database.health();
    const backup = backups();
    const hosted = Boolean(process.env.RENDER || process.env.VERCEL || String(process.env.BASE_URL || '').startsWith('https://'));
    const summaries = catalogue.products.map(productSummary);
    const technical = [
      { id: 'db', label: 'Database integrity check', status: health.integrity === 'ok' ? 'ok' : 'blocked', detail: health.integrity === 'ok' ? `SQLite quick_check ok · ${(health.bytes / 1024 / 1024).toFixed(1)} MB` : health.integrity },
      { id: 'backup', label: 'Recent database backup (7 days)', status: backup.newest && Date.now() - Date.parse(backup.newest.at) < 7 * 864e5 ? 'ok' : 'attention', detail: backup.newest ? `Newest: ${backup.newest.at.slice(0, 16).replace('T', ' ')} (${backup.count} total)` : 'No backup found. Run npm run backup:sqlite.' },
      { id: 'gate', label: 'Publication gate', status: gateMode === 'strict' || !hosted ? 'ok' : 'attention', detail: gateMode === 'strict' ? 'Strict — only approved products are public.' : hosted ? 'Preview mode on a hosted environment: unreviewed products are public.' : 'Preview mode (local only).' },
      { id: 'proxy', label: 'Client address behind proxy', status: !hosted || process.env.TRUST_PROXY ? 'ok' : 'attention', detail: process.env.TRUST_PROXY ? `TRUST_PROXY=${process.env.TRUST_PROXY}` : hosted ? 'Set TRUST_PROXY=1 so rate limits apply per visitor.' : 'Not needed locally.' },
      { id: 'kb', label: 'Ask Vera knowledge up to date', status: supportKbStatus().upToDate !== false ? 'ok' : 'attention', detail: supportKbStatus().upToDate !== false ? 'Up to date.' : 'Updates available under Guide & Ask Vera.' },
      { id: 'errors', label: 'No server errors since restart', status: recentErrors.length ? 'attention' : 'ok', detail: recentErrors.length ? `${recentErrors.length} error(s); newest ${recentErrors[0].at}` : `Since ${serverStartedAt}` },
      { id: 'release', label: 'Release verified (manifest)', status: manifestInfo().files ? 'ok' : 'attention', detail: manifestInfo().files ? `${manifestInfo().files} files listed, generated ${manifestInfo().generated}. Tests run in GitHub Actions (VERAPEP CI).` : 'Manifest missing.' },
      { id: 'mfa', label: 'Your account uses MFA', status: database.findUser(session.email)?.mfaEnabled ? 'ok' : 'attention', detail: database.findUser(session.email)?.mfaEnabled ? 'Enabled.' : 'Enable an authenticator under Security.' },
      { id: 'unreviewed', label: 'No live text changed without review', status: summaries.some(item => item.liveChangedWithoutReview) ? 'attention' : 'ok', detail: `${summaries.filter(item => item.liveChangedWithoutReview).length} product(s) were edited directly.` }
    ];
    const details = readiness.blockerDetails || [];
    const legalBlockers = details.filter(item => ['legal', 'documents'].includes(item.category));
    const comp = getCompliance().products || {};
    const approvals = Object.entries(comp).filter(([, record]) => record.status === 'approved_for_publication').map(([id, record]) => ({ id, name: productsById.get(id)?.name || id, scope: record.scope, markets: record.markets || [], reviewReference: record.reviewReference, reviewer: record.reviewer, decidedAt: record.decidedAt, changedAfterApproval: Boolean(record.contentChangedAfterApproval) }));
    const byStatus = summaries.reduce((acc, item) => ({ ...acc, [item.reviewStatus]: (acc[item.reviewStatus] || 0) + 1 }), {});
    const docTotals = {
      total: summaries.length,
      complete: summaries.filter(item => item.contentDone === item.contentTotal).length,
      partial: summaries.filter(item => item.contentDone > 0 && item.contentDone < item.contentTotal).length,
      missing: summaries.filter(item => item.contentDone === 0).length,
      byItem: ['text', 'contents', 'storage', 'warnings', 'lab', 'supplier'].map(id => ({ id, missing: summaries.filter(item => item.missing.includes(id)).length })),
      verifiedDocuments: documents.documents.filter(doc => doc.status === 'verified' && !doc.supersededBy).length,
      unverifiedDocuments: documents.documents.filter(doc => doc.status === 'unverified' && !doc.supersededBy).length
    };
    const queue = allDrafts().filter(draft => ['internal_review', 'external_review', 'approved'].includes(draft.status) || draft.requiresReReview);
    const quality = contentQuality();
    const priorities = [];
    if (!approvals.length) priorities.push({ title: 'Have the products legally classified', why: 'Nothing can be published or sold without a recorded legal decision per product.', who: 'Lawyer + you', where: 'compliance' });
    if (quality.pages.find(page => page.page === 'Terms')?.issues.length) priorities.push({ title: 'Provide company details and approved terms', why: 'Required on the Terms, Privacy and Shipping pages before launch.', who: 'You + lawyer', where: 'settings' });
    if (docTotals.complete < docTotals.total) priorities.push({ title: `Collect documentation (${docTotals.total - docTotals.complete} products incomplete)`, why: 'Lab reports, supplier sheets and verified product texts are missing.', who: 'You / supplier', where: 'products' });
    if (queue.length) priorities.push({ title: `Review ${queue.length} pending content change(s)`, why: 'Drafts are waiting for an editorial or external decision.', who: 'Owner / admin', where: 'reviews-queue' });
    for (const check of technical.filter(item => item.status !== 'ok')) priorities.push({ title: check.label, why: check.detail, who: 'Technical', where: 'status' });
    return {
      generatedAt: nowIso(),
      note: 'Technical completion and legal launch readiness are measured separately. Neither is a launch approval.',
      technical: { checks: technical, ok: technical.filter(item => item.status === 'ok').length, total: technical.length },
      legal: { approvedForLaunch: false, statement: readiness.ready ? 'Production checks pass, but launch still requires your explicit decision.' : 'Not approved for launch.', blockers: details, openLegalItems: legalBlockers.length, totalBlockers: details.length },
      documentation: docTotals,
      compliance: { gate: gateMode, byStatus, labels: REVIEW_STATUS_LABELS, approvals, publiclyVisible: summaries.filter(item => item.publiclyVisible).length, total: summaries.length },
      content: quality,
      health: { database: health, backups: backup, errors: recentErrors.slice(0, 10), startedAt: serverStartedAt, version: ctx.version, node: process.version, release: manifestInfo(), kb: supportKbStatus(), vera: veraStats },
      reviewQueue: queue.length,
      priorities: priorities.slice(0, 8).map((item, index) => ({ rank: index + 1, ...item }))
    };
  }

  /* ---------- import (structured product text → drafts, never live) ---------- */
  function parseCsv(text) {
    const rows = [];
    let row = []; let cell = ''; let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ',' || char === ';') { row.push(cell); cell = ''; }
      else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [header, ...body] = rows.filter(item => item.some(value => value.trim()));
    if (!header) return [];
    const keys = header.map(key => key.trim());
    return body.map(values => Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? '').trim()])));
  }

  function previewImport(body) {
    const format = body.format === 'csv' ? 'csv' : 'json';
    const raw = String(body.content || '');
    if (raw.length > 900_000) throw fail(413, 'import_too_large', 'The import file is too large (max 900 KB of text).');
    let records;
    try { records = format === 'csv' ? parseCsv(raw) : (Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : JSON.parse(raw).products); } catch { throw fail(400, 'import_unreadable', `The ${format.toUpperCase()} file could not be read.`); }
    if (!Array.isArray(records) || !records.length) throw fail(400, 'import_empty', 'No product rows were found.');
    if (records.length > 200) throw fail(400, 'import_too_many_rows', 'Import at most 200 rows at a time.');
    const seen = new Set();
    const rows = records.map((record, index) => {
      const productId = String(record.productId || record.id || '').trim();
      const product = productsById.get(productId);
      const unknownColumns = Object.keys(record).filter(key => ![...CONTENT_FIELDS, 'productId', 'id', 'source', 'sourceDocument'].includes(key));
      const fields = sanitiseFields(Object.fromEntries(CONTENT_FIELDS.filter(field => String(record[field] ?? '').trim()).map(field => [field, record[field]])));
      const errors = [];
      if (!product) errors.push(productId ? `Unknown product id "${productId}".` : 'Missing productId.');
      if (seen.has(productId)) errors.push('The same product appears more than once.');
      seen.add(productId);
      const validation = validateDraft(fields, { documents: product ? docsFor(product.id) : [] });
      errors.push(...validation.errors);
      const live = product ? snapshot(getContent().products[product.id]) : {};
      return {
        row: index + 1, productId, name: product?.name || null, fields, source: String(record.source || record.sourceDocument || body.filename || 'import').slice(0, 200),
        errors, warnings: [...validation.warnings, ...unknownColumns.map(column => `Ignored column "${column}".`)],
        changes: product ? draftDiff({ fields }, live).filter(item => item.changed).map(item => item.field) : []
      };
    });
    return { format, rows, valid: rows.filter(row => !row.errors.length).length, invalid: rows.filter(row => row.errors.length).length };
  }

  /* ---------- re-review when evidence changes ---------- */
  function flagReReview(oldDocId, reason, by) {
    let flagged = 0;
    for (const draft of allDrafts()) {
      const uses = draft.fields.imageDocumentId === oldDocId || draft.sources.some(source => source.ref === oldDocId);
      if (uses && ['approved', 'applied', 'internal_review', 'external_review'].includes(draft.status)) {
        draft.requiresReReview = { at: nowIso(), reason };
        draft.history.push({ at: nowIso(), by, action: 'flagged_for_re_review', note: reason });
        flagged += 1;
      }
    }
    const compliance = getCompliance();
    for (const [productId, record] of Object.entries(compliance.products || {})) {
      if (record.status === 'approved_for_publication' && (record.evidence || []).some(item => String(item.url || '').includes(oldDocId) || item.documentId === oldDocId)) {
        compliance.products[productId] = { ...record, contentChangedAfterApproval: true, history: [...(record.history || []), { at: nowIso(), by, event: 'evidence_replaced_after_approval', note: reason }] };
        flagged += 1;
      }
    }
    return flagged;
  }

  /* ---------- routing ---------- */
  async function handle(req, res, url, method, pathname) {
    // Public: approved product photographs, only for publicly visible products.
    const media = pathname.match(/^\/product-media\/(doc_[a-f0-9]{16}\.(png|jpg|webp))$/);
    if (media && (method === 'GET' || method === 'HEAD')) {
      const doc = documents.documents.find(item => item.storedAs === media[1] && item.kind === 'product_image' && item.status === 'verified');
      const content = doc ? getContent().products[doc.productId] : null;
      if (!doc || content?.imageUrl !== `/product-media/${doc.storedAs}` || !isPubliclyVisible(doc.productId)) return sendJson(res, 404, { error: 'not_found', message: 'Not found.' }), true;
      sendFile(res, readStoredFile(dataDir, doc.storedAs), doc.mime, { 'Cache-Control': 'public, max-age=3600' });
      return true;
    }
    if (!pathname.startsWith('/api/admin/')) return false;

    if (method === 'GET' && pathname === '/api/admin/overview') {
      const session = requireAdmin(req);
      return sendJson(res, 200, overview(session)), true;
    }

    if (method === 'GET' && pathname === '/api/admin/workspace/products') {
      const session = requireAdmin(req); requireRole(session, 'products');
      return sendJson(res, 200, { products: catalogue.products.map(productSummary), statuses: DRAFT_STATUS_LABELS, documentKinds: DOCUMENT_KINDS }), true;
    }

    const workspace = pathname.match(/^\/api\/admin\/products\/([^/]+)\/workspace$/);
    if (method === 'GET' && workspace) {
      const session = requireAdmin(req); requireRole(session, 'products');
      const product = productsById.get(decodeURIComponent(workspace[1]));
      if (!product) throw fail(404, 'product_not_found', 'Product not found.');
      const entry = workflow.products[product.id] || { drafts: [], versions: [] };
      const live = snapshot(getContent().products[product.id]);
      const record = getCompliance().products?.[product.id] || { status: 'not_reviewed', history: [] };
      return sendJson(res, 200, {
        summary: productSummary(product), checklist: checklist(product), live, liveImage: getContent().products[product.id]?.imageUrl || '',
        variants: product.variants.map(variant => ({ catalogueNo: variant.catalogueNo, specification: variant.specification })),
        drafts: entry.drafts.slice().reverse().map(draft => ({ ...draft, statusLabel: DRAFT_STATUS_LABELS[draft.status], diff: draftDiff(draft, live), validation: validateDraft(draft.fields, { documents: docsFor(product.id) }) })),
        versions: entry.versions.slice().reverse(),
        documents: docsFor(product.id).slice().reverse(),
        compliance: { status: record.status, statusLabel: REVIEW_STATUS_LABELS[record.status || 'not_reviewed'], markets: record.markets || [], scope: record.scope || null, reviewReference: record.reviewReference || null, reviewer: record.reviewer || null, history: (record.history || []).slice().reverse() },
        activity: database.listAuditFor('product', product.id, 50),
        canReview: EDITORIAL_REVIEWERS.has(session.role), canApply: EDITORIAL_REVIEWERS.has(session.role), role: session.role, me: session.email,
        purposes: PURPOSES, documentKinds: DOCUMENT_KINDS
      }), true;
    }

    const draftsRoute = pathname.match(/^\/api\/admin\/products\/([^/]+)\/drafts$/);
    if (draftsRoute && method === 'GET') {
      const session = requireAdmin(req); requireRole(session, 'products');
      const product = productsById.get(decodeURIComponent(draftsRoute[1]));
      if (!product) throw fail(404, 'product_not_found', 'Product not found.');
      return sendJson(res, 200, { drafts: (workflow.products[product.id]?.drafts || []).slice().reverse() }), true;
    }
    if (draftsRoute && method === 'POST') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const product = productsById.get(decodeURIComponent(draftsRoute[1]));
      if (!product) throw fail(404, 'product_not_found', 'Product not found.');
      const body = await readJsonBody(req);
      const live = snapshot(getContent().products[product.id]);
      const fields = sanitiseFields(body.fields || {});
      for (const field of Object.keys(fields)) if (fields[field] === live[field]) delete fields[field];
      const validation = validateDraft(fields, { documents: docsFor(product.id) });
      if (validation.errors.length) return sendJson(res, 400, { error: 'draft_invalid', message: validation.errors.join(' '), validation }), true;
      const entry = productEntry(workflow, product.id);
      const draft = newDraft({ productId: product.id, fields, sources: body.sources, purpose: body.purpose, by: session.email, liveVersion: entry.versions.slice(-1)[0]?.version || 0, note: body.note });
      entry.drafts.push(draft);
      persistWorkflow();
      audit(session, 'content.draft_created', 'product', product.id, null, { draftId: draft.id, fields: Object.keys(fields) });
      return sendJson(res, 201, { draft, validation }), true;
    }

    if (method === 'GET' && pathname === '/api/admin/review-queue') {
      const session = requireAdmin(req); requireRole(session, 'products');
      const items = allDrafts().filter(draft => ['internal_review', 'external_review', 'approved'].includes(draft.status) || draft.requiresReReview).map(draft => {
        const live = snapshot(getContent().products[draft.productId]);
        return { ...draft, productName: productsById.get(draft.productId)?.name || draft.productId, statusLabel: DRAFT_STATUS_LABELS[draft.status], diff: draftDiff(draft, live), validation: validateDraft(draft.fields, { documents: docsFor(draft.productId) }) };
      }).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      return sendJson(res, 200, { items, canReview: EDITORIAL_REVIEWERS.has(session.role), me: session.email }), true;
    }

    const draftAction = pathname.match(/^\/api\/admin\/drafts\/(drf_[a-f0-9]{12})(?:\/(submit|review|external-review|apply|withdraw))?$/);
    if (draftAction) {
      const session = requireAdmin(req); requireRole(session, 'products');
      const draft = findDraft(draftAction[1]);
      if (!draft) throw fail(404, 'draft_not_found', 'Draft not found.');
      if (method === 'GET' && !draftAction[2]) return sendJson(res, 200, { draft, diff: draftDiff(draft, snapshot(getContent().products[draft.productId])) }), true;
      requireCsrf(req, session);
      const body = await readJsonBody(req);
      const at = nowIso();
      const note = String(body.note || '').slice(0, 1000);
      const action = draftAction[2];
      try {
        if (method === 'PATCH' && !action) {
          assertTransition(draft, ['draft', 'rejected'], 'edited');
          const live = snapshot(getContent().products[draft.productId]);
          const fields = sanitiseFields({ ...draft.fields, ...(body.fields || {}) });
          for (const field of Object.keys(fields)) if (fields[field] === live[field]) delete fields[field];
          const validation = validateDraft(fields, { documents: docsFor(draft.productId) });
          if (validation.errors.length) return sendJson(res, 400, { error: 'draft_invalid', message: validation.errors.join(' '), validation }), true;
          Object.assign(draft, { fields, status: 'draft', updatedAt: at, requiresReReview: null });
          if (Array.isArray(body.sources)) draft.sources = newDraft({ sources: body.sources }).sources;
          draft.history.push({ at, by: session.email, action: 'edited', note });
        } else if (method === 'POST' && action === 'submit') {
          assertTransition(draft, ['draft', 'rejected'], 'submitted');
          const validation = validateDraft(draft.fields, { documents: docsFor(draft.productId) });
          if (validation.errors.length) return sendJson(res, 400, { error: 'draft_invalid', message: validation.errors.join(' '), validation }), true;
          Object.assign(draft, { status: 'internal_review', updatedAt: at, submittedBy: session.email });
          draft.history.push({ at, by: session.email, action: 'submitted', note });
        } else if (method === 'POST' && action === 'review') {
          assertTransition(draft, ['internal_review'], 'reviewed');
          if (!EDITORIAL_REVIEWERS.has(session.role)) throw fail(403, 'reviewer_role_required', 'Only an owner or admin can review content.');
          const selfReview = draft.createdBy === session.email;
          if (selfReview && !(session.role === 'owner' && body.selfReviewConfirmed === true)) throw fail(409, 'self_review_not_allowed', 'You wrote this draft. Ask another admin to review it, or (owner only) confirm a self-review explicitly.');
          if (!['approve', 'request_changes'].includes(body.decision)) throw fail(400, 'invalid_decision', 'Choose approve or request changes.');
          if (body.decision === 'request_changes' && note.length < 3) throw fail(400, 'note_required', 'Explain which changes are needed.');
          const validation = validateDraft(draft.fields, { documents: docsFor(draft.productId) });
          draft.reviews.push({ kind: 'editorial', by: session.email, role: session.role, decision: body.decision, note, at, selfReview });
          draft.status = body.decision === 'request_changes' ? 'rejected' : validation.needsExternalReview ? 'external_review' : 'approved';
          draft.updatedAt = at;
          draft.history.push({ at, by: session.email, action: body.decision === 'approve' ? (draft.status === 'external_review' ? 'editorially_approved_needs_external' : 'editorially_approved') : 'changes_requested', note });
        } else if (method === 'POST' && action === 'external-review') {
          assertTransition(draft, ['external_review'], 'given an external review');
          if (!EDITORIAL_REVIEWERS.has(session.role)) throw fail(403, 'reviewer_role_required', 'Only an owner or admin can record an external review.');
          const reviewer = String(body.reviewer || '').trim().slice(0, 160);
          const reference = String(body.reference || '').trim().slice(0, 200);
          if (reviewer.length < 3 || reference.length < 5) throw fail(400, 'external_reference_required', 'Name the external reviewer and add a traceable reference.');
          if (!['approve', 'request_changes'].includes(body.decision)) throw fail(400, 'invalid_decision', 'Choose approve or request changes.');
          draft.reviews.push({ kind: 'external', by: session.email, reviewer, reference, decision: body.decision, note, at });
          draft.status = body.decision === 'approve' ? 'approved' : 'rejected';
          draft.updatedAt = at;
          draft.history.push({ at, by: session.email, action: `external_${body.decision}`, note: `${reviewer} · ${reference}` });
        } else if (method === 'POST' && action === 'apply') {
          assertTransition(draft, ['approved'], 'applied');
          if (!EDITORIAL_REVIEWERS.has(session.role)) throw fail(403, 'reviewer_role_required', 'Only an owner or admin can apply approved content.');
          if (body.confirm !== true) throw fail(400, 'apply_confirmation_required', 'Confirm that the approved text should replace the live text.');
          if (draft.requiresReReview) throw fail(409, 're_review_required', `This draft must be reviewed again: ${draft.requiresReReview.reason}`);
          const content = getContent();
          const current = content.products[draft.productId] || { productId: draft.productId };
          const before = snapshot(current);
          for (const field of CONTENT_FIELDS) if (draft.fields[field] !== undefined) current[field] = draft.fields[field];
          if (draft.fields.imageDocumentId) {
            const doc = documents.documents.find(item => item.id === draft.fields.imageDocumentId && item.status === 'verified' && item.kind === 'product_image');
            if (!doc) throw fail(409, 'image_not_verified', 'The image is no longer verified.');
            current.imageUrl = `/product-media/${doc.storedAs}`;
            current.imageSrcset = '';
          }
          current.updatedAt = at;
          content.products[draft.productId] = current;
          const entry = productEntry(workflow, draft.productId);
          if (!entry.versions.length) recordLiveVersion(entry, { fields: before, by: 'system', workflow: 'baseline', note: 'Live text before the first reviewed change.' });
          const version = recordLiveVersion(entry, { fields: current, by: session.email, workflow: 'draft', draftId: draft.id, note });
          Object.assign(draft, { status: 'applied', appliedVersion: version, appliedBy: session.email, appliedAt: at, updatedAt: at });
          draft.history.push({ at, by: session.email, action: 'applied', note: `Live version ${version}` });
          // Text shown to customers changed: an existing legal approval must be looked at again.
          const record = getCompliance().products?.[draft.productId];
          if (record?.status === 'approved_for_publication' && CLAIM_FIELDS.some(field => draft.fields[field] !== undefined)) {
            getCompliance().products[draft.productId] = { ...record, contentChangedAfterApproval: true, history: [...(record.history || []), { at, by: session.email, event: 'content_changed_after_approval', note: `Draft ${draft.id}` }] };
            await persistCompliance();
          }
          await persistProductContent();
          audit(session, 'content.draft_applied', 'product', draft.productId, before, { draftId: draft.id, version, fields: Object.keys(draft.fields) });
        } else if (method === 'POST' && action === 'withdraw') {
          assertTransition(draft, ['draft', 'internal_review', 'external_review', 'approved', 'rejected'], 'withdrawn');
          Object.assign(draft, { status: 'withdrawn', updatedAt: at });
          draft.history.push({ at, by: session.email, action: 'withdrawn', note });
        } else {
          return sendJson(res, 405, { error: 'method_not_allowed', message: 'Method not allowed.' }), true;
        }
      } catch (error) {
        if (error instanceof WorkflowError || error.status) return sendJson(res, error.status || 409, { error: error.code || 'workflow_error', message: error.message }), true;
        throw error;
      }
      persistWorkflow();
      if (action && action !== 'apply') audit(session, `content.draft_${action.replace('-', '_')}`, 'product', draft.productId, null, { draftId: draft.id, status: draft.status });
      return sendJson(res, 200, { draft: { ...draft, statusLabel: DRAFT_STATUS_LABELS[draft.status] } }), true;
    }

    const docsRoute = pathname.match(/^\/api\/admin\/products\/([^/]+)\/documents$/);
    if (docsRoute && method === 'GET') {
      const session = requireAdmin(req); requireRole(session, 'products');
      return sendJson(res, 200, { documents: docsFor(decodeURIComponent(docsRoute[1])).slice().reverse() }), true;
    }
    if (docsRoute && method === 'POST') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const product = productsById.get(decodeURIComponent(docsRoute[1]));
      if (!product) throw fail(404, 'product_not_found', 'Product not found.');
      const kind = String(req.headers['x-document-kind'] || '');
      if (!DOCUMENT_KINDS[kind]) throw fail(400, 'invalid_document_kind', 'Choose what kind of document this is.');
      const title = cleanTitle(decodeURIComponent(String(req.headers['x-document-title'] || '')));
      if (title.length < 3) throw fail(400, 'document_title_required', 'Give the document a descriptive title (e.g. "COA batch 2406-A, Lab X").');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > MAX_DOCUMENT_BYTES) throw fail(413, 'document_too_large', 'The file is larger than 15 MB.'); chunks.push(chunk); }
      const buffer = Buffer.concat(chunks);
      const type = detectType(buffer);
      if (!type) throw fail(415, 'unsupported_document_type', 'Only PDF, PNG, JPEG and WebP files are accepted (checked by file content).');
      if (kind === 'product_image' && type.mime === 'application/pdf') throw fail(415, 'image_required', 'A product image must be PNG, JPEG or WebP.');
      const dims = type.mime.startsWith('image/') ? imageSize(buffer, type.mime) : null;
      const warnings = [];
      if (kind === 'product_image' && (!dims || dims.width < MIN_PRODUCT_IMAGE_WIDTH)) warnings.push(`The image is ${dims ? `${dims.width} px` : 'of unknown size'} wide; at least ${MIN_PRODUCT_IMAGE_WIDTH} px is recommended for sharp display.`);
      const supersedes = String(req.headers['x-supersedes'] || '').trim();
      const previous = supersedes ? documents.documents.find(doc => doc.id === supersedes && doc.productId === product.id) : null;
      if (supersedes && !previous) throw fail(404, 'document_not_found', 'The document to replace was not found.');
      const { id, storedAs } = storeFile(dataDir, buffer, type);
      const doc = { id, productId: product.id, kind, title, mime: type.mime, bytes: buffer.length, width: dims?.width || null, height: dims?.height || null, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), storedAs, uploadedBy: session.email, uploadedAt: nowIso(), status: 'unverified', supersedes: previous?.id || null, supersededBy: null, visibility: 'internal' };
      documents.documents.push(doc);
      let reReview = 0;
      if (previous) {
        previous.supersededBy = doc.id;
        reReview = flagReReview(previous.id, `"${previous.title}" was replaced by a new version.`, session.email);
        persistWorkflow();
        if (reReview) await persistCompliance();
      }
      persistDocuments();
      audit(session, 'document.uploaded', 'product', product.id, null, { documentId: doc.id, kind, title, bytes: doc.bytes, supersedes: doc.supersedes });
      return sendJson(res, 201, { document: doc, warnings, flaggedForReReview: reReview }), true;
    }

    const docRoute = pathname.match(/^\/api\/admin\/documents\/(doc_[a-f0-9]{16})(\/file)?$/);
    if (docRoute) {
      const session = requireAdmin(req); requireRole(session, 'products');
      const doc = documents.documents.find(item => item.id === docRoute[1]);
      if (!doc) throw fail(404, 'document_not_found', 'Document not found.');
      if (method === 'GET' && docRoute[2]) {
        audit(session, 'document.downloaded', 'product', doc.productId, null, { documentId: doc.id });
        sendFile(res, readStoredFile(dataDir, doc.storedAs), doc.mime, { 'Content-Disposition': `attachment; filename="${doc.id}.${doc.storedAs.split('.').pop()}"`, 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store' });
        return true;
      }
      if (method === 'PATCH' && !docRoute[2]) {
        requireCsrf(req, session);
        if (!EDITORIAL_REVIEWERS.has(session.role)) throw fail(403, 'reviewer_role_required', 'Only an owner or admin can verify documents.');
        const body = await readJsonBody(req);
        if (!['verified', 'rejected', 'unverified'].includes(body.status)) throw fail(400, 'invalid_status', 'Choose verified or rejected.');
        const note = String(body.note || '').trim().slice(0, 500);
        if (body.status === 'verified' && note.length < 5) throw fail(400, 'verification_note_required', 'Describe what you checked (e.g. "Batch and lab match the label; signed COA").');
        Object.assign(doc, { status: body.status, verifiedBy: session.email, verifiedAt: nowIso(), verificationNote: note });
        persistDocuments();
        audit(session, `document.${body.status}`, 'product', doc.productId, null, { documentId: doc.id, note });
        return sendJson(res, 200, { document: doc }), true;
      }
    }

    if (method === 'POST' && (pathname === '/api/admin/import/preview' || pathname === '/api/admin/import/apply')) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const body = await readJsonBody(req);
      let preview;
      try { preview = previewImport(body); } catch (error) { return sendJson(res, error.status || 400, { error: error.code || 'import_failed', message: error.message }), true; }
      if (pathname.endsWith('/preview')) return sendJson(res, 200, preview), true;
      const valid = preview.rows.filter(row => !row.errors.length && Object.keys(row.fields).length);
      if (Number(body.confirmCount) !== valid.length) return sendJson(res, 409, { error: 'import_confirmation_required', message: `This creates ${valid.length} draft(s). Confirm the number to continue.`, count: valid.length, preview }), true;
      const created = [];
      for (const row of valid) {
        const entry = productEntry(workflow, row.productId);
        const live = snapshot(getContent().products[row.productId]);
        const fields = { ...row.fields };
        for (const field of Object.keys(fields)) if (fields[field] === live[field]) delete fields[field];
        if (!Object.keys(fields).length) continue;
        const draft = newDraft({ productId: row.productId, fields, sources: Object.keys(fields).map(field => ({ field, kind: 'import', ref: row.source })), purpose: 'product_page', by: session.email, liveVersion: entry.versions.slice(-1)[0]?.version || 0, note: `Imported from ${row.source}` });
        entry.drafts.push(draft);
        created.push({ productId: row.productId, draftId: draft.id });
      }
      persistWorkflow();
      audit(session, 'content.import_drafts_created', 'import', String(body.filename || 'import').slice(0, 120), null, { drafts: created.length, rows: preview.rows.length });
      return sendJson(res, 201, { created, skipped: preview.rows.length - created.length }), true;
    }

    return false;
  }

  /* Direct edits through the legacy product-content API are still possible for owner/admin, but
     every change to customer-visible text becomes a numbered live version marked "direct", so it
     shows up as "changed without review" in the overview. Editors must use drafts. */
  function beforeDirectEdit(session, productId, body, current) {
    const changedClaims = CLAIM_FIELDS.filter(field => body[field] !== undefined && String(body[field]).trim() !== String(current[field] ?? '').trim());
    if (changedClaims.length && !EDITORIAL_REVIEWERS.has(session.role)) {
      throw fail(403, 'use_draft_workflow', `Editors change product text through a draft and review (fields: ${changedClaims.join(', ')}).`);
    }
    return snapshot(current);
  }

  function afterDirectEdit(session, productId, before, after) {
    const changed = CONTENT_FIELDS.filter(field => before[field] !== String(after[field] ?? ''));
    if (!changed.length) return;
    const entry = productEntry(workflow, productId);
    if (!entry.versions.length) recordLiveVersion(entry, { fields: before, by: 'system', workflow: 'baseline', note: 'Live text before the first recorded change.' });
    recordLiveVersion(entry, { fields: after, by: session.email, workflow: 'direct', note: `Direct edit: ${changed.join(', ')}` });
    persistWorkflow();
  }

  return { handle, beforeDirectEdit, afterDirectEdit, overview, productSummary };
}
