import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "../src/engine/montecarlo.ts";
import { testModel, testScenario, testScenarioFile } from "./fixtures.ts";

describe("prestanda", () => {
  it("200 lastbilar × 300 repetitioner på under 3 s", () => {
    const base = testModel();
    const total = base.hourlyArrivals.reduce((a, b) => a + b, 0);
    const model = { ...base, hourlyArrivals: base.hourlyArrivals.map((x) => (x * 200) / total) };
    const sc = testScenario({ site: { ...testScenarioFile().site, doors: 14, gateLanes: 2 }, monteCarlo: { reps: 300, seed: "perf" } });
    runMonteCarlo(model, sc, { reps: 20 }); // uppvärmning (JIT)
    const mc = runMonteCarlo(model, sc);
    const trucks = 300 * 200;
    console.log(`MC: ${mc.reps} rep, ~${trucks} lastbilsflöden, ${mc.elapsedMs.toFixed(0)} ms, median väntan ${mc.summary.avgWait.median.toFixed(1)} min`);
    expect(mc.elapsedMs).toBeLessThan(3000);
  });
});
