import {
  AmbientLight,
  AxesHelper,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
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

const WEAPON_POSE_POSITION = new Vector3(0.2, -0.18, -0.52);
const WEAPON_POSE_ROLL_RAD = -0.09;

type Ak47ViewModelOptions = {
  vmDebug: boolean;
};

export type WeaponAlignmentSnapshot = {
  loaded: boolean;
  dot: number;
  angleDeg: number;
};

export class Ak47ViewModel {
  readonly viewModelScene: Scene;
  readonly viewModelCamera: PerspectiveCamera;

  private readonly loader = new GLTFLoader();
  private readonly weaponRoot = new Group();
  private readonly modelRoot = new Group();
  private readonly cameraForward = new Vector3();
  private readonly barrelForward = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private readonly modelBounds = new Box3();
  private readonly modelBoundsSize = new Vector3();
  private readonly alignment: WeaponAlignmentSnapshot = {
    loaded: false,
    dot: -1,
    angleDeg: 180,
  };
  private readonly vmDebug: boolean;

  private model: Object3D | null = null;
  private axesHelper: AxesHelper | null = null;
  private loadPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(options: Ak47ViewModelOptions) {
    this.vmDebug = options.vmDebug;

    this.viewModelScene = new Scene();
    this.viewModelCamera = new PerspectiveCamera(VIEWMODEL_FOV_DEG, 1, VIEWMODEL_NEAR, VIEWMODEL_FAR);
    this.viewModelCamera.rotation.order = "YXZ";

    this.weaponRoot.position.copy(WEAPON_POSE_POSITION);
    this.weaponRoot.rotation.set(0, 0, WEAPON_POSE_ROLL_RAD);
    this.viewModelCamera.add(this.weaponRoot);

    this.modelRoot.rotation.set(0, MODEL_FIXUP_YAW_RAD, 0);
    this.weaponRoot.add(this.modelRoot);

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

  updateFromMainCamera(mainCamera: PerspectiveCamera): void {
    this.viewModelCamera.quaternion.copy(mainCamera.quaternion);
    this.viewModelCamera.updateMatrixWorld(true);

    if (!this.alignment.loaded) return;

    mainCamera.getWorldDirection(this.cameraForward);
    this.modelRoot.getWorldQuaternion(this.worldQuaternion);

    this.barrelForward.copy(BARREL_AXIS_LOCAL).applyQuaternion(this.worldQuaternion).normalize();

    const dot = Math.min(1, Math.max(-1, this.cameraForward.dot(this.barrelForward)));
    this.alignment.dot = dot;
    this.alignment.angleDeg = Math.acos(dot) * RAD_TO_DEG;
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
