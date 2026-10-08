/**
 * DATAKONTRAKT – normaliserad tabell `visits` (version 1).
 *
 * Det här är Yard Twins egen, källoberoende tabell. En adapter per källsystem (LUPNUMBER-plattformens
 * tabeller, CSV-export m.m.) mappar källan hit. Fältnamnen i källan är INTE kända ännu (se
 * docs/yard-twin/fas0-kartlaggning.md); adaptern skrivs när schemat är verifierat.
 *
 * Tidsregler:
 *  - Alla tidsstämplar lagras som ISO 8601 i UTC ("2026-03-29T06:12:00Z").
 *  - `siteTimeZone` (IANA, t.ex. "Europe/Stockholm") används för att räkna lokal servicedag och
 *    minuter sedan lokal midnatt. Sommartid hanteras via Intl, aldrig via fast offset.
 *
 * Integritet:
 *  - Registreringsnummer, förarnamn och kundnamn finns aldrig i denna tabell. `visitId` och
 *    `carrierKey` är pseudonymer (salted hash i källmiljön).
 */
export const VISITS_SCHEMA_VERSION = 1;

export type VisitStatus = "completed" | "no_show" | "cancelled" | "in_progress" | "unknown";

export interface Visit {
  visitId: string;
  tenantId: string;
  siteId: string;
  siteTimeZone: string;
  carrierKey: string | null;
  goodsType: string | null;
  pallets: number | null;
  bookedAt: string | null;
  cancelledAt: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  /** Första LPR-läsning vid grind (beslut D1 i docs). */
  arrivedAt: string | null;
  checkedInAt: string | null;
  doorAssignedAt: string | null;
  doorId: string | null;
  unloadStart: string | null;
  unloadEnd: string | null;
  departedAt: string | null;
  status: VisitStatus;
  /** Fält vars tid satts/ändrats manuellt enligt källans auditlogg, om sådan finns. */
  manuallyEdited: string[];
}

/** Orsaker till att en post exkluderas eller flaggas i datakvalitetsrapporten. */
export type QualityIssue =
  | "duplicate"
  | "missing_arrival"
  | "missing_unload"
  | "unload_too_short"
  | "unload_too_long"
  | "out_of_order"
  | "negative_duration"
  | "dst_day"
  | "suspected_manual_time"
  | "manually_edited"
  | "outside_window";

/** Härledd, berikad besöksrad (output från pipelinen, input till kalibrering). */
export interface DerivedVisit {
  visit: Visit;
  /** Lokal servicedag YYYY-MM-DD. */
  serviceDate: string;
  /** ISO-veckodag 1 = måndag … 7 = söndag. */
  isoWeekday: number;
  /** Minuter sedan lokal midnatt. */
  arrivalMin: number | null;
  slotStartMin: number | null;
  slotEndMin: number | null;
  checkInMin: number | null;
  unloadStartMin: number | null;
  unloadEndMin: number | null;
  departMin: number | null;
  /** Väntan till dörr = lossningsstart − ankomst. */
  waitToDoor: number | null;
  unloadMin: number | null;
  gateMin: number | null;
  paperMin: number | null;
  timeOnYard: number | null;
  /** Ankomst − slotstart. */
  slotDeviation: number | null;
  issues: QualityIssue[];
  /** true = används i kalibrering. */
  included: boolean;
}

/** Inställbara datakvalitetsgränser. Ändras bara med motivering (de visas i rapporten). */
export interface QualityRules {
  minUnloadMin: number;
  maxUnloadMin: number;
  /** Två besök med samma pseudonyma visitId eller samma (carrier, ankomst inom N min, dörr) = dubblett. */
  duplicateWindowMin: number;
  /** Andel av tidsstämplarna på en dag som är exakt :00/:15/:30/:45 med sekund 0 – över gränsen flaggas dagen. */
  roundTimeShareThreshold: number;
  /** Minsta antal observationer i ett segment innan segmentet får en egen fördelning. */
  minSegmentN: number;
  /** k-anonymitet: segment med färre besök får inte exporteras till demo. */
  kAnonymity: number;
}

export const DEFAULT_QUALITY_RULES: QualityRules = {
  minUnloadMin: 1,
  maxUnloadMin: 8 * 60,
  duplicateWindowMin: 10,
  roundTimeShareThreshold: 0.5,
  minSegmentN: 30,
  kAnonymity: 20,
};
