import { expect, test } from "@playwright/test";

test("fråga → visuell guide → Nej → supportärende", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vad vill du ha hjälp med?" })).toBeVisible();
  await page.getByLabel("Vad vill du ha hjälp med?").fill("Hur laddar jag upp foto?");
  await page.getByRole("button", { name: "Visa hur" }).click();

  await expect(page.getByRole("heading", { name: "Lägga upp en bild" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Var du hittar det" })).toContainText("Bildhantering");
  await expect(page.getByAltText("Skärmbild: Lägga upp en bild")).toBeVisible();

  // Bocka av ett steg
  const step1 = page.getByRole("button", { name: /Öppna Bildhantering/ });
  await step1.click();
  await expect(step1).toHaveAttribute("aria-pressed", "true");

  // Förstora bilden och stäng
  await page.getByRole("button", { name: "Visa skärmbilden större" }).click();
  await expect(page.getByRole("dialog", { name: "Förstorad skärmbild" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Nej → "Ser annorlunda ut hos mig" → direkt till support
  await page.getByRole("button", { name: "👎 Nej" }).click();
  await page.getByRole("button", { name: "Ser annorlunda ut hos mig" }).click();
  await expect(page.getByText("Kontakta support", { exact: true })).toBeVisible();
  await page.getByLabel("Din e-post eller ditt telefonnummer").fill("test@example.com");
  await page.getByRole("button", { name: "Skicka till support" }).click();
  await expect(page.getByText(/Ärende T-[A-Z0-9]+ är skickat/)).toBeVisible();
});

test("fråga utan guide ger ärligt svar", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("Hur kopplar jag vår kamera?"));
  await expect(page.getByText("Vi har ingen guide för det än.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skicka till support" })).toBeVisible();
});

test("hjälp öppnad från en sida i produkten visar sidans guide", async ({ page }) => {
  await page.goto("/?page=capacity-timeslots&embed=1");
  await expect(page.getByText("Hjälp för sidan du står på")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ändra kapacitet per timme/ })).toBeVisible();
  await page.getByLabel("Vad vill du ha hjälp med?").fill("Hur ändrar jag detta?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Ändra kapacitet per timme" })).toBeVisible();
});

test("admin: logga in, ändra en guide, se den i sökningen", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel(/Ditt namn/).fill("E2E");
  await page.getByLabel("Lösenord").fill("e2e-test");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.getByRole("heading", { name: "Guider" })).toBeVisible();

  await page.getByRole("link", { name: /Lägga till en video/ }).click();
  await page.waitForLoadState("networkidle");
  const alt = page.getByLabel("Alternativa frågor");
  await alt.fill((await alt.inputValue()) + "\nflamingofilm");
  await expect(page.getByText("Osparade ändringar")).toBeVisible();
  await page.getByRole("button", { name: "Spara", exact: true }).click();
  await expect(page.getByText("Sparat.")).toBeVisible();

  await page.goto("/?q=flamingofilm");
  await expect(page.getByRole("heading", { name: "Lägga till en video" })).toBeVisible();
});

test("?-widgeten öppnar hjälpen för sidan användaren står på", async ({ page }) => {
  await page.goto("/widget-demo.html");
  await page.getByRole("button", { name: "Behöver du hjälp?" }).click();
  const help = page.frameLocator('iframe[title="LUP Hjälp"]');
  await expect(help.getByText("Hjälp för sidan du står på")).toBeVisible();
  await expect(help.getByRole("link", { name: /Ändra kapacitet per timme/ })).toBeVisible();

  await page.getByRole("button", { name: "Stäng hjälpen" }).click();
  await page.getByRole("button", { name: "Site › SMS Alarm" }).click();
  await page.getByRole("button", { name: "Behöver du hjälp?" }).click();
  await expect(help.getByRole("link", { name: /Skicka SMS till alla/ })).toBeVisible();
});

test("varje steg som pekar på en knapp visar en inzoomad bild", async ({ page }) => {
  await page.goto("/g/andra-kapacitet-per-timme");
  await expect(page.getByRole("img", { name: "Inzoomat: Spara kapacitet" })).toBeVisible();
});

test("förslag medan man skriver tar en direkt till guiden", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Vad vill du ha hjälp med?").pressSequentially("kapacitet", { delay: 40 });
  const option = page.getByRole("option", { name: /Ändra kapacitet per timme/ });
  await expect(option).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/g\/andra-kapacitet-per-timme/);
  await expect(page.getByRole("heading", { name: "Ändra kapacitet per timme" })).toBeVisible();
});
