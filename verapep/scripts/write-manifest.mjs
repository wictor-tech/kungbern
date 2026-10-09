/* Writes FILE-MANIFEST.txt: every file that belongs in a release package, with size
   and a SHA-256 prefix. Runtime data (SQLite, outbox, backups) and local tooling
   caches are excluded. Run: node scripts/write-manifest.mjs */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDE = [/^previews\//, /^node_modules\//, /^\.git\//, /^data\/verapep\.sqlite/, /^data\/outbox\//, /^data\/backups\//, /__pycache__/, /^\.env$/, /^FILE-MANIFEST\.txt$/, /\.DS_Store$/];

export function releaseFiles() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (EXCLUDE.some(rule => rule.test(entry.isDirectory() ? `${rel}/` : rel))) continue;
      if (entry.isDirectory()) walk(rel); else out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = releaseFiles();
  const lines = files.map(file => {
    const body = fs.readFileSync(path.join(root, file));
    return `${file} | ${body.length} | ${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}`;
  });
  const header = `# VERAPEP v18 file manifest\n\nGenerated: ${new Date().toISOString().slice(0, 10)}\n\nFiles listed: ${files.length} (manifest excludes itself and runtime database/outbox/backup files)\n\nPath | Bytes | SHA-256 (first 16)\n`;
  fs.writeFileSync(path.join(root, 'FILE-MANIFEST.txt'), `${header}${lines.join('\n')}\n`);
  console.log(`FILE-MANIFEST.txt: ${files.length} files`);
}
