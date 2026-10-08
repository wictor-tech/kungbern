import type { Provenance, SiteModel, VisitSample } from "../engine/model.ts";
import { mean, quantileSorted } from "../engine/stats.ts";
import { formatClock } from "../engine/time.ts";
import { DEFAULT_QUALITY_RULES, type DerivedVisit, type QualityRules } from "./contract.ts";
import { NO_DATE } from "./derive.ts";
import {
  CALIB_GATE_MAX_MIN,
  CALIB_PAPER_MAX_MIN,
  CALIB_SLOT_DEVIATION_MAX_MIN,
  ON_TIME_TOLERANCE_MIN,
  UNKNOWN_LABEL,
  isBooked,
  isCancelled,
  isLateCancellation,
  isNoShow,
  slotClass,
} from "./rules.ts";

export type DayType = "all" | `weekday:${number}`;

export interface CalibrateOptions {
  siteId: string;
  label: string;
  dayType: DayType;
  /** Begränsa till dessa servicedagar (t.ex. träningsperiod i backtest). */
  dates?: ReadonlySet<string>;
  rules?: QualityRules;
}

export interface Dist {
  n: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  p95: number;
}

export interface OmittedSegment {
  segment: "carrier" | "goodsType";
  key: string;
  n: number;
  reason: string;
}

export interface SegmentedDist {
  overall: Dist | null;
  byCarrier: Record<string, Dist>;
  byGoodsType: Record<string, Dist>;
  omitted: OmittedSegment[];
}

export interface PalletModel {
  /** Lossningstid = a + b · pallar (OLS). */
  a: number;
  b: number;
  r2: number;
  n: number;
}

export interface CalibrationStats {
  siteId: string;
  dayType: string;
  period: { from: string | null; to: string | null };
  operatingDays: number;
  arrivals: number;
  includedVisits: number;
  unload: SegmentedDist;
  waitToDoor: SegmentedDist;
  timeOnYard: SegmentedDist;
  slotDeviation: SegmentedDist;
  gateMin: SegmentedDist;
  slotAdherence: { n: number; toleranceMin: number; onTimeShare: number; earlyShare: number; lateShare: number };
  noShow: { rate: number; noShows: number; booked: number };
  /** Sena avbokningar (beslut D4) / alla bokningar (inkl. avbokade). */
  lateCancellation: { rate: number; lateCancellations: number; cancellations: number; bookings: number };
  palletModel: PalletModel | null;
  palletModelNote: string | null;
  /** Medelantal ankomster per (ISO-veckodag − 1) × timme över driftdagarna för den veckodagen. */
  arrivalIntensity: number[][];
  /** Medelantal upptagna dörrar per timme (inkluderade besök). */
  doorOccupancyByHour: number[];
  doorsObserved: number;
  observedOpenWindow: { from: string; to: string; basis: "observerat"; n: number } | null;
}

function dist(values: readonly number[]): Dist | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, mean: mean(s), p10: quantileSorted(s, 0.1), p50: quantileSorted(s, 0.5), p90: quantileSorted(s, 0.9), p95: quantileSorted(s, 0.95) };
}

interface Obs {
  carrier: string;
  goodsType: string;
  x: number;
}

function segmented(obs: readonly Obs[], minN: number): SegmentedDist {
  const out: SegmentedDist = { overall: dist(obs.map((o) => o.x)), byCarrier: {}, byGoodsType: {}, omitted: [] };
  for (const seg of ["carrier", "goodsType"] as const) {
    const groups = new Map<string, number[]>();
    for (const o of obs) {
      const k = o[seg];
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(o.x);
    }
    for (const k of [...groups.keys()].sort()) {
      const g = groups.get(k)!;
      if (g.length >= minN) (seg === "carrier" ? out.byCarrier : out.byGoodsType)[k] = dist(g)!;
      else out.omitted.push({ segment: seg, key: k, n: g.length, reason: `n=${g.length} < minSegmentN=${minN}` });
    }
  }
  return out;
}

function ols(xs: readonly number[], ys: readonly number[]): PalletModel {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { a, b, r2, n };
}

function matchesDayType(d: DerivedVisit, dayType: DayType): boolean {
  if (dayType === "all") return true;
  const m = /^weekday:([1-7])$/.exec(dayType);
  if (!m) throw new Error(`Ogiltig dagtyp "${dayType}" – förväntat "all" eller "weekday:1".."weekday:7"`);
  return d.isoWeekday === Number(m[1]);
}

const carrierOf = (d: DerivedVisit) => d.visit.carrierKey ?? UNKNOWN_LABEL;
const goodsOf = (d: DerivedVisit) => d.visit.goodsType ?? UNKNOWN_LABEL;

/** Besök som inte är dubbletter eller har felaktig tidsordning – underlag för ankomster, grind, papper, slot. */
function isSound(d: DerivedVisit): boolean {
  return !d.issues.includes("duplicate") && !d.issues.includes("out_of_order") && !d.issues.includes("negative_duration");
}

/** Kalibrera en SiteModel (site_profile) och beskrivande statistik för en sajt och dagtyp. */
export function calibrateSite(derived: readonly DerivedVisit[], opts: CalibrateOptions): { model: SiteModel; stats: CalibrationStats } {
  const rules = opts.rules ?? DEFAULT_QUALITY_RULES;
  const sel = derived.filter(
    (d) => d.visit.siteId === opts.siteId && d.serviceDate !== NO_DATE && matchesDayType(d, opts.dayType) && (!opts.dates || opts.dates.has(d.serviceDate)),
  );

  const arrivals = sel.filter((d) => d.arrivalMin !== null && !d.issues.includes("duplicate"));
  const opDays = [...new Set(arrivals.map((d) => d.serviceDate))].sort();
  const nDays = opDays.length;
  const from = opDays[0] ?? null;
  const to = opDays[nDays - 1] ?? null;
  const src = (n: number, what = "besök") => `visits ${from ?? "–"}–${to ?? "–"}, ${opts.dayType}, ${nDays} driftdagar, ${what} n=${n}`;

  const hourlyArrivals = new Array(24).fill(0);
  for (const d of arrivals) hourlyArrivals[Math.min(23, Math.floor(d.arrivalMin! / 60))]++;
  for (let h = 0; h < 24; h++) hourlyArrivals[h] = nDays > 0 ? hourlyArrivals[h] / nDays : 0;

  const included = sel.filter((d) => d.included);
  const unloadSamples: VisitSample[] = included.map((d) => ({ carrier: carrierOf(d), goodsType: goodsOf(d), pallets: d.visit.pallets, unloadMin: d.unloadMin! }));

  const sound = sel.filter((d) => isSound(d));
  const gateObs = sound.filter((d) => d.gateMin !== null && d.gateMin >= 0 && d.gateMin <= CALIB_GATE_MAX_MIN);
  const paperObs = sound.filter((d) => d.paperMin !== null && d.paperMin >= 0 && d.paperMin <= CALIB_PAPER_MAX_MIN);
  const slotObs = sound.filter((d) => d.slotDeviation !== null && Math.abs(d.slotDeviation) <= CALIB_SLOT_DEVIATION_MAX_MIN);

  const bookingsAll = sel.filter((d) => !d.issues.includes("duplicate") && isBooked(d.visit));
  const bookedActive = bookingsAll.filter((d) => !isCancelled(d.visit));
  const noShows = bookedActive.filter((d) => isNoShow(d.visit)).length;
  const noShowRate = bookedActive.length > 0 ? noShows / bookedActive.length : 0;
  const cancellations = bookingsAll.filter((d) => isCancelled(d.visit));
  const lateCanc = cancellations.filter((d) => isLateCancellation(d.visit)).length;

  // Historiska ankomstmönster per driftdag (endast tider, inga identiteter) för mönstret "historical".
  const byDay = new Map<string, { t: number; s: number | null }[]>();
  for (const d of arrivals) {
    let arr = byDay.get(d.serviceDate);
    if (!arr) byDay.set(d.serviceDate, (arr = []));
    arr.push({ t: d.arrivalMin!, s: d.slotStartMin });
  }
  const arrivalDays = [...byDay.keys()].sort().map((k) => byDay.get(k)!.sort((a, b) => a.t - b.t));

  const measured = (n: number, what?: string): Provenance => ({ kind: "measured", source: src(n, what), n });
  const model: SiteModel = {
    siteId: opts.siteId,
    label: opts.label,
    dayType: opts.dayType,
    hourlyArrivals,
    unloadSamples,
    gateSamples: gateObs.map((d) => d.gateMin!),
    paperSamples: paperObs.map((d) => d.paperMin!),
    slotDeviationSamples: slotObs.map((d) => d.slotDeviation!),
    noShowRate,
    arrivalDays,
    provenance: {
      hourlyArrivals: measured(arrivals.length, "ankomster"),
      unloadSamples: measured(unloadSamples.length, "inkluderade besök"),
      gateSamples: measured(gateObs.length, "grindtider"),
      paperSamples: measured(paperObs.length, "papperstider"),
      slotDeviationSamples: measured(slotObs.length, "bokade ankomster"),
      noShowRate: measured(bookedActive.length, "bokningar ej avbokade"),
      arrivalDays: measured(arrivalDays.length, "driftdagar med ankomstmönster"),
    },
  };

  // --- Beskrivande statistik ---
  const minN = rules.minSegmentN;
  const obs = (ds: readonly DerivedVisit[], f: (d: DerivedVisit) => number) => ds.map((d) => ({ carrier: carrierOf(d), goodsType: goodsOf(d), x: f(d) }));

  let early = 0, onTime = 0, late = 0;
  for (const d of slotObs) {
    const c = slotClass(d.slotDeviation!);
    if (c === "early") early++;
    else if (c === "late") late++;
    else onTime++;
  }
  const nSlot = slotObs.length;

  const withPallets = included.filter((d) => d.visit.pallets !== null);
  const palletModel = withPallets.length >= minN ? ols(withPallets.map((d) => d.visit.pallets!), withPallets.map((d) => d.unloadMin!)) : null;

  const intensity: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const daysPerWd = new Array(7).fill(0);
  for (const day of opDays) {
    const wd = arrivals.find((d) => d.serviceDate === day)!.isoWeekday;
    daysPerWd[wd - 1]++;
  }
  for (const d of arrivals) intensity[d.isoWeekday - 1][Math.min(23, Math.floor(d.arrivalMin! / 60))]++;
  for (let w = 0; w < 7; w++) for (let h = 0; h < 24; h++) intensity[w][h] = daysPerWd[w] > 0 ? intensity[w][h] / daysPerWd[w] : 0;

  const occ = new Array(24).fill(0);
  for (const d of included) {
    const s = d.unloadStartMin!;
    const e = d.unloadEndMin ?? s;
    for (let h = Math.max(0, Math.floor(s / 60)); h < 24 && h * 60 < e; h++) {
      occ[h] += Math.max(0, Math.min(e, (h + 1) * 60) - Math.max(s, h * 60)) / 60;
    }
  }
  for (let h = 0; h < 24; h++) occ[h] = nDays > 0 ? occ[h] / nDays : 0;

  const doors = new Set(included.map((d) => d.visit.doorId).filter((x): x is string => x !== null));
  const starts = included.map((d) => d.unloadStartMin!).sort((a, b) => a - b);
  const ends = included.map((d) => d.unloadEndMin!).sort((a, b) => a - b);

  const stats: CalibrationStats = {
    siteId: opts.siteId,
    dayType: opts.dayType,
    period: { from, to },
    operatingDays: nDays,
    arrivals: arrivals.length,
    includedVisits: included.length,
    unload: segmented(obs(included, (d) => d.unloadMin!), minN),
    waitToDoor: segmented(obs(included, (d) => d.waitToDoor!), minN),
    timeOnYard: segmented(obs(included.filter((d) => d.timeOnYard !== null), (d) => d.timeOnYard!), minN),
    slotDeviation: segmented(obs(slotObs, (d) => d.slotDeviation!), minN),
    gateMin: segmented(obs(gateObs, (d) => d.gateMin!), minN),
    slotAdherence: {
      n: nSlot,
      toleranceMin: ON_TIME_TOLERANCE_MIN,
      onTimeShare: nSlot ? onTime / nSlot : 0,
      earlyShare: nSlot ? early / nSlot : 0,
      lateShare: nSlot ? late / nSlot : 0,
    },
    noShow: { rate: noShowRate, noShows, booked: bookedActive.length },
    lateCancellation: {
      rate: bookingsAll.length ? lateCanc / bookingsAll.length : 0,
      lateCancellations: lateCanc,
      cancellations: cancellations.length,
      bookings: bookingsAll.length,
    },
    palletModel,
    palletModelNote: palletModel ? null : `för få besök med pallantal (${withPallets.length} < minSegmentN=${minN})`,
    arrivalIntensity: intensity,
    doorOccupancyByHour: occ,
    doorsObserved: doors.size,
    observedOpenWindow:
      starts.length > 0 ? { from: formatClock(quantileSorted(starts, 0.05)), to: formatClock(quantileSorted(ends, 0.95)), basis: "observerat", n: starts.length } : null,
  };
  return { model, stats };
}
