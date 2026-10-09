/* VERAPEP v17 — versioned Ask Vera knowledge-base migration.

   Problem: the knowledge base is seeded into SQLite only on first start, so
   databases created by earlier versions keep older answers forever.

   This module compares the stored knowledge base with the shipped one and
   produces an explicit plan. It only replaces an entry when the stored text
   is *byte-for-byte a previously shipped version* (identified by content
   hash in data/support-kb-history.json, so entries renamed to kb-1, kb-2 by
   the old admin editor are still recognised). Anything an admin wrote or
   edited, and anything marked "locked", is kept. Shipped entries an admin
   deliberately removed are not re-added.

   Applying is idempotent (a second run finds nothing to change), always
   writes a JSON snapshot first, and can be rolled back from that snapshot.
   Nothing runs automatically: the server only reports that updates exist. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MIGRATION_ID = 'support-kb-17.0';
const SNAPSHOT_KIND = 'verapep-support-kb-snapshot';
const SNAPSHOT_NAME = /^support-kb-\d{8}T\d{6}Z-[a-f0-9]{6}\.json$/;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function hashEntry(entry = {}) {
  const identity = Array.isArray(entry.keywords) && entry.keywords.length
    ? { k: 'v3', title: clean(entry.title), keywords: entry.keywords.map(clean), answer: clean(entry.answer), url: clean(entry.url) }
    : { k: 'v2', question: clean(entry.question), answer: clean(entry.answer), url: clean(entry.url) };
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function hashText(value) {
  return crypto.createHash('sha256').update(clean(value)).digest('hex');
}

export function loadShipped(rootDir) {
  const shipped = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'support-kb.json'), 'utf8'));
  const history = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'support-kb-history.json'), 'utf8'));
  return { shipped, history };
}

/* Builds hash → shipped id lookups for every previously shipped answer. */
function knownVersions(history) {
  const entryHashes = new Map();
  const keywordHashes = new Map();
  for (const [id, versions] of Object.entries(history.entries || {})) {
    for (const version of versions) {
      entryHashes.set(version.hash, { id, release: version.release });
      if (version.keywordsHash) keywordHashes.set(version.keywordsHash, { id, release: version.release });
    }
  }
  const fallbackHashes = new Set((history.fallbacks || []).map(item => item.hash));
  return { entryHashes, keywordHashes, fallbackHashes };
}

export function planMigration(current, shipped, history) {
  const { entryHashes, keywordHashes, fallbackHashes } = knownVersions(history);
  const shippedById = new Map(shipped.entries.map(entry => [entry.id, entry]));
  const shippedHashById = new Map(shipped.entries.map(entry => [entry.id, hashEntry(entry)]));
  const removed = new Set(current?.removedShippedIds || []);
  const entries = Array.isArray(current?.entries) ? current.entries : [];
  const changes = [];
  const covered = new Set();

  for (const entry of entries) {
    const hash = hashEntry(entry);
    const previous = entryHashes.get(hash);
    // Same keywords as a shipped answer but different text = an admin's edit of that answer.
    const editedFrom = !previous ? keywordHashes.get(hashText(Array.isArray(entry.keywords) && entry.keywords.length ? entry.keywords.join(' ') : entry.question)) : null;
    const shippedId = shippedById.has(entry.id) ? entry.id : (previous?.id || (editedFrom && shippedById.has(editedFrom.id) ? editedFrom.id : undefined));
    if (shippedId) covered.add(shippedId);
    const base = { currentId: entry.id, title: entry.title || shippedById.get(shippedId)?.title || entry.question || entry.id };
    if (entry.locked === true) {
      changes.push({ ...base, action: 'keep_locked', id: entry.id, reason: 'Marked "keep my wording" by an admin.' });
    } else if (shippedId && shippedHashById.get(shippedId) === hash) {
      changes.push({ ...base, action: entry.id === shippedId ? 'unchanged' : 'rename', id: shippedId, reason: entry.id === shippedId ? 'Already the current answer.' : `Current answer stored under id "${entry.id}"; id restored to "${shippedId}".` });
    } else if (previous && shippedById.has(previous.id)) {
      changes.push({ ...base, action: 'update', id: previous.id, reason: `Outdated answer from ${previous.release}; replaced with the v17 answer.`, before: { answer: entry.answer, url: entry.url || '' }, after: { answer: shippedById.get(previous.id).answer, url: shippedById.get(previous.id).url || '' } });
    } else if (shippedId) {
      changes.push({ ...base, action: 'keep_customised', id: entry.id, reason: 'This answer was edited by an admin; it is kept. Compare it with the shipped wording and update it manually if needed.', before: { answer: entry.answer, url: entry.url || '' }, shipped: { answer: shippedById.get(shippedId).answer, url: shippedById.get(shippedId).url || '' } });
    } else {
      changes.push({ ...base, action: 'keep_custom', id: entry.id, reason: 'Added by an admin; kept as is.' });
    }
  }

  for (const entry of shipped.entries) {
    if (covered.has(entry.id)) continue;
    if (removed.has(entry.id)) changes.push({ action: 'skip_removed', id: entry.id, title: entry.title, reason: 'Removed by an admin earlier; not re-added.' });
    else changes.push({ action: 'add', id: entry.id, title: entry.title, reason: 'New answer in v17.', after: { answer: entry.answer, url: entry.url || '' } });
  }

  const fallbackHash = hashText(current?.fallback);
  let fallback = { action: 'unchanged' };
  if (current?.fallback === undefined || current?.fallback === null || fallbackHashes.has(fallbackHash)) {
    if (fallbackHash !== hashText(shipped.fallback)) fallback = { action: 'update', before: current?.fallback ?? null, after: shipped.fallback, reason: 'Outdated default fallback text.' };
  } else if (fallbackHash !== hashText(shipped.fallback)) {
    fallback = { action: 'keep_custom', before: current.fallback, reason: 'Fallback text was edited by an admin; kept.' };
  }

  const writes = changes.filter(change => ['update', 'add', 'rename'].includes(change.action)).length + (fallback.action === 'update' ? 1 : 0);
  const schemaUpgrade = Number(current?.version || 0) < Number(shipped.version);
  const counts = changes.reduce((acc, change) => ({ ...acc, [change.action]: (acc[change.action] || 0) + 1 }), {});
  return {
    migration: MIGRATION_ID,
    from: { version: current?.version ?? null, contentVersion: current?.contentVersion ?? null },
    to: { version: shipped.version, contentVersion: shipped.contentVersion },
    upToDate: writes === 0 && !schemaUpgrade,
    writes: writes + (schemaUpgrade && writes === 0 ? 1 : 0),
    schemaUpgrade,
    counts,
    changes,
    fallback
  };
}

/* Returns the new document. Pure: the caller persists it (after snapshotting). */
export function applyPlan(current, shipped, plan, meta = {}) {
  const shippedById = new Map(shipped.entries.map(entry => [entry.id, entry]));
  const currentById = new Map((current?.entries || []).map(entry => [entry.id, entry]));
  const result = [];
  const take = shippedEntry => ({ ...structuredClone(shippedEntry), question: shippedEntry.keywords.join(' '), origin: 'shipped' });
  // Shipped answers first, in shipped order; then everything admins added.
  for (const shippedEntry of shipped.entries) {
    const change = plan.changes.find(item => item.id === shippedEntry.id && ['unchanged', 'rename', 'update', 'add'].includes(item.action));
    const kept = plan.changes.find(item => item.id === shippedEntry.id && ['keep_locked', 'keep_customised'].includes(item.action));
    // An admin's wording always wins over a shipped answer for the same id.
    if (kept) result.push(currentById.get(kept.currentId));
    else if (change) result.push(take(shippedEntry));
  }
  const placed = new Set(result.map(entry => entry.id));
  for (const change of plan.changes) {
    if (['keep_custom', 'keep_locked', 'keep_customised'].includes(change.action) && !placed.has(change.currentId)) {
      result.push(currentById.get(change.currentId));
      placed.add(change.currentId);
    }
  }
  return {
    ...structuredClone(current || {}),
    version: shipped.version,
    contentVersion: shipped.contentVersion,
    entries: result.filter(Boolean),
    fallback: plan.fallback.action === 'update' ? shipped.fallback : (current?.fallback ?? shipped.fallback),
    removedShippedIds: current?.removedShippedIds || [],
    migrations: [...(current?.migrations || []), { id: MIGRATION_ID, appliedAt: new Date().toISOString(), by: meta.by || 'cli', snapshot: meta.snapshot || null, counts: plan.counts, fallback: plan.fallback.action }]
  };
}

export function snapshotDir(dataDir) {
  return path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
}

export function writeSnapshot(dataDir, document, reason) {
  const dir = snapshotDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `support-kb-${stamp}-${crypto.randomBytes(3).toString('hex')}.json`;
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify({ kind: SNAPSHOT_KIND, createdAt: new Date().toISOString(), reason, document }, null, 2)}\n`, { flag: 'wx' });
  return name;
}

export function listSnapshots(dataDir) {
  const dir = snapshotDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => SNAPSHOT_NAME.test(name)).sort().reverse().map(name => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      return { name, createdAt: data.createdAt, reason: data.reason, entries: data.document?.entries?.length ?? 0, contentVersion: data.document?.contentVersion ?? null };
    } catch {
      return { name, error: 'unreadable' };
    }
  });
}

export function readSnapshot(dataDir, name) {
  if (!SNAPSHOT_NAME.test(String(name || ''))) throw Object.assign(new Error('Unknown snapshot name.'), { status: 400, code: 'invalid_snapshot' });
  const file = path.join(snapshotDir(dataDir), name);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Snapshot not found.'), { status: 404, code: 'snapshot_not_found' });
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.kind !== SNAPSHOT_KIND || !Array.isArray(data.document?.entries)) throw Object.assign(new Error('Not a knowledge-base snapshot.'), { status: 400, code: 'invalid_snapshot' });
  return data.document;
}
