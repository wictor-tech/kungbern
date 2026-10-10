#!/usr/bin/env node
// Bygger ett klipp: preview.html + MANUS.md + undertexter.srt + poster.jpg + <slug>.mp4
// Användning: node shorts/scripts/build.mjs <slug|all> [--audio fil.mp3] [--no-video] [--square]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { loadBrand, loadClip, listClips, bundleHtml, manusMarkdown, srt, voWords, OUT_DIR } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const noVideo = flag('--no-video');
const square = flag('--square');
const audio = opt('--audio');
const target = args[0];
if (!target) { console.error('Användning: node shorts/scripts/build.mjs <slug|all> [--audio fil.mp3] [--no-video] [--square]'); process.exit(1); }

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(join(g, 'playwright')); } catch {}
  throw new Error('Playwright saknas. Installera: npm i -D playwright && npx playwright install chromium (eller globalt: npm i -g playwright)');
}

async function renderVideo(brand, clip, html, outDir) {
  const { chromium } = loadPlaywright();
  const { width, height, fps } = brand.format;
  const htmlPath = join(outDir, 'preview.html');
  const mp4 = join(outDir, `${clip.slug}.mp4`);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__setRenderMode());
  const frames = await page.evaluate(() => LUP.timeline.frames);
  const cdp = await page.context().newCDPSession(page);

  const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
  if (audio) ffArgs.push('-i', audio);
  ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(fps), '-movflags', '+faststart');
  if (audio) ffArgs.push('-af', 'apad', '-shortest', '-c:a', 'aac', '-b:a', '160k');
  ffArgs.push(mp4);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));

  const posterFrame = Math.round((LUPposter(brand)) * fps);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    await page.evaluate((fr) => new Promise((r) => { window.__seek(fr); requestAnimationFrame(() => r()); }), f);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
    const buf = Buffer.from(data, 'base64');
    if (f === posterFrame) writeFileSync(join(outDir, 'poster.jpg'), buf);
    await write(buf);
    if (f % 60 === 0) process.stdout.write(`  frame ${f}/${frames}\r`);
  }
  ff.stdin.end();
  await ffDone;
  await browser.close();
  console.log(`  ${frames} frames på ${((Date.now() - t0) / 1000).toFixed(1)} s → ${mp4}`);
  return mp4;
}
// Poster: mitt i lösningsfasen (flödet synligt)
const LUPposter = (b) => b.timeline.intro + b.timeline.hook + b.timeline.problem + b.timeline.solution - 0.8;

async function build(slug) {
  const brand = loadBrand();
  if (square) { brand.format = { ...brand.format, height: brand.format.width }; }
  const clip = loadClip(slug);
  const outDir = join(OUT_DIR, clip.slug);
  mkdirSync(outDir, { recursive: true });
  const html = bundleHtml(brand, clip);
  writeFileSync(join(outDir, 'preview.html'), html);
  writeFileSync(join(outDir, 'MANUS.md'), manusMarkdown(brand, clip));
  writeFileSync(join(outDir, 'undertexter.srt'), srt(brand, clip));
  const words = voWords(clip);
  console.log(`▶ ${clip.slug}: manus + preview skrivna (voiceover ${words} ord${words > brand.voiceoverMaxWords ? ' – ⚠️ över max ' + brand.voiceoverMaxWords : ''})`);
  if (audio && !existsSync(audio)) throw new Error('Ljudfil saknas: ' + audio);
  if (!noVideo) await renderVideo(brand, clip, html, outDir);
  console.log(`✓ ${outDir}`);
}

const slugs = target === 'all' ? listClips() : [target];
for (const s of slugs) await build(s);
