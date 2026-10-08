import type { Visit } from "./contract.ts";

/** Fälten i Visit-kontraktet i kanonisk ordning (CSV-kolumner, kompletteringsrapport). */
export const VISIT_FIELDS = [
  "visitId",
  "tenantId",
  "siteId",
  "siteTimeZone",
  "carrierKey",
  "goodsType",
  "pallets",
  "bookedAt",
  "cancelledAt",
  "slotStart",
  "slotEnd",
  "arrivedAt",
  "checkedInAt",
  "doorAssignedAt",
  "doorId",
  "unloadStart",
  "unloadEnd",
  "departedAt",
  "status",
  "manuallyEdited",
] as const satisfies readonly (keyof Visit)[];

// Kompileringskontroll: listan måste täcka alla fält i kontraktet.
type Missing = Exclude<keyof Visit, (typeof VISIT_FIELDS)[number]>;
const _complete: Missing extends never ? true : never = true;
void _complete;
