import { readUpload } from "@/lib/media";

/** Serverar uppladdade filer (lokal lagring i MVP). */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const file = await readUpload((await params).name);
  if (!file) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "content-type": file.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
