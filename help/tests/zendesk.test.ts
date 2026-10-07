import { afterEach, describe, expect, it, vi } from "vitest";
import { createTicket } from "@/lib/tickets";
import { zendeskPayload } from "@/lib/zendesk";

const input = {
  sessionId: "s", queryText: "ingen kan boka", guideId: "andra-kapacitet-per-timme", page: "capacity-timeslots",
  stepsViewed: [1, 3], comment: "Har satt kapacitet men det går ändå inte", contact: "anna@example.com",
};

describe("Zendesk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ZENDESK_SUBDOMAIN;
    delete process.env.ZENDESK_EMAIL;
    delete process.env.ZENDESK_API_TOKEN;
  });

  it("bygger ett ärende med all kontext och användaren som beställare", () => {
    const p = zendeskPayload(input, "T-1", "Ändra kapacitet per timme");
    expect(p.ticket.subject).toBe("Hjälp: ingen kan boka");
    expect(p.ticket.requester).toEqual({ email: "anna@example.com", name: "anna" });
    expect(p.ticket.comment.body).toContain("Guide som visades: Ändra kapacitet per timme");
    expect(p.ticket.comment.body).toContain("Sida i LUPNUMBER: capacity-timeslots");
    expect(p.ticket.comment.body).toContain("Steg användaren bockat av: 1, 3");
    expect(p.ticket.tags).toContain("lup_hjalp");
  });

  it("telefonnummer som kontakt blir ingen beställare men står i texten", () => {
    const p = zendeskPayload({ ...input, contact: "070-123 45 67" }, "T-1", null);
    expect(p.ticket).not.toHaveProperty("requester");
    expect(p.ticket.comment.body).toContain("Kontakt: 070-123 45 67");
  });

  it("skapar ärendet i Zendesk och visar Zendesk-numret", async () => {
    process.env.ZENDESK_SUBDOMAIN = "lup";
    process.env.ZENDESK_EMAIL = "support@lup.se";
    process.env.ZENDESK_API_TOKEN = "hemlig";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { id: 4321 } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await createTicket(input);
    expect(res.id).toBe("#4321");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://lup.zendesk.com/api/v2/tickets.json");
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("support@lup.se/token:hemlig").toString("base64")}`);
  });

  it("om Zendesk inte svarar sparas ärendet ändå", async () => {
    process.env.ZENDESK_SUBDOMAIN = "lup";
    process.env.ZENDESK_EMAIL = "support@lup.se";
    process.env.ZENDESK_API_TOKEN = "fel";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createTicket(input);
    expect(res.id).toMatch(/^T-/);
  });
});
