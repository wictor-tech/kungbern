import type { SiteModel } from "../engine/model.ts";
import type { Minutes } from "../engine/time.ts";
import { DEFAULT_QUALITY_RULES, VISITS_SCHEMA_VERSION, type DerivedVisit, type QualityRules, type RecordedDay, type Visit } from "./contract.ts";
import { calibrateSite, type CalibrationStats, type DayType } from "./calibrate.ts";
import { deriveVisits } from "./derive.ts";
import { stableHash, stableStringify } from "./hash.ts";
import { buildQualityReport, type QualityReport } from "./quality.ts";
import { recordedDays } from "./recorded.ts";
import { MIN_DAYS_PER_WEEKDAY_PROFILE } from "./rules.ts";

export const PIPELINE_VERSION = "1.0.0";

export interface PipelineOptions {
  tenantId: string;
  siteId: string;
  rules?: QualityRules;
  openFrom: Minutes;
  openTo: Minutes;
  /** Visningsnamn i profilerna (standard: siteId). */
  label?: string;
}

export interface PipelineResult {
  pipelineVersion: string;
  schemaVersion: number;
  tenantId: string;
  siteId: string;
  /** Stabil hash av sorterad input – samma data ger samma hash oavsett ordning. */
  inputHash: string;
  derived: DerivedVisit[];
  quality: QualityReport;
  /** "all" och "weekday:1".."weekday:7" (endast veckodagar med ≥ MIN_DAYS_PER_WEEKDAY_PROFILE driftdagar). */
  profiles: Record<string, SiteModel>;
  stats: Record<string, CalibrationStats>;
  days: RecordedDay[];
}

/**
 * Hela datalagret för EN sajt: härledning → kvalitet → kalibrering → inspelade dagar.
 * Idempotent: samma input (i valfri ordning) ger byte-identisk JSON. Inga väggklockstider i output.
 * Tenant-isolering: kastar om något besök tillhör annan tenant eller sajt.
 */
export function runPipeline(visits: readonly Visit[], opts: PipelineOptions): PipelineResult {
  const rules = opts.rules ?? DEFAULT_QUALITY_RULES;
  const foreign = visits.filter((v) => v.tenantId !== opts.tenantId || v.siteId !== opts.siteId);
  if (foreign.length > 0) {
    throw new Error(`Tenant-isolering: ${foreign.length} besök tillhör inte ${opts.tenantId}/${opts.siteId} (t.ex. ${foreign[0].visitId})`);
  }
  const tzs = new Set(visits.map((v) => v.siteTimeZone));
  if (tzs.size > 1) throw new Error(`Sajten har flera tidszoner i data: ${[...tzs].sort().join(", ")}`);

  const keyed = visits.map((v) => ({ v, s: stableStringify(v) }));
  keyed.sort((a, b) => (a.v.visitId < b.v.visitId ? -1 : a.v.visitId > b.v.visitId ? 1 : a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  const sorted = keyed.map((x) => x.v);
  const inputHash = stableHash(`[${keyed.map((x) => x.s).join(",")}]`);

  const derived = deriveVisits(sorted, rules);
  const quality = buildQualityReport(derived, rules);
  const label = opts.label ?? opts.siteId;

  const profiles: Record<string, SiteModel> = {};
  const stats: Record<string, CalibrationStats> = {};
  const dayTypes: DayType[] = ["all"];
  const daysPerWd = new Map<number, Set<string>>();
  for (const d of derived) {
    if (d.arrivalMin === null || d.issues.includes("duplicate")) continue;
    let s = daysPerWd.get(d.isoWeekday);
    if (!s) daysPerWd.set(d.isoWeekday, (s = new Set()));
    s.add(d.serviceDate);
  }
  for (let wd = 1; wd <= 7; wd++) if ((daysPerWd.get(wd)?.size ?? 0) >= MIN_DAYS_PER_WEEKDAY_PROFILE) dayTypes.push(`weekday:${wd}`);
  for (const dayType of dayTypes) {
    const r = calibrateSite(derived, { siteId: opts.siteId, label, dayType, rules });
    profiles[dayType] = r.model;
    stats[dayType] = r.stats;
  }

  return {
    pipelineVersion: PIPELINE_VERSION,
    schemaVersion: VISITS_SCHEMA_VERSION,
    tenantId: opts.tenantId,
    siteId: opts.siteId,
    inputHash,
    derived,
    quality,
    profiles,
    stats,
    days: recordedDays(derived, { openFrom: opts.openFrom, openTo: opts.openTo }),
  };
}
