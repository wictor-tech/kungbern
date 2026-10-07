import screens from "virtual:screens";
import { buildDraftGuides, buildSeedGuides } from "@/lib/seed";

const base = buildSeedGuides();
/** Samma publicerade guider som appen, med skärmbilderna inbäddade. */
export const DEMO_GUIDES = [...base, ...buildDraftGuides(base).filter((g) => g.status === "published")].map((g) => ({ ...g, screenshot: g.screenshot ? (screens[g.screenshot] ?? g.screenshot) : null }));
