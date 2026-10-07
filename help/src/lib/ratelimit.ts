/**
 * Enkel begränsning av antal anrop per IP (i minnet, per serverinstans).
 * Skyddar mot att någon spammar frågor eller ärenden. Byt mot t.ex. Upstash/Redis vid flera instanser.
 */
const buckets = new Map<string, number[]>();

export function rateLimited(req: Request, name: string, max: number, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (now - v[v.length - 1] > windowMs) buckets.delete(k);
  return hits.length > max;
}
