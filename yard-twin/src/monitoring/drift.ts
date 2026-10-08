import { backtestDays } from "../analysis/backtest.ts";
import { UNLIMITED_GATE_LANES } from "../analysis/calibrationSummary.ts";
import type { RecordedDay } from "../data/contract.ts";
import type { SiteModel } from "../engine/model.ts";
import { compileScenario } from "../engine/scenario.ts";
import { formatClock } from "../engine/time.ts";

/**
 * Driftövervakning: modellen larmar när den slutar stämma mot verkligheten.
 * Kör den kalibrerade modellen på de senaste dagarna (som inte ingick i kalibreringen) och jämför felet
 * med felet vid kalibreringstillfället.
 */
export const DRIFT_RULES = {
  /** Larm om wMAPE för medelväntan överstiger detta oavsett utgångsläge (samma gräns som varning i betyget). */
  absoluteWmape: 0.2,
  /** Larm om felet växt mer än så här relativt kalibreringens fel. */
  relativeGrowth: 1.5,
  /** Larm om systematiskt fel (Σe/Σa) blir större än så här. */
  relativeBias: 0.15,
  /** Varning om verkligheten ligger inom p10–p90 färre dagar än så här. */
  minCoverage: 0.5,
  /** Minsta antal nya dagar för att alls bedöma drift. */
  minDays: 5,
} as const;

export type DriftStatus = "ok" | "warn" | "alert" | "insufficient";

export interface DriftReport {
  status: DriftStatus;
  days: number;
  wmape: number | null;
  baselineWmape: number | null;
  relativeBias: number | null;
  coverage: number | null;
  reasons: { sv: string; en: string }[];
}

export function checkDrift(input: {
  model: SiteModel;
  siteId: string;
  recentDays: readonly RecordedDay[];
  baselineWmape: number | null;
  openFrom: number;
  openTo: number;
  reps?: number;
}): DriftReport {
  const days = input.recentDays.length;
  if (days < DRIFT_RULES.minDays) {
    return { status: "insufficient", days, wmape: null, baselineWmape: input.baselineWmape, relativeBias: null, coverage: null, reasons: [{ sv: `För få nya dagar (${days} < ${DRIFT_RULES.minDays}) för att bedöma drift.`, en: `Too few new days (${days} < ${DRIFT_RULES.minDays}) to assess drift.` }] };
  }
  const sc = compileScenario({
    schemaVersion: 1,
    id: "drift",
    name: "Drift",
    siteId: input.siteId,
    date: "drift",
    arrivals: { pattern: "recorded", volumeFactor: 1, serviceTimes: "sampled" },
    site: { doors: 1, gateLanes: UNLIMITED_GATE_LANES, parkingSpaces: null, open: formatClock(input.openFrom), close: formatClock(input.openTo), allowOvertime: true },
    strategy: { kind: "fcfs", onTimeToleranceMin: 15 },
    costs: { currency: "SEK", detentionFreeMin: 0, detentionCostPerHour: 0, source: "drift (kostnader påverkar inte felmåtten)" },
    monteCarlo: { reps: input.reps ?? 30, seed: `drift|${input.siteId}` },
  });
  const bt = backtestDays({ days: input.recentDays, model: input.model, scenario: sc, serviceTimes: "sampled", reps: input.reps ?? 30 });
  const m = bt.metrics.avgWait;
  const reasons: { sv: string; en: string }[] = [];
  let status: DriftStatus = "ok";
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  if (m.wmape !== null && m.wmape > DRIFT_RULES.absoluteWmape) {
    status = "alert";
    reasons.push({ sv: `Felet i medelväntan är ${pct(m.wmape)} (gräns ${pct(DRIFT_RULES.absoluteWmape)}).`, en: `Average-wait error is ${pct(m.wmape)} (limit ${pct(DRIFT_RULES.absoluteWmape)}).` });
  }
  if (m.wmape !== null && input.baselineWmape !== null && input.baselineWmape > 0 && m.wmape > input.baselineWmape * DRIFT_RULES.relativeGrowth) {
    status = "alert";
    reasons.push({ sv: `Felet har ökat från ${pct(input.baselineWmape)} vid kalibrering till ${pct(m.wmape)}.`, en: `Error grew from ${pct(input.baselineWmape)} at calibration to ${pct(m.wmape)}.` });
  }
  if (m.relativeBias !== null && Math.abs(m.relativeBias) > DRIFT_RULES.relativeBias) {
    status = "alert";
    reasons.push({ sv: `Modellen ${m.relativeBias < 0 ? "underskattar" : "överskattar"} väntan systematiskt med ${pct(Math.abs(m.relativeBias))}.`, en: `The model systematically ${m.relativeBias < 0 ? "under" : "over"}estimates waiting by ${pct(Math.abs(m.relativeBias))}.` });
  }
  if (m.coverage < DRIFT_RULES.minCoverage) {
    if (status === "ok") status = "warn";
    reasons.push({ sv: `Verkligheten låg inom modellens intervall bara ${pct(m.coverage)} av dagarna.`, en: `Reality fell within the model's interval on only ${pct(m.coverage)} of days.` });
  }
  if (status === "ok") reasons.push({ sv: "Modellen stämmer fortfarande med verkligheten.", en: "The model still matches reality." });
  return { status, days, wmape: m.wmape, baselineWmape: input.baselineWmape, relativeBias: m.relativeBias, coverage: m.coverage, reasons };
}
