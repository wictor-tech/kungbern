import { appendFile } from "node:fs/promises";

export interface RunLogEntry {
  ts: string;
  runId: string;
  userId: string;
  role: string;
  tenantId: string;
  siteId: string;
  scenarioId: string;
  scenarioHash: string;
  reps: number;
  elapsedMs: number;
  status: "ok" | "denied" | "error";
  error?: string;
}

/** Körlogg (JSONL). Innehåller aldrig kunddata – bara vem, vad, när och hur länge. */
export interface RunLog {
  write(e: RunLogEntry): Promise<void>;
}

export class FileRunLog implements RunLog {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async write(e: RunLogEntry): Promise<void> {
    await appendFile(this.path, `${JSON.stringify(e)}\n`, "utf8");
  }
}

export class MemoryRunLog implements RunLog {
  readonly entries: RunLogEntry[] = [];
  async write(e: RunLogEntry): Promise<void> {
    this.entries.push(e);
  }
}
