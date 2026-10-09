/* Audit-log scrubber (v18).

   Versions before v17 wrote admin password hashes, MFA seeds and recovery-code hashes into the
   audit log (admin_user.created / admin_user.updated). This tool finds such entries and, only
   when explicitly asked, replaces the secret values with a marker.

   Dry run (default, read-only):  node scripts/scrub-audit-log.mjs [--data-dir DIR] [--json]
   Apply (needs --yes):            node scripts/scrub-audit-log.mjs --apply --yes
   Undo an apply:                  node scripts/scrub-audit-log.mjs --restore <audit-scrub-….json> --yes

   Before applying it writes (1) a full SQLite copy and (2) a JSON file with the original values of
   only the changed rows, so the change can be reversed. Both files contain the secrets that were
   removed: they are written with mode 0600 and should be deleted once the scrub is confirmed.
   After applying it re-scans and fails if anything sensitive remains.

   Personal data (customer names, emails, addresses inside order snapshots) is reported but NOT
   changed: that depends on the retention decision (see RETENTION.md). Values are never printed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SECRET_KEYS = new Set(['passwordHash', 'password_hash', 'password', 'mfaSecret', 'mfa_secret', 'recoveryCodeHashes', 'recovery_codes_json', 'accessTokenHash', 'accessToken', 'pendingMfaSecret', 'csrf']);
const SECRET_VALUE = [/^scrypt\$/, /^enc:v1:/];
const PII_KEYS = new Set(['customer', 'shippingAddress', 'customerEmail', 'phone', 'line1', 'line2', 'postalCode']);
export const MARKER = '[REDACTED by scrub-audit-log v18]';

/* Returns { clean, secrets: [paths], pii: [paths] } without exposing values. */
export function inspect(value, trail = []) {
  const found = { secrets: [], pii: [] };
  const walk = (node, at) => {
    if (Array.isArray(node)) { node.forEach((item, index) => walk(item, [...at, index])); return; }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        const here = [...at, key];
        if (SECRET_KEYS.has(key) && child !== null && child !== MARKER && !(Array.isArray(child) && child.length === 0)) found.secrets.push(here.join('.'));
        else if (typeof child === 'string' && SECRET_VALUE.some(pattern => pattern.test(child))) found.secrets.push(here.join('.'));
        else {
          if (PII_KEYS.has(key) && child) found.pii.push(here.join('.'));
          walk(child, here);
        }
      }
    }
  };
  walk(value, trail);
  return found;
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (SECRET_KEYS.has(key) && child !== null && !(Array.isArray(child) && child.length === 0)) return [key, MARKER];
      if (typeof child === 'string' && SECRET_VALUE.some(pattern => pattern.test(child))) return [key, MARKER];
      return [key, redact(child)];
    }));
  }
  return value;
}

const parse = text => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

export function scan(db) {
  const rows = db.prepare('SELECT id, action, entity_type, created_at, before_json, after_json FROM audit_log ORDER BY id').all();
  const affected = [];
  let piiRows = 0;
  for (const row of rows) {
    const before = inspect(parse(row.before_json));
    const after = inspect(parse(row.after_json));
    const secrets = [...before.secrets.map(p => `before.${p}`), ...after.secrets.map(p => `after.${p}`)];
    if (before.pii.length || after.pii.length) piiRows += 1;
    if (secrets.length) affected.push({ id: row.id, action: row.action, entityType: row.entity_type, createdAt: row.created_at, fields: secrets });
  }
  return { total: rows.length, affected, piiRows };
}

function stamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }

function main() {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index > -1 ? args[index + 1] : undefined; };
  const dataDir = path.resolve(option('--data-dir') || process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  const dbFile = path.join(dataDir, 'verapep.sqlite');
  const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
  if (!fs.existsSync(dbFile)) { console.error(`No database at ${dbFile}.`); process.exit(1); }
  const db = new DatabaseSync(dbFile);
  const audit = (action, after) => db.prepare('INSERT INTO audit_log(actor_email, actor_role, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('cli', 'system', action, 'audit_log', 'scrub', null, JSON.stringify(after), new Date().toISOString());

  const restoreFile = option('--restore');
  if (restoreFile) {
    if (!args.includes('--yes')) { console.error('Restoring re-inserts the removed secrets. Re-run with --yes to confirm.'); process.exit(1); }
    const plan = JSON.parse(fs.readFileSync(path.resolve(restoreFile), 'utf8'));
    if (plan.kind !== 'verapep-audit-scrub' || !Array.isArray(plan.rows)) { console.error('Not an audit-scrub backup file.'); process.exit(2); }
    db.exec('BEGIN IMMEDIATE');
    try {
      const update = db.prepare('UPDATE audit_log SET before_json = ?, after_json = ? WHERE id = ?');
      for (const row of plan.rows) update.run(row.before_json, row.after_json, row.id);
      audit('audit_log.scrub_restored', { rows: plan.rows.length, from: path.basename(restoreFile) });
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    console.log(`Restored ${plan.rows.length} audit row(s) from ${path.basename(restoreFile)}.`);
    return;
  }

  const result = scan(db);
  if (args.includes('--json')) console.log(JSON.stringify({ ...result, affected: result.affected }, null, 2));
  else {
    console.log(`Audit log: ${result.total} row(s) scanned.`);
    console.log(`Rows with secrets (password hashes, MFA seeds, recovery codes, access tokens): ${result.affected.length}`);
    for (const row of result.affected) console.log(`  #${row.id}  ${row.createdAt}  ${row.action}  → ${row.fields.join(', ')}`);
    console.log(`Rows with customer personal data (kept; governed by the retention decision): ${result.piiRows}`);
  }
  if (!args.includes('--apply')) {
    if (result.affected.length) console.log('\nDry run only. Re-run with --apply --yes to back up and redact the secret fields.');
    return;
  }
  if (!result.affected.length) { console.log('Nothing to scrub.'); return; }
  if (!args.includes('--yes')) { console.error('Refusing to change the database without --yes.'); process.exit(1); }

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const id = `${stamp()}-${crypto.randomBytes(3).toString('hex')}`;
  const sqliteCopy = path.join(backupDir, `verapep-${id}-pre-audit-scrub.sqlite`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.prepare('VACUUM INTO ?').run(sqliteCopy);
  fs.chmodSync(sqliteCopy, 0o600);
  const ids = new Set(result.affected.map(row => row.id));
  const originals = db.prepare('SELECT id, before_json, after_json FROM audit_log ORDER BY id').all().filter(row => ids.has(row.id));
  const planFile = path.join(backupDir, `audit-scrub-${id}.json`);
  fs.writeFileSync(planFile, JSON.stringify({ kind: 'verapep-audit-scrub', createdAt: new Date().toISOString(), note: 'Contains the original secret values. Delete after the scrub is verified.', rows: originals }), { mode: 0o600, flag: 'wx' });

  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE audit_log SET before_json = ?, after_json = ? WHERE id = ?');
    for (const row of originals) {
      const before = parse(row.before_json); const after = parse(row.after_json);
      update.run(before === null ? row.before_json : JSON.stringify(redact(before)), after === null ? row.after_json : JSON.stringify(redact(after)), row.id);
    }
    audit('audit_log.scrubbed', { rows: originals.length, ids: [...ids] });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }

  const check = scan(db);
  if (check.affected.length) { console.error(`Post-check FAILED: ${check.affected.length} row(s) still contain secrets.`); process.exit(3); }
  console.log(`\nRedacted ${originals.length} row(s). Post-check: 0 rows with secrets.`);
  console.log(`Database copy: ${sqliteCopy}`);
  console.log(`Undo file:     ${planFile}  (node scripts/scrub-audit-log.mjs --restore <file> --yes)`);
  console.log('Both files contain the removed secrets (mode 0600). Delete them once the result is confirmed.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) main();
