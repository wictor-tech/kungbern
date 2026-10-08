/** Kvantil med linjär interpolation (typ 7, samma som R/NumPy default). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return quantileSorted(s, q);
}

export function quantileSorted(s: readonly number[], q: number): number {
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export interface Interval {
  median: number;
  p10: number;
  p90: number;
  mean: number;
}

export function summarize(values: readonly number[]): Interval {
  const s = [...values].sort((a, b) => a - b);
  return {
    median: quantileSorted(s, 0.5),
    p10: quantileSorted(s, 0.1),
    p90: quantileSorted(s, 0.9),
    mean: mean(s),
  };
}
