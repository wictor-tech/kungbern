import type { Guide } from "./types";

/** Ett steg i en genomgång direkt i LUPNUMBER: vilken knapp som ska markeras och vad som ska stå. */
export interface TourStep {
  n: number;
  text: string;
  /** Knappens synliga namn i appen (eller step.target om det är satt). */
  target: string | null;
}

/**
 * Bygger en genomgång från guidens steg. Varje steg pekar på det första knappnamnet i fetstil
 * ("Tryck **Spara kapacitet**" → "Spara kapacitet"), eller på stegets uttryckliga target.
 */
export function buildTour(guide: Guide): TourStep[] {
  return guide.steps.map((s) => {
    const bold = [...s.text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
    // "Öppna **Anläggning** och välj **Kolumn**" → det sista namnet är knappen man ska trycka på.
    // "Välj X under **Y**" → rutan Y är det man ska leta efter.
    const under = s.text.match(/under \*\*(.+?)\*\*/)?.[1];
    const target = s.target ?? under ?? (/^Öppna .+ och (välj|klicka)/i.test(s.text) ? bold[bold.length - 1] : bold[0]) ?? null;
    return { n: s.n, text: s.text.replace(/\*\*(.+?)\*\*/g, "$1"), target };
  });
}

export function hasTour(guide: Guide) {
  return buildTour(guide).filter((s) => s.target).length >= 2;
}
