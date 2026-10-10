#!/usr/bin/env node
// Skapar ett nytt klipp-JSON med nästa avsnittsnummer och TODO-fält.
// Användning: node shorts/scripts/new.mjs <slug> "<utmaning>" [--scene namn]
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listClips, loadClip, CLIPS_DIR, SCENES_DIR } from './lib.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scene'); const scene = si >= 0 ? args.splice(si, 2)[1] : null;
const [rawSlug, title] = args;
if (!rawSlug) { console.error('Användning: node shorts/scripts/new.mjs <slug> "<utmaning>" [--scene namn]'); process.exit(1); }
const episodes = listClips().map((s) => loadClip(s).episode);
const episode = episodes.length ? Math.max(...episodes) + 1 : 1;
const slug = `${String(episode).padStart(2, '0')}-${rawSlug.replace(/^\d+-/, '')}`;
const file = join(CLIPS_DIR, slug + '.json');
if (existsSync(file)) { console.error('Finns redan: ' + file); process.exit(1); }
const clip = {
  slug, episode, title: title || 'TODO titel', scene, icon: 'check',
  hook: { text: 'TODO hook\nmax två rader', sub: 'TODO underrad (valfri)' },
  variants: { b: { hook: { text: 'TODO alternativ hook (A/B)', sub: '' }, voiceover: { hook: 'TODO' } } },
  problem: { title: 'TODO problemrubrik\nmax två rader', pains: ['TODO smärtpunkt 1', 'TODO smärtpunkt 2', 'TODO smärtpunkt 3'] },
  solution: { title: 'Med LUPNUMBER …', steps: [
    { icon: 'calendar', label: 'TODO steg 1', sub: '' }, { icon: 'phone', label: 'TODO steg 2', sub: '' }, { icon: 'check', label: 'TODO steg 3', sub: '' } ],
    kicker: 'TODO *slutkläm.*' },
  cta: { question: 'TODO fråga som får folk att kommentera?', label: 'Svara i kommentarerna', url: 'lupnumber.com' },
  voiceover: { hook: 'TODO', problem: 'TODO', solution: 'TODO', outro: 'TODO frågan igen. Skriv i kommentarerna.' },
};
writeFileSync(file, JSON.stringify(clip, null, 2) + '\n');
console.log('Skapade ' + file);
if (scene && !existsSync(join(SCENES_DIR, scene + '.js'))) {
  writeFileSync(join(SCENES_DIR, scene + '.js'), `/* Scen: ${title || scene}. Se scenes/grind-ko.js för mönstret. */
(function () {
  const LUP = (window.LUP = window.LUP || {});
  const U = LUP.util;
  LUP.scenes = LUP.scenes || {};
  LUP.scenes['${scene}'] = {
    mount(root, clip, brand) {
      const Y = LUP.yard, U = LUP.util;
      const svg = Y.svg(root); // 936×400, samma kamera för problem och lösning
      // TODO: komponera av Y.road / Y.truck / Y.gate / Y.card / Y.pill … (se scenes/grind-ko.js)
      return (s) => { /* s.t, s.l, s.phase ('problem'|'solution'), s.p (0→1 vid lösningen) */ };
    },
  };
})();
`);
  console.log('Skapade scenes/' + scene + '.js (stub)');
}
