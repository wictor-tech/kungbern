import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Medielagring.
 * - BLOB_READ_WRITE_TOKEN satt (Vercel Blob): filerna sparas i Vercel Blob och serveras därifrån.
 * - Annars: lokal disk (UPLOAD_DIR), serveras via /media/... (utveckling och egen server).
 */

export const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export const MAX_BYTES = 50 * 1024 * 1024;

export function uploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || ".data/uploads");
}

export async function saveUpload(file: File): Promise<{ url: string; kind: "image" | "video" }> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Filtypen stöds inte. Använd PNG, JPG, WebP, GIF, MP4 eller WebM.");
  if (file.size > MAX_BYTES) throw new Error("Filen är för stor (max 50 MB).");
  const name = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.${ext}`;
  const kind = file.type.startsWith("video/") ? "video" : "image";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`help/${name}`, file, { access: "public", contentType: file.type });
    return { url: blob.url, kind };
  }

  await fs.mkdir(uploadDir(), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), name), Buffer.from(await file.arrayBuffer()));
  return { url: `/media/${name}`, kind };
}

export async function readUpload(name: string): Promise<{ data: Buffer; type: string } | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  const ext = name.split(".").pop() ?? "";
  const type = Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext)?.[0];
  if (!type) return null;
  try {
    return { data: await fs.readFile(path.join(uploadDir(), name)), type };
  } catch {
    return null;
  }
}
