import path from "node:path";
import fs from "node:fs";

/**
 * Minimal databasadapter.
 * - DATABASE_URL tom        → PGlite (Postgres i processen) i .data/pglite
 * - DATABASE_URL=memory://  → PGlite i minnet (tester)
 * - DATABASE_URL=postgres://… → riktig Postgres (produktion)
 * Samma SQL körs i alla tre lägena.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS guides (
  id          text PRIMARY KEY,
  status      text NOT NULL DEFAULT 'draft',
  category    text NOT NULL,
  app         text NOT NULL,
  number      integer NOT NULL DEFAULT 0,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guide_embeddings (
  guide_id  text PRIMARY KEY REFERENCES guides(id) ON DELETE CASCADE,
  version   integer NOT NULL,
  model     text NOT NULL,
  vector    jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS queries (
  id          text PRIMARY KEY,
  session_id  text,
  text        text NOT NULL,
  normalized  text NOT NULL,
  page        text,
  app         text,
  outcome     text NOT NULL,
  guide_id    text,
  confidence  real NOT NULL DEFAULT 0,
  used_ai     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS queries_created_idx ON queries (created_at);

CREATE TABLE IF NOT EXISTS guide_views (
  id            serial PRIMARY KEY,
  session_id    text,
  guide_id      text NOT NULL,
  query_id      text,
  steps_viewed  jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id          serial PRIMARY KEY,
  session_id  text,
  guide_id    text,
  query_id    text,
  helpful     boolean NOT NULL,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id            text PRIMARY KEY,
  session_id    text,
  query_text    text,
  guide_id      text,
  page          text,
  steps_viewed  jsonb NOT NULL DEFAULT '[]',
  comment       text,
  contact       text,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now()
);
`;

/** Objekt och listor skickas som JSON-strängar så att jsonb-kolumner fungerar likadant i båda drivrutinerna. */
function toParam(v: unknown) {
  return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
}

async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pg.query<T>(sql, params.map(toParam));
      return res.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
  };
}

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 5, prepare: false });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params.map(toParam) as never[])) as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
  };
}

type Holder = { promise?: Promise<Db> };
const holder: Holder = ((globalThis as unknown as { __lupHelpDb?: Holder }).__lupHelpDb ??= {});

export function getDb(): Promise<Db> {
  if (!holder.promise) {
    holder.promise = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      let db: Db;
      if (!url) db = await createPglite(path.join(process.cwd(), ".data", "pglite"));
      else if (url === "memory://") db = await createPglite();
      else db = await createPostgres(url);
      await db.exec(SCHEMA);
      const { seedIfEmpty } = await import("./seed");
      await seedIfEmpty(db);
      return db;
    })();
    holder.promise.catch(() => (holder.promise = undefined));
  }
  return holder.promise;
}

/** Endast för tester: börja om med en ny databas. */
export function resetDbForTests() {
  holder.promise = undefined;
}
