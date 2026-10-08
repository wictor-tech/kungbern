/**
 * Gemensamma hjälpfunktioner för analyslagret (Fas 3 + 4).
 * Inga resultatsiffror är hårdkodade här – bara mekanik för att variera scenarier och köra repetitioner.
 */
import { generateDay, type SlotDesign } from "../engine/arrivals.ts";
import type { RecordedTruck, SiteModel } from "../engine/model.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import { simulateDay } from "../engine/simulate.ts";
import type { DoorSpec, RunMetrics, RunResult, SiteConfig, Truck } from "../engine/types.ts";

/** Text som visas i UI, på svenska och engelska. */
export interface LocalizedText {
  sv: string;
  en: string;
}

export type Lang = "sv" | "en";

export function lt(sv: string, en: string): LocalizedText {
  return { sv, en };
}

/** Mål för en väntetidsmetrik. `quantile` avser Monte Carlo-fördelningen över dagar (median eller p90 av dagarna). */
export interface WaitTarget {
  metric: "p90Wait" | "avgWait";
  /** Högsta tillåtna värde (min). */
  max: number;
  quantile: "median" | "p90";
}

/** Gemensamma körningsoptioner. */
export interface RunOpts {
  reps: number;
  seed?: string;
  /** Krävs om scenariot använder mönstret "recorded". */
  recorded?: readonly RecordedTruck[];
}

/** Byt antal dörrar. Befintliga dörrar (med ev. godstypsbehörighet) behålls; nya dörrar är generella. */
export function withDoors(sc: CompiledScenario, n: number): CompiledScenario {
  const count = Math.max(1, Math.round(n));
  const doors: DoorSpec[] = sc.site.doors.slice(0, count);
  const used = new Set(doors.map((d) => d.id));
  let k = 1;
  while (doors.length < count) {
    while (used.has(`D${k}`)) k++;
    used.add(`D${k}`);
    doors.push({ id: `D${k}` });
  }
  return withSite(sc, { doors });
}

/** Generiska dörrar D1..Dn (ignorerar ev. specialisering) – används för backtest mot observerat dörrantal. */
export function withGenericDoors(sc: CompiledScenario, n: number): CompiledScenario {
  const count = Math.max(1, Math.round(n));
  return withSite(sc, { doors: Array.from({ length: count }, (_, i) => ({ id: `D${i + 1}` })) });
}

export function withSite(sc: CompiledScenario, patch: Partial<SiteConfig>): CompiledScenario {
  return { ...sc, site: { ...sc.site, ...patch } };
}

/** Sätt volymfaktor oavsett ankomstmönster. */
export function withVolumeFactor(sc: CompiledScenario, volumeFactor: number): CompiledScenario {
  return { ...sc, arrivals: { ...sc.arrivals, volumeFactor } };
}

/** Slotdesign för scenariot: scenariots egen om det är bokat, annars en standarddesign över öppettiden. */
export function baseSlotDesign(sc: CompiledScenario): SlotDesign {
  if (sc.arrivals.pattern === "booked") return { ...sc.arrivals.slot };
  return {
    lengthMin: DEFAULT_SLOT_LENGTH_MIN,
    capacityPerHour: 1,
    from: sc.site.openFrom,
    to: sc.site.openTo,
    adherence: null,
    toleranceMin: DEFAULT_SLOT_TOLERANCE_MIN,
  };
}

/** ANTAGANDE för slotanalyser när scenariot inte redan är bokat: slotlängd 30 min (vanlig standard i bokningssystem). */
export const DEFAULT_SLOT_LENGTH_MIN = 30;
/** ANTAGANDE: ±15 min räknas som "i tid" när scenariot saknar egen tolerans. */
export const DEFAULT_SLOT_TOLERANCE_MIN = 15;

export function withSlot(sc: CompiledScenario, slot: SlotDesign): CompiledScenario {
  return { ...sc, arrivals: { pattern: "booked", volumeFactor: sc.arrivals.volumeFactor, slot } };
}

/**
 * Förväntat antal ANKOMSTER per dag, dvs. EFTER no-show: timprofilen är kalibrerad på lastbilar som
 * faktiskt kom (inspelade = antal inspelade × faktor). Antal bokningar (inkl. no-show) ger
 * `expectedBookingDemand`.
 */
export function expectedDailyTrucks(model: SiteModel, sc: CompiledScenario, recorded?: readonly RecordedTruck[]): number {
  if (sc.arrivals.pattern === "recorded") return (recorded?.length ?? 0) * sc.arrivals.volumeFactor;
  const total = model.hourlyArrivals.reduce((a, b) => a + b, 0);
  return total * sc.arrivals.volumeFactor;
}

/**
 * Förväntat antal BOKNINGAR per dag, inkl. de som sedan blir no-show: ankomster / (1 − no-show-andel).
 * Samma efterfrågan som motorn drar bokningar ur i bokat läge (för UI: "så många slots behövs").
 */
export function expectedBookingDemand(model: SiteModel, volumeFactor: number): number {
  const arrivals = model.hourlyArrivals.reduce((a, b) => a + b, 0) * volumeFactor;
  return arrivals / Math.max(1e-9, 1 - model.noShowRate);
}

export interface RepOutput {
  metrics: RunMetrics;
  trucks: readonly Truck[];
  result: RunResult;
}

/**
 * Samma slingor som runMonteCarlo (samma seed/rep → samma lastbilar), men ger även tillgång till genererade
 * lastbilar och (valfritt) detaljresultat per repetition.
 */
export function simulateReps(
  model: SiteModel,
  sc: CompiledScenario,
  opts: RunOpts & { detail?: boolean },
  onRep: (out: RepOutput, rep: number) => void,
): RunMetrics[] {
  const seed = opts.seed ?? sc.seed;
  const all: RunMetrics[] = [];
  for (let r = 0; r < opts.reps; r++) {
    const trucks = generateDay(model, sc.arrivals, { seed, rep: r, unloadFactor: sc.unloadFactor, recorded: opts.recorded });
    const result = simulateDay(trucks, sc.site, sc.strategy, sc.cost, { detail: opts.detail ?? false });
    all.push(result.metrics);
    onRep({ metrics: result.metrics, trucks, result }, r);
  }
  return all;
}

export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function assertReps(reps: number): void {
  if (!(Number.isInteger(reps) && reps >= 1)) throw new Error(`reps måste vara ett heltal ≥ 1 (fick ${reps})`);
}

export function finiteOrNull(x: number): number | null {
  return Number.isFinite(x) ? x : null;
}
