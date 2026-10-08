import { describe, expect, it } from "vitest";
import demo from "../src/app/demo/demo-dataset.json";
import type { Dataset } from "../src/app/types.ts";
import { checkDrift } from "../src/monitoring/drift.ts";

const ds = demo as unknown as Dataset;
const recent = ds.days.slice(-15);
const base = { model: ds.profiles.all, siteId: "demo", openFrom: 300, openTo: 900, reps: 20 };

describe("driftövervakning", () => {
  it("stabil verklighet ger inget larm", () => {
    const r = checkDrift({ ...base, recentDays: recent, baselineWmape: ds.calibration!.metrics.avgWait.wmape });
    expect(r.status).not.toBe("alert");
  });
  it("larmar när verkligheten ändrats (lossningstider +60 %)", () => {
    const changed = recent.map((d) => ({
      ...d,
      trucks: d.trucks.map((t) => ({ ...t, unloadMin: t.unloadMin === null ? null : t.unloadMin * 1.6 })),
      actual: { ...d.actual, avgWait: d.actual.avgWait * 4 + 10 },
    }));
    const r = checkDrift({ ...base, recentDays: changed, baselineWmape: ds.calibration!.metrics.avgWait.wmape });
    expect(r.status).toBe("alert");
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("för få dagar ger 'insufficient'", () => {
    expect(checkDrift({ ...base, recentDays: recent.slice(0, 2), baselineWmape: 0.1 }).status).toBe("insufficient");
  });
});
