import { AmbientLight, Color, DirectionalLight, FogExp2, HemisphereLight, Object3D, PerspectiveCamera, Scene, Vector3 } from "three";
import { AnchorsDebug, type AnchorsDebugState } from "../debug/AnchorsDebug";
import { Hud } from "../debug/Hud";
import { EnemyManager, type EnemyHitResult } from "../enemies/EnemyManager";
import type { WeaponAudio } from "../audio/WeaponAudio";
import { buildBlockout } from "../map/buildBlockout";
import { buildProps, type PropsBuildStats } from "../map/buildProps";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import type { FloorMaterialLibrary } from "../render/materials/FloorMaterialLibrary";
import type { RuntimeAnchorsSpec, RuntimeBlockoutSpec } from "../map/types";
import {
  PLAYER_EYE_HEIGHT_M,
  PlayerController,
  type PlayerInputState,
} from "../sim/PlayerController";
import { type RuntimeColliderAabb, WorldColliders } from "../sim/collision/WorldColliders";
import { resolveRuntimeSeed } from "../utils/Rng";
import { disposeObjectRoot } from "../utils/disposeObjectRoot";
import type {
  RuntimeFloorMode,
  RuntimeFloorQuality,
  RuntimeLightingPreset,
  RuntimePropChaosOptions,
  RuntimeSpawnId,
} from "../utils/UrlParams";
import type { Ak47ShotEvent } from "../weapons/Ak47FireController";
import { Ak47Weapon, type Ak47AmmoSnapshot } from "../weapons/Ak47Weapon";

const DEFAULT_FOV = 75;
const LOOK_SENSITIVITY = 0.002;
const MIN_PITCH = -(Math.PI / 2) + 0.001;
const MAX_PITCH = (Math.PI / 2) - 0.001;
const RAD_TO_DEG = 180 / Math.PI;

// ── Camera shake constants ────────────────────────────────────────────────────
/** Shake impulse added per bullet fired while trigger held (metres). */
const SHAKE_FIRE_IMPULSE = 0.008;
/** Maximum accumulated fire-shake amplitude (metres). */
const SHAKE_FIRE_MAX = 0.028;
/** Damage-hit shake impulse (metres) — scales with damage fraction. */
const SHAKE_DAMAGE_BASE = 0.045;
/** Spring stiffness for shake recovery. */
const SHAKE_STIFFNESS = 180;
/** Spring damping for shake recovery. */
const SHAKE_DAMPING = 18;

export type CameraPose = {
  pos: {
    x: number;
    y: number;
    z: number;
  };
  lookAt: {
    x: number;
    y: number;
    z: number;
  };
  fovDeg: number;
};

export type WeaponShotPayload = Ak47ShotEvent;

type GameOptions = {
  mapId: string;
  seedOverride: number | null;
  propChaos: RuntimePropChaosOptions;
  freezeInput?: boolean;
  spawn?: RuntimeSpawnId;
  debug?: boolean;
  highVis?: boolean;
  floorMode: RuntimeFloorMode;
  floorQuality: RuntimeFloorQuality;
  lightingPreset: RuntimeLightingPreset;
  floorMaterials: FloorMaterialLibrary | null;
  onTogglePerfHud?: () => void;
  mountEl?: HTMLElement;
  anchorsDebug?: {
    showMarkers: boolean;
    showLabels: boolean;
    anchorTypes: readonly string[];
  };
  onWeaponShot?: (shot: WeaponShotPayload) => void;
};

type SpawnPose = {
  x: number;
  z: number;
  yawRad: number;
};

export class Game {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;

  private readonly pressedKeys = new Set<string>();
  private readonly lookDirection = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly playerController = new PlayerController();
  private weapon = new Ak47Weapon({ seed: 1 });
  private readonly frameInput: PlayerInputState = {
    forward: 0,
    right: 0,
    walkHeld: false,
    jumpPressed: false,
  };

  private yaw = 0;
  private pitch = 0;
  private pointerLocked = false;
  private fireHeld = false;
  private freezeInput = false;
  private jumpQueued = false;
  private spawn: RuntimeSpawnId = "A";
  private mapId = "bazaar-map";
  private seedOverride: number | null = null;
  private highVis = false;
  private lightingPreset: RuntimeLightingPreset = "golden";
  private floorMode: RuntimeFloorMode = "blockout";
  private floorQuality: RuntimeFloorQuality = "2k";
  private floorMaterials: FloorMaterialLibrary | null = null;
  private propChaos: RuntimePropChaosOptions = {
    profile: "subtle",
    jitter: null,
    cluster: null,
    density: null,
  };
  private blockoutSpec: RuntimeBlockoutSpec | null = null;
  private anchorsSpec: RuntimeAnchorsSpec | null = null;
  private blockoutRoot: Object3D | null = null;
  private propsRoot: Object3D | null = null;
  private worldColliders: WorldColliders | null = null;
  private runtimeColliders: RuntimeColliderAabb[] = [];
  private propColliders: RuntimeColliderAabb[] = [];
  private propStats: PropsBuildStats = {
    seed: 1,
    profile: "subtle",
    jitter: 0.28,
    cluster: 0.45,
    density: 0.55,
    totalAnchors: 0,
    candidatesTotal: 0,
    collidersPlaced: 0,
    rejectedClearZone: 0,
    rejectedBounds: 0,
    rejectedGapRule: 0,
    visualOnlyLandmarks: 0,
    stallFillersPlaced: 0,
  };
  private enemyManager: EnemyManager | null = null;
  private playerHealth = 100;
  private isDead = false;
  private spawnPoseCache: SpawnPose | null = null;
  private wasGrounded = true;
  private onLandingCallback: (() => void) | null = null;
  private hud: Hud | null = null;
  private anchorsDebug: AnchorsDebug | null = null;
  private debugHotkeysEnabled = false;
  private onTogglePerfHud: (() => void) | null = null;
  private onWeaponShot: ((shot: WeaponShotPayload) => void) | null = null;
  private weaponLoaded = false;
  private weaponAlignDot = -1;
  private weaponAlignAngleDeg = 180;
  private weaponShotsFiredLastFrame = 0;
  private weaponShotIndex = 0;
  private weaponSpreadDeg = 0;
  private weaponBloomDeg = 0;
  private weaponLastShotRecoilPitchDeg = 0;
  private weaponLastShotRecoilYawDeg = 0;

  // Camera shake: spring state for X and Y offset
  private shakeX = 0;
  private shakeXVel = 0;
  private shakeY = 0;
  private shakeYVel = 0;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.debugHotkeysEnabled) {
      if (event.code === "F5") {
        this.onTogglePerfHud?.();
        event.preventDefault();
        return;
      }
      if (event.code === "F2" && this.anchorsDebug) {
        this.anchorsDebug.toggleMarkers();
        event.preventDefault();
        return;
      }
      if (event.code === "F3" && this.anchorsDebug) {
        this.anchorsDebug.toggleLabels();
        event.preventDefault();
        return;
      }
    }

    this.pressedKeys.add(event.code);
    if (event.code === "Space" && !event.repeat) {
      this.jumpQueued = true;
    }
    if (
      event.code === "KeyR" &&
      !event.repeat &&
      this.pointerLocked &&
      !this.freezeInput
    ) {
      this.weapon.queueReload();
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly onWindowBlur = (): void => {
    this.resetInputState();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      this.resetInputState();
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (!this.pointerLocked || this.freezeInput) return;
    this.fireHeld = true;
    event.preventDefault();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.fireHeld = false;
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    event.preventDefault();
  };

  constructor(options: GameOptions) {
    this.scene = new Scene();

    this.camera = new PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 1500);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, PLAYER_EYE_HEIGHT_M, 8);

    this.mapId = options.mapId;
    this.seedOverride = options.seedOverride;
    this.highVis = options.highVis ?? false;
    this.lightingPreset = options.lightingPreset;
    this.floorMode = options.floorMode;
    this.floorQuality = options.floorQuality;
    this.floorMaterials = options.floorMaterials;
    this.propChaos = options.propChaos;
    this.freezeInput = options.freezeInput ?? false;
    this.spawn = options.spawn ?? "A";
    this.debugHotkeysEnabled = options.debug ?? false;
    this.onTogglePerfHud = options.onTogglePerfHud ?? null;
    this.onWeaponShot = options.onWeaponShot ?? null;

    this.setupLighting();
    this.setupInitialView();
    this.enemyManager = new EnemyManager(this.scene);

    const weaponSeed = resolveRuntimeSeed(this.mapId, this.seedOverride);
    this.weapon = new Ak47Weapon({ seed: weaponSeed });

    const mountEl = options.mountEl ?? document.querySelector<HTMLElement>("#runtime-root") ?? document.querySelector<HTMLElement>("#app");
    const anchorsDebugOptions = options.anchorsDebug ?? {
      showMarkers: false,
      showLabels: false,
      anchorTypes: [],
    };

    if (mountEl) {
      this.anchorsDebug = new AnchorsDebug({
        mountEl,
        scene: this.scene,
        showMarkers: anchorsDebugOptions.showMarkers,
        showLabels: anchorsDebugOptions.showLabels,
        anchorTypes: anchorsDebugOptions.anchorTypes,
      });
    }

    if (options.debug) {
      if (mountEl) {
        this.hud = new Hud(mountEl);
      }
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setViewportSize(width: number, height: number): void {
    this.anchorsDebug?.setViewport(width, height);
  }

  setPointerLocked(locked: boolean): void {
    this.pointerLocked = locked;
    if (!locked) {
      this.resetInputState();
    }
  }

  setFreezeInput(freeze: boolean): void {
    this.freezeInput = freeze;
    if (freeze) {
      this.fireHeld = false;
      this.weapon.cancelTrigger();
    }
  }

  setCameraPose(pose: CameraPose): void {
    this.camera.fov = pose.fovDeg;
    this.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    this.camera.updateProjectionMatrix();
    this.syncAnglesFromCamera();
  }

  setBlockoutSpec(spec: RuntimeBlockoutSpec): void {
    this.blockoutSpec = spec;
    this.rebuildWorld();
  }

  setAnchorsSpec(spec: RuntimeAnchorsSpec): void {
    this.anchorsSpec = spec;
    this.anchorsDebug?.setAnchors(spec);
    this.rebuildWorld();
  }

  getColliderCount(): number {
    return this.runtimeColliders.length;
  }

  getPropsBuildStats(): PropsBuildStats {
    return this.propStats;
  }

  onMouseDelta(deltaX: number, deltaY: number): void {
    if (!this.pointerLocked || this.freezeInput) return;

    const nextYaw = this.yaw - deltaX * LOOK_SENSITIVITY;
    const nextPitch = this.pitch - deltaY * LOOK_SENSITIVITY;
    this.setLookAngles(nextYaw, nextPitch);
  }

  update(deltaSeconds: number): void {
    if (this.worldColliders) {
      this.updateInputState();
      this.playerController.step(deltaSeconds, this.frameInput, this.yaw);
      // Detect landing transition: airborne → grounded
      const nowGrounded = this.playerController.getGrounded();
      if (!this.wasGrounded && nowGrounded) {
        this.onLandingCallback?.();
        // Add a landing camera bob via damage shake channel
        this.shakeYVel -= 0.06;
      }
      this.wasGrounded = nowGrounded;
      this.updateCameraFromPlayer();

      this.camera.getWorldDirection(this.cameraForward);
      const fireResult = this.weapon.update(
        {
          deltaSeconds,
          fireHeld: this.fireHeld && this.pointerLocked && !this.freezeInput,
          origin: this.camera.position,
          forward: this.cameraForward,
          grounded: this.playerController.getGrounded(),
          speedMps: this.playerController.getHorizontalSpeedMps(),
          world: this.worldColliders,
        },
        this.onWeaponShot ?? undefined,
      );

      this.weaponShotsFiredLastFrame = fireResult.shotsFired;
      this.weaponShotIndex = fireResult.shotIndex;
      this.weaponSpreadDeg = fireResult.spreadDeg;
      this.weaponBloomDeg = fireResult.bloomDeg;
      this.weaponLastShotRecoilPitchDeg = fireResult.lastShotRecoilPitchDeg;
      this.weaponLastShotRecoilYawDeg = fireResult.lastShotRecoilYawDeg;

      if (fireResult.recoilPitchRad !== 0 || fireResult.recoilYawRad !== 0) {
        this.setLookAngles(this.yaw + fireResult.recoilYawRad, this.pitch + fireResult.recoilPitchRad);
      }

      // ── Fire shake: add impulse per shot, capped at SHAKE_FIRE_MAX ─────────
      if (fireResult.shotsFired > 0) {
        const impulse = Math.min(SHAKE_FIRE_IMPULSE * fireResult.shotsFired, SHAKE_FIRE_MAX);
        this.shakeXVel += (Math.random() * 2 - 1) * impulse;
        this.shakeYVel += (Math.random() * 2 - 1) * impulse;
      }

      if (this.enemyManager) {
        this.enemyManager.update(
          deltaSeconds,
          this.playerController.getPosition(),
          this.playerHealth,
          this.worldColliders,
        );
        const delta = this.enemyManager.getPlayerHealthDelta();
        this.playerHealth = Math.max(0, this.playerHealth - delta);
        // ── Damage shake: proportional to damage taken ──────────────────────
        if (delta > 0) {
          const damageNorm = Math.min(1, delta / 25); // 25 = one shot
          const impulse = SHAKE_DAMAGE_BASE * damageNorm;
          this.shakeXVel += (Math.random() * 2 - 1) * impulse;
          this.shakeYVel -= Math.abs(impulse) * 0.6; // bias upward jolt on damage
        }
        if (this.playerHealth <= 0 && !this.isDead) {
          this.isDead = true;
          this.setFreezeInput(true);
        }
      }

      // ── Shake spring update ───────────────────────────────────────────────
      const shakeAccelX = -this.shakeX * SHAKE_STIFFNESS - this.shakeXVel * SHAKE_DAMPING;
      const shakeAccelY = -this.shakeY * SHAKE_STIFFNESS - this.shakeYVel * SHAKE_DAMPING;
      this.shakeXVel += shakeAccelX * deltaSeconds;
      this.shakeYVel += shakeAccelY * deltaSeconds;
      this.shakeX += this.shakeXVel * deltaSeconds;
      this.shakeY += this.shakeYVel * deltaSeconds;

      // Apply shake as a small positional offset to the camera (after updateCameraFromPlayer)
      this.camera.position.x += this.shakeX;
      this.camera.position.y += this.shakeY;
    }
    this.anchorsDebug?.update(this.camera);

    if (this.hud) {
      const position = this.playerController.getPosition();
      this.hud.update({
        x: position.x,
        y: position.y,
        z: position.z,
        yawDeg: this.yaw * RAD_TO_DEG,
        pitchDeg: this.pitch * RAD_TO_DEG,
        grounded: this.playerController.getGrounded(),
        speedMps: this.playerController.getHorizontalSpeedMps(),
        propStats: this.propStats,
        weaponStats: {
          loaded: this.weaponLoaded,
          dot: this.weaponAlignDot,
          angleDeg: this.weaponAlignAngleDeg,
          shotsFired: this.weaponShotsFiredLastFrame,
          shotIndex: this.weaponShotIndex,
          spreadDeg: this.weaponSpreadDeg,
          bloomDeg: this.weaponBloomDeg,
          lastShotRecoilPitchDeg: this.weaponLastShotRecoilPitchDeg,
          lastShotRecoilYawDeg: this.weaponLastShotRecoilYawDeg,
        },
      });
    }
  }

  teardown(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resetInputState();
    this.hud?.dispose();
    this.hud = null;
    if (this.anchorsDebug) {
      this.anchorsDebug.dispose(this.scene);
      this.anchorsDebug = null;
    }
    this.enemyManager?.dispose(this.scene);
    this.enemyManager = null;
    this.clearBlockout();
    this.clearProps();
  }

  getGrounded(): boolean {
    return this.playerController.getGrounded();
  }

  getSpeedMps(): number {
    return this.playerController.getHorizontalSpeedMps();
  }

  getYawPitchDeg(): { yaw: number; pitch: number } {
    return {
      yaw: this.yaw * RAD_TO_DEG,
      pitch: this.pitch * RAD_TO_DEG,
    };
  }

  getAnchorsDebugState(): AnchorsDebugState {
    if (!this.anchorsDebug) {
      return {
        markersVisible: false,
        labelsVisible: false,
        totalAnchors: 0,
        filteredAnchors: 0,
        shownLabels: 0,
        filterTypes: [],
      };
    }
    return this.anchorsDebug.getState();
  }

  setWeaponDebugSnapshot(loaded: boolean, dot: number, angleDeg: number): void {
    this.weaponLoaded = loaded;
    this.weaponAlignDot = dot;
    this.weaponAlignAngleDeg = angleDeg;
  }

  getWeaponDebugSnapshot(): { loaded: boolean; dot: number; angleDeg: number } {
    return {
      loaded: this.weaponLoaded,
      dot: this.weaponAlignDot,
      angleDeg: this.weaponAlignAngleDeg,
    };
  }

  getAmmoSnapshot(): Ak47AmmoSnapshot {
    return this.weapon.getAmmoSnapshot();
  }

  getPlayerHealth(): number {
    return this.playerHealth;
  }

  checkEnemyRaycastHit(origin: Vector3, dir: Vector3, maxDist: number): EnemyHitResult {
    return this.enemyManager?.checkRaycastHit(origin, dir, maxDist) ?? { hit: false };
  }

  applyDamageToEnemy(enemyId: string, damage: number, isHeadshot = false): void {
    this.enemyManager?.applyDamageToEnemy(enemyId, damage, isHeadshot);
  }

  setEnemyAudio(audio: WeaponAudio): void {
    this.enemyManager?.setAudio(audio);
  }

  setEnemyKillCallback(cb: (name: string, isHeadshot: boolean) => void): void {
    this.enemyManager?.setKillCallback(cb);
  }

  setEnemyNewWaveCallback(cb: (wave: number) => void): void {
    this.enemyManager?.setNewWaveCallback(cb);
  }

  setLandingCallback(cb: () => void): void {
    this.onLandingCallback = cb;
  }

  setWeaponCallbacks(cbs: {
    onReloadStart?: () => void;
    onReloadEnd?: () => void;
    onDryFire?: () => void;
  }): void {
    if (cbs.onReloadStart !== undefined) this.weapon.onReloadStart = cbs.onReloadStart;
    if (cbs.onReloadEnd !== undefined) this.weapon.onReloadEnd = cbs.onReloadEnd;
    if (cbs.onDryFire !== undefined) this.weapon.onDryFire = cbs.onDryFire;
  }

  getAllEnemiesDead(): boolean {
    return this.enemyManager?.allDead() ?? false;
  }

  getWaveNumber(): number {
    return this.enemyManager?.getWaveNumber() ?? 0;
  }

  /** Seconds remaining until next wave, or null if no countdown is active. */
  getWaveCountdownS(): number | null {
    return this.enemyManager?.getWaveCountdownS() ?? null;
  }

  getIsDead(): boolean {
    return this.isDead;
  }

  respawn(): void {
    this.playerHealth = 100;
    this.isDead = false;
    this.shakeX = 0; this.shakeXVel = 0;
    this.shakeY = 0; this.shakeYVel = 0;
    this.weapon.cancelTrigger();
    this.resetInputState();

    if (this.blockoutSpec && this.spawnPoseCache) {
      const pose = this.spawnPoseCache;
      this.playerController.setSpawn(
        pose.x,
        this.blockoutSpec.defaults.floor_height,
        pose.z,
      );
      this.setLookAngles(pose.yawRad, 0);
      this.updateCameraFromPlayer();
    }
  }

  private setupLighting(): void {
    if (this.lightingPreset === "flat") {
      const palette = resolveBlockoutPalette(this.highVis);
      this.scene.background = new Color(palette.background);
      this.scene.fog = null;

      const ambient = new AmbientLight(0xffffff, 1.05);
      const hemi = new HemisphereLight(0xfafcff, 0xf0d7ad, 1.2);
      hemi.position.set(0, 20, 0);
      const key = new DirectionalLight(0xfff2d0, 0.7);
      key.position.set(22, 34, 16);
      key.castShadow = false;
      this.scene.add(ambient, hemi, key);
      return;
    }

    this.scene.background = new Color(0xF6E7D1);
    this.scene.fog = new FogExp2(0xF6E7D1, 0.0065);

    const ambient = new AmbientLight(0xFFF3E3, 0.22);
    const hemi = new HemisphereLight(0xCFE7FF, 0xE0B07A, 0.55);
    hemi.position.set(0, 50, 0);

    const sun = new DirectionalLight(0xFFD2A1, 1.35);
    sun.position.set(-60, 80, -25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(25, 0, 41);

    const fill = new DirectionalLight(0xBFD9FF, 0.20);
    fill.position.set(60, 40, 20);
    fill.castShadow = false;

    this.scene.add(ambient, hemi, sun, sun.target, fill);
  }

  private setupInitialView(): void {
    this.camera.fov = DEFAULT_FOV;
    this.camera.position.set(0, PLAYER_EYE_HEIGHT_M, 8);
    this.camera.lookAt(0, PLAYER_EYE_HEIGHT_M, 0);
    this.camera.updateProjectionMatrix();
    this.syncAnglesFromCamera();
  }

  private updateInputState(): void {
    if (!this.pointerLocked || this.freezeInput) {
      this.resetFrameInput();
      return;
    }

    this.frameInput.forward = (this.pressedKeys.has("KeyW") ? 1 : 0) + (this.pressedKeys.has("KeyS") ? -1 : 0);
    this.frameInput.right = (this.pressedKeys.has("KeyD") ? 1 : 0) + (this.pressedKeys.has("KeyA") ? -1 : 0);
    this.frameInput.walkHeld = this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight");
    this.frameInput.jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
  }

  private resetInputState(): void {
    this.pressedKeys.clear();
    this.jumpQueued = false;
    this.fireHeld = false;
    this.weapon.cancelTrigger();
    this.resetFrameInput();
  }

  private resetFrameInput(): void {
    this.frameInput.forward = 0;
    this.frameInput.right = 0;
    this.frameInput.walkHeld = false;
    this.frameInput.jumpPressed = false;
  }

  private updateCameraFromPlayer(): void {
    const position = this.playerController.getPosition();
    this.camera.position.set(position.x, position.y + PLAYER_EYE_HEIGHT_M, position.z);
    this.applyAnglesToCamera();
  }

  private setLookAngles(nextYaw: number, nextPitch: number): void {
    this.yaw = nextYaw;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, nextPitch));
    this.applyAnglesToCamera();
  }

  private syncAnglesFromCamera(): void {
    this.camera.getWorldDirection(this.lookDirection);
    this.pitch = Math.asin(this.lookDirection.y);
    this.yaw = Math.atan2(-this.lookDirection.x, -this.lookDirection.z);
    this.applyAnglesToCamera();
  }

  private applyAnglesToCamera(): void {
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  private selectSpawnPose(spec: RuntimeBlockoutSpec, spawn: RuntimeSpawnId): SpawnPose {
    const spawnZones = spec.zones.filter((zone) => zone.type === "spawn_plaza");
    const byId = spawn === "B" ? "SPAWN_B" : "SPAWN_A";
    const selected =
      spawnZones.find((zone) => zone.id.includes(byId)) ??
      spawnZones[0];

    if (selected) {
      return {
        x: selected.rect.x + selected.rect.w * 0.5,
        z: selected.rect.y + selected.rect.h * 0.5,
        yawRad: spawn === "B" ? 0 : Math.PI,
      };
    }

    return {
      x: spec.playable_boundary.x + spec.playable_boundary.w * 0.5,
      z: spec.playable_boundary.y + spec.playable_boundary.h * 0.5,
      yawRad: spawn === "B" ? 0 : Math.PI,
    };
  }

  private rebuildWorld(): void {
    const blockoutSpec = this.blockoutSpec;
    if (!blockoutSpec) {
      return;
    }
    const runtimeSeed = resolveRuntimeSeed(this.mapId, this.seedOverride);

    this.clearBlockout();
    this.clearProps();

    const builtBlockout = buildBlockout(blockoutSpec, {
      highVis: this.highVis,
      seed: runtimeSeed,
      floorMode: this.floorMode,
      floorQuality: this.floorQuality,
      lightingPreset: this.lightingPreset,
      floorMaterials: this.floorMaterials,
    });
    this.blockoutRoot = builtBlockout.root;
    this.scene.add(builtBlockout.root);

    this.propColliders = [];
    this.propStats = {
      seed: runtimeSeed,
      profile: this.propChaos.profile,
      jitter: this.propChaos.jitter ?? 0.34,
      cluster: this.propChaos.cluster ?? 0.56,
      density: this.propChaos.density ?? 0.44,
      totalAnchors: this.anchorsSpec?.anchors.length ?? 0,
      candidatesTotal: 0,
      collidersPlaced: 0,
      rejectedClearZone: 0,
      rejectedBounds: 0,
      rejectedGapRule: 0,
      visualOnlyLandmarks: 0,
      stallFillersPlaced: 0,
    };

    if (this.anchorsSpec) {
      const builtProps = buildProps({
        mapId: this.mapId,
        blockout: blockoutSpec,
        anchors: this.anchorsSpec,
        seedOverride: this.seedOverride,
        propChaos: this.propChaos,
        highVis: this.highVis,
      });
      this.propsRoot = builtProps.root;
      this.propColliders = builtProps.colliders;
      this.propStats = builtProps.stats;
      this.scene.add(builtProps.root);
    }

    this.runtimeColliders = [...builtBlockout.colliders, ...this.propColliders].sort((a, b) => a.id.localeCompare(b.id));
    this.worldColliders = new WorldColliders(this.runtimeColliders, blockoutSpec.playable_boundary);
    this.playerController.setWorld(this.worldColliders);
    this.enemyManager?.spawn(this.worldColliders);

    const spawnPose = this.selectSpawnPose(blockoutSpec, this.spawn);
    this.spawnPoseCache = spawnPose;
    this.playerController.setSpawn(spawnPose.x, blockoutSpec.defaults.floor_height, spawnPose.z);
    this.setLookAngles(spawnPose.yawRad, 0);
    if (!this.freezeInput) {
      this.updateCameraFromPlayer();
    }
  }

  private clearBlockout(): void {
    if (this.blockoutRoot) {
      this.scene.remove(this.blockoutRoot);
      disposeObjectRoot(this.blockoutRoot);
      this.blockoutRoot = null;
    }
    this.worldColliders = null;
    this.runtimeColliders = [];
  }

  private clearProps(): void {
    if (this.propsRoot) {
      this.scene.remove(this.propsRoot);
      disposeObjectRoot(this.propsRoot);
      this.propsRoot = null;
    }
    this.propColliders = [];
    this.worldColliders = null;
    this.runtimeColliders = [];
  }
}
