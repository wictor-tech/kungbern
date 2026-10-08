import type { RecordedTruck } from "../engine/model.ts";
import { quantile } from "../engine/stats.ts";
import type { Minutes } from "../engine/time.ts";
import type { ActualDayMetrics, DerivedVisit, QualityIssue, RecordedDay } from "./contract.ts";
import { CALIB_GATE_MAX_MIN, CALIB_PAPER_MAX_MIN, UNKNOWN_LABEL, isCancelled, isNoShow } from "./rules.ts";

export interface OpenWindow {
  openFrom: Minutes;
  openTo: Minutes;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Problem som gör ett besöks uppmätta tider opålitliga (då dras tiden i stället ur modellen). */
const UNRELIABLE_TIME_ISSUES: readonly QualityIssue[] = ["out_of_order", "negative_duration"];

function plausible(x: number | null, max: number): number | null {
  return x !== null && Number.isFinite(x) && x >= 0 && x <= max ? x : null;
}

/**
 * Besök → RecordedTruck (verkliga lossnings-, grind- och papperstider).
 * Inkluderade besök får sina tider rakt av. Övriga (skuggbilar, `shadow: true`) får bara rimliga
 * uppmätta tider; orimliga eller saknade blir null och dras i stället ur modellen vid replay.
 */
export function toRecordedTruck(d: DerivedVisit): RecordedTruck {
  const base = {
    id: d.visit.visitId,
    arrival: d.arrivalMin!,
    slotStart: d.slotStartMin,
    slotEnd: d.slotEndMin,
    carrier: d.visit.carrierKey ?? UNKNOWN_LABEL,
    goodsType: d.visit.goodsType ?? UNKNOWN_LABEL,
    pallets: d.visit.pallets,
  };
  if (d.included) return { ...base, unloadMin: d.unloadMin, gateMin: d.gateMin, paperMin: d.paperMin };
  const broken = d.issues.some((x) => UNRELIABLE_TIME_ISSUES.includes(x));
  const unloadOk = !broken && !d.issues.includes("unload_too_short") && !d.issues.includes("unload_too_long");
  return {
    ...base,
    unloadMin: unloadOk && d.unloadMin !== null && d.unloadMin > 0 ? d.unloadMin : null,
    gateMin: broken ? null : plausible(d.gateMin, CALIB_GATE_MAX_MIN),
    paperMin: broken ? null : plausible(d.paperMin, CALIB_PAPER_MAX_MIN),
    shadow: true,
  };
}

/**
 * Fanns besöket fysiskt på gården den dagen? Ja om det har en effektiv ankomst (D1) och inte är
 * dubblett, avbokat eller no-show. Sådana besök upptar grind/dörr/parkering även när de
 * exkluderas från kalibreringen (t.ex. saknad eller orimlig lossningstid).
 */
export function physicallyPresent(d: DerivedVisit): boolean {
  return d.arrivalMin !== null && !d.issues.includes("duplicate") && !isCancelled(d.visit) && !isNoShow(d.visit);
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

/**
 * Inspelade dagar, sorterade på datum; lastbilar på ankomst och id.
 *
 * Alla besök som fysiskt fanns på gården (se `physicallyPresent`) spelas upp, eftersom de upptog
 * dörrar och därmed påverkade de andras väntan. Besök som inte är inkluderade i kalibreringen blir
 * skuggbilar (`shadow: true`): de upptar resurser i simuleringen men räknas inte i nyckeltalen.
 * `actual` räknas bara på inkluderade besök, så verklighet och simulering mäter samma bilar.
 * `doorsObserved` räknar dörrar som användes av någon bil den dagen. Dagar utan inkluderade besök utelämnas.
 */
export function recordedDays(derived: readonly DerivedVisit[], opts: OpenWindow): RecordedDay[] {
  const byDay = new Map<string, DerivedVisit[]>();
  for (const d of derived) {
    if (!d.included && !physicallyPresent(d)) continue;
    let g = byDay.get(d.serviceDate);
    if (!g) byDay.set(d.serviceDate, (g = []));
    g.push(d);
  }
  const out: RecordedDay[] = [];
  for (const date of [...byDay.keys()].sort()) {
    const vs = byDay.get(date)!;
    const included = vs.filter((d) => d.included);
    if (included.length === 0) continue;
    const trucks = vs.map(toRecordedTruck).sort((a, b) => a.arrival - b.arrival || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const doorsObserved = doorsUsed(vs);
    out.push({
      date,
      isoWeekday: included[0].isoWeekday,
      trucks,
      actual: actualDayMetrics(date, included, { ...opts, doors: doorsObserved }),
      doorsObserved,
    });
  }
  return out;
}
