import { z } from "zod/v4";
import { logFeedback } from "@/lib/analytics";
import { ask } from "@/lib/ask";
import { json, parseBody, preflight } from "@/lib/http";

const Body = z.object({
  guideId: z.string().max(100).nullish(),
  queryId: z.string().max(100).nullish(),
  sessionId: z.string().max(100).nullish(),
  helpful: z.boolean(),
  comment: z.string().max(1000).nullish(),
  originalQuery: z.string().max(500).nullish(),
  page: z.string().max(100).nullish(),
  shown: z.array(z.string().max(100)).max(20).optional(),
});

/**
 * POST /api/feedback – 👍/👎. Vid 👎 med kommentar försöker vi en gång till:
 * ursprunglig fråga + vad som saknades, utan de guider som redan visats.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const f = body.data;
  await logFeedback({
    sessionId: f.sessionId ?? null,
    guideId: f.guideId ?? null,
    queryId: f.queryId ?? null,
    helpful: f.helpful,
    comment: f.comment?.trim() || null,
  });
  if (f.helpful || !f.comment?.trim()) return json(req, { ok: true, retry: null });
  const retry = await ask({
    q: `${f.originalQuery ?? ""} ${f.comment}`.trim(),
    page: f.page,
    sessionId: f.sessionId,
    exclude: [...(f.shown ?? []), ...(f.guideId ? [f.guideId] : [])],
    // Försöket är en del av samma fråga – det ska inte räknas som en ny fråga i statistiken.
    log: false,
  });
  return json(req, { ok: true, retry });
}

export const OPTIONS = preflight;
