/* VERAPEP SQLite backup (documented in README.md "Backup while using SQLite").
   Restored in v16: the npm script `backup:sqlite` referenced this file but it
   was missing from the v14.1 package.

   1. Checkpoints the WAL into the main database file.
   2. Writes a consistent copy with VACUUM INTO (safe while the server runs).
   3. Runs PRAGMA integrity_check on the copy and fails loudly if it is not "ok".

   Usage: npm run backup:sqlite            (backups go to DATA_DIR/backups)
          BACKUP_DIR=/path npm run backup:sqlite */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(process.cwd());
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));
const sourcePath = path.join(dataDir, 'verapep.sqlite');
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));

if (!fs.existsSync(sourcePath)) {
  console.error(`No SQLite database found at ${sourcePath}. Start the server once to create it.`);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetPath = path.join(backupDir, `verapep-${stamp}.sqlite`);

const source = new DatabaseSync(sourcePath);
try {
  source.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  source.prepare('VACUUM INTO ?').run(targetPath);
} finally {
  source.close();
}

const copy = new DatabaseSync(targetPath, { readOnly: true });
let result;
try {
  result = copy.prepare('PRAGMA integrity_check').all().map(row => Object.values(row)[0]);
} finally {
  copy.close();
}
if (result.length !== 1 || result[0] !== 'ok') {
  console.error(`Integrity check FAILED for ${targetPath}:\n${result.join('\n')}`);
  process.exit(2);
}
const size = fs.statSync(targetPath).size;
console.log(`Backup written: ${targetPath} (${(size / 1024).toFixed(1)} KB, integrity_check: ok)`);
