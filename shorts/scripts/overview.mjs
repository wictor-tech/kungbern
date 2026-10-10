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
let md = `# LUPNUMBER – LinkedIn-serien "${brand.seriesName}"\n\n${clips.length} klipp à ${total} s (${brand.format.width}×${brand.format.height}, undertexter inbrända, hook i första bildrutan), en hero-film (60 s), en LinkedIn-version (25 s) och en flödesfilm med delad bild (49,5 s). Kvalitetsrapport: [QUALITY.md](QUALITY.md).\nKlippen numreras inte i bild; ordningen nedan är bara filordning.\n\n`;
md += `| Ordning | Utmaning | Hook A | Hook B | CTA-fråga | VO-ord |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const c of clips) md += `| ${String(c.episode).padStart(2, '0')} | ${c.title} | ${nl(c.hook.text)} | ${c.variants?.b ? nl(c.variants.b.hook.text) : '–'} | ${(c.cta?.question || brand.cta.question || brand.cta.label).replace(/\*/g, '')} | ${voWords(c)} |\n`;
md += `\n## Voiceover per klipp\n\n`;
for (const c of clips) md += `**${c.title}**\n\n> ${Object.values(c.voiceover).join(' ')}\n\n`;
const heroes = films.filter((f) => f.beats), flows = films.filter((f) => f.segments);
if (heroes.length) {
  md += `## Hero-film och LinkedIn-version\n\n`;
  for (const f of heroes) {
    const total = f.beats.reduce((a, b) => a + b.duration, 0);
    md += `**${f.title}** (\`shorts/out/hero-${f.slug}/\`): ${total} s, ${f.beats.length} beats, en lastbil (${f.plate || 'ABC 123'}) genom hela resan. Ljud: syntetiserad prototyp, speaker SV/EN i MANUS.md.\n\n`;
    md += `| Beat | Rubrik i bild | Speaker SV |\n| --- | --- | --- |\n`;
    for (const b of f.beats) md += `| ${b.id} (${b.duration} s) | ${b.title || '–'} | ${b.caption || '–'} |\n`;
    md += '\n';
  }
}
if (flows.length) {
  md += `## Flödesfilm (delad bild)\n\n`;
  for (const f of flows) {
    md += `**${f.title}** (\`shorts/out/film-${f.slug}/\`): ${f.segments.length} steg, överst "idag", nederst "med LUPNUMBER".\n\n`;
    md += `| Steg | Idag | Med LUPNUMBER |\n| --- | --- | --- |\n`;
    for (const s of f.segments) md += `| ${s.label} | ${s.today} | ${s.lup.replace(/\*/g, '')} |\n`;
    md += `\n> ${[f.voiceover?.hook, ...f.segments.map((s) => s.voiceover), f.voiceover?.outro].filter(Boolean).join(' ')}\n\n`;
  }
}
md += `\n## Publicera och mät innan ni gör fler\n\n1. Posta flödesfilmen och två klipp först (förslag: räkneklippet och kön vid grinden), från en personlig profil, inte bara företagssidan.\n2. Läs av efter sju dagar per inlägg och fyll i tabellen nedan. Gör sedan fler av det som vinner och justera mallen, inte tvärtom.\n3. Därefter ett klipp i veckan, samma veckodag. Karusellen (\`carousel.pdf\`) som dokumentinlägg två dagar senare. Hook A ena veckan, hook B nästa.\n4. Svara på varje kommentar inom en timme. Uppmaningen i outron är där räckvidden skapas.\n5. Overlayen (\`hook-overlay*.webm/.mov\`) läggs ovanpå två sekunder egen film av er grind före grafiken när ni vill testa riktig film.\n\n| Inlägg | Hook | Visningar | Sett 3 s (%) | Sett till slut (%) | Kommentarer | Delningar | Lärdom |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| film | – | | | | | | |\n| 10 (räkna) | A | | | | | | |\n| 01 (kö) | A | | | | | | |\n| 01 (kö) | B | | | | | | |\n\nManus, undertexter, karusell, overlay och mp4 per klipp ligger i \`shorts/out/<slug>/\`. Regenerera allt med \`npm run klipp:alla -- --all-variants --overlay\` och \`npm run film -- en-dag-pa-siten\`.\n`;
writeFileSync(join(ROOT, 'SERIE.md'), md);
console.log('Skrev shorts/SERIE.md');
