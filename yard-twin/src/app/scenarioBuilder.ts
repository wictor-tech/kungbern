import type { RecordedDay } from "../data/contract.ts";
import type { SiteModel } from "../engine/model.ts";
import type { ScenarioFile } from "../engine/scenario.ts";
import { UNLIMITED_GATE_LANES } from "../analysis/calibrationSummary.ts";
import type { Controls, Dataset } from "./types.ts";

/**
 * ANTAGANDEN för demoläget. Visas alltid som "Antagande" i UI och i PDF-rapporten och kan ändras.
 * Ersätts med kundens egna siffror i ett kundmöte.
 */
export const DEMO_COST_ASSUMPTIONS = {
  currency: "SEK" as const,
  detentionFreeMin: 60,
  detentionCostPerHour: 600,
  staffCostPerHour: 450,
  costSource: "Antagande för demo – ersätt med kundens siffror",
};

export function dayOf(ds: Dataset, date: string): RecordedDay | undefined {
  return ds.days.find((d) => d.date === date);
}

/** Profil för dagens veckodag om den finns, annars "all". */
export function modelFor(ds: Dataset, date: string): SiteModel {
  const d = dayOf(ds, date);
  const key = d ? `weekday:${d.isoWeekday}` : "all";
  return ds.profiles[key] ?? ds.profiles.all ?? Object.values(ds.profiles)[0];
}

export function defaultControls(ds: Dataset): Controls {
  const day = ds.days[Math.floor(ds.days.length * 0.85)] ?? ds.days[ds.days.length - 1];
  const model = day ? modelFor(ds, day.date) : Object.values(ds.profiles)[0];
  // Bokningsbehov = ankomster / (1 − no-show), eftersom även no-shows tar en slot.
  const daily = model.hourlyArrivals.reduce((a, b) => a + b, 0) / Math.max(0.01, 1 - model.noShowRate);
  const openH = hours(ds.site.open, ds.site.close);
  return {
    mode: "replay",
    date: day?.date ?? "",
    pattern: "recorded",
    volumeFactor: 1,
    doors: day?.doorsObserved ?? ds.site.doors,
    gateLanes: 0,
    parkingSpaces: null,
    open: ds.site.open,
    close: ds.site.close,
    allowOvertime: true,
    strategy: "fcfs",
    adherence: null,
    slotLengthMin: 30,
    // Bokningsbar kapacitet = historisk dagsvolym jämnt utslagen + 20 % marginal (startvärde, ändras i UI).
    capacityPerHour: Math.max(1, Math.ceil((daily / Math.max(1, openH)) * 1.2)),
    toleranceMin: 15,
    burstFrom: "07:00",
    burstTo: "09:00",
    burstMultiplier: 2,
    ...DEMO_COST_ASSUMPTIONS,
    baseline: model.arrivalDays?.length ? "historical" : "poisson",
    reps: 300,
  };
}

function hours(open: string, close: string): number {
  const p = (s: string) => Number(s.slice(0, 2)) + Number(s.slice(3, 5)) / 60;
  return p(close) - p(open);
}

export function buildScenario(c: Controls, ds: Dataset, id = "ui"): ScenarioFile {
  const replay = c.mode === "replay";
  const pattern = replay ? "recorded" : c.pattern;
  return {
    schemaVersion: 1,
    id,
    name: replay ? `Replay ${c.date}` : `What if ${c.date}`,
    siteId: ds.site.siteId,
    date: c.date,
    dayType: modelFor(ds, c.date).dayType,
    arrivals: {
      pattern,
      volumeFactor: replay ? 1 : c.volumeFactor,
      serviceTimes: replay ? "recorded" : "sampled",
      ...(pattern === "booked"
        ? { slot: { lengthMin: c.slotLengthMin, capacityPerHour: c.capacityPerHour, from: c.open, to: c.close, adherence: c.adherence, toleranceMin: c.toleranceMin } }
        : {}),
      ...(pattern === "burst" ? { burst: { from: c.burstFrom, to: c.burstTo, multiplier: c.burstMultiplier } } : {}),
    },
    site: {
      doors: replay ? (dayOf(ds, c.date)?.doorsObserved ?? c.doors) : c.doors,
      // 0 = obegränsat: grindtiden från data innehåller redan grindkön (beslut D20).
      gateLanes: replay || c.gateLanes === 0 ? UNLIMITED_GATE_LANES : c.gateLanes,
      parkingSpaces: c.parkingSpaces,
      open: c.open,
      close: c.close,
      allowOvertime: c.allowOvertime,
    },
    strategy: { kind: replay ? "fcfs" : c.strategy, onTimeToleranceMin: c.toleranceMin, priorities: { frys: 2, kyl: 1 } },
    costs: {
      currency: c.currency,
      detentionFreeMin: c.detentionFreeMin,
      detentionCostPerHour: c.detentionCostPerHour,
      staffCostPerHour: c.staffCostPerHour,
      source: c.costSource,
    },
    monteCarlo: { reps: replay ? 1 : c.reps, seed: `${ds.site.siteId}|${c.date}` },
  };
}

/** Samma scenario men med slottbokning – används i jämförelsevyn och ROI. */
export function withBooking(s: ScenarioFile, c: Controls): ScenarioFile {
  return {
    ...s,
    id: `${s.id}-booked`,
    name: `${s.name} + slottbokning`,
    arrivals: {
      pattern: "booked",
      volumeFactor: s.arrivals.volumeFactor,
      slot: { lengthMin: c.slotLengthMin, capacityPerHour: c.capacityPerHour, from: c.open, to: c.close, adherence: c.adherence, toleranceMin: c.toleranceMin },
    },
    strategy: { ...s.strategy, kind: "booked-first" },
    monteCarlo: { reps: c.reps, seed: s.monteCarlo?.seed ?? s.id },
  };
}

/**
 * Utgångsläge för jämförelse och ROI:
 *  - "historical" (standard): sajtens egna historiska ankomstmönster – "som i dag", inkl. dagens bokningsandel.
 *  - "poisson": slumpmässiga ankomster enligt timprofilen – hypotetiskt läge utan någon bokning.
 */
export function withoutBooking(s: ScenarioFile, c: Controls): ScenarioFile {
  return {
    ...s,
    id: `${s.id}-${c.baseline}`,
    name: c.baseline === "historical" ? "Som i dag" : "Ingen bokning",
    arrivals: { pattern: c.baseline, volumeFactor: s.arrivals.volumeFactor },
    strategy: { ...s.strategy, kind: c.strategy === "booked-first" ? "fcfs" : c.strategy },
    monteCarlo: { reps: c.reps, seed: s.monteCarlo?.seed ?? s.id },
  };
}

/** Dela-länk: scenariots kontroller kodas i URL-hashen (inga data, bara inställningar). */
export function encodeShare(c: Controls): string {
  const json = JSON.stringify(c);
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `#s=${b64}`;
}

export function decodeShare(hash: string): Partial<Controls> | null {
  const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}
