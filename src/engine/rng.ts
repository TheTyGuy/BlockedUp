/**
 * Seeded, purely functional RNG (mulberry32).
 *
 * The RNG state is a single uint32 stored inside GameState, so the full piece
 * sequence is reproducible from the seed alone. Two clients that share a seed
 * and apply the same actions will deal exactly the same pieces.
 */

/** Normalise any number into a valid uint32 seed. */
export function seedFrom(value: number): number {
  return value >>> 0;
}

/** Hash a string into a uint32 seed (FNV-1a), e.g. for "daily challenge" codes. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Returns a float in [0, 1) and the next RNG state. */
export function nextFloat(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Returns an integer in [0, maxExclusive) and the next RNG state. */
export function nextInt(state: number, maxExclusive: number): [number, number] {
  const [f, next] = nextFloat(state);
  return [Math.floor(f * maxExclusive), next];
}

/**
 * Small mutable wrapper for use *inside* a single engine step, so code can
 * draw several numbers conveniently. Always write `rng.state` back to the
 * GameState when done.
 */
export class Rng {
  constructor(public state: number) {}

  float(): number {
    const [v, s] = nextFloat(this.state);
    this.state = s;
    return v;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive);
  }

  /** Pick an index according to non-negative weights. Returns -1 if all weights are 0. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}
