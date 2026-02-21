import { Vector3 } from "three";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import {
  Ak47FireController,
  type Ak47FireControllerOptions,
  type Ak47FireUpdateInput,
  type Ak47FireUpdateResult,
  type Ak47ShotEvent,
} from "./Ak47FireController";

const MAG_CAPACITY = 30;
const RESERVE_START = 90;
const RELOAD_TIME_S = 2.45;

export type Ak47AmmoSnapshot = {
  mag: number;
  reserve: number;
  reloading: boolean;
  reloadT01: number;
};

export class Ak47Weapon {
  private readonly fireController: Ak47FireController;
  private readonly ammoSnapshot: Ak47AmmoSnapshot = {
    mag: MAG_CAPACITY,
    reserve: RESERVE_START,
    reloading: false,
    reloadT01: 0,
  };
  private readonly fireInput: Ak47FireUpdateInput = {
    deltaSeconds: 0,
    fireHeld: false,
    shotBudget: 0,
    origin: new Vector3(),
    forward: new Vector3(0, 0, -1),
    grounded: true,
    speedMps: 0,
    world: null as unknown as WorldColliders,
  };

  private mag = MAG_CAPACITY;
  private reserve = RESERVE_START;
  private reloading = false;
  private reloadTimerS = 0;
  private reloadQueued = false;

  // Callbacks for audio events
  onReloadStart: (() => void) | null = null;
  onReloadEnd: (() => void) | null = null;
  onDryFire: (() => void) | null = null;

  // Dry-fire rate-limiting: only click once per trigger pull
  private dryFireCooldownS = 0;
  private wasFireHeld = false;

  constructor(options: Ak47FireControllerOptions) {
    this.fireController = new Ak47FireController(options);
  }

  queueReload(): void {
    this.reloadQueued = true;
  }

  cancelTrigger(): void {
    this.reloadQueued = false;
    this.fireController.cancelTrigger();
  }

  getAmmoSnapshot(): Ak47AmmoSnapshot {
    this.ammoSnapshot.mag = this.mag;
    this.ammoSnapshot.reserve = this.reserve;
    this.ammoSnapshot.reloading = this.reloading;
    this.ammoSnapshot.reloadT01 = this.reloading ? Math.min(1, this.reloadTimerS / RELOAD_TIME_S) : 0;
    return this.ammoSnapshot;
  }

  update(input: Ak47FireUpdateInput, onShot?: (shot: Ak47ShotEvent) => void): Ak47FireUpdateResult {
    const wantsReload = this.reloadQueued;
    this.reloadQueued = false;

    // Dry-fire cooldown tick
    if (this.dryFireCooldownS > 0) {
      this.dryFireCooldownS -= Math.max(0, input.deltaSeconds);
    }

    if (this.reloading) {
      this.reloadTimerS += Math.max(0, input.deltaSeconds);

      // Reload cancel: if trigger is pulled mid-reload and mag has bullets, interrupt
      if (input.fireHeld && !this.wasFireHeld && this.mag > 0) {
        this.reloading = false;
        this.reloadTimerS = 0;
        this.wasFireHeld = input.fireHeld;
        return this.forwardToFireController(input, input.fireHeld, this.mag, onShot);
      }

      if (this.reloadTimerS >= RELOAD_TIME_S) {
        this.completeReload();
        this.onReloadEnd?.();
      }
      this.wasFireHeld = input.fireHeld;
      return this.updateWithoutFiring(input);
    }

    if (wantsReload && this.mag < MAG_CAPACITY && this.startReload()) {
      this.wasFireHeld = input.fireHeld;
      return this.updateWithoutFiring(input);
    }

    if (this.mag === 0 && this.reserve > 0 && this.startReload()) {
      this.wasFireHeld = input.fireHeld;
      return this.updateWithoutFiring(input);
    }

    if (this.mag <= 0) {
      // Dry-fire: click once per trigger pull when mag is empty
      if (input.fireHeld && !this.wasFireHeld && this.dryFireCooldownS <= 0) {
        this.onDryFire?.();
        this.dryFireCooldownS = 0.5; // prevent rapid clicking
      }
      this.wasFireHeld = input.fireHeld;
      return this.updateWithoutFiring(input);
    }

    const fireResult = this.forwardToFireController(input, input.fireHeld, this.mag, onShot);

    if (fireResult.shotsFired > 0) {
      this.mag = Math.max(0, this.mag - fireResult.shotsFired);
      if (this.mag === 0 && this.reserve > 0) {
        this.startReload();
      }
    }

    this.wasFireHeld = input.fireHeld;
    return fireResult;
  }

  private updateWithoutFiring(input: Ak47FireUpdateInput): Ak47FireUpdateResult {
    return this.forwardToFireController(input, false, 0);
  }

  private forwardToFireController(
    input: Ak47FireUpdateInput,
    fireHeld: boolean,
    shotBudget: number,
    onShot?: (shot: Ak47ShotEvent) => void,
  ): Ak47FireUpdateResult {
    this.fireInput.deltaSeconds = input.deltaSeconds;
    this.fireInput.fireHeld = fireHeld;
    this.fireInput.shotBudget = shotBudget;
    this.fireInput.origin = input.origin;
    this.fireInput.forward = input.forward;
    this.fireInput.grounded = input.grounded;
    this.fireInput.speedMps = input.speedMps;
    this.fireInput.world = input.world;
    return this.fireController.update(this.fireInput, onShot);
  }

  private startReload(): boolean {
    if (this.reloading || this.reserve <= 0 || this.mag >= MAG_CAPACITY) return false;

    this.reloading = true;
    this.reloadTimerS = 0;
    this.reloadQueued = false;
    this.fireController.cancelTrigger();
    this.onReloadStart?.();
    return true;
  }

  private completeReload(): void {
    const needed = Math.max(0, MAG_CAPACITY - this.mag);
    const moved = Math.min(needed, this.reserve);
    this.mag += moved;
    this.reserve -= moved;
    this.reloading = false;
    this.reloadTimerS = 0;
  }
}
