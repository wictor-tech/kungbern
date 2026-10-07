import type { AppArea } from "./types";

export interface Category {
  id: string;
  /** Namnet användaren ser – användarens ord, inte manualens. */
  label: string;
  description: string;
  app: AppArea;
  icon: string;
}

export const CATEGORIES: Category[] = [
  { id: "kom-igang", label: "Kom igång", description: "Hitta rätt inställning", app: "location-admin", icon: "🧭" },
  { id: "plats-och-tider", label: "Öppettider & språk", description: "Plats, öppettider, stängda dagar, språk", app: "location-admin", icon: "🕒" },
  { id: "forarens-upplevelse", label: "Bilder & bildspel", description: "Bilder, bildspel, video, QR-koder, lastbryggor", app: "location-admin", icon: "🖼️" },
  { id: "bokning-och-kapacitet", label: "Bokning & kapacitet", description: "Bokningsregler, kapacitet, återkommande bokningar", app: "location-admin", icon: "📅" },
  { id: "personer-och-meddelanden", label: "SMS & aviseringar", description: "Kontaktpersoner, aviseringar, SMS-texter", app: "location-admin", icon: "💬" },
  { id: "grindar-och-struktur", label: "Grindar & struktur", description: "Grindar, färdvägar, underplatser", app: "location-admin", icon: "🚧" },
  { id: "uppfoljning", label: "Rapporter", description: "Statistik, signaturer, avvikelser", app: "location-admin", icon: "📊" },
  { id: "daglig-drift", label: "Daglig drift", description: "Kalla in, checka ut, kö, SMS till alla", app: "site", icon: "🚚" },
];

export const APP_LABEL: Record<AppArea, string> = {
  "location-admin": "Location Admin",
  site: "Site",
};

export const APP_DESCRIPTION: Record<AppArea, string> = {
  "location-admin": "Ställ in platsen",
  site: "Daglig drift",
};

export function categoryById(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Vanliga frågor på startsidan (från manualens "Vad vill ni göra?"). */
export const POPULAR_QUESTIONS = [
  "Hur lägger jag upp en bild?",
  "Ingen kan boka",
  "Hur kallar jag in en förare?",
  "Skicka SMS till alla på området",
  "Ändra öppettider",
  "Hur ändrar jag texten i ett SMS?",
];
