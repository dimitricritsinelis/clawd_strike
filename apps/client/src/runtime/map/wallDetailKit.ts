import {
  BufferGeometry,
  BoxGeometry,
  ClampToEdgeWrapping,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  SRGBColorSpace,
  Shape,
  Texture,
  TextureLoader,
} from "three";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import { applyWindowGlassShaderTweaks } from "../render/materials/applyWindowGlassShaderTweaks";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeWallMode } from "../utils/UrlParams";
import {
  HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS,
  HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS,
  HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS,
  POINTED_ARCH_APERTURE_PANEL_BOUNDS,
  POINTED_ARCH_FRAME_APERTURE_BOUNDS,
  POINTED_ARCH_FRAME_OUTER_BOUNDS,
} from "./pointedArchProfile";
import { resolveWallShaderProfile } from "./wallShaderProfiles";

export type WallDetailMeshId =
  | "plinth_strip"
  | "cornice_strip"
  | "string_course_strip"
  | "corner_pier"
  | "vertical_edge_trim"
  | "pilaster"
  | "recessed_panel_frame_h"
  | "recessed_panel_frame_v"
  | "recessed_panel_back"
  | "door_jamb"
  | "door_lintel"
  | "door_arch_lintel"
  | "door_void"
  | "door_void_arch"
  | "sign_board"
  | "sign_bracket"
  | "awning_bracket"
  | "cable_segment"
  | "window_shutter"
  | "window_pointed_arch_void"
  | "window_pointed_arch_glass"
  | "window_pointed_arch_frame"
  | "hero_window_pointed_arch_void"
  | "hero_window_pointed_arch_glass"
  | "hero_window_pointed_arch_frame"
  | "window_glass"
  | "balcony_slab"
  | "balcony_parapet"
  | "balcony_railing"
  | "balcony_end_cap"
  | "balcony_bracket"
  | "roof_slab";

export type WallDetailInstance = {
  meshId: WallDetailMeshId;
  position: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  yawRad: number;
  pitchRad?: number;
  rollRad?: number;
  wallMaterialId: string | null;
  trimMaterialId: string | null;
  detailMaterialId?: string | null;
};

export type BuildWallDetailMeshesOptions = {
  highVis: boolean;
  wallMode: RuntimeWallMode;
  wallMaterials: WallMaterialLibrary | null;
  quality: WallTextureQuality;
  seed: number;
};

type DetailTemplate = {
  geometry: BufferGeometry;
  material: MeshStandardMaterial | MeshPhysicalMaterial;
};

type DetailBucket = {
  meshId: WallDetailMeshId;
  materialId: string | null;
  materialSource: "manifest" | "template" | "mesh-template";
  instances: WallDetailInstance[];
};

type DetailStabilityClass = "default" | "surface-trim";

const DETAIL_IDS: WallDetailMeshId[] = [
  "plinth_strip",
  "cornice_strip",
  "string_course_strip",
  "corner_pier",
  "vertical_edge_trim",
  "pilaster",
  "recessed_panel_frame_h",
  "recessed_panel_frame_v",
  "recessed_panel_back",
  "door_jamb",
  "door_lintel",
  "door_arch_lintel",
  "door_void",
  "door_void_arch",
  "sign_board",
  "sign_bracket",
  "awning_bracket",
  "cable_segment",
  "window_shutter",
  "window_pointed_arch_void",
  "window_pointed_arch_glass",
  "window_pointed_arch_frame",
  "hero_window_pointed_arch_void",
  "hero_window_pointed_arch_glass",
  "hero_window_pointed_arch_frame",
  "window_glass",
  "balcony_slab",
  "balcony_parapet",
  "balcony_railing",
  "balcony_end_cap",
  "balcony_bracket",
  "roof_slab",
];

function isStainedGlassMaterialId(materialId: string | null): boolean {
  return materialId === "tm_stained_glass_bright" || materialId === "tm_stained_glass_dim";
}

const HEAVY_TRIM_MESH_IDS = new Set<WallDetailMeshId>([
  "plinth_strip",
  "cornice_strip",
  "corner_pier",
  "pilaster",
  "recessed_panel_back",
  "balcony_slab",
  "balcony_parapet",
  "balcony_end_cap",
  "balcony_bracket",
  "window_pointed_arch_frame",
  "hero_window_pointed_arch_frame",
]);

const LIGHT_TRIM_MESH_IDS = new Set<WallDetailMeshId>([
  "string_course_strip",
  "vertical_edge_trim",
]);

const SURFACE_TRIM_MESH_IDS = new Set<WallDetailMeshId>([
  "plinth_strip",
  "cornice_strip",
  "string_course_strip",
  "vertical_edge_trim",
  "corner_pier",
  "pilaster",
  "recessed_panel_frame_h",
  "recessed_panel_frame_v",
  "door_jamb",
  "door_lintel",
  "door_arch_lintel",
  "window_pointed_arch_frame",
  "hero_window_pointed_arch_frame",
]);

const WALL_DETAIL_RENDER_ORDER = 10;
const WINDOW_GLASS_RENDER_ORDER = 11;
const STAINED_GLASS_TEXTURE_BASE_URL = "/assets/textures/environment/bazaar/windows/stained_glass_panel_001";
const templateTextureLoader = new TextureLoader();
const templateTextureCache = new Map<string, Texture>();

function createDoorVoidArchGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0);
  shape.absarc(0, 0, 0.5, 0, Math.PI, false);
  shape.lineTo(-0.5, -0.5);

  const geometry = new ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-0.5, 0, 0);
  return geometry;
}

function createPointedArchShape(widthHalf: number, bottomY: number, springY: number, apexY: number): Shape {
  const shape = new Shape();
  shape.moveTo(-widthHalf, bottomY);
  shape.lineTo(widthHalf, bottomY);
  shape.lineTo(widthHalf, springY);
  shape.quadraticCurveTo(widthHalf * 0.94, apexY * 0.82, 0, apexY);
  shape.quadraticCurveTo(-widthHalf * 0.94, apexY * 0.82, -widthHalf, springY);
  shape.lineTo(-widthHalf, bottomY);
  return shape;
}

function createPointedArchPanelGeometry(): BufferGeometry {
  const geometry = new ExtrudeGeometry(createPointedArchShape(
    POINTED_ARCH_APERTURE_PANEL_BOUNDS.widthHalf,
    POINTED_ARCH_APERTURE_PANEL_BOUNDS.bottomY,
    POINTED_ARCH_APERTURE_PANEL_BOUNDS.springY,
    POINTED_ARCH_APERTURE_PANEL_BOUNDS.apexY,
  ), {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-0.5, 0, 0);
  applyProjectedArchUvs(geometry);
  return geometry;
}

function createPointedArchFrameGeometry(): BufferGeometry {
  const outer = createPointedArchShape(
    POINTED_ARCH_FRAME_OUTER_BOUNDS.widthHalf,
    POINTED_ARCH_FRAME_OUTER_BOUNDS.bottomY,
    POINTED_ARCH_FRAME_OUTER_BOUNDS.springY,
    POINTED_ARCH_FRAME_OUTER_BOUNDS.apexY,
  );
  const inner = createPointedArchShape(
    POINTED_ARCH_FRAME_APERTURE_BOUNDS.widthHalf,
    POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY,
    POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY,
    POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY,
  );
  outer.holes.push(inner);
  const geometry = new ExtrudeGeometry(outer, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-0.5, 0, 0);
  applyProjectedArchUvs(geometry);
  return geometry;
}

function createHeroPointedArchShape(widthHalf: number, bottomY: number, springY: number, apexY: number): Shape {
  const shape = new Shape();
  shape.moveTo(-widthHalf, bottomY);
  shape.lineTo(widthHalf, bottomY);
  shape.lineTo(widthHalf, springY);
  shape.quadraticCurveTo(widthHalf * 0.34, apexY * 0.98, 0, apexY);
  shape.quadraticCurveTo(-widthHalf * 0.34, apexY * 0.98, -widthHalf, springY);
  shape.lineTo(-widthHalf, bottomY);
  return shape;
}

function createHeroPointedArchPanelGeometry(): BufferGeometry {
  const geometry = new ExtrudeGeometry(createHeroPointedArchShape(
    HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS.widthHalf,
    HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS.bottomY,
    HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS.springY,
    HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS.apexY,
  ), {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 28,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-0.5, 0, 0);
  applyProjectedArchUvs(geometry);
  return geometry;
}

function createHeroPointedArchFrameGeometry(): BufferGeometry {
  const outer = createHeroPointedArchShape(
    HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS.widthHalf,
    HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS.bottomY,
    HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS.springY,
    HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS.apexY,
  );
  const inner = createHeroPointedArchShape(
    HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.widthHalf,
    HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY,
    HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY,
    HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY,
  );
  outer.holes.push(inner);
  const geometry = new ExtrudeGeometry(outer, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 28,
  });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-0.5, 0, 0);
  applyProjectedArchUvs(geometry);
  return geometry;
}

function applyProjectedArchUvs(geometry: BufferGeometry): void {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  if (!bbox || !position) return;

  const zRange = Math.max(1e-4, bbox.max.z - bbox.min.z);
  const yRange = Math.max(1e-4, bbox.max.y - bbox.min.y);
  const uvValues = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const u = (position.getZ(index) - bbox.min.z) / zRange;
    const v = (position.getY(index) - bbox.min.y) / yRange;
    uvValues[index * 2] = u;
    uvValues[index * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new Float32BufferAttribute(uvValues, 2));
}

function loadTemplateTexture(relativeUrl: string, colorSpace: Texture["colorSpace"]): Texture {
  const resolvedUrl = new URL(relativeUrl, window.location.href).toString();
  const cached = templateTextureCache.get(resolvedUrl);
  if (cached) return cached;

  const texture = templateTextureLoader.load(resolvedUrl);
  texture.colorSpace = colorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  templateTextureCache.set(resolvedUrl, texture);
  return texture;
}

function createStainedGlassMaterial(variant: "bright" | "dim"): MeshPhysicalMaterial {
  const baseColorTex = loadTemplateTexture(`${STAINED_GLASS_TEXTURE_BASE_URL}/Glass_Stained_Panel_001_basecolor.png`, SRGBColorSpace);
  const opacityTex = loadTemplateTexture(`${STAINED_GLASS_TEXTURE_BASE_URL}/Glass_Stained_Panel_001_opacity.png`, NoColorSpace);

  const isBright = variant === "bright";
  const material = new MeshPhysicalMaterial({
    color: isBright ? 0xffffff : 0xb7c5bf,
    roughness: isBright ? 0.36 : 0.48,
    metalness: 0.0,
    map: baseColorTex,
    alphaMap: opacityTex,
    emissive: 0xffffff,
    emissiveMap: baseColorTex,
    emissiveIntensity: isBright ? 0.52 : 0.28,
    transmission: isBright ? 0.08 : 0.03,
    thickness: isBright ? 0.02 : 0.01,
    ior: 1.08,
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
    transparent: true,
    opacity: isBright ? 0.98 : 0.9,
    alphaTest: 0.02,
    side: DoubleSide,
  });
  material.toneMapped = false;
  material.depthWrite = false;
  material.userData.isWindowStainedGlass = true;
  return material;
}

function inheritsWallSurface(meshId: WallDetailMeshId): boolean {
  return HEAVY_TRIM_MESH_IDS.has(meshId) || LIGHT_TRIM_MESH_IDS.has(meshId);
}

function resolveDetailStabilityClass(meshId: WallDetailMeshId): DetailStabilityClass {
  return SURFACE_TRIM_MESH_IDS.has(meshId) ? "surface-trim" : "default";
}

type RoofMaterialShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];
type TemplateMaterialOverrideId =
  | "tm_balcony_wood_dark"
  | "tm_balcony_painted_metal"
  | "tm_stained_glass_bright"
  | "tm_stained_glass_dim";

function applyRoofDustShader(material: MeshStandardMaterial): void {
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: RoofMaterialShader, renderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);

    if (!shader.vertexShader.includes("varying vec3 vRoofWorldPos;")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
varying vec3 vRoofWorldPos;
varying vec3 vRoofWorldNormal;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
{
  vec4 roofWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    roofWp = instanceMatrix * roofWp;
  #endif
  roofWp = modelMatrix * roofWp;
  vRoofWorldPos = roofWp.xyz;
}
vec3 roofObjN = normal;
#ifdef USE_INSTANCING
roofObjN = mat3(instanceMatrix) * roofObjN;
#endif
vRoofWorldNormal = normalize(mat3(modelMatrix) * roofObjN);`,
      );
    }

    if (!shader.fragmentShader.includes("varying vec3 vRoofWorldPos;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
varying vec3 vRoofWorldPos;
varying vec3 vRoofWorldNormal;

float roofHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float roofValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = roofHash12(i);
  float b = roofHash12(i + vec2(1.0, 0.0));
  float c = roofHash12(i + vec2(0.0, 1.0));
  float d = roofHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
      );
    }

    if (!shader.fragmentShader.includes("// roof-dust-applied")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
// roof-dust-applied
{
  float upFacing = clamp(vRoofWorldNormal.y, 0.0, 1.0);
  float dustNoise = roofValueNoise(vRoofWorldPos.xz * 0.22);
  float dustNoise2 = roofValueNoise(vRoofWorldPos.xz * 0.08 + vec2(17.3, -9.1));
  float dustMask = upFacing * mix(dustNoise, dustNoise2, 0.4);
  dustMask = smoothstep(0.15, 0.65, dustMask);
  vec3 dustColor = vec3(0.85, 0.78, 0.65);
  diffuseColor.rgb = mix(diffuseColor.rgb, dustColor, dustMask * 0.55);
}`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
{
  float roofUpFacing = clamp(vRoofWorldNormal.y, 0.0, 1.0);
  roughnessFactor = clamp(roughnessFactor + roofUpFacing * 0.05, 0.04, 1.0);
}`,
      );
    }
  };

  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = (): string => `${previousProgramCacheKey()}|roof-dust`;
  material.needsUpdate = true;
}

function createTemplates(highVis: boolean): Record<WallDetailMeshId, DetailTemplate> {
  const palette = resolveBlockoutPalette(highVis);

  const stonePrimary = new MeshStandardMaterial({
    color: palette.wall,
    roughness: 0.88,
    metalness: 0.03,
  });
  const stoneTrim = new MeshStandardMaterial({
    color: palette.serviceDoor,
    roughness: 0.84,
    metalness: 0.03,
  });
  const stoneRecess = new MeshStandardMaterial({
    color: palette.filler,
    roughness: 0.9,
    metalness: 0.01,
  });
  const accent = new MeshStandardMaterial({
    color: palette.signage,
    roughness: 0.7,
    metalness: 0.08,
  });
  const bracketMetal = new MeshStandardMaterial({
    color: 0x656c73,
    roughness: 0.58,
    metalness: 0.42,
  });
  const cableMetal = new MeshStandardMaterial({
    color: 0x444b52,
    roughness: 0.64,
    metalness: 0.34,
  });
  const frameTrim = new MeshStandardMaterial({
    color: highVis ? 0xb59a7c : 0x9d8367,
    roughness: 0.76,
    metalness: 0.04,
  });
  const woodShutter = new MeshStandardMaterial({
    color: highVis ? 0x6c8d78 : 0x556f60,
    roughness: 0.8,
    metalness: 0.02,
  });
  const windowGlass = new MeshPhysicalMaterial({
    color: highVis ? 0x6b767d : 0x505c64,
    roughness: 0.22,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    ior: 1.5,
    specularIntensity: 0.5,
    specularColor: 0xd0d7dd,
  });
  applyWindowGlassShaderTweaks(windowGlass, { highVis });

  const roofBitumen = new MeshStandardMaterial({
    color: highVis ? 0x4a4540 : 0x3a3530,
    roughness: 0.92,
    metalness: 0,
  });
  applyRoofDustShader(roofBitumen);

  return {
    plinth_strip: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    cornice_strip: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    string_course_strip: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    corner_pier: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stonePrimary,
    },
    vertical_edge_trim: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    pilaster: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stonePrimary,
    },
    recessed_panel_frame_h: {
      geometry: new BoxGeometry(1, 1, 1),
      material: frameTrim,
    },
    recessed_panel_frame_v: {
      geometry: new BoxGeometry(1, 1, 1),
      material: frameTrim,
    },
    recessed_panel_back: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneRecess,
    },
    door_jamb: {
      geometry: new BoxGeometry(1, 1, 1),
      material: frameTrim,
    },
    door_lintel: {
      geometry: new BoxGeometry(1, 1, 1),
      material: frameTrim,
    },
    door_arch_lintel: {
      geometry: new CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI),
      material: frameTrim,
    },
    door_void: {
      geometry: new BoxGeometry(1, 1, 1),
      material: new MeshStandardMaterial({ color: 0x0c1218, roughness: 0.95, metalness: 0.0 }),
    },
    door_void_arch: {
      geometry: createDoorVoidArchGeometry(),
      material: new MeshStandardMaterial({ color: 0x0c1218, roughness: 0.95, metalness: 0.0 }),
    },
    sign_board: {
      geometry: new BoxGeometry(1, 1, 1),
      material: accent,
    },
    sign_bracket: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
    awning_bracket: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
    cable_segment: {
      geometry: new CylinderGeometry(0.5, 0.5, 1, 10, 1, true),
      material: cableMetal,
    },
    window_shutter: {
      geometry: new BoxGeometry(1, 1, 1),
      material: woodShutter,
    },
    window_pointed_arch_void: {
      geometry: createPointedArchPanelGeometry(),
      material: new MeshStandardMaterial({ color: 0x0c1218, roughness: 0.96, metalness: 0.0 }),
    },
    window_pointed_arch_glass: {
      geometry: createPointedArchPanelGeometry(),
      material: createStainedGlassMaterial("bright"),
    },
    window_pointed_arch_frame: {
      geometry: createPointedArchFrameGeometry(),
      material: frameTrim,
    },
    hero_window_pointed_arch_void: {
      geometry: createHeroPointedArchPanelGeometry(),
      material: new MeshStandardMaterial({ color: 0x0c1218, roughness: 0.96, metalness: 0.0 }),
    },
    hero_window_pointed_arch_glass: {
      geometry: createHeroPointedArchPanelGeometry(),
      material: createStainedGlassMaterial("bright"),
    },
    hero_window_pointed_arch_frame: {
      geometry: createHeroPointedArchFrameGeometry(),
      material: frameTrim,
    },
    window_glass: {
      geometry: new BoxGeometry(1, 1, 1),
      material: windowGlass,
    },
    balcony_slab: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    balcony_parapet: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    balcony_railing: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
    balcony_end_cap: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    balcony_bracket: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    roof_slab: {
      geometry: new BoxGeometry(1, 1, 1),
      material: roofBitumen,
    },
  };
}

function createTemplateMaterialOverrides(
  highVis: boolean,
): Record<TemplateMaterialOverrideId, MeshStandardMaterial | MeshPhysicalMaterial> {
  return {
    tm_balcony_wood_dark: new MeshStandardMaterial({
      color: highVis ? 0x98714a : 0x7b5b3d,
      roughness: 0.8,
      metalness: 0.02,
    }),
    tm_balcony_painted_metal: new MeshStandardMaterial({
      color: highVis ? 0x7d868d : 0x626a72,
      roughness: 0.56,
      metalness: 0.4,
    }),
    tm_stained_glass_bright: createStainedGlassMaterial("bright"),
    tm_stained_glass_dim: createStainedGlassMaterial("dim"),
  };
}

function resolveMaterialUvOffset(seed: number, materialId: string): { x: number; y: number } {
  const offsetSeed = deriveSubSeed(seed, `wall-uvoffset:${materialId}`);
  const offsetRng = new DeterministicRng(offsetSeed);
  return {
    x: offsetRng.int(0, 4),
    y: offsetRng.int(0, 4),
  };
}

function buildBlockoutDetailMeshes(
  instances: readonly WallDetailInstance[],
  templates: Record<WallDetailMeshId, DetailTemplate>,
  root: Group,
): void {
  const grouped = new Map<WallDetailMeshId, WallDetailInstance[]>();
  for (const meshId of DETAIL_IDS) {
    grouped.set(meshId, []);
  }
  for (const instance of instances) {
    grouped.get(instance.meshId)?.push(instance);
  }

  const dummy = new Object3D();
  for (const meshId of DETAIL_IDS) {
    const bucket = grouped.get(meshId);
    if (!bucket || bucket.length === 0) continue;

    const template = templates[meshId];
    const mesh = new InstancedMesh(template.geometry, template.material, bucket.length);
    mesh.name = `wall-detail-${meshId}`;
    mesh.castShadow = meshId !== "window_pointed_arch_glass" && meshId !== "hero_window_pointed_arch_glass";
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = meshId === "window_pointed_arch_glass" || meshId === "hero_window_pointed_arch_glass"
      ? WINDOW_GLASS_RENDER_ORDER
      : WALL_DETAIL_RENDER_ORDER;

    for (let index = 0; index < bucket.length; index += 1) {
      const instance = bucket[index]!;
      dummy.position.set(instance.position.x, instance.position.y, instance.position.z);
      dummy.rotation.set(instance.pitchRad ?? 0, instance.yawRad, instance.rollRad ?? 0);
      dummy.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }
}

function buildPbrDetailMeshes(
  instances: readonly WallDetailInstance[],
  templates: Record<WallDetailMeshId, DetailTemplate>,
  root: Group,
  options: BuildWallDetailMeshesOptions,
): void {
  const wallMaterials = options.wallMaterials;
  if (!wallMaterials) return;

  const materialIds = wallMaterials.getMaterialIds();
  if (materialIds.length === 0) return;
  const fallbackMaterialId = materialIds[0]!;
  const availableMaterialIds = new Set(materialIds);
  const templateMaterialOverrides = createTemplateMaterialOverrides(options.highVis);
  const availableTemplateMaterialIds = new Set<string>(Object.keys(templateMaterialOverrides));

  const grouped = new Map<string, DetailBucket>();
  for (const instance of instances) {
    const shouldInheritWallSurface = inheritsWallSurface(instance.meshId);
    const preferred = instance.detailMaterialId ?? (instance.trimMaterialId ?? instance.wallMaterialId);

    let materialSource: DetailBucket["materialSource"] = "mesh-template";
    let resolvedMaterialId: string | null = null;
    if (preferred && availableMaterialIds.has(preferred)) {
      materialSource = "manifest";
      resolvedMaterialId = preferred;
    } else if (preferred && availableTemplateMaterialIds.has(preferred)) {
      materialSource = "template";
      resolvedMaterialId = preferred;
    } else if (shouldInheritWallSurface) {
      materialSource = "manifest";
      resolvedMaterialId = fallbackMaterialId;
    }

    const key = `${instance.meshId}|${materialSource}|${resolvedMaterialId ?? "template"}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.instances.push(instance);
      continue;
    }
    grouped.set(key, {
      meshId: instance.meshId,
      materialId: resolvedMaterialId,
      materialSource,
      instances: [instance],
    });
  }

  const surfaceMaterialCache = new Map<string, MeshStandardMaterial>();
  const getSurfaceMaterial = (
    materialId: string,
    surfaceKind: "detail" | "balcony",
    stabilityClass: DetailStabilityClass,
  ): MeshStandardMaterial => {
    const cacheKey = `${materialId}|${surfaceKind}|${stabilityClass}`;
    const cached = surfaceMaterialCache.get(cacheKey);
    if (cached) return cached;

    const material = wallMaterials.createStandardMaterial(materialId, options.quality);
    const albedoBoost =
      typeof material.userData.wallAlbedoBoost === "number" && Number.isFinite(material.userData.wallAlbedoBoost)
        ? material.userData.wallAlbedoBoost
        : 1;
    const tileSizeM = wallMaterials.getTileSizeM(materialId);
    const uvOffset = resolveMaterialUvOffset(options.seed, materialId);
    applyWallShaderTweaks(material, {
      albedoBoost,
      macroColorAmplitude: 0.08,
      macroRoughnessAmplitude: 0.05,
      macroFrequency: 0.18,
      macroSeed: deriveSubSeed(options.seed, `wall-macro:${materialId}`),
      tileSizeM,
      uvOffset,
      dirtEnabled: true,
      floorTopY: 0,
      dirtHeightM: 1.5,
      dirtDarken: 0.22,
      dirtRoughnessBoost: 0.12,
      ...resolveWallShaderProfile(materialId, surfaceKind),
    });
    if (stabilityClass === "surface-trim") {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      material.needsUpdate = true;
    }
    surfaceMaterialCache.set(cacheKey, material);
    return material;
  };

  const dummy = new Object3D();
  for (const bucket of grouped.values()) {
    const template = templates[bucket.meshId];
    const isBalconySurface = bucket.meshId.startsWith("balcony_");
    const stabilityClass = resolveDetailStabilityClass(bucket.meshId);
    const material =
      bucket.materialSource === "manifest" && bucket.materialId
        ? getSurfaceMaterial(bucket.materialId, isBalconySurface ? "balcony" : "detail", stabilityClass)
        : bucket.materialSource === "template" && bucket.materialId
          ? templateMaterialOverrides[bucket.materialId as TemplateMaterialOverrideId]
          : template.material;
    const mesh = new InstancedMesh(template.geometry, material, bucket.instances.length);
    mesh.name = bucket.materialId
      ? `wall-detail-${bucket.meshId}-${bucket.materialSource}-${bucket.materialId}`
      : `wall-detail-${bucket.meshId}-template`;
    mesh.castShadow = !isStainedGlassMaterialId(bucket.materialId);
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = bucket.meshId === "window_pointed_arch_glass" || isStainedGlassMaterialId(bucket.materialId)
      ? WINDOW_GLASS_RENDER_ORDER
      : WALL_DETAIL_RENDER_ORDER;

    for (let index = 0; index < bucket.instances.length; index += 1) {
      const instance = bucket.instances[index]!;
      dummy.position.set(instance.position.x, instance.position.y, instance.position.z);
      dummy.rotation.set(instance.pitchRad ?? 0, instance.yawRad, instance.rollRad ?? 0);
      dummy.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }
}

export function buildWallDetailMeshes(
  instances: readonly WallDetailInstance[],
  options: BuildWallDetailMeshesOptions,
): Group {
  const root = new Group();
  root.name = "map-wall-details";
  if (instances.length === 0) {
    return root;
  }

  const templates = createTemplates(options.highVis);
  if (options.wallMode !== "pbr" || !options.wallMaterials) {
    buildBlockoutDetailMeshes(instances, templates, root);
    return root;
  }

  buildPbrDetailMeshes(instances, templates, root, options);
  return root;
}
