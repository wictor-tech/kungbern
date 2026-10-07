/** Demo-versionen av components/client.ts: sökningen körs i webbläsaren, inget skickas någonstans. */
import { buildIndex, judge, search } from "@/lib/search";
import type { AskResult, Guide } from "@/lib/types";
import { toSummary } from "@/lib/guides-summary";
import { DEMO_GUIDES } from "./data";

const index = buildIndex(DEMO_GUIDES);
let n = 0;

export function sessionId() {
  return "demo";
}

export interface HelpContext {
  page?: string | null;
  app?: string | null;
}

function run(q: string, ctx: HelpContext, exclude: string[] = []): AskResult {
  const ex = new Set(exclude);
  const hits = search(index, q, { page: ctx.page, app: ctx.app }).hits.filter((h) => !ex.has(h.guide.id));
  const { verdict, confidence } = judge(hits);
  const guide: Guide | null = verdict === "answered" ? hits[0].guide : null;
  return {
    queryId: `demo-${++n}`,
    outcome: verdict,
    answer: verdict === "answered" ? "" : verdict === "ambiguous" ? "Menade du något av det här?" : "Vi har ingen guide för det än.",
    guide,
    alternatives: hits.filter((h) => h.guide.id !== guide?.id).slice(0, verdict === "none" ? 2 : 3).map((h) => toSummary(h.guide)),
    confidence,
    usedAi: false,
  };
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250));

export function askApi(q: string, ctx: HelpContext) {
  return delay(run(q, ctx));
}

export function logViewApi() {}

export function feedbackApi(input: { guideId: string | null; helpful: boolean; comment?: string; originalQuery?: string | null; page?: string | null; shown?: string[] }) {
  if (input.helpful || !input.comment) return delay({ ok: true as const, retry: null });
  const retry = run(`${input.originalQuery ?? ""} ${input.comment}`, { page: input.page }, [...(input.shown ?? []), ...(input.guideId ? [input.guideId] : [])]);
  return delay({ ok: true as const, retry });
}

export function ticketApi() {
  return delay({ id: `T-DEMO${String(Math.floor(Math.random() * 9000) + 1000)}` });
}
