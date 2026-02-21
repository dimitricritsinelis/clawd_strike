import { Vector3 } from "three";
import { RUN_SPEED_MPS } from "../sim/PlayerController";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import { type RaycastAabbHit, raycastFirstHit } from "./raycastAabb";

const DEG_TO_RAD = Math.PI / 180;
const TAU = Math.PI * 2;

const FIRE_INTERVAL_S = 0.1; // 600 RPM
const MAX_RANGE_M = 200;
const MAX_SHOTS_PER_UPDATE = 3;

const STATIONARY_SPEED_EPS_MPS = 0.16;
const SPREAD_STATIONARY_DEG = 0.2;
const SPREAD_MOVE_MIN_DEG = 1.4;
const SPREAD_MOVE_MAX_DEG = 2.25;
const SPREAD_AIR_MIN_DEG = 5.0;
const SPREAD_AIR_MAX_DEG = 7.0;

const BLOOM_PER_SHOT_DEG = 0.11;
const BLOOM_MAX_DEG = 1.2;
const BLOOM_RECOVERY_SECONDS = 0.34;

const RECOIL_RESET_DELAY_S = 0.3;
const RECOIL_MAX_ACCUM_PITCH_DEG = 24;
const RECOIL_MAX_ACCUM_YAW_DEG = 4;

// 30-shot spray pattern — full magazine, no wrap-around seam.
// Phase 1 (shots 1-8):  build-up, rising vertical + mild left drift
// Phase 2 (shots 9-16): peak recoil, strong left-then-right sway
// Phase 3 (shots 17-24): partial recovery, settling right
// Phase 4 (shots 25-30): late-spray, reduced vertical, random walk
const RECOIL_VERTICAL_PATTERN_DEG = [
  // Phase 1 — build-up
  0.58, 0.64, 0.70, 0.76,
  0.82, 0.88, 0.93, 0.96,
  // Phase 2 — peak
  0.96, 0.94, 0.91, 0.88,
  0.86, 0.85, 0.84, 0.83,
  // Phase 3 — settling
  0.80, 0.77, 0.74, 0.72,
  0.70, 0.68, 0.67, 0.66,
  // Phase 4 — late spray
  0.64, 0.62, 0.61, 0.60,
  0.59, 0.58,
] as const;

const RECOIL_HORIZONTAL_PATTERN_DEG = [
  // Phase 1 — center then left
   0.00,  0.04, -0.06, -0.12,
  -0.16, -0.20, -0.18, -0.10,
  // Phase 2 — strong left-to-right swing
   0.02,  0.14,  0.20,  0.18,
   0.10, -0.02, -0.14, -0.18,
  // Phase 3 — right settle
  -0.12, -0.04,  0.06,  0.14,
   0.16,  0.10,  0.02, -0.06,
  // Phase 4 — tight random walk
  -0.08, -0.04,  0.06,  0.10,
   0.06,  0.00,
] as const;

const RECOIL_VERTICAL_JITTER_DEG = 0.022;
const RECOIL_HORIZONTAL_JITTER_DEG = 0.03;
const RECOIL_MOVE_EXTRA_DEG = 0.055;

const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_RIGHT = new Vector3(1, 0, 0);

export type Ak47ShotEvent = {
  hit: boolean;
  hitPoint?: {
    x: number;
    y: number;
    z: number;
  };
  hitNormal?: {
    x: number;
    y: number;
    z: number;
  };
  colliderId?: string;
};

export type Ak47FireControllerOptions = {
  seed: number;
  maxRangeM?: number;
};

export type Ak47FireUpdateInput = {
  deltaSeconds: number;
  fireHeld: boolean;
  shotBudget?: number;
  origin: Vector3;
  forward: Vector3;
  grounded: boolean;
  speedMps: number;
  world: WorldColliders;
};

export type Ak47FireUpdateResult = {
  recoilPitchRad: number;
  recoilYawRad: number;
  shotsFired: number;
  shotIndex: number;
  spreadDeg: number;
  bloomDeg: number;
  lastShotRecoilPitchDeg: number;
  lastShotRecoilYawDeg: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class Ak47FireController {
  private readonly maxRangeM: number;
  private readonly spreadRng: DeterministicRng;
  private readonly recoilRng: DeterministicRng;

  private readonly basisForward = new Vector3();
  private readonly basisRight = new Vector3();
  private readonly basisUp = new Vector3();
  private readonly shotDirection = new Vector3();

  private readonly raycastHit: RaycastAabbHit = {
    distance: 0,
    point: new Vector3(),
    normal: new Vector3(),
    colliderId: "",
    colliderKind: "wall",
  };

  private fireHeldLastFrame = false;
  private timeUntilNextShotS = 0;
  private timeSinceLastShotS = Number.POSITIVE_INFINITY;
  private shotIndex = 0;
  private bloomDeg = 0;
  private accumulatedPitchDeg = 0;
  private accumulatedYawDeg = 0;

  private debugSpreadDeg = SPREAD_STATIONARY_DEG;
  private debugLastShotRecoilPitchDeg = 0;
  private debugLastShotRecoilYawDeg = 0;

  constructor(options: Ak47FireControllerOptions) {
    this.maxRangeM = options.maxRangeM ?? MAX_RANGE_M;

    const rootSeed = deriveSubSeed(options.seed, "ak47-fire");
    this.spreadRng = new DeterministicRng(deriveSubSeed(rootSeed, "spread"));
    this.recoilRng = new DeterministicRng(deriveSubSeed(rootSeed, "recoil"));
  }

  cancelTrigger(): void {
    this.fireHeldLastFrame = false;
    this.timeUntilNextShotS = 0;
    this.timeSinceLastShotS = Number.POSITIVE_INFINITY;
    this.resetSprayState();
  }

  update(input: Ak47FireUpdateInput, onShot?: (shot: Ak47ShotEvent) => void): Ak47FireUpdateResult {
    const deltaSeconds = Math.max(0, input.deltaSeconds);
    const shotBudget =
      input.shotBudget === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(input.shotBudget));

    this.timeSinceLastShotS += deltaSeconds;

    let recoilPitchRad = 0;
    let recoilYawRad = 0;
    let shotsFired = 0;

    if (!input.fireHeld) {
      this.fireHeldLastFrame = false;
      this.recoverBloom(deltaSeconds);

      if (this.timeSinceLastShotS >= RECOIL_RESET_DELAY_S) {
        this.resetSprayState();
      }

      this.debugSpreadDeg = this.computeSpreadDeg(input.grounded, input.speedMps);

      return {
        recoilPitchRad,
        recoilYawRad,
        shotsFired,
        shotIndex: this.shotIndex,
        spreadDeg: this.debugSpreadDeg,
        bloomDeg: this.bloomDeg,
        lastShotRecoilPitchDeg: this.debugLastShotRecoilPitchDeg,
        lastShotRecoilYawDeg: this.debugLastShotRecoilYawDeg,
      };
    }

    if (!this.fireHeldLastFrame) {
      if (this.timeSinceLastShotS >= RECOIL_RESET_DELAY_S) {
        this.resetSprayState();
      }
      this.timeUntilNextShotS = 0;
    }
    this.fireHeldLastFrame = true;

    this.timeUntilNextShotS -= deltaSeconds;

    while (this.timeUntilNextShotS <= 0 && shotsFired < MAX_SHOTS_PER_UPDATE && shotsFired < shotBudget) {
      this.timeUntilNextShotS += FIRE_INTERVAL_S;

      const recoil = this.fireSingleShot(input, onShot);
      recoilPitchRad += recoil.pitchRad;
      recoilYawRad += recoil.yawRad;
      shotsFired += 1;
    }

    return {
      recoilPitchRad,
      recoilYawRad,
      shotsFired,
      shotIndex: this.shotIndex,
      spreadDeg: this.debugSpreadDeg,
      bloomDeg: this.bloomDeg,
      lastShotRecoilPitchDeg: this.debugLastShotRecoilPitchDeg,
      lastShotRecoilYawDeg: this.debugLastShotRecoilYawDeg,
    };
  }

  private fireSingleShot(
    input: Ak47FireUpdateInput,
    onShot?: (shot: Ak47ShotEvent) => void,
  ): { pitchRad: number; yawRad: number } {
    this.debugSpreadDeg = this.computeSpreadDeg(input.grounded, input.speedMps);
    this.sampleSpreadDirection(input.forward, this.debugSpreadDeg, this.shotDirection);

    const hit = raycastFirstHit(input.world, input.origin, this.shotDirection, this.maxRangeM, this.raycastHit);
    if (onShot) {
      if (hit) {
        onShot({
          hit: true,
          hitPoint: {
            x: this.raycastHit.point.x,
            y: this.raycastHit.point.y,
            z: this.raycastHit.point.z,
          },
          hitNormal: {
            x: this.raycastHit.normal.x,
            y: this.raycastHit.normal.y,
            z: this.raycastHit.normal.z,
          },
          colliderId: this.raycastHit.colliderId,
        });
      } else {
        onShot({ hit: false });
      }
    }

    this.timeSinceLastShotS = 0;

    const patternIndex = this.shotIndex % RECOIL_VERTICAL_PATTERN_DEG.length;
    const basePitchDeg = RECOIL_VERTICAL_PATTERN_DEG[patternIndex]!;
    const baseYawDeg = RECOIL_HORIZONTAL_PATTERN_DEG[patternIndex]!;

    const moveNorm = clamp(input.speedMps / RUN_SPEED_MPS, 0, 1);

    let pitchDeg =
      basePitchDeg +
      this.recoilRng.range(-RECOIL_VERTICAL_JITTER_DEG, RECOIL_VERTICAL_JITTER_DEG) +
      moveNorm * RECOIL_MOVE_EXTRA_DEG;
    let yawDeg =
      baseYawDeg +
      this.recoilRng.range(-RECOIL_HORIZONTAL_JITTER_DEG, RECOIL_HORIZONTAL_JITTER_DEG);

    const nextPitchDeg = this.accumulatedPitchDeg + pitchDeg;
    if (nextPitchDeg > RECOIL_MAX_ACCUM_PITCH_DEG) {
      pitchDeg = RECOIL_MAX_ACCUM_PITCH_DEG - this.accumulatedPitchDeg;
    }

    const nextYawDeg = this.accumulatedYawDeg + yawDeg;
    if (nextYawDeg > RECOIL_MAX_ACCUM_YAW_DEG) {
      yawDeg = RECOIL_MAX_ACCUM_YAW_DEG - this.accumulatedYawDeg;
    } else if (nextYawDeg < -RECOIL_MAX_ACCUM_YAW_DEG) {
      yawDeg = -RECOIL_MAX_ACCUM_YAW_DEG - this.accumulatedYawDeg;
    }

    this.accumulatedPitchDeg += pitchDeg;
    this.accumulatedYawDeg += yawDeg;
    this.shotIndex += 1;

    this.bloomDeg = Math.min(BLOOM_MAX_DEG, this.bloomDeg + BLOOM_PER_SHOT_DEG);

    this.debugLastShotRecoilPitchDeg = pitchDeg;
    this.debugLastShotRecoilYawDeg = yawDeg;

    return {
      pitchRad: pitchDeg * DEG_TO_RAD,
      yawRad: yawDeg * DEG_TO_RAD,
    };
  }

  private computeSpreadDeg(grounded: boolean, speedMps: number): number {
    const speed = Math.max(0, speedMps);
    const speedNorm = Math.min(1, speed / RUN_SPEED_MPS);

    let baseSpreadDeg: number;
    if (!grounded) {
      baseSpreadDeg = SPREAD_AIR_MIN_DEG + (SPREAD_AIR_MAX_DEG - SPREAD_AIR_MIN_DEG) * speedNorm;
    } else if (speed <= STATIONARY_SPEED_EPS_MPS) {
      baseSpreadDeg = SPREAD_STATIONARY_DEG;
    } else {
      const moveNorm = Math.min(1, (speed - STATIONARY_SPEED_EPS_MPS) / Math.max(0.001, RUN_SPEED_MPS - STATIONARY_SPEED_EPS_MPS));
      baseSpreadDeg = SPREAD_MOVE_MIN_DEG + (SPREAD_MOVE_MAX_DEG - SPREAD_MOVE_MIN_DEG) * moveNorm;
    }

    // First-shot accuracy bonus: if the spray has fully reset (shotIndex === 0)
    // and the player is stationary and grounded, suppress bloom entirely and
    // halve the base spread for a near-perfect first bullet.
    const isFirstShot = this.shotIndex === 0 && this.timeSinceLastShotS >= RECOIL_RESET_DELAY_S;
    if (isFirstShot && grounded && speed <= STATIONARY_SPEED_EPS_MPS) {
      return baseSpreadDeg * 0.4; // near-perfect accuracy for the first clean tap
    }

    return baseSpreadDeg + this.bloomDeg;
  }

  private recoverBloom(deltaSeconds: number): void {
    if (this.bloomDeg <= 0) return;
    const recoverPerSecond = BLOOM_MAX_DEG / BLOOM_RECOVERY_SECONDS;
    this.bloomDeg = Math.max(0, this.bloomDeg - recoverPerSecond * deltaSeconds);
  }

  private resetSprayState(): void {
    this.shotIndex = 0;
    this.bloomDeg = 0;
    this.accumulatedPitchDeg = 0;
    this.accumulatedYawDeg = 0;
  }

  private sampleSpreadDirection(forward: Vector3, spreadDeg: number, outDir: Vector3): void {
    const spreadRad = spreadDeg * DEG_TO_RAD;
    const spreadRadius = Math.tan(spreadRad) * Math.sqrt(this.spreadRng.next());
    const theta = TAU * this.spreadRng.next();

    this.basisForward.copy(forward).normalize();

    const upReference = Math.abs(this.basisForward.y) > 0.98 ? WORLD_RIGHT : WORLD_UP;
    this.basisRight.copy(this.basisForward).cross(upReference).normalize();
    this.basisUp.copy(this.basisRight).cross(this.basisForward).normalize();

    const offsetX = Math.cos(theta) * spreadRadius;
    const offsetY = Math.sin(theta) * spreadRadius;

    outDir
      .copy(this.basisForward)
      .addScaledVector(this.basisRight, offsetX)
      .addScaledVector(this.basisUp, offsetY)
      .normalize();
  }
}
