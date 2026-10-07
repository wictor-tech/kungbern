import { z } from "zod/v4";
import { logView } from "@/lib/analytics";
import { json, parseBody, preflight } from "@/lib/http";

const Body = z.object({
  type: z.literal("view"),
  guideId: z.string().max(100),
  queryId: z.string().max(100).nullish(),
  sessionId: z.string().max(100).nullish(),
  stepsViewed: z.array(z.number().int()).max(100).default([]),
});

/** POST /api/events – att en guide visats (och vilka steg användaren tittat på). */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const e = body.data;
  await logView({ sessionId: e.sessionId ?? null, guideId: e.guideId, queryId: e.queryId ?? null, stepsViewed: e.stepsViewed });
  return json(req, { ok: true });
}

export const OPTIONS = preflight;
