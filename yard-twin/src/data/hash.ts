/**
 * Stabil, icke-kryptografisk hash för versions-id och pseudonyma demo-id:n.
 * Två FNV-1a-varianter med olika startvärden ger 64 bitar (16 hex-tecken).
 * Används INTE som säkerhetsmekanism – pseudonymisering av riktiga id:n sker med salted hash i källmiljön.
 */
export function stableHash(s: string): string {
  let h1 = 2166136261;
  let h2 = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c;
    h2 = Math.imul(h2, 16777619);
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** JSON med sorterade nycklar (undefined utelämnas) – deterministisk serialisering. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}
