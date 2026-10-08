import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// I molnmiljön finns Chromium förinstallerat; i CI installeras det med `npx playwright install chromium`.
const localChromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: "npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
