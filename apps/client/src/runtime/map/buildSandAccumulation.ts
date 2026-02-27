import { BufferGeometry, Float32BufferAttribute, Mesh } from "three";
import type { FloorMaterialLibrary, FloorTextureQuality } from "../render/materials/FloorMaterialLibrary";
import { applyFloorShaderTweaks } from "../render/materials/applyFloorShaderTweaks";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { BoundarySegment } from "./buildBlockout";

const MIN_PIECE_LENGTH_M = 2.0;
const MAX_PIECE_LENGTH_M = 6.0;
const MIN_GAP_M = 0.5;
const MAX_GAP_M = 2.0;

const BASE_WIDTH_M = 0.58;
const WIDTH_VARIATION_M = 0.18;
const OUTER_EDGE_JITTER_M = 0.22;
const MIN_WIDTH_M = 0.28;
const MAX_WIDTH_M = 0.95;
const WALL_INSET_M = 0.03;

const WALL_EDGE_Y_M = 0.02;
const OUTER_EDGE_Y_M = 0.002;
const OUTER_EDGE_Y_JITTER_M = 0.001;

const CORNER_MIN_RADIUS_M = 0.6;
const CORNER_MAX_RADIUS_M = 1.4;
const CORNER_CENTER_INSET_MIN_M = 0.1;
const CORNER_CENTER_INSET_MAX_M = 0.2;

type BuildSandAccumulationOptions = {
  wallSegments: readonly BoundarySegment[];
  seed: number;
  floorTopY: number;
  manifest: FloorMaterialLibrary;
  quality: FloorTextureQuality;
};

type GeometryBatch = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexCount: number;
};

type CornerDescriptor = {
  x: number;
  z: number;
  inwardX: -1 | 1;
  inwardZ: -1 | 1;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushVertex(batch: GeometryBatch, x: number, y: number, z: number, u: number, v: number): number {
  batch.positions.push(x, y, z);
  batch.normals.push(0, 1, 0);
  batch.uvs.push(u, v);
  const index = batch.vertexCount;
  batch.vertexCount += 1;
  return index;
}

function pushTriangleFacingUp(batch: GeometryBatch, indexA: number, indexB: number, indexC: number): void {
  const pos = batch.positions;
  const a3 = indexA * 3;
  const b3 = indexB * 3;
  const c3 = indexC * 3;
  const ax = pos[a3]!;
  const az = pos[a3 + 2]!;
  const bx = pos[b3]!;
  const bz = pos[b3 + 2]!;
  const cx = pos[c3]!;
  const cz = pos[c3 + 2]!;
  const crossY = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

  if (crossY >= 0) {
    batch.indices.push(indexA, indexB, indexC);
  } else {
    batch.indices.push(indexA, indexC, indexB);
  }
}

function appendSegmentedStripPiece(
  batch: GeometryBatch,
  segment: BoundarySegment,
  alongStart: number,
  alongEnd: number,
  baseWidthM: number,
  subdivisions: number,
  rng: DeterministicRng,
  floorTopY: number,
  invTileSize: number,
): void {
  const steps = Math.max(8, subdivisions);
  const nearIndices: number[] = [];
  const farIndices: number[] = [];
  const pieceLength = Math.max(0.01, alongEnd - alongStart);

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const along = alongStart + pieceLength * t;
    const centerWeight = Math.sin(Math.PI * t);
    const width = clamp(
      (baseWidthM + rng.range(-OUTER_EDGE_JITTER_M, OUTER_EDGE_JITTER_M)) * (0.72 + centerWeight * 0.28),
      MIN_WIDTH_M,
      MAX_WIDTH_M,
    );

    if (segment.orientation === "vertical") {
      const nearX = segment.coord - segment.outward * WALL_INSET_M;
      const nearZ = along;
      const farX = nearX + (-segment.outward) * width;
      const farZ = nearZ;
      const nearY = floorTopY + WALL_EDGE_Y_M;
      const farY = floorTopY + OUTER_EDGE_Y_M + rng.range(-OUTER_EDGE_Y_JITTER_M, OUTER_EDGE_Y_JITTER_M);

      nearIndices.push(pushVertex(batch, nearX, nearY, nearZ, nearX * invTileSize, nearZ * invTileSize));
      farIndices.push(pushVertex(batch, farX, farY, farZ, farX * invTileSize, farZ * invTileSize));
    } else {
      const nearZ = segment.coord - segment.outward * WALL_INSET_M;
      const nearX = along;
      const farZ = nearZ + (-segment.outward) * width;
      const farX = nearX;
      const nearY = floorTopY + WALL_EDGE_Y_M;
      const farY = floorTopY + OUTER_EDGE_Y_M + rng.range(-OUTER_EDGE_Y_JITTER_M, OUTER_EDGE_Y_JITTER_M);

      nearIndices.push(pushVertex(batch, nearX, nearY, nearZ, nearX * invTileSize, nearZ * invTileSize));
      farIndices.push(pushVertex(batch, farX, farY, farZ, farX * invTileSize, farZ * invTileSize));
    }
  }

  for (let i = 0; i < steps; i += 1) {
    const nearA = nearIndices[i]!;
    const nearB = nearIndices[i + 1]!;
    const farA = farIndices[i]!;
    const farB = farIndices[i + 1]!;

    pushTriangleFacingUp(batch, nearA, nearB, farB);
    pushTriangleFacingUp(batch, nearA, farB, farA);
  }
}

function collectCornerDescriptors(wallSegments: readonly BoundarySegment[]): CornerDescriptor[] {
  type CornerBucket = {
    x: number;
    z: number;
    vertical: BoundarySegment[];
    horizontal: BoundarySegment[];
  };

  const buckets = new Map<string, CornerBucket>();
  const toKey = (x: number, z: number): string => `${x.toFixed(3)}:${z.toFixed(3)}`;
  const getBucket = (x: number, z: number): CornerBucket => {
    const key = toKey(x, z);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created: CornerBucket = { x, z, vertical: [], horizontal: [] };
    buckets.set(key, created);
    return created;
  };

  for (const segment of wallSegments) {
    if (segment.end - segment.start <= 1e-4) continue;
    if (segment.orientation === "vertical") {
      getBucket(segment.coord, segment.start).vertical.push(segment);
      getBucket(segment.coord, segment.end).vertical.push(segment);
    } else {
      getBucket(segment.start, segment.coord).horizontal.push(segment);
      getBucket(segment.end, segment.coord).horizontal.push(segment);
    }
  }

  const corners: CornerDescriptor[] = [];
  const dedupe = new Set<string>();

  for (const bucket of buckets.values()) {
    if (bucket.vertical.length === 0 || bucket.horizontal.length === 0) continue;
    for (const vertical of bucket.vertical) {
      for (const horizontal of bucket.horizontal) {
        const inwardX = (-vertical.outward) as -1 | 1;
        const inwardZ = (-horizontal.outward) as -1 | 1;
        const cornerKey = `${bucket.x.toFixed(3)}:${bucket.z.toFixed(3)}:${inwardX}:${inwardZ}`;
        if (dedupe.has(cornerKey)) continue;
        dedupe.add(cornerKey);
        corners.push({
          x: bucket.x,
          z: bucket.z,
          inwardX,
          inwardZ,
        });
      }
    }
  }

  return corners;
}

function appendCornerPile(
  batch: GeometryBatch,
  corner: CornerDescriptor,
  rng: DeterministicRng,
  floorTopY: number,
  invTileSize: number,
): void {
  const radiusM = rng.range(CORNER_MIN_RADIUS_M, CORNER_MAX_RADIUS_M);
  const centerInsetM = rng.range(CORNER_CENTER_INSET_MIN_M, CORNER_CENTER_INSET_MAX_M);
  const fanSubdivisions = rng.int(7, 13);
  const centerX = corner.x + corner.inwardX * centerInsetM;
  const centerZ = corner.z + corner.inwardZ * centerInsetM;
  const centerY = floorTopY + WALL_EDGE_Y_M;

  const centerIndex = pushVertex(
    batch,
    centerX,
    centerY,
    centerZ,
    centerX * invTileSize,
    centerZ * invTileSize,
  );

  const ringIndices: number[] = [];
  for (let i = 0; i <= fanSubdivisions; i += 1) {
    const t = i / fanSubdivisions;
    const baseAngle = t * Math.PI * 0.5;
    const angle = clamp(baseAngle + rng.range(-0.09, 0.09), 0, Math.PI * 0.5);
    const radial = radiusM * rng.range(0.72, 1.1);
    const x = corner.x + corner.inwardX * Math.cos(angle) * radial;
    const z = corner.z + corner.inwardZ * Math.sin(angle) * radial;
    const y = floorTopY + OUTER_EDGE_Y_M + rng.range(-OUTER_EDGE_Y_JITTER_M, OUTER_EDGE_Y_JITTER_M);
    ringIndices.push(pushVertex(batch, x, y, z, x * invTileSize, z * invTileSize));
  }

  for (let i = 0; i < fanSubdivisions; i += 1) {
    const a = ringIndices[i]!;
    const b = ringIndices[i + 1]!;
    pushTriangleFacingUp(batch, centerIndex, a, b);
  }
}

export function buildSandAccumulation(options: BuildSandAccumulationOptions): Mesh {
  const batch: GeometryBatch = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    vertexCount: 0,
  };

  const invTileSize = 1 / options.manifest.getTileSizeM("sand_01");
  const rngRoot = new DeterministicRng(deriveSubSeed(options.seed, "sand-accumulation"));

  for (let index = 0; index < options.wallSegments.length; index += 1) {
    const segment = options.wallSegments[index]!;
    const segmentLength = segment.end - segment.start;
    if (segmentLength <= 0.25) continue;

    const segmentRng = rngRoot.fork(
      `seg:${index}:${segment.orientation}:${segment.coord.toFixed(3)}:${segment.start.toFixed(3)}:${segment.end.toFixed(3)}:${segment.outward}`,
    );
    let cursor = segment.start + segmentRng.range(0, Math.min(1.4, segmentLength * 0.35));

    while (cursor < segment.end - 0.35) {
      const remaining = segment.end - cursor;
      const pieceLength = Math.min(segmentRng.range(MIN_PIECE_LENGTH_M, MAX_PIECE_LENGTH_M), remaining);
      if (pieceLength < 0.65) break;

      const alongStart = cursor;
      const alongEnd = alongStart + pieceLength;
      const baseWidthM = clamp(
        BASE_WIDTH_M + segmentRng.range(-WIDTH_VARIATION_M, WIDTH_VARIATION_M),
        MIN_WIDTH_M,
        MAX_WIDTH_M,
      );
      const subdivisions = segmentRng.int(8, 17);
      const pieceRng = segmentRng.fork(`piece:${alongStart.toFixed(3)}:${alongEnd.toFixed(3)}`);
      appendSegmentedStripPiece(
        batch,
        segment,
        alongStart,
        alongEnd,
        baseWidthM,
        subdivisions,
        pieceRng,
        options.floorTopY,
        invTileSize,
      );

      cursor = alongEnd + segmentRng.range(MIN_GAP_M, MAX_GAP_M);
    }
  }

  const corners = collectCornerDescriptors(options.wallSegments);
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index]!;
    const cornerRng = rngRoot.fork(
      `corner:${index}:${corner.x.toFixed(3)}:${corner.z.toFixed(3)}:${corner.inwardX}:${corner.inwardZ}`,
    );
    appendCornerPile(batch, corner, cornerRng, options.floorTopY, invTileSize);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(batch.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(batch.uvs, 2));
  geometry.setAttribute("uv2", new Float32BufferAttribute([...batch.uvs], 2));
  geometry.setIndex(batch.indices);
  if (batch.vertexCount > 0) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  const material = options.manifest.createStandardMaterial("sand_01", options.quality);
  material.name = `floor-sand-accumulation-${options.quality}`;
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
  applyFloorShaderTweaks(material, { albedoBoost, albedoGamma, dustStrength });
  material.roughness = Math.max(material.roughness, 0.98);
  material.normalScale.set(0.22, 0.22);
  material.aoMapIntensity = Math.min(material.aoMapIntensity, 0.32);
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  material.needsUpdate = true;

  const mesh = new Mesh(geometry, material);
  mesh.name = "map-sand-accumulation";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
