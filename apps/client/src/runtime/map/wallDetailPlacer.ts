import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type {
  RuntimeAuthoredBalcony,
  RuntimeAuthoredDoor,
  RuntimeAuthoredWindow,
  RuntimeAnchorsSpec,
  RuntimeBalconyLayoutOverride,
  RuntimeBlockoutZone,
  RuntimeCompositionLayoutOverride,
  RuntimeDoorLayoutOverride,
  RuntimeDoorModule,
  RuntimeDoorStyleSource,
  RuntimeFacadeOverride,
  RuntimeFacadeOverridePreset,
  RuntimeHeroBayModule,
  RuntimeWallModuleRegistry,
  RuntimeWindowLayoutOverride,
  RuntimeWindowModule,
  WindowGlassStyle,
} from "./types";
import type { BoundarySegment } from "./buildBlockout";
import type { WallDetailInstance } from "./wallDetailKit";
import {
  CASTLE_DOOR_ID,
  ROLLERSHUTTER_ID,
  resolveCastleDoorRevealWidth,
  resolveCastleDoorSurroundRevealWidth,
  resolveCastleDoorSilhouette,
  type DoorModelPlacement,
} from "./buildDoorModels";
import {
  resolvePointedArchFrameFromAperture,
  resolveSpawnHeroPointedArchFrameFromAperture,
  resolveSpawnWindowPointedArchFrameFromAperture,
} from "./pointedArchProfile";
import {
  resolveFacadeStyleForSegment,
  type BalconyStyle,
  type FacadeFace,
  type FacadeFamily,
  type FacadeMaterialSlots,
  type FacadeTrimTier,
  resolveFacadeFaceForSegment,
} from "./wallMaterialAssignment";

const DETAIL_ZONE_TYPES = new Set([
  "main_lane_segment",
  "side_hall",
  "spawn_plaza",
  "connector",
  "cut",
]);

// DEV FLAG — strip all windows/balconies for blockout layout review.
// Set to false to re-enable glazing when moving to pbr/lookdev pass.
const DISABLE_WINDOWS = false;

const SEGMENT_EDGE_MARGIN_M = 0.35;
const INSTANCE_BUDGET = 9800;
const STORY_HEIGHT_M = 3.0;
const WINDOW_GLASS_THICKNESS_M = 0.02;
const STANDARD_MAIN_GROUND_FACADE_DOOR_W_M = 1.698;
const STANDARD_MAIN_GROUND_FACADE_DOOR_H_M = 2.405;
const SPAWN_B_HERO_DOOR_SURROUND_DEPTH_M = 0.21;
const SPAWN_B_STANDARD_WINDOW_MODULE_ID = "spawn_standard_window";
const SPAWN_B_STANDARD_DOOR_MODULE_ID = "spawn_standard_door";
const SPAWN_B_CENTER_HERO_MODULE_ID = "spawn_b_center_hero";
const SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_M = 0.58;
const SPAWN_B_SHELL_SHARED_PLINTH_DEPTH_M = 0.17;
const SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_SCALE = 0.85;
const SPAWN_B_SHELL_TRIM_DEPTH_SCALE = 0.67;
const STAINED_GLASS_BRIGHT_MATERIAL_ID = "tm_stained_glass_bright";
const STAINED_GLASS_DIM_MATERIAL_ID = "tm_stained_glass_dim";
const STAINED_GLASS_HERO_MATERIAL_ID = "tm_stained_glass_hero";
const RECESSED_PANEL_BACK_THICKNESS_M = 0.02;
const MIN_RECESSED_PANEL_FRONT_INSET_M = 0.08;
const DOOR_COVER_BLEED_MARGIN_M = 0.02;
const DOOR_COVER_CENTER_Y_OFFSET_M = 0.01;

// ── Standardized trim dimensions by story class ────────────────────────────
// All trim pieces use fixed canonical sizes per story count rather than per-segment
// RNG, so buildings of the same height class look consistent across the map.
// RNG calls are still made (and discarded) in each placement function to preserve
// the deterministic sequence for downstream window/balcony decisions.
type TrimDims = {
  plinthH: number;   plinthD: number;
  courseH: number;   courseD: number;
  corniceH: number;  corniceD: number;
  parapetH: number;  parapetD: number;
  pierW: number;     pierD: number;
  pilasterD: number; pilasterW: number;
};

const TRIM_DIMS: Record<number, TrimDims> = {
  1: { // 3 m — 1-story
    plinthH: 0.34,   plinthD: 0.08,
    courseH: 0.13,   courseD: 0.08,
    corniceH: 0.22,  corniceD: 0.12,
    parapetH: 0.22,  parapetD: 0.09,
    pierW: 0.44,     pierD: 0.07,
    pilasterD: 0.05, pilasterW: 0.16,
  },
  2: { // 6 m — 2-story
    plinthH: 0.38,   plinthD: 0.09,
    courseH: 0.13,   courseD: 0.08,
    corniceH: 0.24,  corniceD: 0.14,
    parapetH: 0.24,  parapetD: 0.10,
    pierW: 0.50,     pierD: 0.08,
    pilasterD: 0.06, pilasterW: 0.17,
  },
  3: { // 9 m — 3-story
    plinthH: 0.40,   plinthD: 0.10,
    courseH: 0.13,   courseD: 0.09,
    corniceH: 0.26,  corniceD: 0.15,
    parapetH: 0.26,  parapetD: 0.10,
    pierW: 0.56,     pierD: 0.08,
    pilasterD: 0.06, pilasterW: 0.18,
  },
};

// Spawn-enhanced trim dimensions — deeper profiles for Dust 2-scale architecture.
const SPAWN_TRIM_DIMS: Record<number, TrimDims> = {
  1: { // 3 m — 1-story
    plinthH: 0.44,   plinthD: 0.11,
    courseH: 0.16,   courseD: 0.10,
    corniceH: 0.28,  corniceD: 0.16,
    parapetH: 0.28,  parapetD: 0.12,
    pierW: 0.52,     pierD: 0.10,
    pilasterD: 0.07, pilasterW: 0.20,
  },
  2: { // 6 m — 2-story
    plinthH: 0.48,   plinthD: 0.14,
    courseH: 0.16,   courseD: 0.12,
    corniceH: 0.32,  corniceD: 0.20,
    parapetH: 0.30,  parapetD: 0.14,
    pierW: 0.58,     pierD: 0.13,
    pilasterD: 0.10, pilasterW: 0.22,
  },
  3: { // 9 m — 3-story
    plinthH: 0.52,   plinthD: 0.18,
    courseH: 0.18,   courseD: 0.14,
    corniceH: 0.36,  corniceD: 0.24,
    parapetH: 0.34,  parapetD: 0.16,
    pierW: 0.64,     pierD: 0.16,
    pilasterD: 0.12, pilasterW: 0.24,
  },
};

function getTrimDims(wallHeightM: number, isSpawn = false): TrimDims {
  const stories = Math.max(1, Math.round(wallHeightM / STORY_HEIGHT_M));
  const table = isSpawn ? SPAWN_TRIM_DIMS : TRIM_DIMS;
  return table[stories] ?? table[3]!;
}

// Roof cap constants
// 4 m depth ensures a solid-looking roofline without slabs floating above shorter adjacent zones.
const ROOF_DEPTH_M = 4.0;
const ROOF_THICKNESS_M = 0.20;
const ROOF_OVERHANG_M = 0.15;

// Building enclosure — back wall + return walls that close off the volume behind
// spawn outer facades so the roof cap doesn't appear to float.
const ENCLOSURE_WALL_THICKNESS = 0.25; // thinner than collision walls, visual only

// Balcony constants
const BALCONY_DEPTH_M = 0.95;
const BALCONY_SLAB_THICKNESS_M = 0.10;
const BALCONY_FRONT_PARAPET_H = 0.34;
const BALCONY_FRONT_PARAPET_THICKNESS_M = 0.10;
const BALCONY_END_NIB_DEPTH_M = 0.36;
const BALCONY_END_NIB_W = 0.12;
const BALCONY_END_NIB_H = 0.42;
const BALCONY_LIP_H = 0.06;
const BALCONY_LIP_DEPTH_M = 0.08;
const BALCONY_RAIL_THICKNESS_M = 0.04;
const BALCONY_RAIL_H = 0.05;
const BALCONY_BRACKET_H = 0.30;
const BALCONY_BRACKET_D = 0.24;
const BALCONY_BRACKET_W = 0.16;
const BALCONY_DOOR_H = 2.2;
const BALCONY_DOOR_SILL_OFFSET = 0.08;
// Derived from docs/map-design/window_bay_patterns.csv:
// 3/7/11 effective bay families correspond to odd-distance window offsets
// of 1, 3, and 5 bays from each door column.
const SPAWN_HERO_WINDOW_REACH_BY_STATE = {
  clean: 1,
  balcony_light: 3,
  balcony_heavy: 5,
} as const;

type SegmentFrame = {
  lengthM: number;
  centerX: number;
  centerZ: number;
  tangentX: number;
  tangentZ: number;
  inwardX: number;
  inwardZ: number;
  yawRad: number;
};

type ColumnRole = "door" | "window" | "blank";
type WallRole =
  | "main_frontage"
  | "main_side_window_only"
  | "sidehall_back_blank"
  | "sidehall_outer_quiet"
  | "spawn_frontage"
  | "spawn_side_window_rich"
  | "connector_blank"
  | "cut_blank";
type HeroFacadeState = keyof typeof SPAWN_HERO_WINDOW_REACH_BY_STATE;

type FacadeSpec = {
  bayCount: number;
  bayWidth: number;
  usableLength: number;
  stories: number;
  wallRole: WallRole;
  columnRoles: ColumnRole[];
  doorColumns: number[];
  compositionPreset: RuntimeFacadeOverridePreset;
  accentWindowColumns: number[];
  windowW: number;
  windowH: number;
  doorW: number;
  doorH: number;
  recessDepth: number;
  frameThickness: number;
  frameDepth: number;
  jambDepth: number;
  heroFacadeState: HeroFacadeState | null;
  facadeLean: -1 | 1;
  isSpawnHeroFacade: boolean;
  facadeFamily: FacadeFamily;
  trimTier: FacadeTrimTier;
  balconyStyle: BalconyStyle;
  materialSlots: FacadeMaterialSlots;
};

type SegmentDecorContext = {
  frame: SegmentFrame;
  zone: RuntimeBlockoutZone | null;
  facadeFace: FacadeFace;
  segmentOrdinal: number | null;
  wallRole: WallRole;
  compositionPreset: RuntimeFacadeOverridePreset;
  isMainLane: boolean;
  isShopfrontZone: boolean;
  isSideHall: boolean;
  isConnector: boolean;
  isCut: boolean;
  /** X coordinate of the map centre — used for inside/outside wall detection. */
  mapCenterX: number;
  /** Z coordinate of the map centre — used for inside/outside wall detection. */
  mapCenterZ: number;
  profile: BuildWallDetailProfile;
  facadeFamily: FacadeFamily;
  trimTier: FacadeTrimTier;
  balconyStyle: BalconyStyle;
  materialSlots: FacadeMaterialSlots;
  wallMaterialId: string;
  trimHeavyMaterialId: string | null;
  trimLightMaterialId: string | null;
  wallHeightM: number;
  maxProtrusionM: number;
  density: number;
  rng: DeterministicRng;
  instances: WallDetailInstance[];
  maxInstances: number;
  cornerAtStart: boolean;
  cornerAtEnd: boolean;
  /** Spawn plaza outer wall (back/side, NOT the entry wall facing bazaar). */
  isSpawnOuterWall: boolean;
  /** Connector wall facing toward the spawn (not the main lane). */
  isConnectorSpawnFacing: boolean;
  /** Collected door model placements for 3D door rendering. */
  doorModelPlacements: DoorModelPlacement[];
  /** Plinth dimensions computed early (for deferred emit with door gaps). */
  plinthHeight: number;
  plinthDepth: number;
  authoredDoorLayout: RuntimeDoorLayoutOverride | null;
  authoredDoorStyleSpec: FacadeSpec | null;
  authoredDoorStyleSource: RuntimeDoorStyleSource | null;
  authoredWindowLayout: RuntimeWindowLayoutOverride | null;
  authoredBalconyLayout: RuntimeBalconyLayoutOverride | null;
  authoredCompositionLayout: RuntimeCompositionLayoutOverride | null;
  windowModules: ReadonlyMap<string, RuntimeWindowModule>;
  doorModules: ReadonlyMap<string, RuntimeDoorModule>;
  heroBayModules: ReadonlyMap<string, RuntimeHeroBayModule>;
};

export type BuildWallDetailProfile = "blockout" | "pbr";

export type BuildWallDetailPlacementsOptions = {
  segments: readonly BoundarySegment[];
  zones: readonly RuntimeBlockoutZone[];
  anchors: RuntimeAnchorsSpec | null;
  facadeOverrides: readonly RuntimeFacadeOverride[];
  moduleRegistry: RuntimeWallModuleRegistry;
  compositionLayoutOverrides: readonly RuntimeCompositionLayoutOverride[];
  doorLayoutOverrides: readonly RuntimeDoorLayoutOverride[];
  windowLayoutOverrides: readonly RuntimeWindowLayoutOverride[];
  balconyLayoutOverrides: readonly RuntimeBalconyLayoutOverride[];
  seed: number;
  wallHeightM: number;
  wallThicknessM: number;
  enabled: boolean;
  profile: BuildWallDetailProfile;
  detailSeed: number | null;
  density: number;
  maxProtrusionM: number;
};

export type WallDetailPlacementStats = {
  enabled: boolean;
  seed: number;
  density: number;
  segmentCount: number;
  segmentsDecorated: number;
  instanceCount: number;
};

export type WallDetailPlacementResult = {
  instances: WallDetailInstance[];
  doorModelPlacements: DoorModelPlacement[];
  segmentHeights: number[];
  stats: WallDetailPlacementStats;
};

type WindowTreatment = "glass" | "dark" | "shuttered";

type DoorCoverEnvelope = {
  modelId: string;
  effectiveDoorW: number;
  coverShape: "arched" | "rect";
  coverWidthM: number;
  coverHeightM: number;
  coverCenterYOffsetM: number;
  trimThicknessM?: number;
  revealWidthM?: number;
};

function authoredWindowLayoutKey(zoneId: string, face: FacadeFace, segmentOrdinal: number): string {
  return `${zoneId}:${face}:${segmentOrdinal}`;
}

function authoredDoorLayoutKey(zoneId: string, face: FacadeFace, segmentOrdinal: number): string {
  return `${zoneId}:${face}:${segmentOrdinal}`;
}

function authoredBalconyLayoutKey(zoneId: string, face: FacadeFace, segmentOrdinal: number): string {
  return `${zoneId}:${face}:${segmentOrdinal}`;
}

function compositionLayoutKey(zoneId: string, face: FacadeFace, segmentOrdinal: number): string {
  return `${zoneId}:${face}:${segmentOrdinal}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAuthoredRoofBreakSpan(
  ctx: SegmentDecorContext,
): { centerS: number; widthM: number } | null {
  const balcony = ctx.authoredBalconyLayout?.balconies.find((candidate) => candidate.roofBreakWidthM > 0) ?? null;
  if (!balcony) return null;
  return {
    centerS: balcony.centerS,
    widthM: balcony.roofBreakWidthM,
  };
}

function resolveHorizontalFeatureSpans(
  totalLengthM: number,
  reservedSpan: { centerS: number; widthM: number } | null,
): Array<{ centerS: number; lengthM: number }> {
  if (!reservedSpan) {
    return [{ centerS: 0, lengthM: totalLengthM }];
  }

  const halfLength = totalLengthM * 0.5;
  const reservedStart = clamp(reservedSpan.centerS - reservedSpan.widthM * 0.5, -halfLength, halfLength);
  const reservedEnd = clamp(reservedSpan.centerS + reservedSpan.widthM * 0.5, -halfLength, halfLength);
  const spans: Array<{ centerS: number; lengthM: number }> = [];

  if (reservedStart > -halfLength + 0.04) {
    const lengthM = reservedStart + halfLength;
    spans.push({
      centerS: (-halfLength + reservedStart) * 0.5,
      lengthM,
    });
  }

  if (reservedEnd < halfLength - 0.04) {
    const lengthM = halfLength - reservedEnd;
    spans.push({
      centerS: (reservedEnd + halfLength) * 0.5,
      lengthM,
    });
  }

  return spans.length > 0 ? spans : [{ centerS: 0, lengthM: totalLengthM }];
}

function pointInRect2D(zone: RuntimeBlockoutZone, x: number, z: number): boolean {
  const rect = zone.rect;
  return x >= rect.x && x <= rect.x + rect.w && z >= rect.y && z <= rect.y + rect.h;
}

function resolveSegmentZone(frame: SegmentFrame, zones: readonly RuntimeBlockoutZone[]): RuntimeBlockoutZone | null {
  const probeX = frame.centerX + frame.inwardX * 0.1;
  const probeZ = frame.centerZ + frame.inwardZ * 0.1;
  let winner: RuntimeBlockoutZone | null = null;
  let winnerArea = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    if (!DETAIL_ZONE_TYPES.has(zone.type)) continue;
    if (!pointInRect2D(zone, probeX, probeZ)) continue;
    const area = zone.rect.w * zone.rect.h;
    if (area < winnerArea) {
      winnerArea = area;
      winner = zone;
    }
  }

  return winner;
}

function isMainLaneZone(zone: RuntimeBlockoutZone | null): boolean {
  if (!zone) return false;
  if (zone.type === "main_lane_segment") return true;
  const tag = `${zone.id} ${zone.label} ${zone.notes}`.toLowerCase();
  return tag.includes("main lane") || tag.includes("main_bazaar") || tag.includes("bazaar main");
}

function isShopfrontZone(zone: RuntimeBlockoutZone | null): boolean {
  if (!zone) return false;
  return zone.type === "main_lane_segment" || zone.id.startsWith("BZ_");
}

function isBlankWallRole(wallRole: WallRole): boolean {
  return wallRole === "sidehall_back_blank" || wallRole === "connector_blank" || wallRole === "cut_blank";
}

function isFrontageWallRole(wallRole: WallRole): boolean {
  return wallRole === "main_frontage" || wallRole === "spawn_frontage";
}

function usesStandardMainGroundFacadeDoorSize(wallRole: WallRole): boolean {
  return wallRole === "main_frontage" || wallRole === "spawn_frontage";
}

function resolveWallRole(
  zone: RuntimeBlockoutZone | null,
  facadeFace: FacadeFace,
  isInsideWall: boolean,
  isSpawnEntryWall: boolean,
): WallRole {
  if (!zone) {
    return "sidehall_outer_quiet";
  }

  switch (zone.type) {
    case "main_lane_segment":
      return facadeFace === "east" || facadeFace === "west"
        ? "main_frontage"
        : "main_side_window_only";
    case "side_hall":
      return isInsideWall ? "sidehall_back_blank" : "sidehall_outer_quiet";
    case "spawn_plaza": {
      const isHorizontalFacade = facadeFace === "north" || facadeFace === "south";
      if (isSpawnEntryWall || isHorizontalFacade) {
        return "spawn_frontage";
      }
      return "spawn_side_window_rich";
    }
    case "connector":
      return "connector_blank";
    case "cut":
      return "cut_blank";
    default:
      return "sidehall_outer_quiet";
  }
}

function toSegmentFrame(segment: BoundarySegment): SegmentFrame {
  if (segment.orientation === "vertical") {
    return {
      lengthM: segment.end - segment.start,
      centerX: segment.coord,
      centerZ: (segment.start + segment.end) * 0.5,
      tangentX: 0,
      tangentZ: 1,
      inwardX: -segment.outward,
      inwardZ: 0,
      yawRad: 0,
    };
  }

  return {
    lengthM: segment.end - segment.start,
    centerX: (segment.start + segment.end) * 0.5,
    centerZ: segment.coord,
    tangentX: 1,
    tangentZ: 0,
    inwardX: 0,
    inwardZ: -segment.outward,
    yawRad: Math.PI * 0.5,
  };
}

function toWorld(frame: SegmentFrame, alongS: number, y: number, inwardN: number): { x: number; y: number; z: number } {
  return {
    x: frame.centerX + frame.tangentX * alongS + frame.inwardX * inwardN,
    y,
    z: frame.centerZ + frame.tangentZ * alongS + frame.inwardZ * inwardN,
  };
}

function pushBox(
  instances: WallDetailInstance[],
  maxInstances: number,
  meshId: WallDetailInstance["meshId"],
  wallMaterialId: string | null,
  frame: SegmentFrame,
  alongS: number,
  y: number,
  inwardN: number,
  depth: number,
  height: number,
  length: number,
  pitchRad?: number,
  rollRad?: number,
): boolean {
  if (instances.length >= maxInstances) {
    return false;
  }

  const world = toWorld(frame, alongS, y, inwardN);
  const instance: WallDetailInstance = {
    meshId,
    position: world,
    scale: {
      x: Math.max(0.002, depth),
      y: Math.max(0.002, height),
      z: Math.max(0.002, length),
    },
    yawRad: frame.yawRad,
    wallMaterialId,
    trimMaterialId: null,
  };
  if (pitchRad !== undefined) instance.pitchRad = pitchRad;
  if (rollRad !== undefined) instance.rollRad = rollRad;
  instances.push(instance);

  return true;
}

function tagTrim(
  instances: WallDetailInstance[],
  trimId: string | null,
  detailMaterialId: string | null = null,
): void {
  if (instances.length === 0) {
    return;
  }
  if (trimId != null) {
    instances[instances.length - 1]!.trimMaterialId = trimId;
  }
  if (detailMaterialId != null) {
    instances[instances.length - 1]!.detailMaterialId = detailMaterialId;
  }
}

function pushArchedDoorVoid(
  ctx: SegmentDecorContext,
  centerS: number,
  centerY: number,
  doorH: number,
  inwardN: number,
  depth: number,
  doorW: number,
): boolean {
  return pushBox(
    ctx.instances,
    ctx.maxInstances,
    "door_void_arch",
    null,
    ctx.frame,
    centerS,
    centerY,
    inwardN,
    depth,
    doorH,
    doorW,
  );
}

function pushDoorCoverVoid(
  ctx: SegmentDecorContext,
  centerS: number,
  centerY: number,
  inwardN: number,
  depth: number,
  widthM: number,
  heightM: number,
  shape: DoorCoverEnvelope["coverShape"],
): boolean {
  if (shape === "arched") {
    return pushArchedDoorVoid(ctx, centerS, centerY, heightM, inwardN, depth, widthM);
  }
  return pushBox(
    ctx.instances,
    ctx.maxInstances,
    "door_void",
    null,
    ctx.frame,
    centerS,
    centerY,
    inwardN,
    depth,
    heightM,
    widthM,
  );
}

function resolve3dDoorCoverEnvelope(spec: FacadeSpec, isBrickBackdrop: boolean): DoorCoverEnvelope | null {
  if (spec.doorH < 2.0 || spec.doorW < 0.8) {
    return null;
  }

  const modelId = spec.doorW >= 1.2 ? CASTLE_DOOR_ID : ROLLERSHUTTER_ID;
  if (modelId === CASTLE_DOOR_ID) {
    const trimThicknessM = spec.frameThickness * (isBrickBackdrop ? 1.18 : 1);
    const coverRevealWidthM = resolveCastleDoorRevealWidth(trimThicknessM);
    const revealWidthM = resolveCastleDoorSurroundRevealWidth(trimThicknessM);
    const silhouette = resolveCastleDoorSilhouette(spec.doorH);
    return {
      modelId,
      effectiveDoorW: silhouette.widthM,
      coverShape: "arched",
      coverWidthM: silhouette.widthM + coverRevealWidthM * 2 + DOOR_COVER_BLEED_MARGIN_M,
      coverHeightM: spec.doorH + coverRevealWidthM + DOOR_COVER_BLEED_MARGIN_M,
      coverCenterYOffsetM: DOOR_COVER_CENTER_Y_OFFSET_M,
      trimThicknessM,
      revealWidthM,
    };
  }

  return {
    modelId,
    effectiveDoorW: spec.doorW,
    coverShape: "rect",
    coverWidthM: spec.doorW + DOOR_COVER_BLEED_MARGIN_M,
    coverHeightM: spec.doorH + DOOR_COVER_BLEED_MARGIN_M,
    coverCenterYOffsetM: DOOR_COVER_CENTER_Y_OFFSET_M,
  };
}

function resolveInsetSurfaceCenterOffset(requestedInsetM: number, depthM: number): number {
  const minimumInset = MIN_RECESSED_PANEL_FRONT_INSET_M + depthM * 0.5;
  return -Math.max(requestedInsetM, minimumInset);
}

function isSpawnGateBrickBackdropPreset(preset: RuntimeFacadeOverridePreset): boolean {
  return preset === "spawn_gate_brick_backdrop";
}

function isSpawnBShellCleanupSurface(ctx: SegmentDecorContext): boolean {
  return ctx.zone?.id === "SPAWN_B_GATE_PLAZA"
    && (ctx.facadeFace === "north" || ctx.facadeFace === "east" || ctx.facadeFace === "west");
}

function scaleSpawnBShellTrimDepth(depthM: number, isSpawnBCleanup: boolean): number {
  return isSpawnBCleanup ? depthM * SPAWN_B_SHELL_TRIM_DEPTH_SCALE : depthM;
}

function resolveCorniceStripHeight(ctx: SegmentDecorContext, dims: TrimDims): number {
  return dims.corniceH * (ctx.trimTier === "hero" ? 1.06 : ctx.trimTier === "accented" ? 0.98 : 0.84);
}

function isSpawnHeroFacade(ctx: SegmentDecorContext): boolean {
  return ctx.compositionPreset === "spawn_courtyard_landmark"
    || isSpawnGateBrickBackdropPreset(ctx.compositionPreset);
}

function pickHeroFacadeLean(ctx: SegmentDecorContext): -1 | 1 {
  return ctx.rng.fork("spawn-hero-lean").next() < 0.5 ? -1 : 1;
}

function pickFacadeLean(ctx: SegmentDecorContext): -1 | 1 {
  if (ctx.zone?.type === "spawn_plaza") {
    return pickHeroFacadeLean(ctx);
  }
  return ctx.rng.fork("facade-lean").next() < 0.5 ? -1 : 1;
}

// ── Per-segment height variation ───────────────────────────────────────────

function resolveSegmentWallHeight(
  baseHeight: number,
  zone: RuntimeBlockoutZone | null,
  _rng: DeterministicRng,
  isInsideWall: boolean,
  isSpawnEntryWall: boolean,
  isConnectorMainLaneFacing: boolean,
): number {
  const zoneType = zone?.type ?? "main_lane_segment";

  // Main-lane buildings are fixed at 3 stories (9 m).
  // A fixed, zone-uniform height eliminates corner holes and floating slabs that
  // appear when different wall segments of the same building independently pick
  // 2 vs 3 stories.  All walls probing into the same main_lane_segment zone will
  // resolve to this same constant, so every face (front, back, end caps) matches.
  if (zoneType === "main_lane_segment") {
    return 3 * STORY_HEIGHT_M; // exactly 9 m
  }

  // Spawn plazas: the entry wall (bazaar-facing side at Z=14/Z=68) stays 3 stories
  // to keep the spawn-to-main-lane transition corner fully enclosed.  All other
  // spawn walls (back wall, side walls) are 2 stories — the outer buildings.
  if (zoneType === "spawn_plaza") {
    return isSpawnEntryWall
      ? 3 * STORY_HEIGHT_M  // entry wall — keeps transition at Z=14/Z=68 seamless
      : 2 * STORY_HEIGHT_M; // outside wall — 2 stories
  }

  // Side halls: inner wall (back of main-lane building) → 9 m to match the building.
  // Outer wall (perimeter alley side) → 1 story (3 m) for visual balance.
  // Horizontal end-cap walls always pass isInsideWall=false so they stay short.
  if (zoneType === "side_hall") {
    return isInsideWall ? 3 * STORY_HEIGHT_M : 1 * STORY_HEIGHT_M;
  }

  // Cut-passage jamb walls (north/south faces of cut zones) raised to 9 m so the
  // corner where the cut meets the building wall has no upper-story gap.
  if (zoneType === "cut") {
    return 3 * STORY_HEIGHT_M; // 9 m fixed
  }

  // Connector zones sit at the transition between 9 m main-lane buildings and
  // 6 m spawn buildings.  Main-lane-facing walls (back of 3-story buildings)
  // stay at 9 m so the building silhouette is preserved.  Spawn-facing walls
  // match the spawn outer wall height (6 m / 2 stories).
  if (zoneType === "connector") {
    return isConnectorMainLaneFacing
      ? 3 * STORY_HEIGHT_M  // 9 m — back of main-lane building
      : 2 * STORY_HEIGHT_M; // 6 m — matches spawn outer walls
  }

  return baseHeight;
}

// ── Parapet cap ────────────────────────────────────────────────────────────

function placeParapetCap(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  const isHero = isSpawnHeroFacade(ctx);
  const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);
  ctx.rng.range(0.18, 0.35); // consume
  ctx.rng.range(0.06, 0.14); // consume
  const tierHeightScale = ctx.trimTier === "hero" ? 1.08 : ctx.trimTier === "accented" ? 0.98 : 0.86;
  const tierDepthScale = ctx.trimTier === "hero" ? 1.18 : ctx.trimTier === "accented" ? 1.0 : 0.82;
  const capHeight = dims.parapetH * (isHero ? 1.18 : tierHeightScale);
  const capDepth = scaleSpawnBShellTrimDepth(
    clamp(
      dims.parapetD * (isHero ? 1.35 : tierDepthScale),
      0.04,
      ctx.maxProtrusionM + 0.06,
    ),
    isSpawnBCleanup,
  );
  const y = ctx.wallHeightM + capHeight * 0.5;
  for (const span of resolveHorizontalFeatureSpans(ctx.frame.lengthM, resolveAuthoredRoofBreakSpan(ctx))) {
    pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
      ctx.frame, span.centerS, y, capDepth * 0.5, capDepth, capHeight, span.lengthM);
    tagTrim(
      ctx.instances,
      isSpawnBCleanup || isHero || ctx.trimTier === "hero" ? ctx.trimHeavyMaterialId : ctx.trimLightMaterialId,
    );
  }
}

// ── Roof cap ───────────────────────────────────────────────────────────────

function placeRoofCap(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;

  const roofY = ctx.wallHeightM + ROOF_THICKNESS_M * 0.5;
  const roofLength = ctx.frame.lengthM;
  // Positive inwardN = toward walkable zone, negative = into building mass
  const centerInwardN = (ROOF_OVERHANG_M - ROOF_DEPTH_M) * 0.5;

  for (const span of resolveHorizontalFeatureSpans(roofLength, resolveAuthoredRoofBreakSpan(ctx))) {
    pushBox(
      ctx.instances, ctx.maxInstances,
      "roof_slab", ctx.wallMaterialId,
      ctx.frame,
      span.centerS,
      roofY,
      centerInwardN,
      ROOF_DEPTH_M + ROOF_OVERHANG_M,
      ROOF_THICKNESS_M,
      span.lengthM,
    );
    tagTrim(ctx.instances, null); // uses template roof material — not wall surface
  }
}

// ── Building enclosure (back wall + return walls) ────────────────────────

/**
 * Close off the volume behind spawn outer facades so they look like complete
 * 2-story buildings rather than flat wall slabs with floating roof caps.
 *
 * Adds three boxes per qualifying segment:
 *   1. Back wall  — parallel to front face, offset inward by ROOF_DEPTH_M
 *   2. Return wall at segment start — perpendicular, front-to-back
 *   3. Return wall at segment end   — same
 */
function placeBuildingEnclosure(ctx: SegmentDecorContext): void {
  // Only spawn outer walls get enclosure shells. Connector spawn-facing walls are
  // transitional portals, not true front facades; enclosing them leaks slabs into
  // the spawn sightline and shows up as plaster patches over nearby brick walls.
  if (!ctx.isSpawnOuterWall) return;
  if (ctx.frame.lengthM < 1.0) return;

  const wallH = ctx.wallHeightM;
  const t = ENCLOSURE_WALL_THICKNESS;

  // ── Back wall ──────────────────────────────────────────────────────────
  // Parallel to the front face, offset inward by the roof depth.
  // Negative inwardN = behind the front wall (into building mass).
  const backInwardN = -(ROOF_DEPTH_M - t * 0.5);
  pushBox(
    ctx.instances, ctx.maxInstances,
    "recessed_panel_back", ctx.wallMaterialId,
    ctx.frame,
    0,              // centered along segment
    wallH * 0.5,    // vertically centered
    backInwardN,
    t,              // depth  (thin slab)
    wallH,          // full wall height
    ctx.frame.lengthM,
  );
  tagTrim(ctx.instances, null); // plaster, not stone

  // ── Return walls (side caps) ───────────────────────────────────────────
  // Perpendicular to the front face at each endpoint, spanning from the
  // front face back to the back wall.
  const halfLen = ctx.frame.lengthM * 0.5;
  const returnCenterN = -(ROOF_DEPTH_M * 0.5);  // midpoint front-to-back

  for (const side of [-1, 1] as const) {
    const alongS = side * (halfLen - t * 0.5);
    pushBox(
      ctx.instances, ctx.maxInstances,
      "recessed_panel_back", ctx.wallMaterialId,
      ctx.frame,
      alongS,
      wallH * 0.5,
      returnCenterN,
      ROOF_DEPTH_M,     // depth spans front-to-back
      wallH,            // full wall height
      t,                // thin slab width
    );
    tagTrim(ctx.instances, null);
  }
}

// ── Horizontal banding ─────────────────────────────────────────────────────

/** Consume RNG and compute plinth dimensions — does NOT emit geometry.
 *  Call emitPlinthStrip() later once door gap positions are known. */
function computePlinthDims(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  if (isSpawnBShellCleanupSurface(ctx)) {
    ctx.rng.range(0.28, 0.48); // consume (preserve determinism)
    ctx.rng.range(0.06, 0.13); // consume
    ctx.plinthHeight = SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_M * SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_SCALE;
    ctx.plinthDepth = scaleSpawnBShellTrimDepth(
      clamp(
        SPAWN_B_SHELL_SHARED_PLINTH_DEPTH_M,
        0.04,
        ctx.maxProtrusionM + 0.06,
      ),
      true,
    );
    return;
  }
  const isHero = isSpawnHeroFacade(ctx);
  ctx.rng.range(0.28, 0.48); // consume (preserve determinism)
  ctx.rng.range(0.06, 0.13); // consume
  const tierHeightScale = ctx.trimTier === "hero" ? 1.08 : ctx.trimTier === "accented" ? 0.96 : 0.84;
  const tierDepthScale = ctx.trimTier === "hero" ? 1.12 : ctx.trimTier === "accented" ? 0.95 : 0.8;
  ctx.plinthHeight = dims.plinthH * (isHero ? 1.45 : tierHeightScale);
  ctx.plinthDepth = clamp(
    dims.plinthD * (isHero ? 1.65 : tierDepthScale),
    0.04,
    ctx.maxProtrusionM + 0.06,
  );
}

/** Emit plinth_strip segments, skipping gaps where 3D door models are placed. */
function emitPlinthStrip(
  ctx: SegmentDecorContext,
  doorGaps: readonly { centerS: number; halfW: number }[],
): void {
  if (ctx.plinthHeight === 0 || ctx.isSideHall) return;
  const halfLen = ctx.frame.lengthM * 0.5;

  if (doorGaps.length === 0) {
    // No gaps — one continuous strip (same as original)
    pushBox(ctx.instances, ctx.maxInstances, "plinth_strip", ctx.wallMaterialId,
      ctx.frame, 0, ctx.plinthHeight * 0.5, ctx.plinthDepth * 0.5,
      ctx.plinthDepth, ctx.plinthHeight, ctx.frame.lengthM);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
    return;
  }

  // Sort gaps by position, then emit segments between them
  const sorted = [...doorGaps].sort((a, b) => a.centerS - b.centerS);
  let cursor = -halfLen;
  for (const gap of sorted) {
    const gapStart = gap.centerS - gap.halfW;
    const gapEnd = gap.centerS + gap.halfW;
    if (gapStart > cursor + 0.01) {
      const segLen = gapStart - cursor;
      const segCenter = (cursor + gapStart) * 0.5;
      pushBox(ctx.instances, ctx.maxInstances, "plinth_strip", ctx.wallMaterialId,
        ctx.frame, segCenter, ctx.plinthHeight * 0.5, ctx.plinthDepth * 0.5,
        ctx.plinthDepth, ctx.plinthHeight, segLen);
      tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
    }
    cursor = Math.max(cursor, gapEnd);
  }
  // Trailing segment after last gap
  if (halfLen > cursor + 0.01) {
    const segLen = halfLen - cursor;
    const segCenter = (cursor + halfLen) * 0.5;
    pushBox(ctx.instances, ctx.maxInstances, "plinth_strip", ctx.wallMaterialId,
      ctx.frame, segCenter, ctx.plinthHeight * 0.5, ctx.plinthDepth * 0.5,
      ctx.plinthDepth, ctx.plinthHeight, segLen);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
  }
}

function placeStringCourses(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.5) return;
  if (isSpawnBShellCleanupSurface(ctx)) return;
  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  ctx.rng.range(0.10, 0.18); // consume
  ctx.rng.range(0.06, 0.11); // consume
  // Spawn: 2-story walls get string courses. Non-spawn: original 3-story guard.
  const minHeight = ctx.zone?.type === "spawn_plaza" ? STORY_HEIGHT_M * 2 : STORY_HEIGHT_M * 3;
  if (ctx.trimTier === "restrained" || ctx.facadeFamily === "service" || ctx.wallHeightM < minHeight) {
    return;
  }
  const courseHeight = dims.courseH;
  const courseDepth = clamp(dims.courseD, 0.04, ctx.maxProtrusionM + 0.04);

  // Place a string course at EVERY story break for rhythmic horizontal banding.
  for (let storyY = STORY_HEIGHT_M; storyY < ctx.wallHeightM - 0.5; storyY += STORY_HEIGHT_M) {
    if (!pushBox(ctx.instances, ctx.maxInstances, "string_course_strip", ctx.wallMaterialId,
      ctx.frame, 0, storyY, courseDepth * 0.5,
      courseDepth, courseHeight, ctx.frame.lengthM)) {
      return;
    }
    tagTrim(ctx.instances, ctx.trimLightMaterialId);
  }
}

function placeCorniceStrip(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);
  ctx.rng.range(0.18, 0.30); // consume
  ctx.rng.range(0.10, 0.19); // consume
  // Spawn hero facades now keep their cornice for silhouette definition.
  const corniceHeight = resolveCorniceStripHeight(ctx, dims);
  const corniceDepth = scaleSpawnBShellTrimDepth(
    clamp(
      dims.corniceD * (ctx.trimTier === "hero" ? 1.1 : ctx.trimTier === "accented" ? 0.96 : 0.8),
      0.06,
      ctx.maxProtrusionM + 0.08,
    ),
    isSpawnBCleanup,
  );
  const y = ctx.wallHeightM - corniceHeight * 0.5;
  for (const span of resolveHorizontalFeatureSpans(ctx.frame.lengthM, resolveAuthoredRoofBreakSpan(ctx))) {
    pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
      ctx.frame, span.centerS, y, corniceDepth * 0.5,
      corniceDepth, corniceHeight, span.lengthM);
    tagTrim(ctx.instances, isSpawnBCleanup ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : ctx.trimLightMaterialId);
  }
}

// ── Corner piers ───────────────────────────────────────────────────────────

function placeCornerPiers(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.8) return;

  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  const isHero = isSpawnHeroFacade(ctx);
  const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);
  const marginM = ctx.profile === "pbr" ? 0.04 : 0.02;
  const maxWidth = Math.max(0.28, Math.min(1.05, ctx.frame.lengthM * 0.4));
  // Consume RNG calls that were previously used for random dims (preserves sequence).
  ctx.rng.range(0.4, 0.72);   // was baseWidth
  ctx.rng.range(0.05, 0.1);   // was baseDepth
  ctx.rng.range(0.35, 0.75);  // was pierHeight offset
  const isSpawn = ctx.zone?.type === "spawn_plaza";
  const tierWidthScale = isHero ? 0.88
    : ctx.trimTier === "hero" ? 0.88
    : ctx.trimTier === "accented" ? (isSpawn ? 0.82 : 0.72)
    : (isSpawn ? 0.68 : 0.58);
  const tierDepthScale = isHero ? 1.3
    : ctx.trimTier === "hero" ? (isSpawn ? 1.3 : 1.0)
    : ctx.trimTier === "accented" ? (isSpawn ? 1.1 : 0.78)
    : (isSpawn ? 0.85 : 0.62);
  const pierWidth = clamp(dims.pierW * tierWidthScale, 0.22, maxWidth);
  const pierDepth = scaleSpawnBShellTrimDepth(
    clamp(dims.pierD * tierDepthScale, 0.05, ctx.maxProtrusionM),
    isSpawnBCleanup,
  );
  const pierHeight = ctx.wallHeightM; // full height — contiguous with roofline
  const halfLen = ctx.frame.lengthM * 0.5;

  // At corners the pier depth must cover all strip protrusions so it
  // visually bridges the perpendicular wall faces.
  const cleanupCorniceDepth = scaleSpawnBShellTrimDepth(
    clamp(
      dims.corniceD * (ctx.trimTier === "hero" ? 1.1 : ctx.trimTier === "accented" ? 0.96 : 0.8),
      0.06,
      ctx.maxProtrusionM + 0.08,
    ),
    isSpawnBCleanup,
  );
  const cleanupParapetDepth = scaleSpawnBShellTrimDepth(
    clamp(
      dims.parapetD * (isHero ? 1.35 : ctx.trimTier === "hero" ? 1.18 : ctx.trimTier === "accented" ? 1.0 : 0.82),
      0.04,
      ctx.maxProtrusionM + 0.06,
    ),
    isSpawnBCleanup,
  );
  const cornerDepth = isSpawnBCleanup
    ? Math.max(
      pierDepth,
      scaleSpawnBShellTrimDepth(SPAWN_B_SHELL_SHARED_PLINTH_DEPTH_M, true),
      cleanupCorniceDepth,
      cleanupParapetDepth,
    )
    : Math.max(pierDepth, dims.plinthD, dims.courseD, dims.corniceD, dims.parapetD);

  for (const side of [-1, 1] as const) {
    const isCorner = (side === -1 && ctx.cornerAtStart) || (side === 1 && ctx.cornerAtEnd);
    const effectiveMargin = isCorner ? 0 : marginM;
    const effectiveDepth = isCorner ? cornerDepth : pierDepth;
    const capChance = clamp(
      0.22 + (ctx.isShopfrontZone ? 0.08 : 0) - (ctx.isSideHall ? 0.08 : 0) + ctx.density * 0.04,
      0.08, 0.45,
    );
    // Skip path: non-corner piers on main-lane non-hero or hero facades.
    // Spawn: always place (fall through). Non-spawn: original skip (continue).
    if ((ctx.isMainLane || ctx.zone?.type === "main_lane_segment") && !isCorner && ctx.trimTier !== "hero") {
      if (ctx.rng.next() < capChance) {
        ctx.rng.range(0.55, 1.05);
        ctx.rng.range(0.4, 0.62);
      }
      if (!isSpawn) continue;
    } else if (isHero && !isCorner) {
      if (ctx.rng.next() < capChance) {
        ctx.rng.range(0.55, 1.05);
        ctx.rng.range(0.4, 0.62);
      }
      if (!isSpawn) continue;
    }
    const s = side * Math.max(0.02, halfLen - pierWidth * 0.5 - effectiveMargin);
    if (!pushBox(
      ctx.instances, ctx.maxInstances, "corner_pier", ctx.wallMaterialId,
      ctx.frame, s, pierHeight * 0.5, effectiveDepth * 0.5,
      effectiveDepth, pierHeight, pierWidth,
    )) {
      return;
    }
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId);

    // Consume cap RNG to preserve downstream determinism — no cap geometry emitted.
    if (ctx.rng.next() < capChance) {
      ctx.rng.range(0.55, 1.05); // consume — was capHeight
      ctx.rng.range(0.4, 0.62);  // consume — was capWidthFrac
    }
  }
}

// ── Wall-role driven opening policy ────────────────────────────────────────

function resolveDoorCountForWallRole(
  wallRole: WallRole,
  usableLength: number,
  compositionPreset: RuntimeFacadeOverridePreset,
): number {
  if (!isFrontageWallRole(wallRole)) {
    return 0;
  }
  if (isHeroBalconyPreset(compositionPreset) && usableLength >= 8) {
    return usableLength >= 16 ? 2 : 1;
  }
  if (usableLength >= 18) {
    return 2;
  }
  if (usableLength >= 8) {
    return 1;
  }
  return 0;
}

/**
 * Evenly distribute `doorCount` door bays across `bayCount` bays.
 * A 1-bay gap is reserved at each end so no door sits flush at a wall edge.
 */
function assignDoorColumns(bayCount: number, doorCount: number): number[] {
  if (doorCount <= 0 || bayCount <= 0) return [];
  const clamped = Math.min(doorCount, bayCount);

  if (clamped === 1) {
    return [Math.floor(bayCount / 2)];
  }

  const first = bayCount > 2 ? 1 : 0;
  const last = bayCount > 2 ? bayCount - 2 : bayCount - 1;
  const range = last - first;

  const columns: number[] = [];
  for (let i = 0; i < clamped; i += 1) {
    const col = range > 0 ? first + Math.round((i * range) / (clamped - 1)) : first;
    if (!columns.includes(col)) columns.push(col);
  }
  return columns;
}

function buildWindowCandidateColumns(
  bayCount: number,
  blockedColumns: ReadonlySet<number>,
): number[] {
  const allowEdgeColumns = bayCount <= 3;
  const minIndex = allowEdgeColumns ? 0 : 1;
  const maxIndex = allowEdgeColumns ? bayCount - 1 : bayCount - 2;
  const columns: number[] = [];

  for (let col = minIndex; col <= maxIndex; col += 1) {
    if (!blockedColumns.has(col)) {
      columns.push(col);
    }
  }

  return columns;
}

function pickBalancedColumns(candidateColumns: readonly number[], bayCount: number, targetCount: number): number[] {
  if (targetCount <= 0 || candidateColumns.length === 0) {
    return [];
  }

  const wallMid = (bayCount - 1) * 0.5;
  const groups = new Map<string, number[]>();

  for (const column of candidateColumns) {
    const key = Math.abs(column - wallMid).toFixed(4);
    const group = groups.get(key);
    if (group) {
      group.push(column);
    } else {
      groups.set(key, [column]);
    }
  }

  const selected: number[] = [];
  const sortedGroups = [...groups.entries()]
    .map(([distance, columns]) => ({
      distance: Number(distance),
      columns: [...columns].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.distance - b.distance);

  for (const group of sortedGroups) {
    selected.push(...group.columns);
    if (selected.length >= targetCount) {
      break;
    }
  }

  return [...new Set(selected)].sort((a, b) => a - b);
}

function resolveWindowColumnTarget(
  wallRole: WallRole,
  candidateColumns: readonly number[],
  stories: number,
  doorCount: number,
  compositionPreset: RuntimeFacadeOverridePreset,
): number {
  if (candidateColumns.length === 0 || isBlankWallRole(wallRole)) {
    return 0;
  }

  const isHeroFrontage = isFrontageWallRole(wallRole) && isHeroBalconyPreset(compositionPreset);

  switch (wallRole) {
    case "main_frontage":
      return Math.min(
        candidateColumns.length,
        Math.max(
          isHeroFrontage ? 3 : 2,
          Math.ceil((Math.max(1, doorCount) * 4) / Math.max(1, stories)) + (isHeroFrontage ? 1 : 0),
        ),
      );
    case "spawn_frontage":
      if (isSpawnGateBrickBackdropPreset(compositionPreset)) {
        return Math.min(candidateColumns.length, Math.max(3, Math.min(4, stories + doorCount)));
      }
      return Math.min(
        candidateColumns.length,
        Math.max(
          isHeroFrontage ? 4 : 3,
          Math.ceil((Math.max(1, doorCount) * 5) / Math.max(1, stories)) + (isHeroFrontage ? 1 : 0),
        ),
      );
    case "main_side_window_only":
      return Math.min(candidateColumns.length, Math.max(2, Math.ceil(candidateColumns.length * 0.6)));
    case "spawn_side_window_rich":
      return Math.min(candidateColumns.length, Math.max(2, Math.ceil(candidateColumns.length * 0.7)));
    case "sidehall_outer_quiet":
      return Math.min(candidateColumns.length, Math.max(1, Math.ceil(candidateColumns.length * 0.34)));
    default:
      return 0;
  }
}

function resolveAccentWindowColumns(
  windowColumns: readonly number[],
  doorColumns: readonly number[],
  bayCount: number,
): number[] {
  if (windowColumns.length === 0) {
    return [];
  }

  const referencePoints = doorColumns.length > 0
    ? [...doorColumns]
    : [(bayCount - 1) * 0.5];

  return [...windowColumns]
    .sort((left, right) => {
      const leftDistance = Math.min(...referencePoints.map((reference) => Math.abs(left - reference)));
      const rightDistance = Math.min(...referencePoints.map((reference) => Math.abs(right - reference)));
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left - right;
    })
    .slice(0, Math.min(2, windowColumns.length))
    .sort((a, b) => a - b);
}

function resolveDefaultCompositionPreset(
  zone: RuntimeBlockoutZone | null,
  facadeFamily: FacadeFamily,
  balconyStyle: BalconyStyle,
): RuntimeFacadeOverridePreset {
  if (!zone) {
    return facadeFamily === "merchant" ? "merchant_rhythm" : "service_blank";
  }

  if (zone.type === "connector" || zone.type === "cut" || zone.type === "side_hall") {
    return "service_blank";
  }

  if (zone.type === "spawn_plaza") {
    return "residential_quiet";
  }

  if (facadeFamily === "service") {
    return "service_blank";
  }

  if (balconyStyle === "hero_cantilever") {
    return "merchant_hero_stack";
  }

  if (facadeFamily === "merchant") {
    return "merchant_rhythm";
  }

  return "residential_quiet";
}

function resolveCompositionPreset(
  zone: RuntimeBlockoutZone | null,
  face: FacadeFace,
  facadeFamily: FacadeFamily,
  balconyStyle: BalconyStyle,
  overrideMap: ReadonlyMap<string, RuntimeFacadeOverridePreset>,
): RuntimeFacadeOverridePreset {
  const override = zone ? overrideMap.get(`${zone.id}:${face}`) : null;
  if (override) {
    return override;
  }
  return resolveDefaultCompositionPreset(zone, facadeFamily, balconyStyle);
}

// ── Facade spec: decide all proportions ONCE per segment ───────────────────

function computeFacadeSpec(ctx: SegmentDecorContext): FacadeSpec | null {
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 1.4) return null;

  const stories = Math.max(1, Math.floor(ctx.wallHeightM / STORY_HEIGHT_M));
  const facadeLean = pickFacadeLean(ctx);
  const isBrickBackdrop = isSpawnGateBrickBackdropPreset(ctx.compositionPreset);

  const targetBayW =
    isBrickBackdrop
      ? usableLength >= 18 ? usableLength / 7 : usableLength / 5
      : isFrontageWallRole(ctx.wallRole)
      ? ctx.rng.range(2.2, 3.0)
      : ctx.wallRole === "sidehall_outer_quiet"
        ? ctx.rng.range(2.6, 3.4)
        : ctx.rng.range(1.9, 2.5);
  let bayCount = Math.max(1, Math.round(usableLength / targetBayW));
  if (isBrickBackdrop) {
    bayCount = usableLength >= 18 ? 7 : 5;
  }
  const doorCount = resolveDoorCountForWallRole(ctx.wallRole, usableLength, ctx.compositionPreset);

  if (doorCount === 1 && bayCount >= 2 && bayCount % 2 === 0) {
    bayCount = Math.max(1, bayCount - 1);
  }
  if (doorCount > 0 && bayCount < doorCount + 2) bayCount = doorCount + 2;
  const bayWidth = usableLength / bayCount;
  const isSpawnFacade = ctx.zone?.type === "spawn_plaza";

  const windowW = clamp(
    bayWidth
      * (
        isBrickBackdrop
          ? ctx.rng.range(0.36, 0.48)
          : isSpawnFacade
          ? ctx.rng.range(0.46, 0.58)
          : isFrontageWallRole(ctx.wallRole)
            ? ctx.rng.range(0.34, 0.46)
            : ctx.wallRole === "sidehall_outer_quiet"
              ? ctx.rng.range(0.26, 0.34)
              : ctx.rng.range(0.32, 0.44)
      ),
    0.52,
    bayWidth * (isBrickBackdrop ? 0.56 : isSpawnFacade ? 0.72 : 0.64),
  );
  const windowH =
    isBrickBackdrop
      ? ctx.rng.range(1.18, 1.38)
      : isSpawnFacade
      ? ctx.rng.range(1.28, 1.55)
      : isFrontageWallRole(ctx.wallRole)
        ? ctx.rng.range(1.0, 1.26)
        : ctx.wallRole === "sidehall_outer_quiet"
          ? ctx.rng.range(0.92, 1.16)
          : ctx.rng.range(1.08, 1.38);
  const standardizeGroundFloorDoorSize = usesStandardMainGroundFacadeDoorSize(ctx.wallRole);
  ctx.rng.range(0.85, 1.05); // consume — sill now computed from trim centering
  const authoredDoorW = clamp(
    bayWidth
      * (
        isBrickBackdrop
          ? ctx.rng.range(0.56, 0.68)
          : isFrontageWallRole(ctx.wallRole)
          ? ctx.rng.range(0.50, 0.64)
          : ctx.wallRole === "sidehall_outer_quiet"
            ? ctx.rng.range(0.40, 0.50)
            : ctx.rng.range(0.44, 0.58)
      ),
    0.75,
    bayWidth * 0.74,
  );
  const authoredDoorH =
    isBrickBackdrop
      ? ctx.rng.range(2.52, 2.78)
      : ctx.facadeFamily === "merchant"
      ? ctx.rng.range(2.45, 2.72)
      : ctx.facadeFamily === "service"
        ? ctx.rng.range(2.18, 2.38)
        : ctx.rng.range(2.32, 2.58);
  const doorW = standardizeGroundFloorDoorSize ? STANDARD_MAIN_GROUND_FACADE_DOOR_W_M : authoredDoorW;
  const doorH = standardizeGroundFloorDoorSize ? STANDARD_MAIN_GROUND_FACADE_DOOR_H_M : authoredDoorH;
  const recessDepth = isBrickBackdrop
    ? ctx.rng.range(0.22, 0.32)
    : isSpawnFacade ? ctx.rng.range(0.18, 0.28) : ctx.rng.range(0.10, 0.16);
  const frameThickness = isBrickBackdrop
    ? ctx.rng.range(0.18, 0.26)
    : isSpawnFacade ? ctx.rng.range(0.14, 0.22) : ctx.rng.range(0.11, 0.17);
  const frameDepth = clamp(
    isBrickBackdrop
      ? ctx.rng.range(0.22, 0.32)
      : isSpawnFacade ? ctx.rng.range(0.16, 0.26) : ctx.rng.range(0.09, 0.13),
    0.06,
    ctx.maxProtrusionM + (isBrickBackdrop ? 0.16 : isSpawnFacade ? 0.10 : 0.08),
  );
  const jambDepth = clamp(
    isBrickBackdrop
      ? ctx.rng.range(0.24, 0.34)
      : isSpawnFacade ? ctx.rng.range(0.18, 0.28) : ctx.rng.range(0.10, 0.16),
    0.06,
    ctx.maxProtrusionM + (isBrickBackdrop ? 0.18 : isSpawnFacade ? 0.12 : 0.10),
  );

  const columnRoles: ColumnRole[] = Array.from(
    { length: bayCount }, () => "blank" as ColumnRole,
  );
  let doorColumns: number[] = [];

  if (doorCount > 0) {
    doorColumns = assignDoorColumns(bayCount, doorCount);
    for (const col of doorColumns) {
      columnRoles[col] = "door";
    }
  }

  const blockedWindowColumns = new Set<number>(doorColumns);
  const candidateWindowColumns = buildWindowCandidateColumns(bayCount, blockedWindowColumns);
  const targetWindowColumns = resolveWindowColumnTarget(
    ctx.wallRole,
    candidateWindowColumns,
    stories,
    doorColumns.length,
    ctx.compositionPreset,
  );
  const selectedWindowColumns = pickBalancedColumns(candidateWindowColumns, bayCount, targetWindowColumns);

  for (const col of selectedWindowColumns) {
    columnRoles[col] = "window";
  }

  const accentWindowColumns = resolveAccentWindowColumns(selectedWindowColumns, doorColumns, bayCount);

  return {
    bayCount, bayWidth, usableLength, stories, columnRoles,
    wallRole: ctx.wallRole,
    doorColumns,
    compositionPreset: ctx.compositionPreset,
    accentWindowColumns,
    windowW, windowH, doorW, doorH,
    recessDepth, frameThickness, frameDepth, jambDepth,
    heroFacadeState: null,
    facadeLean,
    isSpawnHeroFacade: isSpawnHeroFacade(ctx),
    facadeFamily: ctx.facadeFamily,
    trimTier: ctx.trimTier,
    balconyStyle: ctx.balconyStyle,
    materialSlots: ctx.materialSlots,
  };
}

// ── Column center position from uniform grid ───────────────────────────────

function columnCenterS(spec: FacadeSpec, columnIndex: number): number {
  return -spec.usableLength * 0.5 + spec.bayWidth * (columnIndex + 0.5);
}

function resolveDoorCentersS(
  spec: FacadeSpec,
  authoredDoorLayout: RuntimeDoorLayoutOverride | null,
): number[] {
  if (authoredDoorLayout) {
    return authoredDoorLayout.doors.map((door: RuntimeAuthoredDoor) => door.centerS);
  }
  return spec.doorColumns.map((doorCol) => columnCenterS(spec, doorCol));
}

// ── Window placement (uniform dimensions from spec) ────────────────────────

function resolveWindowTreatment(
  spec: FacadeSpec,
  columnIndex: number,
  story: number,
): WindowTreatment {
  const isAccent = spec.accentWindowColumns.includes(columnIndex);
  const leanBias = spec.facadeLean > 0 ? 0 : 1;

  if (spec.wallRole === "sidehall_outer_quiet") {
    return story === spec.stories - 1 ? "glass" : "dark";
  }

  if (spec.wallRole === "main_side_window_only") {
    return ((story + columnIndex + leanBias) % 2 === 0) ? "glass" : "dark";
  }

  if (spec.wallRole === "spawn_side_window_rich") {
    if (story === 0 && isAccent) {
      return "shuttered";
    }
    // Ground floor non-accent: mix of shuttered and glass instead of all-dark
    if (story === 0) {
      return ((columnIndex + leanBias) % 3 === 0) ? "shuttered" : "glass";
    }
    return "glass";
  }

  switch (spec.compositionPreset) {
    case "service_blank":
      if (spec.wallRole === "main_frontage" || spec.wallRole === "spawn_frontage") {
        return isAccent || story === spec.stories - 1 ? "glass" : "dark";
      }
      return "dark";
    case "merchant_rhythm":
      if (isAccent && story <= 1) {
        return "shuttered";
      }
      return ((columnIndex + story + leanBias) % 2 === 0) ? "glass" : "dark";
    case "merchant_hero_stack":
      if (isAccent && story === 0) {
        return "shuttered";
      }
      return story === spec.stories - 1 ? "glass" : "dark";
    case "residential_quiet":
      return ((story + columnIndex + leanBias) % 3 === 0) ? "glass" : "dark";
    case "residential_balcony_stack":
      return story === spec.stories - 1 ? "glass" : "dark";
    case "spawn_gate_brick_backdrop":
      if (story === spec.stories - 1) return "glass";
      if (isAccent) return "shuttered";
      return columnIndex === Math.floor(spec.bayCount * 0.5) ? "dark" : "glass";
    case "spawn_courtyard_landmark": {
      // Top floor: always glass
      if (story === spec.stories - 1) return "glass";
      // Second floor: all glass (showcase floor behind balcony)
      if (story === 1) return "glass";
      // Ground floor accent columns: shuttered (warm, lived-in look)
      if (story === 0 && isAccent) return "shuttered";
      // Ground floor non-accent: alternate glass/shuttered for asymmetry
      return ((columnIndex + leanBias) % 2 === 0) ? "glass" : "shuttered";
    }
    default:
      return "glass";
  }
}

function resolveStainedGlassMaterialId(glassStyle: WindowGlassStyle): string {
  return glassStyle === "stained_glass_bright"
    ? STAINED_GLASS_BRIGHT_MATERIAL_ID
    : STAINED_GLASS_DIM_MATERIAL_ID;
}

function requireWindowModule(ctx: SegmentDecorContext, moduleId: string): RuntimeWindowModule {
  const module = ctx.windowModules.get(moduleId);
  if (!module) {
    throw new Error(`[wall-detail] window module '${moduleId}' not found`);
  }
  return module;
}

function requireDoorModule(ctx: SegmentDecorContext, moduleId: string): RuntimeDoorModule {
  const module = ctx.doorModules.get(moduleId);
  if (!module) {
    throw new Error(`[wall-detail] door module '${moduleId}' not found`);
  }
  return module;
}

function requireHeroBayModule(ctx: SegmentDecorContext, moduleId: string): RuntimeHeroBayModule {
  const module = ctx.heroBayModules.get(moduleId);
  if (!module) {
    throw new Error(`[wall-detail] hero bay module '${moduleId}' not found`);
  }
  return module;
}

function isSpawnBStandardWindowModule(module: RuntimeWindowModule): boolean {
  return module.id === SPAWN_B_STANDARD_WINDOW_MODULE_ID;
}

function isSpawnBStandardDoorModule(module: RuntimeDoorModule): boolean {
  return module.id === SPAWN_B_STANDARD_DOOR_MODULE_ID;
}

function isSpawnBCenterHeroModule(module: RuntimeHeroBayModule): boolean {
  return module.id === SPAWN_B_CENTER_HERO_MODULE_ID;
}

function computeEqualMarginCenters(
  leftBoundary: number,
  rightBoundary: number,
  widthM: number,
  count: number,
): { gapM: number; centersS: number[] } {
  const clearWidth = rightBoundary - leftBoundary;
  const gapM = (clearWidth - count * widthM) / (count + 1);
  if (!(gapM > 0)) {
    throw new Error(`[wall-detail] equal-margin layout has no positive gap (clear=${clearWidth.toFixed(3)} width=${widthM.toFixed(3)} count=${count})`);
  }
  return {
    gapM,
    centersS: Array.from({ length: count }, (_, index) => (
      leftBoundary + gapM + widthM * 0.5 + index * (widthM + gapM)
    )),
  };
}

function mirrorCentersAcrossZero(centersS: readonly number[]): number[] {
  return [...centersS].map((centerS) => -centerS).reverse();
}

function computeWindowDoorWindowCenters(
  leftBoundary: number,
  rightBoundary: number,
  windowWidthM: number,
  doorWidthM: number,
): { gapM: number; windowCentersS: [number, number]; doorCenterS: number } {
  const clearWidth = rightBoundary - leftBoundary;
  const gapM = (clearWidth - (2 * windowWidthM + doorWidthM)) / 4;
  if (!(gapM > 0)) {
    throw new Error(`[wall-detail] window-door-window layout has no positive gap (clear=${clearWidth.toFixed(3)} window=${windowWidthM.toFixed(3)} door=${doorWidthM.toFixed(3)})`);
  }

  const leftWindowCenterS = leftBoundary + gapM + windowWidthM * 0.5;
  const doorCenterS = leftWindowCenterS + windowWidthM * 0.5 + gapM + doorWidthM * 0.5;
  const rightWindowCenterS = doorCenterS + doorWidthM * 0.5 + gapM + windowWidthM * 0.5;

  return {
    gapM,
    windowCentersS: [leftWindowCenterS, rightWindowCenterS],
    doorCenterS,
  };
}

function placeModuleWindow(
  ctx: SegmentDecorContext,
  centerS: number,
  sillY: number,
  module: RuntimeWindowModule,
): void {
  const isSpawnBWindow = isSpawnBStandardWindowModule(module);
  const frameMetrics = isSpawnBWindow
    ? resolveSpawnWindowPointedArchFrameFromAperture(module.apertureWidthM, module.apertureHeightM)
    : resolvePointedArchFrameFromAperture(module.apertureWidthM, module.apertureHeightM);
  if (
    Math.abs(frameMetrics.frameWidth - module.frameWidthM) > 0.025
    || Math.abs(frameMetrics.frameHeight - module.frameHeightM) > 0.025
  ) {
    throw new Error(
      `[wall-detail] window module '${module.id}' outer bounds drift from pointed-arch profile (expected ${frameMetrics.frameWidth.toFixed(3)}x${frameMetrics.frameHeight.toFixed(3)}, got ${module.frameWidthM.toFixed(3)}x${module.frameHeightM.toFixed(3)})`,
    );
  }

  const frameCenterY = sillY + frameMetrics.frameCenterYOffsetFromSill;
  const apertureCenterY = frameCenterY + frameMetrics.apertureCenterYOffsetFromFrameCenter;
  const voidMeshId = isSpawnBWindow ? "spawn_window_pointed_arch_void" : "window_pointed_arch_void";
  const glassMeshId = isSpawnBWindow ? "spawn_window_pointed_arch_glass" : "window_pointed_arch_glass";
  const frameMeshId = isSpawnBWindow ? "spawn_window_pointed_arch_frame" : "window_pointed_arch_frame";

  pushBox(ctx.instances, ctx.maxInstances, voidMeshId, null,
    ctx.frame, centerS, apertureCenterY, module.voidInsetM,
    0.02, module.apertureHeightM, module.apertureWidthM);

  pushBox(ctx.instances, ctx.maxInstances, glassMeshId, null,
    ctx.frame, centerS, apertureCenterY, module.glassInsetM,
    WINDOW_GLASS_THICKNESS_M, module.apertureHeightM, module.apertureWidthM);
  tagTrim(ctx.instances, null, resolveStainedGlassMaterialId(module.glassStyle));

  pushBox(ctx.instances, ctx.maxInstances, frameMeshId, ctx.wallMaterialId,
    ctx.frame, centerS, frameCenterY, module.frameDepthM * 0.5,
    module.frameDepthM, module.frameHeightM, module.frameWidthM);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY - module.sillHeightM * 0.5, module.sillDepthM * 0.5,
    module.sillDepthM, module.sillHeightM, module.sillWidthM);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY - module.apronOffsetBelowSillM, module.apronDepthM * 0.5,
    module.apronDepthM, module.apronHeightM, module.apronWidthM);
  tagTrim(ctx.instances, ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId);
}

function placeSpawnBSideDoorCrownAccent(
  ctx: SegmentDecorContext,
  centerS: number,
  module: RuntimeDoorModule,
): void {
  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const crownBaseHeight = Math.max(0.08, module.trimThicknessM * 0.34);
  const crownBaseDepth = Math.max(0.14, module.surroundDepthM * 0.72);
  const crownBaseWidth = module.coverWidthM + module.trimThicknessM * 1.55;
  const coverTopY = module.doorHeightM * 0.5 + module.coverCenterYOffsetM + module.coverHeightM * 0.5;
  const crownBaseY = coverTopY + crownBaseHeight * 0.6 + 0.09;

  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, crownBaseY, crownBaseDepth * 0.5,
    crownBaseDepth, crownBaseHeight, crownBaseWidth);
  tagTrim(ctx.instances, trimMaterialId);

  const crownCapHeight = Math.max(0.06, crownBaseHeight * 0.72);
  const crownCapDepth = Math.max(0.12, crownBaseDepth * 0.72);
  const crownCapWidth = crownBaseWidth - module.trimThicknessM * 0.45;
  const crownCapY = crownBaseY + crownBaseHeight * 0.62;
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, crownCapY, crownCapDepth * 0.5,
    crownCapDepth, crownCapHeight, crownCapWidth);
  tagTrim(ctx.instances, trimMaterialId);

  const keystoneHeight = Math.max(0.12, crownBaseHeight * 1.55);
  const keystoneWidth = Math.max(0.08, module.trimThicknessM * 0.62);
  const keystoneDepth = Math.max(0.1, crownBaseDepth * 0.68);
  const keystoneY = crownBaseY - keystoneHeight * 0.1;
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
    ctx.frame, centerS, keystoneY, keystoneDepth * 0.5,
    keystoneDepth, keystoneHeight, keystoneWidth);
  tagTrim(ctx.instances, trimMaterialId);
}

type PlaceModuleDoorOptions = {
  addSpawnSideCrownAccent?: boolean;
};

function placeModuleDoor(
  ctx: SegmentDecorContext,
  centerS: number,
  module: RuntimeDoorModule,
  options: PlaceModuleDoorOptions = {},
): void {
  if (module.coverShape === "arched") {
    pushArchedDoorVoid(
      ctx,
      centerS,
      module.doorHeightM * 0.5 + module.coverCenterYOffsetM,
      module.coverHeightM,
      module.voidInsetM,
      module.voidDepthM,
      module.coverWidthM,
    );
  } else {
    pushDoorCoverVoid(
      ctx,
      centerS,
      module.doorHeightM * 0.5 + module.coverCenterYOffsetM,
      module.voidInsetM,
      module.voidDepthM,
      module.coverWidthM,
      module.coverHeightM,
      module.coverShape,
    );
  }

  const wallSurfacePos = toWorld(ctx.frame, centerS, module.doorHeightM * 0.5, 0);
  ctx.doorModelPlacements.push({
    wallSurfacePos,
    doorW: module.doorWidthM,
    doorH: module.doorHeightM,
    yawRad: ctx.frame.yawRad,
    outwardX: -ctx.frame.inwardX,
    outwardZ: -ctx.frame.inwardZ,
    modelId: module.modelId,
    trimMaterialId: ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId,
    trimThicknessM: module.trimThicknessM,
    surroundDepthM: module.surroundDepthM,
    surroundCenterOffsetM: -module.surroundDepthM * 0.5,
    revealWidthM: module.revealWidthM,
    coverShape: module.coverShape,
    coverWidthM: module.coverWidthM,
    coverHeightM: module.coverHeightM,
    coverCenterYOffsetM: module.coverCenterYOffsetM,
  });

  if (options.addSpawnSideCrownAccent && isSpawnBStandardDoorModule(module)) {
    placeSpawnBSideDoorCrownAccent(ctx, centerS, module);
  }
}

function computeSymmetricOffsets(count: number, spreadM: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) => (
    -spreadM * 0.5 + (spreadM * index) / (count - 1)
  ));
}

function placeSpawnBCenterHeroModule(
  ctx: SegmentDecorContext,
  centerS: number,
  module: RuntimeHeroBayModule,
): void {
  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const frameMetrics = resolveSpawnHeroPointedArchFrameFromAperture(module.openingWidthM, module.openingHeightM);
  if (
    Math.abs(frameMetrics.frameWidth - module.surroundWidthM) > 0.03
    || Math.abs(frameMetrics.frameHeight - module.surroundHeightM) > 0.03
  ) {
    throw new Error(
      `[wall-detail] hero bay module '${module.id}' outer bounds drift from Spawn B pointed-arch profile (expected ${frameMetrics.frameWidth.toFixed(3)}x${frameMetrics.frameHeight.toFixed(3)}, got ${module.surroundWidthM.toFixed(3)}x${module.surroundHeightM.toFixed(3)})`,
    );
  }

  const surroundCenterY = module.surroundBottomY + module.surroundHeightM * 0.5;
  const openingCenterY = module.openingSillY + module.openingHeightM * 0.5;
  const archProjection = Math.max(module.frameDepthM, module.pilasterDepthM * 0.82);
  pushBox(ctx.instances, ctx.maxInstances, "spawn_hero_window_pointed_arch_frame", ctx.wallMaterialId,
    ctx.frame, centerS, surroundCenterY, archProjection * 0.5,
    archProjection, module.surroundHeightM, module.surroundWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "spawn_hero_window_pointed_arch_void", null,
    ctx.frame, centerS, openingCenterY, module.voidInsetM,
    0.026, module.openingHeightM, module.openingWidthM);

  pushBox(ctx.instances, ctx.maxInstances, "spawn_hero_window_pointed_arch_glass", null,
    ctx.frame, centerS, openingCenterY, module.glassInsetM,
    WINDOW_GLASS_THICKNESS_M, module.openingHeightM + 0.02, module.openingWidthM + 0.02);
  tagTrim(ctx.instances, null, STAINED_GLASS_HERO_MATERIAL_ID);

  const pilasterOffsetS = module.surroundWidthM * 0.5 - module.pilasterWidthM * 0.28;
  const pilasterCenterY = module.pilasterBottomY + module.pilasterHeightM * 0.5;
  const pilasterBaseHeight = Math.max(0.2, module.entablatureThicknessM * 0.58);
  const pilasterBaseWidth = module.pilasterWidthM * 1.18;
  const pilasterBaseDepth = Math.max(module.pilasterDepthM, module.entablatureDepthM * 0.76);
  const pilasterBaseY =
    module.entablatureCapCenterY + module.entablatureCapThicknessM * 0.46 + pilasterBaseHeight * 0.5;
  const pedimentBaseBandHeight = Math.max(0.16, module.pedimentLayerHeightM * 0.56);
  const pilasterCapHeight = Math.max(0.24, module.pedimentLayerHeightM * 0.84);
  const pilasterCapWidth = module.pilasterWidthM * 1.22;
  const pilasterCapDepth = Math.max(module.pilasterDepthM, module.pedimentDepthM * 0.92);
  const pilasterCapY = module.pedimentBottomY + pedimentBaseBandHeight * 0.44 + pilasterCapHeight * 0.5;

  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "pilaster", ctx.wallMaterialId,
      ctx.frame, centerS + side * pilasterOffsetS, pilasterCenterY, module.pilasterDepthM * 0.5,
      module.pilasterDepthM, module.pilasterHeightM, module.pilasterWidthM);
    tagTrim(ctx.instances, trimMaterialId);

    pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
      ctx.frame, centerS + side * pilasterOffsetS, pilasterBaseY, pilasterBaseDepth * 0.5,
      pilasterBaseDepth, pilasterBaseHeight, pilasterBaseWidth);
    tagTrim(ctx.instances, trimMaterialId);

    pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
      ctx.frame, centerS + side * pilasterOffsetS, pilasterCapY, pilasterCapDepth * 0.5,
      pilasterCapDepth, pilasterCapHeight, pilasterCapWidth);
    tagTrim(ctx.instances, trimMaterialId);
  }

  const entablatureUndersideHeight = Math.max(0.14, module.entablatureThicknessM * 0.46);
  const entablatureUndersideDepth = Math.max(0.28, module.entablatureDepthM * 0.8);
  const entablatureUndersideWidth =
    Math.max(module.surroundWidthM + module.pilasterWidthM * 0.82, module.entablatureWidthM - module.pilasterWidthM * 0.24);
  const entablatureUndersideY =
    module.entablatureCenterY - module.entablatureThicknessM * 0.5 - entablatureUndersideHeight * 0.42;
  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, centerS, entablatureUndersideY, entablatureUndersideDepth * 0.5,
    entablatureUndersideDepth, entablatureUndersideHeight, entablatureUndersideWidth);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, centerS, module.entablatureCenterY, module.entablatureDepthM * 0.5,
    module.entablatureDepthM, module.entablatureThicknessM, module.entablatureWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, module.entablatureCapCenterY, module.entablatureCapDepthM * 0.5,
    module.entablatureCapDepthM, module.entablatureCapThicknessM, module.entablatureCapWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  const entablatureLipHeight = Math.max(0.08, module.entablatureCapThicknessM * 0.92);
  const entablatureLipDepth = Math.max(0.18, module.entablatureCapDepthM * 0.9);
  const entablatureLipWidth = module.entablatureCapWidthM + module.pilasterWidthM * 0.32;
  const entablatureLipY = module.entablatureCapCenterY + module.entablatureCapThicknessM * 0.5 + entablatureLipHeight * 0.42;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, entablatureLipY, entablatureLipDepth * 0.5,
    entablatureLipDepth, entablatureLipHeight, entablatureLipWidth);
  tagTrim(ctx.instances, trimMaterialId);

  const corbelInset = Math.max(module.corbelDepthM * 0.6, module.entablatureDepthM * 0.72);
  for (const offsetS of computeSymmetricOffsets(module.corbelCount, module.corbelSpreadM)) {
    pushBox(ctx.instances, ctx.maxInstances, "spawn_hero_corbel", ctx.wallMaterialId,
      ctx.frame, centerS + offsetS, module.corbelCenterY, corbelInset,
      module.corbelDepthM, module.corbelHeightM, module.corbelWidthM);
    tagTrim(ctx.instances, trimMaterialId);
  }

  const pedimentBaseBandDepth = Math.max(0.16, module.pedimentDepthM * 0.84);
  const pedimentBaseBandWidth = module.pedimentBaseWidthM;
  const pedimentBaseBandY = module.pedimentBottomY + pedimentBaseBandHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, pedimentBaseBandY, pedimentBaseBandDepth * 0.5,
    pedimentBaseBandDepth, pedimentBaseBandHeight, pedimentBaseBandWidth);
  tagTrim(ctx.instances, trimMaterialId);

  const pedimentTransitionHeight = Math.max(0.12, module.pedimentLayerHeightM * 0.3);
  const pedimentTransitionDepth = Math.max(0.18, module.pedimentDepthM * 0.72);
  const pedimentTransitionWidth = module.surroundWidthM + module.pilasterWidthM * 0.96;
  const pedimentTransitionY = module.pedimentBottomY - pedimentTransitionHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, pedimentTransitionY, pedimentTransitionDepth * 0.5,
    pedimentTransitionDepth, pedimentTransitionHeight, pedimentTransitionWidth);
  tagTrim(ctx.instances, trimMaterialId);

  const shoulderWidth = Math.max(module.pilasterWidthM * 1.24, (module.pedimentBaseWidthM - module.surroundWidthM) * 0.62);
  const shoulderHeight = Math.max(0.24, module.pedimentLayerHeightM * 0.84);
  const shoulderDepth = Math.max(0.22, module.pedimentDepthM * 0.92);
  const shoulderOffsetS = module.surroundWidthM * 0.5 + shoulderWidth * 0.34;
  const shoulderY = module.pedimentBottomY + shoulderHeight * 0.44;
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
      ctx.frame, centerS + side * shoulderOffsetS, shoulderY, shoulderDepth * 0.5,
      shoulderDepth, shoulderHeight, shoulderWidth);
    tagTrim(ctx.instances, trimMaterialId);
  }

  const pedimentHeight = module.pedimentLayerHeightM * module.pedimentLayerCount;
  const pedimentWidth = Math.min(
    module.pedimentBaseWidthM,
    Math.max(module.surroundWidthM + module.pilasterWidthM * 1.08, module.pedimentBaseWidthM - shoulderWidth * 0.12),
  );
  pushBox(ctx.instances, ctx.maxInstances, "spawn_hero_pediment", ctx.wallMaterialId,
    ctx.frame, centerS, module.pedimentBottomY + pedimentHeight * 0.36, module.pedimentDepthM * 0.48,
    module.pedimentDepthM, pedimentHeight, pedimentWidth);
  tagTrim(ctx.instances, trimMaterialId);
}

function placeHeroBayModule(
  ctx: SegmentDecorContext,
  centerS: number,
  module: RuntimeHeroBayModule,
): void {
  if (isSpawnBCenterHeroModule(module)) {
    placeSpawnBCenterHeroModule(ctx, centerS, module);
    return;
  }

  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const surroundCenterY = module.surroundBottomY + module.surroundHeightM * 0.5;
  const openingCenterY = module.openingSillY + module.openingHeightM * 0.5;

  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_frame", ctx.wallMaterialId,
    ctx.frame, centerS, surroundCenterY, module.frameDepthM * 0.5,
    module.frameDepthM, module.surroundHeightM, module.surroundWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_void", null,
    ctx.frame, centerS, openingCenterY, module.voidInsetM,
    0.024, module.openingHeightM, module.openingWidthM);

  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_glass", null,
    ctx.frame, centerS, openingCenterY, module.glassInsetM,
    WINDOW_GLASS_THICKNESS_M, module.openingHeightM, module.openingWidthM);
  tagTrim(ctx.instances, null, resolveStainedGlassMaterialId(module.glassStyle));

  const pilasterOffsetS = module.surroundWidthM * 0.5 - module.pilasterWidthM * 0.5;
  const pilasterCenterY = module.pilasterBottomY + module.pilasterHeightM * 0.5;
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "pilaster", ctx.wallMaterialId,
      ctx.frame, centerS + side * pilasterOffsetS, pilasterCenterY, module.pilasterDepthM * 0.5,
      module.pilasterDepthM, module.pilasterHeightM, module.pilasterWidthM);
    tagTrim(ctx.instances, trimMaterialId);
  }

  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, centerS, module.entablatureCenterY, module.entablatureDepthM * 0.5,
    module.entablatureDepthM, module.entablatureThicknessM, module.entablatureWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, centerS, module.entablatureCapCenterY, module.entablatureCapDepthM * 0.5,
    module.entablatureCapDepthM, module.entablatureCapThicknessM, module.entablatureCapWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  for (const offsetS of computeSymmetricOffsets(module.corbelCount, module.corbelSpreadM)) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_bracket", ctx.wallMaterialId,
      ctx.frame, centerS + offsetS, module.corbelCenterY,
      Math.max(module.corbelDepthM * 0.5, module.entablatureDepthM * 0.6),
      module.corbelDepthM, module.corbelHeightM, module.corbelWidthM);
    tagTrim(ctx.instances, trimMaterialId);
  }

  for (let layerIndex = 0; layerIndex < module.pedimentLayerCount; layerIndex += 1) {
    const layerWidth = module.pedimentBaseWidthM - module.pedimentWidthStepM * layerIndex;
    if (layerWidth <= 0.05) {
      throw new Error(`[wall-detail] hero bay module '${module.id}' pediment width became non-positive at layer ${layerIndex}`);
    }
    const layerDepth = Math.max(0.08, module.pedimentDepthM - layerIndex * 0.03);
    pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
      ctx.frame,
      centerS,
      module.pedimentBottomY + module.pedimentLayerHeightM * (layerIndex + 0.5),
      layerDepth * 0.5,
      layerDepth,
      module.pedimentLayerHeightM,
      layerWidth);
    tagTrim(ctx.instances, trimMaterialId);
  }
}

function placeCompositionLayout(
  ctx: SegmentDecorContext,
  layout: RuntimeCompositionLayoutOverride,
): void {
  const windowModule = requireWindowModule(ctx, layout.windowModuleId);
  const doorModule = requireDoorModule(ctx, layout.doorModuleId);
  const leftBoundary = -ctx.frame.lengthM * 0.5 + SEGMENT_EDGE_MARGIN_M;
  const rightBoundary = ctx.frame.lengthM * 0.5 - SEGMENT_EDGE_MARGIN_M;

  switch (layout.kind) {
    case "spawn_b_front_courtyard": {
      if (!layout.heroBayModuleId) {
        throw new Error("[wall-detail] Spawn B front composition requires a hero bay module");
      }
      const heroBayModule = requireHeroBayModule(ctx, layout.heroBayModuleId);
      const upperLeft = computeEqualMarginCenters(
        leftBoundary,
        -heroBayModule.surroundWidthM * 0.5,
        windowModule.frameWidthM,
        3,
      );
      const upperRightCenters = mirrorCentersAcrossZero(upperLeft.centersS);
      const lowerLeft = computeEqualMarginCenters(
        leftBoundary,
        -doorModule.coverWidthM * 0.5,
        windowModule.frameWidthM,
        3,
      );
      const lowerRightCenters = mirrorCentersAcrossZero(lowerLeft.centersS);

      for (const center of upperLeft.centersS) {
        placeModuleWindow(ctx, center, layout.upperWindowSillY, windowModule);
      }
      for (const center of upperRightCenters) {
        placeModuleWindow(ctx, center, layout.upperWindowSillY, windowModule);
      }
      for (const center of lowerLeft.centersS) {
        placeModuleWindow(ctx, center, layout.lowerWindowSillY, windowModule);
      }
      for (const center of lowerRightCenters) {
        placeModuleWindow(ctx, center, layout.lowerWindowSillY, windowModule);
      }
      placeModuleDoor(ctx, 0, doorModule);
      placeHeroBayModule(ctx, 0, heroBayModule);
      emitPlinthStrip(ctx, [{ centerS: 0, halfW: doorModule.coverWidthM * 0.5 }]);
      return;
    }
    case "spawn_b_side_courtyard": {
      const upperCenters = computeEqualMarginCenters(
        leftBoundary,
        rightBoundary,
        windowModule.frameWidthM,
        3,
      );
      const lowerCenters = computeWindowDoorWindowCenters(
        leftBoundary,
        rightBoundary,
        windowModule.frameWidthM,
        doorModule.coverWidthM,
      );
      if (Math.abs(lowerCenters.doorCenterS) > 1e-6) {
        throw new Error(`[wall-detail] side composition door center drifted off centerline by ${lowerCenters.doorCenterS}`);
      }

      for (const center of upperCenters.centersS) {
        placeModuleWindow(ctx, center, layout.upperWindowSillY, windowModule);
      }
      for (const center of lowerCenters.windowCentersS) {
        placeModuleWindow(ctx, center, layout.lowerWindowSillY, windowModule);
      }
      placeModuleDoor(ctx, lowerCenters.doorCenterS, doorModule, { addSpawnSideCrownAccent: true });
      emitPlinthStrip(ctx, [{ centerS: lowerCenters.doorCenterS, halfW: doorModule.coverWidthM * 0.5 }]);
      return;
    }
    default: {
      const exhaustive: never = layout.kind;
      throw new Error(`[wall-detail] unsupported composition layout '${String(exhaustive)}'`);
    }
  }
}

function placeAuthoredPointedArchWindow(
  ctx: SegmentDecorContext,
  window: RuntimeAuthoredWindow,
  spec: FacadeSpec,
): void {
  const trimDepthScale = isSpawnBShellCleanupSurface(ctx) ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;
  const frameThickness = spec.frameThickness * 0.74;
  const frameMetrics = resolvePointedArchFrameFromAperture(window.width, window.height);
  const frameCenterY = window.sillY + frameMetrics.frameCenterYOffsetFromSill;
  const panelCenterY = frameCenterY + frameMetrics.apertureCenterYOffsetFromFrameCenter;
  const voidInset = Math.max(0.006, spec.frameDepth * 0.08 * trimDepthScale);
  const glassInset = Math.max(voidInset + 0.012, spec.frameDepth * 0.18 * trimDepthScale);
  const frameProjection = spec.frameDepth * 1.28 * trimDepthScale;
  const sillDepth = spec.frameDepth * 1.64 * trimDepthScale;
  const sillHeight = frameThickness * 0.82;
  const seamOverlap = Math.min(0.02, frameThickness * 0.18);
  const voidOverlap = seamOverlap * 0.5;

  pushBox(ctx.instances, ctx.maxInstances, "window_pointed_arch_void", null,
    ctx.frame, window.centerS, panelCenterY, voidInset,
    0.02, window.height + voidOverlap * 2, window.width + voidOverlap * 2);

  pushBox(ctx.instances, ctx.maxInstances, "window_pointed_arch_glass", null,
    ctx.frame, window.centerS, panelCenterY, glassInset,
    WINDOW_GLASS_THICKNESS_M, window.height + seamOverlap * 2, window.width + seamOverlap * 2);
  tagTrim(ctx.instances, null, resolveStainedGlassMaterialId(window.glassStyle));

  pushBox(ctx.instances, ctx.maxInstances, "window_pointed_arch_frame", ctx.wallMaterialId,
    ctx.frame, window.centerS, frameCenterY, frameProjection * 0.5,
    frameProjection, frameMetrics.frameHeight, frameMetrics.frameWidth);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, window.centerS, window.sillY - sillHeight * 0.42,
    sillDepth * 0.5,
    sillDepth, sillHeight, window.width + frameThickness * 1.7);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, window.centerS, window.sillY - frameThickness * 0.9,
    spec.frameDepth * 0.84 * trimDepthScale,
    spec.frameDepth * 1.08 * trimDepthScale, frameThickness * 0.34, window.width + frameThickness * 1.15);
  tagTrim(ctx.instances, ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId);
}

function placeAuthoredWindow(
  ctx: SegmentDecorContext,
  window: RuntimeAuthoredWindow,
  spec: FacadeSpec,
): void {
  if (window.headShape === "pointed_arch") {
    placeAuthoredPointedArchWindow(ctx, window, spec);
    return;
  }

  placeWindowOpening(ctx, window.centerS, window.sillY, {
    ...spec,
    windowW: window.width,
    windowH: window.height,
  }, "glass");
}

function placeWindowOpening(
  ctx: SegmentDecorContext,
  centerS: number,
  sillY: number,
  spec: FacadeSpec,
  treatment: WindowTreatment,
): void {
  const centerY = sillY + spec.windowH * 0.5;
  const isBrickBackdrop = isSpawnGateBrickBackdropPreset(spec.compositionPreset);
  const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);
  const revealW = spec.windowW * (isBrickBackdrop ? 0.8 : 0.84);
  const revealH = spec.windowH * (isBrickBackdrop ? 0.8 : 0.82);
  const shutterLeafW = revealW * 0.46;
  const isSpawn = ctx.zone?.type === "spawn_plaza";
  const trimDepthScale = isSpawnBCleanup ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;

  // 1. Dark backing panel — spawn: recessed INTO wall; non-spawn: flush.
  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, centerY, isSpawn ? -spec.recessDepth * 0.5 : 0.008,
    0.016, revealH, revealW);

  if (treatment === "glass") {
    pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
      ctx.frame, centerS, centerY, isSpawn ? -spec.recessDepth * 0.3 : 0.015,
      WINDOW_GLASS_THICKNESS_M, revealH, revealW);

    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", null,
      ctx.frame, centerS, centerY, isSpawn ? -spec.recessDepth * (isBrickBackdrop ? 0.35 : 0.25) : 0.018,
      0.035, 0.05, revealW * 0.94);

    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", null,
      ctx.frame, centerS, centerY, isSpawn ? -spec.recessDepth * (isBrickBackdrop ? 0.35 : 0.25) : 0.018,
      0.035, revealH * 0.94, 0.05);
  } else if (treatment === "shuttered") {
    for (const side of [-1, 1] as const) {
      pushBox(ctx.instances, ctx.maxInstances, "window_shutter", null,
        ctx.frame, centerS + side * shutterLeafW * 0.52, centerY, 0.02,
        0.04, revealH * 0.98, shutterLeafW);
    }
  }

  // 2. Frame jambs — spawn: deep for real depth reads; non-spawn: original shallower.
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (revealW + spec.frameThickness) * 0.5, centerY,
      spec.frameDepth * (isBrickBackdrop ? 1.08 : isSpawn ? 0.9 : 0.6) * trimDepthScale,
      spec.frameDepth * (isBrickBackdrop ? 1.22 : 1.05) * trimDepthScale, revealH + spec.frameThickness * (isBrickBackdrop ? 1.6 : 1.35), spec.frameThickness);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
  }

  // 3. Sill shelf — spawn: deeper projection; non-spawn: original depth.
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY - spec.frameThickness * 0.5,
    spec.frameDepth * (isBrickBackdrop ? 1.38 : isSpawn ? 1.2 : 0.8) * trimDepthScale,
    spec.frameDepth * (isBrickBackdrop ? 1.95 : 1.7) * trimDepthScale, spec.frameThickness * (isBrickBackdrop ? 1.28 : 1.15), revealW + spec.frameThickness * (isBrickBackdrop ? 2.8 : 2.3));
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  // 4. Lintel — spawn: deeper; non-spawn: original shallower projection.
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY + revealH + spec.frameThickness * 0.55,
    spec.frameDepth * (isSpawnBCleanup ? 1.38 : isBrickBackdrop ? 1.05 : isSpawn ? 0.85 : 0.55) * trimDepthScale,
    spec.frameDepth * (isSpawnBCleanup ? 1.95 : isBrickBackdrop ? 1.3 : 1.1) * trimDepthScale,
    spec.frameThickness * (isSpawnBCleanup ? 1.28 : isBrickBackdrop ? 1.42 : 1.3),
    revealW + spec.frameThickness * (isSpawnBCleanup ? 2.8 : isBrickBackdrop ? 2.6 : 2.1));
  tagTrim(
    ctx.instances,
    isSpawnBCleanup ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : (ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId),
  );
}

// ── Arched door placement (uniform dimensions from spec) ───────────────────

function placeArchedDoor(
  ctx: SegmentDecorContext,
  centerS: number,
  spec: FacadeSpec,
  doorStyleSource: RuntimeDoorStyleSource | null = null,
): void {
  const isSpawn = ctx.zone?.type === "spawn_plaza";
  const isBrickBackdrop = isSpawnGateBrickBackdropPreset(spec.compositionPreset);
  const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);
  const trimDepthScale = isSpawnBCleanup ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;
  const styleZoneId = doorStyleSource?.zoneId ?? ctx.zone?.id ?? null;
  const styleFacadeFace = doorStyleSource?.face ?? ctx.facadeFace;
  const doorCoverEnvelope = resolve3dDoorCoverEnvelope(spec, isBrickBackdrop);

  if (doorCoverEnvelope) {
    const isCastleDoor = doorCoverEnvelope.modelId === CASTLE_DOOR_ID;
    const effectiveDoorW = doorCoverEnvelope.effectiveDoorW;

    // 3D model fully replaces the flat void + lintel
    const wallCenter = toWorld(ctx.frame, centerS, spec.doorH * 0.5, 0);
    const placement: DoorModelPlacement = {
      wallSurfacePos: wallCenter,
      doorW: effectiveDoorW,
      doorH: spec.doorH,
      yawRad: ctx.frame.yawRad,
      outwardX: -ctx.frame.inwardX,
      outwardZ: -ctx.frame.inwardZ,
      modelId: doorCoverEnvelope.modelId,
      coverShape: doorCoverEnvelope.coverShape,
      coverWidthM: doorCoverEnvelope.coverWidthM,
      coverHeightM: doorCoverEnvelope.coverHeightM,
      coverCenterYOffsetM: doorCoverEnvelope.coverCenterYOffsetM,
    };
    if (isCastleDoor) {
      const isSpawnBMainHeroDoor =
        styleZoneId === "SPAWN_B_GATE_PLAZA"
        && styleFacadeFace === "north"
        && isBrickBackdrop;
      const surroundDepthM = isSpawnBMainHeroDoor
        ? SPAWN_B_HERO_DOOR_SURROUND_DEPTH_M
        : Math.max(
            spec.frameDepth * (isBrickBackdrop ? 1.45 : 1.2) * trimDepthScale,
            ctx.plinthDepth + 0.04,
          );
      placement.trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
      placement.surroundDepthM = surroundDepthM;
      if (typeof doorCoverEnvelope.trimThicknessM === "number") {
        placement.trimThicknessM = doorCoverEnvelope.trimThicknessM;
      }
      if (typeof doorCoverEnvelope.revealWidthM === "number") {
        placement.revealWidthM = doorCoverEnvelope.revealWidthM;
      }
      // Negative outward moves the custom surround toward the playable/street side.
      placement.surroundCenterOffsetM = -surroundDepthM * 0.5;
    }
    ctx.doorModelPlacements.push(placement);

    // Spawn doors get decorative framing around the 3D model
    if (isSpawn) {
      pushDoorCoverVoid(
        ctx,
        centerS,
        spec.doorH * 0.5 + doorCoverEnvelope.coverCenterYOffsetM,
        -spec.recessDepth * 0.4,
        0.006,
        doorCoverEnvelope.coverWidthM,
        doorCoverEnvelope.coverHeightM,
        doorCoverEnvelope.coverShape,
      );

      if (!isCastleDoor) {
        const archH = spec.doorW * (isBrickBackdrop ? 0.24 : 0.2);
        pushBox(ctx.instances, ctx.maxInstances, "door_arch_lintel", null,
          ctx.frame, centerS, spec.doorH, spec.frameDepth * (isBrickBackdrop ? 0.78 : 0.6) * trimDepthScale,
          spec.frameDepth * (isBrickBackdrop ? 1.85 : 1.5) * trimDepthScale, archH, spec.doorW + spec.frameThickness * (isBrickBackdrop ? 2.6 : 2),
          -Math.PI * 0.5);
        if (isSpawnBCleanup) {
          tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
        }

        for (const side of [-1, 1] as const) {
          pushBox(ctx.instances, ctx.maxInstances, "door_jamb", ctx.wallMaterialId,
            ctx.frame, centerS + side * (spec.doorW + spec.frameThickness) * 0.5,
            spec.doorH * 0.5, spec.frameDepth * (isBrickBackdrop ? 0.7 : 0.5) * trimDepthScale,
            spec.frameDepth * (isBrickBackdrop ? 1.45 : 1.2) * trimDepthScale, spec.doorH, spec.frameThickness * (isBrickBackdrop ? 1.18 : 1));
          tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
        }
      }

      if (isBrickBackdrop && !isCastleDoor) {
        pushBox(ctx.instances, ctx.maxInstances, "door_lintel", ctx.wallMaterialId,
          ctx.frame, centerS, spec.doorH + spec.frameThickness * 1.45, spec.frameDepth * 0.82 * trimDepthScale,
          spec.frameDepth * 1.55 * trimDepthScale, spec.frameThickness * 0.82, effectiveDoorW + spec.frameThickness * 2.9);
        tagTrim(
          ctx.instances,
          isSpawnBCleanup ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : (ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId),
        );
      } else if (!isCastleDoor) {
        const bracketCount: number = effectiveDoorW > 1.2 ? 3 : 2;
        const bracketSpacing = effectiveDoorW * 0.65 / Math.max(1, bracketCount - 1);
        for (let i = 0; i < bracketCount; i++) {
          const offset = bracketCount === 1 ? 0 : -effectiveDoorW * 0.325 + i * bracketSpacing;
          pushBox(ctx.instances, ctx.maxInstances, "awning_bracket", null,
            ctx.frame, centerS + offset, spec.doorH + spec.frameThickness * 2.2,
            spec.frameDepth * 1.0,
            0.18, 0.06, 0.14);
        }
      }
    }
  } else if (isSpawn) {
    // Small spawn doors: recessed void with decorative framing
    pushArchedDoorVoid(
      ctx,
      centerS,
      spec.doorH * 0.5,
      spec.doorH,
      -spec.recessDepth * 0.4,
      0.006,
      spec.doorW,
    );

    const archH = spec.doorW * (isBrickBackdrop ? 0.24 : 0.2);
    pushBox(ctx.instances, ctx.maxInstances, "door_arch_lintel", null,
      ctx.frame, centerS, spec.doorH, spec.frameDepth * (isBrickBackdrop ? 0.78 : 0.6) * trimDepthScale,
      spec.frameDepth * (isBrickBackdrop ? 1.85 : 1.5) * trimDepthScale, archH, spec.doorW + spec.frameThickness * (isBrickBackdrop ? 2.6 : 2),
      -Math.PI * 0.5);
    if (isSpawnBCleanup) {
      tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
    }

    for (const side of [-1, 1] as const) {
      pushBox(ctx.instances, ctx.maxInstances, "door_jamb", ctx.wallMaterialId,
        ctx.frame, centerS + side * (spec.doorW + spec.frameThickness) * 0.5,
        spec.doorH * 0.5, spec.frameDepth * (isBrickBackdrop ? 0.7 : 0.5) * trimDepthScale,
        spec.frameDepth * (isBrickBackdrop ? 1.45 : 1.2) * trimDepthScale, spec.doorH, spec.frameThickness * (isBrickBackdrop ? 1.18 : 1));
      tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
    }

    if (isBrickBackdrop) {
      pushBox(ctx.instances, ctx.maxInstances, "door_lintel", ctx.wallMaterialId,
        ctx.frame, centerS, spec.doorH + spec.frameThickness * 1.45, spec.frameDepth * 0.82 * trimDepthScale,
        spec.frameDepth * 1.55 * trimDepthScale, spec.frameThickness * 0.82, spec.doorW + spec.frameThickness * 2.9);
      tagTrim(
        ctx.instances,
        isSpawnBCleanup ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : (ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId),
      );
    } else {
      const bracketCount: number = spec.doorW > 1.2 ? 3 : 2;
      const bracketSpacing = spec.doorW * 0.65 / Math.max(1, bracketCount - 1);
      for (let i = 0; i < bracketCount; i++) {
        const offset = bracketCount === 1 ? 0 : -spec.doorW * 0.325 + i * bracketSpacing;
        pushBox(ctx.instances, ctx.maxInstances, "awning_bracket", null,
          ctx.frame, centerS + offset, spec.doorH + spec.frameThickness * 2.2,
          spec.frameDepth * 1.0,
          0.18, 0.06, 0.14);
      }
    }
  } else {
    // Small non-spawn doors: flat void + lintel trim
    pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
      ctx.frame, centerS, spec.doorH * 0.5, 0.003,
      0.006, spec.doorH, spec.doorW);
    pushBox(ctx.instances, ctx.maxInstances, "door_lintel", null,
      ctx.frame, centerS, spec.doorH + spec.frameThickness * 0.5, spec.frameDepth * 0.5,
      spec.frameDepth, spec.frameThickness, spec.doorW + spec.frameThickness * 2);
  }
}

function placeUpperDoorOpening(
  ctx: SegmentDecorContext,
  centerS: number,
  storyBaseY: number,
  spec: FacadeSpec,
): void {
  const openingW = clamp(spec.bayWidth * 0.7, spec.windowW * 1.1, spec.bayWidth * 0.84);
  const openingH = clamp(spec.windowH * 1.28, 1.6, 2.25);
  const centerY = storyBaseY + BALCONY_DOOR_SILL_OFFSET + openingH * 0.5;
  const trimDepthScale = isSpawnBShellCleanupSurface(ctx) ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;

  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, centerY, 0.008,
    0.016, openingH * 0.9, openingW * 0.88);

  pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
    ctx.frame, centerS, centerY, 0.015,
    WINDOW_GLASS_THICKNESS_M, openingH * 0.88, openingW * 0.86);

  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (openingW + spec.frameThickness) * 0.5, centerY, spec.frameDepth * 0.6 * trimDepthScale,
      spec.frameDepth * 1.08 * trimDepthScale, openingH + spec.frameThickness * 1.25, spec.frameThickness);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
  }

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, storyBaseY + BALCONY_DOOR_SILL_OFFSET + openingH + spec.frameThickness * 0.55,
    spec.frameDepth * 0.55 * trimDepthScale,
    spec.frameDepth * 1.1 * trimDepthScale, spec.frameThickness * 1.25, openingW + spec.frameThickness * 2.15);
  tagTrim(ctx.instances, ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId);
}

function placeAuthoredPointedArchBalconyOpening(
  ctx: SegmentDecorContext,
  centerS: number,
  storyBaseY: number,
  spec: FacadeSpec,
  balcony: RuntimeAuthoredBalcony,
): void {
  const trimDepthScale = isSpawnBShellCleanupSurface(ctx) ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;
  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const surroundBottomY = storyBaseY + balcony.openingSurroundBottomOffsetM;
  const surroundCenterY = surroundBottomY + balcony.openingSurroundHeightM * 0.5;
  const openingBottomY = storyBaseY + balcony.opening.sillOffsetM;
  const openingCenterY = openingBottomY + balcony.opening.height * 0.5;
  const surroundProjection = Math.max(0.13, spec.frameDepth * 1.14 * trimDepthScale);
  const voidDepth = 0.024;
  const voidInset = Math.max(0.05, surroundProjection * 0.7);
  const glassInset = voidInset + 0.012;
  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_frame", ctx.wallMaterialId,
    ctx.frame, centerS, surroundCenterY, surroundProjection * 0.5,
    surroundProjection, balcony.openingSurroundHeightM, balcony.openingSurroundWidthM);
  tagTrim(ctx.instances, trimMaterialId);

  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_void", null,
    ctx.frame, centerS, openingCenterY, voidInset,
    voidDepth, balcony.opening.height, balcony.opening.width);

  pushBox(ctx.instances, ctx.maxInstances, "hero_window_pointed_arch_glass", null,
    ctx.frame, centerS, openingCenterY, glassInset,
    WINDOW_GLASS_THICKNESS_M, balcony.opening.height, balcony.opening.width);
  tagTrim(ctx.instances, null, resolveStainedGlassMaterialId(balcony.opening.glassStyle));
}

function placeAuthoredBalconyRoofBreak(
  ctx: SegmentDecorContext,
  spec: FacadeSpec,
  balcony: RuntimeAuthoredBalcony,
  storyBaseY: number,
): void {
  if (balcony.roofBreakHeightM <= 0 && balcony.roofBreakCapHeightM <= 0) {
    return;
  }
  const trimDepthScale = isSpawnBShellCleanupSurface(ctx) ? SPAWN_B_SHELL_TRIM_DEPTH_SCALE : 1;
  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const bodyBottomY = storyBaseY + balcony.roofBreakBottomOffsetM;
  const bodyDepth = Math.max(0.18, spec.frameDepth * 0.9 * trimDepthScale);
  const capDepth = bodyDepth + 0.08;
  const bodyFrontFace = 0.018;
  const capFrontFace = 0.034;
  const bodyCenterN = bodyFrontFace - bodyDepth * 0.5;
  const capCenterN = capFrontFace - capDepth * 0.5;

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_back", ctx.wallMaterialId,
    ctx.frame, balcony.centerS, bodyBottomY + balcony.roofBreakHeightM * 0.5, bodyCenterN,
    bodyDepth, balcony.roofBreakHeightM, balcony.roofBreakWidthM);

  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, balcony.centerS,
    bodyBottomY + balcony.roofBreakHeightM + balcony.roofBreakCapHeightM * 0.5,
    capCenterN,
    capDepth, balcony.roofBreakCapHeightM, balcony.roofBreakWidthM + 0.12);
  tagTrim(ctx.instances, trimMaterialId);
}

function placeAuthoredBalcony(
  ctx: SegmentDecorContext,
  spec: FacadeSpec,
  balcony: RuntimeAuthoredBalcony,
): void {
  if (balcony.storyIndex >= spec.stories) {
    throw new Error(
      `[wall-detail] authored balcony storyIndex ${balcony.storyIndex} exceeds ${spec.stories - 1} on ${ctx.zone?.id ?? "unknown"}:${ctx.facadeFace}#${ctx.segmentOrdinal ?? "?"}`,
    );
  }

  const storyBaseY = balcony.storyIndex * STORY_HEIGHT_M;
  const balconyW = spec.bayWidth * balcony.spanBays;
  const trimMaterialId = ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId;
  const slabThickness = 0.14;
  const frontThickness = 0.18;
  const returnThickness = 0.18;
  const returnDepth = Math.max(0.64, balcony.depthM - frontThickness * 0.2);
  const copingHeight = 0.1;
  const copingDepth = frontThickness + 0.06;
  const copingWidth = balconyW + 0.18;
  const corbelHeight = 0.44;
  const corbelDepth = 0.26;
  const corbelWidth = 0.22;
  const corbelOffset = clamp(balconyW * 0.24, 1.28, balconyW * 0.28);

  placeAuthoredBalconyRoofBreak(ctx, spec, balcony, storyBaseY);
  placeAuthoredPointedArchBalconyOpening(ctx, balcony.centerS, storyBaseY, spec, balcony);

  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, balcony.centerS, storyBaseY + slabThickness * 0.5, balcony.depthM * 0.5,
    balcony.depthM, slabThickness, balconyW);

  pushBox(ctx.instances, ctx.maxInstances, "balcony_parapet", ctx.wallMaterialId,
    ctx.frame, balcony.centerS, storyBaseY + slabThickness + balcony.parapetHeightM * 0.5, balcony.depthM - frontThickness * 0.5,
    frontThickness, balcony.parapetHeightM, balconyW);

  pushBox(ctx.instances, ctx.maxInstances, "balcony_parapet", ctx.wallMaterialId,
    ctx.frame, balcony.centerS, storyBaseY + slabThickness + balcony.parapetHeightM + copingHeight * 0.5, balcony.depthM - frontThickness * 0.5,
    copingDepth, copingHeight, copingWidth);
  tagTrim(ctx.instances, trimMaterialId);

  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
      ctx.frame, balcony.centerS + side * (balconyW * 0.5 - returnThickness * 0.5),
      storyBaseY + slabThickness + balcony.parapetHeightM * 0.5, returnDepth * 0.5,
      returnDepth, balcony.parapetHeightM, returnThickness);

    pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
      ctx.frame, balcony.centerS + side * (balconyW * 0.5 - returnThickness * 0.5),
      storyBaseY + slabThickness + balcony.parapetHeightM + copingHeight * 0.5, returnDepth * 0.5,
      returnDepth + 0.04, copingHeight, returnThickness + 0.04);
    tagTrim(ctx.instances, trimMaterialId);
  }

  for (const alongS of [-corbelOffset, 0, corbelOffset]) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_bracket", ctx.wallMaterialId,
      ctx.frame, balcony.centerS + alongS, storyBaseY - corbelHeight * 0.5, balcony.depthM * 0.58,
      corbelDepth, corbelHeight, corbelWidth);
    tagTrim(ctx.instances, trimMaterialId);
  }
}

// ── Balcony placement (thin slab + light parapet) ──────────────────────────

function placeBalcony(
  ctx: SegmentDecorContext,
  doorCenterS: number,   // french door stays on the door column
  storyBaseY: number,
  spec: FacadeSpec,
  leftBays: number,      // 0 or 1 — window columns available to the left of the door
  rightBays: number,     // 0 or 1 — window columns available to the right of the door
): void {
  const totalBays = 1 + leftBays + rightBays;
  const balconyW = totalBays * spec.bayWidth;
  const slabCenterS = doorCenterS + (rightBays - leftBays) * spec.bayWidth * 0.5;
  const balconySurfaceId = spec.materialSlots.balcony ?? ctx.trimHeavyMaterialId;
  const tagBalconySurface = (): void => tagTrim(ctx.instances, null, balconySurfaceId);
  const tagMetalSupport = (): void => tagTrim(ctx.instances, null, "tm_balcony_painted_metal");

  let depth = BALCONY_DEPTH_M;
  let slabThickness = BALCONY_SLAB_THICKNESS_M;
  let lipHeight = BALCONY_LIP_H;
  let lipDepth = BALCONY_LIP_DEPTH_M;
  let frontHeight = BALCONY_FRONT_PARAPET_H;
  let frontThickness = BALCONY_FRONT_PARAPET_THICKNESS_M;
  let useEndCaps = totalBays > 1;
  let useTopRail = true;
  let bracketCount = totalBays >= 3 ? 3 : 2;
  let bracketDepth = BALCONY_BRACKET_D;
  let bracketHeight = BALCONY_BRACKET_H;
  let bracketWidth = BALCONY_BRACKET_W;

  if (spec.balconyStyle === "merchant_ledge") {
    depth = clamp(0.75 + totalBays * 0.05, 0.75, 0.9);
    slabThickness = 0.09;
    lipHeight = 0.1;
    lipDepth = 0.1;
    frontHeight = 0.18;
    frontThickness = 0.09;
    useEndCaps = false;
    useTopRail = false;
    bracketCount = totalBays >= 2 ? 2 : 1;
    bracketDepth = 0.18;
    bracketHeight = 0.24;
    bracketWidth = 0.1;
  } else if (spec.balconyStyle === "residential_parapet") {
    depth = clamp(1.15 + (totalBays - 1) * 0.08, 1.15, 1.35);
    slabThickness = 0.14;
    lipHeight = 0.12;
    lipDepth = 0.12;
    frontHeight = 0.9;
    frontThickness = 0.16;
    useEndCaps = true;
    useTopRail = false;
    bracketCount = totalBays >= 3 ? 3 : 2;
    bracketDepth = 0.26;
    bracketHeight = 0.38;
    bracketWidth = 0.18;
  } else if (spec.balconyStyle === "hero_cantilever") {
    depth = clamp(1.35 + (totalBays - 1) * 0.06, 1.35, 1.5);
    slabThickness = 0.16;
    lipHeight = 0.12;
    lipDepth = 0.12;
    frontHeight = 0.42;
    frontThickness = 0.14;
    useEndCaps = true;
    useTopRail = false;
    bracketCount = totalBays >= 3 ? 3 : 2;
    bracketDepth = 0.32;
    bracketHeight = 0.42;
    bracketWidth = 0.2;
  }

  const slabY = storyBaseY + slabThickness * 0.5;

  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, slabCenterS, slabY, depth * 0.5,
    depth, slabThickness, balconyW);
  tagBalconySurface();

  pushBox(ctx.instances, ctx.maxInstances, "balcony_parapet", ctx.wallMaterialId,
    ctx.frame, slabCenterS, storyBaseY - lipHeight * 0.35, depth - lipDepth * 0.5,
    lipDepth, lipHeight, balconyW * 0.94);
  tagBalconySurface();

  // 2. Recessed french door opening behind the balcony
  const doorW = clamp(
    spec.balconyStyle === "merchant_ledge" ? balconyW * 0.54 : balconyW * 0.6,
    spec.bayWidth * 0.48,
    balconyW * 0.72,
  );
  const doorCenterY = storyBaseY + BALCONY_DOOR_SILL_OFFSET + BALCONY_DOOR_H * 0.5;

  // 2a. Dark void
  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, doorCenterS, doorCenterY, 0.003,
    0.006, BALCONY_DOOR_H, doorW);

  // 2b. Glass pane
  pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
    ctx.frame, doorCenterS, doorCenterY, 0.015,
    WINDOW_GLASS_THICKNESS_M, BALCONY_DOOR_H, doorW);

  // 2c. Frame jambs
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, doorCenterS + side * (doorW + spec.frameThickness) * 0.5, doorCenterY, spec.frameDepth * 0.5,
      spec.frameDepth, BALCONY_DOOR_H + spec.frameThickness, spec.frameThickness);
  }

  // 2d. Lintel
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, doorCenterS, storyBaseY + BALCONY_DOOR_SILL_OFFSET + BALCONY_DOOR_H + spec.frameThickness * 0.5,
    spec.frameDepth * 0.5,
    spec.frameDepth, spec.frameThickness * 1.2, doorW + spec.frameThickness * 2);

  // 2e. Horizontal crossbar
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", null,
    ctx.frame, doorCenterS, doorCenterY, 0.018,
    0.035, 0.04, doorW * 0.92);

  // 3. Front profile — merchant ledges read as a fascia band, residential stays parapet-led.
  const parapetY = storyBaseY + slabThickness + frontHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "balcony_parapet", ctx.wallMaterialId,
    ctx.frame, slabCenterS, parapetY, depth - frontThickness * 0.5,
    frontThickness, frontHeight, balconyW * (spec.balconyStyle === "hero_cantilever" ? 0.92 : 0.9));
  tagBalconySurface();

  if (useTopRail) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_railing", null,
      ctx.frame, slabCenterS, parapetY + frontHeight * 0.5 + BALCONY_RAIL_H * 0.5,
      depth - frontThickness * 0.5,
      BALCONY_RAIL_THICKNESS_M, BALCONY_RAIL_H, balconyW * (spec.balconyStyle === "merchant_ledge" ? 0.74 : 0.82));
  }

  if (useEndCaps) {
    const endNibY = storyBaseY + slabThickness + BALCONY_END_NIB_H * 0.5;
    for (const side of [-1, 1] as const) {
      pushBox(ctx.instances, ctx.maxInstances, "balcony_end_cap", ctx.wallMaterialId,
        ctx.frame, slabCenterS + side * (balconyW * 0.5 - BALCONY_END_NIB_W * 0.5), endNibY,
        depth - BALCONY_END_NIB_DEPTH_M * 0.5,
        BALCONY_END_NIB_DEPTH_M, BALCONY_END_NIB_H, BALCONY_END_NIB_W);
      tagBalconySurface();
    }
  }

  const bracketOffsets: number[] = [];
  if (bracketCount === 1) {
    bracketOffsets.push(0);
  } else if (bracketCount === 2) {
    const offset = Math.min(balconyW * 0.26, Math.max(0.22, balconyW * 0.29));
    bracketOffsets.push(-offset, offset);
  } else {
    const offset = Math.min(balconyW * 0.28, Math.max(0.28, balconyW * 0.31));
    bracketOffsets.push(-offset, 0, offset);
  }

  for (const alongS of bracketOffsets) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_bracket", ctx.wallMaterialId,
      ctx.frame, slabCenterS + alongS,
      storyBaseY - bracketHeight * 0.5, depth * (spec.balconyStyle === "merchant_ledge" ? 0.52 : 0.58),
      bracketDepth, bracketHeight, bracketWidth);
    if (spec.balconyStyle === "merchant_ledge") {
      tagMetalSupport();
    } else {
      tagBalconySurface();
    }
  }
}

// ── Pilasters aligned to bay grid ──────────────────────────────────────────

function placePilasters(ctx: SegmentDecorContext, spec: FacadeSpec): void {
  if (spec.bayCount < 2) return;
  if (ctx.frame.lengthM < 3.0) return;
  if (isSpawnBShellCleanupSurface(ctx)) return;

  ctx.rng.range(0.04, 0.09); // consume — preserved for RNG sequence stability
  ctx.rng.range(0.14, 0.24); // consume

  const dims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  const isBlank = isBlankWallRole(spec.wallRole);
  if (isBlank) return;

  if (spec.isSpawnHeroFacade) {
    // Spawn hero: pilasters only flanking door bays to frame entries,
    // avoiding the repeated grid that flattens the silhouette.
    const pilasterW = dims.pilasterW * 1.15;
    const pilasterD = clamp(dims.pilasterD * 1.3, 0.04, ctx.maxProtrusionM);
    for (const doorCol of spec.doorColumns) {
      for (const side of [-1, 1] as const) {
        const adjacentCol = doorCol + side;
        if (adjacentCol < 0 || adjacentCol >= spec.bayCount) continue;
        const edgeS = columnCenterS(spec, doorCol) + side * spec.bayWidth * 0.5;
        pushBox(ctx.instances, ctx.maxInstances, "pilaster", ctx.wallMaterialId,
          ctx.frame, edgeS, ctx.wallHeightM * 0.5, pilasterD * 0.5,
          pilasterD, ctx.wallHeightM, pilasterW);
        tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
      }
    }
    return;
  }

  // Standard facades: pilasters at every other bay edge for rhythm.
  const pilasterW = dims.pilasterW;
  const pilasterD = clamp(dims.pilasterD, 0.04, ctx.maxProtrusionM);
  const step = ctx.trimTier === "hero" ? 1 : 2;
  for (let edge = 1; edge < spec.bayCount; edge += step) {
    const edgeS = columnCenterS(spec, edge) - spec.bayWidth * 0.5;
    pushBox(ctx.instances, ctx.maxInstances, "pilaster", ctx.wallMaterialId,
      ctx.frame, edgeS, ctx.wallHeightM * 0.5, pilasterD * 0.5,
      pilasterD, ctx.wallHeightM, pilasterW);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
  }
}

// ── Recessed panels on blank bays ──────────────────────────────────────────

function placeBlankBayPanel(
  ctx: SegmentDecorContext,
  centerS: number,
  storyBaseY: number,
  spec: FacadeSpec,
  trimDims: TrimDims,
): void {
  // Spawn-only feature: recessed panels on blank bays for wall texture
  if (ctx.zone?.type !== "spawn_plaza") return;
  if (isSpawnBShellCleanupSurface(ctx)) return;
  // Only on non-blank wall roles and non-side-hall facades
  if (isBlankWallRole(spec.wallRole) || ctx.isSideHall) return;
  const isBrickBackdrop = isSpawnGateBrickBackdropPreset(spec.compositionPreset);

  const belowTop = storyBaseY === 0 ? trimDims.plinthH : storyBaseY + trimDims.courseH * 0.5;
  const aboveBot = storyBaseY + STORY_HEIGHT_M - trimDims.courseH * 0.5;
  const panelH = (aboveBot - belowTop) * (isBrickBackdrop ? 0.72 : 0.65);
  const panelW = spec.bayWidth * (isBrickBackdrop ? 0.72 : 0.55);
  const panelCenterY = (belowTop + aboveBot) * 0.5;
  const panelDepth = isBrickBackdrop ? 0.09 : 0.08;
  const infillMaterialId = isBrickBackdrop ? "ph_band_plastered" : null;
  const panelCenterInset = resolveInsetSurfaceCenterOffset(panelDepth, RECESSED_PANEL_BACK_THICKNESS_M);

  // Recessed back panel (dark, shadowed surface)
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_back", ctx.wallMaterialId,
    ctx.frame, centerS, panelCenterY, panelCenterInset,
    RECESSED_PANEL_BACK_THICKNESS_M, panelH, panelW);
  if (isBrickBackdrop) {
    tagTrim(ctx.instances, null, infillMaterialId);
  }

  // Frame around the recess (top, bottom, left, right)
  const frameT = isBrickBackdrop ? 0.075 : 0.06;
  const frameD = panelDepth + (isBrickBackdrop ? 0.07 : 0.04);
  // Top
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, panelCenterY + (panelH + frameT) * 0.5, frameD * 0.5,
    frameD, frameT, panelW + frameT * 2);
  tagTrim(ctx.instances, isBrickBackdrop ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : ctx.trimLightMaterialId);
  // Bottom
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, panelCenterY - (panelH + frameT) * 0.5, frameD * 0.5,
    frameD, frameT, panelW + frameT * 2);
  tagTrim(ctx.instances, isBrickBackdrop ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : ctx.trimLightMaterialId);
  // Left + Right
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (panelW + frameT) * 0.5, panelCenterY, frameD * 0.5,
      frameD, panelH, frameT);
    tagTrim(ctx.instances, isBrickBackdrop ? (ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId) : ctx.trimLightMaterialId);
  }
}

// ── Cable segments ─────────────────────────────────────────────────────────

function placeCableSegments(ctx: SegmentDecorContext): void {
  if (!ctx.isSideHall && !ctx.isCut) return;
  if (ctx.rng.next() > 0.28) return;
  if (ctx.frame.lengthM < 2.0) return;

  const cableY = ctx.rng.range(ctx.wallHeightM * 0.55, ctx.wallHeightM * 0.82);
  const cableLength = ctx.frame.lengthM * ctx.rng.range(0.3, 0.6);

  pushBox(ctx.instances, ctx.maxInstances, "cable_segment", null,
    ctx.frame, 0, cableY, ctx.rng.range(0.02, 0.05),
    0.02, 0.02, cableLength);
}

function isHeroBalconyPreset(preset: RuntimeFacadeOverridePreset): boolean {
  return preset === "merchant_hero_stack"
    || preset === "spawn_courtyard_landmark"
    || preset === "residential_balcony_stack";
}

function countContiguousWindowColumns(
  spec: FacadeSpec,
  startColumn: number,
  direction: -1 | 1,
  maxCount: number,
): number {
  let count = 0;
  for (let step = 1; step <= maxCount; step += 1) {
    const column = startColumn + direction * step;
    if (spec.columnRoles[column] !== "window") {
      break;
    }
    count += 1;
  }
  return count;
}

function pickDominantBalconyDoor(spec: FacadeSpec): number {
  const wallMid = (spec.bayCount - 1) * 0.5;
  let winner = spec.doorColumns[0]!;
  let winnerScore = Number.NEGATIVE_INFINITY;

  for (const doorColumn of spec.doorColumns) {
    const leftAvailable = countContiguousWindowColumns(spec, doorColumn, -1, 3);
    const rightAvailable = countContiguousWindowColumns(spec, doorColumn, 1, 3);
    const symmetricPairs = Math.min(leftAvailable, rightAvailable);
    const totalSpan = leftAvailable + rightAvailable;
    const centerBias = Math.abs(doorColumn - wallMid);
    const score = symmetricPairs * 100 + totalSpan * 10 - centerBias;

    if (score > winnerScore || (score === winnerScore && doorColumn < winner)) {
      winner = doorColumn;
      winnerScore = score;
    }
  }

  return winner;
}

function computeBalconyPlacements(
  spec: FacadeSpec,
): {
  balconyInfo: Map<string, { leftBays: number; rightBays: number }>;
  coveredWindows: Set<string>;
  upperDoorOpenings: Set<string>;
} {
  const balconyInfo = new Map<string, { leftBays: number; rightBays: number }>();
  const coveredWindows = new Set<string>();
  const upperDoorOpenings = new Set<string>();

  if (
    spec.stories < 2
    || spec.balconyStyle === "none"
    || spec.doorColumns.length === 0
    || !isFrontageWallRole(spec.wallRole)
    || !isHeroBalconyPreset(spec.compositionPreset)
  ) {
    return { balconyInfo, coveredWindows, upperDoorOpenings };
  }

  const preferredDoor = pickDominantBalconyDoor(spec);
  const leftAvailable = countContiguousWindowColumns(spec, preferredDoor, -1, 3);
  const rightAvailable = countContiguousWindowColumns(spec, preferredDoor, 1, 3);

  let leftBays = 0;
  let rightBays = 0;

  if (leftAvailable > 0 && rightAvailable > 0) {
    leftBays = Math.min(leftAvailable, 2);
    rightBays = Math.min(rightAvailable, 2);
  } else if (leftAvailable > 0 || rightAvailable > 0) {
    if (spec.facadeLean < 0 && leftAvailable > 0) {
      leftBays = 1;
    } else if (spec.facadeLean > 0 && rightAvailable > 0) {
      rightBays = 1;
    } else if (leftAvailable > 0) {
      leftBays = 1;
    } else if (rightAvailable > 0) {
      rightBays = 1;
    }
  }

  const canAddExtraLeft = leftAvailable > leftBays;
  const canAddExtraRight = rightAvailable > rightBays;
  const totalBays = 1 + leftBays + rightBays;
  if (totalBays < 6) {
    if (spec.facadeLean < 0 && canAddExtraLeft) {
      leftBays += 1;
    } else if (spec.facadeLean > 0 && canAddExtraRight) {
      rightBays += 1;
    } else if (canAddExtraLeft) {
      leftBays += 1;
    } else if (canAddExtraRight) {
      rightBays += 1;
    }
  }

  balconyInfo.set(`${preferredDoor}:1`, { leftBays, rightBays });

  for (let offset = 1; offset <= leftBays; offset += 1) {
    coveredWindows.add(`${preferredDoor - offset}:1`);
  }
  for (let offset = 1; offset <= rightBays; offset += 1) {
    coveredWindows.add(`${preferredDoor + offset}:1`);
  }

  if (spec.stories >= 3) {
    // 3rd floor gets a smaller single-bay balcony stacked above the grand one
    balconyInfo.set(`${preferredDoor}:2`, { leftBays: 0, rightBays: 0 });
  }

  return { balconyInfo, coveredWindows, upperDoorOpenings };
}

// ── Main decoration orchestrator ───────────────────────────────────────────

function decorateSegment(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < SEGMENT_EDGE_MARGIN_M * 2) return;

  // Structural framing
  placeCornerPiers(ctx);
  placeParapetCap(ctx);
  placeRoofCap(ctx);
  placeBuildingEnclosure(ctx);

  // Horizontal banding (plinth computed now, emitted after door positions are known)
  computePlinthDims(ctx);
  placeStringCourses(ctx);
  placeCorniceStrip(ctx);

  if (ctx.authoredCompositionLayout) {
    placeCompositionLayout(ctx, ctx.authoredCompositionLayout);
    placeCableSegments(ctx);
    return;
  }

  // Compute facade spec — all proportions decided once
  const spec = computeFacadeSpec(ctx);
  if (!spec) {
    emitPlinthStrip(ctx, []); // full continuous strip (no doors to gap)
    placeCableSegments(ctx);
    return;
  }

  // Pilasters aligned to the bay grid
  placePilasters(ctx, spec);

  if (ctx.authoredWindowLayout || ctx.authoredDoorLayout || ctx.authoredBalconyLayout) {
    if (ctx.authoredBalconyLayout && !ctx.authoredWindowLayout) {
      throw new Error(
        `[wall-detail] authored balcony layout on ${ctx.zone?.id ?? "unknown"}:${ctx.facadeFace}#${ctx.segmentOrdinal ?? "?"} requires an authored window layout`,
      );
    }

    const doorPlacementSpec = ctx.authoredDoorStyleSpec ?? spec;
    const doorCentersS = resolveDoorCentersS(spec, ctx.authoredDoorLayout);

    for (const doorCenterS of doorCentersS) {
      placeArchedDoor(ctx, doorCenterS, doorPlacementSpec, ctx.authoredDoorStyleSource);
    }

    if (ctx.authoredWindowLayout) {
      for (const window of ctx.authoredWindowLayout.windows) {
        placeAuthoredWindow(ctx, window, spec);
      }
    }

    if (ctx.authoredBalconyLayout) {
      for (const balcony of ctx.authoredBalconyLayout.balconies) {
        placeAuthoredBalcony(ctx, spec, balcony);
      }
    }

    const authoredDoorCoverEnvelope = resolve3dDoorCoverEnvelope(
      doorPlacementSpec,
      isSpawnGateBrickBackdropPreset(doorPlacementSpec.compositionPreset),
    );
    const doorGaps = doorCentersS
      .filter(() => authoredDoorCoverEnvelope != null)
      .map((doorCenterS) => ({
        centerS: doorCenterS,
        halfW: authoredDoorCoverEnvelope!.coverWidthM * 0.5,
      }));
    emitPlinthStrip(ctx, doorGaps);
    placeCableSegments(ctx);
    return;
  }

  const balconyPlan = computeBalconyPlacements(spec);

  // Walk columns × stories with vertical coherence
  const trimDims = getTrimDims(ctx.wallHeightM, ctx.zone?.type === "spawn_plaza");
  for (let col = 0; col < spec.bayCount; col += 1) {
    const role = spec.columnRoles[col]!;
    const centerS = columnCenterS(spec, col);

    for (let story = 0; story < spec.stories; story += 1) {
      const storyBaseY = story * STORY_HEIGHT_M;
      const isSpawnBCleanup = isSpawnBShellCleanupSurface(ctx);

      if (story === 0 && role === "door") {
        // Ground floor door column → arched door
        placeArchedDoor(ctx, centerS, spec);
      } else if (story > 0 && role === "door") {
        const info = balconyPlan.balconyInfo.get(`${col}:${story}`);
        if (info) {
          placeBalcony(ctx, centerS, storyBaseY, spec, info.leftBays, info.rightBays);
        } else if (balconyPlan.upperDoorOpenings.has(`${col}:${story}`)) {
          placeUpperDoorOpening(ctx, centerS, storyBaseY, spec);
        }
      } else if (role === "window" && !DISABLE_WINDOWS) {
        if (!balconyPlan.coveredWindows.has(`${col}:${story}`)) {
          if (isSpawnGateBrickBackdropPreset(spec.compositionPreset) && story === 0 && col === Math.floor(spec.bayCount * 0.5)) {
            continue;
          }
          // Center window vertically between the horizontal trim below and above.
          const belowTop = story === 0
            ? (ctx.isSideHall ? 0 : ctx.plinthHeight)
            : storyBaseY + (isSpawnBCleanup ? 0 : trimDims.courseH * 0.5);
          const aboveBot = story === spec.stories - 1
            ? ctx.wallHeightM - resolveCorniceStripHeight(ctx, trimDims)
            : (story + 1) * STORY_HEIGHT_M - (isSpawnBCleanup ? 0 : trimDims.courseH * 0.5);
          const sillY = (belowTop + aboveBot) * 0.5 - spec.windowH * 0.5;
          const isBrickBackdrop = isSpawnGateBrickBackdropPreset(spec.compositionPreset);
          const isCenterColumn = col === Math.floor(spec.bayCount * 0.5);
          const tunedSpec = isBrickBackdrop
            ? {
                ...spec,
                windowW: story === 0
                  ? spec.windowW * 0.78
                  : isCenterColumn ? spec.windowW * 1.14 : spec.windowW * 0.94,
                windowH: story === 0
                  ? spec.windowH * 0.92
                  : isCenterColumn ? spec.windowH * 1.06 : spec.windowH,
              }
            : spec;
          placeWindowOpening(ctx, centerS, sillY, tunedSpec, resolveWindowTreatment(spec, col, story));
        }
      } else if (role === "blank" && story > 0) {
        // Upper-floor blank bays get framed recessed panels for wall texture
        placeBlankBayPanel(ctx, centerS, storyBaseY, spec, trimDims);
      }
    }

  }

  // Emit plinth strips with gaps at 3D door positions
  const doorGaps: { centerS: number; halfW: number }[] = [];
  const segmentDoorCoverEnvelope = resolve3dDoorCoverEnvelope(spec, isSpawnGateBrickBackdropPreset(spec.compositionPreset));
  for (let col = 0; col < spec.bayCount; col += 1) {
    if (spec.columnRoles[col] === "door"
        && segmentDoorCoverEnvelope) {
      doorGaps.push({
        centerS: columnCenterS(spec, col),
        halfW: segmentDoorCoverEnvelope.coverWidthM * 0.5,
      });
    }
  }
  emitPlinthStrip(ctx, doorGaps);

  // Cables on side halls/cuts
  placeCableSegments(ctx);
}

// ── Public entry point ─────────────────────────────────────────────────────

export function buildWallDetailPlacements(options: BuildWallDetailPlacementsOptions): WallDetailPlacementResult {
  const seed = typeof options.detailSeed === "number"
    ? Math.trunc(options.detailSeed)
    : deriveSubSeed(options.seed, "wall-detail-seed");
  const density = clamp(options.density, 0, 1.25);
  const maxProtrusionM = clamp(options.maxProtrusionM, 0.03, 0.2);
  const maxInstances = Math.max(1, INSTANCE_BUDGET);
  const instances: WallDetailInstance[] = [];
  const doorModelPlacements: DoorModelPlacement[] = [];
  const segmentHeights: number[] = [];

  if (!options.enabled || options.segments.length === 0) {
    return {
      instances,
      doorModelPlacements,
      segmentHeights,
      stats: {
        enabled: false,
        seed,
        density,
        segmentCount: options.segments.length,
        segmentsDecorated: 0,
        instanceCount: 0,
      },
    };
  }

  // Compute map centre from main-lane zones (used for inside/outside wall detection).
  const mainLaneZones = options.zones.filter(z => z.type === "main_lane_segment");
  const fallbackX = options.zones.reduce((s, z) => s + z.rect.x + z.rect.w * 0.5, 0) / Math.max(1, options.zones.length);
  const fallbackZ = options.zones.reduce((s, z) => s + z.rect.y + z.rect.h * 0.5, 0) / Math.max(1, options.zones.length);
  const mapCenterX = mainLaneZones.length > 0
    ? mainLaneZones.reduce((s, z) => s + z.rect.x + z.rect.w * 0.5, 0) / mainLaneZones.length
    : fallbackX;
  const mapCenterZ = mainLaneZones.length > 0
    ? mainLaneZones.reduce((s, z) => s + z.rect.y + z.rect.h * 0.5, 0) / mainLaneZones.length
    : fallbackZ;

  // Build corner set: endpoints where perpendicular segments meet.
  const cornerKeys = new Set<string>();
  {
    const toKey = (x: number, z: number) => `${x.toFixed(3)}:${z.toFixed(3)}`;
    type Bucket = { hasV: boolean; hasH: boolean };
    const bkts = new Map<string, Bucket>();
    const getBkt = (x: number, z: number): Bucket => {
      const k = toKey(x, z);
      let b = bkts.get(k);
      if (!b) { b = { hasV: false, hasH: false }; bkts.set(k, b); }
      return b;
    };
    for (const seg of options.segments) {
      if (seg.end - seg.start <= 1e-4) continue;
      if (seg.orientation === "vertical") {
        getBkt(seg.coord, seg.start).hasV = true;
        getBkt(seg.coord, seg.end).hasV = true;
      } else {
        getBkt(seg.start, seg.coord).hasH = true;
        getBkt(seg.end, seg.coord).hasH = true;
      }
    }
    for (const [key, b] of bkts) {
      if (b.hasV && b.hasH) cornerKeys.add(key);
    }
  }
  const toCornerKey = (x: number, z: number) => `${x.toFixed(3)}:${z.toFixed(3)}`;

  const rootRng = new DeterministicRng(seed);
  const facadeOverrideMap = new Map<string, RuntimeFacadeOverridePreset>();
  for (const override of options.facadeOverrides) {
    facadeOverrideMap.set(`${override.zoneId}:${override.face}`, override.preset);
  }
  const windowModuleMap = new Map<string, RuntimeWindowModule>();
  for (const module of options.moduleRegistry.windowModules) {
    if (windowModuleMap.has(module.id)) {
      throw new Error(`[wall-detail] duplicate window module '${module.id}'`);
    }
    windowModuleMap.set(module.id, module);
  }
  const doorModuleMap = new Map<string, RuntimeDoorModule>();
  for (const module of options.moduleRegistry.doorModules) {
    if (doorModuleMap.has(module.id)) {
      throw new Error(`[wall-detail] duplicate door module '${module.id}'`);
    }
    doorModuleMap.set(module.id, module);
  }
  const heroBayModuleMap = new Map<string, RuntimeHeroBayModule>();
  for (const module of options.moduleRegistry.heroBayModules) {
    if (heroBayModuleMap.has(module.id)) {
      throw new Error(`[wall-detail] duplicate hero bay module '${module.id}'`);
    }
    heroBayModuleMap.set(module.id, module);
  }
  const authoredDoorLayoutMap = new Map<string, RuntimeDoorLayoutOverride>();
  for (const override of options.doorLayoutOverrides) {
    authoredDoorLayoutMap.set(authoredDoorLayoutKey(override.zoneId, override.face, override.segmentOrdinal), override);
  }
  const authoredWindowLayoutMap = new Map<string, RuntimeWindowLayoutOverride>();
  for (const override of options.windowLayoutOverrides) {
    authoredWindowLayoutMap.set(authoredWindowLayoutKey(override.zoneId, override.face, override.segmentOrdinal), override);
  }
  const authoredBalconyLayoutMap = new Map<string, RuntimeBalconyLayoutOverride>();
  for (const override of options.balconyLayoutOverrides) {
    authoredBalconyLayoutMap.set(authoredBalconyLayoutKey(override.zoneId, override.face, override.segmentOrdinal), override);
  }
  const compositionLayoutMap = new Map<string, RuntimeCompositionLayoutOverride>();
  for (const override of options.compositionLayoutOverrides) {
    const key = compositionLayoutKey(override.zoneId, override.face, override.segmentOrdinal);
    if (compositionLayoutMap.has(key)) {
      throw new Error(`[wall-detail] duplicate composition layout override '${key}'`);
    }
    compositionLayoutMap.set(key, override);
  }

  const segmentMetaByIndex = new Map<number, {
    zone: RuntimeBlockoutZone | null;
    facadeFace: FacadeFace;
    segmentOrdinal: number | null;
  }>();
  const segmentGroupsByFace = new Map<string, Array<{ index: number; start: number }>>();
  for (let index = 0; index < options.segments.length; index += 1) {
    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const facadeFace = resolveFacadeFaceForSegment(zone, frame);
    segmentMetaByIndex.set(index, {
      zone,
      facadeFace,
      segmentOrdinal: null,
    });
    if (!zone) continue;
    const key = `${zone.id}:${facadeFace}`;
    const entries = segmentGroupsByFace.get(key) ?? [];
    entries.push({ index, start: segment.start });
    segmentGroupsByFace.set(key, entries);
  }
  for (const entries of segmentGroupsByFace.values()) {
    entries.sort((left, right) => left.start - right.start);
    for (let ordinal = 0; ordinal < entries.length; ordinal += 1) {
      const meta = segmentMetaByIndex.get(entries[ordinal]!.index);
      if (meta) {
        meta.segmentOrdinal = ordinal + 1;
      }
    }
  }
  const segmentKeyToIndex = new Map<string, number>();
  for (const [index, meta] of segmentMetaByIndex) {
    if (!meta.zone || meta.segmentOrdinal === null) continue;
    segmentKeyToIndex.set(authoredDoorLayoutKey(meta.zone.id, meta.facadeFace, meta.segmentOrdinal), index);
  }

  type SegmentDescriptor = {
    frame: SegmentFrame;
    zone: RuntimeBlockoutZone | null;
    facadeStyle: ReturnType<typeof resolveFacadeStyleForSegment>;
    facadeFace: FacadeFace;
    segmentOrdinal: number | null;
    compositionPreset: RuntimeFacadeOverridePreset;
    isMainLane: boolean;
    isShopfront: boolean;
    isSideHall: boolean;
    isConnector: boolean;
    isCut: boolean;
    wallMaterialId: string;
    trimHeavyMaterialId: string | null;
    trimLightMaterialId: string | null;
    isInsideWall: boolean;
    isSpawnEntryWall: boolean;
    segHeight: number;
    segmentDensity: number;
    segmentMaxProtrusion: number;
    segSeed: number;
    cornerAtStart: boolean;
    cornerAtEnd: boolean;
    isSpawnOuterWall: boolean;
    isConnectorSpawnFacing: boolean;
    authoredDoorLayout: RuntimeDoorLayoutOverride | null;
    authoredWindowLayout: RuntimeWindowLayoutOverride | null;
    authoredBalconyLayout: RuntimeBalconyLayoutOverride | null;
    authoredCompositionLayout: RuntimeCompositionLayoutOverride | null;
    wallRole: WallRole;
  };

  const segmentDescriptorCache = new Map<number, SegmentDescriptor>();
  const authoredDoorStyleSpecCache = new Map<string, FacadeSpec>();

  function describeSegment(index: number): SegmentDescriptor {
    const cached = segmentDescriptorCache.get(index);
    if (cached) {
      return cached;
    }

    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const segmentMeta = segmentMetaByIndex.get(index);
    const zone = segmentMeta?.zone ?? resolveSegmentZone(frame, options.zones);
    const facadeStyle = resolveFacadeStyleForSegment(zone, frame);
    const facadeFace = segmentMeta?.facadeFace ?? resolveFacadeFaceForSegment(zone, frame);
    const compositionPreset = resolveCompositionPreset(
      zone,
      facadeFace,
      facadeStyle.family,
      facadeStyle.balconyStyle,
      facadeOverrideMap,
    );
    const isMainLane = isMainLaneZone(zone);
    const isShopfront = isShopfrontZone(zone);
    const isSideHall = zone?.type === "side_hall";
    const isConnector = zone?.type === "connector";
    const isCut = zone?.type === "cut";
    const wallMaterialId = facadeStyle.materials.wall;
    const trimHeavyMaterialId = facadeStyle.materials.trimHeavy;
    const trimLightMaterialId = facadeStyle.materials.trimLight;
    const isInsideWall = isSideHall
      && Math.abs(frame.inwardX) > 0.5
      && Math.sign(frame.centerX - mapCenterX) !== 0
      && Math.sign(frame.centerX - mapCenterX) === Math.sign(frame.inwardX);

    let isSpawnEntryWall = false;
    if (zone?.type === "spawn_plaza") {
      const spawnCenterZ = zone.rect.y + zone.rect.h / 2;
      isSpawnEntryWall = (frame.centerZ - spawnCenterZ) * (mapCenterZ - spawnCenterZ) > 0;
    }

    let isConnectorMainLaneFacing = false;
    if (zone?.type === "connector") {
      const zoneCenterZ = zone.rect.y + zone.rect.h / 2;
      const zoneCenterX = zone.rect.x + zone.rect.w / 2;
      const toMainLane =
        frame.inwardZ * (mapCenterZ - zoneCenterZ) +
        frame.inwardX * (mapCenterX - zoneCenterX);
      isConnectorMainLaneFacing = toMainLane < -0.01;
    }

    const heightSeed = deriveSubSeed(seed, `height:${zone?.id ?? "none"}`);
    const heightRng = new DeterministicRng(heightSeed);
    const segHeight = resolveSegmentWallHeight(
      options.wallHeightM,
      zone,
      heightRng,
      isInsideWall,
      isSpawnEntryWall,
      isConnectorMainLaneFacing,
    );

    const segmentDensityRaw = density
      * (isMainLane ? 1.04 : 1)
      * (isShopfront ? 1.08 : 1)
      * (isSideHall ? 0.84 : 1)
      * (isConnector ? 0.78 : 1);
    const segmentDensity = clamp(segmentDensityRaw, 0.06, 1.2);
    const segmentMaxProtrusion = clamp(
      isMainLane ? Math.min(maxProtrusionM, 0.14) : maxProtrusionM,
      0.03,
      maxProtrusionM,
    );
    const segSeed = deriveSubSeed(seed, `segment:${index}:${zone?.id ?? "none"}`);

    let cornerAtStart: boolean;
    let cornerAtEnd: boolean;
    if (segment.orientation === "vertical") {
      cornerAtStart = cornerKeys.has(toCornerKey(segment.coord, segment.start));
      cornerAtEnd = cornerKeys.has(toCornerKey(segment.coord, segment.end));
    } else {
      cornerAtStart = cornerKeys.has(toCornerKey(segment.start, segment.coord));
      cornerAtEnd = cornerKeys.has(toCornerKey(segment.end, segment.coord));
    }

    const isSpawnOuterWall = zone?.type === "spawn_plaza" && !isSpawnEntryWall;
    const isConnectorSpawnFacing = zone?.type === "connector" && !isConnectorMainLaneFacing;
    const authoredDoorLayout = zone && segmentMeta?.segmentOrdinal
      ? authoredDoorLayoutMap.get(authoredDoorLayoutKey(zone.id, facadeFace, segmentMeta.segmentOrdinal)) ?? null
      : null;
    const authoredWindowLayout = zone && segmentMeta?.segmentOrdinal
      ? authoredWindowLayoutMap.get(authoredWindowLayoutKey(zone.id, facadeFace, segmentMeta.segmentOrdinal)) ?? null
      : null;
    const authoredBalconyLayout = zone && segmentMeta?.segmentOrdinal
      ? authoredBalconyLayoutMap.get(authoredBalconyLayoutKey(zone.id, facadeFace, segmentMeta.segmentOrdinal)) ?? null
      : null;
    const authoredCompositionLayout = zone && segmentMeta?.segmentOrdinal
      ? compositionLayoutMap.get(compositionLayoutKey(zone.id, facadeFace, segmentMeta.segmentOrdinal)) ?? null
      : null;
    const wallRole = resolveWallRole(zone, facadeFace, isInsideWall, isSpawnEntryWall);

    const descriptor: SegmentDescriptor = {
      frame,
      zone,
      facadeStyle,
      facadeFace,
      segmentOrdinal: segmentMeta?.segmentOrdinal ?? null,
      compositionPreset,
      isMainLane,
      isShopfront,
      isSideHall,
      isConnector,
      isCut,
      wallMaterialId,
      trimHeavyMaterialId,
      trimLightMaterialId,
      isInsideWall,
      isSpawnEntryWall,
      segHeight,
      segmentDensity,
      segmentMaxProtrusion,
      segSeed,
      cornerAtStart,
      cornerAtEnd,
      isSpawnOuterWall,
      isConnectorSpawnFacing,
      authoredDoorLayout,
      authoredWindowLayout,
      authoredBalconyLayout,
      authoredCompositionLayout,
      wallRole,
    };
    segmentDescriptorCache.set(index, descriptor);
    return descriptor;
  }

  function resolveAuthoredDoorStyleSpec(doorLayout: RuntimeDoorLayoutOverride | null): {
    spec: FacadeSpec | null;
    source: RuntimeDoorStyleSource | null;
  } {
    if (!doorLayout?.styleSource) {
      return { spec: null, source: null };
    }

    const source = doorLayout.styleSource;
    const sourceKey = authoredDoorLayoutKey(source.zoneId, source.face, source.segmentOrdinal);
    const cached = authoredDoorStyleSpecCache.get(sourceKey);
    if (cached) {
      return { spec: cached, source };
    }

    const sourceIndex = segmentKeyToIndex.get(sourceKey);
    if (typeof sourceIndex !== "number") {
      throw new Error(`[wall-detail] authored door style source '${sourceKey}' not found`);
    }

    const sourceDescriptor = describeSegment(sourceIndex);
    const sourceSpec = computeFacadeSpec({
      frame: sourceDescriptor.frame,
      zone: sourceDescriptor.zone,
      facadeFace: sourceDescriptor.facadeFace,
      segmentOrdinal: sourceDescriptor.segmentOrdinal,
      wallRole: sourceDescriptor.wallRole,
      compositionPreset: sourceDescriptor.compositionPreset,
      isMainLane: sourceDescriptor.isMainLane,
      isShopfrontZone: sourceDescriptor.isShopfront,
      isSideHall: sourceDescriptor.isSideHall,
      isConnector: sourceDescriptor.isConnector,
      isCut: sourceDescriptor.isCut,
      mapCenterX,
      mapCenterZ,
      profile: options.profile,
      facadeFamily: sourceDescriptor.facadeStyle.family,
      trimTier: sourceDescriptor.facadeStyle.trimTier,
      balconyStyle: sourceDescriptor.facadeStyle.balconyStyle,
      materialSlots: sourceDescriptor.facadeStyle.materials,
      wallMaterialId: sourceDescriptor.wallMaterialId,
      trimHeavyMaterialId: sourceDescriptor.trimHeavyMaterialId,
      trimLightMaterialId: sourceDescriptor.trimLightMaterialId,
      wallHeightM: sourceDescriptor.segHeight,
      maxProtrusionM: sourceDescriptor.segmentMaxProtrusion,
      density: sourceDescriptor.segmentDensity,
      rng: rootRng.fork(String(sourceDescriptor.segSeed)),
      instances: [],
      maxInstances: 1,
      cornerAtStart: sourceDescriptor.cornerAtStart,
      cornerAtEnd: sourceDescriptor.cornerAtEnd,
      isSpawnOuterWall: sourceDescriptor.isSpawnOuterWall,
      isConnectorSpawnFacing: sourceDescriptor.isConnectorSpawnFacing,
      doorModelPlacements: [],
      plinthHeight: 0,
      plinthDepth: 0,
      authoredDoorLayout: sourceDescriptor.authoredDoorLayout,
      authoredDoorStyleSpec: null,
      authoredDoorStyleSource: null,
      authoredWindowLayout: sourceDescriptor.authoredWindowLayout,
      authoredBalconyLayout: sourceDescriptor.authoredBalconyLayout,
      authoredCompositionLayout: sourceDescriptor.authoredCompositionLayout,
      windowModules: windowModuleMap,
      doorModules: doorModuleMap,
      heroBayModules: heroBayModuleMap,
    });
    if (!sourceSpec) {
      throw new Error(`[wall-detail] unable to resolve authored door style for source '${sourceKey}'`);
    }
    authoredDoorStyleSpecCache.set(sourceKey, sourceSpec);
    return { spec: sourceSpec, source };
  }
  let segmentsDecorated = 0;

  for (let index = 0; index < options.segments.length; index += 1) {
    const descriptor = describeSegment(index);
    segmentHeights.push(descriptor.segHeight);

    if (instances.length >= maxInstances) {
      continue;
    }
    const authoredDoorStyle = resolveAuthoredDoorStyleSpec(descriptor.authoredDoorLayout);

    const countBefore = instances.length;
    decorateSegment({
      frame: descriptor.frame,
      zone: descriptor.zone,
      wallRole: descriptor.wallRole,
      facadeFace: descriptor.facadeFace,
      segmentOrdinal: descriptor.segmentOrdinal,
      compositionPreset: descriptor.compositionPreset,
      isMainLane: descriptor.isMainLane,
      isShopfrontZone: descriptor.isShopfront,
      isSideHall: descriptor.isSideHall,
      isConnector: descriptor.isConnector,
      isCut: descriptor.isCut,
      mapCenterX,
      mapCenterZ,
      profile: options.profile,
      facadeFamily: descriptor.facadeStyle.family,
      trimTier: descriptor.facadeStyle.trimTier,
      balconyStyle: descriptor.facadeStyle.balconyStyle,
      materialSlots: descriptor.facadeStyle.materials,
      wallMaterialId: descriptor.wallMaterialId,
      trimHeavyMaterialId: descriptor.trimHeavyMaterialId,
      trimLightMaterialId: descriptor.trimLightMaterialId,
      wallHeightM: descriptor.segHeight,
      maxProtrusionM: descriptor.segmentMaxProtrusion,
      density: descriptor.segmentDensity,
      rng: rootRng.fork(String(descriptor.segSeed)),
      instances,
      maxInstances,
      cornerAtStart: descriptor.cornerAtStart,
      cornerAtEnd: descriptor.cornerAtEnd,
      isSpawnOuterWall: descriptor.isSpawnOuterWall,
      isConnectorSpawnFacing: descriptor.isConnectorSpawnFacing,
      doorModelPlacements,
      plinthHeight: 0,
      plinthDepth: 0,
      authoredDoorLayout: descriptor.authoredDoorLayout,
      authoredDoorStyleSpec: authoredDoorStyle.spec,
      authoredDoorStyleSource: authoredDoorStyle.source,
      authoredWindowLayout: descriptor.authoredWindowLayout,
      authoredBalconyLayout: descriptor.authoredBalconyLayout,
      authoredCompositionLayout: descriptor.authoredCompositionLayout,
      windowModules: windowModuleMap,
      doorModules: doorModuleMap,
      heroBayModules: heroBayModuleMap,
    });
    if (instances.length > countBefore) {
      segmentsDecorated += 1;
    }
  }

  return {
    instances,
    doorModelPlacements,
    segmentHeights,
    stats: {
      enabled: true,
      seed,
      density,
      segmentCount: options.segments.length,
      segmentsDecorated,
      instanceCount: instances.length,
    },
  };
}
