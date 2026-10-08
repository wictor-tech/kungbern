import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generateDay } from "../src/engine/arrivals.ts";
import { Rng } from "../src/engine/rng.ts";
import { simulateDay } from "../src/engine/simulate.ts";
import { median } from "../src/engine/stats.ts";
import { parseClock } from "../src/engine/time.ts";
import { assertNoPII, buildCarrierRelabeling, toDemoModel } from "../src/data/anonymize.ts";
import { calibrateSite } from "../src/data/calibrate.ts";
import { DEFAULT_QUALITY_RULES, type Visit } from "../src/data/contract.ts";
import { visitsFromCsv, visitsToCsv } from "../src/data/csv.ts";
import { DEMO_SEED, demoDatasetJson } from "../src/data/demoDataset.ts";
import { deriveVisits } from "../src/data/derive.ts";
import { dayLengthMin, isDstTransitionDay, localToIso, minutesOnServiceDate, toLocal } from "../src/data/localtime.ts";
import { runPipeline, type PipelineResult } from "../src/data/pipeline.ts";
import { buildQualityReport, qualityReportToMarkdown, rankSitesForCalibration, type QualityReport } from "../src/data/quality.ts";
import { actualDayMetrics, recordedDays } from "../src/data/recorded.ts";
import { DEMO_SITE_TRUTH, generateSyntheticVisits, sampleTruthUnload, syntheticSiteConfig } from "../src/data/synthetic.ts";

const TZ = "Europe/Stockholm";
const DAY = "2026-02-10"; // tisdag, vintertid

/** Testbesök med lokala klocktider på DAY. */
function mk(id: string, t: Partial<Record<"slot" | "arr" | "chk" | "us" | "ue" | "dep", string>>, extra: Partial<Visit> = {}): Visit {
  const iso = (hhmm?: string) => (hhmm ? localToIso(DAY, parseClock(hhmm), TZ) : null);
  return {
    visitId: id,
    tenantId: "t1",
    siteId: "s1",
    siteTimeZone: TZ,
    carrierKey: "C01",
    goodsType: "torr",
    pallets: 20,
    bookedAt: null,
    cancelledAt: null,
    slotStart: iso(t.slot),
    slotEnd: null,
    arrivedAt: iso(t.arr),
    checkedInAt: iso(t.chk),
    doorAssignedAt: null,
    doorId: "D1",
    unloadStart: iso(t.us),
    unloadEnd: iso(t.ue),
    departedAt: iso(t.dep),
    status: "completed",
    manuallyEdited: [],
    ...extra,
  };
}

describe("localtime", () => {
  it("räknar lokal tid vinter och sommar", () => {
    expect(toLocal("2026-01-15T05:00:00Z", TZ)).toEqual({ date: "2026-01-15", minutes: 360, isoWeekday: 4 });
    expect(toLocal("2026-06-15T05:00:00Z", TZ)).toEqual({ date: "2026-06-15", minutes: 420, isoWeekday: 1 });
    expect(toLocal("2026-01-15T23:30:00Z", TZ).date).toBe("2026-01-16");
  });
  it("vårens omställning 2026-03-29: 23 h, förflutna minuter", () => {
    expect(isDstTransitionDay("2026-03-29", TZ)).toBe(true);
    expect(isDstTransitionDay("2026-03-30", TZ)).toBe(false);
    expect(isDstTransitionDay("2026-03-28", TZ)).toBe(false);
    expect(dayLengthMin("2026-03-29", TZ)).toBe(1380);
    // 03:30 CEST = 01:30Z; lokal midnatt = 23:00Z dagen före → 150 förflutna minuter
    expect(toLocal("2026-03-29T01:30:00Z", TZ)).toMatchObject({ date: "2026-03-29", minutes: 150 });
    expect(localToIso("2026-03-29", 150, TZ)).toBe("2026-03-29T01:30:00Z");
  });
  it("höstens omställning 2026-10-25: 25 h", () => {
    expect(isDstTransitionDay("2026-10-25", TZ)).toBe(true);
    expect(dayLengthMin("2026-10-25", TZ)).toBe(1500);
    expect(dayLengthMin("2026-10-26", TZ)).toBe(1440);
    // 23:30 lokal (CET, +1) = 22:30Z; midnatt = 22:00Z dagen före → 1470 min
    expect(toLocal("2026-10-25T22:30:00Z", TZ)).toMatchObject({ date: "2026-10-25", minutes: 1470 });
  });
  it("localToIso är invers till minutesOnServiceDate, även över omställning", () => {
    for (const date of ["2026-03-29", "2026-10-25", "2026-07-01"]) {
      for (const m of [0, 59, 125, 300.5, 1379, 1600]) {
        expect(minutesOnServiceDate(localToIso(date, m, TZ), date, TZ)).toBeCloseTo(m, 6);
      }
    }
  });
  it("övertid efter midnatt > 1440 och tid före servicedagen = null", () => {
    expect(minutesOnServiceDate("2026-02-10T23:30:00Z", DAY, TZ)).toBe(1470);
    expect(minutesOnServiceDate("2026-02-09T22:00:00Z", DAY, TZ)).toBeNull();
  });
});

describe("deriveVisits", () => {
  it("härleder varaktigheter och slotavvikelse", () => {
    const [d] = deriveVisits([mk("a", { slot: "06:00", arr: "06:10", chk: "06:13", us: "06:31", ue: "07:01", dep: "07:12" })]);
    expect(d).toMatchObject({ serviceDate: DAY, isoWeekday: 2, arrivalMin: 370, waitToDoor: 21, unloadMin: 30, gateMin: 3, paperMin: 11, timeOnYard: 62, slotDeviation: 10, included: true });
    expect(d.issues).toEqual([]);
  });
  it("D1: checkedInAt som reserv, grindtid null", () => {
    const [d] = deriveVisits([mk("a", { chk: "06:13", us: "06:30", ue: "06:50", dep: "07:00" })]);
    expect(d.arrivalMin).toBe(373);
    expect(d.gateMin).toBeNull();
    expect(d.included).toBe(true);
  });
  it("dubbletter: samma visitId och samma transportör+dörr inom fönster", () => {
    const base = { arr: "06:00", us: "06:10", ue: "06:40", dep: "06:50" };
    const ds = deriveVisits([
      mk("b", { ...base, arr: "06:05" }), // samma transportör/dörr, 5 min senare → dubblett
      mk("a", base),
      mk("a", { ...base, arr: "06:01" }), // samma id → dubblett
      mk("c", { ...base, arr: "06:30" }), // utanför fönstret
      mk("d", { ...base, arr: "06:02" }, { doorId: "D2" }), // annan dörr
    ]);
    const dup = ds.filter((d) => d.issues.includes("duplicate")).map((d) => `${d.visit.visitId}@${d.arrivalMin}`);
    expect(dup.sort()).toEqual(["a@361", "b@365"]);
    expect(ds.map((d) => d.visit.visitId)).toEqual(["a", "a", "b", "c", "d"]);
  });
  it("dubbletter: två verkliga bilar efter varandra vid samma dörr (ej överlappande lossning) är INTE dubbletter", () => {
    const ds = deriveVisits([
      mk("x1", { arr: "06:00", us: "06:05", ue: "06:35", dep: "06:45" }),
      mk("x2", { arr: "06:06", us: "06:36", ue: "07:10", dep: "07:20" }), // köade bakom x1
    ]);
    expect(ds.filter((d) => d.issues.includes("duplicate"))).toEqual([]);
    expect(ds.every((d) => d.included)).toBe(true);
  });
  it("dubbletter: dubbel LPR-läsning (identisk eller överlappande lossning) ÄR dubblett", () => {
    const ds = deriveVisits([
      mk("y1", { arr: "06:00", us: "06:10", ue: "06:40", dep: "06:50" }),
      mk("y2", { arr: "06:02", us: "06:10", ue: "06:40", dep: "06:50" }), // identisk lossning
      mk("z1", { arr: "08:00", us: "08:10", ue: "08:40" }),
      mk("z2", { arr: "08:03", us: "08:12", ue: "08:41" }), // överlappar
    ]);
    const dup = ds.filter((d) => d.issues.includes("duplicate")).map((d) => d.visit.visitId);
    expect(dup.sort()).toEqual(["y2", "z2"]);
  });
  it("dubbletter: post utan lossningstider nära en annans lossningsstart är dubblett; posten med mätningar behålls", () => {
    const ds = deriveVisits([
      mk("w1", { arr: "06:00" }, { status: "in_progress" }), // bara LPR-läsning
      mk("w2", { arr: "06:03", us: "06:08", ue: "06:40" }),
      mk("q1", { arr: "09:00", us: "09:30", ue: "10:00" }),
      mk("q2", { arr: "09:05" }, { status: "in_progress" }), // lossningsstart 25 min bort → egen bil
    ]);
    const dup = ds.filter((d) => d.issues.includes("duplicate")).map((d) => d.visit.visitId);
    expect(dup).toEqual(["w1"]);
  });
  it("flaggar varje problemtyp", () => {
    const ok = { arr: "06:00", us: "06:10", ue: "06:40", dep: "06:50" };
    const cases: [Visit, string, boolean][] = [
      [mk("m1", { us: "06:10", ue: "06:40" }), "missing_arrival", false],
      [mk("m2", { arr: "06:00", us: "06:10" }), "missing_unload", false],
      [mk("s1", { arr: "06:00", us: "06:10", ue: "06:10" }), "unload_too_short", false],
      [mk("l1", { arr: "06:00", us: "06:10", ue: "15:00" }), "unload_too_long", false],
      [mk("o1", { arr: "06:00", us: "06:40", ue: "06:10" }), "out_of_order", false],
      [mk("o2", { arr: "06:00", us: "06:40", ue: "06:10" }), "negative_duration", false],
      [mk("r1", { arr: "06:07", us: "06:15", ue: "06:45", dep: "06:52" }), "suspected_manual_time", true],
      [mk("e1", ok, { manuallyEdited: ["unloadEnd"] }), "manually_edited", true],
    ];
    // Unika transportörer så att dubblettregeln inte slår till.
    const ds = deriveVisits(cases.map((c) => ({ ...c[0], carrierKey: c[0].visitId })));
    for (const [v, issue, included] of cases) {
      const d = ds.find((x) => x.visit.visitId === v.visitId)!;
      expect(d.issues, `${v.visitId}`).toContain(issue);
      expect(d.included, `${v.visitId}`).toBe(included);
    }
    // Sekunder ≠ 0 → inte misstänkt manuell
    const [sec] = deriveVisits([{ ...mk("x", ok), unloadStart: "2026-02-10T05:15:07Z" }]);
    expect(sec.issues).not.toContain("suspected_manual_time");
  });
  it("dst_day flaggas men exkluderar inte", () => {
    const v: Visit = { ...mk("d", {}), arrivedAt: "2026-03-29T04:00:00Z", unloadStart: "2026-03-29T04:10:03Z", unloadEnd: "2026-03-29T04:40:09Z", departedAt: "2026-03-29T04:50:00Z" };
    const [d] = deriveVisits([v]);
    expect(d.issues).toEqual(["dst_day"]);
    expect(d.included).toBe(true);
    expect(d.arrivalMin).toBe(5 * 60); // 06:00 CEST = 5 h efter midnatt CET
  });
  it("no-show och avbokning inkluderas inte och saknar inte 'missing_arrival'", () => {
    const ds = deriveVisits([mk("n", { slot: "07:00" }, { status: "no_show", doorId: null }), mk("c", { slot: "07:00" }, { status: "cancelled", doorId: null })]);
    for (const d of ds) {
      expect(d.included).toBe(false);
      expect(d.issues).toEqual([]);
      expect(d.serviceDate).toBe(DAY);
    }
  });
});

describe("kvalitetsrapport", () => {
  it("räknar exkluderade, flaggade, komplettering, manuella dagar", () => {
    const visits: Visit[] = [];
    for (let i = 0; i < 12; i++) visits.push(mk(`r${i}`, { arr: "06:00", us: "06:15", ue: "06:45", dep: "07:00" }, { carrierKey: `C${i}` }));
    visits.push(mk("ns", { slot: "08:00" }, { status: "no_show", doorId: null }));
    visits.push(mk("ck", { chk: "06:13", us: "06:30", ue: "06:59" }, { carrierKey: "X" }));
    visits.push(mk("bad", { arr: "06:00", us: "06:40", ue: "06:10" }, { carrierKey: "Y" }));
    const r = buildQualityReport(deriveVisits(visits));
    expect(r.totalVisits).toBe(15);
    expect(r.includedVisits).toBe(13);
    expect(r.excludedByReason).toEqual({ negative_duration: 1, out_of_order: 1, "status:no_show": 1 });
    expect(r.flaggedByReason).toEqual({ arrival_from_checkin: 1, suspected_manual_time: 12 });
    expect(r.fieldCompleteness.visitId).toBe(1);
    expect(r.fieldCompleteness.slotStart).toBeCloseTo(1 / 15);
    expect(r.suspectedManualDays.map((d) => d.date)).toEqual([DAY]);
    expect(r.distinctDays).toBe(1);
    const md = qualityReportToMarkdown(r);
    expect(md).toMatch(/# Datakvalitetsrapport – s1/);
    expect(md).toMatch(/Status no_show \(ej slutfört\) \| 1/);
  });
  it("hittar luckor på veckodagar med normal trafik", () => {
    const visits: Visit[] = [];
    // 4 veckor mån–fre, men 2026-02-11..2026-02-13 (ons–fre) saknas → 3 dagar
    for (let i = 0; i < 28; i++) {
      const date = new Date(Date.UTC(2026, 1, 2 + i)).toISOString().slice(0, 10);
      const wd = toLocal(`${date}T12:00:00Z`, TZ).isoWeekday;
      if (wd > 5 || (date >= "2026-02-11" && date <= "2026-02-13")) continue;
      visits.push({ ...mk(`v${i}`, {}), arrivedAt: localToIso(date, 400, TZ), unloadStart: localToIso(date, 410.5, TZ), unloadEnd: localToIso(date, 440.2, TZ) });
    }
    const r = buildQualityReport(deriveVisits(visits));
    expect(r.operatingWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(r.gaps).toEqual([{ from: "2026-02-11", to: "2026-02-13", missingDays: 3 }]);
  });
  it("rangordnar sajter för kalibrering", () => {
    const base = { gaps: [], suspectedManualDays: [] } as unknown as QualityReport;
    const ranked = rankSitesForCalibration([
      { ...base, siteId: "liten", tenantId: "t", distinctDays: 40, includedVisits: 2000 },
      { ...base, siteId: "stor", tenantId: "t", distinctDays: 120, includedVisits: 6000 },
      { ...base, siteId: "mellan", tenantId: "t", distinctDays: 95, includedVisits: 600 },
    ]);
    expect(ranked.map((r) => [r.siteId, r.suitable])).toEqual([["stor", true], ["mellan", true], ["liten", false]]);
    expect(ranked[2].reasons[0]).toMatch(/för få driftdagar/);
  });
});

describe("actualDayMetrics – handräknat", () => {
  it("motorns definitioner", () => {
    const vs = deriveVisits([
      mk("a", { arr: "06:00", us: "06:00", ue: "07:00", dep: "07:10" }, { carrierKey: "A", doorId: "D1" }),
      mk("b", { arr: "06:10", us: "06:20", ue: "07:20", dep: "07:30" }, { carrierKey: "B", doorId: "D2" }),
      mk("c", { arr: "06:15", us: "07:00", ue: "07:50", dep: "08:20" }, { carrierKey: "C", doorId: "D1" }),
      mk("d", { arr: "06:20", us: "07:20", ue: "08:20" }, { carrierKey: "D", doorId: "D2" }),
    ]);
    const m = actualDayMetrics(DAY, vs, { openFrom: 360, openTo: 480 });
    // väntan 0, 10, 45, 60
    expect(m.avgWait).toBe(28.75);
    expect(m.p90Wait).toBeCloseTo(55.5);
    // 06:20: d anländer (före samtidig start av b) → 3 i kö
    expect(m.maxQueue).toBe(3);
    // överlapp med 06–08: 60 + 60 + 50 + 40 = 210 av 2 × 120
    expect(m.doorUtilization).toBeCloseTo(0.875);
    expect(m.timeToEmpty).toBe(500);
    const [day] = recordedDays(vs, { openFrom: 360, openTo: 480 });
    expect(day.doorsObserved).toBe(2);
    expect(day.actual).toEqual(m);
    expect(day.trucks.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("tie-regeln matchar motorn (ankomst före start vid lika tid)", () => {
    const vs = deriveVisits([
      mk("a", { arr: "06:00", us: "06:00", ue: "06:30" }, { carrierKey: "A" }),
      mk("b", { arr: "06:30", us: "06:30", ue: "07:00" }, { carrierKey: "B" }),
    ]);
    const m = actualDayMetrics(DAY, vs, { openFrom: 0, openTo: 1440 });
    const trucks = vs.map((d) => ({ id: d.visit.visitId, arrival: d.arrivalMin!, slotStart: null, slotEnd: null, carrier: "A", goodsType: "torr", pallets: null, gateTime: 0, unloadTime: d.unloadMin!, paperTime: 0 }));
    const sim = simulateDay(trucks, { doors: [{ id: "D1" }], gateLanes: 1, parkingSpaces: Infinity, openFrom: 0, openTo: 1440, allowOvertime: true }, { kind: "fcfs", onTimeToleranceMin: 15 }, { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 0 });
    expect(m.maxQueue).toBe(sim.metrics.maxQueue);
    expect(m.avgWait).toBe(sim.metrics.avgWait);
  });
});

describe("CSV", () => {
  it("roundtrip med citering, null och manuallyEdited", () => {
    const vs = [
      mk("a", { slot: "06:00", arr: "06:01", us: "06:10", ue: "06:40" }, { goodsType: 'torr, "special"\nrad2', manuallyEdited: ["unloadStart", "unloadEnd"] }),
      mk("b", {}, { pallets: null, carrierKey: null, status: "no_show" }),
    ];
    const csv = visitsToCsv(vs);
    expect(csv.split("\n")[0]).toMatch(/^visitId,tenantId,siteId,siteTimeZone,carrierKey/);
    expect(visitsFromCsv(csv)).toEqual(vs);
    expect(visitsFromCsv(csv.replace(/\n/g, "\r\n"))).toEqual(vs.map((v) => ({ ...v, goodsType: v.goodsType?.replace(/\n/g, "\r\n") ?? null })));
    expect(() => visitsFromCsv("visitId,tenantId\nx,y\n")).toThrow(/saknar kolumner/);
  });
});

describe("assertNoPII", () => {
  it("hittar registreringsnummer, e-post och telefon", () => {
    expect(() => assertNoPII({ a: [{ plate: "ABC123" }] })).toThrow(/\$\.a\[0\]\.plate/);
    expect(() => assertNoPII({ x: "Bil ABC 12A anlände" })).toThrow(/registreringsnummer/);
    expect(() => assertNoPII({ x: "kontakt: anna.svensson@example.se" })).toThrow(/e-post/);
    expect(() => assertNoPII(["ring 070-123 45 67"])).toThrow(/telefon/);
    expect(() => assertNoPII({ t: "+46 8 123 456 78" })).toThrow(/telefon/);
    expect(() => assertNoPII({ ABC123: 1 })).toThrow(/nyckel/);
  });
  it("ger inte falsklarm på id:n, dagtyper och datum", () => {
    expect(() =>
      assertNoPII({
        door: "D1",
        truck: "T001",
        dayType: "weekday:2",
        iso: "2026-03-29T01:30:00Z",
        date: "2026-01-05",
        carrier: "C01",
        label: "Transportör A",
        src: "visits 2026-01-02–2026-04-30, n=812",
        visit: "v3f9a0c12d4e5",
        n: 46701234567,
      }),
    ).not.toThrow();
  });
});

describe("syntetisk sajt → pipeline", () => {
  const opts = { tenantId: "t1", siteId: "s1", tz: TZ, startDate: "2026-01-05", days: 150, seed: "test-seed" };
  let visits: Visit[];
  let res: PipelineResult;
  beforeAll(() => {
    visits = generateSyntheticVisits(DEMO_SITE_TRUTH, opts);
    res = runPipeline(visits, { tenantId: "t1", siteId: "s1", openFrom: DEMO_SITE_TRUTH.openFrom, openTo: DEMO_SITE_TRUTH.openTo });
  });

  it("är deterministisk och innehåller inga registreringsnummer", () => {
    const again = generateSyntheticVisits(DEMO_SITE_TRUTH, opts);
    expect(JSON.stringify(again)).toBe(JSON.stringify(visits));
    expect(() => assertNoPII(visits)).not.toThrow();
    expect(visits.every((v) => /^v[0-9a-f]{12}$/.test(v.visitId))).toBe(true);
    // Korsar sommartidsomställningen: lokala lossningsstarter ligger kring öppettiden både före och efter.
    const before = res.derived.filter((d) => d.included && d.serviceDate < "2026-03-29").map((d) => d.unloadStartMin!);
    const after = res.derived.filter((d) => d.included && d.serviceDate > "2026-03-29").map((d) => d.unloadStartMin!);
    expect(Math.min(...before)).toBeGreaterThanOrEqual(300);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(300);
  });

  it("brus syns i kvalitetsrapporten", () => {
    const q = res.quality;
    for (const k of ["duplicate", "missing_unload", "out_of_order", "unload_too_short", "unload_too_long", "status:no_show", "status:cancelled"]) {
      expect(q.excludedByReason[k], k).toBeGreaterThan(0);
    }
    expect(q.flaggedByReason.arrival_from_checkin).toBeGreaterThan(0);
    expect(q.flaggedByReason.suspected_manual_time).toBeGreaterThan(0);
    expect(q.suspectedManualDays).toHaveLength(1);
    expect(q.distinctDays).toBeGreaterThanOrEqual(100);
    expect(q.gaps).toEqual([]);
    expect(rankSitesForCalibration([q])[0].suitable).toBe(true);
  });

  it("kalibreringen återskapar känd sanning", () => {
    const T = DEMO_SITE_TRUTH;
    const s = res.stats.all;
    expect(Math.abs(s.noShow.rate - T.noShowRate)).toBeLessThan(0.015);
    expect(Math.abs(s.slotAdherence.onTimeShare - T.onTimeShare)).toBeLessThan(0.05);
    // Sann median av lossningstid via sanningens fördelning
    const rng = new Rng("truth-unload");
    const truthUnload: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const u = rng.next();
      const g = u < 0.6 ? "torr" : u < 0.9 ? "kyl" : "frys";
      const p = T.palletsMin + rng.int(T.palletsMax - T.palletsMin + 1);
      truthUnload.push(sampleTruthUnload(T, g, p, rng));
    }
    const tm = median(truthUnload);
    expect(Math.abs(s.unload.overall!.p50 - tm) / tm).toBeLessThan(0.1);
    // Pallmodellen: lutning nära sanningens viktade b
    const bTrue = T.goodsTypes.reduce((a, g) => a + g.share * g.unloadB, 0);
    expect(Math.abs(s.palletModel!.b - bTrue) / bTrue).toBeLessThan(0.15);
    // Timprofilens form korrelerar med sanningens
    const h = res.profiles.all.hourlyArrivals;
    const shape = T.hourlyShape;
    const corr = pearson(h, shape);
    expect(corr).toBeGreaterThan(0.9);
    expect(h.indexOf(Math.max(...h))).toBeGreaterThanOrEqual(6);
    expect(h.indexOf(Math.max(...h))).toBeLessThanOrEqual(9);
    // Veckodagsprofiler bara för öppna dagar, och måndag > fredag
    expect(Object.keys(res.profiles)).toEqual(["all", "weekday:1", "weekday:2", "weekday:3", "weekday:4", "weekday:5"]);
    const tot = (k: string) => res.profiles[k].hourlyArrivals.reduce((a, b) => a + b, 0);
    expect(tot("weekday:1")).toBeGreaterThan(tot("weekday:5"));
    expect(s.doorsObserved).toBe(T.doors);
    expect(s.observedOpenWindow?.basis).toBe("observerat");
    expect(res.profiles.all.provenance.noShowRate).toMatchObject({ kind: "measured" });
    expect(res.profiles.all.provenance.noShowRate.source).toMatch(/^visits 2026-01-05–2026-06-0\d/);
    // Segment med för få observationer utelämnas med orsak
    const small = calibrateSite(res.derived.slice(0, 400), { siteId: "s1", label: "x", dayType: "weekday:3" });
    expect(small.stats.unload.omitted.length).toBeGreaterThan(0);
    expect(small.stats.unload.omitted[0].reason).toMatch(/minSegmentN/);
  });

  it("pipelinen är idempotent och oberoende av inputordning", () => {
    const pOpts = { tenantId: "t1", siteId: "s1", openFrom: DEMO_SITE_TRUTH.openFrom, openTo: DEMO_SITE_TRUTH.openTo };
    const sub = visits.slice(0, 3000);
    const a = JSON.stringify(runPipeline(sub, pOpts));
    const b = JSON.stringify(runPipeline(sub, pOpts));
    const rng = new Rng("shuffle");
    const shuffled = [...sub];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const c = JSON.stringify(runPipeline(shuffled, pOpts));
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(runPipeline(sub.slice(1), pOpts).inputHash).not.toBe(JSON.parse(a).inputHash);
  });

  it("tenant-isolering: annan tenant eller sajt kastar", () => {
    const pOpts = { tenantId: "t1", siteId: "s1", openFrom: 300, openTo: 900 };
    expect(() => runPipeline([...visits.slice(0, 5), { ...visits[5], tenantId: "t2" }], pOpts)).toThrow(/Tenant-isolering/);
    expect(() => runPipeline([{ ...visits[0], siteId: "s2" }], pOpts)).toThrow(/Tenant-isolering/);
  });

  it("CSV-roundtrip av syntetiska besök", () => {
    const sub = visits.slice(0, 500);
    expect(visitsFromCsv(visitsToCsv(sub))).toEqual(sub);
  });

  it("replay av inspelade dagar (FCFS, recorded) återskapar verklig väntan", () => {
    const T = DEMO_SITE_TRUTH;
    // Obegränsat antal grindfiler: uppmätt grindtid (ankomst → incheckning) innehåller redan grindkön.
    const site = { ...syntheticSiteConfig(T), gateLanes: 1000 };
    const diffs: number[] = [];
    for (const day of res.days) {
      const trucks = generateDay(res.profiles.all, { pattern: "recorded", volumeFactor: 1, serviceTimes: "recorded" }, { seed: "replay", rep: 0, recorded: day.trucks });
      const sim = simulateDay(trucks, site, { kind: "fcfs", onTimeToleranceMin: 15 }, { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 0 });
      expect(sim.metrics.trucks).toBe(day.actual.trucks);
      diffs.push(Math.abs(sim.metrics.avgWait - day.actual.avgWait));
    }
    const sorted = [...diffs].sort((a, b) => a - b);
    // Avvikelser kommer bara från brusinjicerade besök (exkluderade bilar, manuella tider, LPR-bortfall).
    expect(median(sorted)).toBeLessThan(0.5);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(1.5);
  });

  it("replay med skuggbilar: exkluderade men ankomna besök upptar dörrar, och biasen minskar", () => {
    const T = DEMO_SITE_TRUTH;
    const site = { ...syntheticSiteConfig(T), gateLanes: 999 };
    const shadows = res.days.flatMap((d) => d.trucks.filter((t) => t.shadow));
    expect(shadows.length).toBeGreaterThan(0);
    // Skuggbilar: aldrig dubbletter/avbokade/no-show, och deras orimliga tider saknas (dras i stället).
    const byId = new Map(res.derived.map((d) => [d.visit.visitId, d]));
    for (const t of shadows) {
      const d = byId.get(t.id)!;
      expect(d.included).toBe(false);
      expect(d.issues).not.toContain("duplicate");
      if (d.issues.includes("unload_too_long") || d.issues.includes("missing_unload")) expect(t.unloadMin).toBeNull();
    }
    let sumActual = 0;
    let errNew = 0;
    let errOld = 0;
    for (const day of res.days) {
      const included = res.derived.filter((d) => d.serviceDate === day.date && d.included).length;
      expect(day.actual.trucks).toBe(included);
      const run = (recorded: typeof day.trucks) => {
        const trucks = generateDay(res.profiles.all, { pattern: "recorded", volumeFactor: 1, serviceTimes: "recorded" }, { seed: "shadow", rep: 0, recorded });
        return simulateDay(trucks, site, { kind: "fcfs", onTimeToleranceMin: 15 }, { currency: "SEK", detentionFreeMin: 120, detentionCostPerHour: 0 }).metrics;
      };
      const withShadows = run(day.trucks);
      // Nyckeltalen räknar bara inkluderade bilar – skuggbilarna syns inte i antalet.
      expect(withShadows.trucks).toBe(included);
      const old = run(day.trucks.filter((t) => !t.shadow));
      sumActual += day.actual.avgWait;
      errNew += withShadows.avgWait - day.actual.avgWait;
      errOld += old.avgWait - day.actual.avgWait;
    }
    const relNew = errNew / sumActual;
    const relOld = errOld / sumActual;
    expect(relOld).toBeLessThan(0); // utan skuggbilar underskattas väntan
    expect(Math.abs(relNew)).toBeLessThan(Math.abs(relOld));
  });

  it("demomodell: k-anonym, ommärkt och utan PII", () => {
    const all = res.profiles.all;
    const labels = buildCarrierRelabeling(all.unloadSamples.map((s) => s.carrier), 20);
    expect(labels.C01).toBe("Transportör A");
    const m = toDemoModel(all, DEFAULT_QUALITY_RULES, { label: "Demo", carrierLabels: labels });
    expect(m.siteId).toBe("demo");
    expect(m.unloadSamples.some((s) => s.carrier.startsWith("C0"))).toBe(false);
    expect(Object.values(m.provenance).every((p) => !/\d{4}-\d{2}-\d{2}/.test(p.source))).toBe(true);
    // Litet segment slås ihop till Övrigt
    const tiny = { ...all, unloadSamples: [...all.unloadSamples.slice(0, 200), ...Array.from({ length: 5 }, () => ({ ...all.unloadSamples[0], carrier: "C99", goodsType: "farligt" }))] };
    const dm = toDemoModel(tiny, DEFAULT_QUALITY_RULES, { label: "Demo" });
    expect(dm.unloadSamples.filter((s) => s.carrier === "Övrigt").length).toBeGreaterThanOrEqual(5);
    expect(dm.unloadSamples.some((s) => s.goodsType === "farligt")).toBe(false);
    expect(() => assertNoPII(m)).not.toThrow();
  });
});

describe("demodataset", () => {
  it("byggs deterministiskt, har UI-formen, < 4 MB och ingen PII (WRITE_DEMO=1 skriver filen)", () => {
    const json = demoDatasetJson(DEMO_SEED);
    expect(demoDatasetJson(DEMO_SEED)).toBe(json);
    // Gräns 4 MB okomprimerat (≈ 0,45 MB gzip över nätet); historiska ankomstmönster lades till i v1.1.
    expect(Buffer.byteLength(json)).toBeLessThan(4 * 1024 * 1024);
    const d = JSON.parse(json);
    expect(d.kind).toBe("demo");
    expect(d.site).toEqual({ siteId: "demo", label: "Demo DC Nord", tz: TZ, open: "05:00", close: "15:00", doors: 8 });
    expect(Object.keys(d.profiles)).toContain("all");
    expect(d.days.length).toBeGreaterThan(90);
    expect(d.quality).toMatchObject({ firstDate: "2026-01-05" });
    expect(() => assertNoPII(d)).not.toThrow();
    const out = resolve(__dirname, "../src/app/demo/demo-dataset.json");
    if (process.env.WRITE_DEMO === "1") writeFileSync(out, json);
    else if (existsSync(out)) expect(readFileSync(out, "utf8")).toBe(json);
  });
});

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}
