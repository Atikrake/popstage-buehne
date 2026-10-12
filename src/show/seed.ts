/**
 * Chance that every phone agrees on. Anything "random" the stage does — the
 * order the spotlight hops in, how confetti falls — comes from the show's seed,
 * so the host, the contestants and the audience all see the same thing.
 */

/** A small, fast generator: the same seed always gives the same numbers. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a few numbers into one seed. */
export function mix(...parts: number[]) {
  let h = 2166136261;
  for (const part of parts) {
    h ^= part | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
