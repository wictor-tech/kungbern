/* VERAPEP v19 — private product documents (lab reports, supplier sheets, legal opinions, images).

   Files are stored under DATA_DIR/documents/, which the web server never serves. They are only
   downloadable by a signed-in admin with the products permission, as attachments with a sandbox
   CSP. Nothing is published automatically. File types are checked by content (magic bytes), not by
   name or the browser-supplied type. Replacing a document keeps the old one and links the two. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DOCUMENT_KINDS = {
  lab_report: 'Lab report / certificate of analysis',
  supplier_sheet: 'Supplier or manufacturer document',
  legal_opinion: 'Legal or regulatory assessment',
  product_image: 'Product image',
  other: 'Other evidence'
};
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: buffer => buffer.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: buffer => buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP' }
];

export function detectType(buffer) {
  return SIGNATURES.find(signature => buffer.length > 12 && signature.test(buffer)) || null;
}

/* Width/height from the file header (PNG, JPEG, WebP). Returns null when unknown. */
export function imageSize(buffer, mime) {
  try {
    if (mime === 'image/png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (mime === 'image/webp') {
      const chunk = buffer.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
      if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        offset += 2 + length;
      }
    }
  } catch { /* fall through */ }
  return null;
}

export function documentsDir(dataDir) {
  return path.join(dataDir, 'documents');
}

export function storeFile(dataDir, buffer, type) {
  const id = `doc_${crypto.randomBytes(8).toString('hex')}`;
  const dir = documentsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const storedAs = `${id}.${type.ext}`;
  fs.writeFileSync(path.join(dir, storedAs), buffer, { mode: 0o600, flag: 'wx' });
  return { id, storedAs };
}

export function readStoredFile(dataDir, storedAs) {
  if (!/^doc_[a-f0-9]{16}\.(pdf|png|jpg|webp)$/.test(String(storedAs))) throw Object.assign(new Error('Invalid document reference.'), { status: 400, code: 'invalid_document' });
  return fs.readFileSync(path.join(documentsDir(dataDir), storedAs));
}

export function cleanTitle(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 160);
}
