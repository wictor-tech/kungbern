import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dataset } from "../app/types.ts";

/**
 * Datakällor för API:t. Två HELT separata implementationer:
 *  - DemoStore: returnerar bara det inbyggda syntetiska datasetet. Känner inte till några tenants.
 *  - TenantStore: läser kalibrerade dataset per tenant från en katalog. Varje uppslag kräver tenantId,
 *    och sökvägar valideras så att ett id aldrig kan peka ut en annan tenants katalog.
 */
export interface DatasetStore {
  readonly kind: "demo" | "tenant";
  listSites(tenantId: string): Promise<string[]>;
  get(tenantId: string, siteId: string): Promise<Dataset | null>;
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function assertSafeId(kind: string, id: string): void {
  if (!SAFE_ID.test(id)) throw new HttpError(400, `Ogiltigt ${kind}`);
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const DEMO_TENANT = "demo";

export class DemoStore implements DatasetStore {
  readonly kind = "demo" as const;
  private readonly ds: Dataset;
  constructor(ds: Dataset) {
    if (ds.kind !== "demo") throw new Error("DemoStore accepterar bara dataset med kind=demo");
    this.ds = ds;
  }
  async listSites(tenantId: string): Promise<string[]> {
    return tenantId === DEMO_TENANT ? [this.ds.site.siteId] : [];
  }
  async get(tenantId: string, siteId: string): Promise<Dataset | null> {
    return tenantId === DEMO_TENANT && siteId === this.ds.site.siteId ? this.ds : null;
  }
}

/** Läser <root>/<tenantId>/<siteId>.json – produceras av kalibreringspipelinen (scripts/recalibrate.ts). */
export class TenantStore implements DatasetStore {
  readonly kind = "tenant" as const;
  private readonly root: string;
  private readonly cache = new Map<string, { ds: Dataset; at: number }>();
  private readonly ttlMs: number;
  constructor(root: string, ttlMs = 5 * 60_000) {
    this.root = root;
    this.ttlMs = ttlMs;
  }
  async listSites(tenantId: string): Promise<string[]> {
    assertSafeId("tenantId", tenantId);
    try {
      return (await readdir(join(this.root, tenantId))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
    } catch {
      return [];
    }
  }
  async get(tenantId: string, siteId: string): Promise<Dataset | null> {
    assertSafeId("tenantId", tenantId);
    assertSafeId("siteId", siteId);
    const key = `${tenantId}/${siteId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.ds;
    try {
      const ds = JSON.parse(await readFile(join(this.root, tenantId, `${siteId}.json`), "utf8")) as Dataset;
      // Försvar på djupet: filen måste själv deklarera rätt tenant.
      if (ds.tenantId !== tenantId) throw new HttpError(500, "Datasetets tenant matchar inte sökvägen");
      this.cache.set(key, { ds, at: Date.now() });
      return ds;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      return null;
    }
  }
}
