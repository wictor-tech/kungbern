import { z } from "zod/v4";
import { json, parseBody, preflight } from "@/lib/http";
import { rateLimited } from "@/lib/ratelimit";
import { createTicket } from "@/lib/tickets";

const Body = z.object({
  sessionId: z.string().max(100).nullish(),
  queryText: z.string().max(500).nullish(),
  guideId: z.string().max(100).nullish(),
  page: z.string().max(100).nullish(),
  stepsViewed: z.array(z.number().int()).max(100).default([]),
  comment: z.string().max(4000).nullish(),
  contact: z.string().max(200).nullish(),
});

/** POST /api/tickets – supportärende med all kontext förifylld. */
export async function POST(req: Request) {
  if (rateLimited(req, "tickets", 5)) return json(req, { error: "För många förfrågningar. Vänta en minut och försök igen." }, 429);
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  const t = body.data;
  const ticket = await createTicket({
    sessionId: t.sessionId ?? null,
    queryText: t.queryText ?? null,
    guideId: t.guideId ?? null,
    page: t.page ?? null,
    stepsViewed: t.stepsViewed,
    comment: t.comment?.trim() || null,
    contact: t.contact?.trim() || null,
  });
  return json(req, ticket, 201);
}

export const OPTIONS = preflight;
