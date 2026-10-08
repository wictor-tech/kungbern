import type { CostConfig, RunResult, TruckOutcome } from "../engine/types.ts";

export type TruckStatus = "planned" | "queue" | "gate" | "wait" | "overflow" | "unload" | "leave" | "done";

/**
 * Status vid tid t. Begränsning: motorn sparar inte när en overflow-bil flyttas in på uppställningen,
 * så en sådan bil visas som "väntar utanför" tills den får dörr.
 */
export function statusAt(o: TruckOutcome, t: number): TruckStatus {
  if (t < o.arrival) return "planned";
  if (t < o.gateStart) return "queue";
  if (t < o.gateEnd) return "gate";
  if (o.doorStart === null || t < o.doorStart) return o.overflow ? "overflow" : "wait";
  if (o.doorEnd !== null && t < o.doorEnd) return "unload";
  if (o.departure !== null && t < o.departure) return "leave";
  return o.departure === null && o.doorEnd === null ? "wait" : "done";
}

export const STATUS_COLOR: Record<TruckStatus, string> = {
  planned: "var(--muted)",
  queue: "var(--st-gate)",
  gate: "var(--st-gate)",
  wait: "var(--st-wait)",
  overflow: "var(--st-overflow)",
  unload: "var(--st-unload)",
  leave: "var(--st-leave)",
  done: "var(--muted)",
};

export const STATUS_KEY = {
  planned: "st_planned",
  queue: "st_queue",
  gate: "st_gate",
  wait: "st_wait",
  overflow: "st_overflow",
  unload: "st_unload",
  leave: "st_leave",
  done: "st_done",
} as const;

export interface LiveKpis {
  onSite: number;
  waiting: number;
  avgWaitSoFar: number;
  unloaded: number;
  planned: number;
  detentionCostSoFar: number;
}

/** Live-KPI:er vid klockslag t. Samma definitioner som motorns nyckeltal, men ackumulerat fram till t. */
export function kpisAt(r: RunResult, t: number, cost: CostConfig): LiveKpis {
  let onSite = 0, waiting = 0, unloaded = 0, waitSum = 0, waitN = 0, detMin = 0;
  for (const o of r.trucks) {
    if (t < o.arrival) continue;
    const leave = o.departure ?? Infinity;
    if (t < leave) onSite++;
    // Skuggbilar (ofullständigt mätta besök) syns på gården men räknas inte i väntan/detention – samma som motorn.
    if (o.shadow) continue;
    if (o.doorStart === null || t < o.doorStart) {
      waiting++;
      // pågående väntan räknas med – annars ser en växande kö bra ut
      waitSum += t - o.arrival;
      waitN++;
    } else {
      waitSum += o.doorStart - o.arrival;
      waitN++;
    }
    if (o.doorEnd !== null && o.doorEnd <= t) unloaded++;
    const clockStart = o.slotStart !== null && o.arrival < o.slotStart ? o.slotStart : o.arrival;
    detMin += Math.max(0, Math.min(t, leave) - clockStart - cost.detentionFreeMin);
  }
  return {
    onSite,
    waiting,
    avgWaitSoFar: waitN > 0 ? waitSum / waitN : 0,
    unloaded,
    planned: r.trucks.filter((o) => !o.shadow).length,
    detentionCostSoFar: (detMin / 60) * cost.detentionCostPerHour,
  };
}

/** Tilldela stabila platser (parkering, pappersarbete) så att lastbilar inte hoppar runt i vyn. */
export function assignSpots(r: RunResult, parkingSpots: number, kioskSpots: number): { parking: Map<string, number>; kiosk: Map<string, number> } {
  return {
    parking: sweep(
      r.trucks.filter((o) => !o.overflow).map((o) => ({ id: o.id, from: o.gateEnd, to: o.doorStart ?? Infinity })),
      parkingSpots,
    ),
    kiosk: sweep(
      r.trucks.filter((o) => o.doorEnd !== null).map((o) => ({ id: o.id, from: o.doorEnd!, to: o.departure ?? o.doorEnd! })),
      kioskSpots,
    ),
  };
}

function sweep(items: { id: string; from: number; to: number }[], spots: number): Map<string, number> {
  const out = new Map<string, number>();
  const busyUntil: number[] = new Array(spots).fill(-Infinity);
  const sorted = [...items].filter((i) => i.to > i.from).sort((a, b) => a.from - b.from || (a.id < b.id ? -1 : 1));
  for (const it of sorted) {
    let s = busyUntil.findIndex((u) => u <= it.from);
    if (s < 0) s = -1; // ingen plats – ritas i overflow-filen
    else busyUntil[s] = it.to;
    out.set(it.id, s);
  }
  return out;
}

export function timeBounds(r: RunResult, openFrom: number, openTo: number): [number, number] {
  let lo = openFrom, hi = openTo;
  for (const o of r.trucks) {
    lo = Math.min(lo, o.arrival);
    hi = Math.max(hi, o.departure ?? o.doorEnd ?? o.arrival);
  }
  return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
}
