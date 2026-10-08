import type { Controls } from "./types.ts";

/**
 * Förberedda scenarier för presentationsläget. Det är bara ändringar av reglagen; alla siffror
 * räknas fram ur datasetet när scenariot körs. Inga resultat är hårdkodade.
 */
export interface Preset {
  id: string;
  sv: string;
  en: string;
  patch: (base: Controls) => Partial<Controls>;
}

export const PRESETS: Preset[] = [
  { id: "replay", sv: "Så här var dagen", en: "How the day went", patch: () => ({ mode: "replay" }) },
  { id: "random", sv: "Utan bokning", en: "Without booking", patch: () => ({ mode: "whatif", pattern: "poisson", strategy: "fcfs" }) },
  { id: "booked", sv: "Med slottbokning", en: "With slot booking", patch: () => ({ mode: "whatif", pattern: "booked", strategy: "booked-first", adherence: null }) },
  { id: "booked-disciplined", sv: "Slottbokning + 90 % i tid", en: "Slot booking + 90 % on time", patch: () => ({ mode: "whatif", pattern: "booked", strategy: "booked-first", adherence: 0.9 }) },
  { id: "growth", sv: "+20 % volym", en: "+20 % volume", patch: (b) => ({ mode: "whatif", pattern: b.pattern === "recorded" ? "poisson" : b.pattern, volumeFactor: 1.2 }) },
  { id: "peak", sv: "Kampanjtopp", en: "Campaign peak", patch: () => ({ mode: "whatif", pattern: "burst", burstMultiplier: 2 }) },
  { id: "door", sv: "En dörr extra", en: "One more door", patch: (b) => ({ mode: "whatif", doors: b.doors + 1 }) },
];
