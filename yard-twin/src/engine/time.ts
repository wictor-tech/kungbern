/** Motorn räknar i minuter sedan lokal midnatt för servicedagen (kan bli > 1440 vid övertid). */
export type Minutes = number;

export function parseClock(hhmm: string): Minutes {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Ogiltig klocktid "${hhmm}", förväntat HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) throw new Error(`Ogiltig klocktid "${hhmm}"`);
  return h * 60 + min;
}

export function formatClock(min: Minutes): string {
  if (!Number.isFinite(min)) return "–";
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
