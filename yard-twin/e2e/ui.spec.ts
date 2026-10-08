import { expect, test, type Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: false });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as Page & { _errors: string[] })._errors = errors;
  await page.goto("/");
  await expect(page.getByText("Lastbilar på sajten")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { _errors: string[] })._errors).toEqual([]);
});

test("replay visar gården, KPI:er, kalibrering och verklig vs modell", async ({ page }) => {
  await expect(page.locator(".yard svg")).toBeVisible();
  await expect(page.getByText(/Kalibrering: (Hög|Medel|Låg|Otillräckligt underlag)/).first()).toBeVisible();
  await expect(page.getByText(/Verkligt: .* min · Modell: .* min/)).toBeVisible();
  await page.getByRole("slider", { name: "Hoppa till" }).fill("540");
  await expect(page.locator(".clock")).toHaveText("09:00");
  await expect(page.locator(".insight").first()).toBeVisible();
  await shot(page, "01-replay-0900");
});

test("uppspelning flyttar klockan", async ({ page }) => {
  await page.getByRole("button", { name: "40x" }).click();
  const before = await page.locator(".clock").textContent();
  await page.getByRole("button", { name: /Spela/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Paus/ }).click();
  expect(await page.locator(".clock").textContent()).not.toBe(before);
});

test("what if med slottbokning räknas om och jämförelsen visar deltan", async ({ page }) => {
  await page.getByLabel("Ankomstmönster").selectOption("booked");
  await expect(page.getByRole("button", { name: "What if" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/Slot adherence/)).toBeVisible();
  await page.getByRole("slider", { name: "Hoppa till" }).fill("510");
  await shot(page, "02-whatif-booked");
  const cmp = page.locator("section", { has: page.getByRole("heading", { name: "Med full slottbokning – jämfört med utgångsläget" }) });
  await cmp.getByRole("button", { name: "Kör analys" }).click();
  await expect(cmp.locator("table.cmp-table")).toBeVisible({ timeout: 20_000 });
  await expect(cmp.getByText(/Med slottbokning (sjunker|ökar) medelväntan/)).toBeVisible();
  await cmp.scrollIntoViewIfNeeded();
  await shot(page, "03-compare");
});

test("analyser: dörrar, flaskhals, kapacitet, ROI kräver driftdagar", async ({ page }) => {
  const a = page.locator("section", { has: page.getByRole("heading", { name: "Analys", exact: true }) });
  const run = (key: string) => a.locator(`[data-analysis="${key}"]`).getByRole("button", { name: "Kör analys" });
  await run("doors").click();
  await expect(a.getByText(/Minsta antal dörrar som klarar målet/)).toBeVisible({ timeout: 20_000 });
  await run("bottleneck").click();
  await expect(a.getByText("Andel av väntan")).toBeVisible({ timeout: 20_000 });
  await run("capacity").click();
  await expect(a.getByText(/Brytpunkt|klarar målet upp till/)).toBeVisible({ timeout: 20_000 });
  // ROI utan driftdagar ska vägra räkna (inga dolda standardvärden)
  await run("roi").click();
  await expect(a.getByRole("alert")).toContainText(/operatingDaysPerMonth/);
  await a.getByLabel("Driftdagar per månad").fill("21");
  await run("roi").click();
  await expect(a.getByRole("cell", { name: "per år", exact: true })).toBeVisible({ timeout: 20_000 });
  await a.scrollIntoViewIfNeeded();
  await shot(page, "04-analysis");
});

test("mörkt tema, engelska och presentationsläge", async ({ page }) => {
  await page.getByRole("button", { name: "Mörkt", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByText("Trucks on site")).toBeVisible();
  await page.getByRole("button", { name: "Presentation mode" }).click();
  await expect(page.getByRole("button", { name: "With slot booking", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "With slot booking", exact: true }).click();
  await page.getByRole("slider", { name: "Jump to" }).fill("540");
  await shot(page, "05-present-dark-en");
});

test("3D-vyn laddas", async ({ page }) => {
  await page.getByRole("button", { name: "3D" }).click();
  await expect(page.locator(".card canvas, .card [role=img][aria-label='3D']").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("slider", { name: "Hoppa till" }).fill("540");
  await page.waitForTimeout(500);
  await shot(page, "06-3d");
});

test("iPad-bredd fungerar utan horisontell scroll", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "07-ipad");
});
