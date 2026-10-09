/* v18: classification of the launch blockers reported by /api/ready.
   Classifying never removes or weakens a check — every blocker stays in `blockers` until the
   underlying requirement is actually met. This only says who can resolve it and how. */
export const BLOCKER_CATEGORIES = {
  deployment: 'Requires deployment configuration',
  owner: 'Requires an owner decision or owner action',
  legal: 'Requires legal assessment',
  documents: 'Requires external documents',
  technical: 'Technically solvable in code'
};

const RULES = [
  [/Persistent DATA_DIR|Persistent-storage acknowledgement/, 'deployment', 'Attach a persistent disk in the hosting platform, set DATA_DIR to it and PRODUCTION_PERSISTENCE_ACK=true.'],
  [/production admin password/, 'deployment', 'Set a strong ADMIN_PASSWORD secret in the hosting platform (never in git).'],
  [/per-user MFA/, 'owner', 'Each owner/admin signs in and enrols an authenticator under Admin → Security.'],
  [/MFA_ENCRYPTION_KEY/, 'deployment', 'Generate a random secret of at least 32 characters and set MFA_ENCRYPTION_KEY in the hosting platform; then re-enrol MFA.'],
  [/BASE_URL must use HTTPS/, 'deployment', 'Set BASE_URL to the final https:// address.'],
  [/Tax configuration/, 'owner', 'Confirm VAT handling per country with the accountant and set tax.configured in store settings.'],
  [/Transactional email|EMAIL_WEBHOOK_URL/, 'deployment', 'Choose an email provider (with a data-processing agreement) and configure EMAIL_DELIVERY_MODE/EMAIL_WEBHOOK_URL.'],
  [/Stripe live credentials|Stripe webhook secret/, 'deployment', 'Only after legal approval: add live Stripe keys and the webhook secret as hosting secrets.'],
  [/COMMERCE_ALLOWLIST|ENABLE_LIVE_COMMERCE|Live-commerce acknowledgement/, 'owner', 'Deliberate last step after every legal and product approval: allowlist approved variants and set the live-commerce flags.'],
  [/complete content plus an explicit live legal\/compliance approval/, 'documents', 'Needs verified product texts, lab reports and a recorded owner approval per product (Admin → Compliance review).'],
  [/recorded compliance approval for publication/, 'legal', 'A qualified reviewer must classify each product; the owner records the decision with its reference.'],
  [/changed after approval/, 'legal', 'Re-review the changed products and record a new decision.'],
  [/company identity/, 'owner', 'Provide legal name, registration number and address (COMPANY_* settings).'],
  [/Privacy\/GDPR review/, 'legal', 'Privacy policy, records of processing and (likely) a DPIA reviewed by counsel; then PRIVACY_REVIEW_ACK=true.'],
  [/Terms\/consumer-law review/, 'legal', 'Terms of sale, withdrawal and returns reviewed by counsel; then LEGAL_TERMS_REVIEW_ACK=true.'],
  [/checkout rehearsal/, 'owner', 'After everything above: run a full production checkout rehearsal and record PRODUCTION_CHECKOUT_TEST_ACK=true.'],
  [/managed transactional database|SQLite production/i, 'owner', 'Decide between a managed PostgreSQL migration (technical project) or a documented SQLite exception with persistent storage and backups.'],
  [/No enabled owner\/admin/, 'owner', 'Create an owner account.'],
  [/MFA seed\(s\) are not encrypted/, 'owner', 'Re-enrol MFA after MFA_ENCRYPTION_KEY is set.']
];

export function classifyBlocker(text) {
  const rule = RULES.find(([pattern]) => pattern.test(text));
  const category = rule ? rule[1] : 'owner';
  return { text, category, categoryLabel: BLOCKER_CATEGORIES[category], action: rule ? rule[2] : 'Review with the responsible owner.' };
}
