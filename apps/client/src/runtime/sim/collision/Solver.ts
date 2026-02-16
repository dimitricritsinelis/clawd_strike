import { intersectsAabb, setAabbFromFootPosition, type MutableAabb } from "./Aabb";
import { type WorldColliders } from "./WorldColliders";

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

    if (axis === "x") position.x += delta;
    if (axis === "y") position.y += delta;
    if (axis === "z") position.z += delta;

    setAabbFromFootPosition(this.playerAabb, position.x, position.y, position.z, this.halfWidth, this.height);
    let collided = false;

    for (const collider of world.colliders) {
      if (axis !== "y" && collider.kind === "floor_slab") {
        continue;
      }
      if (!intersectsAabb(this.playerAabb, collider)) {
        continue;
      }

      collided = true;

      if (axis === "x") {
        position.x =
          delta > 0
            ? collider.minX - this.halfWidth - this.epsilon
            : collider.maxX + this.halfWidth + this.epsilon;
      } else if (axis === "z") {
        position.z =
          delta > 0
            ? collider.minZ - this.halfWidth - this.epsilon
            : collider.maxZ + this.halfWidth + this.epsilon;
      } else {
        position.y =
          delta > 0 ? collider.minY - this.height - this.epsilon : collider.maxY + this.epsilon;
      }

      setAabbFromFootPosition(this.playerAabb, position.x, position.y, position.z, this.halfWidth, this.height);
    }

    return collided;
  }
}
