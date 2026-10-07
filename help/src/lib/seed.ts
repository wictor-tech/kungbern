import type { Db } from "./db";
import type { Guide } from "./types";
import source from "../../content/guides.sv.json";
import enrich from "../../content/enrich.sv.json";

type SourceGuide = (typeof source.guides)[number];
type Enrichment = { pageKey: string; alternativeQueries: string[]; relatedGuides: string[] };

/** Bygger startguiderna från manualen (guides.sv.json) + våra tillägg (enrich.sv.json). */
export function buildSeedGuides(): Guide[] {
  const extra = enrich.guides as Record<string, Enrichment>;
  const now = new Date().toISOString();
  return source.guides.map((g: SourceGuide) => {
    const e = extra[g.id];
    return {
      id: g.id,
      number: g.number,
      title: g.title,
      category: g.category,
      app: g.app === "site" ? "site" : "location-admin",
      pageKey: e?.pageKey ?? "",
      breadcrumb: g.breadcrumb,
      summary: g.summary,
      screenshot: `/${g.screenshot}`,
      hotspots: g.hotspots,
      steps: g.steps,
      notes: g.notes.map((n) => ({ type: n.type === "warning" ? "warning" : "tip", text: n.text })),
      alternativeQueries: e?.alternativeQueries ?? [],
      relatedGuides: e?.relatedGuides ?? [],
      roles: [g.app === "site" ? "site-staff" : "location-admin"],
      language: "sv",
      status: "published",
      video: null,
      version: 1,
      updatedAt: now,
      updatedBy: "import: Användarguide LUPNUMBER (okt 2026)",
    } satisfies Guide;
  });
}

export async function seedIfEmpty(db: Db) {
  const [{ count }] = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM guides");
  if (count > 0) return;
  for (const g of buildSeedGuides()) {
    await db.query(
      "INSERT INTO guides (id, status, category, app, number, data, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [g.id, g.status, g.category, g.app, g.number, g, g.version, g.updatedAt],
    );
  }
}
