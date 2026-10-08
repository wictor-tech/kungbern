import { analyzeBottleneck } from "../analysis/bottleneck.ts";
import { capacityLimit } from "../analysis/capacity.ts";
import type { WaitTarget } from "../analysis/common.ts";
import { doorSweep } from "../analysis/optimize.ts";
import { computeRoi, type RoiInputs } from "../analysis/roi.ts";
import { tornado } from "../analysis/sensitivity.ts";
import { suggestSlotDesign } from "../analysis/slotDesign.ts";
import type { SiteModel } from "../engine/model.ts";
import { compileScenario, type ScenarioFile } from "../engine/scenario.ts";
import { runJob, type RunJob } from "./jobs.ts";

const c = compileScenario;

/** Register över funktioner som UI:t får anropa i workern. Allt tar serialiserbara argument. */
const registry: Record<string, (...args: never[]) => unknown> = {
  run: (job: RunJob) => runJob(job),
  compare: (model: SiteModel, without: ScenarioFile, withB: ScenarioFile) => ({
    without: runJob({ model, scenario: without }),
    with: runJob({ model, scenario: withB }),
  }),
  tornado: (model: SiteModel, s: ScenarioFile, reps: number) => tornado(model, c(s), { reps, metric: "p90Wait" }),
  doors: (model: SiteModel, s: ScenarioFile, target: WaitTarget, maxDoors: number, reps: number) => doorSweep(model, c(s), { target, maxDoors, reps }),
  bottleneck: (model: SiteModel, s: ScenarioFile, reps: number) => analyzeBottleneck(model, c(s), { reps }),
  capacity: (model: SiteModel, s: ScenarioFile, target: WaitTarget, reps: number) => capacityLimit(model, c(s), { target, reps }),
  slotDesign: (model: SiteModel, s: ScenarioFile, reps: number) => suggestSlotDesign(model, c(s), { reps }),
  roi: (model: SiteModel, without: ScenarioFile, withB: ScenarioFile, inputs: Partial<RoiInputs>, reps: number) =>
    computeRoi({ model, without: c(without), with: c(withB), inputs, reps }),
};

export function handle(fn: string, args: unknown[]): unknown {
  const f = registry[fn];
  if (!f) throw new Error(`Okänd funktion: ${fn}`);
  return (f as (...a: unknown[]) => unknown)(...args);
}
