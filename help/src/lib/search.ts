import type { Guide } from "./types";
import { isDeictic, levenshtein, normalize, synonymEntries, terms } from "./text";

/**
 * Lexikal sökning (BM25-liknande) över guidernas fält + likhet mot handskrivna "alternativa frågor".
 * Körs i minnet: hundratals guider tar under en millisekund. Embeddings (om de finns) vägs in i ask.ts.
 */

const FIELD_WEIGHTS = {
  title: 3,
  alt: 2.5,
  breadcrumb: 1.5,
  summary: 1.2,
  hotspots: 0.6,
  steps: 0.8,
} as const;
type Field = keyof typeof FIELD_WEIGHTS;

interface IndexedGuide {
  guide: Guide;
  fields: Record<Field, Map<string, number>>;
  /** Titel + varje alternativ fråga som termmängder – för "liknar en känd fråga". */
  intents: Set<string>[];
}

export interface SearchIndex {
  docs: IndexedGuide[];
  df: Map<string, number>;
  vocab: string[];
}

function tf(list: string[]) {
  const m = new Map<string, number>();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function buildIndex(guides: Guide[]): SearchIndex {
  const df = new Map<string, number>();
  const docs = guides.map((g) => {
    const fields: Record<Field, Map<string, number>> = {
      title: tf(terms(g.title)),
      alt: tf(g.alternativeQueries.flatMap(terms)),
      breadcrumb: tf(terms(g.breadcrumb.slice(1).join(" "))),
      summary: tf(terms(g.summary)),
      hotspots: tf(g.hotspots.flatMap((h) => terms(`${h.label} ${h.text}`))),
      steps: tf(g.steps.flatMap((s) => terms(s.text))),
    };
    const all = new Set<string>();
    for (const f of Object.values(fields)) for (const t of f.keys()) all.add(t);
    for (const t of all) df.set(t, (df.get(t) ?? 0) + 1);
    const intents = [g.title, ...g.alternativeQueries].map((q) => new Set(terms(q))).filter((s) => s.size > 0);
    return { guide: g, fields, intents };
  });
  return { docs, df, vocab: [...df.keys()] };
}

function idf(index: SearchIndex, t: string) {
  const n = index.docs.length;
  const d = index.df.get(t) ?? 0;
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

/** Rättar stavfel och ofullständiga ord mot ordförrådet ("bildpsel" → "bildspel", "kapac" → "kapacitet"). */
function correct(index: SearchIndex, t: string): string | null {
  if (index.df.has(t)) return t;
  if (t.length < 5) return null;
  let best: string | null = null;
  let bestD = 99;
  const max = t.length >= 8 ? 2 : 1;
  // Jämför mot både guidernas ord och synonymtabellens ord (t.ex. "inkalning" → "inkallning" → callin).
  const candidates: [string, string][] = [...index.vocab.map((v): [string, string] => [v, v]), ...synonymEntries()];
  for (const [v, canon] of candidates) {
    if (!index.df.has(canon)) continue;
    if (v.length >= 5 && (v.startsWith(t) || (t.startsWith(v) && v.length >= 6))) {
      const d = Math.abs(v.length - t.length) * 0.1;
      if (d < bestD) [best, bestD] = [canon, d];
      continue;
    }
    const d = levenshtein(t, v, max);
    if (d <= max && d < bestD) [best, bestD] = [canon, d];
  }
  return best;
}

export interface Hit {
  guide: Guide;
  score: number;
  /** Hur stor del av frågans (idf-viktade) ord som guiden täcker, 0–1. */
  coverage: number;
  /** Bästa likheten mot titel/alternativ fråga, 0–1. */
  intentSim: number;
  /** Frågan syftar på "den här sidan" och guiden hör till sidan användaren står på. */
  contextual: boolean;
}

export interface SearchOptions {
  page?: string | null;
  app?: string | null;
  limit?: number;
}

export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): { hits: Hit[]; queryTerms: string[] } {
  const raw = terms(query);
  const queryTerms: string[] = [];
  const unknown: string[] = [];
  for (const t of raw) {
    const c = correct(index, t);
    if (c) queryTerms.push(c);
    else unknown.push(t);
  }
  const uniq = [...new Set(queryTerms)];
  // Okända ord (finns inte i någon guide) räknas som mycket specifika – de sänker täckningen.
  const maxIdf = Math.log(1 + (index.docs.length + 0.5) / 0.5);
  const totalWeight = uniq.reduce((s, t) => s + idf(index, t), 0) + unknown.length * maxIdf;
  const deictic = isDeictic(query) || normalize(query).length === 0;

  const hits: Hit[] = index.docs.map((d) => {
    let score = 0;
    let covered = 0;
    for (const t of uniq) {
      const w = idf(index, t);
      let best = 0;
      for (const f of Object.keys(FIELD_WEIGHTS) as Field[]) {
        const n = d.fields[f].get(t);
        if (n) best = Math.max(best, FIELD_WEIGHTS[f] * ((n * 2.2) / (n + 1.2)));
      }
      if (best > 0) covered += w;
      score += w * best;
    }
    // Likhet mot kända frågor (Dice, viktad med idf så att generiska ord som "lägga till" väger lite).
    const qset = new Set([...uniq, ...unknown]);
    const w = (t: string) => (index.df.has(t) ? idf(index, t) : maxIdf);
    const qWeight = [...qset].reduce((s, t) => s + w(t), 0);
    let intentSim = 0;
    if (qset.size > 0) {
      for (const intent of d.intents) {
        let inter = 0;
        let iWeight = 0;
        for (const t of intent) {
          iWeight += w(t);
          if (qset.has(t)) inter += w(t);
        }
        intentSim = Math.max(intentSim, (2 * inter) / (qWeight + iWeight));
      }
    }
    score += intentSim * 6;
    const coverage = totalWeight > 0 ? covered / totalWeight : 0;
    score *= 0.5 + coverage;

    const onPage = Boolean(opts.page) && d.guide.pageKey === opts.page;
    if (onPage) score = score * 1.25 + (deictic ? 4 : 1);
    if (opts.app && d.guide.app === opts.app) score *= 1.05;
    return { guide: d.guide, score, coverage, intentSim, contextual: onPage && deictic };
  });

  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.filter((h) => h.score > 0).slice(0, opts.limit ?? 8), queryTerms: uniq };
}

const MIN_ANSWER_SCORE = 6;

export type Verdict = "answered" | "ambiguous" | "none";

/** Avgör hur säker träffen är. Trösklarna är kalibrerade med scripts/eval-search.ts. */
export function judge(hits: Hit[]): { verdict: Verdict; confidence: number } {
  const [a, b] = hits;
  if (!a) return { verdict: "none", confidence: 0 };
  const margin = b ? (a.score - b.score) / a.score : 1;
  // "Hur ändrar jag detta?" på en sida med en enda guide → den guiden.
  if (a.contextual && !b?.contextual) return { verdict: "answered", confidence: 0.7 };
  const confidence = Math.min(1, 0.5 * a.coverage + 0.3 * a.intentSim + 0.2 * Math.min(1, margin * 2.5));
  // Täcker bästa guiden inte ens hälften av frågan saknas troligen en guide – visa hellre "ingen guide" än gissningar.
  if (a.coverage < 0.5 && a.intentSim < 0.5) return { verdict: "none", confidence };
  // Svag total träff (ordet finns bara i en bisats någonstans) räcker inte för ett säkert svar.
  if (a.score < MIN_ANSWER_SCORE) return { verdict: a.score < 4 ? "none" : "ambiguous", confidence };
  if (confidence >= 0.55 && (margin >= 0.12 || a.intentSim >= 0.8)) return { verdict: "answered", confidence };
  return { verdict: "ambiguous", confidence };
}
