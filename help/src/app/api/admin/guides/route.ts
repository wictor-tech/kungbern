import { NextResponse } from "next/server";
import { invalidateIndex } from "@/lib/ask";
import { getAdmin } from "@/lib/auth";
import { getGuide, listGuides, saveGuide } from "@/lib/guides";
import { describeIssue, GuideInput } from "@/lib/guide-schema";
import type { Guide } from "@/lib/types";

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  return NextResponse.json({ guides: await listGuides({ includeDrafts: true }) });
}

/** Skapa ny guide. */
export async function POST(req: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const parsed = GuideInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: describeIssue(parsed.error.issues[0]) }, { status: 400 });
  if (await getGuide(parsed.data.id, { includeDrafts: true }))
    return NextResponse.json({ error: "Det finns redan en guide med det id:t" }, { status: 409 });
  const guide = await saveGuide({ ...(parsed.data as Guide), language: "sv", version: 0, updatedAt: "" }, admin);
  invalidateIndex();
  return NextResponse.json({ guide }, { status: 201 });
}
