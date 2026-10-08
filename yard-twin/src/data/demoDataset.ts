import type { SiteModel } from "../engine/model.ts";
import { formatClock } from "../engine/time.ts";
import { DEFAULT_QUALITY_RULES, type RecordedDay } from "./contract.ts";
import type { CalibrationStats } from "./calibrate.ts";
import { assertNoPII, buildCarrierRelabeling, buildGoodsRelabeling, toDemoDays, toDemoModel, toDemoStats } from "./anonymize.ts";
import { PIPELINE_VERSION, runPipeline } from "./pipeline.ts";
import { buildCalibrationSummary } from "../analysis/calibrationSummary.ts";
import { calibrateSite } from "./calibrate.ts";
import { DEMO_SITE_TRUTH, generateSyntheticVisits, type SyntheticSiteTruth } from "./synthetic.ts";

/** ANTAGANDE: demodatasetets period och seed. Perioden korsar sommartidsomställningen 2026-03-29. */
export const DEMO_SEED = "demo-v1";
export const DEMO_START_DATE = "2026-01-05";
export const DEMO_DAYS = 150;
export const DEMO_TZ = "Europe/Stockholm";
/** Decimaler för minutvärden i dagar och urval (0,1 min = 6 s) – håller filstorleken nere. */
export const DEMO_MINUTE_DECIMALS = 1;
/** Decimaler för övriga tal (andelar, medel, kvantiler). */
export const DEMO_DECIMALS = 4;

export interface DemoDataset {
  kind: "demo";
  generatedBy: string;
  note: string;
  pipelineVersion: string;
  site: { siteId: "demo"; label: string; tz: string; open: string; close: string; doors: number };
  profiles: Record<string, SiteModel>;
  days: RecordedDay[];
  quality: {
    totalVisits: number;
    includedVisits: number;
    excludedByReason: Record<string, number>;
    flaggedByReason: Record<string, number>;
    firstDate: string | null;
    lastDate: string | null;
    distinctDays: number;
    gaps: { from: string; to: string; missingDays: number }[];
    suspectedManualDays: { date: string; roundShare: number; timestamps: number }[];
    dstDays: string[];
  };
  stats: Record<string, CalibrationStats>;
  calibration: ReturnType<typeof buildCalibrationSummary>;
  truthForValidation: SyntheticSiteTruth;
}

/** Avrunda alla tal rekursivt (Infinity/NaN lämnas, de serialiseras ändå som null). */
function roundDeep<T>(v: T, decimals: number): T {
  const f = 10 ** decimals;
  const walk = (x: unknown): unknown => {
    if (typeof x === "number") return Number.isFinite(x) ? Math.round(x * f) / f : x;
    if (Array.isArray(x)) return x.map(walk);
    if (x !== null && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  return walk(v) as T;
}

/**
 * Bygger demodatasetet: syntetiska besök → pipeline → anonymisering → PII-kontroll.
 * Deterministiskt givet seed; inga väggklockstider.
 */
export function buildDemoDataset(seed: string = DEMO_SEED, truth: SyntheticSiteTruth = DEMO_SITE_TRUTH): DemoDataset {
  const rules = DEFAULT_QUALITY_RULES;
  const visits = generateSyntheticVisits(truth, { tenantId: "demo-tenant", siteId: "demo-site", tz: DEMO_TZ, startDate: DEMO_START_DATE, days: DEMO_DAYS, seed });
  const res = runPipeline(visits, { tenantId: "demo-tenant", siteId: "demo-site", rules, openFrom: truth.openFrom, openTo: truth.openTo, label: truth.label });

  const all = res.profiles.all;
  const carrierLabels = buildCarrierRelabeling(all.unloadSamples.map((s) => s.carrier), rules.kAnonymity);
  const goodsLabels = buildGoodsRelabeling(all.unloadSamples.map((s) => s.goodsType), rules.kAnonymity);
  const profiles: Record<string, SiteModel> = {};
  const stats: Record<string, CalibrationStats> = {};
  for (const k of Object.keys(res.profiles)) {
    profiles[k] = toDemoModel(res.profiles[k], rules, { label: truth.label, carrierLabels });
    stats[k] = toDemoStats(res.stats[k], carrierLabels, goodsLabels);
  }
  const q = res.quality;
  // Hold-out-backtest på de icke-anonymiserade (men syntetiska) dagarna; bara felmått lämnar steget.
  const calibration = buildCalibrationSummary({
    siteId: "demo",
    days: res.days,
    openFrom: truth.openFrom,
    openTo: truth.openTo,
    calibrate: (train) => {
      const dates = new Set(train.map((d) => d.date));
      const r = calibrateSite(res.derived, { siteId: "demo-site", label: truth.label, dayType: "all", dates, rules });
      return { model: r.model, visits: res.derived.filter((d) => d.included && dates.has(d.serviceDate)).length };
    },
  });
  const ds: DemoDataset = {
    kind: "demo",
    generatedBy: `src/data/demoDataset.ts buildDemoDataset("${seed}")`,
    note: "Syntetisk demosajt – inga kunddata",
    pipelineVersion: PIPELINE_VERSION,
    site: { siteId: "demo", label: truth.label, tz: DEMO_TZ, open: formatClock(truth.openFrom), close: formatClock(truth.openTo), doors: truth.doors },
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([k, m]) => [
        k,
        {
          ...m,
          unloadSamples: roundDeep(m.unloadSamples, DEMO_MINUTE_DECIMALS),
          gateSamples: roundDeep(m.gateSamples, DEMO_MINUTE_DECIMALS),
          paperSamples: roundDeep(m.paperSamples, DEMO_MINUTE_DECIMALS),
          slotDeviationSamples: roundDeep(m.slotDeviationSamples, DEMO_MINUTE_DECIMALS),
        },
      ]),
    ),
    days: roundDeep(toDemoDays(res.days, carrierLabels, goodsLabels), DEMO_MINUTE_DECIMALS).map((d, i) => ({ ...d, actual: roundDeep(res.days[i].actual, DEMO_DECIMALS) })),
    quality: {
      totalVisits: q.totalVisits,
      includedVisits: q.includedVisits,
      excludedByReason: q.excludedByReason,
      flaggedByReason: q.flaggedByReason,
      firstDate: q.firstDate,
      lastDate: q.lastDate,
      distinctDays: q.distinctDays,
      gaps: q.gaps,
      suspectedManualDays: q.suspectedManualDays,
      dstDays: q.dstDays,
    },
    stats,
    calibration,
    truthForValidation: truth,
  };
  const out = roundDeep(ds, DEMO_DECIMALS);
  assertNoPII(out);
  return out;
}

/** Serialisering som skrivs till src/app/demo/demo-dataset.json. */
export function demoDatasetJson(seed: string = DEMO_SEED): string {
  return JSON.stringify(buildDemoDataset(seed)) + "\n";
}
