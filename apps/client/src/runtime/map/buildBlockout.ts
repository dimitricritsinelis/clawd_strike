import { BoxGeometry, Group, InstancedMesh, MeshLambertMaterial, Object3D } from "three";
import type { FloorMaterialLibrary } from "../render/materials/FloorMaterialLibrary";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import type { RuntimeAnchorsSpec, RuntimeBlockoutSpec, RuntimeRect } from "./types";
import type { RuntimeColliderAabb } from "../sim/collision/WorldColliders";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import type { RuntimeFloorMode, RuntimeFloorQuality, RuntimeLightingPreset, RuntimeWallMode } from "../utils/UrlParams";
import { buildPbrFloors } from "./buildPbrFloors";
import { buildSandAccumulation } from "./buildSandAccumulation";
import { buildPbrWalls } from "./buildPbrWalls";
import { buildWallDetailMeshes } from "./wallDetailKit";
import { buildWallDetailPlacements, type WallDetailPlacementStats } from "./wallDetailPlacer";

const WALKABLE_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);

const STALL_STRIP_ZONE_TYPE = "stall_strip";
const CLEAR_TRAVEL_ZONE_TYPE = "clear_travel_zone";

const BASE_FLOOR_THICKNESS_M = 0.06;
const OVERLAY_FLOOR_THICKNESS_M = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveWallTextureQuality(floorQuality: RuntimeFloorQuality): WallTextureQuality {
  if (floorQuality === "1k") return "1k";
  return "2k";
}

export type BoundarySegment = {
  orientation: "vertical" | "horizontal";
  coord: number;
  start: number;
  end: number;
  outward: -1 | 1;
};

export type BlockoutBuildResult = {
  root: Group;
  colliders: RuntimeColliderAabb[];
  wallDetailStats: WallDetailPlacementStats;
};

export type BlockoutWallDetailOptions = {
  enabled: boolean;
  densityScale: number | null;
};

export type BlockoutBuildOptions = {
  highVis: boolean;
  seed: number;
  floorMode: RuntimeFloorMode;
  wallMode: RuntimeWallMode;
  floorQuality: RuntimeFloorQuality;
  lightingPreset: RuntimeLightingPreset;
  floorMaterials: FloorMaterialLibrary | null;
  wallMaterials: WallMaterialLibrary | null;
  anchors: RuntimeAnchorsSpec | null;
  wallDetails: BlockoutWallDetailOptions;
};

function rectContainsPoint(rect: RuntimeRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function collectAxisCoordinates(rects: RuntimeRect[], boundary: RuntimeRect): { xs: number[]; ys: number[] } {
  const xs = new Set<number>([boundary.x, boundary.x + boundary.w]);
  const ys = new Set<number>([boundary.y, boundary.y + boundary.h]);

  for (const rect of rects) {
    xs.add(rect.x);
    xs.add(rect.x + rect.w);
    ys.add(rect.y);
    ys.add(rect.y + rect.h);
  }

  return {
    xs: [...xs].sort((a, b) => a - b),
    ys: [...ys].sort((a, b) => a - b),
  };
}

function buildInsideGrid(walkableRects: RuntimeRect[], xs: number[], ys: number[]): boolean[][] {
  const rows = ys.length - 1;
  const cols = xs.length - 1;
  const inside: boolean[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let yIndex = 0; yIndex < rows; yIndex += 1) {
    for (let xIndex = 0; xIndex < cols; xIndex += 1) {
      const centerX = (xs[xIndex]! + xs[xIndex + 1]!) * 0.5;
      const centerY = (ys[yIndex]! + ys[yIndex + 1]!) * 0.5;
      inside[yIndex]![xIndex] = walkableRects.some((rect) => rectContainsPoint(rect, centerX, centerY));
    }
  }

  return inside;
}

function extractBoundarySegments(inside: boolean[][], xs: number[], ys: number[]): BoundarySegment[] {
  const rows = inside.length;
  const cols = inside[0]?.length ?? 0;
  const segments: BoundarySegment[] = [];

  const isInside = (xIndex: number, yIndex: number): boolean => {
    if (xIndex < 0 || yIndex < 0 || xIndex >= cols || yIndex >= rows) return false;
    return inside[yIndex]?.[xIndex] ?? false;
  };

  for (let yIndex = 0; yIndex < rows; yIndex += 1) {
    for (let xIndex = 0; xIndex < cols; xIndex += 1) {
      if (!inside[yIndex]?.[xIndex]) continue;

      const x0 = xs[xIndex]!;
      const x1 = xs[xIndex + 1]!;
      const y0 = ys[yIndex]!;
      const y1 = ys[yIndex + 1]!;

      if (!isInside(xIndex - 1, yIndex)) {
        segments.push({ orientation: "vertical", coord: x0, start: y0, end: y1, outward: -1 });
      }
      if (!isInside(xIndex + 1, yIndex)) {
        segments.push({ orientation: "vertical", coord: x1, start: y0, end: y1, outward: 1 });
      }
      if (!isInside(xIndex, yIndex - 1)) {
        segments.push({ orientation: "horizontal", coord: y0, start: x0, end: x1, outward: -1 });
      }
      if (!isInside(xIndex, yIndex + 1)) {
        segments.push({ orientation: "horizontal", coord: y1, start: x0, end: x1, outward: 1 });
      }
    }
  }

  return segments;
}

function mergeBoundarySegments(segments: BoundarySegment[]): BoundarySegment[] {
  const EPS = 1e-6;
  const sorted = [...segments].sort((a, b) => {
    if (a.orientation !== b.orientation) return a.orientation.localeCompare(b.orientation);
    if (a.coord !== b.coord) return a.coord - b.coord;
    if (a.outward !== b.outward) return a.outward - b.outward;
    return a.start - b.start;
  });

  const merged: BoundarySegment[] = [];
  for (const segment of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.orientation === segment.orientation &&
      Math.abs(previous.coord - segment.coord) < EPS &&
      previous.outward === segment.outward &&
      Math.abs(previous.end - segment.start) < EPS
    ) {
      previous.end = segment.end;
      continue;
    }
    merged.push({ ...segment });
  }

  return merged;
}

function createFloorInstances(
  rects: RuntimeRect[],
  material: MeshLambertMaterial,
  thicknessM: number,
  topY: number,
): InstancedMesh<BoxGeometry, MeshLambertMaterial> | null {
  if (rects.length === 0) return null;

  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geometry, material, rects.length);
  mesh.frustumCulled = false;

  const dummy = new Object3D();
  const centerY = topY - thicknessM * 0.5;

  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i]!;
    dummy.position.set(rect.x + rect.w * 0.5, centerY, rect.y + rect.h * 0.5);
    dummy.scale.set(rect.w, thicknessM, rect.h);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createWallInstances(
  segments: BoundarySegment[],
  material: MeshLambertMaterial,
  wallHeightM: number,
  wallThicknessM: number,
  floorTopY: number,
  segmentHeights?: readonly number[],
): InstancedMesh<BoxGeometry, MeshLambertMaterial> | null {
  if (segments.length === 0) return null;

  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geometry, material, segments.length);
  mesh.frustumCulled = false;

  const dummy = new Object3D();

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const lengthM = segment.end - segment.start;
    const segHeight = segmentHeights?.[i] ?? wallHeightM;
    const centerY = floorTopY + segHeight * 0.5;

    let centerX = 0;
    let centerZ = 0;
    let sizeX = 0;
    let sizeZ = 0;

    if (segment.orientation === "vertical") {
      centerX = segment.coord + segment.outward * (wallThicknessM * 0.5);
      centerZ = (segment.start + segment.end) * 0.5;
      sizeX = wallThicknessM;
      sizeZ = lengthM;
    } else {
      centerX = (segment.start + segment.end) * 0.5;
      centerZ = segment.coord + segment.outward * (wallThicknessM * 0.5);
      sizeX = lengthM;
      sizeZ = wallThicknessM;
    }

    dummy.position.set(centerX, centerY, centerZ);
    dummy.scale.set(sizeX, segHeight, sizeZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function appendWallSegmentColliders(
  segments: BoundarySegment[],
  wallHeightM: number,
  wallThicknessM: number,
  floorTopY: number,
  colliders: RuntimeColliderAabb[],
): void {
  const centerY = floorTopY + wallHeightM * 0.5;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const lengthM = segment.end - segment.start;
    let centerX = 0;
    let centerZ = 0;
    let sizeX = 0;
    let sizeZ = 0;

    if (segment.orientation === "vertical") {
      centerX = segment.coord + segment.outward * (wallThicknessM * 0.5);
      centerZ = (segment.start + segment.end) * 0.5;
      sizeX = wallThicknessM;
      sizeZ = lengthM;
    } else {
      centerX = (segment.start + segment.end) * 0.5;
      centerZ = segment.coord + segment.outward * (wallThicknessM * 0.5);
      sizeX = lengthM;
      sizeZ = wallThicknessM;
    }

    colliders.push({
      id: `wall-${i + 1}`,
      kind: "wall",
      min: {
        x: centerX - sizeX * 0.5,
        y: centerY - wallHeightM * 0.5,
        z: centerZ - sizeZ * 0.5,
      },
      max: {
        x: centerX + sizeX * 0.5,
        y: centerY + wallHeightM * 0.5,
        z: centerZ + sizeZ * 0.5,
      },
    });
  }
}

export function buildBlockout(spec: RuntimeBlockoutSpec, options: BlockoutBuildOptions): BlockoutBuildResult {
  const root = new Group();
  root.name = "map-blockout";
  const palette = resolveBlockoutPalette(options.highVis);
  const wallTextureQuality = resolveWallTextureQuality(options.floorQuality);

  const walkableRects = spec.zones
    .filter((zone) => WALKABLE_ZONE_TYPES.has(zone.type))
    .map((zone) => zone.rect);
  const stallRects = spec.zones
    .filter((zone) => zone.type === STALL_STRIP_ZONE_TYPE)
    .map((zone) => zone.rect);
  const clearRects = spec.zones
    .filter((zone) => zone.type === CLEAR_TRAVEL_ZONE_TYPE)
    .map((zone) => zone.rect);
  const axes = collectAxisCoordinates(walkableRects, spec.playable_boundary);
  const inside = buildInsideGrid(walkableRects, axes.xs, axes.ys);
  const wallSegments = mergeBoundarySegments(extractBoundarySegments(inside, axes.xs, axes.ys));
  const wallThicknessM = Math.max(0.05, spec.defaults.wall_thickness);

  const floorTopY = spec.defaults.floor_height;
  if (options.floorMode === "pbr" && options.floorMaterials) {
    const pbrFloors = buildPbrFloors(spec, {
      seed: options.seed,
      quality: options.floorQuality,
      manifest: options.floorMaterials,
      patchSizeM: 2,
      floorTopY,
    });
    root.add(pbrFloors);

    if (options.lightingPreset === "golden") {
      const sandAccumulation = buildSandAccumulation({
        wallSegments,
        seed: options.seed,
        floorTopY,
        manifest: options.floorMaterials,
        quality: options.floorQuality,
      });
      root.add(sandAccumulation);
    }
  } else {
    const walkableFloor = createFloorInstances(
      walkableRects,
      new MeshLambertMaterial({ color: palette.floorBase }),
      BASE_FLOOR_THICKNESS_M,
      floorTopY,
    );
    const stallOverlay = createFloorInstances(
      stallRects,
      new MeshLambertMaterial({ color: palette.floorStallOverlay }),
      OVERLAY_FLOOR_THICKNESS_M,
      floorTopY + 0.02,
    );
    const clearOverlay = createFloorInstances(
      clearRects,
      new MeshLambertMaterial({ color: palette.floorClearOverlay }),
      OVERLAY_FLOOR_THICKNESS_M,
      floorTopY + 0.03,
    );
    if (walkableFloor) walkableFloor.receiveShadow = true;
    if (stallOverlay) stallOverlay.receiveShadow = true;
    if (clearOverlay) clearOverlay.receiveShadow = true;

    if (walkableFloor) root.add(walkableFloor);
    if (stallOverlay) root.add(stallOverlay);
    if (clearOverlay) root.add(clearOverlay);
  }

  const colliders: RuntimeColliderAabb[] = [];
  appendWallSegmentColliders(wallSegments, spec.defaults.wall_height, wallThicknessM, floorTopY, colliders);

  // Run wall detail placements first — they compute per-segment heights
  // that the wall geometry builder needs for varied building silhouettes.
  const wallDetailDensityScale = typeof options.wallDetails.densityScale === "number"
    ? options.wallDetails.densityScale
    : 1;
  const wallDetailPlacements = buildWallDetailPlacements({
    segments: wallSegments,
    zones: spec.zones,
    anchors: options.anchors,
    seed: options.seed,
    wallHeightM: spec.defaults.wall_height,
    wallThicknessM,
    enabled: spec.wall_details.enabled && options.wallDetails.enabled,
    profile: options.wallMode === "pbr" ? "pbr" : "blockout",
    detailSeed: typeof spec.wall_details.seed === "number" ? spec.wall_details.seed : null,
    density: clamp(spec.wall_details.density * wallDetailDensityScale, 0, 1.25),
    maxProtrusionM: spec.wall_details.maxProtrusion,
  });

  const segmentHeights = wallDetailPlacements.segmentHeights;

  if (options.wallMode === "pbr" && options.wallMaterials) {
    const pbrWalls = buildPbrWalls({
      segments: wallSegments,
      zones: spec.zones,
      seed: options.seed,
      quality: wallTextureQuality,
      manifest: options.wallMaterials,
      wallHeightM: spec.defaults.wall_height,
      floorTopY,
      segmentHeights,
    });
    root.add(pbrWalls);
  } else {
    const wallInstances = createWallInstances(
      wallSegments,
      new MeshLambertMaterial({ color: palette.wall }),
      spec.defaults.wall_height,
      wallThicknessM,
      floorTopY,
      segmentHeights,
    );
    if (wallInstances) {
      wallInstances.castShadow = true;
      wallInstances.receiveShadow = true;
      root.add(wallInstances);
    }
  }

  if (wallDetailPlacements.instances.length > 0) {
    const detailRoot = buildWallDetailMeshes(wallDetailPlacements.instances, {
      highVis: options.highVis,
      wallMode: options.wallMode,
      wallMaterials: options.wallMaterials,
      quality: wallTextureQuality,
      seed: options.seed,
    });
    root.add(detailRoot);
  }

  colliders.push({
    id: "floor-slab",
    kind: "floor_slab",
    min: {
      x: spec.playable_boundary.x,
      y: -1,
      z: spec.playable_boundary.y,
    },
    max: {
      x: spec.playable_boundary.x + spec.playable_boundary.w,
      y: 0,
      z: spec.playable_boundary.y + spec.playable_boundary.h,
    },
  });

  // ── Perimeter cage walls — hard backstop so enemies/players can't escape the map ──
  {
    const CAGE_T = 0.5;   // thickness in metres
    const CAGE_H = 4.0;   // wall height in metres
    const pbX = spec.playable_boundary.x;
    const pbZ = spec.playable_boundary.y;  // spec stores Z-axis extent in .y
    const pbW = spec.playable_boundary.w;
    const pbD = spec.playable_boundary.h;  // spec stores depth (Z-size) in .h
    colliders.push(
      // South wall
      { id: "cage-S", kind: "wall", min: { x: pbX - CAGE_T, y: 0, z: pbZ - CAGE_T }, max: { x: pbX + pbW + CAGE_T, y: CAGE_H, z: pbZ } },
      // North wall
      { id: "cage-N", kind: "wall", min: { x: pbX - CAGE_T, y: 0, z: pbZ + pbD }, max: { x: pbX + pbW + CAGE_T, y: CAGE_H, z: pbZ + pbD + CAGE_T } },
      // West wall
      { id: "cage-W", kind: "wall", min: { x: pbX - CAGE_T, y: 0, z: pbZ }, max: { x: pbX, y: CAGE_H, z: pbZ + pbD } },
      // East wall
      { id: "cage-E", kind: "wall", min: { x: pbX + pbW, y: 0, z: pbZ }, max: { x: pbX + pbW + CAGE_T, y: CAGE_H, z: pbZ + pbD } },
    );
  }

  return { root, colliders, wallDetailStats: wallDetailPlacements.stats };
}
