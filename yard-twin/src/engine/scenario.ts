import type { ArrivalSpec } from "./arrivals.ts";
import { parseClock } from "./time.ts";
import type { CostConfig, DoorSpec, SiteConfig, StrategyConfig, StrategyKind } from "./types.ts";

export const SCENARIO_SCHEMA_VERSION = 1;

/** Scenariofil (JSON). Allt som påverkar resultatet finns här, så att en körning kan återskapas exakt. */
export interface ScenarioFile {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  siteId: string;
  /** Profil att använda, t.ex. "weekday:2" (ISO-veckodag) eller "all". */
  dayType?: string;
  /** Datum (YYYY-MM-DD) för mönstret "recorded". */
  date?: string;
  arrivals: {
    pattern: "recorded" | "booked" | "poisson" | "burst" | "historical";
    volumeFactor: number;
    serviceTimes?: "recorded" | "sampled";
    slot?: {
      lengthMin: number;
      capacityPerHour: number;
      from: string;
      to: string;
      adherence: number | null;
      toleranceMin: number;
    };
    burst?: { from: string; to: string; multiplier: number };
  };
  site: {
    doors: number | { id: string; goodsTypes?: string[] }[];
    gateLanes: number;
    /** null = obegränsat */
    parkingSpaces: number | null;
    open: string;
    close: string;
    allowOvertime: boolean;
  };
  strategy: {
    kind: StrategyKind;
    priorities?: Record<string, number>;
    onTimeToleranceMin: number;
  };
  costs: {
    currency: "SEK" | "EUR";
    detentionFreeMin: number;
    detentionCostPerHour: number;
    /** Personalkostnad per timme övertid (för ROI). */
    staffCostPerHour?: number;
    /** Varifrån kostnaderna kommer – obligatoriskt så att ingen siffra är anonym. */
    source: string;
  };
  unloadTimeFactor?: number;
  monteCarlo?: { reps: number; seed: string };
}

export interface CompiledScenario {
  file: ScenarioFile;
  site: SiteConfig;
  strategy: StrategyConfig;
  cost: CostConfig;
  arrivals: ArrivalSpec;
  unloadFactor: number;
  reps: number;
  seed: string;
}

export const DEFAULT_REPS = 300;
const KINDS: StrategyKind[] = ["fcfs", "booked-first", "priority", "specialized"];
const PATTERNS = ["recorded", "booked", "poisson", "burst", "historical"] as const;

/** Validerar och returnerar en lista med fel på svenska (tom = OK). */
export function validateScenario(x: unknown): string[] {
  const e: string[] = [];
  const s = x as ScenarioFile;
  if (!s || typeof s !== "object") return ["Scenariot måste vara ett JSON-objekt"];
  if (s.schemaVersion !== SCENARIO_SCHEMA_VERSION) e.push(`schemaVersion måste vara ${SCENARIO_SCHEMA_VERSION}`);
  if (!nonEmpty(s.id)) e.push("id saknas");
  if (!nonEmpty(s.name)) e.push("name saknas");
  if (!nonEmpty(s.siteId)) e.push("siteId saknas");

  const a = s.arrivals;
  if (!a) e.push("arrivals saknas");
  else {
    if (!PATTERNS.includes(a.pattern)) e.push(`arrivals.pattern måste vara en av ${PATTERNS.join(", ")}`);
    if (!(a.volumeFactor > 0 && a.volumeFactor <= 10)) e.push("arrivals.volumeFactor måste vara i (0, 10]");
    if (a.pattern === "recorded" && !nonEmpty(s.date)) e.push('date krävs för mönstret "recorded"');
    if (a.pattern === "booked") {
      const sl = a.slot;
      if (!sl) e.push('arrivals.slot krävs för mönstret "booked"');
      else {
        if (!(sl.lengthMin >= 5 && sl.lengthMin <= 240)) e.push("slot.lengthMin måste vara 5–240");
        if (!(sl.capacityPerHour > 0)) e.push("slot.capacityPerHour måste vara > 0");
        if (sl.adherence !== null && !(sl.adherence >= 0 && sl.adherence <= 1)) e.push("slot.adherence måste vara 0–1 eller null");
        if (!(sl.toleranceMin >= 0)) e.push("slot.toleranceMin måste vara >= 0");
        clock(e, "slot.from", sl.from);
        clock(e, "slot.to", sl.to);
      }
    }
    if (a.pattern === "burst") {
      if (!a.burst) e.push('arrivals.burst krävs för mönstret "burst"');
      else {
        clock(e, "burst.from", a.burst.from);
        clock(e, "burst.to", a.burst.to);
        if (!(a.burst.multiplier >= 1)) e.push("burst.multiplier måste vara >= 1");
      }
    }
  }

  const st = s.site;
  if (!st) e.push("site saknas");
  else {
    if (typeof st.doors === "number") {
      if (!(Number.isInteger(st.doors) && st.doors >= 1 && st.doors <= 200)) e.push("site.doors måste vara ett heltal 1–200");
    } else if (!Array.isArray(st.doors) || st.doors.length === 0) e.push("site.doors måste vara ett tal eller en lista");
    if (!(Number.isInteger(st.gateLanes) && st.gateLanes >= 1)) e.push("site.gateLanes måste vara ett heltal >= 1");
    if (st.parkingSpaces !== null && !(st.parkingSpaces >= 0)) e.push("site.parkingSpaces måste vara >= 0 eller null");
    clock(e, "site.open", st.open);
    clock(e, "site.close", st.close);
    if (e.length === 0 && parseClock(st.close) <= parseClock(st.open)) e.push("site.close måste vara efter site.open");
  }

  if (!s.strategy || !KINDS.includes(s.strategy.kind)) e.push(`strategy.kind måste vara en av ${KINDS.join(", ")}`);
  else if (!(s.strategy.onTimeToleranceMin >= 0)) e.push("strategy.onTimeToleranceMin måste vara >= 0");

  const c = s.costs;
  if (!c) e.push("costs saknas");
  else {
    if (c.currency !== "SEK" && c.currency !== "EUR") e.push("costs.currency måste vara SEK eller EUR");
    if (!(c.detentionFreeMin >= 0)) e.push("costs.detentionFreeMin måste vara >= 0");
    if (!(c.detentionCostPerHour >= 0)) e.push("costs.detentionCostPerHour måste vara >= 0");
    if (!nonEmpty(c.source)) e.push("costs.source måste anges (varifrån kommer kostnaderna?)");
  }
  if (s.unloadTimeFactor !== undefined && !(s.unloadTimeFactor > 0)) e.push("unloadTimeFactor måste vara > 0");
  if (s.monteCarlo && !(Number.isInteger(s.monteCarlo.reps) && s.monteCarlo.reps >= 1 && s.monteCarlo.reps <= 5000)) {
    e.push("monteCarlo.reps måste vara 1–5000");
  }
  return e;
}

export function compileScenario(s: ScenarioFile): CompiledScenario {
  const errors = validateScenario(s);
  if (errors.length) throw new Error(`Ogiltigt scenario "${s?.id}": ${errors.join("; ")}`);
  const doors: DoorSpec[] =
    typeof s.site.doors === "number"
      ? Array.from({ length: s.site.doors }, (_, i) => ({ id: `D${i + 1}` }))
      : s.site.doors.map((d) => ({ id: d.id, goodsTypes: d.goodsTypes ?? null }));
  const a = s.arrivals;
  let arrivals: ArrivalSpec;
  switch (a.pattern) {
    case "recorded":
      arrivals = { pattern: "recorded", volumeFactor: a.volumeFactor, serviceTimes: a.serviceTimes ?? "recorded" };
      break;
    case "poisson":
      arrivals = { pattern: "poisson", volumeFactor: a.volumeFactor };
      break;
    case "historical":
      arrivals = { pattern: "historical", volumeFactor: a.volumeFactor };
      break;
    case "burst":
      arrivals = { pattern: "burst", volumeFactor: a.volumeFactor, burst: { from: parseClock(a.burst!.from), to: parseClock(a.burst!.to), multiplier: a.burst!.multiplier } };
      break;
    case "booked": {
      const sl = a.slot!;
      arrivals = {
        pattern: "booked",
        volumeFactor: a.volumeFactor,
        slot: { lengthMin: sl.lengthMin, capacityPerHour: sl.capacityPerHour, from: parseClock(sl.from), to: parseClock(sl.to), adherence: sl.adherence, toleranceMin: sl.toleranceMin },
      };
      break;
    }
  }
  return {
    file: s,
    site: {
      doors,
      gateLanes: s.site.gateLanes,
      parkingSpaces: s.site.parkingSpaces ?? Infinity,
      openFrom: parseClock(s.site.open),
      openTo: parseClock(s.site.close),
      allowOvertime: s.site.allowOvertime,
    },
    strategy: { kind: s.strategy.kind, priorities: s.strategy.priorities, onTimeToleranceMin: s.strategy.onTimeToleranceMin },
    cost: { currency: s.costs.currency, detentionFreeMin: s.costs.detentionFreeMin, detentionCostPerHour: s.costs.detentionCostPerHour },
    arrivals,
    unloadFactor: s.unloadTimeFactor ?? 1,
    reps: s.monteCarlo?.reps ?? DEFAULT_REPS,
    seed: s.monteCarlo?.seed ?? s.id,
  };
}

/** Stabil hash av scenarioinnehållet – används som versions-id för sparade körningar. */
export function scenarioHash(s: ScenarioFile): string {
  const json = stableStringify(s);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

function nonEmpty(x: unknown): boolean {
  return typeof x === "string" && x.trim().length > 0;
}

function clock(e: string[], field: string, v: unknown): void {
  try {
    if (typeof v !== "string") throw new Error();
    parseClock(v);
  } catch {
    e.push(`${field} måste vara HH:MM`);
  }
}
