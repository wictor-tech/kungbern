import type { RecordedTruck, SiteModel, VisitSample } from "./model.ts";
import { Rng } from "./rng.ts";
import type { Minutes } from "./time.ts";
import type { Truck } from "./types.ts";

export interface SlotDesign {
  lengthMin: number;
  /** Bokningsbara lastbilar per timme (fördelas jämnt över slotarna i timmen). */
  capacityPerHour: number;
  from: Minutes;
  to: Minutes;
  /** Andel som anländer inom ±toleranceMin från slotstart. null = använd den empiriska fördelningen oförändrad. */
  adherence: number | null;
  toleranceMin: number;
}

export type ArrivalSpec =
  | { pattern: "recorded"; volumeFactor: number; serviceTimes: "recorded" | "sampled" }
  | { pattern: "booked"; volumeFactor: number; slot: SlotDesign }
  | { pattern: "poisson"; volumeFactor: number }
  | { pattern: "burst"; volumeFactor: number; burst: { from: Minutes; to: Minutes; multiplier: number } };

export interface GenerateContext {
  seed: string;
  rep: number;
  /** Multiplikator på lossningstid (känslighetsanalys). */
  unloadFactor?: number;
  /** Krävs för pattern "recorded". */
  recorded?: readonly RecordedTruck[];
}

/**
 * ANTAGANDE (används bara när data saknas för en parameter, och märks i provenance/UI):
 * spridning för ankomster utanför toleransfönstret när empiriska avvikelser saknas.
 */
export const FALLBACK_OFF_TIME_SPREAD_FACTOR = 4;
/** ANTAGANDE: tidsjitter (±min) för extra lastbilar när "recorded" skalas upp med volymfaktor > 1. */
export const RECORDED_UPSCALE_JITTER_MIN = 30;
/** Minsta antal kandidater för betingad bootstrap på pallantal innan vi faller tillbaka till godstyp. */
const MIN_CONDITIONAL_CANDIDATES = 10;

/** Index för betingad bootstrap: lossningstid samplas bland besök med samma godstyp och liknande pallantal. */
export class UnloadSampler {
  private byGoods = new Map<string, VisitSample[]>();
  private readonly samples: readonly VisitSample[];
  constructor(samples: readonly VisitSample[]) {
    this.samples = samples;
    if (samples.length === 0) throw new Error("Inga lossningsobservationer – kan inte sampla lossningstid");
    for (const s of samples) {
      let arr = this.byGoods.get(s.goodsType);
      if (!arr) this.byGoods.set(s.goodsType, (arr = []));
      arr.push(s);
    }
  }

  /** Dra ett helt besök (attribut + lossningstid tillsammans). */
  any(rng: Rng): VisitSample {
    return rng.pick(this.samples);
  }

  /** Lossningstid betingad på godstyp och pallantal (för inspelade lastbilar utan uppmätt lossningstid). */
  conditional(rng: Rng, goodsType: string, pallets: number | null): number {
    const pool = this.byGoods.get(goodsType) ?? this.samples;
    if (pallets !== null) {
      const band = Math.max(2, pallets * 0.2);
      const near = pool.filter((s) => s.pallets !== null && Math.abs(s.pallets - pallets) <= band);
      if (near.length >= MIN_CONDITIONAL_CANDIDATES) return rng.pick(near).unloadMin;
    }
    return rng.pick(pool).unloadMin;
  }
}

/** Dra attribut för lastbil nr k. Exakt fyra slumptal per lastbil, så att lastbil k får samma attribut oavsett ankomstmönster (common random numbers). */
function drawAttributes(model: SiteModel, sampler: UnloadSampler, rng: Rng, unloadFactor: number) {
  const v = sampler.any(rng);
  const gate = model.gateSamples.length > 0 ? rng.pick(model.gateSamples) : (rng.next(), 0);
  const paper = model.paperSamples.length > 0 ? rng.pick(model.paperSamples) : (rng.next(), 0);
  const extra = rng.next(); // reserverad för no-show-beslut
  return { v, gate, paper, extra, unload: v.unloadMin * unloadFactor };
}

export function generateDay(model: SiteModel, spec: ArrivalSpec, ctx: GenerateContext): Truck[] {
  const unloadFactor = ctx.unloadFactor ?? 1;
  const arrRng = Rng.stream(ctx.seed, ctx.rep, "arrivals");
  const attrRng = Rng.stream(ctx.seed, ctx.rep, "attributes");
  const sampler = new UnloadSampler(model.unloadSamples);

  switch (spec.pattern) {
    case "recorded":
      return fromRecorded(model, spec, ctx, sampler, arrRng, attrRng, unloadFactor);
    case "poisson":
    case "burst": {
      const times = nhpp(model.hourlyArrivals, spec.volumeFactor, arrRng, spec.pattern === "burst" ? spec.burst : null);
      return times.map((t, k) => {
        const a = drawAttributes(model, sampler, attrRng, unloadFactor);
        return mk(k, t, null, null, a.v, a.gate, a.unload, a.paper);
      });
    }
    case "booked":
      return booked(model, spec.slot, spec.volumeFactor, sampler, arrRng, attrRng, unloadFactor);
  }
}

function mk(k: number, arrival: number, slotStart: number | null, slotEnd: number | null, v: VisitSample, gate: number, unload: number, paper: number, walkIn = false): Truck {
  return {
    id: `T${String(k + 1).padStart(3, "0")}`,
    arrival,
    slotStart,
    slotEnd,
    carrier: v.carrier,
    goodsType: v.goodsType,
    pallets: v.pallets,
    gateTime: gate,
    unloadTime: unload,
    paperTime: paper,
    walkIn,
  };
}

/** Icke-homogen Poissonprocess i 15-minutershinkar. */
function nhpp(hourly: readonly number[], factor: number, rng: Rng, burst: { from: number; to: number; multiplier: number } | null): number[] {
  const out: number[] = [];
  for (let b = 0; b < 96; b++) {
    const t0 = b * 15;
    let lambda = ((hourly[Math.floor(b / 4)] ?? 0) / 4) * factor;
    if (burst) {
      const ov = Math.max(0, Math.min(t0 + 15, burst.to) - Math.max(t0, burst.from)) / 15;
      lambda *= 1 + (burst.multiplier - 1) * ov;
    }
    const c = rng.poisson(lambda);
    for (let i = 0; i < c; i++) out.push(t0 + rng.next() * 15);
  }
  return out.sort((a, b) => a - b);
}

/** Dra en önskad ankomsttid ur timprofilen. */
function sampleDesiredTime(hourly: readonly number[], total: number, rng: Rng): number {
  let u = rng.next() * total;
  for (let h = 0; h < 24; h++) {
    u -= hourly[h] ?? 0;
    if (u < 0) return h * 60 + rng.next() * 60;
  }
  return 23 * 60 + rng.next() * 60;
}

interface Slot {
  start: number;
  end: number;
  cap: number;
}

export function buildSlots(d: SlotDesign): Slot[] {
  if (!(d.lengthMin > 0)) throw new Error("Slotlängd måste vara > 0");
  const slots: Slot[] = [];
  let acc = 0;
  let given = 0;
  for (let s = d.from; s + d.lengthMin <= d.to + 1e-9; s += d.lengthMin) {
    acc += (d.capacityPerHour * d.lengthMin) / 60;
    const cap = Math.floor(acc + 1e-9) - given;
    given += cap;
    slots.push({ start: s, end: s + d.lengthMin, cap });
  }
  return slots;
}

function booked(model: SiteModel, design: SlotDesign, factor: number, sampler: UnloadSampler, arrRng: Rng, attrRng: Rng, unloadFactor: number): Truck[] {
  const total = model.hourlyArrivals.reduce((a, b) => a + b, 0);
  // Efterfrågan inkluderar bilar som senare blir no-show (de bokar också).
  const demand = arrRng.poisson((total * factor) / Math.max(1e-9, 1 - model.noShowRate));
  const desired: number[] = [];
  for (let i = 0; i < demand; i++) desired.push(sampleDesiredTime(model.hourlyArrivals, total, arrRng));
  desired.sort((a, b) => a - b);

  const slots = buildSlots(design);
  const left = slots.map((s) => s.cap);
  const tol = design.toleranceMin;
  const within = model.slotDeviationSamples.filter((x) => Math.abs(x) <= tol);
  const outsideDev = model.slotDeviationSamples.filter((x) => Math.abs(x) > tol);

  const deviation = (): number => {
    if (design.adherence === null) {
      if (model.slotDeviationSamples.length > 0) return arrRng.pick(model.slotDeviationSamples);
      return arrRng.uniform(-tol, tol);
    }
    if (arrRng.bernoulli(design.adherence)) {
      return within.length > 0 ? arrRng.pick(within) : arrRng.uniform(-tol, tol);
    }
    if (outsideDev.length > 0) return arrRng.pick(outsideDev);
    const mag = arrRng.uniform(tol, tol * FALLBACK_OFF_TIME_SPREAD_FACTOR);
    return arrRng.bernoulli(0.5) ? mag : -mag;
  };

  const trucks: Truck[] = [];
  let k = 0;
  for (const want of desired) {
    const a = drawAttributes(model, sampler, attrRng, unloadFactor);
    const noShow = a.extra < model.noShowRate;
    const s = findSlot(slots, left, want);
    let arrival: number;
    let truck: Truck;
    if (s < 0) {
      arrival = want;
      truck = mk(k, arrival, null, null, a.v, a.gate, a.unload, a.paper, true);
    } else {
      left[s]--;
      arrival = Math.max(0, slots[s].start + deviation());
      truck = mk(k, arrival, slots[s].start, slots[s].end, a.v, a.gate, a.unload, a.paper);
    }
    k++;
    if (!noShow) trucks.push(truck);
  }
  trucks.sort((x, y) => x.arrival - y.arrival);
  return trucks;
}

/** Närmaste slot med ledig kapacitet: först den som innehåller önskad tid, sedan växelvis senare/tidigare. */
function findSlot(slots: Slot[], left: number[], want: number): number {
  if (slots.length === 0) return -1;
  let base = slots.findIndex((s) => want < s.end);
  if (base < 0) base = slots.length - 1;
  for (let d = 0; d < slots.length; d++) {
    for (const i of d === 0 ? [base] : [base + d, base - d]) {
      if (i >= 0 && i < slots.length && left[i] > 0) return i;
    }
  }
  return -1;
}

function fromRecorded(
  model: SiteModel,
  spec: Extract<ArrivalSpec, { pattern: "recorded" }>,
  ctx: GenerateContext,
  sampler: UnloadSampler,
  arrRng: Rng,
  attrRng: Rng,
  unloadFactor: number,
): Truck[] {
  if (!ctx.recorded) throw new Error('Mönstret "recorded" kräver inspelade ankomster');
  const rec = ctx.recorded;
  const pickService = (r: RecordedTruck) => {
    // Dra alltid lika många slumptal per lastbil för stabila strömmar.
    const sampledUnload = sampler.conditional(attrRng, r.goodsType, r.pallets);
    const sampledGate = model.gateSamples.length > 0 ? attrRng.pick(model.gateSamples) : 0;
    const sampledPaper = model.paperSamples.length > 0 ? attrRng.pick(model.paperSamples) : 0;
    const useRec = spec.serviceTimes === "recorded";
    return {
      unload: (useRec && r.unloadMin !== null ? r.unloadMin : sampledUnload) * unloadFactor,
      gate: useRec && r.gateMin !== null ? r.gateMin : sampledGate,
      paper: useRec && r.paperMin !== null ? r.paperMin : sampledPaper,
    };
  };

  const out: Truck[] = [];
  const f = spec.volumeFactor;
  for (const r of rec) {
    const keep = f >= 1 || arrRng.bernoulli(f);
    const s = pickService(r);
    if (!keep) continue;
    out.push({ id: r.id, arrival: r.arrival, slotStart: r.slotStart, slotEnd: r.slotEnd, carrier: r.carrier, goodsType: r.goodsType, pallets: r.pallets, gateTime: s.gate, unloadTime: s.unload, paperTime: s.paper, shadow: r.shadow ?? false });
  }
  if (f > 1 && rec.length > 0) {
    const extra = arrRng.roundStochastic((f - 1) * rec.length);
    for (let i = 0; i < extra; i++) {
      const r = arrRng.pick(rec);
      const s = pickService(r);
      if (r.shadow) continue; // uppskalning utgår bara från fullständigt mätta besök
      const shift = arrRng.uniform(-RECORDED_UPSCALE_JITTER_MIN, RECORDED_UPSCALE_JITTER_MIN);
      out.push({ id: `X${String(i + 1).padStart(3, "0")}`, arrival: Math.max(0, r.arrival + shift), slotStart: null, slotEnd: null, carrier: r.carrier, goodsType: r.goodsType, pallets: r.pallets, gateTime: s.gate, unloadTime: s.unload, paperTime: s.paper, walkIn: true });
    }
  }
  out.sort((a, b) => a.arrival - b.arrival);
  return out;
}
