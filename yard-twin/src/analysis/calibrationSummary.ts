import type { RecordedDay } from "../data/contract.ts";
import type { SiteModel } from "../engine/model.ts";
import { compileScenario, type ScenarioFile } from "../engine/scenario.ts";
import { formatClock } from "../engine/time.ts";
import { runMonteCarlo } from "../engine/montecarlo.ts";
import type { Interval } from "../engine/stats.ts";
import { BACKTEST_METRICS, errorStats, holdoutBacktest, type BacktestDayRow, type BacktestMetric } from "./backtest.ts";
import { withGenericDoors } from "./common.ts";
import { gradeCalibration } from "./grade.ts";

/**
 * Grindtid i data = LPR-ankomst → incheckning, dvs. den innehåller redan grindkön. För att inte
 * dubbelräkna kö modelleras grinden därför som obegränsat parallell när tider kommer från data
 * (beslut D20). Ett ändligt antal grindfiler är bara meningsfullt med uppmätt ren incheckningstid.
 */
export const UNLIMITED_GATE_LANES = 999;

/**
 * Gränser för backtestet med GENERERADE ankomster (det som What if, jämförelse och ROI bygger på).
 * Överskrids de visas en varning även om replay-betyget är bra.
 */
export const GENERATED_ARRIVALS_LIMITS = { wmape: 0.2, relBias: 0.15 } as const;

export interface CalibrationSummaryInput {
  siteId: string;
  days: readonly RecordedDay[];
  openFrom: number;
  openTo: number;
  /** Kalibrera på träningsdagarna (injiceras från datalagret). */
  calibrate: (trainDays: RecordedDay[]) => { model: SiteModel; visits: number };
  reps?: number;
}

/** Kör hold-out-backtest och betygsätter kalibreringen. Resultatet följer med datasetet till UI/API. */
export function buildCalibrationSummary(input: CalibrationSummaryInput) {
  const file: ScenarioFile = {
    schemaVersion: 1,
    id: "backtest",
    name: "Backtest",
    date: "backtest-alla-dagar",
    siteId: input.siteId,
    arrivals: { pattern: "recorded", volumeFactor: 1, serviceTimes: "sampled" },
    site: { doors: 1, gateLanes: UNLIMITED_GATE_LANES, parkingSpaces: null, open: formatClock(input.openFrom), close: formatClock(input.openTo), allowOvertime: true },
    strategy: { kind: "fcfs", onTimeToleranceMin: 15 },
    costs: { currency: "SEK", detentionFreeMin: 0, detentionCostPerHour: 0, source: "backtest (kostnader påverkar inte felmåtten)" },
    monteCarlo: { reps: input.reps ?? 30, seed: `backtest|${input.siteId}` },
  };
  let trainVisits = 0;
  const ho = holdoutBacktest({
    days: input.days,
    calibrate: (train) => {
      const r = input.calibrate(train);
      trainVisits = r.visits;
      return r.model;
    },
    scenario: compileScenario(file),
    reps: input.reps ?? 30,
  });
  const g = gradeCalibration({ calibrationDays: ho.trainDates.length, visits: trainVisits, outOfSample: ho.outOfSample });

  // Backtest 2: genererade (Poisson) ankomster enligt den kalibrerade timprofilen, skalade till dagens
  // faktiska volym. Testar ankomstmodellen som What if/ROI använder – inte bara kölogiken.
  const sc = compileScenario(file);
  const expected = ho.model.hourlyArrivals.reduce((a, b) => a + b, 0);
  const testSet = new Set(ho.testDates);
  const rows: BacktestDayRow[] = [];
  for (const day of input.days) {
    if (!testSet.has(day.date) || !(day.doorsObserved >= 1) || expected <= 0) continue;
    // Volymen skalas på ALLA fysiska bilar (inkl. skuggbilar) så att dörrarna belastas som i verkligheten;
    // felmåtten jämförs mot verkliga nyckeltal för fullständigt mätta besök (liten, konservativ skillnad).
    const measured = day.trucks.filter((t) => !t.shadow).length;
    if (measured === 0) continue;
    const mc = runMonteCarlo(ho.model, { ...withGenericDoors(sc, day.doorsObserved), arrivals: { pattern: "poisson", volumeFactor: day.trucks.length / expected }, seed: `generated|${input.siteId}|${day.date}` }, { reps: input.reps ?? 30 });
    const actual = {} as Record<BacktestMetric, number>;
    const simulated = {} as Record<BacktestMetric, Interval>;
    const error = {} as Record<BacktestMetric, number>;
    const inInterval = {} as Record<BacktestMetric, boolean>;
    for (const m of BACKTEST_METRICS) {
      actual[m] = day.actual[m];
      simulated[m] = mc.summary[m];
      error[m] = mc.summary[m].median - day.actual[m];
      inInterval[m] = day.actual[m] >= mc.summary[m].p10 && day.actual[m] <= mc.summary[m].p90;
    }
    rows.push({ date: day.date, trucks: measured, doors: day.doorsObserved, actual, simulated, error, inInterval });
  }
  const gen = errorStats(rows, "avgWait");
  const reasons = [...g.reasons];
  let warning = g.warning;
  if (g.grade !== "insufficient" && rows.length > 0) {
    const w = gen.wmape ?? NaN;
    const b = gen.relativeBias ?? NaN;
    const bad = !(w <= GENERATED_ARRIVALS_LIMITS.wmape) || !(Math.abs(b) <= GENERATED_ARRIVALS_LIMITS.relBias);
    if (bad) warning = true;
    const pc = (x: number) => `${Math.round(x * 100)} %`;
    reasons.push({
      sv: `${bad ? "✗" : "✓"} Med genererade ankomster (What if, jämförelse, ROI): fel ${pc(w)}, systematiskt ${b < 0 ? "underskattat" : "överskattat"} ${pc(Math.abs(b))} (gräns ${pc(GENERATED_ARRIVALS_LIMITS.wmape)} / ${pc(GENERATED_ARRIVALS_LIMITS.relBias)})`,
      en: `${bad ? "✗" : "✓"} With generated arrivals (What if, comparison, ROI): error ${pc(w)}, systematically ${b < 0 ? "under" : "over"}estimated by ${pc(Math.abs(b))} (limit ${pc(GENERATED_ARRIVALS_LIMITS.wmape)} / ${pc(GENERATED_ARRIVALS_LIMITS.relBias)})`,
    });
  }
  const metrics: Record<string, { mae: number; wmape: number; relBias: number; coverage: number; n: number }> = {};
  for (const m of BACKTEST_METRICS) {
    const s = ho.outOfSample.metrics[m];
    metrics[m] = { mae: s.mae, wmape: s.wmape ?? NaN, relBias: s.relativeBias ?? NaN, coverage: s.coverage, n: s.n };
  }
  const replay = ho.replay.metrics.avgWait;
  return {
    grade: g.grade,
    warning,
    reasons,
    calibrationDays: ho.trainDates.length,
    visits: trainVisits,
    testDays: ho.testDates.length,
    metrics: g.grade === "insufficient" ? {} : metrics,
    /** Kölogiken ensam (verkliga tjänstetider) – visar hur mycket av felet som kommer från tjänstetidsfördelningen. */
    replayAvgWaitWmape: replay.wmape,
    /** Fel i medelväntan när ankomsterna genereras (Poisson enligt profil) i stället för att spelas upp. */
    generatedArrivals: g.grade === "insufficient" ? null : { wmape: gen.wmape, relBias: gen.relativeBias, coverage: gen.coverage, n: gen.n },
    trainRange: [ho.trainDates[0], ho.trainDates[ho.trainDates.length - 1]] as [string, string],
    testRange: [ho.testDates[0], ho.testDates[ho.testDates.length - 1]] as [string, string],
  };
}
