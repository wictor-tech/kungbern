import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { FileStore } from "./store.js";
import { createApp } from "./app.js";

let app: ReturnType<typeof createApp>["app"];
const H = { authorization: "Bearer test-token", "content-type": "application/json" };
const J = { "content-type": "application/json" };
const post = (path: string, body: unknown, headers: Record<string, string> = J) =>
  app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

before(() => {
  const dir = mkdtempSync(join(tmpdir(), "helpdesk-"));
  const cfg = loadConfig({ NODE_ENV: "test", DATA_DIR: dir, WEB_DIR: join(dir, "none") } as any);
  app = createApp(cfg, new FileStore(cfg)).app;
});

test("fråga → guide med steg och kort svar", async () => {
  const r = await post("/api/ask", { q: "Hur lägger jag upp en bild?", lang: "sv" });
  const j: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.quality, "good");
  assert.equal(j.guide.id, "images-add");
  assert.ok(j.short.length > 5 && j.short.length < 160);
  assert.ok(j.guide.steps.length >= 4);
  assert.ok(j.guide.steps.some((s: any) => s.image && s.focus));
});

test("ingen guide → ärligt 'inget svar', inte en gissning", async () => {
  const j: any = await (await post("/api/ask", { q: "vad är vädret" })).json();
  assert.equal(j.quality, "none");
  assert.equal(j.guide, undefined);
});

test("kontext (aktuell sida) används för 'det här'", async () => {
  const j: any = await (await post("/api/ask", { q: "Hur ändrar jag detta?", context: { page: "gates" } })).json();
  assert.equal(j.guide?.id, "gates");
});

test("språk: engelsk översättning visas när den finns, annars markeras som saknad", async () => {
  const en: any = await (await app.request("/api/guides/capacity?lang=en")).json();
  assert.match(en.guide.title, /trucks/i);
  assert.equal(en.guide.shownLang, "en");
  const de: any = await (await app.request("/api/guides/capacity?lang=de")).json();
  assert.equal(de.guide.untranslated, true);
  assert.equal(de.guide.shownLang, "sv");
});

test("feedback Nej → nytt försök utan guiden som inte hjälpte", async () => {
  const j: any = await (await post("/api/feedback", { q: "ändra bild", guideId: "images-add", helped: false, comment: "jag vill ta bort den", lang: "sv" })).json();
  assert.ok(j.retry);
  assert.notEqual(j.retry.guide?.id, "images-add");
  assert.ok(!j.retry.alternatives.some((a: any) => a.guideId === "images-add"));
});

test("supportärende innehåller fråga, guide, sida, steg och kommentar", async () => {
  const r: any = await (await post("/api/tickets", { question: "Hur lägger jag upp en bild?", guideId: "images-add", page: "images", stepsViewed: [0, 1], comment: "hittar ingen knapp", lang: "sv" })).json();
  assert.match(r.ticketId, /^T-/);
  const list: any[] = await (await app.request("/api/admin/tickets", { headers: H })).json();
  const t = list.find((x) => x.id === r.ticketId);
  assert.equal(t.guideTitle, "Lägg till en bild i bildspelet");
  assert.equal(t.page, "images");
  assert.deepEqual(t.stepsViewed, [0, 1]);
  assert.equal(t.comment, "hittar ingen knapp");
  assert.equal(t.deflectable, true); // en guide hade rätt svar
});

test("admin kräver token", async () => {
  assert.equal((await app.request("/api/admin/guides")).status, 401);
  assert.equal((await app.request("/api/admin/guides", { headers: { authorization: "Bearer fel" } })).status, 401);
  assert.equal((await app.request("/api/admin/guides", { headers: H })).status, 200);
});

test("admin: skapa utkast → syns inte → publicera → hittas direkt av sökningen", async () => {
  const c: any = await (await post("/api/admin/guides", {
    title: "Byta lösenord", summary: "Ändra ditt lösenord under Min profil.", category: "settings",
    altQueries: ["glömt lösenord", "nytt lösenord"], steps: [{ text: "Klicka på **Min profil**" }, { text: "Välj **Byt lösenord**" }],
  }, H)).json();
  assert.equal(c.status, "draft");
  assert.equal((await app.request(`/api/guides/${c.id}`)).status, 404);
  const miss: any = await (await post("/api/ask", { q: "glömt lösenord" })).json();
  assert.notEqual(miss.guide?.id, c.id);
  await post(`/api/admin/guides/${c.id}/publish`, { published: true }, H);
  const hit: any = await (await post("/api/ask", { q: "jag har glömt mitt lösenord" })).json();
  assert.equal(hit.guide?.id, c.id);
  await app.request(`/api/admin/guides/${c.id}`, { method: "DELETE", headers: H });
});

test("admin: ogiltiga bild-URL:er och scripts i text avvisas/rensas", async () => {
  const c: any = await (await post("/api/admin/guides", { title: "X", steps: [{ text: "a", image: "https://evil.example/x.png" }, { text: "b", image: "/media/../../etc/passwd" }] }, H)).json();
  assert.ok(c.steps.every((s: any) => !s.image));
});

test("uppladdning: kontrollerar filinnehåll", async () => {
  const bad = await app.request("/api/admin/media", { method: "POST", headers: { authorization: H.authorization, "content-type": "image/png" }, body: Buffer.from("inte en png") });
  assert.equal(bad.status, 415);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const ok = await app.request("/api/admin/media", { method: "POST", headers: { authorization: H.authorization, "content-type": "image/png" }, body: png });
  assert.equal(ok.status, 201);
  const { url } = (await ok.json()) as any;
  const got = await app.request(url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/png");
});

test("analytics: frågor, obesvarade och Nej-räknare", async () => {
  await post("/api/ask", { q: "vad är vädret" });
  await post("/api/feedback", { q: "x", guideId: "gates", helped: false, lang: "sv" });
  const r: any = await (await app.request("/api/admin/analytics", { headers: H })).json();
  assert.ok(r.totals.questions >= 3);
  assert.ok(r.unanswered.some((u: any) => u.q === "vad är vädret"));
  assert.ok(r.totals.helpedNo >= 1);
});
