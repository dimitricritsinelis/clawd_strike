import {
  CanvasTexture,
  FrontSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Scene,
} from "three";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import { ImpactParticle } from "./ImpactParticle";

const MAX_DECALS = 128;
const DECAL_SIZE_BASE_M = 0.4;
const DECAL_SIZE_VARIATION = 0.2;
const DECAL_OFFSET_M = 0.005;
const TAU = Math.PI * 2;

// Scratch objects — reused every spawn to avoid allocation
const _normal = new Vector3();
const _position = new Vector3();
const _zAxis = new Vector3(0, 0, 1);
const _quat = new Quaternion();
const _jitterQuat = new Quaternion();
const _dummy = new Object3D();

function createBulletHoleTexture(size = 512): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer chip / spall ring — large debris scatter visible on any surface
  const chipGrad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 0.85);
  chipGrad.addColorStop(0, "rgba(80, 70, 55, 0.0)");
  chipGrad.addColorStop(0.2, "rgba(60, 50, 40, 0.5)");
  chipGrad.addColorStop(0.5, "rgba(80, 70, 55, 0.3)");
  chipGrad.addColorStop(0.8, "rgba(50, 45, 35, 0.15)");
  chipGrad.addColorStop(1, "rgba(40, 35, 28, 0)");
  ctx.fillStyle = chipGrad;
  ctx.fillRect(0, 0, size, size);

  // Dark scorch ring around crater — very prominent
  const scorchGrad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 0.5);
  scorchGrad.addColorStop(0, "rgba(10, 8, 5, 0.0)");
  scorchGrad.addColorStop(0.25, "rgba(15, 12, 8, 0.9)");
  scorchGrad.addColorStop(0.55, "rgba(25, 20, 15, 0.7)");
  scorchGrad.addColorStop(0.8, "rgba(40, 35, 28, 0.35)");
  scorchGrad.addColorStop(1, "rgba(50, 45, 35, 0.0)");
  ctx.fillStyle = scorchGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, TAU);
  ctx.fill();

  // Inner crater — large deep dark center
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.25);
  innerGrad.addColorStop(0, "rgba(2, 1, 1, 1.0)");
  innerGrad.addColorStop(0.5, "rgba(8, 6, 4, 0.98)");
  innerGrad.addColorStop(0.8, "rgba(15, 12, 10, 0.9)");
  innerGrad.addColorStop(1, "rgba(25, 20, 15, 0.7)");
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, TAU);
  ctx.fill();

  // Radial crack lines — thick and bold
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const crackAngles = [0.3, 1.1, 1.9, 2.7, 3.5, 4.3, 5.1, 5.8];
  const crackLengths = [0.65, 0.52, 0.7, 0.55, 0.62, 0.48, 0.58, 0.45];
  for (let i = 0; i < 8; i++) {
    const angle = crackAngles[i]!;
    const len = r * crackLengths[i]!;
    // Dark crack line
    ctx.strokeStyle = "rgba(10, 8, 5, 0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r * 0.08, cy + Math.sin(angle) * r * 0.08);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
    // Light debris highlight alongside crack
    ctx.strokeStyle = "rgba(160, 145, 120, 0.3)";
    ctx.lineWidth = 2;
    const off = 0.05;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle + off) * r * 0.15, cy + Math.sin(angle + off) * r * 0.15);
    ctx.lineTo(cx + Math.cos(angle + off) * len * 0.8, cy + Math.sin(angle + off) * len * 0.8);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class BulletHoleManager {
  private readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly rng: DeterministicRng;
  private readonly impactParticle: ImpactParticle;
  private nextIndex = 0;
  private count = 0;

  constructor(scene: Scene, seed: number) {
    this.rng = new DeterministicRng(deriveSubSeed(seed, "bullet-holes"));

    const texture = createBulletHoleTexture();
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: FrontSide,
      color: 0xffffff,
    });

    const geometry = new PlaneGeometry(1, 1);
    this.mesh = new InstancedMesh(geometry, material, MAX_DECALS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);

    this.impactParticle = new ImpactParticle(scene);
  }

  spawn(
    hitPoint: { x: number; y: number; z: number },
    hitNormal: { x: number; y: number; z: number },
  ): void {
    _normal.set(hitNormal.x, hitNormal.y, hitNormal.z);
    _position.set(hitPoint.x, hitPoint.y, hitPoint.z).addScaledVector(_normal, DECAL_OFFSET_M);

    // Orient plane to face along the surface normal
    _quat.setFromUnitVectors(_zAxis, _normal);

    // Random rotation jitter around normal
    const jitterAngle = this.rng.next() * TAU;
    _jitterQuat.setFromAxisAngle(_normal, jitterAngle);
    _quat.premultiply(_jitterQuat);

    // Random scale variation
    const scale = DECAL_SIZE_BASE_M * (1 + (this.rng.next() - 0.5) * 2 * DECAL_SIZE_VARIATION);

    _dummy.position.copy(_position);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.setScalar(scale);
    _dummy.updateMatrix();

    this.mesh.setMatrixAt(this.nextIndex, _dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.count < MAX_DECALS) {
      this.count++;
      this.mesh.count = this.count;
    }
    this.nextIndex = (this.nextIndex + 1) % MAX_DECALS;

    // Trigger dust puff
    this.impactParticle.emit(hitPoint, hitNormal);
  }

  update(dt: number): void {
    this.impactParticle.update(dt);
  }

  clear(): void {
    this.count = 0;
    this.nextIndex = 0;
    this.mesh.count = 0;
    this.rng.reset();
    this.impactParticle.clear();
  }

  dispose(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).map?.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.impactParticle.dispose(scene);
  }
}
