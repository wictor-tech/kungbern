import { getDb } from "./db";
import type { Guide, GuideSummary } from "./types";

export function toSummary(g: Guide): GuideSummary {
  const { id, number, title, category, app, summary, screenshot, status, updatedAt } = g;
  return { id, number, title, category, app, summary, screenshot, status, updatedAt };
}

export async function listGuides(opts: { includeDrafts?: boolean } = {}): Promise<Guide[]> {
  const db = await getDb();
  const rows = await db.query<{ data: Guide }>(
    `SELECT data FROM guides ${opts.includeDrafts ? "" : "WHERE status = 'published'"} ORDER BY number, id`,
  );
  return rows.map((r) => r.data);
}

export async function getGuide(id: string, opts: { includeDrafts?: boolean } = {}): Promise<Guide | null> {
  const db = await getDb();
  const rows = await db.query<{ data: Guide; status: string }>("SELECT data, status FROM guides WHERE id = $1", [id]);
  const row = rows[0];
  if (!row) return null;
  if (!opts.includeDrafts && row.status !== "published") return null;
  return row.data;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Sparar en guide (ny eller befintlig). Versionen räknas upp så att cachade embeddings blir inaktuella. */
export async function saveGuide(input: Guide, updatedBy: string): Promise<Guide> {
  const db = await getDb();
  const existing = await db.query<{ version: number }>("SELECT version FROM guides WHERE id = $1", [input.id]);
  const version = (existing[0]?.version ?? 0) + 1;
  const guide: Guide = { ...input, version, updatedAt: new Date().toISOString(), updatedBy, language: "sv" };
  await db.query(
    `INSERT INTO guides (id, status, category, app, number, data, version, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET status=$2, category=$3, app=$4, number=$5, data=$6, version=$7, updated_at=$8`,
    [guide.id, guide.status, guide.category, guide.app, guide.number, guide, guide.version, guide.updatedAt],
  );
  return guide;
}

export async function deleteGuide(id: string) {
  const db = await getDb();
  await db.query("DELETE FROM guides WHERE id = $1", [id]);
}

export async function nextGuideNumber(): Promise<number> {
  const db = await getDb();
  const [{ max }] = await db.query<{ max: number | null }>("SELECT max(number) AS max FROM guides");
  return (max ?? 0) + 1;
}
