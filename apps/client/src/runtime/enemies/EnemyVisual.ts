import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeObjectRoot } from "../utils/disposeObjectRoot";

const MODEL_URL = "/assets/models/characters/enemy_raider/model.glb";
const MODEL_TARGET_HEIGHT_M = 1.8;
const MODEL_FACING_FIXUP_YAW_RAD = Math.PI * 0.5;
const MODEL_BARREL_AXIS_LOCAL = new Vector3(1, 0, 0);
const MUZZLE_FORWARD_OFFSET_M = 0.03;
const MUZZLE_MIN_HEIGHT_RATIO = 0.45;
const MUZZLE_CENTERLINE_Z_RATIO = 0.7;
const MUZZLE_FALLBACK_HEIGHT_RATIO = 0.63;

const BODY_RADIUS_M = 0.28;
const BODY_HEIGHT_M = 1.2;
const HEAD_RADIUS_M = 0.18;
const HEAD_Y_OFFSET = 1.4;
const FALLBACK_MUZZLE_X_OFFSET = 0.24;
const FALLBACK_MUZZLE_Y_OFFSET = 1.1;
const FALLBACK_MUZZLE_Z_OFFSET = 0.38;
const NAME_Y_OFFSET = 2.2;

const BODY_COLOR = 0x2a2e2a;
const HEAD_COLOR = 0x3a2e28;

const MUZZLE_FLASH_DURATION_S = 0.085;

type EnemyModelTemplate = {
  template: Object3D;
  center: Vector3;
  minY: number;
  sizeY: number;
  muzzleLocal: Vector3;
};

let enemyModelTemplatePromise: Promise<EnemyModelTemplate> | null = null;

function loadEnemyModelTemplate(sharedGltfLoader: GLTFLoader): Promise<EnemyModelTemplate> {
  if (enemyModelTemplatePromise) return enemyModelTemplatePromise;

  enemyModelTemplatePromise = sharedGltfLoader.loadAsync(MODEL_URL)
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true);

      const bounds = new Box3().setFromObject(gltf.scene);
      const size = new Vector3();
      const center = new Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);

      const minMuzzleY = bounds.min.y + size.y * MUZZLE_MIN_HEIGHT_RATIO;
      const maxMuzzleAbsZ = size.z * MUZZLE_CENTERLINE_Z_RATIO;
      const rootWorldInverse = new Matrix4().copy(gltf.scene.matrixWorld).invert();
      const vertexWorld = new Vector3();
      const vertexRootLocal = new Vector3();
      const bestMuzzle = new Vector3();
      let bestProjection = -Infinity;

      gltf.scene.traverse((child) => {
        const maybeMesh = child as Mesh;
        if (!maybeMesh.isMesh) return;
        const positionAttr = maybeMesh.geometry?.getAttribute("position");
        if (!positionAttr || positionAttr.itemSize < 3) return;

        const step = positionAttr.count > 20000 ? 2 : 1;
        for (let i = 0; i < positionAttr.count; i += step) {
          vertexRootLocal
            .set(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i))
            .applyMatrix4(maybeMesh.matrixWorld);
          vertexWorld.copy(vertexRootLocal).applyMatrix4(rootWorldInverse);

          if (vertexWorld.y < minMuzzleY) continue;
          if (Math.abs(vertexWorld.z - center.z) > maxMuzzleAbsZ) continue;

          const projection = vertexWorld.dot(MODEL_BARREL_AXIS_LOCAL);
          if (projection > bestProjection) {
            bestProjection = projection;
            bestMuzzle.copy(vertexWorld);
          }
        }
      });

      const muzzleLocal = Number.isFinite(bestProjection)
        ? bestMuzzle
        : new Vector3(
          bounds.max.x,
          bounds.min.y + size.y * MUZZLE_FALLBACK_HEIGHT_RATIO,
          center.z,
        );
      muzzleLocal.addScaledVector(MODEL_BARREL_AXIS_LOCAL, MUZZLE_FORWARD_OFFSET_M);

      return {
        template: gltf.scene,
        center,
        minY: bounds.min.y,
        sizeY: Math.max(0.001, size.y),
        muzzleLocal,
      };
    })
    .catch((error) => {
      // Allow retry if the first load fails.
      enemyModelTemplatePromise = null;
      throw error;
    });

  return enemyModelTemplatePromise;
}

function createNameTagTexture(name: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Dark pill background
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.beginPath();
    const maybeRoundRect = (ctx as CanvasRenderingContext2D & {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    }).roundRect;
    if (typeof maybeRoundRect === "function") {
      maybeRoundRect.call(ctx, 4, 4, 248, 56, 10);
    } else {
      ctx.rect(4, 4, 248, 56);
    }
    ctx.fill();

    // Name text
    ctx.fillStyle = "#e8f4ff";
    ctx.font = "bold 30px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 128, 34);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createMuzzleFlashTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0,    "rgba(255,250,214,1)");
  g.addColorStop(0.22, "rgba(255,214,132,0.98)");
  g.addColorStop(0.65, "rgba(255,134,50,0.44)");
  g.addColorStop(1,    "rgba(255,80,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class EnemyVisual {
  private readonly root: Group;
  private readonly bodyMesh: Mesh;
  private readonly headMesh: Mesh;
  private readonly bodyMat: MeshStandardMaterial;
  private readonly headMat: MeshStandardMaterial;
  private modelRoot: Group | null = null;
  private modelFadeMaterials: Material[] = [];
  private readonly nameSprite: Sprite;
  private readonly nameTexture: CanvasTexture;
  private readonly nameMaterial: SpriteMaterial;
  private readonly muzzleAnchor: Group;

  // Death fade
  private fadingOut = false;
  private fadeTimerS = 0;
  private readonly FADE_DURATION_S = 0.6;

  // Muzzle flash
  private muzzleFlash: Sprite | null = null;
  private muzzleFlashMat: SpriteMaterial | null = null;
  private muzzleFlashTex: CanvasTexture | null = null;
  private muzzleLight: PointLight | null = null;
  private muzzleTimerS = 0;
  private muzzleBaseScale = 1;
  private muzzleLightPeak = 0;
  private muzzleRandState = 0xdeadbeef;

  constructor(name: string, scene: Scene, sharedGltfLoader: GLTFLoader) {
    this.root = new Group();

    // Body — cylinder (foot at y=0, top at y=BODY_HEIGHT_M)
    const bodyGeo = new CylinderGeometry(BODY_RADIUS_M, BODY_RADIUS_M, BODY_HEIGHT_M, 8);
    this.bodyMat = new MeshStandardMaterial({
      color: BODY_COLOR,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true, // pre-enabled so death fade avoids render-order glitch
    });
    this.bodyMesh = new Mesh(bodyGeo, this.bodyMat);
    this.bodyMesh.position.y = BODY_HEIGHT_M * 0.5; // center cylinder at half height
    this.root.add(this.bodyMesh);

    // Head — sphere
    const headGeo = new SphereGeometry(HEAD_RADIUS_M, 8, 6);
    this.headMat = new MeshStandardMaterial({
      color: HEAD_COLOR,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true, // pre-enabled so death fade avoids render-order glitch
    });
    this.headMesh = new Mesh(headGeo, this.headMat);
    this.headMesh.position.y = HEAD_Y_OFFSET;
    this.root.add(this.headMesh);

    // Name tag sprite
    this.nameTexture = createNameTagTexture(name);
    this.nameMaterial = new SpriteMaterial({
      map: this.nameTexture,
      transparent: true,
      depthTest: false,
    });
    this.nameSprite = new Sprite(this.nameMaterial);
    this.nameSprite.position.y = NAME_Y_OFFSET;
    this.nameSprite.scale.set(1.2, 0.3, 1.0);
    this.root.add(this.nameSprite);

    this.muzzleAnchor = new Group();
    this.muzzleAnchor.position.set(FALLBACK_MUZZLE_X_OFFSET, FALLBACK_MUZZLE_Y_OFFSET, FALLBACK_MUZZLE_Z_OFFSET);
    this.root.add(this.muzzleAnchor);

    // Create muzzle flash regardless of model load state.
    this.muzzleFlashTex = createMuzzleFlashTexture();
    this.muzzleFlashMat = new SpriteMaterial({
      map: this.muzzleFlashTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      opacity: 0,
    });
    this.muzzleFlash = new Sprite(this.muzzleFlashMat);
    this.muzzleFlash.visible = false;
    this.muzzleFlash.renderOrder = 100;
    this.muzzleFlash.position.set(0, 0, 0);
    this.muzzleFlash.scale.setScalar(0.15);
    this.muzzleAnchor.add(this.muzzleFlash);

    this.muzzleLight = new PointLight(0xffd7a0, 0, 3.0, 2);
    this.muzzleLight.position.set(0, 0, 0);
    this.muzzleAnchor.add(this.muzzleLight);

    // Load enemy GLB once, then clone per enemy instance.
    // This avoids repeated glTF parse/texture setup work per spawn.
    loadEnemyModelTemplate(sharedGltfLoader).then((templateData) => {
      const modelInstance = cloneSkeleton(templateData.template);
      const fadeMaterials: Material[] = [];

      modelInstance.traverse((child) => {
        const maybeMesh = child as Mesh;
        if (!maybeMesh.isMesh) return;
        const meshMaterial = maybeMesh.material;
        if (Array.isArray(meshMaterial)) {
          maybeMesh.material = meshMaterial.map((mat) => {
            const cloned = (mat as Material).clone();
            fadeMaterials.push(cloned);
            return cloned;
          });
        } else {
          const cloned = (meshMaterial as Material).clone();
          maybeMesh.material = cloned;
          fadeMaterials.push(cloned);
        }
      });

      this.modelFadeMaterials = fadeMaterials;

      this.modelRoot = new Group();
      this.modelRoot.rotation.y = MODEL_FACING_FIXUP_YAW_RAD;
      this.modelRoot.scale.setScalar(MODEL_TARGET_HEIGHT_M / templateData.sizeY);
      modelInstance.position.set(
        -templateData.center.x,
        -templateData.minY,
        -templateData.center.z,
      );
      this.modelRoot.add(modelInstance);
      this.muzzleAnchor.position.copy(templateData.muzzleLocal).add(modelInstance.position);
      this.modelRoot.add(this.muzzleAnchor);
      this.root.add(this.modelRoot);

      this.bodyMesh.visible = false;
      this.headMesh.visible = false;
      this.nameSprite.position.y = Math.max(NAME_Y_OFFSET, MODEL_TARGET_HEIGHT_M + 0.4);
    }).catch(() => {
      // Model load failed — fallback body/head remain visible.
    });

    scene.add(this.root);
  }

  update(x: number, y: number, z: number, yaw: number, isAlive: boolean): void {
    // When fading out, only update position so the corpse stays in place.
    // Visibility and yaw are controlled by the fade logic.
    if (this.fadingOut) {
      this.root.position.set(x, y, z);
      return;
    }
    this.root.visible = isAlive;
    if (!isAlive) return;

    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  reset(): void {
    this.fadingOut = false;
    this.fadeTimerS = 0;
    this.root.visible = true;

    this.bodyMat.opacity = 1;
    this.headMat.opacity = 1;
    this.nameMaterial.opacity = 1;
    for (const mat of this.modelFadeMaterials) {
      mat.opacity = 1;
      mat.depthWrite = true;
    }

    this.muzzleTimerS = 0;
    this.muzzleBaseScale = 1;
    this.muzzleLightPeak = 0;
    if (this.muzzleFlash) this.muzzleFlash.visible = false;
    if (this.muzzleFlashMat) this.muzzleFlashMat.opacity = 0;
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
  }

  startDeathFade(): void {
    if (this.fadingOut) return;
    this.fadingOut = true;
    this.fadeTimerS = this.FADE_DURATION_S;
    this.root.visible = true;
    // Kill any muzzle flash immediately
    if (this.muzzleFlash) this.muzzleFlash.visible = false;
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
    this.muzzleTimerS = 0;

    for (const mat of this.modelFadeMaterials) {
      if (!mat.transparent) {
        mat.transparent = true;
        mat.needsUpdate = true;
      }
      mat.depthWrite = false;
    }
  }

  /** Returns true when the fade is fully complete. */
  updateDeathFade(dt: number): boolean {
    if (!this.fadingOut) return false;

    this.fadeTimerS = Math.max(0, this.fadeTimerS - dt);
    const t = this.fadeTimerS / this.FADE_DURATION_S; // 1.0 → 0.0

    this.bodyMat.opacity = t;
    this.headMat.opacity = t;
    this.nameMaterial.opacity = t;
    for (const mat of this.modelFadeMaterials) {
      mat.opacity = t;
    }
    if (this.muzzleFlashMat) this.muzzleFlashMat.opacity = 0;

    if (this.fadeTimerS <= 0) {
      this.root.visible = false;
      return true; // complete
    }
    return false;
  }

  isFadingOut(): boolean {
    return this.fadingOut;
  }

  triggerShotFx(): void {
    if (!this.muzzleFlash || !this.muzzleFlashMat || !this.muzzleLight) return;

    this.muzzleTimerS = MUZZLE_FLASH_DURATION_S;
    this.muzzleFlash.visible = true;
    this.muzzleBaseScale = 0.9 + this.nextRand() * 0.35;
    this.muzzleFlash.scale.setScalar(0.15 * this.muzzleBaseScale);
    this.muzzleFlashMat.opacity = 1.0;
    this.muzzleFlashMat.rotation = (this.nextRand() - 0.5) * Math.PI * 0.7;
    this.muzzleLightPeak = 1.5 + this.nextRand() * 1.5;
    this.muzzleLight.intensity = this.muzzleLightPeak;
  }

  updateFx(dt: number): void {
    if (this.muzzleTimerS <= 0) {
      if (this.muzzleFlash) this.muzzleFlash.visible = false;
      if (this.muzzleLight) this.muzzleLight.intensity = 0;
      return;
    }
    this.muzzleTimerS = Math.max(0, this.muzzleTimerS - dt);
    const lifeT = this.muzzleTimerS / MUZZLE_FLASH_DURATION_S;
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = lifeT > 0;
      this.muzzleFlashMat!.opacity = lifeT * lifeT;
      this.muzzleFlash.scale.setScalar(0.15 * this.muzzleBaseScale * (1 + (1 - lifeT) * 0.26));
    }
    if (this.muzzleLight) {
      this.muzzleLight.intensity = this.muzzleLightPeak * lifeT * lifeT;
    }
  }

  dispose(scene: Scene): void {
    scene.remove(this.root);
    disposeObjectRoot(this.root);
    this.nameTexture.dispose();
    this.nameMaterial.dispose();
    if (this.muzzleFlashTex) {
      this.muzzleFlashTex.dispose();
      this.muzzleFlashTex = null;
    }
    if (this.muzzleFlashMat) {
      this.muzzleFlashMat.dispose();
      this.muzzleFlashMat = null;
    }
    for (const mat of this.modelFadeMaterials) {
      mat.dispose();
    }
    this.modelFadeMaterials = [];
  }

  private nextRand(): number {
    this.muzzleRandState = (Math.imul(this.muzzleRandState, 1664525) + 1013904223) >>> 0;
    return this.muzzleRandState / 0x1_0000_0000;
  }
}
