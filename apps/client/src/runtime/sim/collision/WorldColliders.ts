import type { RuntimeRect } from "../../map/types";
import type { MutableAabb } from "./Aabb";

const BROADPHASE_CELL_SIZE_M = 4;
const CELL_KEY_OFFSET = 1 << 15;
const CELL_KEY_STRIDE = 1 << 16;

export type WorldColliderKind = "wall" | "floor_slab" | "prop";

export type RuntimeColliderAabb = {
  id: string;
  kind: WorldColliderKind;
  min: {
    x: number;
    y: number;
    z: number;
  };
  max: {
    x: number;
    y: number;
    z: number;
  };
};

export type PlayableBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type WorldColliderEntry = MutableAabb & {
  id: string;
  kind: WorldColliderKind;
};

function toEntry(collider: RuntimeColliderAabb): WorldColliderEntry {
  return {
    id: collider.id,
    kind: collider.kind,
    minX: collider.min.x,
    minY: collider.min.y,
    minZ: collider.min.z,
    maxX: collider.max.x,
    maxY: collider.max.y,
    maxZ: collider.max.z,
  };
}

function toCellCoord(value: number): number {
  return Math.floor(value / BROADPHASE_CELL_SIZE_M);
}

function toCellKey(cellX: number, cellZ: number): number {
  return (cellX + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + (cellZ + CELL_KEY_OFFSET);
}

export class WorldColliders {
  readonly colliders: readonly WorldColliderEntry[];
  readonly playableBounds: PlayableBounds;
  private readonly broadphaseBuckets: ReadonlyMap<number, readonly number[]>;
  private readonly broadphaseVisited: Uint32Array;
  private broadphaseStamp = 1;

  constructor(colliders: RuntimeColliderAabb[], playableBoundary: RuntimeRect) {
    this.colliders = colliders.map(toEntry);
    this.broadphaseBuckets = this.buildBroadphaseBuckets(this.colliders);
    this.broadphaseVisited = new Uint32Array(this.colliders.length);
    this.playableBounds = {
      minX: playableBoundary.x,
      maxX: playableBoundary.x + playableBoundary.w,
      minZ: playableBoundary.y,
      maxZ: playableBoundary.y + playableBoundary.h,
    };
  }

  queryCandidates(aabb: MutableAabb, out: WorldColliderEntry[]): number {
    out.length = 0;
    if (this.colliders.length === 0) return 0;

    if (this.colliders.length <= 16 || this.broadphaseBuckets.size === 0) {
      for (const collider of this.colliders) {
        out.push(collider);
      }
      return out.length;
    }

    if (this.broadphaseStamp === 0xffffffff) {
      this.broadphaseVisited.fill(0);
      this.broadphaseStamp = 1;
    }
    const stamp = this.broadphaseStamp;
    this.broadphaseStamp += 1;

    const minCellX = toCellCoord(aabb.minX);
    const maxCellX = toCellCoord(aabb.maxX);
    const minCellZ = toCellCoord(aabb.minZ);
    const maxCellZ = toCellCoord(aabb.maxZ);

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const bucket = this.broadphaseBuckets.get(toCellKey(cellX, cellZ));
        if (!bucket) continue;

        for (const colliderIndex of bucket) {
          if (this.broadphaseVisited[colliderIndex] === stamp) {
            continue;
          }
          this.broadphaseVisited[colliderIndex] = stamp;
          out.push(this.colliders[colliderIndex]!);
        }
      }
    }

    return out.length;
  }

  private buildBroadphaseBuckets(colliders: readonly WorldColliderEntry[]): Map<number, number[]> {
    const buckets = new Map<number, number[]>();

    for (let index = 0; index < colliders.length; index += 1) {
      const collider = colliders[index]!;
      const minCellX = toCellCoord(collider.minX);
      const maxCellX = toCellCoord(collider.maxX);
      const minCellZ = toCellCoord(collider.minZ);
      const maxCellZ = toCellCoord(collider.maxZ);

      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          const key = toCellKey(cellX, cellZ);
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.push(index);
          } else {
            buckets.set(key, [index]);
          }
        }
      }
    }

    return buckets;
  }
}
