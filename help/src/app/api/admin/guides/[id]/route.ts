import { NextResponse } from "next/server";
import { invalidateIndex } from "@/lib/ask";
import { getAdmin } from "@/lib/auth";
import { deleteGuide, getGuide, saveGuide } from "@/lib/guides";
import { describeIssue, GuideInput } from "@/lib/guide-schema";
import type { Guide } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const guide = await getGuide((await params).id, { includeDrafts: true });
  return guide ? NextResponse.json({ guide }) : NextResponse.json({ error: "Finns inte" }, { status: 404 });
}

/** Uppdatera en befintlig guide. */
export async function PUT(req: Request, { params }: Ctx) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const { id } = await params;
  const existing = await getGuide(id, { includeDrafts: true });
  if (!existing) return NextResponse.json({ error: "Finns inte" }, { status: 404 });
  const parsed = GuideInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: describeIssue(parsed.error.issues[0]) }, { status: 400 });
  if (parsed.data.id !== id) return NextResponse.json({ error: "id kan inte ändras" }, { status: 400 });
  const guide = await saveGuide({ ...existing, ...(parsed.data as Partial<Guide>) } as Guide, admin);
  invalidateIndex();
  return NextResponse.json({ guide });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  await deleteGuide((await params).id);
  invalidateIndex();
  return NextResponse.json({ ok: true });
}
