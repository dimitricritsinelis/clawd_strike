import type { Vec3 } from "@clawd-strike/shared";

export type Aabb = Readonly<{ min: Vec3; max: Vec3 }>;

export function aabbIntersectsStrict(a: Aabb, b: Aabb): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function pointInsideAabbStrict(p: Vec3, b: Aabb): boolean {
  return p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z;
}

export function rayIntersectAabb(
  origin: Vec3,
  dir: Vec3,
  box: Aabb,
  tMinLimit: number,
  tMaxLimit: number
): number | null {
  // Slabs. Returns first hit t in [tMinLimit, tMaxLimit].
  let tmin = tMinLimit;
  let tmax = tMaxLimit;

  function axis(o: number, d: number, min: number, max: number): boolean {
    if (Math.abs(d) < 1e-12) {
      return o > min && o < max;
    }
    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    return tmax >= tmin;
  }

  if (!axis(origin.x, dir.x, box.min.x, box.max.x)) return null;
  if (!axis(origin.y, dir.y, box.min.y, box.max.y)) return null;
  if (!axis(origin.z, dir.z, box.min.z, box.max.z)) return null;
  if (tmin < tMinLimit || tmin > tMaxLimit) return null;
  return tmin;
}
