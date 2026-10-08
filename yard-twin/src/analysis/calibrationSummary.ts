import type { RecordedDay } from "../data/contract.ts";
import type { SiteModel } from "../engine/model.ts";
import { compileScenario, type ScenarioFile } from "../engine/scenario.ts";
import { formatClock } from "../engine/time.ts";
import { BACKTEST_METRICS, holdoutBacktest } from "./backtest.ts";
import { gradeCalibration } from "./grade.ts";

/**
 * Grindtid i data = LPR-ankomst → incheckning, dvs. den innehåller redan grindkön. För att inte
 * dubbelräkna kö modelleras grinden därför som obegränsat parallell när tider kommer från data
 * (beslut D20). Ett ändligt antal grindfiler är bara meningsfullt med uppmätt ren incheckningstid.
 */
export const UNLIMITED_GATE_LANES = 999;

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
  const metrics: Record<string, { mae: number; wmape: number; relBias: number; coverage: number; n: number }> = {};
  for (const m of BACKTEST_METRICS) {
    const s = ho.outOfSample.metrics[m];
    metrics[m] = { mae: s.mae, wmape: s.wmape ?? NaN, relBias: s.relativeBias ?? NaN, coverage: s.coverage, n: s.n };
  }
  const replay = ho.replay.metrics.avgWait;
  return {
    grade: g.grade,
    warning: g.warning,
    reasons: g.reasons,
    calibrationDays: ho.trainDates.length,
    visits: trainVisits,
    testDays: ho.testDates.length,
    metrics: g.grade === "insufficient" ? {} : metrics,
    /** Kölogiken ensam (verkliga tjänstetider) – visar hur mycket av felet som kommer från tjänstetidsfördelningen. */
    replayAvgWaitWmape: replay.wmape,
    trainRange: [ho.trainDates[0], ho.trainDates[ho.trainDates.length - 1]] as [string, string],
    testRange: [ho.testDates[0], ho.testDates[ho.testDates.length - 1]] as [string, string],
  };
}
