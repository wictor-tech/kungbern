/**
 * ROI: besparing per dag/månad/år mellan två scenarier ("utan" och "med").
 * Varje repetition körs med samma lastbilar i båda scenarierna (parvis jämförelse), så intervallet speglar
 * skillnaden och inte bruset i varje scenario för sig. ROI visas aldrig som en ensam punkt – alltid med intervall.
 */
import type { SiteModel } from "../engine/model.ts";
import { runMonteCarlo } from "../engine/montecarlo.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import { summarize, type Interval } from "../engine/stats.ts";
import { assertReps, lt, type LocalizedText, type RunOpts } from "./common.ts";

export const DEFAULT_ROI_REPS = 200;
/** Driftmånader per år. */
export const MONTHS_PER_YEAR = 12;

export interface RoiInputs {
  /** Kostnad per timme detention (över fri tid). Ersätter scenariots värde i båda scenarierna. */
  detentionCostPerHour: number;
  /**
   * Personalkostnad per timme övertid för HELA teamet som måste stanna kvar (inte per dörr eller person).
   * Övertid = minuter från stängning tills sista lossningen är klar (RunMetrics.overtimeMin).
   */
  staffCostPerHour: number;
  /** Avgift från transportör per lastbil som överskrider fri tid (0 om avtal saknas). */
  carrierFeePerTruckOverLimit: number;
  operatingDaysPerMonth: number;
  currency: "SEK" | "EUR";
  /** Varifrån siffrorna kommer (t.ex. "Kundens ekonomichef, mejl 2026-09-12"). Obligatoriskt. */
  source: string;
}

export class RoiInputError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`ROI kan inte beräknas – följande indata saknas eller är ogiltiga: ${missing.join(", ")}`);
    this.name = "RoiInputError";
    this.missing = missing;
  }
}

export interface RoiBreakdown {
  detention: Interval;
  overtimeStaff: Interval;
  carrierFees: Interval;
}

export interface RoiAssumption {
  key: string;
  label: LocalizedText;
  value: number | string;
  unit: string;
  source: string;
}

export interface RoiResult {
  currency: "SEK" | "EUR";
  /** Besparing per driftdag (positiv = "med" är billigare). */
  daily: Interval;
  monthly: Interval;
  yearly: Interval;
  /** Besparing per dag per komponent. */
  breakdown: RoiBreakdown;
  assumptions: RoiAssumption[];
  /** Extra förbehåll (t.ex. olika fri tid i scenarierna). */
  caveats: LocalizedText[];
  reps: number;
  seed: string;
}

export interface RoiParams extends Partial<RunOpts> {
  model: SiteModel;
  without: CompiledScenario;
  with: CompiledScenario;
  inputs: Partial<RoiInputs>;
}

/** Kontrollera att alla indata finns – inga dolda standardvärden. Returnerar listan på saknade fält. */
export function missingRoiInputs(inputs: Partial<RoiInputs>): string[] {
  const missing: string[] = [];
  const nonNeg = (k: keyof RoiInputs) => {
    const v = inputs[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) missing.push(k);
  };
  nonNeg("detentionCostPerHour");
  nonNeg("staffCostPerHour");
  nonNeg("carrierFeePerTruckOverLimit");
  const d = inputs.operatingDaysPerMonth;
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0 || d > 31) missing.push("operatingDaysPerMonth");
  if (inputs.currency !== "SEK" && inputs.currency !== "EUR") missing.push("currency");
  if (typeof inputs.source !== "string" || inputs.source.trim() === "") missing.push("source");
  return missing;
}

export function computeRoi(p: RoiParams): RoiResult {
  const missing = missingRoiInputs(p.inputs);
  if (missing.length) throw new RoiInputError(missing);
  const inputs = p.inputs as RoiInputs;
  const reps = p.reps ?? DEFAULT_ROI_REPS;
  assertReps(reps);
  const seed = p.seed ?? p.without.seed;
  const withCost = (sc: CompiledScenario): CompiledScenario => ({ ...sc, cost: { ...sc.cost, currency: inputs.currency, detentionCostPerHour: inputs.detentionCostPerHour } });
  const run = (sc: CompiledScenario) => runMonteCarlo(p.model, withCost(sc), { reps, seed, recorded: p.recorded }).perRep;
  const a = run(p.without);
  const b = run(p.with);

  const det: number[] = [], ot: number[] = [], fee: number[] = [], total: number[] = [];
  for (let r = 0; r < reps; r++) {
    const x = a[r], y = b[r];
    const dDet = x.detentionCost - y.detentionCost;
    const dOt = ((x.overtimeMin - y.overtimeMin) / 60) * inputs.staffCostPerHour;
    const dFee = (x.overDetention - y.overDetention) * inputs.carrierFeePerTruckOverLimit;
    det.push(dDet);
    ot.push(dOt);
    fee.push(dFee);
    total.push(dDet + dOt + dFee);
  }
  const daily = summarize(total);
  // Månad = dag × driftdagar. Konservativt: vi antar att dagarna samvarierar fullt ut (ingen utjämning
  // mellan dagar), så intervallet blir hellre för brett än för smalt.
  const monthly = scale(daily, inputs.operatingDaysPerMonth);
  const yearly = scale(monthly, MONTHS_PER_YEAR);

  const caveats: LocalizedText[] = [];
  if (p.without.cost.detentionFreeMin !== p.with.cost.detentionFreeMin) {
    caveats.push(lt("Scenarierna har olika fri tid före detention – en del av besparingen kommer från avtalet, inte från flödet.", "The scenarios have different free time before detention – part of the saving comes from the contract, not the flow."));
  }
  if (inputs.carrierFeePerTruckOverLimit === 0) {
    caveats.push(lt("Ingen transportöravgift angiven (0) – den komponenten bidrar inte.", "No carrier fee given (0) – that component does not contribute."));
  }

  const src = inputs.source;
  const assumptions: RoiAssumption[] = [
    { key: "detentionCostPerHour", label: lt("Detentionkostnad per timme", "Detention cost per hour"), value: inputs.detentionCostPerHour, unit: `${inputs.currency}/h`, source: src },
    { key: "staffCostPerHour", label: lt("Personalkostnad per övertidstimme (hela teamet)", "Staff cost per overtime hour (whole team)"), value: inputs.staffCostPerHour, unit: `${inputs.currency}/h`, source: src },
    { key: "carrierFeePerTruckOverLimit", label: lt("Transportöravgift per lastbil över fri tid", "Carrier fee per truck over free time"), value: inputs.carrierFeePerTruckOverLimit, unit: inputs.currency, source: src },
    { key: "operatingDaysPerMonth", label: lt("Driftdagar per månad", "Operating days per month"), value: inputs.operatingDaysPerMonth, unit: "d", source: src },
    { key: "monthsPerYear", label: lt("Månader per år", "Months per year"), value: MONTHS_PER_YEAR, unit: "", source: "Definition" },
    { key: "detentionFreeMin.without", label: lt(`Fri tid före detention (${p.without.file.name})`, `Free time before detention (${p.without.file.name})`), value: p.without.cost.detentionFreeMin, unit: "min", source: p.without.file.costs.source },
    { key: "detentionFreeMin.with", label: lt(`Fri tid före detention (${p.with.file.name})`, `Free time before detention (${p.with.file.name})`), value: p.with.cost.detentionFreeMin, unit: "min", source: p.with.file.costs.source },
    { key: "reps", label: lt("Simulerade dagar (parvisa)", "Simulated days (paired)"), value: reps, unit: "", source: `seed ${seed}` },
  ];
  return {
    currency: inputs.currency,
    daily,
    monthly,
    yearly,
    breakdown: { detention: summarize(det), overtimeStaff: summarize(ot), carrierFees: summarize(fee) },
    assumptions,
    caveats,
    reps,
    seed,
  };
}

function scale(i: Interval, k: number): Interval {
  return { median: i.median * k, p10: i.p10 * k, p90: i.p90 * k, mean: i.mean * k };
}
