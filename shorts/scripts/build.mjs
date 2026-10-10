#!/usr/bin/env node
// Bygger ett klipp: preview.html + MANUS.md + undertexter.srt + poster.jpg + carousel.pdf + <slug>.mp4 (undertexter inbrända)
// Användning: node shorts/scripts/build.mjs <slug|all> [--audio fil.mp3] [--no-video] [--no-captions] [--no-carousel] [--variant b | --all-variants]
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBrand, loadClip, listClips, bundleHtml, manusMarkdown, srt, voWords, applyVariant, phases, OUT_DIR } from './lib.mjs';
import { renderVideo, withPage, seekFrame } from './render.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const noVideo = flag('--no-video');
const withCaptions = !flag('--no-captions');
const noCarousel = flag('--no-carousel');
const allVariants = flag('--all-variants');
const variantKey = opt('--variant');
const audio = opt('--audio');
const target = args[0];
if (!target) { console.error('Användning: node shorts/scripts/build.mjs <slug|all> [--audio fil.mp3] [--no-video] [--no-captions] [--no-carousel] [--variant b | --all-variants]'); process.exit(1); }

// Poster: mitt i lösningsfasen (flödet synligt)
const LUPposter = (b) => phases(b).byKey.solution.end - 0.8;

// Karusell: fyra sidor (hook, problem, lösning, outro) som PNG + en PDF att posta som dokument.
async function renderCarousel(brand, clip, outDir) {
  const { width, height, fps } = brand.format;
  const { byKey } = phases(brand);
  const htmlPath = join(outDir, '.carousel-src.html');
  writeFileSync(htmlPath, bundleHtml(brand, clip, { captions: false }));
  const times = [byKey.hook.start + 1.2, byKey.problem.start + 3.6, byKey.solution.start + 4.6, byKey.outro.start + 3.0];
  await withPage(brand, htmlPath, async (page) => {
    const pngs = [];
    for (let i = 0; i < times.length; i++) {
      await seekFrame(page, Math.round(times[i] * fps));
      const f = join(outDir, `carousel-${i + 1}.png`);
      writeFileSync(f, await page.screenshot({ type: 'png' }));
      pngs.push(f);
    }
    const pdfHtml = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}px ${height}px;margin:0}html,body{margin:0;padding:0}img{display:block;width:${width}px;height:${height}px;page-break-after:always}img:last-child{page-break-after:auto}</style></head><body>${pngs.map((p) => `<img src="${pathToFileURL(p).href}">`).join('')}</body></html>`;
    const pdfSrc = join(outDir, '.carousel-pdf.html'); writeFileSync(pdfSrc, pdfHtml);
    await page.goto(pathToFileURL(pdfSrc).href); await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await page.pdf({ path: join(outDir, 'carousel.pdf'), width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true });
    for (const f of [htmlPath, pdfSrc]) { try { unlinkSync(f); } catch {} }
  });
}

async function build(slug) {
  const brand = loadBrand();
  const base = loadClip(slug);
  const outDir = join(OUT_DIR, base.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'MANUS.md'), manusMarkdown(brand, base));
  writeFileSync(join(outDir, 'undertexter.srt'), srt(brand, base));
  const words = voWords(base);
  console.log(`▶ ${base.slug}: manus skrivet (voiceover ${words} ord${words > brand.voiceoverMaxWords ? ' – ⚠️ över max ' + brand.voiceoverMaxWords : ''})`);
  if (audio && !existsSync(audio)) throw new Error('Ljudfil saknas: ' + audio);
  const keys = allVariants ? [null, ...Object.keys(base.variants || {})] : [variantKey || null];
  for (const key of keys) {
    const clip = applyVariant(base, key);
    const suffix = (key ? `-hook-${key}` : '') + (withCaptions ? '' : '-utan-undertexter');
    const htmlPath = join(outDir, key ? `preview-hook-${key}.html` : 'preview.html');
    writeFileSync(htmlPath, bundleHtml(brand, clip, { captions: withCaptions }));
    if (!noVideo) await renderVideo({ brand, htmlPath, mp4: join(outDir, `${base.slug}${suffix}.mp4`), audio, posterFrame: key ? null : Math.round(LUPposter(brand) * brand.format.fps), posterPath: key ? null : join(outDir, 'poster.jpg'), label: base.slug + (key ? '-' + key : '') });
  }
  if (!noVideo && !noCarousel) { await renderCarousel(brand, base, outDir); console.log('  karusell: carousel.pdf + carousel-1..4.png'); }
  console.log(`✓ ${outDir}`);
}

const slugs = target === 'all' ? listClips() : [target];
for (const s of slugs) await build(s);
