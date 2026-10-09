/* VERAPEP v17 — product compliance review workflow and publication gate.

   Principles
   - A human decides. The automated risk indicator below is a *suggestion*
     derived from product names only. It is not a legal classification and it
     can never approve anything: approval is a recorded decision by the owner
     with a traceable external review reference.
   - Safe by default. Products whose names indicate a regulated or clearly
     pharmacological substance are not shown publicly until approved, and in
     production nothing is shown or sold without an approval.
   - No bypass by renaming. The indicator checks the immutable catalogue name
     and id as well as any display name or search alias an editor adds, so a
     different display name or a "research" label cannot lower the risk. */

export const REVIEW_STATUSES = ['not_reviewed', 'needs_evidence', 'in_legal_review', 'approved_for_publication', 'do_not_publish'];

export const REVIEW_STATUS_LABELS = {
  not_reviewed: 'Not reviewed',
  needs_evidence: 'Needs evidence',
  in_legal_review: 'In legal review',
  approved_for_publication: 'Approved for specific publication',
  do_not_publish: 'Do not publish'
};

export const APPROVAL_SCOPES = ['information', 'sale'];
export const APPROVAL_CONFIRMATION = 'I_CONFIRM_A_QUALIFIED_REVIEWER_APPROVED_THIS_PUBLICATION';

// Statuses an editor may set. Approval is owner-only (see server).
export const NON_APPROVAL_STATUSES = REVIEW_STATUSES.filter(status => status !== 'approved_for_publication');

const REASONS = {
  authorisedMedicine: 'Name matches an active substance used in prescription-only medicinal products in the EU.',
  investigationalDrug: 'Name matches a substance in clinical development as a medicine (not an authorised product).',
  hormoneAxis: 'Name indicates a hormone, growth-hormone/IGF-axis or reproductive-hormone substance.',
  toxinOrOpioid: 'Name indicates a toxin or an opioid-receptor peptide.',
  melanocortin: 'Name indicates a melanocortin-receptor agonist (tanning/sexual-function claims are commonly associated with this class).',
  pharmacological: 'Name indicates a pharmacologically active peptide or compound whose legal status is not verified.',
  injectable: 'Sold in vials. Products intended for injection are normally regulated as medicinal products or medical devices; intended use is not stated.',
  noEvidence: 'No approved description, intended use, documentation or lab report is on file.'
};

// Normalised name fragments → reason keys. Matching is on lowercase alphanumerics.
const HIGH_RISK_RULES = [
  [['semaglutide', 'tirzepatide', 'insulin', 'somatropin', 'hgh191', 'botulinum', 'epo', 'erythropoietin', 'hcg', 'chorionicgonadotropin', 'hmg', 'menotropin', 'gonadorelin', 'triptorelin', 'oxytocin', 'alprostadil', 'mt1', 'afamelanotide', 'melatonin', 'cerebrolysin'], 'authorisedMedicine'],
  [['retatrutide', 'mazdutide', 'survodutide', 'cagrilintide', 'glp1', 'tesamorelin'], 'investigationalDrug'],
  [['hgh', 'growthhormone', 'cjc1295', 'ghrp', 'hexarelin', 'ipamorelin', 'sermorelin', 'igf1', 'igfdes', 'mgf', 'pegmgf', 'aod9604', 'follistatin', 'gdf8', 'ace031', 'kisspeptin', 'gonadorelin', 'triptorelin', 'hcg', 'hmg'], 'hormoneAxis'],
  [['botulinum', 'dermorphin'], 'toxinOrOpioid'],
  [['melanotan', 'mt2', 'mt1', 'pt141', 'bremelanotide'], 'melanocortin']
];

export function normaliseName(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

function nameVariants(product, content = {}) {
  return [product.name, product.id.replace(/-\d+$/, ''), content.displayName, ...(Array.isArray(content.searchAliases) ? content.searchAliases : [])]
    .map(normaliseName)
    .filter(Boolean);
}

function fragmentMatches(name, fragment) {
  // Three-letter fragments (epo, hcg, hmg, mt1, mt2, mgf, hgh) must stand alone or be followed by a
  // digit/known suffix, so "epo" does not match "epitalon".
  if (fragment.length <= 3) {
    return name === fragment || name.startsWith(fragment) && /^(\d|acetate|vial|iu|melanotan|fragment)/.test(name.slice(fragment.length)) || new RegExp(`(^|\\d)${fragment}(\\d|$)`).test(name);
  }
  return name.includes(fragment);
}

/* Automated suggestion. Returns { level, reasons, suggestedStatus, basis }. */
export function suggestRisk(product, content = {}) {
  const names = nameVariants(product, content);
  const reasonKeys = new Set();
  for (const [fragments, reason] of HIGH_RISK_RULES) {
    if (fragments.some(fragment => names.some(name => fragmentMatches(name, fragment)))) reasonKeys.add(reason);
  }
  const level = reasonKeys.size ? 'high' : 'elevated';
  if (!reasonKeys.size) reasonKeys.add('pharmacological');
  const specs = (product.variants || []).map(variant => String(variant.specification || '').toLowerCase()).join(' ');
  if (/vial/.test(specs)) reasonKeys.add('injectable');
  const hasEvidence = Boolean(String(content.shortDescription || '').trim() && String(content.usage || '').trim()) || (content.labReports || []).some(report => report.published && report.url);
  if (!hasEvidence) reasonKeys.add('noEvidence');
  return {
    level,
    reasons: [...reasonKeys].map(key => REASONS[key]),
    suggestedStatus: hasEvidence ? 'in_legal_review' : 'needs_evidence',
    basis: 'Automated name-based indicator. Not a legal classification; a qualified reviewer must decide.'
  };
}

export function defaultRecord() {
  return { status: 'not_reviewed', scope: null, markets: [], reviewReference: null, reviewer: null, decidedBy: null, decidedAt: null, note: '', evidence: [], history: [] };
}

export function recordFor(complianceDoc, productId) {
  return { ...defaultRecord(), ...(complianceDoc?.products?.[productId] || {}) };
}

/* gateMode: 'strict' (production, or PUBLICATION_GATE=strict) or 'preview'. */
/* v18: a hosted environment (Render, Vercel, Fly, Cloud Run, or any https BASE_URL) is treated as
   reachable by the public, so it defaults to the strict gate even when it is not "production".
   Only an explicit PUBLICATION_GATE=preview opts a hosted preview back into showing unreviewed
   lower-risk products; production can never opt out. */
export function isHostedEnvironment(env = process.env) {
  return Boolean(env.RENDER || env.VERCEL || env.FLY_APP_NAME || env.K_SERVICE || String(env.BASE_URL || '').startsWith('https://'));
}

export function resolveGateMode({ isProduction, configured, hosted = false }) {
  if (isProduction) return 'strict';
  const value = String(configured || '').trim().toLowerCase();
  if (value === 'strict') return 'strict';
  if (value === 'preview') return 'preview';
  // Private demo: every product as information only. The server only passes this value through
  // while the whole site is locked with SITE_ACCESS_PASSWORD (see server.mjs).
  if (value === 'demo-all') return 'demo-all';
  return hosted ? 'strict' : 'preview';
}

export function publicVisibility(product, content, record, gateMode) {
  if (record.status === 'do_not_publish') return { visible: false, reason: 'do_not_publish' };
  if (record.status === 'approved_for_publication') return { visible: true, reason: 'approved' };
  if (gateMode === 'strict') return { visible: false, reason: 'not_approved' };
  if (gateMode === 'demo-all') return { visible: true, reason: 'private_demo' };
  const risk = suggestRisk(product, content);
  if (risk.level === 'high') return { visible: false, reason: 'high_risk_not_reviewed' };
  return { visible: true, reason: 'preview_unreviewed' };
}

/* Sale (sandbox or live) additionally requires an approval whose scope includes sale. */
export function saleApproved(record, country = null) {
  if (record.status !== 'approved_for_publication' || record.scope !== 'sale') return false;
  if (!country) return Array.isArray(record.markets) && record.markets.length > 0;
  return Array.isArray(record.markets) && record.markets.includes(country);
}

export function inventoryRow(product, content, record, gateMode, policyEntry = {}) {
  const risk = suggestRisk(product, content);
  const visibility = publicVisibility(product, content, record, gateMode);
  const publishedReports = (content.labReports || []).filter(report => report.published && report.url);
  const verifiedFields = ['shortDescription', 'fullDescription', 'ingredients', 'usage', 'warnings', 'storage'].filter(field => String(content[field] || '').trim());
  return {
    id: product.id,
    name: product.name,
    displayName: content.displayName || product.name,
    category: product.category,
    variants: (product.variants || []).map(variant => ({ variantId: variant.variantId, catalogueNo: variant.catalogueNo, specification: variant.specification })),
    statedUse: String(content.usage || '').trim() || null,
    verifiedContentFields: verifiedFields,
    publishedLabReports: publishedReports.length,
    approvedDocuments: (record.evidence || []).length,
    publicationStatus: content.archived ? 'archived' : content.published === false ? 'unpublished' : 'published_flag_set',
    publiclyVisible: visibility.visible,
    visibilityReason: visibility.reason,
    marketsShown: visibility.visible ? (record.status === 'approved_for_publication' ? record.markets : ['all visitors (preview, unreviewed)']) : [],
    legalClassificationVerified: record.status === 'approved_for_publication',
    legalReviewOutstanding: record.status !== 'approved_for_publication' && record.status !== 'do_not_publish',
    unsupportedClaims: unsupportedClaims(content),
    commerce: { sandboxEnabled: policyEntry.sandboxEnabled === true, liveEnabled: policyEntry.liveEnabled === true },
    review: { ...record, statusLabel: REVIEW_STATUS_LABELS[record.status] || record.status, history: undefined },
    historyCount: (record.history || []).length,
    suggestion: risk
  };
}

const CLAIM_PATTERNS = [
  [/\b(cure|cures|treat|treats|treatment|heal|heals|prevent|prevents)\b/i, 'Therapeutic claim (treat/cure/prevent)'],
  [/\b(weight loss|lose weight|fat loss|burn fat|anti-?aging|reverse ageing|muscle growth)\b/i, 'Health/body-effect claim'],
  [/\b(clinically proven|scientifically proven|guaranteed|100% safe|no side effects)\b/i, 'Unsubstantiated absolute claim'],
  [/\b(dose|dosage|dosing|mg per|inject|injection|subcutaneous)\b/i, 'Dosing or administration instruction']
];

export function unsupportedClaims(content = {}) {
  const text = ['shortDescription', 'fullDescription', 'usage', 'warnings'].map(field => content[field] || '').join(' ');
  return CLAIM_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}
