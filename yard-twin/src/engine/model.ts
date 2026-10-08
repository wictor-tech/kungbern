import type { Minutes } from "./time.ts";

/** Ursprung för en parameter. Allt som visas i UI ska kunna spåras till data eller ett märkt antagande. */
export interface Provenance {
  kind: "measured" | "assumption";
  /** Klartext: tabell/period för mätt, eller vem/vad som angav antagandet. */
  source: string;
  /** Antal observationer bakom en mätt parameter. */
  n?: number;
}

/** Ett observerat besök som bootstrap-urval: attribut och lossningstid hålls ihop, så korrelationen bevaras. */
export interface VisitSample {
  carrier: string;
  goodsType: string;
  pallets: number | null;
  unloadMin: number;
}

/**
 * Kalibrerad modell för en sajt och en dagtyp, alltså innehållet i site_profile.
 * Den innehåller bara aggregat och empiriska urval utan identiteter, så den får användas i demoläge
 * efter k-anonymisering.
 */
export interface SiteModel {
  siteId: string;
  label: string;
  /** Dagtyp som modellen gäller, t.ex. "weekday:2" eller "all". */
  dayType: string;
  /** Förväntat antal ankomster per timme (index 0–23) en typisk dag. */
  hourlyArrivals: number[];
  unloadSamples: VisitSample[];
  /** Tid i grind/incheckning (min). */
  gateSamples: number[];
  /** Tid från lossningsslut till utfart (min). */
  paperSamples: number[];
  /** Ankomst minus bokad slotstart (min). Negativ = tidig. */
  slotDeviationSamples: number[];
  noShowRate: number;
  provenance: Record<string, Provenance>;
}

/** En verklig (inspelad) lastbil för replay/backtest. */
export interface RecordedTruck {
  id: string;
  arrival: Minutes;
  slotStart: Minutes | null;
  slotEnd: Minutes | null;
  carrier: string;
  goodsType: string;
  pallets: number | null;
  unloadMin: number | null;
  gateMin: number | null;
  paperMin: number | null;
}
