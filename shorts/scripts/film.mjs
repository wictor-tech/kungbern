#!/usr/bin/env node
// Bygger en flödesfilm: flera steg i sitens flöde, varje steg med problemet överst och LUPNUMBER nederst.
// Användning: node shorts/scripts/film.mjs <film-slug> [--no-video] [--no-captions] [--audio fil.mp3]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBrand, loadClip, bundleHtml, captions, ROOT, OUT_DIR, wordCount } from './lib.mjs';
import { renderVideo } from './render.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const noVideo = flag('--no-video'); const withCaptions = !flag('--no-captions'); const audio = opt('--audio');
const slug = args[0];
if (!slug) { console.error('Användning: node shorts/scripts/film.mjs <film-slug> [--no-video] [--no-captions] [--audio fil.mp3]'); process.exit(1); }

const brand = loadBrand();
const film = JSON.parse(readFileSync(join(ROOT, 'films', slug + '.json'), 'utf8'));
film.slug = film.slug || slug;
// Varje segment pekar på ett klipp (scenen hämtas därifrån) eller direkt på en scen
for (const sg of film.segments) {
  if (sg.clip) { const c = loadClip(sg.clip); sg.scene = sg.scene || c.scene; }
  if (!sg.scene || !existsSync(join(ROOT, 'scenes', sg.scene + '.js'))) throw new Error(`Segment "${sg.label}": scen saknas (${sg.scene})`);
  if (!sg.today || !sg.lup) throw new Error(`Segment "${sg.label}": today/lup-text saknas`);
}
const scenes = [...new Set(film.segments.map((s) => s.scene))];

// Tidslinje (samma logik som film.js)
const HOOK = film.hookDuration || 2.5, OUTRO = brand.timeline.outro || 4.0;
const segs = film.segments.map((sg) => ({ ...sg, duration: sg.duration || film.segmentDuration || 6.5 }));
let acc = HOOK; const segStarts = segs.map((sg) => { const s = acc; acc += sg.duration; return s; });
const outroStart = acc, total = acc + OUTRO;
const beats = [{ key: 'Hook', start: 0, end: HOOK, text: film.voiceover?.hook, screen: film.hook.text.replace(/\n/g, ' / ') + (film.hook.sub ? ' · ' + film.hook.sub : '') }];
segs.forEach((sg, i) => beats.push({ key: sg.label, start: segStarts[i], end: segStarts[i] + sg.duration, text: sg.voiceover, screen: `Idag: ${sg.today} · Med LUPNUMBER: ${sg.lup.replace(/\*/g, '')}` }));
const cta = { ...brand.cta, ...(film.cta || {}) };
beats.push({ key: 'Outro', start: outroStart, end: total, text: film.voiceover?.outro, screen: [cta.question ? cta.question.replace(/\*/g, '') : null, `${cta.label} → ${cta.url}`].filter(Boolean).join(' · ') });

const outDir = join(OUT_DIR, 'film-' + film.slug); mkdirSync(outDir, { recursive: true });
const html = bundleHtml(brand, { ...film, scene: null }, { captions: withCaptions, film: true, scenes });
const htmlPath = join(outDir, 'preview.html'); writeFileSync(htmlPath, html);

const fmt = (s) => { const m = Math.floor(s / 60), sec = s - m * 60; return `${m}:${sec.toFixed(1).padStart(4, '0')}`; };
const srtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
const cues = captions.cuesFromBeats(beats.map((b) => ({ key: b.key, start: b.start, end: b.end, text: b.text })), brand.captions);
writeFileSync(join(outDir, 'undertexter.srt'), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
const voAll = beats.map((b) => b.text).filter(Boolean).join(' ');
writeFileSync(join(outDir, 'MANUS.md'), `# Manus – ${film.title}

- **Format:** ${brand.format.width}×${brand.format.height} (4:5), ${total.toFixed(1)} s, ${brand.format.fps} fps, undertexter inbrända
- **Upplägg:** hook → ${segs.length} steg i sitens flöde (överst: idag, nederst: med LUPNUMBER) → outro
- **Voiceover:** ${wordCount(voAll)} ord (~${(wordCount(voAll) / total).toFixed(1)} ord/s)
- **CTA:** ${cta.question ? cta.question.replace(/\*/g, '') + ' · ' : ''}${cta.label} · ${cta.url}

| Tid | Steg | Text i rutan | Voiceover |
| --- | --- | --- | --- |
${beats.map((b) => `| ${fmt(b.start)}–${fmt(b.end)} | ${b.key} | ${b.screen} | ${b.text || '—'} |`).join('\n')}

## Voiceover

> ${voAll}

## Inläggstext (förslag)

${film.post || `En dag på en logistiksite. Överst: hur det ser ut idag. Nederst: samma dag med LUPNUMBER.\n\n${segs.map((s) => `${s.label}: ${s.today} → ${s.lup.replace(/\*/g, '')}`).join('\n')}\n\n${cta.question ? cta.question.replace(/\*/g, '') : ''} Skriv i kommentarerna.`}
`);
console.log(`▶ film ${film.slug}: ${segs.length} steg, ${total.toFixed(1)} s, voiceover ${wordCount(voAll)} ord`);
if (!noVideo) await renderVideo({ brand, htmlPath, mp4: join(outDir, `${film.slug}${withCaptions ? '' : '-utan-undertexter'}.mp4`), audio, posterFrame: Math.round((segStarts[1] + 3.5) * brand.format.fps), posterPath: join(outDir, 'poster.jpg'), label: 'film' });
console.log(`✓ ${outDir}`);
