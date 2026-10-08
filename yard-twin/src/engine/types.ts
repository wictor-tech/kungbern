import type { Minutes } from "./time.ts";

/**
 * En lastbil som ska igenom gården under en dag. Alla stokastiska egenskaper (lossningstid m.m.)
 * är redan dragna när lastbilen skapas – själva simuleringen är deterministisk. Det ger
 * "common random numbers": samma lastbilar kan köras genom olika konfigurationer och jämföras rättvist.
 */
export interface Truck {
  id: string;
  /** Ankomst till grind (första LPR-läsning). */
  arrival: Minutes;
  slotStart: Minutes | null;
  slotEnd: Minutes | null;
  /** Pseudonymiserad transportörsnyckel. */
  carrier: string;
  goodsType: string;
  pallets: number | null;
  /** Tid i grind/incheckning (min). */
  gateTime: number;
  /** Tid vid dörr, från lossningsstart till lossningsslut (min). */
  unloadTime: number;
  /** Tid från lossningsslut till utfart (pappersarbete, utfart). Blockerar inte dörren. */
  paperTime: number;
  /** Ej bokad trots bokningsläge (bokningskapaciteten tog slut). */
  walkIn?: boolean;
  /**
   * "Skuggbil": fanns fysiskt på gården och upptog resurser, men exkluderas ur nyckeltalen
   * (t.ex. besök med saknad lossningstid i data). Används i replay/backtest så att kön blir rätt
   * utan att osäkra mätningar påverkar felmåtten.
   */
  shadow?: boolean;
}

export interface DoorSpec {
  id: string;
  /** Om satt och strategin är "specialized": endast dessa godstyper får lossas här. */
  goodsTypes?: string[] | null;
}

export interface SiteConfig {
  doors: DoorSpec[];
  gateLanes: number;
  /** Uppställningsplatser på gården för lastbilar som väntar på dörr. Infinity = obegränsat. */
  parkingSpaces: number;
  /** Dörrarna börjar lossa. */
  openFrom: Minutes;
  /** Nominell stängning. */
  openTo: Minutes;
  /** true: påbörjad kö betas av efter stängning (övertid). false: ingen ny lossning efter openTo. */
  allowOvertime: boolean;
}

export type StrategyKind = "fcfs" | "booked-first" | "priority" | "specialized";

export interface StrategyConfig {
  kind: StrategyKind;
  /** För "priority": högre tal = högre prioritet. Nycklar är godstyp eller transportörsnyckel. */
  priorities?: Record<string, number>;
  /** För "booked-first": hur sent en bokad bil får komma och fortfarande räknas som i tid (min). */
  onTimeToleranceMin: number;
}

export interface CostConfig {
  currency: "SEK" | "EUR";
  /** Fri tid på gården innan detention börjar räknas (min). */
  detentionFreeMin: number;
  detentionCostPerHour: number;
}

export interface TruckOutcome {
  id: string;
  arrival: Minutes;
  slotStart: Minutes | null;
  gateStart: Minutes;
  gateEnd: Minutes;
  /** null = lossades aldrig (stängt utan övertid eller ingen behörig dörr). */
  doorStart: Minutes | null;
  doorEnd: Minutes | null;
  departure: Minutes | null;
  doorId: string | null;
  /** Ankomst -> lossningsstart (inkl. grind). Mätbart i data som LPR -> lossningsstart. */
  waitToDoor: number | null;
  detentionMin: number;
  /** Fick vänta utanför gården eftersom uppställningsplatserna var fulla. */
  overflow: boolean;
  goodsType: string;
  carrier: string;
  pallets: number | null;
  walkIn: boolean;
  shadow: boolean;
}

export interface SeriesPoint {
  t: Minutes;
  /** Ankomna men inte påbörjad lossning (inkl. grindkö). */
  waiting: number;
  /** Ankomna men inte avgångna. */
  onSite: number;
}

export interface DoorInterval {
  doorId: string;
  truckId: string;
  start: Minutes;
  end: Minutes;
}

export interface RunMetrics {
  trucks: number;
  unloaded: number;
  notUnloaded: number;
  avgWait: number;
  p90Wait: number;
  maxWait: number;
  maxQueue: number;
  overDetention: number;
  detentionCost: number;
  /** Andel dörrtid som användes inom öppettiden (0–1). */
  doorUtilization: number;
  gateUtilization: number;
  maxParking: number;
  overflowTrucks: number;
  /** Klockslag då sista lastbilen lämnade gården. */
  timeToEmpty: Minutes;
  /** Minuter lossning efter stängning. */
  overtimeMin: number;
  unloadedByClose: number;
}

export interface RunResult {
  metrics: RunMetrics;
  trucks: TruckOutcome[];
  series: SeriesPoint[];
  doorIntervals: DoorInterval[];
}

export const METRIC_KEYS = [
  "avgWait",
  "p90Wait",
  "maxQueue",
  "overDetention",
  "detentionCost",
  "doorUtilization",
  "timeToEmpty",
  "overtimeMin",
  "unloaded",
  "notUnloaded",
  "overflowTrucks",
  "maxParking",
  "gateUtilization",
] as const satisfies readonly (keyof RunMetrics)[];

export type MetricKey = (typeof METRIC_KEYS)[number];
