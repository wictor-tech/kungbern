import { existsSync, createReadStream, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

const TYPES: Record<string, { ext: string; max: number; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", max: 12e6, magic: (b) => b.subarray(0, 4).toString("hex") === "89504e47" },
  "image/jpeg": { ext: "jpg", max: 12e6, magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  "image/webp": { ext: "webp", max: 12e6, magic: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  "image/gif": { ext: "gif", max: 12e6, magic: (b) => b.subarray(0, 3).toString() === "GIF" },
  "video/mp4": { ext: "mp4", max: 150e6, magic: (b) => b.subarray(4, 8).toString() === "ftyp" },
  "video/webm": { ext: "webm", max: 150e6, magic: (b) => b.subarray(0, 4).toString("hex") === "1a45dfa3" },
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(TYPES).map(([m, t]) => [t.ext, m]));

export function saveUpload(dir: string, contentType: string, body: Buffer): { url: string; file: string } {
  const t = TYPES[contentType.split(";")[0].trim().toLowerCase()];
  if (!t) throw new HttpError(415, "Filtypen stöds inte (png, jpg, webp, gif, mp4, webm)");
  if (body.length === 0 || body.length > t.max) throw new HttpError(413, `Filen är för stor (max ${Math.round(t.max / 1e6)} MB)`);
  if (!t.magic(body)) throw new HttpError(415, "Filens innehåll matchar inte filtypen");
  const file = `${randomBytes(9).toString("base64url")}.${t.ext}`;
  writeFileSync(join(dir, file), body);
  return { url: `/media/${file}`, file };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Serverar en uppladdad fil med stöd för Range (krävs för att kunna spola i video). */
export function serveMedia(dir: string, name: string, range: string | undefined): Response {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  const path = join(dir, name);
  if (!existsSync(path)) return new Response("Not found", { status: 404 });
  const ext = extname(name).slice(1).toLowerCase();
  const type = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const size = statSync(path).size;
  const cache = /^p\d+\.jpg$/.test(name) ? "public, max-age=86400" : "public, max-age=31536000, immutable";
  const headers: Record<string, string> = { "content-type": type, "cache-control": cache, "accept-ranges": "bytes", "x-content-type-options": "nosniff" };
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
      status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
