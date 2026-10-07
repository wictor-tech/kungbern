import type { Guide, GuideSummary } from "./types";

export function toSummary(g: Guide): GuideSummary {
  const { id, number, title, category, app, summary, screenshot, status, updatedAt } = g;
  return { id, number, title, category, app, summary, screenshot, status, updatedAt };
}
