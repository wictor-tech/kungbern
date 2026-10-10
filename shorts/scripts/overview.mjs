#!/usr/bin/env node
// Skriver shorts/SERIE.md: översikt över alla klipp och filmer (hook, CTA, voiceover) ur clips/*.json och films/*.json.
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBrand, loadClip, listClips, voWords, phases, ROOT } from './lib.mjs';
const brand = loadBrand();
const clips = listClips().map(loadClip);
const films = readdirSync(join(ROOT, 'films')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ROOT, 'films', f), 'utf8')));
const nl = (s) => s.replace(/\n/g, ' / ');
const total = phases(brand).total;
let md = `# LUPNUMBER – LinkedIn-serien "${brand.seriesName}"\n\n${clips.length} klipp à ${total} s (${brand.format.width}×${brand.format.height}, undertexter inbrända, hook i första bildrutan) och ${films.length} flödesfilm${films.length === 1 ? '' : 'er'}.\nKlippen numreras inte i bild; ordningen nedan är bara filordning.\n\n`;
md += `| Ordning | Utmaning | Hook A | Hook B | CTA-fråga | VO-ord |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const c of clips) md += `| ${String(c.episode).padStart(2, '0')} | ${c.title} | ${nl(c.hook.text)} | ${c.variants?.b ? nl(c.variants.b.hook.text) : '–'} | ${(c.cta?.question || brand.cta.question || brand.cta.label).replace(/\*/g, '')} | ${voWords(c)} |\n`;
md += `\n## Voiceover per klipp\n\n`;
for (const c of clips) md += `**${c.title}**\n\n> ${Object.values(c.voiceover).join(' ')}\n\n`;
if (films.length) {
  md += `## Flödesfilmer\n\n`;
  for (const f of films) {
    md += `**${f.title}** (\`shorts/out/film-${f.slug}/\`): ${f.segments.length} steg, överst "idag", nederst "med LUPNUMBER".\n\n`;
    md += `| Steg | Idag | Med LUPNUMBER |\n| --- | --- | --- |\n`;
    for (const s of f.segments) md += `| ${s.label} | ${s.today} | ${s.lup.replace(/\*/g, '')} |\n`;
    md += `\n> ${[f.voiceover?.hook, ...f.segments.map((s) => s.voiceover), f.voiceover?.outro].filter(Boolean).join(' ')}\n\n`;
  }
}
md += `## Publiceringsplan (förslag)\n\n1. Flödesfilmen först, från en personlig profil: den sätter ramen "idag mot med LUPNUMBER".\n2. Därefter ett klipp i veckan, samma veckodag. Posta karusellen (\`carousel.pdf\`) som dokumentinlägg två dagar senare.\n3. Kör hook A ena veckan och hook B nästa på liknande ämnen. Jämför tittartid vid 3 s och 10 s samt kommentarer.\n4. Svara på varje kommentar inom en timme. Frågan i outron är där räckvidden skapas.\n\nManus, undertexter, karusell och mp4 per klipp ligger i \`shorts/out/<slug>/\`. Regenerera allt med \`npm run klipp:alla -- --all-variants\` och \`npm run film -- en-dag-pa-siten\`.\n`;
writeFileSync(join(ROOT, 'SERIE.md'), md);
console.log('Skrev shorts/SERIE.md');
