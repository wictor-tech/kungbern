/* VERAPEP v17 — Ask Vera answer engine.

   Deterministic and retrieval-only: Vera can only return
     1. a fixed safety response (medical, dosing, treatment questions),
     2. an approved knowledge-base answer (data/support-kb.json → database),
     3. facts read from a publicly visible product record, or
     4. an honest "I don't have a published answer" fallback.
   It never composes new claims. Placeholders such as {supportEmail} are filled
   from configuration, and products hidden by the publication gate are treated
   as unknown. Questions are not stored anywhere. */

const SAFETY_ANSWER = 'I can\'t help with dosing, administration, medical effects or treatment, and I can\'t recommend products for a health goal. VERAPEP does not give medical advice. Please talk to a doctor or pharmacist about medicines and health questions.';
const PRIVACY_NOTICE = 'Please don\'t share personal details such as email addresses, phone numbers or health information here. I don\'t need them, and questions are not stored.';
const GREETING = 'Hello! I can help with delivery, returns, payment, lab reports, product information, privacy, contact details and finding your way around the site. What would you like to know?';

const THANKS = 'You\'re welcome. Is there anything else I can help you find?';
const UNKNOWN_PRODUCT = 'I don\'t have published information about that product. I can only answer about products that are listed in the catalogue.';
const EMPTY = 'Type a question, for example "How long does delivery take?"';
// A short question naming one thing: "tell me about X", "what is X", "X price", "vad kostar X".
const PRODUCT_QUESTION = /^(?:(?:tell me about|what is|whats|info about|information about|do you (?:sell|have|stock)|price of|berätta om|beratta om|vad ar|vad kostar|saljer ni|har ni) [\w-]+(?: [\w-]+)?|[\w-]+(?: [\w-]+)? (?:price|pris))$/;
const DEFAULT_FALLBACK = 'I don\'t have a published answer to that question. You can contact support at {supportEmail}.';
/* v19: fixed engine texts, exported so reviewed translations can be checked against them. */
export const ENGINE_STRINGS = Object.freeze({ safety: SAFETY_ANSWER, privacy: PRIVACY_NOTICE, greeting: GREETING, thanks: THANKS, unknownProduct: UNKNOWN_PRODUCT, empty: EMPTY, fallback: DEFAULT_FALLBACK });

// Swedish (and a few colloquial English) words → the English vocabulary used by the knowledge base.
const SYNONYMS = [
  [/\b(kontakt\w*|mejl\w*|e-?post|maila)\b/g, 'contact email'],
  [/\b(kundtjanst|kundservice|support)\b/g, 'customer service support'],
  [/\b(klagomal\w*|klaga\w*|reklamation\w*)\b/g, 'complaint contact'],
  [/\b(leverans\w*|levereras|leverera\w*|frakt\w*|skicka\w*|postn\w*)\b/g, 'delivery shipping'],
  [/\b(hur lang tid|hur lange|nar kommer)\b/g, 'how long'],
  [/\b(retur\w*|returnera\w*|angra\w*|angerratt\w*|aterbetal\w*|pengarna tillbaka)\b/g, 'returns refund withdrawal'],
  [/\b(integritet\w*|personuppgift\w*|kakor|dataskydd)\b/g, 'privacy personal data'],
  [/\b(villkor\w*|kopvillkor\w*)\b/g, 'terms conditions'],
  [/\b(spara min|sparar min|spara\w* order|var ar min|bestallning\w*|ordernummer)\b/g, 'track my order order status'],
  [/\b(pris\w*|kostar|kostnad\w*|moms)\b/g, 'price cost vat'],
  [/\b(betal\w*|kort|faktura)\b/g, 'payment pay'],
  [/\b(lander|land)\b/g, 'countries country'],
  [/\b(konto\w*|logga in|inloggning|losenord)\b/g, 'account login'],
  [/\b(sparade|favorit\w*|hjarta)\b/g, 'saved favourites'],
  [/\b(jamfor\w*)\b/g, 'compare'],
  [/\b(recension\w*|omdom\w*|betyg)\b/g, 'reviews ratings'],
  [/\b(labbrapport\w*|analysintyg|analysrapport\w*|certifikat|renhet)\b/g, 'lab report certificate purity'],
  [/\b(dokumentation|dokument)\b/g, 'documentation documents'],
  [/\b(saknas|tomt|ingen information)\b/g, 'missing not published'],
  [/\b(foretag\w*|agare|star bakom|vem driver|vilka ar ni|vem ar ni|organisationsnummer|adress)\b/g, 'company operator who behind'],
  [/\b(i lager|tillganglig\w*|kopa|kop|bestalla)\b/g, 'available buy order'],
  [/\b(sok\w*|hitta\w*|leta\w*)\b/g, 'search find'],
  [/\b(guide\w*|filter\w*|kategori\w*)\b/g, 'finder filter category'],
  [/\b(lita pa|palitlig\w*|trovardig\w*|kontrollera\w*|verifiera\w*|seriös\w*|serios\w*)\b/g, 'trust reliable verified'],
  [/\b(hej|hallå|halla|tjena|god dag)\b/g, 'hello'],
  [/\b(tack|tackar)\b/g, 'thanks'],
  [/\b(ship|ships|shipped)\b/g, 'shipping delivery'],
  [/\b(gdpr)\b/g, 'privacy personal data'],
  [/\b(coa|coas)\b/g, 'lab report certificate']
];

// Questions Vera must refuse: dosing, administration, effects, treatment, health-goal recommendations.
const SAFETY_PATTERNS = [
  /\b(dose|doses|dosage|dosing|microdose|titrat\w*|reconstitut\w*|subq|sub-q|subcutaneous\w*|intramuscular\w*|inject\w*|needle\w*|syringe\w*)\b/,
  /\bhow (much|many|often)\b.*\b(take|inject|use|run|dose|cycle|units?|mg|mcg|iu)\b/,
  /\b(take|inject|use|run|dose)\b.*\b(per day|per week|daily|weekly|a day|a week)\b/,
  /\b(cycle|stack|protocol|regimen|bloodwork)\b/,
  /\b(side effect\w*|adverse|contraindicat\w*|interaction|interactions|interacts with|overdose|toxicit\w*|allerg\w*)\b/,
  /\b(is it safe|safe to (take|use|inject)|dangerous|harmful)\b/,
  /\b(pregnan\w*|breastfeed\w*|nursing|child|children|kids?)\b/,
  /\b(treat\w*|cure|cures|curing|heal|heals|healing|therap\w*|prescri\w*|diagnos\w*|symptom\w*|disease\w*|illness|diabet\w*|cancer|tumou?r|obes\w*|insulin resistance|injur\w*|pain|arthritis|alzheimer\w*|depress\w*|anxiety|infertil\w*|erectile)\b/,
  /\b(lose weight|weight loss|losing weight|burn fat|fat loss|build muscle|muscle growth|gain muscle|bulking|cutting|anti ?aging|anti ?ageing|tanning|libido)\b/,
  /\b(recommend|suggest|best)\b.*\b(for (me|my)|to help|to lose|to gain|to improve|to treat)\b/,
  // v18: effect questions ("does X help wrinkles", "what are the benefits of X") are medical claims too.
  /\b(help|helps|work|works|effective|good|benefit\w*|improve\w*|reduce\w*|boost\w*|increase\w*)\b.*\b(wrinkle\w*|skin|acne|hair|sleep|anxiety|stress|recover\w*|fat|weight|muscle\w*|libido|energy|memory|focus|immun\w*|inflamm\w*|joint\w*|tendon\w*|ageing|aging|longevity|testosterone|hormone\w*)\b/,
  /\b(used for|effect|effects|benefit|benefits|results|how (does|do) it work|mechanism)\b/,
  /\b(which|what) (peptide|product|one)\b.*\b(should i|for (me|my)|to (take|use|lose|gain|improve))\b/,
  // v20: dosing, mixing and recommendation questions found missing in the independent audit.
  /\b(doser\w*|dosier\w*|dosis|hur ofta ska (jag|man|du) ta|hur mycket ska (jag|man|du) ta|mg per kg|mcg per kg|per kilo)\b/,
  /\b(blanda\w*|rekonstitu\w*|bakteriostat\w*|bacteriostatic|mix\w*)\b.*\b(vatten|water|pulver|powder|peptid\w*|vial\w*|flask\w*)\b/,
  /\b(bakteriostat\w*|bacteriostatic)\b/,
  /\b(basta|bast)\b.*\b(peptid\w*|produkt\w*|for|mot)\b/,
  /\b(recommend|suggest)\w*\b.*\b(for|against)\b/,
  /\b(barn|nebenwirkung\w*|spritze\w*|injizier\w*|efectos secundarios|inyect\w*|muskl\w*|muskelmassa|somn|sova battre)\b/,
  // Swedish
  /\b(dos|doser|dosering\w*|spruta|sprutor|injicera\w*|injektion\w*|biverkning\w*|behandl\w*|bota|botar|gravid|amma\w*|ammar|recept\w*|lakare|sjukdom\w*|symtom\w*|ont i|smarta|diabetes|cancer|ga ner i vikt|gar ner i vikt|banta\w*|forbranna fett|bygga muskler|muskelmassa|hur mycket ska jag|hur ofta ska jag|ar det farligt|ar det sakert|hjalper\b.*\b(mot|for|med)|effekt\w*|anvands\b.*\b(till|for)|rynk\w*|somnen|angest)\b/
];

const PERSONAL_DATA_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /\b(19|20)?\d{6}[-+]?\d{4}\b/, // Swedish personal identity number
];

function containsPhoneNumber(raw) {
  // A run of 9+ digits with common separators; dates such as 2025-10-09 have 8.
  return (String(raw || '').match(/\+?\d[\d\s().-]{6,}\d/g) || []).some(run => run.replace(/\D/g, '').length >= 9);
}

const STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'do', 'does', 'i', 'you', 'we', 'it', 'to', 'of', 'for', 'and', 'or', 'on', 'in', 'my', 'me', 'can', 'what', 'how', 'your', 'with', 'this', 'that', 'be', 'there', 'any', 'about', 'please', 'jag', 'du', 'ni', 'det', 'och', 'att', 'en', 'ett', 'har', 'hur', 'vad', 'ar', 'pa', 'med', 'for', 'om', 'er', 'mig', 'kan']);

export function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9@+.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* v20: Swedish words the synonym list understands, so a misspelling ("leverns", "retrur") is
   recognised the same way English keywords already are. Only words of 6+ letters are corrected. */
const SWEDISH_VOCABULARY = ['leverans', 'leveranstid', 'leverera', 'frakten', 'returnera', 'returer', 'betalning', 'betala', 'integritet', 'personuppgifter', 'villkor', 'kopvillkor', 'bestallning', 'ordernummer', 'kontakt', 'kontakta', 'kundtjanst', 'kundservice', 'reklamation', 'labbrapport', 'analysintyg', 'certifikat', 'recension', 'foretag', 'organisationsnummer', 'tillganglig', 'jamfora', 'favoriter', 'inloggning', 'losenord', 'dokumentation'];

function correctSwedish(text) {
  return text.split(' ').map(word => {
    if (word.length < 6 || SWEDISH_VOCABULARY.includes(word)) return word;
    const limit = word.length >= 8 ? 2 : 1;
    const match = SWEDISH_VOCABULARY.find(candidate => candidate[0] === word[0] && editDistance(word, candidate, limit) <= limit);
    return match ? `${word} ${match}` : word;
  }).join(' ');
}

function expand(text) {
  let expanded = ` ${correctSwedish(text)} `;
  for (const [pattern, replacement] of SYNONYMS) expanded = expanded.replace(pattern, match => `${match} ${replacement}`);
  return expanded.replace(/\s+/g, ' ').trim();
}

function tokens(text) {
  return text.split(/[\s.\-]+/).filter(word => word && !STOPWORDS.has(word));
}

function stem(word) {
  return word.length > 4 ? word.replace(/(ings|ing|ies|es|s|ed)$/, '') : word;
}

export function isSafetyQuestion(normalised) {
  // v20: also check a de-obfuscated copy ("d0sage", "inj3ct", "b p c" stays as is).
  const plain = normalised.replace(/0/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  return SAFETY_PATTERNS.some(pattern => pattern.test(normalised) || pattern.test(plain));
}

export function containsPersonalData(raw) {
  return PERSONAL_DATA_PATTERNS.some(pattern => pattern.test(String(raw || ''))) || containsPhoneNumber(raw);
}

export function fillTemplate(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (match, key) => (vars[key] !== undefined && vars[key] !== null && vars[key] !== '' ? String(vars[key]) : match))
    .replace(/\{\w+\}\s*/g, '') // unknown placeholders are dropped, never shown
    .replace(/\s+/g, ' ')
    .trim();
}

export function entryKeywords(entry) {
  if (Array.isArray(entry.keywords) && entry.keywords.length) return entry.keywords.map(normalise).filter(Boolean);
  return normalise(entry.question).split(' ').filter(Boolean); // legacy v2 entries: space-separated keywords
}

/* v18: small typo tolerance. Bounded edit distance; only for words of 5+ letters so short words
   never match by accident (1 edit up to 7 letters, 2 edits from 8 letters). */
export function editDistance(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let before = previous;
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Swapped neighbouring letters ("retrun", "contcat") count as one edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], before[j - 2] + 1);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

function isTypoOf(word, target, minLength = 5) {
  if (target.length < minLength || word.length < minLength - 1 || word === target) return false;
  const allowed = target.length >= 8 ? 2 : 1;
  return editDistance(word, target, allowed) <= allowed;
}

// Brand names of medicines whose active substances are not publicly listed. Vera treats them as
// unknown products instead of answering generic questions (e.g. price) as if they were sold here.
const MEDICINE_BRANDS = ['ozempic', 'wegovy', 'rybelsus', 'mounjaro', 'zepbound', 'saxenda', 'victoza', 'trulicity', 'botox', 'dysport', 'genotropin', 'norditropin', 'omnitrope', 'humatrope', 'egrifta', 'vyleesi', 'scenesse', 'pregnyl', 'ovitrelle', 'menopur', 'decapeptyl', 'eprex', 'aranesp', 'circadin', 'lantus', 'novorapid', 'humalog'];

function scoreEntry(entry, expandedText, wordSet, stemSet) {
  let score = 0;
  const matched = new Set();
  for (const keyword of entryKeywords(entry)) {
    if (keyword.includes(' ')) {
      if (` ${expandedText} `.includes(` ${keyword} `)) { score += 3; matched.add(keyword); }
    } else if (wordSet.has(keyword)) {
      score += 2; matched.add(keyword);
    } else if (keyword.length > 4 && stemSet.has(stem(keyword))) {
      score += 1; matched.add(keyword);
    } else if (keyword.length >= 5 && [...wordSet].some(word => isTypoOf(word, keyword))) {
      // A misspelt distinctive word ("contcat", "delivry") counts nearly like the real word.
      score += keyword.length >= 6 ? 2 : 1; matched.add(keyword);
    }
  }
  return { score, matched: matched.size };
}

/* Finds publicly visible products named in the question (longest name wins). */
function findProducts(expandedText, products) {
  const compact = expandedText.replace(/[^a-z0-9]/g, '');
  const words = new Set(expandedText.split(' '));
  const found = [];
  for (const product of products) {
    const names = [product.displayName, product.name, ...(product.aliases || [])].map(name => normalise(name)).filter(Boolean);
    for (const name of names) {
      const compactName = name.replace(/[^a-z0-9]/g, '');
      if (compactName.length < 3) continue;
      // Short names (KPV, NAD, VIP, P21) must appear as a whole word; longer ones may be written without spaces/hyphens.
      const hit = compactName.length <= 4 ? words.has(name) || words.has(compactName) : compact.includes(compactName);
      if (hit) { found.push({ product, length: compactName.length }); break; }
    }
  }
  return found.sort((a, b) => b.length - a.length).map(item => item.product);
}

/* v18: misspelled product names ("glutation", "epitalon"). Single words and adjacent word pairs are
   compared with names of 6+ letters; the answer then says which product it assumed. */
function findProductsFuzzy(expandedText, products) {
  const words = expandedText.split(' ').filter(Boolean);
  const candidates = new Set([...words, ...words.slice(1).map((word, index) => `${words[index]}${word}`)].map(word => word.replace(/[^a-z0-9]/g, '')));
  const found = [];
  for (const product of products) {
    const names = [product.displayName, product.name, ...(product.aliases || [])].map(name => normalise(name).replace(/[^a-z0-9]/g, '')).filter(name => name.length >= 6);
    if (names.some(name => [...candidates].some(word => isTypoOf(word, name, 6)))) found.push(product);
  }
  return found.length === 1 ? found : [];
}

function mentionsHidden(expandedText, hiddenNames) {
  const compact = expandedText.replace(/[^a-z0-9]/g, '');
  const words = new Set(expandedText.split(' ').map(word => word.replace(/[^a-z0-9]/g, '')));
  if (MEDICINE_BRANDS.some(brand => words.has(brand) || [...words].some(word => isTypoOf(word, brand, 6)))) return true;
  return hiddenNames.some(name => {
    const compactName = normalise(name).replace(/[^a-z0-9]/g, '');
    if (compactName.length < 3) return false;
    if (compactName.length <= 4) return words.has(compactName);
    return compact.includes(compactName) || [...words].some(word => isTypoOf(word, compactName, 6));
  });
}

function productAnswer(product, facet) {
  const specs = product.specifications.slice(0, 4).join(', ') + (product.specifications.length > 4 ? ` and ${product.specifications.length - 4} more` : '');
  const parts = [];
  if (facet === 'reports') {
    parts.push(product.labReports > 0
      ? `${product.displayName} has ${product.labReports} published lab report${product.labReports === 1 ? '' : 's'} on its product page.`
      : `No lab report has been published for ${product.displayName} yet. I can't provide test results that are not published.`);
  } else if (facet === 'price' || facet === 'availability') {
    parts.push(product.orderable
      ? `${product.displayName} can be ordered; prices for each specification are shown on its product page.`
      : `${product.displayName} is shown for information only and cannot be ordered at the moment, so no price is shown.`);
  } else {
    parts.push(`${product.displayName} is listed under ${product.categoryLabel}.`);
    parts.push(`Listed specifications: ${specs}.`);
    parts.push(product.shortDescription ? `Published description: ${product.shortDescription}` : 'No product description has been published yet.');
    parts.push(product.labReports > 0 ? `${product.labReports} lab report${product.labReports === 1 ? ' is' : 's are'} published.` : 'No lab report has been published yet.');
    parts.push(product.orderable ? 'It can be ordered.' : 'It is shown for information only and cannot be ordered.');
  }
  return parts.join(' ');
}

function productFacet(words) {
  if (['lab', 'report', 'reports', 'coa', 'certificate', 'purity', 'analysis', 'tested'].some(word => words.has(word))) return 'reports';
  if (['price', 'cost', 'costs', 'vat', 'expensive'].some(word => words.has(word))) return 'price';
  if (['available', 'stock', 'buy', 'order', 'purchase'].some(word => words.has(word))) return 'availability';
  return 'overview';
}

/* ctx: { kb, vars, products: [publicProductSummary], hiddenNames: [string], contextProductId } */
export function answerQuestion(rawQuestion, ctx) {
  const raw = String(rawQuestion || '').slice(0, 500);
  const text = normalise(raw);
  const vars = ctx.vars || {};
  const contact = vars.supportEmail ? [{ label: `Email ${vars.supportEmail}`, url: `mailto:${vars.supportEmail}` }] : [];
  const notice = containsPersonalData(raw) ? PRIVACY_NOTICE : null;
  const base = { notice, links: [], suggestions: [] };

  if (text.length < 2) return { ...base, answered: false, kind: 'empty', answer: EMPTY, suggestions: defaultSuggestions(ctx.kb) };

  // 1. Safety first — before any product or knowledge match.
  if (isSafetyQuestion(text)) {
    return { ...base, answered: true, kind: 'safety', source: 'safety', answer: SAFETY_ANSWER, links: [{ label: 'Why some information is not published', url: '/index.html#quality' }] };
  }

  const expanded = expand(text);
  const words = new Set(tokens(expanded));
  const stems = new Set([...words].map(stem));

  if (words.size <= 2 && (words.has('hello') || words.has('hi') || words.has('hey'))) {
    return { ...base, answered: true, kind: 'greeting', source: 'greeting', answer: GREETING, suggestions: defaultSuggestions(ctx.kb) };
  }
  if (words.has('thanks') || words.has('thank')) {
    return { ...base, answered: true, kind: 'greeting', source: 'thanks', answer: THANKS, suggestions: defaultSuggestions(ctx.kb) };
  }

  // 2. Named products (only publicly visible ones are known to Vera).
  const exactNamed = findProducts(expanded, ctx.products || []);
  const hiddenMentioned = mentionsHidden(expanded, ctx.hiddenNames || []);
  // A misspelling is only resolved to a visible product when no hidden product could be meant.
  const fuzzyNamed = !exactNamed.length && !hiddenMentioned ? findProductsFuzzy(expanded, ctx.products || []) : [];
  const productsNamed = exactNamed.length ? exactNamed : fuzzyNamed;
  const contextProduct = !productsNamed.length && ctx.contextProductId ? (ctx.products || []).find(product => product.id === ctx.contextProductId) : null;
  const product = productsNamed[0] || contextProduct;
  if (product) {
    const facet = productFacet(words);
    const productIsSubject = productsNamed.length > 0 || facet !== 'overview' || ['description', 'information', 'info', 'specification', 'specifications', 'tell', 'what'].some(word => words.has(word));
    if (productIsSubject) {
      return {
        ...base, answered: true, kind: 'product', source: `product:${product.id}`,
        answer: `${fuzzyNamed.includes(product) ? `I assume you mean ${product.displayName}. ` : ''}${productAnswer(product, facet)}`,
        url: `/product/${encodeURIComponent(product.id)}`,
        links: [{ label: `Open ${product.displayName}`, url: `/product/${encodeURIComponent(product.id)}` }, ...(facet === 'reports' ? [{ label: 'Documentation section', url: `/product/${encodeURIComponent(product.id)}#documentation` }] : [])],
        suggestions: productsNamed.length > 1 ? productsNamed.slice(1, 3).map(item => `Tell me about ${item.displayName}`) : []
      };
    }
  } else if (hiddenMentioned) {
    return { ...base, answered: false, kind: 'unknown_product', source: 'unknown_product', answer: UNKNOWN_PRODUCT, links: [{ label: 'Browse the catalogue', url: '/index.html#catalogue' }] };
  }

  // 3. Approved knowledge-base answers.
  const ranked = (ctx.kb?.entries || [])
    .map(entry => ({ entry, ...scoreEntry(entry, expanded, words, stems) }))
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score || b.matched - a.matched);
  if (ranked.length) {
    const best = ranked[0];
    const close = ranked.slice(1).filter(item => item.score >= best.score - 1).slice(0, 2);
    const url = best.entry.url || null;
    return {
      ...base, answered: true, kind: 'knowledge', source: best.entry.id,
      answer: fillTemplate(best.entry.answer, vars),
      url,
      links: [...(url ? [{ label: linkLabel(best.entry, url), url }] : []), ...(best.entry.id === 'contact' ? contact : [])],
      suggestions: close.map(item => item.entry.title || item.entry.keywords?.[0] || item.entry.id).filter(Boolean)
    };
  }

  // 4. v20: a product-style question about a name Vera does not know gets the same answer as a
  // question about a hidden product, so the two cannot be told apart (hidden names were enumerable).
  if (PRODUCT_QUESTION.test(text)) {
    return { ...base, answered: false, kind: 'unknown_product', source: 'unknown_product', answer: UNKNOWN_PRODUCT, links: [{ label: 'Browse the catalogue', url: '/index.html#catalogue' }] };
  }

  // 5. Honest fallback.
  return {
    ...base, answered: false, kind: 'fallback', source: 'fallback',
    answer: fillTemplate(ctx.kb?.fallback || DEFAULT_FALLBACK, vars),
    links: contact,
    suggestions: defaultSuggestions(ctx.kb)
  };
}

function linkLabel(entry, url) {
  if (url.includes('shipping-returns')) return 'Shipping & returns';
  if (url.includes('privacy')) return 'Privacy';
  if (url.includes('terms')) return 'Terms';
  if (url.includes('order.html')) return 'Track an order';
  if (url.includes('my-pages')) return 'My pages';
  if (url.includes('#finder')) return 'Product finder';
  if (url.includes('#quality')) return 'How information is checked';
  if (url.includes('#contact')) return 'Contact';
  if (url.includes('catalogue')) return 'Catalogue';
  return entry.title || 'Open page';
}

export function defaultSuggestions(kb) {
  const preferred = ['delivery', 'returns', 'reports', 'contact'];
  const entries = kb?.entries || [];
  const titles = preferred.map(id => entries.find(entry => entry.id === id)?.title).filter(Boolean);
  return titles.length ? titles : entries.slice(0, 4).map(entry => entry.title || entry.id);
}
