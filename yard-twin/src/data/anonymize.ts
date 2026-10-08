import type { Provenance, SiteModel } from "../engine/model.ts";
import type { CalibrationStats, SegmentedDist } from "./calibrate.ts";
import { DEFAULT_QUALITY_RULES, type QualityRules, type RecordedDay } from "./contract.ts";

/** Etikett för sammanslagna små segment. */
export const OTHER_LABEL = "Övrigt";
/** Etikett i demo för mätta parametrar när period och id tagits bort. */
export const DEMO_MEASURED_SOURCE = "uppmätt (period och id borttagna)";
export const DEMO_ASSUMPTION_SOURCE = "antagande";

function countBy(keys: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/**
 * Slå ihop segment med färre än k observationer till "Övrigt". Om "Övrigt" själv blir mindre än k
 * slås även det minsta namngivna segmentet in, tills "Övrigt" ≥ k eller inga namngivna finns kvar.
 * Returnerar mängden nycklar som får behålla egen etikett, sorterade på frekvens (fallande), därefter nyckel.
 */
function keepByK(keys: readonly string[], k: number): string[] {
  const counts = countBy(keys);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const keep = sorted.filter(([, n]) => n >= k);
  let other = sorted.filter(([, n]) => n < k).reduce((a, [, n]) => a + n, 0);
  while (other > 0 && other < k && keep.length > 0) other += keep.pop()![1];
  return keep.map(([key]) => key);
}

function letterLabel(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Transportör ${s}`;
}

/** Ommärkning av transportörer: vanligast → "Transportör A", osv. Små → "Övrigt". */
export function buildCarrierRelabeling(carriers: readonly string[], k: number): Record<string, string> {
  const keep = keepByK(carriers, k);
  const map: Record<string, string> = {};
  keep.forEach((key, i) => (map[key] = letterLabel(i)));
  for (const c of new Set(carriers)) if (!(c in map)) map[c] = OTHER_LABEL;
  return map;
}

/** Godstyper behåller sitt namn (inte identifierande) men små segment slås ihop. */
export function buildGoodsRelabeling(goods: readonly string[], k: number): Record<string, string> {
  const keep = new Set(keepByK(goods, k));
  const map: Record<string, string> = {};
  for (const g of new Set(goods)) map[g] = keep.has(g) ? g : OTHER_LABEL;
  return map;
}

function stripProvenance(p: Record<string, Provenance>): Record<string, Provenance> {
  const out: Record<string, Provenance> = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    out[k] = { kind: v.kind, source: v.kind === "measured" ? DEMO_MEASURED_SOURCE : DEMO_ASSUMPTION_SOURCE, ...(v.n !== undefined ? { n: v.n } : {}) };
  }
  return out;
}

export interface DemoModelOptions {
  label: string;
  /** Global ommärkning (t.ex. byggd på profilen "all") så att etiketter är konsekventa mellan profiler. */
  carrierLabels?: Record<string, string>;
}

/**
 * Gör en SiteModel säker för demo: transportörer ommärkta efter frekvens, segment < k sammanslagna
 * till "Övrigt", siteId "demo", provenance utan perioder/id (kind och n behålls).
 */
export function toDemoModel(model: SiteModel, rules: QualityRules = DEFAULT_QUALITY_RULES, opts: DemoModelOptions = { label: "Demo" }): SiteModel {
  const k = rules.kAnonymity;
  const global = opts.carrierLabels ?? buildCarrierRelabeling(model.unloadSamples.map((s) => s.carrier), k);
  const relabeled = model.unloadSamples.map((s) => ({ ...s, carrier: global[s.carrier] ?? OTHER_LABEL }));
  // k-anonymitet även inom just denna profil.
  const localKeep = new Set(keepByK(relabeled.map((s) => s.carrier), k));
  const goodsMap = buildGoodsRelabeling(relabeled.map((s) => s.goodsType), k);
  return {
    siteId: "demo",
    label: opts.label,
    dayType: model.dayType,
    hourlyArrivals: [...model.hourlyArrivals],
    unloadSamples: relabeled.map((s) => ({ ...s, carrier: localKeep.has(s.carrier) ? s.carrier : OTHER_LABEL, goodsType: goodsMap[s.goodsType] })),
    gateSamples: [...model.gateSamples],
    paperSamples: [...model.paperSamples],
    slotDeviationSamples: [...model.slotDeviationSamples],
    noShowRate: model.noShowRate,
    // Bara tider (ingen identitet) – säkert att visa i demo.
    ...(model.arrivalDays ? { arrivalDays: model.arrivalDays.map((d) => d.map((a) => ({ t: a.t, s: a.s }))) } : {}),
    provenance: stripProvenance(model.provenance),
  };
}

// --- PII-kontroll ---

/** Svenska registreringsnummer (ABC123, ABC 12A). */
const PLATE = /\b[A-Z]{3}\s?\d{2}[A-Z0-9]\b/;
const EMAIL = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/;
/** Svenska telefonnummer: +46/0046-prefix, mobil 07x, eller riktnummer med bindestreck. */
const PHONE = /(?:\+46|\b0046)(?:[\s-]?\d){7,10}\b|\b07\d[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b|\b0\d{1,3}-\d{5,8}\b/;

function piiKind(s: string): string | null {
  if (PLATE.test(s)) return "registreringsnummer";
  if (EMAIL.test(s)) return "e-post";
  if (PHONE.test(s)) return "telefonnummer";
  return null;
}

/** Djupsök ett JSON-värde (nycklar och strängar) efter registreringsnummer, e-post och telefonnummer. Kastar med lista av sökvägar. */
export function assertNoPII(value: unknown): void {
  const hits: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      const k = piiKind(v);
      if (k) hits.push(`${path || "$"} (${k})`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v !== null && typeof v === "object") {
      for (const [key, x] of Object.entries(v as Record<string, unknown>)) {
        const kk = piiKind(key);
        if (kk) hits.push(`${path}.${key} (nyckel, ${kk})`);
        walk(x, `${path}.${key}`);
      }
    }
  };
  walk(value, "$");
  if (hits.length > 0) {
    const shown = hits.slice(0, 20).join(", ");
    throw new Error(`Möjliga personuppgifter hittades på ${hits.length} ställe(n): ${shown}${hits.length > 20 ? " …" : ""}`);
  }
}

// --- Statistik och inspelade dagar för demo ---

function relabelSegmented(s: SegmentedDist, carriers: Record<string, string>, goods: Record<string, string>): SegmentedDist {
  // Segment som mappas till "Övrigt" (eller kolliderar) kan inte slås ihop korrekt från aggregat – de utelämnas.
  const pick = (rec: Record<string, SegmentedDist["byCarrier"][string]>, map: Record<string, string>) => {
    const out: Record<string, SegmentedDist["byCarrier"][string]> = {};
    const seen = new Map<string, number>();
    for (const k of Object.keys(rec)) seen.set(map[k] ?? OTHER_LABEL, (seen.get(map[k] ?? OTHER_LABEL) ?? 0) + 1);
    for (const k of Object.keys(rec)) {
      const l = map[k] ?? OTHER_LABEL;
      if (l !== OTHER_LABEL && seen.get(l) === 1) out[l] = rec[k];
    }
    return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  };
  return {
    overall: s.overall,
    byCarrier: pick(s.byCarrier, carriers),
    byGoodsType: pick(s.byGoodsType, goods),
    omitted: s.omitted.map((o) => ({ ...o, key: o.segment === "carrier" ? carriers[o.key] ?? OTHER_LABEL : goods[o.key] ?? OTHER_LABEL })),
  };
}

/** Statistik säker för demo: segmentnycklar ommärkta, sajt-id och period borttagna. */
export function toDemoStats(stats: CalibrationStats, carrierLabels: Record<string, string>, goodsLabels: Record<string, string>): CalibrationStats {
  const r = (s: SegmentedDist) => relabelSegmented(s, carrierLabels, goodsLabels);
  return {
    ...stats,
    siteId: "demo",
    period: { from: null, to: null },
    unload: r(stats.unload),
    waitToDoor: r(stats.waitToDoor),
    timeOnYard: r(stats.timeOnYard),
    slotDeviation: r(stats.slotDeviation),
    gateMin: r(stats.gateMin),
  };
}

/** Inspelade dagar säkra för demo: transportörer/godstyper ommärkta, id:n ersatta med löpnummer per dag. */
export function toDemoDays(days: readonly RecordedDay[], carrierLabels: Record<string, string>, goodsLabels: Record<string, string>): RecordedDay[] {
  return days.map((d) => ({
    ...d,
    trucks: d.trucks.map((t, i) => ({
      ...t,
      id: `T${String(i + 1).padStart(3, "0")}`,
      carrier: carrierLabels[t.carrier] ?? OTHER_LABEL,
      goodsType: goodsLabels[t.goodsType] ?? OTHER_LABEL,
    })),
  }));
}
