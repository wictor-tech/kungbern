export type AppArea = "location-admin" | "site";
export type GuideStatus = "draft" | "published";

export interface Hotspot {
  n: number;
  label: string;
  text: string;
  /** Valfri position i skärmbilden, i procent (0–100). Används för klickbara markeringar. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface Step {
  n: number;
  text: string;
  /** Vilken markering i skärmbilden steget hör till. */
  hotspot?: number;
  /** Egen bild för steget (annars används guidens skärmbild). */
  image?: string;
  /** Framtida interaktiv walkthrough: CSS-selektor eller data-help-id i produkten. */
  target?: string;
}

export interface Note {
  type: "tip" | "warning";
  text: string;
}

export interface Guide {
  id: string;
  number: number;
  title: string;
  category: string;
  app: AppArea;
  pageKey: string;
  breadcrumb: string[];
  summary: string;
  screenshot: string | null;
  hotspots: Hotspot[];
  steps: Step[];
  notes: Note[];
  alternativeQueries: string[];
  relatedGuides: string[];
  roles: string[];
  language: "sv";
  status: GuideStatus;
  /** Framtid: kort video (10–60 s) som börjar på rätt ställe. */
  video?: { url: string; startSec?: number; endSec?: number } | null;
  version: number;
  updatedAt: string;
  updatedBy?: string | null;
}

export type GuideSummary = Pick<
  Guide,
  "id" | "number" | "title" | "category" | "app" | "summary" | "screenshot" | "status" | "updatedAt"
>;

export type AskOutcome = "answered" | "ambiguous" | "none";

export interface AskResult {
  queryId: string;
  outcome: AskOutcome;
  /** Kort mening till användaren. */
  answer: string;
  guide: Guide | null;
  alternatives: GuideSummary[];
  confidence: number;
  usedAi: boolean;
}
