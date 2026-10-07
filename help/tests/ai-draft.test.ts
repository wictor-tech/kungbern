import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simulerad Claude för adminlägets AI-förslag.
const parse = vi.fn();
class APIError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status} internal details`);
  }
}
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    static APIError = APIError;
    beta = { messages: { parse } };
  },
}));

const { draftGuide, draftEnabled } = await import("@/lib/ai-draft");

const sample = {
  title: "Lägga upp en bild",
  category: "forarens-upplevelse",
  breadcrumb: ["Location Admin", "Din plats", "Bildhantering"],
  summary: "Bilder hjälper förarna att hitta rätt.",
  steps: ["Öppna **Bildhantering**.", "Tryck **Ladda upp**."],
  hotspots: [{ label: "Ladda upp", text: "Välj en bild från datorn." }],
  notes: [],
  alternativeQueries: ["lägga till foto"],
  uncertain: [],
};

describe("AI-förslag på guider (simulerad Claude)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    parse.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("är avstängt utan API-nyckel", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(draftEnabled()).toBe(false);
    await expect(draftGuide({ instruction: "Bilder" })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(parse).not.toHaveBeenCalled();
  });

  it("returnerar förslaget och skickar med skärmbilden från appen", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: sample });
    const d = await draftGuide({ instruction: "Hur man laddar upp en bild", screenshot: "/screens/app/andra-bildspelet.webp" });
    expect(d.title).toBe("Lägga upp en bild");
    const req = parse.mock.calls[0][0];
    expect(req.fallbacks).toBe("default");
    const content = req.messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.media_type).toBe("image/webp");
    expect(content.at(-1).text).toContain("Hur man laddar upp en bild");
  });

  it("läser aldrig filer utanför public/screens", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: sample });
    await draftGuide({ instruction: "Test av sökväg", screenshot: "/screens/../../.env.png" });
    await draftGuide({ instruction: "Test av extern bild", screenshot: "https://evil.example.com/x.png" });
    for (const call of parse.mock.calls) expect(call[0].messages[0].content.every((b: { type: string }) => b.type === "text")).toBe(true);
  });

  it("ger ett begripligt fel när modellen avböjer eller svarar tomt", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    await expect(draftGuide({ instruction: "Något" })).rejects.toThrow(/kunde inte/);
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: null });
    await expect(draftGuide({ instruction: "Något" })).rejects.toThrow(/Försök igen/);
  });

  it("visar API-fel på svenska utan tekniska detaljer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parse.mockRejectedValueOnce(new APIError(401));
    await expect(draftGuide({ instruction: "Något" })).rejects.toThrow("API-nyckeln för AI godkändes inte. Kontrollera ANTHROPIC_API_KEY.");
    parse.mockRejectedValueOnce(new APIError(529));
    await expect(draftGuide({ instruction: "Något" })).rejects.toThrow(/upptagen/);
    parse.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(draftGuide({ instruction: "Något" })).rejects.toThrow("AI-tjänsten svarade inte. Försök igen om en stund.");
  });
});
