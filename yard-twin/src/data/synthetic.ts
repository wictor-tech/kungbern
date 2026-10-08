import { Rng } from "../engine/rng.ts";
import { simulateDay } from "../engine/simulate.ts";
import type { Minutes } from "../engine/time.ts";
import type { CostConfig, SiteConfig, StrategyConfig, Truck } from "../engine/types.ts";
import type { Visit } from "./contract.ts";
import { stableHash } from "./hash.ts";
import { addDays, isoWeekdayOf, localToIso } from "./localtime.ts";

/**
 * SYNTETISK SANNING för en demosajt. Inga kunddata – samtliga värden är ANTAGANDEN som ska se
 * rimliga ut för ett nordiskt inleveranslager (dagligvaror/detaljhandel). De används för att köra
 * hela pipelinen utan kunddata och för att verifiera att kalibreringen återskapar känd sanning.
 */
export interface SyntheticSiteTruth {
  label: string;
  doors: number;
  gateLanes: number;
  openFrom: Minutes;
  openTo: Minutes;
  /** Planerade besök (inkl. de som avbokas/uteblir) en normal veckodag. */
  meanPlannedPerDay: number;
  /** Multiplikator per ISO-veckodag (index 0 = måndag). 0 = stängt. */
  weekdayMultiplier: number[];
  /** Relativ vikt per timme (0–23) för önskad ankomsttid. */
  hourlyShape: number[];
  goodsTypes: { key: string; share: number; unloadA: number; unloadB: number }[];
  carriers: { key: string; share: number }[];
  palletsMin: number;
  palletsMax: number;
  /** Lossningstid = (a + b·pallar) · exp(σ·Z), dvs. median a + b·pallar. */
  unloadLogSigma: number;
  gateMin: { min: number; max: number };
  paperMin: { min: number; max: number };
  slotLengthMin: number;
  bookedShare: number;
  /** Andel bokade som kommer inom ±15 min. */
  onTimeShare: number;
  /** Andel av de som INTE kommer i tid som är tidiga. */
  earlyShareOfOffTime: number;
  /** Medel för exponentiell svans utanför toleransen (min). */
  earlyTailMeanMin: number;
  lateTailMeanMin: number;
  /** Andel av ej avbokade bokningar som uteblir. */
  noShowRate: number;
  /** Andel bokningar som avbokas. */
  cancellationRate: number;
  /** Andel avbokningar som sker < 24 h före slot. */
  lateCancellationShare: number;
}

/** ANTAGANDE: hela objektet är påhittat för demo och test – se kommentarer per fält. */
export const DEMO_SITE_TRUTH: SyntheticSiteTruth = {
  label: "Demo DC Nord",
  doors: 8, // ANTAGANDE
  gateLanes: 2, // ANTAGANDE
  openFrom: 5 * 60, // ANTAGANDE 05:00
  openTo: 15 * 60, // ANTAGANDE 15:00
  meanPlannedPerDay: 82, // ANTAGANDE ≈ 75 ankomster efter avbokning/no-show
  weekdayMultiplier: [1.1, 1.0, 0.95, 1.05, 0.85, 0, 0], // ANTAGANDE, stängt helg
  // ANTAGANDE: topp 06–10
  hourlyShape: [0, 0, 0, 0, 0.3, 0.9, 1.4, 1.5, 1.4, 1.2, 0.9, 0.7, 0.6, 0.5, 0.4, 0.15, 0, 0, 0, 0, 0, 0, 0, 0],
  goodsTypes: [
    { key: "torr", share: 0.6, unloadA: 8, unloadB: 1.0 }, // ANTAGANDE
    { key: "kyl", share: 0.3, unloadA: 10, unloadB: 1.1 }, // ANTAGANDE
    { key: "frys", share: 0.1, unloadA: 12, unloadB: 1.25 }, // ANTAGANDE
  ],
  // ANTAGANDE: snedfördelade andelar, pseudonyma nycklar
  carriers: [
    { key: "C01", share: 0.27 },
    { key: "C02", share: 0.19 },
    { key: "C03", share: 0.15 },
    { key: "C04", share: 0.12 },
    { key: "C05", share: 0.1 },
    { key: "C06", share: 0.08 },
    { key: "C07", share: 0.05 },
    { key: "C08", share: 0.04 },
  ],
  palletsMin: 4, // ANTAGANDE
  palletsMax: 33, // ANTAGANDE (fullt trailerekipage)
  unloadLogSigma: 0.3, // ANTAGANDE
  gateMin: { min: 1, max: 6 }, // ANTAGANDE
  paperMin: { min: 3, max: 20 }, // ANTAGANDE
  slotLengthMin: 30, // ANTAGANDE
  bookedShare: 0.85, // ANTAGANDE
  onTimeShare: 0.65, // ANTAGANDE
  earlyShareOfOffTime: 0.45, // ANTAGANDE
  earlyTailMeanMin: 25, // ANTAGANDE
  lateTailMeanMin: 35, // ANTAGANDE
  noShowRate: 0.04, // ANTAGANDE
  cancellationRate: 0.06, // ANTAGANDE
  lateCancellationShare: 0.35, // ANTAGANDE
};

/** ANTAGANDE: brus som injiceras för att efterlikna verkliga datafel (andel av besök om inget annat anges). */
export const SYNTHETIC_NOISE = {
  /** Dubbel LPR-läsning → kopia med nytt id, ankomst 0,5–3 min senare. */
  duplicateRate: 0.008,
  /** LPR missade → arrivedAt saknas, incheckning används (D1). */
  lprMissRate: 0.01,
  /** Lossningsslut aldrig registrerat. */
  missingUnloadEndRate: 0.02,
  /** Lossningstider manuellt inmatade på jämn kvart. */
  manualRoundRate: 0.01,
  /** Andel av de manuella som också syns i auditloggen (manuallyEdited). */
  manualAuditedShare: 0.5,
  /** Lossningsstart/-slut omkastade. */
  outOfOrderRate: 0.003,
  /** Orimligt kort lossning (0,5 min). */
  shortOutlierRate: 0.0008,
  /** Orimligt lång lossning (9 h). */
  longOutlierRate: 0.0008,
  /** Antal hela dagar där alla lossningstider matades in manuellt (t.ex. systemavbrott). */
  manualDays: 1,
} as const;

export interface SyntheticOptions {
  tenantId: string;
  siteId: string;
  tz: string;
  startDate: string;
  days: number;
  seed: string;
}

const SYNTH_STRATEGY: StrategyConfig = { kind: "fcfs", onTimeToleranceMin: 15 };
/** Kostnader påverkar inte tidsförloppet; noll här. */
const SYNTH_COST: CostConfig = { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 0 };

/** Motorns sajtkonfiguration för den syntetiska sanningen (D1..Dn). */
export function syntheticSiteConfig(truth: SyntheticSiteTruth): SiteConfig {
  return {
    doors: Array.from({ length: truth.doors }, (_, i) => ({ id: `D${i + 1}` })),
    gateLanes: truth.gateLanes,
    parkingSpaces: Infinity,
    openFrom: truth.openFrom,
    openTo: truth.openTo,
    allowOvertime: true,
  };
}

function pickWeighted<T extends { share: number }>(rng: Rng, items: readonly T[]): T {
  const total = items.reduce((a, b) => a + b.share, 0);
  let u = rng.next() * total;
  for (const it of items) {
    u -= it.share;
    if (u < 0) return it;
  }
  return items[items.length - 1];
}

function sampleHour(rng: Rng, shape: readonly number[]): number {
  const total = shape.reduce((a, b) => a + b, 0);
  let u = rng.next() * total;
  for (let h = 0; h < 24; h++) {
    u -= shape[h];
    if (u < 0) return h * 60 + rng.next() * 60;
  }
  return 23 * 60 + rng.next() * 60;
}

/** Sann lossningstid (min) för en lastbil enligt sanningen. Används även av tester. */
export function sampleTruthUnload(truth: SyntheticSiteTruth, goodsType: string, pallets: number, rng: Rng): number {
  const g = truth.goodsTypes.find((x) => x.key === goodsType) ?? truth.goodsTypes[0];
  return (g.unloadA + g.unloadB * pallets) * Math.exp(truth.unloadLogSigma * rng.normal());
}

/** Avrunda till hel sekund (i minuter) – samma upplösning som tidsstämplarna. */
const sec = (m: number) => Math.round(m * 60) / 60;

interface Planned {
  k: number;
  booked: boolean;
  slotStart: number | null;
  bookedLeadMin: number | null;
  outcome: "arrive" | "no_show" | "cancelled";
  cancelLeadMin: number | null;
  arrival: number;
  carrier: string;
  goodsType: string;
  pallets: number;
  gate: number;
  unload: number;
  paper: number;
}

function planDay(truth: SyntheticSiteTruth, date: string, seed: string): Planned[] {
  const wd = isoWeekdayOf(date);
  const mult = truth.weekdayMultiplier[wd - 1] ?? 0;
  if (!(mult > 0)) return [];
  const rng = Rng.stream(seed, "day", date);
  const n = rng.poisson(truth.meanPlannedPerDay * mult);
  const lastSlot = truth.openTo - truth.slotLengthMin;
  const out: Planned[] = [];
  for (let k = 0; k < n; k++) {
    // Fast antal slumptal per lastbil i samma ordning → stabila strömmar.
    const desired = sampleHour(rng, truth.hourlyShape);
    const booked = rng.bernoulli(truth.bookedShare);
    const uCancel = rng.next();
    const uNoShow = rng.next();
    const uLateCancel = rng.next();
    const bookedLeadMin = rng.uniform(30 * 60, 7 * 24 * 60);
    const uCancelLead = rng.next();
    const uOnTime = rng.next();
    const uEarly = rng.next();
    const onTimeDev = rng.uniform(-15, 15);
    const tail = -Math.log(1 - rng.next());
    const carrier = pickWeighted(rng, truth.carriers).key;
    const goods = pickWeighted(rng, truth.goodsTypes).key;
    const pallets = truth.palletsMin + rng.int(truth.palletsMax - truth.palletsMin + 1);
    const unload = sampleTruthUnload(truth, goods, pallets, rng);
    const gate = rng.uniform(truth.gateMin.min, truth.gateMin.max);
    const paper = rng.uniform(truth.paperMin.min, truth.paperMin.max);

    let slotStart: number | null = null;
    let arrival = desired;
    let outcome: Planned["outcome"] = "arrive";
    let cancelLeadMin: number | null = null;
    if (booked) {
      slotStart = Math.min(lastSlot, Math.max(truth.openFrom, Math.floor(desired / truth.slotLengthMin) * truth.slotLengthMin));
      let dev: number;
      if (uOnTime < truth.onTimeShare) dev = onTimeDev;
      else if (uEarly < truth.earlyShareOfOffTime) dev = -(15 + Math.min(165, tail * truth.earlyTailMeanMin));
      else dev = 15 + Math.min(285, tail * truth.lateTailMeanMin);
      arrival = slotStart + dev;
      if (uCancel < truth.cancellationRate) {
        outcome = "cancelled";
        cancelLeadMin =
          uLateCancel < truth.lateCancellationShare
            ? 60 + uCancelLead * (23 * 60 - 60)
            : 25 * 60 + uCancelLead * Math.max(0, bookedLeadMin - 26 * 60);
      } else if (uNoShow < truth.noShowRate) {
        outcome = "no_show";
      }
    }
    out.push({
      k,
      booked,
      slotStart,
      bookedLeadMin: booked ? bookedLeadMin : null,
      outcome,
      cancelLeadMin,
      arrival: sec(Math.max(0, arrival)),
      carrier,
      goodsType: goods,
      pallets,
      gate: sec(gate),
      unload: sec(Math.max(1 / 60, unload)),
      paper: sec(paper),
    });
  }
  return out;
}

function visitIdFor(seed: string, date: string, k: number): string {
  return "v" + stableHash(`${seed}|${date}|${k}`).slice(0, 12);
}

/**
 * Genererar syntetiska besök: planerar dagens bokningar och ankomster med seedad Rng, kör sedan
 * MOTORN (FCFS, detail) för att få realistiska dörr-, lossnings- och avgångstider, och injicerar
 * därefter brus (SYNTHETIC_NOISE). Output sorterad på visitId. Inga registreringsnummer förekommer.
 */
export function generateSyntheticVisits(truth: SyntheticSiteTruth, opts: SyntheticOptions): Visit[] {
  const site = syntheticSiteConfig(truth);
  const visits: Visit[] = [];
  const operatingDays: string[] = [];
  const dateOf = new Map<Visit, string>();
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.startDate, i);
    const plan = planDay(truth, date, opts.seed);
    if (plan.length === 0) continue;
    operatingDays.push(date);
    const arriving = plan.filter((p) => p.outcome === "arrive");
    const trucks: Truck[] = arriving.map((p) => ({
      id: String(p.k),
      arrival: p.arrival,
      slotStart: p.slotStart,
      slotEnd: p.slotStart === null ? null : p.slotStart + truth.slotLengthMin,
      carrier: p.carrier,
      goodsType: p.goodsType,
      pallets: p.pallets,
      gateTime: p.gate,
      unloadTime: p.unload,
      paperTime: p.paper,
    }));
    const res = simulateDay(trucks, site, SYNTH_STRATEGY, SYNTH_COST, { detail: true });
    const byK = new Map(res.trucks.map((o) => [Number(o.id), o]));
    const iso = (m: number | null) => (m === null || !Number.isFinite(m) ? null : localToIso(date, m, opts.tz));

    for (const p of plan) {
      const o = byK.get(p.k);
      const slotStart = p.slotStart;
      const base: Visit = {
        visitId: visitIdFor(opts.seed, date, p.k),
        tenantId: opts.tenantId,
        siteId: opts.siteId,
        siteTimeZone: opts.tz,
        carrierKey: p.carrier,
        goodsType: p.goodsType,
        pallets: p.pallets,
        bookedAt: slotStart !== null ? iso(slotStart - p.bookedLeadMin!) : null,
        cancelledAt: p.outcome === "cancelled" ? iso(slotStart! - p.cancelLeadMin!) : null,
        slotStart: iso(slotStart),
        slotEnd: slotStart !== null ? iso(slotStart + truth.slotLengthMin) : null,
        arrivedAt: null,
        checkedInAt: null,
        doorAssignedAt: null,
        doorId: null,
        unloadStart: null,
        unloadEnd: null,
        departedAt: null,
        status: p.outcome === "cancelled" ? "cancelled" : p.outcome === "no_show" ? "no_show" : "unknown",
        manuallyEdited: [],
      };
      if (o) {
        base.arrivedAt = iso(o.arrival);
        base.checkedInAt = iso(o.gateEnd);
        base.doorAssignedAt = iso(o.doorStart);
        base.doorId = o.doorId;
        base.unloadStart = iso(o.doorStart);
        base.unloadEnd = iso(o.doorEnd);
        base.departedAt = iso(o.departure);
        base.status = o.departure !== null ? "completed" : "in_progress";
      }
      visits.push(base);
      dateOf.set(base, date);
    }
  }
  injectNoise(visits, dateOf, operatingDays, opts);
  return visits.sort((a, b) => (a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0));
}

const QUARTER_MS = 15 * 60_000;
const isoMs = (ms: number) => new Date(ms).toISOString().replace(/\.000Z$/, "Z");
const shiftIso = (iso: string, min: number) => isoMs(Date.parse(iso) + Math.round(min * 60) * 1000);

function injectNoise(visits: Visit[], dateOf: ReadonlyMap<Visit, string>, operatingDays: readonly string[], opts: SyntheticOptions): void {
  const rng = Rng.stream(opts.seed, "noise");
  const N = SYNTHETIC_NOISE;

  // Hela dagar med manuellt inmatade tider (systemavbrott).
  const manualDays = new Set<string>();
  for (let i = 0; i < N.manualDays && operatingDays.length > 0; i++) manualDays.add(operatingDays[rng.int(operatingDays.length)]);

  const extra: Visit[] = [];
  for (const v of visits) {
    // Fast antal slumptal per besök.
    const u = Array.from({ length: 9 }, () => rng.next());
    const dupShift = 0.5 + u[8] * 2.5;
    if (v.status !== "completed" || !v.arrivedAt || !v.unloadStart || !v.unloadEnd) continue;

    if (manualDays.has(dateOf.get(v)!)) {
      roundManual(v);
      continue;
    }
    if (u[0] < N.manualRoundRate) {
      roundManual(v);
      if (u[1] < N.manualAuditedShare) v.manuallyEdited = ["unloadStart", "unloadEnd"];
    } else if (u[2] < N.outOfOrderRate) {
      [v.unloadStart, v.unloadEnd] = [v.unloadEnd, v.unloadStart];
    } else if (u[3] < N.shortOutlierRate) {
      v.unloadEnd = shiftIso(v.unloadStart, 0.5);
    } else if (u[4] < N.longOutlierRate) {
      const paper = (Date.parse(v.departedAt!) - Date.parse(v.unloadEnd)) / 60_000;
      v.unloadEnd = shiftIso(v.unloadStart, 9 * 60);
      v.departedAt = shiftIso(v.unloadEnd, paper);
    } else if (u[5] < N.missingUnloadEndRate) {
      v.unloadEnd = null;
    }
    if (u[6] < N.lprMissRate) v.arrivedAt = null;
    if (u[7] < N.duplicateRate && v.arrivedAt) {
      extra.push({ ...v, visitId: "v" + stableHash(`${opts.seed}|dup|${v.visitId}`).slice(0, 12), arrivedAt: shiftIso(v.arrivedAt, dupShift), manuallyEdited: [...v.manuallyEdited] });
    }
  }
  visits.push(...extra);
}

/** Manuellt inmatade tider: närmaste kvart, men aldrig före incheckning och alltid start < slut. */
function roundManual(v: Visit): void {
  const q = (ms: number, f: (x: number) => number) => f(ms / QUARTER_MS) * QUARTER_MS;
  const floorAt = Date.parse(v.checkedInAt ?? v.arrivedAt!);
  let s = q(Date.parse(v.unloadStart!), Math.round);
  if (s < floorAt) s = q(floorAt, Math.ceil);
  let e = q(Date.parse(v.unloadEnd!), Math.round);
  if (e <= s) e = s + QUARTER_MS;
  v.unloadStart = isoMs(s);
  v.doorAssignedAt = v.unloadStart;
  v.unloadEnd = isoMs(e);
  if (v.departedAt) {
    const d = Math.ceil(Math.max(Date.parse(v.departedAt), e) / QUARTER_MS) * QUARTER_MS;
    v.departedAt = isoMs(d);
  }
}
