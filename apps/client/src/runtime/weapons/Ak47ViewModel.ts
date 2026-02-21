import {
  AdditiveBlending,
  AmbientLight,
  AxesHelper,
  Box3,
  CanvasTexture,
  ClampToEdgeWrapping,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeObjectRoot } from "../utils/disposeObjectRoot";

const VIEWMODEL_FOV_DEG = 54;
const VIEWMODEL_NEAR = 0.01;
const VIEWMODEL_FAR = 10;
const MODEL_URL = "/assets/models/weapons/ak47/ak47.glb";
const MODEL_TARGET_LENGTH_M = 1.0;
const RAD_TO_DEG = 180 / Math.PI;

// Barrel-forward in model-local space before Y-axis fixup.
const BARREL_AXIS_LOCAL = new Vector3(1, 0, 0);
const MODEL_FIXUP_YAW_RAD = Math.PI / 2;

const BASE_WEAPON_POSE_POSITION = new Vector3(0.2, -0.18, -0.52);
const BASE_WEAPON_POSE_ROLL_RAD = -0.09;
const BASE_WEAPON_POSE_PITCH_RAD = 0;
const BASE_WEAPON_POSE_YAW_RAD = 0;

const DEFAULT_MUZZLE_OFFSET_WEAPON_SPACE = new Vector3(0.33, -0.095, -0.69);
const MUZZLE_NODE_HINT_RE = /muzzle|flash|barrel.*end|tip/i;
const MUZZLE_FORWARD_OFFSET_M = 0.03;
const MUZZLE_DEBUG_MARKER_RADIUS_M = 0.012;
const MUZZLE_DEBUG_MARKER_COLOR = 0x4dffd0;
const MUZZLE_FLASH_SIZE_M = 0.193;
const MUZZLE_FLASH_DURATION_S = 0.085;
const MUZZLE_FLASH_DEBUG_DURATION_S = 0.25;
const MUZZLE_FLASH_PULSE_SCALE = 0.26;
const MUZZLE_FLASH_PEAK_OPACITY = 1.0;

const MUZZLE_POINT_LIGHT_DISTANCE = 1.6;
const MUZZLE_POINT_LIGHT_DECAY = 2;
const MUZZLE_POINT_LIGHT_INTENSITY_MIN = 1.8;
const MUZZLE_POINT_LIGHT_INTENSITY_MAX = 3.0;

const VIEWMODEL_KICK_IMPULSE_BACK_M = 0.045;
const VIEWMODEL_KICK_IMPULSE_PITCH_RAD = 0.04;
const VIEWMODEL_KICK_IMPULSE_YAW_RAD = 0.014;
const VIEWMODEL_KICK_IMPULSE_ROLL_RAD = 0.012;
const VIEWMODEL_KICK_SPRING_STIFFNESS = 240;
const VIEWMODEL_KICK_SPRING_DAMPING = 22;

// Idle breathing bob: slow sine wave on Y and Z
const BOB_IDLE_FREQ_HZ = 0.85;     // breaths per second
const BOB_IDLE_AMP_Y_M = 0.0014;   // up/down
const BOB_IDLE_AMP_Z_M = 0.0008;   // slight fore-aft

// Walk/run bob: synced to footstep cycle
const BOB_WALK_FREQ_HZ = 1.8;
const BOB_WALK_AMP_Y_M = 0.006;
const BOB_WALK_AMP_X_M = 0.003;    // side-to-side
const BOB_RUN_FREQ_MULT = 1.35;     // run is faster
const BOB_RUN_AMP_MULT  = 1.6;     // and larger

// Sway: weapon lags behind mouse look
const SWAY_STIFFNESS = 6.5;        // spring stiffness for sway settle
const SWAY_DAMPING = 4.2;
const SWAY_MAX_X_M = 0.022;        // left-right limit
const SWAY_MAX_Y_M = 0.014;        // up-down limit
const SWAY_SENSITIVITY = 0.003;    // how much mouse delta maps to sway offset

type Ak47ViewModelOptions = {
  vmDebug: boolean;
};

export type WeaponAlignmentSnapshot = {
  loaded: boolean;
  dot: number;
  angleDeg: number;
};

type SpringState = {
  value: number;
  velocity: number;
};

function createMuzzleFlashTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 250, 214, 1)");
    gradient.addColorStop(0.22, "rgba(255, 214, 132, 0.98)");
    gradient.addColorStop(0.65, "rgba(255, 134, 50, 0.44)");
    gradient.addColorStop(1, "rgba(255, 80, 10, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function stepSpring(state: SpringState, target: number, stiffness: number, damping: number, dt: number): void {
  const clampedDt = Math.max(0, Math.min(0.05, dt));
  if (clampedDt <= 0) return;

  const accel = (target - state.value) * stiffness - state.velocity * damping;
  state.velocity += accel * clampedDt;
  state.value += state.velocity * clampedDt;
}

export class Ak47ViewModel {
  readonly viewModelScene: Scene;
  readonly viewModelCamera: PerspectiveCamera;

  private readonly loader = new GLTFLoader();
  private readonly weaponRoot = new Group();
  private readonly modelRoot = new Group();
  private readonly cameraForward = new Vector3();
  private readonly barrelForward = new Vector3();
  private readonly barrelDirWeapon = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private readonly modelBounds = new Box3();
  private readonly modelBoundsSize = new Vector3();
  private readonly muzzleFlashBasePosWeaponSpace = new Vector3().copy(DEFAULT_MUZZLE_OFFSET_WEAPON_SPACE);
  private readonly muzzleWorldBounds = new Box3();
  private readonly muzzleBestPosWeaponSpace = new Vector3();
  private readonly muzzleCandidateWorldPos = new Vector3();
  private readonly muzzleCandidateWeaponPos = new Vector3();
  private readonly muzzleMeshToWeapon = new Matrix4();
  private readonly weaponWorldInverse = new Matrix4();
  private readonly alignment: WeaponAlignmentSnapshot = {
    loaded: false,
    dot: -1,
    angleDeg: 180,
  };
  private readonly vmDebug: boolean;

  private readonly muzzleFlashTexture = createMuzzleFlashTexture();
  private readonly muzzleFlashMaterial = new SpriteMaterial({
    map: this.muzzleFlashTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    opacity: MUZZLE_FLASH_PEAK_OPACITY,
  });
  private readonly muzzleFlash = new Sprite(this.muzzleFlashMaterial);
  private readonly muzzleFlashLight = new PointLight(
    0xffd7a0,
    0,
    MUZZLE_POINT_LIGHT_DISTANCE,
    MUZZLE_POINT_LIGHT_DECAY,
  );

  private readonly kickBack: SpringState = { value: 0, velocity: 0 };
  private readonly kickPitch: SpringState = { value: 0, velocity: 0 };
  private readonly kickYaw: SpringState = { value: 0, velocity: 0 };
  private readonly kickRoll: SpringState = { value: 0, velocity: 0 };

  // Sway — position offset that lags behind mouse movement
  private readonly swayX: SpringState = { value: 0, velocity: 0 };
  private readonly swayY: SpringState = { value: 0, velocity: 0 };
  private swayTargetX = 0;
  private swayTargetY = 0;

  // Bob — accumulated phase for idle breathing + walk cycle
  private bobPhase = 0; // radians, advances each frame

  // Movement state, fed each frame from bootstrap
  private moveSpeedMps = 0;
  private isGrounded = false;

  // Mouse delta accumulated since last frame (set externally)
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private model: Object3D | null = null;
  private axesHelper: AxesHelper | null = null;
  private muzzleDebugMarker: Mesh | null = null;
  private loadPromise: Promise<void> | null = null;
  private disposed = false;
  private muzzleFlashTimerS = 0;
  private muzzleFlashDurationS = MUZZLE_FLASH_DURATION_S;
  private muzzleFlashBaseScale = 1;
  private muzzleFlashLightPeak = MUZZLE_POINT_LIGHT_INTENSITY_MIN;
  private muzzleFlashRandState = 0x6d2b79f5;
  private shotFxPhase = 1;

  constructor(options: Ak47ViewModelOptions) {
    this.vmDebug = options.vmDebug;

    this.viewModelScene = new Scene();
    this.viewModelCamera = new PerspectiveCamera(VIEWMODEL_FOV_DEG, 1, VIEWMODEL_NEAR, VIEWMODEL_FAR);
    this.viewModelCamera.rotation.order = "YXZ";

    this.weaponRoot.position.copy(BASE_WEAPON_POSE_POSITION);
    this.weaponRoot.rotation.set(BASE_WEAPON_POSE_PITCH_RAD, BASE_WEAPON_POSE_YAW_RAD, BASE_WEAPON_POSE_ROLL_RAD);
    this.viewModelCamera.add(this.weaponRoot);

    this.modelRoot.rotation.set(0, MODEL_FIXUP_YAW_RAD, 0);
    this.weaponRoot.add(this.modelRoot);

    this.muzzleFlash.visible = false;
    this.muzzleFlash.renderOrder = 100;
    this.muzzleFlash.scale.setScalar(MUZZLE_FLASH_SIZE_M);
    this.weaponRoot.add(this.muzzleFlash);

    this.weaponRoot.add(this.muzzleFlashLight);
    this.applyMuzzleFlashBasePosition();

    this.viewModelScene.add(this.viewModelCamera);

    const ambient = new AmbientLight(0xffffff, 1.15);
    const hemi = new HemisphereLight(0xf9fbff, 0x6e7a88, 1.0);
    hemi.position.set(0, 1, 0);
    // Camera-anchored lights keep the gun consistently readable regardless of world lighting.
    const key = new DirectionalLight(0xfff4e6, 1.35);
    key.position.set(0.7, 0.25, -0.35);
    this.viewModelCamera.add(key);

    const fill = new DirectionalLight(0xe9f4ff, 0.7);
    fill.position.set(-0.55, -0.15, -0.25);
    this.viewModelCamera.add(fill);

    const rim = new DirectionalLight(0xc2dbff, 0.55);
    rim.position.set(-0.4, 0.35, 0.7);
    this.viewModelCamera.add(rim);

    this.viewModelScene.add(ambient, hemi);
  }

  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loader.loadAsync(MODEL_URL).then((gltf) => {
      if (this.disposed) return;

      this.model = gltf.scene;
      this.prepareModel(gltf.scene);
      this.fitModelScale(gltf.scene);
      this.modelRoot.add(gltf.scene);
      this.viewModelCamera.updateMatrixWorld(true);
      this.resolveMuzzleFlashWeaponSpace(gltf.scene);

      if (this.vmDebug) {
        this.axesHelper = new AxesHelper(0.2);
        this.modelRoot.add(this.axesHelper);
      }

      this.alignment.loaded = true;
      this.alignment.dot = -1;
      this.alignment.angleDeg = 180;
    });

    return this.loadPromise;
  }

  setAspect(aspect: number): void {
    this.viewModelCamera.aspect = aspect;
    this.viewModelCamera.updateProjectionMatrix();
  }

  /**
   * Feed movement state + raw mouse delta each frame before calling updateFromMainCamera.
   * mouseDeltaX/Y are raw pixel deltas (same units as pointerlockchange movementX/Y).
   */
  setFrameInput(speedMps: number, grounded: boolean, mouseDeltaX: number, mouseDeltaY: number): void {
    this.moveSpeedMps = speedMps;
    this.isGrounded = grounded;
    this.mouseDeltaX = mouseDeltaX;
    this.mouseDeltaY = mouseDeltaY;
  }

  updateFromMainCamera(mainCamera: PerspectiveCamera, deltaSeconds: number): void {
    this.viewModelCamera.quaternion.copy(mainCamera.quaternion);
    this.updateShotFx(deltaSeconds);
    this.viewModelCamera.updateMatrixWorld(true);

    if (!this.alignment.loaded) return;

    mainCamera.getWorldDirection(this.cameraForward);
    this.modelRoot.getWorldQuaternion(this.worldQuaternion);

    this.barrelForward.copy(BARREL_AXIS_LOCAL).applyQuaternion(this.worldQuaternion).normalize();

    const dot = Math.min(1, Math.max(-1, this.cameraForward.dot(this.barrelForward)));
    this.alignment.dot = dot;
    this.alignment.angleDeg = Math.acos(dot) * RAD_TO_DEG;
  }

  triggerShotFx(): void {
    this.applyMuzzleFlashBasePosition();
    this.muzzleFlashDurationS = this.vmDebug ? MUZZLE_FLASH_DEBUG_DURATION_S : MUZZLE_FLASH_DURATION_S;
    this.muzzleFlashTimerS = this.muzzleFlashDurationS;
    this.muzzleFlash.visible = true;

    this.muzzleFlashBaseScale = 0.9 + this.nextMuzzleRand() * 0.35;
    this.muzzleFlash.scale.setScalar(MUZZLE_FLASH_SIZE_M * this.muzzleFlashBaseScale);
    this.muzzleFlashMaterial.rotation = (this.nextMuzzleRand() - 0.5) * Math.PI * 0.7;
    this.muzzleFlashMaterial.opacity = MUZZLE_FLASH_PEAK_OPACITY;

    this.muzzleFlashLightPeak =
      MUZZLE_POINT_LIGHT_INTENSITY_MIN +
      (MUZZLE_POINT_LIGHT_INTENSITY_MAX - MUZZLE_POINT_LIGHT_INTENSITY_MIN) * this.nextMuzzleRand();
    this.muzzleFlashLight.intensity = this.muzzleFlashLightPeak;

    const side = this.shotFxPhase > 0 ? 1 : -1;
    this.shotFxPhase *= -1;

    this.kickBack.velocity += VIEWMODEL_KICK_IMPULSE_BACK_M;
    this.kickPitch.velocity -= VIEWMODEL_KICK_IMPULSE_PITCH_RAD;
    this.kickYaw.velocity += VIEWMODEL_KICK_IMPULSE_YAW_RAD * side;
    this.kickRoll.velocity += VIEWMODEL_KICK_IMPULSE_ROLL_RAD * side;
  }

  getAlignmentSnapshot(): WeaponAlignmentSnapshot {
    return this.alignment;
  }

  dispose(): void {
    this.disposed = true;
    this.axesHelper?.removeFromParent();
    this.axesHelper = null;

    if (this.model) {
      disposeObjectRoot(this.model);
      this.model.removeFromParent();
      this.model = null;
    }

    if (this.muzzleDebugMarker) {
      this.muzzleDebugMarker.removeFromParent();
      this.muzzleDebugMarker.geometry.dispose();
      const markerMaterial = this.muzzleDebugMarker.material as Material | Material[] | undefined;
      if (Array.isArray(markerMaterial)) {
        for (const material of markerMaterial) {
          material.dispose();
        }
      } else {
        markerMaterial?.dispose();
      }
      this.muzzleDebugMarker = null;
    }

    this.muzzleFlash.removeFromParent();
    this.muzzleFlashMaterial.dispose();
    this.muzzleFlashTexture.dispose();
    this.muzzleFlashLight.removeFromParent();
  }

  private fitModelScale(model: Object3D): void {
    this.modelBounds.setFromObject(model);
    const center = this.modelBounds.getCenter(this.modelBoundsSize);
    model.position.sub(center);

    this.modelBounds.setFromObject(model);
    this.modelBounds.getSize(this.modelBoundsSize);

    const maxDimension = Math.max(this.modelBoundsSize.x, this.modelBoundsSize.y, this.modelBoundsSize.z);
    if (maxDimension > 0) {
      const uniformScale = MODEL_TARGET_LENGTH_M / maxDimension;
      this.modelRoot.scale.setScalar(uniformScale);
      this.modelRoot.updateMatrixWorld(true);
    }
  }

  private nextMuzzleRand(): number {
    this.muzzleFlashRandState = (Math.imul(this.muzzleFlashRandState, 1664525) + 1013904223) >>> 0;
    return this.muzzleFlashRandState / 0x1_0000_0000;
  }

  private resolveMuzzleFlashWeaponSpace(model: Object3D): void {
    this.barrelDirWeapon.copy(BARREL_AXIS_LOCAL).applyQuaternion(this.modelRoot.quaternion).normalize();
    if (!Number.isFinite(this.barrelDirWeapon.lengthSq()) || this.barrelDirWeapon.lengthSq() < 1e-8) {
      this.barrelDirWeapon.set(1, 0, 0);
    }

    const resolvedByName = this.resolveMuzzleFromNamedNode(model, this.barrelDirWeapon);
    const resolvedByVertex = resolvedByName || this.resolveMuzzleFromVertexScan(model, this.barrelDirWeapon);
    const resolvedByBounds = resolvedByName || resolvedByVertex || this.resolveMuzzleFromBounds(model, this.barrelDirWeapon);

    if (!resolvedByName && !resolvedByVertex && !resolvedByBounds) {
      this.muzzleFlashBasePosWeaponSpace.copy(DEFAULT_MUZZLE_OFFSET_WEAPON_SPACE);
    }

    this.applyMuzzleFlashBasePosition();
    this.ensureMuzzleDebugMarker();
  }

  private resolveMuzzleFromNamedNode(model: Object3D, barrelDirWeapon: Vector3): boolean {
    let found = false;
    let bestProjection = -Infinity;

    model.traverse((node) => {
      if (!node.name || !MUZZLE_NODE_HINT_RE.test(node.name)) return;

      node.getWorldPosition(this.muzzleCandidateWorldPos);
      this.muzzleCandidateWeaponPos.copy(this.muzzleCandidateWorldPos);
      this.weaponRoot.worldToLocal(this.muzzleCandidateWeaponPos);

      const projection = this.muzzleCandidateWeaponPos.dot(barrelDirWeapon);
      if (projection > bestProjection) {
        bestProjection = projection;
        this.muzzleFlashBasePosWeaponSpace.copy(this.muzzleCandidateWeaponPos);
        found = true;
      }
    });

    return found;
  }

  private resolveMuzzleFromVertexScan(model: Object3D, barrelDirWeapon: Vector3): boolean {
    let found = false;
    let bestProjection = -Infinity;

    this.weaponWorldInverse.copy(this.weaponRoot.matrixWorld).invert();

    model.traverse((node) => {
      const maybeMesh = node as Mesh;
      if (!maybeMesh.isMesh) return;

      const geometry = maybeMesh.geometry;
      if (!geometry) return;

      const position = geometry.getAttribute("position");
      if (!position || position.count <= 0 || position.itemSize < 3) return;

      this.muzzleMeshToWeapon.multiplyMatrices(this.weaponWorldInverse, maybeMesh.matrixWorld);

      for (let i = 0; i < position.count; i += 1) {
        this.muzzleCandidateWeaponPos
          .set(position.getX(i), position.getY(i), position.getZ(i))
          .applyMatrix4(this.muzzleMeshToWeapon);

        const projection = this.muzzleCandidateWeaponPos.dot(barrelDirWeapon);
        if (projection > bestProjection) {
          bestProjection = projection;
          this.muzzleBestPosWeaponSpace.copy(this.muzzleCandidateWeaponPos);
          found = true;
        }
      }
    });

    if (!found) {
      return false;
    }

    this.muzzleFlashBasePosWeaponSpace
      .copy(this.muzzleBestPosWeaponSpace)
      .addScaledVector(barrelDirWeapon, MUZZLE_FORWARD_OFFSET_M);
    return true;
  }

  private resolveMuzzleFromBounds(model: Object3D, barrelDirWeapon: Vector3): boolean {
    this.muzzleWorldBounds.setFromObject(model);
    if (this.muzzleWorldBounds.isEmpty()) {
      return false;
    }

    const min = this.muzzleWorldBounds.min;
    const max = this.muzzleWorldBounds.max;
    let found = false;
    let bestProjection = -Infinity;

    for (let xi = 0; xi < 2; xi += 1) {
      const x = xi === 0 ? min.x : max.x;
      for (let yi = 0; yi < 2; yi += 1) {
        const y = yi === 0 ? min.y : max.y;
        for (let zi = 0; zi < 2; zi += 1) {
          const z = zi === 0 ? min.z : max.z;

          this.muzzleCandidateWorldPos.set(x, y, z);
          this.muzzleCandidateWeaponPos.copy(this.muzzleCandidateWorldPos);
          this.weaponRoot.worldToLocal(this.muzzleCandidateWeaponPos);

          const projection = this.muzzleCandidateWeaponPos.dot(barrelDirWeapon);
          if (projection > bestProjection) {
            bestProjection = projection;
            this.muzzleBestPosWeaponSpace.copy(this.muzzleCandidateWeaponPos);
            found = true;
          }
        }
      }
    }

    if (!found) {
      return false;
    }

    this.muzzleFlashBasePosWeaponSpace
      .copy(this.muzzleBestPosWeaponSpace)
      .addScaledVector(barrelDirWeapon, MUZZLE_FORWARD_OFFSET_M);
    return true;
  }

  private applyMuzzleFlashBasePosition(): void {
    this.muzzleFlash.position.copy(this.muzzleFlashBasePosWeaponSpace);
    this.muzzleFlashLight.position.copy(this.muzzleFlashBasePosWeaponSpace);
    if (this.muzzleDebugMarker) {
      this.muzzleDebugMarker.position.copy(this.muzzleFlashBasePosWeaponSpace);
    }
  }

  private ensureMuzzleDebugMarker(): void {
    if (!this.vmDebug) return;

    if (!this.muzzleDebugMarker) {
      const debugGeometry = new SphereGeometry(MUZZLE_DEBUG_MARKER_RADIUS_M, 10, 8);
      const debugMaterial = new MeshBasicMaterial({
        color: MUZZLE_DEBUG_MARKER_COLOR,
        depthTest: false,
        depthWrite: false,
      });
      this.muzzleDebugMarker = new Mesh(debugGeometry, debugMaterial);
      this.muzzleDebugMarker.renderOrder = 101;
      this.weaponRoot.add(this.muzzleDebugMarker);
    }

    this.muzzleDebugMarker.position.copy(this.muzzleFlashBasePosWeaponSpace);
  }

  private updateShotFx(deltaSeconds: number): void {
    if (this.muzzleFlashTimerS > 0) {
      this.muzzleFlashTimerS = Math.max(0, this.muzzleFlashTimerS - Math.max(0, deltaSeconds));
      const lifeT = this.muzzleFlashDurationS > 0 ? this.muzzleFlashTimerS / this.muzzleFlashDurationS : 0;

      this.muzzleFlash.visible = lifeT > 0;
      this.muzzleFlashMaterial.opacity = MUZZLE_FLASH_PEAK_OPACITY * lifeT * lifeT;
      this.muzzleFlash.scale.setScalar(
        MUZZLE_FLASH_SIZE_M * this.muzzleFlashBaseScale * (1 + (1 - lifeT) * MUZZLE_FLASH_PULSE_SCALE),
      );
      this.muzzleFlashLight.intensity = this.muzzleFlashLightPeak * lifeT * lifeT;
    } else {
      this.muzzleFlash.visible = false;
      this.muzzleFlashMaterial.opacity = 0;
      this.muzzleFlashLight.intensity = 0;
    }

    const dt = Math.max(0, Math.min(0.05, deltaSeconds));

    stepSpring(this.kickBack, 0, VIEWMODEL_KICK_SPRING_STIFFNESS, VIEWMODEL_KICK_SPRING_DAMPING, deltaSeconds);
    stepSpring(this.kickPitch, 0, VIEWMODEL_KICK_SPRING_STIFFNESS, VIEWMODEL_KICK_SPRING_DAMPING, deltaSeconds);
    stepSpring(this.kickYaw, 0, VIEWMODEL_KICK_SPRING_STIFFNESS, VIEWMODEL_KICK_SPRING_DAMPING, deltaSeconds);
    stepSpring(this.kickRoll, 0, VIEWMODEL_KICK_SPRING_STIFFNESS, VIEWMODEL_KICK_SPRING_DAMPING, deltaSeconds);

    // ── Sway: weapon lags behind mouse movement ───────────────────────────
    this.swayTargetX = Math.max(-SWAY_MAX_X_M, Math.min(SWAY_MAX_X_M, -this.mouseDeltaX * SWAY_SENSITIVITY));
    this.swayTargetY = Math.max(-SWAY_MAX_Y_M, Math.min(SWAY_MAX_Y_M,  this.mouseDeltaY * SWAY_SENSITIVITY));
    stepSpring(this.swayX, this.swayTargetX, SWAY_STIFFNESS, SWAY_DAMPING, dt);
    stepSpring(this.swayY, this.swayTargetY, SWAY_STIFFNESS, SWAY_DAMPING, dt);
    // Decay sway target back to zero each frame (mouse delta is per-frame, not persistent)
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // ── Bob: idle breathing + walk/run oscillation ────────────────────────
    const isMoving = this.isGrounded && this.moveSpeedMps > 0.5;
    const isRunning = isMoving && this.moveSpeedMps > 4.5;
    let bobFreq: number;
    let bobAmpY: number;
    let bobAmpX: number;

    if (isMoving) {
      bobFreq = BOB_WALK_FREQ_HZ * (isRunning ? BOB_RUN_FREQ_MULT : 1.0);
      const ampMult = isRunning ? BOB_RUN_AMP_MULT : 1.0;
      bobAmpY = BOB_WALK_AMP_Y_M * ampMult;
      bobAmpX = BOB_WALK_AMP_X_M * ampMult;
    } else {
      bobFreq = BOB_IDLE_FREQ_HZ;
      bobAmpY = BOB_IDLE_AMP_Y_M;
      bobAmpX = 0;
    }

    this.bobPhase += bobFreq * Math.PI * 2 * dt;

    const bobX = isMoving ? Math.sin(this.bobPhase * 0.5) * bobAmpX : 0;     // side-to-side (half-freq)
    const bobY = Math.sin(this.bobPhase) * bobAmpY;                           // up-down (full-freq)
    const bobZ = isMoving ? BOB_IDLE_AMP_Z_M * Math.cos(this.bobPhase) : 0;  // fore-aft (when walking)

    // ── Apply all offsets to weaponRoot ───────────────────────────────────
    this.weaponRoot.position.set(
      BASE_WEAPON_POSE_POSITION.x + this.swayX.value + bobX,
      BASE_WEAPON_POSE_POSITION.y + this.swayY.value + bobY,
      BASE_WEAPON_POSE_POSITION.z + this.kickBack.value + bobZ,
    );

    this.weaponRoot.rotation.set(
      BASE_WEAPON_POSE_PITCH_RAD + this.kickPitch.value,
      BASE_WEAPON_POSE_YAW_RAD + this.kickYaw.value,
      BASE_WEAPON_POSE_ROLL_RAD + this.kickRoll.value,
    );
  }

  private prepareModel(model: Object3D): void {
    model.traverse((child) => {
      const maybeMesh = child as Mesh;
      if (maybeMesh.isMesh) {
        maybeMesh.frustumCulled = false;
        this.tuneMeshMaterials(maybeMesh);
      }
    });
  }

  private tuneMeshMaterials(mesh: Mesh): void {
    const applyToMaterial = (material: Material): void => {
      const maybeStandard = material as MeshStandardMaterial;
      if (!("isMeshStandardMaterial" in maybeStandard) || !maybeStandard.isMeshStandardMaterial) return;

      // Sketchfab PBR exports can appear too dark without environment reflections.
      maybeStandard.metalness = Math.min(maybeStandard.metalness, 0.35);
      maybeStandard.roughness = Math.max(maybeStandard.roughness, 0.42);
      maybeStandard.envMapIntensity = 0.15;
      maybeStandard.needsUpdate = true;
    };

    const maybeMaterial = (mesh as { material?: Material | Material[] }).material;
    if (Array.isArray(maybeMaterial)) {
      for (const material of maybeMaterial) {
        applyToMaterial(material);
      }
      return;
    }
    if (maybeMaterial) {
      applyToMaterial(maybeMaterial);
    }
  }
}
