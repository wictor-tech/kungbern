/* Retention report and (only after approval) clean-up (v18).

   node scripts/retention.mjs [--data-dir DIR] [--json]   report what is older than the policy
   node scripts/retention.mjs --apply --yes                act — refused while the policy in
                                                            data/retention-policy.json is not approved

   Actions when approved: delete outbox messages and backup files past their period, delete
   rejected/hidden reviews past their period and pseudonymise customer details inside audit-log
   order snapshots past their period. Orders themselves are only reported, never deleted. */
import { refuseWhileServerRuns } from '../lib/server-lock.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DAY = 24 * 60 * 60 * 1000;

export function loadPolicy(dataDir, root = process.cwd()) {
  const candidates = [path.join(dataDir, 'retention-policy.json'), path.join(root, 'data', 'retention-policy.json')];
  const file = candidates.find(item => fs.existsSync(item));
  if (!file) throw new Error('No retention-policy.json found.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pseudonymiseOrderSnapshot(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(pseudonymiseOrderSnapshot);
  const copy = { ...value };
  if (copy.customer && typeof copy.customer === 'object') {
    const email = String(copy.customer.email || '').toLowerCase();
    copy.customer = { pseudonym: email ? `cust_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 12)}` : null };
  }
  if (copy.shippingAddress) copy.shippingAddress = { country: copy.shippingAddress.country || null };
  if (copy.customerEmail) copy.customerEmail = '[pseudonymised]';
  for (const [key, child] of Object.entries(copy)) if (child && typeof child === 'object' && key !== 'customer' && key !== 'shippingAddress') copy[key] = pseudonymiseOrderSnapshot(child);
  return copy;
}

export function report(dataDir, policy, now = Date.now()) {
  const rules = policy.rules;
  const ageDays = iso => (now - Date.parse(iso)) / DAY;
  const out = {};
  const outbox = path.join(dataDir, 'outbox');
  out.outbox = fs.existsSync(outbox) ? fs.readdirSync(outbox).filter(name => name.endsWith('.json')).filter(name => (now - fs.statSync(path.join(outbox, name)).mtimeMs) / DAY > rules.outboxDays) : [];
  const backups = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
  out.backups = fs.existsSync(backups) ? fs.readdirSync(backups).filter(name => /\.(sqlite|json)$/.test(name) || /-documents$/.test(name)).filter(name => (now - fs.statSync(path.join(backups, name)).mtimeMs) / DAY > rules.backupDays) : [];
  const db = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'), { readOnly: true });
  const doc = key => { const row = db.prepare('SELECT value_json FROM documents WHERE key = ?').get(key); return row ? JSON.parse(row.value_json) : null; };
  const reviews = doc('reviews')?.reviews || [];
  out.rejectedReviews = reviews.filter(review => ['rejected', 'hidden'].includes(review.status) && ageDays(review.moderatedAt || review.createdAt) > rules.rejectedReviewDays).map(review => review.id);
  const orders = doc('orders') || [];
  out.unpaidCancelledOrders = orders.filter(order => order.orderStatus === 'cancelled' && order.paymentStatus !== 'paid' && ageDays(order.createdAt) > rules.unpaidCancelledOrderDays).map(order => order.id);
  out.paidOrdersPastRetention = orders.filter(order => ['paid', 'refunded'].includes(order.paymentStatus) && ageDays(order.createdAt) > rules.paidOrderYears * 365).map(order => order.id);
  out.auditRowsWithOldPersonalData = db.prepare("SELECT id, created_at, after_json, before_json FROM audit_log WHERE entity_type IN ('order','withdrawal','customer')").all()
    .filter(row => ageDays(row.created_at) > rules.auditPersonalDataDays && /"(customer|customerEmail|shippingAddress)"/.test(`${row.before_json || ''}${row.after_json || ''}`)).map(row => row.id);
  db.close();
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--data-dir');
  const dataDir = path.resolve(index > -1 ? args[index + 1] : process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  if (!fs.existsSync(path.join(dataDir, 'verapep.sqlite'))) { console.error(`No database in ${dataDir}.`); process.exit(1); }
  const policy = loadPolicy(dataDir);
  const found = report(dataDir, policy);
  if (args.includes('--json')) console.log(JSON.stringify({ approved: policy.approved === true, rules: policy.rules, found }, null, 2));
  else {
    console.log(`Retention policy: ${policy.approved === true ? `APPROVED by ${policy.approvedBy} on ${policy.approvedAt}` : 'PROPOSED (not approved — report only)'}`);
    for (const [key, items] of Object.entries(found)) console.log(`  ${key.padEnd(30)} ${items.length}`);
    console.log('Orders are never deleted by this tool (accounting retention); unpaid cancelled orders are reported for a manual decision.');
  }
  if (!args.includes('--apply')) return;
  if (policy.approved !== true || !policy.approvedBy) { console.error('Refused: the retention policy has not been approved. Set approved=true, approvedBy and approvedAt after legal review.'); process.exit(2); }
  if (!args.includes('--yes')) { console.error('Refusing to delete or pseudonymise without --yes.'); process.exit(1); }
  refuseWhileServerRuns(dataDir, 'applying retention');
  const db = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'));
  const backups = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
  fs.mkdirSync(backups, { recursive: true });
  const copy = path.join(backups, `verapep-${new Date().toISOString().replace(/[:.]/g, '-')}-pre-retention.sqlite`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.prepare('VACUUM INTO ?').run(copy);
  for (const name of found.outbox) fs.rmSync(path.join(dataDir, 'outbox', name), { force: true });
  for (const name of found.backups) fs.rmSync(path.join(backups, name), { force: true, recursive: true });
  db.exec('BEGIN IMMEDIATE');
  try {
    if (found.rejectedReviews.length) {
      const row = db.prepare("SELECT value_json FROM documents WHERE key = 'reviews'").get();
      const reviews = JSON.parse(row.value_json);
      const remove = new Set(found.rejectedReviews);
      reviews.reviews = reviews.reviews.filter(review => !remove.has(review.id));
      db.prepare("UPDATE documents SET value_json = ?, updated_at = ? WHERE key = 'reviews'").run(JSON.stringify(reviews), new Date().toISOString());
    }
    const update = db.prepare('UPDATE audit_log SET before_json = ?, after_json = ? WHERE id = ?');
    for (const id of found.auditRowsWithOldPersonalData) {
      const row = db.prepare('SELECT before_json, after_json FROM audit_log WHERE id = ?').get(id);
      const fix = text => text ? JSON.stringify(pseudonymiseOrderSnapshot(JSON.parse(text))) : text;
      update.run(fix(row.before_json), fix(row.after_json), id);
    }
    db.prepare('INSERT INTO audit_log(actor_email, actor_role, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('cli', 'system', 'retention.applied', 'retention', 'policy', null, JSON.stringify(Object.fromEntries(Object.entries(found).map(([key, items]) => [key, items.length]))), new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  console.log(`Applied. Pre-change copy: ${copy}. Note: backups older than the period were deleted except this new copy.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) main();
