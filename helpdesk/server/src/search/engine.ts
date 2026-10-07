import type { Guide, Lang } from "../../../shared/types.js";
import { cosine, termsOf, trigrams, type TermVec } from "./text.js";

/**
 * Lokal semantisk sökning utan externa beroenden.
 *  - Begreppslexikon på 9 språk (bild = image = billede = Bild …) → synonymer och flerspråk
 *  - Alternativa frågor viktas högst, därefter titel, sammanfattning och steg
 *  - Teckentrigram fångar stavfel och sammansättningar ("bildspelet")
 *  - Kontext (aktuell sida) ger en knuff åt rätt guide
 * Bakom `SearchEngine` kan en embeddings-baserad motor läggas till senare utan att API:t ändras.
 */

export interface SearchHit { guide: Guide; score: number; /** Andel av frågans tunga begrepp som guiden täcker (1 = alla). */ cov?: number }
export interface SearchContext { page?: string; role?: string }

interface Indexed {
  guide: Guide;
  doc: TermVec;
  core: TermVec;
  alts: TermVec[];
  tri: Map<string, number>;
}

const GOOD = 0.6;
const WEAK = 0.24;
export const THRESHOLDS = { good: GOOD, weak: WEAK };

function merge(into: TermVec, from: TermVec) {
  for (const [k, v] of from) into.set(k, Math.max(into.get(k) ?? 0, v));
}

function allTexts(g: Guide) {
  const titles = [g.title, ...Object.values(g.translations).map((t) => t?.title ?? "")].filter(Boolean);
  const alts = [...g.altQueries, ...Object.values(g.translations).flatMap((t) => t?.altQueries ?? [])];
  const summaries = [g.summary, ...Object.values(g.translations).map((t) => t?.summary ?? "")].filter(Boolean);
  const steps = [
    ...g.steps.map((s) => s.text),
    ...Object.values(g.translations).flatMap((t) => Object.values(t?.steps ?? {})),
  ];
  return { titles, alts, summaries, steps };
}

export class SearchEngine {
  private items: Indexed[] = [];
  private idf = new Map<string, number>();

  build(guides: Guide[]) {
    this.items = guides.map((g) => {
      const { titles, alts, summaries, steps } = allTexts(g);
      const doc: TermVec = new Map();
      const core: TermVec = new Map();
      for (const t of titles) { merge(doc, termsOf(t, 1)); merge(core, termsOf(t, 1)); }
      for (const a of alts) { merge(doc, termsOf(a, 1)); merge(core, termsOf(a, 1)); }
      for (const s of summaries) merge(doc, termsOf(s, 0.6));
      for (const s of steps) merge(doc, termsOf(s, 0.35));
      const altVecs = [...titles, ...alts, ...summaries].map((t) => termsOf(t));
      return { guide: g, doc, core, alts: altVecs, tri: trigrams([...titles, ...alts].join(" ")) };
    });
    const df = new Map<string, number>();
    for (const it of this.items) for (const k of it.doc.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    const n = Math.max(this.items.length, 1);
    this.idf = new Map([...df].map(([k, d]) => [k, Math.log(1 + n / d) + 0.3]));
  }

  search(q: string, ctx: SearchContext = {}, opts: { exclude?: string[]; limit?: number; role?: string } = {}): SearchHit[] {
    const qv = termsOf(q);
    if (!qv.size) return [];
    const qt = trigrams(q);
    const heavy = [...qv].filter(([k, w]) => k.startsWith("c:") && w >= 0.9);
    const deictic = /\b(detta|denna|den har|det har|har|this|here|dette|denne|dies|diese|ceci|dit|to)\b/i.test(q);
    const pageCount = new Map<string, number>();
    for (const it of this.items) if (it.guide.status === "published") for (const p of it.guide.pageKeys) pageCount.set(p, (pageCount.get(p) ?? 0) + 1);
    const hits: SearchHit[] = [];
    let gapBest = 0;
    for (const it of this.items) {
      const gap = it.guide.status !== "published" && !!it.guide.todo; // "känd lucka": utkast som väntar på innehåll
      if (it.guide.status !== "published" && !gap) continue;
      if (opts.exclude?.includes(it.guide.id)) continue;
      if (opts.role && it.guide.roles.length && !it.guide.roles.includes(opts.role)) continue;
      let altSim = 0;
      for (const a of it.alts) altSim = Math.max(altSim, cosine(qv, a, this.idf));
      const docSim = cosine(qv, it.doc, this.idf);
      const triSim = cosine(qt, it.tri);
      let score = Math.max(altSim, docSim * 0.8) * 0.78 + triSim * 0.22;
      // Täckning: täcks frågans tunga begrepp av guidens titel/alternativa frågor?
      let covered = 1;
      if (heavy.length) {
        const tot = heavy.reduce((s, [, w]) => s + w, 0);
        const cov = heavy.reduce((s, [k, w]) => s + ((it.core.get(k) ?? 0) >= 0.9 ? w : 0), 0) / tot;
        covered = cov;
        score *= 0.45 + 0.55 * cov;
      }
      // Okända ord i frågan som inte finns någonstans i guiden ("tullverket") sänker säkerheten lite.
      let mass = 0, miss = 0;
      for (const [k, w] of qv) { if (!k.startsWith("s:")) continue; mass += w; if (!it.doc.has(k)) miss += w; }
      const known = [...qv].reduce((a, [, w]) => a + w, 0);
      score *= 1 - 0.35 * (known ? miss / known : 0);
      void mass;
      if (gap) { gapBest = Math.max(gapBest, score); continue; } // luckor får ingen sid-knuff
      const onPage = !!ctx.page && it.guide.pageKeys.includes(ctx.page);
      if (onPage) {
        score += deictic ? 0.28 : 0.07;
        // "Hur ändrar jag detta?" utan eget innehåll: sidan avgör. Bara en guide på sidan = säkert svar, annars förslag.
        if (deictic && !heavy.length) score = Math.max(score, pageCount.get(ctx.page!) === 1 ? 0.7 : 0.4 + (score > 0.4 ? 0.05 : 0));
      }
      hits.push({ guide: it.guide, score: Math.min(score, 1), cov: covered });
    }
    hits.sort((a, b) => b.score - a.score);
    // Matchar frågan en känd lucka minst lika bra som bästa publicerade guide: visa bara förslag, aldrig ett säkert svar.
    if (gapBest >= 0.5 && hits.length && gapBest >= hits[0].score - 0.05) for (const h of hits) h.score = Math.min(h.score, 0.45), h.cov = 0;
    // Tydlig ledare: ligger bästa träffen nära gränsen men klart före tvåan är den rimligen rätt.
    if (hits.length && (hits[0].cov ?? 1) >= 1 && hits[0].score >= 0.46 && hits[0].score < GOOD && hits[0].score - (hits[1]?.score ?? 0) >= 0.15) hits[0].score = GOOD;
    return hits.slice(0, opts.limit ?? 6);
  }

  /** Normaliserad nyckel för att gruppera liknande frågor i analytics. */
  signature(q: string): string {
    return [...termsOf(q)].filter(([, w]) => w >= 0.8 || true).map(([k]) => k).filter((k) => k.startsWith("c:") || k.startsWith("s:")).sort().join("|");
  }
  termSet(q: string): Set<string> { return new Set(termsOf(q).keys()); }
}

export function qualityOf(score: number): "good" | "weak" | "none" {
  return score >= GOOD ? "good" : score >= WEAK ? "weak" : "none";
}

export type { Lang };
