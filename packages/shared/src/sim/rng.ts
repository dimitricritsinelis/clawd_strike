// Deterministic RNG helpers (shared between server + client cosmetics).

export function hashSeed(seedKey: string): number {
  // FNV-1a 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < seedKey.length; i++) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function lcg(seed: number): () => number {
  // Numerical Recipes LCG.
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s;
  };
}

export function rand01(nextU32: () => number): number {
  // [0, 1)
  return (nextU32() >>> 0) / 4294967296;
}

