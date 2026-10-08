import type { RecordedTruck } from "../engine/model.ts";
import { quantile } from "../engine/stats.ts";
import type { Minutes } from "../engine/time.ts";
import type { ActualDayMetrics, DerivedVisit, RecordedDay } from "./contract.ts";
import { UNKNOWN_LABEL } from "./rules.ts";

export interface OpenWindow {
  openFrom: Minutes;
  openTo: Minutes;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Inkluderade besök → RecordedTruck (verkliga lossnings-, grind- och papperstider). */
export function toRecordedTruck(d: DerivedVisit): RecordedTruck {
  return {
    id: d.visit.visitId,
    arrival: d.arrivalMin!,
    slotStart: d.slotStartMin,
    slotEnd: d.slotEndMin,
    carrier: d.visit.carrierKey ?? UNKNOWN_LABEL,
    goodsType: d.visit.goodsType ?? UNKNOWN_LABEL,
    pallets: d.visit.pallets,
    unloadMin: d.unloadMin,
    gateMin: d.gateMin,
    paperMin: d.paperMin,
  };
}

/** Antal distinkta dörrar som användes av besöken. */
export function doorsUsed(visits: readonly DerivedVisit[]): number {
  return new Set(visits.map((d) => d.visit.doorId).filter((x) => x !== null)).size;
}

/**
 * Verkliga nyckeltal för en dag med EXAKT motorns definitioner (simulateDay → RunMetrics):
 *  - avgWait/p90Wait: medel/kvantil (typ 7, engine/stats.ts) av lossningsstart − ankomst.
 *  - maxQueue: max antal ankomna som inte påbörjat lossning (svepande linje). Vid lika tid räknas
 *    ankomster FÖRE lossningsstarter, precis som i motorn där ankomsthändelser schemaläggs först och
 *    kön mäts efter varje händelse. En bil som kommer exakt när en dörr blir ledig räknas alltså
 *    kortvarigt som köande.
 *  - doorUtilization: Σ överlapp(lossning, [openFrom, openTo]) / (dörrar × (openTo − openFrom)).
 *  - timeToEmpty: senaste utfart (lossningsslut om utfart saknas); openFrom om dagen är tom.
 *
 * `visits` ska vara inkluderade besök för en servicedag. `doors` = antal dörrar i nämnaren
 * (standard: observerade dörrar den dagen).
 */
export function actualDayMetrics(date: string, visits: readonly DerivedVisit[], opts: OpenWindow & { doors?: number }): ActualDayMetrics {
  const vs = visits.filter((d) => d.arrivalMin !== null && d.unloadStartMin !== null && d.unloadEndMin !== null);
  const waits = vs.map((d) => d.unloadStartMin! - d.arrivalMin!);
  const n = vs.length;

  // Svepande linje: (tid, typ) där typ 0 = ankomst (+1) sorteras före typ 1 = lossningsstart (−1).
  const ev: [number, number][] = [];
  for (const d of vs) {
    ev.push([d.arrivalMin!, 0]);
    ev.push([d.unloadStartMin!, 1]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let q = 0;
  let maxQueue = 0;
  for (const [, type] of ev) {
    q += type === 0 ? 1 : -1;
    if (q > maxQueue) maxQueue = q;
  }

  let busy = 0;
  let empty = -Infinity;
  for (const d of vs) {
    busy += overlap(d.unloadStartMin!, d.unloadEndMin!, opts.openFrom, opts.openTo);
    const leave = d.departMin ?? d.unloadEndMin!;
    if (leave > empty) empty = leave;
  }
  const doors = Math.max(1, opts.doors ?? doorsUsed(vs));
  const openLen = Math.max(1, opts.openTo - opts.openFrom);
  let sum = 0;
  for (const w of waits) sum += w;

  return {
    date,
    trucks: n,
    avgWait: n > 0 ? sum / n : 0,
    p90Wait: n > 0 ? quantile(waits, 0.9) : 0,
    maxQueue,
    doorUtilization: busy / (doors * openLen),
    timeToEmpty: Number.isFinite(empty) ? empty : opts.openFrom,
  };
}

/** Inspelade dagar (endast inkluderade besök), sorterade på datum; lastbilar på ankomst och id. */
export function recordedDays(derived: readonly DerivedVisit[], opts: OpenWindow): RecordedDay[] {
  const byDay = new Map<string, DerivedVisit[]>();
  for (const d of derived) {
    if (!d.included) continue;
    let g = byDay.get(d.serviceDate);
    if (!g) byDay.set(d.serviceDate, (g = []));
    g.push(d);
  }
  return [...byDay.keys()].sort().map((date) => {
    const vs = byDay.get(date)!;
    const trucks = vs.map(toRecordedTruck).sort((a, b) => a.arrival - b.arrival || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const doorsObserved = doorsUsed(vs);
    return {
      date,
      isoWeekday: vs[0].isoWeekday,
      trucks,
      actual: actualDayMetrics(date, vs, { ...opts, doors: doorsObserved }),
      doorsObserved,
    };
  });
}
