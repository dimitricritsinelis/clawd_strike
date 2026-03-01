import { Scene, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WeaponAudio } from "../audio/WeaponAudio";
import { PLAYER_HEIGHT_M, PLAYER_WIDTH_M } from "../sim/PlayerController";
import { rayVsAabb } from "../sim/collision/rayVsAabb";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed, resolveRuntimeSeed } from "../utils/Rng";
import {
  EnemyController,
  ENEMY_HALF_WIDTH_M,
  type EnemyAabb,
  type EnemyId,
  type EnemyTarget,
} from "./EnemyController";
import { EnemyVisual } from "./EnemyVisual";

const PLAYER_HALF_WIDTH_M = PLAYER_WIDTH_M * 0.5;

/** How much position jitter (metres) to add to each spawn point per axis. */
const SPAWN_JITTER_M = 1.5;
/** Seconds after the last enemy dies before the next wave spawns. */
const WAVE_RESPAWN_DELAY_S = 5.0;

const ENEMY_SPAWN_CONFIG = [
  { name: "Ghost", x:  4.75, z: 20 },  // SH_W center   (x=1.5–8,    z=10–72)
  { name: "Viper", x: 45.25, z: 20 },  // SH_E center   (x=42–48.5,  z=10–72)
  { name: "Wolf",  x: 27,    z: 41 },  // BZ_M2_JOG ctr (x=22.75–31.25, z=32–50)
  { name: "Raven", x:  4.75, z: 45 },  // SH_W mid
  { name: "Hawk",  x: 45.25, z: 45 },  // SH_E mid
  { name: "Cobra", x: 25,    z: 59 },  // BZ_M3 center  (x=20.25–29.75, z=50–68)
  { name: "Fox",   x: 45.25, z: 60 },  // SH_E north
  { name: "Eagle", x: 25,    z: 75 },  // SPAWN_B center (x=14–36, z=68–82)
  { name: "Lynx",  x: 20,    z: 75 },  // SPAWN_B west
] as const;

export type EnemyHitResult =
  | { hit: true; enemyId: string; distance: number; hitX: number; hitY: number; hitZ: number }
  | { hit: false };

export class EnemyManager {
  private readonly scene: Scene;
  private readonly sharedLoader: GLTFLoader;
  private controllers: EnemyController[] = [];
  private visuals: EnemyVisual[] = [];
  private weaponAudio: WeaponAudio | null = null;
  private onEnemyKilled: ((name: string, isHeadshot: boolean) => void) | null = null;

  // Tracks which indices have started their death fade (stable by array index)
  private readonly deathFadeStarted = new Set<number>();

  // Wave system
  private waveNumber = 0;
  private waveRespawnTimer: number | null = null; // null = not counting down
  private worldCollidersRef: WorldColliders | null = null;
  private onNewWave: ((wave: number) => void) | null = null;

  // Pre-allocated scratch structures
  private readonly aabbScratch: EnemyAabb[] = [];
  private readonly targetPool: EnemyTarget[];
  private readonly targetsScratch: EnemyTarget[] = [];

  // Player AABB — updated every frame, used by enemy fire checks
  private readonly playerAabb: EnemyAabb = {
    id: "player",
    minX: 0, minY: 0, minZ: 0,
    maxX: 0, maxY: 0, maxZ: 0,
  };

  // Player health delta accumulated during this update frame
  private playerHealthDelta = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.sharedLoader = new GLTFLoader();
    // Player + every configured enemy target (updated in-place every frame).
    this.targetPool = Array.from({ length: ENEMY_SPAWN_CONFIG.length + 1 }, () => ({
      id: "",
      position: { x: 0, y: 0, z: 0 },
      health: 0,
    }));
    this.targetPool[0]!.id = "player";
  }

  private readonly handleEnemyShot = (targetId: string, damage: number): void => {
    this.resolveEnemyShot(targetId, damage);
  };

  private readonly handleFootstep = (distanceToPlayer: number): void => {
    const audio = this.weaponAudio;
    if (!audio) return;
    // Normalise distance: max audible range ~20m
    const distNorm = Math.min(1, distanceToPlayer / 20);
    audio.playEnemyFootstep(distNorm);
  };

  setAudio(audio: WeaponAudio): void {
    this.weaponAudio = audio;
  }

  setKillCallback(cb: (name: string, isHeadshot: boolean) => void): void {
    this.onEnemyKilled = cb;
  }

  setNewWaveCallback(cb: (wave: number) => void): void {
    this.onNewWave = cb;
  }

  getWaveNumber(): number {
    return this.waveNumber;
  }

  /** Returns true if all enemies in the current wave are dead. */
  allDead(): boolean {
    return this.controllers.length > 0 && this.controllers.every((c) => c.isDead());
  }

  /**
   * Returns the seconds remaining until the next wave spawns,
   * or null if no countdown is active.
   */
  getWaveCountdownS(): number | null {
    return this.waveRespawnTimer;
  }

  spawn(worldColliders: WorldColliders): void {
    this.worldCollidersRef = worldColliders;

    this.waveNumber += 1;
    this.waveRespawnTimer = null;
    this.deathFadeStarted.clear();
    this.playerHealthDelta = 0;

    // Safety fallback: if config size changed between waves, recreate from scratch once.
    if (
      this.controllers.length > 0 &&
      (this.controllers.length !== ENEMY_SPAWN_CONFIG.length || this.visuals.length !== ENEMY_SPAWN_CONFIG.length)
    ) {
      this.dispose(this.scene);
    }

    const mapSeed = resolveRuntimeSeed("bazaar-map", null);
    // Use a per-wave seed so each wave has different jitter
    const waveSeed = deriveSubSeed(mapSeed, `wave_${this.waveNumber}`);
    const jitterRng = new DeterministicRng(waveSeed);
    const pb = worldColliders.playableBounds;

    if (this.controllers.length === 0) {
      for (const config of ENEMY_SPAWN_CONFIG) {
        const id: EnemyId = `enemy_${config.name.toLowerCase()}`;
        const seed = deriveSubSeed(waveSeed, id);
        const { spawnX, spawnZ } = this.getJitteredSpawn(config.x, config.z, jitterRng, pb);
        const controller = new EnemyController(id, config.name, spawnX, spawnZ, seed);
        const visual = new EnemyVisual(config.name, this.scene, this.sharedLoader);
        this.controllers.push(controller);
        this.visuals.push(visual);
      }
      return;
    }

    for (let i = 0; i < ENEMY_SPAWN_CONFIG.length; i += 1) {
      const config = ENEMY_SPAWN_CONFIG[i]!;
      const ctrl = this.controllers[i]!;
      const visual = this.visuals[i]!;
      const seed = deriveSubSeed(waveSeed, ctrl.id);
      const { spawnX, spawnZ } = this.getJitteredSpawn(config.x, config.z, jitterRng, pb);
      ctrl.reset(spawnX, spawnZ, seed);
      visual.reset();
    }
  }

  private getJitteredSpawn(
    baseX: number,
    baseZ: number,
    jitterRng: DeterministicRng,
    playableBounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  ): { spawnX: number; spawnZ: number } {
    const jX = jitterRng.range(-SPAWN_JITTER_M, SPAWN_JITTER_M);
    const jZ = jitterRng.range(-SPAWN_JITTER_M, SPAWN_JITTER_M);
    const margin = ENEMY_HALF_WIDTH_M + 0.5;
    return {
      spawnX: Math.max(playableBounds.minX + margin, Math.min(playableBounds.maxX - margin, baseX + jX)),
      spawnZ: Math.max(playableBounds.minZ + margin, Math.min(playableBounds.maxZ - margin, baseZ + jZ)),
    };
  }

  update(
    deltaSeconds: number,
    playerPos: { x: number; y: number; z: number },
    playerHealth: number,
    worldColliders: WorldColliders,
  ): void {
    this.playerHealthDelta = 0;

    // Update player AABB for enemy fire checks
    this.playerAabb.minX = playerPos.x - PLAYER_HALF_WIDTH_M;
    this.playerAabb.minY = playerPos.y;
    this.playerAabb.minZ = playerPos.z - PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxX = playerPos.x + PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxY = playerPos.y + PLAYER_HEIGHT_M;
    this.playerAabb.maxZ = playerPos.z + PLAYER_HALF_WIDTH_M;

    // Rebuild AABB scratch (living enemies only)
    this.aabbScratch.length = 0;
    for (const ctrl of this.controllers) {
      if (!ctrl.isDead()) {
        this.aabbScratch.push(ctrl.getAabb());
      }
    }
    // Add player AABB so enemies can shoot the player
    this.aabbScratch.push(this.playerAabb);

    // Rebuild targets scratch: player + living enemies (in-place updates, no per-frame objects)
    let targetCount = 1;
    const playerTarget = this.targetPool[0]!;
    playerTarget.id = "player";
    playerTarget.position = playerPos;
    playerTarget.health = playerHealth;
    this.targetsScratch[0] = playerTarget;
    for (const ctrl of this.controllers) {
      if (!ctrl.isDead()) {
        const target = this.targetPool[targetCount]!;
        target.id = ctrl.id;
        target.position = ctrl.getPosition();
        target.health = ctrl.getHealth();
        this.targetsScratch[targetCount] = target;
        targetCount += 1;
      }
    }
    this.targetsScratch.length = targetCount;

    // Step each living controller
    const onFootstep = this.weaponAudio ? this.handleFootstep : undefined;
    for (const ctrl of this.controllers) {
      if (ctrl.isDead()) continue;
      ctrl.step(
        deltaSeconds,
        this.targetsScratch,
        worldColliders,
        this.aabbScratch,
        this.handleEnemyShot,
        onFootstep,
      );
    }

    // Wave respawn: once all enemies are dead, count down then spawn next wave
    if (this.allDead()) {
      if (this.waveRespawnTimer === null) {
        this.waveRespawnTimer = WAVE_RESPAWN_DELAY_S;
      } else {
        this.waveRespawnTimer -= deltaSeconds;
        if (this.waveRespawnTimer <= 0 && this.worldCollidersRef) {
          this.spawn(this.worldCollidersRef);
          this.onNewWave?.(this.waveNumber);
        }
      }
    }

    // Sync visuals, death fades, and per-shot FX
    for (let i = 0; i < this.controllers.length; i++) {
      const ctrl = this.controllers[i]!;
      const visual = this.visuals[i]!;
      const pos = ctrl.getPosition();

      if (ctrl.isDead()) {
        // Newly dead: start fade exactly once
        if (!this.deathFadeStarted.has(i)) {
          this.deathFadeStarted.add(i);
          visual.startDeathFade();
          this.onEnemyKilled?.(ctrl.name, ctrl.wasLastHitHeadshot());
        }
        visual.updateDeathFade(deltaSeconds);
        continue; // no muzzle FX for dead enemies
      }

      visual.update(pos.x, pos.y, pos.z, ctrl.getYaw(), true);

      if (ctrl.isFiring()) {
        visual.triggerShotFx();
        this.weaponAudio?.playAk47ShotQuiet(0.25);
      }
      visual.updateFx(deltaSeconds);
    }
  }

  applyDamageToEnemy(enemyId: string, damage: number, isHeadshot = false): void {
    for (const ctrl of this.controllers) {
      if (ctrl.id === enemyId) {
        ctrl.applyDamage(damage, isHeadshot);
        return;
      }
    }
  }

  getPlayerHealthDelta(): number {
    return this.playerHealthDelta;
  }

  checkRaycastHit(origin: Vector3, dir: Vector3, maxDist: number): EnemyHitResult {
    let bestDist = maxDist;
    let bestId: string | null = null;

    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;

    for (const aabb of this.aabbScratch) {
      // Only check actual enemy AABBs (not the player AABB — player can't shoot themselves)
      if (aabb.id === "player") continue;
      const t = rayVsAabb(ox, oy, oz, dx, dy, dz, maxDist, aabb);
      if (t < bestDist) {
        bestDist = t;
        bestId = aabb.id;
      }
    }

    if (bestId === null) return { hit: false };

    return {
      hit: true,
      enemyId: bestId,
      distance: bestDist,
      hitX: ox + dx * bestDist,
      hitY: oy + dy * bestDist,
      hitZ: oz + dz * bestDist,
    };
  }

  dispose(scene: Scene): void {
    for (const visual of this.visuals) {
      visual.dispose(scene);
    }
    this.visuals = [];
    this.controllers = [];
    this.aabbScratch.length = 0;
    this.targetsScratch.length = 0;
    this.deathFadeStarted.clear();
    this.waveRespawnTimer = null;
  }

  /** Full teardown — resets wave counter too. */
  fullDispose(scene: Scene): void {
    this.dispose(scene);
    this.waveNumber = 0;
    this.worldCollidersRef = null;
  }

  private resolveEnemyShot(targetId: string, damage: number): void {
    if (targetId === "player") {
      this.playerHealthDelta += damage;
      return;
    }
    for (const ctrl of this.controllers) {
      if (ctrl.id === targetId) {
        ctrl.applyDamage(damage);
        return;
      }
    }
  }
}
