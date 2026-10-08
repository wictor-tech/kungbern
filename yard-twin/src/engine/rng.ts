/**
 * Seedad, reproducerbar slumpgenerator (sfc32 med cyrb128-hash av en strängseed).
 * Ingen Math.random() får användas i motorn – allt ska vara deterministiskt givet seed.
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    [this.a, this.b, this.c, this.d] = cyrb128(seed);
    for (let i = 0; i < 12; i++) this.nextUint();
  }

  /** Ny oberoende ström härledd ur en etikett, t.ex. rng.fork("attr"). */
  static stream(...parts: (string | number)[]): Rng {
    return new Rng(parts.join("|"));
  }

  nextUint(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Likformig i [0, 1). */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Heltal i [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick på tom lista");
    return arr[this.int(arr.length)];
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Poissonfördelat heltal. Knuth för små λ, normalapproximation för stora. */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    if (lambda > 500) {
      const z = this.normal();
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Slumpmässig avrundning som bevarar väntevärdet: 2.3 -> 2 (70 %) eller 3 (30 %). */
  roundStochastic(x: number): number {
    const f = Math.floor(x);
    return f + (this.next() < x - f ? 1 : 0);
  }
}
