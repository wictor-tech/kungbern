import type { AiProvider, DraftInput, DraftResult, RankInput, RankResult } from "./provider.js";
import { LANG_NAMES, type Guide, type Lang } from "../../../shared/types.js";

type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/** Claude via Messages API (ren fetch – inga extra beroenden). Alla anrop har timeout och fallback i anroparen. */
export class ClaudeProvider implements AiProvider {
  readonly name = "claude";
  constructor(private key: string, private model: string, private fetchFn: typeof fetch = fetch) {}

  private async call(system: string, content: Block[], maxTokens = 1200, timeoutMs = 20000): Promise<string> {
    const res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  private async json<T>(system: string, content: Block[], maxTokens?: number, timeoutMs?: number): Promise<T> {
    const text = await this.call(system + "\nSvara ENBART med giltig JSON, utan förklaringar eller kodstaket.", content, maxTokens, timeoutMs);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("Inget JSON i svaret");
    return JSON.parse(text.slice(start, end + 1)) as T;
  }

  async rank(input: RankInput): Promise<RankResult | null> {
    const list = input.candidates.map((c) => `- id=${c.id} | ${c.title} | ${c.summary} | liknande frågor: ${c.altQueries.slice(0, 6).join("; ")}`).join("\n");
    const out = await this.json<{ guideId: string | null; short: string }>(
      "Du är supportassistent i en hjälpapp. Användaren ställer en fråga (valfritt språk). Välj den guide som exakt löser det användaren vill göra, " +
        "eller null om ingen guide passar (gissa inte). Skriv ett MYCKET kort svar (högst 12 ord, imperativ, t.ex. 'Så här lägger du till en bild:') " +
        `på språket ${LANG_NAMES[input.lang]}. Format: {"guideId": string|null, "short": string}`,
      [{ type: "text", text: `Fråga: ${input.question}\nAktuell sida i programmet: ${input.page ?? "okänd"}\nGuider:\n${list}` }],
      300, 8000,
    );
    if (out.guideId && !input.candidates.some((c) => c.id === out.guideId)) return { guideId: null, short: out.short ?? "" };
    return { guideId: out.guideId ?? null, short: (out.short ?? "").slice(0, 160) };
  }

  async suggestQueries(guide: Pick<Guide, "title" | "summary" | "altQueries" | "steps">): Promise<string[]> {
    const out = await this.json<{ queries: string[] }>(
      "Föreslå 10 korta, varierade sätt som en icke-teknisk användare kan fråga efter denna guide (svenska, några på engelska). " +
        'Använd vardagsord och synonymer, inte funktionsnamn. Upprepa inte befintliga. Format: {"queries": string[]}',
      [{ type: "text", text: `Titel: ${guide.title}\nSammanfattning: ${guide.summary}\nSteg: ${guide.steps.map((s) => s.text).join(" / ")}\nBefintliga: ${guide.altQueries.join("; ")}` }],
      500,
    );
    return (out.queries ?? []).filter((q) => typeof q === "string" && !guide.altQueries.includes(q)).slice(0, 12);
  }

  async translate(texts: Record<string, string>, to: Lang, from: Lang): Promise<Record<string, string>> {
    const out = await this.json<Record<string, string>>(
      `Översätt värdena från ${LANG_NAMES[from]} till ${LANG_NAMES[to]}. Behåll nycklarna exakt. Behåll **fetstil**-markeringar runt knappnamn och ` +
        "behåll knappnamn som de står i programmet (översätt dem inte om de är i fetstil). Korta, tydliga instruktioner. Format: samma JSON-objekt.",
      [{ type: "text", text: JSON.stringify(texts) }],
      3000, 40000,
    );
    const res: Record<string, string> = {};
    for (const k of Object.keys(texts)) res[k] = typeof out[k] === "string" ? out[k] : texts[k];
    return res;
  }

  async draftGuide(input: DraftInput): Promise<DraftResult> {
    const content: Block[] = [];
    input.images.forEach((im, i) => {
      content.push({ type: "text", text: `Skärmbild ${i} (${im.name ?? "bild"}):` });
      content.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } });
    });
    content.push({ type: "text", text: `Uppdrag: ${input.prompt}\nKategorier: ${input.categories.map((c) => `${c.id}=${c.label}`).join(", ")}\nBefintliga sidnycklar: ${input.existingPageKeys.join(", ")}` });
    const out = await this.json<DraftResult>(
      "Du hjälper en administratör att skriva en visuell steg-för-steg-guide för en mjukvara. Utgå från skärmbilderna (om några) och uppdraget. " +
        "Regler: korta imperativa steg (max 12 ord), knappnamn i **fetstil** exakt som de står på bilden, ett steg = en handling. " +
        "För steg som hör till en skärmbild: ange imageIndex och hotspot (x,y,w,h som bråkdelar 0–1 av bildens bredd/höjd, uppskatta rutan runt knappen/fältet). " +
        "Ge titel (uppgiftsorienterad, 'Lägg till en bild'), summary (en mening), category (id), 8 altQueries (hur vanliga användare skulle fråga, inte funktionsnamn), " +
        "pageKeys (kort slug för sidan/funktionen), tip/warning vid behov, imageNotes (en mening per bild: vad den visar och vilka knappar som syns). " +
        'Format: {"title","summary","category","altQueries":[],"pageKeys":[],"steps":[{"text","imageIndex?","hotspot?"}],"tip?","warning?","imageNotes":[]}',
      content, 3000, 60000,
    );
    return out;
  }

  async rewriteQuery(question: string, comment: string): Promise<string> {
    const out = await this.json<{ query: string }>(
      'Användaren fick fel hjälp. Skriv om frågan till en sökfråga som tar hänsyn till kommentaren. Format: {"query": string}',
      [{ type: "text", text: `Fråga: ${question}\nKommentar: ${comment}` }], 150, 8000,
    );
    return out.query || `${question} ${comment}`;
  }
}
