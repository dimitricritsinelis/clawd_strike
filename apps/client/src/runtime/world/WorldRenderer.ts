import * as THREE from "three";

import type { MapDef } from "@clawd-strike/shared";
import { hashSeed, lcg, rand01 } from "@clawd-strike/shared";

import { createWorldBuildPlan, type PlanProp, type VisualBlock } from "./WorldBuildPlan";
import { createWorldUvBoxGeometry } from "./geometry/boxUv";
import { createBeveledBoxGeometry } from "./geometry/beveledBox";
import { createLightingRig } from "./lighting/lightingRig";
import { MaterialLibrary } from "./materials/materialLibrary";
import { PostPipeline } from "./postfx/postPipeline";
import { addInstancedDressing, type DressingSet } from "./props/instancedDressing";
import { AkViewmodel } from "./weapon/AkViewmodel";

export type RenderDiagnostics = Readonly<{
  drawCalls: number;
  triangles: number;
  materials: number;
}>;

type WorldRendererArgs = Readonly<{
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  map: MapDef;
}>;

function isArchitecturalMass(id: string, height: number): boolean {
  return (
    height >= 4 &&
    !id.includes("cover") &&
    !id.includes("landmark") &&
    !id.includes("floor") &&
    !id.includes("col")
  );
}

function makeSignTexture(seedKey: string): THREE.CanvasTexture {
  const next = lcg(hashSeed(seedKey));
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("No 2D context for sign texture.");

  // Richer sign background with multiple layers
  const hue = 175 + Math.round(rand01(next) * 22);
  ctx.fillStyle = `hsl(${hue}, 38%, 28%)`;
  ctx.fillRect(0, 0, c.width, c.height);

  // Wood grain base
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 40; i++) {
    const y = rand01(next) * c.height;
    ctx.strokeStyle = `hsl(${hue}, 20%, ${20 + rand01(next) * 15}%)`;
    ctx.lineWidth = 0.5 + rand01(next) * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(c.width, y + (rand01(next) - 0.5) * 8);
    ctx.stroke();
  }
  ctx.restore();

  // Dirt gradient
  const dirt = ctx.createLinearGradient(0, 0, 0, c.height);
  dirt.addColorStop(0, "rgba(34,20,12,0.18)");
  dirt.addColorStop(0.6, "rgba(18,12,6,0.25)");
  dirt.addColorStop(1, "rgba(8,6,4,0.5)");
  ctx.fillStyle = dirt;
  ctx.fillRect(0, 0, c.width, c.height);

  // Double border: outer dark, inner decorative
  ctx.strokeStyle = "rgba(20, 13, 8, 0.92)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, c.width - 6, c.height - 6);
  ctx.strokeStyle = "rgba(180, 150, 100, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);

  // Arabic-style calligraphy strokes
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(238, 220, 174, 0.88)";
  ctx.lineWidth = 7;
  let penX = 28;
  const penY = 85;
  for (let i = 0; i < 8; i++) {
    const w = 44 + rand01(next) * 40;
    const h = 10 + rand01(next) * 18;
    ctx.beginPath();
    ctx.moveTo(penX, penY + (rand01(next) - 0.5) * 14);
    ctx.bezierCurveTo(
      penX + w * 0.22, penY - h,
      penX + w * 0.6, penY + h,
      penX + w, penY + (rand01(next) - 0.5) * 10
    );
    ctx.stroke();
    // Diacritical marks (dots)
    if (rand01(next) > 0.5) {
      ctx.fillStyle = "rgba(238, 220, 174, 0.75)";
      ctx.beginPath();
      ctx.arc(penX + w * 0.4, penY - h - 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    penX += w * 0.9;
    if (penX > c.width - 60) break;
  }

  // Weathering: dust specks and scratches
  ctx.fillStyle = "rgba(230, 196, 140, 0.3)";
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(rand01(next) * c.width, rand01(next) * c.height, 2 + rand01(next) * 4, 1 + rand01(next) * 2);
  }
  // Scratch marks
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    const sx = rand01(next) * c.width;
    const sy = rand01(next) * c.height;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rand01(next) - 0.5) * 30, sy + (rand01(next) - 0.5) * 30);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeSaggingCloth(width: number, depth: number, segX: number, segY: number, sag: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, depth, segX, segY);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / width;
    const y = pos.getY(i) / depth;
    const bowl = Math.cos(x * Math.PI) * Math.cos(y * Math.PI);
    pos.setZ(i, pos.getZ(i) - bowl * sag);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function facadeNormal(cx: number, cz: number): "x+" | "x-" | "z+" | "z-" {
  if (Math.abs(cx) > Math.abs(cz)) return cx > 0 ? "x-" : "x+";
  return cz > 0 ? "z-" : "z+";
}

type FacadeNormal = ReturnType<typeof facadeNormal>;

type WindowFacadeParts = Readonly<{
  recessBack: THREE.Mesh;
  recessTop: THREE.Mesh;
  recessBottom: THREE.Mesh;
  recessLeft: THREE.Mesh;
  recessRight: THREE.Mesh;
  windowSill: THREE.Mesh;
  lintel: THREE.Mesh;
  bars: THREE.Mesh;
  shuttersL: THREE.Mesh;
  shuttersR: THREE.Mesh;
}>;

type DoorFacadeParts = Readonly<{
  door: THREE.Mesh;
  doorFrameL: THREE.Mesh;
  doorFrameR: THREE.Mesh;
  doorFrameTop: THREE.Mesh;
  doorThreshold: THREE.Mesh;
  ringA: THREE.Mesh;
  ringB: THREE.Mesh;
  arch: THREE.Mesh;
}>;

export class WorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly map: MapDef;

  private readonly materials = new MaterialLibrary();
  private readonly worldMeshes: THREE.Object3D[] = [];
  private readonly transientMaterials: THREE.Material[] = [];
  private readonly transientTextures: THREE.Texture[] = [];
  private readonly post: PostPipeline;
  private readonly viewmodel: AkViewmodel;
  private readonly dressing: DressingSet;
  private elapsedTime = 0;

  constructor(args: WorldRendererArgs) {
    this.renderer = args.renderer;
    this.scene = args.scene;
    this.camera = args.camera;
    this.map = args.map;

    createLightingRig(this.scene);

    const plan = createWorldBuildPlan(this.map);
    this.buildCollisionMeshes(plan.blocks);
    this.buildStreetLayer();
    this.buildFacadeLayers(plan.blocks);
    this.buildMarketBooths();
    this.buildProps(plan.props);

    this.dressing = addInstancedDressing(this.scene, this.map, this.materials);
    this.buildAtmosphere();

    this.viewmodel = new AkViewmodel(this.camera);
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, window.innerWidth, window.innerHeight);

    this.buildSky();
  }

  private buildSky() {
    // Gradient sky with sun disk
    const skyGeo = new THREE.SphereGeometry(340, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        sunDir: { value: new THREE.Vector3(48, 48, 18).normalize() }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vWorldPos;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float y = dir.y;

          // Vertical gradient: horizon warm haze -> zenith blue-gold
          vec3 horizon = vec3(0.84, 0.74, 0.56);     // Warm sand haze
          vec3 midSky  = vec3(0.72, 0.65, 0.50);     // Mid warmth
          vec3 zenith  = vec3(0.55, 0.58, 0.52);     // Slightly cool top

          vec3 sky = mix(horizon, midSky, smoothstep(0.0, 0.15, y));
          sky = mix(sky, zenith, smoothstep(0.15, 0.6, y));

          // Sun disk glow
          float sunDot = dot(dir, sunDir);
          float sunGlow = pow(max(0.0, sunDot), 64.0) * 1.2;
          float sunHalo = pow(max(0.0, sunDot), 8.0) * 0.25;
          sky += vec3(1.0, 0.9, 0.7) * sunGlow;
          sky += vec3(1.0, 0.85, 0.6) * sunHalo;

          // Ground darkening below horizon
          sky = mix(sky, horizon * 0.7, smoothstep(0.0, -0.05, y));

          gl_FragColor = vec4(sky, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.userData.ignoreImpactRay = true;
    this.scene.add(sky);
    this.worldMeshes.push(sky);
    this.transientMaterials.push(skyMat);

    // Cloud layer: semi-transparent plane high up
    const cloudGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf0e0c8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.rotation.x = -Math.PI * 0.5;
    clouds.position.set(0, 280, 0);
    clouds.userData.ignoreImpactRay = true;
    this.scene.add(clouds);
    this.worldMeshes.push(clouds);
    this.transientMaterials.push(cloudMat);
  }

  private buildCollisionMeshes(blocks: readonly VisualBlock[]) {
    for (const block of blocks) {
      const sx = block.max.x - block.min.x;
      const sy = block.max.y - block.min.y;
      const sz = block.max.z - block.min.z;

      let geom: THREE.BufferGeometry;
      if (block.rounded) {
        geom = createBeveledBoxGeometry(sx, sy, sz, Math.min(0.18, Math.max(0.05, Math.min(sx, sy, sz) * 0.06)), 2);
      } else {
        geom = createWorldUvBoxGeometry(sx, sy, sz, { side: block.uvSide, top: block.uvTop });
      }

      if (block.rounded) {
        const uv = geom.getAttribute("uv");
        if (uv) {
          for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) * block.uvSide, uv.getY(i) * block.uvSide);
          }
          uv.needsUpdate = true;
        }
      }

      const repeatX = block.id === "floor" ? sx * 0.45 : Math.max(1, sx * 0.15);
      const repeatY = block.id === "floor" ? sz * 0.45 : Math.max(1, sy * 0.2);
      const mat = this.materials.get(block.material, block.seedKey, repeatX, repeatY);

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set((block.min.x + block.max.x) * 0.5, (block.min.y + block.max.y) * 0.5, (block.min.z + block.max.z) * 0.5);
      mesh.castShadow = sy > 0.35;
      mesh.receiveShadow = true;
      mesh.userData.surface = block.surface;
      this.scene.add(mesh);
      this.worldMeshes.push(mesh);
    }
  }

  private buildStreetLayer() {
    const cobbleMat = this.materials.get("cobble", "street:cobble", 16, 5);
    const sandMat = this.materials.get("sand", "street:sand", 14, 5);
    const oilMat = new THREE.MeshStandardMaterial({ color: 0x3f3122, roughness: 0.98, metalness: 0.02, transparent: true, opacity: 0.3 });
    this.transientMaterials.push(oilMat);

    // Cobblestone strips with more variety
    const strips = [
      { x: 0, z: 2, w: 24, h: 88, rot: 0.02 },
      { x: -33, z: -22, w: 18, h: 50, rot: -0.06 },
      { x: 43, z: -2, w: 20, h: 56, rot: -0.03 },
      { x: 12, z: 38, w: 14, h: 24, rot: 0.04 },
      { x: -20, z: -42, w: 16, h: 30, rot: -0.01 }
    ];

    for (const s of strips) {
      const g = new THREE.PlaneGeometry(s.w, s.h, 16, 24);
      const uv = g.getAttribute("uv");
      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * (s.w * 0.32), uv.getY(i) * (s.h * 0.32));
        }
        uv.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(g, cobbleMat);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.rotation.z = s.rot;
      mesh.position.set(s.x, 0.04, s.z);
      mesh.receiveShadow = true;
      mesh.userData.ignoreImpactRay = true;
      this.scene.add(mesh);
      this.worldMeshes.push(mesh);
    }

    // Sand drifts: more variation
    const driftGeom = new THREE.PlaneGeometry(5.2, 2.8, 5, 3);
    for (let i = 0; i < 28; i++) {
      const t = i / 28;
      const x = -64 + t * 128 + Math.sin(t * 19) * 4;
      const z = -58 + Math.cos(t * 11) * 22;
      const drift = new THREE.Mesh(driftGeom, sandMat);
      drift.rotation.x = -Math.PI * 0.5;
      drift.rotation.z = Math.sin(i * 4.1) * 0.6;
      drift.position.set(x, 0.025, z);
      drift.scale.set(0.7 + (i % 5) * 0.2, 0.6 + (i % 4) * 0.25, 1);
      drift.userData.ignoreImpactRay = true;
      this.scene.add(drift);
      this.worldMeshes.push(drift);
    }

    // Sand accumulation along wall bases (wedge strips)
    const wallSandMat = this.materials.get("sand", "street:wallsand", 8, 2);
    for (const collider of this.map.colliders) {
      const sy = collider.max.y - collider.min.y;
      if (sy < 3) continue; // Only along tall walls
      const sx = collider.max.x - collider.min.x;
      const sz = collider.max.z - collider.min.z;
      if (sx < 2 && sz < 2) continue;

      // Place sand along the longest face
      const long = sx > sz;
      const len = long ? sx : sz;
      const sandStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(len + 0.8, 0.6),
        wallSandMat
      );
      sandStrip.rotation.x = -Math.PI * 0.5;
      if (long) {
        sandStrip.position.set((collider.min.x + collider.max.x) * 0.5, 0.03, collider.max.z + 0.3);
      } else {
        sandStrip.position.set(collider.max.x + 0.3, 0.03, (collider.min.z + collider.max.z) * 0.5);
        sandStrip.rotation.z = Math.PI * 0.5;
      }
      sandStrip.userData.ignoreImpactRay = true;
      this.scene.add(sandStrip);
      this.worldMeshes.push(sandStrip);
    }

    // Oil stains with varied shapes
    const stainGeom = new THREE.CircleGeometry(1, 24);
    for (let i = 0; i < 22; i++) {
      const x = -52 + (i % 7) * 16 + Math.sin(i * 2.3) * 3;
      const z = -34 + Math.floor(i / 7) * 20 + Math.cos(i * 1.9) * 3;
      const stain = new THREE.Mesh(stainGeom, oilMat);
      stain.rotation.x = -Math.PI * 0.5;
      stain.position.set(x, 0.028, z);
      stain.scale.set(0.6 + (i % 4) * 0.5, 0.4 + (i % 5) * 0.35, 1);
      stain.userData.ignoreImpactRay = true;
      this.scene.add(stain);
      this.worldMeshes.push(stain);
    }

    // Cart wheel ruts
    const rutMat = new THREE.MeshStandardMaterial({ color: 0x6b5840, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.2 });
    this.transientMaterials.push(rutMat);
    const rutGeom = new THREE.PlaneGeometry(0.15, 40);
    for (let i = 0; i < 4; i++) {
      const rut = new THREE.Mesh(rutGeom, rutMat);
      rut.rotation.x = -Math.PI * 0.5;
      rut.position.set(-4 + i * 2.8, 0.022, 5 + i * 3);
      rut.rotation.z = 0.04 + i * 0.02;
      rut.userData.ignoreImpactRay = true;
      this.scene.add(rut);
      this.worldMeshes.push(rut);
    }
  }

  private buildFacadeLayers(blocks: readonly VisualBlock[]) {
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x5c8f8a, roughness: 0.88, metalness: 0.05 });
    const barMat = this.materials.get("metal", "facade:bars", 0.9, 0.9);
    const doorMat = this.materials.get("wood", "facade:doors", 1.2, 1.2);
    const ringMat = this.materials.get("metal", "facade:rings", 1, 1);
    const recessMat = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.95, metalness: 0.01 });
    const sillMat = this.materials.get("concrete", "facade:sills", 1, 1);
    const frameMat = this.materials.get("wood", "facade:frames", 1.4, 1.4);
    this.transientMaterials.push(shutterMat, recessMat);

    for (const block of blocks) {
      const sx = block.max.x - block.min.x;
      const sy = block.max.y - block.min.y;
      const sz = block.max.z - block.min.z;
      if (!isArchitecturalMass(block.id, sy)) continue;

      const cx = (block.min.x + block.max.x) * 0.5;
      const cz = (block.min.z + block.max.z) * 0.5;
      const spanX = sx + 0.24;
      const spanZ = sz + 0.24;

      const corniceMat = this.materials.get("plaster", `cornice:${block.id}`, Math.max(1, sx * 0.24), 1.2);
      const trimMat = this.materials.get("trim", `trim:${block.id}`, Math.max(1, sx * 0.52), 1.2);

      // Cornice with more depth
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.35, spanZ), corniceMat);
      cornice.position.set(cx, block.max.y - 0.18, cz);
      cornice.castShadow = true;
      cornice.receiveShadow = true;
      cornice.userData.ignoreImpactRay = true;
      this.scene.add(cornice);
      this.worldMeshes.push(cornice);

      // Secondary ledge below cornice
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(spanX + 0.1, 0.1, spanZ + 0.1), corniceMat);
      ledge.position.set(cx, block.max.y - 0.42, cz);
      ledge.castShadow = true;
      ledge.receiveShadow = true;
      ledge.userData.ignoreImpactRay = true;
      this.scene.add(ledge);
      this.worldMeshes.push(ledge);

      // Trim band
      const trimBand = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.22, spanZ), trimMat);
      trimBand.position.set(cx, block.min.y + Math.min(2.2, sy * 0.35), cz);
      trimBand.castShadow = false;
      trimBand.receiveShadow = true;
      trimBand.userData.ignoreImpactRay = true;
      this.scene.add(trimBand);
      this.worldMeshes.push(trimBand);

      const normal = facadeNormal(cx, cz);
      const windowCount = Math.max(2, Math.min(6, Math.floor((Math.max(sx, sz)) / 3.6)));
      const vertical = block.min.y + sy * 0.56;
      const recessDepth = 0.15;

      for (let i = 0; i < windowCount; i++) {
        const t = (i + 1) / (windowCount + 1);

        // Recessed window alcove
        const recessBack = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.06), recessMat);
        const recessTop = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, recessDepth), sillMat);
        const recessBottom = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, recessDepth), sillMat);
        const recessLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.06, recessDepth), sillMat);
        const recessRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.06, recessDepth), sillMat);
        // Window sill (protruding)
        const windowSill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.18), sillMat);
        // Lintel above window
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.12), sillMat);

        const shuttersL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.04, 0.05), shutterMat);
        const shuttersR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.04, 0.05), shutterMat);
        const bars = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.03), barMat);

        for (const m of [recessBack, recessTop, recessBottom, recessLeft, recessRight, windowSill, lintel, shuttersL, shuttersR, bars]) {
          m.userData.ignoreImpactRay = true;
          m.receiveShadow = true;
          m.castShadow = true;
        }
        recessBack.castShadow = false;

        this.placeWindowFacadeParts(normal, block, t, vertical, recessDepth, {
          recessBack,
          recessTop,
          recessBottom,
          recessLeft,
          recessRight,
          windowSill,
          lintel,
          bars,
          shuttersL,
          shuttersR
        });

        this.scene.add(recessBack, recessTop, recessBottom, recessLeft, recessRight, windowSill, lintel, bars, shuttersL, shuttersR);
        this.worldMeshes.push(recessBack, recessTop, recessBottom, recessLeft, recessRight, windowSill, lintel, bars, shuttersL, shuttersR);
      }

      // Recessed door with frame and arch
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.35, 0.18), doorMat);
      const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.12), frameMat);
      const doorFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.12), frameMat);
      const doorFrameTop = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 0.12), frameMat);
      const doorThreshold = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.3), sillMat);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 12, 18), ringMat);
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 12, 18), ringMat);

      // Decorative arch above door (half-torus)
      const archGeo = new THREE.TorusGeometry(0.82, 0.08, 8, 16, Math.PI);
      const arch = new THREE.Mesh(archGeo, sillMat);

      for (const m of [door, doorFrameL, doorFrameR, doorFrameTop, doorThreshold, ringA, ringB, arch]) {
        m.userData.ignoreImpactRay = true;
        m.castShadow = true;
        m.receiveShadow = true;
      }

      this.placeDoorFacadeParts(normal, block, cx, cz, {
        door,
        doorFrameL,
        doorFrameR,
        doorFrameTop,
        doorThreshold,
        ringA,
        ringB,
        arch
      });

      this.scene.add(door, doorFrameL, doorFrameR, doorFrameTop, doorThreshold, ringA, ringB, arch);
      this.worldMeshes.push(door, doorFrameL, doorFrameR, doorFrameTop, doorThreshold, ringA, ringB, arch);
    }
  }

  private placeWindowFacadeParts(
    normal: FacadeNormal,
    block: VisualBlock,
    t: number,
    vertical: number,
    recessDepth: number,
    parts: WindowFacadeParts
  ) {
    const {
      recessBack,
      recessTop,
      recessBottom,
      recessLeft,
      recessRight,
      windowSill,
      lintel,
      bars,
      shuttersL,
      shuttersR
    } = parts;

    if (normal === "z-") {
      const x = THREE.MathUtils.lerp(block.min.x + 0.8, block.max.x - 0.8, t);
      const wz = block.max.z;
      recessBack.position.set(x, vertical, wz - recessDepth * 0.5 + 0.01);
      recessBack.rotation.y = Math.PI;
      recessTop.position.set(x, vertical + 0.53, wz + recessDepth * 0.5 - 0.02);
      recessBottom.position.set(x, vertical - 0.53, wz + recessDepth * 0.5 - 0.02);
      recessLeft.position.set(x - 0.48, vertical, wz + recessDepth * 0.5 - 0.02);
      recessRight.position.set(x + 0.48, vertical, wz + recessDepth * 0.5 - 0.02);
      windowSill.position.set(x, vertical - 0.56, wz + 0.1);
      lintel.position.set(x, vertical + 0.59, wz + 0.06);
      bars.position.set(x, vertical, wz + 0.02);
      shuttersL.position.set(x - 0.56, vertical, wz + 0.05);
      shuttersR.position.set(x + 0.56, vertical, wz + 0.05);
      return;
    }

    if (normal === "z+") {
      const x = THREE.MathUtils.lerp(block.min.x + 0.8, block.max.x - 0.8, t);
      const wz = block.min.z;
      recessBack.position.set(x, vertical, wz + recessDepth * 0.5 - 0.01);
      recessTop.position.set(x, vertical + 0.53, wz - recessDepth * 0.5 + 0.02);
      recessBottom.position.set(x, vertical - 0.53, wz - recessDepth * 0.5 + 0.02);
      recessLeft.position.set(x - 0.48, vertical, wz - recessDepth * 0.5 + 0.02);
      recessRight.position.set(x + 0.48, vertical, wz - recessDepth * 0.5 + 0.02);
      windowSill.position.set(x, vertical - 0.56, wz - 0.1);
      lintel.position.set(x, vertical + 0.59, wz - 0.06);
      bars.position.set(x, vertical, wz - 0.02);
      shuttersL.position.set(x - 0.56, vertical, wz - 0.05);
      shuttersR.position.set(x + 0.56, vertical, wz - 0.05);
      return;
    }

    if (normal === "x-") {
      const z = THREE.MathUtils.lerp(block.min.z + 0.8, block.max.z - 0.8, t);
      const wx = block.max.x;
      recessBack.position.set(wx - recessDepth * 0.5 + 0.01, vertical, z);
      recessBack.rotation.y = -Math.PI * 0.5;
      recessTop.position.set(wx + recessDepth * 0.5 - 0.02, vertical + 0.53, z);
      recessTop.rotation.y = Math.PI * 0.5;
      recessBottom.position.set(wx + recessDepth * 0.5 - 0.02, vertical - 0.53, z);
      recessBottom.rotation.y = Math.PI * 0.5;
      recessLeft.position.set(wx + recessDepth * 0.5 - 0.02, vertical, z - 0.48);
      recessLeft.rotation.y = Math.PI * 0.5;
      recessRight.position.set(wx + recessDepth * 0.5 - 0.02, vertical, z + 0.48);
      recessRight.rotation.y = Math.PI * 0.5;
      windowSill.position.set(wx + 0.1, vertical - 0.56, z);
      windowSill.rotation.y = Math.PI * 0.5;
      lintel.position.set(wx + 0.06, vertical + 0.59, z);
      lintel.rotation.y = Math.PI * 0.5;
      bars.position.set(wx + 0.02, vertical, z);
      bars.rotation.y = -Math.PI * 0.5;
      shuttersL.position.set(wx + 0.05, vertical, z - 0.56);
      shuttersL.rotation.y = -Math.PI * 0.5;
      shuttersR.position.set(wx + 0.05, vertical, z + 0.56);
      shuttersR.rotation.y = -Math.PI * 0.5;
      return;
    }

    const z = THREE.MathUtils.lerp(block.min.z + 0.8, block.max.z - 0.8, t);
    const wx = block.min.x;
    recessBack.position.set(wx + recessDepth * 0.5 - 0.01, vertical, z);
    recessBack.rotation.y = Math.PI * 0.5;
    recessTop.position.set(wx - recessDepth * 0.5 + 0.02, vertical + 0.53, z);
    recessTop.rotation.y = Math.PI * 0.5;
    recessBottom.position.set(wx - recessDepth * 0.5 + 0.02, vertical - 0.53, z);
    recessBottom.rotation.y = Math.PI * 0.5;
    recessLeft.position.set(wx - recessDepth * 0.5 + 0.02, vertical, z - 0.48);
    recessLeft.rotation.y = Math.PI * 0.5;
    recessRight.position.set(wx - recessDepth * 0.5 + 0.02, vertical, z + 0.48);
    recessRight.rotation.y = Math.PI * 0.5;
    windowSill.position.set(wx - 0.1, vertical - 0.56, z);
    windowSill.rotation.y = Math.PI * 0.5;
    lintel.position.set(wx - 0.06, vertical + 0.59, z);
    lintel.rotation.y = Math.PI * 0.5;
    bars.position.set(wx - 0.02, vertical, z);
    bars.rotation.y = Math.PI * 0.5;
    shuttersL.position.set(wx - 0.05, vertical, z - 0.56);
    shuttersL.rotation.y = Math.PI * 0.5;
    shuttersR.position.set(wx - 0.05, vertical, z + 0.56);
    shuttersR.rotation.y = Math.PI * 0.5;
  }

  private placeDoorFacadeParts(
    normal: FacadeNormal,
    block: VisualBlock,
    cx: number,
    cz: number,
    parts: DoorFacadeParts
  ) {
    const { door, doorFrameL, doorFrameR, doorFrameTop, doorThreshold, ringA, ringB, arch } = parts;

    if (normal === "z-") {
      door.position.set(cx, 1.15, block.max.z + 0.06);
      doorFrameL.position.set(cx - 0.78, 1.25, block.max.z + 0.1);
      doorFrameR.position.set(cx + 0.78, 1.25, block.max.z + 0.1);
      doorFrameTop.position.set(cx, 2.44, block.max.z + 0.1);
      doorThreshold.position.set(cx, 0.03, block.max.z + 0.15);
      ringA.position.set(cx - 0.35, 1.15, block.max.z + 0.2);
      ringB.position.set(cx + 0.35, 1.15, block.max.z + 0.2);
      arch.position.set(cx, 2.52, block.max.z + 0.06);
      arch.rotation.z = Math.PI;
      return;
    }

    if (normal === "z+") {
      door.position.set(cx, 1.15, block.min.z - 0.06);
      doorFrameL.position.set(cx - 0.78, 1.25, block.min.z - 0.1);
      doorFrameR.position.set(cx + 0.78, 1.25, block.min.z - 0.1);
      doorFrameTop.position.set(cx, 2.44, block.min.z - 0.1);
      doorThreshold.position.set(cx, 0.03, block.min.z - 0.15);
      ringA.position.set(cx - 0.35, 1.15, block.min.z - 0.2);
      ringB.position.set(cx + 0.35, 1.15, block.min.z - 0.2);
      arch.position.set(cx, 2.52, block.min.z - 0.06);
      arch.rotation.z = Math.PI;
      return;
    }

    if (normal === "x-") {
      door.position.set(block.max.x + 0.06, 1.15, cz);
      door.rotation.y = -Math.PI * 0.5;
      doorFrameL.position.set(block.max.x + 0.1, 1.25, cz - 0.78);
      doorFrameL.rotation.y = -Math.PI * 0.5;
      doorFrameR.position.set(block.max.x + 0.1, 1.25, cz + 0.78);
      doorFrameR.rotation.y = -Math.PI * 0.5;
      doorFrameTop.position.set(block.max.x + 0.1, 2.44, cz);
      doorFrameTop.rotation.y = -Math.PI * 0.5;
      doorThreshold.position.set(block.max.x + 0.15, 0.03, cz);
      doorThreshold.rotation.y = -Math.PI * 0.5;
      ringA.position.set(block.max.x + 0.2, 1.15, cz - 0.35);
      ringA.rotation.y = -Math.PI * 0.5;
      ringB.position.set(block.max.x + 0.2, 1.15, cz + 0.35);
      ringB.rotation.y = -Math.PI * 0.5;
      arch.position.set(block.max.x + 0.06, 2.52, cz);
      arch.rotation.set(0, -Math.PI * 0.5, Math.PI);
      return;
    }

    door.position.set(block.min.x - 0.06, 1.15, cz);
    door.rotation.y = Math.PI * 0.5;
    doorFrameL.position.set(block.min.x - 0.1, 1.25, cz - 0.78);
    doorFrameL.rotation.y = Math.PI * 0.5;
    doorFrameR.position.set(block.min.x - 0.1, 1.25, cz + 0.78);
    doorFrameR.rotation.y = Math.PI * 0.5;
    doorFrameTop.position.set(block.min.x - 0.1, 2.44, cz);
    doorFrameTop.rotation.y = Math.PI * 0.5;
    doorThreshold.position.set(block.min.x - 0.15, 0.03, cz);
    doorThreshold.rotation.y = Math.PI * 0.5;
    ringA.position.set(block.min.x - 0.2, 1.15, cz - 0.35);
    ringA.rotation.y = Math.PI * 0.5;
    ringB.position.set(block.min.x - 0.2, 1.15, cz + 0.35);
    ringB.rotation.y = Math.PI * 0.5;
    arch.position.set(block.min.x - 0.06, 2.52, cz);
    arch.rotation.set(0, Math.PI * 0.5, Math.PI);
  }

  private buildMarketBooths() {
    const postMat = this.materials.get("wood", "booth:posts", 1.4, 1.4);
    const counterMat = this.materials.get("wood", "booth:counter", 1.3, 1.3);
    const reedMat = this.materials.get("reed", "booth:reed", 2.4, 1.2);
    const canopyMat = this.materials.get("cloth", "booth:canopy", 2, 2);

    const boothPoints = this.map.points.filter((p) => p.id.includes("bazaar") || p.id.includes("street") || p.id.includes("site"));
    const next = lcg(hashSeed(`${this.map.id}:booths`));

    for (const point of boothPoints) {
      const baseX = point.pos.x + (rand01(next) - 0.5) * 3.5;
      const baseZ = point.pos.z + (rand01(next) - 0.5) * 3.5;
      const rotY = rand01(next) * Math.PI * 2;

      const root = new THREE.Group();
      root.position.set(baseX, 0, baseZ);
      root.rotation.y = rotY;
      root.userData.ignoreImpactRay = true;

      // Posts with slight taper
      const postGeom = new THREE.CylinderGeometry(0.05, 0.065, 2.3, 8);
      const postOffsets = [[-1.1, 1.1], [1.1, 1.1], [-1.1, -0.9], [1.1, -0.9]] as const;
      for (const [x, z] of postOffsets) {
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(x, 1.15, z);
        post.castShadow = true;
        post.receiveShadow = true;
        post.userData.ignoreImpactRay = true;
        root.add(post);
      }

      // Cross braces between posts
      const braceMat = this.materials.get("wood", "booth:brace", 1, 1);
      const braceGeom = new THREE.BoxGeometry(2.2, 0.04, 0.04);
      const brace1 = new THREE.Mesh(braceGeom, braceMat);
      brace1.position.set(0, 2.0, 1.1);
      brace1.userData.ignoreImpactRay = true;
      root.add(brace1);
      const brace2 = new THREE.Mesh(braceGeom, braceMat);
      brace2.position.set(0, 2.0, -0.9);
      brace2.userData.ignoreImpactRay = true;
      root.add(brace2);

      // Counter with knife marks (slightly irregular top)
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.9), counterMat);
      counter.position.set(0, 0.85, 0.1);
      counter.castShadow = true;
      counter.receiveShadow = true;
      counter.userData.ignoreImpactRay = true;
      root.add(counter);

      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.36), reedMat);
      shelf.position.set(0, 1.25, -0.7);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      shelf.userData.ignoreImpactRay = true;
      root.add(shelf);

      // Canopy with more sag and detail
      const canopy = new THREE.Mesh(makeSaggingCloth(2.9, 2.6, 8, 6, 0.28), canopyMat);
      canopy.rotation.x = -Math.PI * 0.5;
      canopy.position.set(0, 2.28, 0.05);
      canopy.receiveShadow = true;
      canopy.castShadow = true;
      canopy.userData.ignoreImpactRay = true;
      root.add(canopy);

      this.scene.add(root);
      this.worldMeshes.push(root);
    }
  }

  private buildProps(props: readonly PlanProp[]) {
    const tarpGeom = makeSaggingCloth(1, 1, 10, 6, 0.14);
    const chainMat = this.materials.get("metal", "prop:chain", 1.2, 1.2);

    for (const prop of props) {
      if (prop.kind === "awning" || prop.kind === "tarp") {
        const clothType = prop.kind === "tarp" ? "cloth" : "reed";
        const mat = this.materials.get(clothType, `prop:${prop.id}`, 2.2, 2.2);
        const mesh = new THREE.Mesh(tarpGeom, mat);
        mesh.position.set(prop.pos.x, prop.pos.y, prop.pos.z);
        mesh.rotation.set(-Math.PI * 0.5, prop.rotY, 0);
        mesh.scale.set(prop.size.x, prop.size.z, 1);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.ignoreImpactRay = true;
        this.scene.add(mesh);
        this.worldMeshes.push(mesh);
        continue;
      }

      if (prop.kind === "sign") {
        const signTex = makeSignTexture(prop.id);
        this.transientTextures.push(signTex);
        const mat = new THREE.MeshStandardMaterial({
          map: signTex,
          roughness: 0.88,
          metalness: 0.06
        });
        this.transientMaterials.push(mat);

        // Sign board with thickness
        const board = new THREE.Mesh(new THREE.BoxGeometry(prop.width, prop.height, 0.04), mat);
        board.position.set(prop.pos.x, prop.pos.y, prop.pos.z);
        board.rotation.y = prop.rotY;
        board.castShadow = true;
        board.userData.ignoreImpactRay = true;
        this.scene.add(board);
        this.worldMeshes.push(board);

        const chainL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8), chainMat);
        const chainR = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8), chainMat);
        chainL.position.set(prop.pos.x - prop.width * 0.38, prop.pos.y + prop.height * 0.5 + 0.22, prop.pos.z);
        chainR.position.set(prop.pos.x + prop.width * 0.38, prop.pos.y + prop.height * 0.5 + 0.22, prop.pos.z);
        chainL.rotation.y = prop.rotY;
        chainR.rotation.y = prop.rotY;
        chainL.userData.ignoreImpactRay = true;
        chainR.userData.ignoreImpactRay = true;
        this.scene.add(chainL, chainR);
        this.worldMeshes.push(chainL, chainR);
        continue;
      }

      if (prop.kind === "lantern") {
        // Filigree-style brass lantern with colored glass
        const cageMat = this.materials.get("metal", `lantern:cage:${prop.id}`, 1, 1);
        const cage = new THREE.Mesh(
          new THREE.CylinderGeometry(prop.radius * 0.65, prop.radius * 0.75, prop.radius * 2.8, 12),
          cageMat
        );
        cage.position.set(prop.pos.x, prop.pos.y, prop.pos.z);
        cage.castShadow = true;
        cage.receiveShadow = true;
        cage.userData.ignoreImpactRay = true;

        // Lantern cap (top cone)
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(prop.radius * 0.7, prop.radius * 0.8, 8),
          cageMat
        );
        cap.position.set(prop.pos.x, prop.pos.y + prop.radius * 1.6, prop.pos.z);
        cap.userData.ignoreImpactRay = true;

        // Glowing bulb with stronger emissive
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(prop.radius * 0.52, 12, 10),
          new THREE.MeshStandardMaterial({
            color: 0xffdfb2,
            emissive: 0xffb573,
            emissiveIntensity: 1.4,
            roughness: 0.3,
            metalness: 0.05,
            transparent: true,
            opacity: 0.9
          })
        );
        this.transientMaterials.push(bulb.material as THREE.Material);
        bulb.position.set(prop.pos.x, prop.pos.y, prop.pos.z);
        bulb.userData.ignoreImpactRay = true;

        if (prop.wallMounted) {
          // Wall bracket instead of hanging chain
          const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.04, 0.22),
            cageMat
          );
          bracket.position.set(prop.pos.x, prop.pos.y + prop.radius * 0.8, prop.pos.z);
          bracket.userData.ignoreImpactRay = true;
          this.scene.add(cage, cap, bulb, bracket);
          this.worldMeshes.push(cage, cap, bulb, bracket);
        } else {
          // Hanging chain
          const hangChain = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.6, 6),
            chainMat
          );
          hangChain.position.set(prop.pos.x, prop.pos.y + prop.radius * 2.2, prop.pos.z);
          hangChain.userData.ignoreImpactRay = true;
          this.scene.add(cage, cap, bulb, hangChain);
          this.worldMeshes.push(cage, cap, bulb, hangChain);
        }
        continue;
      }

      if (prop.kind === "clothStrip") {
        // Hanging narrow cloth strip between two points
        const stripMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(prop.color),
          roughness: 0.92,
          metalness: 0.01,
          side: THREE.DoubleSide
        });
        this.transientMaterials.push(stripMat);
        const dx = prop.to.x - prop.from.x;
        const dz = prop.to.z - prop.from.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const stripGeom = makeSaggingCloth(len, prop.width, 8, 2, 0.18);
        const strip = new THREE.Mesh(stripGeom, stripMat);
        const mx = (prop.from.x + prop.to.x) * 0.5;
        const my = (prop.from.y + prop.to.y) * 0.5;
        const mz = (prop.from.z + prop.to.z) * 0.5;
        strip.position.set(mx, my, mz);
        strip.rotation.set(-Math.PI * 0.5, Math.atan2(dx, dz), 0);
        strip.castShadow = true;
        strip.receiveShadow = true;
        strip.userData.ignoreImpactRay = true;
        this.scene.add(strip);
        this.worldMeshes.push(strip);
        continue;
      }

      if (prop.kind !== "cable") continue;

      const mid = new THREE.Vector3(
        (prop.from.x + prop.to.x) * 0.5,
        Math.min(prop.from.y, prop.to.y) - prop.sag,
        (prop.from.z + prop.to.z) * 0.5
      );
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(prop.from.x, prop.from.y, prop.from.z),
        mid,
        new THREE.Vector3(prop.to.x, prop.to.y, prop.to.z)
      );
      const points = curve.getPoints(22);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2c2620, transparent: true, opacity: 0.68 }));
      this.transientMaterials.push(line.material as THREE.Material);
      line.userData.ignoreImpactRay = true;
      this.scene.add(line);
      this.worldMeshes.push(line);
    }
  }

  private buildAtmosphere() {
    // Multiple palm trees at map edges
    const palmPositions = [
      { x: 62, z: 48, h: 12, r: 0.35 },
      { x: -62, z: -52, h: 10, r: 0.3 },
      { x: 55, z: -58, h: 11, r: 0.32 }
    ];

    for (const palm of palmPositions) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(palm.r, palm.r + 0.12, palm.h, 14),
        this.materials.get("wood", `palm:trunk:${palm.x}`, 2.4, 5.2)
      );
      trunk.position.set(palm.x, palm.h * 0.5, palm.z);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      trunk.userData.ignoreImpactRay = true;
      this.scene.add(trunk);
      this.worldMeshes.push(trunk);

      const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7040, roughness: 0.92, metalness: 0.01, side: THREE.DoubleSide });
      this.transientMaterials.push(leafMat);
      for (let i = 0; i < 11; i++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.2, 5, 1), leafMat);
        leaf.position.set(palm.x, palm.h + Math.sin(i * 0.8) * 0.3, palm.z);
        leaf.rotation.set(-0.25 + Math.sin(i) * 0.12, (Math.PI * 2 * i) / 11, 0.1);
        leaf.userData.ignoreImpactRay = true;
        this.scene.add(leaf);
        this.worldMeshes.push(leaf);
      }
    }

    // Volumetric dust planes: more, varied, angled
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0xd9b88e,
      transparent: true,
      opacity: 0.06,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.transientMaterials.push(dustMat);
    for (let i = 0; i < 18; i++) {
      const dust = new THREE.Mesh(new THREE.PlaneGeometry(12, 22), dustMat);
      const x = -50 + i * 6.2;
      const z = -24 + Math.sin(i * 1.4) * 26;
      dust.position.set(x, 6 + Math.sin(i * 0.7) * 3, z);
      dust.rotation.set(0.15 + Math.sin(i * 0.5) * 0.1, 0.35 + i * 0.12, Math.sin(i * 0.8) * 0.08);
      dust.userData.ignoreImpactRay = true;
      this.scene.add(dust);
      this.worldMeshes.push(dust);
    }

    // Rope coils near walls
    const ropeMat = this.materials.get("cloth", "atmos:rope", 1, 1);
    const ropeGeo = new THREE.TorusGeometry(0.25, 0.04, 8, 16);
    const ropePositions = [
      { x: -8, z: 22 }, { x: 6, z: 36 }, { x: -42, z: 28 }, { x: 38, z: -38 }
    ];
    for (const rp of ropePositions) {
      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      rope.position.set(rp.x, 0.06, rp.z);
      rope.rotation.x = -Math.PI * 0.5;
      rope.scale.y = 0.4; // Flatten
      rope.userData.ignoreImpactRay = true;
      rope.castShadow = true;
      this.scene.add(rope);
      this.worldMeshes.push(rope);
    }

    // Clay water jugs near doors
    const jugMat = this.materials.get("ceramic", "atmos:jug", 1, 1);
    const jugBody = new THREE.SphereGeometry(0.2, 12, 10);
    const jugNeck = new THREE.CylinderGeometry(0.06, 0.1, 0.15, 10);
    const jugPositions = [
      { x: -22, z: 30 }, { x: 16, z: -18 }, { x: -50, z: 42 }, { x: 46, z: -30 }, { x: 3, z: 18 }
    ];
    for (const jp of jugPositions) {
      const body = new THREE.Mesh(jugBody, jugMat);
      body.position.set(jp.x, 0.2, jp.z);
      body.userData.ignoreImpactRay = true;
      body.castShadow = true;

      const neck = new THREE.Mesh(jugNeck, jugMat);
      neck.position.set(jp.x, 0.45, jp.z);
      neck.userData.ignoreImpactRay = true;

      this.scene.add(body, neck);
      this.worldMeshes.push(body, neck);
    }

    // Hanging herb bundles near booths
    const herbMat = new THREE.MeshStandardMaterial({ color: 0x5a7848, roughness: 0.9, metalness: 0.01 });
    this.transientMaterials.push(herbMat);
    const herbGeo = new THREE.ConeGeometry(0.06, 0.25, 6);
    const bazaarPoints = this.map.points.filter(p => p.id.includes("bazaar") || p.id.includes("street"));
    const herbNext = lcg(hashSeed("herbs"));
    for (const pt of bazaarPoints) {
      for (let i = 0; i < 3; i++) {
        const hx = pt.pos.x + (rand01(herbNext) - 0.5) * 4;
        const hz = pt.pos.z + (rand01(herbNext) - 0.5) * 4;
        const herb = new THREE.Mesh(herbGeo, herbMat);
        herb.position.set(hx, 2.0 + rand01(herbNext) * 0.4, hz);
        herb.rotation.set(Math.PI, 0, rand01(herbNext) * 0.3);
        herb.userData.ignoreImpactRay = true;
        this.scene.add(herb);
        this.worldMeshes.push(herb);
      }
    }
  }

  update(dt: number, velocityMagnitude: number, pointerLocked: boolean) {
    this.viewmodel.setActive(pointerLocked);
    this.viewmodel.update(dt, velocityMagnitude);
    this.elapsedTime += dt;
    this.post.updateTime(this.elapsedTime);
  }

  onLocalShot() {
    this.viewmodel.onShot();
  }

  render() {
    this.post.render();
  }

  resize(width: number, height: number) {
    this.post.setSize(width, height);
  }

  diagnostics(): RenderDiagnostics {
    const mats = new Set<string>();
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) mats.add(m.uuid);
      } else {
        mats.add(obj.material.uuid);
      }
    });
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      materials: mats.size
    };
  }

  dispose() {
    this.post.dispose();
    this.dressing.dispose();
    this.materials.dispose();

    for (const tex of this.transientTextures) tex.dispose();
    for (const mat of this.transientMaterials) mat.dispose();

    for (const obj of this.worldMeshes) {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      if (obj instanceof THREE.Line) obj.geometry.dispose();
    }
  }
}
