import { Vector3 } from "three";
import { AabbCollisionSolver, type MotionResult, type MutablePosition } from "../sim/collision/Solver";
import { rayVsAabb } from "../sim/collision/rayVsAabb";
import { raycastFirstHit, type RaycastAabbHit } from "../sim/collision/raycastAabb";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const ENEMY_HALF_WIDTH_M = 0.3;
export const ENEMY_HEIGHT_M = 1.8;
const ENEMY_EYE_HEIGHT_M = 1.5;
const ENEMY_ROTATE_SPEED_MPS = 3.15;
const ENEMY_INVESTIGATE_SPEED_MPS = 2.6;
const ENEMY_HOLD_SPEED_MPS = 1.1;
const ENEMY_PRESSURE_SPEED_MPS = 3.75;
const ENEMY_FALLBACK_SPEED_MPS = 3.2;
const ENEMY_PEEK_SPEED_MPS = 2.0;
const ENEMY_DAMAGE_PER_HIT = 25;
const ENEMY_MAX_HEALTH = 100;
const ENEMY_STUCK_THRESHOLD_S = 0.45;
const ENEMY_MIN_MOVED_M = 0.05;
const ENEMY_PEEK_CHANGE_S_MIN = 1.2;
const ENEMY_PEEK_CHANGE_S_MAX = 1.8;
const ENEMY_MIN_NODE_RADIUS_M = 0.6;
const ENEMY_RELOAD_DECISION_MAG = 6;
const GRAVITY_MPS2 = 20.0;
const MAX_SUBSTEP_DT_S = 1 / 120;
const MAX_FRAME_DT_S = 1 / 20;
const BOUNDS_EPS = 0.001;

const ENEMY_MAG_CAPACITY = 30;
const ENEMY_RESERVE_START = 90;
const ENEMY_RELOAD_TIME_S = 2.45;

type BurstRange = readonly [number, number];

export type EnemyId = string;
export type EnemyTeam = "player" | "enemy";
export type EnemyRole = "anchor" | "rifler" | "flanker" | "roamer";
export type EnemyState = "HOLD" | "OVERWATCH" | "ROTATE" | "INVESTIGATE" | "PEEK" | "PRESSURE" | "FALLBACK" | "RELOAD";

export type EnemyTierProfile = {
  tier: number;
  reactionTimeS: number;
  memoryS: number;
  spreadDeg: number;
  visionRangeM: number;
  sharedAlertRadiusM: number;
  maxTurnDegPerS: number;
  activeFlankers: number;
  pairSwing: boolean;
  collapse: boolean;
  mandatoryReloadFallback: boolean;
  maxLaneStack: number;
  shotIntervalS: number;
  longBurst: BurstRange;
  midBurst: BurstRange;
  closeBurst: BurstRange;
};

export const ENEMY_TIER_PROFILES: readonly EnemyTierProfile[] = [
  {
    tier: 0,
    reactionTimeS: 0.8,
    memoryS: 0.75,
    spreadDeg: 13.0,
    visionRangeM: 80,
    sharedAlertRadiusM: 18,
    maxTurnDegPerS: 120,
    activeFlankers: 0,
    pairSwing: false,
    collapse: false,
    mandatoryReloadFallback: false,
    maxLaneStack: 2,
    shotIntervalS: 0.22,
    longBurst: [1, 1],
    midBurst: [1, 2],
    closeBurst: [2, 3],
  },
  {
    tier: 1,
    reactionTimeS: 0.6,
    memoryS: 1.25,
    spreadDeg: 9.5,
    visionRangeM: 80,
    sharedAlertRadiusM: 24,
    maxTurnDegPerS: 150,
    activeFlankers: 0,
    pairSwing: false,
    collapse: false,
    mandatoryReloadFallback: false,
    maxLaneStack: 2,
    shotIntervalS: 0.2,
    longBurst: [1, 1],
    midBurst: [1, 2],
    closeBurst: [2, 4],
  },
  {
    tier: 2,
    reactionTimeS: 0.45,
    memoryS: 2.0,
    spreadDeg: 6.5,
    visionRangeM: 85,
    sharedAlertRadiusM: 30,
    maxTurnDegPerS: 180,
    activeFlankers: 0,
    pairSwing: false,
    collapse: false,
    mandatoryReloadFallback: false,
    maxLaneStack: 2,
    shotIntervalS: 0.18,
    longBurst: [1, 2],
    midBurst: [2, 3],
    closeBurst: [3, 5],
  },
  {
    tier: 3,
    reactionTimeS: 0.3,
    memoryS: 3.0,
    spreadDeg: 4.5,
    visionRangeM: 90,
    sharedAlertRadiusM: 40,
    maxTurnDegPerS: 220,
    activeFlankers: 1,
    pairSwing: false,
    collapse: false,
    mandatoryReloadFallback: false,
    maxLaneStack: 2,
    shotIntervalS: 0.14,
    longBurst: [1, 2],
    midBurst: [2, 3],
    closeBurst: [5, 6],
  },
  {
    tier: 4,
    reactionTimeS: 0.22,
    memoryS: 4.2,
    spreadDeg: 3.2,
    visionRangeM: 90,
    sharedAlertRadiusM: 55,
    maxTurnDegPerS: 260,
    activeFlankers: 1,
    pairSwing: true,
    collapse: false,
    mandatoryReloadFallback: true,
    maxLaneStack: 2,
    shotIntervalS: 0.12,
    longBurst: [1, 2],
    midBurst: [3, 4],
    closeBurst: [5, 7],
  },
  {
    tier: 5,
    reactionTimeS: 0.16,
    memoryS: 5.5,
    spreadDeg: 2.4,
    visionRangeM: 95,
    sharedAlertRadiusM: 70,
    maxTurnDegPerS: 300,
    activeFlankers: 2,
    pairSwing: true,
    collapse: true,
    mandatoryReloadFallback: true,
    maxLaneStack: 3,
    shotIntervalS: 0.1,
    longBurst: [1, 2],
    midBurst: [3, 4],
    closeBurst: [5, 7],
  },
] as const;

export function clampEnemyTier(value: number): number {
  return Math.max(0, Math.min(ENEMY_TIER_PROFILES.length - 1, Math.trunc(value)));
}

export function resolveEnemyTierProfile(tier: number): EnemyTierProfile {
  return ENEMY_TIER_PROFILES[clampEnemyTier(tier)]!;
}

export type EnemyTarget = {
  id: string;
  team: EnemyTeam;
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

export type EnemyDirective = {
  role: EnemyRole;
  state: EnemyState;
  tier: number;
  tierProfile: EnemyTierProfile;
  assignedNodeId: string | null;
  targetNodeId: string | null;
  movePoint: { x: number; z: number } | null;
  holdPoint: { x: number; z: number } | null;
  focusPoint: { x: number; y: number; z: number } | null;
  peekOffsetM: number;
  allowFire: boolean;
  aggressive: boolean;
  hasDirectSight: boolean;
  directiveAgeS: number;
  debugReason: string;
};

export type EnemyPerceptionEvent = {
  kind: "seen-player";
  enemyId: string;
  targetId: string;
  position: { x: number; y: number; z: number };
  distanceM: number;
};

export type EnemyDebugSnapshot = {
  id: string;
  name: string;
  team: EnemyTeam;
  role: EnemyRole;
  state: EnemyState;
  tier: number;
  health: number;
  reloading: boolean;
  mag: number;
  reserve: number;
  assignedNodeId: string | null;
  targetNodeId: string | null;
  memoryRemainingS: number;
  reactionRemainingS: number;
  burstShotsRemaining: number;
  debugReason: string;
  position: { x: number; y: number; z: number };
  movePoint: { x: number; z: number } | null;
  holdPoint: { x: number; z: number } | null;
  focusPoint: { x: number; y: number; z: number } | null;
  directSight: boolean;
  aimYawErrorDeg: number;
  directiveAgeS: number;
  targetNodeChangeCount: number;
};

function resolveBurstCount(rng: DeterministicRng, range: BurstRange): number {
  const [minBurst, maxBurst] = range;
  const minValue = Math.max(1, Math.trunc(minBurst));
  const maxValue = Math.max(minValue, Math.trunc(maxBurst));
  return rng.int(minValue, maxValue + 1);
}

function resolveBurstCooldownS(distanceM: number): number {
  if (distanceM > 18) return 0.5;
  if (distanceM > 8) return 0.34;
  return 0.2;
}

function normalizeAngleRad(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export class EnemyController {
  readonly id: EnemyId;
  readonly name: string;

  private readonly position: MutablePosition;
  private readonly aabb: EnemyAabb;
  private yaw = 0;
  private health = ENEMY_MAX_HEALTH;
  private state: EnemyState = "HOLD";
  private role: EnemyRole = "rifler";
  private readonly team: EnemyTeam = "enemy";
  private dead = false;
  private lastHitWasHeadshot = false;

  private assignedNodeId: string | null = null;
  private targetNodeId: string | null = null;
  private debugReason = "spawn hold";

  private shootTimer = 0;
  private burstCooldownTimerS = 0;
  private burstShotsRemaining = 0;
  private firingThisFrame = false;
  private velocityY = 0;
  private grounded = false;
  private reactionTimerS = 0;
  private memoryTimerS = 0;
  private lastKnownTargetPos: { x: number; y: number; z: number } | null = null;
  private lastVisibleTargetId: string | null = null;

  private mag = ENEMY_MAG_CAPACITY;
  private reserve = ENEMY_RESERVE_START;
  private reloading = false;
  private reloadTimer = 0;

  private desiredVX = 0;
  private desiredVZ = 0;
  private stuckTimer = 0;
  private peekDir = 1;
  private peekTimerS = 0;
  private footstepTimerS = 0;
  private currentTier = 0;

  private currentMovePoint: { x: number; z: number } | null = null;
  private currentHoldPoint: { x: number; z: number } | null = null;
  private currentFocusPoint: { x: number; y: number; z: number } | null = null;
  private directSight = false;
  private aimYawErrorDeg = 0;
  private currentDirectiveAgeS = 0;
  private targetNodeChangeCount = 0;

  private readonly solver: AabbCollisionSolver;
  private rng: DeterministicRng;
  private readonly motionResult: MotionResult = { hitX: false, hitY: false, hitZ: false, grounded: false };

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
    this.aabb = {
      id,
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
    };
    this.position = { x: spawnX, y: 0, z: spawnZ };
    this.solver = new AabbCollisionSolver(ENEMY_HALF_WIDTH_M, ENEMY_HEIGHT_M);
    this.rng = new DeterministicRng(deriveSubSeed(seed, id));
    this.shootTimer = this.rng.range(0.08, 0.22);
    this.peekTimerS = this.rng.range(ENEMY_PEEK_CHANGE_S_MIN, ENEMY_PEEK_CHANGE_S_MAX);
  }

  reset(spawnX: number, spawnZ: number, seed: number): void {
    this.position.x = spawnX;
    this.position.y = 0;
    this.position.z = spawnZ;

    this.yaw = 0;
    this.health = ENEMY_MAX_HEALTH;
    this.state = "HOLD";
    this.role = "rifler";
    this.dead = false;
    this.lastHitWasHeadshot = false;
    this.assignedNodeId = null;
    this.targetNodeId = null;
    this.debugReason = "spawn hold";

    this.shootTimer = 0;
    this.burstCooldownTimerS = 0;
    this.burstShotsRemaining = 0;
    this.firingThisFrame = false;
    this.velocityY = 0;
    this.grounded = false;
    this.reactionTimerS = 0;
    this.memoryTimerS = 0;
    this.lastKnownTargetPos = null;
    this.lastVisibleTargetId = null;

    this.mag = ENEMY_MAG_CAPACITY;
    this.reserve = ENEMY_RESERVE_START;
    this.reloading = false;
    this.reloadTimer = 0;

    this.desiredVX = 0;
    this.desiredVZ = 0;
    this.stuckTimer = 0;
    this.peekDir = 1;
    this.peekTimerS = 0;
    this.footstepTimerS = 0;
    this.currentTier = 0;
    this.currentMovePoint = null;
    this.currentHoldPoint = null;
    this.currentFocusPoint = null;
    this.directSight = false;
    this.aimYawErrorDeg = 0;
    this.currentDirectiveAgeS = 0;
    this.targetNodeChangeCount = 0;

    this.motionResult.hitX = false;
    this.motionResult.hitY = false;
    this.motionResult.hitZ = false;
    this.motionResult.grounded = false;

    this.rng = new DeterministicRng(deriveSubSeed(seed, this.id));
    this.shootTimer = this.rng.range(0.08, 0.22);
    this.peekTimerS = this.rng.range(ENEMY_PEEK_CHANGE_S_MIN, ENEMY_PEEK_CHANGE_S_MAX);
  }

  step(
    deltaSeconds: number,
    directive: EnemyDirective,
    targets: readonly EnemyTarget[],
    worldColliders: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
    onEnemyShot: (targetId: string, damage: number) => void,
    onFootstep?: (distanceToPlayer: number) => void,
    onPerception?: (event: EnemyPerceptionEvent) => void,
  ): void {
    if (this.dead) return;

    this.firingThisFrame = false;
    this.role = directive.role;
    this.state = directive.state;
    this.currentTier = directive.tier;
    if (directive.targetNodeId !== this.targetNodeId) {
      this.targetNodeChangeCount += 1;
    }
    this.assignedNodeId = directive.assignedNodeId;
    this.targetNodeId = directive.targetNodeId;
    this.debugReason = directive.debugReason;
    this.currentMovePoint = directive.movePoint;
    this.currentHoldPoint = directive.holdPoint;
    this.currentFocusPoint = directive.focusPoint;
    this.currentDirectiveAgeS = directive.directiveAgeS;

    const clampedDt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DT_S);
    if (clampedDt <= 0) return;

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

    this.burstCooldownTimerS = Math.max(0, this.burstCooldownTimerS - clampedDt);
    this.peekTimerS -= clampedDt;
    if (this.peekTimerS <= 0) {
      this.peekDir *= -1;
      this.peekTimerS = this.rng.range(ENEMY_PEEK_CHANGE_S_MIN, ENEMY_PEEK_CHANGE_S_MAX);
    }

    const tierProfile = directive.tierProfile;
    const visibleTarget = this.findVisibleTarget(targets, tierProfile, worldColliders, enemyAabbs);
    this.directSight = visibleTarget !== null || directive.hasDirectSight;
    if (visibleTarget) {
      const dx = visibleTarget.position.x - this.position.x;
      const dz = visibleTarget.position.z - this.position.z;
      const distanceM = Math.hypot(dx, dz);
      this.lastKnownTargetPos = {
        x: visibleTarget.position.x,
        y: visibleTarget.position.y,
        z: visibleTarget.position.z,
      };
      this.memoryTimerS = tierProfile.memoryS;
      if (this.lastVisibleTargetId !== visibleTarget.id) {
        this.reactionTimerS = Math.max(this.reactionTimerS, tierProfile.reactionTimeS);
      }
      this.lastVisibleTargetId = visibleTarget.id;
      onPerception?.({
        kind: "seen-player",
        enemyId: this.id,
        targetId: visibleTarget.id,
        position: {
          x: visibleTarget.position.x,
          y: visibleTarget.position.y,
          z: visibleTarget.position.z,
        },
        distanceM,
      });
    } else {
      this.reactionTimerS = Math.max(0, this.reactionTimerS - clampedDt);
      this.memoryTimerS = Math.max(0, this.memoryTimerS - clampedDt);
      if (this.memoryTimerS <= 0) {
        this.lastVisibleTargetId = null;
      }
    }

    if (!visibleTarget && !this.reloading && this.reserve > 0 && this.mag <= ENEMY_RELOAD_DECISION_MAG) {
      this.reloading = true;
      this.reloadTimer = 0;
    }

    const turnTarget = this.applyDirectiveMovement(directive, visibleTarget);
    if (turnTarget) {
      this.turnTowardPoint(turnTarget.x, turnTarget.z, tierProfile.maxTurnDegPerS, clampedDt);
    } else {
      this.aimYawErrorDeg = 0;
    }

    const stepCount = Math.max(1, Math.ceil(clampedDt / MAX_SUBSTEP_DT_S));
    const stepDt = clampedDt / stepCount;
    const preX = this.position.x;
    const preZ = this.position.z;
    let vx = this.desiredVX;
    let vz = this.desiredVZ;

    for (let i = 0; i < stepCount; i += 1) {
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

      if (this.motionResult.hitX) vx = 0;
      if (this.motionResult.hitZ) vz = 0;

      const pb = worldColliders.playableBounds;
      const hw = ENEMY_HALF_WIDTH_M + BOUNDS_EPS;
      if (this.position.x < pb.minX + hw) this.position.x = pb.minX + hw;
      if (this.position.x > pb.maxX - hw) this.position.x = pb.maxX - hw;
      if (this.position.z < pb.minZ + hw) this.position.z = pb.minZ + hw;
      if (this.position.z > pb.maxZ - hw) this.position.z = pb.maxZ - hw;
    }

    const movedSq = (this.position.x - preX) ** 2 + (this.position.z - preZ) ** 2;
    const wantedToMove = this.desiredVX !== 0 || this.desiredVZ !== 0;
    if (wantedToMove && movedSq < ENEMY_MIN_MOVED_M * ENEMY_MIN_MOVED_M) {
      this.stuckTimer += clampedDt;
      if (this.stuckTimer >= ENEMY_STUCK_THRESHOLD_S) {
        this.stuckTimer = 0;
        this.peekDir *= -1;
      }
    } else {
      this.stuckTimer = 0;
    }

    if (visibleTarget) {
      this.reactionTimerS = Math.max(0, this.reactionTimerS - clampedDt);
      this.runFiringLogic(visibleTarget, directive, clampedDt, worldColliders, enemyAabbs, targets, onEnemyShot);
    } else {
      this.burstShotsRemaining = 0;
    }

    if (onFootstep && this.grounded) {
      const speed = Math.hypot(this.desiredVX, this.desiredVZ);
      if (speed > 0.3) {
        const targetDistance = this.lastKnownTargetPos
          ? Math.hypot(this.lastKnownTargetPos.x - this.position.x, this.lastKnownTargetPos.z - this.position.z)
          : 20;
        this.footstepTimerS -= clampedDt;
        if (this.footstepTimerS <= 0) {
          this.footstepTimerS = speed > 2.6 ? 0.46 : 0.68;
          onFootstep(targetDistance);
        }
      } else {
        this.footstepTimerS = 0;
      }
    }
  }

  getAabb(): EnemyAabb {
    this.aabb.minX = this.position.x - ENEMY_HALF_WIDTH_M;
    this.aabb.minY = this.position.y;
    this.aabb.minZ = this.position.z - ENEMY_HALF_WIDTH_M;
    this.aabb.maxX = this.position.x + ENEMY_HALF_WIDTH_M;
    this.aabb.maxY = this.position.y + ENEMY_HEIGHT_M;
    this.aabb.maxZ = this.position.z + ENEMY_HALF_WIDTH_M;
    return this.aabb;
  }

  applyDamage(amount: number, isHeadshot = false): void {
    if (this.dead) return;
    this.lastHitWasHeadshot = isHeadshot;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  isDead(): boolean { return this.dead; }
  wasLastHitHeadshot(): boolean { return this.lastHitWasHeadshot; }
  getHealth(): number { return this.health; }
  getMag(): number { return this.mag; }
  getReserve(): number { return this.reserve; }
  isReloading(): boolean { return this.reloading; }
  getTeam(): EnemyTeam { return this.team; }
  getRole(): EnemyRole { return this.role; }
  getPosition(): Readonly<MutablePosition> { return this.position; }
  getYaw(): number { return this.yaw; }
  isFiring(): boolean { return this.firingThisFrame; }
  getState(): EnemyState { return this.state; }

  getDebugSnapshot(): EnemyDebugSnapshot {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      role: this.role,
      state: this.state,
      tier: this.currentTier,
      health: this.health,
      reloading: this.reloading,
      mag: this.mag,
      reserve: this.reserve,
      assignedNodeId: this.assignedNodeId,
      targetNodeId: this.targetNodeId,
      memoryRemainingS: this.memoryTimerS,
      reactionRemainingS: this.reactionTimerS,
      burstShotsRemaining: this.burstShotsRemaining,
      debugReason: this.debugReason,
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      },
      movePoint: this.currentMovePoint ? { ...this.currentMovePoint } : null,
      holdPoint: this.currentHoldPoint ? { ...this.currentHoldPoint } : null,
      focusPoint: this.currentFocusPoint ? { ...this.currentFocusPoint } : null,
      directSight: this.directSight,
      aimYawErrorDeg: this.aimYawErrorDeg,
      directiveAgeS: this.currentDirectiveAgeS,
      targetNodeChangeCount: this.targetNodeChangeCount,
    };
  }

  canSeeTarget(
    target: EnemyTarget,
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
  ): boolean {
    return this.hasLineOfSight(target.position, world, enemyAabbs);
  }

  private applyDirectiveMovement(
    directive: EnemyDirective,
    visibleTarget: EnemyTarget | null,
  ): { x: number; z: number } | null {
    this.desiredVX = 0;
    this.desiredVZ = 0;

    const focus = visibleTarget
      ? visibleTarget.position
      : this.lastKnownTargetPos ?? directive.focusPoint ?? null;
    const anchorPoint = directive.holdPoint ?? directive.movePoint;

    const lowAmmoNeedsCover =
      this.mag <= ENEMY_RELOAD_DECISION_MAG && this.reserve > 0 && directive.tierProfile.mandatoryReloadFallback;
    const effectiveState: EnemyState = lowAmmoNeedsCover && directive.state !== "RELOAD" ? "FALLBACK" : directive.state;
    this.state = effectiveState;

    switch (effectiveState) {
      case "OVERWATCH":
        if (anchorPoint && Math.hypot(anchorPoint.x - this.position.x, anchorPoint.z - this.position.z) > ENEMY_MIN_NODE_RADIUS_M) {
          this.moveTowardPoint(anchorPoint, ENEMY_HOLD_SPEED_MPS * 0.8);
        }
        break;
      case "ROTATE":
        this.moveTowardPoint(directive.movePoint, ENEMY_ROTATE_SPEED_MPS);
        break;
      case "INVESTIGATE":
        this.moveTowardPoint(directive.movePoint, ENEMY_INVESTIGATE_SPEED_MPS);
        break;
      case "PRESSURE":
        if (anchorPoint && focus) {
          this.moveTowardPeek(anchorPoint, focus, directive.peekOffsetM * (directive.aggressive ? 1.15 : 0.75), ENEMY_PRESSURE_SPEED_MPS);
        } else if (directive.movePoint) {
          this.moveTowardPoint(directive.movePoint, ENEMY_PRESSURE_SPEED_MPS);
        } else if (focus) {
          this.moveTowardPoint({ x: focus.x, z: focus.z }, ENEMY_PRESSURE_SPEED_MPS);
        }
        break;
      case "PEEK":
        if (anchorPoint && focus) {
          this.moveTowardPeek(anchorPoint, focus, directive.peekOffsetM, ENEMY_PEEK_SPEED_MPS);
        } else {
          this.moveTowardPoint(directive.movePoint, ENEMY_PEEK_SPEED_MPS);
        }
        break;
      case "FALLBACK":
      case "RELOAD":
        this.moveTowardPoint(directive.movePoint ?? directive.holdPoint, ENEMY_FALLBACK_SPEED_MPS);
        if (effectiveState === "RELOAD" && !this.reloading && this.reserve > 0) {
          const holdPoint = directive.holdPoint ?? directive.movePoint;
          const settled = !holdPoint || Math.hypot(holdPoint.x - this.position.x, holdPoint.z - this.position.z) <= 1.1;
          if (settled) {
            this.reloading = true;
            this.reloadTimer = 0;
          }
        }
        break;
      case "HOLD":
      default:
        if (anchorPoint && Math.hypot(anchorPoint.x - this.position.x, anchorPoint.z - this.position.z) > ENEMY_MIN_NODE_RADIUS_M) {
          this.moveTowardPoint(anchorPoint, ENEMY_HOLD_SPEED_MPS);
        }
        break;
    }

    if (focus) {
      return { x: focus.x, z: focus.z };
    }
    if (directive.movePoint) {
      return directive.movePoint;
    }
    return null;
  }

  private moveTowardPoint(point: { x: number; z: number } | null, speed: number): void {
    if (!point) return;
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= ENEMY_MIN_NODE_RADIUS_M) return;
    const invDistance = 1 / distance;
    this.desiredVX = dx * invDistance * speed;
    this.desiredVZ = dz * invDistance * speed;
  }

  private moveTowardPeek(
    anchorPoint: { x: number; z: number },
    focusPoint: { x: number; z: number } | { x: number; y: number; z: number },
    offsetM: number,
    speed: number,
  ): void {
    const dx = focusPoint.x - anchorPoint.x;
    const dz = focusPoint.z - anchorPoint.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.01) {
      this.moveTowardPoint(anchorPoint, speed);
      return;
    }

    const invDistance = 1 / distance;
    const perpX = -dz * invDistance;
    const perpZ = dx * invDistance;
    const desiredPoint = {
      x: anchorPoint.x + perpX * this.peekDir * offsetM,
      z: anchorPoint.z + perpZ * this.peekDir * offsetM,
    };

    const desiredDx = desiredPoint.x - this.position.x;
    const desiredDz = desiredPoint.z - this.position.z;
    const desiredDistance = Math.hypot(desiredDx, desiredDz);
    if (desiredDistance <= 0.1) {
      return;
    }

    const invDesiredDistance = 1 / desiredDistance;
    this.desiredVX = desiredDx * invDesiredDistance * speed;
    this.desiredVZ = desiredDz * invDesiredDistance * speed;
  }

  private runFiringLogic(
    visibleTarget: EnemyTarget,
    directive: EnemyDirective,
    deltaSeconds: number,
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
    targets: readonly EnemyTarget[],
    onEnemyShot: (targetId: string, damage: number) => void,
  ): void {
    if (!directive.allowFire) return;
    if (this.reloading) return;
    if (this.state === "ROTATE" || this.state === "FALLBACK" || this.state === "RELOAD") return;
    if (this.reactionTimerS > 0) return;

    const dx = visibleTarget.position.x - this.position.x;
    const dz = visibleTarget.position.z - this.position.z;
    const distanceM = Math.hypot(dx, dz);

    if (this.burstCooldownTimerS > 0) return;
    if (this.burstShotsRemaining <= 0) {
      const burstRange =
        distanceM > 18
          ? directive.tierProfile.longBurst
          : distanceM > 8
            ? directive.tierProfile.midBurst
            : directive.tierProfile.closeBurst;
      this.burstShotsRemaining = resolveBurstCount(this.rng, burstRange);
    }

    this.shootTimer -= deltaSeconds;
    if (this.shootTimer > 0) return;
    this.shootTimer = directive.tierProfile.shotIntervalS;

    if (this.tryFireAt(visibleTarget, world, enemyAabbs, targets, onEnemyShot, directive.tierProfile.spreadDeg)) {
      this.firingThisFrame = true;
    }

    this.burstShotsRemaining = Math.max(0, this.burstShotsRemaining - 1);
    if (this.burstShotsRemaining <= 0) {
      this.burstCooldownTimerS = resolveBurstCooldownS(distanceM);
    }
  }

  private findVisibleTarget(
    targets: readonly EnemyTarget[],
    tierProfile: EnemyTierProfile,
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
  ): EnemyTarget | null {
    let nearestDist = Number.POSITIVE_INFINITY;
    let nearestTarget: EnemyTarget | null = null;

    for (const target of targets) {
      if (target.id === this.id) continue;
      if (target.team === this.team) continue;
      if (target.health <= 0) continue;

      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tierProfile.visionRangeM) continue;
      if (!this.hasLineOfSight(target.position, world, enemyAabbs)) continue;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = target;
      }
    }

    return nearestTarget;
  }

  private resolveTargetTeam(targets: readonly EnemyTarget[], targetId: string): EnemyTeam | null {
    for (const target of targets) {
      if (target.id === targetId) {
        return target.team;
      }
    }
    return null;
  }

  private turnTowardPoint(targetX: number, targetZ: number, maxTurnDegPerS: number, deltaSeconds: number): void {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) {
      this.aimYawErrorDeg = 0;
      return;
    }

    const desiredYaw = Math.atan2(-dx, -dz);
    const deltaYaw = normalizeAngleRad(desiredYaw - this.yaw);
    const maxTurnRad = Math.max(1, maxTurnDegPerS) * DEG_TO_RAD * deltaSeconds;
    const clampedDelta = Math.max(-maxTurnRad, Math.min(maxTurnRad, deltaYaw));
    this.yaw = normalizeAngleRad(this.yaw + clampedDelta);
    this.aimYawErrorDeg = Math.abs(normalizeAngleRad(desiredYaw - this.yaw)) * RAD_TO_DEG;
  }

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

    for (const aabb of enemyAabbs) {
      if (aabb.id === this.id) continue;
      if (aabb.id === "player") continue;
      const t = rayVsAabb(eyeX, eyeY, eyeZ, ndx, ndy, ndz, dist - 0.1, aabb);
      if (t < dist - 0.1) return false;
    }

    this.losOrigin.set(eyeX, eyeY, eyeZ);
    this.losDir.set(ndx, ndy, ndz);
    return !raycastFirstHit(world, this.losOrigin, this.losDir, dist - 0.1, this.losHit);
  }

  private tryFireAt(
    target: EnemyTarget,
    world: WorldColliders,
    enemyAabbs: readonly EnemyAabb[],
    targets: readonly EnemyTarget[],
    onEnemyShot: (targetId: string, damage: number) => void,
    spreadDeg: number,
  ): boolean {
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

    const spreadRad = this.rng.range(-spreadDeg, spreadDeg) * DEG_TO_RAD;
    const cosS = Math.cos(spreadRad);
    const sinS = Math.sin(spreadRad);
    const rotatedX = ndx * cosS - ndz * sinS;
    const rotatedZ = ndx * sinS + ndz * cosS;
    ndx = rotatedX;
    ndz = rotatedZ;
    ndy += this.rng.range(-0.02, 0.02);

    const len = Math.sqrt(ndx * ndx + ndy * ndy + ndz * ndz);
    if (len > 0.01) {
      const inv = 1 / len;
      ndx *= inv;
      ndy *= inv;
      ndz *= inv;
    }

    const maxRange = 100;
    let bestDist = maxRange;
    let bestHitId: string | null = null;

    for (const aabb of enemyAabbs) {
      if (aabb.id === this.id) continue;
      if (this.resolveTargetTeam(targets, aabb.id) === this.team) continue;
      const t = rayVsAabb(eyeX, eyeY, eyeZ, ndx, ndy, ndz, maxRange, aabb);
      if (t < bestDist) {
        bestDist = t;
        bestHitId = aabb.id;
      }
    }

    this.losOrigin.set(eyeX, eyeY, eyeZ);
    this.shotDir.set(ndx, ndy, ndz);
    const worldHit = raycastFirstHit(world, this.losOrigin, this.shotDir, maxRange, this.shotHit);
    if (worldHit && this.shotHit.distance < bestDist) {
      bestHitId = null;
    }

    this.mag -= 1;
    if (this.mag <= 0 && this.reserve > 0) {
      this.reloading = true;
      this.reloadTimer = 0;
    }

    if (bestHitId !== null) {
      onEnemyShot(bestHitId, ENEMY_DAMAGE_PER_HIT);
    }

    return true;
  }
}
