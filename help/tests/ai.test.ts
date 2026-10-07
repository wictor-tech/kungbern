import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Simulerad Claude: varje test bestämmer vad "modellen" svarar.
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse };
  },
}));

const { ask, invalidateIndex } = await import("@/lib/ask");

describe("AI-lagret (simulerad Claude)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    parse.mockReset();
    invalidateIndex();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("följer AI:ns val och visar dess mening", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { guide_id: "byta-lastbrygga", confident: true, answer: "Så här byter du port." },
    });
    const r = await ask({ q: "chauffören ska till en annan port", log: false });
    expect(r.usedAi).toBe(true);
    expect(r.outcome).toBe("answered");
    expect(r.guide?.id).toBe("byta-lastbrygga");
    expect(r.answer).toBe("Så här byter du port.");
    // Bara kandidater från sökningen skickas med – AI:n väljer, den hittar inte på.
    const prompt = parse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("byta-lastbrygga");
  });

  it("ignorerar ett guide-id som inte fanns bland kandidaterna", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { guide_id: "pahittad-guide", confident: true, answer: "Här är en guide." },
    });
    const r = await ask({ q: "ändra öppettider", log: false });
    expect(r.guide?.id).not.toBe("pahittad-guide");
    expect(r.outcome).not.toBe("answered");
  });

  it("respekterar att ingen guide passar", async () => {
    parse.mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { guide_id: null, confident: false, answer: "Det finns ingen guide för det än." },
    });
    const r = await ask({ q: "koppla vår kamera till grinden", log: false });
    expect(r.guide).toBeNull();
    expect(r.answer).toBe("Det finns ingen guide för det än.");
  });

  it("faller tillbaka på sökningen om Claude inte svarar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    parse.mockRejectedValue(new Error("timeout"));
    const r = await ask({ q: "Hur lägger jag upp en bild?", log: false });
    expect(r.usedAi).toBe(false);
    expect(r.guide?.id).toBe("lagga-upp-en-bild");
  });

  it("vid vägran (refusal) används sökningen", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    const r = await ask({ q: "Hur lägger jag upp en bild?", log: false });
    expect(r.usedAi).toBe(false);
    expect(r.guide?.id).toBe("lagga-upp-en-bild");
  });
});
