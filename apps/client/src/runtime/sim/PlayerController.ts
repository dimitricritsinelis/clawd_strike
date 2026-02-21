import { AabbCollisionSolver, type MotionResult, type MutablePosition } from "./collision/Solver";
import { WorldColliders } from "./collision/WorldColliders";

export type PlayerInputState = {
  forward: number;
  right: number;
  walkHeld: boolean;
  jumpPressed: boolean;
};

export const PLAYER_WIDTH_M = 0.6;
export const PLAYER_HEIGHT_M = 1.8;
export const PLAYER_EYE_HEIGHT_M = 1.7;
export const RUN_SPEED_MPS = 6.0;
export const WALK_SPEED_MPS = 3.0;
export const GRAVITY_MPS2 = 20.0;
export const JUMP_VELOCITY_MPS = 6.35;

/** Coyote time: player can still jump for this many seconds after walking off a ledge. */
const COYOTE_TIME_S = 0.1;
/** Jump buffer: a jump input this many seconds early will be queued and executed on landing. */
const JUMP_BUFFER_S = 0.1;

const PLAYER_HALF_WIDTH_M = PLAYER_WIDTH_M * 0.5;
const MAX_FRAME_DT_S = 1 / 20;
const MAX_SUBSTEP_DT_S = 1 / 120;
const BOUNDS_EPSILON_M = 0.001;

export class PlayerController {
  private readonly position: MutablePosition = { x: 0, y: 0, z: 0 };
  private readonly solver = new AabbCollisionSolver(PLAYER_HALF_WIDTH_M, PLAYER_HEIGHT_M);
  private readonly motionResult: MotionResult = { hitX: false, hitY: false, hitZ: false, grounded: false };

  private world: WorldColliders | null = null;
  private velocityY = 0;
  private grounded = true;
  private horizontalSpeedMps = 0;
  /** Coyote timer: counts down from COYOTE_TIME_S when the player leaves the ground. */
  private coyoteTimerS = 0;
  /** Jump buffer timer: set to JUMP_BUFFER_S on input; executes jump when grounded. */
  private jumpBufferTimerS = 0;

  setWorld(world: WorldColliders): void {
    this.world = world;
    this.clampToPlayableBounds();
  }

  setSpawn(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.velocityY = 0;
    this.grounded = true;
    this.horizontalSpeedMps = 0;
    this.coyoteTimerS = 0;
    this.jumpBufferTimerS = 0;
    this.clampToPlayableBounds();
  }

  step(deltaSeconds: number, input: PlayerInputState, yaw: number): void {
    const world = this.world;
    if (!world) return;

    const clampedDt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DT_S);
    if (clampedDt <= 0) return;

    const stepCount = Math.max(1, Math.ceil(clampedDt / MAX_SUBSTEP_DT_S));
    const stepDt = clampedDt / stepCount;

    // ── Jump buffer: receiving new jump input refreshes the buffer timer ──────
    if (input.jumpPressed) {
      this.jumpBufferTimerS = JUMP_BUFFER_S;
    }

    for (let i = 0; i < stepCount; i += 1) {
      let forward = input.forward;
      let right = input.right;

      const axisLength = Math.hypot(forward, right);
      if (axisLength > 1) {
        const invLength = 1 / axisLength;
        forward *= invLength;
        right *= invLength;
      }

      const speedMps = input.walkHeld ? WALK_SPEED_MPS : RUN_SPEED_MPS;
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const forwardX = -sinYaw;
      const forwardZ = -cosYaw;
      const rightX = cosYaw;
      const rightZ = -sinYaw;

      const velocityX = (forwardX * forward + rightX * right) * speedMps;
      const velocityZ = (forwardZ * forward + rightZ * right) * speedMps;
      this.horizontalSpeedMps = Math.hypot(velocityX, velocityZ);

      // ── Coyote time: allow jumping briefly after walking off a ledge ────────
      const canJump = this.grounded || this.coyoteTimerS > 0;

      if (this.jumpBufferTimerS > 0 && canJump) {
        this.velocityY = JUMP_VELOCITY_MPS;
        this.grounded = false;
        this.coyoteTimerS = 0;   // consume coyote window immediately
        this.jumpBufferTimerS = 0;
      }

      // Decay timers by substep dt
      this.jumpBufferTimerS = Math.max(0, this.jumpBufferTimerS - stepDt);
      if (!this.grounded) {
        this.coyoteTimerS = Math.max(0, this.coyoteTimerS - stepDt);
      }

      this.velocityY -= GRAVITY_MPS2 * stepDt;

      this.solver.moveAndCollide(
        this.position,
        velocityX * stepDt,
        velocityZ * stepDt,
        this.velocityY * stepDt,
        world,
        this.motionResult,
      );

      if (this.motionResult.hitY) {
        if (this.velocityY < 0) {
          this.grounded = true;
          this.coyoteTimerS = 0; // reset coyote on landing
        }
        this.velocityY = 0;
      } else {
        if (this.grounded) {
          // Just left the ground — start the coyote window
          this.coyoteTimerS = COYOTE_TIME_S;
        }
        this.grounded = false;
      }

      this.clampToPlayableBounds();
    }
  }

  getPosition(): Readonly<MutablePosition> {
    return this.position;
  }

  getGrounded(): boolean {
    return this.grounded;
  }

  getHorizontalSpeedMps(): number {
    return this.horizontalSpeedMps;
  }

  private clampToPlayableBounds(): void {
    if (!this.world) return;

    const minX = this.world.playableBounds.minX + PLAYER_HALF_WIDTH_M + BOUNDS_EPSILON_M;
    const maxX = this.world.playableBounds.maxX - PLAYER_HALF_WIDTH_M - BOUNDS_EPSILON_M;
    const minZ = this.world.playableBounds.minZ + PLAYER_HALF_WIDTH_M + BOUNDS_EPSILON_M;
    const maxZ = this.world.playableBounds.maxZ - PLAYER_HALF_WIDTH_M - BOUNDS_EPSILON_M;

    if (this.position.x < minX) this.position.x = minX;
    if (this.position.x > maxX) this.position.x = maxX;
    if (this.position.z < minZ) this.position.z = minZ;
    if (this.position.z > maxZ) this.position.z = maxZ;
  }
}
