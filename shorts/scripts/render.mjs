// Delad renderare: Playwright (lokal eller global) + FFmpeg. Används av build.mjs (klipp) och film.mjs (flödesfilm).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try { return require('playwright'); } catch {}
  try { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(join(g, 'playwright')); } catch {}
  throw new Error('Playwright saknas. Installera: cd shorts && npm install   (eller globalt: npm i -g playwright && npx playwright install chromium)');
}

// Öppnar en bundlad sida i render-läge och kör fn(page, cdp). Stänger alltid webbläsaren.
export async function withPage(brand, htmlPath, fn) {
  const { chromium } = loadPlaywright();
  const { width, height } = brand.format;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.__setRenderMode());
    if (errors.length) throw new Error('Fel i sidan: ' + errors.join(' | '));
    const cdp = await page.context().newCDPSession(page);
    return await fn(page, cdp, errors);
  } finally { await browser.close(); }
}

export const seekFrame = (page, f) => page.evaluate((fr) => new Promise((r) => { window.__seek(fr); requestAnimationFrame(() => r()); }), f);

// Renderar alla frames till mp4 (H.264, yuv420p). posterFrame → poster.jpg i posterPath.
export async function renderVideo({ brand, htmlPath, mp4, audio = null, posterFrame = null, posterPath = null, label = '' }) {
  const { fps } = brand.format;
  return withPage(brand, htmlPath, async (page, cdp, errors) => {
    const frames = await page.evaluate(() => LUP.timeline.frames);
    const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (audio) ffArgs.push('-i', audio);
    ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(fps), '-movflags', '+faststart');
    if (audio) ffArgs.push('-af', 'apad', '-shortest', '-c:a', 'aac', '-b:a', '160k');
    ffArgs.push(mp4);
    const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
    const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      await seekFrame(page, f);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
      const buf = Buffer.from(data, 'base64');
      if (posterPath && f === posterFrame) writeFileSync(posterPath, buf);
      await write(buf);
      if (f % 90 === 0) process.stdout.write(`  ${label} frame ${f}/${frames}\r`);
    }
    ff.stdin.end();
    await ffDone;
    if (errors.length) throw new Error('Fel under rendering: ' + errors.join(' | '));
    console.log(`  ${frames} frames på ${((Date.now() - t0) / 1000).toFixed(1)} s → ${mp4}`);
    return mp4;
  });
}
