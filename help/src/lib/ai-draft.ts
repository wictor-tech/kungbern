import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { CATEGORIES } from "./categories";
import { readUpload } from "./media";

/**
 * AI-förslag på en ny guide i adminläget: utifrån en instruktion och gärna en skärmbild från appen
 * föreslås titel, kategori, steg, markeringar och vanliga frågor. Redaktören granskar alltid innan sparning.
 */

const Draft = z.object({
  title: z
    .string()
    .describe("Vad användaren vill göra, t.ex. 'Lägga upp en bild'"),
  category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]),
  breadcrumb: z
    .array(z.string())
    .describe(
      "Menysökväg, t.ex. ['Location Admin', 'Din plats', 'Platsdetaljer', 'Bildhantering']",
    ),
  summary: z
    .string()
    .describe("En–två korta meningar om vad sidan/funktionen gör"),
  steps: z
    .array(z.string())
    .describe(
      "3–7 korta steg i imperativ. Knappnamn exakt som i appen, inom **…**",
    ),
  hotspots: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .describe("Viktiga knappar/fält i skärmbilden"),
  notes: z.array(
    z.object({ type: z.enum(["tip", "warning"]), text: z.string() }),
  ),
  alternativeQueries: z
    .array(z.string())
    .describe("8–12 sätt en användare kan fråga, vardagligt språk"),
  uncertain: z
    .array(z.string())
    .describe("Saker du inte kunde se och som redaktören bör kontrollera"),
});
export type GuideDraft = z.infer<typeof Draft>;

const SYSTEM = `Du skriver hjälpguider för LUPNUMBER (grindar, bokningar och incheckning av lastbilar).
Användarna är personal på en anläggning och vill snabbt veta exakt var de ska klicka.
Stil:
- Svenska, korta meningar, imperativ ("Tryck **Spara kapacitet**.").
- Knappar och fält skrivs EXAKT som de syns i skärmbilden, inom **…**.
- 3–7 steg. Ett steg = en handling. Ingen utfyllnad.
- Varningar bara för saker som påverkar verkligheten (SMS skickas, grindar öppnas, något raderas).
- Hitta aldrig på knappar eller funktioner. Det du inte kan se lägger du i "uncertain".
Kategorier: ${CATEGORIES.map((c) => `${c.id} (${c.label}: ${c.description})`).join("; ")}.`;

export function draftEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MEDIA: Record<
  string,
  "image/png" | "image/jpeg" | "image/webp" | "image/gif"
> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Läser skärmbilden (uppladdad, från appen eller i Vercel Blob) som base64. */
async function loadImage(
  url: string,
): Promise<{ data: string; media_type: (typeof MEDIA)[string] } | null> {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const media_type = MEDIA[ext];
  if (!media_type) return null;
  let buf: Buffer | null = null;
  if (url.startsWith("/media/"))
    buf = (await readUpload(url.slice("/media/".length)))?.data ?? null;
  else if (url.startsWith("/screens/") && !url.includes(".."))
    buf = await fs
      .readFile(path.join(process.cwd(), "public", url))
      .catch(() => null);
  else if (
    /^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\//.test(url)
  ) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(
      () => null,
    );
    buf = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  if (!buf || buf.length > 5 * 1024 * 1024) return null;
  return { data: buf.toString("base64"), media_type };
}

let client: Anthropic | null = null;

/** SDK-fel visas för redaktören på svenska. Detaljerna hamnar i serverloggen. */
function friendly(err: unknown): string {
  const status = err instanceof Anthropic.APIError ? err.status : undefined;
  if (status === 401 || status === 403)
    return "API-nyckeln för AI godkändes inte. Kontrollera ANTHROPIC_API_KEY.";
  if (status === 429 || status === 529)
    return "AI-tjänsten är upptagen just nu. Försök igen om en minut.";
  return "AI-tjänsten svarade inte. Försök igen om en stund.";
}

export async function draftGuide(input: {
  instruction: string;
  screenshot?: string | null;
}): Promise<GuideDraft> {
  if (!draftEnabled())
    throw new Error("AI-förslag kräver ANTHROPIC_API_KEY på servern.");
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 1 });
  const image = input.screenshot ? await loadImage(input.screenshot) : null;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(image
      ? [
          {
            type: "image" as const,
            source: { type: "base64" as const, ...image },
          },
        ]
      : []),
    {
      type: "text",
      text: `${image ? "Skärmbilden ovan är från LUPNUMBER. " : ""}Skapa ett förslag på en hjälpguide.\nInstruktion från redaktören: ${input.instruction}`,
    },
  ];
  const response = await client.beta.messages
    .parse({
      model: process.env.HELP_AI_DRAFT_MODEL || "claude-sonnet-5-5",
      max_tokens: 8000,
      system: SYSTEM,
      // Om en förfrågan avvisas försöker servern automatiskt med en lämplig reservmodell.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Draft) },
      messages: [{ role: "user", content }],
    })
    .catch((err: unknown) => {
      console.error("[ai-draft]", err);
      throw new Error(friendly(err));
    });
  if (response.stop_reason === "refusal")
    throw new Error(
      "AI:n kunde inte skapa ett förslag för den här instruktionen.",
    );
  if (!response.parsed_output)
    throw new Error("AI:n gav inget användbart svar. Försök igen.");
  return response.parsed_output;
}
