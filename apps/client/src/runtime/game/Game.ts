import { AmbientLight, Color, DirectionalLight, HemisphereLight, Object3D, PerspectiveCamera, Scene, Vector3 } from "three";
import { AnchorsDebug, type AnchorsDebugState } from "../debug/AnchorsDebug";
import { Hud } from "../debug/Hud";
import { buildBlockout } from "../map/buildBlockout";
import { buildProps, type PropsBuildStats } from "../map/buildProps";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import type { RuntimeAnchorsSpec, RuntimeBlockoutSpec } from "../map/types";
import {
  PLAYER_EYE_HEIGHT_M,
  PlayerController,
  type PlayerInputState,
} from "../sim/PlayerController";
import { type RuntimeColliderAabb, WorldColliders } from "../sim/collision/WorldColliders";
import { resolveRuntimeSeed } from "../utils/Rng";
import { disposeObjectRoot } from "../utils/disposeObjectRoot";
import type { RuntimePropChaosOptions, RuntimeSpawnId } from "../utils/UrlParams";
import type { Ak47ShotEvent } from "../weapons/Ak47FireController";
import { Ak47Weapon, type Ak47AmmoSnapshot } from "../weapons/Ak47Weapon";

const DEFAULT_FOV = 75;
const LOOK_SENSITIVITY = 0.002;
const MIN_PITCH = -(Math.PI / 2) + 0.001;
const MAX_PITCH = (Math.PI / 2) - 0.001;
const RAD_TO_DEG = 180 / Math.PI;

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

    this.setupLighting();
    this.setupInitialView();

    this.mapId = options.mapId;
    this.seedOverride = options.seedOverride;
    this.highVis = options.highVis ?? false;
    this.propChaos = options.propChaos;
    this.freezeInput = options.freezeInput ?? false;
    this.spawn = options.spawn ?? "A";
    this.debugHotkeysEnabled = options.debug ?? false;
    this.onTogglePerfHud = options.onTogglePerfHud ?? null;
    this.onWeaponShot = options.onWeaponShot ?? null;

    const weaponSeed = resolveRuntimeSeed(this.mapId, this.seedOverride);
    this.weapon = new Ak47Weapon({ seed: weaponSeed });

    const palette = resolveBlockoutPalette(this.highVis);
    this.scene.background = new Color(palette.background);
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

  private setupLighting(): void {
    const ambient = new AmbientLight(0xffffff, 1.05);
    const hemi = new HemisphereLight(0xfafcff, 0xf0d7ad, 1.2);
    hemi.position.set(0, 20, 0);
    const key = new DirectionalLight(0xfff2d0, 0.7);
    key.position.set(22, 34, 16);
    key.castShadow = false;
    this.scene.add(ambient, hemi, key);
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

    this.clearBlockout();
    this.clearProps();

    const builtBlockout = buildBlockout(blockoutSpec, { highVis: this.highVis });
    this.blockoutRoot = builtBlockout.root;
    this.scene.add(builtBlockout.root);

    this.propColliders = [];
    this.propStats = {
      seed: 1,
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

    const spawnPose = this.selectSpawnPose(blockoutSpec, this.spawn);
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
