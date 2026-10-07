import screens from "virtual:screens";
import { buildSeedGuides } from "@/lib/seed";

/** Samma 38 guider som appen, med skärmbilderna inbäddade. */
export const DEMO_GUIDES = buildSeedGuides().map((g) => ({ ...g, screenshot: g.screenshot ? (screens[g.screenshot] ?? g.screenshot) : null }));
