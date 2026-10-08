import type { SiteModel, VisitSample } from "../src/engine/model.ts";
import type { CompiledScenario, ScenarioFile } from "../src/engine/scenario.ts";
import { compileScenario } from "../src/engine/scenario.ts";
import type { CostConfig, SiteConfig, StrategyConfig, Truck } from "../src/engine/types.ts";

export function truck(id: string, arrival: number, unloadTime: number, extra: Partial<Truck> = {}): Truck {
  return { id, arrival, slotStart: null, slotEnd: null, carrier: "A", goodsType: "torr", pallets: 20, gateTime: 0, unloadTime, paperTime: 0, ...extra };
}

export function site(doors = 1, extra: Partial<SiteConfig> = {}): SiteConfig {
  return {
    doors: Array.from({ length: doors }, (_, i) => ({ id: `D${i + 1}` })),
    gateLanes: 1,
    parkingSpaces: Infinity,
    openFrom: 0,
    openTo: 24 * 60,
    allowOvertime: true,
    ...extra,
  };
}

export const FCFS: StrategyConfig = { kind: "fcfs", onTimeToleranceMin: 15 };
export const COST: CostConfig = { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 600 };

/** Liten syntetisk modell för tester (värden är testdata, inte kalibrering). */
export function testModel(): SiteModel {
  const unloadSamples: VisitSample[] = [];
  for (let i = 0; i < 200; i++) {
    const pallets = 6 + (i % 28);
    unloadSamples.push({ carrier: `C${i % 5}`, goodsType: i % 3 === 0 ? "kyl" : "torr", pallets, unloadMin: 10 + pallets * 1.2 + (i % 7) });
  }
  const hourly = new Array(24).fill(0);
  for (let h = 5; h < 15; h++) hourly[h] = h < 10 ? 9 : 5;
  const dev: number[] = [];
  for (let i = -60; i <= 90; i += 3) dev.push(i);
  return {
    siteId: "test",
    label: "Testsajt",
    dayType: "all",
    hourlyArrivals: hourly,
    unloadSamples,
    gateSamples: [2, 3, 4, 5],
    paperSamples: [5, 8, 10],
    slotDeviationSamples: dev,
    noShowRate: 0.05,
    provenance: {},
  };
}

export function testScenarioFile(over: Partial<ScenarioFile> = {}): ScenarioFile {
  return {
    schemaVersion: 1,
    id: "test",
    name: "Test",
    siteId: "test",
    arrivals: { pattern: "poisson", volumeFactor: 1 },
    site: { doors: 6, gateLanes: 1, parkingSpaces: null, open: "05:00", close: "15:00", allowOvertime: true },
    strategy: { kind: "fcfs", onTimeToleranceMin: 15 },
    costs: { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 600, source: "testdata" },
    monteCarlo: { reps: 50, seed: "s1" },
    ...over,
  };
}

export function testScenario(over: Partial<ScenarioFile> = {}): CompiledScenario {
  return compileScenario(testScenarioFile(over));
}
