import { beforeAll, describe, expect, it } from "vitest";
import { getInsights, logFeedback } from "@/lib/analytics";
import { ask, invalidateIndex } from "@/lib/ask";
import { getGuide, listGuides, saveGuide } from "@/lib/guides";
import { createTicket } from "@/lib/tickets";

describe("hela flödet mot databasen (PGlite i minnet)", () => {
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VOYAGE_API_KEY;
  });

  it("seedar alla 38 guider från manualen", async () => {
    const guides = await listGuides();
    expect(guides).toHaveLength(38);
    expect(guides.every((g) => g.screenshot && g.steps.length > 0)).toBe(true);
  });

  it("fråga → guide → feedback → ärende → insikter", async () => {
    const r = await ask({ q: "Hur lägger jag upp en bild?", sessionId: "s1" });
    expect(r.outcome).toBe("answered");
    expect(r.guide?.id).toBe("lagga-upp-en-bild");

    for (let i = 0; i < 3; i++) await ask({ q: "Hur lägger jag till en användare?", sessionId: `u${i}` });
    for (let i = 0; i < 3; i++)
      await logFeedback({ sessionId: `f${i}`, guideId: "andra-kapacitet-per-timme", queryId: null, helpful: false, comment: "Fel" });
    const t = await createTicket({
      sessionId: "s1", queryText: "ingen kan boka", guideId: "andra-kapacitet-per-timme",
      page: "capacity-timeslots", stepsViewed: [1, 2], comment: "Hjälp", contact: "a@b.se",
    });
    expect(t.id).toMatch(/^T-/);

    const ins = await getInsights(30);
    expect(ins.totals.queries).toBe(4);
    expect(ins.totals.none + ins.totals.ambiguous).toBe(3);
    expect(ins.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "create", count: 3 }),
        expect.objectContaining({ kind: "improve", guideId: "andra-kapacitet-per-timme" }),
      ]),
    );
    expect(ins.tickets[0]).toMatchObject({ guideId: "andra-kapacitet-per-timme", page: "capacity-timeslots" });
  });

  it("admin-ändringar syns direkt i sökningen och utkast döljs", async () => {
    const g = (await getGuide("lagga-till-en-video"))!;
    await saveGuide({ ...g, alternativeQueries: [...g.alternativeQueries, "zebrafilm"] }, "test");
    invalidateIndex();
    expect((await ask({ q: "zebrafilm", log: false })).guide?.id).toBe("lagga-till-en-video");

    await saveGuide({ ...g, status: "draft" }, "test");
    invalidateIndex();
    expect(await getGuide("lagga-till-en-video")).toBeNull();
    expect((await getGuide("lagga-till-en-video", { includeDrafts: true }))?.version).toBe(3);
    expect((await ask({ q: "säkerhetsfilm", log: false })).guide?.id).not.toBe("lagga-till-en-video");
  });
});
