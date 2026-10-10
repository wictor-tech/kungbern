// Delad renderare: Playwright (lokal eller global) + FFmpeg. Används av build.mjs (klipp) och film.mjs (flödesfilm).
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { cpus } from 'node:os';
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

// Renderar alla frames till mp4 (H.264, yuv420p). Flera arbetare (sidor) delar på bildrutorna och delarna sätts ihop utan omkodning.
export async function renderVideo({ brand, htmlPath, mp4, audio = null, posterFrame = null, posterPath = null, label = '', workers = null }) {
  const { fps, width, height } = brand.format;
  const { chromium } = loadPlaywright();
  const n = workers || Math.max(1, Math.min(4, Math.floor(cpus().length / 2)));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'] });
  const t0 = Date.now();
  try {
    const first = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await first.goto(pathToFileURL(htmlPath).href); await first.evaluate(() => document.fonts.ready);
    const frames = await first.evaluate(() => LUP.timeline.frames);
    await first.close();
    const per = Math.ceil(frames / n);
    const parts = [];
    const jobs = Array.from({ length: n }, (_, w) => [w * per, Math.min(frames, (w + 1) * per)]).filter(([a, b]) => b > a);
    await Promise.all(jobs.map(async ([from, to], w) => {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(pathToFileURL(htmlPath).href); await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.__setRenderMode());
      const cdp = await page.context().newCDPSession(page);
      const part = jobs.length === 1 ? mp4 : join(dirname(mp4), `.${basename(mp4)}.part${w}.mp4`);
      parts[w] = part;
      const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-r', String(fps), '-movflags', '+faststart', part], { stdio: ['pipe', 'inherit', 'inherit'] });
      const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
      const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
      for (let f = from; f < to; f++) {
        await seekFrame(page, f);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
        const buf = Buffer.from(data, 'base64');
        if (posterPath && f === posterFrame) writeFileSync(posterPath, buf);
        await write(buf);
        if (w === 0 && f % 90 === 0) process.stdout.write(`  ${label} frame ${f}/${to} (${jobs.length} arbetare)\r`);
      }
      ff.stdin.end(); await ffDone; await page.close();
      if (errors.length) throw new Error('Fel under rendering: ' + errors.join(' | '));
    }));
    if (jobs.length > 1 || audio) {
      const list = join(dirname(mp4), `.${basename(mp4)}.txt`);
      writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
      if (audio) args.push('-i', audio, '-af', 'apad', '-shortest', '-c:a', 'aac', '-b:a', '160k');
      args.push('-c:v', 'copy', '-movflags', '+faststart', mp4);
      await new Promise((res, rej) => spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] }).on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg concat exit ' + c)))));
      try { unlinkSync(list); } catch {}
      for (const p of parts) if (p !== mp4) { try { unlinkSync(p); } catch {} }
    }
    console.log(`  ${frames} frames på ${((Date.now() - t0) / 1000).toFixed(1)} s → ${mp4}`);
    return mp4;
  } finally { await browser.close(); }
}

// Overlay: hook-lagret (badge + hook) med transparent bakgrund → WebM (VP9 alfa) + ProRes 4444 .mov + en PNG.
export async function renderOverlay({ brand, htmlPath, outBase, seconds = 3, label = '', variant = null }) {
  const { fps } = brand.format;
  const frames = Math.round(seconds * fps);
  return withPage(brand, htmlPath, async (page, cdp) => {
    await page.evaluate((v) => window.__setOverlayMode(v), variant);
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const webm = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-auto-alt-ref', '0', '-r', String(fps), outBase + '.webm'], { stdio: ['pipe', 'inherit', 'inherit'] });
    const mov = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-r', String(fps), outBase + '.mov'], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = [webm, mov].map((ff) => new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))))));
    const write = (ff, buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
    for (let f = 0; f < frames; f++) {
      await seekFrame(page, f);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(data, 'base64');
      if (f === Math.round(1.2 * fps)) writeFileSync(outBase + '.png', buf);
      await Promise.all([write(webm, buf), write(mov, buf)]);
      if (f % 30 === 0) process.stdout.write(`  ${label} overlay ${f}/${frames}\r`);
    }
    webm.stdin.end(); mov.stdin.end(); await Promise.all(done);
    console.log(`  overlay → ${outBase}.webm / .mov / .png`);
  });
}
