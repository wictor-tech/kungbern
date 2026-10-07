import type { AnalyticsReport, Guide, HelpEvent, Ticket } from "../../shared/types.js";
import type { Config } from "./config.js";
import type { SearchEngine } from "./search/engine.js";

const MS_DAY = 86_400_000;

function jaccard(a: Set<string>, b: Set<string>) {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  const u = a.size + b.size - i;
  return u ? i / u : 0;
}

export function buildReport(
  events: HelpEvent[], guides: Guide[], tickets: Ticket[], engine: SearchEngine, cfg: Config, sinceDays = 30, now = Date.now(),
): AnalyticsReport {
  const since = now - sinceDays * MS_DAY;
  const ev = events.filter((e) => Date.parse(e.ts) >= since);
  const title = (id?: string) => guides.find((g) => g.id === id)?.title ?? id ?? "";
  const asks = ev.filter((e) => e.type === "ask" && e.q);
  const fb = ev.filter((e) => e.type === "feedback");

  // Vanligaste frågor – grupperade på normaliserad signatur
  const groups = new Map<string, { q: string; qs: Map<string, number>; count: number; guideIds: Map<string, number>; terms: Set<string> }>();
  for (const a of asks) {
    const sig = engine.signature(a.q!) || a.q!.toLowerCase();
    let g = groups.get(sig);
    if (!g) groups.set(sig, (g = { q: a.q!, qs: new Map(), count: 0, guideIds: new Map(), terms: engine.termSet(a.q!) }));
    g.count++;
    g.qs.set(a.q!, (g.qs.get(a.q!) ?? 0) + 1);
    if (a.guideId && a.quality !== "none") g.guideIds.set(a.guideId, (g.guideIds.get(a.guideId) ?? 0) + 1);
  }
  const clusters = [...groups.values()].map((g) => ({
    ...g, q: [...g.qs].sort((a, b) => b[1] - a[1])[0][0],
    guideId: [...g.guideIds].sort((a, b) => b[1] - a[1])[0]?.[0],
  }));
  clusters.sort((a, b) => b.count - a.count);

  // Slå ihop nära kluster (t.ex. "ladda upp bild" / "byta bild") för förbättringsförslag
  const merged: { terms: Set<string>; count: number; examples: Set<string>; guides: Map<string, number>; noneCount: number; q: string }[] = [];
  for (const c of clusters) {
    const noneCount = asks.filter((a) => a.q === c.q && a.quality === "none").length;
    const hit = merged.find((m) => jaccard(m.terms, c.terms) >= 0.6);
    if (hit) {
      hit.count += c.count; hit.noneCount += noneCount;
      [...c.qs.keys()].forEach((q) => hit.examples.add(q));
      if (c.guideId) hit.guides.set(c.guideId, (hit.guides.get(c.guideId) ?? 0) + c.count);
    } else {
      merged.push({ terms: c.terms, count: c.count, examples: new Set(c.qs.keys()), guides: new Map(c.guideId ? [[c.guideId, c.count]] : []), noneCount, q: c.q });
    }
  }

  const unansweredMap = new Map<string, number>();
  for (const a of asks) if (a.quality === "none") unansweredMap.set(a.q!.toLowerCase(), (unansweredMap.get(a.q!.toLowerCase()) ?? 0) + 1);

  // Guider
  const guideStats = new Map<string, { views: number; yes: number; no: number }>();
  const st = (id: string) => guideStats.get(id) ?? (guideStats.set(id, { views: 0, yes: 0, no: 0 }), guideStats.get(id)!);
  for (const e of ev) {
    if (!e.guideId) continue;
    if (e.type === "view") st(e.guideId).views++;
    if (e.type === "feedback") (e.helped ? (st(e.guideId).yes++) : (st(e.guideId).no++));
  }
  const topGuides = [...guideStats].map(([guideId, s]) => ({ guideId, title: title(guideId), ...s })).sort((a, b) => b.views - a.views);
  const badGuides = topGuides
    .map((g) => ({ ...g, noRate: g.yes + g.no ? g.no / (g.yes + g.no) : 0 }))
    .filter((g) => g.yes + g.no >= cfg.badGuideMinViews && g.noRate >= cfg.badGuideRate)
    .sort((a, b) => b.noRate - a.noRate);

  // Svåra funktioner: frågor och "nej" per sida
  const pages = new Map<string, { questions: number; no: number }>();
  for (const e of ev) {
    if (!e.page) continue;
    const p = pages.get(e.page) ?? { questions: 0, no: 0 };
    if (e.type === "ask") p.questions++;
    if (e.type === "feedback" && e.helped === false) p.no++;
    pages.set(e.page, p);
  }
  const hardPages = [...pages].map(([page, v]) => ({ page, ...v })).sort((a, b) => b.questions + b.no * 2 - (a.questions + a.no * 2));

  // Förbättringsförslag
  const suggestions: AnalyticsReport["suggestions"] = [];
  for (const m of merged) {
    if (m.count < cfg.recurringThreshold) continue;
    const gid = [...m.guides].sort((a, b) => b[1] - a[1])[0]?.[0];
    const examples = [...m.examples].slice(0, 4);
    const bad = gid ? badGuides.find((b) => b.guideId === gid) : undefined;
    if (!gid || m.noneCount / m.count > 0.5) {
      suggestions.push({ kind: "create", count: m.count, examples, text: `${m.count} användare frågar "${m.q}" utan att få bra svar. Skapa en guide?` });
    } else if (bad) {
      suggestions.push({ kind: "improve", count: m.count, guideId: gid, examples, text: `"${m.q}" är återkommande (${m.count} ggr) och guiden "${title(gid)}" får ${Math.round(bad.noRate * 100)} % Nej. Förbättra guiden?` });
    } else {
      suggestions.push({ kind: "improve", count: m.count, guideId: gid, examples, text: `Detta verkar vara ett återkommande ämne (${m.count} ggr: "${m.q}"). Överväg att förenkla funktionen eller göra guiden "${title(gid)}" lättare att hitta.` });
    }
  }
  suggestions.sort((a, b) => b.count - a.count);

  // Supportärenden som en guide kunde ha löst
  const deflectable = tickets.filter((t) => t.deflectable && Date.parse(t.createdAt) >= since);

  const yes = fb.filter((e) => e.helped).length;
  const no = fb.filter((e) => e.helped === false).length;
  const answered = asks.filter((a) => a.quality !== "none").length;

  // Dagsserie
  const days = new Map<string, { questions: number; no: number }>();
  for (let i = sinceDays - 1; i >= 0; i--) days.set(new Date(now - i * MS_DAY).toISOString().slice(0, 10), { questions: 0, no: 0 });
  for (const e of ev) {
    const d = days.get(e.ts.slice(0, 10));
    if (!d) continue;
    if (e.type === "ask") d.questions++;
    if (e.type === "feedback" && e.helped === false) d.no++;
  }

  return {
    totals: {
      questions: asks.length, answered, unanswered: asks.length - answered, helpedYes: yes, helpedNo: no,
      tickets: tickets.filter((t) => Date.parse(t.createdAt) >= since).length, deflectable: deflectable.length,
      solveRate: yes + no ? yes / (yes + no) : null,
    },
    topQuestions: clusters.slice(0, 10).map((c) => ({ q: c.q, count: c.count, guideId: c.guideId, guideTitle: c.guideId ? title(c.guideId) : undefined })),
    unanswered: [...unansweredMap].map(([q, count]) => ({ q, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topGuides: topGuides.slice(0, 10),
    badGuides,
    hardPages: hardPages.slice(0, 8),
    deflectableTickets: deflectable.slice(0, 20),
    suggestions: suggestions.slice(0, 8),
    days: [...days].map(([day, v]) => ({ day, ...v })),
  };
}
