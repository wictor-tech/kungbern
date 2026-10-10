#!/usr/bin/env node
// Skapar det material som två CTA:er lovar: checklistan för säkerhetsgenomgång vid grinden (klipp 04) och mallen för närvarolista vid larm (klipp 09).
// Generiska, branschneutrala dokument i LUPNUMBER-grafik. Inga påståenden om produktfunktioner. Användning: node shorts/scripts/material.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBrand, BRAND_DIR, OUT_DIR } from './lib.mjs';
import { loadPlaywright } from './render.mjs';

const brand = loadBrand();
const outDir = join(OUT_DIR, 'material'); mkdirSync(outDir, { recursive: true });
const fonts = pathToFileURL(join(BRAND_DIR, 'fonts')).href;
const css = `
@font-face { font-family: Inter; font-weight: 600; src: url("${fonts}/Inter-SemiBold.otf"); } @font-face { font-family: Inter; font-weight: 700; src: url("${fonts}/Inter-Bold.otf"); } @font-face { font-family: Inter; font-weight: 800; src: url("${fonts}/Inter-ExtraBold.otf"); } @font-face { font-family: Inter; font-weight: 500; src: url("${fonts}/Inter-Medium.otf"); }
@page { size: A4; margin: 18mm 16mm 16mm; }
body { font-family: Inter, system-ui, sans-serif; color: #334155; margin: 0; font-size: 11pt; }
.wm { font-weight: 800; font-size: 20pt; letter-spacing: -0.03em; color: #0C4A6E; } .wm b { color: #0EA5E9; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #BAE6FD; padding-bottom: 8px; margin-bottom: 14px; }
.tag { color: #64748B; font-weight: 700; font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; }
h1 { color: #0C4A6E; font-size: 22pt; margin: 6px 0 4px; letter-spacing: -0.02em; } .lead { color: #64748B; font-weight: 500; margin: 0 0 14px; }
h2 { color: #0C4A6E; font-size: 12.5pt; margin: 14px 0 6px; display: flex; align-items: center; gap: 8px; }
h2 i { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #0EA5E9; color: #fff; font-style: normal; font-weight: 800; font-size: 10pt; align-items: center; justify-content: center; }
.item { display: flex; gap: 10px; align-items: flex-start; padding: 5px 0; border-bottom: 1px solid #E0F2FE; }
.box { display: inline-block; width: 14px; height: 14px; border: 2px solid #BAE6FD; border-radius: 4px; flex: 0 0 auto; margin-top: 2px; }
.item small { color: #64748B; display: block; }
.meta { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin: 10px 0 14px; }
.meta div { border: 2px solid #BAE6FD; border-radius: 8px; padding: 8px 10px; min-height: 34px; } .meta label { display: block; color: #64748B; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
table { width: 100%; border-collapse: collapse; } th { text-align: left; color: #64748B; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; padding: 6px 8px; border-bottom: 2px solid #BAE6FD; }
td { padding: 9px 8px; border-bottom: 1px solid #E0F2FE; height: 18px; } td.c { text-align: center; } td .box { margin: 0 auto; }
.foot { margin-top: 14px; color: #64748B; font-size: 8.5pt; display: flex; justify-content: space-between; border-top: 2px solid #BAE6FD; padding-top: 8px; }
.note { background: #F0F9FF; border: 2px solid #E0F2FE; border-radius: 8px; padding: 8px 12px; color: #334155; font-size: 9.5pt; margin: 10px 0; }
`;
const head = (tag) => `<div class="top"><span class="wm"><b>LUP</b>NUMBER</span><span class="tag">${tag}</span></div>`;
const foot = `<div class="foot"><span>${brand.company} · ${brand.cta.url}</span><span>Fri att använda och anpassa för er site. Ersätter inte er egen riskbedömning.</span></div>`;
const item = (t, s) => `<div class="item"><span class="box"></span><div>${t}${s ? `<small>${s}</small>` : ''}</div></div>`;

const checklist = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>${css}</style></head><body>
${head('Checklista · vid grinden')}
<h1>Säkerhetsgenomgång vid grinden</h1>
<p class="lead">För chaufförer och besökare som kör in på området. Gå igenom punkterna i ordning. Kvittens innan infart.</p>
<div class="meta"><div><label>Site</label></div><div><label>Datum</label></div><div><label>Reg.nr</label></div><div><label>Språk</label></div></div>
<h2><i>1</i> Innan infart</h2>
${item('Identitet och ärende bekräftade', 'Reg.nr, transportör, bokning eller mottagare')}
${item('Instruktionerna finns på ett språk chauffören förstår', 'Sv / En / Pl / De / … – fråga, anta inte')}
${item('Kontaktväg under besöket', 'Telefonnummer till vakt eller skiftledare')}
<h2><i>2</i> Personlig skyddsutrustning</h2>
${item('Varselväst på hela tiden utanför hytten')}
${item('Skyddsskor', 'Hjälm där det är skyltat')}
${item('Mobil används inte vid lastning, lossning eller backning')}
<h2><i>3</i> På området</h2>
${item('Max 20 km/h, följ skyltad körväg')}
${item('Stanna vid anvisad port och vänta på klartecken')}
${item('Backning endast med signalman eller enligt anvisning')}
${item('Rökning endast på anvisad plats')}
${item('Lämna aldrig fordonet olåst eller med motorn igång vid porten')}
<h2><i>4</i> Om något händer</h2>
${item('Larm: lämna fordonet, gå till samlingsplatsen', 'Visa var samlingsplatsen är – peka på kartan')}
${item('Rapportera tillbud och skador innan utfart')}
<h2><i>5</i> Kvittens</h2>
${item('Chauffören har förstått och bekräftat punkterna ovan', 'Signatur eller digital kvittens, tid och namn')}
<div class="note">Tips: skriv ut listan på de språk ni oftast möter och sätt den på samma ställe varje dag. En checklista som ingen hittar är ingen checklista.</div>
${foot}
</body></html>`;

const rows = Array.from({ length: 18 }, () => `<tr><td></td><td></td><td></td><td></td><td class="c"><span class="box"></span></td><td></td></tr>`).join('');
const template = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>${css}</style></head><body>
${head('Mall · närvarolista vid larm')}
<h1>Närvarolista vid larm</h1>
<p class="lead">Vem är på området just nu? Fylls i vid incheckning under dagen och används för inräkning vid samlingsplatsen när larmet går.</p>
<div class="meta"><div><label>Site / område</label></div><div><label>Datum</label></div><div><label>Samlingsplats</label></div><div><label>Ansvarig för inräkning</label></div></div>
<table><thead><tr><th style="width:26%">Namn / reg.nr</th><th style="width:20%">Företag</th><th style="width:12%">In kl</th><th style="width:12%">Ut kl</th><th style="width:10%">Inräknad</th><th>Anmärkning</th></tr></thead><tbody>${rows}</tbody></table>
<div class="note">Vid larm: ta med listan till samlingsplatsen, bocka av varje person som är inräknad, rapportera saknade till räddningsledaren. Chaufförer som är inne på området räknas på samma sätt som egen personal.</div>
${foot}
</body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [name, html] of [['checklista-sakerhetsgenomgang-vid-grinden', checklist], ['mall-narvarolista-vid-larm', template]]) {
  const src = join(outDir, name + '.html'); writeFileSync(src, html);
  await page.goto(pathToFileURL(src).href); await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(outDir, name + '.pdf'), format: 'A4', printBackground: true });
  console.log('✓', name + '.pdf');
}
await browser.close();
