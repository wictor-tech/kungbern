import { suggest } from "@/lib/ask";
import { json, preflight } from "@/lib/http";
import { rateLimited } from "@/lib/ratelimit";

/** GET /api/suggest?q=…&page=… – guideförslag medan användaren skriver. */
export async function GET(req: Request) {
  if (rateLimited(req, "suggest", 240)) return json(req, { suggestions: [] }, 429);
  const url = new URL(req.url);
  const suggestions = await suggest(url.searchParams.get("q") ?? "", url.searchParams.get("page"));
  return json(req, { suggestions });
}

export const OPTIONS = preflight;
