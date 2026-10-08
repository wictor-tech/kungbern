/**
 * Backtest: kör modellen på inspelade dagar och jämför med vad som faktiskt hände.
 * Felet visas öppet i UI – det är hela poängen med en kalibrerad tvilling.
 */
import type { SiteModel } from "../engine/model.ts";
import { runMonteCarlo } from "../engine/montecarlo.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import type { Interval } from "../engine/stats.ts";
import type { RecordedDay } from "../data/contract.ts";
import { assertReps, lt, nowMs, withGenericDoors, type LocalizedText } from "./common.ts";

export const BACKTEST_METRICS = ["avgWait", "p90Wait", "maxQueue", "doorUtilization"] as const;
export type BacktestMetric = (typeof BACKTEST_METRICS)[number];

/**
 * Minsta verkliga värde för att en dag ska ingå i MAPE för respektive metrik. Procentfel mot nästan noll
 * (t.ex. 0,2 min väntan) exploderar och säger inget – därför filtreras de bort och antalet som används redovisas.
 * Väntetider: 1 min. Kö: 1 lastbil. Dörrbeläggning: 1 procentenhet.
 */
export const MAPE_MIN_ACTUAL: Record<BacktestMetric, number> = {
  avgWait: 1,
  p90Wait: 1,
  maxQueue: 1,
  doorUtilization: 0.01,
};

/** Standardantal repetitioner per dag i backtest (dagar × reps körningar – hålls lågt för Web Worker). */
export const DEFAULT_BACKTEST_REPS = 100;

/** Andel dagar (kronologiskt först) som används för kalibrering i holdout-testet. */
export const DEFAULT_TRAIN_SHARE = 0.7;

/** Numerisk tolerans när vi avgör om verkligt värde ligger i [p10, p90] (degenererade intervall vid ren replay). */
const COVERAGE_EPS = 1e-6;

export interface BacktestDayRow {
  date: string;
  trucks: number;
  doors: number;
  actual: Record<BacktestMetric, number>;
  simulated: Record<BacktestMetric, Interval>;
  /** Simulerad median − verkligt värde. */
  error: Record<BacktestMetric, number>;
  inInterval: Record<BacktestMetric, boolean>;
}

export interface MetricErrorStats {
  /** Antal dagar i jämförelsen. */
  n: number;
  /** Medelabsolutfel (metrikens enhet). */
  mae: number;
  /** Medel av |e|/a över dagar där a ≥ MAPE_MIN_ACTUAL. null om inga sådana dagar. */
  mape: number | null;
  nMape: number;
  /** Σ|e| / Σ|a| – robust mot små dagar. null om Σ|a| = 0. */
  wmape: number | null;
  /** Medel av signerat fel (positivt = modellen överskattar). */
  bias: number;
  /** Σe / Σa. null om Σa = 0. */
  relativeBias: number | null;
  /** Andel dagar där verkligt värde ligger inom simulerat p10–p90. */
  coverage: number;
}

export interface BacktestResult {
  serviceTimes: "recorded" | "sampled";
  reps: number;
  days: BacktestDayRow[];
  metrics: Record<BacktestMetric, MetricErrorStats>;
  skipped: { date: string; reason: LocalizedText }[];
  elapsedMs: number;
}

export interface BacktestInput {
  days: readonly RecordedDay[];
  model: SiteModel;
  scenario: CompiledScenario;
  serviceTimes: "recorded" | "sampled";
  reps?: number;
}

/**
 * Kör varje inspelad dag genom modellen med de verkliga ankomsterna och dagens observerade dörrantal.
 * serviceTimes "recorded": verkliga lossnings-/grind-/papperstider (testar kölogiken).
 * serviceTimes "sampled": tider dras ur modellens fördelningar (testar hela modellen).
 *
 * Med "recorded" och fullständiga tider är körningen deterministisk – då räcker en repetition
 * (intervallet blir en punkt, och täckningen mäter då exakt träff).
 */
export function backtestDays(input: BacktestInput): BacktestResult {
  const reps = input.reps ?? DEFAULT_BACKTEST_REPS;
  assertReps(reps);
  const t0 = nowMs();
  const rows: BacktestDayRow[] = [];
  const skipped: BacktestResult["skipped"] = [];
  for (const day of input.days) {
    const reason = skipReason(day);
    if (reason) {
      skipped.push({ date: day.date, reason });
      continue;
    }
    const fullyRecorded =
      input.serviceTimes === "recorded" && day.trucks.every((t) => t.unloadMin !== null && t.gateMin !== null && t.paperMin !== null);
    const sc: CompiledScenario = {
      ...withGenericDoors(input.scenario, day.doorsObserved),
      arrivals: { pattern: "recorded", volumeFactor: 1, serviceTimes: input.serviceTimes },
      seed: `${input.scenario.seed}|backtest|${day.date}`,
    };
    const mc = runMonteCarlo(input.model, sc, { reps: fullyRecorded ? 1 : reps, recorded: day.trucks });
    const actual = {} as Record<BacktestMetric, number>;
    const simulated = {} as Record<BacktestMetric, Interval>;
    const error = {} as Record<BacktestMetric, number>;
    const inInterval = {} as Record<BacktestMetric, boolean>;
    for (const m of BACKTEST_METRICS) {
      const a = day.actual[m];
      const s = mc.summary[m];
      actual[m] = a;
      simulated[m] = s;
      error[m] = s.median - a;
      const eps = COVERAGE_EPS * Math.max(1, Math.abs(a));
      inInterval[m] = a >= s.p10 - eps && a <= s.p90 + eps;
    }
    rows.push({ date: day.date, trucks: day.trucks.length, doors: day.doorsObserved, actual, simulated, error, inInterval });
  }
  const metrics = {} as Record<BacktestMetric, MetricErrorStats>;
  for (const m of BACKTEST_METRICS) metrics[m] = errorStats(rows, m);
  return { serviceTimes: input.serviceTimes, reps, days: rows, metrics, skipped, elapsedMs: nowMs() - t0 };
}

function skipReason(day: RecordedDay): LocalizedText | null {
  if (day.trucks.length === 0) return lt("Inga lastbilar den dagen", "No trucks that day");
  if (!(day.doorsObserved >= 1)) return lt("Okänt antal dörrar", "Unknown number of doors");
  for (const m of BACKTEST_METRICS) {
    if (!Number.isFinite(day.actual[m])) return lt(`Verkligt värde saknas för ${m}`, `Actual value missing for ${m}`);
  }
  return null;
}

export function errorStats(rows: readonly BacktestDayRow[], m: BacktestMetric): MetricErrorStats {
  const n = rows.length;
  let sumAbsE = 0, sumAbsA = 0, sumE = 0, sumA = 0, mapeSum = 0, nMape = 0, covered = 0;
  for (const r of rows) {
    const e = r.error[m];
    const a = r.actual[m];
    sumAbsE += Math.abs(e);
    sumAbsA += Math.abs(a);
    sumE += e;
    sumA += a;
    if (a >= MAPE_MIN_ACTUAL[m]) {
      mapeSum += Math.abs(e) / a;
      nMape++;
    }
    if (r.inInterval[m]) covered++;
  }
  return {
    n,
    mae: n > 0 ? sumAbsE / n : 0,
    mape: nMape > 0 ? mapeSum / nMape : null,
    nMape,
    wmape: sumAbsA > 0 ? sumAbsE / sumAbsA : null,
    bias: n > 0 ? sumE / n : 0,
    relativeBias: sumA !== 0 ? sumE / sumA : null,
    coverage: n > 0 ? covered / n : 0,
  };
}

export interface HoldoutInput {
  days: readonly RecordedDay[];
  /** Kalibrering injiceras (byggs i src/data) – får bara se träningsdagarna. */
  calibrate: (trainDays: RecordedDay[]) => SiteModel;
  scenario: CompiledScenario;
  trainShare?: number;
  reps?: number;
}

export interface HoldoutResult {
  trainDates: string[];
  testDates: string[];
  model: SiteModel;
  /** Hela modellen (samplade tider) på träningsdagarna. */
  inSample: BacktestResult;
  /** Hela modellen (samplade tider) på testdagarna – detta är siffran som betygsätts. */
  outOfSample: BacktestResult;
  /** Testdagarna med verkliga tjänstetider: testar enbart kölogiken. */
  replay: BacktestResult;
}

/**
 * Kronologisk holdout: de första `trainShare` av datumen kalibrerar, resten testar.
 * Kronologisk och inte slumpmässig delning, eftersom en slumpmässig delning läcker säsong och trend:
 * modellen skulle då ha sett grannar till testdagarna (samma vecka, samma kampanj) och se bättre ut än den är.
 * En kund använder tvillingen framåt i tiden – testet ska efterlikna det.
 */
export function holdoutBacktest(input: HoldoutInput): HoldoutResult {
  const share = input.trainShare ?? DEFAULT_TRAIN_SHARE;
  if (!(share > 0 && share < 1)) throw new Error("trainShare måste ligga i (0, 1)");
  const sorted = [...input.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const dates = [...new Set(sorted.map((d) => d.date))];
  if (dates.length < 2) throw new Error("Holdout kräver minst två olika datum");
  const nTrain = Math.min(dates.length - 1, Math.max(1, Math.floor(dates.length * share)));
  const trainDates = dates.slice(0, nTrain);
  const testDates = dates.slice(nTrain);
  const trainSet = new Set(trainDates);
  const train = sorted.filter((d) => trainSet.has(d.date));
  const test = sorted.filter((d) => !trainSet.has(d.date));
  const model = input.calibrate(train);
  const common = { model, scenario: input.scenario, reps: input.reps };
  return {
    trainDates,
    testDates,
    model,
    inSample: backtestDays({ ...common, days: train, serviceTimes: "sampled" }),
    outOfSample: backtestDays({ ...common, days: test, serviceTimes: "sampled" }),
    replay: backtestDays({ ...common, days: test, serviceTimes: "recorded" }),
  };
}
