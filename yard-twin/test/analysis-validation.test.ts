import { describe, expect, it } from "vitest";
import { backtestDays, holdoutBacktest, type BacktestResult } from "../src/analysis/backtest.ts";
import { GRADE_THRESHOLDS, gradeCalibration } from "../src/analysis/grade.ts";
import type { RecordedDay } from "../src/data/contract.ts";
import { generateDay } from "../src/engine/arrivals.ts";
import type { RecordedTruck, SiteModel } from "../src/engine/model.ts";
import type { CompiledScenario } from "../src/engine/scenario.ts";
import { simulateDay } from "../src/engine/simulate.ts";
import { mean, quantile } from "../src/engine/stats.ts";
import { testModel, testScenario } from "./fixtures.ts";

/** Bygg en "inspelad" dag ur motorn: generera lastbilar, simulera FCFS och räkna verkliga nyckeltal ur utfallen. */
function recordDay(model: SiteModel, sc: CompiledScenario, date: string, rep: number): RecordedDay {
  const trucks = generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "inspelat", rep });
  const res = simulateDay(trucks, sc.site, { kind: "fcfs", onTimeToleranceMin: 15 }, sc.cost, { detail: true });
  const rec: RecordedTruck[] = trucks.map((t) => ({
    id: t.id, arrival: t.arrival, slotStart: null, slotEnd: null, carrier: t.carrier, goodsType: t.goodsType, pallets: t.pallets,
    unloadMin: t.unloadTime, gateMin: t.gateTime, paperMin: t.paperTime,
  }));
  const waits = res.trucks.map((o) => o.waitToDoor ?? NaN);
  const ev: [number, number][] = [];
  for (const o of res.trucks) {
    ev.push([o.arrival, 1]);
    if (o.doorStart !== null) ev.push([o.doorStart, -1]);
  }
  ev.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let q = 0, maxQueue = 0;
  for (const [, d] of ev) maxQueue = Math.max(maxQueue, (q += d));
  let busy = 0;
  for (const o of res.trucks) {
    if (o.doorStart === null || o.doorEnd === null) continue;
    busy += Math.max(0, Math.min(o.doorEnd, sc.site.openTo) - Math.max(o.doorStart, sc.site.openFrom));
  }
  const doors = sc.site.doors.length;
  return {
    date,
    isoWeekday: 1,
    trucks: rec,
    doorsObserved: doors,
    actual: {
      date,
      trucks: trucks.length,
      avgWait: mean(waits),
      p90Wait: quantile(waits, 0.9),
      maxQueue,
      doorUtilization: busy / (doors * (sc.site.openTo - sc.site.openFrom)),
      timeToEmpty: res.metrics.timeToEmpty,
    },
  };
}

function dateOf(i: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  return d.toISOString().slice(0, 10);
}

const model = testModel();
const sc = testScenario();
const days = Array.from({ length: 30 }, (_, i) => recordDay(model, sc, dateOf(i), i));
const wrongModel: SiteModel = { ...model, unloadSamples: model.unloadSamples.map((s) => ({ ...s, unloadMin: s.unloadMin * 1.5 })) };

describe("backtest", () => {
  it("replay med verkliga tjänstetider ger nästan noll fel", () => {
    const bt = backtestDays({ days, model, scenario: sc, serviceTimes: "recorded", reps: 20 });
    expect(bt.days).toHaveLength(30);
    expect(bt.metrics.avgWait.wmape!).toBeLessThan(0.02);
    expect(bt.metrics.p90Wait.wmape!).toBeLessThan(0.02);
    expect(bt.metrics.doorUtilization.wmape!).toBeLessThan(0.02);
    expect(bt.metrics.maxQueue.wmape!).toBeLessThan(0.05);
    expect(bt.metrics.avgWait.coverage).toBeGreaterThan(0.95);
  });

  it("fel modell (lossning ×1,5) ger stort fel och positiv bias; rätt modell mindre", () => {
    const test = days.slice(0, 12);
    const good = backtestDays({ days: test, model, scenario: sc, serviceTimes: "sampled", reps: 30 });
    const bad = backtestDays({ days: test, model: wrongModel, scenario: sc, serviceTimes: "sampled", reps: 30 });
    expect(bad.metrics.avgWait.wmape!).toBeGreaterThan(0.3);
    expect(bad.metrics.avgWait.relativeBias!).toBeGreaterThan(0.3);
    expect(good.metrics.avgWait.wmape!).toBeLessThan(bad.metrics.avgWait.wmape!);
    const g = gradeCalibration({ calibrationDays: 100, visits: 1000, outOfSample: good });
    const b = gradeCalibration({ calibrationDays: 100, visits: 1000, outOfSample: bad });
    const rank = { insufficient: 0, low: 1, medium: 2, high: 3 };
    expect(rank[b.grade]).toBeLessThan(rank[g.grade]);
    expect(b.grade).toBe("low");
    expect(b.warning).toBe(true);
    expect(b.primaryError!).toBeGreaterThan(g.primaryError!);
  });

  it("MAPE hoppar över dagar med verklig väntan < 1 min och redovisar n", () => {
    const zero = days.slice(0, 3).map((d, i) => (i === 0 ? { ...d, actual: { ...d.actual, avgWait: 0.5 } } : d));
    const bt = backtestDays({ days: zero, model, scenario: sc, serviceTimes: "recorded", reps: 1 });
    expect(bt.metrics.avgWait.n).toBe(3);
    expect(bt.metrics.avgWait.nMape).toBe(bt.days.filter((r) => r.actual.avgWait >= 1).length);
  });

  it("holdout delar kronologiskt 70/30 och kalibrerar bara på träningsdagar", () => {
    let seen: string[] = [];
    const shuffled = [...days.slice(0, 10)].reverse();
    const h = holdoutBacktest({ days: shuffled, scenario: sc, reps: 10, calibrate: (train) => ((seen = train.map((d) => d.date)), model) });
    expect(h.trainDates).toHaveLength(7);
    expect(h.testDates).toHaveLength(3);
    expect(seen).toEqual(h.trainDates);
    expect(h.trainDates[h.trainDates.length - 1] < h.testDates[0]).toBe(true);
    expect(h.outOfSample.serviceTimes).toBe("sampled");
    expect(h.replay.serviceTimes).toBe("recorded");
    expect(h.replay.metrics.avgWait.wmape!).toBeLessThan(0.02);
  });
});

function fakeBt(nDays: number, wmape: number, relativeBias: number, coverage: number): BacktestResult {
  return {
    serviceTimes: "sampled",
    reps: 1,
    days: new Array(nDays).fill(null) as BacktestResult["days"],
    metrics: {
      avgWait: { n: nDays, mae: 1, mape: wmape, nMape: nDays, wmape, bias: 0, relativeBias, coverage },
    } as BacktestResult["metrics"],
    skipped: [],
    elapsedMs: 0,
  };
}

describe("kalibreringsbetyg", () => {
  const H = GRADE_THRESHOLDS.high;
  const M = GRADE_THRESHOLDS.medium;
  const I = GRADE_THRESHOLDS.insufficient;
  it("för lite data ger insufficient utan felsiffra", () => {
    for (const [d, v, t] of [[I.minDays - 1, 1000, 20], [100, I.minVisits - 1, 20], [100, 1000, I.minTestDays - 1]]) {
      const g = gradeCalibration({ calibrationDays: d, visits: v, outOfSample: fakeBt(t, 0.05, 0, 0.9) });
      expect(g.grade).toBe("insufficient");
      expect(g.primaryError).toBeNull();
      expect(g.warning).toBe(true);
    }
  });
  it("hög precis på gränserna", () => {
    const g = gradeCalibration({ calibrationDays: H.minDays, visits: H.minVisits, outOfSample: fakeBt(10, H.maxWmape, H.maxAbsRelBias, H.minCoverage) });
    expect(g.grade).toBe("high");
    expect(g.warning).toBe(false);
    expect(g.primaryError).toBe(H.maxWmape);
    expect(g.reasons.every((r) => r.sv.startsWith("✓"))).toBe(true);
  });
  it("strax över high-gränser ger medium", () => {
    const base = { calibrationDays: H.minDays, visits: H.minVisits };
    expect(gradeCalibration({ ...base, outOfSample: fakeBt(10, H.maxWmape + 0.001, 0, 0.9) }).grade).toBe("medium");
    expect(gradeCalibration({ ...base, outOfSample: fakeBt(10, 0.05, -(H.maxAbsRelBias + 0.01), 0.9) }).grade).toBe("medium");
    expect(gradeCalibration({ ...base, outOfSample: fakeBt(10, 0.05, 0, H.minCoverage - 0.01) }).grade).toBe("medium");
    expect(gradeCalibration({ calibrationDays: H.minDays - 1, visits: H.minVisits, outOfSample: fakeBt(10, 0.05, 0, 0.9) }).grade).toBe("medium");
  });
  it("medium/low-gränser och varningar", () => {
    const m = gradeCalibration({ calibrationDays: M.minDays, visits: M.minVisits, outOfSample: fakeBt(10, M.maxWmape, 0.15, 0.5) });
    expect(m.grade).toBe("medium");
    expect(m.warning).toBe(false);
    const l1 = gradeCalibration({ calibrationDays: M.minDays, visits: M.minVisits, outOfSample: fakeBt(10, M.maxWmape + 0.01, 0, 0.9) });
    expect(l1.grade).toBe("low");
    expect(l1.warning).toBe(true);
    const l2 = gradeCalibration({ calibrationDays: M.minDays - 1, visits: 1000, outOfSample: fakeBt(10, 0.05, 0, 0.9) });
    expect(l2.grade).toBe("low");
    expect(l2.reasons.some((r) => r.sv.includes("59 kalibreringsdagar"))).toBe(true);
    expect(l2.reasons.some((r) => r.en.includes("5%") || r.en.includes("5.0%"))).toBe(true);
  });
});
