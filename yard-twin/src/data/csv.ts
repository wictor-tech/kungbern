import type { Visit, VisitStatus } from "./contract.ts";
import { VISIT_FIELDS } from "./fields.ts";

/**
 * CSV-adapter för Visit-kontraktet (version 1). Kolumnnamn = kontraktets fältnamn.
 * Tomt fält = null. `manuallyEdited` sammanfogas med "|". Citering enligt RFC 4180.
 * Det här är INTE en källadapter – källsystemens fältnamn är okända.
 */

const STATUSES: readonly VisitStatus[] = ["completed", "no_show", "cancelled", "in_progress", "unknown"];
const NUMERIC = new Set<string>(["pallets"]);

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cell(v: Visit, f: (typeof VISIT_FIELDS)[number]): string {
  const x = v[f];
  if (x === null || x === undefined) return "";
  if (Array.isArray(x)) return quote(x.join("|"));
  return quote(String(x));
}

export function visitsToCsv(visits: readonly Visit[]): string {
  const lines = [VISIT_FIELDS.join(",")];
  for (const v of visits) lines.push(VISIT_FIELDS.map((f) => cell(v, f)).join(","));
  return lines.join("\n") + "\n";
}

/** RFC 4180-parser: hanterar citattecken, dubblerade citattecken, radbrytningar i fält, CRLF och BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
      } else field += c;
      i++;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (c === "\r" && s[i + 1] === "\n") i++;
    } else field += c;
    i++;
  }
  if (inQ) throw new Error("CSV: oavslutat citattecken");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function visitsFromCsv(text: string): Visit[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const missing = VISIT_FIELDS.filter((f) => !header.includes(f));
  if (missing.length > 0) throw new Error(`CSV saknar kolumner: ${missing.join(", ")}`);
  const idx = Object.fromEntries(VISIT_FIELDS.map((f) => [f, header.indexOf(f)])) as Record<(typeof VISIT_FIELDS)[number], number>;
  return rows.slice(1).map((r, n) => {
    const line = n + 2;
    if (r.length !== header.length) throw new Error(`CSV rad ${line}: ${r.length} fält, förväntat ${header.length}`);
    const out: Record<string, unknown> = {};
    for (const f of VISIT_FIELDS) {
      const raw = r[idx[f]];
      if (f === "manuallyEdited") out[f] = raw === "" ? [] : raw.split("|").filter((x) => x !== "");
      else if (raw === "") out[f] = null;
      else if (NUMERIC.has(f)) {
        const x = Number(raw);
        if (!Number.isFinite(x)) throw new Error(`CSV rad ${line}: ${f}="${raw}" är inget tal`);
        out[f] = x;
      } else out[f] = raw;
    }
    for (const f of ["visitId", "tenantId", "siteId", "siteTimeZone"] as const) {
      if (out[f] === null) throw new Error(`CSV rad ${line}: ${f} saknas`);
    }
    if (out.status === null) out.status = "unknown";
    if (!STATUSES.includes(out.status as VisitStatus)) throw new Error(`CSV rad ${line}: okänd status "${String(out.status)}"`);
    return out as unknown as Visit;
  });
}
