import { getDb } from "./db";

export async function logQuery(q: {
  id: string;
  sessionId: string | null;
  text: string;
  normalized: string;
  page: string | null;
  app: string | null;
  outcome: string;
  guideId: string | null;
  confidence: number;
  usedAi: boolean;
}) {
  const db = await getDb();
  await db.query(
    `INSERT INTO queries (id, session_id, text, normalized, page, app, outcome, guide_id, confidence, used_ai)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [q.id, q.sessionId, q.text, q.normalized, q.page, q.app, q.outcome, q.guideId, q.confidence, q.usedAi],
  );
}

export async function logView(v: { sessionId: string | null; guideId: string; queryId: string | null; stepsViewed: number[] }) {
  const db = await getDb();
  await db.query("INSERT INTO guide_views (session_id, guide_id, query_id, steps_viewed) VALUES ($1,$2,$3,$4)", [
    v.sessionId,
    v.guideId,
    v.queryId,
    v.stepsViewed,
  ]);
}

export async function logFeedback(f: {
  sessionId: string | null;
  guideId: string | null;
  queryId: string | null;
  helpful: boolean;
  comment: string | null;
}) {
  const db = await getDb();
  await db.query("INSERT INTO feedback (session_id, guide_id, query_id, helpful, comment) VALUES ($1,$2,$3,$4,$5)", [
    f.sessionId,
    f.guideId,
    f.queryId,
    f.helpful,
    f.comment,
  ]);
}

export interface Insights {
  totals: { queries: number; answered: number; ambiguous: number; none: number; views: number; yes: number; no: number; tickets: number };
  topQueries: { text: string; count: number; outcome: string; guideId: string | null }[];
  unanswered: { text: string; count: number; lastAt: string }[];
  topGuides: { guideId: string; views: number }[];
  guideFeedback: { guideId: string; yes: number; no: number; noRate: number; flagged: boolean }[];
  recentComments: { guideId: string | null; comment: string; createdAt: string }[];
  ticketsAfterGuide: { guideId: string; count: number }[];
  tickets: { id: string; queryText: string | null; guideId: string | null; page: string | null; comment: string | null; contact: string | null; status: string; createdAt: string }[];
  pages: { page: string; count: number }[];
  suggestions: { kind: "create" | "improve"; text: string; count: number; guideId?: string }[];
}

/** Gränser för när systemet föreslår åtgärder. */
export const RECURRING_THRESHOLD = 3;
export const BAD_GUIDE_MIN_VOTES = 3;
export const BAD_GUIDE_NO_RATE = 0.4;

export async function getInsights(days = 30): Promise<Insights> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const n = (v: unknown) => Number(v ?? 0);

  const [t] = await db.query<Record<string, unknown>>(
    `SELECT
       (SELECT count(*) FROM queries WHERE created_at >= $1) AS queries,
       (SELECT count(*) FROM queries WHERE created_at >= $1 AND outcome='answered') AS answered,
       (SELECT count(*) FROM queries WHERE created_at >= $1 AND outcome='ambiguous') AS ambiguous,
       (SELECT count(*) FROM queries WHERE created_at >= $1 AND outcome='none') AS none,
       (SELECT count(*) FROM guide_views WHERE created_at >= $1) AS views,
       (SELECT count(*) FROM feedback WHERE created_at >= $1 AND helpful) AS yes,
       (SELECT count(*) FROM feedback WHERE created_at >= $1 AND NOT helpful) AS no,
       (SELECT count(*) FROM tickets WHERE created_at >= $1) AS tickets`,
    [since],
  );

  const topQueries = await db.query<{ text: string; count: number; outcome: string; guide_id: string | null }>(
    `SELECT min(text) AS text, count(*)::int AS count, mode() WITHIN GROUP (ORDER BY outcome) AS outcome,
            mode() WITHIN GROUP (ORDER BY guide_id) AS guide_id
     FROM queries WHERE created_at >= $1 GROUP BY normalized ORDER BY count DESC LIMIT 15`,
    [since],
  );

  const unanswered = await db.query<{ text: string; count: number; last_at: string }>(
    `SELECT min(text) AS text, count(*)::int AS count, max(created_at)::text AS last_at
     FROM queries WHERE created_at >= $1 AND outcome <> 'answered' GROUP BY normalized ORDER BY count DESC, last_at DESC LIMIT 20`,
    [since],
  );

  const topGuides = await db.query<{ guide_id: string; views: number }>(
    `SELECT guide_id, count(*)::int AS views FROM guide_views WHERE created_at >= $1 GROUP BY guide_id ORDER BY views DESC LIMIT 10`,
    [since],
  );

  const fb = await db.query<{ guide_id: string; yes: number; no: number }>(
    `SELECT guide_id, count(*) FILTER (WHERE helpful)::int AS yes, count(*) FILTER (WHERE NOT helpful)::int AS no
     FROM feedback WHERE created_at >= $1 AND guide_id IS NOT NULL GROUP BY guide_id ORDER BY no DESC, yes ASC LIMIT 15`,
    [since],
  );
  const guideFeedback = fb.map((r) => {
    const total = r.yes + r.no;
    const noRate = total ? r.no / total : 0;
    return { guideId: r.guide_id, yes: r.yes, no: r.no, noRate, flagged: total >= BAD_GUIDE_MIN_VOTES && noRate >= BAD_GUIDE_NO_RATE };
  });

  const recentComments = await db.query<{ guide_id: string | null; comment: string; created_at: string }>(
    `SELECT guide_id, comment, created_at::text FROM feedback
     WHERE created_at >= $1 AND comment IS NOT NULL AND comment <> '' ORDER BY created_at DESC LIMIT 10`,
    [since],
  );

  const ticketsAfterGuide = await db.query<{ guide_id: string; count: number }>(
    `SELECT guide_id, count(*)::int AS count FROM tickets WHERE created_at >= $1 AND guide_id IS NOT NULL
     GROUP BY guide_id ORDER BY count DESC LIMIT 10`,
    [since],
  );

  const tickets = await db.query<{
    id: string; query_text: string | null; guide_id: string | null; page: string | null; comment: string | null; contact: string | null; status: string; created_at: string;
  }>(`SELECT id, query_text, guide_id, page, comment, contact, status, created_at::text FROM tickets ORDER BY created_at DESC LIMIT 20`);

  const pages = await db.query<{ page: string; count: number }>(
    `SELECT page, count(*)::int AS count FROM queries WHERE created_at >= $1 AND page IS NOT NULL GROUP BY page ORDER BY count DESC LIMIT 10`,
    [since],
  );

  const suggestions: Insights["suggestions"] = [
    ...unanswered
      .filter((u) => u.count >= RECURRING_THRESHOLD)
      .map((u) => ({ kind: "create" as const, text: u.text, count: u.count })),
    ...guideFeedback
      .filter((g) => g.flagged)
      .map((g) => ({ kind: "improve" as const, text: g.guideId, count: g.no, guideId: g.guideId })),
  ];

  return {
    totals: {
      queries: n(t.queries), answered: n(t.answered), ambiguous: n(t.ambiguous), none: n(t.none),
      views: n(t.views), yes: n(t.yes), no: n(t.no), tickets: n(t.tickets),
    },
    topQueries: topQueries.map((r) => ({ text: r.text, count: r.count, outcome: r.outcome, guideId: r.guide_id })),
    unanswered: unanswered.map((r) => ({ text: r.text, count: r.count, lastAt: r.last_at })),
    topGuides: topGuides.map((r) => ({ guideId: r.guide_id, views: r.views })),
    guideFeedback,
    recentComments: recentComments.map((r) => ({ guideId: r.guide_id, comment: r.comment, createdAt: r.created_at })),
    ticketsAfterGuide: ticketsAfterGuide.map((r) => ({ guideId: r.guide_id, count: r.count })),
    tickets: tickets.map((r) => ({
      id: r.id, queryText: r.query_text, guideId: r.guide_id, page: r.page, comment: r.comment, contact: r.contact, status: r.status, createdAt: r.created_at,
    })),
    pages,
    suggestions,
  };
}
