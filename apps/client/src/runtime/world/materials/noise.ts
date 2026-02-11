/**
 * Deterministic procedural noise library.
 * Simplex 2D, FBM, Voronoi, domain warping — all seeded.
 */

// ─── Permutation table (shuffled by seed) ───────────────────────────────

function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with LCG
  let s = (seed | 0) >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i]!;
  return p;
}

// ─── Simplex 2D ─────────────────────────────────────────────────────────

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

function dot2(g: readonly [number, number], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

/** Simplex 2D noise, returns value in [-1, 1]. */
export function simplex2(x: number, y: number, perm: Uint8Array): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;

  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = (i & 255) >>> 0;
  const jj = (j & 255) >>> 0;

  const gi0 = perm[ii + perm[jj]!]! % 8;
  const gi1 = perm[ii + i1 + perm[jj + j1]!]! % 8;
  const gi2 = perm[ii + 1 + perm[jj + 1]!]! % 8;

  let n0 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    n0 = t0 * t0 * dot2(GRAD2[gi0]!, x0, y0);
  }

  let n1 = 0;
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    n1 = t1 * t1 * dot2(GRAD2[gi1]!, x1, y1);
  }

  let n2 = 0;
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    n2 = t2 * t2 * dot2(GRAD2[gi2]!, x2, y2);
  }

  return 70 * (n0 + n1 + n2);
}

// ─── FBM (Fractal Brownian Motion) ──────────────────────────────────────

export type FbmOpts = {
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  scale?: number;
};

/**
 * Fractal Brownian Motion: layers multiple octaves of simplex noise.
 * Returns value roughly in [-1, 1].
 */
export function fbm(x: number, y: number, perm: Uint8Array, opts?: FbmOpts): number {
  const octaves = opts?.octaves ?? 6;
  const lacunarity = opts?.lacunarity ?? 2.0;
  const persistence = opts?.persistence ?? 0.5;
  const scale = opts?.scale ?? 1;

  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2(x * frequency, y * frequency, perm);
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmp;
}

// ─── Domain Warping ─────────────────────────────────────────────────────

/**
 * Domain-warped FBM: feeds FBM into itself for organic distortion.
 * Returns value roughly in [-1, 1].
 */
export function warpedFbm(
  x: number,
  y: number,
  perm: Uint8Array,
  warpStrength: number,
  opts?: FbmOpts
): number {
  const qx = fbm(x, y, perm, opts);
  const qy = fbm(x + 5.2, y + 1.3, perm, opts);
  return fbm(x + qx * warpStrength, y + qy * warpStrength, perm, opts);
}

// ─── Voronoi / Cellular Noise ───────────────────────────────────────────

export type VoronoiResult = {
  /** Distance to nearest cell center */
  d1: number;
  /** Distance to second-nearest cell center */
  d2: number;
  /** Cell ID for coloring */
  cellId: number;
};

/**
 * Voronoi (cellular) noise. Returns distances to nearest and second-nearest
 * cell centers, plus a cell ID.
 */
export function voronoi(x: number, y: number, perm: Uint8Array): VoronoiResult {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  let d1 = 999;
  let d2 = 999;
  let cellId = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (ix + dx) & 255;
      const cy = (iy + dy) & 255;
      const h = perm[cx + perm[cy]!]!;

      // Deterministic jitter from perm table
      const jx = (h & 15) / 15;
      const jy = ((h >> 4) & 15) / 15;

      const vx = dx + jx - fx;
      const vy = dy + jy - fy;
      const dist = vx * vx + vy * vy;

      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        cellId = h;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), cellId };
}

// ─── Utility ────────────────────────────────────────────────────────────

/** Build a permutation table from a numeric seed. */
export { buildPerm };

/** Smooth hermite interpolation (like GLSL smoothstep). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Clamp value between min and max. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
