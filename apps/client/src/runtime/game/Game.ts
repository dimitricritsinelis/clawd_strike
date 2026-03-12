import { AmbientLight, Color, DirectionalLight, FogExp2, HemisphereLight, Object3D, PerspectiveCamera, Scene, Vector3 } from "three";
import { installDesertSky, type DesertSkyHandle } from "../render/DesertSky";
import { AnchorsDebug, type AnchorsDebugState } from "../debug/AnchorsDebug";
import { Hud } from "../debug/Hud";
import { EnemyManager, type EnemyHitResult, type EnemyManagerDebugSnapshot } from "../enemies/EnemyManager";
import type { WeaponAudio } from "../audio/WeaponAudio";
import { buildBlockout } from "../map/buildBlockout";
import { buildProps, type PropsBuildStats } from "../map/buildProps";
import type { WallDetailPlacementStats } from "../map/wallDetailPlacer";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import type { FloorMaterialLibrary } from "../render/materials/FloorMaterialLibrary";
import type { WallMaterialLibrary } from "../render/materials/WallMaterialLibrary";
import type { PropModelLibrary } from "../render/models/PropModelLibrary";
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
  RuntimeControlMode,
  RuntimeFloorMode,
  RuntimeFloorQuality,
  RuntimeLightingPreset,
  RuntimePropChaosOptions,
  RuntimePropVisualMode,
  RuntimeSpawnId,
  RuntimeWallMode,
} from "../utils/UrlParams";
import type { Ak47ShotEvent } from "../weapons/Ak47FireController";
import { Ak47Weapon, type Ak47AmmoSnapshot } from "../weapons/Ak47Weapon";
import { resetTickIntent, type AgentAction, type TickIntent } from "../input/AgentAction";

const DEFAULT_FOV = 75;
const LOOK_SENSITIVITY = 0.002;
const MOBILE_LOOK_SENSITIVITY = 0.15; // degrees per pixel of touch drag
const MIN_PITCH = -(Math.PI / 2) + 0.001;
const MAX_PITCH = (Math.PI / 2) - 0.001;
const EYE_HEIGHT_LERP_RATE = 17.1;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const AGENT_LOOK_ACCUM_LIMIT_DEG = 540;
const MAP_PROPS_ENABLED = false;

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
  controlMode: RuntimeControlMode;
  mapId: string;
  seedOverride: number | null;
  propChaos: RuntimePropChaosOptions;
  freezeInput?: boolean;
  spawn?: RuntimeSpawnId;
  debug?: boolean;
  highVis?: boolean;
  floorMode: RuntimeFloorMode;
  wallMode: RuntimeWallMode;
  wallDetails: boolean;
  wallDetailDensity: number | null;
  floorQuality: RuntimeFloorQuality;
  lightingPreset: RuntimeLightingPreset;
  floorMaterials: FloorMaterialLibrary | null;
  wallMaterials: WallMaterialLibrary | null;
  propVisuals: RuntimePropVisualMode;
  propModels: PropModelLibrary | null;
  doorModels: PropModelLibrary | null;
  onTogglePerfHud?: () => void;
  mountEl?: HTMLElement;
  anchorsDebug?: {
    showMarkers: boolean;
    showLabels: boolean;
    anchorTypes: readonly string[];
  };
  onWeaponShot?: (shot: WeaponShotPayload) => void;
  unlimitedHealth?: boolean;
  playerRunSpeedMps?: number;
};

type SpawnPose = {
  x: number;
  z: number;
  yawRad: number;
  zoneId: string | null;
};

export class Game {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;

  private desertSky: DesertSkyHandle | null = null;
  private controlMode: RuntimeControlMode = "human";
  private readonly pressedKeys = new Set<string>();
  private readonly lookDirection = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly playerController: PlayerController;
  private weapon = new Ak47Weapon({ seed: 1 });
  private readonly tickIntent: TickIntent = {
    moveX: 0,
    moveZ: 0,
    lookYawDelta: 0,
    lookPitchDelta: 0,
    jump: false,
    fire: false,
    reload: false,
    crouch: false,
  };
  private readonly frameInput: PlayerInputState = {
    forward: 0,
    right: 0,
    crouchHeld: false,
    jumpPressed: false,
  };

  private yaw = 0;
  private pitch = 0;
  private pointerLocked = false;
  private freezeInput = false;
  private humanFireHeld = false;
  private humanJumpQueued = false;
  private humanReloadQueued = false;
  private humanLookDeltaX = 0;
  private humanLookDeltaY = 0;
  private agentMoveX = 0;
  private agentMoveZ = 0;
  private agentLookYawDeltaDeg = 0;
  private agentLookPitchDeltaDeg = 0;
  private agentJumpQueued = false;
  private agentReloadQueued = false;
  private agentFireHeld = false;
  private agentCrouchHeld = false;
  private mobileActive = false;
  private mobileMoveX = 0;
  private mobileMoveZ = 0;
  private mobileLookDeltaX = 0;
  private mobileLookDeltaY = 0;
  private mobileFireHeld = false;
  private mobileJumpQueued = false;
  private mobileReloadQueued = false;
  private mobileCrouchHeld = false;
  private spawn: RuntimeSpawnId = "A";
  private mapId = "bazaar-map";
  private seedOverride: number | null = null;
  private highVis = false;
  private lightingPreset: RuntimeLightingPreset = "golden";
  private floorMode: RuntimeFloorMode = "blockout";
  private wallMode: RuntimeWallMode = "blockout";
  private wallDetailsEnabled = true;
  private wallDetailDensity: number | null = null;
  private floorQuality: RuntimeFloorQuality = "4k";
  private floorMaterials: FloorMaterialLibrary | null = null;
  private wallMaterials: WallMaterialLibrary | null = null;
  private propVisuals: RuntimePropVisualMode = "blockout";
  private propModels: PropModelLibrary | null = null;
  private doorModels: PropModelLibrary | null = null;
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
  private wallDetailStats: WallDetailPlacementStats = {
    enabled: false,
    seed: 1,
    density: 0,
    segmentCount: 0,
    segmentsDecorated: 0,
    instanceCount: 0,
  };
  private enemyManager: EnemyManager | null = null;
  private playerHealth = 100;
  private overshield = 0;
  private isDead = false;
  private spawnPoseCache: SpawnPose | null = null;
  private wasGrounded = true;
  private onLandingCallback: (() => void) | null = null;
  private hud: Hud | null = null;
  private anchorsDebug: AnchorsDebug | null = null;
  private debugHotkeysEnabled = false;
  private onTogglePerfHud: (() => void) | null = null;
  private onWeaponShot: ((shot: WeaponShotPayload) => void) | null = null;
  private unlimitedHealth = false;
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
  private smoothedEyeHeight = PLAYER_EYE_HEIGHT_M;
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
      this.humanJumpQueued = true;
    }
    if (
      event.code === "KeyR" &&
      !event.repeat &&
      this.controlMode === "human" &&
      this.canAcceptGameplayInput()
    ) {
      this.humanReloadQueued = true;
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly onWindowBlur = (): void => {
    if (this.controlMode === "human") {
      this.resetInputState();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (this.controlMode === "human" && document.visibilityState !== "visible") {
      this.resetInputState();
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    if (this.controlMode !== "human" || !this.canAcceptGameplayInput()) return;
    this.humanFireHeld = true;
    event.preventDefault();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.humanFireHeld = false;
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.controlMode !== "human" || !this.pointerLocked) return;
    event.preventDefault();
  };

  constructor(options: GameOptions) {
    this.scene = new Scene();

    this.camera = new PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 1500);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, PLAYER_EYE_HEIGHT_M, 8);

    this.controlMode = options.controlMode;
    this.mapId = options.mapId;
    this.seedOverride = options.seedOverride;
    this.highVis = options.highVis ?? false;
    this.lightingPreset = options.lightingPreset;
    this.floorMode = options.floorMode;
    this.wallMode = options.wallMode;
    this.wallDetailsEnabled = options.wallDetails;
    this.wallDetailDensity = options.wallDetailDensity;
    this.floorQuality = options.floorQuality;
    this.floorMaterials = options.floorMaterials;
    this.wallMaterials = options.wallMaterials;
    this.propVisuals = options.propVisuals;
    this.propModels = options.propModels;
    this.doorModels = options.doorModels;
    this.propChaos = options.propChaos;
    this.freezeInput = options.freezeInput ?? false;
    this.spawn = options.spawn ?? "A";
    this.debugHotkeysEnabled = options.debug ?? false;
    this.onTogglePerfHud = options.onTogglePerfHud ?? null;
    this.onWeaponShot = options.onWeaponShot ?? null;
    this.unlimitedHealth = options.unlimitedHealth ?? false;
    this.playerController = new PlayerController(options.playerRunSpeedMps);

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
    if (!locked && this.controlMode === "human") {
      this.resetInputState();
    }
  }

  setMobileActive(active: boolean): void {
    this.mobileActive = active;
  }

  feedMobileInput(input: {
    moveX: number;
    moveZ: number;
    lookDeltaX: number;
    lookDeltaY: number;
    fire: boolean;
    jump: boolean;
    reload: boolean;
    crouch: boolean;
  }): void {
    this.mobileMoveX = input.moveX;
    this.mobileMoveZ = input.moveZ;
    this.mobileLookDeltaX += input.lookDeltaX;
    this.mobileLookDeltaY += input.lookDeltaY;
    this.mobileFireHeld = input.fire;
    if (input.jump) this.mobileJumpQueued = true;
    if (input.reload) this.mobileReloadQueued = true;
    this.mobileCrouchHeld = input.crouch;
  }

  setFreezeInput(freeze: boolean): void {
    this.freezeInput = freeze;
    if (freeze) {
      this.humanFireHeld = false;
      this.humanReloadQueued = false;
      this.agentFireHeld = false;
      this.agentReloadQueued = false;
      this.agentJumpQueued = false;
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

  getWallDetailStats(): WallDetailPlacementStats {
    return this.wallDetailStats;
  }

  onMouseDelta(deltaX: number, deltaY: number): void {
    if (this.controlMode !== "human" || !this.canAcceptGameplayInput()) return;
    this.humanLookDeltaX += deltaX;
    this.humanLookDeltaY += deltaY;
  }

  update(deltaSeconds: number): void {
    if (this.worldColliders) {
      this.buildTickIntent();
      this.applyLookIntent();
      this.updateInputState();
      if (this.tickIntent.reload && this.canAcceptGameplayInput()) {
        this.weapon.queueReload();
      }
      this.playerController.step(deltaSeconds, this.frameInput, this.yaw);
      // Detect landing transition: airborne → grounded
      const nowGrounded = this.playerController.getGrounded();
      if (!this.wasGrounded && nowGrounded) {
        this.onLandingCallback?.();
        // Add a landing camera bob via damage shake channel
        this.shakeYVel -= 0.06;
      }
      this.wasGrounded = nowGrounded;
      this.updateCameraFromPlayer(deltaSeconds);
      this.desertSky?.update();

      this.camera.getWorldDirection(this.cameraForward);
      const fireResult = this.weapon.update(
        {
          deltaSeconds,
          fireHeld: this.tickIntent.fire && this.canAcceptGameplayInput(),
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
          this.playerController.getCurrentHeight(),
          this.playerController.getCurrentEyeHeight(),
        );
        const delta = this.enemyManager.getPlayerHealthDelta();
        if (this.unlimitedHealth) {
          this.playerHealth = 100;
        } else {
          let remaining = delta;
          if (this.overshield > 0 && remaining > 0) {
            const absorbed = Math.min(this.overshield, remaining);
            this.overshield -= absorbed;
            remaining -= absorbed;
          }
          this.playerHealth = Math.max(0, this.playerHealth - remaining);
        }
        // ── Damage shake: proportional to damage taken ──────────────────────
        if (delta > 0) {
          const damageNorm = Math.min(1, delta / 25); // 25 = one shot
          const impulse = SHAKE_DAMAGE_BASE * damageNorm;
          this.shakeXVel += (Math.random() * 2 - 1) * impulse;
          this.shakeYVel -= Math.abs(impulse) * 0.6; // bias upward jolt on damage
        }
        if (!this.unlimitedHealth && this.playerHealth <= 0 && !this.isDead) {
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
    this.desertSky?.dispose();
    this.desertSky = null;
    this.clearBlockout();
    this.clearProps();
  }

  getGrounded(): boolean {
    return this.playerController.getGrounded();
  }

  getPlayerPosition(): { x: number; y: number; z: number } {
    const position = this.playerController.getPosition();
    return {
      x: position.x,
      y: position.y,
      z: position.z,
    };
  }

  getPlayerVelocity(): { x: number; y: number; z: number } {
    const velocity = this.playerController.getVelocity();
    return {
      x: velocity.x,
      y: velocity.y,
      z: velocity.z,
    };
  }

  getPlayerCollisionState(): { hitX: boolean; hitY: boolean; hitZ: boolean; grounded: boolean } {
    return this.playerController.getLastCollisionState();
  }

  isPlayerWithinPlayableBounds(): boolean {
    return this.playerController.isWithinPlayableBounds();
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

  getOvershield(): number {
    return this.overshield;
  }

  setOvershield(amount: number): void {
    this.overshield = Math.max(0, amount);
  }

  setPlayerSpeedMultiplier(multiplier: number): void {
    this.playerController.setSpeedMultiplier(multiplier);
  }

  setWeaponFireInterval(intervalS: number): void {
    this.weapon.setFireIntervalS(intervalS);
  }

  setWeaponReloadSpeed(multiplier: number): void {
    this.weapon.setReloadSpeedMultiplier(multiplier);
  }

  setWeaponUnlimitedAmmo(unlimited: boolean): void {
    this.weapon.setUnlimitedAmmo(unlimited);
  }

  checkEnemyRaycastHit(origin: Vector3, dir: Vector3, maxDist: number): EnemyHitResult {
    return this.enemyManager?.checkRaycastHit(origin, dir, maxDist) ?? { hit: false };
  }

  applyDamageToEnemy(enemyId: string, damage: number, isHeadshot = false): void {
    this.enemyManager?.applyDamageToEnemy(enemyId, damage, isHeadshot);
  }

  eliminateAllEnemiesForDebug(): number {
    return this.enemyManager?.eliminateAllForDebug() ?? 0;
  }

  debugSetPlayerPose(position: { x: number; y: number; z: number }, yawRad?: number): void {
    this.playerController.setSpawn(position.x, position.y, position.z);
    if (typeof yawRad === "number") {
      this.setLookAngles(yawRad, 0);
    } else {
      this.updateCameraFromPlayer();
    }
    this.playerHealth = 100;
    this.isDead = false;
  }

  resetBotKnowledgeForDebug(): void {
    this.enemyManager?.resetKnowledgeForDebug();
  }

  suppressBotIntelForDebug(durationMs: number): void {
    this.enemyManager?.suppressPlayerIntelForDebug(durationMs);
  }

  setEnemyAudio(audio: WeaponAudio): void {
    this.enemyManager?.setAudio(audio);
  }

  setEnemyKillCallback(cb: (name: string, isHeadshot: boolean, deathPos: { x: number; y: number; z: number }, enemyIndex: number) => void): void {
    this.enemyManager?.setKillCallback(cb);
  }

  setEnemyNewWaveCallback(cb: (wave: number) => void): void {
    this.enemyManager?.setNewWaveCallback((wave) => {
      this.playerHealth = 100;
      this.overshield = 0;
      this.weapon.reset();
      cb(wave);
    });
  }

  reportPlayerGunshot(): void {
    this.enemyManager?.reportPlayerGunshot(this.playerController.getPosition());
  }

  reportPlayerFootstep(speedMps: number): void {
    if (speedMps <= 0.4) return;
    this.enemyManager?.reportPlayerFootstep(this.playerController.getPosition(), speedMps);
  }

  getBotDebugSnapshot(): EnemyManagerDebugSnapshot | null {
    return this.enemyManager?.getDebugSnapshot() ?? null;
  }

  getWaveElapsedS(): number {
    return this.enemyManager?.getWaveElapsedS() ?? 0;
  }

  setLandingCallback(cb: () => void): void {
    this.onLandingCallback = cb;
  }

  setWeaponCallbacks(cbs: {
    onReloadStart?: () => void;
    onReloadEnd?: () => void;
    onReloadCancel?: () => void;
    onDryFire?: () => void;
  }): void {
    if (cbs.onReloadStart !== undefined) this.weapon.onReloadStart = cbs.onReloadStart;
    if (cbs.onReloadEnd !== undefined) this.weapon.onReloadEnd = cbs.onReloadEnd;
    if (cbs.onReloadCancel !== undefined) this.weapon.onReloadCancel = cbs.onReloadCancel;
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

  getControlMode(): RuntimeControlMode {
    return this.controlMode;
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  applyAgentAction(action: AgentAction): void {
    if (action.moveX !== undefined) {
      this.agentMoveX = action.moveX;
    }
    if (action.moveZ !== undefined) {
      this.agentMoveZ = action.moveZ;
    }
    if (action.lookYawDelta !== undefined) {
      this.agentLookYawDeltaDeg = this.clamp(
        this.agentLookYawDeltaDeg + action.lookYawDelta,
        -AGENT_LOOK_ACCUM_LIMIT_DEG,
        AGENT_LOOK_ACCUM_LIMIT_DEG,
      );
    }
    if (action.lookPitchDelta !== undefined) {
      this.agentLookPitchDeltaDeg = this.clamp(
        this.agentLookPitchDeltaDeg + action.lookPitchDelta,
        -AGENT_LOOK_ACCUM_LIMIT_DEG,
        AGENT_LOOK_ACCUM_LIMIT_DEG,
      );
    }
    if (action.jump === true) {
      this.agentJumpQueued = true;
    }
    if (action.reload === true) {
      this.agentReloadQueued = true;
    }
    if (action.fire !== undefined) {
      this.agentFireHeld = action.fire;
    }
    if (action.crouch !== undefined) {
      this.agentCrouchHeld = action.crouch;
    }
  }

  restartRun(): void {
    this.playerHealth = 100;
    this.overshield = 0;
    this.isDead = false;
    this.wasGrounded = true;
    this.shakeX = 0; this.shakeXVel = 0;
    this.shakeY = 0; this.shakeYVel = 0;
    this.smoothedEyeHeight = PLAYER_EYE_HEIGHT_M;
    this.resetInputState();
    this.weapon.reset();
    this.resetWeaponDebugState();

    if (this.blockoutSpec && this.worldColliders && this.enemyManager) {
      const spawnPose = this.selectSpawnPose(this.blockoutSpec, this.spawn);
      this.spawnPoseCache = spawnPose;
      this.playerController.setSpawn(
        spawnPose.x,
        this.blockoutSpec.defaults.floor_height,
        spawnPose.z,
      );
      this.setLookAngles(spawnPose.yawRad, 0);
      this.enemyManager.fullDispose(this.scene);
      this.enemyManager.setTacticalContext(this.blockoutSpec, this.anchorsSpec ?? null);
      this.enemyManager.spawn(this.worldColliders, {
        mode: "initial",
        playerPos: {
          x: spawnPose.x,
          y: this.blockoutSpec.defaults.floor_height,
          z: spawnPose.z,
        },
        playerSpawnId: this.spawn,
      });
    } else if (this.blockoutSpec) {
      this.rebuildWorld();
    }

    if (!this.restorePlayerToSpawn()) {
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

    // ── Desert lighting rig (Dust2-style) ──────────────────────────────
    // Tuning constants kept here for easy adjustment.
    const FOG_COLOR = 0xEADBC8;       // warm dust
    const AMBIENT_COLOR = 0xFFEFD4;
    const AMBIENT_INTENSITY = 0.55;   // retuned to absorb the old fill light contribution
    const HEMI_SKY = 0xD8EBFF;        // slightly brighter sky bounce (was 0xCFE3FF)
    const HEMI_GROUND = 0xE0C08A;     // warmer/brighter ground bounce (was 0xD7B07A)
    const HEMI_INTENSITY = 0.82;      // stronger ambient bounce without a second direct light
    const SUN_COLOR = 0xFFD2A1;
    const SUN_INTENSITY = 2.1;
    const SUN_POS: [number, number, number] = [-110, 75, -40];
    const SUN_TARGET: [number, number, number] = [25, 0, 41];
    const SHADOW_MAP_SIZE = 2048;
    const SHADOW_BIAS = 0.0001;        // reduced shadow creep
    const SHADOW_NORMAL_BIAS = 0.015;
    const SHADOW_BOUNDS = 50;         // ±50 ortho frustum (covers 50×82m playable area)
    const SHADOW_RADIUS = 1;
    const FOG_DENSITY = 0.0030;       // reduced from 0.0045 — less haze, clearer distance

    this.scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);

    const ambient = new AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
    const hemi = new HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY);
    hemi.position.set(0, 50, 0);

    const sun = new DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    sun.position.set(...SUN_POS);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -SHADOW_BOUNDS;
    sun.shadow.camera.right = SHADOW_BOUNDS;
    sun.shadow.camera.top = SHADOW_BOUNDS;
    sun.shadow.camera.bottom = -SHADOW_BOUNDS;
    sun.shadow.bias = SHADOW_BIAS;
    sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
    sun.shadow.radius = SHADOW_RADIUS;
    sun.target.position.set(...SUN_TARGET);

    this.scene.add(ambient, hemi, sun, sun.target);

    // Live procedural desert skydome (scaled within camera.far, follows camera each frame)
    this.scene.background = null; // skydome IS the background; clearColor serves as fallback
    this.desertSky = installDesertSky({
      scene: this.scene,
      camera: this.camera,
      sunLight: sun,
      preset: "late-afternoon",
    });
  }

  private setupInitialView(): void {
    this.camera.fov = DEFAULT_FOV;
    this.camera.position.set(0, PLAYER_EYE_HEIGHT_M, 8);
    this.camera.lookAt(0, PLAYER_EYE_HEIGHT_M, 0);
    this.camera.updateProjectionMatrix();
    this.syncAnglesFromCamera();
  }

  private canAcceptGameplayInput(): boolean {
    if (this.freezeInput) {
      return false;
    }
    if (this.controlMode === "human") {
      return this.pointerLocked || this.mobileActive;
    }
    return true;
  }

  private buildTickIntent(): void {
    resetTickIntent(this.tickIntent);

    if (this.controlMode === "human") {
      if (this.mobileActive) {
        this.buildMobileIntent();
      } else {
        this.buildHumanIntent();
      }
    } else {
      this.buildAgentIntent();
    }

    if (!this.canAcceptGameplayInput()) {
      this.tickIntent.moveX = 0;
      this.tickIntent.moveZ = 0;
      this.tickIntent.lookYawDelta = 0;
      this.tickIntent.lookPitchDelta = 0;
      this.tickIntent.jump = false;
      this.tickIntent.fire = false;
      this.tickIntent.reload = false;
    }
  }

  private buildHumanIntent(): void {
    this.tickIntent.moveZ = (this.pressedKeys.has("KeyW") ? 1 : 0) + (this.pressedKeys.has("KeyS") ? -1 : 0);
    this.tickIntent.moveX = (this.pressedKeys.has("KeyD") ? 1 : 0) + (this.pressedKeys.has("KeyA") ? -1 : 0);
    this.tickIntent.crouch = this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight");
    this.tickIntent.jump = this.humanJumpQueued;
    this.tickIntent.fire = this.humanFireHeld;
    this.tickIntent.reload = this.humanReloadQueued;
    this.tickIntent.lookYawDelta = this.humanLookDeltaX * LOOK_SENSITIVITY * RAD_TO_DEG;
    this.tickIntent.lookPitchDelta = -this.humanLookDeltaY * LOOK_SENSITIVITY * RAD_TO_DEG;

    this.humanJumpQueued = false;
    this.humanReloadQueued = false;
    this.humanLookDeltaX = 0;
    this.humanLookDeltaY = 0;
  }

  private buildMobileIntent(): void {
    this.tickIntent.moveX = Math.max(-1, Math.min(1, this.mobileMoveX));
    this.tickIntent.moveZ = Math.max(-1, Math.min(1, this.mobileMoveZ));
    this.tickIntent.crouch = this.mobileCrouchHeld;
    this.tickIntent.jump = this.mobileJumpQueued;
    this.tickIntent.fire = this.mobileFireHeld;
    this.tickIntent.reload = this.mobileReloadQueued;
    this.tickIntent.lookYawDelta = this.mobileLookDeltaX * MOBILE_LOOK_SENSITIVITY;
    this.tickIntent.lookPitchDelta = -this.mobileLookDeltaY * MOBILE_LOOK_SENSITIVITY;

    this.mobileJumpQueued = false;
    this.mobileReloadQueued = false;
    this.mobileLookDeltaX = 0;
    this.mobileLookDeltaY = 0;
  }

  private buildAgentIntent(): void {
    this.tickIntent.moveX = this.agentMoveX;
    this.tickIntent.moveZ = this.agentMoveZ;
    this.tickIntent.lookYawDelta = this.agentLookYawDeltaDeg;
    this.tickIntent.lookPitchDelta = this.agentLookPitchDeltaDeg;
    this.tickIntent.jump = this.agentJumpQueued;
    this.tickIntent.fire = this.agentFireHeld;
    this.tickIntent.reload = this.agentReloadQueued;
    this.tickIntent.crouch = this.agentCrouchHeld;

    this.agentLookYawDeltaDeg = 0;
    this.agentLookPitchDeltaDeg = 0;
    this.agentJumpQueued = false;
    this.agentReloadQueued = false;
  }

  private applyLookIntent(): void {
    if (!this.canAcceptGameplayInput()) return;
    if (this.tickIntent.lookYawDelta === 0 && this.tickIntent.lookPitchDelta === 0) return;

    // Agent API uses degrees-per-tick: +yaw turns right, +pitch turns up.
    const nextYaw = this.yaw - this.tickIntent.lookYawDelta * DEG_TO_RAD;
    const nextPitch = this.pitch + this.tickIntent.lookPitchDelta * DEG_TO_RAD;
    this.setLookAngles(nextYaw, nextPitch);
  }

  private updateInputState(): void {
    if (!this.canAcceptGameplayInput()) {
      this.resetFrameInput();
      return;
    }

    this.frameInput.forward = this.tickIntent.moveZ;
    this.frameInput.right = this.tickIntent.moveX;
    this.frameInput.crouchHeld = this.tickIntent.crouch;
    this.frameInput.jumpPressed = this.tickIntent.jump;
  }

  private resetInputState(): void {
    this.pressedKeys.clear();
    this.humanJumpQueued = false;
    this.humanReloadQueued = false;
    this.humanFireHeld = false;
    this.humanLookDeltaX = 0;
    this.humanLookDeltaY = 0;
    this.agentMoveX = 0;
    this.agentMoveZ = 0;
    this.agentLookYawDeltaDeg = 0;
    this.agentLookPitchDeltaDeg = 0;
    this.agentJumpQueued = false;
    this.agentReloadQueued = false;
    this.agentFireHeld = false;
    this.agentCrouchHeld = false;
    this.weapon.cancelTrigger();
    resetTickIntent(this.tickIntent);
    this.resetFrameInput();
  }

  private resetFrameInput(): void {
    this.frameInput.forward = 0;
    this.frameInput.right = 0;
    this.frameInput.crouchHeld = false;
    this.frameInput.jumpPressed = false;
  }

  private updateCameraFromPlayer(deltaSeconds = 1.0): void {
    const position = this.playerController.getPosition();
    const targetEyeHeight = this.playerController.getCurrentEyeHeight();
    this.smoothedEyeHeight += (targetEyeHeight - this.smoothedEyeHeight) *
      Math.min(1, deltaSeconds * EYE_HEIGHT_LERP_RATE);
    this.camera.position.set(position.x, position.y + this.smoothedEyeHeight, position.z);
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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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
        zoneId: selected.id,
      };
    }

    return {
      x: spec.playable_boundary.x + spec.playable_boundary.w * 0.5,
      z: spec.playable_boundary.y + spec.playable_boundary.h * 0.5,
      yawRad: spawn === "B" ? 0 : Math.PI,
      zoneId: null,
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
      wallMode: this.wallMode,
      floorQuality: this.floorQuality,
      lightingPreset: this.lightingPreset,
      floorMaterials: this.floorMaterials,
      wallMaterials: this.wallMaterials,
      anchors: this.anchorsSpec,
      wallDetails: {
        enabled: this.wallDetailsEnabled,
        densityScale: this.wallDetailDensity,
      },
      doorModels: this.doorModels,
    });
    this.wallDetailStats = builtBlockout.wallDetailStats;
    this.blockoutRoot = builtBlockout.root;
    this.scene.add(builtBlockout.root);

    this.propColliders = [];
    this.propStats = {
      seed: runtimeSeed,
      profile: this.propChaos.profile,
      jitter: this.propChaos.jitter ?? 0.34,
      cluster: this.propChaos.cluster ?? 0.56,
      density: MAP_PROPS_ENABLED ? (this.propChaos.density ?? 0.44) : 0,
      totalAnchors: this.anchorsSpec?.anchors.length ?? 0,
      candidatesTotal: 0,
      collidersPlaced: 0,
      rejectedClearZone: 0,
      rejectedBounds: 0,
      rejectedGapRule: 0,
      visualOnlyLandmarks: 0,
      stallFillersPlaced: 0,
    };

    if (MAP_PROPS_ENABLED && this.anchorsSpec) {
      const builtProps = buildProps({
        mapId: this.mapId,
        blockout: blockoutSpec,
        anchors: this.anchorsSpec,
        seedOverride: this.seedOverride,
        propChaos: this.propChaos,
        propVisuals: this.propVisuals,
        propModels: this.propModels,
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
    const spawnPose = this.selectSpawnPose(blockoutSpec, this.spawn);
    this.spawnPoseCache = spawnPose;
    this.playerController.setSpawn(spawnPose.x, blockoutSpec.defaults.floor_height, spawnPose.z);
    this.setLookAngles(spawnPose.yawRad, 0);
    this.enemyManager?.fullDispose(this.scene);
    this.enemyManager?.setTacticalContext(blockoutSpec, this.anchorsSpec ?? null);
    this.enemyManager?.spawn(this.worldColliders, {
      mode: "initial",
      playerPos: {
        x: spawnPose.x,
        y: blockoutSpec.defaults.floor_height,
        z: spawnPose.z,
      },
      playerSpawnId: this.spawn,
    });
    if (!this.freezeInput) {
      this.updateCameraFromPlayer();
    }
  }

  private restorePlayerToSpawn(): boolean {
    if (!this.blockoutSpec) return false;
    const pose = this.spawnPoseCache ?? this.selectSpawnPose(this.blockoutSpec, this.spawn);
    this.spawnPoseCache = pose;
    this.playerController.setSpawn(
      pose.x,
      this.blockoutSpec.defaults.floor_height,
      pose.z,
    );
    this.setLookAngles(pose.yawRad, 0);
    this.updateCameraFromPlayer();
    return true;
  }

  private resetWeaponDebugState(): void {
    this.weaponShotsFiredLastFrame = 0;
    this.weaponShotIndex = 0;
    this.weaponSpreadDeg = 0;
    this.weaponBloomDeg = 0;
    this.weaponLastShotRecoilPitchDeg = 0;
    this.weaponLastShotRecoilYawDeg = 0;
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
