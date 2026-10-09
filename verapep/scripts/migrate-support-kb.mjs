/* Ask Vera knowledge-base migration (v17).

   Dry run (default, changes nothing):  node scripts/migrate-support-kb.mjs
   Apply (backs up first):              node scripts/migrate-support-kb.mjs --apply
   List snapshots:                      node scripts/migrate-support-kb.mjs --list
   Roll back to a snapshot:             node scripts/migrate-support-kb.mjs --rollback support-kb-…json
   Options: --data-dir <dir> (default DATA_DIR or ./data), --json (machine-readable plan)

   Safe to run repeatedly: a second --apply finds nothing to change.
   The server keeps the knowledge base in memory, so stop it first or restart it
   afterwards — or use Admin → Ask Vera → Knowledge updates, which applies the
   same migration inside the running server. Never runs automatically. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { refuseWhileServerRuns } from '../lib/server-lock.mjs';
import { loadShipped, planMigration, applyPlan, writeSnapshot, listSnapshots, readSnapshot, snapshotDir, MIGRATION_ID } from '../lib/support-kb-migration.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index > -1 ? args[index + 1] : undefined; };
const dataDir = path.resolve(option('--data-dir') || process.env.DATA_DIR || path.join(root, 'data'));
const dbFile = path.join(dataDir, 'verapep.sqlite');
// v20: the running server would overwrite a CLI change to the knowledge base with its own copy.
if (args.includes('--apply') || args.includes('--rollback')) refuseWhileServerRuns(dataDir, 'changing the knowledge base from the command line (or use Admin → Guide & Ask Vera → Knowledge updates)');
const asJson = args.includes('--json');

function fail(message) { console.error(message); process.exit(1); }

if (args.includes('--list')) {
  const snapshots = listSnapshots(dataDir);
  if (asJson) console.log(JSON.stringify(snapshots, null, 2));
  else if (!snapshots.length) console.log(`No knowledge-base snapshots in ${snapshotDir(dataDir)}.`);
  else for (const item of snapshots) console.log(`${item.name}  ${item.createdAt || ''}  ${item.entries} entries  (${item.reason || ''})`);
  process.exit(0);
}

if (!fs.existsSync(dbFile)) fail(`No database at ${dbFile}. Start the server once (it seeds the current knowledge base) or pass --data-dir.`);
const db = new DatabaseSync(dbFile);
const readKb = () => { const row = db.prepare("SELECT value_json FROM documents WHERE key = 'supportKb'").get(); return row ? JSON.parse(row.value_json) : null; };
const writeKb = (document, action, before) => {
  const at = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("INSERT INTO documents(key, value_json, updated_at) VALUES ('supportKb', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").run(JSON.stringify(document), at);
    db.prepare('INSERT INTO audit_log(actor_email, actor_role, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('cli', 'system', action, 'support_kb', 'vera', JSON.stringify({ entries: before?.entries?.length ?? 0, contentVersion: before?.contentVersion ?? null }), JSON.stringify({ entries: document.entries.length, contentVersion: document.contentVersion }), at);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const current = readKb();
if (!current) { console.log('The database has no knowledge base yet; the server seeds the current version on first start.'); process.exit(0); }

const rollbackName = option('--rollback');
if (rollbackName) {
  let restored;
  try { restored = readSnapshot(dataDir, rollbackName); } catch (error) { fail(`Rollback refused: ${error.message} Use --list to see available snapshots.`); }
  const safety = writeSnapshot(dataDir, current, `before rollback to ${rollbackName}`);
  writeKb(restored, 'support_kb.rolled_back', current);
  console.log(`Restored the knowledge base from ${rollbackName} (${restored.entries.length} entries).`);
  console.log(`The state before this rollback was saved as ${safety}. Restart the server to load it.`);
  process.exit(0);
}

const { shipped, history } = loadShipped(root);
const plan = planMigration(current, shipped, history);

if (asJson) console.log(JSON.stringify(plan, null, 2));
else {
  console.log(`Ask Vera knowledge base: stored ${plan.from.contentVersion || `schema v${plan.from.version}`} → shipped ${plan.to.contentVersion} (${MIGRATION_ID})`);
  for (const change of plan.changes) {
    const marker = { update: 'UPDATE', add: 'ADD   ', rename: 'RENAME', unchanged: 'same  ', keep_custom: 'KEEP  ', keep_customised: 'KEEP* ', keep_locked: 'LOCKED', skip_removed: 'SKIP  ' }[change.action] || change.action;
    console.log(`  ${marker}  ${String(change.id).padEnd(22)} ${change.reason}`);
    if (change.action === 'update' && args.includes('--verbose')) console.log(`          before: ${change.before.answer}\n          after:  ${change.after.answer}`);
  }
  console.log(`  ${plan.fallback.action === 'update' ? 'UPDATE' : plan.fallback.action === 'keep_custom' ? 'KEEP  ' : 'same  '}  ${'fallback'.padEnd(22)} ${plan.fallback.reason || 'Already current.'}`);
  console.log(plan.upToDate ? '\nNothing to change.' : `\n${plan.writes} change(s) would be written. Entries marked KEEP/KEEP*/LOCKED are never modified.`);
}

if (!args.includes('--apply')) {
  if (!plan.upToDate && !asJson) console.log('Dry run only. Re-run with --apply to back up and apply.');
  process.exit(0);
}
if (plan.upToDate) process.exit(0);

const snapshot = writeSnapshot(dataDir, current, `before ${MIGRATION_ID}`);
const backupDir = snapshotDir(dataDir);
const sqliteBackup = path.join(backupDir, `verapep-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${crypto.randomBytes(2).toString('hex')}-pre-kb-migration.sqlite`);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.exec(`VACUUM INTO '${sqliteBackup.replaceAll("'", "''")}'`);
const next = applyPlan(current, shipped, plan, { by: 'cli', snapshot });
writeKb(next, 'support_kb.migrated', current);
console.log(`\nApplied. Snapshot: ${snapshot}. Full database backup: ${path.basename(sqliteBackup)}.`);
console.log(`Roll back with: node scripts/migrate-support-kb.mjs --rollback ${snapshot}`);
console.log('Restart the server so it loads the updated answers.');
