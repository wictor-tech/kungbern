#!/usr/bin/env node
// Bygger hero-filmen (eller LinkedIn-klippet): bundlar, renderar med ljudmix (syntetiserad temp-musik + effekter), skriver manus/undertexter.
// Användning: node shorts/scripts/hero.mjs <film-slug> [--no-video] [--no-captions] [--no-audio] [--vo-sv fil.wav] [--workers N]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadBrand, bundleHtml, captions, ROOT, OUT_DIR, wordCount } from './lib.mjs';
import { renderVideo, withPage, seekFrame } from './render.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const noVideo = flag('--no-video'), withCaptions = !flag('--no-captions'), noAudio = flag('--no-audio');
const voSv = opt('--vo-sv'); const workersOpt = opt('--workers'); const workers = workersOpt ? parseInt(workersOpt, 10) : null;
const slug = args[0];
if (!slug) { console.error('Användning: node shorts/scripts/hero.mjs <film-slug> [--no-video] [--no-captions] [--no-audio] [--vo-sv fil.wav] [--workers N]'); process.exit(1); }

const brand = loadBrand();
const film = JSON.parse(readFileSync(join(ROOT, 'films', slug + '.json'), 'utf8')); film.slug = film.slug || slug;
const total = film.beats.reduce((a, b) => a + b.duration, 0);
const outDir = join(OUT_DIR, 'hero-' + film.slug); mkdirSync(outDir, { recursive: true });
const html = bundleHtml(brand, { ...film, scene: null }, { captions: withCaptions, hero: true, scenes: [] });
const htmlPath = join(outDir, 'preview.html'); writeFileSync(htmlPath, html);

// Tidslinje + ljudhändelser ur sidan
const tl = await withPage(brand, htmlPath, async (page) => page.evaluate(() => LUP.timeline));
writeFileSync(join(outDir, 'events.json'), JSON.stringify(tl.events, null, 2));
const beats = tl.beats.map((b, i) => ({ ...b, caption: film.beats[i].caption, en: film.beats[i].en }));

const fmt = (s) => { const m = Math.floor(s / 60), sec = s - m * 60; return `${m}:${sec.toFixed(1).padStart(4, '0')}`; };
const srtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
const cues = captions.cuesFromBeats(beats.filter((b) => b.caption).map((b) => ({ key: b.id, start: b.start, end: b.end, text: b.caption })), brand.captions);
writeFileSync(join(outDir, 'undertexter-sv.srt'), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
const cuesEn = captions.cuesFromBeats(beats.filter((b) => b.en).map((b) => ({ key: b.id, start: b.start, end: b.end, text: b.en })), brand.captions);
writeFileSync(join(outDir, 'subtitles-en.srt'), cuesEn.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
const voSvText = beats.map((b) => b.caption).filter(Boolean).join(' '), voEnText = beats.map((b) => b.en).filter(Boolean).join(' ');
writeFileSync(join(outDir, 'MANUS.md'), `# Manus – ${film.title}

- **Komposition:** ${film.composition || film.slug} · ${brand.format.width}×${brand.format.height} · ${brand.format.fps} fps · ${total} s · ${Math.round(total * brand.format.fps)} frames
- **Ljud:** syntetiserad temp-musik + ljudeffekter (helt genererade, inga licenser att reda ut). Ingen inspelad röst finns i miljön: speakertexterna nedan är klara att läsas in. Markera produktionen som ljudprototyp tills riktig röst och licensierad musik finns.
- **Voiceover SV:** ${wordCount(voSvText)} ord · **EN:** ${wordCount(voEnText)} ord (~${(wordCount(voSvText) / total).toFixed(1)} ord/s)
- **Produkt-UI:** konceptuell gränssnittsvisualisering, inte skärmdumpar av den driftsatta produkten.

| Tid | Beat | Rubrik i bild | Speaker SV | Speaker EN |
| --- | --- | --- | --- | --- |
${beats.map((b) => `| ${fmt(b.start)}–${fmt(b.end)} | ${b.id} | ${b.title || '(outro)'} | ${b.caption || '—'} | ${b.en || '—'} |`).join('\n')}

## Speaker SV (sammanhängande)

> ${voSvText}

## Narration EN (continuous)

> ${voEnText}

## Ljudhändelser (events.json)

${tl.events.map((e) => `- ${e.t.toFixed(2)} s · ${e.sfx} (${e.gain} dB)`).join('\n')}
`);
console.log(`▶ hero ${film.slug}: ${tl.frames} frames, ${total} s, ${tl.events.length} ljudhändelser`);

// Ljud: musik + sfx + ev. röst → mix.wav → loudnorm → mix.m4a
let audioPath = null;
if (!noAudio) {
  const aDir = join(outDir, 'audio'); mkdirSync(aDir, { recursive: true });
  const py = (a) => { const r = spawnSync('python3', [join(ROOT, 'audio', 'synth.py'), ...a], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('synth.py misslyckades'); };
  py(['sfx', '--out-dir', join(aDir, 'sfx')]);
  py(['music', '--duration', String(total), '--sections', film.music?.sections || '0:intro,4:tension,10:lift,' + (total - 5) + ':close', '--out', join(aDir, 'music.wav')]);
  const mixArgs = ['mix', '--music', join(aDir, 'music.wav'), '--events', join(outDir, 'events.json'), '--sfx-dir', join(aDir, 'sfx'), '--duration', String(total), '--out', join(aDir, 'mix.wav')];
  if (voSv && existsSync(voSv)) mixArgs.push('--vo', voSv);
  py(mixArgs);
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', join(aDir, 'mix.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', join(aDir, 'mix.m4a')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('loudnorm misslyckades');
  audioPath = join(aDir, 'mix.m4a');
  console.log('  ljud: audio/music.wav, audio/sfx/, audio/mix.wav, audio/mix.m4a (−16 LUFS)');
}

if (!noVideo) {
  const posterBeat = tl.beats.find((b) => b.id === 'route') || tl.beats[Math.floor(tl.beats.length / 2)];
  await renderVideo({ brand, htmlPath, mp4: join(outDir, `${film.slug}${audioPath ? '' : '-tyst'}.mp4`), audio: audioPath, posterFrame: Math.round((posterBeat.start + posterBeat.end) / 2 * brand.format.fps), posterPath: join(outDir, 'poster.jpg'), label: film.slug, workers });
  if (audioPath) await renderVideo({ brand, htmlPath, mp4: join(outDir, `${film.slug}-tyst.mp4`), audio: null, label: film.slug + ' (tyst)', workers });
}
console.log(`✓ ${outDir}`);
