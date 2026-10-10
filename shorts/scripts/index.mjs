#!/usr/bin/env node
// Skriver shorts/out/index.html: en förhandsvisning med spelare för alla renderade filmer, klipp, varianter, karuseller, overlays och material.
import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OUT_DIR, loadBrand } from './lib.mjs';
const brand = loadBrand();
const dirs = readdirSync(OUT_DIR).filter((d) => statSync(join(OUT_DIR, d)).isDirectory() && !d.startsWith('.')).sort((a, b) => (a.startsWith('hero') ? -1 : b.startsWith('hero') ? 1 : a.startsWith('film') ? -1 : b.startsWith('film') ? 1 : a.localeCompare(b)));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const section = (d) => {
  const p = join(OUT_DIR, d); const files = readdirSync(p).filter((f) => !f.startsWith('.'));
  const mp4 = files.filter((f) => f.endsWith('.mp4')).sort();
  const other = files.filter((f) => /\.(pdf|srt|md|json|webm|mov|png|jpg|m4a|wav|html)$/.test(f) && !/^carousel-\d\.png$/.test(f) && f !== 'preview.html').sort();
  const title = d.startsWith('hero-') ? 'Hero: ' + d.slice(5) : d.startsWith('film-') ? 'Flödesfilm: ' + d.slice(5) : d === 'material' ? 'Material (PDF)' : 'Klipp ' + d;
  return `<section><h2>${esc(title)}</h2>
  <div class="videos">${mp4.map((f) => `<figure><video controls preload="metadata" playsinline src="${d}/${f}"></video><figcaption>${esc(f)}</figcaption></figure>`).join('')}</div>
  <p class="files">${other.map((f) => `<a href="${d}/${f}">${esc(f)}</a>`).join(' · ')}${existsSync(join(p, 'preview.html')) ? ` · <a href="${d}/preview.html">preview.html (scrubba)</a>` : ''}</p></section>`;
};
const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>LUPNUMBER – renderingar</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#F5FAFE;color:#334155;margin:0;padding:32px}h1{color:#0C4A6E;letter-spacing:-.02em}h1 b{color:#0EA5E9}h2{color:#0C4A6E;font-size:20px;margin:36px 0 10px}
.videos{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:270px}video{width:270px;aspect-ratio:4/5;background:#fff;border:2px solid #BAE6FD;border-radius:16px}figcaption{font-size:12px;color:#64748B;margin-top:4px;word-break:break-all}
.files a{color:#0EA5E9;font-size:13px;text-decoration:none}.files{line-height:1.8}.note{background:#fff;border:2px solid #BAE6FD;border-radius:14px;padding:12px 16px;max-width:900px}</style></head>
<body><h1><b>LUP</b>NUMBER · alla renderingar</h1>
<p class="note">Öppna lokalt (filen ligger i <code>shorts/out/</code>). Ljudet i hero- och LinkedIn-filmen är en syntetiserad prototyp (temp-musik + effekter). Gränssnitten i bild är konceptuella visualiseringar, inte skärmdumpar av produkten.</p>
${dirs.map(section).join('\n')}
<p class="files">Genererad ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${brand.company}</p></body></html>`;
writeFileSync(join(OUT_DIR, 'index.html'), html);
console.log('Skrev shorts/out/index.html (' + dirs.length + ' sektioner)');
