import { NextResponse } from "next/server";
import type { z } from "zod/v4";

/**
 * Gemensamt för det publika API:t. CORS öppnas för de origins som står i HELP_ALLOWED_ORIGINS
 * (kommaseparerat, t.ex. https://app.lupnumber.com) så att produkten kan anropa hjälpen direkt.
 */
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = (process.env.HELP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

export function json(req: Request, data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders(req) });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: json(req, { error: "Ogiltig JSON" }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: json(req, { error: "Ogiltig förfrågan", details: parsed.error.issues }, 400) };
  return { data: parsed.data };
}
