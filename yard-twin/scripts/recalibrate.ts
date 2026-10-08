/**
 * Schemalagd omkalibrering per tenant och sajt. Körs i plattformens miljö (där rådata finns), t.ex. nattligen:
 *   15 2 * * *  node --experimental-strip-types scripts/recalibrate.ts
 *
 * Indata:  $YT_RAW_DIR/<tenant>/<site>.csv   (Visit-kontraktet, se docs/datakontrakt.md)
 * Utdata:  $YT_DATA_DIR/<tenant>/<site>.json (Dataset som API:t läser, kind="tenant")
 *          $YT_DATA_DIR/<tenant>/<site>.drift.json (driftrapport)
 * Cache:   omkalibrering hoppas över om inputHash + pipelineversion är oförändrade.
 * Valfritt: YT_OPEN/YT_CLOSE (HH:MM) per körning, annars observerat öppettidsfönster i data.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCalibrationSummary } from "../src/analysis/calibrationSummary.ts";
import { calibrateSite } from "../src/data/calibrate.ts";
import { visitsFromCsv } from "../src/data/csv.ts";
import { PIPELINE_VERSION, runPipeline } from "../src/data/pipeline.ts";
import { parseClock } from "../src/engine/time.ts";
import { checkDrift } from "../src/monitoring/drift.ts";

/** Antal senaste dagar som hålls utanför kalibreringen och används för driftkontroll. */
const DRIFT_WINDOW_DAYS = 14;

const raw = process.env.YT_RAW_DIR;
const out = process.env.YT_DATA_DIR;
if (!raw || !out) throw new Error("YT_RAW_DIR och YT_DATA_DIR krävs");
const SAFE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

for (const tenantId of readdirSync(raw).filter((d) => SAFE.test(d))) {
  for (const file of readdirSync(join(raw, tenantId)).filter((f) => f.endsWith(".csv"))) {
    const siteId = file.slice(0, -4);
    if (!SAFE.test(siteId)) continue;
    const visits = visitsFromCsv(readFileSync(join(raw, tenantId, file), "utf8"));
    const openFrom = parseClock(process.env.YT_OPEN ?? "00:00");
    const openTo = parseClock(process.env.YT_CLOSE ?? "23:59");
    const res = runPipeline(visits, { tenantId, siteId, openFrom, openTo });
    const dir = join(out, tenantId);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, `${siteId}.json`);
    const prev = existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as { inputHash?: string; pipelineVersion?: string; days?: { date: string }[]; calibration?: { metrics?: { avgWait?: { wmape: number } } } }) : null;

    // Driftkontroll: FÖREGÅENDE kalibrerade modell mot dagar som tillkommit sedan dess (aldrig dagar den sett).
    const prevLast = prev?.days?.at(-1)?.date;
    const recent = prevLast ? res.days.filter((d) => d.date > prevLast).slice(-DRIFT_WINDOW_DAYS) : [];
    if (prev?.calibration && recent.length > 0) {
      const prevDs = prev as unknown as { profiles: Record<string, never> };
      const drift = checkDrift({ model: prevDs.profiles.all, siteId, recentDays: recent, baselineWmape: prev.calibration.metrics?.avgWait?.wmape ?? null, openFrom, openTo });
      writeFileSync(join(dir, `${siteId}.drift.json`), JSON.stringify({ checkedAt: new Date().toISOString(), ...drift }, null, 2));
      if (drift.status === "alert") console.error(`[DRIFT] ${tenantId}/${siteId}: ${drift.reasons.map((r) => r.sv).join(" ")}`);
    }

    if (prev?.inputHash === res.inputHash && prev?.pipelineVersion === PIPELINE_VERSION) {
      console.log(`${tenantId}/${siteId}: oförändrad indata – cache används`);
      continue;
    }
    const calibration = buildCalibrationSummary({
      siteId,
      days: res.days,
      openFrom,
      openTo,
      calibrate: (train) => {
        const dates = new Set(train.map((d) => d.date));
        const r = calibrateSite(res.derived, { siteId, label: siteId, dayType: "all", dates });
        return { model: r.model, visits: res.derived.filter((d) => d.included && dates.has(d.serviceDate)).length };
      },
    });
    const q = res.quality;
    const dataset = {
      kind: "tenant",
      tenantId,
      inputHash: res.inputHash,
      note: "Kalibrerad på kundens data – får inte visas för andra kunder",
      pipelineVersion: PIPELINE_VERSION,
      site: { siteId, label: siteId, tz: q.timezone, open: process.env.YT_OPEN ?? "00:00", close: process.env.YT_CLOSE ?? "23:59", doors: Math.max(1, ...res.days.map((d) => d.doorsObserved)) },
      profiles: res.profiles,
      days: res.days,
      calibration,
      quality: { totalVisits: q.totalVisits, includedVisits: q.includedVisits, excludedByReason: q.excludedByReason, firstDate: q.firstDate, lastDate: q.lastDate, distinctDays: q.distinctDays },
    };
    writeFileSync(target, JSON.stringify(dataset));
    console.log(`${tenantId}/${siteId}: kalibrerad, betyg ${calibration.grade}${calibration.warning ? " (VARNING)" : ""}`);
  }
}
