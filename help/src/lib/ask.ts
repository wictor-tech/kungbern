import { randomUUID } from "node:crypto";
import { aiEnabled, chooseGuide } from "./ai";
import { cosine, embeddingsEnabled, embedQuery, guideVectors } from "./embeddings";
import { listGuides, toSummary } from "./guides";
import { buildIndex, judge, search, type Hit, type SearchIndex } from "./search";
import { normalize } from "./text";
import { logQuery } from "./analytics";
import type { AskResult, Guide, GuideSummary } from "./types";

/** Sökindexet byggs om när en guide sparas (invalidateIndex) – annars återanvänds det. */
const cache: { index?: Promise<{ index: SearchIndex; guides: Guide[] }> } = ((
  globalThis as unknown as { __lupHelpIndex?: object }
).__lupHelpIndex ??= {});

export function invalidateIndex() {
  cache.index = undefined;
}

async function getIndex() {
  cache.index ??= listGuides().then((guides) => ({ guides, index: buildIndex(guides) }));
  return cache.index;
}

/** Snabba förslag medan användaren skriver (ingen AI, ingen loggning). */
export async function suggest(q: string, page?: string | null): Promise<GuideSummary[]> {
  const text = q.trim().slice(0, 200);
  if (text.length < 2) return [];
  const { index } = await getIndex();
  const { hits } = search(index, text, { page, limit: 5 });
  // Visa bara förslag som täcker en rimlig del av det som skrivits.
  const top = hits[0]?.score ?? 0;
  return hits
    .filter((h) => (h.coverage >= 0.5 || h.intentSim >= 0.5) && h.score >= top * 0.35)
    .slice(0, 5)
    .map((h) => toSummary(h.guide));
}

export interface AskInput {
  q: string;
  page?: string | null;
  app?: string | null;
  sessionId?: string | null;
  /** Guider som redan visats och inte hjälpte (vid "Nej, försök igen"). */
  exclude?: string[];
  log?: boolean;
}

/** Väger in semantisk likhet om embeddings finns. Påverkar bara ordningen bland kandidaterna. */
async function semanticRerank(q: string, hits: Hit[], guides: Guide[]): Promise<Hit[]> {
  if (!embeddingsEnabled() || hits.length === 0) return hits;
  try {
    const [vectors, qv] = await Promise.all([guideVectors(guides), embedQuery(q)]);
    const top = hits[0].score || 1;
    return hits
      .map((h) => {
        const v = vectors.get(h.guide.id);
        const sim = v ? cosine(qv, v) : 0;
        return { ...h, score: 0.6 * h.score + 0.4 * sim * top };
      })
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error("[embeddings] hoppar över:", err instanceof Error ? err.message : err);
    return hits;
  }
}

export async function ask(input: AskInput): Promise<AskResult> {
  const q = input.q.trim().slice(0, 500);
  const { index, guides } = await getIndex();
  const exclude = new Set(input.exclude ?? []);

  let { hits } = search(index, q, { page: input.page, app: input.app, limit: 8 });
  hits = hits.filter((h) => !exclude.has(h.guide.id));
  hits = await semanticRerank(q, hits, guides);
  let { verdict, confidence } = judge(hits);

  let guide: Guide | null = verdict === "answered" ? hits[0].guide : null;
  let answer = "";
  let usedAi = false;

  if (aiEnabled() && hits.length > 0) {
    const choice = await chooseGuide(q, hits.slice(0, 5).map((h) => h.guide), input.page);
    if (choice) {
      usedAi = true;
      answer = choice.answer;
      if (choice.guide_id && choice.confident) {
        guide = guides.find((g) => g.id === choice.guide_id) ?? null;
        verdict = "answered";
        confidence = Math.max(confidence, 0.8);
        // Lägg AI:ns val först även bland alternativen.
        hits = [...hits.filter((h) => h.guide.id === choice.guide_id), ...hits.filter((h) => h.guide.id !== choice.guide_id)];
      } else if (choice.guide_id) {
        guide = null;
        verdict = "ambiguous";
        hits = [...hits.filter((h) => h.guide.id === choice.guide_id), ...hits.filter((h) => h.guide.id !== choice.guide_id)];
      } else {
        guide = null;
        verdict = hits[0] && hits[0].coverage >= 0.5 ? "ambiguous" : "none";
      }
    }
  }

  if (!answer) {
    answer =
      verdict === "answered" ? "" : verdict === "ambiguous" ? "Menade du något av det här?" : "Vi har ingen guide för det än.";
  }

  const alternatives = hits
    .filter((h) => h.guide.id !== guide?.id)
    .slice(0, verdict === "none" ? 2 : 3)
    .map((h) => toSummary(h.guide));

  const queryId = randomUUID();
  if (input.log !== false && q.length > 0) {
    await logQuery({
      id: queryId,
      sessionId: input.sessionId ?? null,
      text: q,
      normalized: normalize(q),
      page: input.page ?? null,
      app: input.app ?? null,
      outcome: verdict,
      guideId: guide?.id ?? null,
      confidence,
      usedAi,
    });
  }

  return { queryId, outcome: verdict, answer, guide, alternatives, confidence, usedAi };
}
