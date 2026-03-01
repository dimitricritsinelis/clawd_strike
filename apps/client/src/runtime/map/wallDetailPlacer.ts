import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeAnchorsSpec, RuntimeBlockoutZone } from "./types";
import type { BoundarySegment } from "./buildBlockout";
import type { WallDetailInstance } from "./wallDetailKit";
import { resolveWallMaterialIdForZone } from "./wallMaterialAssignment";

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

// Roof cap constants
// 4 m depth ensures a solid-looking roofline without slabs floating above shorter adjacent zones.
const ROOF_DEPTH_M = 4.0;
const ROOF_THICKNESS_M = 0.20;
const ROOF_OVERHANG_M = 0.15;

// Balcony constants
const BALCONY_DEPTH_M = 1.1;
const BALCONY_SLAB_THICKNESS_M = 0.12;
const BALCONY_WALL_H = 0.95;
const BALCONY_WALL_THICKNESS_M = 0.15;
const BALCONY_DOOR_H = 2.2;
const BALCONY_DOOR_SILL_OFFSET = 0.08;
// 35 % facade-level gate: if a non-spawn facade wins the roll, ALL its door
// columns get balconies → coherent decorated/clean rhythm across a block face.
const FACADE_BALCONY_CHANCE = 0.35;
const BALCONY_ELIGIBLE_ZONES = new Set(["main_lane_segment", "spawn_plaza"]);

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

type FacadeSpec = {
  bayCount: number;
  bayWidth: number;
  usableLength: number;
  stories: number;
  columnRoles: ColumnRole[];
  windowW: number;
  windowH: number;
  sillOffset: number;
  doorW: number;
  doorH: number;
  recessDepth: number;
  frameThickness: number;
  frameDepth: number;
  jambDepth: number;
};

type SegmentDecorContext = {
  frame: SegmentFrame;
  zone: RuntimeBlockoutZone | null;
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
  wallMaterialId: string;
  wallHeightM: number;
  maxProtrusionM: number;
  density: number;
  rng: DeterministicRng;
  instances: WallDetailInstance[];
  maxInstances: number;
};

export type BuildWallDetailProfile = "blockout" | "pbr";

export type BuildWallDetailPlacementsOptions = {
  segments: readonly BoundarySegment[];
  zones: readonly RuntimeBlockoutZone[];
  anchors: RuntimeAnchorsSpec | null;
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
  };
  if (pitchRad !== undefined) instance.pitchRad = pitchRad;
  if (rollRad !== undefined) instance.rollRad = rollRad;
  instances.push(instance);

  return true;
}

// ── Per-segment height variation ───────────────────────────────────────────

function resolveSegmentWallHeight(
  baseHeight: number,
  zone: RuntimeBlockoutZone | null,
  _rng: DeterministicRng,
  isInsideWall: boolean,
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

  // Spawn plazas raised to match main-lane height so building corners at the
  // spawn-to-lane transition (Z=14 / Z=68) are fully enclosed at all three stories.
  // At 6 m the south face of the building block was 3 m shorter than the main-lane
  // side face, leaving a visible 3rd-floor gap at every spawn-entry corner.
  if (zoneType === "spawn_plaza") {
    return 3 * STORY_HEIGHT_M; // 9 m fixed — matches main-lane height
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

  // Connector zones sit at building corners between spawn plazas (9 m) and side-hall
  // inner walls (9 m). Leaving them at the 6 m spec default creates a visible 3 m
  // rectangular gap at every corner — raise them to flush 9 m.
  if (zoneType === "connector") {
    return 3 * STORY_HEIGHT_M; // 9 m — closes corner gap
  }

  return baseHeight;
}

// ── Parapet cap ────────────────────────────────────────────────────────────

function placeParapetCap(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const capHeight = ctx.rng.range(0.18, 0.35);
  const capDepth = clamp(ctx.rng.range(0.06, 0.14), 0.04, ctx.maxProtrusionM + 0.06);
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 0.5;
  const y = ctx.wallHeightM + capHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, 0, y, capDepth * 0.5, capDepth, capHeight, usableLength);
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
    "balcony_slab", ctx.wallMaterialId,
    ctx.frame,
    0,
    roofY,
    centerInwardN,
    ROOF_DEPTH_M + ROOF_OVERHANG_M,
    ROOF_THICKNESS_M,
    roofLength,
  );
}

// ── Horizontal banding ─────────────────────────────────────────────────────

function placePlinthStrip(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const plinthHeight = ctx.rng.range(0.28, 0.48);
  const plinthDepth = clamp(ctx.rng.range(0.06, 0.13), 0.04, ctx.maxProtrusionM + 0.06);
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 0.3) return;
  pushBox(ctx.instances, ctx.maxInstances, "plinth_strip", ctx.wallMaterialId,
    ctx.frame, 0, plinthHeight * 0.5, plinthDepth * 0.5,
    plinthDepth, plinthHeight, usableLength);
}

function placeStringCourses(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.5) return;
  const courseHeight = ctx.rng.range(0.10, 0.18);
  const courseDepth = clamp(ctx.rng.range(0.06, 0.11), 0.04, ctx.maxProtrusionM + 0.04);
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 0.5) return;

  for (let storyY = STORY_HEIGHT_M; storyY < ctx.wallHeightM - 0.5; storyY += STORY_HEIGHT_M) {
    if (!pushBox(ctx.instances, ctx.maxInstances, "string_course_strip", ctx.wallMaterialId,
      ctx.frame, 0, storyY, courseDepth * 0.5,
      courseDepth, courseHeight, usableLength)) {
      return;
    }
  }
}

function placeCorniceStrip(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 1.0) return;
  const corniceHeight = ctx.rng.range(0.18, 0.30);
  const corniceDepth = clamp(ctx.rng.range(0.10, 0.19), 0.06, ctx.maxProtrusionM + 0.08);
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 0.5) return;
  const y = ctx.wallHeightM - corniceHeight * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "cornice_strip", ctx.wallMaterialId,
    ctx.frame, 0, y, corniceDepth * 0.5,
    corniceDepth, corniceHeight, usableLength);
}

// ── Corner piers ───────────────────────────────────────────────────────────

function placeCornerPiers(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.8) return;

  const marginM = ctx.profile === "pbr" ? 0.04 : 0.02;
  const maxWidth = Math.max(0.28, Math.min(1.05, ctx.frame.lengthM * 0.4));
  const baseWidth = ctx.profile === "pbr"
    ? ctx.rng.range(0.4, 0.72)
    : ctx.rng.range(0.42, 0.78);
  const pierWidth = clamp(baseWidth, 0.3, maxWidth);
  const baseDepth = ctx.profile === "pbr"
    ? ctx.rng.range(0.05, 0.1)
    : ctx.rng.range(0.08, 0.14);
  const pierDepth = clamp(baseDepth, 0.05, ctx.maxProtrusionM);
  const heightBias = ctx.isMainLane ? 0.15 : 0;
  const pierHeight = clamp(ctx.wallHeightM - ctx.rng.range(0.35 - heightBias, 0.75), 3, ctx.wallHeightM);
  const halfLen = ctx.frame.lengthM * 0.5;

  for (const side of [-1, 1] as const) {
    const s = side * Math.max(0.02, halfLen - pierWidth * 0.5 - marginM);
    if (!pushBox(
      ctx.instances, ctx.maxInstances, "corner_pier", ctx.wallMaterialId,
      ctx.frame, s, pierHeight * 0.5, pierDepth * 0.5,
      pierDepth, pierHeight, pierWidth,
    )) {
      return;
    }

    const capChance = clamp(
      0.22 + (ctx.isShopfrontZone ? 0.08 : 0) - (ctx.isSideHall ? 0.08 : 0) + ctx.density * 0.04,
      0.08, 0.45,
    );
    if (ctx.rng.next() < capChance) {
      const capDepth = clamp(pierDepth * 0.7, 0.04, ctx.maxProtrusionM);
      const capHeight = clamp(ctx.rng.range(0.55, 1.05), 0.45, pierHeight * 0.42);
      const capWidth = clamp(pierWidth * ctx.rng.range(0.4, 0.62), 0.18, pierWidth);
      if (!pushBox(
        ctx.instances, ctx.maxInstances, "corner_pier", ctx.wallMaterialId,
        ctx.frame, s, pierHeight - capHeight * 0.5, capDepth * 0.5,
        capDepth, capHeight, capWidth,
      )) {
        return;
      }
    }
  }
}

// ── Zone-aware door placement policy ────────────────────────────────────────

type DoorPolicy = {
  /** Minimum wall length that qualifies for a door at all. */
  minSegmentLengthForDoor: number;
  /** Approximate spacing between door centres (doors = floor(length / this)). */
  metersPerDoor: number;
  /** Hard cap on door count. */
  maxDoors: number;
  /** Probability [0,1] that ANY door is placed on this segment. */
  probabilityOfAny: number;
};

const NO_DOOR_POLICY: DoorPolicy = {
  minSegmentLengthForDoor: Infinity,
  metersPerDoor: Infinity,
  maxDoors: 0,
  probabilityOfAny: 0,
};

/**
 * Returns true when this wall segment should have NO doors at all.
 *
 * Uses the inward vector to determine whether a wall faces "inside" (toward the
 * map centre / building back) or "outside" (toward the perimeter / corridor).
 *
 * Rule: `sign(frame.center − mapCenter) === sign(frame.inward)` → inside wall.
 */
function shouldSkipDoors(ctx: SegmentDecorContext): boolean {
  if (!ctx.zone) return false;

  // Connectors and cuts are always doorless.
  if (ctx.isConnector || ctx.isCut) return true;

  // Main-lane and shopfront walls always get doors (spatial filtering
  // is handled by minSegmentLengthForDoor in getDoorPolicy instead).
  if (ctx.isMainLane || ctx.isShopfrontZone) return false;

  // Side halls: horizontal end-caps (short ~6.5 m) are always skipped.
  // Vertical inside walls (back of main-lane buildings) are also skipped;
  // outside walls (perimeter) get sparse doors.
  if (ctx.isSideHall) {
    const isVertical = Math.abs(ctx.frame.inwardX) > 0.5;
    if (!isVertical) return true; // horizontal end caps
    // Inside wall: inward vector points same way as offset from map centre.
    const offsetSign = Math.sign(ctx.frame.centerX - ctx.mapCenterX);
    return offsetSign !== 0 && offsetSign === Math.sign(ctx.frame.inwardX);
  }

  // Spawn plazas: inner walls (facing toward the main lane interior) are skipped;
  // outer walls (long back wall + short side walls) get doors.
  if (ctx.zone.type === "spawn_plaza") {
    const isHorizontal = Math.abs(ctx.frame.inwardZ) > 0.5;
    if (isHorizontal) {
      // Inner if inwardZ points the same way as Z-offset from map centre.
      const offsetSign = Math.sign(ctx.frame.centerZ - ctx.mapCenterZ);
      return offsetSign !== 0 && offsetSign === Math.sign(ctx.frame.inwardZ);
    } else {
      // Vertical side wall — inner if inwardX points same way as X-offset.
      const offsetSign = Math.sign(ctx.frame.centerX - ctx.mapCenterX);
      return offsetSign !== 0 && offsetSign === Math.sign(ctx.frame.inwardX);
    }
  }

  return true; // unknown zone type → no doors
}

function getDoorPolicy(ctx: SegmentDecorContext): DoorPolicy {
  if (shouldSkipDoors(ctx)) return NO_DOOR_POLICY;

  // Side-hall outside (perimeter) walls — 4 sparse doors across ~62 m.
  if (ctx.isSideHall) {
    return { minSegmentLengthForDoor: 3.0, metersPerDoor: 15.0, maxDoors: 4, probabilityOfAny: 1.0 };
  }

  // Main lane / shopfront.
  if (ctx.isMainLane || ctx.isShopfrontZone) {
    // BZ_M1 and BZ_M3 directly border the spawns — use fewer, wider-spaced doors.
    // minSegmentLengthForDoor=8.0 filters the short jog sub-segments (<8 m) that
    // appear at BZ_M1/BZ_M2 and BZ_M2/BZ_M3 junctions.
    const zoneId = ctx.zone?.id ?? "";
    if (zoneId === "BZ_M1" || zoneId === "BZ_M3") {
      return { minSegmentLengthForDoor: 8.0, metersPerDoor: 8.5, maxDoors: 2, probabilityOfAny: 1.0 };
    }
    return { minSegmentLengthForDoor: 3.0, metersPerDoor: 5.5, maxDoors: 3, probabilityOfAny: 1.0 };
  }

  // Spawn plazas — outer walls only (inner were excluded by shouldSkipDoors).
  if (ctx.zone?.type === "spawn_plaza") {
    const isHorizontal = Math.abs(ctx.frame.inwardZ) > 0.5;
    if (isHorizontal) {
      // Long outer wall (~22 m) — 3 evenly spaced doors.
      return { minSegmentLengthForDoor: 3.0, metersPerDoor: 7.0, maxDoors: 3, probabilityOfAny: 1.0 };
    } else {
      // Short side wall (~14 m) — 1 centred door.
      return { minSegmentLengthForDoor: 3.0, metersPerDoor: 14.0, maxDoors: 1, probabilityOfAny: 1.0 };
    }
  }

  return NO_DOOR_POLICY;
}

function computeDoorCount(usableLength: number, policy: DoorPolicy, rng: DeterministicRng): number {
  if (usableLength < policy.minSegmentLengthForDoor) return 0;
  if (policy.maxDoors === 0) return 0;
  if (rng.next() > policy.probabilityOfAny) return 0;
  const rawCount = Math.max(1, Math.floor(usableLength / policy.metersPerDoor));
  return Math.min(rawCount, policy.maxDoors);
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

// ── Facade spec: decide all proportions ONCE per segment ───────────────────

function computeFacadeSpec(ctx: SegmentDecorContext): FacadeSpec | null {
  const usableLength = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 1.4) return null;

  const stories = Math.max(1, Math.floor(ctx.wallHeightM / STORY_HEIGHT_M));

  // Uniform bay width — pick a target, then round to get an integer count.
  // Pre-compute door count first so we can guarantee enough bays for doors + margins.
  const doorPolicy = getDoorPolicy(ctx);
  const doorCount = computeDoorCount(usableLength, doorPolicy, ctx.rng);

  const targetBayW = ctx.rng.range(1.8, 2.6);
  let bayCount = Math.max(1, Math.round(usableLength / targetBayW));
  // Force odd bay count for single-door segments → door lands on exact center bay.
  if (doorCount === 1 && bayCount >= 2 && bayCount % 2 === 0) {
    bayCount = Math.max(1, bayCount - 1);
  }
  // Ensure enough bays for doors (each door needs at least one margin bay on each side).
  if (doorCount > 0 && bayCount < doorCount + 2) bayCount = doorCount + 2;
  const bayWidth = usableLength / bayCount;

  // Uniform opening dimensions for the entire facade
  const windowW = clamp(bayWidth * ctx.rng.range(0.35, 0.50), 0.55, bayWidth * 0.62);
  const windowH = ctx.rng.range(1.05, 1.35);
  const sillOffset = ctx.rng.range(0.85, 1.05);
  const doorW = clamp(bayWidth * ctx.rng.range(0.45, 0.60), 0.75, bayWidth * 0.72);
  const doorH = ctx.rng.range(2.35, 2.65);
  const recessDepth = ctx.rng.range(0.07, 0.12);
  const frameThickness = ctx.rng.range(0.09, 0.14);
  const frameDepth = clamp(ctx.rng.range(0.06, 0.10), 0.04, ctx.maxProtrusionM + 0.06);
  const jambDepth = clamp(ctx.rng.range(0.10, 0.16), 0.06, ctx.maxProtrusionM + 0.10);

  // Assign column roles: deterministic symmetric placement.
  // Primary walls (door-bearing): windows at even distances from each door.
  // Secondary walls (doorless, non-connector/cut): sparse windows every 3rd from center.
  // Connectors/cuts: all blank.
  const columnRoles: ColumnRole[] = Array.from(
    { length: bayCount }, () => "blank" as ColumnRole,
  );

  if (doorCount > 0) {
    // PRIMARY wall: doors + symmetric windows at even distances from each door
    const doorCols = assignDoorColumns(bayCount, doorCount);

    for (const col of doorCols) {
      columnRoles[col] = "door";
    }

    // Windows at ODD distances from nearest door (1, 3, 5…); even distances stay blank.
    // Produces tight  _ W _ W D W _ W _  clusters centered on each door.
    // Window columns are balcony candidates — balconies replace windows at render time.
    for (let col = 0; col < bayCount; col += 1) {
      if (columnRoles[col] !== "blank") continue;

      let minDoorDist = bayCount;
      for (const dc of doorCols) {
        minDoorDist = Math.min(minDoorDist, Math.abs(col - dc));
      }

      if (minDoorDist % 2 === 1) {              // odd distance → window
        columnRoles[col] = "window";
      }
      // even distance (≥ 2) → stays blank
    }
  } else if (!ctx.isConnector && !ctx.isCut) {
    // SECONDARY wall (doorless): sparse windows at every 3rd position from center
    const center = Math.floor(bayCount / 2);
    for (let dist = 3; dist <= center; dist += 3) {
      if (center - dist >= 0) columnRoles[center - dist] = "window";
      if (center + dist < bayCount) columnRoles[center + dist] = "window";
    }
  }
  // Connectors/cuts: all blank — no windows

  return {
    bayCount, bayWidth, usableLength, stories, columnRoles,
    windowW, windowH, sillOffset, doorW, doorH,
    recessDepth, frameThickness, frameDepth, jambDepth,
  };
}

// ── Column center position from uniform grid ───────────────────────────────

function columnCenterS(spec: FacadeSpec, columnIndex: number): number {
  return -spec.usableLength * 0.5 + spec.bayWidth * (columnIndex + 0.5);
}

// ── Window placement (uniform dimensions from spec) ────────────────────────

function placeWindowOpening(
  ctx: SegmentDecorContext,
  centerS: number,
  storyBaseY: number,
  spec: FacadeSpec,
): void {
  const sillY = storyBaseY + spec.sillOffset;
  const centerY = sillY + spec.windowH * 0.5;

  // 1. Dark void — flush with wall surface (tiny offset prevents z-fighting)
  pushBox(ctx.instances, ctx.maxInstances, "door_void", null,
    ctx.frame, centerS, centerY, 0.003,
    0.006, spec.windowH, spec.windowW);

  // 2. Glass pane — in front of void, behind frames
  pushBox(ctx.instances, ctx.maxInstances, "window_glass", null,
    ctx.frame, centerS, centerY, 0.015,
    WINDOW_GLASS_THICKNESS_M, spec.windowH, spec.windowW);

  // 3–4. Frame jambs — protruding forward, creating depth contrast with void
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", ctx.wallMaterialId,
      ctx.frame, centerS + side * (spec.windowW + spec.frameThickness) * 0.5, centerY, spec.frameDepth * 0.5,
      spec.frameDepth, spec.windowH + spec.frameThickness, spec.frameThickness);
  }

  // 5. Sill shelf — protruding ledge (wider + deeper than lintel)
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY - spec.frameThickness * 0.5, spec.frameDepth * 0.65,
    spec.frameDepth * 1.4, spec.frameThickness, spec.windowW + spec.frameThickness * 2);

  // 6. Lintel — slightly thicker for visual weight
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", ctx.wallMaterialId,
    ctx.frame, centerS, sillY + spec.windowH + spec.frameThickness * 0.5, spec.frameDepth * 0.5,
    spec.frameDepth, spec.frameThickness * 1.2, spec.windowW + spec.frameThickness * 2);

  // 7. Horizontal crossbar across glass center
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_h", null,
    ctx.frame, centerS, centerY, 0.018,
    0.035, 0.055, spec.windowW * 0.92);

  // 8. Vertical crossbar
  pushBox(ctx.instances, ctx.maxInstances, "recessed_panel_frame_v", null,
    ctx.frame, centerS, centerY, 0.018,
    0.035, spec.windowH * 0.92, 0.055);

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

// ── Balcony placement (stone balustrade style) ─────────────────────────────

function placeBalcony(
  ctx: SegmentDecorContext,
  doorCenterS: number,   // french door stays on the door column
  storyBaseY: number,
  spec: FacadeSpec,
  leftBays: number,      // 0 or 1 — window columns available to the left of the door
  rightBays: number,     // 0 or 1 — window columns available to the right of the door
): void {
  const totalBays   = 1 + leftBays + rightBays;          // 1, 2, or 3
  const balconyW    = totalBays * spec.bayWidth;
  // Slab centre is offset so the slab spans its actual columns while the
  // french door remains visually on the door column.
  const slabCenterS = doorCenterS + (rightBays - leftBays) * spec.bayWidth * 0.5;
  const slabY = storyBaseY + BALCONY_SLAB_THICKNESS_M * 0.5;

  // 1. Slab — extends outward toward walkable zone (positive inwardN)
  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, slabCenterS, slabY, BALCONY_DEPTH_M * 0.5,
    BALCONY_DEPTH_M, BALCONY_SLAB_THICKNESS_M, balconyW);

  // 2. French door opening — taller & wider than regular window, starts near floor
  const doorW = clamp(balconyW * 0.70, spec.bayWidth * 0.52, balconyW * 0.78);
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

  // 3. Stone balustrade — front wall at outer edge of slab
  const wallY = storyBaseY + BALCONY_SLAB_THICKNESS_M + BALCONY_WALL_H * 0.5;
  pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
    ctx.frame, slabCenterS, wallY, BALCONY_DEPTH_M,
    BALCONY_WALL_THICKNESS_M, BALCONY_WALL_H, balconyW);

  // 4. Stone balustrade — side walls
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
      ctx.frame, slabCenterS + side * balconyW * 0.5, wallY, BALCONY_DEPTH_M * 0.5,
      BALCONY_DEPTH_M, BALCONY_WALL_H, BALCONY_WALL_THICKNESS_M);
  }

  // 5. Support brackets — small stone corbels under slab
  const bracketH = 0.25;
  const bracketD = 0.3;
  for (const side of [-1, 1] as const) {
    pushBox(ctx.instances, ctx.maxInstances, "balcony_slab", ctx.wallMaterialId,
      ctx.frame, slabCenterS + side * (balconyW * 0.35), storyBaseY - bracketH * 0.5, bracketD * 0.5,
      bracketD, bracketH, 0.12);
  }
}

// ── Pilasters aligned to bay grid ──────────────────────────────────────────

function placePilasters(ctx: SegmentDecorContext, spec: FacadeSpec): void {
  if (spec.bayCount < 2) return;
  if (ctx.frame.lengthM < 3.0) return;

  const pilasterDepth = clamp(ctx.rng.range(0.04, 0.09), 0.03, ctx.maxProtrusionM + 0.02);
  const pilasterWidth = ctx.rng.range(0.14, 0.24);
  const pilasterHeight = ctx.wallHeightM;

  // Place between bay columns — aligned to the same grid as openings
  for (let i = 1; i < spec.bayCount; i += 1) {
    const s = -spec.usableLength * 0.5 + spec.bayWidth * i;
    if (!pushBox(ctx.instances, ctx.maxInstances, "pilaster", ctx.wallMaterialId,
      ctx.frame, s, pilasterHeight * 0.5, pilasterDepth * 0.5,
      pilasterDepth, pilasterHeight, pilasterWidth)) {
      return;
    }
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

// ── Main decoration orchestrator ───────────────────────────────────────────

function decorateSegment(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < SEGMENT_EDGE_MARGIN_M * 2) return;

  // Structural framing
  placeCornerPiers(ctx);
  placeParapetCap(ctx);
  placeRoofCap(ctx);

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

  // Pre-compute balcony placements.
  //
  // SPAWN PLAZA: 100% chance on every door column → both side walls of a
  // spawn (x≈14 and x≈36) always carry matching balconies — guaranteed
  // left/right symmetry.  Wing count is still facade-spec-driven so each
  // segment produces the widest slab its own column layout allows.
  //
  // MAIN LANE + other eligible zones: staged two-level decision —
  //   Level 1 — facade gate (35 %): whole facade is either decorated or clean.
  //   Level 2 — per-column bay-size: weighted among 1-, 2-, 3-bay options
  //   (weights 2 : 3 : 2) producing a visible mix of sizes.  For 2-bay
  //   slabs the slab randomly leans left or right when both wings exist.
  const balconyInfo = new Map<string, { leftBays: number; rightBays: number }>();
  const balconyCoveredWindows = new Set<string>();
  if (BALCONY_ELIGIBLE_ZONES.has(ctx.zone?.type ?? "") && spec.stories >= 2) {
    const balconyRng = ctx.rng.fork("balconies");
    const isSpawnPlaza = ctx.zone?.type === "spawn_plaza";

    // Facade-level gate — spawn always passes; main lane uses FACADE_BALCONY_CHANCE.
    const facadeHasBalconies = isSpawnPlaza || (balconyRng.next() < FACADE_BALCONY_CHANCE);

    if (facadeHasBalconies) {
      for (let col = 0; col < spec.bayCount; col += 1) {
        if (spec.columnRoles[col] !== "door") continue;

        const hasLeft  = col - 1 >= 0 && spec.columnRoles[col - 1] === "window";
        const hasRight = col + 1 < spec.bayCount && spec.columnRoles[col + 1] === "window";

        let leftBays: number;
        let rightBays: number;

        if (isSpawnPlaza) {
          // Spawn: always claim all available adjacent windows → max slab.
          leftBays  = hasLeft  ? 1 : 0;
          rightBays = hasRight ? 1 : 0;
        } else {
          // Main lane: weighted pick — build an options array, roll an index.
          // Weights: 1-bay ×2, 2-bay ×3, 3-bay ×2  (up to 7 entries).
          type BayOption = [number, number];  // [leftBays, rightBays]
          const opts: BayOption[] = [[0, 0], [0, 0]];  // 1-bay ×2

          if (hasLeft || hasRight) {
            // 2-bay wing: when both sides exist, randomly lean left or right.
            const leanLeft = !hasRight || balconyRng.next() < 0.5;
            const twoL = (hasLeft  && leanLeft)  ? 1 : 0;
            const twoR = (hasRight && !leanLeft) ? 1 : 0;
            opts.push([twoL, twoR], [twoL, twoR], [twoL, twoR]);  // 2-bay ×3
          }
          if (hasLeft && hasRight) {
            opts.push([1, 1], [1, 1]);  // 3-bay ×2
          }
          const pick = opts[Math.floor(balconyRng.next() * opts.length)]!;
          leftBays  = pick[0];
          rightBays = pick[1];
        }

        for (let story = 1; story < spec.stories; story += 1) {
          balconyInfo.set(`${col}:${story}`, { leftBays, rightBays });
          if (leftBays  > 0) balconyCoveredWindows.add(`${col - 1}:${story}`);
          if (rightBays > 0) balconyCoveredWindows.add(`${col + 1}:${story}`);
        }
      }
    }
  }

  // Walk columns × stories with vertical coherence
  for (let col = 0; col < spec.bayCount; col += 1) {
    const role = spec.columnRoles[col]!;
    const centerS = columnCenterS(spec, col);

    for (let story = 0; story < spec.stories; story += 1) {
      const storyBaseY = story * STORY_HEIGHT_M;

      if (story === 0 && role === "door") {
        // Ground floor door column → arched door
        placeArchedDoor(ctx, centerS, spec);
      } else if (story > 0 && role === "door") {
        // Upper floor door column → balcony centered above this door (if selected)
        const info = balconyInfo.get(`${col}:${story}`);
        if (info) {
          placeBalcony(ctx, centerS, storyBaseY, spec, info.leftBays, info.rightBays);
        }
        // else → blank wall above door (no balcony chosen for this door)
      } else if (role === "window" && !DISABLE_WINDOWS) {
        // Window column → skip if the adjacent balcony slab covers this slot
        if (!balconyCoveredWindows.has(`${col}:${story}`)) {
          placeWindowOpening(ctx, centerS, storyBaseY, spec);
        }
        // covered: slab overhead — render blank (no glass poking through floor)
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

  const rootRng = new DeterministicRng(seed);
  let segmentsDecorated = 0;

  for (let index = 0; index < options.segments.length; index += 1) {
    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const isMainLane = isMainLaneZone(zone);
    const isShopfront = isShopfrontZone(zone);
    const isSideHall = zone?.type === "side_hall";
    const isConnector = zone?.type === "connector";
    const isCut = zone?.type === "cut";
    const wallMaterialId = resolveWallMaterialIdForZone(zone?.id ?? null);

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
    const heightSeed = deriveSubSeed(seed, `height:${zone?.id ?? "none"}`);
    const heightRng = new DeterministicRng(heightSeed);
    const segHeight = resolveSegmentWallHeight(options.wallHeightM, zone, heightRng, isInsideWall);
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

    const countBefore = instances.length;
    decorateSegment({
      frame,
      zone,
      isMainLane,
      isShopfrontZone: isShopfront,
      isSideHall,
      isConnector,
      isCut,
      mapCenterX,
      mapCenterZ,
      profile: options.profile,
      wallMaterialId,
      wallHeightM: segHeight,
      maxProtrusionM: segmentMaxProtrusion,
      density: segmentDensity,
      rng: segRng,
      instances,
      maxInstances,
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
