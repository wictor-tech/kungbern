import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { Guide } from "./types";

/**
 * AI-lagret: väljer EN guide bland sökningens kandidater och skriver en kort mening.
 * Det hittar aldrig på steg – stegen visas alltid från guide-databasen.
 * Används bara om ANTHROPIC_API_KEY finns; annars räcker den lexikala sökningen.
 */

const Choice = z.object({
  guide_id: z.string().nullable().describe("id för den guide som löser användarens problem, eller null om ingen passar"),
  confident: z.boolean().describe("true om guiden tydligt löser det användaren frågar om"),
  answer: z.string().describe("En kort mening på svenska, max 15 ord, som leder in i guiden. Inga steg."),
});
export type AiChoice = z.infer<typeof Choice>;

const SYSTEM = `Du är hjälpfunktionen i LUPNUMBER, ett system för grindar, bokningar och incheckning av lastbilar.
Användaren är personal på en anläggning (Location Admin = inställningar, Site = daglig drift).
Du får användarens fråga och några kandidatguider. Välj den guide som bäst löser det användaren vill göra.
Regler:
- Välj bara bland kandidaterna. Finns ingen som passar: guide_id = null.
- Användare skriver vardagligt: "port" kan betyda lastbrygga (Loading bay), "chaufför" = förare, "bildspel" = Slideshow.
- answer är EN kort, vänlig mening på svenska (max 15 ord), t.ex. "Så här lägger du upp en ny bild." Skriv inga steg och hitta inte på funktioner.
- Om ingen guide passar: förklara kort att det inte finns någon guide för det än.`;

let client: Anthropic | null = null;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function chooseGuide(query: string, candidates: Guide[], pageKey?: string | null): Promise<AiChoice | null> {
  if (!aiEnabled() || candidates.length === 0) return null;
  client ??= new Anthropic({ timeout: 10_000, maxRetries: 1 });
  const list = candidates
    .map(
      (g) =>
        `- id: ${g.id}\n  titel: ${g.title}\n  var: ${g.breadcrumb.join(" › ")}\n  beskrivning: ${g.summary}\n  vanliga frågor: ${g.alternativeQueries.slice(0, 6).join("; ")}`,
    )
    .join("\n");
  try {
    const response = await client.messages.parse({
      model: process.env.HELP_AI_MODEL || "claude-haiku-5-5",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Choice) },
      messages: [
        {
          role: "user",
          content: `${pageKey ? `Användaren står på sidan: ${pageKey}\n` : ""}Fråga: ${query}\n\nKandidatguider:\n${list}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const parsed = response.parsed_output;
    if (!parsed) return null;
    if (parsed.guide_id && !candidates.some((c) => c.id === parsed.guide_id)) parsed.guide_id = null;
    return parsed;
  } catch (err) {
    console.error("[ai] chooseGuide misslyckades, faller tillbaka på sökningen:", err instanceof Error ? err.message : err);
    return null;
  }
}
