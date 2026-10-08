import { DEFAULT_QUALITY_RULES, type DerivedVisit, type QualityIssue, type QualityRules, type Visit } from "./contract.ts";
import { stableStringify } from "./hash.ts";
import { isDstTransitionDay, minutesOnServiceDate, toLocal } from "./localtime.ts";
import { arrivalOf } from "./rules.ts";

/** Problem som exkluderar ett besök från kalibrering. Övriga (dst_day, suspected_manual_time, manually_edited) flaggar bara. */
export const EXCLUDING_ISSUES: readonly QualityIssue[] = [
  "duplicate",
  "missing_arrival",
  "missing_unload",
  "unload_too_short",
  "unload_too_long",
  "out_of_order",
  "negative_duration",
];

/** Ordning i vilken problem listas på ett besök (stabil output). */
const ISSUE_ORDER: readonly QualityIssue[] = [
  "duplicate",
  "missing_arrival",
  "missing_unload",
  "unload_too_short",
  "unload_too_long",
  "out_of_order",
  "negative_duration",
  "dst_day",
  "suspected_manual_time",
  "manually_edited",
  "outside_window",
];

const MS_PER_MIN = 60_000;

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function diffMin(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : (b - a) / MS_PER_MIN;
}

/** Exakt :00/:15/:30/:45 med sekund 0 (typiskt manuellt inmatad tid). */
export function isRoundQuarter(iso: string | null): boolean {
  const t = ms(iso);
  if (t === null) return false;
  const d = new Date(t);
  return d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 && d.getUTCMinutes() % 15 === 0;
}

/** Total ordning för deterministisk dubblettupplösning oberoende av inputordning. */
function compareForKeep(a: Visit, b: Visit): number {
  const ta = ms(arrivalOf(a).iso) ?? Infinity;
  const tb = ms(arrivalOf(b).iso) ?? Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.visitId !== b.visitId) return a.visitId < b.visitId ? -1 : 1;
  const sa = stableStringify(a);
  const sb = stableStringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Lossningsintervall [start, slut] i ms; null om besöket saknar lossningstider helt. */
function unloadInterval(v: Visit): [number, number] | null {
  const s = ms(v.unloadStart);
  const e = ms(v.unloadEnd);
  if (s === null && e === null) return null;
  return [s ?? e!, e ?? s!];
}

/**
 * Är `a` och `b` (samma sajt + transportör + dörr, ankomst inom fönstret) samma fysiska besök?
 *  - Båda har lossningstider: ja om intervallen är identiska eller överlappar. En dörr lossar en bil
 *    i taget, så två verkliga bilar vid samma dörr kan inte ha överlappande lossning.
 *  - Exakt en saknar lossningstider helt: ja om den andras lossningsstart ligger inom fönstret från
 *    den förstas ankomst (en extra LPR-läsning strax före/efter samma bils lossning).
 *  - Båda saknar lossningstider: nej – det går inte att skilja dem åt, och att slå ihop riktiga bilar
 *    ger systematiskt för låg belastning.
 */
function sameVisit(a: Visit, b: Visit, windowMin: number): boolean {
  const ia = unloadInterval(a);
  const ib = unloadInterval(b);
  if (ia && ib) {
    if (ia[0] === ib[0] && ia[1] === ib[1]) return true;
    return Math.max(ia[0], ib[0]) < Math.min(ia[1], ib[1]);
  }
  if (!ia && !ib) return false;
  const [withUnload, without] = ia ? [a, b] : [b, a];
  const start = ms(withUnload.unloadStart) ?? ms(withUnload.unloadEnd)!;
  const arr = ms(arrivalOf(without).iso);
  return arr !== null && Math.abs(start - arr) / MS_PER_MIN <= windowMin;
}

/**
 * Index (i `visits`) för besök som är dubbletter. Regel (beslut, se QualityRules.duplicateWindowMin):
 *  1) Samma pseudonyma visitId inom tenant+sajt ⇒ dubblett (det tidigaste behålls).
 *  2) Annars: samma tenant+sajt+carrierKey+doorId, ankomst inom `duplicateWindowMin` OCH lossningen
 *     visar att det är samma bil (se `sameVisit`). Två verkliga bilar från samma transportör som
 *     lossar efter varandra vid samma dörr är INTE dubbletter, även om de anlände tätt.
 *     Det tidigaste behålls – utom när det saknar lossningstider och det senare har dem; då behålls
 *     posten med mätningar.
 */
function findDuplicates(visits: readonly Visit[], rules: QualityRules): Set<number> {
  const dup = new Set<number>();
  const order = visits.map((_, i) => i).sort((i, j) => compareForKeep(visits[i], visits[j]));

  // 1) Samma pseudonyma visitId (inom tenant+sajt).
  const seenId = new Set<string>();
  for (const i of order) {
    const v = visits[i];
    const key = `${v.tenantId}|${v.siteId}|${v.visitId}`;
    if (seenId.has(key)) dup.add(i);
    else seenId.add(key);
  }

  // 2) Samma transportör + dörr + sajt, ankomst inom fönstret och samma lossning (t.ex. dubbel LPR-läsning).
  const kept = new Map<string, { idx: number; t: number }[]>();
  for (const i of order) {
    if (dup.has(i)) continue;
    const v = visits[i];
    const t = ms(arrivalOf(v).iso);
    if (t === null || v.carrierKey === null || v.doorId === null) continue;
    const key = `${v.tenantId}|${v.siteId}|${v.carrierKey}|${v.doorId}`;
    let list = kept.get(key);
    if (!list) kept.set(key, (list = []));
    // Bara behållna besök inom fönstret är kandidater (ordningen är stigande ankomst).
    while (list.length > 0 && (t - list[0].t) / MS_PER_MIN > rules.duplicateWindowMin) list.shift();
    const match = list.findIndex((k) => sameVisit(visits[k.idx], v, rules.duplicateWindowMin));
    if (match < 0) {
      list.push({ idx: i, t });
      continue;
    }
    const prev = list[match];
    if (unloadInterval(visits[prev.idx]) === null && unloadInterval(v) !== null) {
      // Behåll posten med lossningstider.
      dup.add(prev.idx);
      list.splice(match, 1);
      list.push({ idx: i, t });
    } else {
      dup.add(i);
    }
  }
  return dup;
}

/** Servicedag: lokalt datum för ankomst, annars slotstart, annars första tillgängliga tidsstämpel. */
function serviceAnchor(v: Visit): string | null {
  return arrivalOf(v).iso ?? v.slotStart ?? v.unloadStart ?? v.unloadEnd ?? v.departedAt ?? v.cancelledAt ?? v.bookedAt;
}

/** Datum som används när ett besök saknar alla tidsstämplar. */
export const NO_DATE = "0000-00-00";

/**
 * Berikar besök med lokala minuter, varaktigheter och datakvalitetsproblem.
 * Output sorteras på visitId (därefter ankomst) så att resultatet är oberoende av inputordning.
 */
export function deriveVisits(visits: readonly Visit[], rules: QualityRules = DEFAULT_QUALITY_RULES): DerivedVisit[] {
  const dup = findDuplicates(visits, rules);
  const dstCache = new Map<string, boolean>();
  const out: DerivedVisit[] = visits.map((v, i) => deriveOne(v, dup.has(i), rules, dstCache));
  out.sort((a, b) => {
    if (a.visit.visitId !== b.visit.visitId) return a.visit.visitId < b.visit.visitId ? -1 : 1;
    return compareForKeep(a.visit, b.visit);
  });
  return out;
}

function deriveOne(v: Visit, isDup: boolean, rules: QualityRules, dstCache: Map<string, boolean>): DerivedVisit {
  const tz = v.siteTimeZone;
  const arr = arrivalOf(v);
  const anchor = serviceAnchor(v);
  const local = anchor ? toLocal(anchor, tz) : null;
  const serviceDate = local?.date ?? NO_DATE;
  const onDay = (iso: string | null) => (iso && local ? minutesOnServiceDate(iso, serviceDate, tz) : null);

  const tArr = ms(arr.iso);
  const tCheck = ms(v.checkedInAt);
  const tAssign = ms(v.doorAssignedAt);
  const tUs = ms(v.unloadStart);
  const tUe = ms(v.unloadEnd);
  const tDep = ms(v.departedAt);
  const tSlot = ms(v.slotStart);

  const waitToDoor = diffMin(tArr, tUs);
  const unloadMin = diffMin(tUs, tUe);
  // Grindtid kräver riktig LPR-ankomst; med checkedInAt som reserv vore den trivialt 0.
  const gateMin = arr.source === "lpr" ? diffMin(tArr, tCheck) : null;
  const paperMin = diffMin(tUe, tDep);
  const timeOnYard = diffMin(tArr, tDep);
  const slotDeviation = diffMin(tSlot, tArr);

  const issues = new Set<QualityIssue>();
  if (isDup) issues.add("duplicate");
  const expectsArrival = v.status !== "no_show" && v.status !== "cancelled";
  if (expectsArrival && tArr === null) issues.add("missing_arrival");
  if (v.status === "completed" && (tUs === null || tUe === null)) issues.add("missing_unload");
  if (unloadMin !== null && unloadMin >= 0) {
    if (unloadMin < rules.minUnloadMin) issues.add("unload_too_short");
    if (unloadMin > rules.maxUnloadMin) issues.add("unload_too_long");
  }
  // Ordningsfel: kedjan ankomst ≤ incheckning ≤ dörrtilldelning ≤ lossningsstart ≤ lossningsslut ≤ utfart.
  const chain = [tArr, tCheck, tAssign, tUs, tUe, tDep];
  outer: for (let a = 0; a < chain.length; a++) {
    for (let b = a + 1; b < chain.length; b++) {
      const x = chain[a];
      const y = chain[b];
      if (x !== null && y !== null && y < x) {
        issues.add("out_of_order");
        break outer;
      }
    }
  }
  for (const d of [waitToDoor, unloadMin, gateMin, paperMin, timeOnYard]) {
    if (d !== null && d < 0) {
      issues.add("negative_duration");
      break;
    }
  }
  if (local) {
    let dst = dstCache.get(serviceDate);
    if (dst === undefined) dstCache.set(serviceDate, (dst = isDstTransitionDay(serviceDate, tz)));
    if (dst) issues.add("dst_day");
  }
  if (isRoundQuarter(v.unloadStart) && isRoundQuarter(v.unloadEnd)) issues.add("suspected_manual_time");
  if (v.manuallyEdited.length > 0) issues.add("manually_edited");

  const issueList = ISSUE_ORDER.filter((x) => issues.has(x));
  const included =
    v.status === "completed" &&
    tArr !== null &&
    tUs !== null &&
    tUe !== null &&
    !issueList.some((x) => EXCLUDING_ISSUES.includes(x));

  return {
    visit: v,
    serviceDate,
    isoWeekday: local?.isoWeekday ?? 0,
    arrivalMin: onDay(arr.iso),
    slotStartMin: onDay(v.slotStart),
    slotEndMin: onDay(v.slotEnd),
    checkInMin: onDay(v.checkedInAt),
    unloadStartMin: onDay(v.unloadStart),
    unloadEndMin: onDay(v.unloadEnd),
    departMin: onDay(v.departedAt),
    waitToDoor,
    unloadMin,
    gateMin,
    paperMin,
    timeOnYard,
    slotDeviation,
    issues: issueList,
    included,
  };
}
