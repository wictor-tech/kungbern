/**
 * Slotdesign: vilken slotlängd och kapacitet per timme ger kortast väntan?
 * Bara designer vars totala kapacitet räcker till efterfrågan provas – annars blir många obokade.
 */
import type { SlotDesign } from "../engine/arrivals.ts";
import type { SiteModel } from "../engine/model.ts";
import type { CompiledScenario } from "../engine/scenario.ts";
import { median, type Interval } from "../engine/stats.ts";
import { assertReps, baseSlotDesign, lt, type LocalizedText, type RunOpts } from "./common.ts";
import { fmtMin, fmtNum, fmtPct } from "./i18n-format.ts";
import { bookingDemand, runSlotDesign, totalSlots } from "./optimize.ts";

export const DEFAULT_SLOT_LENGTHS = [15, 20, 30, 45, 60] as const;
export const DEFAULT_SLOT_DESIGN_REPS = 40;

/**
 * PRODUKTBESLUT: designer vars median p90-väntan ligger inom 1 min från bästa räknas som likvärdiga
 * (skillnader under modellens precision). Bland dem väljs den med färst bokningsbara platser (mindre att
 * administrera och mindre överbokning), därefter längst slot (färre bokningsfönster).
 */
export const SLOT_TIE_TOLERANCE_MIN = 1;

/** Kapaciteter som provas, som multiplar av snittbehovet per timme när inget intervall anges. */
export const SLOT_CAPACITY_MULTIPLIERS = [1, 1.15, 1.3, 1.5, 1.75] as const;

export interface SlotGridRow {
  lengthMin: number;
  capacityPerHour: number;
  bookableSlots: number;
  avgWait: Interval;
  p90Wait: Interval;
  walkInShare: Interval;
}

export interface SlotDesignResult {
  grid: SlotGridRow[];
  recommended: SlotGridRow | null;
  reason: LocalizedText;
  /** Median lossningstid i historiken (inkl. scenariots lossningsfaktor). */
  medianUnloadMin: number;
  /** Medellossningstid (inkl. lossningsfaktor). Genomströmning = dörrar × 60 / medel – medianen underskattar dörrtiden vid högerskev fördelning. */
  meanUnloadMin: number;
  expectedDemand: number;
  /** Kombinationer som hoppades över eftersom kapaciteten inte räcker till efterfrågan. */
  skippedInsufficient: number;
  reps: number;
}

export interface SlotDesignOpts extends Partial<RunOpts> {
  lengths?: readonly number[];
  /** [min, max] bokningar per timme (heltal); högst 6 jämnt fördelade värden provas. */
  capacityRange?: [number, number];
  /** Andel i tid; null = empirisk fördelning. Standard: scenariots värde om bokat, annars null. */
  adherence?: number | null;
}

export function suggestSlotDesign(model: SiteModel, scenario: CompiledScenario, opts: SlotDesignOpts = {}): SlotDesignResult {
  const reps = opts.reps ?? DEFAULT_SLOT_DESIGN_REPS;
  assertReps(reps);
  const seed = opts.seed ?? scenario.seed;
  const base = baseSlotDesign(scenario);
  const adherence = opts.adherence !== undefined ? opts.adherence : base.adherence;
  const demand = bookingDemand(model, scenario);
  const hours = Math.max(1 / 60, (base.to - base.from) / 60);
  const caps = capacities(opts.capacityRange, demand / hours);
  const lengths = opts.lengths ?? DEFAULT_SLOT_LENGTHS;

  const grid: SlotGridRow[] = [];
  let skipped = 0;
  for (const lengthMin of lengths) {
    for (const capacityPerHour of caps) {
      const design: SlotDesign = { ...base, lengthMin, capacityPerHour, adherence };
      const bookable = totalSlots(design);
      if (bookable < demand) {
        skipped++;
        continue;
      }
      const r = runSlotDesign(model, scenario, design, { reps, seed });
      grid.push({ lengthMin, capacityPerHour, bookableSlots: bookable, avgWait: r.summary.avgWait, p90Wait: r.summary.p90Wait, walkInShare: r.walkInShare });
    }
  }

  const best = Math.min(...grid.map((g) => g.p90Wait.median));
  const recommended =
    grid
      .filter((g) => g.p90Wait.median <= best + SLOT_TIE_TOLERANCE_MIN)
      .sort((a, b) => a.bookableSlots - b.bookableSlots || b.lengthMin - a.lengthMin)[0] ?? null;
  const unloads = model.unloadSamples.map((s) => s.unloadMin * scenario.unloadFactor);
  const medianUnloadMin = median(unloads);
  const meanUnloadMin = unloads.length > 0 ? unloads.reduce((a, b) => a + b, 0) / unloads.length : NaN;
  return {
    grid,
    recommended,
    reason: reasonText(recommended, medianUnloadMin, meanUnloadMin, scenario.site.doors.length),
    medianUnloadMin,
    meanUnloadMin,
    expectedDemand: demand,
    skippedInsufficient: skipped,
    reps,
  };
}

function capacities(range: [number, number] | undefined, avgNeed: number): number[] {
  if (range) {
    const [a, b] = [Math.max(1, Math.round(range[0])), Math.max(1, Math.round(range[1]))];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const n = Math.min(6, hi - lo + 1);
    const out = new Set<number>();
    for (let i = 0; i < n; i++) out.add(Math.round(lo + ((hi - lo) * i) / Math.max(1, n - 1)));
    return [...out];
  }
  return [...new Set(SLOT_CAPACITY_MULTIPLIERS.map((m) => Math.max(1, Math.ceil(avgNeed * m))))];
}

function reasonText(rec: SlotGridRow | null, medUnload: number, meanUnload: number, doors: number): LocalizedText {
  if (!rec) {
    return lt(
      "Ingen slotdesign i rutnätet har tillräcklig kapacitet för efterfrågan – öka kapaciteten per timme eller bokningsfönstret.",
      "No slot design in the grid has enough capacity for demand – increase capacity per hour or the booking window.",
    );
  }
  // Genomströmning bygger på MEDEL-lossningstiden: dörrarnas totala tid = antal × medel.
  const perHour = (doors * 60) / meanUnload;
  const lenSv = rec.lengthMin >= medUnload ? "täcker en typisk lossning" : "är kortare än en typisk lossning, så kapaciteten per timme måste hållas nere";
  const lenEn = rec.lengthMin >= medUnload ? "covers a typical unload" : "is shorter than a typical unload, so capacity per hour must be kept down";
  return lt(
    `Lossningstid median ${fmtMin(medUnload, "sv")}, medel ${fmtMin(meanUnload, "sv")} ⇒ ${doors} dörrar hinner ca ${fmtNum(perHour, "sv", 1)} lastbilar/timme (räknat på medel). ` +
      `Rekommenderat: ${rec.lengthMin}-minuters slots med ${rec.capacityPerHour} bokningar/timme – slotlängden ${lenSv}. ` +
      `p90-väntan ${fmtMin(rec.p90Wait.median, "sv")}, ${fmtPct(rec.walkInShare.median, "sv")} obokade.`,
    `Unload time median ${fmtMin(medUnload, "en")}, mean ${fmtMin(meanUnload, "en")} ⇒ ${doors} doors can handle about ${fmtNum(perHour, "en", 1)} trucks/hour (based on the mean). ` +
      `Recommended: ${rec.lengthMin}-minute slots with ${rec.capacityPerHour} bookings/hour – the slot length ${lenEn}. ` +
      `p90 wait ${fmtMin(rec.p90Wait.median, "en")}, ${fmtPct(rec.walkInShare.median, "en")} unbooked.`,
  );
}
