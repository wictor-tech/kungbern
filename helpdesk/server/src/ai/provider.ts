import type { Guide, Lang } from "../../../shared/types.js";

export interface RankInput {
  question: string;
  lang: Lang;
  page?: string;
  candidates: { id: string; title: string; summary: string; altQueries: string[] }[];
}
export interface RankResult {
  /** Vald guide eller null om ingen passar. */
  guideId: string | null;
  /** Ett kort svar (max ~12 ord) på användarens språk. */
  short: string;
}

export interface DraftInput {
  prompt: string;
  /** Skärmbilder (base64, utan data:-prefix) som AI kan titta på. */
  images: { mediaType: string; data: string; name?: string }[];
  categories: { id: string; label: string }[];
  existingPageKeys: string[];
}
export interface DraftResult {
  title: string;
  summary: string;
  category: string;
  altQueries: string[];
  pageKeys: string[];
  steps: { text: string; imageIndex?: number; hotspot?: { x: number; y: number; w: number; h: number }; description?: string }[];
  tip?: string;
  warning?: string;
  /** Kort beskrivning av vad bilderna visar och vilka knappar som syns. */
  imageNotes?: string[];
}

export interface AiProvider {
  readonly name: string;
  /** Förstå användarens fråga och välj bland kandidaterna. */
  rank(input: RankInput): Promise<RankResult | null>;
  /** Föreslå fler sätt att fråga efter samma guide. */
  suggestQueries(guide: Pick<Guide, "title" | "summary" | "altQueries" | "steps">): Promise<string[]>;
  /** Översätt guide-texter. `texts` bevarar nycklar (title, summary, steps-id …). */
  translate(texts: Record<string, string>, to: Lang, from: Lang): Promise<Record<string, string>>;
  /** Skapa ett första utkast till guide. */
  draftGuide(input: DraftInput): Promise<DraftResult>;
  /** Omformulera en sökfråga när användaren sagt att svaret inte hjälpte. */
  rewriteQuery(question: string, comment: string): Promise<string>;
}
