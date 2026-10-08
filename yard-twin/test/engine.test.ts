import { describe, expect, it } from "vitest";
import { buildSlots, generateDay } from "../src/engine/arrivals.ts";
import { MinHeap } from "../src/engine/heap.ts";
import { compareStrategies, pairedDelta, runDetailed, runMonteCarlo } from "../src/engine/montecarlo.ts";
import { Rng } from "../src/engine/rng.ts";
import { compileScenario, scenarioHash, validateScenario } from "../src/engine/scenario.ts";
import { simulateDay } from "../src/engine/simulate.ts";
import { mean, quantile } from "../src/engine/stats.ts";
import { formatClock, parseClock } from "../src/engine/time.ts";
import { COST, FCFS, site, testModel, testScenario, testScenarioFile, truck } from "./fixtures.ts";

describe("Rng", () => {
  it("är deterministisk för samma seed och olika för olika seed", () => {
    const a = new Rng("x"), b = new Rng("x"), c = new Rng("y");
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });
  it("ger rimlig Poisson-medel", () => {
    const r = new Rng("p");
    const xs = Array.from({ length: 4000 }, () => r.poisson(7));
    expect(mean(xs)).toBeGreaterThan(6.8);
    expect(mean(xs)).toBeLessThan(7.2);
  });
});

describe("MinHeap", () => {
  it("poppar i (tid, seq)-ordning", () => {
    const h = new MinHeap<{ time: number; seq: number }>();
    [[5, 0], [1, 1], [5, 2], [3, 3], [1, 4]].forEach(([time, seq]) => h.push({ time, seq }));
    const out = [];
    while (h.size) out.push(h.pop()!);
    expect(out.map((e) => [e.time, e.seq])).toEqual([[1, 1], [1, 4], [3, 3], [5, 0], [5, 2]]);
  });
});

describe("time", () => {
  it("parsar och formaterar klocktid", () => {
    expect(parseClock("06:30")).toBe(390);
    expect(formatClock(390)).toBe("06:30");
    expect(() => parseClock("6.30")).toThrow();
  });
});

describe("simulateDay – handräknade fall", () => {
  it("en dörr, tre bilar: kön byggs upp och betas av", () => {
    const r = simulateDay([truck("a", 0, 30), truck("b", 10, 30), truck("c", 20, 30)], site(1), FCFS, COST, { detail: true });
    const by = Object.fromEntries(r.trucks.map((t) => [t.id, t]));
    expect([by.a.doorStart, by.b.doorStart, by.c.doorStart]).toEqual([0, 30, 60]);
    expect([by.a.waitToDoor, by.b.waitToDoor, by.c.waitToDoor]).toEqual([0, 20, 40]);
    expect(r.metrics.avgWait).toBe(20);
    expect(r.metrics.maxQueue).toBe(2);
    expect(r.metrics.timeToEmpty).toBe(90);
  });

  it("två dörrar halverar kön", () => {
    const r = simulateDay([truck("a", 0, 30), truck("b", 0, 30), truck("c", 0, 30)], site(2), FCFS, COST);
    expect(r.metrics.avgWait).toBe(10);
  });

  it("grindfil seriekopplar incheckning", () => {
    const ts = [truck("a", 0, 10, { gateTime: 5 }), truck("b", 0, 10, { gateTime: 5 })];
    const r = simulateDay(ts, site(2), FCFS, COST, { detail: true });
    expect(r.trucks.map((t) => t.doorStart)).toEqual([5, 10]);
  });

  it("väntar till öppning", () => {
    const r = simulateDay([truck("a", 300, 20)], site(1, { openFrom: 360, openTo: 900 }), FCFS, COST, { detail: true });
    expect(r.trucks[0].doorStart).toBe(360);
  });

  it("utan övertid lossas inte bilar efter stängning", () => {
    const s = site(1, { openFrom: 0, openTo: 50, allowOvertime: false });
    // a lossar 0–60; b skulle börja 60 > stängning 50
    const r = simulateDay([truck("a", 0, 60), truck("b", 1, 40)], s, FCFS, COST);
    expect(r.metrics.unloaded).toBe(1);
    expect(r.metrics.notUnloaded).toBe(1);
  });

  it("räknar övertid och lossade före stängning", () => {
    const s = site(1, { openFrom: 0, openTo: 50 });
    const r = simulateDay([truck("a", 0, 40), truck("b", 1, 40)], s, FCFS, COST);
    expect(r.metrics.overtimeMin).toBe(30);
    expect(r.metrics.unloadedByClose).toBe(1);
  });

  it("fulla uppställningsplatser ger overflow", () => {
    const ts = [truck("a", 0, 100), truck("b", 1, 10), truck("c", 2, 10)];
    const r = simulateDay(ts, site(1, { parkingSpaces: 1 }), FCFS, COST);
    expect(r.metrics.maxParking).toBe(1);
    expect(r.metrics.overflowTrucks).toBe(1);
  });

  it("detention startar vid bokad tid om bilen kom tidigt", () => {
    const t = truck("a", 0, 200, { slotStart: 60, slotEnd: 90 });
    const r = simulateDay([t], site(1), FCFS, { ...COST, detentionFreeMin: 120 }, { detail: true });
    // avgång 200, klocka från 60 => 140 min, fri tid 120 => 20 min detention
    expect(r.trucks[0].detentionMin).toBe(20);
    expect(r.metrics.overDetention).toBe(1);
    expect(r.metrics.detentionCost).toBeCloseTo((20 / 60) * 600);
  });

  it("dörrbeläggning inom öppettid", () => {
    const r = simulateDay([truck("a", 0, 50)], site(2, { openFrom: 0, openTo: 100 }), FCFS, COST);
    expect(r.metrics.doorUtilization).toBeCloseTo(50 / 200);
  });

  it("tidsserien når noll när gården är tom", () => {
    const r = simulateDay([truck("a", 0, 30, { paperTime: 5 }), truck("b", 10, 30)], site(1), FCFS, COST, { detail: true });
    expect(r.series[r.series.length - 1]).toMatchObject({ waiting: 0, onSite: 0 });
    expect(r.doorIntervals).toHaveLength(2);
  });
});

describe("strategier", () => {
  const blocker = truck("blk", 0, 60);
  it("booked-first prioriterar bokad bil som kom i tid", () => {
    const ts = [blocker, truck("walk", 5, 10), truck("book", 20, 10, { slotStart: 30, slotEnd: 60 })];
    const fcfs = simulateDay(ts, site(1), FCFS, COST, { detail: true });
    const bf = simulateDay(ts, site(1), { kind: "booked-first", onTimeToleranceMin: 15 }, COST, { detail: true });
    const order = (r: typeof fcfs) => r.trucks.filter((t) => t.id !== "blk").sort((a, b) => a.doorStart! - b.doorStart!).map((t) => t.id);
    expect(order(fcfs)).toEqual(["walk", "book"]);
    expect(order(bf)).toEqual(["book", "walk"]);
  });
  it("booked-first ger inte sen bil förtur", () => {
    const ts = [blocker, truck("walk", 5, 10), truck("late", 20, 10, { slotStart: 0, slotEnd: 30 })];
    const bf = simulateDay(ts, site(1), { kind: "booked-first", onTimeToleranceMin: 15 }, COST, { detail: true });
    expect(bf.trucks.find((t) => t.id === "walk")!.doorStart).toBe(60);
  });
  it("priority ger kyl förtur", () => {
    const ts = [blocker, truck("torr", 5, 10), truck("kyl", 6, 10, { goodsType: "kyl" })];
    const r = simulateDay(ts, site(1), { kind: "priority", priorities: { kyl: 10 }, onTimeToleranceMin: 15 }, COST, { detail: true });
    expect(r.trucks.find((t) => t.id === "kyl")!.doorStart).toBe(60);
  });
  it("specialized respekterar dörrbehörighet", () => {
    const s = site(2);
    s.doors[0].goodsTypes = ["kyl"];
    s.doors[1].goodsTypes = ["torr"];
    const ts = [truck("t1", 0, 30), truck("t2", 0, 30), truck("k1", 0, 30, { goodsType: "kyl" })];
    const r = simulateDay(ts, s, { kind: "specialized", onTimeToleranceMin: 15 }, COST, { detail: true });
    const by = Object.fromEntries(r.trucks.map((t) => [t.id, t]));
    expect(by.k1.doorId).toBe("D1");
    expect(by.t1.doorId).toBe("D2");
    expect(by.t2.doorStart).toBe(30);
  });
});

describe("ankomstmönster", () => {
  const model = testModel();
  it("är deterministiska per seed och repetition", () => {
    const a = generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "s", rep: 3 });
    const b = generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "s", rep: 3 });
    const c = generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "s", rep: 4 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("poissonvolym följer profilen och volymfaktorn", () => {
    const expected = model.hourlyArrivals.reduce((x, y) => x + y, 0);
    const n1 = mean(Array.from({ length: 200 }, (_, r) => generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "v", rep: r }).length));
    const n2 = mean(Array.from({ length: 200 }, (_, r) => generateDay(model, { pattern: "poisson", volumeFactor: 1.5 }, { seed: "v", rep: r }).length));
    expect(Math.abs(n1 - expected) / expected).toBeLessThan(0.03);
    expect(Math.abs(n2 - 1.5 * expected) / (1.5 * expected)).toBeLessThan(0.03);
  });
  it("burst lägger fler ankomster i fönstret", () => {
    const inWin = (ts: { arrival: number }[]) => ts.filter((t) => t.arrival >= 480 && t.arrival < 600).length;
    const base = mean(Array.from({ length: 100 }, (_, r) => inWin(generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "b", rep: r }))));
    const burst = mean(Array.from({ length: 100 }, (_, r) => inWin(generateDay(model, { pattern: "burst", volumeFactor: 1, burst: { from: 480, to: 600, multiplier: 3 } }, { seed: "b", rep: r }))));
    expect(burst / base).toBeGreaterThan(2.6);
    expect(burst / base).toBeLessThan(3.4);
  });
  it("lastbil k får samma attribut oavsett mönster (common random numbers)", () => {
    const p = generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "crn", rep: 0 });
    const q = generateDay(model, { pattern: "poisson", volumeFactor: 2 }, { seed: "crn", rep: 0 });
    // ankomsttiderna skiljer, men första lastbilens attribut ska vara samma
    expect(q[0].unloadTime).toBe(p[0].unloadTime);
    expect(q[0].goodsType).toBe(p[0].goodsType);
  });
  it("slots: kapacitet summeras korrekt och respekteras", () => {
    const slots = buildSlots({ lengthMin: 20, capacityPerHour: 10, from: 300, to: 900, adherence: 1, toleranceMin: 15 });
    expect(slots).toHaveLength(30);
    expect(slots.reduce((a, s) => a + s.cap, 0)).toBe(100);
    const ts = generateDay(model, { pattern: "booked", volumeFactor: 1, slot: { lengthMin: 30, capacityPerHour: 4, from: 300, to: 900, adherence: 1, toleranceMin: 15 } }, { seed: "c", rep: 0 });
    const perSlot = new Map<number, number>();
    for (const t of ts) if (t.slotStart !== null) perSlot.set(t.slotStart, (perSlot.get(t.slotStart) ?? 0) + 1);
    for (const v of perSlot.values()) expect(v).toBeLessThanOrEqual(2);
    expect(ts.some((t) => t.walkIn)).toBe(true); // 40 bokbara < efterfrågan
  });
  it("slot adherence styr andelen i tid", () => {
    const spec = (a: number) => ({ pattern: "booked" as const, volumeFactor: 1, slot: { lengthMin: 30, capacityPerHour: 20, from: 240, to: 960, adherence: a, toleranceMin: 15 } });
    const share = (a: number) => {
      let inTol = 0, n = 0;
      for (let r = 0; r < 50; r++) for (const t of generateDay(model, spec(a), { seed: "adh", rep: r })) {
        if (t.slotStart === null) continue;
        n++;
        if (Math.abs(t.arrival - t.slotStart) <= 15) inTol++;
      }
      return inTol / n;
    };
    expect(share(0.9)).toBeGreaterThan(0.86);
    expect(share(0.9)).toBeLessThan(0.94);
    expect(share(0.5)).toBeGreaterThan(0.45);
    expect(share(0.5)).toBeLessThan(0.55);
  });
  it("no-show-andel ungefär som modellen", () => {
    const m = { ...model, noShowRate: 0.2 };
    const spec = { pattern: "booked" as const, volumeFactor: 1, slot: { lengthMin: 30, capacityPerHour: 100, from: 0, to: 1440, adherence: null, toleranceMin: 15 } };
    const expected = model.hourlyArrivals.reduce((a, b) => a + b, 0);
    const n = mean(Array.from({ length: 200 }, (_, r) => generateDay(m, spec, { seed: "ns", rep: r }).length));
    expect(Math.abs(n - expected) / expected).toBeLessThan(0.04);
  });
  it("recorded: tjänstetider från data eller samplade, volym skalas", () => {
    const rec = [0, 1, 2, 3].map((i) => ({ id: `r${i}`, arrival: 300 + i * 10, slotStart: null, slotEnd: null, carrier: "A", goodsType: "torr", pallets: 20, unloadMin: 33, gateMin: 2, paperMin: 4 }));
    const a = generateDay(model, { pattern: "recorded", volumeFactor: 1, serviceTimes: "recorded" }, { seed: "r", rep: 0, recorded: rec });
    expect(a.map((t) => t.unloadTime)).toEqual([33, 33, 33, 33]);
    const b = generateDay(model, { pattern: "recorded", volumeFactor: 2, serviceTimes: "sampled" }, { seed: "r", rep: 0, recorded: rec });
    expect(b).toHaveLength(8);
    expect(() => generateDay(model, { pattern: "recorded", volumeFactor: 1, serviceTimes: "recorded" }, { seed: "r", rep: 0 })).toThrow();
  });
  it("lossningstid korrelerar med pallantal i bootstrap", () => {
    const ts = Array.from({ length: 30 }, (_, r) => generateDay(model, { pattern: "poisson", volumeFactor: 1 }, { seed: "corr", rep: r })).flat();
    const small = ts.filter((t) => (t.pallets ?? 0) < 15).map((t) => t.unloadTime);
    const big = ts.filter((t) => (t.pallets ?? 0) > 25).map((t) => t.unloadTime);
    expect(mean(big)).toBeGreaterThan(mean(small) + 10);
  });
});

describe("scenario", () => {
  it("validerar och ger svenska felmeddelanden", () => {
    expect(validateScenario(testScenarioFile())).toEqual([]);
    const bad = testScenarioFile({ costs: { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 600, source: "" } });
    expect(validateScenario(bad).join()).toMatch(/costs.source/);
    expect(validateScenario({ ...testScenarioFile(), arrivals: { pattern: "booked", volumeFactor: 1 } }).join()).toMatch(/slot krävs/);
    expect(() => compileScenario({ ...testScenarioFile(), schemaVersion: 2 as 1 })).toThrow(/schemaVersion/);
  });
  it("hash är stabil oberoende av nyckelordning", () => {
    const a = testScenarioFile();
    const b = JSON.parse(JSON.stringify(a, Object.keys(a).sort()));
    expect(scenarioHash(a)).toBe(scenarioHash({ ...b, ...a }));
    expect(scenarioHash(a)).not.toBe(scenarioHash({ ...a, name: "x" }));
  });
});

describe("Monte Carlo", () => {
  const model = testModel();
  it("är reproducerbar med fast seed", () => {
    const a = runMonteCarlo(model, testScenario());
    const b = runMonteCarlo(model, testScenario());
    expect(a.summary).toEqual(b.summary);
    expect(a.summary.avgWait.p10).toBeLessThanOrEqual(a.summary.avgWait.median);
    expect(a.summary.avgWait.median).toBeLessThanOrEqual(a.summary.avgWait.p90);
  });
  it("fler dörrar minskar väntan (monotont i median)", () => {
    const w = [3, 4, 6, 10].map((d) => runMonteCarlo(model, testScenario({ site: { ...testScenarioFile().site, doors: d } })).summary.avgWait.median);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThanOrEqual(w[i - 1]);
  });
  it("strategijämförelse och parvisa deltan", () => {
    const sc = testScenario({ site: { ...testScenarioFile().site, doors: 4 } });
    const cmp = compareStrategies(model, sc, ["fcfs", "priority"]);
    expect(Object.keys(cmp)).toEqual(["fcfs", "priority"]);
    const d = pairedDelta(cmp.fcfs, cmp.fcfs, "avgWait");
    expect(d.median).toBe(0);
  });
  it("detaljkörning ger samma nyckeltal som MC-repetition 0", () => {
    const sc = testScenario();
    const mc = runMonteCarlo(model, sc, { reps: 1 });
    const det = runDetailed(model, sc);
    expect(det.metrics.avgWait).toBeCloseTo(mc.perRep[0].avgWait);
    expect(quantile(det.trucks.map((t) => t.waitToDoor ?? 0), 0.9)).toBeCloseTo(det.metrics.p90Wait);
  });
});

describe("skuggbilar och censurering", () => {
  it("skuggbil upptar dörren men räknas inte i nyckeltalen", () => {
    const ts = [truck("s", 0, 60, { shadow: true }), truck("a", 10, 10)];
    const r = simulateDay(ts, site(1), FCFS, COST, { detail: true });
    expect(r.metrics.trucks).toBe(1);
    expect(r.metrics.avgWait).toBe(50); // a väntar på skuggbilen
    expect(r.metrics.maxQueue).toBe(1);
    expect(r.trucks.find((t) => t.id === "s")!.shadow).toBe(true);
  });
  it("ej lossade bilar utan övertid räknas som väntande minst till stängning", () => {
    const s = site(1, { openFrom: 0, openTo: 300, allowOvertime: false });
    // a lossar 0–310 (övertid för påbörjad lossning); b skulle få dörr först 310 > stängning 300.
    // Sista händelsen sker vid 310, så censurering vid max(310, 300) = 310 ⇒ b har väntat 300 min.
    const r = simulateDay([truck("a", 0, 310), truck("b", 10, 200)], s, FCFS, COST);
    expect(r.metrics.notUnloaded).toBe(1);
    expect(r.metrics.avgWait).toBe((0 + 300) / 2);
    // bil som kommer efter stängning och aldrig lossas får väntan ≥ 0, aldrig negativ
    const late = simulateDay([truck("x", 400, 10)], s, FCFS, COST);
    expect(late.metrics.avgWait).toBeGreaterThanOrEqual(0);
  });
});

describe("mönstret historical (som i dag)", () => {
  const days = [
    [{ t: 300, s: 300 }, { t: 320, s: null }, { t: 400, s: 390 }],
    [{ t: 310, s: 300 }, { t: 500, s: 480 }],
  ];
  const model = { ...testModel(), arrivalDays: days };
  it("använder en historisk dags ankomster och bokningar", () => {
    const ts = generateDay(model, { pattern: "historical", volumeFactor: 1 }, { seed: "h", rep: 0 });
    const match = days.find((d) => d.length === ts.length)!;
    expect(ts.map((t) => t.arrival)).toEqual(match.map((a) => a.t));
    expect(ts.map((t) => t.slotStart)).toEqual(match.map((a) => a.s));
  });
  it("volymfaktor skalar antalet", () => {
    const big = { ...testModel(), arrivalDays: [Array.from({ length: 100 }, (_, i) => ({ t: 300 + i, s: null }))] };
    const n = mean(Array.from({ length: 50 }, (_, r) => generateDay(big, { pattern: "historical", volumeFactor: 1.5 }, { seed: "hv", rep: r }).length));
    expect(n).toBeGreaterThan(145);
    expect(n).toBeLessThan(155);
  });
  it("kräver historiska dagar", () => {
    expect(() => generateDay(testModel(), { pattern: "historical", volumeFactor: 1 }, { seed: "h", rep: 0 })).toThrow(/historiska/);
  });
});
