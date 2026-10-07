import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { saveUpload } from "@/lib/media";

/** Ladda upp skärmbild eller video (multipart, fält "file"). */
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil" }, { status: 400 });
  try {
    return NextResponse.json(await saveUpload(file), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Uppladdningen misslyckades" }, { status: 400 });
  }
}
