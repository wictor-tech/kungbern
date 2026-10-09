/* VERAPEP v19 — Ask Vera in the visitor's language, only with reviewed translations.

   The English knowledge base stays the source. A translated answer is used only when
     - the visitor's question is detected as Swedish,
     - an owner/admin has approved that translation in admin (status "approved"), and
     - the English source has not changed since the approval (hash check).
   Otherwise Vera answers in English and says that a reviewed translation is not available yet.
   Product facts are always shown as published (not translated). No generative AI is involved. */
import crypto from 'node:crypto';
import { fillTemplate } from './vera.mjs';

export const LANGUAGES = { sv: 'Svenska' };
export const STRING_KEYS = ['safety', 'privacy', 'greeting', 'thanks', 'fallback', 'unknownProduct', 'empty'];

/* Not a translation: shown with English answers when no approved Swedish text exists. */
const NOT_TRANSLATED = {
  sv: 'Det här svaret finns ännu inte i en granskad svensk översättning, så det visas på engelska.'
};
const LINK_LABELS = {
  sv: {
    '/shipping-returns.html': 'Leverans och returer', '/privacy.html': 'Integritet', '/terms.html': 'Villkor', '/order.html': 'Spåra en beställning',
    '/my-pages.html': 'Mina sidor', '/support.html': 'Fråga Vera', '/index.html#catalogue': 'Katalogen', '/index.html#quality': 'Så granskas informationen',
    '/index.html#finder': 'Produktguiden', '/index.html?reports=yes#catalogue': 'Produkter med labbrapport', '/my-pages.html#saved-products': 'Sparade produkter', '/support.html#contact': 'Kontakt'
  }
};

export const sourceHash = text => crypto.createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 16);

const SV_MARKERS = new Set(['hur', 'vad', 'var', 'vilka', 'vilken', 'vilket', 'när', 'nar', 'varför', 'varfor', 'jag', 'min', 'mitt', 'mina', 'kan', 'är', 'ar', 'och', 'finns', 'inte', 'ni', 'att', 'det', 'för', 'med', 'om', 'hej', 'tack', 'får', 'far', 'går', 'gar', 'leverans', 'skicka', 'beställning', 'bestallning', 'retur', 'betala', 'lång', 'lang', 'tid', 'någon', 'nagon', 'eller', 'sverige', 'kontakta', 'ska', 'vill', 'måste', 'mig', 'er', 'era', 'hittar', 'hitta']);
const EN_MARKERS = new Set(['how', 'what', 'where', 'which', 'when', 'why', 'i', 'my', 'can', 'is', 'and', 'the', 'do', 'does', 'you', 'to', 'of', 'for', 'with', 'are']);

/* Returns 'sv' or 'en'. A visitor-chosen language ('sv'|'en') wins when given. */
export function detectLanguage(raw, preferred = '') {
  if (preferred === 'sv' || preferred === 'en') return preferred;
  const text = String(raw || '').toLowerCase();
  const words = text.match(/[a-zåäöé]+/g) || [];
  let sv = /[åäö]/.test(text) ? 2 : 0;
  let en = 0;
  for (const word of words) { if (SV_MARKERS.has(word)) sv += 1; if (EN_MARKERS.has(word)) en += 1; }
  return sv >= 2 && sv > en ? 'sv' : sv >= 1 && words.length <= 2 && en === 0 ? 'sv' : 'en';
}

/* Swedish values for the knowledge-base placeholders, built from the same facts as the English ones. */
export function localVars(lang, facts, englishVars) {
  if (lang !== 'sv' || !facts) return englishVars;
  let countryNames = englishVars.deliveryCountries;
  try {
    const names = new Intl.DisplayNames(['sv'], { type: 'region' });
    countryNames = facts.countryCodes.map(code => names.of(code) || code).join(', ');
  } catch { /* keep English names */ }
  return {
    ...englishVars,
    deliveryEstimate: String(englishVars.deliveryEstimate || '').replace(/\bbusiness days?\b/i, 'arbetsdagar').replace(/\bdays?\b/i, 'dagar').replace(/\bweeks?\b/i, 'veckor'),
    deliveryCountries: countryNames,
    orderingStatus: facts.orderable === 0 ? 'Inga produkter kan beställas just nu.' : `${facts.orderable} ${facts.orderable === 1 ? 'produkt kan' : 'produkter kan'} beställas just nu.`,
    labReportStatus: facts.withReports === 0 ? 'Inga labbrapporter har publicerats ännu.' : `${facts.withReports} ${facts.withReports === 1 ? 'produkt har' : 'produkter har'} en publicerad labbrapport.`,
    companyLine: facts.companyName ? `VERAPEP drivs av ${facts.companyName}${facts.companyRegistration ? `, organisationsnummer ${facts.companyRegistration}` : ''}.` : 'Operatörens registrerade företagsuppgifter har inte publicerats ännu.'
  };
}

function approved(item, source) {
  return item && item.status === 'approved' && item.text && item.sourceHash === sourceHash(source);
}

/* English source text for each translatable key, so approvals can be checked against it. */
export function englishSources(kb, engineStrings) {
  const sources = {};
  for (const key of STRING_KEYS) sources[`string:${key}`] = { kind: 'string', key, title: key, text: key === 'fallback' ? (kb?.fallback || engineStrings.fallback) : engineStrings[key] };
  for (const entry of kb?.entries || []) sources[`entry:${entry.id}`] = { kind: 'entry', key: entry.id, title: entry.title, text: entry.answer };
  return sources;
}

/* Rewrites an English Vera result into the visitor's language where an approved translation exists. */
export function localise(result, { lang, store, kb, engineStrings, vars, facts }) {
  if (lang !== 'sv') return { ...result, language: 'en' };
  const items = store?.languages?.sv?.items || {};
  const sources = englishSources(kb, engineStrings);
  const keyFor = () => {
    if (result.kind === 'safety') return 'string:safety';
    if (result.kind === 'greeting') return result.source === 'thanks' ? 'string:thanks' : 'string:greeting';
    if (result.kind === 'fallback') return 'string:fallback';
    if (result.kind === 'unknown_product') return 'string:unknownProduct';
    if (result.kind === 'empty') return 'string:empty';
    if (result.kind === 'knowledge') return `entry:${result.source}`;
    return null; // product facts are shown as published
  };
  const key = keyFor();
  const source = key ? sources[key] : null;
  const item = key ? items[key] : null;
  const out = { ...result };
  if (source && approved(item, source.text)) {
    out.answer = fillTemplate(item.text, localVars('sv', facts, vars));
    out.language = 'sv';
    out.links = (out.links || []).map(link => ({ ...link, label: LINK_LABELS.sv[link.url] || link.label }));
  } else {
    out.language = 'en';
    out.languageNotice = NOT_TRANSLATED.sv;
  }
  if (out.notice && approved(items['string:privacy'], engineStrings.privacy)) out.notice = items['string:privacy'].text;
  return out;
}

/* Admin listing: every translatable text with its proposal and whether the approval is still valid. */
export function translationStatus(store, kb, engineStrings, lang = 'sv') {
  const items = store?.languages?.[lang]?.items || {};
  return Object.entries(englishSources(kb, engineStrings)).map(([key, source]) => {
    const item = items[key] || {};
    const stale = item.status === 'approved' && item.sourceHash !== sourceHash(source.text);
    return { key, kind: source.kind, title: source.title, english: source.text, text: item.text || '', status: stale ? 'outdated' : item.status || 'missing', approvedBy: item.approvedBy || null, approvedAt: item.approvedAt || null, note: item.note || '' };
  });
}
