import { intersectsAabb, setAabbFromFootPosition, type MutableAabb } from "./Aabb";
import { type WorldColliderEntry, type WorldColliders } from "./WorldColliders";

export type MutablePosition = {
  x: number;
  y: number;
  z: number;
};

export type MotionResult = {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
  grounded: boolean;
};

export class AabbCollisionSolver {
  private readonly playerAabb: MutableAabb = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
  private readonly collisionCandidates: WorldColliderEntry[] = [];

  constructor(
    private readonly halfWidth: number,
    private readonly height: number,
    private readonly epsilon = 0.0001,
  ) {}

  moveAndCollide(
    position: MutablePosition,
    deltaX: number,
    deltaZ: number,
    deltaY: number,
    world: WorldColliders,
    out: MotionResult,
  ): MotionResult {
    out.hitX = this.resolveAxis(position, deltaX, "x", world);
    out.hitZ = this.resolveAxis(position, deltaZ, "z", world);
    out.hitY = this.resolveAxis(position, deltaY, "y", world);
    out.grounded = out.hitY && deltaY < 0;
    return out;
  }

  private resolveAxis(
    position: MutablePosition,
    delta: number,
    axis: "x" | "y" | "z",
    world: WorldColliders,
  ): boolean {
    if (delta === 0) return false;

    if (axis === "x") {
      position.x += delta;
    } else if (axis === "y") {
      position.y += delta;
    } else {
      position.z += delta;
    }

    setAabbFromFootPosition(this.playerAabb, position.x, position.y, position.z, this.halfWidth, this.height);
    world.queryCandidates(this.playerAabb, this.collisionCandidates);

    let collided = false;
    if (delta > 0) {
      let positiveLimit = Number.POSITIVE_INFINITY;
      for (const collider of this.collisionCandidates) {
        if (axis !== "y" && collider.kind === "floor_slab") {
          continue;
        }
        if (!intersectsAabb(this.playerAabb, collider)) {
          continue;
        }
        collided = true;

        if (axis === "x") {
          positiveLimit = Math.min(positiveLimit, collider.minX - this.halfWidth - this.epsilon);
        } else if (axis === "z") {
          positiveLimit = Math.min(positiveLimit, collider.minZ - this.halfWidth - this.epsilon);
        } else {
          positiveLimit = Math.min(positiveLimit, collider.minY - this.height - this.epsilon);
        }
      }

      if (collided) {
        if (axis === "x") {
          position.x = Math.min(position.x, positiveLimit);
        } else if (axis === "z") {
          position.z = Math.min(position.z, positiveLimit);
        } else {
          position.y = Math.min(position.y, positiveLimit);
        }
      }
    } else {
      let negativeLimit = Number.NEGATIVE_INFINITY;
      for (const collider of this.collisionCandidates) {
        if (axis !== "y" && collider.kind === "floor_slab") {
          continue;
        }
        if (!intersectsAabb(this.playerAabb, collider)) {
          continue;
        }
        collided = true;

        if (axis === "x") {
          negativeLimit = Math.max(negativeLimit, collider.maxX + this.halfWidth + this.epsilon);
        } else if (axis === "z") {
          negativeLimit = Math.max(negativeLimit, collider.maxZ + this.halfWidth + this.epsilon);
        } else {
          negativeLimit = Math.max(negativeLimit, collider.maxY + this.epsilon);
        }
      }

      if (collided) {
        if (axis === "x") {
          position.x = Math.max(position.x, negativeLimit);
        } else if (axis === "z") {
          position.z = Math.max(position.z, negativeLimit);
        } else {
          position.y = Math.max(position.y, negativeLimit);
        }
      }
    }

    if (!collided) {
      return false;
    }

    setAabbFromFootPosition(this.playerAabb, position.x, position.y, position.z, this.halfWidth, this.height);
    return true;
  }
}
