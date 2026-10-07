import { GROUPS, STOPWORDS, CONCEPT_PREFIX_MIN } from "./lexicon.js";

/** Gemener + ta bort diakritiska tecken så att "chaufför" = "chauffor" = "chauffeur"-liknande. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/œ/g, "oe").replace(/ł/g, "l")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function tokenize(s: string): string[] {
  return fold(s).split(/[^a-z0-9-]+/).map((t) => t.replace(/^-+|-+$/g, "")).filter(Boolean);
}

/** Enkel stamning – tillräckligt för svenska/engelska/tyska ändelser utan att bli aggressiv. */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  const suffixes = ["arnas", "ernas", "ornas", "andes", "ningen", "ningar", "heten", "erna", "arna", "orna", "ande", "ande", "ning", "aren", "ades", "ade", "are", "ing", "ung", "ern", "ar", "er", "or", "en", "et", "na", "de", "te", "es", "ed", "s", "a", "e", "n", "t"];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

const WORD_TO_CONCEPT = new Map<string, { id: string; weight: number }>();
const WORD_LIST: { word: string; id: string; weight: number }[] = [];
for (const g of GROUPS) {
  for (const raw of g.words) {
    const w = fold(raw);
    if (!WORD_TO_CONCEPT.has(w)) WORD_TO_CONCEPT.set(w, { id: g.id, weight: g.weight });
    if (w.length >= CONCEPT_PREFIX_MIN) WORD_LIST.push({ word: w, id: g.id, weight: g.weight });
  }
}
// Längsta ordet först så att "bildspel" vinner över "bild" i sammansättningar.
WORD_LIST.sort((a, b) => b.word.length - a.word.length);

/** Hittar begrepp i ett token – exakt, stammat eller som början på en sammansättning. */
function conceptsFor(token: string): { id: string; weight: number }[] {
  const direct = WORD_TO_CONCEPT.get(token) ?? WORD_TO_CONCEPT.get(stem(token));
  if (direct) return [direct];
  if (token.length < 5) return [];
  const found: { id: string; weight: number }[] = [];
  const seen = new Set<string>();
  for (const e of WORD_LIST) {
    if (e.word.length < 4) continue;
    // sammansättning: token börjar med eller slutar på ett känt ord ("bildspelet", "sms-utskrift", "telefonnummer")
    // Sammansättningar: början (>=4 tecken), slut (>=5 tecken – annars matchar t.ex. 'support' mot 'port'), eller innehåll (>=6).
    if (token.startsWith(e.word) || (e.word.length >= 5 && token.endsWith(e.word)) || (e.word.length >= 6 && token.includes(e.word))) {
      if (!seen.has(e.id)) { seen.add(e.id); found.push({ id: e.id, weight: e.weight * 0.6 }); }
      if (found.length >= 2) break;
    }
  }
  return found;
}

export type TermVec = Map<string, number>;

/** Gör om text till viktade termer: begrepp (c:*) och stammar (s:*). */
export function termsOf(text: string, boost = 1): TermVec {
  const v: TermVec = new Map();
  const add = (k: string, w: number) => v.set(k, Math.max(v.get(k) ?? 0, w * boost));
  for (const raw of tokenize(text)) {
    if (STOPWORDS.has(raw)) continue;
    const st = stem(raw);
    if (st.length < 2) continue;
    const concepts = conceptsFor(raw);
    for (const c of concepts) add("c:" + c.id, c.weight);
    add("s:" + st, concepts.length ? 0.35 : 0.8);
  }
  return v;
}

export function trigrams(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const tok of tokenize(text)) {
    if (STOPWORDS.has(tok) || tok.length < 3) continue;
    const p = `^${tok}$`;
    for (let i = 0; i < p.length - 2; i++) {
      const g = p.slice(i, i + 3);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
  }
  return m;
}

export function cosine(a: Map<string, number>, b: Map<string, number>, idf?: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, va] of a) {
    const w = idf?.get(k) ?? 1;
    na += (va * w) ** 2;
    const vb = b.get(k);
    if (vb) dot += va * vb * w * w;
  }
  for (const [k, vb] of b) nb += (vb * (idf?.get(k) ?? 1)) ** 2;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
