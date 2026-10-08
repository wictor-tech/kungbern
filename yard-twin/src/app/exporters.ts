import type { MonteCarloResult } from "../engine/montecarlo.ts";
import { formatClock } from "../engine/time.ts";
import { METRIC_KEYS, type RunResult } from "../engine/types.ts";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "") : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function trucksCsv(r: RunResult): string {
  const head = ["truck", "carrier", "goods_type", "pallets", "slot_start", "arrival", "gate_start", "gate_end", "door", "unload_start", "unload_end", "departure", "wait_to_door_min", "detention_min", "overflow", "walk_in"];
  const rows = r.trucks.map((o) =>
    [o.id, o.carrier, o.goodsType, o.pallets, o.slotStart !== null ? formatClock(o.slotStart) : "", formatClock(o.arrival), formatClock(o.gateStart), formatClock(o.gateEnd), o.doorId, o.doorStart !== null ? formatClock(o.doorStart) : "", o.doorEnd !== null ? formatClock(o.doorEnd) : "", o.departure !== null ? formatClock(o.departure) : "", o.waitToDoor, o.detentionMin, o.overflow, o.walkIn].map(csvCell).join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

export function monteCarloCsv(mc: MonteCarloResult): string {
  const head = ["rep", ...METRIC_KEYS];
  return [head.join(","), ...mc.perRep.map((m, i) => [i, ...METRIC_KEYS.map((k) => m[k])].map(csvCell).join(","))].join("\n");
}

export function download(filename: string, content: string, type = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["﻿", content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
