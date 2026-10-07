import { getGuide } from "@/lib/guides";
import { json, preflight } from "@/lib/http";

/** GET /api/guides/:id – hela guiden. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guide = await getGuide((await params).id);
  if (!guide) return json(req, { error: "Guiden finns inte" }, 404);
  return json(req, { guide });
}

export const OPTIONS = preflight;
