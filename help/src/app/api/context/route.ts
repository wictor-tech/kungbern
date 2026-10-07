import { listGuides, toSummary } from "@/lib/guides";
import { json, preflight } from "@/lib/http";

/**
 * GET /api/context?page=slideshow-settings – guider som hör till sidan användaren står på.
 * Används av "?"-knappen i produkten för att visa rätt hjälp direkt.
 */
export async function GET(req: Request) {
  const page = new URL(req.url).searchParams.get("page");
  if (!page) return json(req, { guides: [] });
  const guides = (await listGuides()).filter((g) => g.pageKey === page);
  return json(req, { page, guides: guides.map(toSummary) });
}

export const OPTIONS = preflight;
