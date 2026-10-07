// npm run eval -w server           → rapport för båda delmängderna
// EVAL_FILE=riktiga.json npm run eval -w server   → egen fil: [{ "q": "...", "expected": "guide-id"|"none" }]
import { readFileSync } from "node:fs";
import { SearchEngine, qualityOf } from "../search/engine.js";
import { seedGuides } from "../seed/guides.js";
import { CASES, type Case } from "./cases.js";

export function evaluate(cases: Case[], engine: SearchEngine) {
  const rows = cases.map((c) => {
    const hit = engine.search(c.q, {})[0];
    const quality = hit ? qualityOf(hit.score) : "none";
    const got = quality === "good" ? hit!.guide.id : "none";
    const top3 = engine.search(c.q, {}, { limit: 3 }).some((x) => x.guide.id === c.expected);
    return { ...c, top3, got, score: hit?.score ?? 0, top: hit?.guide.id ?? "-", ok: got === c.expected, quality };
  });
  const inScope = rows.filter((r) => r.expected !== "none");
  const out = rows.filter((r) => r.expected === "none");
  const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
  return {
    rows,
    inScopeCorrect: pct(inScope.filter((r) => r.ok).length, inScope.length),   // rätt guide visas direkt
    inScopeWrong: pct(inScope.filter((r) => r.got !== "none" && !r.ok).length, inScope.length), // SÄKERT FEL svar – värst
    inScopeMissed: pct(inScope.filter((r) => r.got === "none").length, inScope.length),        // föll tillbaka till förslag
    inScopeTop3: pct(inScope.filter((r) => r.top3).length, inScope.length),   // rätt guide finns bland de 3 första förslagen
    outHonest: pct(out.filter((r) => r.ok).length, out.length),               // ingen falsk träff
    n: { inScope: inScope.length, out: out.length },
  };
}

if (process.argv[1]?.endsWith("run.ts")) {
  const engine = new SearchEngine();
  engine.build(seedGuides());
  const cases: Case[] = process.env.EVAL_FILE
    ? (JSON.parse(readFileSync(process.env.EVAL_FILE, "utf8")) as { q: string; expected: string }[]).map((c) => ({ ...c, split: "held" as const }))
    : CASES;
  for (const split of ["dev", "held", "fresh"] as const) {
    const subset = cases.filter((c) => c.split === split);
    if (!subset.length) continue;
    const r = evaluate(subset, engine);
    console.log(`\n=== ${split.toUpperCase()}  (${r.n.inScope} frågor med guide, ${r.n.out} utan) ===`);
    console.log(`  rätt guide direkt:        ${r.inScopeCorrect} %`);
    console.log(`  säkert FEL svar:          ${r.inScopeWrong} %   <- det som ska vara nära 0`);
    console.log(`  bara förslag/inget svar:  ${r.inScopeMissed} %`);
    console.log(`  rätt guide bland topp 3:  ${r.inScopeTop3} %`);
    console.log(`  ärligt "inget svar" (utanför scope): ${r.outHonest} %`);
    for (const x of r.rows.filter((x) => !x.ok)) console.log(`    ✗ "${x.q}"  väntade ${x.expected}, fick ${x.got} (bästa: ${x.top} ${x.score.toFixed(2)})`);
  }
}
