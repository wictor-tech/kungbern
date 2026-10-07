// Delad datamodell för frontend, backend och framtida inbäddning i produkten.

export const LANGS = ["sv", "en", "da", "no", "fi", "de", "fr", "nl", "pl"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  sv: "Svenska", en: "English", da: "Dansk", no: "Norsk", fi: "Suomi",
  de: "Deutsch", fr: "Français", nl: "Nederlands", pl: "Polski",
};

/** Rektangel i normaliserade bildkoordinater (0–1). */
export interface Hotspot { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export interface Step {
  id: string;
  /** Kort instruktion. `**fet**` stöds för knappnamn. */
  text: string;
  /** URL till skärmbild (/media/...). */
  image?: string;
  /** Förvald markering ritad i adminläget (på ren skärmbild). */
  hotspot?: Hotspot;
  /** Punkt att zooma mot när bilden redan är annoterad. */
  focus?: Point;
  /** Var den pulserande ringen ritas (numrerad markering i den annoterade bilden). */
  pin?: Point;
  /** Skärmbilden innehåller redan inritade markeringar. */
  annotated?: boolean;
  /** Bildens bredd/höjd – används för att reservera plats innan den laddats. */
  ratio?: number;
}

export interface GuideVideo {
  url: string;
  /** Startposition i sekunder – videon hoppar direkt till den relevanta delen. */
  start?: number;
  end?: number;
  poster?: string;
}

/** Interaktiv produkt-tour som körs i den riktiga appen (se embed.js). */
export interface WalkthroughStep {
  /** CSS-selektor till elementet som ska markeras. */
  selector: string;
  text: string;
  advanceOn: "click" | "input" | "next";
  /** Valfritt: steget gäller bara när sökvägen matchar. */
  pathMatch?: string;
}

export interface GuideTranslation {
  title: string;
  summary: string;
  steps: Record<string, string>; // stegets id -> text
  warning?: string;
  tip?: string;
  altQueries?: string[];
  /** true = maskinöversatt och ej granskad. */
  auto?: boolean;
  updatedAt: string;
}

export interface Guide {
  id: string;
  status: "draft" | "published";
  title: string;
  /** Det korta svaret som visas först. En mening. */
  summary: string;
  category: string;
  /** Alternativa sätt att fråga – grunden för smart sökning. */
  altQueries: string[];
  steps: Step[];
  tip?: string;
  warning?: string;
  video?: GuideVideo;
  walkthrough?: WalkthroughStep[];
  /** "Så hittar du hit": var i programmet funktionen ligger (visas som en kompakt rad i stället för ett eget steg). */
  location?: { path: string[]; image?: string; hotspot?: Hotspot; ratio?: number };
  /** Internt: utkast som behöver innehåll (visas bara i adminläget). */
  todo?: string;
  /** Vilka sidor/funktioner i programmet guiden gäller (för kontextmedveten hjälp). */
  pageKeys: string[];
  roles: string[];
  /** Källspråk för title/summary/steps. */
  lang: Lang;
  translations: Partial<Record<Lang, GuideTranslation>>;
  related: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/** Guide anpassad till ett visst språk. */
export interface LocalizedGuide extends Omit<Guide, "translations"> {
  shownLang: Lang;
  /** true om texten är maskinöversatt eller saknar översättning. */
  machineTranslated?: boolean;
  untranslated?: boolean;
}

export interface Category { id: string; icon: string; labels: Partial<Record<Lang, string>>; /** Antal publicerade guider (sätts av API:t). */ count?: number }

export interface AskContext {
  /** Sidnyckel från programmet, t.ex. "slideshow". */
  page?: string;
  role?: string;
  sessionId?: string;
}

export interface Candidate { guideId: string; title: string; summary: string; category: string; score: number }

export interface AskResponse {
  queryId: string;
  q: string;
  /** "good" = visa guide direkt, "weak" = visa förslag, "none" = inget svar. */
  quality: "good" | "weak" | "none";
  /** Mycket kort textsvar. */
  short: string;
  guide?: LocalizedGuide;
  confidence: number;
  alternatives: Candidate[];
  usedAi: boolean;
}

export interface Ticket {
  id: string;
  createdAt: string;
  status: "open" | "closed";
  question: string;
  guideId?: string;
  guideTitle?: string;
  page?: string;
  stepsViewed: number[];
  comment?: string;
  email?: string;
  message?: string;
  lang: Lang;
  /** Sant om en befintlig guide hade rätt svar (används i analytics). */
  deflectable?: boolean;
}

export type EventType = "ask" | "view" | "step" | "video" | "feedback" | "comment" | "ticket" | "walkthrough";

export interface HelpEvent {
  id: string;
  ts: string;
  type: EventType;
  queryId?: string;
  sessionId?: string;
  q?: string;
  lang?: Lang;
  page?: string;
  guideId?: string;
  quality?: "good" | "weak" | "none";
  confidence?: number;
  helped?: boolean;
  comment?: string;
  step?: number;
  stepsViewed?: number[];
}

export interface AnalyticsReport {
  totals: { questions: number; answered: number; unanswered: number; helpedYes: number; helpedNo: number; tickets: number; deflectable: number; solveRate: number | null };
  topQuestions: { q: string; count: number; guideId?: string; guideTitle?: string }[];
  unanswered: { q: string; count: number }[];
  topGuides: { guideId: string; title: string; views: number; yes: number; no: number }[];
  badGuides: { guideId: string; title: string; views: number; yes: number; no: number; noRate: number }[];
  hardPages: { page: string; questions: number; no: number }[];
  deflectableTickets: Ticket[];
  suggestions: { kind: "create" | "improve"; text: string; count: number; guideId?: string; examples: string[] }[];
  days: { day: string; questions: number; no: number }[];
}
