import type { RunResult } from "../engine/types.ts";
import { assignSpots, statusAt, type TruckStatus } from "./playback.ts";

/** Gemensam layout (koordinater i en 1000×520-yta) för 2D- och 3D-vyn. */
export const LAYOUT = {
  W: 1000,
  H: 520,
  BLD: { x: 330, y: 20, w: 650, h: 110 },
  PARK: { x: 360, y: 225, cols: 10, rows: 8, dx: 60, dy: 27 },
  KIOSK: { x: 820, y: 468, n: 4, dx: 42 },
  GATE: { x: 262, y: 470 },
  ROAD_Y: 470,
  MAX_QUEUE_SHOWN: 4,
  MAX_OVERFLOW_SHOWN: 5,
};

export interface TruckPos {
  id: string;
  x: number;
  y: number;
  /** grader, 0 = hytten pekar åt höger */
  rot: number;
  status: TruckStatus;
}

export type Spots = ReturnType<typeof assignSpots>;

export function makeSpots(r: RunResult): Spots {
  return assignSpots(r, LAYOUT.PARK.cols * LAYOUT.PARK.rows, LAYOUT.KIOSK.n);
}

export function doorPositions(doors: string[]): Map<string, number> {
  const { BLD } = LAYOUT;
  const pad = 24;
  const step = (BLD.w - 2 * pad) / Math.max(1, doors.length);
  return new Map(doors.map((d, i) => [d, BLD.x + pad + step * (i + 0.5)]));
}

export function layoutAt(r: RunResult, t: number, spots: Spots, doorX: Map<string, number>): { trucks: TruckPos[]; hiddenQueue: number; busyDoors: Set<string> } {
  const { PARK, KIOSK, GATE, ROAD_Y, BLD, MAX_QUEUE_SHOWN, MAX_OVERFLOW_SHOWN } = LAYOUT;
  const st = new Map(r.trucks.map((o) => [o.id, statusAt(o, t)]));
  const outside = (id: string) => {
    const s = st.get(id);
    return s === "overflow" || (s === "wait" && spots.parking.get(id) === -1);
  };
  const queue = r.trucks.filter((o) => st.get(o.id) === "queue").sort((a, b) => a.arrival - b.arrival);
  const over = r.trucks.filter((o) => outside(o.id)).sort((a, b) => a.gateEnd - b.gateEnd);
  const qIdx = new Map(queue.map((o, i) => [o.id, i]));
  const oIdx = new Map(over.map((o, i) => [o.id, i]));
  const out: TruckPos[] = [];
  const busyDoors = new Set<string>();
  for (const o of r.trucks) {
    const s = st.get(o.id)!;
    if (s === "planned" || s === "done") continue;
    let x = 0, y = 0, rot = 0;
    if (s === "queue") {
      x = GATE.x - 62 - Math.min(qIdx.get(o.id) ?? 0, MAX_QUEUE_SHOWN) * 58;
      y = ROAD_Y;
    } else if (s === "gate") {
      x = GATE.x;
      y = ROAD_Y;
    } else if (outside(o.id)) {
      x = GATE.x - 62 - Math.min(oIdx.get(o.id) ?? 0, MAX_OVERFLOW_SHOWN) * 58;
      y = ROAD_Y - 34;
    } else if (s === "wait") {
      const k = spots.parking.get(o.id) ?? 0;
      x = PARK.x + (k % PARK.cols) * PARK.dx + 24;
      y = PARK.y + Math.floor(k / PARK.cols) * PARK.dy;
    } else if (s === "unload") {
      x = doorX.get(o.doorId ?? "") ?? BLD.x;
      y = BLD.y + BLD.h + 30;
      rot = 90; // backar in: trailern mot dörren
      if (o.doorId) busyDoors.add(o.doorId);
    } else if (s === "leave") {
      x = KIOSK.x + Math.max(0, spots.kiosk.get(o.id) ?? 0) * KIOSK.dx;
      y = KIOSK.y;
      rot = -90;
    }
    out.push({ id: o.id, x, y, rot, status: s });
  }
  const hiddenQueue = Math.max(0, queue.length - MAX_QUEUE_SHOWN - 1) + Math.max(0, over.length - MAX_OVERFLOW_SHOWN - 1);
  return { trucks: out, hiddenQueue, busyDoors };
}
