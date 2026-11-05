// Small seedable random number generator for demo identifiers.
// mulberry32: fast and repeatable, NOT cryptographically secure. That is fine here,
// because the identifiers are synthetic demonstration values.

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Create a random source. The same seed always gives the same sequence.
 * With no seed, the sequence differs on every call.
 */
export function createRng(seed) {
  const hasSeed = seed !== undefined && seed !== null && seed !== '';
  let state = hasSeed ? hashSeed(seed) : (Math.random() * 4294967296) >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Whole number from min to max, both included. */
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  /** One digit character-free number, 0-9 by default. */
  const digit = (min = 0, max = 9) => int(min, max);
  /** A string of n random digits. */
  const digits = (n) => {
    let out = '';
    for (let i = 0; i < n; i++) out += digit();
    return out;
  };
  /** One random item from an array or string. */
  const pick = (items) => items[int(0, items.length - 1)];

  return { next, int, digit, digits, pick };
}
