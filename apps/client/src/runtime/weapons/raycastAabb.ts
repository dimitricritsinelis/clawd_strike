import { Vector3 } from "three";
import type { MutableAabb } from "../sim/collision/Aabb";
import type { WorldColliderEntry, WorldColliderKind, WorldColliders } from "../sim/collision/WorldColliders";

const RAY_EPSILON = 1e-6;
const RAY_QUERY_PAD_M = 0.001;

type AxisKey = "x" | "y" | "z";

type HitNormalAxis = {
  axis: AxisKey;
  sign: -1 | 1;
};

export type RaycastAabbHit = {
  distance: number;
  point: Vector3;
  normal: Vector3;
  colliderId: string;
  colliderKind: WorldColliderKind;
};

const queryAabb: MutableAabb = {
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
};

const candidates: WorldColliderEntry[] = [];

const enterNormal: HitNormalAxis = { axis: "x", sign: 1 };
const exitNormal: HitNormalAxis = { axis: "x", sign: -1 };

function getAxisValue(vec: Vector3, axis: AxisKey): number {
  if (axis === "x") return vec.x;
  if (axis === "y") return vec.y;
  return vec.z;
}

function getAxisMin(entry: WorldColliderEntry, axis: AxisKey): number {
  if (axis === "x") return entry.minX;
  if (axis === "y") return entry.minY;
  return entry.minZ;
}

function getAxisMax(entry: WorldColliderEntry, axis: AxisKey): number {
  if (axis === "x") return entry.maxX;
  if (axis === "y") return entry.maxY;
  return entry.maxZ;
}

function writeAxisNormal(out: Vector3, axis: AxisKey, sign: -1 | 1): void {
  out.set(0, 0, 0);
  if (axis === "x") {
    out.x = sign;
    return;
  }
  if (axis === "y") {
    out.y = sign;
    return;
  }
  out.z = sign;
}

function rayVsAabb(entry: WorldColliderEntry, origin: Vector3, dir: Vector3, maxDist: number, outNormal: Vector3): number {
  let tMin = 0;
  let tMax = maxDist;

  for (const axis of ["x", "y", "z"] as const) {
    const axisOrigin = getAxisValue(origin, axis);
    const axisDir = getAxisValue(dir, axis);
    const axisMin = getAxisMin(entry, axis);
    const axisMax = getAxisMax(entry, axis);

    if (Math.abs(axisDir) <= RAY_EPSILON) {
      if (axisOrigin < axisMin || axisOrigin > axisMax) {
        return Number.POSITIVE_INFINITY;
      }
      continue;
    }

    const invDir = 1 / axisDir;
    let nearT = (axisMin - axisOrigin) * invDir;
    let farT = (axisMax - axisOrigin) * invDir;
    let nearSign: -1 | 1 = axisDir > 0 ? -1 : 1;
    let farSign: -1 | 1 = axisDir > 0 ? 1 : -1;

    if (nearT > farT) {
      const swapT = nearT;
      nearT = farT;
      farT = swapT;

      const swapSign = nearSign;
      nearSign = farSign;
      farSign = swapSign;
    }

    if (nearT > tMin) {
      tMin = nearT;
      enterNormal.axis = axis;
      enterNormal.sign = nearSign;
    }

    if (farT < tMax) {
      tMax = farT;
      exitNormal.axis = axis;
      exitNormal.sign = farSign;
    }

    if (tMin > tMax) {
      return Number.POSITIVE_INFINITY;
    }
  }

  if (tMin >= 0 && tMin <= maxDist) {
    writeAxisNormal(outNormal, enterNormal.axis, enterNormal.sign);
    return tMin;
  }

  if (tMax >= 0 && tMax <= maxDist) {
    writeAxisNormal(outNormal, exitNormal.axis, exitNormal.sign);
    return tMax;
  }

  return Number.POSITIVE_INFINITY;
}

export function raycastFirstHit(
  world: WorldColliders,
  origin: Vector3,
  dir: Vector3,
  maxDist: number,
  outHit: RaycastAabbHit,
): boolean {
  const endX = origin.x + dir.x * maxDist;
  const endY = origin.y + dir.y * maxDist;
  const endZ = origin.z + dir.z * maxDist;

  queryAabb.minX = Math.min(origin.x, endX) - RAY_QUERY_PAD_M;
  queryAabb.maxX = Math.max(origin.x, endX) + RAY_QUERY_PAD_M;
  queryAabb.minY = Math.min(origin.y, endY) - RAY_QUERY_PAD_M;
  queryAabb.maxY = Math.max(origin.y, endY) + RAY_QUERY_PAD_M;
  queryAabb.minZ = Math.min(origin.z, endZ) - RAY_QUERY_PAD_M;
  queryAabb.maxZ = Math.max(origin.z, endZ) + RAY_QUERY_PAD_M;

  world.queryCandidates(queryAabb, candidates);

  let nearestDistance = maxDist;
  let nearestCollider: WorldColliderEntry | null = null;
  let nearestNormalX = 0;
  let nearestNormalY = 0;
  let nearestNormalZ = 0;
  let found = false;

  for (const collider of candidates) {
    const hitDistance = rayVsAabb(collider, origin, dir, maxDist, outHit.normal);
    if (!Number.isFinite(hitDistance)) continue;
    if (hitDistance > nearestDistance) continue;

    nearestDistance = hitDistance;
    nearestCollider = collider;
    nearestNormalX = outHit.normal.x;
    nearestNormalY = outHit.normal.y;
    nearestNormalZ = outHit.normal.z;
    found = true;
  }

  if (!found || !nearestCollider) {
    return false;
  }

  outHit.distance = nearestDistance;
  outHit.normal.set(nearestNormalX, nearestNormalY, nearestNormalZ);
  outHit.point.copy(dir).multiplyScalar(nearestDistance).add(origin);
  outHit.colliderId = nearestCollider.id;
  outHit.colliderKind = nearestCollider.kind;
  return true;
}
