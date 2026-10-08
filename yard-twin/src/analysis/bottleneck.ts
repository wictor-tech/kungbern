/**
 * Flaskhalsanalys: var uppstår väntan – i grinden, vid dörrarna eller på uppställningsytan?
 * Och vad händer när vi avlastar flaskhalsen – flyttar den sig?
 */
import type { SiteModel } from "../engine/model.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import { median } from "../engine/stats.ts";
import { assertReps, lt, simulateReps, withDoors, withSite, type LocalizedText, type RunOpts } from "./common.ts";
import { fmtMin, fmtPct } from "./i18n-format.ts";

export type Resource = "gate" | "doors" | "parking";

/**
 * PRODUKTBESLUT – flaskhalsgränser.
 * - saturationUtilization: över 85 % beläggning växer köer snabbt (köteori: väntan ~ ρ/(1−ρ)).
 * - dominantWaitShare: en resurs som står för minst hälften av väntan räknas som mättad.
 * - noBottleneckAvgWaitMin: under 5 min medelväntan säger vi att det inte finns någon flaskhals att tala om.
 * - parkingOverflowShare: om minst 20 % av lastbilarna får vänta utanför gården är uppställningen ett problem,
 *   även om den inte förlänger väntan i modellen (lastbilar utanför tappar inte sin plats i kön).
 * - parkingSaturation: uppställningen räknas som full vid ≥ 95 % av platserna.
 */
export const BOTTLENECK_THRESHOLDS = {
  saturationUtilization: 0.85,
  dominantWaitShare: 0.5,
  noBottleneckAvgWaitMin: 5,
  parkingOverflowShare: 0.2,
  parkingSaturation: 0.95,
} as const;

/** PRODUKTBESLUT: avlastning per kaskadsteg – +1 grindfil, +1 dörr, +50 % uppställning. Högst 3 steg. */
export const CASCADE_RELIEF = { gateLanes: 1, doors: 1, parkingFactor: 1.5, maxSteps: 3 } as const;

export const DEFAULT_BOTTLENECK_REPS = 40;

export interface ResourceStat {
  resource: Resource;
  /**
   * Median beläggning (0–1). Grind: grindtid / (filer × fönster). Dörrar: lossningstid inom öppettid.
   * Uppställning: max upptagna platser / platser; null om obegränsat.
   */
  utilization: number | null;
  /**
   * Grind: andel av köväntan som är grindkö (ankomst → incheckning börjar). Dörrar: andel som är väntan på gården
   * på dörr (incheckning klar → lossningsstart). Själva incheckningstiden räknas inte som kö – den försvinner inte
   * med mer kapacitet, och vid korta köer skulle den annars felaktigt peka ut grinden.
   * Uppställning: andel lastbilar som fick vänta utanför gården (inte en andel av väntan – se doc ovan).
   */
  waitShare: number;
  saturated: boolean;
}

export interface BottleneckSnapshot {
  config: { doors: number; gateLanes: number; parkingSpaces: number | null };
  resources: ResourceStat[];
  bottleneck: Resource | "none";
  avgWait: number;
  p90Wait: number;
  explanation: LocalizedText;
}

export interface CascadeStep extends BottleneckSnapshot {
  /** Vad som ändrades jämfört med föregående steg (null för utgångsläget). */
  change: LocalizedText | null;
}

export interface BottleneckResult extends BottleneckSnapshot {
  cascade: CascadeStep[];
  reps: number;
}

export function analyzeBottleneck(model: SiteModel, scenario: CompiledScenario, opts: Partial<RunOpts> = {}): BottleneckResult {
  const reps = opts.reps ?? DEFAULT_BOTTLENECK_REPS;
  assertReps(reps);
  const run: RunOpts = { reps, seed: opts.seed ?? scenario.seed, recorded: opts.recorded };
  const base = snapshot(model, scenario, run);
  const cascade: CascadeStep[] = [{ ...base, change: null }];
  let sc = scenario;
  let cur = base;
  for (let i = 0; i < CASCADE_RELIEF.maxSteps && cur.bottleneck !== "none"; i++) {
    const r = relieve(sc, cur.bottleneck);
    if (!r) break;
    sc = r.sc;
    cur = snapshot(model, sc, run);
    cascade.push({ ...cur, change: r.change });
  }
  return { ...base, cascade, reps };
}

function relieve(sc: CompiledScenario, b: Resource): { sc: CompiledScenario; change: LocalizedText } | null {
  switch (b) {
    case "gate": {
      const n = sc.site.gateLanes + CASCADE_RELIEF.gateLanes;
      return { sc: withSite(sc, { gateLanes: n }), change: lt(`+${CASCADE_RELIEF.gateLanes} grindfil (${n} totalt)`, `+${CASCADE_RELIEF.gateLanes} gate lane (${n} total)`) };
    }
    case "doors": {
      const n = sc.site.doors.length + CASCADE_RELIEF.doors;
      return { sc: withDoors(sc, n), change: lt(`+${CASCADE_RELIEF.doors} dörr (${n} totalt)`, `+${CASCADE_RELIEF.doors} door (${n} total)`) };
    }
    case "parking": {
      if (!Number.isFinite(sc.site.parkingSpaces)) return null;
      const n = Math.max(sc.site.parkingSpaces + 1, Math.ceil(sc.site.parkingSpaces * CASCADE_RELIEF.parkingFactor));
      return { sc: withSite(sc, { parkingSpaces: n }), change: lt(`Uppställning +50 % (${n} platser)`, `Parking +50% (${n} spaces)`) };
    }
  }
}

/** Analysera en konfiguration (detaljkörningar behövs för att dela upp väntan per resurs). */
export function snapshot(model: SiteModel, sc: CompiledScenario, run: RunOpts): BottleneckSnapshot {
  const T = BOTTLENECK_THRESHOLDS;
  const gateU: number[] = [], doorU: number[] = [], parkU: number[] = [];
  const gateShare: number[] = [], doorShare: number[] = [], overflowShare: number[] = [];
  const avgW: number[] = [], p90W: number[] = [];
  const parkingFinite = Number.isFinite(sc.site.parkingSpaces);
  simulateReps(model, sc, { ...run, detail: true }, ({ result }) => {
    const m = result.metrics;
    gateU.push(m.gateUtilization);
    doorU.push(m.doorUtilization);
    if (parkingFinite) parkU.push(sc.site.parkingSpaces > 0 ? m.maxParking / sc.site.parkingSpaces : m.overflowTrucks > 0 ? 1 : 0);
    avgW.push(m.avgWait);
    p90W.push(m.p90Wait);
    const endT = result.series.length > 0 ? result.series[result.series.length - 1].t : 0;
    let g = 0, y = 0;
    for (const t of result.trucks) {
      const gateStart = Number.isFinite(t.gateStart) ? t.gateStart : endT;
      const gateEnd = Number.isFinite(t.gateEnd) ? t.gateEnd : endT;
      g += Math.max(0, gateStart - t.arrival);
      y += Math.max(0, (t.doorStart ?? endT) - gateEnd);
    }
    const tot = g + y;
    gateShare.push(tot > 0 ? g / tot : 0);
    doorShare.push(tot > 0 ? y / tot : 0);
    overflowShare.push(m.trucks > 0 ? m.overflowTrucks / m.trucks : 0);
  });
  const avgWait = median(avgW);
  const p90Wait = median(p90W);
  const meaningfulWait = avgWait >= T.noBottleneckAvgWaitMin;
  const gate: ResourceStat = { resource: "gate", utilization: median(gateU), waitShare: median(gateShare), saturated: false };
  const doors: ResourceStat = { resource: "doors", utilization: median(doorU), waitShare: median(doorShare), saturated: false };
  const parking: ResourceStat = { resource: "parking", utilization: parkingFinite ? median(parkU) : null, waitShare: median(overflowShare), saturated: false };
  for (const r of [gate, doors]) {
    r.saturated = (r.utilization ?? 0) >= T.saturationUtilization || (meaningfulWait && r.waitShare >= T.dominantWaitShare);
  }
  parking.saturated = parkingFinite && ((parking.utilization ?? 0) >= T.parkingSaturation || parking.waitShare >= T.parkingOverflowShare);

  // Väntan först: grind eller dörrar beroende på vilken som står för störst del av väntan.
  // Uppställning blir flaskhals bara när väntan är liten men många ändå hamnar utanför gården.
  let bottleneck: Resource | "none" = "none";
  if (meaningfulWait) bottleneck = gate.waitShare > doors.waitShare ? "gate" : "doors";
  else if (parkingFinite && parking.waitShare >= T.parkingOverflowShare) bottleneck = "parking";

  const resources = [gate, doors, parking];
  return {
    config: { doors: sc.site.doors.length, gateLanes: sc.site.gateLanes, parkingSpaces: parkingFinite ? sc.site.parkingSpaces : null },
    resources,
    bottleneck,
    avgWait,
    p90Wait,
    explanation: explain(bottleneck, gate, doors, parking, avgWait),
  };
}

function explain(b: Resource | "none", gate: ResourceStat, doors: ResourceStat, parking: ResourceStat, avgWait: number): LocalizedText {
  const pctSv = (x: number | null) => (x === null ? "–" : fmtPct(x, "sv"));
  const pctEn = (x: number | null) => (x === null ? "–" : fmtPct(x, "en"));
  let sv: string, en: string;
  switch (b) {
    case "none":
      sv = `Ingen tydlig flaskhals: medelväntan ${fmtMin(avgWait, "sv")} (under ${fmtMin(BOTTLENECK_THRESHOLDS.noBottleneckAvgWaitMin, "sv")}).`;
      en = `No clear bottleneck: average wait ${fmtMin(avgWait, "en")} (below ${fmtMin(BOTTLENECK_THRESHOLDS.noBottleneckAvgWaitMin, "en")}).`;
      break;
    case "gate":
      sv = `Grinden är flaskhalsen: ${pctSv(gate.waitShare)} av väntan sker i grindkön (grindbeläggning ${pctSv(gate.utilization)}).`;
      en = `The gate is the bottleneck: ${pctEn(gate.waitShare)} of waiting happens in the gate queue (gate utilization ${pctEn(gate.utilization)}).`;
      break;
    case "doors":
      sv = `Dörrarna är flaskhalsen: ${pctSv(doors.waitShare)} av väntan sker på gården i väntan på dörr (dörrbeläggning ${pctSv(doors.utilization)}).`;
      en = `The doors are the bottleneck: ${pctEn(doors.waitShare)} of waiting happens in the yard waiting for a door (door utilization ${pctEn(doors.utilization)}).`;
      break;
    case "parking":
      sv = `Uppställningen är flaskhalsen: ${pctSv(parking.waitShare)} av lastbilarna får vänta utanför gården.`;
      en = `Parking is the bottleneck: ${pctEn(parking.waitShare)} of trucks have to wait outside the site.`;
      break;
  }
  if (b !== "parking" && parking.saturated) {
    sv += ` Dessutom får ${pctSv(parking.waitShare)} av lastbilarna vänta utanför gården.`;
    en += ` In addition, ${pctEn(parking.waitShare)} of trucks have to wait outside the site.`;
  }
  return lt(sv, en);
}
