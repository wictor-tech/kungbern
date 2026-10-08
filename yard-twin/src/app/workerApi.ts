import { runJob, type RunJob } from "./jobs.ts";

/** Register över funktioner som UI:t får anropa i workern. */
const registry: Record<string, (...args: never[]) => unknown> = {
  run: (job: RunJob) => runJob(job),
};

export function register(name: string, fn: (...args: never[]) => unknown): void {
  registry[name] = fn;
}

export function handle(fn: string, args: unknown[]): unknown {
  const f = registry[fn];
  if (!f) throw new Error(`Okänd funktion: ${fn}`);
  return (f as (...a: unknown[]) => unknown)(...args);
}
