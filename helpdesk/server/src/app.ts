import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { LANGS, LANG_NAMES, type AskResponse, type Candidate, type Guide, type HelpEvent, type Lang, type Ticket } from "../../shared/types.js";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import { SearchEngine, qualityOf, THRESHOLDS } from "./search/engine.js";
import { CATEGORIES } from "./seed/categories.js";
import { localize, sanitizeGuide } from "./guides.js";
import { HttpError, saveUpload, serveMedia } from "./media.js";
import { buildReport } from "./analytics.js";
import type { AiProvider } from "./ai/provider.js";
import { HeuristicProvider } from "./ai/heuristic.js";
import { ClaudeProvider } from "./ai/claude.js";

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

class RateLimit {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private max: number, private windowMs = 60_000) {}
  ok(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.reset < now) { this.hits.set(key, { n: 1, reset: now + this.windowMs }); return true; }
    h.n++;
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
    return h.n <= this.max;
  }
}

export function createApp(cfg: Config, store: Store, ai?: AiProvider) {
  const provider: AiProvider = ai ?? (cfg.anthropicKey ? new ClaudeProvider(cfg.anthropicKey, cfg.anthropicModel) : new HeuristicProvider());
  const aiEnabled = provider.name !== "local";
  const engine = new SearchEngine();
  const reindex = () => engine.build(store.listGuides());
  reindex();

  const app = new Hono();
  const askLimit = new RateLimit(40);
  const writeLimit = new RateLimit(30);
  const aiLimit = new RateLimit(8);

  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  });
  app.use("/api/*", cors({
    origin: cfg.allowedOrigins.includes("*") ? "*" : cfg.allowedOrigins,
    allowHeaders: ["content-type", "authorization", "x-filename"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  }));

  const ip = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0].trim() || (c.env as any)?.incoming?.socket?.remoteAddress || "local";
  const limited = (c: Context, rl: RateLimit) => !rl.ok(ip(c) + c.req.path);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof SyntaxError) return c.json({ error: "Ogiltig JSON" }, 400);
    console.error(err);
    return c.json({ error: "Något gick fel" }, 500);
  });

  const body = async (c: Context): Promise<any> => {
    try { return await c.req.json(); } catch { throw new HttpError(400, "Ogiltig JSON"); }
  };

  // ---------- Hjälpare ----------
  const published = () => store.listGuides().filter((g) => g.status === "published");
  const toCandidate = (g: Guide, score: number, lang: Lang): Candidate => {
    const l = localize(g, lang);
    return { guideId: g.id, title: l.title, summary: l.summary, category: g.category, score: Math.round(score * 100) / 100 };
  };
  const log = (e: Omit<HelpEvent, "id" | "ts">) => store.addEvent({ id: randomUUID(), ts: new Date().toISOString(), ...e });

  async function answer(q: string, lang: Lang, ctx: { page?: string; role?: string }, exclude: string[] = []) {
    let hits = engine.search(q, ctx, { exclude, limit: 6, role: ctx.role });
    let usedAi = false;
    let short = "";
    let confidence = hits[0]?.score ?? 0;
    let chosen: Guide | undefined = hits[0]?.guide;

    // AI-lagret förstår avsikten när den lokala sökningen är osäker (eller frågan är på ett annat språk).
    if (aiEnabled && (confidence < 0.8 || !hits.length)) {
      const pool = hits.length ? hits.map((h) => h.guide) : published().filter((g) => !exclude.includes(g.id)).slice(0, 40);
      try {
        const r = await provider.rank({
          question: q, lang, page: ctx.page,
          candidates: pool.map((g) => ({ id: g.id, title: g.title, summary: g.summary, altQueries: g.altQueries })),
        });
        if (r) {
          usedAi = true;
          if (r.guideId) {
            const g = pool.find((x) => x.id === r.guideId) as Guide;
            chosen = g; confidence = Math.max(confidence, 0.7); short = r.short;
            hits = [{ guide: g, score: confidence }, ...hits.filter((h) => h.guide.id !== g.id)];
          } else if (confidence < THRESHOLDS.good) {
            confidence = Math.min(confidence, 0.2); chosen = undefined; short = r.short;
          }
        }
      } catch (err) {
        console.warn("AI rank misslyckades, använder lokal sökning:", (err as Error).message);
      }
    }
    const quality = chosen ? qualityOf(confidence) : "none";
    const alternatives = hits.filter((h) => h.guide.id !== (quality === "good" ? chosen?.id : "")).filter((h) => h.score >= 0.1).slice(0, 4).map((h) => toCandidate(h.guide, h.score, lang));
    return { quality, chosen, confidence, short, alternatives, usedAi } as const;
  }

  // ---------- Publikt API ----------
  app.get("/api/config", (c) => c.json({
    categories: CATEGORIES, langs: LANGS.map((l) => ({ id: l, name: LANG_NAMES[l] })), aiEnabled, aiProvider: provider.name,
  }));

  app.get("/api/guides", (c) => {
    const lang = isLang(c.req.query("lang")) ? (c.req.query("lang") as Lang) : "sv";
    const cat = c.req.query("category");
    const page = c.req.query("page");
    let list = published();
    if (cat) list = list.filter((g) => g.category === cat);
    if (page) list = list.filter((g) => g.pageKeys.includes(page));
    return c.json(list.map((g) => { const l = localize(g, lang); return { id: g.id, title: l.title, summary: l.summary, category: g.category, hasVideo: !!g.video, hasWalkthrough: !!g.walkthrough?.length, untranslated: l.untranslated ?? false }; }));
  });

  app.get("/api/guides/:id", (c) => {
    const g = store.getGuide(c.req.param("id"));
    if (!g || g.status !== "published") return c.json({ error: "Guiden finns inte" }, 404);
    const lang = isLang(c.req.query("lang")) ? (c.req.query("lang") as Lang) : "sv";
    const related = g.related.map((id) => store.getGuide(id)).filter((r): r is Guide => !!r && r.status === "published").map((r) => toCandidate(r, 1, lang));
    return c.json({ guide: localize(g, lang), related });
  });

  /** Översätt en guide vid behov (cachas) – "AI-översättning om det kan göras säkert". */
  app.post("/api/guides/:id/translate", async (c) => {
    if (limited(c, aiLimit)) return c.json({ error: "För många förfrågningar" }, 429);
    const g = store.getGuide(c.req.param("id"));
    if (!g || g.status !== "published") return c.json({ error: "Guiden finns inte" }, 404);
    const { lang } = await body(c);
    if (!isLang(lang)) return c.json({ error: "Ogiltigt språk" }, 400);
    if (!g.translations[lang]) {
      if (!aiEnabled) return c.json({ error: "Översättning är inte tillgänglig ännu" }, 501);
      await translateGuide(g, lang);
    }
    return c.json({ guide: localize(store.getGuide(g.id)!, lang) });
  });

  async function translateGuide(g: Guide, lang: Lang) {
    const texts: Record<string, string> = { title: g.title, summary: g.summary };
    if (g.tip) texts.tip = g.tip;
    if (g.warning) texts.warning = g.warning;
    g.steps.forEach((s) => (texts["step:" + s.id] = s.text));
    const out = await provider.translate(texts, lang, g.lang);
    g.translations[lang] = {
      title: out.title, summary: out.summary, tip: out.tip, warning: out.warning, auto: true, updatedAt: new Date().toISOString(),
      steps: Object.fromEntries(g.steps.map((s) => [s.id, out["step:" + s.id] ?? s.text])),
    };
    store.saveGuide(g);
    reindex();
  }

  app.post("/api/ask", async (c) => {
    if (limited(c, askLimit)) return c.json({ error: "För många frågor, vänta en stund" }, 429);
    const b = await body(c);
    const q = clip(b.q, 300);
    if (q.length < 2) return c.json({ error: "Skriv en fråga" }, 400);
    const lang: Lang = isLang(b.lang) ? b.lang : "sv";
    const ctx = { page: clip(b.context?.page, 60) || undefined, role: clip(b.context?.role, 40) || undefined };
    const sessionId = clip(b.context?.sessionId, 64) || undefined;
    const a = await answer(q, lang, ctx);
    const queryId = randomUUID();
    log({ type: "ask", queryId, sessionId, q, lang, page: ctx.page, guideId: a.chosen?.id, quality: a.quality, confidence: Math.round(a.confidence * 100) / 100 });
    if (a.quality === "good" && a.chosen) log({ type: "view", queryId, sessionId, guideId: a.chosen.id, page: ctx.page });
    const res: AskResponse = {
      queryId, q, quality: a.quality,
      short: a.quality === "good" ? (a.short || localize(a.chosen!, lang).summary) : "",
      guide: a.quality === "good" && a.chosen ? localize(a.chosen, lang) : undefined,
      confidence: Math.round(a.confidence * 100) / 100,
      alternatives: a.alternatives, usedAi: a.usedAi,
    };
    return c.json(res);
  });

  const EVENT_TYPES = new Set(["view", "step", "video", "walkthrough"]);
  app.post("/api/events", async (c) => {
    if (limited(c, writeLimit)) return c.json({ error: "För många förfrågningar" }, 429);
    const b = await body(c);
    if (!EVENT_TYPES.has(b.type)) return c.json({ error: "Okänd händelse" }, 400);
    log({
      type: b.type, queryId: clip(b.queryId, 64) || undefined, sessionId: clip(b.sessionId, 64) || undefined,
      guideId: clip(b.guideId, 80) || undefined, page: clip(b.page, 60) || undefined, step: typeof b.step === "number" ? b.step : undefined, lang: isLang(b.lang) ? b.lang : undefined,
    });
    return c.json({ ok: true });
  });

  app.post("/api/feedback", async (c) => {
    if (limited(c, writeLimit)) return c.json({ error: "För många förfrågningar" }, 429);
    const b = await body(c);
    const guideId = clip(b.guideId, 80);
    const lang: Lang = isLang(b.lang) ? b.lang : "sv";
    const comment = clip(b.comment, 500) || undefined;
    const q = clip(b.q, 300);
    const page = clip(b.page, 60) || undefined;
    const stepsViewed = Array.isArray(b.stepsViewed) ? b.stepsViewed.filter((n: unknown) => Number.isInteger(n)).slice(0, 50) : undefined;
    if (!b.followup) {
      log({ type: "feedback", queryId: clip(b.queryId, 64) || undefined, sessionId: clip(b.sessionId, 64) || undefined, q: q || undefined, guideId: guideId || undefined, helped: !!b.helped, comment, lang, page, stepsViewed });
    } else if (comment) {
      // Uppföljning efter "Nej" – räknas inte som en ny röst, men kommentaren sparas.
      log({ type: "comment", queryId: clip(b.queryId, 64) || undefined, sessionId: clip(b.sessionId, 64) || undefined, q: q || undefined, guideId: guideId || undefined, comment, lang, page, stepsViewed });
    }
    if (b.helped || !q) return c.json({ ok: true });

    // Nej → försök hjälpa igen (omformulera med kommentaren, utesluta guiden som inte hjälpte)
    let q2 = comment ? `${q} ${comment}` : q;
    if (aiEnabled && comment) { try { q2 = await provider.rewriteQuery(q, comment); } catch { /* behåll enkel variant */ } }
    const exclude = Array.isArray(b.exclude) ? b.exclude.filter((x: unknown) => typeof x === "string").slice(0, 10) : [];
    const a = await answer(q2, lang, { page }, [...exclude, guideId].filter(Boolean));
    const retry: AskResponse = {
      queryId: randomUUID(), q: q2, quality: a.quality, short: a.quality === "good" ? (a.short || localize(a.chosen!, lang).summary) : "",
      guide: a.quality === "good" && a.chosen ? localize(a.chosen, lang) : undefined,
      confidence: Math.round(a.confidence * 100) / 100, alternatives: a.alternatives, usedAi: a.usedAi,
    };
    log({ type: "ask", queryId: retry.queryId, sessionId: clip(b.sessionId, 64) || undefined, q: q2, lang, page, guideId: a.chosen?.id, quality: a.quality, confidence: retry.confidence });
    return c.json({ ok: true, retry });
  });

  app.post("/api/tickets", async (c) => {
    if (limited(c, writeLimit)) return c.json({ error: "För många förfrågningar" }, 429);
    const b = await body(c);
    const question = clip(b.question, 300);
    if (!question) return c.json({ error: "Frågan saknas" }, 400);
    const guideId = clip(b.guideId, 80) || undefined;
    const guide = guideId ? store.getGuide(guideId) : undefined;
    const lang: Lang = isLang(b.lang) ? b.lang : "sv";
    const top = engine.search(question, { page: clip(b.page, 60) || undefined }, { limit: 1 })[0];
    const t: Ticket = {
      id: "T-" + randomUUID().slice(0, 6).toUpperCase(), createdAt: new Date().toISOString(), status: "open",
      question, guideId, guideTitle: guide?.title, page: clip(b.page, 60) || undefined,
      stepsViewed: Array.isArray(b.stepsViewed) ? b.stepsViewed.filter((n: unknown) => Number.isInteger(n)).slice(0, 50) : [],
      comment: clip(b.comment, 500) || undefined, email: clip(b.email, 120) || undefined, message: clip(b.message, 2000) || undefined, lang,
      deflectable: !!top && top.score >= THRESHOLDS.good,
    };
    store.saveTicket(t);
    log({ type: "ticket", queryId: clip(b.queryId, 64) || undefined, sessionId: clip(b.sessionId, 64) || undefined, q: question, guideId, page: t.page });
    if (cfg.ticketWebhook) {
      // Supportintegration: skicka hela ärendet (frågan, guiden, sidan, stegen, kommentaren) vidare utan att blockera användaren.
      fetch(cfg.ticketWebhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(t), signal: AbortSignal.timeout(5000) })
        .catch((e) => console.warn("Webhook misslyckades:", e.message));
    }
    return c.json({ ok: true, ticketId: t.id });
  });

  app.get("/media/:name", (c) => serveMedia(cfg.uploadDir, c.req.param("name"), c.req.header("range")));

  // ---------- Admin ----------
  const admin = new Hono();
  admin.use("*", async (c, next) => {
    const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(given), b = Buffer.from(cfg.adminToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return c.json({ error: "Inte behörig" }, 401);
    await next();
  });
  admin.get("/me", (c) => c.json({ ok: true }));

  admin.get("/guides", (c) => {
    const events = store.listEvents();
    const stats = new Map<string, { views: number; yes: number; no: number }>();
    for (const e of events) {
      if (!e.guideId) continue;
      const s = stats.get(e.guideId) ?? { views: 0, yes: 0, no: 0 };
      if (e.type === "view") s.views++;
      if (e.type === "feedback") e.helped ? s.yes++ : s.no++;
      stats.set(e.guideId, s);
    }
    return c.json(store.listGuides().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((g) => ({
      id: g.id, title: g.title, status: g.status, category: g.category, updatedAt: g.updatedAt, steps: g.steps.length,
      hasVideo: !!g.video, langs: Object.keys(g.translations), ...(stats.get(g.id) ?? { views: 0, yes: 0, no: 0 }),
    })));
  });
  admin.get("/guides/:id", (c) => {
    const g = store.getGuide(c.req.param("id"));
    return g ? c.json(g) : c.json({ error: "Finns inte" }, 404);
  });
  admin.post("/guides", async (c) => {
    const g = sanitizeGuide(await body(c), undefined, new Set(store.listGuides().map((x) => x.id)));
    store.saveGuide(g); reindex();
    return c.json(g, 201);
  });
  admin.put("/guides/:id", async (c) => {
    const existing = store.getGuide(c.req.param("id"));
    if (!existing) return c.json({ error: "Finns inte" }, 404);
    const g = sanitizeGuide(await body(c), existing);
    store.saveGuide(g); reindex();
    return c.json(g);
  });
  admin.delete("/guides/:id", (c) => {
    const ok = store.deleteGuide(c.req.param("id"));
    reindex();
    return ok ? c.json({ ok: true }) : c.json({ error: "Finns inte" }, 404);
  });
  admin.post("/guides/:id/publish", async (c) => {
    const g = store.getGuide(c.req.param("id"));
    if (!g) return c.json({ error: "Finns inte" }, 404);
    const { published: p } = await body(c);
    g.status = p ? "published" : "draft";
    g.updatedAt = new Date().toISOString();
    if (p) g.publishedAt = g.publishedAt ?? g.updatedAt;
    store.saveGuide(g); reindex();
    return c.json(g);
  });

  admin.post("/media", async (c) => {
    const buf = Buffer.from(await c.req.arrayBuffer());
    const out = saveUpload(cfg.uploadDir, c.req.header("content-type") ?? "", buf);
    return c.json({ url: out.url }, 201);
  });

  admin.post("/guides/:id/translate", async (c) => {
    const g = store.getGuide(c.req.param("id"));
    if (!g) return c.json({ error: "Finns inte" }, 404);
    const { lang } = await body(c);
    if (!isLang(lang) || lang === g.lang) return c.json({ error: "Ogiltigt språk" }, 400);
    try { await translateGuide(g, lang); } catch (e) { return c.json({ error: (e as Error).message }, 501); }
    return c.json(store.getGuide(g.id));
  });

  admin.post("/ai/suggest-queries", async (c) => {
    const b = await body(c);
    try { return c.json({ queries: await provider.suggestQueries({ title: clip(b.title, 160), summary: clip(b.summary, 300), altQueries: Array.isArray(b.altQueries) ? b.altQueries.map((x: unknown) => clip(x, 160)) : [], steps: (Array.isArray(b.steps) ? b.steps : []).map((s: any) => ({ id: "", text: clip(s?.text, 300) })) }) }); }
    catch (e) { return c.json({ error: (e as Error).message }, 502); }
  });

  admin.post("/ai/draft", async (c) => {
    const b = await body(c);
    const prompt = clip(b.prompt, 1000);
    if (!prompt && !(b.images?.length)) return c.json({ error: "Beskriv vad guiden ska handla om eller ladda upp skärmbilder" }, 400);
    const urls: string[] = (Array.isArray(b.images) ? b.images : []).filter((u: unknown) => typeof u === "string" && /^\/media\/[A-Za-z0-9._-]+\.(png|jpg|webp|gif)$/.test(u)).slice(0, 8);
    const images = urls.map((u) => {
      const file = join(cfg.uploadDir, u.replace("/media/", ""));
      const ext = extname(file).slice(1);
      return { mediaType: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: existsSync(file) ? readFileSync(file).toString("base64") : "", name: u };
    }).filter((i) => i.data);
    try {
      const d = await provider.draftGuide({
        prompt, images, categories: CATEGORIES.map((x) => ({ id: x.id, label: x.labels.sv ?? x.id })),
        existingPageKeys: [...new Set(store.listGuides().flatMap((g) => g.pageKeys))],
      });
      const draft = sanitizeGuide({
        title: d.title, summary: d.summary, category: CATEGORIES.some((x) => x.id === d.category) ? d.category : "start",
        altQueries: d.altQueries, pageKeys: d.pageKeys, tip: d.tip, warning: d.warning, status: "draft",
        steps: d.steps.map((s) => ({ text: s.text, image: s.imageIndex !== undefined ? urls[s.imageIndex] : undefined, hotspot: s.hotspot })),
      }, undefined, new Set(store.listGuides().map((x) => x.id)));
      return c.json({ draft, imageNotes: d.imageNotes ?? [], provider: provider.name });
    } catch (e) {
      return c.json({ error: "AI-utkastet misslyckades: " + (e as Error).message }, 502);
    }
  });

  admin.get("/analytics", (c) => {
    const days = Math.min(365, Math.max(1, Number(c.req.query("days") ?? 30)));
    return c.json(buildReport(store.listEvents(), store.listGuides(), store.listTickets(), engine, cfg, days));
  });
  admin.get("/tickets", (c) => c.json(store.listTickets()));
  admin.patch("/tickets/:id", async (c) => {
    const t = store.listTickets().find((x) => x.id === c.req.param("id"));
    if (!t) return c.json({ error: "Finns inte" }, 404);
    const b = await body(c);
    if (b.status === "open" || b.status === "closed") t.status = b.status;
    store.saveTicket(t);
    return c.json(t);
  });
  admin.get("/events", (c) => c.json(store.listEvents().slice(-500).reverse()));

  app.route("/api/admin", admin);

  // ---------- Frontend (byggd SPA) ----------
  const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "Finns inte" }, 404);
    if (!existsSync(cfg.webDir)) return c.text("Frontend inte byggd. Kör `npm run build` eller använd `npm run dev`.", 404);
    const clean = c.req.path.replace(/\.\./g, "").replace(/^\/+/, "");
    let file = join(cfg.webDir, clean);
    if (!clean || !existsSync(file) || !extname(file)) file = join(cfg.webDir, "index.html");
    const type = MIME[extname(file)] ?? "application/octet-stream";
    const cache = file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return new Response(readFileSync(file), { headers: { "content-type": type, "cache-control": cache } });
  });

  return { app, engine, reindex, provider };
}
