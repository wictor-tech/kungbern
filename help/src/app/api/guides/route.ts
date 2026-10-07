import { listGuides, toSummary } from "@/lib/guides";
import { json, preflight } from "@/lib/http";

/** GET /api/guides?app=site&category=… – publicerade guider (sammanfattning). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const app = url.searchParams.get("app");
  const category = url.searchParams.get("category");
  const guides = (await listGuides()).filter((g) => (!app || g.app === app) && (!category || g.category === category));
  return json(req, { guides: guides.map(toSummary) });
}

export const OPTIONS = preflight;
