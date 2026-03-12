import type { Scene } from "three";
import { BuffOrb } from "./BuffOrb";
import {
  type BuffType,
  type BuffDefinition,
  BUFF_DEFINITIONS,
  BUFF_TYPES,
  ORB_PICKUP_RADIUS_M,
} from "./BuffTypes";
import { rayVsAabb } from "../sim/collision/rayVsAabb";

type ActiveBuff = {
  remainingS: number;
  durationS: number;
};

type PendingOrbSpawn = {
  position: { x: number; y: number; z: number };
  definition: BuffDefinition;
};

export type ActiveBuffSnapshot = {
  type: BuffType;
  remainingS: number;
  durationS: number;
};

export class BuffManager {
  private readonly scene: Scene;
  private activeBuffs = new Map<BuffType, ActiveBuff>();
  private droppedOrbs: BuffOrb[] = [];

  // Deferred spawn queue to avoid frame-spike on enemy death
  private pendingSpawns: PendingOrbSpawn[] = [];

  // Headshot tracking for Rallying Cry
  private waveKills = 0;
  private waveHeadshots = 0;
  private previousWaveWasPerfectHeadshots = false;
  private _rallyingCryActive = false;

  // Callbacks
  private onBuffActivated: ((type: BuffType) => void) | null = null;
  private onBuffExpired: ((type: BuffType) => void) | null = null;
  private onBuffPickedUp: ((type: BuffType) => void) | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  setOnBuffActivated(cb: (type: BuffType) => void): void {
    this.onBuffActivated = cb;
  }

  setOnBuffExpired(cb: (type: BuffType) => void): void {
    this.onBuffExpired = cb;
  }

  setOnBuffPickedUp(cb: (type: BuffType) => void): void {
    this.onBuffPickedUp = cb;
  }

  /**
   * Called when any enemy dies. Every enemy drops a random buff orb.
   */
  onEnemyDeath(_enemyIndex: number, deathPosition: { x: number; y: number; z: number }): void {
    const randomType = BUFF_TYPES[Math.floor(Math.random() * BUFF_TYPES.length)]!;
    const def = BUFF_DEFINITIONS[randomType];
    // Defer orb creation to next update() to avoid frame spike during death processing
    this.pendingSpawns.push({
      position: { x: deathPosition.x, y: deathPosition.y, z: deathPosition.z },
      definition: def,
    });
  }

  /**
   * Record a kill for headshot tracking.
   */
  recordKill(isHeadshot: boolean): void {
    this.waveKills++;
    if (isHeadshot) this.waveHeadshots++;
  }

  /**
   * Check if previous wave had 10/10 headshots. Call at wave start.
   */
  checkRallyingCry(): boolean {
    return this.previousWaveWasPerfectHeadshots;
  }

  /**
   * Activate all 4 buffs (Rallying Cry of the Dragonslayer).
   */
  activateAllBuffs(): void {
    for (const type of BUFF_TYPES) {
      this.activateBuff(type);
    }
  }

  /**
   * Activate Rallying Cry — all 4 buffs with the rallying cry flag
   * so the HUD shows only the Rallying Cry icon (not individual buffs).
   */
  activateRallyingCry(): void {
    this._rallyingCryActive = true;
    this.activateAllBuffs();
  }

  /**
   * Called at wave start. Finalize previous wave stats and reset.
   */
  onNewWave(): void {
    // Check if previous wave was 10/10 headshots
    this.previousWaveWasPerfectHeadshots = this.waveKills >= 10 && this.waveHeadshots >= 10;
    this.waveKills = 0;
    this.waveHeadshots = 0;
  }

  /**
   * Per-frame update. Ticks orbs, checks pickup, ticks buff timers.
   */
  update(
    deltaSeconds: number,
    playerPosition: { x: number; y: number; z: number },
  ): void {
    // Process deferred orb spawns (one per frame to spread cost)
    if (this.pendingSpawns.length > 0) {
      const spawn = this.pendingSpawns.shift()!;
      const orb = new BuffOrb(this.scene, spawn.position, spawn.definition);
      this.droppedOrbs.push(orb);
    }

    // Update orbs and check walk-over pickup
    for (let i = this.droppedOrbs.length - 1; i >= 0; i--) {
      const orb = this.droppedOrbs[i]!;
      const alive = orb.update(deltaSeconds);

      if (!alive) {
        // Orb expired
        orb.dispose(this.scene);
        this.droppedOrbs.splice(i, 1);
        continue;
      }

      // Walk-over pickup check
      const orbPos = orb.getPosition();
      const dx = playerPosition.x - orbPos.x;
      const dz = playerPosition.z - orbPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < ORB_PICKUP_RADIUS_M * ORB_PICKUP_RADIUS_M) {
        const dy = Math.abs(playerPosition.y - orbPos.y);
        if (dy < 2.0) {
          this.collectOrbAtIndex(i);
          continue;
        }
      }
    }

    // Tick active buff timers
    for (const [type, buff] of this.activeBuffs) {
      buff.remainingS -= deltaSeconds;
      if (buff.remainingS <= 0) {
        this.activeBuffs.delete(type);
        this.onBuffExpired?.(type);
      }
    }

    // Clear rallying cry flag when all buffs have expired
    if (this._rallyingCryActive && this.activeBuffs.size === 0) {
      this._rallyingCryActive = false;
    }
  }

  /**
   * Raycast check against all orbs. Returns closest hit.
   */
  checkRaycastHit(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number,
  ): { hit: true; orbIndex: number; distance: number } | { hit: false } {
    let closestDist = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < this.droppedOrbs.length; i++) {
      const orb = this.droppedOrbs[i]!;
      const dist = rayVsAabb(ox, oy, oz, dx, dy, dz, maxDist, orb.getAabb());
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    if (closestIndex >= 0 && closestDist < maxDist) {
      return { hit: true, orbIndex: closestIndex, distance: closestDist };
    }
    return { hit: false };
  }

  /**
   * Collect orb by index. Removes from scene, activates buff.
   */
  collectOrbAtIndex(index: number): BuffType | null {
    if (index < 0 || index >= this.droppedOrbs.length) return null;
    const orb = this.droppedOrbs[index]!;
    const buffType = orb.getBuffType();
    orb.dispose(this.scene);
    this.droppedOrbs.splice(index, 1);
    this.activateBuff(buffType);
    this.onBuffPickedUp?.(buffType);
    return buffType;
  }

  isBuffActive(type: BuffType): boolean {
    return this.activeBuffs.has(type);
  }

  getActiveBuffs(): ActiveBuffSnapshot[] {
    const result: ActiveBuffSnapshot[] = [];
    for (const [type, buff] of this.activeBuffs) {
      result.push({ type, remainingS: buff.remainingS, durationS: buff.durationS });
    }
    return result;
  }

  /** Check if Rallying Cry is active (explicitly activated via activateRallyingCry) */
  isRallyingCryActive(): boolean {
    return this._rallyingCryActive;
  }

  clearOrbs(): void {
    for (const orb of this.droppedOrbs) {
      orb.dispose(this.scene);
    }
    this.droppedOrbs.length = 0;
    this.pendingSpawns.length = 0;
  }

  clearAllBuffs(): void {
    for (const [type] of this.activeBuffs) {
      this.onBuffExpired?.(type);
    }
    this.activeBuffs.clear();
    this._rallyingCryActive = false;
    this.clearOrbs();
  }

  dispose(): void {
    this.clearAllBuffs();
  }

  private activateBuff(type: BuffType): void {
    const def = BUFF_DEFINITIONS[type];
    const existing = this.activeBuffs.get(type);
    if (existing) {
      // Refresh timer
      existing.remainingS = def.durationS;
      existing.durationS = def.durationS;
    } else {
      this.activeBuffs.set(type, {
        remainingS: def.durationS,
        durationS: def.durationS,
      });
      this.onBuffActivated?.(type);
    }
  }
}
