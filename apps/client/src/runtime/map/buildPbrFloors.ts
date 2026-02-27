import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { FloorMaterialLibrary, FloorTextureQuality } from "../render/materials/FloorMaterialLibrary";
import { applyFloorShaderTweaks } from "../render/materials/applyFloorShaderTweaks";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeBlockoutSpec, RuntimeRect } from "./types";

const INCLUDED_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);

type FloorMaterialId =
  | "large_sandstone_blocks_01"
  | "grey_tiles"
  | "cobblestone_pavement"
  | "cobblestone_color"
  | "sand_01";

type IncludedZoneType =
  | "spawn_plaza"
  | "main_lane_segment"
  | "side_hall"
  | "cut"
  | "connector";

const BASE_FLOOR_MATERIAL: FloorMaterialId = "cobblestone_color";
const UV_QUARTER_TURNS: 0 | 1 | 2 | 3 = 0;
const UV_OFFSET_U = 0;
const UV_OFFSET_V = 0;
const PATCH_INTERIOR_MARGIN_M = 1.0;
const GEOMETRY_EPSILON_M = 1e-6;

const PATCH_PROBABILITY_BY_ZONE: Record<IncludedZoneType, number> = {
  main_lane_segment: 0,
  spawn_plaza: 0,
  connector: 0,
  cut: 0,
  side_hall: 0,
};

type MaterialBatch = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexCount: number;
};

type BuildPbrFloorsOptions = {
  seed: number;
  quality: FloorTextureQuality;
  manifest: FloorMaterialLibrary;
  patchSizeM: number;
  floorTopY: number;
};

const MATERIAL_ORDER: FloorMaterialId[] = [
  "large_sandstone_blocks_01",
  "grey_tiles",
  "cobblestone_pavement",
  "cobblestone_color",
  "sand_01",
];

const FLOOR_MACRO_SETTINGS: Record<
  FloorMaterialId,
  { colorAmplitude: number; roughnessAmplitude: number; frequency: number }
> = {
  large_sandstone_blocks_01: {
    colorAmplitude: 0.006,
    roughnessAmplitude: 0.006,
    frequency: 0.06,
  },
  grey_tiles: {
    colorAmplitude: 0.004,
    roughnessAmplitude: 0.004,
    frequency: 0.075,
  },
  cobblestone_pavement: {
    colorAmplitude: 0.005,
    roughnessAmplitude: 0.005,
    frequency: 0.07,
  },
  cobblestone_color: {
    colorAmplitude: 0.005,
    roughnessAmplitude: 0.005,
    frequency: 0.07,
  },
  sand_01: {
    colorAmplitude: 0.006,
    roughnessAmplitude: 0.008,
    frequency: 0.05,
  },
};

function getBatch(map: Map<FloorMaterialId, MaterialBatch>, materialId: FloorMaterialId): MaterialBatch {
  const existing = map.get(materialId);
  if (existing) return existing;
  const next: MaterialBatch = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    vertexCount: 0,
  };
  map.set(materialId, next);
  return next;
}

function rotateUv(u: number, v: number, quarterTurns: 0 | 1 | 2 | 3): { u: number; v: number } {
  if (quarterTurns === 1) {
    return { u: -v, v: u };
  }
  if (quarterTurns === 2) {
    return { u: -u, v: -v };
  }
  if (quarterTurns === 3) {
    return { u: v, v: -u };
  }
  return { u, v };
}

function pushVertex(batch: MaterialBatch, x: number, y: number, z: number, u: number, v: number): void {
  batch.positions.push(x, y, z);
  batch.normals.push(0, 1, 0);
  batch.uvs.push(u, v);
}

function appendPatchQuad(
  batch: MaterialBatch,
  rect: RuntimeRect,
  y: number,
  tileSizeM: number,
  quarterTurns: 0 | 1 | 2 | 3,
  offsetU: number,
  offsetV: number,
): void {
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const z0 = rect.y;
  const z1 = rect.y + rect.h;
  const invTile = 1 / tileSizeM;
  const baseIndex = batch.vertexCount;

  const sampleUv = (x: number, z: number): { u: number; v: number } => {
    const baseU = x * invTile;
    const baseV = z * invTile;
    const rotated = rotateUv(baseU, baseV, quarterTurns);
    return {
      u: rotated.u + offsetU,
      v: rotated.v + offsetV,
    };
  };

  const uv0 = sampleUv(x0, z0);
  const uv1 = sampleUv(x1, z0);
  const uv2 = sampleUv(x1, z1);
  const uv3 = sampleUv(x0, z1);

  pushVertex(batch, x0, y, z0, uv0.u, uv0.v);
  pushVertex(batch, x1, y, z0, uv1.u, uv1.v);
  pushVertex(batch, x1, y, z1, uv2.u, uv2.v);
  pushVertex(batch, x0, y, z1, uv3.u, uv3.v);

  batch.indices.push(
    baseIndex,
    baseIndex + 2,
    baseIndex + 1,
    baseIndex,
    baseIndex + 3,
    baseIndex + 2,
  );

  batch.vertexCount += 4;
}

function intersectRect(a: RuntimeRect, b: RuntimeRect): RuntimeRect | null {
  const minX = Math.max(a.x, b.x);
  const maxX = Math.min(a.x + a.w, b.x + b.w);
  const minZ = Math.max(a.y, b.y);
  const maxZ = Math.min(a.y + a.h, b.y + b.h);
  const width = maxX - minX;
  const height = maxZ - minZ;
  if (width <= 1e-6 || height <= 1e-6) return null;
  return {
    x: minX,
    y: minZ,
    w: width,
    h: height,
  };
}

function asIncludedZoneType(zoneType: string): IncludedZoneType | null {
  if (
    zoneType === "spawn_plaza" ||
    zoneType === "main_lane_segment" ||
    zoneType === "side_hall" ||
    zoneType === "cut" ||
    zoneType === "connector"
  ) {
    return zoneType;
  }
  return null;
}

function isFullyCoveredCellRect(cellRect: RuntimeRect, patchRect: RuntimeRect): boolean {
  return (
    Math.abs(patchRect.x - cellRect.x) <= GEOMETRY_EPSILON_M &&
    Math.abs(patchRect.y - cellRect.y) <= GEOMETRY_EPSILON_M &&
    Math.abs(patchRect.w - cellRect.w) <= GEOMETRY_EPSILON_M &&
    Math.abs(patchRect.h - cellRect.h) <= GEOMETRY_EPSILON_M
  );
}

function isInsideZoneInteriorMargin(cellRect: RuntimeRect, zoneRect: RuntimeRect, marginM: number): boolean {
  const minX = zoneRect.x + marginM;
  const maxX = zoneRect.x + zoneRect.w - marginM;
  const minZ = zoneRect.y + marginM;
  const maxZ = zoneRect.y + zoneRect.h - marginM;
  if (maxX <= minX + GEOMETRY_EPSILON_M || maxZ <= minZ + GEOMETRY_EPSILON_M) return false;
  return (
    cellRect.x >= minX - GEOMETRY_EPSILON_M &&
    cellRect.y >= minZ - GEOMETRY_EPSILON_M &&
    cellRect.x + cellRect.w <= maxX + GEOMETRY_EPSILON_M &&
    cellRect.y + cellRect.h <= maxZ + GEOMETRY_EPSILON_M
  );
}

function choosePatchMaterial(zoneType: IncludedZoneType, rng: DeterministicRng): FloorMaterialId {
  const roll = rng.next();
  if (zoneType === "spawn_plaza") {
    if (roll < 0.82) return "sand_01";
    if (roll < 0.95) return "large_sandstone_blocks_01";
    return "cobblestone_color";
  }

  if (zoneType === "main_lane_segment") {
    if (roll < 0.93) return "sand_01";
    if (roll < 0.98) return "grey_tiles";
    return "cobblestone_color";
  }

  if (zoneType === "connector") {
    if (roll < 0.84) return "sand_01";
    if (roll < 0.92) return "large_sandstone_blocks_01";
    if (roll < 0.98) return "cobblestone_pavement";
    return "cobblestone_color";
  }

  if (zoneType === "cut") {
    if (roll < 0.93) return "sand_01";
    if (roll < 0.96) return "grey_tiles";
    return "cobblestone_color";
  }

  if (roll < 0.84) return "sand_01";
  if (roll < 0.92) return "cobblestone_pavement";
  return "cobblestone_color";
}

function finalizeGeometry(batch: MaterialBatch): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(batch.normals, 3));

  const uv = new Float32BufferAttribute(batch.uvs, 2);
  geometry.setAttribute("uv", uv);
  geometry.setAttribute("uv2", new Float32BufferAttribute([...batch.uvs], 2));

  geometry.setIndex(batch.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function warnOnIncludedZoneOverlaps(spec: RuntimeBlockoutSpec, epsilonAreaM2 = 1e-4): void {
  const includedZones = spec.zones.filter((zone) => INCLUDED_ZONE_TYPES.has(zone.type));
  const overlaps: string[] = [];

  for (let i = 0; i < includedZones.length; i += 1) {
    const a = includedZones[i]!;
    for (let j = i + 1; j < includedZones.length; j += 1) {
      const b = includedZones[j]!;
      const overlap = intersectRect(a.rect, b.rect);
      if (!overlap) continue;
      const overlapAreaM2 = overlap.w * overlap.h;
      if (overlapAreaM2 <= epsilonAreaM2) continue;
      overlaps.push(`${a.id} (${a.type}) <-> ${b.id} (${b.type}): ${overlapAreaM2.toFixed(3)}m^2`);
    }
  }

  if (overlaps.length > 0) {
    console.warn(
      `[buildPbrFloors] Overlapping included floor zones detected (${overlaps.length}): ${overlaps.join(" | ")}`,
    );
  }
}

export function buildPbrFloors(spec: RuntimeBlockoutSpec, opts: BuildPbrFloorsOptions): Group {
  const root = new Group();
  root.name = "map-pbr-floors";

  warnOnIncludedZoneOverlaps(spec);

  const batches = new Map<FloorMaterialId, MaterialBatch>();
  const patchSizeM = Math.max(0.25, opts.patchSizeM);
  const gridOriginX = spec.playable_boundary.x;
  const gridOriginZ = spec.playable_boundary.y;

  for (const zone of spec.zones) {
    if (!INCLUDED_ZONE_TYPES.has(zone.type)) continue;
    const zoneType = asIncludedZoneType(zone.type);
    if (!zoneType) continue;

    const rect = zone.rect;
    const cellXStart = Math.floor((rect.x - gridOriginX) / patchSizeM);
    const cellXEnd = Math.ceil((rect.x + rect.w - gridOriginX) / patchSizeM) - 1;
    const cellZStart = Math.floor((rect.y - gridOriginZ) / patchSizeM);
    const cellZEnd = Math.ceil((rect.y + rect.h - gridOriginZ) / patchSizeM) - 1;

    for (let cellZ = cellZStart; cellZ <= cellZEnd; cellZ += 1) {
      for (let cellX = cellXStart; cellX <= cellXEnd; cellX += 1) {
        const cellRect: RuntimeRect = {
          x: gridOriginX + cellX * patchSizeM,
          y: gridOriginZ + cellZ * patchSizeM,
          w: patchSizeM,
          h: patchSizeM,
        };
        const patchRect = intersectRect(rect, cellRect);
        if (!patchRect) continue;

        let materialId: FloorMaterialId = BASE_FLOOR_MATERIAL;
        if (
          isFullyCoveredCellRect(cellRect, patchRect) &&
          isInsideZoneInteriorMargin(cellRect, rect, PATCH_INTERIOR_MARGIN_M)
        ) {
          const patchRng = new DeterministicRng(
            deriveSubSeed(opts.seed, `floorPatch:${cellX}:${cellZ}`),
          );
          const patchProbability = PATCH_PROBABILITY_BY_ZONE[zoneType];
          if (patchRng.next() < patchProbability) {
            materialId = choosePatchMaterial(zoneType, patchRng);
          }
        }

        const tileSizeM = opts.manifest.getTileSizeM(materialId);
        const batch = getBatch(batches, materialId);
        appendPatchQuad(
          batch,
          patchRect,
          opts.floorTopY,
          tileSizeM,
          UV_QUARTER_TURNS,
          UV_OFFSET_U,
          UV_OFFSET_V,
        );
      }
    }
  }

  for (const materialId of MATERIAL_ORDER) {
    const batch = batches.get(materialId);
    if (!batch || batch.vertexCount === 0) continue;

    const geometry = finalizeGeometry(batch);
    const material = opts.manifest.createStandardMaterial(materialId, opts.quality);
    material.name = `floor-${materialId}-${opts.quality}`;
    const albedoBoost =
      typeof material.userData.floorAlbedoBoost === "number" && Number.isFinite(material.userData.floorAlbedoBoost)
        ? material.userData.floorAlbedoBoost
        : 1;
    const albedoGamma =
      typeof material.userData.floorAlbedoGamma === "number" && Number.isFinite(material.userData.floorAlbedoGamma)
        ? material.userData.floorAlbedoGamma
        : 1;
    const dustStrength =
      typeof material.userData.floorDustStrength === "number" && Number.isFinite(material.userData.floorDustStrength)
        ? material.userData.floorDustStrength
        : 0;
    const macro = FLOOR_MACRO_SETTINGS[materialId];
    applyFloorShaderTweaks(material, {
      albedoBoost,
      albedoGamma,
      dustStrength,
      macroColorAmplitude: macro.colorAmplitude,
      macroRoughnessAmplitude: macro.roughnessAmplitude,
      macroFrequency: macro.frequency,
      macroSeed: deriveSubSeed(opts.seed, `floor-macro:${materialId}`),
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = `floor-${materialId}`;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  return root;
}
