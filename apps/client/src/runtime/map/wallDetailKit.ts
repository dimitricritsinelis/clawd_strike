import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import { applyWindowGlassShaderTweaks } from "../render/materials/applyWindowGlassShaderTweaks";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeWallMode } from "../utils/UrlParams";
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
  | "sign_board"
  | "sign_bracket"
  | "awning_bracket"
  | "cable_segment"
  | "window_shutter"
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
  geometry: BoxGeometry | CylinderGeometry;
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
  "sign_board",
  "sign_bracket",
  "awning_bracket",
  "cable_segment",
  "window_shutter",
  "window_glass",
  "balcony_slab",
  "balcony_parapet",
  "balcony_railing",
  "balcony_end_cap",
  "balcony_bracket",
  "roof_slab",
];

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
]);

const WALL_DETAIL_RENDER_ORDER = 10;

function inheritsWallSurface(meshId: WallDetailMeshId): boolean {
  return HEAVY_TRIM_MESH_IDS.has(meshId) || LIGHT_TRIM_MESH_IDS.has(meshId);
}

function resolveDetailStabilityClass(meshId: WallDetailMeshId): DetailStabilityClass {
  return SURFACE_TRIM_MESH_IDS.has(meshId) ? "surface-trim" : "default";
}

type RoofMaterialShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];
type TemplateMaterialOverrideId = "tm_balcony_wood_dark" | "tm_balcony_painted_metal";

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
): Record<TemplateMaterialOverrideId, MeshStandardMaterial> {
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = WALL_DETAIL_RENDER_ORDER;

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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = WALL_DETAIL_RENDER_ORDER;

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
