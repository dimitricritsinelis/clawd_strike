import { Vector3 } from "three";
import { AabbCollisionSolver, type MotionResult, type MutablePosition } from "../sim/collision/Solver";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import { raycastFirstHit, type RaycastAabbHit } from "../weapons/raycastAabb";

const DEG_TO_RAD = Math.PI / 180;
const TAU = Math.PI * 2;

export const ENEMY_HALF_WIDTH_M = 0.3;
export const ENEMY_HEIGHT_M = 1.8;
const ENEMY_EYE_HEIGHT_M = 1.5;
const ENEMY_MOVE_SPEED_MPS = 3.5;
const ENEMY_PATROL_SPEED_MPS = 1.5;
const ENEMY_HOLD_SPEED_MPS = 1.0;      // slow creep when already in attack range
const ENEMY_ATTACK_RANGE_M = 8.0;      // stop closing gap, shift to hold speed
const ENEMY_DETECTION_RANGE_M = 30.0;  // widen vision to see across the map
const ENEMY_SHOOT_INTERVAL_S = 0.8;    // slightly faster fire rate
const ENEMY_SHOOT_SPREAD_DEG = 5.0;    // realistic inaccuracy at range
const ENEMY_DAMAGE_PER_HIT = 25;
const ENEMY_MAX_HEALTH = 100;
const ENEMY_PATROL_RADIUS_M = 3.0;   // tighter radius → less likely to pick target through wall
const ENEMY_PATROL_CHANGE_S_MIN = 1.5;
const ENEMY_PATROL_CHANGE_S_MAX = 3.0;
const ENEMY_LOSE_TARGET_S = 5.0;
const ENEMY_STUCK_THRESHOLD_S = 0.4; // if blocked this long, pick new patrol target immediately
const ENEMY_MIN_MOVED_M = 0.05;      // must move at least this far per tick to not be "stuck"
/** Lateral strafe speed when in attack range (m/s). */
const ENEMY_STRAFE_SPEED_MPS = 2.0;
/** How long each strafe direction is held (seconds) before switching. */
const ENEMY_STRAFE_CHANGE_S_MIN = 1.2;
const ENEMY_STRAFE_CHANGE_S_MAX = 2.8;
const GRAVITY_MPS2 = 20.0;
const MAX_SUBSTEP_DT_S = 1 / 120;
const MAX_FRAME_DT_S = 1 / 20;
const BOUNDS_EPS = 0.001;

const ENEMY_MAG_CAPACITY = 30;
const ENEMY_RESERVE_START = 90;
const ENEMY_RELOAD_TIME_S = 2.45;

export type EnemyId = string;
export type EnemyState = "PATROL" | "ATTACK";

export type EnemyTarget = {
  id: string;
  position: { x: number; y: number; z: number };
  health: number;
};

export type EnemyAabb = {
  id: EnemyId;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

// Inline slab-test against an EnemyAabb. Returns hit distance or Infinity.
function rayVsEnemyAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  aabb: EnemyAabb,
): number {
  const RAY_EPS = 1e-6;
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

export class EnemyController {
  readonly id: EnemyId;
  readonly name: string;

  private readonly position: MutablePosition;
  private readonly spawnX: number;
  private readonly spawnZ: number;
  private yaw = 0;
  private health = ENEMY_MAX_HEALTH;
  private state: EnemyState = "PATROL";
  private dead = false;

  // Patrol
  private patrolTargetX: number;
  private patrolTargetZ: number;
  private patrolChangeTimer = 0;

  // Attack / LOS
  private losBlockedTimer = 0;
  private shootTimer = 0;
  private firingThisFrame = false;
  private velocityY = 0;
  private grounded = false;

  // Ammo / reload
  private mag = ENEMY_MAG_CAPACITY;
  private reserve = ENEMY_RESERVE_START;
  private reloading = false;
  private reloadTimer = 0;

  // Desired movement velocity set by AI logic, consumed by substep loop
  private desiredVX = 0;
  private desiredVZ = 0;

  // Stuck detection
  private stuckTimer = 0;

  // Lateral strafing (in attack range)
  private strafeDir = 1;        // +1 = strafe right, -1 = strafe left relative to target direction
  private strafeChangeTimer = 0; // countdown to next strafe direction flip

  // Footstep audio timer
  private footstepTimerS = 0;

  private readonly solver: AabbCollisionSolver;
  private readonly rng: DeterministicRng;
  private readonly motionResult: MotionResult = { hitX: false, hitY: false, hitZ: false, grounded: false };

  // Scratch vectors for raycasting
  private readonly losOrigin = new Vector3();
  private readonly losDir = new Vector3();
  private readonly shotDir = new Vector3();
  private readonly losHit: RaycastAabbHit = {
    distance: 0,
    point: new Vector3(),
    normal: new Vector3(),
    colliderId: "",
    colliderKind: "wall",
  };
  private readonly shotHit: RaycastAabbHit = {
    distance: 0,
    point: new Vector3(),
    normal: new Vector3(),
    colliderId: "",
    colliderKind: "wall",
  };

  constructor(id: EnemyId, name: string, spawnX: number, spawnZ: number, seed: number) {
    this.id = id;
    this.name = name;
    this.spawnX = spawnX;
    this.spawnZ = spawnZ;
    this.position = { x: spawnX, y: 0, z: spawnZ };
    this.patrolTargetX = spawnX;
    this.patrolTargetZ = spawnZ;
    this.solver = new AabbCollisionSolver(ENEMY_HALF_WIDTH_M, ENEMY_HEIGHT_M);
    this.rng = new DeterministicRng(deriveSubSeed(seed, id));
    // Stagger initial patrol timer so all enemies don't change direction simultaneously
    this.patrolChangeTimer = this.rng.range(0.5, 2.0);
    // Stagger initial shoot timer so enemies don't all fire on frame 1
    this.shootTimer = this.rng.range(0.1, ENEMY_SHOOT_INTERVAL_S);
  }

  step(
    deltaSeconds: number,
    targets: readonly EnemyTarget[],
    worldColliders: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
    onEnemyShot: (targetId: string, damage: number) => void,
    onFootstep?: (distanceToPlayer: number) => void,
  ): void {
    if (this.dead) return;

    this.firingThisFrame = false;

    const clampedDt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DT_S);
    if (clampedDt <= 0) return;

    // ── Tick reload ──────────────────────────────────────────────────────────
    if (this.reloading) {
      this.reloadTimer += clampedDt;
      if (this.reloadTimer >= ENEMY_RELOAD_TIME_S) {
        const needed = ENEMY_MAG_CAPACITY - this.mag;
        const moved = Math.min(needed, this.reserve);
        this.mag += moved;
        this.reserve -= moved;
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }

    // ── AI: find nearest visible target ──────────────────────────────────────
    let nearestDist = Infinity;
    let nearestTarget: EnemyTarget | null = null;

    for (const target of targets) {
      if (target.id === this.id) continue;
      if (target.health <= 0) continue;

      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > ENEMY_DETECTION_RANGE_M) continue;
      if (!this.hasLineOfSight(target.position, worldColliders, enemyAabbs)) continue;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = target;
      }
    }

    // ── AI: set desired velocity and handle shooting ──────────────────────────
    if (nearestTarget !== null) {
      this.state = "ATTACK";
      this.losBlockedTimer = 0;

      const dx = nearestTarget.position.x - this.position.x;
      const dz = nearestTarget.position.z - this.position.z;
      const dist = nearestDist;

      // Always face target
      if (dist > 0.01) {
        this.yaw = Math.atan2(-dx, -dz);
      }

      if (dist > ENEMY_ATTACK_RANGE_M) {
        // Close the gap at full speed
        const invDist = 1 / dist;
        this.desiredVX = dx * invDist * ENEMY_MOVE_SPEED_MPS;
        this.desiredVZ = dz * invDist * ENEMY_MOVE_SPEED_MPS;
        this.strafeChangeTimer = 0; // reset strafe timer while chasing
      } else {
        // In attack range: strafe laterally to be harder to hit
        this.strafeChangeTimer -= clampedDt;
        if (this.strafeChangeTimer <= 0) {
          this.strafeDir *= -1; // flip direction
          this.strafeChangeTimer = this.rng.range(ENEMY_STRAFE_CHANGE_S_MIN, ENEMY_STRAFE_CHANGE_S_MAX);
        }

        const invDist = 1 / dist;
        // Perpendicular direction (right-hand side of forward-to-target)
        const perpX = -dz * invDist; // 90° CCW of (dx, dz)
        const perpZ =  dx * invDist;

        // Blend: slow forward creep + lateral strafe
        const strafeScale = this.strafeDir * ENEMY_STRAFE_SPEED_MPS;
        this.desiredVX = dx * invDist * ENEMY_HOLD_SPEED_MPS + perpX * strafeScale;
        this.desiredVZ = dz * invDist * ENEMY_HOLD_SPEED_MPS + perpZ * strafeScale;

        // Normalize if combined speed exceeds strafe speed to prevent diagonal speed boost
        const combinedSpeed = Math.hypot(this.desiredVX, this.desiredVZ);
        const maxSpeed = ENEMY_STRAFE_SPEED_MPS;
        if (combinedSpeed > maxSpeed) {
          const inv = maxSpeed / combinedSpeed;
          this.desiredVX *= inv;
          this.desiredVZ *= inv;
        }
      }

      // Shooting
      this.shootTimer -= clampedDt;
      if (this.shootTimer <= 0 && !this.reloading) {
        this.shootTimer = ENEMY_SHOOT_INTERVAL_S;
        if (this.tryFireAt(nearestTarget, worldColliders, enemyAabbs, onEnemyShot)) {
          this.firingThisFrame = true;
        }
      }
    } else {
      // No visible target — patrol
      this.losBlockedTimer += clampedDt;
      if (this.losBlockedTimer >= ENEMY_LOSE_TARGET_S) {
        this.state = "PATROL";
      }

      this.patrolChangeTimer -= clampedDt;
      if (this.patrolChangeTimer <= 0) {
        const angle = this.rng.range(0, TAU);
        const radius = this.rng.range(1, ENEMY_PATROL_RADIUS_M);
        this.patrolTargetX = this.spawnX + Math.cos(angle) * radius;
        this.patrolTargetZ = this.spawnZ + Math.sin(angle) * radius;
        this.patrolChangeTimer = this.rng.range(ENEMY_PATROL_CHANGE_S_MIN, ENEMY_PATROL_CHANGE_S_MAX);
      }

      const pdx = this.patrolTargetX - this.position.x;
      const pdz = this.patrolTargetZ - this.position.z;
      const pdist = Math.hypot(pdx, pdz);

      if (pdist > 0.5) {
        const invDist = 1 / pdist;
        this.desiredVX = pdx * invDist * ENEMY_PATROL_SPEED_MPS;
        this.desiredVZ = pdz * invDist * ENEMY_PATROL_SPEED_MPS;
        this.yaw = Math.atan2(-pdx, -pdz);
      } else {
        this.desiredVX = 0;
        this.desiredVZ = 0;
      }
    }

    // ── Physics substep loop (unified — same for ATTACK and PATROL) ───────────
    const stepCount = Math.max(1, Math.ceil(clampedDt / MAX_SUBSTEP_DT_S));
    const stepDt = clampedDt / stepCount;

    // Track position before movement for stuck detection
    const preX = this.position.x;
    const preZ = this.position.z;
    // Copy AI intent into local vars — physics wall-slide zeroes the locals only,
    // never touching this.desiredVX / this.desiredVZ so the AI state reads correctly
    // next frame and footstep speed calculation remains accurate.
    let vx = this.desiredVX;
    let vz = this.desiredVZ;

    for (let i = 0; i < stepCount; i++) {
      this.velocityY -= GRAVITY_MPS2 * stepDt;

      this.solver.moveAndCollide(
        this.position,
        vx * stepDt,
        vz * stepDt,
        this.velocityY * stepDt,
        worldColliders,
        this.motionResult,
      );

      if (this.motionResult.hitY) {
        if (this.velocityY < 0) this.grounded = true;
        this.velocityY = 0;
      } else {
        this.grounded = false;
      }

      // If horizontal movement was blocked, apply wall-slide:
      // project the desired velocity onto the unblocked axis.
      // Use local vx/vz only — do NOT mutate this.desiredVX / this.desiredVZ.
      if (this.motionResult.hitX) vx = 0;
      if (this.motionResult.hitZ) vz = 0;

      // ── Clamp to playable bounds (same pattern as PlayerController) ──────────
      const pb = worldColliders.playableBounds;
      const hw = ENEMY_HALF_WIDTH_M + BOUNDS_EPS;
      if (this.position.x < pb.minX + hw) this.position.x = pb.minX + hw;
      if (this.position.x > pb.maxX - hw) this.position.x = pb.maxX - hw;
      if (this.position.z < pb.minZ + hw) this.position.z = pb.minZ + hw;
      if (this.position.z > pb.maxZ - hw) this.position.z = pb.maxZ - hw;
    }

    // ── Stuck detection: if we barely moved despite having desired velocity,
    //    increment stuck timer and force a new patrol target when it fires ────
    const movedSq = (this.position.x - preX) ** 2 + (this.position.z - preZ) ** 2;
    const wantedToMove = (this.desiredVX !== 0 || this.desiredVZ !== 0);
    if (wantedToMove && movedSq < ENEMY_MIN_MOVED_M * ENEMY_MIN_MOVED_M) {
      this.stuckTimer += clampedDt;
      if (this.stuckTimer >= ENEMY_STUCK_THRESHOLD_S) {
        this.stuckTimer = 0;
        // Force a new patrol waypoint — random direction from current position
        const angle = this.rng.range(0, TAU);
        const radius = this.rng.range(1, ENEMY_PATROL_RADIUS_M);
        this.patrolTargetX = this.position.x + Math.cos(angle) * radius;
        this.patrolTargetZ = this.position.z + Math.sin(angle) * radius;
        this.patrolChangeTimer = this.rng.range(ENEMY_PATROL_CHANGE_S_MIN, ENEMY_PATROL_CHANGE_S_MAX);
      }
    } else {
      this.stuckTimer = 0;
    }

    // ── Footstep audio ───────────────────────────────────────────────────────
    if (onFootstep && this.grounded) {
      const speed = Math.hypot(this.desiredVX, this.desiredVZ);
      if (speed > 0.3) {
        this.footstepTimerS -= clampedDt;
        if (this.footstepTimerS <= 0) {
          // Faster steps when running (attack), slower when patrolling
          this.footstepTimerS = speed > 2.5 ? 0.42 : 0.62;
          // Distance to nearest player target (first target in list for simplicity)
          let distToPlayer = 20;
          for (const t of targets) {
            const dx = t.position.x - this.position.x;
            const dz = t.position.z - this.position.z;
            const d = Math.hypot(dx, dz);
            if (d < distToPlayer) distToPlayer = d;
          }
          onFootstep(distToPlayer);
        }
      } else {
        this.footstepTimerS = 0;
      }
    }
  }

  getAabb(): EnemyAabb {
    return {
      id: this.id,
      minX: this.position.x - ENEMY_HALF_WIDTH_M,
      minY: this.position.y,
      minZ: this.position.z - ENEMY_HALF_WIDTH_M,
      maxX: this.position.x + ENEMY_HALF_WIDTH_M,
      maxY: this.position.y + ENEMY_HEIGHT_M,
      maxZ: this.position.z + ENEMY_HALF_WIDTH_M,
    };
  }

  applyDamage(amount: number): void {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  isDead(): boolean { return this.dead; }
  getHealth(): number { return this.health; }
  getMag(): number { return this.mag; }
  getReserve(): number { return this.reserve; }
  isReloading(): boolean { return this.reloading; }

  getPosition(): Readonly<MutablePosition> { return this.position; }
  getYaw(): number { return this.yaw; }
  isFiring(): boolean { return this.firingThisFrame; }
  getState(): EnemyState { return this.state; }

  private hasLineOfSight(
    targetPos: { x: number; y: number; z: number },
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
  ): boolean {
    const eyeX = this.position.x;
    const eyeY = this.position.y + ENEMY_EYE_HEIGHT_M;
    const eyeZ = this.position.z;

    const targetEyeX = targetPos.x;
    const targetEyeY = targetPos.y + ENEMY_EYE_HEIGHT_M;
    const targetEyeZ = targetPos.z;

    const dx = targetEyeX - eyeX;
    const dy = targetEyeY - eyeY;
    const dz = targetEyeZ - eyeZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.01) return true;

    const invDist = 1 / dist;
    const ndx = dx * invDist;
    const ndy = dy * invDist;
    const ndz = dz * invDist;

    // Check other enemy bodies — another enemy blocking LOS is fine (still can't shoot through)
    for (const aabb of enemyAabbs) {
      if (aabb.id === this.id) continue;
      if (aabb.id === "player") continue; // player AABB doesn't block LOS checks
      const t = rayVsEnemyAabb(eyeX, eyeY, eyeZ, ndx, ndy, ndz, dist - 0.1, aabb);
      if (t < dist - 0.1) return false;
    }

    // Check world geometry
    this.losOrigin.set(eyeX, eyeY, eyeZ);
    this.losDir.set(ndx, ndy, ndz);
    const hit = raycastFirstHit(world, this.losOrigin, this.losDir, dist - 0.1, this.losHit);
    if (hit) return false;

    return true;
  }

  private tryFireAt(
    target: EnemyTarget,
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
    onEnemyShot: (targetId: string, damage: number) => void,
  ): boolean {
    // Ammo check
    if (this.reloading) return false;
    if (this.mag <= 0) {
      if (this.reserve > 0) {
        this.reloading = true;
        this.reloadTimer = 0;
      }
      return false;
    }

    const eyeX = this.position.x;
    const eyeY = this.position.y + ENEMY_EYE_HEIGHT_M;
    const eyeZ = this.position.z;

    const targetEyeX = target.position.x;
    const targetEyeY = target.position.y + ENEMY_EYE_HEIGHT_M;
    const targetEyeZ = target.position.z;

    const dx = targetEyeX - eyeX;
    const dy = targetEyeY - eyeY;
    const dz = targetEyeZ - eyeZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.01) return false;

    const invDist = 1 / dist;
    let ndx = dx * invDist;
    let ndy = dy * invDist;
    let ndz = dz * invDist;

    // Apply spread cone (horizontal rotation only)
    const spreadRad = this.rng.range(-ENEMY_SHOOT_SPREAD_DEG, ENEMY_SHOOT_SPREAD_DEG) * DEG_TO_RAD;
    const cosS = Math.cos(spreadRad);
    const sinS = Math.sin(spreadRad);
    const rotatedX = ndx * cosS - ndz * sinS;
    const rotatedZ = ndx * sinS + ndz * cosS;
    ndx = rotatedX;
    ndz = rotatedZ;
    ndy += this.rng.range(-0.02, 0.02);

    // Re-normalize
    const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
    if (len > 0.01) {
      const inv = 1 / len;
      ndx *= inv;
      ndy *= inv;
      ndz *= inv;
    }

    const MAX_RANGE = 100;

    // Check enemy AABBs first (including player which has id "player")
    let bestDist = MAX_RANGE;
    let bestHitId: string | null = null;

    for (const aabb of enemyAabbs) {
      if (aabb.id === this.id) continue;
      const t = rayVsEnemyAabb(eyeX, eyeY, eyeZ, ndx, ndy, ndz, MAX_RANGE, aabb);
      if (t < bestDist) {
        bestDist = t;
        bestHitId = aabb.id;
      }
    }

    // Check world geometry — if world is closer, it blocks the shot
    this.losOrigin.set(eyeX, eyeY, eyeZ);
    this.shotDir.set(ndx, ndy, ndz);
    const worldHit = raycastFirstHit(world, this.losOrigin, this.shotDir, MAX_RANGE, this.shotHit);
    if (worldHit && this.shotHit.distance < bestDist) {
      bestHitId = null;
    }

    // Consume one round regardless of hit
    this.mag -= 1;
    if (this.mag <= 0 && this.reserve > 0) {
      this.reloading = true;
      this.reloadTimer = 0;
    }

    if (bestHitId !== null) {
      onEnemyShot(bestHitId, ENEMY_DAMAGE_PER_HIT);
    }

    return true; // fired (even if missed)
  }
}
