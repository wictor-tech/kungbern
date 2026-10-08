import type { RecordedDay } from "../data/contract.ts";
import type { SiteModel } from "../engine/model.ts";
import type { StrategyKind } from "../engine/types.ts";

/** Kalibreringssammanfattning som följer med datasetet (beräknas i byggsteget, inte i UI:t). */
export interface CalibrationSummary {
  grade: "high" | "medium" | "low" | "insufficient";
  warning: boolean;
  reasons: { sv: string; en: string }[];
  calibrationDays: number;
  visits: number;
  testDays: number;
  metrics: Record<string, { mae: number; wmape: number; relBias: number; coverage: number; n: number }>;
  replayAvgWaitWmape?: number | null;
  trainRange: [string, string];
  testRange: [string, string];
}

export interface Dataset {
  kind: "demo" | "tenant";
  /** Satt för kunddataset; används som extra kontroll i serverns datakälla. Saknas i demo. */
  tenantId?: string;
  note: string;
  pipelineVersion: string;
  site: { siteId: string; label: string; tz: string; open: string; close: string; doors: number };
  profiles: Record<string, SiteModel>;
  days: RecordedDay[];
  calibration?: CalibrationSummary;
  quality?: { totalVisits: number; includedVisits: number; excludedByReason: Record<string, number>; firstDate: string; lastDate: string; distinctDays: number };
}

export type Pattern = "recorded" | "booked" | "poisson" | "burst";

export interface Controls {
  mode: "replay" | "whatif";
  date: string;
  pattern: Pattern;
  volumeFactor: number;
  doors: number;
  gateLanes: number;
  parkingSpaces: number | null;
  open: string;
  close: string;
  allowOvertime: boolean;
  strategy: StrategyKind;
  adherence: number | null;
  slotLengthMin: number;
  capacityPerHour: number;
  toleranceMin: number;
  burstFrom: string;
  burstTo: string;
  burstMultiplier: number;
  currency: "SEK" | "EUR";
  detentionFreeMin: number;
  detentionCostPerHour: number;
  staffCostPerHour: number;
  costSource: string;
  reps: number;
}
