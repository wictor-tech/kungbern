/**
 * Kapacitetsgräns: hur mycket mer volym klarar sajten innan målet bryts eller kön inte hinner betas av?
 */
import type { SiteModel } from "../engine/model.ts";
import { runMonteCarlo, type MonteCarloResult } from "../engine/montecarlo.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import type { Interval } from "../engine/stats.ts";
import { assertReps, expectedDailyTrucks, withVolumeFactor, type RunOpts, type WaitTarget } from "./common.ts";
import { targetValue } from "./optimize.ts";

/**
 * PRODUKTBESLUT: "sammanbrott" = kön är inte avbetad senast 2 timmar efter stängning (median övertid > 120 min),
 * eller lastbilar blir helt olossade (median notUnloaded > 0, t.ex. när övertid inte är tillåten).
 * Två timmar motsvarar ungefär ett extra halvt skift – mer än så är inte en "lång dag" utan ett system som inte bär.
 */
export const BREAKDOWN_OVERTIME_MIN = 120;

export const DEFAULT_CAPACITY_REPS = 100;
export const DEFAULT_MAX_FACTOR = 3;
/** Bisektionen stoppar när intervallet är smalare än 2 % av nuvarande volym. */
export const CAPACITY_TOLERANCE = 0.02;
/** Lägsta faktor som provas om sajten redan bryter målet i dag. */
export const CAPACITY_MIN_FACTOR = 0.1;
/** Antal punkter i kurvan (för diagram). */
export const CAPACITY_CURVE_POINTS = 8;

export interface CapacityPoint {
  /** Volym relativt nuvarande (1 = i dag). */
  factor: number;
  expectedTrucks: number;
  /** Målmetriken (median, p10, p90 över repetitioner). */
  value: Interval;
  p90Wait: Interval;
  violatesTarget: boolean;
  breakdown: boolean;
}

export interface CapacityResult {
  target: WaitTarget;
  /** Största provade faktor som klarar både målet och sammanbrottsgränsen. null om inte ens minsta faktorn klarar det. */
  lastOkFactor: number | null;
  /** Minsta provade faktor som bryter. null om inget bryter upp till maxFactor (gränsen är då "> maxFactor"). */
  breakpointFactor: number | null;
  /**
   * Marginal = lastOkFactor − 1 (konservativt: sista faktor som höll). Negativ = målet bryts redan i dag.
   * null om ingen faktor klarade det.
   */
  margin: number | null;
  /** Vilka kriterier som utlöste vid brytpunkten. */
  fired: { target: boolean; breakdown: boolean } | null;
  currentTrucks: number;
  curve: CapacityPoint[];
  maxFactor: number;
  reps: number;
}

export interface CapacityOpts extends Partial<RunOpts> {
  target: WaitTarget;
  maxFactor?: number;
}

export function capacityLimit(model: SiteModel, scenario: CompiledScenario, opts: CapacityOpts): CapacityResult {
  const reps = opts.reps ?? DEFAULT_CAPACITY_REPS;
  assertReps(reps);
  const maxFactor = opts.maxFactor ?? DEFAULT_MAX_FACTOR;
  if (!(maxFactor > 1)) throw new Error("maxFactor måste vara > 1");
  const seed = opts.seed ?? scenario.seed;
  const vf0 = scenario.arrivals.volumeFactor;
  const currentTrucks = expectedDailyTrucks(model, scenario, opts.recorded);
  const cache = new Map<number, CapacityPoint>();

  const evalAt = (factor: number): CapacityPoint => {
    const key = Math.round(factor * 1e6) / 1e6;
    const hit = cache.get(key);
    if (hit) return hit;
    const mc = runMonteCarlo(model, withVolumeFactor(scenario, vf0 * key), { reps, seed, recorded: opts.recorded });
    const p = point(key, mc, opts.target, currentTrucks);
    cache.set(key, p);
    return p;
  };
  const bad = (p: CapacityPoint) => p.violatesTarget || p.breakdown;

  let lo: number, hi: number;
  const at1 = evalAt(1);
  if (bad(at1)) {
    const atMin = evalAt(CAPACITY_MIN_FACTOR);
    if (bad(atMin)) return finish(null, CAPACITY_MIN_FACTOR);
    lo = CAPACITY_MIN_FACTOR;
    hi = 1;
  } else {
    const atMax = evalAt(maxFactor);
    if (!bad(atMax)) return finish(maxFactor, null);
    lo = 1;
    hi = maxFactor;
  }
  // Bisektion – antar att målmetriken växer (ungefär) monotont med volymen; samma seed ger jämn kurva.
  while (hi - lo > CAPACITY_TOLERANCE) {
    const mid = (lo + hi) / 2;
    if (bad(evalAt(mid))) hi = mid;
    else lo = mid;
  }
  return finish(lo, hi);

  function finish(lastOk: number | null, breakpoint: number | null): CapacityResult {
    const lowEnd = Math.min(0.5, lastOk ?? CAPACITY_MIN_FACTOR);
    for (let i = 0; i < CAPACITY_CURVE_POINTS; i++) evalAt(lowEnd + ((maxFactor - lowEnd) * i) / (CAPACITY_CURVE_POINTS - 1));
    const curve = [...cache.values()].sort((a, b) => a.factor - b.factor);
    const bp = breakpoint === null ? null : cache.get(Math.round(breakpoint * 1e6) / 1e6) ?? null;
    return {
      target: opts.target,
      lastOkFactor: lastOk,
      breakpointFactor: breakpoint,
      margin: lastOk === null ? null : lastOk - 1,
      fired: bp ? { target: bp.violatesTarget, breakdown: bp.breakdown } : null,
      currentTrucks,
      curve,
      maxFactor,
      reps,
    };
  }
}

function point(factor: number, mc: MonteCarloResult, target: WaitTarget, currentTrucks: number): CapacityPoint {
  const s = mc.summary;
  return {
    factor,
    expectedTrucks: currentTrucks * factor,
    value: s[target.metric],
    p90Wait: s.p90Wait,
    violatesTarget: targetValue(s, target) > target.max,
    breakdown: s.overtimeMin.median > BREAKDOWN_OVERTIME_MIN || s.notUnloaded.median > 0,
  };
}
