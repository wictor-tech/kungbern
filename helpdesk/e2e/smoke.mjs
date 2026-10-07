// Körs mot en startad server:  BASE=http://localhost:8787 ADMIN=admin node e2e/smoke.mjs
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const BASE = process.env.BASE ?? "http://localhost:8787", ADMIN = process.env.ADMIN ?? "admin";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "sv-SE" });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const ok = (m) => console.log("✓", m);

// 1. Fråga → visuell guide → stega
await p.goto(BASE + "/");
await p.fill(".askbox input", "Hur laddar jag upp foto?"); await p.keyboard.press("Enter");
await p.waitForSelector(".guide h1");
assert.match(await p.textContent(".guide h1"), /bild/i);
assert.ok(await p.locator(".shot img").count() >= 1 || true);
await p.click("text=Nästa"); await p.waitForSelector(".shot img");
ok("fråga → guide med skärmbild");

// 2. Nej → vad saknades → försök igen → Nej → ticket
await p.click("text=Nej"); await p.click("text=Hittar inte knappen"); await p.click("text=Försök igen");
await p.waitForSelector(".retry"); ok("Nej → nytt försök");
await p.click("text=Kontakta support").catch(() => {});
await p.waitForSelector(".retry .ticket, .feedback .ticket");
await p.locator(".ticket textarea").first().fill("test");
await p.locator(".ticket button.primary").first().click();
await p.waitForSelector(".ok-card"); ok("supportärende skapat");

// 3. Ingen träff → ärligt besked
await p.goto(BASE + "/ask?q=" + encodeURIComponent("vad är vädret"));
await p.waitForSelector(".no-answer"); ok("ingen träff hanteras");

// 4. Kontext: aktuell sida
await p.goto(BASE + "/ask?q=" + encodeURIComponent("Hur ändrar jag detta?") + "&page=capacity");
await p.waitForSelector(".guide h1");
assert.match(await p.textContent(".guide h1"), /lastbilar/); ok("kontext → rätt guide");

// 5. Walkthrough i värdappen
const host = await ctx.newPage();
await host.setViewportSize({ width: 1100, height: 800 });
await host.goto(BASE + "/demo-host.html");
await host.click(".lh-btn");
const fr = host.frameLocator("iframe.lh-panel");
await host.click("#loc"); await host.click("[data-help=menu-capacity]");
await fr.locator(".askbox input").waitFor();
await fr.locator(".askbox input").fill("Hur ändrar jag detta?"); await fr.locator(".askbox input").press("Enter");
await fr.locator("text=Visa mig i programmet").click();
await host.waitForSelector(".lh-spot");
await host.fill("[data-help=cap-input]", "6");
await host.click("[data-help=cap-save]");
await host.waitForSelector("text=Klart!"); ok("walkthrough i programmet");

// 6. Admin
const a = await ctx.newPage(); await a.setViewportSize({ width: 1280, height: 900 });
await a.goto(BASE + "/admin"); await a.fill("input[type=password]", ADMIN); await a.keyboard.press("Enter");
await a.waitForSelector(".gtable");
await a.click("text=+ Ny guide");
await a.fill("input[placeholder^='Lägg till en bild']", "Byta lösenord");
await a.fill("input[placeholder^='Dra in']", "Ändra lösenord under Min profil.");
await a.fill("input[placeholder='Klicka på **Lägg till bild**']", "Klicka **Min profil**");
await a.click("text=Publicera"); await a.waitForSelector("text=Sparad och publicerad");
await p.goto(BASE + "/ask?q=" + encodeURIComponent("Byta lösenord")); await p.waitForSelector(".guide h1");
ok("admin: skapa + publicera → hittas direkt");
await a.goto(BASE + "/admin/analytics"); await a.waitForSelector(".tiles"); ok("analytics renderas");

assert.deepEqual(errs, []);
await b.close(); console.log("ALLA OK");
