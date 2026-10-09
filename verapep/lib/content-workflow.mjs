/* VERAPEP v19 — controlled product-content workflow.

   Draft → internal (editorial) review → external review when required → approved for a stated
   purpose → applied to the live product text. Every live change becomes a numbered version, so
   earlier texts are kept and can be compared.

   Rules that keep editorial and legal decisions apart:
   - Applying approved text never publishes a product. Visibility and sale stay governed by the
     compliance decision (lib/compliance.mjs); this module only records text.
   - Every approval is a single-draft action by a named person; there is no bulk approval.
   - Text that makes therapeutic, dosing or absolute claims cannot be approved editorially alone:
     it needs an external review record (named reviewer + reference).
   - Drafts keep the source of each field (document, import, manual) separate from the text, so
     "suggested" and "approved" information are never mixed up.
   - When a document a draft relied on is replaced, the draft is flagged for re-review. */
import crypto from 'node:crypto';
import { unsupportedClaims } from './compliance.mjs';

export const CONTENT_FIELDS = ['displayName', 'shortDescription', 'fullDescription', 'ingredients', 'storage', 'usage', 'warnings', 'imageAlt'];
export const CLAIM_FIELDS = ['displayName', 'shortDescription', 'fullDescription', 'ingredients', 'usage', 'warnings'];
export const DRAFT_STATUSES = ['draft', 'internal_review', 'external_review', 'approved', 'applied', 'rejected', 'withdrawn'];
export const DRAFT_STATUS_LABELS = {
  draft: 'Draft', internal_review: 'Internal review', external_review: 'External review',
  approved: 'Approved for stated purpose', applied: 'Live (applied)', rejected: 'Changes requested', withdrawn: 'Withdrawn'
};
export const PURPOSES = { product_page: 'Product page text', product_image: 'Product image' };
const LIMITS = { displayName: 160, shortDescription: 600, fullDescription: 4000, ingredients: 1000, storage: 1000, usage: 1000, warnings: 2000, imageAlt: 200 };

export function emptyStore() {
  return { version: 1, products: {} };
}

export function productEntry(store, productId) {
  store.products[productId] ||= { drafts: [], versions: [] };
  return store.products[productId];
}

export function snapshot(content = {}) {
  return Object.fromEntries(CONTENT_FIELDS.map(field => [field, String(content[field] ?? '')]));
}

export function hashFields(fields) {
  return crypto.createHash('sha256').update(JSON.stringify(CONTENT_FIELDS.map(field => String(fields[field] ?? '')))).digest('hex').slice(0, 16);
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

export function sanitiseFields(input = {}) {
  const fields = {};
  for (const field of CONTENT_FIELDS) if (input[field] !== undefined) fields[field] = clean(input[field], LIMITS[field]);
  if (input.imageDocumentId !== undefined) fields.imageDocumentId = clean(input.imageDocumentId, 80) || null;
  return fields;
}

/* Validation shown before anything is saved or submitted. Errors block submission; warnings
   are shown to reviewers. Nothing here invents or completes text. */
export function validateDraft(fields, { documents = [] } = {}) {
  const errors = [];
  const warnings = [];
  const claims = unsupportedClaims(fields);
  if (claims.length) warnings.push(...claims.map(claim => `${claim}: needs an external (legal) review before approval.`));
  if (fields.shortDescription !== undefined && fields.shortDescription && fields.shortDescription.length < 20) warnings.push('Short description is very short (under 20 characters).');
  for (const field of Object.keys(fields)) {
    if (field === 'imageDocumentId') continue;
    if (!CONTENT_FIELDS.includes(field)) errors.push(`Unknown field: ${field}`);
    if (/<\s*(script|iframe|object)|javascript:/i.test(String(fields[field]))) errors.push(`${field}: markup or scripts are not allowed.`);
    if (/\b(lorem ipsum|tbd|todo|xxx)\b/i.test(String(fields[field]))) errors.push(`${field}: contains placeholder text.`);
  }
  if (/\bresearch use only\b/i.test(Object.values(fields).join(' '))) warnings.push('"Research use only" wording does not change a product\'s legal status; legal review required.');
  if (fields.imageDocumentId) {
    const doc = documents.find(item => item.id === fields.imageDocumentId);
    if (!doc) errors.push('The selected image does not exist.');
    else if (doc.kind !== 'product_image') errors.push('The selected document is not a product image.');
    else if (doc.status !== 'verified') errors.push('The product image must be verified before it can be used.');
    if (!fields.imageAlt && !(doc && doc.title)) warnings.push('Add alternative text for the image.');
  }
  const changed = Object.keys(fields).length;
  if (!changed) errors.push('The draft does not change anything.');
  return { errors, warnings, claims, needsExternalReview: claims.length > 0 };
}

/* Word-level diff for reviewers: [{ type: 'same'|'added'|'removed', text }]. */
export function diffWords(before = '', after = '') {
  const a = String(before).split(/(\s+)/).filter(Boolean);
  const b = String(after).split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250000) return [{ type: 'removed', text: before }, { type: 'added', text: after }];
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { push('removed', a[i]); i += 1; }
    else { push('added', b[j]); j += 1; }
  }
  while (i < a.length) push('removed', a[i++]);
  while (j < b.length) push('added', b[j++]);
  return out;
}

export function draftDiff(draft, live) {
  return Object.keys(draft.fields).filter(field => field !== 'imageDocumentId').map(field => ({
    field, before: live[field] ?? '', after: draft.fields[field], changed: (live[field] ?? '') !== draft.fields[field], parts: diffWords(live[field] ?? '', draft.fields[field])
  }));
}

export function newDraft({ productId, fields, sources, purpose, by, liveVersion, note }) {
  const at = new Date().toISOString();
  return {
    id: `drf_${crypto.randomBytes(6).toString('hex')}`,
    productId,
    purpose: PURPOSES[purpose] ? purpose : 'product_page',
    fields,
    sources: (Array.isArray(sources) ? sources : []).slice(0, 40).map(source => ({ field: clean(source.field, 40), kind: ['document', 'import', 'manual', 'supplier'].includes(source.kind) ? source.kind : 'manual', ref: clean(source.ref, 200), note: clean(source.note, 300) })),
    status: 'draft',
    createdBy: by,
    createdAt: at,
    updatedAt: at,
    baseVersion: liveVersion,
    reviews: [],
    history: [{ at, by, action: 'created', note: clean(note, 300) }],
    requiresReReview: null
  };
}

export class WorkflowError extends Error {
  constructor(message, status = 409, code = 'workflow_error') { super(message); this.status = status; this.code = code; }
}

export function assertTransition(draft, allowed, action) {
  if (!allowed.includes(draft.status)) throw new WorkflowError(`A draft that is "${DRAFT_STATUS_LABELS[draft.status]}" cannot be ${action}.`, 409, 'invalid_draft_transition');
}

export function recordLiveVersion(entry, { fields, by, workflow, draftId = null, note = '' }) {
  const version = (entry.versions[entry.versions.length - 1]?.version || 0) + 1;
  entry.versions.push({ version, at: new Date().toISOString(), by, workflow, draftId, note: clean(note, 300), fields: snapshot(fields), hash: hashFields(fields) });
  if (entry.versions.length > 200) entry.versions.splice(0, entry.versions.length - 200);
  return version;
}
