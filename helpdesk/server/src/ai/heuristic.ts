import type { AiProvider, DraftInput, DraftResult, RankInput, RankResult } from "./provider.js";
import type { Lang } from "../../../shared/types.js";

/** Reservläge utan API-nyckel: ingen LLM, men appen fungerar ändå (lokal sökning + enkla utkast). */
export class HeuristicProvider implements AiProvider {
  readonly name = "local";

  async rank(_input: RankInput): Promise<RankResult | null> { return null; }

  async suggestQueries(guide: { title: string; altQueries: string[] }): Promise<string[]> {
    const t = guide.title.toLowerCase();
    const base = t.replace(/^(lägg till|ändra|skapa|ta bort|se|välj)\s+/i, "");
    const out = [`hur ${t}`, `hur gör jag för att ${t}`, `${base}`, `hjälp med ${base}`, `how do I ${base}`];
    return out.filter((q) => !guide.altQueries.includes(q));
  }

  async translate(texts: Record<string, string>, _to: Lang, _from: Lang): Promise<Record<string, string>> {
    throw new Error("AI-översättning kräver ANTHROPIC_API_KEY. Skriv översättningen manuellt eller sätt nyckeln.");
  }

  async draftGuide(input: DraftInput): Promise<DraftResult> {
    const prompt = input.prompt.trim().replace(/[.!?]+$/, "");
    const m = prompt.match(/(?:guide|instruktion)?\s*(?:för )?(?:hur man |hur du |hur )?(.+)/i);
    const topic = (m?.[1] ?? prompt).replace(/^skapa en guide (för )?/i, "").trim();
    const title = topic ? topic[0].toUpperCase() + topic.slice(1) : "Ny guide";
    const steps = input.images.length
      ? input.images.map((_, i) => ({ text: `Steg ${i + 1}: beskriv vad användaren ska klicka på`, imageIndex: i }))
      : [{ text: "Öppna rätt sida i programmet" }, { text: "Klicka på knappen" }, { text: "Spara" }];
    return {
      title, summary: `Så här gör du: ${topic}.`.slice(0, 160), category: "start",
      altQueries: [topic, `hur ${topic}`], pageKeys: [], steps,
      imageNotes: input.images.map(() => "Ingen AI-nyckel konfigurerad – bilden är inte analyserad."),
    };
  }

  async rewriteQuery(question: string, comment: string): Promise<string> {
    return `${question} ${comment}`.trim();
  }
}
