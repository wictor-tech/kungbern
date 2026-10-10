// Gemensamma hjälpfunktioner: läsa brand/klipp, bundla preview.html, generera MANUS.md + SRT.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BRAND_DIR = join(ROOT, 'brand');
export const CLIPS_DIR = join(ROOT, 'clips');
export const SCENES_DIR = join(ROOT, 'scenes');
export const OUT_DIR = join(ROOT, 'out');
export const captions = createRequire(import.meta.url)(join(BRAND_DIR, 'captions.js'));

export const loadBrand = () => JSON.parse(readFileSync(join(BRAND_DIR, 'brand.json'), 'utf8'));
export const listClips = () => readdirSync(CLIPS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
export function loadClip(slug) {
  const p = join(CLIPS_DIR, slug + '.json');
  if (!existsSync(p)) throw new Error(`Hittar inte klipp: ${p}`);
  const clip = JSON.parse(readFileSync(p, 'utf8'));
  clip.slug = clip.slug || slug;
  validateClip(clip);
  return clip;
}

export function validateClip(clip) {
  const need = (cond, msg) => { if (!cond) throw new Error(`Klipp "${clip.slug}": ${msg}`); };
  need(Number.isInteger(clip.episode), 'episode (heltal) saknas');
  need(clip.hook?.text, 'hook.text saknas');
  need(clip.problem?.title, 'problem.title saknas');
  need(Array.isArray(clip.problem?.pains) && clip.problem.pains.length <= 3, 'problem.pains ska vara en lista med max 3');
  need(Array.isArray(clip.solution?.steps) && clip.solution.steps.length === 3, 'solution.steps ska ha exakt 3 steg');
  need(clip.voiceover && ['hook', 'problem', 'solution', 'outro'].every((k) => typeof clip.voiceover[k] === 'string'), 'voiceover.{hook,problem,solution,outro} saknas');
  if (clip.scene) need(existsSync(join(SCENES_DIR, clip.scene + '.js')), `scenfil saknas: scenes/${clip.scene}.js`);
  if (clip.variants) for (const [k, v] of Object.entries(clip.variants)) need(v.hook?.text, `variants.${k}.hook.text saknas`);
  if (clip.cta) need(typeof clip.cta === 'object', 'cta ska vara ett objekt { question, label, url }');
  const all = JSON.stringify(clip);
  need(!/\bi grinden\b/i.test(all), 'skriv "vid grinden", inte "i grinden"');
}

export const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;
export const voWords = (clip) => wordCount(Object.values(clip.voiceover).join(' '));

export const phases = (brand) => captions.phases(brand);

// En fil som funkar via file:// utan server: brand.css + motor + ikoner + mall + scen + klipp inlinade.
// Variant = samma klipp med en annan hook (A/B). Returnerar en kopia av klippet.
export function applyVariant(clip, key) {
  if (!key) return clip;
  const v = clip.variants && clip.variants[key];
  if (!v) throw new Error(`Klipp "${clip.slug}" har ingen variant "${key}"`);
  return { ...clip, hook: { ...clip.hook, ...v.hook }, voiceover: { ...clip.voiceover, ...(v.voiceover || {}) }, _variant: key };
}

export function bundleHtml(brand, clip, opts = {}) {
  const read = (p) => readFileSync(p, 'utf8');
  const css = read(join(BRAND_DIR, 'brand.css')).replaceAll('__FONTS__', pathToFileURL(join(BRAND_DIR, 'fonts')).href);
  const js = ['engine.js', 'icons.js', 'captions.js', 'yard.js', 'shell.js', ...(opts.film ? ['film.js'] : [])].map((f) => read(join(BRAND_DIR, f))).join('\n');
  const sceneNames = opts.scenes || (clip.scene ? [clip.scene] : []);
  const scene = sceneNames.map((n) => read(join(SCENES_DIR, n + '.js'))).join('\n');
  const { width, height } = brand.format;
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<title>${brand.product} – ${clip.title || clip.slug}</title>
<style>${css}
.viewport{transform-origin:top left;position:absolute;left:0;top:0}
</style></head>
<body>
<div class="viewport"><div class="stage"></div></div>
<div class="controls" style="position:fixed;left:0;right:0;bottom:0;background:#0b1220">
  <button id="play">Spela</button>
  <input id="scrub" type="range" min="0" max="0" value="0" step="1">
  <span id="time">0.00 s · frame 0</span>
</div>
<script>${js}</script>
<script>${scene}</script>
<script>
(function(){
  const brand = ${JSON.stringify(brand)};
  const clip = ${JSON.stringify(clip)};
  const tl = LUP.${opts.film ? 'initFilm' : 'init'}(brand, clip, ${JSON.stringify({ captions: opts.captions !== false })});
  // Preview-kontroller (döljs i render-läge)
  const scrub = document.getElementById('scrub'), time = document.getElementById('time'), play = document.getElementById('play');
  scrub.max = tl.frames - 1;
  let frame = 0, playing = false, t0 = 0, f0 = 0;
  const show = (f) => { frame = Math.max(0, Math.min(tl.frames - 1, Math.round(f))); window.__seek(frame); scrub.value = frame; time.textContent = (frame / tl.fps).toFixed(2) + ' s · frame ' + frame; };
  scrub.addEventListener('input', () => { playing = false; play.textContent = 'Spela'; show(+scrub.value); });
  play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? 'Paus' : 'Spela'; t0 = performance.now(); f0 = frame >= tl.frames - 1 ? 0 : frame; });
  const loop = (now) => { if (playing) { const f = f0 + (now - t0) / 1000 * tl.fps; if (f >= tl.frames) { playing = false; play.textContent = 'Spela'; show(tl.frames - 1); } else show(f); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const fit = () => { if (document.body.classList.contains('render')) return; const s = Math.min(window.innerWidth / ${width}, (window.innerHeight - 60) / ${height}); document.querySelector('.viewport').style.transform = 'scale(' + s + ')'; };
  window.addEventListener('resize', fit); fit();
  document.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); play.click(); } if (e.key === 'ArrowRight') show(frame + 1); if (e.key === 'ArrowLeft') show(frame - 1); });
  show(0);
})();
</script>
</body></html>`;
}

const fmt = (s) => { const m = Math.floor(s / 60), sec = s - m * 60; return `${m}:${sec.toFixed(1).padStart(4, '0')}`; };
const srtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };

export function manusMarkdown(brand, clip) {
  const { list, total, byKey: P } = phases(brand);
  const nl = (s) => s.replace(/\n/g, ' / ');
  const words = voWords(clip);
  const maxW = brand.voiceoverMaxWords;
  const cta = { ...brand.cta, ...(clip.cta || {}) };
  const rows = [
    [P.hook, 'Hook (frame 0)', [nl(clip.hook.text), clip.hook.sub].filter(Boolean).join(' · '), clip.voiceover.hook],
    [P.problem, 'Problemet på siten', [nl(clip.problem.title), ...clip.problem.pains].join(' · '), clip.voiceover.problem],
    [P.solution, 'LUPNUMBER-lösningen', [nl(clip.solution.title), ...clip.solution.steps.map((s, i) => `${i + 1}. ${s.label}${s.sub ? ` (${s.sub})` : ''}`), clip.solution.kicker ? clip.solution.kicker.replace(/\*/g, '') : null].filter(Boolean).join(' · '), clip.voiceover.solution],
    [P.outro, 'Outro (låst layout)', [`${brand.wordmark.accent}${brand.wordmark.heading} · ${brand.tagline}`, cta.question ? cta.question.replace(/\*/g, '') : null, `${cta.label} → ${cta.url}`].filter(Boolean).join(' · '), clip.voiceover.outro],
  ];
  const variants = Object.entries(clip.variants || {});
  return `# Manus – ${brand.seriesName}: ${clip.title || clip.slug}

- **Format:** ${brand.format.width}×${brand.format.height} (4:5, LinkedIn-flöde), ${total} s, ${brand.format.fps} fps, undertexter inbrända
- **Scen:** ${clip.scene || 'standardlayout'} · **Hook-ikon:** ${clip.icon}
- **Voiceover:** ${words} ord (max ${maxW}) ${words > maxW ? '⚠️ FÖR LÅNGT' : '✓'}
- **CTA:** ${cta.question ? cta.question.replace(/\*/g, '') + ' · ' : ''}${cta.label} · ${cta.url}
- **Dramaturgi:** Hook (från frame 0) → Problemet på siten → LUPNUMBER-lösningen → Outro

## On-screen-text (det som syns i rutan)

| Tid | Beat | Text i rutan | Voiceover |
| --- | --- | --- | --- |
${rows.map(([p, beat, screen, vo]) => `| ${fmt(p.start)}–${fmt(p.end)} | ${beat} | ${screen} | ${vo} |`).join('\n')}

## Voiceover (läs in eller texta)

> ${Object.values(clip.voiceover).join(' ')}

### Per beat

${['hook', 'problem', 'solution', 'outro'].map((k) => `- **${k[0].toUpperCase() + k.slice(1)}** (${fmt(P[k].start)}–${fmt(P[k].end)}): ${clip.voiceover[k]}`).join('\n')}
${variants.length ? `
## Hook-varianter (A/B)

- **A (standard):** ${nl(clip.hook.text)}${clip.hook.sub ? ' · ' + clip.hook.sub : ''}
${variants.map(([k, v]) => `- **${k.toUpperCase()}** (\`${clip.slug}-hook-${k}.mp4\`): ${nl(v.hook.text)}${v.hook.sub ? ' · ' + v.hook.sub : ''}${v.voiceover?.hook ? ' · VO: ' + v.voiceover.hook : ''}`).join('\n')}

Posta A och B med en veckas mellanrum, jämför tittartid vid 3 s och 10 s samt antal kommentarer. Gör fler av vinnaren.
` : ''}
## Inläggstext (förslag, posta från en personlig profil)

${clip.post || `${nl(clip.hook.text)} ${clip.hook.sub || ''}

${clip.voiceover.problem}

${clip.voiceover.solution}

${cta.question ? cta.question.replace(/\*/g, '') : 'Hur ser det ut hos er?'} Skriv i kommentarerna.`}

## Checklista innan publicering

- [ ] Första bildrutan visar hooken (ingen logga-först)
- [ ] "vid grinden", inte "i grinden"
- [ ] Voiceover ≤ ${maxW} ord och hinner läsas i tempo (~2,3 ord/s)
- [ ] Karusell (\`carousel.pdf\`) postad som dokument, separat från videon
- [ ] Svara på varje kommentar inom en timme
`;
}

export function srt(brand, clip) {
  return captions.cues(brand, clip).map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
