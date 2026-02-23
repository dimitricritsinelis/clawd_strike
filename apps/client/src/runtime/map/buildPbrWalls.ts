import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { BoundarySegment } from "./buildBlockout";

type MaterialBatch = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexCount: number;
};

type BuildPbrWallsOptions = {
  segments: readonly BoundarySegment[];
  seed: number;
  quality: WallTextureQuality;
  manifest: WallMaterialLibrary;
  wallHeightM: number;
  floorTopY: number;
  wallThicknessM: number;
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
  wallThicknessM: number,
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
    const x = segment.coord + segment.outward * (wallThicknessM * 0.5);
    const normalX = -segment.outward;
    appendVertex(batch, x, y0, segment.start, normalX, 0, 0, u0, v0);
    appendVertex(batch, x, y0, segment.end, normalX, 0, 0, u1, v0);
    appendVertex(batch, x, y1, segment.end, normalX, 0, 0, u1, v1);
    appendVertex(batch, x, y1, segment.start, normalX, 0, 0, u0, v1);
  } else {
    const z = segment.coord + segment.outward * (wallThicknessM * 0.5);
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
  const assignRng = new DeterministicRng(deriveSubSeed(options.seed, "wall-material-assignment"));

  for (let index = 0; index < options.segments.length; index += 1) {
    const segment = options.segments[index]!;
    const materialId = materialIds[assignRng.int(0, materialIds.length)]!;
    const uvSeed = deriveSubSeed(options.seed, `wall-uv:${index}:${materialId}`);
    const uvRng = new DeterministicRng(uvSeed);
    const tileSizeM = options.manifest.getTileSizeM(materialId);
    const batch = getBatch(batches, materialId);
    appendSegmentFace(
      batch,
      segment,
      options.floorTopY,
      options.wallHeightM,
      options.wallThicknessM,
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
    applyWallShaderTweaks(material, {
      albedoBoost,
      macroColorAmplitude: 0.045,
      macroRoughnessAmplitude: 0.035,
      macroFrequency: 0.085,
      macroSeed: deriveSubSeed(options.seed, `wall-macro:${materialId}`),
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = `wall-${materialId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  return root;
}
