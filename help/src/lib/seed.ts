import type { Db } from "./db";
import type { Guide } from "./types";
import source from "../../content/guides.sv.json";
import enrich from "../../content/enrich.sv.json";
import positions from "../../content/hotspots.sv.json";
import drafts from "../../content/drafts.sv.json";

type SourceGuide = (typeof source.guides)[number];
type Enrichment = { pageKey: string; alternativeQueries: string[]; relatedGuides: string[] };
type Positions = { size: number[]; hotspots: Record<string, { x: number; y: number; w: number; h: number }>; steps: Record<string, number> };

/** Bygger startguiderna från manualen (guides.sv.json) + våra tillägg (enrich.sv.json). */
export function buildSeedGuides(): Guide[] {
  const extra = enrich.guides as Record<string, Enrichment>;
  const pos = positions.guides as Record<string, Positions>;
  const now = new Date().toISOString();
  return source.guides.map((g: SourceGuide) => {
    const e = extra[g.id];
    const p = pos[g.id];
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
      screenshotSize: p ? [p.size[0], p.size[1]] : null,
      hotspots: g.hotspots.map((h) => ({ ...h, ...p?.hotspots[String(h.n)] })),
      steps: g.steps.map((s) => (p?.steps[String(s.n)] ? { ...s, hotspot: p.steps[String(s.n)] } : s)),
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

type DraftGuide = (typeof drafts.guides)[number];

/**
 * Guider som saknades i manualen (content/drafts.sv.json). De återanvänder en skärmbild från manualen
 * och dess markeringar; utkasten syns bara i admin tills någon granskat och publicerat dem.
 */
export function buildDraftGuides(base: Guide[]): Guide[] {
  const now = new Date().toISOString();
  return drafts.guides.map((d: DraftGuide) => {
    const shot = d.baseScreenshot ? base.find((g) => g.number === d.baseScreenshot) : undefined;
    return {
      id: d.id,
      number: d.number,
      title: d.title,
      category: d.category,
      app: d.app === "site" ? "site" : "location-admin",
      pageKey: d.pageKey,
      breadcrumb: d.breadcrumb,
      summary: d.summary,
      screenshot: shot?.screenshot ?? null,
      screenshotSize: shot?.screenshotSize ?? null,
      hotspots: shot?.hotspots ?? [],
      steps: d.steps,
      notes: d.notes.map((n) => ({ type: n.type === "warning" ? "warning" : "tip", text: n.text })),
      alternativeQueries: d.alternativeQueries,
      relatedGuides: d.relatedGuides,
      roles: [d.app === "site" ? "site-staff" : "location-admin"],
      language: "sv",
      status: d.status === "published" ? "published" : "draft",
      video: null,
      version: 1,
      updatedAt: now,
      updatedBy: d.status === "published" ? "utkast från manualen (avsnitt 34)" : "utkast – behöver granskas",
    } satisfies Guide;
  });
}

/** Alla guider som är publicerade från start (för sökindex i tester, mätningar och demo). */
export function publishedSeedGuides(): Guide[] {
  const base = buildSeedGuides();
  return [...base, ...buildDraftGuides(base)].filter((g) => g.status === "published");
}

export async function seedIfEmpty(db: Db) {
  const [{ count }] = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM guides");
  if (count > 0) return;
  const base = buildSeedGuides();
  for (const g of [...base, ...buildDraftGuides(base)]) {
    await db.query(
      "INSERT INTO guides (id, status, category, app, number, data, version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [g.id, g.status, g.category, g.app, g.number, g, g.version, g.updatedAt],
    );
  }
}
