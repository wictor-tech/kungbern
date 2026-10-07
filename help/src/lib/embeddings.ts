import { getDb } from "./db";
import type { Guide } from "./types";

/**
 * Valfri semantisk sökning med Voyage-embeddings (VOYAGE_API_KEY).
 * Guidvektorer cachas i databasen per guideversion, så de räknas bara om när en guide ändras.
 */

const MODEL = () => process.env.VOYAGE_MODEL || "voyage-3.5-lite";

export function embeddingsEnabled() {
  return Boolean(process.env.VOYAGE_API_KEY);
}

async function embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: texts, model: MODEL(), input_type: inputType }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

function guideText(g: Guide) {
  return [g.title, g.summary, g.breadcrumb.join(" › "), ...g.alternativeQueries, ...g.steps.map((s) => s.text)].join("\n");
}

/** Säkerställer att alla guider har en aktuell vektor. Returnerar id → vektor. */
export async function guideVectors(guides: Guide[]): Promise<Map<string, number[]>> {
  const db = await getDb();
  const rows = await db.query<{ guide_id: string; version: number; model: string; vector: number[] }>(
    "SELECT guide_id, version, model, vector FROM guide_embeddings",
  );
  const have = new Map(rows.filter((r) => r.model === MODEL()).map((r) => [r.guide_id, r]));
  const stale = guides.filter((g) => have.get(g.id)?.version !== g.version);
  for (let i = 0; i < stale.length; i += 64) {
    const batch = stale.slice(i, i + 64);
    const vectors = await embed(batch.map(guideText), "document");
    for (const [j, g] of batch.entries()) {
      await db.query(
        `INSERT INTO guide_embeddings (guide_id, version, model, vector) VALUES ($1,$2,$3,$4)
         ON CONFLICT (guide_id) DO UPDATE SET version=$2, model=$3, vector=$4`,
        [g.id, g.version, MODEL(), vectors[j]],
      );
      have.set(g.id, { guide_id: g.id, version: g.version, model: MODEL(), vector: vectors[j] });
    }
  }
  return new Map([...have].map(([id, r]) => [id, r.vector]));
}

export async function embedQuery(q: string): Promise<number[]> {
  const [v] = await embed([q], "query");
  return v;
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
