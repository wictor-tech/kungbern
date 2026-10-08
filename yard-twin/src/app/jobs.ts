import type { RecordedTruck, SiteModel } from "../engine/model.ts";
import { runDetailed, runMonteCarlo, type MonteCarloResult } from "../engine/montecarlo.ts";
import { compileScenario, type ScenarioFile } from "../engine/scenario.ts";
import type { RunResult } from "../engine/types.ts";

/** Jobb som körs i Web Workern (eller direkt om Worker saknas). Rena funktioner – lätta att testa. */
export interface RunJob {
  model: SiteModel;
  scenario: ScenarioFile;
  recorded?: RecordedTruck[];
}

export interface RunOutput {
  mc: MonteCarloResult;
  /** Detaljerad dag (repetition 0 – samma ankomster vid varje ändring). */
  detail: RunResult;
}

export function runJob(job: RunJob): RunOutput {
  const sc = compileScenario(job.scenario);
  const opts = { recorded: job.recorded };
  const mc = runMonteCarlo(job.model, sc, opts);
  const detail = runDetailed(job.model, sc, opts, 0);
  return { mc, detail };
}
