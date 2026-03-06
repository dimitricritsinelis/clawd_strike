import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type {
  RuntimeAnchorsSpec,
  RuntimeBlockoutZone,
  RuntimeFacadeOverride,
  RuntimeFacadeOverridePreset,
} from "./types";
import type { BoundarySegment } from "./buildBlockout";
import type { WallDetailInstance } from "./wallDetailKit";
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

function getTrimDims(wallHeightM: number): TrimDims {
  const stories = Math.max(1, Math.round(wallHeightM / STORY_HEIGHT_M));
  return TRIM_DIMS[stories] ?? TRIM_DIMS[3]!;
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
};

export type BuildWallDetailProfile = "blockout" | "pbr";

export type BuildWallDetailPlacementsOptions = {
  segments: readonly BoundarySegment[];
  zones: readonly RuntimeBlockoutZone[];
  anchors: RuntimeAnchorsSpec | null;
  facadeOverrides: readonly RuntimeFacadeOverride[];
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
  segmentHeights: number[];
  stats: WallDetailPlacementStats;
};

type WindowTreatment = "glass" | "dark" | "shuttered";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function isSpawnHeroFacade(ctx: SegmentDecorContext): boolean {
  return ctx.compositionPreset === "spawn_courtyard_landmark";
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
  const dims = getTrimDims(ctx.wallHeightM);
  const isHero = isSpawnHeroFacade(ctx);
  ctx.rng.range(0.18, 0.35); // consume
  ctx.rng.range(0.06, 0.14); // consume
  const tierHeightScale = ctx.trimTier === "hero" ? 1.08 : ctx.trimTier === "accented" ? 0.98 : 0.86;
  const tierDepthScale = ctx.trimTier === "hero" ? 1.18 : ctx.trimTier === "accented" ? 1.0 : 0.82;
  const capHeight = dims.parapetH * (isHero ? 1.18 : tierHeightScale);
  const capDepth = clamp(
    dims.parapetD * (isHero ? 1.35 : tierDepthScale),
    0.04,
    ctx.maxProtrusionM + 0.06,
  );
  const y = ctx.wallHeightM + capHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, 0, y, capDepth * 0.5, capDepth, capHeight, ctx.frame.lengthM);
  tagTrim(
    ctx.instances,
    isHero || ctx.trimTier === "hero" ? ctx.trimHeavyMaterialId : ctx.trimLightMaterialId,
  );
}

// ── Roof cap ───────────────────────────────────────────────────────────────

function placeRoofCap(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;

  const roofY = ctx.wallHeightM + ROOF_THICKNESS_M * 0.5;
  const roofLength = ctx.frame.lengthM;
  // Positive inwardN = toward walkable zone, negative = into building mass
  const centerInwardN = (ROOF_OVERHANG_M - ROOF_DEPTH_M) * 0.5;

  pushBox(
    ctx.instances, ctx.maxInstances,
    "roof_slab", ctx.wallMaterialId,
    ctx.frame,
    0,
    roofY,
    centerInwardN,
    ROOF_DEPTH_M + ROOF_OVERHANG_M,
    ROOF_THICKNESS_M,
    roofLength,
  );
  tagTrim(ctx.instances, null); // uses template roof material — not wall surface
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
  // Only enclose walls that need a building shell
  if (!ctx.isSpawnOuterWall && !ctx.isConnectorSpawnFacing) return;
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

function placePlinthStrip(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const dims = getTrimDims(ctx.wallHeightM);
  const isHero = isSpawnHeroFacade(ctx);
  ctx.rng.range(0.28, 0.48); // consume
  ctx.rng.range(0.06, 0.13); // consume
  const tierHeightScale = ctx.trimTier === "hero" ? 1.08 : ctx.trimTier === "accented" ? 0.96 : 0.84;
  const tierDepthScale = ctx.trimTier === "hero" ? 1.12 : ctx.trimTier === "accented" ? 0.95 : 0.8;
  const plinthHeight = dims.plinthH * (isHero ? 1.28 : tierHeightScale);
  const plinthDepth = clamp(
    dims.plinthD * (isHero ? 1.35 : tierDepthScale),
    0.04,
    ctx.maxProtrusionM + 0.06,
  );
  if (ctx.isSideHall) return; // side halls: no base trim (RNG consumed above for determinism)
  pushBox(ctx.instances, ctx.maxInstances, "plinth_strip", ctx.wallMaterialId,
    ctx.frame, 0, plinthHeight * 0.5, plinthDepth * 0.5,
    plinthDepth, plinthHeight, ctx.frame.lengthM);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId);
}

function placeStringCourses(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.5) return;
  const dims = getTrimDims(ctx.wallHeightM);
  ctx.rng.range(0.10, 0.18); // consume
  ctx.rng.range(0.06, 0.11); // consume
  if (isSpawnHeroFacade(ctx)) return;
  if (ctx.trimTier === "restrained" || ctx.facadeFamily === "service" || ctx.wallHeightM < STORY_HEIGHT_M * 3) {
    return;
  }
  const courseHeight = dims.courseH;
  const courseDepth = clamp(dims.courseD, 0.04, ctx.maxProtrusionM + 0.04);

  // At most 1 string course per facade — place only the first story break.
  let placed = false;
  for (let storyY = STORY_HEIGHT_M; storyY < ctx.wallHeightM - 0.5; storyY += STORY_HEIGHT_M) {
    if (!placed) {
      if (!pushBox(ctx.instances, ctx.maxInstances, "string_course_strip", ctx.wallMaterialId,
        ctx.frame, 0, storyY, courseDepth * 0.5,
        courseDepth, courseHeight, ctx.frame.lengthM)) {
        return;
      }
      tagTrim(ctx.instances, ctx.trimLightMaterialId);
      placed = true;
    }
    // Loop continues to keep iteration count stable (no RNG consumed per iteration).
  }
}

function placeCorniceStrip(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const dims = getTrimDims(ctx.wallHeightM);
  ctx.rng.range(0.18, 0.30); // consume
  ctx.rng.range(0.10, 0.19); // consume
  if (isSpawnHeroFacade(ctx)) return;
  const corniceHeight = dims.corniceH * (ctx.trimTier === "hero" ? 1.06 : ctx.trimTier === "accented" ? 0.98 : 0.84);
  const corniceDepth = clamp(
    dims.corniceD * (ctx.trimTier === "hero" ? 1.1 : ctx.trimTier === "accented" ? 0.96 : 0.8),
    0.06,
    ctx.maxProtrusionM + 0.08,
  );
  const y = ctx.wallHeightM - corniceHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, 0, y, corniceDepth * 0.5,
    corniceDepth, corniceHeight, ctx.frame.lengthM);
  tagTrim(ctx.instances, ctx.trimLightMaterialId);
}

// ── Corner piers ───────────────────────────────────────────────────────────

function placeCornerPiers(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.8) return;

  const dims = getTrimDims(ctx.wallHeightM);
  const isHero = isSpawnHeroFacade(ctx);
  const marginM = ctx.profile === "pbr" ? 0.04 : 0.02;
  const maxWidth = Math.max(0.28, Math.min(1.05, ctx.frame.lengthM * 0.4));
  // Consume RNG calls that were previously used for random dims (preserves sequence).
  ctx.rng.range(0.4, 0.72);   // was baseWidth
  ctx.rng.range(0.05, 0.1);   // was baseDepth
  ctx.rng.range(0.35, 0.75);  // was pierHeight offset
  const tierWidthScale = isHero ? 0.72 : ctx.trimTier === "hero" ? 0.88 : ctx.trimTier === "accented" ? 0.72 : 0.58;
  const tierDepthScale = isHero ? 0.9 : ctx.trimTier === "hero" ? 1.0 : ctx.trimTier === "accented" ? 0.78 : 0.62;
  const pierWidth = clamp(dims.pierW * tierWidthScale, 0.22, maxWidth);
  const pierDepth = clamp(dims.pierD * tierDepthScale, 0.05, ctx.maxProtrusionM);
  const pierHeight = ctx.wallHeightM; // full height — contiguous with roofline
  const halfLen = ctx.frame.lengthM * 0.5;

  // At corners the pier depth must cover all strip protrusions so it
  // visually bridges the perpendicular wall faces.
  const cornerDepth = Math.max(pierDepth, dims.plinthD, dims.courseD, dims.corniceD, dims.parapetD);

  for (const side of [-1, 1] as const) {
    const isCorner = (side === -1 && ctx.cornerAtStart) || (side === 1 && ctx.cornerAtEnd);
    const effectiveMargin = isCorner ? 0 : marginM;
    const effectiveDepth = isCorner ? cornerDepth : pierDepth;
    const capChance = clamp(
      0.22 + (ctx.isShopfrontZone ? 0.08 : 0) - (ctx.isSideHall ? 0.08 : 0) + ctx.density * 0.04,
      0.08, 0.45,
    );
    if ((ctx.isMainLane || ctx.zone?.type === "main_lane_segment") && !isCorner && ctx.trimTier !== "hero") {
      if (ctx.rng.next() < capChance) {
        ctx.rng.range(0.55, 1.05);
        ctx.rng.range(0.4, 0.62);
      }
      continue;
    }
    if (isHero && !isCorner) {
      if (ctx.rng.next() < capChance) {
        ctx.rng.range(0.55, 1.05);
        ctx.rng.range(0.4, 0.62);
      }
      continue;
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
    return 1;
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
    case "spawn_frontage":
      return Math.min(
        candidateColumns.length,
        Math.max(
          isHeroFrontage ? 3 : 2,
          Math.ceil((Math.max(1, doorCount) * 4) / Math.max(1, stories)) + (isHeroFrontage ? 1 : 0),
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

  const targetBayW =
    isFrontageWallRole(ctx.wallRole)
      ? ctx.rng.range(2.2, 3.0)
      : ctx.wallRole === "sidehall_outer_quiet"
        ? ctx.rng.range(2.6, 3.4)
        : ctx.rng.range(1.9, 2.5);
  let bayCount = Math.max(1, Math.round(usableLength / targetBayW));
  const doorCount = resolveDoorCountForWallRole(ctx.wallRole, usableLength, ctx.compositionPreset);

  if (doorCount === 1 && bayCount >= 2 && bayCount % 2 === 0) {
    bayCount = Math.max(1, bayCount - 1);
  }
  if (doorCount > 0 && bayCount < doorCount + 2) bayCount = doorCount + 2;
  const bayWidth = usableLength / bayCount;

  const windowW = clamp(
    bayWidth
      * (
        isFrontageWallRole(ctx.wallRole)
          ? ctx.rng.range(0.34, 0.46)
          : ctx.wallRole === "sidehall_outer_quiet"
            ? ctx.rng.range(0.26, 0.34)
            : ctx.rng.range(0.32, 0.44)
      ),
    0.52,
    bayWidth * 0.64,
  );
  const windowH =
    isFrontageWallRole(ctx.wallRole)
      ? ctx.rng.range(1.0, 1.26)
      : ctx.wallRole === "sidehall_outer_quiet"
        ? ctx.rng.range(0.92, 1.16)
        : ctx.rng.range(1.08, 1.38);
  ctx.rng.range(0.85, 1.05); // consume — sill now computed from trim centering
  const doorW = clamp(
    bayWidth
      * (
        isFrontageWallRole(ctx.wallRole)
          ? ctx.rng.range(0.50, 0.64)
          : ctx.wallRole === "sidehall_outer_quiet"
            ? ctx.rng.range(0.40, 0.50)
            : ctx.rng.range(0.44, 0.58)
      ),
    0.75,
    bayWidth * 0.74,
  );
  const doorH =
    ctx.facadeFamily === "merchant"
      ? ctx.rng.range(2.45, 2.72)
      : ctx.facadeFamily === "service"
        ? ctx.rng.range(2.18, 2.38)
        : ctx.rng.range(2.32, 2.58);
  const recessDepth = ctx.rng.range(0.10, 0.16);
  const frameThickness = ctx.rng.range(0.11, 0.17);
  const frameDepth = clamp(ctx.rng.range(0.09, 0.13), 0.06, ctx.maxProtrusionM + 0.08);
  const jambDepth = clamp(ctx.rng.range(0.10, 0.16), 0.06, ctx.maxProtrusionM + 0.10);

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
    return story >= 1 ? "glass" : "dark";
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
    case "spawn_courtyard_landmark":
      return story === spec.stories - 1 ? "glass" : "dark";
    default:
      return "glass";
  }
}

function placeWindowOpening(
  ctx: SegmentDecorContext,
  centerS: number,
  sillY: number,
  spec: FacadeSpec,
  treatment: WindowTreatment,
): void {
  const centerY = sillY + spec.windowH * 0.5;
  const revealW = spec.windowW * 0.84;
  const revealH = spec.windowH * 0.82;
  const shutterLeafW = revealW * 0.46;

  // 1. Dark backing panel — smaller than the outer frame so the opening reads recessed.
  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, centerY, 0.008,
    0.016, revealH, revealW);

  if (treatment === "glass") {
    pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
      ctx.frame, centerS, centerY, 0.015,
      WINDOW_GLASS_THICKNESS_M, revealH, revealW);

    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", null,
      ctx.frame, centerS, centerY, 0.018,
      0.035, 0.05, revealW * 0.94);

    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", null,
      ctx.frame, centerS, centerY, 0.018,
      0.035, revealH * 0.94, 0.05);
  } else if (treatment === "shuttered") {
    for (const side of [-1, 1] as const) {
      pushBox(ctx.instances, ctx.maxInstances, "window_shutter", null,
        ctx.frame, centerS + side * shutterLeafW * 0.52, centerY, 0.02,
        0.04, revealH * 0.98, shutterLeafW);
    }
  }

  // 2. Frame jambs — thicker and deeper so windows stop reading as painted stickers.
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (revealW + spec.frameThickness) * 0.5, centerY, spec.frameDepth * 0.6,
      spec.frameDepth * 1.05, revealH + spec.frameThickness * 1.35, spec.frameThickness);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
  }

  // 3. Sill shelf — wider and deeper than the lintel so it reads at range.
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY - spec.frameThickness * 0.5, spec.frameDepth * 0.8,
    spec.frameDepth * 1.7, spec.frameThickness * 1.15, revealW + spec.frameThickness * 2.3);
  tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);

  // 4. Lintel — slightly shallower than the sill so the opening gets a stronger value break.
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY + revealH + spec.frameThickness * 0.55, spec.frameDepth * 0.55,
    spec.frameDepth * 1.1, spec.frameThickness * 1.3, revealW + spec.frameThickness * 2.1);
  tagTrim(ctx.instances, ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId);
}

// ── Arched door placement (uniform dimensions from spec) ───────────────────

function placeArchedDoor(
  ctx: SegmentDecorContext,
  centerS: number,
  spec: FacadeSpec,
): void {
  // 1. Dark void — flush with wall surface (tiny offset prevents z-fighting)
  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, spec.doorH * 0.5, 0.003,
    0.006, spec.doorH, spec.doorW);

  // 2. Lintel bar — marks the top edge of the opening
  pushBox(ctx.instances, ctx.maxInstances, "door_lintel", null,
    ctx.frame, centerS, spec.doorH + spec.frameThickness * 0.5, spec.frameDepth * 0.5,
    spec.frameDepth, spec.frameThickness, spec.doorW + spec.frameThickness * 2);
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

  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, centerY, 0.008,
    0.016, openingH * 0.9, openingW * 0.88);

  pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
    ctx.frame, centerS, centerY, 0.015,
    WINDOW_GLASS_THICKNESS_M, openingH * 0.88, openingW * 0.86);

  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (openingW + spec.frameThickness) * 0.5, centerY, spec.frameDepth * 0.6,
      spec.frameDepth * 1.08, openingH + spec.frameThickness * 1.25, spec.frameThickness);
    tagTrim(ctx.instances, ctx.trimHeavyMaterialId ?? ctx.trimLightMaterialId);
  }

  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, storyBaseY + BALCONY_DOOR_SILL_OFFSET + openingH + spec.frameThickness * 0.55,
    spec.frameDepth * 0.55,
    spec.frameDepth * 1.1, spec.frameThickness * 1.25, openingW + spec.frameThickness * 2.15);
  tagTrim(ctx.instances, ctx.trimLightMaterialId ?? ctx.trimHeavyMaterialId);
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

  ctx.rng.range(0.04, 0.09); // consume
  ctx.rng.range(0.14, 0.24); // consume

  // Spawn hero pass removes pilasters — they flatten the silhouette into a repeated grid.
  // RNG consumed above to preserve downstream determinism.
  return;
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
    const leftAvailable = countContiguousWindowColumns(spec, doorColumn, -1, 2);
    const rightAvailable = countContiguousWindowColumns(spec, doorColumn, 1, 2);
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
  const leftAvailable = countContiguousWindowColumns(spec, preferredDoor, -1, 2);
  const rightAvailable = countContiguousWindowColumns(spec, preferredDoor, 1, 2);

  let leftBays = 0;
  let rightBays = 0;

  if (leftAvailable > 0 && rightAvailable > 0) {
    leftBays = 1;
    rightBays = 1;
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
  if (totalBays < 4) {
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
    upperDoorOpenings.add(`${preferredDoor}:2`);
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

  // Horizontal banding
  placePlinthStrip(ctx);
  placeStringCourses(ctx);
  placeCorniceStrip(ctx);

  // Compute facade spec — all proportions decided once
  const spec = computeFacadeSpec(ctx);
  if (!spec) {
    placeCableSegments(ctx);
    return;
  }

  // Pilasters aligned to the bay grid
  placePilasters(ctx, spec);

  const balconyPlan = computeBalconyPlacements(spec);

  // Walk columns × stories with vertical coherence
  const trimDims = getTrimDims(ctx.wallHeightM);
  for (let col = 0; col < spec.bayCount; col += 1) {
    const role = spec.columnRoles[col]!;
    const centerS = columnCenterS(spec, col);

    for (let story = 0; story < spec.stories; story += 1) {
      const storyBaseY = story * STORY_HEIGHT_M;

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
          // Center window vertically between the horizontal trim below and above.
          const belowTop = story === 0
            ? (ctx.isSideHall ? 0 : trimDims.plinthH)
            : storyBaseY + trimDims.courseH * 0.5;
          const aboveBot = story === spec.stories - 1
            ? ctx.wallHeightM - trimDims.corniceH
            : (story + 1) * STORY_HEIGHT_M - trimDims.courseH * 0.5;
          const sillY = (belowTop + aboveBot) * 0.5 - spec.windowH * 0.5;
          placeWindowOpening(ctx, centerS, sillY, spec, resolveWindowTreatment(spec, col, story));
        }
      }
    }

  }

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
  const segmentHeights: number[] = [];

  if (!options.enabled || options.segments.length === 0) {
    return {
      instances,
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
  let segmentsDecorated = 0;

  for (let index = 0; index < options.segments.length; index += 1) {
    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const facadeStyle = resolveFacadeStyleForSegment(zone, frame);
    const facadeFace = resolveFacadeFaceForSegment(zone, frame);
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

    // Compute per-segment height.
    // Seed is zone-scoped (no segment index) so every wall segment belonging to
    // the same zone resolves to the same story count — eliminating the corner
    // holes and floating slabs caused by per-segment independent height picks.
    //
    // Side-hall inner walls use the same spatial test as shouldSkipDoors():
    // if sign(centerX − mapCenterX) === sign(inwardX), the inward vector points
    // away from map centre → this wall faces the building block → inner wall.
    const isInsideWall = isSideHall
      && Math.abs(frame.inwardX) > 0.5
      && Math.sign(frame.centerX - mapCenterX) !== 0
      && Math.sign(frame.centerX - mapCenterX) === Math.sign(frame.inwardX);
    // Spawn entry wall: the one face of the spawn plaza that looks toward the bazaar.
    // Detection: wall centerZ is between the spawn's own Z-center and mapCenterZ.
    let isSpawnEntryWall = false;
    if (zone?.type === "spawn_plaza") {
      const spawnCenterZ = zone.rect.y + zone.rect.h / 2;
      isSpawnEntryWall = (frame.centerZ - spawnCenterZ) * (mapCenterZ - spawnCenterZ) > 0;
    }
    // Connector main-lane-facing wall: the wall's inward normal points away from
    // the map centre (toward the spawn), meaning the wall's visible face looks
    // toward the map centre (toward the main-lane buildings).  These walls are the
    // backs of 3-story main-lane buildings and must stay at 9 m.
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
    const segHeight = resolveSegmentWallHeight(options.wallHeightM, zone, heightRng, isInsideWall, isSpawnEntryWall, isConnectorMainLaneFacing);
    segmentHeights.push(segHeight);

    if (instances.length >= maxInstances) {
      continue;
    }

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
    const segRng = rootRng.fork(String(segSeed));

    // Determine which endpoints are 90° corners (perpendicular segment meets).
    let cornerAtStart: boolean;
    let cornerAtEnd: boolean;
    if (segment.orientation === "vertical") {
      cornerAtStart = cornerKeys.has(toCornerKey(segment.coord, segment.start));
      cornerAtEnd   = cornerKeys.has(toCornerKey(segment.coord, segment.end));
    } else {
      cornerAtStart = cornerKeys.has(toCornerKey(segment.start, segment.coord));
      cornerAtEnd   = cornerKeys.has(toCornerKey(segment.end, segment.coord));
    }

    // Spawn outer wall: any spawn_plaza wall that is NOT the entry wall facing bazaar.
    const isSpawnOuterWall = zone?.type === "spawn_plaza" && !isSpawnEntryWall;
    // Connector spawn-facing wall: the opposite of main-lane-facing.
    const isConnectorSpawnFacing = zone?.type === "connector" && !isConnectorMainLaneFacing;
    const wallRole = resolveWallRole(
      zone,
      facadeFace,
      isInsideWall,
      isSpawnEntryWall,
    );

    const countBefore = instances.length;
    decorateSegment({
      frame,
      zone,
      wallRole,
      facadeFace,
      compositionPreset,
      isMainLane,
      isShopfrontZone: isShopfront,
      isSideHall,
      isConnector,
      isCut,
      mapCenterX,
      mapCenterZ,
      profile: options.profile,
      facadeFamily: facadeStyle.family,
      trimTier: facadeStyle.trimTier,
      balconyStyle: facadeStyle.balconyStyle,
      materialSlots: facadeStyle.materials,
      wallMaterialId,
      trimHeavyMaterialId,
      trimLightMaterialId,
      wallHeightM: segHeight,
      maxProtrusionM: segmentMaxProtrusion,
      density: segmentDensity,
      rng: segRng,
      instances,
      maxInstances,
      cornerAtStart,
      cornerAtEnd,
      isSpawnOuterWall,
      isConnectorSpawnFacing,
    });
    if (instances.length > countBefore) {
      segmentsDecorated += 1;
    }
  }

  return {
    instances,
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
