/* VERAPEP SQLite restore (v17). Counterpart of scripts/backup-sqlite.mjs.

   Stop the server first. The script
   1. checks the backup with PRAGMA integrity_check and that it is a VERAPEP database,
   2. copies the current database to backups/pre-restore-<time>.sqlite (so the restore can be undone),
   3. replaces data/verapep.sqlite with the backup and removes stale -wal/-shm files.

   Usage: node scripts/restore-sqlite.mjs <backup.sqlite> --yes [--data-dir <dir>]
   Without --yes it only validates the backup and prints what would happen. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { refuseWhileServerRuns } from '../lib/server-lock.mjs';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index > -1 ? args[index + 1] : undefined; };
const backupFile = args.find(arg => !arg.startsWith('--') && arg !== option('--data-dir'));
const dataDir = path.resolve(option('--data-dir') || process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const target = path.join(dataDir, 'verapep.sqlite');
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));

function fail(message, code = 1) { console.error(message); process.exit(code); }

if (!backupFile) fail('Usage: node scripts/restore-sqlite.mjs <backup.sqlite> --yes [--data-dir <dir>]');
const source = path.resolve(backupFile);
if (!fs.existsSync(source)) fail(`Backup not found: ${source}`);
if (source === target) fail('The backup file is the live database file.');

const check = new DatabaseSync(source, { readOnly: true });
let integrity; let tables;
try {
  integrity = check.prepare('PRAGMA integrity_check').all().map(row => Object.values(row)[0]);
  tables = new Set(check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
} finally {
  check.close();
}
if (integrity.length !== 1 || integrity[0] !== 'ok') fail(`Integrity check FAILED for ${source}:\n${integrity.join('\n')}`, 2);
for (const table of ['documents', 'audit_log', 'admin_users']) if (!tables.has(table)) fail(`${source} is not a VERAPEP database (missing table ${table}).`, 2);
console.log(`Backup OK: ${path.basename(source)} (integrity_check: ok).`);

if (!args.includes('--yes')) {
  console.log(`Dry run. With --yes the current database (${target}) is first copied to ${backupDir}/pre-restore-<time>.sqlite and then replaced.`);
  console.log('Stop the server before restoring.');
  process.exit(0);
}

refuseWhileServerRuns(dataDir, 'restoring');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// v20: private product documents are restored together with the database (backup-sqlite.mjs copies
// them to "<backup>-documents"). The current documents folder is kept as pre-restore-<time>-documents.
const documentsBackup = source.replace(/\.sqlite$/, '-documents');
const documentsLive = path.join(dataDir, 'documents');
if (fs.existsSync(target)) {
  const live = new DatabaseSync(target);
  const safety = path.join(backupDir, `pre-restore-${stamp}.sqlite`);
  try {
    live.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    live.prepare('VACUUM INTO ?').run(safety);
  } finally {
    live.close();
  }
  console.log(`Current database saved as ${safety}.`);
}
for (const suffix of ['-wal', '-shm']) fs.rmSync(`${target}${suffix}`, { force: true });
fs.copyFileSync(source, `${target}.restoring`);
fs.renameSync(`${target}.restoring`, target);
if (fs.existsSync(documentsBackup)) {
  if (fs.existsSync(documentsLive)) fs.renameSync(documentsLive, path.join(backupDir, `pre-restore-${stamp}-documents`));
  fs.cpSync(documentsBackup, documentsLive, { recursive: true, preserveTimestamps: true });
  fs.chmodSync(documentsLive, 0o700);
  console.log(`Restored ${fs.readdirSync(documentsLive).length} product document(s) from ${path.basename(documentsBackup)}.`);
} else {
  console.log('No product-documents copy next to this backup; the current documents folder was left as it is.');
}
console.log(`Restored ${target} from ${path.basename(source)}. Start the server to use it.`);
