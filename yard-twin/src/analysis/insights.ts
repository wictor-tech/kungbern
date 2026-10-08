/**
 * Automatiska insikter i klartext. Varje mening räknas fram ur simuleringsdata – inga färdiga påståenden.
 * En insikt vars underliggande tal inte är ändligt (NaN/Infinity) skickas aldrig ut.
 *
 * Med Monte Carlo (`mc`, fler än en repetition) bygger nyckeltalen på medianen över repetitionerna
 * med p10–p90 som intervall – en enskild körning är bara ett utfall av många. Tidsserie och
 * dörrintervall (köfönster, dörrbeläggning per timme) finns bara för den detaljerade körningen och
 * beskrivs därför uttryckligen som "exempeldagen". Utan `mc` sägs allt gälla "i den här körningen".
 */
import { pairedDelta, type MonteCarloResult } from "../engine/montecarlo.ts";
import type { Interval } from "../engine/stats.ts";
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
  /** Öppningstid (min sedan midnatt). Dörrbeläggning per timme bedöms bara inom [openAt, closeAt). */
  openAt?: number;
}

export function generateInsights(input: InsightInput): Insight[] {
  const { lang } = input;
  const out: Insight[] = [];
  const push = (id: string, severity: Insight["severity"], text: string, ...nums: number[]) => {
    if (nums.every((n) => Number.isFinite(n))) out.push({ id, severity, text });
  };
  const L = (sv: string, en: string) => (lang === "sv" ? sv : en);

  const mc = input.mc;
  // "5–18, 80 % intervall" (p10–p90) för ett Monte Carlo-intervall.
  const rng = (i: Interval, f: (x: number) => string) => `${f(i.p10)}–${f(i.p90)}, ${INTERVAL_LABEL[lang]}`;
  const cnt = (x: number) => fmtNum(x, lang);
  const mins = (x: number) => fmtMin(x, lang);

  // 1. Köfönster (tidsserien finns bara för exempeldagen) och maxkö
  const w = peakWindow(input.result.series);
  if (mc) {
    const q = mc.summary.maxQueue;
    const reps = mc.reps;
    if (w || q.median > 0) {
      const winSv = w ? `På exempeldagen uppstår köerna ${fmtClock(w.from)}–${fmtClock(w.to)}. ` : "";
      const winEn = w ? `On the example day queues build up ${fmtClock(w.from)}–${fmtClock(w.to)}. ` : "";
      push(
        "queue-peak",
        q.median >= 3 ? "warn" : "info",
        L(
          `${winSv}En typisk dag väntar som mest ${cnt(q.median)} lastbilar samtidigt (${rng(q, cnt)}, ${reps} simulerade dagar).`,
          `${winEn}On a typical day at most ${cnt(q.median)} trucks wait at once (${rng(q, cnt)}, ${reps} simulated days).`,
        ),
        q.median, q.p10, q.p90, ...(w ? [w.from, w.to] : []),
      );
    } else if (input.result.series.length > 0) {
      push("queue-none", "good", L("En typisk dag uppstår ingen kö.", "On a typical day no queue builds up."));
    }
  } else if (w) {
    push(
      "queue-peak",
      w.max >= 3 ? "warn" : "info",
      L(`I den här körningen uppstår köerna ${fmtClock(w.from)}–${fmtClock(w.to)} (som mest ${w.max} lastbilar väntar samtidigt).`, `In this run queues build up ${fmtClock(w.from)}–${fmtClock(w.to)} (at most ${w.max} trucks waiting at once).`),
      w.from,
      w.to,
      w.max,
    );
  } else if (input.result.series.length > 0) {
    push("queue-none", "good", L("Ingen kö uppstår i den här körningen.", "No queue builds up in this run."));
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
      L(`I den här körningen överskrider ${m.overDetention} lastbilar fri tid; detentionkostnad ${fmtMoney(m.detentionCost, input.currency, "sv")}.`, `In this run ${m.overDetention} trucks exceed free time; detention cost ${fmtMoney(m.detentionCost, input.currency, "en")}.`),
      m.overDetention,
      m.detentionCost,
    );
  }

  // 4. Dörrbeläggning per timme (exempeldagen), bara inom öppettiden
  const doors = input.doorCount ?? new Set(input.result.doorIntervals.map((d) => d.doorId)).size;
  const hours = hourlyDoorUtilization(input.result.doorIntervals, doors, { from: input.openAt, to: input.closeAt });
  if (hours.length > 0) {
    const peak = hours.reduce((a, b) => (b.util > a.util ? b : a));
    const daySv = mc ? "På exempeldagen är dörrarna" : "I den här körningen är dörrarna";
    const dayEn = mc ? "On the example day doors are" : "In this run doors are";
    push(
      "door-peak",
      peak.util >= 0.9 ? "warn" : "info",
      L(`${daySv} mest belagda ${span(peak)} (${fmtPct(peak.util, "sv")}).`, `${dayEn} busiest ${span(peak)} (${fmtPct(peak.util, "en")}).`),
      peak.util,
    );
    const idle = hours.filter((h) => h.util < IDLE_DOOR_UTILIZATION);
    if (idle.length > 0 && peak.util >= IDLE_DOOR_UTILIZATION) {
      const low = idle.reduce((a, b) => (b.util < a.util ? b : a));
      push(
        "door-idle",
        "info",
        L(
          `${mc ? "På exempeldagen har" : "I den här körningen har"} ${idle.length} timmar inom öppettiden under ${fmtPct(IDLE_DOOR_UTILIZATION, "sv")} dörrbeläggning, lägst ${span(low)} (${fmtPct(low.util, "sv")}) – utrymme att flytta ankomster dit.`,
          `${mc ? "On the example day" : "In this run"} ${idle.length} opening hours have below ${fmtPct(IDLE_DOOR_UTILIZATION, "en")} door utilization, lowest ${span(low)} (${fmtPct(low.util, "en")}) – room to shift arrivals there.`,
        ),
        low.util,
      );
    }
  }

  // 5. Tid till tom gård vs stängning
  if (mc) {
    const ot = mc.summary.overtimeMin;
    const tte = mc.summary.timeToEmpty;
    const clk = (x: number) => fmtClock(x);
    if (mc.summary.unloaded.median > 0) {
      if (ot.median > 0) {
        push(
          "overtime",
          "warn",
          L(
            `En typisk dag blir sista lossningen klar ${mins(ot.median)} efter stängning (${rng(ot, mins)}); gården är tom ${clk(tte.median)} (${rng(tte, clk)}).`,
            `On a typical day the last unload finishes ${mins(ot.median)} after closing (${rng(ot, mins)}); the yard is empty at ${clk(tte.median)} (${rng(tte, clk)}).`,
          ),
          ot.median, ot.p10, ot.p90, tte.median, tte.p10, tte.p90,
        );
      } else {
        const marginSv = input.closeAt !== undefined && input.closeAt - tte.median >= 0 ? `, ${fmtMin(input.closeAt - tte.median, "sv")} före stängning` : "";
        const marginEn = input.closeAt !== undefined && input.closeAt - tte.median >= 0 ? `, ${fmtMin(input.closeAt - tte.median, "en")} before closing` : "";
        push(
          input.closeAt !== undefined ? "empty-before-close" : "empty",
          "good",
          L(
            `En typisk dag är all lossning klar före stängning; gården är tom ${clk(tte.median)} (${rng(tte, clk)})${marginSv}.`,
            `On a typical day all unloading is done before closing; the yard is empty at ${clk(tte.median)} (${rng(tte, clk)})${marginEn}.`,
          ),
          tte.median, tte.p10, tte.p90,
        );
        if (ot.p90 > 0) {
          push(
            "overtime-risk",
            "info",
            L(
              `Minst 10 % av de simulerade dagarna blir det ändå övertid (upp till ${mins(ot.p90)} vid p90).`,
              `At least 10% of simulated days still run into overtime (up to ${mins(ot.p90)} at p90).`,
            ),
            ot.p90,
          );
        }
      }
    }
  } else if (m.unloaded > 0) {
    if (m.overtimeMin > 0) {
      push(
        "overtime",
        "warn",
        L(`I den här körningen blir sista lossningen klar ${fmtMin(m.overtimeMin, "sv")} efter stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `In this run the last unload finishes ${fmtMin(m.overtimeMin, "en")} after closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`),
        m.overtimeMin,
        m.timeToEmpty,
      );
    } else if (input.closeAt !== undefined) {
      const margin = input.closeAt - m.timeToEmpty;
      push(
        "empty-before-close",
        "good",
        margin >= 0
          ? L(`I den här körningen är gården tom ${fmtClock(m.timeToEmpty)}, ${fmtMin(margin, "sv")} före stängning.`, `In this run the yard is empty at ${fmtClock(m.timeToEmpty)}, ${fmtMin(margin, "en")} before closing.`)
          : L(`I den här körningen är all lossning klar före stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `In this run all unloading is done before closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`),
        m.timeToEmpty,
        margin,
      );
    } else {
      push("empty", "good", L(`I den här körningen är all lossning klar före stängning; gården är tom ${fmtClock(m.timeToEmpty)}.`, `In this run all unloading is done before closing; the yard is empty at ${fmtClock(m.timeToEmpty)}.`), m.timeToEmpty);
    }
  }

  // 6. Overflow och olossade
  if (mc) {
    const of = mc.summary.overflowTrucks;
    const mp = mc.summary.maxParking;
    const nu = mc.summary.notUnloaded;
    if (of.median > 0) {
      push(
        "overflow",
        "warn",
        L(
          `En typisk dag får ${cnt(of.median)} lastbilar vänta utanför gården (${rng(of, cnt)}); uppställningen är full med som mest ${cnt(mp.median)} uppställda.`,
          `On a typical day ${cnt(of.median)} trucks have to wait outside the site (${rng(of, cnt)}); parking is full with at most ${cnt(mp.median)} parked.`,
        ),
        of.median, of.p10, of.p90, mp.median,
      );
    } else if (of.p90 > 0) {
      push(
        "overflow-risk",
        "info",
        L(
          `Uppställningen räcker en typisk dag, men minst 10 % av de simulerade dagarna får upp till ${cnt(of.p90)} lastbilar vänta utanför gården (p90).`,
          `Parking suffices on a typical day, but on at least 10% of simulated days up to ${cnt(of.p90)} trucks wait outside the site (p90).`,
        ),
        of.p90,
      );
    }
    if (nu.median > 0) {
      push(
        "not-unloaded",
        "warn",
        L(`En typisk dag hinner ${cnt(nu.median)} lastbilar inte lossas samma dag (${rng(nu, cnt)}).`, `On a typical day ${cnt(nu.median)} trucks are not unloaded the same day (${rng(nu, cnt)}).`),
        nu.median, nu.p10, nu.p90,
      );
    } else if (nu.p90 > 0) {
      push(
        "not-unloaded-risk",
        "info",
        L(
          `En typisk dag lossas alla, men minst 10 % av de simulerade dagarna hinner upp till ${cnt(nu.p90)} lastbilar inte lossas (p90).`,
          `On a typical day all trucks are unloaded, but on at least 10% of simulated days up to ${cnt(nu.p90)} are not (p90).`,
        ),
        nu.p90,
      );
    }
  } else {
    if (m.overflowTrucks > 0) {
      push(
        "overflow",
        "warn",
        L(`I den här körningen får ${m.overflowTrucks} lastbilar vänta utanför gården (uppställningen full; som mest ${m.maxParking} uppställda).`, `In this run ${m.overflowTrucks} trucks have to wait outside the site (parking full; at most ${m.maxParking} parked).`),
        m.overflowTrucks,
        m.maxParking,
      );
    }
    if (m.notUnloaded > 0) {
      push("not-unloaded", "warn", L(`I den här körningen hinner ${m.notUnloaded} lastbilar inte lossas samma dag.`, `In this run ${m.notUnloaded} trucks are not unloaded the same day.`), m.notUnloaded);
    }
  }
  return out;
}

/** "08:00–09:00" för en (eventuellt av öppettiden avkortad) timme. */
function span(h: HourUtil): string {
  return `${fmtClock(h.from)}–${fmtClock(h.to)}`;
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

export interface HourUtil {
  /** Klocktimme (0–23, kan vara ≥ 24 vid övertid). */
  hour: number;
  /** Bedömt intervall (min sedan midnatt): klocktimmen avkortad till öppettiden. */
  from: number;
  to: number;
  util: number;
}

/**
 * Dörrbeläggning per klocktimme. Utan fönster: hela timmar mellan första och sista lossning. Med `window.from`
 * och/eller `window.to` (öppettid) bedöms bara tid inom [from, to): timmar helt utanför utelämnas och
 * delvis öppna timmar avkortas (beläggning räknas på den öppna delen). Då ingår även öppettimmar
 * utan lossning – de är verkligt ledig kapacitet.
 */
export function hourlyDoorUtilization(
  intervals: readonly DoorInterval[],
  doors: number,
  window: { from?: number; to?: number } = {},
): HourUtil[] {
  if (intervals.length === 0 || !(doors > 0)) return [];
  const lo = window.from ?? Math.floor(Math.min(...intervals.map((i) => i.start)) / 60) * 60;
  const hi = window.to ?? Math.ceil(Math.max(...intervals.map((i) => i.end)) / 60) * 60;
  if (!(hi > lo)) return [];
  const h0 = Math.floor(lo / 60);
  const h1 = Math.ceil(hi / 60);
  const out: HourUtil[] = [];
  for (let h = h0; h < h1; h++) {
    const from = Math.max(h * 60, lo);
    const to = Math.min((h + 1) * 60, hi);
    if (!(to > from)) continue;
    let busy = 0;
    for (const iv of intervals) busy += Math.max(0, Math.min(iv.end, to) - Math.max(iv.start, from));
    out.push({ hour: h, from, to, util: busy / (doors * (to - from)) });
  }
  return out;
}
