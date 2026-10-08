/**
 * Kör ett eller två scenarier mot demosajten från kommandoraden.
 *   npm run scenario -- scenarios/demo-slot-booking.json [--compare scenarios/demo-baseline.json]
 */
import { readFileSync } from "node:fs";
import { pairedDelta, runMonteCarlo } from "../src/engine/montecarlo.ts";
import { compileScenario, scenarioHash, type ScenarioFile } from "../src/engine/scenario.ts";
import { formatClock } from "../src/engine/time.ts";
import type { MetricKey } from "../src/engine/types.ts";

const ds = JSON.parse(readFileSync(new URL("../src/app/demo/demo-dataset.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const load = (p: string) => JSON.parse(readFileSync(p, "utf8")) as ScenarioFile;
const run = (s: ScenarioFile) => {
  const model = ds.profiles[s.dayType ?? "all"] ?? ds.profiles.all;
  const recorded = s.arrivals.pattern === "recorded" ? ds.days.find((d: { date: string }) => d.date === s.date)?.trucks : undefined;
  return runMonteCarlo(model, compileScenario(s), { recorded });
};
const keys: MetricKey[] = ["avgWait", "p90Wait", "maxQueue", "overDetention", "detentionCost", "doorUtilization", "timeToEmpty"];
const fmt = (k: MetricKey, v: number) => (k === "timeToEmpty" ? formatClock(v) : k === "doorUtilization" ? `${(v * 100).toFixed(0)} %` : v.toFixed(1));

const a = load(args[0]);
const ra = run(a);
console.log(`${a.name}  [${scenarioHash(a)}]  ${ra.reps} rep, ${ra.elapsedMs.toFixed(0)} ms, kostnadskälla: ${a.costs.source}`);
for (const k of keys) console.log(`  ${k.padEnd(16)} ${fmt(k, ra.summary[k].median).padStart(8)}  (${fmt(k, ra.summary[k].p10)}–${fmt(k, ra.summary[k].p90)})`);
const ci = args.indexOf("--compare");
if (ci >= 0) {
  const b = load(args[ci + 1]);
  const rb = run(b);
  console.log(`\nJämfört med ${b.name} [${scenarioHash(b)}] (parvisa deltan, median och 10–90 %):`);
  for (const k of keys) {
    const d = pairedDelta(rb, ra, k);
    console.log(`  ${k.padEnd(16)} ${d.median.toFixed(1).padStart(8)}  (${d.p10.toFixed(1)} … ${d.p90.toFixed(1)})`);
  }
}
