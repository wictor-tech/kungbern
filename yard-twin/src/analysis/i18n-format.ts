/**
 * Formatering av tal för UI-texter, svenska och engelska.
 * Svenska: decimalkomma, smalt hårt mellanslag (U+202F) som tusentalsavgränsare, "min", "kr".
 */
import { formatClock } from "../engine/time.ts";
import type { Lang } from "./common.ts";

/** Smalt, icke-brytande mellanslag – används som tusentalsavgränsare i svensk text. */
export const THIN_SPACE = " ";

function locale(lang: Lang): string {
  return lang === "sv" ? "sv-SE" : "en-GB";
}

function fmt(x: number, lang: Lang, o: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(x)) return "–";
  const parts = new Intl.NumberFormat(locale(lang), o).formatToParts(x);
  return parts.map((p) => (p.type === "group" && lang === "sv" ? THIN_SPACE : p.value)).join("");
}

/** Tal med högst `decimals` decimaler (svensk stil: 1 234,5). */
export function fmtNum(x: number, lang: Lang, decimals = 0): string {
  return fmt(x, lang, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/** Minuter: heltal över 10 min, en decimal under (väntetider under 10 min är känsliga för avrundning). */
export function fmtMin(x: number, lang: Lang): string {
  const d = Math.abs(x) < 10 ? 1 : 0;
  return `${fmtNum(x, lang, d)} min`;
}

/** Pengar utan decimaler: "12 345 kr" / "SEK 12,345". */
export function fmtMoney(x: number, currency: "SEK" | "EUR", lang: Lang): string {
  return fmt(x, lang, { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/** Andel 0–1 som procent: "42 %" / "42%". */
export function fmtPct(x: number, lang: Lang, decimals = 0): string {
  return fmt(x, lang, { style: "percent", maximumFractionDigits: decimals });
}

/** Klockslag från minuter sedan midnatt ("08:15"). */
export function fmtClock(min: number): string {
  return formatClock(min);
}

/** Intervall "a–b" med enhet efter (t.ex. "4–9 min"). */
export function fmtMinRange(lo: number, hi: number, lang: Lang): string {
  const d = Math.max(Math.abs(lo), Math.abs(hi)) < 10 ? 1 : 0;
  return `${fmtNum(lo, lang, d)}${rangeSep(lo, hi, lang)}${fmtNum(hi, lang, d)} min`;
}

/** Tankstreck mellan positiva tal, annars "till"/"to" (undviker "−5–−2"). */
function rangeSep(lo: number, hi: number, lang: Lang): string {
  if (lo >= 0 && hi >= 0) return "–";
  return lang === "sv" ? " till " : " to ";
}

export function fmtMoneyRange(lo: number, hi: number, currency: "SEK" | "EUR", lang: Lang): string {
  return `${fmtMoney(lo, currency, lang)}${rangeSep(lo, hi, lang)}${fmtMoney(hi, currency, lang)}`;
}
