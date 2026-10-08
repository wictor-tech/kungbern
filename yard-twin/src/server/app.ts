import type { IncomingMessage, ServerResponse } from "node:http";
import { runMonteCarlo } from "../engine/montecarlo.ts";
import { compileScenario, scenarioHash, validateScenario, type ScenarioFile } from "../engine/scenario.ts";
import type { Dataset } from "../app/types.ts";
import { canAccessSite, canAccessTenant, type Authenticator, type Principal } from "./auth.ts";
import type { RunLog } from "./runlog.ts";
import { assertSafeId, DEMO_TENANT, HttpError, type DatasetStore } from "./store.ts";

export interface AppDeps {
  store: DatasetStore;
  auth: Authenticator;
  log: RunLog;
  /** Övre gräns för repetitioner per API-anrop (skyddar servern). */
  maxReps?: number;
  /** Klocka och id-generator injiceras för deterministiska tester. */
  now?: () => Date;
  newId?: () => string;
}

interface StoredRun {
  tenantId: string;
  siteId: string;
  body: unknown;
}

const MAX_BODY = 512 * 1024;
const MAX_STORED_RUNS = 500;

/**
 * HTTP-API för Yard Twin, så att modulen kan flyttas in i plattformen.
 *
 *   GET  /api/health
 *   GET  /api/tenants/:tenant/sites
 *   GET  /api/tenants/:tenant/sites/:site/calibration
 *   POST /api/tenants/:tenant/sites/:site/runs     { scenario: ScenarioFile }
 *   GET  /api/tenants/:tenant/sites/:site/runs/:runId
 *
 * Varje anrop kräver "Authorization: Bearer <nyckel>". Tenant och sajt kontrolleras mot nyckelns
 * behörighet INNAN något läses från datakällan. Säljroll får bara använda en demoserver.
 */
export function createHandler(deps: AppDeps) {
  const runs = new Map<string, StoredRun>();
  const maxReps = deps.maxReps ?? 1000;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const authorize = (p: Principal, tenantId: string, siteId?: string) => {
    assertSafeId("tenantId", tenantId);
    if (siteId !== undefined) assertSafeId("siteId", siteId);
    if (deps.store.kind === "demo") {
      if (tenantId !== DEMO_TENANT) throw new HttpError(404, "Hittades inte");
      return;
    }
    // Tenant-server: säljare och okända tenants nekas. 404 i stället för 403 för att inte avslöja vilka tenants som finns.
    if (!canAccessTenant(p, tenantId)) throw new HttpError(404, "Hittades inte");
    if (siteId !== undefined && !canAccessSite(p, tenantId, siteId)) throw new HttpError(404, "Hittades inte");
  };

  const loadDataset = async (tenantId: string, siteId: string): Promise<Dataset> => {
    const ds = await deps.store.get(tenantId, siteId);
    if (!ds) throw new HttpError(404, "Hittades inte");
    return ds;
  };

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (req.method === "GET" && url.pathname === "/api/health") {
        return send(res, 200, { ok: true, mode: deps.store.kind });
      }
      if (parts[0] !== "api" || parts[1] !== "tenants" || parts.length < 4) throw new HttpError(404, "Hittades inte");

      const p = await deps.auth.authenticate(req.headers.authorization);
      if (!p) throw new HttpError(401, "Autentisering krävs");
      const tenantId = parts[2];

      // GET /api/tenants/:t/sites
      if (req.method === "GET" && parts.length === 4 && parts[3] === "sites") {
        authorize(p, tenantId);
        const sites = (await deps.store.listSites(tenantId)).filter((s) => deps.store.kind === "demo" || canAccessSite(p, tenantId, s));
        return send(res, 200, { tenantId, sites });
      }
      if (parts[3] !== "sites" || parts.length < 6) throw new HttpError(404, "Hittades inte");
      const siteId = parts[4];
      authorize(p, tenantId, siteId);

      // GET .../calibration
      if (req.method === "GET" && parts.length === 6 && parts[5] === "calibration") {
        const ds = await loadDataset(tenantId, siteId);
        return send(res, 200, { tenantId, siteId, pipelineVersion: ds.pipelineVersion, calibration: ds.calibration ?? null, quality: ds.quality ?? null });
      }

      // POST .../runs
      if (req.method === "POST" && parts.length === 6 && parts[5] === "runs") {
        const body = (await readJson(req)) as { scenario?: ScenarioFile };
        const scenario = body?.scenario;
        const errors = validateScenario(scenario);
        if (errors.length) throw new HttpError(422, errors.join("; "));
        if (scenario!.siteId !== siteId) throw new HttpError(422, "scenario.siteId matchar inte sajten i URL:en");
        const reps = scenario!.monteCarlo?.reps ?? 300;
        if (reps > maxReps) throw new HttpError(422, `monteCarlo.reps får vara högst ${maxReps}`);
        const ds = await loadDataset(tenantId, siteId);
        const dayType = scenario!.dayType ?? "all";
        if (!Object.hasOwn(ds.profiles, dayType)) throw new HttpError(422, `Ingen profil för dagtyp ${JSON.stringify(dayType)} (finns: ${Object.keys(ds.profiles).join(", ")})`);
        const model = ds.profiles[dayType];
        const sc = compileScenario(scenario!);
        let recorded;
        if (sc.arrivals.pattern === "recorded") {
          recorded = ds.days.find((d) => d.date === scenario!.date)?.trucks;
          if (!recorded) throw new HttpError(422, `Ingen inspelad dag ${scenario!.date}`);
        }
        const runId = newId();
        const hash = scenarioHash(scenario!);
        const mc = runMonteCarlo(model, sc, { recorded });
        const result = {
          runId,
          tenantId,
          siteId,
          scenarioId: scenario!.id,
          scenarioHash: hash,
          profile: dayType,
          pipelineVersion: ds.pipelineVersion,
          reps: mc.reps,
          seed: mc.seed,
          summary: mc.summary,
          elapsedMs: Math.round(mc.elapsedMs),
          calibration: ds.calibration ?? null,
          costSource: scenario!.costs.source,
        };
        runs.set(runId, { tenantId, siteId, body: result });
        if (runs.size > MAX_STORED_RUNS) runs.delete(runs.keys().next().value!);
        await deps.log.write({ ts: now().toISOString(), runId, userId: p.userId, role: p.role, tenantId, siteId, scenarioId: scenario!.id, scenarioHash: hash, reps: mc.reps, elapsedMs: result.elapsedMs, status: "ok" });
        return send(res, 201, result);
      }

      // GET .../runs/:id
      if (req.method === "GET" && parts.length === 7 && parts[5] === "runs") {
        const r = runs.get(parts[6]);
        // Ett körnings-id från en annan tenant/sajt ska se ut precis som ett okänt id.
        if (!r || r.tenantId !== tenantId || r.siteId !== siteId) throw new HttpError(404, "Hittades inte");
        return send(res, 200, r.body);
      }
      throw new HttpError(404, "Hittades inte");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof HttpError ? e.message : "Internt fel";
      if (status === 500) console.error(e);
      return send(res, status, { error: message });
    }
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "För stor request");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Ogiltig JSON");
  }
}
