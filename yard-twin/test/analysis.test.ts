import { describe, expect, it } from "vitest";
import { analyzeBottleneck } from "../src/analysis/bottleneck.ts";
import { capacityLimit, CAPACITY_TOLERANCE } from "../src/analysis/capacity.ts";
import { withDoors } from "../src/analysis/common.ts";
import { fmtMin, fmtMoney, fmtNum, fmtPct, THIN_SPACE } from "../src/analysis/i18n-format.ts";
import { generateInsights, peakWindow } from "../src/analysis/insights.ts";
import { dataLimitations, LIMITATIONS } from "../src/analysis/limitations.ts";
import { doorSweep, slotSweep } from "../src/analysis/optimize.ts";
import { computeRoi, RoiInputError, type RoiInputs } from "../src/analysis/roi.ts";
import { tornado } from "../src/analysis/sensitivity.ts";
import { suggestSlotDesign } from "../src/analysis/slotDesign.ts";
import { runDetailed, runMonteCarlo } from "../src/engine/montecarlo.ts";
import type { RunMetrics, RunResult } from "../src/engine/types.ts";
import { testModel, testScenario, testScenarioFile } from "./fixtures.ts";

const model = testModel();
const sc = testScenario();
const siteFile = testScenarioFile().site;

describe("formatering", () => {
  it("svensk och engelsk stil", () => {
    expect(fmtNum(12345.6, "sv", 1)).toBe(`12${THIN_SPACE}345,6`);
    expect(fmtNum(12345.6, "en", 1)).toBe("12,345.6");
    expect(fmtMin(4.25, "sv")).toBe("4,3 min");
    expect(fmtMin(42.4, "en")).toBe("42 min");
    expect(fmtMoney(12345, "SEK", "sv")).toBe(`12${THIN_SPACE}345 kr`);
    expect(fmtPct(0.42, "en")).toBe("42%");
    expect(fmtNum(NaN, "sv")).toBe("–");
  });
});

describe("tornado", () => {
  it("volym och dörrar dominerar över grindfiler; samma seed ger samma resultat", () => {
    const a = tornado(model, sc, { reps: 60 });
    const b = tornado(model, sc, { reps: 60 });
    expect(a).toEqual(b);
    const swing = (p: string) => a.bars.find((x) => x.param === p)!.swing;
    expect(swing("volumeFactor")).toBeGreaterThan(swing("gateLanes"));
    expect(swing("doors")).toBeGreaterThan(swing("gateLanes"));
    for (let i = 1; i < a.bars.length; i++) expect(a.bars[i].swing).toBeLessThanOrEqual(a.bars[i - 1].swing);
    expect(a.bars.some((x) => x.param === "detentionFreeMin")).toBe(false);
    expect(a.bars.some((x) => x.param === "slotAdherence")).toBe(false);
    expect(a.bars.find((x) => x.param === "doors")!.label.en).toBe("Number of doors");
  });
  it("kostnadsmått tar med fri tid; bokat mönster tar med följsamhet", () => {
    const booked = testScenario({ arrivals: { pattern: "booked", volumeFactor: 1, slot: { lengthMin: 30, capacityPerHour: 8, from: "05:00", to: "15:00", adherence: 0.8, toleranceMin: 15 } } });
    const t = tornado(model, booked, { reps: 20, metric: "detentionCost" });
    const adh = t.bars.find((x) => x.param === "slotAdherence")!;
    expect(adh.lowSetting).toBeCloseTo(0.65);
    expect(adh.highSetting).toBeCloseTo(0.95);
    const free = t.bars.find((x) => x.param === "detentionFreeMin")!;
    expect(free.highValue).toBeLessThanOrEqual(free.lowValue);
  });
});

describe("dörrsvep", () => {
  it("minimalDoors stämmer med brute force och kurvan är ungefär monoton", () => {
    const target = { metric: "p90Wait" as const, max: 20, quantile: "median" as const };
    const r = doorSweep(model, sc, { target, reps: 40, maxDoors: 9, costPerDoorPerDay: 500 });
    expect(r.steps.map((s) => s.doors)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let brute: number | null = null;
    for (let n = 1; n <= 9 && brute === null; n++) {
      if (runMonteCarlo(model, withDoors(sc, n), { reps: 40 }).summary.p90Wait.median <= 20) brute = n;
    }
    expect(r.minimalDoors).toBe(brute);
    expect(brute).not.toBeNull();
    for (let i = 1; i < r.steps.length; i++) {
      expect(r.steps[i].summary.p90Wait.median).toBeLessThanOrEqual(r.steps[i - 1].summary.p90Wait.median + 1);
    }
    expect(r.steps[0].marginalGain).toBeNull();
    expect(r.costOptimalDoors).not.toBeNull();
    expect(r.diminishing).not.toBeNull();
    expect(r.diminishing!.text.sv).toMatch(/dörrar/);
  });
  it("slotsvep: fler slots ger färre obokade", () => {
    const r = slotSweep(model, sc, { target: { metric: "avgWait", max: 15, quantile: "median" }, capacities: [4, 6, 8, 12], reps: 20 });
    expect(r.steps).toHaveLength(4);
    expect(r.steps[3].walkInShare.median).toBeLessThan(r.steps[0].walkInShare.median);
    expect(r.minimalCapacity).toBe(r.steps.find((s) => s.meetsTarget)?.capacityPerHour ?? null);
    expect(r.expectedDemand).toBeGreaterThan(0);
  });
});

describe("kapacitetsgräns", () => {
  it("brytpunkten omsluter målet", () => {
    const target = { metric: "p90Wait" as const, max: 30, quantile: "median" as const };
    const r = capacityLimit(model, sc, { target, reps: 40 });
    expect(r.lastOkFactor).not.toBeNull();
    expect(r.breakpointFactor).not.toBeNull();
    expect(r.breakpointFactor! - r.lastOkFactor!).toBeLessThanOrEqual(CAPACITY_TOLERANCE + 1e-9);
    const ok = r.curve.find((p) => p.factor === Math.round(r.lastOkFactor! * 1e6) / 1e6)!;
    const br = r.curve.find((p) => p.factor === Math.round(r.breakpointFactor! * 1e6) / 1e6)!;
    expect(ok.value.median).toBeLessThanOrEqual(30);
    expect(ok.breakdown).toBe(false);
    expect(br.violatesTarget || br.breakdown).toBe(true);
    expect(r.fired).not.toBeNull();
    expect(r.margin).toBeCloseTo(r.lastOkFactor! - 1);
    for (let i = 1; i < r.curve.length; i++) expect(r.curve[i].factor).toBeGreaterThan(r.curve[i - 1].factor);
  });
  it("redan bruten i dag ger negativ marginal", () => {
    const r = capacityLimit(model, sc, { target: { metric: "avgWait", max: 0.01, quantile: "median" }, reps: 20 });
    expect(r.lastOkFactor === null || r.margin! < 0).toBe(true);
  });
});

describe("flaskhals", () => {
  it("en grindfil med långa grindtider flaggar grinden", () => {
    const m = { ...model, gateSamples: [9, 10, 11] };
    const s = testScenario({ site: { ...siteFile, doors: 20, gateLanes: 1 } });
    const r = analyzeBottleneck(m, s, { reps: 15 });
    expect(r.bottleneck).toBe("gate");
    expect(r.resources.find((x) => x.resource === "gate")!.saturated).toBe(true);
    expect(r.cascade[1].config.gateLanes).toBe(2);
    expect(r.explanation.sv).toMatch(/Grinden/);
  });
  it("få dörrar och kort grind flaggar dörrarna; kaskaden flyttar flaskhalsen", () => {
    const m = { ...model, gateSamples: [1] };
    const s = testScenario({ site: { ...siteFile, doors: 3, gateLanes: 2, parkingSpaces: 10 } });
    const r = analyzeBottleneck(m, s, { reps: 15 });
    expect(r.bottleneck).toBe("doors");
    expect(r.cascade.length).toBeGreaterThanOrEqual(2);
    expect(r.cascade[1].config.doors).toBe(4);
    expect(r.cascade[1].avgWait).toBeLessThan(r.cascade[0].avgWait);
    expect(r.resources.find((x) => x.resource === "parking")!.utilization).not.toBeNull();
  });
});

describe("slotdesign", () => {
  it("rekommenderar en design med motivering ur lossningsdata", () => {
    const r = suggestSlotDesign(model, sc, { lengths: [30, 60], reps: 10 });
    expect(r.grid.length).toBeGreaterThan(0);
    for (const g of r.grid) expect(g.bookableSlots).toBeGreaterThanOrEqual(r.expectedDemand);
    expect(r.recommended).not.toBeNull();
    const best = Math.min(...r.grid.map((g) => g.p90Wait.median));
    expect(r.recommended!.p90Wait.median).toBeLessThanOrEqual(best + 1);
    expect(r.reason.sv).toMatch(/^Medianlossning \d+ min/);
    expect(r.reason.en).toMatch(/^Median unload/);
  });
});

const INPUTS: RoiInputs = { detentionCostPerHour: 600, staffCostPerHour: 1200, carrierFeePerTruckOverLimit: 250, operatingDaysPerMonth: 21, currency: "SEK", source: "testdata" };

describe("ROI", () => {
  it("samma scenario ger noll besparing", () => {
    const r = computeRoi({ model, without: sc, with: sc, inputs: INPUTS, reps: 30 });
    expect(r.daily).toEqual({ median: 0, p10: 0, p90: 0, mean: 0 });
    expect(r.assumptions.map((a) => a.key)).toContain("staffCostPerHour");
    expect(r.assumptions.find((a) => a.key === "detentionCostPerHour")!.source).toBe("testdata");
  });
  it("fler dörrar ger ordnade intervall och positiv besparing", () => {
    const few = testScenario({ site: { ...siteFile, doors: 4 } });
    const r = computeRoi({ model, without: few, with: sc, inputs: INPUTS, reps: 40 });
    for (const i of [r.daily, r.monthly, r.yearly, r.breakdown.detention, r.breakdown.overtimeStaff, r.breakdown.carrierFees]) {
      expect(i.p10).toBeLessThanOrEqual(i.median);
      expect(i.median).toBeLessThanOrEqual(i.p90);
    }
    expect(r.daily.median).toBeGreaterThan(0);
    expect(r.monthly.median).toBeCloseTo(r.daily.median * 21);
    expect(r.yearly.median).toBeCloseTo(r.monthly.median * 12);
  });
  it("saknade indata ger fel som namnger fältet", () => {
    const { staffCostPerHour: _s, ...partial } = INPUTS;
    expect(() => computeRoi({ model, without: sc, with: sc, inputs: partial })).toThrow(RoiInputError);
    try {
      computeRoi({ model, without: sc, with: sc, inputs: { ...partial, source: " " } });
    } catch (e) {
      expect((e as RoiInputError).missing).toEqual(["staffCostPerHour", "source"]);
    }
  });
});

function fakeResult(over: Partial<RunMetrics> = {}): RunResult {
  const metrics: RunMetrics = {
    trucks: 10, unloaded: 10, notUnloaded: 0, avgWait: 10, p90Wait: 20, maxWait: 30, maxQueue: 10, overDetention: 0, detentionCost: 0,
    doorUtilization: 0.5, gateUtilization: 0.3, maxParking: 4, overflowTrucks: 0, timeToEmpty: 14 * 60, overtimeMin: 0, unloadedByClose: 10, ...over,
  };
  const series = [
    { t: 400, waiting: 0, onSite: 0 },
    { t: 470, waiting: 2, onSite: 2 },
    { t: 485, waiting: 6, onSite: 6 },
    { t: 540, waiting: 10, onSite: 10 },
    { t: 605, waiting: 3, onSite: 5 },
    { t: 700, waiting: 0, onSite: 0 },
  ];
  const doorIntervals = [
    { doorId: "D1", truckId: "a", start: 480, end: 600 },
    { doorId: "D2", truckId: "b", start: 480, end: 540 },
    { doorId: "D1", truckId: "c", start: 610, end: 640 },
  ];
  return { metrics, trucks: [], series, doorIntervals };
}

describe("insikter", () => {
  it("köfönster ur konstruerad tidsserie", () => {
    expect(peakWindow(fakeResult().series)).toEqual({ from: 480, to: 600, max: 10 });
    const sv = generateInsights({ result: fakeResult(), lang: "sv", currency: "SEK", closeAt: 15 * 60 });
    expect(sv.find((i) => i.id === "queue-peak")!.text).toContain("Köerna uppstår 08:00–10:00");
    expect(sv.find((i) => i.id === "empty-before-close")!.text).toContain("60 min före stängning");
    const en = generateInsights({ result: fakeResult(), lang: "en", currency: "SEK" });
    expect(en.find((i) => i.id === "queue-peak")!.text).toContain("08:00–10:00");
    expect(en.find((i) => i.id === "door-peak")!.text).toContain("08:00–09:00 (100%)");
  });
  it("utelämnar insikter vars tal är NaN", () => {
    const out = generateInsights({ result: fakeResult({ overDetention: 2, detentionCost: NaN, overtimeMin: NaN }), lang: "sv", currency: "SEK" });
    expect(out.find((i) => i.id === "detention")).toBeUndefined();
    expect(out.find((i) => i.id === "overtime")).toBeUndefined();
    for (const i of out) expect(i.text).not.toMatch(/NaN|Infinity/);
  });
  it("riktig körning med jämförelse, sv och en", () => {
    const few = testScenario({ site: { ...siteFile, doors: 4 } });
    const baseMc = runMonteCarlo(model, few, { reps: 30 });
    const mc = runMonteCarlo(model, sc, { reps: 30 });
    for (const lang of ["sv", "en"] as const) {
      const out = generateInsights({ result: runDetailed(model, few), mc: baseMc, compare: { label: "6 dörrar", mc, baseLabel: "4 dörrar", baseMc }, lang, currency: "SEK", doorCount: 4 });
      expect(out.length).toBeGreaterThan(3);
      for (const i of out) expect(i.text).not.toMatch(/NaN|Infinity|undefined/);
      const cmp = out.find((i) => i.id === "compare-avgwait")!;
      expect(cmp.severity).toBe("good");
      if (lang === "sv") expect(cmp.text).toMatch(/sjunker medelväntan från [\d , ]+ min till/);
      else expect(cmp.text).toMatch(/average wait falls from/);
    }
  });
});

describe("begränsningar", () => {
  it("statisk lista och databeroende tillägg", () => {
    expect(LIMITATIONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LIMITATIONS.map((l) => l.id)).size).toBe(LIMITATIONS.length);
    const m = { ...model, unloadSamples: model.unloadSamples.map((s) => ({ ...s, pallets: null })), gateSamples: [], provenance: { noShowRate: { kind: "assumption" as const, source: "säljare" } } };
    const ids = dataLimitations(m, { calibrationDays: 20 }).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["no-pallets", "no-gate-times", "assumption:noShowRate", "short-history"]));
    expect(dataLimitations(model).map((l) => l.id)).not.toContain("no-pallets");
  });
});
