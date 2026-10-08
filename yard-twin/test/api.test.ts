import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dataset } from "../src/app/types.ts";
import { createHandler } from "../src/server/app.ts";
import { Authenticator, sha256Hex, type KeyEntry } from "../src/server/auth.ts";
import { MemoryRunLog } from "../src/server/runlog.ts";
import { DemoStore, TenantStore } from "../src/server/store.ts";
import { testModel, testScenarioFile } from "./fixtures.ts";

function dataset(kind: "demo" | "tenant", siteId: string, tenantId?: string): Dataset {
  const m = { ...testModel(), siteId };
  return {
    kind,
    tenantId,
    note: "test",
    pipelineVersion: "test",
    site: { siteId, label: siteId, tz: "Europe/Stockholm", open: "05:00", close: "15:00", doors: 6 },
    profiles: { all: m },
    days: [],
  };
}

const KEYS: Record<string, Omit<KeyEntry, "keyHash">> = {
  "k-acme": { userId: "u-acme", role: "customer", tenants: ["acme"], sites: { acme: ["site1"] } },
  "k-beta": { userId: "u-beta", role: "customer", tenants: ["beta"], sites: { beta: "*" } },
  "k-sales": { userId: "u-sales", role: "sales", tenants: [], sites: {} },
  "k-admin": { userId: "u-admin", role: "admin", tenants: "*", sites: "*" },
};

async function auth(): Promise<Authenticator> {
  const entries: KeyEntry[] = [];
  for (const [k, v] of Object.entries(KEYS)) entries.push({ ...v, keyHash: await sha256Hex(k) });
  return new Authenticator(entries);
}

async function start(handler: ReturnType<typeof createHandler>): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const scen = (siteId: string, reps = 20) => ({ ...testScenarioFile(), siteId, monteCarlo: { reps, seed: "api" } });

describe("API – tenant-server", () => {
  let server: Server, base: string;
  const log = new MemoryRunLog();
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "yt-"));
    for (const [t, s] of [["acme", "site1"], ["acme", "site2"], ["beta", "site9"]]) {
      await mkdir(join(dir, t), { recursive: true });
      await writeFile(join(dir, t, `${s}.json`), JSON.stringify(dataset("tenant", s, t)));
    }
    // fil som påstår sig tillhöra fel tenant
    await writeFile(join(dir, "beta", "forged.json"), JSON.stringify(dataset("tenant", "forged", "acme")));
    ({ server, base } = await start(createHandler({ store: new TenantStore(dir), auth: await auth(), log, newId: (() => { let i = 0; return () => `run-${++i}`; })() })));
  });
  afterAll(() => server.close());

  const call = (path: string, key?: string, body?: unknown) =>
    fetch(base + path, { method: body ? "POST" : "GET", headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  it("kräver nyckel", async () => {
    expect((await call("/api/tenants/acme/sites")).status).toBe(401);
    expect((await call("/api/tenants/acme/sites", "fel-nyckel")).status).toBe(401);
  });

  it("kund ser bara sina sajter", async () => {
    const r = await call("/api/tenants/acme/sites", "k-acme");
    expect(r.status).toBe(200);
    expect((await r.json()).sites).toEqual(["site1"]);
  });

  it("kund kan köra scenario på sin sajt och läsa tillbaka resultatet", async () => {
    const r = await call("/api/tenants/acme/sites/site1/runs", "k-acme", { scenario: scen("site1") });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.reps).toBe(20);
    expect(body.summary.avgWait.median).toBeGreaterThanOrEqual(0);
    const again = await call(`/api/tenants/acme/sites/site1/runs/${body.runId}`, "k-acme");
    expect(again.status).toBe(200);
    expect(log.entries.at(-1)).toMatchObject({ userId: "u-acme", tenantId: "acme", siteId: "site1", status: "ok" });
  });

  it("kund kan INTE nå annan tenant eller ej tilldelad sajt (404, avslöjar inget)", async () => {
    expect((await call("/api/tenants/beta/sites", "k-acme")).status).toBe(404);
    expect((await call("/api/tenants/beta/sites/site9/calibration", "k-acme")).status).toBe(404);
    expect((await call("/api/tenants/beta/sites/site9/runs", "k-acme", { scenario: scen("site9") })).status).toBe(404);
    expect((await call("/api/tenants/acme/sites/site2/calibration", "k-acme")).status).toBe(404);
  });

  it("körnings-id från en tenant går inte att läsa via en annan", async () => {
    const r = await call("/api/tenants/acme/sites/site1/runs", "k-admin", { scenario: scen("site1") });
    const { runId } = await r.json();
    expect((await call(`/api/tenants/beta/sites/site9/runs/${runId}`, "k-admin")).status).toBe(404);
    expect((await call(`/api/tenants/beta/sites/site9/runs/${runId}`, "k-beta")).status).toBe(404);
  });

  it("säljroll nekas all kunddata", async () => {
    expect((await call("/api/tenants/acme/sites", "k-sales")).status).toBe(404);
    expect((await call("/api/tenants/acme/sites/site1/runs", "k-sales", { scenario: scen("site1") })).status).toBe(404);
  });

  it("ogiltiga id:n och förfalskade filer stoppas", async () => {
    expect((await call("/api/tenants/ACME/sites", "k-admin")).status).toBe(400);
    expect((await call("/api/tenants/acme..beta/sites", "k-admin")).status).toBe(400);
    const forged = await call("/api/tenants/beta/sites/forged/calibration", "k-admin");
    expect(forged.status).toBe(500);
    expect(JSON.stringify(await forged.json())).not.toContain("acme");
  });

  it("validerar scenario och begränsar repetitioner", async () => {
    expect((await call("/api/tenants/acme/sites/site1/runs", "k-acme", { scenario: { ...scen("site1"), costs: { ...scen("site1").costs, source: "" } } })).status).toBe(422);
    expect((await call("/api/tenants/acme/sites/site1/runs", "k-acme", { scenario: scen("site1", 5000) })).status).toBe(422);
    expect((await call("/api/tenants/acme/sites/site1/runs", "k-acme", { scenario: scen("other") })).status).toBe(422);
  });
});

describe("API – demoserver", () => {
  let server: Server, base: string;
  beforeAll(async () => {
    ({ server, base } = await start(createHandler({ store: new DemoStore(dataset("demo", "demo")), auth: await auth(), log: new MemoryRunLog() })));
  });
  afterAll(() => server.close());
  const call = (path: string, key: string, body?: unknown) =>
    fetch(base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  it("säljare kan köra demo", async () => {
    const r = await call("/api/tenants/demo/sites/demo/runs", "k-sales", { scenario: scen("demo") });
    expect(r.status).toBe(201);
  });
  it("demoservern kan aldrig nå en riktig tenant – inte ens som admin", async () => {
    expect((await call("/api/tenants/acme/sites", "k-admin")).status).toBe(404);
    expect((await call("/api/tenants/acme/sites/site1/runs", "k-admin", { scenario: scen("site1") })).status).toBe(404);
  });
  it("DemoStore vägrar dataset som inte är demo", () => {
    expect(() => new DemoStore(dataset("tenant", "x", "acme"))).toThrow();
  });
});
