import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getGuide } from "./guides";
import { createZendeskTicket } from "./zendesk";

export interface TicketInput {
  sessionId: string | null;
  queryText: string | null;
  guideId: string | null;
  page: string | null;
  stepsViewed: number[];
  comment: string | null;
  contact: string | null;
}

/**
 * Skapar ett supportärende med all kontext, så att supporten inte börjar från noll.
 * Sparas alltid i hjälpens databas, skapas i Zendesk om det är konfigurerat,
 * och skickas även till SUPPORT_WEBHOOK_URL (t.ex. Slack) om den är satt.
 */
export async function createTicket(t: TicketInput) {
  const db = await getDb();
  const id = `T-${randomUUID().slice(0, 8).toUpperCase()}`;
  await db.query(
    `INSERT INTO tickets (id, session_id, query_text, guide_id, page, steps_viewed, comment, contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, t.sessionId, t.queryText, t.guideId, t.page, t.stepsViewed, t.comment, t.contact],
  );

  const guideTitle = t.guideId ? ((await getGuide(t.guideId, { includeDrafts: true }))?.title ?? null) : null;
  const zendeskId = await createZendeskTicket(t, id, guideTitle);
  if (zendeskId) await db.query("UPDATE tickets SET external_id = $1 WHERE id = $2", [`zendesk:${zendeskId}`, id]);

  const url = process.env.SUPPORT_WEBHOOK_URL;
  if (url) {
    const text = [
      `Nytt supportärende ${zendeskId ? `#${zendeskId}` : id}`,
      `Fråga: ${t.queryText ?? "–"}`,
      `Visad guide: ${guideTitle ?? "–"}`,
      `Sida: ${t.page ?? "–"}`,
      `Steg som visats: ${t.stepsViewed.length ? t.stepsViewed.join(", ") : "–"}`,
      `Kommentar: ${t.comment ?? "–"}`,
      `Kontakt: ${t.contact ?? "–"}`,
    ].join("\n");
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, zendeskId, text, ...t }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[tickets] webhook misslyckades:", err instanceof Error ? err.message : err);
    }
  }
  // Användaren ser Zendesk-numret om ärendet hamnade där, annars hjälpens eget id.
  return { id: zendeskId ? `#${zendeskId}` : id };
}
