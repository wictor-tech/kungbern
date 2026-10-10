#!/usr/bin/env node
// QA-verktyg: renderar enskilda bildrutor ur en preview.html till PNG (+ kontaktark).
// Användning: node shorts/scripts/frames.mjs <preview.html> --out <dir> [--times 0,1.5,7.2] [--sheet sheet.jpg] [--cols 4] [--scale 0.3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadBrand } from './lib.mjs';
import { withPage, seekFrame } from './render.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const outDir = opt('--out', 'frames'); const times = (opt('--times', '0') || '0').split(',').map(Number); const sheet = opt('--sheet'); const cols = +opt('--cols', 4); const scale = +opt('--scale', 0.3);
const htmlPath = args[0]; if (!htmlPath) { console.error('ange preview.html'); process.exit(1); }
const brand = loadBrand(); mkdirSync(outDir, { recursive: true });
const files = await withPage(brand, htmlPath, async (page, cdp) => {
  const out = [];
  for (const tm of times) {
    const f = Math.round(tm * brand.format.fps); await seekFrame(page, f);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p = join(outDir, `f${String(tm).replace('.', '_')}.png`); writeFileSync(p, Buffer.from(data, 'base64')); out.push(p);
  }
  return out;
});
if (sheet) {
  const n = files.length, rows = Math.ceil(n / cols);
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=iw*${scale}:-1,drawtext=text='${times[i]}s':x=10:y=10:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, i) => `${(i % cols)}_${Math.floor(i / cols)}`).map((s) => s.split('_').map((v, k) => (k ? `h0` : `w0`).replace(/[wh]0/, (m) => (v === '0' ? '0' : Array(+v).fill(m[0] + '0').join('+')))).join('_')).join('|')}:fill=white[o]`, '-map', '[o]', '-q:v', '3', sheet]);
  if (r.status !== 0) console.error(String(r.stderr)); else console.log('kontaktark →', sheet);
}
console.log(files.length + ' bildrutor →', outDir);
