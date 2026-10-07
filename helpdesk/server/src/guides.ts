import { randomUUID } from "node:crypto";
import { LANGS, type Guide, type GuideTranslation, type Hotspot, type Lang, type LocalizedGuide, type Step } from "../../shared/types.js";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num01 = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined);
const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
const mediaUrl = (v: unknown) => {
  const s = str(v, 300);
  return /^\/media\/[A-Za-z0-9._-]+$/.test(s) ? s : undefined;
};
const strList = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, max)).filter(Boolean))].slice(0, n) : [];

export function slugify(s: string): string {
  const base = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return base || "guide";
}

function sanitizeHotspot(h: any): Hotspot | undefined {
  if (!h) return undefined;
  const [x, y, w, hh] = [num01(h.x), num01(h.y), num01(h.w), num01(h.h)];
  if ([x, y, w, hh].some((n) => n === undefined) || w! < 0.005 || hh! < 0.005) return undefined;
  return { x: x!, y: y!, w: Math.min(w!, 1 - x!), h: Math.min(hh!, 1 - y!) };
}

function sanitizeStep(s: any): Step {
  const step: Step = { id: str(s?.id, 80) || randomUUID().slice(0, 8), text: str(s?.text, 400) };
  const image = mediaUrl(s?.image);
  if (image) {
    step.image = image;
    step.hotspot = sanitizeHotspot(s?.hotspot);
    if (s?.focus && num01(s.focus.x) !== undefined && num01(s.focus.y) !== undefined) step.focus = { x: num01(s.focus.x)!, y: num01(s.focus.y)! };
    if (s?.pin && num01(s.pin.x) !== undefined && num01(s.pin.y) !== undefined) step.pin = { x: num01(s.pin.x)!, y: num01(s.pin.y)! };
    if (s?.annotated) step.annotated = true;
    if (typeof s?.ratio === "number" && s.ratio > 0.1 && s.ratio < 10) step.ratio = s.ratio;
  }
  return step;
}

function sanitizeTranslations(t: any, stepIds: Set<string>): Guide["translations"] {
  const out: Guide["translations"] = {};
  if (!t || typeof t !== "object") return out;
  for (const [lang, v] of Object.entries<any>(t)) {
    if (!isLang(lang) || !v) continue;
    const steps: Record<string, string> = {};
    for (const [id, text] of Object.entries(v.steps ?? {})) if (stepIds.has(id)) steps[id] = str(text, 400);
    const tr: GuideTranslation = {
      title: str(v.title, 160), summary: str(v.summary, 300), steps,
      warning: str(v.warning, 400) || undefined, tip: str(v.tip, 400) || undefined,
      altQueries: strList(v.altQueries, 40, 160), auto: !!v.auto, updatedAt: str(v.updatedAt, 40) || new Date().toISOString(),
    };
    out[lang] = tr;
  }
  return out;
}

/** Validerar och rensar inkommande guide (adminläget är betrott men inte blint). */
export function sanitizeGuide(input: any, existing?: Guide, takenIds: Set<string> = new Set()): Guide {
  const now = new Date().toISOString();
  const title = str(input?.title, 160) || "Ny guide";
  let id = existing?.id;
  if (!id) {
    const base = slugify(str(input?.id, 60) || title);
    id = base;
    for (let i = 2; takenIds.has(id); i++) id = `${base}-${i}`;
  }
  const steps = (Array.isArray(input?.steps) ? input.steps : []).slice(0, 40).map(sanitizeStep).filter((s: Step) => s.text || s.image);
  const stepIds = new Set<string>(steps.map((s: Step) => s.id));
  const status = input?.status === "published" ? "published" : "draft";
  const g: Guide = {
    id, status, title, summary: str(input?.summary, 300), category: str(input?.category, 40) || "start",
    altQueries: strList(input?.altQueries, 60, 160), steps,
    tip: str(input?.tip, 400) || undefined, warning: str(input?.warning, 400) || undefined,
    pageKeys: strList(input?.pageKeys, 20, 60), roles: strList(input?.roles, 10, 40),
    lang: isLang(input?.lang) ? input.lang : existing?.lang ?? "sv",
    translations: sanitizeTranslations(input?.translations, stepIds),
    related: strList(input?.related, 10, 80).filter((r) => r !== id),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    publishedAt: status === "published" ? existing?.publishedAt ?? now : existing?.publishedAt,
  };
  const v = input?.video;
  if (v) {
    const url = mediaUrl(v.url) ?? (/^https:\/\/[^\s]+$/.test(str(v.url, 500)) ? str(v.url, 500) : undefined);
    if (url) g.video = { url, start: typeof v.start === "number" && v.start >= 0 ? v.start : undefined, end: typeof v.end === "number" && v.end > 0 ? v.end : undefined, poster: mediaUrl(v.poster) };
  }
  if (Array.isArray(input?.walkthrough)) {
    g.walkthrough = input.walkthrough.slice(0, 30).map((w: any) => ({
      selector: str(w?.selector, 200), text: str(w?.text, 200),
      advanceOn: w?.advanceOn === "input" || w?.advanceOn === "next" ? w.advanceOn : "click",
      pathMatch: str(w?.pathMatch, 120) || undefined,
    })).filter((w: any) => w.selector && w.text);
    if (!g.walkthrough?.length) g.walkthrough = undefined;
  }
  return g;
}

export function localize(g: Guide, lang: Lang): LocalizedGuide {
  const { translations, ...base } = g;
  if (lang === g.lang) return { ...base, shownLang: lang };
  const t = translations[lang];
  if (!t || !t.title) return { ...base, shownLang: g.lang, untranslated: true };
  return {
    ...base, shownLang: lang, machineTranslated: !!t.auto,
    title: t.title, summary: t.summary || g.summary, tip: t.tip, warning: t.warning,
    altQueries: [...g.altQueries, ...(t.altQueries ?? [])],
    steps: g.steps.map((s) => ({ ...s, text: t.steps[s.id] || s.text })),
  };
}
