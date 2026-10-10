#!/usr/bin/env node
// Snapshot-test: fångar nyckelrutor per klipp som grova gråskale-miniatyrer och jämför mot shorts/test/snapshots.json.
// Fångar oavsiktlig malldrift när någon ändrar en scen eller brand/. Kör med --update för att godkänna nya bilder.
// Användning: node shorts/scripts/test.mjs [slug|all] [--update]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { loadBrand, loadClip, listClips, bundleHtml, phases, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const update = args.includes('--update');
const target = args.find((a) => !a.startsWith('--')) || 'all';
const SNAP = join(ROOT, 'test', 'snapshots.json');
const GRID = { cols: 20, rows: 25 };
const TOLERANCE = 6; // medelavvikelse per cell (0–255)

const require = createRequire(import.meta.url);
const pw = (() => { try { return require('playwright'); } catch {} const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(join(g, 'playwright')); })();

const keyTimes = (brand) => { const { byKey } = phases(brand); return [1.0, byKey.hook.start + 1.0, byKey.problem.start + 3.6, byKey.solution.start + 1.2, byKey.solution.start + 4.8, byKey.outro.start + 2.2]; };

async function thumbs(brand, clip) {
  const html = bundleHtml(brand, clip);
  const tmp = join(ROOT, 'out', '.test'); mkdirSync(tmp, { recursive: true });
  const file = join(tmp, clip.slug + '.html'); writeFileSync(file, html);
  const browser = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: brand.format.width, height: brand.format.height } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__setRenderMode());
  const out = {};
  for (const t of keyTimes(brand)) {
    const frame = Math.round(t * brand.format.fps);
    await page.evaluate((f) => new Promise((r) => { window.__seek(f); requestAnimationFrame(() => r()); }), frame);
    const b64 = (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
    out[t.toFixed(2)] = await page.evaluate(async ({ b64, cols, rows }) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, cols, rows);
      const d = ctx.getImageData(0, 0, cols, rows).data; const g = [];
      for (let i = 0; i < d.length; i += 4) g.push(Math.round((d[i] + d[i + 1] + d[i + 2]) / 3));
      return g;
    }, { b64, ...GRID });
  }
  await browser.close();
  return out;
}

const brand = loadBrand();
const snaps = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : {};
let failed = 0;
for (const slug of target === 'all' ? listClips() : [target]) {
  const clip = loadClip(slug);
  const now = await thumbs(brand, clip);
  const prev = snaps[slug];
  if (!prev || update) { snaps[slug] = now; console.log(`${prev ? '↻' : '＋'} ${slug}: snapshot ${prev ? 'uppdaterad' : 'skapad'}`); continue; }
  for (const [t, g] of Object.entries(now)) {
    const ref = prev[t];
    if (!ref) { console.log(`✗ ${slug} @${t}s: saknar referens (kör --update)`); failed++; continue; }
    const diff = g.reduce((a, v, i) => a + Math.abs(v - ref[i]), 0) / g.length;
    if (diff > TOLERANCE) { console.log(`✗ ${slug} @${t}s: avvikelse ${diff.toFixed(1)} > ${TOLERANCE}`); failed++; }
    else console.log(`✓ ${slug} @${t}s (${diff.toFixed(1)})`);
  }
}
mkdirSync(join(ROOT, 'test'), { recursive: true });
if (update || Object.keys(snaps).length) writeFileSync(SNAP, JSON.stringify(snaps));
if (failed) { console.error(`\n${failed} avvikelse(r). Är ändringen avsiktlig: node shorts/scripts/test.mjs --update`); process.exit(1); }
console.log('\nAlla snapshots OK.');
