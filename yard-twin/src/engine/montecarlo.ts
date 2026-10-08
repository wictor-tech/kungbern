import { generateDay } from "./arrivals.ts";
import type { RecordedTruck, SiteModel } from "./model.ts";
import type { CompiledScenario } from "./scenario.ts";
import { simulateDay } from "./simulate.ts";
import { summarize, type Interval } from "./stats.ts";
import { METRIC_KEYS, type MetricKey, type RunMetrics, type RunResult, type StrategyKind } from "./types.ts";

export interface MonteCarloOptions {
  reps?: number;
  seed?: string;
  recorded?: readonly RecordedTruck[];
}

export interface MonteCarloResult {
  reps: number;
  seed: string;
  summary: Record<MetricKey, Interval>;
  perRep: RunMetrics[];
  elapsedMs: number;
}

/** Kör N repetitioner. Repetition r använder samma lastbilar för alla scenarier med samma ankomstspec och seed. */
export function runMonteCarlo(model: SiteModel, sc: CompiledScenario, opts: MonteCarloOptions = {}): MonteCarloResult {
  const reps = opts.reps ?? sc.reps;
  const seed = opts.seed ?? sc.seed;
  const t0 = now();
  const perRep: RunMetrics[] = [];
  for (let r = 0; r < reps; r++) {
    const trucks = generateDay(model, sc.arrivals, { seed, rep: r, unloadFactor: sc.unloadFactor, recorded: opts.recorded });
    perRep.push(simulateDay(trucks, sc.site, sc.strategy, sc.cost).metrics);
  }
  return { reps, seed, summary: summarizeRuns(perRep), perRep, elapsedMs: now() - t0 };
}

/** En detaljerad körning (för animering/Gantt) – repetition 0 med samma seed som Monte Carlo. */
export function runDetailed(model: SiteModel, sc: CompiledScenario, opts: MonteCarloOptions = {}, rep = 0): RunResult {
  const trucks = generateDay(model, sc.arrivals, { seed: opts.seed ?? sc.seed, rep, unloadFactor: sc.unloadFactor, recorded: opts.recorded });
  return simulateDay(trucks, sc.site, sc.strategy, sc.cost, { detail: true });
}

/** Välj den repetition vars genomsnittliga väntan ligger närmast medianen – en "typisk dag" att visa. */
export function representativeRep(mc: MonteCarloResult): number {
  const target = mc.summary.avgWait.median;
  let best = 0;
  for (let r = 1; r < mc.perRep.length; r++) {
    if (Math.abs(mc.perRep[r].avgWait - target) < Math.abs(mc.perRep[best].avgWait - target)) best = r;
  }
  return best;
}

export function summarizeRuns(perRep: readonly RunMetrics[]): Record<MetricKey, Interval> {
  const out = {} as Record<MetricKey, Interval>;
  for (const k of METRIC_KEYS) out[k] = summarize(perRep.map((m) => m[k]));
  return out;
}

/** Jämför tilldelningsstrategier i samma körning med identiska lastbilar per repetition. */
export function compareStrategies(model: SiteModel, sc: CompiledScenario, kinds: readonly StrategyKind[], opts: MonteCarloOptions = {}): Record<string, MonteCarloResult> {
  const out: Record<string, MonteCarloResult> = {};
  for (const kind of kinds) {
    out[kind] = runMonteCarlo(model, { ...sc, strategy: { ...sc.strategy, kind } }, opts);
  }
  return out;
}

/** Parvisa skillnader (b - a) per repetition – ger intervall för deltan som respekterar common random numbers. */
export function pairedDelta(a: MonteCarloResult, b: MonteCarloResult, key: MetricKey): Interval {
  const n = Math.min(a.perRep.length, b.perRep.length);
  const d: number[] = [];
  for (let i = 0; i < n; i++) d.push(b.perRep[i][key] - a.perRep[i][key]);
  return summarize(d);
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
