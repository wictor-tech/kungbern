/**
 * Kalibreringsbetyg. Betyget och skälen visas i UI bredvid varje resultat, så att en säljare aldrig
 * kan visa en siffra utan att kunden ser hur väl modellen träffade verkligheten.
 */
import type { BacktestResult } from "./backtest.ts";
import { lt, type LocalizedText } from "./common.ts";
import { fmtNum, fmtPct } from "./i18n-format.ts";

export type CalibrationGrade = "high" | "medium" | "low" | "insufficient";

/**
 * PRODUKTBESLUT – gränser för kalibreringsbetyg (visas i UI).
 *
 * insufficient: för lite data för att ens mäta felet meningsfullt. Då visas inga felsiffror alls.
 *  - < 30 kalibreringsdagar: färre än ~6 veckor fångar inte veckodagsmönster.
 *  - < 100 besök: lossningsfördelningen blir för gles för bootstrap.
 *  - < 5 testdagar: felmåttet blir en anekdot.
 * high: ≥ 90 dagar (ett kvartal), ≥ 500 besök, wMAPE(medelväntan) ≤ 10 %, |relativ bias| ≤ 5 %, täckning ≥ 70 %.
 *   Täckning 70 % (mot nominella 80 % för p10–p90) ger utrymme för dag-till-dag-variation som modellen inte fångar.
 * medium: ≥ 60 dagar, ≥ 300 besök, wMAPE ≤ 20 %.
 * low: allt annat.
 */
export const GRADE_THRESHOLDS = {
  insufficient: { minDays: 30, minVisits: 100, minTestDays: 5 },
  high: { minDays: 90, minVisits: 500, maxWmape: 0.1, maxAbsRelBias: 0.05, minCoverage: 0.7 },
  medium: { minDays: 60, minVisits: 300, maxWmape: 0.2 },
  /** Över denna wMAPE visas alltid en varning, oavsett betyg. */
  warnWmape: 0.2,
} as const;

export interface GradeInput {
  /** Antal dagar som kalibreringen bygger på. */
  calibrationDays: number;
  /** Antal besök (inkluderade efter datakvalitet) i kalibreringen. */
  visits: number;
  /** Holdout-backtest med hela modellen (samplade tjänstetider). */
  outOfSample: BacktestResult;
}

export interface GradeResult {
  grade: CalibrationGrade;
  reasons: LocalizedText[];
  warning: boolean;
  /**
   * Primärt felmått: out-of-sample wMAPE för medelväntan (0–1).
   * null när betyget är "insufficient" (då ska inga felsiffror visas) eller när felet inte går att räkna.
   */
  primaryError: number | null;
}

export function gradeCalibration(input: GradeInput): GradeResult {
  const T = GRADE_THRESHOLDS;
  const { calibrationDays: days, visits } = input;
  const testDays = input.outOfSample.days.length;
  const reasons: LocalizedText[] = [];

  const ins = T.insufficient;
  const insufficient: LocalizedText[] = [];
  if (days < ins.minDays) insufficient.push(lt(`Endast ${days} kalibreringsdagar (minst ${ins.minDays} krävs)`, `Only ${days} calibration days (at least ${ins.minDays} required)`));
  if (visits < ins.minVisits) insufficient.push(lt(`Endast ${visits} besök (minst ${ins.minVisits} krävs)`, `Only ${visits} visits (at least ${ins.minVisits} required)`));
  if (testDays < ins.minTestDays) insufficient.push(lt(`Endast ${testDays} testdagar (minst ${ins.minTestDays} krävs)`, `Only ${testDays} test days (at least ${ins.minTestDays} required)`));
  const st = input.outOfSample.metrics.avgWait;
  const wmape = st.wmape;
  if (insufficient.length > 0 || wmape === null) {
    if (wmape === null && insufficient.length === 0) {
      insufficient.push(lt("Felet kan inte beräknas (ingen verklig väntan i testperioden)", "Error cannot be computed (no actual waiting in the test period)"));
    }
    return { grade: "insufficient", reasons: insufficient, warning: true, primaryError: null };
  }

  const rb = st.relativeBias;
  const sv = (x: number) => fmtPct(x, "sv", 1);
  const en = (x: number) => fmtPct(x, "en", 1);
  const check = (ok: boolean, svText: string, enText: string) => {
    reasons.push(lt(`${ok ? "✓" : "✗"} ${svText}`, `${ok ? "✓" : "✗"} ${enText}`));
    return ok;
  };

  const H = T.high;
  const M = T.medium;
  const daysHigh = days >= H.minDays, visitsHigh = visits >= H.minVisits;
  const daysMed = days >= M.minDays, visitsMed = visits >= M.minVisits;
  check(daysHigh || daysMed, `${days} kalibreringsdagar (hög: ≥ ${H.minDays}, medel: ≥ ${M.minDays})`, `${days} calibration days (high: ≥ ${H.minDays}, medium: ≥ ${M.minDays})`);
  check(visitsHigh || visitsMed, `${fmtNum(visits, "sv")} besök (hög: ≥ ${H.minVisits}, medel: ≥ ${M.minVisits})`, `${fmtNum(visits, "en")} visits (high: ≥ ${H.minVisits}, medium: ≥ ${M.minVisits})`);
  const wHigh = wmape <= H.maxWmape, wMed = wmape <= M.maxWmape;
  check(wMed, `Fel i medelväntan (wMAPE, ${testDays} testdagar): ${sv(wmape)} (hög: ≤ ${sv(H.maxWmape)}, medel: ≤ ${sv(M.maxWmape)})`, `Average-wait error (wMAPE, ${testDays} test days): ${en(wmape)} (high: ≤ ${en(H.maxWmape)}, medium: ≤ ${en(M.maxWmape)})`);
  const biasOk = rb !== null && Math.abs(rb) <= H.maxAbsRelBias;
  if (rb !== null) {
    const dirSv = rb > 0 ? "överskattar" : "underskattar";
    const dirEn = rb > 0 ? "overestimates" : "underestimates";
    check(biasOk, `Systematiskt fel: modellen ${dirSv} väntan med ${sv(Math.abs(rb))} (hög: ≤ ${sv(H.maxAbsRelBias)})`, `Systematic error: the model ${dirEn} waiting by ${en(Math.abs(rb))} (high: ≤ ${en(H.maxAbsRelBias)})`);
  }
  const covOk = st.coverage >= H.minCoverage;
  check(covOk, `${sv(st.coverage)} av testdagarna låg inom modellens p10–p90 (hög: ≥ ${sv(H.minCoverage)})`, `${en(st.coverage)} of test days fell within the model's p10–p90 (high: ≥ ${en(H.minCoverage)})`);

  let grade: CalibrationGrade;
  if (daysHigh && visitsHigh && wHigh && biasOk && covOk) grade = "high";
  else if (daysMed && visitsMed && wMed) grade = "medium";
  else grade = "low";

  const thin = !daysMed || !visitsMed;
  const warning = grade === "low" || wmape > T.warnWmape || thin;
  return { grade, reasons, warning, primaryError: wmape };
}
