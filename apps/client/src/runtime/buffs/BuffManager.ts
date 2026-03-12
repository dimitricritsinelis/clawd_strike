import type { PerspectiveCamera, Scene } from "three";
import { BuffOrb, BuffOrbRenderer } from "./BuffOrb";
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

export type BuffPerfSnapshot = {
  orbCount: number;
  orbCapacity: number;
  orbSpawnMs: number;
  orbUpdateMs: number;
};

export class BuffManager {
  private readonly scene: Scene;
  private orbRenderer: BuffOrbRenderer | null = null;
  private activeBuffs = new Map<BuffType, ActiveBuff>();
  private droppedOrbs: BuffOrb[] = [];

  // Deferred spawn queue to avoid frame-spike on enemy death
  private pendingSpawns: PendingOrbSpawn[] = [];
  private orbSpawnMs = 0;
  private orbUpdateMs = 0;

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
    camera: PerspectiveCamera,
  ): void {
    const updateStartedAt = performance.now();
    this.orbSpawnMs = 0;

    if (this.pendingSpawns.length > 0) {
      const spawnStartedAt = performance.now();
      const spawns = this.pendingSpawns.splice(0, this.pendingSpawns.length);
      this.ensureOrbRenderer();
      for (const spawn of spawns) {
        this.droppedOrbs.push(new BuffOrb(spawn.position, spawn.definition));
      }
      this.orbSpawnMs = performance.now() - spawnStartedAt;
    }

    // Update orbs and check walk-over pickup
    for (let i = this.droppedOrbs.length - 1; i >= 0; i--) {
      const orb = this.droppedOrbs[i]!;
      const alive = orb.update(deltaSeconds);

      if (!alive) {
        // Orb expired
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

    this.orbRenderer?.update(this.droppedOrbs, camera, deltaSeconds);

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

    this.orbUpdateMs = performance.now() - updateStartedAt;
    this.disposeOrbRendererIfIdle();
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
    this.droppedOrbs.length = 0;
    this.pendingSpawns.length = 0;
    this.orbRenderer?.clear();
    this.orbSpawnMs = 0;
    this.orbUpdateMs = 0;
    this.disposeOrbRendererIfIdle();
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
    this.orbRenderer?.dispose();
    this.orbRenderer = null;
  }

  getPerfSnapshot(): BuffPerfSnapshot {
    return {
      orbCount: this.droppedOrbs.length,
      orbCapacity: this.orbRenderer?.getCapacity() ?? 0,
      orbSpawnMs: this.orbSpawnMs,
      orbUpdateMs: this.orbUpdateMs,
    };
  }

  debugSetOrbCount(
    count: number,
    origin: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
  ): number {
    const nextCount = Math.max(0, Math.floor(count));
    this.clearOrbs();
    if (nextCount === 0) return 0;

    const forwardLength = Math.hypot(forward.x, forward.z);
    const normalizedX = forwardLength > 0.001 ? forward.x / forwardLength : 0;
    const normalizedZ = forwardLength > 0.001 ? forward.z / forwardLength : 1;
    const baseAngle = Math.atan2(normalizedZ, normalizedX);
    const orbsPerRing = 8;
    this.ensureOrbRenderer();

    for (let index = 0; index < nextCount; index += 1) {
      const ring = Math.floor(index / orbsPerRing);
      const ringIndex = index % orbsPerRing;
      const ringCount = Math.min(orbsPerRing, nextCount - ring * orbsPerRing);
      const span = ringCount <= 1 ? 0 : Math.min(Math.PI * 0.9, Math.PI * (0.35 + ringCount * 0.06));
      const angle = ringCount <= 1
        ? baseAngle
        : baseAngle - span * 0.5 + (span * ringIndex) / Math.max(1, ringCount - 1);
      const distance = 3.4 + ring * 1.2;
      const type = BUFF_TYPES[index % BUFF_TYPES.length]!;
      this.droppedOrbs.push(new BuffOrb({
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y,
        z: origin.z + Math.sin(angle) * distance,
      }, BUFF_DEFINITIONS[type]));
    }

    return this.droppedOrbs.length;
  }

  private ensureOrbRenderer(): BuffOrbRenderer {
    if (!this.orbRenderer) {
      this.orbRenderer = new BuffOrbRenderer(this.scene);
    }
    return this.orbRenderer;
  }

  private disposeOrbRendererIfIdle(): void {
    if (this.orbRenderer && this.droppedOrbs.length === 0 && this.pendingSpawns.length === 0) {
      this.orbRenderer.dispose();
      this.orbRenderer = null;
    }
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
