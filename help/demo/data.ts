import screens from "virtual:screens";
import { publishedSeedGuides } from "@/lib/seed";

/** Samma publicerade guider som appen, med skärmbilderna inbäddade. */
export const DEMO_GUIDES = publishedSeedGuides().map((g) => ({
  ...g,
  screenshot: g.screenshot ? (screens[g.screenshot] ?? g.screenshot) : null,
}));
