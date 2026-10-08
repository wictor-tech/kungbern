import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Dataset } from "../app/types.ts";
import { createHandler } from "./app.ts";
import { Authenticator } from "./auth.ts";
import { FileRunLog } from "./runlog.ts";
import { DemoStore, TenantStore, type DatasetStore } from "./store.ts";

/**
 * Startar API-servern.
 *   YT_MODE=demo   (standard) – endast inbyggd syntetisk demodata. Kan aldrig nå kunddata.
 *   YT_MODE=tenant – läser kalibrerade dataset från YT_DATA_DIR/<tenant>/<site>.json
 *   YT_API_KEYS    – JSON-lista med { keyHash, userId, role, tenants, sites }
 *   YT_RUN_LOG     – sökväg till körlogg (JSONL), standard ./runs.log.jsonl
 *   PORT           – standard 8787
 */
const mode = process.env.YT_MODE ?? "demo";
let store: DatasetStore;
if (mode === "demo") {
  const ds = JSON.parse(await readFile(new URL("../app/demo/demo-dataset.json", import.meta.url), "utf8")) as Dataset;
  store = new DemoStore(ds);
} else if (mode === "tenant") {
  const dir = process.env.YT_DATA_DIR;
  if (!dir) throw new Error("YT_DATA_DIR krävs i tenant-läge");
  store = new TenantStore(dir);
} else {
  throw new Error(`Okänt YT_MODE ${mode}`);
}

const handler = createHandler({ store, auth: Authenticator.fromEnv(process.env), log: new FileRunLog(process.env.YT_RUN_LOG ?? "./runs.log.jsonl") });
const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => void handler(req, res)).listen(port, () => console.log(`Yard Twin API (${mode}) på http://localhost:${port}`));
