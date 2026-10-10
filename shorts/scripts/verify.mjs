#!/usr/bin/env node
// Verifierar alla renderade mp4 (upplösning, fps, frames, längd, ljudspår) och uppdaterar avsnittet "Verifierade filer" i shorts/QUALITY.md.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { OUT_DIR, ROOT } from './lib.mjs';
const probe = (f) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,sample_rate,channels', '-show_entries', 'format=duration', '-of', 'json', f], { encoding: 'utf8' }));
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  return { w: v?.width, h: v?.height, fps: v?.r_frame_rate, frames: +v?.nb_read_frames, dur: +j.format.duration, audio: a ? `${a.codec_name} ${a.sample_rate} Hz` : '–', size: (statSync(f).size / 1048576).toFixed(1) + ' MB' };
};
const files = [];
for (const d of readdirSync(OUT_DIR).filter((d) => statSync(join(OUT_DIR, d)).isDirectory())) for (const f of readdirSync(join(OUT_DIR, d))) if (f.endsWith('.mp4')) files.push(join(OUT_DIR, d, f));
files.sort((a, b) => (a.includes('hero-') ? -1 : b.includes('hero-') ? 1 : a.localeCompare(b)));
const rows = files.map((f) => { const p = probe(f); const ok = p.w === 1080 && p.h === 1350 && p.fps === '30/1' && Math.abs(p.frames - Math.round(p.dur * 30)) <= 1; return `| ${relative(OUT_DIR, f)} | ${p.w}×${p.h} | ${p.fps.replace('/1', '')} | ${p.frames} | ${p.dur.toFixed(1)} | ${p.audio} | ${p.size} | ${ok ? '✓' : '✗'} |`; });
const section = `## Verifierade filer

Mätt med ffprobe (count_frames) ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. ✓ = 1080×1350, 30 fps och frames = längd × 30.

| Fil | Upplösning | fps | Frames | Längd (s) | Ljud | Storlek | OK |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
const q = join(ROOT, 'QUALITY.md'); let md = readFileSync(q, 'utf8');
md = md.includes('## Verifierade filer') ? md.replace(/## Verifierade filer[\s\S]*$/, section) : md + '\n' + section;
writeFileSync(q, md);
console.log(rows.map((r) => r.split('|').slice(1, 6).join('|')).join('\n'));
console.log(`\n${files.length} filer verifierade → shorts/QUALITY.md`);
