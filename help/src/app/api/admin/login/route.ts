import { NextResponse } from "next/server";
import { adminConfigured, checkPassword, setAdminCookie } from "@/lib/auth";
import { rateLimited } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "ADMIN_PASSWORD är inte satt på servern." }, { status: 503 });
  if (rateLimited(req, "login", 10)) return NextResponse.redirect(new URL("/admin/login?fel=1", req.url), 303);
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.redirect(new URL("/admin/login?fel=1", req.url), 303);
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!checkPassword(password)) {
    // Liten fördröjning gör gissning dyrare.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.redirect(new URL("/admin/login?fel=1", req.url), 303);
  }
  await setAdminCookie(name || "admin");
  return NextResponse.redirect(new URL("/admin", req.url), 303);
}
