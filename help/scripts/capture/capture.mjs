/**
 * Fångar varje guides vy i app.lupnumber.com på två språk (engelska + svenska).
 * Kör via scripts/capture/run.mjs (loggar in först). Se scripts/capture/README.md.
 * EN-körningen navigerar med engelska texter och sparar index för varje klick; SV-körningen klickar på samma index.
 * Per vy sparas skärmbild + alla synliga textelement med position (för översättning och markeringar).
 *   node capture.mjs <outdir> <statefile> <recipes.json> [guideId...]
 */
import fs from "node:fs";
import { chromium } from "playwright";
const [out, stateFile, recipesFile, ...only] = process.argv.slice(2);
const recipes = JSON.parse(fs.readFileSync(recipesFile, "utf8"));
const NAV = JSON.parse(fs.readFileSync(new URL("../../content/ui-nav.json", import.meta.url), "utf8"));

const CLICKABLE = "button, a, [role=tab], [role=button], [role=menuitem], li.list-group-item, .nav-link, summary, label";
async function clickables(page) {
  return page.evaluate((sel) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    return [...document.querySelectorAll(sel)].filter(vis).map((e, i) => ({ i, text: (e.innerText || e.getAttribute("aria-label") || e.title || "").trim().split("\n")[0] }));
  }, CLICKABLE);
}
async function clickIndex(page, idx) {
  await page.evaluate(([sel, idx]) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const els = [...document.querySelectorAll(sel)].filter(vis);
    els[idx].scrollIntoView({ block: "center" });
    els[idx].click();
  }, [CLICKABLE, idx]);
}
async function dumpTexts(page) {
  return page.evaluate(() => {
    const out = [];
    const W = window.innerWidth, H = window.innerHeight;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let e = walker.currentNode; e; e = walker.nextNode()) {
      if (!(e instanceof HTMLElement)) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
      // Egen text (inte barnens) eller formulärkontroller
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
      const tag = e.tagName.toLowerCase();
      const ctl = ["input", "select", "textarea"].includes(tag);
      const txt = own || (ctl ? (e.placeholder || e.value || e.getAttribute("aria-label") || "") : "") || (tag === "button" ? (e.getAttribute("aria-label") || e.title || "") : "");
      if (!txt && !ctl) continue;
      out.push({ tag, text: txt.slice(0, 120), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  });
}

const browser = await chromium.launch();
for (const r of recipes) {
  if (only.length && !only.includes(r.id)) continue;
  for (const locale of ["en-US", "sv-SE"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale, storageState: stateFile });
    let page = await ctx.newPage();
    const log = [];
    try {
      await page.goto(r.start, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);
      // Vänta tills eventuella "Laddar…"-indikatorer försvunnit.
      for (let t = 0; t < 20; t++) {
        const loading = await page.locator(':text-matches("^(Laddar|Loading)", "i"):visible').count();
        if (!loading) break;
        await page.waitForTimeout(500);
      }
      for (const [k, step] of r.steps.entries()) {
        if (step.scroll) {
          const box = step.scrollAt ?? [900, 500];
          await page.mouse.move(box[0], box[1]);
          await page.mouse.wheel(0, step.scroll);
          await page.waitForTimeout(800);
          continue;
        }
        if (step.select) {
          // [index i dialogens select-lista, engelsk etikett, svensk etikett]
          const [i, en, sv] = step.select;
          await page.locator("[role=dialog] select, .modal select").nth(i).selectOption({ label: locale === "en-US" ? en : sv });
          await page.waitForTimeout(step.wait ?? 1000);
          continue;
        }
        if (step.fill) { await page.fill(step.fill[0], step.fill[1]); await page.waitForTimeout(300); continue; }
        if (step.selector) { await page.locator(step.selector).first().click({ timeout: 8000 }); await page.waitForTimeout(step.wait ?? 2000); continue; }
        const target = locale === "en-US" ? step.text : NAV[step.text] ?? step.text;
        const want = target.toLowerCase();
        let hit;
        for (let t = 0; t < 20 && !hit; t++) {
          const list = await clickables(page);
          hit = list.find((c) => c.text.toLowerCase() === want) ?? list.find((c) => c.text.toLowerCase().startsWith(want));
          if (!hit) await page.waitForTimeout(500);
          if (!hit && t === 19) throw new Error(`hittar inte "${target}" bland: ${list.map((c) => c.text).filter(Boolean).slice(0, 60).join(" | ")}`);
        }
        const idx = hit.i;
        log.push(`${target}→#${idx}`);
        const popup = step.popup ? ctx.waitForEvent("page", { timeout: 10000 }) : null;
        await clickIndex(page, idx);
        if (popup) { page = await popup; await page.waitForLoadState("domcontentloaded"); }
        await page.waitForTimeout(step.wait ?? 2000);
      }
      const tag = locale === "en-US" ? "en" : "sv";
      // Vänta tills vyn laddat klart: inga "Laddar…"-texter och alla bilder hämtade (högst 20 s).
      await page
        .waitForFunction(
          () =>
            !/Laddar|Loading/.test(document.body.innerText) &&
            [...document.images].filter((i) => i.getBoundingClientRect().width > 0).every((i) => i.complete),
          null,
          { timeout: 20000 },
        )
        .catch(() => console.log(r.id, tag, "VARNING: vyn laddade inte klart inom 20 s"));
      const broken = await page.evaluate(() =>
        [...document.images].filter((i) => i.getBoundingClientRect().width > 0 && i.complete && !i.naturalWidth).map((i) => i.src),
      );
      for (const src of broken) console.log(r.id, tag, "VARNING: bild kunde inte hämtas:", src.slice(0, 120));
      await page.screenshot({ path: `${out}/${r.id}.${tag}.png` });
      fs.writeFileSync(`${out}/${r.id}.${tag}.json`, JSON.stringify({ url: new URL(page.url()).pathname, log, texts: await dumpTexts(page) }));
      console.log(r.id, tag, "ok", log.join(" "));
    } catch (e) {
      console.log(r.id, locale, "FEL:", e.message.split("\n")[0].slice(0, 400));
    }
    await ctx.close();
  }
}
await browser.close();
