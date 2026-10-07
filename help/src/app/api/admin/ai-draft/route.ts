import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { draftEnabled, draftGuide } from "@/lib/ai-draft";
import { getAdmin } from "@/lib/auth";
import { rateLimited } from "@/lib/ratelimit";

const Body = z.object({ instruction: z.string().trim().min(5).max(1000), screenshot: z.string().max(400).nullish() });

/** POST /api/admin/ai-draft – AI föreslår en guide (kräver inloggning och ANTHROPIC_API_KEY). */
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  if (!draftEnabled())
    return NextResponse.json({ error: "AI-förslag är inte påslaget. Lägg in ANTHROPIC_API_KEY i Vercel (se DEPLOY.md)." }, { status: 503 });
  if (rateLimited(req, "ai-draft", 20)) return NextResponse.json({ error: "Vänta en stund innan du ber om fler förslag." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Beskriv guiden med minst några ord." }, { status: 400 });
  try {
    return NextResponse.json({ draft: await draftGuide(parsed.data) });
  } catch (err) {
    console.error("[ai-draft]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI-förslaget misslyckades." }, { status: 502 });
  }
}
