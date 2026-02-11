export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3LenSq(a: Vec3): number {
  return v3Dot(a, a);
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Len(a: Vec3): number {
  return Math.sqrt(v3LenSq(a));
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Norm(a: Vec3): Vec3 {
  const len = v3Len(a);
  if (len <= 1e-12) return { x: 0, y: 0, z: 0 };
  return v3Scale(a, 1 / len);
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3ClampLen(a: Vec3, maxLen: number): Vec3 {
  const lenSq = v3LenSq(a);
  const maxSq = maxLen * maxLen;
  if (lenSq <= maxSq) return a;
  const len = Math.sqrt(lenSq);
  if (len <= 1e-12) return { x: 0, y: 0, z: 0 };
  return v3Scale(a, maxLen / len);
}

/** @deprecated Internal helper export retained for one cleanup cycle. */
export function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}
