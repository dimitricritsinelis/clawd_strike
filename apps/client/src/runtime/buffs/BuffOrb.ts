import {
  AdditiveBlending,
  CanvasTexture,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Mesh,
  Object3D,
  PlaneGeometry,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
  type Scene,
} from "three";
import {
  type BuffType,
  type BuffDefinition,
  BUFF_DEFINITIONS,
  BUFF_TYPES,
  ORB_RADIUS_M,
  ORB_BOB_AMPLITUDE_M,
  ORB_BOB_FREQUENCY_HZ,
  ORB_LIFETIME_S,
  ORB_SPAWN_HEIGHT_OFFSET_M,
} from "./BuffTypes";
import { type SlabAabb } from "../sim/collision/rayVsAabb";

const TWO_PI = Math.PI * 2;
const INITIAL_RENDER_CAPACITY = 8;
const RENDER_CAPACITY_CHUNK = 8;
const TYPE_PHASE_BY_BUFF: Record<BuffType, number> = {
  speed_boost: 0,
  rapid_fire: 0.85,
  unlimited_ammo: 1.65,
  health_boost: 2.35,
};

type OrbMaterialSet = {
  core: MeshBasicMaterial;
  innerGlow: MeshBasicMaterial;
  outerGlow: MeshBasicMaterial;
  energy: MeshBasicMaterial;
};

type OrbLayerSet = {
  core: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  innerGlow: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  outerGlow: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  energy: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
};

type OrbBucket = {
  type: BuffType;
  materials: OrbMaterialSet;
  layers: OrbLayerSet;
};

let sharedCoreGeometry: SphereGeometry | null = null;
let sharedBillboardGeometry: PlaneGeometry | null = null;
let sharedGlowTexture: CanvasTexture | null = null;
let sharedEnergyTexture: CanvasTexture | null = null;
const materialCache = new Map<BuffType, OrbMaterialSet>();
const WARMUP_KEEPER_NAME = "buff-orb-warmup-keeper";

const sphereDummy = new Object3D();
const billboardDummy = new Object3D();
const scratchForward = new Vector3();

function getSharedCoreGeometry(): SphereGeometry {
  if (!sharedCoreGeometry) {
    sharedCoreGeometry = new SphereGeometry(ORB_RADIUS_M, 16, 12);
  }
  return sharedCoreGeometry;
}

function getSharedBillboardGeometry(): PlaneGeometry {
  if (!sharedBillboardGeometry) {
    sharedBillboardGeometry = new PlaneGeometry(1, 1);
  }
  return sharedBillboardGeometry;
}

function createGlowTexture(size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size * 0.5;

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  grad.addColorStop(0.18, "rgba(255, 255, 255, 0.80)");
  grad.addColorStop(0.42, "rgba(255, 255, 255, 0.36)");
  grad.addColorStop(0.72, "rgba(255, 255, 255, 0.10)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createEnergyTexture(size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size * 0.5;

  ctx.clearRect(0, 0, size, size);

  const baseGrad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  baseGrad.addColorStop(0, "rgba(255, 255, 255, 0.38)");
  baseGrad.addColorStop(0.32, "rgba(255, 255, 255, 0.20)");
  baseGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.05)");
  baseGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.lineCap = "round";
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * TWO_PI + Math.random() * 0.4;
    const innerR = size * (0.16 + Math.random() * 0.04);
    const outerR = size * (0.34 + Math.random() * 0.1);
    const ctrlR = size * (0.28 + Math.random() * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cx + Math.sin(angle) * innerR);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle + 0.55) * ctrlR,
      cx + Math.sin(angle + 0.55) * ctrlR,
      cx + Math.cos(angle + 0.95) * outerR,
      cx + Math.sin(angle + 0.95) * outerR,
    );
    ctx.stroke();
  }

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % size;
    const py = Math.floor(i / 4 / size);
    const dist = Math.hypot(px - cx, py - cx) / cx;
    if (dist > 1) continue;
    if (Math.random() < 0.028 * (1 - dist)) {
      const brightness = 0.7 + Math.random() * 0.3;
      data[i] = Math.min(255, data[i]! + 255 * brightness);
      data[i + 1] = Math.min(255, data[i + 1]! + 255 * brightness);
      data[i + 2] = Math.min(255, data[i + 2]! + 255 * brightness);
      data[i + 3] = Math.min(255, data[i + 3]! + 220 * brightness);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function getSharedGlowTexture(): CanvasTexture {
  if (!sharedGlowTexture) {
    sharedGlowTexture = createGlowTexture(128);
  }
  return sharedGlowTexture;
}

function getSharedEnergyTexture(): CanvasTexture {
  if (!sharedEnergyTexture) {
    sharedEnergyTexture = createEnergyTexture(128);
  }
  return sharedEnergyTexture;
}

function getMaterialSet(definition: BuffDefinition): OrbMaterialSet {
  let materials = materialCache.get(definition.type);
  if (materials) return materials;

  materials = {
    core: new MeshBasicMaterial({
      color: definition.orbColor,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
    innerGlow: new MeshBasicMaterial({
      color: definition.orbColor,
      map: getSharedGlowTexture(),
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    outerGlow: new MeshBasicMaterial({
      color: definition.orbEmissive,
      map: getSharedGlowTexture(),
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    energy: new MeshBasicMaterial({
      color: definition.orbColor,
      map: getSharedEnergyTexture(),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  };

  materialCache.set(definition.type, materials);
  return materials;
}

function createSphereMesh(capacity: number, material: MeshBasicMaterial): InstancedMesh<SphereGeometry, MeshBasicMaterial> {
  const mesh = new InstancedMesh(getSharedCoreGeometry(), material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function createBillboardMesh(capacity: number, material: MeshBasicMaterial): InstancedMesh<PlaneGeometry, MeshBasicMaterial> {
  const mesh = new InstancedMesh(getSharedBillboardGeometry(), material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function createBucket(definition: BuffDefinition, capacity: number): OrbBucket {
  const materials = getMaterialSet(definition);
  return {
    type: definition.type,
    materials,
    layers: {
      core: createSphereMesh(capacity, materials.core),
      innerGlow: createBillboardMesh(capacity, materials.innerGlow),
      outerGlow: createBillboardMesh(capacity, materials.outerGlow),
      energy: createBillboardMesh(capacity, materials.energy),
    },
  };
}

function addBucket(scene: Scene, bucket: OrbBucket): void {
  scene.add(bucket.layers.core, bucket.layers.innerGlow, bucket.layers.outerGlow, bucket.layers.energy);
}

function removeBucket(scene: Scene, bucket: OrbBucket): void {
  scene.remove(bucket.layers.core, bucket.layers.innerGlow, bucket.layers.outerGlow, bucket.layers.energy);
  bucket.layers.core.dispose();
  bucket.layers.innerGlow.dispose();
  bucket.layers.outerGlow.dispose();
  bucket.layers.energy.dispose();
}

function markMeshDirty(mesh: InstancedMesh<SphereGeometry | PlaneGeometry, MeshBasicMaterial>, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

function writeSphereMatrix(
  mesh: InstancedMesh<SphereGeometry, MeshBasicMaterial>,
  index: number,
  x: number,
  y: number,
  z: number,
  scale: number,
): void {
  sphereDummy.position.set(x, y, z);
  sphereDummy.rotation.set(0, 0, 0);
  sphereDummy.scale.setScalar(scale);
  sphereDummy.updateMatrix();
  mesh.setMatrixAt(index, sphereDummy.matrix);
}

function writeBillboardMatrix(
  mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>,
  index: number,
  x: number,
  y: number,
  z: number,
  scale: number,
  camera: PerspectiveCamera,
  rotationRad = 0,
): void {
  billboardDummy.position.set(x, y, z);
  billboardDummy.quaternion.copy(camera.quaternion);
  billboardDummy.rotateZ(rotationRad);
  billboardDummy.scale.set(scale, scale, scale);
  billboardDummy.updateMatrix();
  mesh.setMatrixAt(index, billboardDummy.matrix);
}

function normalizeForwardXZ(forward: { x: number; z: number }): { x: number; z: number } {
  const length = Math.hypot(forward.x, forward.z);
  if (length < 0.001) {
    return { x: 0, z: 1 };
  }
  return { x: forward.x / length, z: forward.z / length };
}

export class BuffOrb {
  readonly definition: BuffDefinition;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
  readonly bobPhase: number;
  readonly breathePhase: number;
  readonly pulsePhase: number;
  readonly energyPhase: number;
  readonly sizeJitter: number;
  private readonly buffType: BuffType;
  private readonly aabb: SlabAabb;
  private age = 0;

  constructor(position: { x: number; y: number; z: number }, definition: BuffDefinition) {
    this.definition = definition;
    this.buffType = definition.type;
    this.spawnX = position.x;
    this.spawnY = position.y + ORB_SPAWN_HEIGHT_OFFSET_M;
    this.spawnZ = position.z;
    this.bobPhase = Math.random() * TWO_PI;
    this.breathePhase = Math.random() * TWO_PI;
    this.pulsePhase = Math.random() * TWO_PI;
    this.energyPhase = Math.random() * TWO_PI;
    this.sizeJitter = 0.94 + Math.random() * 0.18;

    this.aabb = {
      minX: this.spawnX - ORB_RADIUS_M * 1.7,
      maxX: this.spawnX + ORB_RADIUS_M * 1.7,
      minY: this.spawnY - ORB_RADIUS_M - ORB_BOB_AMPLITUDE_M,
      maxY: this.spawnY + ORB_RADIUS_M + ORB_BOB_AMPLITUDE_M,
      minZ: this.spawnZ - ORB_RADIUS_M * 1.7,
      maxZ: this.spawnZ + ORB_RADIUS_M * 1.7,
    };
  }

  update(deltaSeconds: number): boolean {
    this.age += deltaSeconds;
    return this.age < ORB_LIFETIME_S;
  }

  getAabb(): SlabAabb {
    return this.aabb;
  }

  getAge(): number {
    return this.age;
  }

  getPosition(): { x: number; y: number; z: number } {
    return { x: this.spawnX, y: this.spawnY, z: this.spawnZ };
  }

  getBuffType(): BuffType {
    return this.buffType;
  }
}

export class BuffOrbRenderer {
  private readonly scene: Scene;
  private readonly buckets = new Map<BuffType, OrbBucket>();
  private capacity = 0;
  private timeS = 0;

  constructor(scene: Scene, initialCapacity = INITIAL_RENDER_CAPACITY) {
    this.scene = scene;
    for (const type of BUFF_TYPES) {
      getMaterialSet(BUFF_DEFINITIONS[type]);
    }
    this.resize(Math.max(initialCapacity, INITIAL_RENDER_CAPACITY));
  }

  getCapacity(): number {
    return this.capacity;
  }

  clear(): void {
    for (const bucket of this.buckets.values()) {
      markMeshDirty(bucket.layers.core, 0);
      markMeshDirty(bucket.layers.innerGlow, 0);
      markMeshDirty(bucket.layers.outerGlow, 0);
      markMeshDirty(bucket.layers.energy, 0);
    }
  }

  update(orbs: readonly BuffOrb[], camera: PerspectiveCamera, deltaSeconds: number): void {
    this.timeS += deltaSeconds;
    this.ensureCapacity(orbs.length);

    const countsByType: Record<BuffType, number> = {
      speed_boost: 0,
      rapid_fire: 0,
      unlimited_ammo: 0,
      health_boost: 0,
    };

    for (const type of BUFF_TYPES) {
      const bucket = this.buckets.get(type);
      if (!bucket) continue;
      const typePhase = TYPE_PHASE_BY_BUFF[type];
      bucket.materials.core.opacity = 0.82 + 0.08 * Math.sin(this.timeS * 2.6 + typePhase);
      bucket.materials.innerGlow.opacity = 0.58 + 0.16 * Math.sin(this.timeS * 3.2 + typePhase * 1.1);
      bucket.materials.outerGlow.opacity = 0.26 + 0.18 * Math.sin(this.timeS * 2.3 + typePhase * 0.8);
      bucket.materials.energy.opacity = 0.18 + 0.14 * Math.sin(this.timeS * 4.1 + typePhase * 1.3);
    }

    for (const orb of orbs) {
      const bucket = this.buckets.get(orb.getBuffType());
      if (!bucket) continue;
      const slot = countsByType[orb.getBuffType()];
      countsByType[orb.getBuffType()] += 1;

      const age = orb.getAge();
      const bob = Math.sin(age * TWO_PI * ORB_BOB_FREQUENCY_HZ + orb.bobPhase);
      const breathe = 0.5 + 0.5 * Math.sin(age * 2.4 + orb.breathePhase);
      const pulse = 0.5 + 0.5 * Math.sin(age * 3.8 + orb.pulsePhase);
      const shimmer = 0.5 + 0.5 * Math.sin(age * 5.1 + orb.energyPhase);
      const currentY = orb.spawnY + bob * ORB_BOB_AMPLITUDE_M;

      const coreScale = (0.52 + 0.18 * breathe) * orb.sizeJitter;
      const innerScale = 0.92 + 0.20 * breathe + 0.12 * pulse;
      const outerScale = 1.42 + 0.28 * pulse + 0.10 * breathe;
      const energyScale = 1.08 + 0.14 * shimmer + 0.08 * pulse;
      const energyRotation = age * (0.72 + 0.18 * orb.sizeJitter) + orb.energyPhase;

      writeSphereMatrix(bucket.layers.core, slot, orb.spawnX, currentY, orb.spawnZ, coreScale);
      writeBillboardMatrix(bucket.layers.innerGlow, slot, orb.spawnX, currentY, orb.spawnZ, innerScale, camera, 0);
      writeBillboardMatrix(bucket.layers.outerGlow, slot, orb.spawnX, currentY, orb.spawnZ, outerScale, camera, 0);
      writeBillboardMatrix(bucket.layers.energy, slot, orb.spawnX, currentY, orb.spawnZ, energyScale, camera, energyRotation);
    }

    for (const type of BUFF_TYPES) {
      const bucket = this.buckets.get(type);
      if (!bucket) continue;
      const count = countsByType[type];
      markMeshDirty(bucket.layers.core, count);
      markMeshDirty(bucket.layers.innerGlow, count);
      markMeshDirty(bucket.layers.outerGlow, count);
      markMeshDirty(bucket.layers.energy, count);
    }
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) {
      removeBucket(this.scene, bucket);
    }
    this.buckets.clear();
  }

  private ensureCapacity(nextCount: number): void {
    if (nextCount <= this.capacity) return;
    const nextCapacity = Math.max(
      INITIAL_RENDER_CAPACITY,
      Math.ceil(nextCount / RENDER_CAPACITY_CHUNK) * RENDER_CAPACITY_CHUNK,
    );
    this.resize(nextCapacity);
  }

  private resize(nextCapacity: number): void {
    if (this.capacity === nextCapacity) return;

    for (const existing of this.buckets.values()) {
      removeBucket(this.scene, existing);
    }
    this.buckets.clear();

    for (const type of BUFF_TYPES) {
      const bucket = createBucket(BUFF_DEFINITIONS[type], nextCapacity);
      this.buckets.set(type, bucket);
      addBucket(this.scene, bucket);
    }

    this.capacity = nextCapacity;
  }
}

export function warmupOrbMaterials(scene: Scene, camera: PerspectiveCamera): () => void {
  for (const type of BUFF_TYPES) {
    getMaterialSet(BUFF_DEFINITIONS[type]);
  }

  const existing = scene.getObjectByName(WARMUP_KEEPER_NAME);
  if (existing) {
    scene.remove(existing);
  }

  const keeper = new Object3D();
  keeper.name = WARMUP_KEEPER_NAME;

  const materials = getMaterialSet(BUFF_DEFINITIONS.speed_boost);
  const core = new Mesh(getSharedCoreGeometry(), materials.core);
  const innerGlow = new Mesh(getSharedBillboardGeometry(), materials.innerGlow);
  const outerGlow = new Mesh(getSharedBillboardGeometry(), materials.outerGlow);
  const energy = new Mesh(getSharedBillboardGeometry(), materials.energy);
  core.frustumCulled = false;
  innerGlow.frustumCulled = false;
  outerGlow.frustumCulled = false;
  energy.frustumCulled = false;
  innerGlow.scale.setScalar(1.0);
  outerGlow.scale.setScalar(1.5);
  energy.scale.setScalar(1.2);

  keeper.add(core, innerGlow, outerGlow, energy);
  scene.add(keeper);

  const cameraDirection = normalizeForwardXZ(camera.getWorldDirection(scratchForward));
  keeper.position.set(
    camera.position.x + cameraDirection.x * 4,
    camera.position.y - 0.35,
    camera.position.z + cameraDirection.z * 4,
  );
  keeper.quaternion.copy(camera.quaternion);
  keeper.updateMatrixWorld(true);

  return () => {
    keeper.position.set(0, -1000, 0);
    keeper.updateMatrixWorld(true);
  };
}
