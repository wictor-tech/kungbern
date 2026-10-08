import { MinHeap } from "./heap.ts";
import { quantile } from "./stats.ts";
import { makeStrategy, type WaitingTruck } from "./strategies.ts";
import type {
  CostConfig,
  DoorInterval,
  RunMetrics,
  RunResult,
  SeriesPoint,
  SiteConfig,
  StrategyConfig,
  Truck,
  TruckOutcome,
} from "./types.ts";

// Vanligt objekt i stället för enum, så att filen kan köras direkt i Node med typstrippning.
const Ev = { Arrive: 0, GateDone: 1, UnloadDone: 2, Depart: 3, Open: 4 } as const;
type Ev = (typeof Ev)[keyof typeof Ev];

interface Event {
  time: number;
  seq: number;
  type: Ev;
  idx: number;
}

type Place = "none" | "parked" | "outside";

export interface SimulateOptions {
  /** Spara tidsserie, dörrintervall och per-lastbilsutfall (behövs för UI, inte för Monte Carlo). */
  detail?: boolean;
}

/**
 * Diskret händelsesimulering av en dag:
 * ankomst -> grindkö -> incheckning -> väntan på gården (uppställning eller utanför) -> dörr -> lossning
 * -> pappersarbete -> avgång.
 *
 * Deterministisk: samma lastbilar + samma konfiguration ger exakt samma resultat.
 */
export function simulateDay(
  trucks: readonly Truck[],
  site: SiteConfig,
  strategyCfg: StrategyConfig,
  cost: CostConfig,
  opts: SimulateOptions = {},
): RunResult {
  validateSite(site);
  const detail = opts.detail ?? false;
  const strategy = makeStrategy(strategyCfg);
  const n = trucks.length;

  const heap = new MinHeap<Event>();
  let seq = 0;
  const schedule = (time: number, type: Ev, idx: number) => heap.push({ time, seq: seq++, type, idx });

  const gateStart = new Float64Array(n).fill(NaN);
  const gateEnd = new Float64Array(n).fill(NaN);
  const doorStart = new Float64Array(n).fill(NaN);
  const doorEnd = new Float64Array(n).fill(NaN);
  const departure = new Float64Array(n).fill(NaN);
  const doorOf = new Int32Array(n).fill(-1);
  const place: Place[] = new Array(n).fill("none");
  const overflow = new Uint8Array(n);

  const gateQueue: number[] = [];
  let gateQHead = 0;
  let freeLanes = site.gateLanes;
  const waiting: (WaitingTruck & { idx: number })[] = [];
  const outside: number[] = [];
  let parked = 0;
  let maxParking = 0;
  const doorBusy: boolean[] = site.doors.map(() => false);
  let openScheduled = false;

  let waitingCount = 0; // ankomna, ej påbörjad lossning
  let onSite = 0;
  let maxQueue = 0;
  const series: SeriesPoint[] = [];
  const doorIntervals: DoorInterval[] = [];
  const record = (t: number) => {
    if (waitingCount > maxQueue) maxQueue = waitingCount;
    if (!detail) return;
    const last = series[series.length - 1];
    if (last && last.t === t) {
      last.waiting = waitingCount;
      last.onSite = onSite;
    } else {
      series.push({ t, waiting: waitingCount, onSite });
    }
  };

  for (let i = 0; i < n; i++) schedule(trucks[i].arrival, Ev.Arrive, i);

  const tryGate = (now: number) => {
    while (freeLanes > 0 && gateQHead < gateQueue.length) {
      const i = gateQueue[gateQHead++];
      freeLanes--;
      gateStart[i] = now;
      schedule(now + Math.max(0, trucks[i].gateTime), Ev.GateDone, i);
    }
  };

  const releasePlace = (i: number) => {
    if (place[i] === "parked") {
      parked--;
      if (outside.length > 0) {
        const j = outside.shift()!;
        place[j] = "parked";
        parked++;
      }
    } else if (place[i] === "outside") {
      const k = outside.indexOf(i);
      if (k >= 0) outside.splice(k, 1);
    }
    place[i] = "none";
  };

  const tryAssign = (now: number) => {
    if (waiting.length === 0) return;
    if (now < site.openFrom) {
      if (!openScheduled) {
        openScheduled = true;
        schedule(site.openFrom, Ev.Open, -1);
      }
      return;
    }
    if (!site.allowOvertime && now >= site.openTo) return;
    for (let d = 0; d < site.doors.length && waiting.length > 0; d++) {
      if (doorBusy[d]) continue;
      const k = strategy(waiting, site.doors[d], now);
      if (k < 0) continue;
      const w = waiting[k];
      waiting.splice(k, 1);
      const i = w.idx;
      releasePlace(i);
      doorBusy[d] = true;
      doorOf[i] = d;
      doorStart[i] = now;
      if (!trucks[i].shadow) waitingCount--;
      schedule(now + Math.max(0, trucks[i].unloadTime), Ev.UnloadDone, i);
    }
  };

  let order = 0;
  let now = 0;
  for (;;) {
    const ev = heap.pop();
    if (!ev) break;
    now = ev.time;
    switch (ev.type) {
      case Ev.Arrive: {
        onSite++;
        if (!trucks[ev.idx].shadow) waitingCount++;
        gateQueue.push(ev.idx);
        tryGate(now);
        break;
      }
      case Ev.GateDone: {
        const i = ev.idx;
        freeLanes++;
        gateEnd[i] = now;
        waiting.push({ truck: trucks[i], readyAt: now, order: order++, idx: i });
        tryAssign(now);
        if (Number.isNaN(doorStart[i])) {
          if (parked < site.parkingSpaces) {
            place[i] = "parked";
            parked++;
            if (parked > maxParking) maxParking = parked;
          } else {
            place[i] = "outside";
            overflow[i] = 1;
            outside.push(i);
          }
        }
        tryGate(now);
        break;
      }
      case Ev.UnloadDone: {
        const i = ev.idx;
        doorEnd[i] = now;
        doorBusy[doorOf[i]] = false;
        if (detail) {
          doorIntervals.push({ doorId: site.doors[doorOf[i]].id, truckId: trucks[i].id, start: doorStart[i], end: now });
        }
        schedule(now + Math.max(0, trucks[i].paperTime), Ev.Depart, i);
        tryAssign(now);
        break;
      }
      case Ev.Depart: {
        departure[ev.idx] = now;
        onSite--;
        break;
      }
      case Ev.Open: {
        tryAssign(now);
        break;
      }
    }
    record(now);
  }
  const endTime = now;

  // --- Utfall och nyckeltal ---
  const outcomes: TruckOutcome[] = [];
  const waits: number[] = [];
  let detentionMinTotal = 0;
  let overDetention = 0;
  let unloaded = 0;
  let unloadedByClose = 0;
  let busyInOpen = 0;
  let gateBusy = 0;
  let lastDeparture = -Infinity;
  let lastDoorEnd = -Infinity;
  let firstArrival = Infinity;
  let overflowTrucks = 0;

  // Ej lossade bilar censureras vid den senare av stängning och simuleringens slut, så att
  // scenarier utan övertid inte ser bättre ut än de är (en bil som aldrig lossas har väntat minst till stängning).
  const censorAt = Math.max(endTime, site.openTo);
  let measured = 0;
  for (let i = 0; i < n; i++) {
    const t = trucks[i];
    const served = !Number.isNaN(doorStart[i]);
    const shadow = t.shadow === true;
    if (detail && shadow) {
      outcomes.push({
        id: t.id, arrival: t.arrival, slotStart: t.slotStart, gateStart: gateStart[i], gateEnd: gateEnd[i],
        doorStart: served ? doorStart[i] : null, doorEnd: served ? doorEnd[i] : null,
        departure: Number.isNaN(departure[i]) ? null : departure[i], doorId: served ? site.doors[doorOf[i]].id : null,
        waitToDoor: served ? doorStart[i] - t.arrival : null, detentionMin: 0, overflow: overflow[i] === 1,
        goodsType: t.goodsType, carrier: t.carrier, pallets: t.pallets, walkIn: t.walkIn ?? false, shadow: true,
      });
    }
    if (shadow) continue;
    measured++;
    const wait = Math.max(0, served ? doorStart[i] - t.arrival : censorAt - t.arrival);
    waits.push(wait);
    if (served) {
      unloaded++;
      if (doorEnd[i] <= site.openTo) unloadedByClose++;
      busyInOpen += overlap(doorStart[i], doorEnd[i], site.openFrom, site.openTo);
      if (doorEnd[i] > lastDoorEnd) lastDoorEnd = doorEnd[i];
    }
    if (!Number.isNaN(gateEnd[i])) gateBusy += gateEnd[i] - gateStart[i];
    const leave = Number.isNaN(departure[i]) ? censorAt : departure[i];
    if (!Number.isNaN(departure[i]) && departure[i] > lastDeparture) lastDeparture = departure[i];
    if (t.arrival < firstArrival) firstArrival = t.arrival;
    // Detentionklockan startar vid bokad tid om bilen kom tidigt, annars vid ankomst.
    const clockStart = t.slotStart !== null && t.arrival < t.slotStart ? t.slotStart : t.arrival;
    const det = Math.max(0, leave - clockStart - cost.detentionFreeMin);
    if (det > 0) overDetention++;
    detentionMinTotal += det;
    if (overflow[i]) overflowTrucks++;

    if (detail) {
      outcomes.push({
        id: t.id,
        arrival: t.arrival,
        slotStart: t.slotStart,
        gateStart: gateStart[i],
        gateEnd: gateEnd[i],
        doorStart: served ? doorStart[i] : null,
        doorEnd: served ? doorEnd[i] : null,
        departure: Number.isNaN(departure[i]) ? null : departure[i],
        doorId: served ? site.doors[doorOf[i]].id : null,
        waitToDoor: served ? doorStart[i] - t.arrival : null,
        detentionMin: det,
        overflow: overflow[i] === 1,
        goodsType: t.goodsType,
        carrier: t.carrier,
        pallets: t.pallets,
        walkIn: t.walkIn ?? false,
        shadow: false,
      });
    }
  }

  const openLen = Math.max(1, site.openTo - site.openFrom);
  const gateWindow = Math.max(1, site.openTo - Math.min(site.openFrom, Number.isFinite(firstArrival) ? firstArrival : site.openFrom));
  let sumWait = 0;
  for (const w of waits) sumWait += w;

  const metrics: RunMetrics = {
    trucks: measured,
    unloaded,
    notUnloaded: measured - unloaded,
    avgWait: measured > 0 ? sumWait / measured : 0,
    p90Wait: measured > 0 ? quantile(waits, 0.9) : 0,
    maxWait: measured > 0 ? Math.max(...waits) : 0,
    maxQueue,
    overDetention,
    detentionCost: (detentionMinTotal / 60) * cost.detentionCostPerHour,
    doorUtilization: busyInOpen / (site.doors.length * openLen),
    gateUtilization: gateBusy / (site.gateLanes * gateWindow),
    maxParking,
    overflowTrucks,
    timeToEmpty: Number.isFinite(lastDeparture) ? lastDeparture : site.openFrom,
    overtimeMin: Number.isFinite(lastDoorEnd) ? Math.max(0, lastDoorEnd - site.openTo) : 0,
    unloadedByClose,
  };

  return { metrics, trucks: outcomes, series, doorIntervals };
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function validateSite(site: SiteConfig): void {
  if (site.doors.length < 1) throw new Error("Minst en dörr krävs");
  if (!(site.gateLanes >= 1)) throw new Error("Minst en grindfil krävs");
  if (!(site.parkingSpaces >= 0)) throw new Error("parkingSpaces måste vara >= 0");
  if (!(site.openTo > site.openFrom)) throw new Error("Stängning måste vara efter öppning");
}
