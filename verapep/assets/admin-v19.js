/* VERAPEP v19 — Owner Control Center, product workspace, review queue and import.
   Uses the helpers exposed by admin.js (window.VerapepAdmin). Every decision is a single action on
   a single item with a confirmation; nothing here publishes a product or records a legal decision. */
(() => {
  'use strict';
  const A = window.VerapepAdmin;
  if (!A) return;
  const { requestJson, escapeHtml, formatDate, showMessage, state } = A;
  const v19 = { openProposals: new Set(), overview: null, products: null, statuses: {}, kinds: {}, workspace: null, current: null, queue: [], importPreview: null };
  const $ = id => document.getElementById(id);
  const FIELD_LABELS = {
    shortDescription: 'Short description', fullDescription: 'Full description', ingredients: 'Contents / composition', storage: 'Storage',
    usage: 'Intended use (as stated in verified documents)', warnings: 'Warnings and limitations', displayName: 'Display name', imageAlt: 'Image alternative text'
  };
  const FIELD_HELP = {
    shortDescription: 'One or two neutral sentences: what the product is and how it is supplied. No effects or benefits.',
    fullDescription: 'Factual description taken from the supplier or lab documents. Do not describe medical effects.',
    ingredients: 'Exactly as stated on the certificate of analysis or supplier sheet.',
    storage: 'Storage conditions from the supplier sheet (temperature, light, after opening).',
    usage: 'Only the intended use stated in a verified document. Never dosing advice.',
    warnings: 'Limitations and warnings, ideally checked by your legal reviewer.',
    displayName: 'Leave empty to keep the catalogue name.',
    imageAlt: 'Describe the photo for people using screen readers, e.g. "Glass vial with white label".'
  };
  const CHECK = { ok: '✓', attention: '!', blocked: '✕' };
  const pill = (text, kind = '') => `<span class="status-pill ${kind ? `status-pill--${escapeHtml(kind)}` : ''}">${escapeHtml(text)}</span>`;
  const bytes = value => value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
  const canReview = () => ['owner', 'admin'].includes(state.dashboard?.currentUser?.role);

  function friendlyError(error) {
    if (error.status === 401) return 'Your session has ended. Sign in again.';
    if (error.status === 403 && error.payload?.error === 'invalid_csrf') return 'This page is out of date. Reload the page and try again.';
    return error.message || 'Something went wrong. Nothing was changed.';
  }
  async function run(action, success) {
    try {
      const result = await action();
      if (success) showMessage(success, 'success');
      return result;
    } catch (error) {
      showMessage(friendlyError(error));
      return null;
    }
  }

  /* ------------------------------------------------------------ overview */
  async function loadOverview() {
    const node = $('owner-overview');
    if (!node) return;
    try {
      v19.overview = await requestJson('/api/admin/overview');
      renderOverview();
    } catch (error) {
      node.innerHTML = `<div class="admin-empty">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  function renderOverview() {
    const o = v19.overview;
    const node = $('owner-overview');
    if (!o || !node) return;
    const doc = o.documentation;
    const incomplete = doc.total - doc.complete;
    const itemLabels = { text: 'product text', contents: 'contents / composition', storage: 'storage information', warnings: 'warnings', lab: 'a verified lab report', supplier: 'a verified supplier document' };
    const hidden = o.compliance.total - o.compliance.publiclyVisible;
    const statusRows = Object.entries(o.compliance.labels).map(([key, text]) => `<li><span>${escapeHtml(text)}</span><strong>${o.compliance.byStatus[key] || 0}</strong></li>`).join('');
    const groups = {};
    for (const blocker of o.legal.blockers) (groups[blocker.categoryLabel] ||= []).push(blocker);
    node.innerHTML = `
      <p class="overview-note" role="note">${escapeHtml(o.note)}</p>
      <div class="overview-split">
        <article class="overview-headline overview-headline--technical">
          <span class="eyebrow">Technical status</span>
          <strong>${o.technical.ok} of ${o.technical.total} checks OK</strong>
          <p>Database, backups, security settings and releases. Says nothing about whether you may sell.</p>
        </article>
        <article class="overview-headline overview-headline--legal">
          <span class="eyebrow">Legal launch readiness</span>
          <strong class="warning-text">${o.legal.approvedForLaunch ? 'Approved' : 'Not approved for launch'}</strong>
          <p>${o.legal.openLegalItems} open legal or documentation item(s) · ${o.legal.totalBlockers} launch blockers in total. Only you can approve a launch, after legal review.</p>
        </article>
      </div>

      <section class="overview-block" aria-labelledby="ov-next"><h4 id="ov-next">Do this next</h4>
        <ol class="overview-priorities">${o.priorities.map(item => `<li><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.why)}</p><small>Who: ${escapeHtml(item.who)}</small></div><button class="button button--light" type="button" data-goto="${escapeHtml(item.where)}">Open</button></li>`).join('')}</ol>
      </section>

      <div class="overview-grid">
        <section class="overview-block" aria-labelledby="ov-docs"><h4 id="ov-docs">Product documentation</h4>
          <p class="overview-big"><strong>${incomplete}</strong> of ${doc.total} products are missing documentation</p>
          <ul class="overview-list">${doc.byItem.map(item => `<li><span>Missing ${escapeHtml(itemLabels[item.id] || item.id)}</span><strong>${item.missing}</strong></li>`).join('')}
            <li><span>Documents waiting for verification</span><strong>${doc.unverifiedDocuments}</strong></li></ul>
          <button class="button button--light" type="button" data-goto="products" data-filter-missing="lab">Show products without a lab report</button>
        </section>

        <section class="overview-block" aria-labelledby="ov-comp"><h4 id="ov-comp">Compliance review</h4>
          <p class="overview-big"><strong>${o.compliance.publiclyVisible}</strong> public · <strong>${hidden}</strong> hidden by the publication gate</p>
          <ul class="overview-list">${statusRows}</ul>
          ${o.compliance.approvals.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Approved product</th><th>Scope</th><th>Markets</th><th>Reference</th></tr></thead><tbody>${o.compliance.approvals.map(item => `<tr><td>${escapeHtml(item.name)}${item.changedAfterApproval ? ' <span class="status-pill status-pill--needs_evidence">Changed since approval</span>' : ''}</td><td>${escapeHtml(item.scope || '—')}</td><td>${escapeHtml(item.markets.join(', ') || '—')}</td><td>${escapeHtml(item.reviewReference || '—')}<br><small>${escapeHtml(item.reviewer || '')} ${item.decidedAt ? `· ${escapeHtml(formatDate(item.decidedAt))}` : ''}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No product has a recorded legal approval for any market yet.</p>'}
          <button class="button button--light" type="button" data-goto="compliance">Open compliance review</button>
        </section>

        <section class="overview-block" aria-labelledby="ov-content"><h4 id="ov-content">Content quality</h4>
          <ul class="overview-checks">${o.content.pages.map(page => `<li class="is-${page.issues.length ? 'attention' : 'ok'}"><span aria-hidden="true">${page.issues.length ? '!' : '✓'}</span><div><strong>${escapeHtml(page.page)}</strong>${page.issues.map(issue => `<p>${escapeHtml(issue)}</p>`).join('') || '<p>No known issues.</p>'}</div></li>`).join('')}</ul>
          ${o.content.images.totals ? `<details class="overview-details"><summary>Images: ${o.content.images.flagged.length} of ${o.content.images.totals.files} files need attention</summary><ul>${o.content.images.flagged.map(item => `<li><code>${escapeHtml(item.file)}</code> · ${item.width ? `${item.width}px · ` : ''}${item.kb} KB<ul>${item.flags.map(flag => `<li>${escapeHtml(flag)}</li>`).join('')}</ul></li>`).join('')}</ul></details>` : ''}
        </section>

        <section class="overview-block" aria-labelledby="ov-health"><h4 id="ov-health">System health</h4>
          <ul class="overview-checks">${o.technical.checks.map(check => `<li class="is-${check.status}"><span aria-hidden="true">${CHECK[check.status]}</span><div><strong>${escapeHtml(check.label)}</strong><p>${escapeHtml(check.detail)}</p></div></li>`).join('')}</ul>
          <p class="muted">Version ${escapeHtml(o.health.version)} · Node ${escapeHtml(o.health.node)} · running since ${escapeHtml(formatDate(o.health.startedAt))}</p>
        </section>
      </div>

      <details class="overview-details"><summary>All launch blockers (${o.legal.totalBlockers}), grouped by who can resolve them</summary>
        ${Object.entries(groups).map(([group, items]) => `<h5>${escapeHtml(group)} (${items.length})</h5><ul>${items.map(item => `<li>${escapeHtml(item.text)}${item.action ? `<br><small>${escapeHtml(item.action)}</small>` : ''}</li>`).join('')}</ul>`).join('')}
      </details>`;
    const count = $('review-queue-count');
    if (count) { count.textContent = String(o.reviewQueue); count.hidden = !o.reviewQueue; }
  }

  document.addEventListener('click', event => {
    const go = event.target.closest('[data-goto]');
    if (!go) return;
    const tab = go.dataset.goto === 'reviews-queue' ? 'review-queue' : go.dataset.goto;
    if (go.dataset.filterMissing && $('product-filter-missing')) { $('product-filter-missing').value = go.dataset.filterMissing; }
    A.showTab(tab);
    if (tab === 'products') renderProductList();
  });

  /* ------------------------------------------------------------ product list */
  async function loadProducts() {
    try {
      const payload = await requestJson('/api/admin/workspace/products');
      v19.products = payload.products;
      v19.statuses = payload.statuses;
      v19.kinds = payload.documentKinds;
      const reviewFilter = $('product-filter-review');
      if (reviewFilter && reviewFilter.options.length === 1) {
        const labels = [...new Map(payload.products.map(item => [item.reviewStatus, item.reviewStatusLabel])).entries()];
        reviewFilter.insertAdjacentHTML('beforeend', labels.map(([value, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`).join(''));
      }
      renderProductList();
    } catch (error) {
      if (error.status !== 403) showMessage(friendlyError(error));
    }
  }

  function renderProductList(query) {
    const container = $('admin-products');
    if (!container || !v19.products) return false;
    const needle = String(query ?? $('product-search')?.value ?? '').trim().toLowerCase();
    const missing = $('product-filter-missing')?.value || '';
    const review = $('product-filter-review')?.value || '';
    const visible = $('product-filter-visible')?.value || '';
    const work = $('product-filter-work')?.value || '';
    const rows = v19.products.filter(item => (!needle || [item.name, item.displayName, item.id, item.category].join(' ').toLowerCase().includes(needle))
      && (!missing || (missing === 'legal' ? item.legalDone < item.legalTotal : item.missing.includes(missing)))
      && (!review || item.reviewStatus === review)
      && (!visible || (visible === 'yes') === item.publiclyVisible)
      && (!work || (work === 'drafts' ? item.openDrafts > 0 : work === 'rereview' ? item.needsReReview : item.liveChangedWithoutReview)));
    const count = $('product-filter-count');
    if (count) count.textContent = `${rows.length} of ${v19.products.length} products shown`;
    container.innerHTML = rows.length ? rows.map(item => `
      <button class="admin-product-list__item ${v19.current === item.id ? 'is-selected' : ''}" type="button" data-edit-product="${escapeHtml(item.id)}" aria-pressed="${v19.current === item.id}">
        <span><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.id)}</small></span>
        <span class="product-progress" title="Content checklist">
          <span class="product-progress__bar"><span style="width:${Math.round(100 * item.contentDone / item.contentTotal)}%"></span></span>
          <small>Content ${item.contentDone}/${item.contentTotal} · Legal ${item.legalDone}/${item.legalTotal}</small>
        </span>
        <span class="admin-product-statuses">${pill(item.publiclyVisible ? 'Public' : 'Hidden', item.publiclyVisible ? 'approved_for_publication' : '')}${item.openDrafts ? pill(`${item.openDrafts} draft${item.openDrafts > 1 ? 's' : ''}`, 'in_legal_review') : ''}${item.needsReReview ? pill('Re-review', 'needs_evidence') : ''}</span>
      </button>`).join('') : '<div class="admin-empty">No products match these filters. Clear a filter to see more.</div>';
    return true;
  }
  A.renderProductList = renderProductList;
  for (const id of ['product-filter-missing', 'product-filter-review', 'product-filter-visible', 'product-filter-work']) $(id)?.addEventListener('change', () => renderProductList());

  /* ------------------------------------------------------------ workspace */
  async function openWorkspace(productId, { scroll = true } = {}) {
    v19.current = productId;
    const node = $('product-workspace');
    if (!node) return;
    node.hidden = false;
    node.innerHTML = '<p class="muted">Loading product…</p>';
    try {
      v19.workspace = await requestJson(`/api/admin/products/${encodeURIComponent(productId)}/workspace`);
      renderWorkspace();
      lockClaimFields();
      renderProductList();
      if (scroll && window.matchMedia('(max-width: 900px)').matches) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      node.innerHTML = `<div class="admin-empty">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  function lockClaimFields() {
    // Customer-visible text is changed through drafts and review; the advanced form keeps the rest.
    for (const id of ['editor-display-name', 'editor-short-description', 'editor-full-description', 'editor-ingredients', 'editor-usage', 'editor-warnings']) {
      const field = $(id);
      if (!field) continue;
      field.readOnly = true;
      field.closest('label')?.classList.add('is-locked');
      if (!field.closest('label')?.querySelector('.field-lock-note')) field.closest('label')?.insertAdjacentHTML('beforeend', '<small class="field-lock-note">Change this text with “New draft” above, so it is reviewed before it goes live.</small>');
    }
  }

  function diffMarkup(diff) {
    return diff.map(item => `<div class="content-diff"><span class="content-diff__field">${escapeHtml(FIELD_LABELS[item.field] || item.field)}</span><p>${item.parts.map(part => part.type === 'added' ? `<ins>${escapeHtml(part.text)}</ins>` : part.type === 'removed' ? `<del>${escapeHtml(part.text)}</del>` : escapeHtml(part.text)).join('') || '<em>(empty)</em>'}</p></div>`).join('') || '<p class="muted">Image change only.</p>';
  }

  function draftActions(draft, ws) {
    const mine = draft.createdBy === state.dashboard?.currentUser?.email;
    const out = [];
    if (['draft', 'rejected'].includes(draft.status)) out.push(`<button class="button button--light" type="button" data-draft-edit="${draft.id}">Edit</button><button class="button button--primary" type="button" data-draft-submit="${draft.id}">Submit for review</button>`);
    if (draft.status === 'internal_review' && ws.canReview) out.push(`<button class="button button--primary" type="button" data-draft-review="${draft.id}" data-decision="approve">Approve text${mine ? ' (my own)' : ''}</button><button class="button button--light" type="button" data-draft-review="${draft.id}" data-decision="request_changes">Ask for changes</button>`);
    if (draft.status === 'external_review' && ws.canReview) out.push(`<button class="button button--primary" type="button" data-draft-external="${draft.id}">Record external review</button>`);
    if (draft.status === 'approved' && ws.canApply && !draft.requiresReReview) out.push(`<button class="button button--primary" type="button" data-draft-apply="${draft.id}">Make this text live</button>`);
    if (draft.requiresReReview && ['approved'].includes(draft.status)) out.push(`<button class="button button--light" type="button" data-draft-edit="${draft.id}" data-reopen="1">Reopen for review</button>`);
    if (!['applied', 'withdrawn'].includes(draft.status)) out.push(`<button class="link-button" type="button" data-draft-withdraw="${draft.id}">Withdraw</button>`);
    return out.join('');
  }

  function draftCard(draft, ws) {
    const sources = draft.sources.length ? draft.sources.map(source => `${escapeHtml(FIELD_LABELS[source.field] || source.field || 'All')}: ${escapeHtml(source.kind)}${source.ref ? ` — ${escapeHtml(ws.documents?.find(doc => doc.id === source.ref)?.title || source.ref)}` : ''}`).join('<br>') : '<span class="warning-text">No source given</span>';
    return `<article class="draft-card draft-card--${draft.status}" data-draft-id="${draft.id}">
      <header><div>${pill(draft.statusLabel, draft.status === 'approved' || draft.status === 'applied' ? 'approved_for_publication' : draft.status === 'rejected' ? 'do_not_publish' : 'in_legal_review')} <small>${escapeHtml(draft.id)} · by ${escapeHtml(draft.createdBy)} · ${escapeHtml(formatDate(draft.updatedAt))}</small></div></header>
      ${draft.requiresReReview ? `<p class="warning-text">Needs review again: ${escapeHtml(draft.requiresReReview.reason)}</p>` : ''}
      ${diffMarkup(draft.diff)}
      <p class="draft-sources"><strong>Sources</strong><br>${sources}</p>
      ${draft.validation.warnings.length ? `<ul class="draft-warnings">${draft.validation.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${draft.reviews.length ? `<ul class="draft-reviews">${draft.reviews.map(review => `<li>${review.kind === 'external' ? 'External' : 'Editorial'} · ${escapeHtml(review.decision === 'approve' ? 'approved' : 'changes requested')} by ${escapeHtml(review.kind === 'external' ? `${review.reviewer} (${review.reference})` : review.by)}${review.selfReview ? ' (self-review)' : ''} · ${escapeHtml(formatDate(review.at))}${review.note ? ` — “${escapeHtml(review.note)}”` : ''}</li>`).join('')}</ul>` : ''}
      <div class="admin-actions">${draftActions(draft, ws)}</div>
    </article>`;
  }

  function renderWorkspace() {
    const ws = v19.workspace;
    const node = $('product-workspace');
    if (!ws || !node) return;
    const s = ws.summary;
    const open = ws.drafts.filter(draft => !['applied', 'withdrawn'].includes(draft.status));
    const closed = ws.drafts.filter(draft => ['applied', 'withdrawn'].includes(draft.status));
    const docs = ws.documents;
    node.innerHTML = `
      <header class="workspace-head">
        <div><p class="eyebrow">${escapeHtml(s.category || 'Product')}</p><h3>${escapeHtml(s.displayName)}</h3><p class="muted">${escapeHtml(s.id)} · ${ws.variants.map(variant => escapeHtml(variant.specification || variant.catalogueNo)).join(', ')}</p></div>
        <div class="workspace-pills">${pill(s.publiclyVisible ? 'Public' : 'Hidden', s.publiclyVisible ? 'approved_for_publication' : '')}${pill(ws.compliance.statusLabel, ws.compliance.status)}${s.publiclyVisible ? `<a href="/product/${encodeURIComponent(s.id)}" target="_blank" rel="noopener">Open page ↗</a>` : ''}</div>
      </header>
      <p class="workspace-next"><strong>Next step:</strong> ${escapeHtml(ws.checklist.nextStep)}</p>
      ${!s.publiclyVisible ? `<p class="help-text">Hidden because: ${escapeHtml(s.visibilityReason || 'no compliance approval')}. Completing the checklist does not publish the product — only a recorded legal decision under Compliance review can.</p>` : ''}

      <nav class="workspace-tabs" aria-label="Product sections">
        <a href="#ws-checklist">Checklist</a><a href="#ws-text">Text &amp; drafts (${open.length})</a><a href="#ws-docs">Documents (${docs.length})</a><a href="#ws-history">History</a>
      </nav>

      <section id="ws-checklist" class="workspace-section"><h4>Checklist</h4>
        <ul class="product-checklist">${ws.checklist.items.map(item => `<li class="${item.done ? 'is-done' : ''}"><span aria-hidden="true">${item.done ? '✓' : '○'}</span><div><strong>${escapeHtml(item.label)}</strong>${item.optional ? ' <small>(optional)</small>' : ''}${item.done ? '' : `<p>${escapeHtml(item.next)}</p>`}</div><small class="checklist-group">${escapeHtml(item.group)}</small></li>`).join('')}</ul>
        <p class="muted">Content ${ws.checklist.contentDone}/${ws.checklist.contentTotal} · Legal ${ws.checklist.legalDone}/${ws.checklist.legalTotal}. These are separate: finished content is not a legal approval.</p>
      </section>

      <section id="ws-text" class="workspace-section"><div class="workspace-section__head"><h4>Text &amp; drafts</h4><button class="button button--primary" id="workspace-new-draft" type="button">New draft</button></div>
        <div id="draft-editor-slot"></div>
        ${open.length ? open.map(draft => draftCard(draft, ws)).join('') : '<p class="muted">No open drafts. Start a new draft to add or improve text.</p>'}
        <details><summary>Live text now</summary><dl class="live-text">${Object.entries(FIELD_LABELS).map(([field, text]) => `<dt>${escapeHtml(text)}</dt><dd>${escapeHtml(ws.live[field]) || '<em class="muted">empty</em>'}</dd>`).join('')}</dl></details>
        ${closed.length ? `<details><summary>Earlier drafts (${closed.length})</summary>${closed.map(draft => draftCard(draft, ws)).join('')}</details>` : ''}
      </section>

      <section id="ws-docs" class="workspace-section"><h4>Documents</h4>
        <p class="help-text">Documents are private. Customers never see them unless you later publish a lab report link yourself. Mark a document verified only after checking it (batch, lab, product name, date).</p>
        ${docs.length ? `<ul class="doc-list">${docs.map(doc => `<li class="${doc.supersededBy ? 'is-superseded' : ''}" data-doc-id="${doc.id}"><div><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(v19.kinds[doc.kind] || ws.documentKinds[doc.kind] || doc.kind)} · ${escapeHtml(doc.mime.split('/')[1].toUpperCase())} · ${bytes(doc.bytes)}${doc.width ? ` · ${doc.width}×${doc.height}px` : ''} · ${escapeHtml(doc.uploadedBy)} · ${escapeHtml(formatDate(doc.uploadedAt))}</small>${doc.verificationNote ? `<small>${escapeHtml(doc.status)}: “${escapeHtml(doc.verificationNote)}” — ${escapeHtml(doc.verifiedBy)}</small>` : ''}${doc.supersededBy ? '<small>Replaced by a newer version</small>' : ''}</div>
          <div class="doc-actions">${pill(doc.status === 'verified' ? 'Verified' : doc.status === 'rejected' ? 'Rejected' : 'Not verified', doc.status === 'verified' ? 'approved_for_publication' : doc.status === 'rejected' ? 'do_not_publish' : 'needs_evidence')}
            <a class="button button--light" href="/api/admin/documents/${doc.id}/file">Download</a>
            ${ws.canReview && !doc.supersededBy && doc.status !== 'verified' ? `<button class="button button--light" type="button" data-doc-verify="${doc.id}">Mark verified</button>` : ''}
            ${ws.canReview && !doc.supersededBy && doc.status !== 'rejected' ? `<button class="link-button" type="button" data-doc-reject="${doc.id}">Reject</button>` : ''}
            ${!doc.supersededBy ? `<button class="link-button" type="button" data-doc-replace="${doc.id}">Replace</button>` : ''}
            ${doc.kind === 'product_image' && doc.status === 'verified' && !doc.supersededBy ? `<button class="button button--light" type="button" data-doc-use-image="${doc.id}">Use as product photo</button>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No documents yet.</p>'}
        <form class="doc-upload" id="doc-upload">
          <h5 id="doc-upload-title">Upload a document</h5>
          <input type="hidden" name="supersedes" value="">
          <div class="admin-form-grid">
            <label class="field"><span>What is it?</span><select name="kind" required><option value="">Choose…</option>${Object.entries(ws.documentKinds).map(([key, text]) => `<option value="${key}">${escapeHtml(text)}</option>`).join('')}</select></label>
            <label class="field"><span>Title</span><input name="title" required minlength="3" placeholder="e.g. COA batch 2406-A, Lab X"></label>
            <label class="field field--wide"><span>File (PDF, PNG, JPEG or WebP, max 15 MB)</span><input name="file" type="file" required accept="application/pdf,image/png,image/jpeg,image/webp"></label>
          </div>
          <p class="help-text" id="doc-upload-hint">Photos are resized in your browser to at most 2400 px and saved as WebP. At least 800 px wide is recommended.</p>
          <div class="admin-actions"><button class="button button--primary" type="submit">Upload</button><button class="link-button" type="button" id="doc-upload-cancel-replace" hidden>Cancel replacement</button></div>
        </form>
      </section>

      <section id="ws-history" class="workspace-section"><h4>History</h4>
        <details open><summary>Live text versions (${ws.versions.length})</summary>${ws.versions.length ? `<ol class="history-list">${ws.versions.map(version => `<li><strong>Version ${version.version}</strong> · ${escapeHtml(version.workflow === 'draft' ? 'reviewed draft' : version.workflow === 'direct' ? 'direct edit (not reviewed)' : 'before first change')} · ${escapeHtml(version.by)} · ${escapeHtml(formatDate(version.at))}${version.note ? `<br><small>${escapeHtml(version.note)}</small>` : ''}</li>`).join('')}</ol>` : '<p class="muted">No recorded changes yet.</p>'}</details>
        <details><summary>Legal decisions (${ws.compliance.history.length})</summary>${ws.compliance.history.length ? `<ol class="history-list">${ws.compliance.history.map(item => `<li>${escapeHtml(formatDate(item.at))} · ${escapeHtml(item.by || '')} · ${escapeHtml(item.event || item.status || '')}${item.note ? ` — ${escapeHtml(item.note)}` : ''}</li>`).join('')}</ol>` : '<p class="muted">No legal decisions recorded.</p>'}</details>
        <details><summary>Activity log (${ws.activity.length})</summary><ol class="history-list">${ws.activity.map(item => `<li>${escapeHtml(formatDate(item.createdAt || item.at))} · ${escapeHtml(item.actorEmail || '')} · ${escapeHtml(item.action)}</li>`).join('')}</ol></details>
      </section>`;
  }

  function draftForm(draft) {
    const ws = v19.workspace;
    const fields = draft?.fields || {};
    const sourceOf = field => draft?.sources?.find(source => source.field === field) || {};
    const docOptions = selected => ws.documents.filter(doc => !doc.supersededBy && doc.kind !== 'product_image').map(doc => `<option value="${doc.id}" ${selected === doc.id ? 'selected' : ''}>${escapeHtml(doc.title)}${doc.status === 'verified' ? '' : ' (not verified)'}</option>`).join('');
    return `<form class="draft-form" id="draft-form" data-draft-id="${draft?.id || ''}">
      <h5>${draft ? 'Edit draft' : 'New draft'}</h5>
      <p class="help-text">Fill in only what you want to change. Write facts from verified documents — never effects, dosing or claims. For each field, say where the text comes from. Nothing goes live until it is reviewed and applied.</p>
      ${Object.entries(FIELD_LABELS).map(([field, text]) => {
        const long = ['fullDescription', 'warnings', 'ingredients', 'usage'].includes(field);
        const value = fields[field] ?? ws.live[field] ?? '';
        const source = sourceOf(field);
        return `<fieldset class="draft-field"><label class="field field--wide"><span>${escapeHtml(text)}</span>${long ? `<textarea rows="4" data-draft-field="${field}">${escapeHtml(value)}</textarea>` : `<input data-draft-field="${field}" value="${escapeHtml(value)}">`}<small>${escapeHtml(FIELD_HELP[field])}</small></label>
          <label class="field draft-source"><span>Source for ${escapeHtml(text.toLowerCase())}</span><select data-draft-source="${field}"><option value="">— unchanged / not given —</option><optgroup label="Uploaded documents">${docOptions(source.ref)}</optgroup><option value="supplier" ${source.kind === 'supplier' && !source.ref ? 'selected' : ''}>Supplier information (not uploaded)</option><option value="manual" ${source.kind === 'manual' ? 'selected' : ''}>Written by me (needs a reviewer)</option></select></label></fieldset>`;
      }).join('')}
      <label class="field field--wide"><span>Note for the reviewer</span><input id="draft-note" placeholder="What changed and why"></label>
      <div class="admin-actions"><button class="button button--light" type="submit" data-then="save">Save draft</button><button class="button button--primary" type="submit" data-then="submit">Save and submit for review</button><button class="link-button" type="button" id="draft-cancel">Cancel</button></div>
    </form>`;
  }

  function collectDraft(form) {
    const ws = v19.workspace;
    const fields = {};
    const sources = [];
    form.querySelectorAll('[data-draft-field]').forEach(input => {
      const field = input.dataset.draftField;
      const value = input.value.trim();
      if (value !== String(ws.live[field] || '').trim()) fields[field] = value;
      const source = form.querySelector(`[data-draft-source="${field}"]`)?.value;
      if (source && fields[field] !== undefined) sources.push(source.startsWith('doc_') ? { field, kind: 'document', ref: source } : { field, kind: source });
    });
    return { fields, sources, note: $('draft-note')?.value || '' };
  }

  async function submitDraftForm(form, then) {
    const ws = v19.workspace;
    const body = collectDraft(form);
    if (!Object.keys(body.fields).length) return showMessage('Nothing has changed compared to the live text.');
    const existing = form.dataset.draftId;
    const saved = await run(() => existing
      ? requestJson(`/api/admin/drafts/${existing}`, { method: 'PATCH', body: JSON.stringify(body) })
      : requestJson(`/api/admin/products/${encodeURIComponent(ws.summary.id)}/drafts`, { method: 'POST', body: JSON.stringify(body) }));
    if (!saved) return;
    if (then === 'submit') {
      const sent = await run(() => requestJson(`/api/admin/drafts/${saved.draft.id}/submit`, { method: 'POST', body: '{}' }), 'Draft saved and sent for review. A reviewer will see it under Changes to review.');
      if (!sent) return openWorkspace(ws.summary.id, { scroll: false });
    } else {
      showMessage(`Draft saved. Submit it for review when it is ready.${saved.validation?.warnings?.length ? ` Note: ${saved.validation.warnings[0]}` : ''}`, 'success');
    }
    await refreshAfterChange();
  }

  async function refreshAfterChange() {
    const id = v19.current;
    await Promise.all([loadProducts(), loadOverview(), loadQueue()]);
    if (id) await openWorkspace(id, { scroll: false });
  }

  async function draftDecision(id, decision) {
    const draft = findDraft(id);
    let note = '';
    let selfReviewConfirmed = false;
    if (decision === 'request_changes') {
      note = window.prompt('Which changes are needed? (required)') || '';
      if (note.trim().length < 3) return showMessage('Write a short explanation so the author knows what to change.');
    } else {
      if (draft && draft.createdBy === state.dashboard?.currentUser?.email) {
        if (state.dashboard?.currentUser?.role !== 'owner') return showMessage('You wrote this draft. Ask another owner or admin to review it.');
        if (!window.confirm('You wrote this draft yourself. A second person should normally review it. Approve it anyway as the owner? This is recorded as a self-review.')) return;
        selfReviewConfirmed = true;
      } else if (!window.confirm('Approve this text for the product page? This is an editorial approval only — it does not publish the product or change its legal status.')) return;
      note = window.prompt('Optional note for the record (e.g. "matches supplier sheet")') || '';
    }
    const done = await run(() => requestJson(`/api/admin/drafts/${id}/review`, { method: 'POST', body: JSON.stringify({ decision, note, selfReviewConfirmed }) }));
    if (!done) return;
    showMessage(done.draft.status === 'external_review' ? 'Approved editorially. Because the text contains claims, it now needs an external (legal) review before it can go live.' : decision === 'approve' ? 'Text approved. It can now be made live.' : 'Sent back to the author with your note.', 'success');
    await refreshAfterChange();
  }

  function findDraft(id) {
    return v19.workspace?.drafts.find(draft => draft.id === id) || v19.queue.find(draft => draft.id === id);
  }

  async function externalReview(id) {
    const reviewer = window.prompt('Name of the external reviewer (e.g. law firm, regulatory consultant)');
    if (!reviewer) return;
    const reference = window.prompt('Reference to their written opinion (memo number, email date, file name)');
    if (!reference) return;
    const approve = window.confirm(`Did ${reviewer} approve this exact text?\n\nOK = approved · Cancel = changes requested`);
    const note = window.prompt('Note (optional)') || '';
    const done = await run(() => requestJson(`/api/admin/drafts/${id}/external-review`, { method: 'POST', body: JSON.stringify({ reviewer, reference, decision: approve ? 'approve' : 'request_changes', note }) }), approve ? 'External approval recorded. The text can now be made live.' : 'External review recorded: changes requested.');
    if (done) await refreshAfterChange();
  }

  async function applyDraft(id) {
    if (!window.confirm('Replace the live product text with this approved draft?\n\nThe current text is kept as an earlier version. This does not publish a hidden product or change its legal status.')) return;
    const done = await run(() => requestJson(`/api/admin/drafts/${id}/apply`, { method: 'POST', body: JSON.stringify({ confirm: true }) }), 'The approved text is now live. The previous text is saved under History.');
    if (done) { await refreshAfterChange(); await A.loadDashboard().catch(() => {}); }
  }

  async function withdrawDraft(id) {
    if (!window.confirm('Withdraw this draft? It stays in the history but can no longer be reviewed.')) return;
    const done = await run(() => requestJson(`/api/admin/drafts/${id}/withdraw`, { method: 'POST', body: '{}' }), 'Draft withdrawn.');
    if (done) await refreshAfterChange();
  }

  /* Images are resized in the browser (max 2400 px, WebP) before upload, so large camera files
     do not need manual optimisation. PDFs are uploaded unchanged. */
  async function prepareFile(file, kind) {
    if (kind !== 'product_image' || !/^image\/(png|jpeg|webp)$/.test(file.type) || !window.createImageBitmap) return { body: file, note: '' };
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return { body: file, note: '' };
    return { body: blob, note: `Optimised from ${bytes(file.size)} to ${bytes(blob.size)} (${canvas.width}×${canvas.height}px WebP).` };
  }

  async function uploadDocument(form) {
    const ws = v19.workspace;
    const kind = form.kind.value;
    const file = form.file.files[0];
    if (!kind || !file) return showMessage('Choose what kind of document it is and select a file.');
    if (file.size > 15 * 1024 * 1024) return showMessage('The file is larger than 15 MB. Save a smaller version and try again.');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Uploading…';
    try {
      const prepared = await prepareFile(file, kind);
      const response = await fetch(`/api/admin/products/${encodeURIComponent(ws.summary.id)}/documents`, {
        method: 'POST', credentials: 'same-origin', body: prepared.body,
        headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': state.csrf, 'X-Document-Kind': kind, 'X-Document-Title': encodeURIComponent(form.title.value.trim()), ...(form.supersedes.value ? { 'X-Supersedes': form.supersedes.value } : {}) }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.message || 'Upload failed.'), { status: response.status, payload });
      const parts = ['Document uploaded. It is private and marked “not verified” until you check it.'];
      if (prepared.note) parts.push(prepared.note);
      if (payload.warnings?.length) parts.push(...payload.warnings);
      if (payload.flaggedForReReview) parts.push(`${payload.flaggedForReReview} earlier approval(s) relied on the replaced document and must be reviewed again.`);
      showMessage(parts.join(' '), payload.warnings?.length || payload.flaggedForReReview ? 'warning' : 'success');
      await refreshAfterChange();
    } catch (error) {
      showMessage(friendlyError(error));
      button.disabled = false; button.textContent = 'Upload';
    }
  }

  async function verifyDocument(id, status) {
    const doc = v19.workspace.documents.find(item => item.id === id);
    const note = window.prompt(status === 'verified'
      ? `What did you check in “${doc?.title}”? (e.g. "Batch and lab match the label; signed COA dated 2026-03-01")`
      : 'Why is this document rejected?');
    if (note === null) return;
    const done = await run(() => requestJson(`/api/admin/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }), status === 'verified' ? 'Document marked verified. It is still private.' : 'Document rejected.');
    if (done) await refreshAfterChange();
  }

  async function useImage(id) {
    const ws = v19.workspace;
    const doc = ws.documents.find(item => item.id === id);
    const alt = window.prompt('Describe the photo for screen readers', doc?.title || '');
    if (alt === null) return;
    const created = await run(() => requestJson(`/api/admin/products/${encodeURIComponent(ws.summary.id)}/drafts`, { method: 'POST', body: JSON.stringify({ fields: { imageDocumentId: id, imageAlt: alt }, purpose: 'product_image', sources: [{ field: 'imageAlt', kind: 'document', ref: id }], note: 'New product photo' }) }));
    if (!created) return;
    await run(() => requestJson(`/api/admin/drafts/${created.draft.id}/submit`, { method: 'POST', body: '{}' }), 'Photo proposed and sent for review. After approval it can be made live.');
    await refreshAfterChange();
  }

  $('product-workspace')?.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    const ds = target.dataset;
    const slot = $('draft-editor-slot');
    if (target.id === 'workspace-new-draft') { slot.innerHTML = draftForm(null); slot.querySelector('[data-draft-field="shortDescription"]')?.focus(); return; }
    if (target.id === 'draft-cancel') { slot.innerHTML = ''; return; }
    if (target.id === 'doc-upload-cancel-replace') { const form = $('doc-upload'); form.supersedes.value = ''; $('doc-upload-title').textContent = 'Upload a document'; target.hidden = true; return; }
    if (ds.draftEdit) { slot.innerHTML = draftForm(findDraft(ds.draftEdit)); slot.scrollIntoView({ block: 'start' }); return; }
    if (ds.draftSubmit) return void run(() => requestJson(`/api/admin/drafts/${ds.draftSubmit}/submit`, { method: 'POST', body: '{}' }), 'Sent for review.').then(done => done && refreshAfterChange());
    if (ds.draftReview) return void draftDecision(ds.draftReview, ds.decision);
    if (ds.draftExternal) return void externalReview(ds.draftExternal);
    if (ds.draftApply) return void applyDraft(ds.draftApply);
    if (ds.draftWithdraw) return void withdrawDraft(ds.draftWithdraw);
    if (ds.docVerify) return void verifyDocument(ds.docVerify, 'verified');
    if (ds.docReject) return void verifyDocument(ds.docReject, 'rejected');
    if (ds.docUseImage) return void useImage(ds.docUseImage);
    if (ds.docReplace) {
      const form = $('doc-upload');
      const doc = v19.workspace.documents.find(item => item.id === ds.docReplace);
      form.supersedes.value = ds.docReplace;
      form.kind.value = doc.kind;
      form.title.value = doc.title;
      $('doc-upload-title').textContent = `Replace “${doc.title}” with a new version`;
      $('doc-upload-cancel-replace').hidden = false;
      form.scrollIntoView({ block: 'center' });
    }
  });
  $('product-workspace')?.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.id === 'draft-form') return void submitDraftForm(event.target, event.submitter?.dataset.then || 'save');
    if (event.target.id === 'doc-upload') return void uploadDocument(event.target);
  });
  $('admin-products')?.addEventListener('click', event => {
    const button = event.target.closest('[data-edit-product]');
    if (button) openWorkspace(button.dataset.editProduct);
  });

  /* ------------------------------------------------------------ review queue */
  async function loadQueue() {
    const node = $('review-queue');
    if (!node) return;
    try {
      const payload = await requestJson('/api/admin/review-queue');
      v19.queue = payload.items;
      const count = $('review-queue-count');
      if (count) { count.textContent = String(payload.items.length); count.hidden = !payload.items.length; }
      node.innerHTML = payload.items.length ? payload.items.map(item => `
        <article class="queue-item" data-queue-id="${item.id}">
          <div class="queue-item__head"><div><strong>${escapeHtml(item.productName)}</strong> ${pill(item.statusLabel, item.status === 'approved' ? 'approved_for_publication' : 'in_legal_review')}${item.requiresReReview ? pill('Re-review', 'needs_evidence') : ''}<br><small>Changes ${item.diff.map(part => escapeHtml(FIELD_LABELS[part.field] || part.field)).join(', ') || 'image'} · by ${escapeHtml(item.createdBy)} · ${escapeHtml(formatDate(item.updatedAt))}</small></div>
            <button class="button button--light" type="button" data-review-draft="${item.id}" aria-expanded="${v19.openProposals.has(item.id)}">${v19.openProposals.has(item.id) ? 'Close' : 'Open proposal'}</button></div>
          <div class="queue-item__body" ${v19.openProposals.has(item.id) ? '' : 'hidden'}>
            ${diffMarkup(item.diff)}
            ${item.validation.warnings.length ? `<ul class="draft-warnings">${item.validation.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
            <p class="draft-sources"><strong>Sources:</strong> ${item.sources.map(source => `${escapeHtml(FIELD_LABELS[source.field] || source.field)}: ${escapeHtml(source.kind)}${source.ref ? ` (${escapeHtml(source.ref)})` : ''}`).join('; ') || '<span class="warning-text">none given</span>'}</p>
            <div class="admin-actions">${payload.canReview ? draftActions(item, { canReview: true, canApply: true }) : '<p class="muted">Only an owner or admin can decide.</p>'}<button class="link-button" type="button" data-open-product="${escapeHtml(item.productId)}">Open product</button></div>
          </div>
        </article>`).join('') : '<div class="admin-empty">Nothing is waiting for review.</div>';
    } catch (error) {
      if (error.status !== 403) node.innerHTML = `<div class="admin-empty">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  $('review-queue')?.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    const ds = target.dataset;
    if (ds.reviewDraft) {
      const body = target.closest('.queue-item').querySelector('.queue-item__body');
      body.hidden = !body.hidden;
      if (body.hidden) v19.openProposals.delete(ds.reviewDraft); else v19.openProposals.add(ds.reviewDraft);
      target.setAttribute('aria-expanded', String(!body.hidden));
      target.textContent = body.hidden ? 'Open proposal' : 'Close';
      return;
    }
    if (ds.openProduct) { A.showTab('products'); return void openWorkspace(ds.openProduct); }
    if (ds.draftReview) return void draftDecision(ds.draftReview, ds.decision);
    if (ds.draftExternal) return void externalReview(ds.draftExternal);
    if (ds.draftApply) return void applyDraft(ds.draftApply);
    if (ds.draftWithdraw) return void withdrawDraft(ds.draftWithdraw);
    if (ds.draftSubmit) return void run(() => requestJson(`/api/admin/drafts/${ds.draftSubmit}/submit`, { method: 'POST', body: '{}' }), 'Sent for review.').then(done => done && refreshAfterChange());
    if (ds.draftEdit) { A.showTab('products'); return void openWorkspace(findDraft(ds.draftEdit).productId); }
  });

  /* ------------------------------------------------------------ import */
  $('open-import')?.addEventListener('click', () => { $('import-panel').hidden = false; $('import-content').focus(); });
  $('import-close')?.addEventListener('click', () => { $('import-panel').hidden = true; });
  $('import-file')?.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 900_000) return showMessage('The file is larger than 900 KB. Split it into smaller files.');
    $('import-content').value = await file.text();
    $('import-format').value = /\.json$/i.test(file.name) ? 'json' : 'csv';
    if (!$('import-filename').value) $('import-filename').value = file.name;
  });
  const importBody = extra => JSON.stringify({ format: $('import-format').value, content: $('import-content').value, filename: $('import-filename').value || 'import', ...extra });
  $('import-preview')?.addEventListener('click', async () => {
    const preview = await run(() => requestJson('/api/admin/import/preview', { method: 'POST', body: importBody() }));
    const out = $('import-result');
    if (!preview) { $('import-apply').hidden = true; return; }
    v19.importPreview = preview;
    const creatable = preview.rows.filter(row => !row.errors.length && row.changes.length).length;
    out.innerHTML = `<p><strong>${preview.valid}</strong> row(s) OK · <strong>${preview.invalid}</strong> with errors. ${creatable} draft(s) would be created. Nothing is live until reviewed.</p>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Row</th><th>Product</th><th>Changes</th><th>Problems</th></tr></thead><tbody>${preview.rows.map(row => `<tr class="${row.errors.length ? 'is-error' : ''}"><td>${row.row}</td><td>${escapeHtml(row.name || row.productId || '—')}</td><td>${escapeHtml(row.changes.map(field => FIELD_LABELS[field] || field).join(', ') || 'none')}</td><td>${[...row.errors.map(error => `<span class="warning-text">${escapeHtml(error)}</span>`), ...row.warnings.map(warning => escapeHtml(warning))].join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>`;
    $('import-apply').hidden = creatable === 0;
    $('import-apply').textContent = `Create ${creatable} draft(s)`;
    $('import-apply').dataset.count = String(preview.valid);
  });
  $('import-apply')?.addEventListener('click', async () => {
    const count = Number($('import-apply').dataset.count);
    if (!window.confirm(`Create drafts for ${count} product(s)? They will wait for review; nothing goes live.`)) return;
    const done = await run(() => requestJson('/api/admin/import/apply', { method: 'POST', body: importBody({ confirmCount: count }) }));
    if (!done) return;
    showMessage(`${done.created.length} draft(s) created from the import. Submit each one for review from the product page.`, 'success');
    $('import-result').innerHTML = '';
    $('import-apply').hidden = true;
    await refreshAfterChange();
  });

  /* ------------------------------------------------------------ wiring */
  document.addEventListener('verapep:dashboard', () => {
    loadOverview();
    if (state.dashboard?.permissions?.includes('products')) { loadProducts(); loadQueue(); }
    if (v19.current) openWorkspace(v19.current, { scroll: false });
  });
  $('overview-refresh')?.addEventListener('click', loadOverview);
  document.addEventListener('verapep:tab', event => {
    if (event.detail === 'review-queue') loadQueue();
    if (event.detail === 'overview') loadOverview();
  });
})();

/* v19: reviewed Swedish translations for Ask Vera (Guide & Ask Vera tab). */
(() => {
  'use strict';
  const A = window.VerapepAdmin;
  const list = document.getElementById('vera-translation-list');
  if (!A || !list) return;
  const { requestJson, escapeHtml, showMessage, formatDate } = A;
  const STATUS = { approved: ['Approved — shown to visitors', 'approved_for_publication'], proposed: ['Proposal — not shown', 'needs_evidence'], outdated: ['English changed — update needed', 'do_not_publish'], missing: ['Missing', ''] };
  let canApprove = false;

  async function load() {
    try {
      const payload = await requestJson('/api/admin/vera-translations');
      canApprove = payload.canApprove;
      const counts = payload.items.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
      list.innerHTML = `<p><strong>${counts.approved || 0}</strong> of ${payload.items.length} approved · ${counts.proposed || 0} proposals waiting · ${counts.outdated || 0} outdated</p>` + payload.items.map(item => `
        <details class="translation-item" data-translation-key="${escapeHtml(item.key)}">
          <summary><span>${escapeHtml(item.title)}</span> <span class="status-pill status-pill--${STATUS[item.status][1]}">${escapeHtml(STATUS[item.status][0])}</span></summary>
          <p class="muted"><strong>English (source):</strong> ${escapeHtml(item.english)}</p>
          <label class="field field--wide"><span>Swedish</span><textarea rows="3" lang="sv" data-translation-text>${escapeHtml(item.text)}</textarea></label>
          ${item.approvedBy ? `<p class="muted">Approved by ${escapeHtml(item.approvedBy)} · ${escapeHtml(formatDate(item.approvedAt))}</p>` : ''}
          <div class="admin-actions"><button class="button button--light" type="button" data-translation-action="save">Save as proposal</button>${canApprove && item.status === 'proposed' ? '<button class="button button--primary" type="button" data-translation-action="approve">Approve translation</button>' : ''}${canApprove && item.status === 'approved' ? '<button class="link-button" type="button" data-translation-action="revoke">Withdraw approval</button>' : ''}</div>
        </details>`).join('');
    } catch (error) {
      if (error.status !== 403) list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-translation-action]');
    if (!button) return;
    const item = button.closest('[data-translation-key]');
    const action = button.dataset.translationAction;
    if (action === 'approve' && !window.confirm('Approve this Swedish text? Check that it says exactly the same as the English answer — no more, no less. Approved text is shown to visitors who ask in Swedish.')) return;
    try {
      await requestJson(`/api/admin/vera-translations/sv/${encodeURIComponent(item.dataset.translationKey)}`, { method: 'PATCH', body: JSON.stringify({ action, text: item.querySelector('[data-translation-text]').value, confirm: action === 'approve' }) });
      showMessage(action === 'approve' ? 'Translation approved. Vera now uses it for Swedish questions.' : action === 'revoke' ? 'Approval withdrawn. Vera answers this in English again.' : 'Saved as a proposal. It is not shown until approved.', 'success');
      await load();
    } catch (error) { showMessage(error.message); }
  });
  document.addEventListener('verapep:tab', event => { if (event.detail === 'guide') load(); });
  document.addEventListener('verapep:dashboard', () => { if (A.state.activeTab === 'guide') load(); });
})();
