export type SlabAabb = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

const RAY_EPS = 1e-6;

/**
 * Slab-test ray vs AABB.
 * Returns hit distance in [0, maxDist], or Infinity if there is no hit.
 */
export function rayVsAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  aabb: SlabAabb,
): number {
  let tMin = 0;
  let tMax = maxDist;

  if (Math.abs(dx) <= RAY_EPS) {
    if (ox < aabb.minX || ox > aabb.maxX) return Infinity;
  } else {
    let t0 = (aabb.minX - ox) / dx;
    let t1 = (aabb.maxX - ox) / dx;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return Infinity;
  }

  if (Math.abs(dy) <= RAY_EPS) {
    if (oy < aabb.minY || oy > aabb.maxY) return Infinity;
  } else {
    let t0 = (aabb.minY - oy) / dy;
    let t1 = (aabb.maxY - oy) / dy;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return Infinity;
  }

  if (Math.abs(dz) <= RAY_EPS) {
    if (oz < aabb.minZ || oz > aabb.maxZ) return Infinity;
  } else {
    let t0 = (aabb.minZ - oz) / dz;
    let t1 = (aabb.maxZ - oz) / dz;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return Infinity;
  }

  if (tMin >= 0 && tMin <= maxDist) return tMin;
  if (tMax >= 0 && tMax <= maxDist) return tMax;
  return Infinity;
}
