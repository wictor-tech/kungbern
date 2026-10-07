import { z } from "zod/v4";
import { ask } from "@/lib/ask";
import { json, parseBody, preflight } from "@/lib/http";
import { rateLimited } from "@/lib/ratelimit";

const Body = z.object({
  q: z.string().max(500),
  page: z.string().max(100).nullish(),
  app: z.enum(["location-admin", "site"]).nullish(),
  sessionId: z.string().max(100).nullish(),
  exclude: z.array(z.string().max(100)).max(20).optional(),
});

/** POST /api/ask – användarens fråga → bästa guide, kort svar och alternativ. */
export async function POST(req: Request) {
  if (rateLimited(req, "ask", 60)) return json(req, { error: "För många förfrågningar. Vänta en minut och försök igen." }, 429);
  const body = await parseBody(req, Body);
  if ("error" in body) return body.error;
  return json(req, await ask(body.data));
}

export const OPTIONS = preflight;
