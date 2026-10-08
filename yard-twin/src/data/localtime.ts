/**
 * Lokal tid för en sajt (IANA-tidszon) via Intl.DateTimeFormat – aldrig fast offset.
 *
 * Minuter räknas som VERKLIGT förflutna minuter sedan lokal midnatt för servicedagen. Det gör att
 * varaktigheter (t.ex. lossning över omställningen 02:00→03:00) blir rätt även på sommartidsdagar,
 * där dygnet har 23 h (1380 min) eller 25 h (1500 min). Konsekvens: på en omställningsdag visar
 * minutvärdet inte väggklockan efter omställningen (03:00 på våren = 120 min, inte 180).
 * Sådana dagar flaggas med "dst_day".
 */

export interface LocalTime {
  /** Lokalt datum YYYY-MM-DD. */
  date: string;
  /** Förflutna minuter sedan lokal midnatt (kan vara fraktionellt). */
  minutes: number;
  /** ISO-veckodag 1 = måndag … 7 = söndag. */
  isoWeekday: number;
}

const MS_PER_MIN = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsAt(ms: number, tz: string): Parts {
  const p: Record<string, number> = {};
  for (const x of formatter(tz).formatToParts(new Date(ms))) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second };
}

/** UTC-offset i ms (lokal − UTC) vid ett ögonblick. */
function offsetAt(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  const whole = Math.floor(ms / 1000) * 1000;
  return asUtc - whole;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Ogiltigt datum "${date}", förväntat YYYY-MM-DD`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseIso(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Ogiltig tidsstämpel "${iso}"`);
  return ms;
}

/** ISO-veckodag för ett kalenderdatum. */
export function isoWeekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Kalenderdatum + n dagar (n kan vara negativt). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Antal kalenderdagar från a till b. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = parseDate(a);
  const [y2, m2, d2] = parseDate(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const midnightCache = new Map<string, number>();

/** UTC-ms för lokal midnatt (första ögonblicket av det lokala datumet). */
export function localMidnightMs(date: string, tz: string): number {
  const key = `${tz}|${date}`;
  const hit = midnightCache.get(key);
  if (hit !== undefined) return hit;
  const [y, m, d] = parseDate(date);
  const naive = Date.UTC(y, m - 1, d);
  // Iterera offset tills den är självkonsistent (två varv räcker i praktiken).
  let t = naive - offsetAt(naive, tz);
  for (let i = 0; i < 3; i++) {
    const next = naive - offsetAt(t, tz);
    if (next === t) break;
    t = next;
  }
  // Om midnatt inte finns lokalt (omställning vid 00:00) – gå fram till första ögonblicket på datumet.
  const p = partsAt(t, tz);
  const localDate = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  if (localDate < date) t += (24 * 60 - (p.h * 60 + p.mi)) * MS_PER_MIN - p.s * 1000;
  else if (localDate === date && (p.h !== 0 || p.mi !== 0)) t -= (p.h * 60 + p.mi) * MS_PER_MIN + p.s * 1000;
  midnightCache.set(key, t);
  return t;
}

/** Lokalt datum, minuter sedan lokal midnatt och ISO-veckodag för en UTC-tidsstämpel. */
export function toLocal(iso: string, tz: string): LocalTime {
  const ms = parseIso(iso);
  const p = partsAt(ms, tz);
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return { date, minutes: (ms - localMidnightMs(date, tz)) / MS_PER_MIN, isoWeekday: isoWeekdayOf(date) };
}

/**
 * Minuter sedan lokal midnatt för en given servicedag. Kan överstiga dygnslängden (övertid efter
 * midnatt). Tidsstämplar före servicedagens midnatt ger null.
 */
export function minutesOnServiceDate(iso: string, serviceDate: string, tz: string): number | null {
  const min = (parseIso(iso) - localMidnightMs(serviceDate, tz)) / MS_PER_MIN;
  return min < 0 ? null : min;
}

/** Dygnslängd i minuter (1380/1440/1500 i Europa). */
export function dayLengthMin(date: string, tz: string): number {
  return (localMidnightMs(addDays(date, 1), tz) - localMidnightMs(date, tz)) / MS_PER_MIN;
}

/** true om UTC-offset skiljer mellan lokal 00:00 och 23:59 (sommartidsomställning). */
export function isDstTransitionDay(date: string, tz: string): boolean {
  const start = localMidnightMs(date, tz);
  const end = localMidnightMs(addDays(date, 1), tz) - MS_PER_MIN;
  return offsetAt(start, tz) !== offsetAt(end, tz);
}

/**
 * Invers till minutesOnServiceDate: lokal servicedag + förflutna minuter sedan lokal midnatt → ISO i UTC.
 * Avrundas till hel sekund (formatet "YYYY-MM-DDTHH:MM:SSZ").
 */
export function localToIso(date: string, minutes: number, tz: string): string {
  const ms = localMidnightMs(date, tz) + Math.round(minutes * 60) * 1000;
  return new Date(ms).toISOString().replace(/\.000Z$/, "Z");
}
