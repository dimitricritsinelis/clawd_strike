import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { BoundarySegment } from "./buildBlockout";
import type { RuntimeBlockoutZone } from "./types";
import { resolveWallMaterialIdForZone } from "./wallMaterialAssignment";

const WALL_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);

type MaterialBatch = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexCount: number;
};

type BuildPbrWallsOptions = {
  segments: readonly BoundarySegment[];
  zones: readonly RuntimeBlockoutZone[];
  seed: number;
  quality: WallTextureQuality;
  manifest: WallMaterialLibrary;
  wallHeightM: number;
  floorTopY: number;
  segmentHeights?: readonly number[];
};

function getBatch(map: Map<string, MaterialBatch>, materialId: string): MaterialBatch {
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

function appendVertex(
  batch: MaterialBatch,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
): void {
  batch.positions.push(x, y, z);
  batch.normals.push(nx, ny, nz);
  batch.uvs.push(u, v);
}

function appendSegmentFace(
  batch: MaterialBatch,
  segment: BoundarySegment,
  floorTopY: number,
  wallHeightM: number,
  tileSizeM: number,
  uvOffsetU: number,
  uvOffsetV: number,
): void {
  const y0 = floorTopY;
  const y1 = floorTopY + wallHeightM;
  const baseIndex = batch.vertexCount;
  const u0 = segment.start / tileSizeM + uvOffsetU;
  const u1 = segment.end / tileSizeM + uvOffsetU;
  const v0 = y0 / tileSizeM + uvOffsetV;
  const v1 = y1 / tileSizeM + uvOffsetV;

  if (segment.orientation === "vertical") {
    const x = segment.coord;
    const normalX = -segment.outward;
    appendVertex(batch, x, y0, segment.start, normalX, 0, 0, u0, v0);
    appendVertex(batch, x, y0, segment.end, normalX, 0, 0, u1, v0);
    appendVertex(batch, x, y1, segment.end, normalX, 0, 0, u1, v1);
    appendVertex(batch, x, y1, segment.start, normalX, 0, 0, u0, v1);
  } else {
    const z = segment.coord;
    const normalZ = -segment.outward;
    appendVertex(batch, segment.start, y0, z, 0, 0, normalZ, u0, v0);
    appendVertex(batch, segment.end, y0, z, 0, 0, normalZ, u1, v0);
    appendVertex(batch, segment.end, y1, z, 0, 0, normalZ, u1, v1);
    appendVertex(batch, segment.start, y1, z, 0, 0, normalZ, u0, v1);
  }

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

type SegmentFrame = {
  centerX: number;
  centerZ: number;
  inwardX: number;
  inwardZ: number;
};

function pointInRect2D(zone: RuntimeBlockoutZone, x: number, z: number): boolean {
  const rect = zone.rect;
  return x >= rect.x && x <= rect.x + rect.w && z >= rect.y && z <= rect.y + rect.h;
}

function toSegmentFrame(segment: BoundarySegment): SegmentFrame {
  if (segment.orientation === "vertical") {
    return {
      centerX: segment.coord,
      centerZ: (segment.start + segment.end) * 0.5,
      inwardX: -segment.outward,
      inwardZ: 0,
    };
  }

  return {
    centerX: (segment.start + segment.end) * 0.5,
    centerZ: segment.coord,
    inwardX: 0,
    inwardZ: -segment.outward,
  };
}

function resolveSegmentZone(frame: SegmentFrame, zones: readonly RuntimeBlockoutZone[]): RuntimeBlockoutZone | null {
  const probeX = frame.centerX + frame.inwardX * 0.1;
  const probeZ = frame.centerZ + frame.inwardZ * 0.1;
  let winner: RuntimeBlockoutZone | null = null;
  let winnerArea = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    if (!WALL_ZONE_TYPES.has(zone.type)) continue;
    if (!pointInRect2D(zone, probeX, probeZ)) continue;
    const area = zone.rect.w * zone.rect.h;
    if (area < winnerArea) {
      winnerArea = area;
      winner = zone;
    }
  }

  return winner;
}

function resolveZoneMaterialId(zone: RuntimeBlockoutZone | null): string {
  return resolveWallMaterialIdForZone(zone?.id ?? null);
}

function resolveManifestMaterialId(
  materialIds: readonly string[],
  availableMaterialIds: ReadonlySet<string>,
  zoneMaterialId: string,
): string {
  if (availableMaterialIds.has(zoneMaterialId)) return zoneMaterialId;
  return materialIds[0]!;
}

function resolveMaterialUvOffset(seed: number, materialId: string): { x: number; y: number } {
  const offsetSeed = deriveSubSeed(seed, `wall-uvoffset:${materialId}`);
  const offsetRng = new DeterministicRng(offsetSeed);
  return {
    x: offsetRng.int(0, 4),
    y: offsetRng.int(0, 4),
  };
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

export function buildPbrWalls(options: BuildPbrWallsOptions): Group {
  const root = new Group();
  root.name = "map-pbr-walls";

  const materialIds = options.manifest.getMaterialIds();
  if (materialIds.length === 0) {
    return root;
  }

  const batches = new Map<string, MaterialBatch>();
  const availableMaterialIds = new Set(materialIds);

  for (let index = 0; index < options.segments.length; index += 1) {
    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const materialId = resolveManifestMaterialId(
      materialIds,
      availableMaterialIds,
      resolveZoneMaterialId(zone),
    );
    const uvSeed = deriveSubSeed(options.seed, `wall-uv:${index}:${materialId}`);
    const uvRng = new DeterministicRng(uvSeed);
    const tileSizeM = options.manifest.getTileSizeM(materialId);
    const batch = getBatch(batches, materialId);
    const segHeight = options.segmentHeights?.[index] ?? options.wallHeightM;
    appendSegmentFace(
      batch,
      segment,
      options.floorTopY,
      segHeight,
      tileSizeM,
      uvRng.int(0, 4),
      uvRng.int(0, 4),
    );
  }

  for (const materialId of materialIds) {
    const batch = batches.get(materialId);
    if (!batch || batch.vertexCount === 0) continue;

    const geometry = finalizeGeometry(batch);
    const material = options.manifest.createStandardMaterial(materialId, options.quality);
    const albedoBoost =
      typeof material.userData.wallAlbedoBoost === "number" && Number.isFinite(material.userData.wallAlbedoBoost)
        ? material.userData.wallAlbedoBoost
        : 1;
    const tileSizeM = options.manifest.getTileSizeM(materialId);
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

    const mesh = new Mesh(geometry, material);
    mesh.name = `wall-${materialId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  return root;
}
