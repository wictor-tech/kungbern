import { handle } from "./workerApi.ts";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** Klient som kör tunga beräkningar i en Web Worker så att UI:t aldrig fryser. */
class SimClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
          const p = this.pending.get(e.data.id);
          if (!p) return;
          this.pending.delete(e.data.id);
          if (e.data.ok) p.resolve(e.data.result);
          else p.reject(new Error(e.data.error));
        };
      } catch {
        this.worker = null;
      }
    }
  }

  call<R>(fn: string, ...args: unknown[]): Promise<R> {
    if (!this.worker) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(handle(fn, args) as R);
          } catch (e) {
            reject(e as Error);
          }
        }, 0);
      });
    }
    const id = this.nextId++;
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ id, fn, args });
    });
  }
}

export const sim = new SimClient();
