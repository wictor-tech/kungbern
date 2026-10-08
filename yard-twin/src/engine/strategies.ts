import type { DoorSpec, StrategyConfig, Truck } from "./types.ts";

/** En lastbil som har passerat grinden och väntar på dörr. */
export interface WaitingTruck {
  truck: Truck;
  /** När den blev redo för dörr (grind klar). */
  readyAt: number;
  /** Ordningsnummer för stabil tie-break. */
  order: number;
}

/**
 * En tilldelningsstrategi väljer vilken väntande lastbil som får en ledig dörr.
 * Returnerar index i `waiting` eller -1 om ingen är behörig.
 */
export type Strategy = (waiting: readonly WaitingTruck[], door: DoorSpec, now: number) => number;

function eligible(door: DoorSpec, t: Truck): boolean {
  return !door.goodsTypes || door.goodsTypes.length === 0 || door.goodsTypes.includes(t.goodsType);
}

function fcfsBetter(a: WaitingTruck, b: WaitingTruck): boolean {
  return a.readyAt < b.readyAt || (a.readyAt === b.readyAt && a.order < b.order);
}

function pickBest(
  waiting: readonly WaitingTruck[],
  ok: (w: WaitingTruck) => boolean,
  better: (a: WaitingTruck, b: WaitingTruck) => boolean,
): number {
  let best = -1;
  for (let i = 0; i < waiting.length; i++) {
    const w = waiting[i];
    if (!ok(w)) continue;
    if (best === -1 || better(w, waiting[best])) best = i;
  }
  return best;
}

export function makeStrategy(cfg: StrategyConfig): Strategy {
  switch (cfg.kind) {
    case "fcfs":
      return (waiting) => pickBest(waiting, () => true, fcfsBetter);

    case "specialized":
      return (waiting, door) => pickBest(waiting, (w) => eligible(door, w.truck), fcfsBetter);

    case "booked-first": {
      const tol = cfg.onTimeToleranceMin;
      // Klass 0: bokad, kom i tid och sloten har börjat (inom tolerans). Sorteras på slotstart.
      // Klass 1: övriga (obokade, sena, tidiga vars slot inte börjat) – först till kvarn.
      const cls = (w: WaitingTruck, now: number): number => {
        const s = w.truck.slotStart;
        if (s === null) return 1;
        const onTime = w.truck.arrival <= s + tol;
        const due = now >= s - tol;
        return onTime && due ? 0 : 1;
      };
      return (waiting, _door, now) =>
        pickBest(
          waiting,
          () => true,
          (a, b) => {
            const ca = cls(a, now);
            const cb = cls(b, now);
            if (ca !== cb) return ca < cb;
            if (ca === 0 && a.truck.slotStart !== b.truck.slotStart) {
              return (a.truck.slotStart as number) < (b.truck.slotStart as number);
            }
            return fcfsBetter(a, b);
          },
        );
    }

    case "priority": {
      const prio = cfg.priorities ?? {};
      const score = (t: Truck): number => prio[t.goodsType] ?? prio[t.carrier] ?? 0;
      return (waiting) =>
        pickBest(
          waiting,
          () => true,
          (a, b) => {
            const sa = score(a.truck);
            const sb = score(b.truck);
            if (sa !== sb) return sa > sb;
            return fcfsBetter(a, b);
          },
        );
    }
  }
}

export const STRATEGY_KINDS = ["fcfs", "booked-first", "priority", "specialized"] as const;
