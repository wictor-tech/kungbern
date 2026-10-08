/// <reference lib="webworker" />
import { handle } from "./workerApi.ts";

self.onmessage = (e: MessageEvent<{ id: number; fn: string; args: unknown[] }>) => {
  const { id, fn, args } = e.data;
  try {
    const result = handle(fn, args);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
