import {
  AdditiveBlending,
  CanvasTexture,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Mesh,
  Sprite,
  SpriteMaterial,
  BackSide,
  type Scene,
} from "three";
import {
  type BuffType,
  type BuffDefinition,
  ORB_RADIUS_M,
  ORB_BOB_AMPLITUDE_M,
  ORB_BOB_FREQUENCY_HZ,
  ORB_SPIN_RAD_PER_S,
  ORB_LIFETIME_S,
  ORB_SPAWN_HEIGHT_OFFSET_M,
} from "./BuffTypes";
import { type SlabAabb } from "../sim/collision/rayVsAabb";

const TWO_PI = Math.PI * 2;

// ── Shared resources (created once, reused across all orbs) ────────────
let sharedCoreGeometry: SphereGeometry | null = null;
let sharedOuterGeometry: SphereGeometry | null = null;
const glowTextureCache = new Map<number, CanvasTexture>();
const wispTextureCache = new Map<number, CanvasTexture>();
const noiseTextureCache = new Map<number, CanvasTexture>();

function getSharedCoreGeometry(): SphereGeometry {
  if (!sharedCoreGeometry) {
    sharedCoreGeometry = new SphereGeometry(ORB_RADIUS_M, 24, 16);
  }
  return sharedCoreGeometry;
}

function getSharedOuterGeometry(): SphereGeometry {
  if (!sharedOuterGeometry) {
    sharedOuterGeometry = new SphereGeometry(ORB_RADIUS_M * 1.35, 20, 14);
  }
  return sharedOuterGeometry;
}

function getGlowTexture(colorHex: number): CanvasTexture {
  let tex = glowTextureCache.get(colorHex);
  if (tex) return tex;
  const [r, g, b] = hexToRgb(colorHex);
  tex = createGlowTexture(r, g, b, 128);
  glowTextureCache.set(colorHex, tex);
  return tex;
}

function getWispTexture(colorHex: number): CanvasTexture {
  let tex = wispTextureCache.get(colorHex);
  if (tex) return tex;
  const [r, g, b] = hexToRgb(colorHex);
  tex = createWispTexture(r, g, b, 64);
  wispTextureCache.set(colorHex, tex);
  return tex;
}

function getNoiseTexture(colorHex: number): CanvasTexture {
  let tex = noiseTextureCache.get(colorHex);
  if (tex) return tex;
  const [r, g, b] = hexToRgb(colorHex);
  tex = createNoiseTexture(r, g, b, 128);
  noiseTextureCache.set(colorHex, tex);
  return tex;
}

function createGlowTexture(r: number, g: number, b: number, size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, `rgba(255, 255, 255, 0.95)`);
  grad.addColorStop(0.12, `rgba(${r}, ${g}, ${b}, 0.7)`);
  grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.35)`);
  grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.1)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createWispTexture(r: number, g: number, b: number, size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.6);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.25)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cx, cx, 0, TWO_PI);
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Procedural noise sprite — gives the orb a static/energy feel without shaders */
function createNoiseTexture(r: number, g: number, b: number, size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Radial base
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, `rgba(255, 255, 255, 0.6)`);
  grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.4)`);
  grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.15)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Scatter bright static dots
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % size;
    const py = Math.floor(i / 4 / size);
    const dist = Math.hypot(px - cx, py - cx) / cx;
    if (dist > 1) continue;

    // Random bright sparks
    if (Math.random() < 0.04 * (1 - dist)) {
      const brightness = 0.6 + Math.random() * 0.4;
      data[i] = Math.min(255, data[i]! + r * brightness);
      data[i + 1] = Math.min(255, data[i + 1]! + g * brightness);
      data[i + 2] = Math.min(255, data[i + 2]! + b * brightness);
      data[i + 3] = Math.min(255, data[i + 3]! + 180 * brightness);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/**
 * Pre-warm orb materials by creating a temporary orb far below the map.
 * Call this BEFORE renderer.compileSceneAsync() so Three.js compiles
 * the MeshStandardMaterial + SpriteMaterial shader variants during
 * the existing warmup phase, avoiding a frame-spike on first orb spawn.
 * Returns a dispose function to call after compile finishes.
 */
export function warmupOrbMaterials(scene: Scene, definition: BuffDefinition): () => void {
  const orb = new BuffOrb(scene, { x: 0, y: -1000, z: 0 }, definition);
  return () => {
    orb.dispose(scene);
  };
}

// ── Wisp particle ──────────────────────────────────────────────────────
const MAX_WISPS = 4;

type Wisp = {
  sprite: Sprite;
  material: SpriteMaterial;
  angle: number;
  radius: number;
  speed: number;
  vertOffset: number;
  vertSpeed: number;
  baseScale: number;
};

export class BuffOrb {
  // Core sphere (bright solid center)
  private readonly coreMesh: Mesh;
  private readonly coreMaterial: MeshStandardMaterial;

  // Outer shell (translucent ethereal layer using standard material)
  private readonly shellMesh: Mesh;
  private readonly shellMaterial: MeshStandardMaterial;

  // Glow sprite
  private readonly glowSprite: Sprite;
  private readonly glowMaterial: SpriteMaterial;

  // Noise/static energy sprite (rotates independently for ethereal feel)
  private readonly noiseSprite: Sprite;
  private readonly noiseMaterial: SpriteMaterial;

  // Secondary glow (smaller, brighter, different pulse phase)
  private readonly innerGlowSprite: Sprite;
  private readonly innerGlowMaterial: SpriteMaterial;

  // Point light
  private readonly light: PointLight;

  // Wisps
  private readonly wisps: Wisp[] = [];

  // State
  private readonly spawnX: number;
  private readonly spawnY: number;
  private readonly spawnZ: number;
  private readonly buffType: BuffType;
  private readonly aabb: SlabAabb;
  private age = 0;
  private disposed = false;

  constructor(scene: Scene, position: { x: number; y: number; z: number }, definition: BuffDefinition) {
    this.buffType = definition.type;
    this.spawnX = position.x;
    this.spawnY = position.y + ORB_SPAWN_HEIGHT_OFFSET_M;
    this.spawnZ = position.z;

    // ── Core sphere (bright solid center, slightly smaller) ────────
    this.coreMaterial = new MeshStandardMaterial({
      color: definition.orbColor,
      emissive: definition.orbEmissive,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
      metalness: 0.3,
      roughness: 0.1,
    });
    this.coreMesh = new Mesh(getSharedCoreGeometry(), this.coreMaterial);
    this.coreMesh.scale.setScalar(0.55);
    this.coreMesh.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.coreMesh);

    // ── Outer shell (translucent back-face layer for volume) ───────
    this.shellMaterial = new MeshStandardMaterial({
      color: definition.orbColor,
      emissive: definition.orbEmissive,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.18,
      metalness: 0.1,
      roughness: 0.6,
      side: BackSide,
      depthWrite: false,
    });
    this.shellMesh = new Mesh(getSharedOuterGeometry(), this.shellMaterial);
    this.shellMesh.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.shellMesh);

    // ── Noise/energy sprite (provides static/ethereal texture) ─────
    this.noiseMaterial = new SpriteMaterial({
      map: getNoiseTexture(definition.orbColor),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.55,
      rotation: Math.random() * TWO_PI,
    });
    this.noiseSprite = new Sprite(this.noiseMaterial);
    this.noiseSprite.scale.setScalar(1.1);
    this.noiseSprite.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.noiseSprite);

    // ── Inner glow (bright hot center) ─────────────────────────────
    this.innerGlowMaterial = new SpriteMaterial({
      map: getGlowTexture(definition.orbColor),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.7,
    });
    this.innerGlowSprite = new Sprite(this.innerGlowMaterial);
    this.innerGlowSprite.scale.setScalar(0.8);
    this.innerGlowSprite.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.innerGlowSprite);

    // ── Outer glow sprite ──────────────────────────────────────────
    this.glowMaterial = new SpriteMaterial({
      map: getGlowTexture(definition.orbColor),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });
    this.glowSprite = new Sprite(this.glowMaterial);
    this.glowSprite.scale.setScalar(1.8);
    this.glowSprite.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.glowSprite);

    // ── Orbiting wisp particles ────────────────────────────────────
    const wispTex = getWispTexture(definition.orbColor);
    for (let i = 0; i < MAX_WISPS; i++) {
      const mat = new SpriteMaterial({
        map: wispTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        opacity: 0.5,
      });
      const sprite = new Sprite(mat);
      const baseScale = 0.12 + Math.random() * 0.08;
      sprite.scale.setScalar(baseScale);
      sprite.position.set(this.spawnX, this.spawnY, this.spawnZ);
      scene.add(sprite);

      this.wisps.push({
        sprite,
        material: mat,
        angle: (i / MAX_WISPS) * TWO_PI + Math.random() * 0.5,
        radius: ORB_RADIUS_M * (1.2 + Math.random() * 0.8),
        speed: 1.5 + Math.random() * 1.5,
        vertOffset: Math.random() * TWO_PI,
        vertSpeed: 0.8 + Math.random() * 0.6,
        baseScale,
      });
    }

    // ── Point light ────────────────────────────────────────────────
    this.light = new PointLight(definition.orbColor, 2.0, 5);
    this.light.position.set(this.spawnX, this.spawnY, this.spawnZ);
    scene.add(this.light);

    // ── AABB for raycast ───────────────────────────────────────────
    this.aabb = {
      minX: this.spawnX - ORB_RADIUS_M * 1.5,
      maxX: this.spawnX + ORB_RADIUS_M * 1.5,
      minY: this.spawnY - ORB_RADIUS_M - ORB_BOB_AMPLITUDE_M,
      maxY: this.spawnY + ORB_RADIUS_M + ORB_BOB_AMPLITUDE_M,
      minZ: this.spawnZ - ORB_RADIUS_M * 1.5,
      maxZ: this.spawnZ + ORB_RADIUS_M * 1.5,
    };
  }

  update(deltaSeconds: number): boolean {
    if (this.disposed) return false;
    this.age += deltaSeconds;
    if (this.age >= ORB_LIFETIME_S) return false;

    // Bob animation
    const bobY = Math.sin(this.age * TWO_PI * ORB_BOB_FREQUENCY_HZ) * ORB_BOB_AMPLITUDE_M;
    const currentY = this.spawnY + bobY;

    // Slow spin on core
    this.coreMesh.rotation.y += ORB_SPIN_RAD_PER_S * 0.5 * deltaSeconds;

    // Pulsing core
    const corePulse = 0.7 + 0.15 * Math.sin(this.age * 4.0);
    this.coreMaterial.opacity = corePulse;
    this.coreMaterial.emissiveIntensity = 0.9 + 0.4 * Math.sin(this.age * 3.2);

    // Shell pulse and rotation (ethereal drift)
    this.shellMaterial.opacity = 0.12 + 0.08 * Math.sin(this.age * 2.5);
    this.shellMaterial.emissiveIntensity = 0.4 + 0.3 * Math.sin(this.age * 3.8);
    this.shellMesh.rotation.y += 0.35 * deltaSeconds;
    this.shellMesh.rotation.x += 0.2 * deltaSeconds;

    // Noise sprite rotation for energy/static feel
    this.noiseMaterial.rotation += 0.8 * deltaSeconds;
    this.noiseMaterial.opacity = 0.4 + 0.2 * Math.sin(this.age * 5.0);
    const noiseScale = 1.0 + 0.15 * Math.sin(this.age * 3.5);
    this.noiseSprite.scale.setScalar(noiseScale);

    // Inner glow pulse (faster, brighter)
    this.innerGlowMaterial.opacity = 0.5 + 0.25 * Math.sin(this.age * 4.5);
    const innerScale = 0.7 + 0.15 * Math.sin(this.age * 3.0);
    this.innerGlowSprite.scale.setScalar(innerScale);

    // Outer glow pulse
    this.glowMaterial.opacity = 0.35 + 0.2 * Math.sin(this.age * 2.8);
    const glowScale = 1.6 + 0.3 * Math.sin(this.age * 2.0);
    this.glowSprite.scale.setScalar(glowScale);

    // Light intensity pulse
    this.light.intensity = 1.5 + 0.8 * Math.sin(this.age * 3.0);

    // Update all positions
    this.coreMesh.position.y = currentY;
    this.shellMesh.position.y = currentY;
    this.noiseSprite.position.y = currentY;
    this.innerGlowSprite.position.y = currentY;
    this.glowSprite.position.y = currentY;
    this.light.position.y = currentY;

    // Update wisps
    for (const wisp of this.wisps) {
      wisp.angle += wisp.speed * deltaSeconds;
      const wx = this.spawnX + Math.cos(wisp.angle) * wisp.radius;
      const wz = this.spawnZ + Math.sin(wisp.angle) * wisp.radius;
      const wy = currentY + Math.sin(this.age * wisp.vertSpeed + wisp.vertOffset) * ORB_RADIUS_M * 0.8;
      wisp.sprite.position.set(wx, wy, wz);

      const wispPulse = 0.3 + 0.3 * Math.sin(this.age * 4.0 + wisp.angle);
      wisp.material.opacity = wispPulse;
      wisp.sprite.scale.setScalar(wisp.baseScale * (0.8 + 0.4 * Math.sin(this.age * 3.0 + wisp.vertOffset)));
    }

    return true;
  }

  getAabb(): SlabAabb {
    return this.aabb;
  }

  getPosition(): { x: number; y: number; z: number } {
    return { x: this.spawnX, y: this.spawnY, z: this.spawnZ };
  }

  getBuffType(): BuffType {
    return this.buffType;
  }

  isExpired(): boolean {
    return this.age >= ORB_LIFETIME_S;
  }

  dispose(scene: Scene): void {
    if (this.disposed) return;
    this.disposed = true;

    scene.remove(this.coreMesh);
    scene.remove(this.shellMesh);
    scene.remove(this.noiseSprite);
    scene.remove(this.innerGlowSprite);
    scene.remove(this.glowSprite);
    scene.remove(this.light);

    // Only dispose instance materials, NOT shared geometry/textures
    this.coreMaterial.dispose();
    this.shellMaterial.dispose();
    this.noiseMaterial.dispose();
    this.innerGlowMaterial.dispose();
    this.glowMaterial.dispose();
    this.light.dispose();

    for (const wisp of this.wisps) {
      scene.remove(wisp.sprite);
      wisp.material.dispose();
    }
    this.wisps.length = 0;
  }
}
