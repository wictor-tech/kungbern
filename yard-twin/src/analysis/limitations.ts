/**
 * Modellens begränsningar – visas alltid i UI ("Vad modellen inte fångar").
 * Att säga vad vi inte vet är en del av trovärdigheten.
 */
import type { SiteModel } from "../engine/model.ts";

export interface Limitation {
  id: string;
  sv: string;
  en: string;
}

export const LIMITATIONS: readonly Limitation[] = [
  { id: "wrong-door", sv: "Förare som kör till fel dörr eller behöver vägledning på gården.", en: "Drivers going to the wrong door or needing guidance on the yard." },
  { id: "weather", sv: "Väder och väglag (snö, halka, mörker) som påverkar ankomster och lossningstakt.", en: "Weather and road conditions (snow, ice, darkness) affecting arrivals and unloading pace." },
  { id: "staffing", sv: "Personalbrist, raster och skiftbyten – modellen antar att varje dörr är bemannad hela öppettiden.", en: "Staff shortages, breaks and shift changes – the model assumes every door is staffed for all opening hours." },
  { id: "indoor-buffer", sv: "Truckar och buffertyta inomhus (om de inte modellerats separat) – full buffert kan stoppa lossning.", en: "Forklifts and indoor buffer space (unless modelled separately) – a full buffer can stop unloading." },
  { id: "paperwork-blocking", sv: "Pappersarbete som blockerar dörren – i modellen sker pappersarbete efter att dörren frigjorts.", en: "Paperwork blocking the door – in the model paperwork happens after the door is released." },
  { id: "priority-overrides", sv: "Manuella prioriteringar från personal utöver den valda tilldelningsstrategin.", en: "Manual priority overrides by staff beyond the selected assignment strategy." },
  { id: "inbound-only", sv: "Endast inleveranser med lossning modelleras – lastning, multi-stop och returer ingår inte.", en: "Only inbound unloading is modelled – loading, multi-stop and returns are not included." },
  { id: "equipment-failures", sv: "Utrustningsfel (dörr, ramp, port, truck) som tar en dörr ur drift.", en: "Equipment failures (door, dock leveller, gate, forklift) that take a door out of service." },
  { id: "day-dependence", sv: "Beroende mellan dagar – varje dag simuleras för sig, så eftersläpning från gårdagen förs inte över.", en: "Day-to-day dependence – each day is simulated independently, so backlog from the previous day is not carried over." },
  { id: "offsite-traffic", sv: "Trafik och köer utanför sajten (infartsväg, motorväg) före första LPR-läsningen.", en: "Traffic and queues outside the site (access road, motorway) before the first LPR read." },
];

export interface DataLimitationContext {
  /** Antal dagar i kalibreringen. */
  calibrationDays?: number;
  /** Andel tidsstämplar som misstänks vara manuellt satta (0–1). */
  manualTimeShare?: number;
}

/** PRODUKTBESLUT: färre än 30 lossningsobservationer per godstyp räknas som tunt underlag. */
export const THIN_SEGMENT_N = 30;
/** PRODUKTBESLUT: över 10 % manuellt satta tider nämns som begränsning. */
export const MANUAL_TIME_WARN_SHARE = 0.1;
/** Kalibrering kortare än 8 veckor fångar inte säsong. */
export const SHORT_HISTORY_DAYS = 56;

/** Extra begränsningar som följer av just den här sajtens data. */
export function dataLimitations(model: SiteModel, ctx: DataLimitationContext = {}): Limitation[] {
  const out: Limitation[] = [];
  const us = model.unloadSamples;
  if (us.length > 0 && us.every((s) => s.pallets === null)) {
    out.push({ id: "no-pallets", sv: "Pallantal saknas i data – lossningstid samplas utan hänsyn till lastens storlek (korrelationen används inte).", en: "Pallet counts are missing – unloading time is sampled without regard to load size (the correlation is not used)." });
  }
  if (model.gateSamples.length === 0) {
    out.push({ id: "no-gate-times", sv: "Grindtider saknas – incheckning antas ta 0 min.", en: "Gate times are missing – check-in is assumed to take 0 min." });
  }
  if (model.paperSamples.length === 0) {
    out.push({ id: "no-paper-times", sv: "Tid från lossning till utfart saknas – antas vara 0 min (påverkar detention, inte dörrkö).", en: "Time from unloading to exit is missing – assumed 0 min (affects detention, not the door queue)." });
  }
  if (model.slotDeviationSamples.length === 0) {
    out.push({ id: "no-slot-deviation", sv: "Inga bokningsdata – avvikelse från bokad tid bygger på ett antagande, inte mätning.", en: "No booking data – deviation from booked time is based on an assumption, not measurement." });
  }
  const byGoods = new Map<string, number>();
  for (const s of us) byGoods.set(s.goodsType, (byGoods.get(s.goodsType) ?? 0) + 1);
  const thin = [...byGoods].filter(([, n]) => n < THIN_SEGMENT_N).map(([g]) => g);
  if (thin.length > 0) {
    out.push({ id: "thin-segments", sv: `Få observationer (< ${THIN_SEGMENT_N}) för godstyp: ${thin.join(", ")}.`, en: `Few observations (< ${THIN_SEGMENT_N}) for goods type: ${thin.join(", ")}.` });
  }
  const assumed = Object.entries(model.provenance).filter(([, p]) => p.kind === "assumption");
  for (const [key, p] of assumed) {
    out.push({ id: `assumption:${key}`, sv: `${key} är ett antagande, inte mätt (${p.source}).`, en: `${key} is an assumption, not measured (${p.source}).` });
  }
  if (ctx.calibrationDays !== undefined && ctx.calibrationDays < SHORT_HISTORY_DAYS) {
    out.push({ id: "short-history", sv: `Kalibreringen bygger på ${ctx.calibrationDays} dagar – säsongsvariation fångas inte.`, en: `Calibration is based on ${ctx.calibrationDays} days – seasonal variation is not captured.` });
  }
  if (ctx.manualTimeShare !== undefined && ctx.manualTimeShare > MANUAL_TIME_WARN_SHARE) {
    const pct = Math.round(ctx.manualTimeShare * 100);
    out.push({ id: "manual-times", sv: `${pct} % av tidsstämplarna ser manuellt satta ut – lossningstider kan vara avrundade.`, en: `${pct}% of timestamps look manually entered – unloading times may be rounded.` });
  }
  return out;
}
