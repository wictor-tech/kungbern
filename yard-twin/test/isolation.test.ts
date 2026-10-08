import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/**
 * Demo-UI:t får inte innehålla någon väg till kunddata: inga nätverksanrop, inga serverimporter
 * och ingen annan datakälla än det inbyggda syntetiska datasetet.
 */
describe("demoisolering (statisk kontroll av UI-koden)", () => {
  const src = files("src/app").filter((f) => /\.(ts|tsx)$/.test(f));
  it.each(src)("%s gör inga nätverksanrop och importerar inte serverkod", (f) => {
    const code = readFileSync(f, "utf8");
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(code).not.toMatch(/from\s+["'][^"']*\/server\//);
    expect(code).not.toMatch(/TenantStore/);
  });
  it("enda datasetet som UI:t laddar är demo-datasetet", () => {
    const jsonImports = src.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/from\s+["']([^"']+\.json)["']/g)].map((m) => m[1]));
    expect(jsonImports).toEqual(["./demo/demo-dataset.json"]);
  });
});
