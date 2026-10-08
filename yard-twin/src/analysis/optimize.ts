/**
 * Optimering: "hur många dörrar behövs?" och "hur många slots behövs?".
 * Svepen kör hela fördelningen per steg (samma seed för alla steg), så att marginalnyttan är jämförbar.
 */
import type { SlotDesign } from "../engine/arrivals.ts";
import { buildSlots } from "../engine/arrivals.ts";
import type { SiteModel } from "../engine/model.ts";
import { runMonteCarlo, summarizeRuns } from "../engine/montecarlo.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import { summarize, type Interval } from "../engine/stats.ts";
import type { MetricKey } from "../engine/types.ts";
import {
  assertReps,
  baseSlotDesign,
  expectedDailyTrucks,
  lt,
  simulateReps,
  withDoors,
  withSlot,
  type LocalizedText,
  type RunOpts,
  type WaitTarget,
} from "./common.ts";
import { fmtMin, fmtNum } from "./i18n-format.ts";

/**
 * PRODUKTBESLUT: när en extra dörr (eller +1 slot/timme) minskar målmåttets median med mindre än 1 minut
 * kallar vi det avtagande avkastning. En minut ligger under vad en kund märker och under modellens typiska fel.
 */
export const DIMINISHING_RETURNS_MIN_GAIN_MIN = 1;

export const DEFAULT_SWEEP_REPS = 100;

/** Metriker som sammanfattas per steg. */
export const SWEEP_METRICS = ["avgWait", "p90Wait", "maxQueue", "doorUtilization", "detentionCost", "overtimeMin"] as const satisfies readonly MetricKey[];
type SweepMetric = (typeof SWEEP_METRICS)[number];

export interface DoorSweepStep {
  doors: number;
  summary: Record<SweepMetric, Interval>;
  meetsTarget: boolean;
  /** Minskning av målmåttets median jämfört med föregående steg (min). null för första steget. */
  marginalGain: number | null;
  detentionCost: Interval;
  /** Dörrkostnad per dag (antal × kostnad), null om kostnad inte angavs. */
  doorCostPerDay: number | null;
  /** Dörrkostnad + median detentionkostnad per dag, null om dörrkostnad inte angavs. */
  totalCostPerDay: number | null;
}

export interface DiminishingNote {
  /** Antal dörrar/kapacitet varefter nästa steg ger mindre än gränsen. */
  after: number;
  text: LocalizedText;
}

export interface DoorSweepResult {
  target: WaitTarget;
  steps: DoorSweepStep[];
  /** Minsta antal dörrar som uppfyller målet, null om inget steg gör det. */
  minimalDoors: number | null;
  /** Billigaste antal dörrar (dörrkostnad + detention), om dörrkostnad angavs. */
  costOptimalDoors: number | null;
  diminishing: DiminishingNote | null;
  reps: number;
}

export interface DoorSweepOpts extends Partial<RunOpts> {
  target: WaitTarget;
  minDoors?: number;
  /** Standard: max(nuvarande + 4, 2 × nuvarande). */
  maxDoors?: number;
  costPerDoorPerDay?: number | null;
}

export function targetValue(summary: Record<string, Interval>, target: WaitTarget): number {
  return summary[target.metric][target.quantile];
}

export function doorSweep(model: SiteModel, scenario: CompiledScenario, opts: DoorSweepOpts): DoorSweepResult {
  const reps = opts.reps ?? DEFAULT_SWEEP_REPS;
  assertReps(reps);
  const seed = opts.seed ?? scenario.seed;
  const cur = scenario.site.doors.length;
  const minDoors = Math.max(1, Math.round(opts.minDoors ?? 1));
  const maxDoors = Math.max(minDoors, Math.round(opts.maxDoors ?? Math.max(cur + 4, cur * 2)));
  const cpd = opts.costPerDoorPerDay ?? null;
  const steps: DoorSweepStep[] = [];
  for (let n = minDoors; n <= maxDoors; n++) {
    const mc = runMonteCarlo(model, withDoors(scenario, n), { reps, seed, recorded: opts.recorded });
    const summary = pick(mc.summary);
    const prev = steps[steps.length - 1];
    const doorCostPerDay = cpd === null ? null : n * cpd;
    steps.push({
      doors: n,
      summary,
      meetsTarget: targetValue(summary, opts.target) <= opts.target.max,
      marginalGain: prev ? prev.summary[opts.target.metric].median - summary[opts.target.metric].median : null,
      detentionCost: summary.detentionCost,
      doorCostPerDay,
      totalCostPerDay: doorCostPerDay === null ? null : doorCostPerDay + summary.detentionCost.median,
    });
  }
  const minimal = steps.find((s) => s.meetsTarget)?.doors ?? null;
  let costOptimal: number | null = null;
  if (cpd !== null) {
    let best = Infinity;
    for (const s of steps) if (s.totalCostPerDay! < best) ((best = s.totalCostPerDay!), (costOptimal = s.doors));
  }
  const diminishing = diminishingNote(
    steps.map((s) => ({ x: s.doors, gain: s.marginalGain })),
    (n) => lt(`Efter ${n} dörrar ger en extra dörr mindre än ${fmtMin(DIMINISHING_RETURNS_MIN_GAIN_MIN, "sv")} kortare ${metricSv(opts.target.metric)} (median).`, `Beyond ${n} doors, an extra door reduces ${metricEn(opts.target.metric)} by less than ${fmtMin(DIMINISHING_RETURNS_MIN_GAIN_MIN, "en")} (median).`),
  );
  return { target: opts.target, steps, minimalDoors: minimal, costOptimalDoors: costOptimal, diminishing, reps };
}

function pick(s: Record<MetricKey, Interval>): Record<SweepMetric, Interval> {
  const o = {} as Record<SweepMetric, Interval>;
  for (const k of SWEEP_METRICS) o[k] = s[k];
  return o;
}

function metricSv(m: WaitTarget["metric"]): string {
  return m === "avgWait" ? "medelväntan" : "p90-väntan";
}
function metricEn(m: WaitTarget["metric"]): string {
  return m === "avgWait" ? "average wait" : "p90 wait";
}

/** Första punkt varefter vinsten för nästa steg understiger gränsen – och fortsätter göra det. */
function diminishingNote(points: { x: number; gain: number | null }[], text: (x: number) => LocalizedText): DiminishingNote | null {
  for (let i = 1; i < points.length; i++) {
    const rest = points.slice(i);
    if (rest.every((p) => p.gain !== null && p.gain < DIMINISHING_RETURNS_MIN_GAIN_MIN)) {
      return { after: points[i - 1].x, text: text(points[i - 1].x) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Slotsvep: hur många bokningsbara platser per timme behövs?

export interface SlotSweepStep {
  capacityPerHour: number;
  /** Bokningsbara platser per dag. */
  bookableSlots: number;
  summary: Record<SweepMetric, Interval>;
  /** Andel lastbilar som inte fick någon slot (blev obokade). */
  walkInShare: Interval;
  meetsTarget: boolean;
  marginalGain: number | null;
}

export interface SlotSweepResult {
  target: WaitTarget;
  slot: Omit<SlotDesign, "capacityPerHour">;
  steps: SlotSweepStep[];
  minimalCapacity: number | null;
  diminishing: DiminishingNote | null;
  /** Förväntad bokningsefterfrågan per dag (inkl. no-show). */
  expectedDemand: number;
  reps: number;
}

export interface SlotSweepOpts extends Partial<RunOpts> {
  target: WaitTarget;
  /** Kapaciteter att prova (bokningar/timme). Standard: från ~60 % av snittbehovet till 150 % av topptimmen. */
  capacities?: readonly number[];
  /** Överstyr slotlängd/fönster/följsamhet. Standard: scenariots bokningsdesign, annars 30-min slots över öppettiden. */
  slot?: Partial<Omit<SlotDesign, "capacityPerHour">>;
}

/** Högst så här många steg i standardsvepet (prestanda i Web Worker). */
export const SLOT_SWEEP_MAX_STEPS = 10;

export function slotSweep(model: SiteModel, scenario: CompiledScenario, opts: SlotSweepOpts): SlotSweepResult {
  const reps = opts.reps ?? DEFAULT_SWEEP_REPS;
  assertReps(reps);
  const seed = opts.seed ?? scenario.seed;
  const base = { ...baseSlotDesign(scenario), ...opts.slot };
  const demand = bookingDemand(model, scenario);
  const caps = opts.capacities ?? defaultCapacities(model, scenario, base);
  const steps: SlotSweepStep[] = [];
  for (const cap of caps) {
    const design: SlotDesign = { ...base, capacityPerHour: cap };
    const r = runSlotDesign(model, scenario, design, { reps, seed });
    const prev = steps[steps.length - 1];
    steps.push({
      capacityPerHour: cap,
      bookableSlots: totalSlots(design),
      summary: r.summary,
      walkInShare: r.walkInShare,
      meetsTarget: targetValue(r.summary, opts.target) <= opts.target.max,
      marginalGain: prev ? prev.summary[opts.target.metric].median - r.summary[opts.target.metric].median : null,
    });
  }
  const slot = { lengthMin: base.lengthMin, from: base.from, to: base.to, adherence: base.adherence, toleranceMin: base.toleranceMin };
  return {
    target: opts.target,
    slot,
    steps,
    minimalCapacity: steps.find((s) => s.meetsTarget)?.capacityPerHour ?? null,
    diminishing: diminishingNote(
      steps.map((s) => ({ x: s.capacityPerHour, gain: s.marginalGain })),
      (x) => lt(`Över ${fmtNum(x, "sv")} bokningar/timme ger mer kapacitet mindre än ${fmtMin(DIMINISHING_RETURNS_MIN_GAIN_MIN, "sv")} kortare ${metricSv(opts.target.metric)}.`, `Beyond ${fmtNum(x, "en")} bookings/hour, more capacity reduces ${metricEn(opts.target.metric)} by less than ${fmtMin(DIMINISHING_RETURNS_MIN_GAIN_MIN, "en")}.`),
    ),
    expectedDemand: demand,
    reps,
  };
}

/** Kör en slotdesign och returnera sammanfattning + andel obokade. */
export function runSlotDesign(model: SiteModel, scenario: CompiledScenario, design: SlotDesign, opts: { reps: number; seed?: string }): { summary: Record<SweepMetric, Interval>; walkInShare: Interval } {
  const sc = withSlot(scenario, design);
  const walk: number[] = [];
  const metrics = simulateReps(model, sc, { reps: opts.reps, seed: opts.seed ?? scenario.seed }, ({ trucks }) => {
    walk.push(trucks.length > 0 ? trucks.filter((t) => t.walkIn).length / trucks.length : 0);
  });
  return { summary: pick(summarizeRuns(metrics)), walkInShare: summarize(walk) };
}

export function totalSlots(design: SlotDesign): number {
  return buildSlots(design).reduce((a, s) => a + s.cap, 0);
}

/** Förväntat antal bokningar per dag – no-show bokar också, precis som i motorn. */
export function bookingDemand(model: SiteModel, scenario: CompiledScenario): number {
  return expectedDailyTrucks(model, scenario) / Math.max(1e-9, 1 - model.noShowRate);
}

function defaultCapacities(model: SiteModel, scenario: CompiledScenario, base: Omit<SlotDesign, "capacityPerHour">): number[] {
  const hours = Math.max(1 / 60, (base.to - base.from) / 60);
  const avgNeed = bookingDemand(model, scenario) / hours;
  const peak = Math.max(...model.hourlyArrivals) * scenario.arrivals.volumeFactor;
  const lo = Math.max(1, Math.floor(avgNeed * 0.6));
  const hi = Math.max(lo + 1, Math.ceil(Math.max(peak, avgNeed) * 1.5));
  const step = Math.max(1, Math.ceil((hi - lo) / (SLOT_SWEEP_MAX_STEPS - 1)));
  const out: number[] = [];
  for (let c = lo; c <= hi; c += step) out.push(c);
  return out;
}
