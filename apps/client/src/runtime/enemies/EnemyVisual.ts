import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  CylinderGeometry,
  Group,
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
import { disposeObjectRoot } from "../utils/disposeObjectRoot";

const MODEL_URL = "/assets/models/weapons/ak47/ak47.glb";
const MODEL_FIXUP_YAW_RAD = Math.PI / 2;
const GUN_TARGET_LENGTH_M = 0.65;

const BODY_RADIUS_M = 0.28;
const BODY_HEIGHT_M = 1.2;
const HEAD_RADIUS_M = 0.18;
const HEAD_Y_OFFSET = 1.4;
const GUN_Y_OFFSET = 1.0;
const GUN_X_OFFSET = 0.22;
const NAME_Y_OFFSET = 2.2;

const BODY_COLOR = 0x2a2e2a;
const HEAD_COLOR = 0x3a2e28;

const MUZZLE_FLASH_DURATION_S = 0.085;

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
  private gunRoot: Group | null = null;
  private gunModel: Object3D | null = null;
  private readonly nameSprite: Sprite;
  private readonly nameTexture: CanvasTexture;
  private readonly nameMaterial: SpriteMaterial;

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

    // Load gun GLB asynchronously
    sharedGltfLoader.loadAsync(MODEL_URL).then((gltf) => {
      this.gunModel = gltf.scene;

      // Darken gun materials to distinguish from player's pristine gun
      gltf.scene.traverse((child) => {
        const maybeMesh = child as Mesh;
        if (!maybeMesh.isMesh) return;
        const maybeMat = maybeMesh.material;
        if (!maybeMat) return;

        const applyDarken = (mat: MeshStandardMaterial): void => {
          if (!mat.isMeshStandardMaterial) return;
          mat.color.multiplyScalar(0.4);
          mat.roughness = Math.max(mat.roughness, 0.75);
          mat.metalness = Math.min(mat.metalness, 0.2);
          mat.needsUpdate = true;
        };

        if (Array.isArray(maybeMat)) {
          for (const m of maybeMat) applyDarken(m as MeshStandardMaterial);
        } else {
          applyDarken(maybeMat as MeshStandardMaterial);
        }
      });

      // Scale gun to target length
      const bounds = new Box3().setFromObject(gltf.scene);
      const size = new Vector3();
      bounds.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);

      this.gunRoot = new Group();
      // Barrel fixup: same rotation as Ak47ViewModel so barrel faces enemy's +Z forward
      this.gunRoot.rotation.y = MODEL_FIXUP_YAW_RAD;
      if (maxDim > 0) {
        this.gunRoot.scale.setScalar(GUN_TARGET_LENGTH_M / maxDim);
      }
      this.gunRoot.add(gltf.scene);

      // Position at arm/shoulder level, slightly to the right of center
      this.gunRoot.position.set(GUN_X_OFFSET, GUN_Y_OFFSET, 0);

      this.root.add(this.gunRoot);

      // ── Muzzle flash sprite ─────────────────────────────────────────────────
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
      // Position at muzzle tip: forward along barrel in gunRoot-local coords.
      // gunRoot faces +Z in world when enemy faces forward; local -Z = barrel tip.
      this.muzzleFlash.position.set(0, 0, -0.5);
      this.muzzleFlash.scale.setScalar(0.15);
      this.gunRoot.add(this.muzzleFlash);

      // ── Point light at muzzle ───────────────────────────────────────────────
      this.muzzleLight = new PointLight(0xffd7a0, 0, 3.0, 2);
      this.muzzleLight.position.set(0, 0, -0.5);
      this.gunRoot.add(this.muzzleLight);
    }).catch(() => {
      // Gun model load failed — enemy still functions without the visual gun
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

  startDeathFade(): void {
    if (this.fadingOut) return;
    this.fadingOut = true;
    this.fadeTimerS = this.FADE_DURATION_S;
    this.root.visible = true;
    // Kill any muzzle flash immediately
    if (this.muzzleFlash) this.muzzleFlash.visible = false;
    if (this.muzzleLight) this.muzzleLight.intensity = 0;
    this.muzzleTimerS = 0;
  }

  /** Returns true when the fade is fully complete. */
  updateDeathFade(dt: number): boolean {
    if (!this.fadingOut) return false;

    this.fadeTimerS = Math.max(0, this.fadeTimerS - dt);
    const t = this.fadeTimerS / this.FADE_DURATION_S; // 1.0 → 0.0

    this.bodyMat.opacity = t;
    this.headMat.opacity = t;
    this.nameMaterial.opacity = t;
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
    if (this.gunModel) {
      disposeObjectRoot(this.gunModel);
    }
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
  }

  private nextRand(): number {
    this.muzzleRandState = (Math.imul(this.muzzleRandState, 1664525) + 1013904223) >>> 0;
    return this.muzzleRandState / 0x1_0000_0000;
  }
}
