#!/usr/bin/env node
// Skriver shorts/SERIE.md: översikt över alla klipp (hook, scen, voiceover) ur clips/*.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBrand, loadClip, listClips, voWords, ROOT } from './lib.mjs';
const brand = loadBrand();
const clips = listClips().map(loadClip);
const nl = (s) => s.replace(/\n/g, ' / ');
let md = `# LUPNUMBER – LinkedIn-serien\n\n${clips.length} klipp · ${Object.values(brand.timeline).reduce((a, b) => a + b, 0)} s vardera · ${brand.format.width}×${brand.format.height}\n\n`;
md += `| # | Utmaning | Hook | Scen | VO-ord |\n| --- | --- | --- | --- | --- |\n`;
for (const c of clips) md += `| ${String(c.episode).padStart(2, '0')} | ${c.title} | ${nl(c.hook.text)} | ${c.scene || '–'} | ${voWords(c)} |\n`;
md += `\n## Voiceover per klipp\n\n`;
for (const c of clips) md += `**${String(c.episode).padStart(2, '0')} · ${c.title}**\n\n> ${Object.values(c.voiceover).join(' ')}\n\n`;
md += `Manus, undertexter och mp4 per klipp ligger i \`shorts/out/<slug>/\`. Regenerera allt med \`npm run klipp:alla\`.\n`;
writeFileSync(join(ROOT, 'SERIE.md'), md);
console.log('Skrev shorts/SERIE.md');
