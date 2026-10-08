import { median } from "../engine/stats.ts";
import { DEFAULT_QUALITY_RULES, type DerivedVisit, type QualityRules, type Visit } from "./contract.ts";
import { EXCLUDING_ISSUES, NO_DATE, isRoundQuarter } from "./derive.ts";
import { VISIT_FIELDS } from "./fields.ts";
import { addDays, daysBetween, isoWeekdayOf } from "./localtime.ts";
import {
  ARRIVAL_FROM_CHECKIN_KEY,
  GAP_MIN_RUN_DAYS,
  MIN_CALIBRATION_DAYS,
  MIN_CALIBRATION_VISITS,
  MIN_TIMESTAMPS_FOR_MANUAL_DAY,
  NORMAL_TRAFFIC_WEEKDAY_SHARE,
  OUTLIER_LIST_SIZE,
} from "./rules.ts";

export interface DataGap {
  from: string;
  to: string;
  /** Antal saknade dagar på veckodagar som normalt har trafik. */
  missingDays: number;
}

export interface Outlier {
  visitId: string;
  serviceDate: string;
  field: "unloadMin" | "waitToDoor";
  value: number;
  /** Robust z-värde: |x − median| / (1,4826 · MAD). */
  robustZ: number;
}

export interface ManualDay {
  date: string;
  roundShare: number;
  timestamps: number;
}

export interface QualityReport {
  tenantId: string;
  siteId: string;
  timezone: string;
  rules: QualityRules;
  totalVisits: number;
  includedVisits: number;
  /** Antal exkluderade besök per orsak (ett besök kan ha flera orsaker). `status:<x>` = ej slutförd. */
  excludedByReason: Record<string, number>;
  /** Flaggor som inte exkluderar, plus "arrival_from_checkin" (beslut D1). */
  flaggedByReason: Record<string, number>;
  /** Andel icke-null per fält i Visit-kontraktet. */
  fieldCompleteness: Record<string, number>;
  firstDate: string | null;
  lastDate: string | null;
  /** Antal dagar med minst en ankomst. */
  distinctDays: number;
  gaps: DataGap[];
  outliers: Outlier[];
  suspectedManualDays: ManualDay[];
  dstDays: string[];
  /** Veckodagar (ISO) som normalt har trafik. */
  operatingWeekdays: number[];
}

function inc(r: Record<string, number>, k: string, n = 1): void {
  r[k] = (r[k] ?? 0) + n;
}

function sortedRecord(r: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(r).sort()) out[k] = r[k];
  return out;
}

/** Datakvalitetsrapport för EN sajt. Kastar om underlaget innehåller flera sajter. */
export function buildQualityReport(derived: readonly DerivedVisit[], rules: QualityRules = DEFAULT_QUALITY_RULES): QualityReport {
  const sites = new Set(derived.map((d) => `${d.visit.tenantId}|${d.visit.siteId}`));
  if (sites.size > 1) throw new Error(`buildQualityReport: underlaget innehåller ${sites.size} sajter – använd buildQualityReports`);
  const first = derived[0]?.visit;

  const excludedByReason: Record<string, number> = {};
  const flaggedByReason: Record<string, number> = {};
  let included = 0;
  for (const d of derived) {
    if (d.included) included++;
    else {
      if (d.visit.status !== "completed") inc(excludedByReason, `status:${d.visit.status}`);
      for (const i of d.issues) if (EXCLUDING_ISSUES.includes(i)) inc(excludedByReason, i);
    }
    for (const i of d.issues) if (!EXCLUDING_ISSUES.includes(i)) inc(flaggedByReason, i);
    if (d.visit.arrivedAt === null && d.visit.checkedInAt !== null) inc(flaggedByReason, ARRIVAL_FROM_CHECKIN_KEY);
  }

  const fieldCompleteness: Record<string, number> = {};
  for (const f of VISIT_FIELDS) {
    let nn = 0;
    for (const d of derived) if (d.visit[f as keyof Visit] !== null) nn++;
    fieldCompleteness[f] = derived.length > 0 ? nn / derived.length : 0;
  }

  // Dagar med ankomst (dubbletter räknas inte).
  const perDay = new Map<string, number>();
  for (const d of derived) {
    if (d.arrivalMin === null || d.serviceDate === NO_DATE || d.issues.includes("duplicate")) continue;
    perDay.set(d.serviceDate, (perDay.get(d.serviceDate) ?? 0) + 1);
  }
  const days = [...perDay.keys()].sort();
  const firstDate = days[0] ?? null;
  const lastDate = days[days.length - 1] ?? null;
  const { gaps, operatingWeekdays } = firstDate && lastDate ? findGaps(perDay, firstDate, lastDate) : { gaps: [], operatingWeekdays: [] };

  return {
    tenantId: first?.tenantId ?? "",
    siteId: first?.siteId ?? "",
    timezone: first?.siteTimeZone ?? "",
    rules,
    totalVisits: derived.length,
    includedVisits: included,
    excludedByReason: sortedRecord(excludedByReason),
    flaggedByReason: sortedRecord(flaggedByReason),
    fieldCompleteness,
    firstDate,
    lastDate,
    distinctDays: days.length,
    gaps,
    outliers: findOutliers(derived),
    suspectedManualDays: findManualDays(derived, rules),
    dstDays: [...new Set(derived.filter((d) => d.issues.includes("dst_day")).map((d) => d.serviceDate))].sort(),
    operatingWeekdays,
  };
}

/** En rapport per (tenant, sajt), sorterade på sajt-id. */
export function buildQualityReports(derived: readonly DerivedVisit[], rules: QualityRules = DEFAULT_QUALITY_RULES): QualityReport[] {
  const groups = new Map<string, DerivedVisit[]>();
  for (const d of derived) {
    const k = `${d.visit.tenantId}|${d.visit.siteId}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(d);
  }
  return [...groups.keys()].sort().map((k) => buildQualityReport(groups.get(k)!, rules));
}

function findGaps(perDay: Map<string, number>, from: string, to: string): { gaps: DataGap[]; operatingWeekdays: number[] } {
  const total = new Array(8).fill(0);
  const withTraffic = new Array(8).fill(0);
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    const wd = isoWeekdayOf(d);
    total[wd]++;
    if (perDay.has(d)) withTraffic[wd]++;
  }
  const normal = new Set<number>();
  for (let wd = 1; wd <= 7; wd++) if (total[wd] > 0 && withTraffic[wd] / total[wd] >= NORMAL_TRAFFIC_WEEKDAY_SHARE) normal.add(wd);

  const gaps: DataGap[] = [];
  let runFrom: string | null = null;
  let runTo: string | null = null;
  let missing = 0;
  const close = () => {
    if (runFrom && runTo && missing >= GAP_MIN_RUN_DAYS) gaps.push({ from: runFrom, to: runTo, missingDays: missing });
    runFrom = runTo = null;
    missing = 0;
  };
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    if (!normal.has(isoWeekdayOf(d))) continue; // stängda veckodagar bryter inte en lucka
    if (perDay.has(d)) close();
    else {
      if (!runFrom) runFrom = d;
      runTo = d;
      missing++;
    }
  }
  close();
  return { gaps, operatingWeekdays: [...normal].sort((a, b) => a - b) };
}

function findOutliers(derived: readonly DerivedVisit[]): Outlier[] {
  const out: Outlier[] = [];
  for (const field of ["unloadMin", "waitToDoor"] as const) {
    const vals = derived.filter((d) => d[field] !== null && !d.issues.includes("duplicate")).map((d) => ({ d, x: d[field] as number }));
    if (vals.length < 3) continue;
    const med = median(vals.map((v) => v.x));
    const mad = median(vals.map((v) => Math.abs(v.x - med))) * 1.4826;
    const scale = mad > 0 ? mad : 1;
    for (const { d, x } of vals) out.push({ visitId: d.visit.visitId, serviceDate: d.serviceDate, field, value: x, robustZ: Math.abs(x - med) / scale });
  }
  out.sort((a, b) => b.robustZ - a.robustZ || (a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0) || (a.field < b.field ? -1 : 1));
  return out.slice(0, OUTLIER_LIST_SIZE);
}

function findManualDays(derived: readonly DerivedVisit[], rules: QualityRules): ManualDay[] {
  const stats = new Map<string, { round: number; n: number }>();
  for (const d of derived) {
    if (d.serviceDate === NO_DATE) continue;
    let s = stats.get(d.serviceDate);
    if (!s) stats.set(d.serviceDate, (s = { round: 0, n: 0 }));
    // Tider som typiskt matas in av personal (LPR-ankomst är automatisk och räknas inte).
    for (const iso of [d.visit.unloadStart, d.visit.unloadEnd, d.visit.departedAt]) {
      if (iso === null) continue;
      s.n++;
      if (isRoundQuarter(iso)) s.round++;
    }
  }
  const out: ManualDay[] = [];
  for (const date of [...stats.keys()].sort()) {
    const s = stats.get(date)!;
    if (s.n < MIN_TIMESTAMPS_FOR_MANUAL_DAY) continue;
    const share = s.round / s.n;
    if (share > rules.roundTimeShareThreshold) out.push({ date, roundShare: share, timestamps: s.n });
  }
  return out;
}

export interface SiteRanking {
  siteId: string;
  tenantId: string;
  suitable: boolean;
  distinctDays: number;
  includedVisits: number;
  reasons: string[];
}

/** Rangordna sajter för kalibrering: lämpliga först, sedan flest inkluderade besök och flest dagar. */
export function rankSitesForCalibration(reports: readonly QualityReport[]): SiteRanking[] {
  return reports
    .map((r) => {
      const reasons: string[] = [];
      if (r.distinctDays < MIN_CALIBRATION_DAYS) reasons.push(`för få driftdagar (${r.distinctDays} < ${MIN_CALIBRATION_DAYS})`);
      if (r.includedVisits < MIN_CALIBRATION_VISITS) reasons.push(`för få inkluderade besök (${r.includedVisits} < ${MIN_CALIBRATION_VISITS})`);
      const suitable = reasons.length === 0;
      if (suitable) reasons.push(`${r.distinctDays} driftdagar och ${r.includedVisits} inkluderade besök uppfyller kraven`);
      if (r.gaps.length > 0) reasons.push(`${r.gaps.length} lucka/luckor i data`);
      if (r.suspectedManualDays.length > 0) reasons.push(`${r.suspectedManualDays.length} dag(ar) med misstänkt manuella tider`);
      return { siteId: r.siteId, tenantId: r.tenantId, suitable, distinctDays: r.distinctDays, includedVisits: r.includedVisits, reasons };
    })
    .sort(
      (a, b) =>
        Number(b.suitable) - Number(a.suitable) ||
        b.includedVisits - a.includedVisits ||
        b.distinctDays - a.distinctDays ||
        (a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0),
    );
}

const ISSUE_LABELS: Record<string, string> = {
  duplicate: "Dubblett",
  missing_arrival: "Saknar ankomst",
  missing_unload: "Saknar lossningstid",
  unload_too_short: "Lossning för kort",
  unload_too_long: "Lossning för lång",
  out_of_order: "Tidsstämplar i fel ordning",
  negative_duration: "Negativ varaktighet",
  dst_day: "Sommartidsomställning",
  suspected_manual_time: "Misstänkt manuell tid",
  manually_edited: "Manuellt ändrad (auditlogg)",
  outside_window: "Utanför tidsfönster",
  [ARRIVAL_FROM_CHECKIN_KEY]: "Ankomst från incheckning (LPR saknas)",
};

function label(k: string): string {
  if (k.startsWith("status:")) return `Status ${k.slice(7)} (ej slutfört)`;
  return ISSUE_LABELS[k] ?? k;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1).replace(".", ",")} %`;
}

function num(x: number, d = 1): string {
  return x.toFixed(d).replace(".", ",");
}

/** Datakvalitetsrapport som svensk markdown. */
export function qualityReportToMarkdown(r: QualityReport): string {
  const L: string[] = [];
  L.push(`# Datakvalitetsrapport – ${r.siteId}`);
  L.push("");
  L.push(`- Tidszon: ${r.timezone}`);
  L.push(`- Period: ${r.firstDate ?? "–"} – ${r.lastDate ?? "–"} (${r.distinctDays} dagar med ankomster)`);
  L.push(`- Besök totalt: ${r.totalVisits}, inkluderade i kalibrering: ${r.includedVisits} (${pct(r.totalVisits ? r.includedVisits / r.totalVisits : 0)})`);
  L.push(`- Veckodagar med normal trafik: ${r.operatingWeekdays.join(", ") || "–"}`);
  L.push("");
  L.push("## Regler");
  L.push("");
  L.push(`- Lossningstid godkänd: ${r.rules.minUnloadMin}–${r.rules.maxUnloadMin} min`);
  L.push(`- Dubblettfönster: ${r.rules.duplicateWindowMin} min (samma transportör och dörr)`);
  L.push(`- Misstänkt manuell dag: andel jämna kvartstider > ${pct(r.rules.roundTimeShareThreshold)}`);
  L.push(`- Minsta segmentstorlek: ${r.rules.minSegmentN}, k-anonymitet: ${r.rules.kAnonymity}`);
  L.push("");
  L.push("## Exkluderade besök per orsak");
  L.push("");
  L.push("| Orsak | Antal |");
  L.push("|---|---:|");
  for (const [k, v] of Object.entries(r.excludedByReason)) L.push(`| ${label(k)} | ${v} |`);
  if (Object.keys(r.excludedByReason).length === 0) L.push("| – | 0 |");
  L.push("");
  L.push("## Flaggade (exkluderas inte)");
  L.push("");
  L.push("| Flagga | Antal |");
  L.push("|---|---:|");
  for (const [k, v] of Object.entries(r.flaggedByReason)) L.push(`| ${label(k)} | ${v} |`);
  if (Object.keys(r.flaggedByReason).length === 0) L.push("| – | 0 |");
  L.push("");
  L.push("## Fältkomplettering");
  L.push("");
  L.push("| Fält | Ifyllt |");
  L.push("|---|---:|");
  for (const [k, v] of Object.entries(r.fieldCompleteness)) L.push(`| ${k} | ${pct(v)} |`);
  L.push("");
  L.push("## Luckor i data");
  L.push("");
  if (r.gaps.length === 0) L.push(`Inga luckor (≥ ${GAP_MIN_RUN_DAYS} saknade driftdagar i följd).`);
  for (const g of r.gaps) L.push(`- ${g.from} – ${g.to}: ${g.missingDays} driftdagar utan besök`);
  L.push("");
  L.push("## Dagar med misstänkt manuella tider");
  L.push("");
  if (r.suspectedManualDays.length === 0) L.push("Inga.");
  for (const m of r.suspectedManualDays) L.push(`- ${m.date}: ${pct(m.roundShare)} jämna kvartstider av ${m.timestamps}`);
  L.push("");
  L.push("## Sommartidsdagar");
  L.push("");
  L.push(r.dstDays.length ? r.dstDays.map((d) => `- ${d}`).join("\n") : "Inga besök på omställningsdagar.");
  L.push("");
  L.push(`## Extremvärden (topp ${OUTLIER_LIST_SIZE})`);
  L.push("");
  L.push("| Besök | Dag | Mått | Värde (min) | Robust z |");
  L.push("|---|---|---|---:|---:|");
  for (const o of r.outliers) {
    L.push(`| ${o.visitId} | ${o.serviceDate} | ${o.field === "unloadMin" ? "lossning" : "väntan till dörr"} | ${num(o.value)} | ${num(o.robustZ)} |`);
  }
  L.push("");
  return L.join("\n");
}
