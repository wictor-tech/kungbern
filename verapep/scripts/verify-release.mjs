/* Release package builder and verifier (v18). Used by CI and before every delivery.

   node scripts/verify-release.mjs                    verify FILE-MANIFEST.txt against the tree
   node scripts/verify-release.mjs --zip out.zip      also build the ZIP from the manifest and verify it
   node scripts/verify-release.mjs --zip out.zip --run-tests
                                                      … then unpack it in an empty directory and run
                                                      the unit tests and static checks there

   Checks: every manifest entry exists with the recorded size and hash; no release file is missing
   from the manifest; no forbidden file (database, .env, backups, outbox, keys) is included; the
   secret scan of the unpacked package is clean; the ZIP is at most 30 MB. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseFiles } from './write-manifest.mjs';
import { scanDirectory, FORBIDDEN_FILES } from './secret-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const problems = [];
const fail = message => problems.push(message);

function readManifest(dir) {
  const text = fs.readFileSync(path.join(dir, 'FILE-MANIFEST.txt'), 'utf8');
  return text.split('\n').filter(line => line.includes(' | ') && !line.startsWith('Path |')).map(line => {
    const [file, size, hash] = line.split(' | ');
    return { file, size: Number(size), hash };
  });
}

function verifyTree(dir, entries) {
  for (const { file, size, hash } of entries) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) { fail(`missing: ${file}`); continue; }
    const body = fs.readFileSync(full);
    if (body.length !== size) fail(`size differs: ${file}`);
    if (crypto.createHash('sha256').update(body).digest('hex').slice(0, 16) !== hash) fail(`hash differs: ${file}`);
  }
}

const args = process.argv.slice(2);
const entries = readManifest(root);
verifyTree(root, entries);
const listed = new Set(entries.map(entry => entry.file));
for (const file of releaseFiles()) if (!listed.has(file)) fail(`not in manifest (run node scripts/write-manifest.mjs): ${file}`);
for (const file of listed) if (FORBIDDEN_FILES.some(rule => rule.test(file))) fail(`forbidden file in manifest: ${file}`);
// v18: a file that exists locally but is not committed (e.g. via .gitignore) makes a clean
// checkout incomplete — v15–v17 shipped complete ZIPs while git lacked data/orders.json.
try {
  const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n'));
  for (const file of listed) if (!tracked.has(file)) fail(`release file is not committed to git: ${file}`);
} catch { /* not a git checkout (e.g. an unpacked ZIP) */ }
console.log(`Manifest: ${entries.length} entries checked against the working tree.`);

const zipIndex = args.indexOf('--zip');
if (zipIndex > -1) {
  const zipPath = path.resolve(args[zipIndex + 1]);
  fs.rmSync(zipPath, { force: true });
  const list = ['FILE-MANIFEST.txt', ...entries.map(entry => entry.file)].map(file => `verapep/${file}`).join('\n');
  execFileSync('zip', ['-q', '-X', zipPath, '-@'], { cwd: path.dirname(root), input: `${list}\n` });
  const size = fs.statSync(zipPath).size;
  console.log(`ZIP: ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  if (size > MAX_ZIP_BYTES) fail(`ZIP is ${(size / 1024 / 1024).toFixed(1)} MB (limit 30 MB)`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verapep-release-'));
  try {
    execFileSync('unzip', ['-q', zipPath, '-d', temp]);
    const unpacked = path.join(temp, 'verapep');
    const unpackedEntries = readManifest(unpacked);
    if (unpackedEntries.length !== entries.length) fail('unpacked manifest differs from the source manifest');
    verifyTree(unpacked, unpackedEntries);
    const extra = execFileSync('find', ['.', '-type', 'f'], { cwd: unpacked, encoding: 'utf8' }).split('\n').filter(Boolean).map(file => file.replace(/^\.\//, '')).filter(file => file !== 'FILE-MANIFEST.txt' && !listed.has(file));
    for (const file of extra) fail(`file in ZIP but not in manifest: ${file}`);
    const secrets = scanDirectory(unpacked);
    for (const item of secrets) fail(`secret scan of package: ${item.file}:${item.line} ${item.pattern}`);
    console.log(`Unpacked in a clean directory: ${unpackedEntries.length} files verified, secret scan ${secrets.length ? 'FAILED' : 'clean'}.`);
    if (args.includes('--run-tests') && !problems.length) {
      execFileSync(process.execPath, ['--test', ...fs.readdirSync(path.join(unpacked, 'tests')).filter(file => file.endsWith('.test.mjs')).map(file => `tests/${file}`)], { cwd: unpacked, stdio: 'inherit', env: { ...process.env, APP_ENV: 'test', DATA_DIR: '' } });
      execFileSync('python3', ['tests/static-validation.py'], { cwd: unpacked, stdio: 'inherit' });
      execFileSync(process.execPath, ['scripts/build-css.mjs', '--check'], { cwd: unpacked, stdio: 'inherit' });
      console.log('Unit tests, static validation and CSS check passed inside the unpacked package.');
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.error(`\nRelease verification FAILED (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Release verification passed.');
