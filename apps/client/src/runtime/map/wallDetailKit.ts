import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeWallMode } from "../utils/UrlParams";

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
  | "sign_board"
  | "sign_bracket"
  | "awning_bracket"
  | "cable_segment"
  | "window_shutter"
  | "balcony_slab"
  | "balcony_railing";

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
  material: MeshStandardMaterial;
};

type DetailBucket = {
  meshId: WallDetailMeshId;
  wallMaterialId: string | null;
  instances: WallDetailInstance[];
};

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
  "sign_board",
  "sign_bracket",
  "awning_bracket",
  "cable_segment",
  "window_shutter",
  "balcony_slab",
  "balcony_railing",
];

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
      material: stoneTrim,
    },
    recessed_panel_frame_v: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    recessed_panel_back: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneRecess,
    },
    door_jamb: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    door_lintel: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    door_arch_lintel: {
      geometry: new CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI),
      material: stoneTrim,
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
      material: stonePrimary,
    },
    balcony_slab: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    balcony_railing: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
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

  const grouped = new Map<string, DetailBucket>();
  for (const instance of instances) {
    const wallMaterialId =
      instance.wallMaterialId && availableMaterialIds.has(instance.wallMaterialId)
        ? instance.wallMaterialId
        : fallbackMaterialId;
    const key = `${instance.meshId}|${wallMaterialId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.instances.push(instance);
      continue;
    }
    grouped.set(key, {
      meshId: instance.meshId,
      wallMaterialId,
      instances: [instance],
    });
  }

  const surfaceMaterialCache = new Map<string, MeshStandardMaterial>();
  const getSurfaceMaterial = (materialId: string): MeshStandardMaterial => {
    const cached = surfaceMaterialCache.get(materialId);
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
      macroColorAmplitude: 0.02,
      macroRoughnessAmplitude: 0.015,
      macroFrequency: 0.06,
      macroSeed: deriveSubSeed(options.seed, `wall-macro:${materialId}`),
      tileSizeM,
      uvOffset,
    });
    surfaceMaterialCache.set(materialId, material);
    return material;
  };

  const dummy = new Object3D();
  for (const bucket of grouped.values()) {
    const template = templates[bucket.meshId];
    const material = getSurfaceMaterial(bucket.wallMaterialId ?? fallbackMaterialId);
    const mesh = new InstancedMesh(template.geometry, material, bucket.instances.length);
    mesh.name = `wall-detail-${bucket.meshId}-${bucket.wallMaterialId ?? fallbackMaterialId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

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
