/* Site image audit (v19). Writes data/image-audit.json, shown in Admin → Overview → Content quality.

   For every image under assets/media and assets/images it records size, dimensions, where it is
   used, and flags: low resolution for its role, no high-resolution original, unused large file,
   inconsistent proportions within a group, generic illustration, and printed claims that are not
   confirmed (manual flags below — an image's text cannot be read automatically).

   node scripts/audit-site-images.mjs            write the report
   node scripts/audit-site-images.mjs --check    exit 1 if the committed report is out of date */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize, detectType } from '../lib/documents.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['assets/media', 'assets/images'];
// Minimum useful width by role (2× the largest rendered width).
const ROLE_MIN_WIDTH = { hero: 2400, product: 1000, decorative: 600 };
// Things a script cannot see: reviewed by eye in v19 and recorded here.
const MANUAL_FLAGS = {
  'assets/media/product-vials/': ['Product photos show a "Research Use Only" label — an unconfirmed product claim that needs legal review before any use.', 'Rendered vial mock-ups, not photographs of real batches.', 'Only listed in the photo-override map; pages show the generated vial illustration instead.'],
  'assets/images/vial-bases/': ['Generic glass-vial base used to draw every product illustration; product cards are therefore visually identical apart from colour.'],
  'assets/media/vera-guide.svg': ['Generic illustration; still in the HTML but hidden by CSS since v15 — remove the markup and file.'],
  'assets/media/quality-lab.svg': ['Generic illustration; still in the HTML but hidden by CSS since v15 — remove the markup and file.'],
  'assets/media/world-network.svg': ['Generic illustration; still in the HTML but hidden by CSS since v15 — remove the markup and file.']
};

function walk(dir) {
  const out = [];
  if (!fs.existsSync(path.join(root, dir))) return out;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel)); else out.push(rel);
  }
  return out;
}

function references(file) {
  const name = path.basename(file);
  const sources = fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')])
    .concat(fs.readdirSync(path.join(root, 'assets')).filter(f => /\.(js|css)$/.test(f) && !f.startsWith('bundle-')).map(f => [`assets/${f}`, fs.readFileSync(path.join(root, 'assets', f), 'utf8')]))
    .concat([['data/product-images.json', fs.existsSync(path.join(root, 'data/product-images.json')) ? fs.readFileSync(path.join(root, 'data/product-images.json'), 'utf8') : '']]);
  return sources.filter(([, text]) => text.includes(name)).map(([source]) => source);
}

export function audit() {
  const files = DIRS.flatMap(walk).filter(file => /\.(png|jpe?g|webp|avif|svg|mp4|webm)$/i.test(file)).sort();
  const rows = files.map(file => {
    const buffer = fs.readFileSync(path.join(root, file));
    const type = detectType(buffer);
    const size = type ? imageSize(buffer, type.mime) : null;
    const role = /hero/.test(file) ? 'hero' : /product-vials|vial-bases/.test(file) ? 'product' : 'decorative';
    const usedBy = references(file);
    const flags = [];
    if (role !== 'hero' && size && size.width < ROLE_MIN_WIDTH[role] && usedBy.length) flags.push(`Low resolution for its role (${size.width}px wide; ${ROLE_MIN_WIDTH[role]}px recommended for sharp display on high-density screens).`);
    if (!usedBy.length && buffer.length > 200 * 1024) flags.push(`Not used by any page but ${Math.round(buffer.length / 1024)} KB — candidate for removal from the release.`);
    for (const [prefix, notes] of Object.entries(MANUAL_FLAGS)) if (file.startsWith(prefix) || file === prefix) flags.push(...notes);
    return { file, bytes: buffer.length, width: size?.width ?? null, height: size?.height ?? null, role, usedBy, flags };
  });
  // Missing originals: a derivative (webp/avif) in use without a larger master of the same image.
  const heroMasters = rows.filter(row => row.role === 'hero' && row.width && row.usedBy.length);
  const widestHero = Math.max(0, ...heroMasters.map(row => row.width));
  if (widestHero && widestHero < ROLE_MIN_WIDTH.hero) {
    for (const row of rows.filter(item => item.role === 'hero' && item.usedBy.length)) row.flags.push(`No high-resolution original: the widest source is ${widestHero}px, so 1920px screens at 2× are upscaled.`);
  }
  // Inconsistent proportions within the product photo group.
  const vials = rows.filter(row => row.file.includes('product-vials/') && row.width);
  const ratios = vials.map(row => row.width / row.height);
  if (ratios.length && Math.max(...ratios) - Math.min(...ratios) > 0.02) for (const row of vials) row.flags.push(`Proportions differ within the product photo set (${(row.width / row.height).toFixed(3)} vs ${Math.min(...ratios).toFixed(3)}–${Math.max(...ratios).toFixed(3)}).`);
  return {
    note: 'Generated by scripts/audit-site-images.mjs. Lists public image files; contains no product data beyond file names.',
    totals: { files: rows.length, flagged: rows.filter(row => row.flags.length).length, unusedBytes: rows.filter(row => !row.usedBy.length).reduce((sum, row) => sum + row.bytes, 0) },
    images: rows
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = audit();
  const target = path.join(root, 'data', 'image-audit.json');
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) { console.error('data/image-audit.json is out of date. Run: node scripts/audit-site-images.mjs'); process.exit(1); }
    console.log('Image audit is current.');
  } else {
    fs.writeFileSync(target, text);
    console.log(`Image audit: ${report.totals.files} files, ${report.totals.flagged} flagged, ${Math.round(report.totals.unusedBytes / 1024)} KB unused.`);
  }
}
