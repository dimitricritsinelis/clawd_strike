const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

function normalizeUint32(value: number): number {
  return value >>> 0;
}

export function deriveSeedFromString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return normalizeUint32(hash);
}

export function deriveSubSeed(seed: number, tag: string): number {
  const normalizedSeed = normalizeSeed(seed) || 1;
  const mixedInput = `${normalizedSeed}:${tag}`;
  const hashed = deriveSeedFromString(mixedInput);
  return hashed || 1;
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  return normalizeUint32(Math.trunc(seed));
}

export class DeterministicRng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = normalizeSeed(seed) || 1;
    this.state = this.seed;
  }

  next(): number {
    this.state = normalizeUint32(this.state + 0x6d2b79f5);
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    if (maxExclusive <= minInclusive) return minInclusive;
    const span = maxExclusive - minInclusive;
    return minInclusive + Math.floor(this.next() * span);
  }

  fork(tag: string): DeterministicRng {
    return new DeterministicRng(deriveSubSeed(this.seed, tag));
  }
}

export function resolveRuntimeSeed(mapId: string, seedOverride: number | null): number {
  if (typeof seedOverride === "number" && Number.isFinite(seedOverride)) {
    return normalizeSeed(seedOverride) || 1;
  }
  return deriveSeedFromString(mapId) || 1;
}
