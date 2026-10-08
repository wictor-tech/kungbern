/**
 * Automatiska insikter i klartext. Varje mening räknas fram ur simuleringsdata – inga färdiga påståenden.
 * En insikt vars underliggande tal inte är ändligt (NaN/Infinity) skickas aldrig ut.
 */
import { pairedDelta, type MonteCarloResult } from "../engine/montecarlo.ts";
import type { RunResult, SeriesPoint, DoorInterval } from "../engine/types.ts";
import type { Lang } from "./common.ts";
import { fmtClock, fmtMin, fmtMinRange, fmtMoney, fmtMoneyRange, fmtNum, fmtPct } from "./i18n-format.ts";

export interface Insight {
  id: string;
  severity: "info" | "warn" | "good";
  text: string;
}

/** PRODUKTBESLUT: köfönstret = sammanhängande period där antalet väntande är minst 50 % av dagens max. */
export const PEAK_WINDOW_SHARE = 0.5;
/** Köfönstrets gränser avrundas till närmaste kvart – exaktare än så är inte meningsfullt att säga till en kund. */
export const PEAK_ROUND_MIN = 15;
/** Timmar med dörrbeläggning under 30 % nämns som "lugna". */
export const IDLE_DOOR_UTILIZATION = 0.3;
/** Intervallet som visas för jämförelser (p10–p90 = 80 %). */
const INTERVAL_LABEL = { sv: "80 % intervall", en: "80% interval" } as const;

export interface InsightInput {
  /** Detaljerad körning (runDetailed) – ger tidsserie och dörrintervall. */
  result: RunResult;
  mc?: MonteCarloResult;
  compare?: { label: string; mc: MonteCarloResult; baseLabel: string; baseMc: MonteCarloResult };
  lang: Lang;
  currency: "SEK" | "EUR";
  /** Antal dörrar (annars antal dörrar som syns i dörrintervallen). */
  doorCount?: number;
  /** Stängningstid (min sedan midnatt) – ger "X min före stängning". */
  closeAt?: number;
}

export function generateInsights(input: InsightInput): Insight[] {
  const { lang } = input;
  const out: Insight[] = [];
  const push = (id: string, severity: Insight["severity"], text: string, ...nums: number[]) => {
    if (nums.every((n) => Number.isFinite(n))) out.push({ id, severity, text });
  };
  const L = (sv: string, en: string) => (lang === "sv" ? sv : en);

  // 1. Köfönster
  const w = peakWindow(input.result.series);
  if (w) {
    push(
      "queue-peak",
      w.max >= 3 ? "warn" : "info",
      L(`Köerna uppstår ${fmtClock(w.from)}–${fmtClock(w.to)} (som mest ${w.max} lastbilar väntar samtidigt).`, `Queues build up ${fmtClock(w.from)}–${fmtClock(w.to)} (at most ${w.max} trucks waiting at once).`),
      w.from,
      w.to,
      w.max,
    );
  } else if (input.result.series.length > 0) {
    push("queue-none", "good", L("Ingen kö uppstår under dagen.", "No queue builds up during the day."));
  }

  // 2. Jämförelse (parvisa deltan)
  if (input.compare) {
    const { label, mc, baseLabel, baseMc } = input.compare;
    const from = baseMc.summary.avgWait.median;
    const to = mc.summary.avgWait.median;
    const d = pairedDelta(baseMc, mc, "avgWait");
    const better = d.p90 < 0, worse = d.p10 > 0;
    const verbSv = to <= from ? "sjunker" : "ökar", verbEn = to <= from ? "falls" : "rises";
    const range = fmtMinRange(d.p10, d.p90, lang);
    const tail = better || worse ? "" : L(" – skillnaden är osäker", " – the difference is uncertain");
    push(
      "compare-avgwait",
      better ? "good" : worse ? "warn" : "info",
      L(
        `Med ${label} ${verbSv} medelväntan från ${fmtMin(from, "sv")} till ${fmtMin(to, "sv")} jämfört med ${baseLabel} (skillnad ${range}, ${INTERVAL_LABEL.sv})${tail}.`,
        `With ${label}, average wait ${verbEn} from ${fmtMin(from, "en")} to ${fmtMin(to, "en")} compared with ${baseLabel} (difference ${range}, ${INTERVAL_LABEL.en})${tail}.`,
      ),
      from,
      to,
      d.p10,
      d.p90,
    );
  }

  // 3. Detention
  const m = input.result.metrics;
  if (input.mc) {
    const od = input.mc.summary.overDetention;
    const dc = input.mc.summary.detentionCost;
    if (od.median > 0) {
      push(
        "detention",
        "warn",
        L(
          `Typiskt ${fmtNum(od.median, "sv")} lastbilar per dag överskrider fri tid (${fmtNum(od.p10, "sv")}–${fmtNum(od.p90, "sv")}); detentionkostnad ${fmtMoney(dc.median, input.currency, "sv")} per dag (${fmtMoneyRange(dc.p10, dc.p90, input.currency, "sv")}).`,
          `Typically ${fmtNum(od.median, "en")} trucks per day exceed free time (${fmtNum(od.p10, "en")}–${fmtNum(od.p90, "en")}); detention cost ${fmtMoney(dc.median, input.currency, "en")} per day (${fmtMoneyRange(dc.p10, dc.p90, input.currency, "en")}).`,
        ),
        od.median, od.p10, od.p90, dc.median, dc.p10, dc.p90,
      );
    } else {
      push("detention-none", "good", L("En typisk dag överskrider ingen lastbil fri tid.", "On a typical day no truck exceeds free time."));
    }
  } else if (m.overDetention > 0) {
    push(
      "detention",
      "warn",
      L(`${m.overDetention} lastbilar överskrider fri tid; detentionkostnad ${fmtMoney(m.detentionCost, input.currency, "sv")}.`, `${m.overDetention} trucks exceed free time; detention cost ${fmtMoney(m.detentionCost, input.currency, "en")}.`),
      m.overDetention,
      m.detentionCost,
    );
  }

  // 4. Dörrbeläggning per timme
  const doors = input.doorCount ?? new Set(input.result.doorIntervals.map((d) => d.doorId)).size;
  const hours = hourlyDoorUtilization(input.result.doorIntervals, doors);
  if (hours.length > 0) {
    const peak = hours.reduce((a, b) => (b.util > a.util ? b : a));
    push(
      "door-peak",
      peak.util >= 0.9 ? "warn" : "info",
      L(`Dörrarna är mest belagda ${hh(peak.hour)}–${hh(peak.hour + 1)} (${fmtPct(peak.util, "sv")}).`, `Doors are busiest ${hh(peak.hour)}–${hh(peak.hour + 1)} (${fmtPct(peak.util, "en")}).`),
      peak.util,
    );
    const idle = hours.filter((h) => h.util < IDLE_DOOR_UTILIZATION);
    if (idle.length > 0 && peak.util >= IDLE_DOOR_UTILIZATION) {
      const low = idle.reduce((a, b) => (b.util < a.util ? b : a));
      push(
        "door-idle",
        "info",
        L(
          `${idle.length} timmar har under ${fmtPct(IDLE_DOOR_UTILIZATION, "sv")} dörrbeläggning, lägst ${hh(low.hour)}–${hh(low.hour + 1)} (${fmtPct(low.util, "sv")}) – utrymme att flytta ankomster dit.`,
          `${idle.length} hours have below ${fmtPct(IDLE_DOOR_UTILIZATION, "en")} door utilization, lowest ${hh(low.hour)}–${hh(low.hour + 1)} (${fmtPct(low.util, "en")}) – room to shift arrivals there.`,
        ),
        low.util,
      );
    }
  }

  // 5. Tid till tom gård vs stängning
  if (m.unloaded > 0) {
    if (m.overtimeMin > 0) {
      push(
        "overtime",
        "warn",
        L(`Sista lossningen blir klar ${fmtMin(m.overtimeMin, "sv")} efter stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `The last unload finishes ${fmtMin(m.overtimeMin, "en")} after closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`),
        m.overtimeMin,
        m.timeToEmpty,
      );
    } else if (input.closeAt !== undefined) {
      const margin = input.closeAt - m.timeToEmpty;
      push(
        "empty-before-close",
        "good",
        margin >= 0
          ? L(`Gården är tom ${fmtClock(m.timeToEmpty)}, ${fmtMin(margin, "sv")} före stängning.`, `The yard is empty at ${fmtClock(m.timeToEmpty)}, ${fmtMin(margin, "en")} before closing.`)
          : L(`All lossning klar före stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `All unloading done before closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`),
        m.timeToEmpty,
        margin,
      );
    } else {
      push("empty", "good", L(`All lossning klar före stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `All unloading done before closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`), m.timeToEmpty);
    }
  }

  // 6. Overflow och olossade
  if (m.overflowTrucks > 0) {
    push(
      "overflow",
      "warn",
      L(`${m.overflowTrucks} lastbilar får vänta utanför gården (uppställningen full; som mest ${m.maxParking} uppställda).`, `${m.overflowTrucks} trucks have to wait outside the site (parking full; at most ${m.maxParking} parked).`),
      m.overflowTrucks,
      m.maxParking,
    );
  }
  if (m.notUnloaded > 0) {
    push("not-unloaded", "warn", L(`${m.notUnloaded} lastbilar hinner inte lossas samma dag.`, `${m.notUnloaded} trucks are not unloaded the same day.`), m.notUnloaded);
  }
  return out;
}

function hh(h: number): string {
  return fmtClock(h * 60);
}

export interface PeakWindow {
  from: number;
  to: number;
  max: number;
}

/**
 * Sammanhängande fönster runt dagens högsta kö där antalet väntande är ≥ PEAK_WINDOW_SHARE × max.
 * Tidsserien tolkas som en trappfunktion (värdet gäller fram till nästa punkt). Gränser avrundas till närmaste kvart.
 */
export function peakWindow(series: readonly SeriesPoint[]): PeakWindow | null {
  if (series.length === 0) return null;
  let idx = 0;
  for (let i = 1; i < series.length; i++) if (series[i].waiting > series[idx].waiting) idx = i;
  const max = series[idx].waiting;
  if (!(max > 0)) return null;
  const thr = PEAK_WINDOW_SHARE * max;
  let s = idx, e = idx;
  while (s > 0 && series[s - 1].waiting >= thr) s--;
  while (e + 1 < series.length && series[e + 1].waiting >= thr) e++;
  const start = series[s].t;
  const end = e + 1 < series.length ? series[e + 1].t : series[e].t;
  const from = Math.round(start / PEAK_ROUND_MIN) * PEAK_ROUND_MIN;
  let to = Math.round(end / PEAK_ROUND_MIN) * PEAK_ROUND_MIN;
  if (to <= from) to = from + PEAK_ROUND_MIN;
  return { from, to, max };
}

/** Dörrbeläggning per klocktimme mellan första och sista lossning. */
export function hourlyDoorUtilization(intervals: readonly DoorInterval[], doors: number): { hour: number; util: number }[] {
  if (intervals.length === 0 || !(doors > 0)) return [];
  const h0 = Math.floor(Math.min(...intervals.map((i) => i.start)) / 60);
  const h1 = Math.ceil(Math.max(...intervals.map((i) => i.end)) / 60);
  const out: { hour: number; util: number }[] = [];
  for (let h = h0; h < h1; h++) {
    let busy = 0;
    for (const iv of intervals) busy += Math.max(0, Math.min(iv.end, (h + 1) * 60) - Math.max(iv.start, h * 60));
    out.push({ hour: h, util: busy / (doors * 60) });
  }
  return out;
}
