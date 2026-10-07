/**
 * Skapar supportärenden i Zendesk (ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN).
 * Ärendet får all kontext från hjälpen, så att supporten inte behöver börja från noll.
 */
import type { TicketInput } from "./tickets";

export function zendeskEnabled() {
  return Boolean(process.env.ZENDESK_SUBDOMAIN && process.env.ZENDESK_EMAIL && process.env.ZENDESK_API_TOKEN);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function zendeskPayload(t: TicketInput, localId: string, guideTitle: string | null) {
  const contact = t.contact?.trim() ?? "";
  const body = [
    t.comment ?? "(ingen kommentar)",
    "",
    "— Från LUP Hjälp —",
    `Fråga: ${t.queryText ?? "–"}`,
    `Guide som visades: ${guideTitle ?? t.guideId ?? "ingen"}`,
    `Sida i LUPNUMBER: ${t.page ?? "okänd"}`,
    `Steg användaren bockat av: ${t.stepsViewed.length ? t.stepsViewed.join(", ") : "inga"}`,
    `Kontakt: ${contact || "–"}`,
    `Internt id: ${localId}`,
  ].join("\n");
  return {
    ticket: {
      subject: `Hjälp: ${(t.queryText ?? t.comment ?? "Fråga från LUP Hjälp").slice(0, 120)}`,
      comment: { body, public: false },
      ...(EMAIL.test(contact) ? { requester: { email: contact, name: contact.split("@")[0] } } : {}),
      tags: ["lup_hjalp", ...(t.guideId ? [`guide_${t.guideId.replace(/-/g, "_")}`] : [])],
    },
  };
}

export async function createZendeskTicket(t: TicketInput, localId: string, guideTitle: string | null): Promise<number | null> {
  if (!zendeskEnabled()) return null;
  const { ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN } = process.env;
  const auth = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64");
  try {
    const res = await fetch(`https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets.json`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
      body: JSON.stringify(zendeskPayload(t, localId, guideTitle)),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Zendesk ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { ticket?: { id?: number } };
    return json.ticket?.id ?? null;
  } catch (err) {
    // Ärendet finns kvar i hjälpens databas och syns under Insikter även om Zendesk inte svarar.
    console.error("[zendesk]", err instanceof Error ? err.message : err);
    return null;
  }
}
