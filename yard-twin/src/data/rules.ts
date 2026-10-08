import type { Visit } from "./contract.ts";

/**
 * DOMÄNBESLUT för datalagret (Fas 1). Ändras bara genom ett nytt beslut – värdena visas i
 * datakvalitetsrapporten och styr kalibreringen.
 */

/**
 * BESLUT D1 – ankomst = första LPR-läsning vid grind (`arrivedAt`).
 * Saknas den används `checkedInAt` som reserv. Det flaggas inte på besöket men räknas i
 * kvalitetsrapporten som "arrival_from_checkin".
 */
export const ARRIVAL_FROM_CHECKIN_KEY = "arrival_from_checkin";

/** BESLUT D2 – i tid = ankomst inom ±15 min från slotstart. Tidig < −15, sen > +15. */
export const ON_TIME_TOLERANCE_MIN = 15;

/** BESLUT D4 – sen avbokning = avbokad mindre än 24 h före slotstart. */
export const LATE_CANCELLATION_HOURS = 24;

/** BESLUT – minsta antal driftdagar för att en sajt ska vara lämplig för kalibrering. */
export const MIN_CALIBRATION_DAYS = 90;
/** BESLUT – minsta antal inkluderade besök för att en sajt ska vara lämplig för kalibrering. */
export const MIN_CALIBRATION_VISITS = 500;
/** BESLUT – en veckodagsprofil (weekday:n) byggs bara om veckodagen har minst så många driftdagar. */
export const MIN_DAYS_PER_WEEKDAY_PROFILE = 8;

/** BESLUT – en lucka i data = minst så många saknade driftdagar i följd (på veckodagar som normalt har trafik). */
export const GAP_MIN_RUN_DAYS = 3;
/** BESLUT – en veckodag "har normalt trafik" om minst denna andel av dess datum i perioden har besök. */
export const NORMAL_TRAFFIC_WEEKDAY_SHARE = 0.5;
/** BESLUT – antal extremvärden som listas i kvalitetsrapporten. */
export const OUTLIER_LIST_SIZE = 20;
/** BESLUT – minsta antal tidsstämplar en dag måste ha för att bedömas som misstänkt manuell. */
export const MIN_TIMESTAMPS_FOR_MANUAL_DAY = 10;

/** BESLUT – rimlighetsgränser för urval till kalibrering (min). Värden utanför används inte. */
export const CALIB_GATE_MAX_MIN = 120;
export const CALIB_PAPER_MAX_MIN = 240;
export const CALIB_SLOT_DEVIATION_MAX_MIN = 480;

/** Etikett när transportör/godstyp saknas i data. */
export const UNKNOWN_LABEL = "okänd";

export type SlotClass = "early" | "on_time" | "late";

/** D1: effektiv ankomsttid (ISO) och dess källa. */
export function arrivalOf(v: Visit): { iso: string | null; source: "lpr" | "checkin" | null } {
  if (v.arrivedAt) return { iso: v.arrivedAt, source: "lpr" };
  if (v.checkedInAt) return { iso: v.checkedInAt, source: "checkin" };
  return { iso: null, source: null };
}

/** D2: klassning av slotavvikelse (ankomst − slotstart, min). */
export function slotClass(deviationMin: number): SlotClass {
  if (deviationMin < -ON_TIME_TOLERANCE_MIN) return "early";
  if (deviationMin > ON_TIME_TOLERANCE_MIN) return "late";
  return "on_time";
}

export function isCancelled(v: Visit): boolean {
  return v.status === "cancelled" || v.cancelledAt !== null;
}

/** Bokad = har en slot. */
export function isBooked(v: Visit): boolean {
  return v.slotStart !== null;
}

/**
 * D3: no-show = bokad, ej avbokad, ingen ankomst. Status "no_show" räcker, annars krävs att
 * slotstart finns och att ingen ankomst (efter D1-reserven checkedInAt) finns.
 */
export function isNoShow(v: Visit): boolean {
  if (isCancelled(v)) return false;
  if (v.status === "no_show") return true;
  return isBooked(v) && arrivalOf(v).iso === null;
}

/** D4: avbokad mindre än LATE_CANCELLATION_HOURS före slotstart. */
export function isLateCancellation(v: Visit): boolean {
  if (!v.cancelledAt || !v.slotStart) return false;
  const lead = Date.parse(v.slotStart) - Date.parse(v.cancelledAt);
  return lead < LATE_CANCELLATION_HOURS * 3600_000;
}
