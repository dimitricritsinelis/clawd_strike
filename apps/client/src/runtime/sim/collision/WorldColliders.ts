import type { RuntimeRect } from "../../map/types";
import type { MutableAabb } from "./Aabb";

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

export class WorldColliders {
  readonly colliders: readonly WorldColliderEntry[];
  readonly playableBounds: PlayableBounds;

  constructor(colliders: RuntimeColliderAabb[], playableBoundary: RuntimeRect) {
    this.colliders = colliders.map(toEntry);
    this.playableBounds = {
      minX: playableBoundary.x,
      maxX: playableBoundary.x + playableBoundary.w,
      minZ: playableBoundary.y,
      maxZ: playableBoundary.y + playableBoundary.h,
    };
  }
}
