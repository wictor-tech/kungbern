"use client";

import type { AskResult } from "@/lib/types";

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Något gick fel (${res.status})`);
  return res.json() as Promise<T>;
}

export interface HelpContext {
  page?: string | null;
  app?: string | null;
}

export function askApi(q: string, ctx: HelpContext) {
  return post<AskResult>("/api/ask", { q, page: ctx.page, app: ctx.app, sessionId: sessionId() });
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
