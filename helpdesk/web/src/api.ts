import type { AnalyticsReport, AskResponse, Candidate, Category, Guide, Lang, LocalizedGuide, Ticket } from "../../shared/types";

export interface Config { categories: Category[]; langs: { id: Lang; name: string }[]; aiEnabled: boolean; aiProvider: string }
export interface GuideListItem { id: string; title: string; summary: string; category: string; hasVideo: boolean; hasWalkthrough: boolean; untranslated: boolean }
export interface AdminGuideRow { todo?: string; id: string; title: string; status: "draft" | "published"; category: string; updatedAt: string; steps: number; hasVideo: boolean; langs: string[]; views: number; yes: number; no: number }

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

const TOKEN_KEY = "lup-help-admin-token";
export const adminToken = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } },
  set: (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* privat läge */ } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* */ } },
};

async function req<T>(path: string, init: RequestInit & { admin?: boolean; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.json !== undefined) { headers["content-type"] = "application/json"; init.body = JSON.stringify(init.json); }
  if (init.admin) headers.authorization = `Bearer ${adminToken.get()}`;
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error ?? `Fel ${res.status}`);
  return data as T;
}

export const api = {
  config: () => req<Config>("/api/config"),
  guides: (lang: Lang, q: { category?: string; page?: string } = {}) => {
    const p = new URLSearchParams({ lang, ...(q.category ? { category: q.category } : {}), ...(q.page ? { page: q.page } : {}) });
    return req<GuideListItem[]>(`/api/guides?${p}`);
  },
  guide: (id: string, lang: Lang) => req<{ guide: LocalizedGuide; related: Candidate[] }>(`/api/guides/${id}?lang=${lang}`),
  translate: (id: string, lang: Lang) => req<{ guide: LocalizedGuide }>(`/api/guides/${id}/translate`, { method: "POST", json: { lang } }),
  ask: (q: string, lang: Lang, context: { page?: string; role?: string; sessionId?: string }) => req<AskResponse>("/api/ask", { method: "POST", json: { q, lang, context } }),
  event: (e: Record<string, unknown>) => { fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e), keepalive: true }).catch(() => {}); },
  feedback: (b: Record<string, unknown>) => req<{ ok: true; retry?: AskResponse }>("/api/feedback", { method: "POST", json: b }),
  ticket: (b: Record<string, unknown>) => req<{ ok: true; ticketId: string }>("/api/tickets", { method: "POST", json: b }),

  admin: {
    me: () => req<{ ok: true }>("/api/admin/me", { admin: true }),
    guides: () => req<AdminGuideRow[]>("/api/admin/guides", { admin: true }),
    guide: (id: string) => req<Guide>(`/api/admin/guides/${id}`, { admin: true }),
    create: (g: Partial<Guide>) => req<Guide>("/api/admin/guides", { method: "POST", admin: true, json: g }),
    save: (g: Guide) => req<Guide>(`/api/admin/guides/${g.id}`, { method: "PUT", admin: true, json: g }),
    remove: (id: string) => req<{ ok: true }>(`/api/admin/guides/${id}`, { method: "DELETE", admin: true }),
    publish: (id: string, published: boolean) => req<Guide>(`/api/admin/guides/${id}/publish`, { method: "POST", admin: true, json: { published } }),
    upload: async (file: Blob): Promise<string> => {
      const r = await req<{ url: string }>("/api/admin/media", { method: "POST", admin: true, headers: { "content-type": file.type }, body: file });
      return r.url;
    },
    translate: (id: string, lang: Lang) => req<Guide>(`/api/admin/guides/${id}/translate`, { method: "POST", admin: true, json: { lang } }),
    suggestQueries: (g: Partial<Guide>) => req<{ queries: string[] }>("/api/admin/ai/suggest-queries", { method: "POST", admin: true, json: g }),
    draft: (prompt: string, images: string[]) => req<{ draft: Guide; imageNotes: string[]; provider: string }>("/api/admin/ai/draft", { method: "POST", admin: true, json: { prompt, images } }),
    analytics: (days: number) => req<AnalyticsReport>(`/api/admin/analytics?days=${days}`, { admin: true }),
    tickets: () => req<Ticket[]>("/api/admin/tickets", { admin: true }),
    setTicket: (id: string, status: "open" | "closed") => req<Ticket>(`/api/admin/tickets/${id}`, { method: "PATCH", admin: true, json: { status } }),
  },
};
