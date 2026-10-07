/**
 * Loggar in i app.lupnumber.com med LUP_DEMO_USER / LUP_DEMO_PASSWORD (från miljön, aldrig i koden)
 * och sparar inloggningen i en fil som capture.mjs använder.
 *   node scripts/capture/login.mjs <state.json>
 */
import { chromium } from "playwright";
const out = process.argv[2];
const user = process.env.LUP_DEMO_USER;
const pass = process.env.LUP_DEMO_PASSWORD;
if (!out || !user || !pass) {
  console.error("Användning: LUP_DEMO_USER=… LUP_DEMO_PASSWORD=… node scripts/capture/login.mjs <state.json>");
  process.exit(1);
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "sv-SE" });
const page = await ctx.newPage();
await page.goto("https://app.lupnumber.com/login", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: user.includes("@") ? "E-post" : "Användarnamn" }).click();
await page.locator('input[type="email"], input[type="text"]').first().fill(user);
await page.getByRole("button", { name: "Fortsätt" }).click();
await page.locator('input[type="password"]').waitFor({ timeout: 15000 });
await page.locator('input[type="password"]').fill(pass);
await page.keyboard.press("Enter");
await page.waitForURL(/\/home|\/site/, { timeout: 30000 });
await ctx.storageState({ path: out });
console.log("Inloggad, sparat i", out);
await b.close();
