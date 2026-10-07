// Skärmbildsinsamling för LUPNUMBER-hjälpen (endast läsning).
//
// Kör från repo-roten när nätverket släpper igenom *.lupnumber.com:
//   npm i --no-save playwright@1.56.1
//   LUP_DEMO_USER=... LUP_DEMO_PASSWORD=... node help/research/capture/capture.mjs
//
// Säkerhet: alla anrop till lupnumber-domäner som inte är GET/HEAD/OPTIONS avbryts,
// utom själva inloggningen (en enda POST innan vi är inloggade). Inga formulär sparas,
// inga SMS skickas, inga grindar öppnas. Dialoger stängs med Close/Cancel/Escape.

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('help/research/screens');
const LOG = path.resolve('help/research/capture/capture-log.json');
const VIEWPORT = { width: 1440, height: 900 };
const LUP = /(^|\.)lupnumber\.com$/;
const log = [];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-GB' });

let loginWindowOpen = false;
await context.route('**/*', (route) => {
  const req = route.request();
  const host = new URL(req.url()).hostname;
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method());
  if (!LUP.test(host) || safe) return route.continue();
  if (loginWindowOpen) return route.continue();
  log.push({ blocked: req.method(), url: req.url() });
  return route.abort('blockedbyclient');
});

const page = await context.newPage();

async function shot(name, note = '') {
  await page.waitForTimeout(800);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const buttons = await page
    .locator('button, [role=button], a.btn')
    .evaluateAll((els) => [...new Set(els.map((e) => e.innerText.trim()).filter(Boolean))]);
  log.push({ name, url: page.url(), title: await page.title(), note, buttons });
  console.log('📸', name, page.url());
}

async function closeDialog() {
  for (const label of ['Close', 'Cancel', 'Stäng', 'Avbryt']) {
    const btn = page.getByRole('button', { name: label, exact: true }).last();
    if (await btn.isVisible().catch(() => false)) return btn.click();
  }
  await page.keyboard.press('Escape');
}

async function openAndShoot(name, label, isDialog) {
  try {
    const target = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label })).or(page.getByRole('tab', { name: label })).first();
    await target.click({ timeout: 5000 });
    await shot(name);
    if (isDialog) await closeDialog();
  } catch (e) {
    log.push({ name, error: String(e).split('\n')[0] });
  }
}

// 1. Varumärke: startsidan + färger/typsnitt från beräknade stilar
await page.goto('https://www.lupnumber.com', { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT, 'brand-lupnumber-com-1440.png'), fullPage: true });
const brand = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { sel, color: s.color, background: s.backgroundColor, font: s.fontFamily, size: s.fontSize, weight: s.fontWeight };
  };
  const vars = {};
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) if (r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--')) vars[p] = r.style.getPropertyValue(p).trim();
    } catch {}
  }
  const logos = [...document.querySelectorAll('header img, header svg, a[class*=logo] img, img[alt*=LUP i], link[rel*=icon]')].map((e) => e.src || e.href || e.outerHTML.slice(0, 300));
  return { vars, logos, body: pick('body'), h1: pick('h1'), h2: pick('h2'), a: pick('a'), button: pick('a[class*=button], .button, button'), header: pick('header, nav') };
});
await writeFile(path.resolve('help/research/capture/brand-raw.json'), JSON.stringify(brand, null, 2));

// 2. Produkten
await page.goto('https://app.lupnumber.com/site', { waitUntil: 'networkidle' });
await shot('app-01-entry', 'första sidan efter /site');

const user = process.env.LUP_DEMO_USER;
const pass = process.env.LUP_DEMO_PASSWORD;
const needsLogin = await page.locator('input[type=password]').isVisible().catch(() => false);
if (needsLogin) {
  await shot('app-00-login');
  if (!user || !pass) {
    console.log('Inloggning krävs men LUP_DEMO_USER/LUP_DEMO_PASSWORD saknas – stannar här.');
    await finish();
  }
  await page.locator('input[type=email], input[name*=user i], input[name*=email i], input[type=text]').first().fill(user);
  await page.locator('input[type=password]').fill(pass);
  loginWindowOpen = true;
  await page.locator('button[type=submit], input[type=submit]').first().click();
  await page.waitForLoadState('networkidle');
  loginWindowOpen = false;
  await page.goto('https://app.lupnumber.com/site', { waitUntil: 'networkidle' });
  await shot('site-00-after-login');
}

// Site-vyer (flikar) och dialoger
for (const [name, label] of [['site-board', 'Board'], ['site-list', 'List'], ['site-matrix', 'Matrix'], ['site-week', 'Week']]) {
  await openAndShoot(name, label, false);
}
for (const [name, label] of [['site-dialog-add', 'Add'], ['site-dialog-sms-alarm', 'SMS Alarm'], ['site-dialog-settings', 'Settings'], ['site-dialog-allowed-vehicles', 'Allowed vehicles']]) {
  await openAndShoot(name, label, true);
}

// Location Admin
await openAndShoot('admin-01-start', 'Location Admin', false);
await openAndShoot('admin-02-location-menu', 'DEMO LUP', false);
const adminPages = [
  'Edit location information', 'Image management', 'Slideshow settings', 'Booking settings',
  'Capacity & timeslots', 'Manage contacts', 'Notification settings', 'SMS template overrides', 'Manage gates',
];
for (const label of adminPages) {
  const slug = label.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-');
  const menuUrl = page.url();
  await openAndShoot(`admin-${slug}`, label, false);
  await page.goto(menuUrl, { waitUntil: 'networkidle' }).catch(() => {});
}

await finish();

async function finish() {
  await writeFile(LOG, JSON.stringify(log, null, 2));
  await browser.close();
  process.exit(0);
}
