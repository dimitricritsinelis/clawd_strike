import type { AABB } from "@clawd-strike/shared";
import type { Vec3 } from "@clawd-strike/shared";
import {
  DT,
  MAX_PITCH,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_FRICTION,
  PLAYER_HEIGHT,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  WALK_SPEED_SCALE
} from "./constants";
import { aabbIntersectsStrict } from "./aabb";

export type MutableVec3 = { x: number; y: number; z: number };

export type MoveCmd = Readonly<{
  moveX: number;
  moveY: number;
  yaw: number;
  pitch: number;
  walk: boolean;
}>;

export function clampPitch(pitch: number): number {
  if (pitch > MAX_PITCH) return MAX_PITCH;
  if (pitch < -MAX_PITCH) return -MAX_PITCH;
  return pitch;
}

export function yawPitchToDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cp
  };
}

export function yawToForwardRight(yaw: number): { fwd: { x: number; z: number }; right: { x: number; z: number } } {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // Forward is +Z when yaw = 0.
  return {
    fwd: { x: sy, z: cy },
    right: { x: cy, z: -sy }
  };
}

export function playerAabbAt(pos: Vec3): { min: Vec3; max: Vec3 } {
  return {
    min: { x: pos.x - PLAYER_RADIUS, y: pos.y, z: pos.z - PLAYER_RADIUS },
    max: { x: pos.x + PLAYER_RADIUS, y: pos.y + PLAYER_HEIGHT, z: pos.z + PLAYER_RADIUS }
  };
}

function resolveAxis(
  pos: MutableVec3,
  vel: MutableVec3,
  axis: "x" | "z",
  delta: number,
  colliders: readonly AABB[]
): void {
  // Move.
  pos[axis] += delta;

  // Resolve overlaps by pushing out along the moved axis only.
  const aabb = playerAabbAt(pos);
  for (const c of colliders) {
    // Skip floor-like colliders that are at/below y=0 and don't overlap the player's Y.
    if (!aabbIntersectsStrict(aabb, c)) continue;
    if (axis === "x") {
      if (delta > 0) {
        // Moving +X; push left.
        pos.x = c.min.x - PLAYER_RADIUS;
      } else if (delta < 0) {
        pos.x = c.max.x + PLAYER_RADIUS;
      }
      vel.x = 0;
    } else {
      if (delta > 0) {
        pos.z = c.min.z - PLAYER_RADIUS;
      } else if (delta < 0) {
        pos.z = c.max.z + PLAYER_RADIUS;
      }
      vel.z = 0;
    }
  }
}

export function simMove(
  pos: MutableVec3,
  vel: MutableVec3,
  cmd: MoveCmd,
  colliders: readonly AABB[],
  dt: number = DT
): void {
  // Clamp + store look.
  const yaw = cmd.yaw;

  // Desired direction in XZ plane.
  const ax = Math.max(-1, Math.min(1, cmd.moveX));
  const ay = Math.max(-1, Math.min(1, cmd.moveY));
  const { fwd, right } = yawToForwardRight(yaw);
  const wishX = right.x * ax + fwd.x * ay;
  const wishZ = right.z * ax + fwd.z * ay;
  const wishLen = Math.hypot(wishX, wishZ);

  const speedScale = cmd.walk ? WALK_SPEED_SCALE : 1.0;
  const maxSpeed = PLAYER_MAX_SPEED * speedScale;

  // Accelerate towards desired velocity.
  if (wishLen > 1e-6) {
    const dirX = wishX / wishLen;
    const dirZ = wishZ / wishLen;

    const desiredVX = dirX * maxSpeed;
    const desiredVZ = dirZ * maxSpeed;
    const dvx = desiredVX - vel.x;
    const dvz = desiredVZ - vel.z;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > 1e-6) {
      const dot = vel.x * desiredVX + vel.z * desiredVZ;
      const accel = dot < 0 ? PLAYER_DECEL : PLAYER_ACCEL;
      const maxDelta = accel * dt;
      const t = dvLen <= maxDelta ? 1.0 : maxDelta / dvLen;
      vel.x += dvx * t;
      vel.z += dvz * t;
    }
  } else {
    // Friction to stop cleanly.
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 1e-6) {
      const drop = PLAYER_FRICTION * dt;
      const next = speed - drop;
      const k = next <= 0 ? 0 : next / speed;
      vel.x *= k;
      vel.z *= k;
    } else {
      vel.x = 0;
      vel.z = 0;
    }
  }

  // Clamp max speed.
  const speed = Math.hypot(vel.x, vel.z);
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    vel.x *= k;
    vel.z *= k;
  }

  // Move with simple axis-by-axis resolution.
  resolveAxis(pos, vel, "x", vel.x * dt, colliders);
  resolveAxis(pos, vel, "z", vel.z * dt, colliders);

  // Stay on ground plane.
  pos.y = 0;
  vel.y = 0;
}
