/**
 * Känslighetsanalys (tornado): vilka antaganden påverkar resultatet mest?
 * Alla körningar använder samma seed (common random numbers), så skillnader beror på parametern och inte på slumpen.
 */
import type { SiteModel } from "../engine/model.ts";
import { runMonteCarlo } from "../engine/montecarlo.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import type { MetricKey } from "../engine/types.ts";
import { UNLIMITED_GATE_LANES } from "./calibrationSummary.ts";
import { assertReps, lt, withDoors, withSite, withVolumeFactor, type LocalizedText, type RunOpts } from "./common.ts";

export type TornadoParam = "volumeFactor" | "doors" | "unloadTimeFactor" | "slotAdherence" | "gateLanes" | "detentionFreeMin";

/**
 * PRODUKTBESLUT – hur mycket varje parameter varieras i tornadon. Valda för att motsvara en realistisk
 * osäkerhet/förändring som en kund kan relatera till, inte statistiska konfidensgränser.
 */
export const TORNADO_STEPS = {
  /** Volym ±20 % (typisk säsongs-/veckovariation). */
  volumeRel: 0.2,
  /** ±1 dörr (minst 1). */
  doorsDelta: 1,
  /** Lossningstid ±20 % (bemanning/utrustning). */
  unloadRel: 0.2,
  /** Slotföljsamhet ±0,15 (bara bokat mönster), klämd till 0–1. */
  adherenceDelta: 0.15,
  /** ±1 grindfil (minst 1). */
  gateLanesDelta: 1,
  /** Fri tid före detention ±30 min (påverkar bara kostnadsmått). */
  detentionFreeDeltaMin: 30,
} as const;

/** Metriker där detentionens fria tid påverkar resultatet. */
export const COST_METRICS: readonly MetricKey[] = ["detentionCost", "overDetention"];

export const DEFAULT_TORNADO_REPS = 100;

export interface TornadoBar {
  param: TornadoParam;
  label: LocalizedText;
  lowSetting: number;
  highSetting: number;
  /** Median av metriken vid låg resp. hög inställning. */
  lowValue: number;
  highValue: number;
  baseline: number;
  /** |highValue − lowValue|. */
  swing: number;
}

export interface TornadoResult {
  metric: MetricKey;
  baseline: number;
  bars: TornadoBar[];
  reps: number;
  seed: string;
}

export interface TornadoOpts extends Partial<RunOpts> {
  metric?: MetricKey;
  params?: readonly TornadoParam[];
}

interface Variant {
  param: TornadoParam;
  label: LocalizedText;
  low: number;
  high: number;
  apply: (sc: CompiledScenario, v: number) => CompiledScenario;
}

function variants(model: SiteModel, sc: CompiledScenario, metric: MetricKey): Variant[] {
  const S = TORNADO_STEPS;
  const out: Variant[] = [];
  const vf = sc.arrivals.volumeFactor;
  out.push({ param: "volumeFactor", label: lt("Volym (lastbilar/dag)", "Volume (trucks/day)"), low: vf * (1 - S.volumeRel), high: vf * (1 + S.volumeRel), apply: withVolumeFactor });
  const d = sc.site.doors.length;
  out.push({ param: "doors", label: lt("Antal dörrar", "Number of doors"), low: Math.max(1, d - S.doorsDelta), high: d + S.doorsDelta, apply: withDoors });
  const uf = sc.unloadFactor;
  out.push({ param: "unloadTimeFactor", label: lt("Lossningstid", "Unloading time"), low: uf * (1 - S.unloadRel), high: uf * (1 + S.unloadRel), apply: (s, v) => ({ ...s, unloadFactor: v }) });
  if (sc.arrivals.pattern === "booked") {
    const slot = sc.arrivals.slot;
    const base = slot.adherence ?? empiricalAdherence(model, slot.toleranceMin);
    if (base !== null) {
      out.push({
        param: "slotAdherence",
        label: lt("Slotföljsamhet (andel i tid)", "Slot adherence (share on time)"),
        low: clamp01(base - S.adherenceDelta),
        high: clamp01(base + S.adherenceDelta),
        apply: (s, v) => (s.arrivals.pattern === "booked" ? { ...s, arrivals: { ...s.arrivals, slot: { ...s.arrivals.slot, adherence: v } } } : s),
      });
    }
  }
  const g = sc.site.gateLanes;
  // Obegränsad grind (D20: grindtid från data innehåller redan grindkön) – ±1 fil är meningslöst.
  if (g < UNLIMITED_GATE_LANES) {
    out.push({ param: "gateLanes", label: lt("Grindfiler", "Gate lanes"), low: Math.max(1, g - S.gateLanesDelta), high: g + S.gateLanesDelta, apply: (s, v) => withSite(s, { gateLanes: v }) });
  }
  if (COST_METRICS.includes(metric)) {
    const f = sc.cost.detentionFreeMin;
    out.push({
      param: "detentionFreeMin",
      label: lt("Fri tid före detention", "Free time before detention"),
      low: Math.max(0, f - S.detentionFreeDeltaMin),
      high: f + S.detentionFreeDeltaMin,
      apply: (s, v) => ({ ...s, cost: { ...s.cost, detentionFreeMin: v } }),
    });
  }
  return out;
}

/** Andel empiriska slotavvikelser inom toleransen (null om data saknas). */
export function empiricalAdherence(model: SiteModel, toleranceMin: number): number | null {
  const s = model.slotDeviationSamples;
  if (s.length === 0) return null;
  return s.filter((x) => Math.abs(x) <= toleranceMin).length / s.length;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function tornado(model: SiteModel, scenario: CompiledScenario, opts: TornadoOpts = {}): TornadoResult {
  const metric = opts.metric ?? "p90Wait";
  const reps = opts.reps ?? DEFAULT_TORNADO_REPS;
  assertReps(reps);
  const seed = opts.seed ?? scenario.seed;
  const run = (sc: CompiledScenario) => runMonteCarlo(model, sc, { reps, seed, recorded: opts.recorded }).summary[metric].median;
  const baseline = run(scenario);
  const wanted = opts.params ? new Set(opts.params) : null;
  const bars: TornadoBar[] = [];
  for (const v of variants(model, scenario, metric)) {
    if (wanted && !wanted.has(v.param)) continue;
    const lowValue = run(v.apply(scenario, v.low));
    const highValue = run(v.apply(scenario, v.high));
    bars.push({ param: v.param, label: v.label, lowSetting: v.low, highSetting: v.high, lowValue, highValue, baseline, swing: Math.abs(highValue - lowValue) });
  }
  bars.sort((a, b) => b.swing - a.swing);
  return { metric, baseline, bars, reps, seed };
}
