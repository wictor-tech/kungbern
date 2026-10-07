/**
 * Mäter sökningens träffsäkerhet mot scripts/eval-cases.ts (utan AI, utan databas).
 *   npm run eval:search          → sammanfattning + fel
 *   npm run eval:search -- -v    → alla frågor
 */
import { publishedSeedGuides } from "../src/lib/seed";
import { buildIndex, judge, search } from "../src/lib/search";
import { EVAL_CASES } from "./eval-cases";

const verbose = process.argv.includes("-v");
const index = buildIndex(publishedSeedGuides());

let top1 = 0;
let answeredCorrect = 0;
let answeredWrong = 0;
let noneCorrect = 0;
let inTop3 = 0;
const positives = EVAL_CASES.filter((c) => c.expect !== null).length;
const negatives = EVAL_CASES.length - positives;

for (const c of EVAL_CASES) {
  const { hits } = search(index, c.q, { page: c.page });
  const { verdict, confidence } = judge(hits);
  const ok = c.expect === null ? [] : Array.isArray(c.expect) ? c.expect : [c.expect];
  const first = hits[0]?.guide.id;
  let status: string;
  if (c.expect === null) {
    const good = verdict !== "answered";
    if (verdict === "none") noneCorrect++;
    if (!good) answeredWrong++;
    status = verdict === "none" ? "OK " : good ? "OK~" : "FEL";
  } else {
    const hit = first !== undefined && ok.includes(first);
    if (hit) top1++;
    if (hits.slice(0, 3).some((h) => ok.includes(h.guide.id))) inTop3++;
    if (verdict === "answered" && hit) answeredCorrect++;
    if (verdict === "answered" && !hit) answeredWrong++;
    status = hit ? (verdict === "answered" ? "OK " : "OK~") : "FEL";
  }
  if (verbose || status === "FEL") {
    const alts = hits.slice(0, 3).map((h) => `${h.guide.id}(${h.score.toFixed(1)}|c${h.coverage.toFixed(2)}|i${h.intentSim.toFixed(2)})`);
    console.log(`${status} [${verdict} ${confidence.toFixed(2)}] "${c.q}" → ${alts.join(", ")}${c.expect ? `  (väntat ${ok.join("/")})` : ""}`);
  }
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`;
console.log("\n--- Resultat ---");
console.log(`Rätt guide först:          ${top1}/${positives} (${pct(top1, positives)})`);
console.log(`Rätt guide bland topp 3:   ${inTop3}/${positives} (${pct(inTop3, positives)})`);
console.log(`Säkert svar och rätt:      ${answeredCorrect}/${positives} (${pct(answeredCorrect, positives)})`);
console.log(`Säkert svar men FEL guide: ${answeredWrong}  ← ska vara 0`);
console.log(`Saknad guide → "ingen guide": ${noneCorrect}/${negatives}`);
if (process.argv.includes("--strict") && (answeredWrong > 0 || top1 / positives < 0.9)) process.exit(1);
