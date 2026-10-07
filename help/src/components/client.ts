"use client";

import type { AskResult, GuideSummary } from "@/lib/types";

/** Anonymt sessions-id per webbläsare, för att koppla ihop fråga → guide → feedback → ärende. */
export function sessionId(): string {
  try {
    let id = localStorage.getItem("lup-help-session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("lup-help-session", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Ingen kontakt med servern. Kontrollera internetanslutningen och försök igen.");
  }
  if (!res.ok) {
    // Visa serverns meddelande om det finns (t.ex. "För många förfrågningar…"), annars ett generellt.
    const msg = await res
      .json()
      .then((j: { error?: unknown }) => (typeof j.error === "string" ? j.error : null))
      .catch(() => null);
    throw new Error(msg && res.status < 500 ? msg : "Något gick fel. Försök igen om en stund.");
  }
  return res.json() as Promise<T>;
}

export interface HelpContext {
  page?: string | null;
  app?: string | null;
}

export function askApi(q: string, ctx: HelpContext) {
  return post<AskResult>("/api/ask", { q, page: ctx.page, app: ctx.app, sessionId: sessionId() });
}

export async function suggestApi(q: string, ctx: HelpContext, signal?: AbortSignal): Promise<GuideSummary[]> {
  const p = new URLSearchParams({ q });
  if (ctx.page) p.set("page", ctx.page);
  const res = await fetch(`/api/suggest?${p.toString()}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as { suggestions: GuideSummary[] }).suggestions;
}

export function logViewApi(guideId: string, queryId: string | null, stepsViewed: number[]) {
  // sendBeacon överlever att sidan stängs; fall tillbaka på fetch.
  const body = JSON.stringify({ type: "view", guideId, queryId, sessionId: sessionId(), stepsViewed });
  try {
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* ignorera */
  }
  void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
}

export function feedbackApi(input: {
  guideId: string | null;
  queryId: string | null;
  helpful: boolean;
  comment?: string;
  originalQuery?: string | null;
  page?: string | null;
  shown?: string[];
}) {
  return post<{ ok: true; retry: AskResult | null }>("/api/feedback", { ...input, sessionId: sessionId() });
}

export function ticketApi(input: {
  queryText: string | null;
  guideId: string | null;
  page: string | null;
  stepsViewed: number[];
  comment: string;
  contact: string;
}) {
  return post<{ id: string }>("/api/tickets", { ...input, sessionId: sessionId() });
}
