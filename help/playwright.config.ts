import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // Dev-servern kompilerar sidor vid första besöket; ge förväntningarna marginal för det.
  expect: { timeout: 10_000 },
  use: { baseURL: "http://localhost:3200" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // I CI testas den byggda produktionsversionen (bygget görs i steget före), lokalt dev-servern.
    command: process.env.CI ? "npx next start -p 3200" : "npx next dev -p 3200",
    url: "http://localhost:3200/api/guides",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: "memory://", ADMIN_PASSWORD: "e2e-test", SESSION_SECRET: "e2e-secret" },
  },
});
