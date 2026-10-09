import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function nowIso() { return new Date().toISOString(); }
function json(value) { return JSON.stringify(value ?? null); }
function parse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, expected] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

export class VerapepDatabase {
  constructor({ dataDir, seedFiles = {}, defaultAdmin }) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'verapep.sqlite');
    // v20: wait up to 5 s for a lock held by a maintenance script instead of failing at once.
    this.db = new DatabaseSync(this.filePath, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_email TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
      CREATE TABLE IF NOT EXISTS admin_users (
        email TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','support')),
        password_hash TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        mfa_secret TEXT,
        mfa_enabled INTEGER NOT NULL DEFAULT 0,
        recovery_codes_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_events (
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(provider, event_id)
      );
    `);

    const adminColumns = new Set(this.db.prepare('PRAGMA table_info(admin_users)').all().map(row => row.name));
    if (!adminColumns.has('mfa_secret')) this.db.exec('ALTER TABLE admin_users ADD COLUMN mfa_secret TEXT');
    if (!adminColumns.has('mfa_enabled')) this.db.exec('ALTER TABLE admin_users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0');
    if (!adminColumns.has('recovery_codes_json')) this.db.exec('ALTER TABLE admin_users ADD COLUMN recovery_codes_json TEXT');

    const readSeed = file => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (error) { throw new Error(`Could not seed database from ${file}: ${error.message}`); }
    };
    const insertDocument = this.db.prepare('INSERT OR IGNORE INTO documents(key, value_json, updated_at) VALUES (?, ?, ?)');
    for (const [key, file] of Object.entries(seedFiles)) {
      if (file && fs.existsSync(file)) insertDocument.run(key, json(readSeed(file)), nowIso());
    }

    const userCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count || 0);
    if (userCount === 0 && defaultAdmin) {
      const at = nowIso();
      this.db.prepare('INSERT INTO admin_users(email, display_name, role, password_hash, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .run(String(defaultAdmin.email).toLowerCase(), defaultAdmin.displayName || 'Store owner', defaultAdmin.role || 'owner', hashPassword(defaultAdmin.password), at, at);
    }
  }

  readDocument(key, fallback) {
    const row = this.db.prepare('SELECT value_json FROM documents WHERE key = ?').get(key);
    return row ? parse(row.value_json, fallback) : fallback;
  }

  writeDocument(key, value) {
    this.db.prepare(`INSERT INTO documents(key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
      .run(key, json(value), nowIso());
  }

  writeDocuments(entries) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [key, value] of Object.entries(entries)) this.writeDocument(key, value);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  addAudit({ actorEmail, actorRole, action, entityType, entityId = null, before = null, after = null }) {
    this.db.prepare(`INSERT INTO audit_log(actor_email, actor_role, action, entity_type, entity_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(actorEmail || 'system', actorRole || 'system', action, entityType, entityId, before === null ? null : json(before), after === null ? null : json(after), nowIso());
  }

  listAudit(limit = 200) {
    return this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(Math.max(1, Math.min(1000, Number(limit) || 200))).map(row => ({
      id: row.id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before_json ? parse(row.before_json) : null,
      after: row.after_json ? parse(row.after_json) : null,
      createdAt: row.created_at
    }));
  }

  /* v19: audit entries for one entity (product history in the admin workspace). */
  listAuditFor(entityType, entityId, limit = 100) {
    return this.db.prepare('SELECT id, actor_email, actor_role, action, created_at, after_json FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT ?')
      .all(entityType, entityId, Math.max(1, Math.min(500, Number(limit) || 100)))
      .map(row => ({ id: row.id, actorEmail: row.actor_email, actorRole: row.actor_role, action: row.action, createdAt: row.created_at }));
  }

  /* v19: health information for the owner overview. */
  health() {
    const check = this.db.prepare('PRAGMA quick_check').all().map(row => Object.values(row)[0]);
    const pageCount = Number(this.db.prepare('PRAGMA page_count').get().page_count || 0);
    const pageSize = Number(this.db.prepare('PRAGMA page_size').get().page_size || 0);
    const auditRows = Number(this.db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count || 0);
    return { integrity: check.length === 1 && check[0] === 'ok' ? 'ok' : check.slice(0, 3).join('; '), bytes: pageCount * pageSize, auditRows };
  }

  listUsers() {
    return this.db.prepare('SELECT email, display_name, role, enabled, mfa_enabled, created_at, updated_at FROM admin_users ORDER BY email').all().map(row => ({
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      enabled: row.enabled === 1,
      mfaEnabled: row.mfa_enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  findUser(email) {
    const row = this.db.prepare('SELECT * FROM admin_users WHERE email = ?').get(String(email || '').toLowerCase());
    if (!row) return null;
    return { email: row.email, displayName: row.display_name, role: row.role, passwordHash: row.password_hash, enabled: row.enabled === 1, mfaSecret: row.mfa_secret || null, mfaEnabled: row.mfa_enabled === 1, recoveryCodeHashes: parse(row.recovery_codes_json, []), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  setUserMfa(email, { secret, enabled, recoveryCodeHashes = [] }) {
    const normalisedEmail = String(email || '').trim().toLowerCase();
    const result = this.db.prepare('UPDATE admin_users SET mfa_secret = ?, mfa_enabled = ?, recovery_codes_json = ?, updated_at = ? WHERE email = ?')
      .run(secret || null, enabled ? 1 : 0, json(recoveryCodeHashes), nowIso(), normalisedEmail);
    if (!Number(result.changes || 0)) throw new Error('Admin user not found.');
    return this.findUser(normalisedEmail);
  }

  consumeRecoveryCode(email, codeHash) {
    const user = this.findUser(email);
    if (!user || !Array.isArray(user.recoveryCodeHashes)) return false;
    const index = user.recoveryCodeHashes.indexOf(String(codeHash));
    if (index < 0) return false;
    const next = [...user.recoveryCodeHashes];
    next.splice(index, 1);
    this.db.prepare('UPDATE admin_users SET recovery_codes_json = ?, updated_at = ? WHERE email = ?')
      .run(json(next), nowIso(), user.email);
    return true;
  }

  upsertUser({ email, displayName, role, password, enabled = true }) {
    const normalisedEmail = String(email || '').trim().toLowerCase();
    const existing = this.findUser(normalisedEmail);
    const at = nowIso();
    const passwordHash = password ? hashPassword(password) : existing?.passwordHash;
    if (!passwordHash) throw new Error('A password is required for a new admin user.');
    this.db.prepare(`INSERT INTO admin_users(email, display_name, role, password_hash, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, role=excluded.role, password_hash=excluded.password_hash, enabled=excluded.enabled, updated_at=excluded.updated_at`)
      .run(normalisedEmail, displayName || normalisedEmail, role, passwordHash, enabled ? 1 : 0, existing?.createdAt || at, at);
    return this.findUser(normalisedEmail);
  }

  getIdempotent(scope, key) {
    const row = this.db.prepare('SELECT response_json FROM idempotency_keys WHERE scope = ? AND key = ?').get(scope, key);
    return row ? parse(row.response_json) : null;
  }

  putIdempotent(scope, key, response) {
    this.db.prepare('INSERT OR IGNORE INTO idempotency_keys(key, scope, response_json, created_at) VALUES (?, ?, ?, ?)')
      .run(key, scope, json(response), nowIso());
  }

  hasPaymentEvent(provider, eventId) {
    return Boolean(this.db.prepare('SELECT 1 AS found FROM payment_events WHERE provider = ? AND event_id = ?').get(provider, eventId));
  }

  recordPaymentEvent(provider, eventId, payload) {
    const result = this.db.prepare('INSERT OR IGNORE INTO payment_events(provider, event_id, payload_json, created_at) VALUES (?, ?, ?, ?)')
      .run(provider, eventId, json(payload), nowIso());
    return Number(result.changes || 0) > 0;
  }

  /* v17: consistent online copy of the whole database (used before bulk changes). */
  backupTo(file) {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.db.exec(`VACUUM INTO '${String(file).replaceAll("'", "''")}'`);
    return file;
  }

  close() { this.db.close(); }
}
