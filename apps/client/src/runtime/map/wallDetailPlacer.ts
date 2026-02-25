import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import type { RuntimeAnchor, RuntimeAnchorsSpec, RuntimeBlockoutZone } from "./types";
import type { BoundarySegment } from "./buildBlockout";
import type { WallDetailInstance } from "./wallDetailKit";

const DETAIL_ZONE_TYPES = new Set([
  "main_lane_segment",
  "side_hall",
  "spawn_plaza",
  "connector",
  "cut",
]);

const OPENING_ANCHOR_TYPES = new Set([
  "service_door_anchor",
  "shopfront_anchor",
]);

const SEGMENT_EDGE_MARGIN_M = 0.35;
const LAYER_EPSILON_M = 0.002;
const INSTANCE_BUDGET = 9800;

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

type OpeningSpan = {
  sMin: number;
  sMax: number;
  topY: number;
};

type SegmentDecorContext = {
  frame: SegmentFrame;
  segment: BoundarySegment;
  zone: RuntimeBlockoutZone | null;
  isMainLane: boolean;
  isShopfrontZone: boolean;
  isSideHall: boolean;
  wallHeightM: number;
  wallThicknessM: number;
  maxProtrusionM: number;
  density: number;
  rng: DeterministicRng;
  anchors: readonly RuntimeAnchor[];
  instances: WallDetailInstance[];
  maxInstances: number;
};

export type BuildWallDetailPlacementsOptions = {
  segments: readonly BoundarySegment[];
  zones: readonly RuntimeBlockoutZone[];
  anchors: RuntimeAnchorsSpec | null;
  seed: number;
  wallHeightM: number;
  wallThicknessM: number;
  enabled: boolean;
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
  frame: SegmentFrame,
  alongS: number,
  y: number,
  inwardN: number,
  depth: number,
  height: number,
  length: number,
): boolean {
  if (instances.length >= maxInstances) {
    return false;
  }

  const world = toWorld(frame, alongS, y, inwardN);
  instances.push({
    meshId,
    position: world,
    scale: {
      x: Math.max(0.002, depth),
      y: Math.max(0.002, height),
      z: Math.max(0.002, length),
    },
    yawRad: frame.yawRad,
  });

  return true;
}

function anchorFaceDistance(segment: BoundarySegment, anchor: RuntimeAnchor): number {
  const anchorX = anchor.pos.x;
  const anchorZ = anchor.pos.y;
  return Math.abs((segment.orientation === "vertical" ? anchorX : anchorZ) - segment.coord);
}

function anchorAlongAxis(segment: BoundarySegment, anchor: RuntimeAnchor): number {
  return segment.orientation === "vertical" ? anchor.pos.y : anchor.pos.x;
}

function collectAnchorsForSegment(
  segment: BoundarySegment,
  anchors: readonly RuntimeAnchor[],
  acceptedTypes: Set<string>,
  maxFaceDistanceM: number,
): RuntimeAnchor[] {
  const list: RuntimeAnchor[] = [];
  for (const anchor of anchors) {
    const type = anchor.type.toLowerCase();
    if (!acceptedTypes.has(type)) continue;
    if (anchorFaceDistance(segment, anchor) > maxFaceDistanceM) continue;

    const along = anchorAlongAxis(segment, anchor);
    if (along < segment.start + SEGMENT_EDGE_MARGIN_M || along > segment.end - SEGMENT_EDGE_MARGIN_M) continue;
    list.push(anchor);
  }

  return list.sort((a, b) => anchorAlongAxis(segment, a) - anchorAlongAxis(segment, b));
}

function overlapsOpening(openings: readonly OpeningSpan[], s: number, y: number): boolean {
  for (const opening of openings) {
    if (s >= opening.sMin && s <= opening.sMax && y <= opening.topY) {
      return true;
    }
  }
  return false;
}

function placeCornerPiers(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.8) return;

  const maxWidth = Math.max(0.28, Math.min(1.05, ctx.frame.lengthM * 0.4));
  const pierWidth = clamp(ctx.rng.range(0.42, 0.78), 0.3, maxWidth);
  const pierDepth = clamp(ctx.rng.range(0.08, 0.14), 0.06, ctx.maxProtrusionM);
  const pierHeight = clamp(ctx.wallHeightM - ctx.rng.range(0.35, 0.75), 3, ctx.wallHeightM);
  const halfLen = ctx.frame.lengthM * 0.5;

  for (const side of [-1, 1] as const) {
    const s = side * Math.max(0.02, halfLen - pierWidth * 0.5 - 0.02);
    if (!pushBox(
      ctx.instances,
      ctx.maxInstances,
      "corner_pier",
      ctx.frame,
      s,
      pierHeight * 0.5,
      pierDepth * 0.5,
      pierDepth,
      pierHeight,
      pierWidth,
    )) {
      return;
    }

    if (ctx.rng.next() < 0.35) {
      const capDepth = clamp(pierDepth * 0.7, 0.05, ctx.maxProtrusionM);
      const capHeight = clamp(ctx.rng.range(0.55, 1.1), 0.45, pierHeight * 0.42);
      const capWidth = clamp(pierWidth * ctx.rng.range(0.4, 0.62), 0.18, pierWidth);
      if (!pushBox(
        ctx.instances,
        ctx.maxInstances,
        "corner_pier",
        ctx.frame,
        s,
        pierHeight - capHeight * 0.5,
        capDepth * 0.5,
        capDepth,
        capHeight,
        capWidth,
      )) {
        return;
      }
    }
  }
}

function placeRecessedOpenings(ctx: SegmentDecorContext): OpeningSpan[] {
  const anchors = collectAnchorsForSegment(
    ctx.segment,
    ctx.anchors,
    OPENING_ANCHOR_TYPES,
    Math.max(0.65, ctx.wallThicknessM + 0.45),
  );

  if (anchors.length === 0) {
    return [];
  }

  const spans: OpeningSpan[] = [];
  let lastPlacedS = Number.NEGATIVE_INFINITY;

  for (const anchor of anchors) {
    const along = anchorAlongAxis(ctx.segment, anchor);
    const s = along - (ctx.segment.start + ctx.segment.end) * 0.5;
    if (Math.abs(s - lastPlacedS) < 1.35) continue;

    const type = anchor.type.toLowerCase();
    const widthLimit = ctx.frame.lengthM - SEGMENT_EDGE_MARGIN_M * 2 - 0.2;
    if (widthLimit < 1) continue;

    const baseWidth = anchor.widthM ?? (type === "service_door_anchor" ? 1.35 : 2.4);
    const baseHeight = anchor.heightM ?? (type === "service_door_anchor" ? 2.4 : 3.1);
    const openingWidth = clamp(baseWidth, 1, widthLimit);
    const openingHeight = clamp(baseHeight, 2.1, Math.max(2.2, ctx.wallHeightM - 1.25));
    const edgePad = clamp(ctx.rng.range(0.12, 0.24), 0.1, 0.28);
    const topPad = clamp(ctx.rng.range(0.06, 0.14), 0.05, 0.18);

    spans.push({
      sMin: s - (openingWidth * 0.5 + edgePad),
      sMax: s + (openingWidth * 0.5 + edgePad),
      topY: openingHeight + topPad,
    });

    lastPlacedS = s;
  }

  return spans;
}

function placeHorizontalJointSegments(
  ctx: SegmentDecorContext,
  openings: readonly OpeningSpan[],
  y: number,
  depth: number,
): void {
  const halfLen = ctx.frame.lengthM * 0.5;
  const end = halfLen - 0.05;
  let cursor = -halfLen + 0.05;

  while (cursor < end && ctx.instances.length < ctx.maxInstances) {
    const segLen = Math.min(end - cursor, clamp(ctx.rng.range(0.42, 1.35), 0.32, 1.65));
    const centerS = cursor + segLen * 0.5;

    if (ctx.rng.next() < 0.84 && !overlapsOpening(openings, centerS, y)) {
      if (!pushBox(
        ctx.instances,
        ctx.maxInstances,
        "masonry_joint",
        ctx.frame,
        centerS,
        y,
        -(depth * 0.5 + LAYER_EPSILON_M),
        depth,
        0.028,
        segLen,
      )) {
        return;
      }
    }

    cursor += segLen + ctx.rng.range(0.08, 0.42);
  }
}

function placeMasonryBlockwork(ctx: SegmentDecorContext, openings: readonly OpeningSpan[]): void {
  const lowerY = 0.38;
  const upperY = Math.max(1.5, ctx.wallHeightM - 0.55);
  if (upperY <= lowerY) return;

  const usableHeight = upperY - lowerY;
  let courseBaseY = lowerY;
  const halfLen = ctx.frame.lengthM * 0.5;
  const targetCourseHeight = clamp(
    0.72 + (1 - ctx.density) * 0.12 + ctx.rng.range(-0.06, 0.06),
    0.62,
    0.92,
  );
  let remainingCourses = clamp(Math.round(usableHeight / targetCourseHeight), 4, 12);

  while (remainingCourses > 0 && courseBaseY < upperY && ctx.instances.length < ctx.maxInstances) {
    const remainingHeight = upperY - courseBaseY;
    const nominalCourseHeight = remainingHeight / remainingCourses;
    const courseHeight = clamp(
      nominalCourseHeight + ctx.rng.range(-0.08, 0.08),
      0.52,
      0.98,
    );
    const blockHeight = Math.max(0.28, courseHeight - clamp(ctx.rng.range(0.04, 0.07), 0.03, 0.09));
    const blockY = courseBaseY + blockHeight * 0.5;

    if (blockY + blockHeight * 0.5 > upperY + 0.05) {
      break;
    }

    const hJointDepth = clamp(ctx.rng.range(0.009, 0.017), 0.008, 0.022);
    placeHorizontalJointSegments(ctx, openings, courseBaseY + courseHeight, hJointDepth);

    let cursor = -halfLen + ctx.rng.range(0.03, 0.12);
    const end = halfLen - 0.06;

    while (cursor < end && ctx.instances.length < ctx.maxInstances) {
      const baseBlockLen = clamp(
        ctx.rng.range(0.88, 1.7) * (1.05 - ctx.density * 0.07),
        0.72,
        2.05,
      );
      const isLargeStone = ctx.rng.next() < (0.08 + ctx.density * 0.06);
      const blockLen = isLargeStone
        ? clamp(baseBlockLen * ctx.rng.range(1.35, 1.9), 1.15, 2.75)
        : baseBlockLen;
      const available = end - cursor;
      const span = Math.min(blockLen, available);
      if (span < 0.38) break;

      const centerS = cursor + span * 0.5;
      if (overlapsOpening(openings, centerS, blockY)) {
        cursor += span + ctx.rng.range(0.06, 0.22);
        continue;
      }

      const reliefRoll = ctx.rng.next();
      let faceDepth = 0;
      let inwardN = 0;
      if (reliefRoll < 0.56) {
        // Recess target: ~1.5cm to 3.5cm into wall.
        faceDepth = clamp(ctx.rng.range(0.012, 0.026), 0.01, 0.03);
        const recessM = ctx.rng.range(0.015, 0.035);
        inwardN = -(recessM + faceDepth * 0.5);
      } else if (reliefRoll < 0.9) {
        faceDepth = clamp(ctx.rng.range(0.009, 0.018), 0.008, 0.022);
        inwardN = ctx.rng.range(-0.003, 0.004);
      } else {
        // Proud target: ~0.6cm to 1.8cm out from wall.
        faceDepth = clamp(ctx.rng.range(0.006, 0.012), 0.005, 0.014);
        const proudM = ctx.rng.range(0.006, 0.018);
        inwardN = proudM - faceDepth * 0.5;
      }

      if (!pushBox(
        ctx.instances,
        ctx.maxInstances,
        "masonry_block",
        ctx.frame,
        centerS,
        blockY,
        inwardN,
        faceDepth,
        blockHeight,
        span,
      )) {
        return;
      }

      if (ctx.rng.next() < 0.56 && centerS + span * 0.5 < end - 0.08) {
        const vJointWidth = clamp(ctx.rng.range(0.018, 0.04), 0.016, 0.05);
        const vJointDepth = clamp(ctx.rng.range(0.009, 0.018), 0.008, 0.022);
        if (!pushBox(
          ctx.instances,
          ctx.maxInstances,
          "masonry_joint",
          ctx.frame,
          centerS + span * 0.5,
          blockY,
          -(vJointDepth * 0.5 + LAYER_EPSILON_M),
          vJointDepth,
          blockHeight,
          vJointWidth,
        )) {
          return;
        }
      }

      if (ctx.rng.next() < 0.14) {
        const chipDepth = clamp(ctx.rng.range(0.009, 0.02), 0.008, 0.026);
        const chipY = blockY + ctx.rng.range(-blockHeight * 0.32, blockHeight * 0.32);
        const chipS = centerS + ctx.rng.range(-span * 0.35, span * 0.35);
        if (!pushBox(
          ctx.instances,
          ctx.maxInstances,
          "masonry_pit",
          ctx.frame,
          chipS,
          chipY,
          -(chipDepth * 0.5 + ctx.rng.range(0.004, 0.02)),
          chipDepth,
          clamp(ctx.rng.range(0.04, 0.11), 0.03, 0.14),
          clamp(ctx.rng.range(0.05, 0.14), 0.04, 0.18),
        )) {
          return;
        }
      }

      cursor += span + ctx.rng.range(0.05, 0.2);
    }

    courseBaseY += courseHeight + ctx.rng.range(0.015, 0.055);
    remainingCourses -= 1;
  }
}

function placeDamagePitsAndCracks(ctx: SegmentDecorContext, openings: readonly OpeningSpan[]): void {
  const halfLen = ctx.frame.lengthM * 0.5;
  const sideInset = Math.max(0.14, halfLen - 0.12);

  const pitCount = clamp(Math.floor(ctx.frame.lengthM * (0.14 + ctx.density * 0.32)), 1, 18);
  for (let index = 0; index < pitCount && ctx.instances.length < ctx.maxInstances; index += 1) {
    const y = clamp(ctx.rng.range(0.28, ctx.wallHeightM - 0.35), 0.24, ctx.wallHeightM - 0.28);
    const s = ctx.rng.range(-halfLen + 0.08, halfLen - 0.08);
    if (overlapsOpening(openings, s, y)) continue;

    const depth = clamp(ctx.rng.range(0.008, 0.024), 0.007, 0.03);
    const pitHeight = clamp(ctx.rng.range(0.04, 0.14), 0.03, 0.18);
    const pitLength = clamp(ctx.rng.range(0.05, 0.2), 0.04, 0.24);

    if (!pushBox(
      ctx.instances,
      ctx.maxInstances,
      "masonry_pit",
      ctx.frame,
      s,
      y,
      -(depth * 0.5 + ctx.rng.range(0.004, 0.03)),
      depth,
      pitHeight,
      pitLength,
    )) {
      return;
    }
  }

  const crackCount = clamp(Math.floor(ctx.frame.lengthM * (0.035 + ctx.density * 0.1)), 1, 8);
  for (let index = 0; index < crackCount && ctx.instances.length < ctx.maxInstances; index += 1) {
    const vertical = ctx.rng.next() < 0.58;
    const crackY = clamp(ctx.rng.range(0.5, ctx.wallHeightM - 0.45), 0.4, ctx.wallHeightM - 0.4);
    const crackS = ctx.rng.range(-halfLen + 0.1, halfLen - 0.1);
    if (overlapsOpening(openings, crackS, crackY)) continue;

    const depth = clamp(ctx.rng.range(0.01, 0.022), 0.008, 0.028);
    const crackHeight = vertical
      ? clamp(ctx.rng.range(0.35, 0.95), 0.3, 1.2)
      : clamp(ctx.rng.range(0.04, 0.1), 0.03, 0.14);
    const crackLength = vertical
      ? clamp(ctx.rng.range(0.04, 0.1), 0.03, 0.14)
      : clamp(ctx.rng.range(0.35, 0.95), 0.24, 1.2);

    if (!pushBox(
      ctx.instances,
      ctx.maxInstances,
      "masonry_pit",
      ctx.frame,
      crackS,
      crackY,
      -(depth * 0.5 + ctx.rng.range(0.005, 0.024)),
      depth,
      crackHeight,
      crackLength,
    )) {
      return;
    }
  }

  const cornerChipCount = clamp(Math.floor(1 + ctx.density * 1.8), 1, 4);
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < cornerChipCount && ctx.instances.length < ctx.maxInstances; index += 1) {
      const y = clamp(ctx.rng.range(0.2, ctx.wallHeightM - 0.2), 0.2, ctx.wallHeightM - 0.2);
      const s = side * (sideInset - ctx.rng.range(0, 0.35));
      if (overlapsOpening(openings, s, y)) continue;

      const depth = clamp(ctx.rng.range(0.008, 0.02), 0.007, 0.026);
      const pitHeight = clamp(ctx.rng.range(0.04, 0.13), 0.03, 0.16);
      const pitLength = clamp(ctx.rng.range(0.04, 0.14), 0.03, 0.18);

      if (!pushBox(
        ctx.instances,
        ctx.maxInstances,
        "masonry_pit",
        ctx.frame,
        s,
        y,
        -(depth * 0.5 + ctx.rng.range(0.004, 0.025)),
        depth,
        pitHeight,
        pitLength,
      )) {
        return;
      }
    }
  }
}

function decorateSegment(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.65) return;

  const openings = placeRecessedOpenings(ctx);
  placeCornerPiers(ctx);
  placeMasonryBlockwork(ctx, openings);
  placeDamagePitsAndCracks(ctx, openings);
}

export function buildWallDetailPlacements(options: BuildWallDetailPlacementsOptions): WallDetailPlacementResult {
  const seed = typeof options.detailSeed === "number"
    ? Math.trunc(options.detailSeed)
    : deriveSubSeed(options.seed, "wall-detail-seed");
  const density = clamp(options.density, 0, 1.25);
  const maxProtrusionM = clamp(options.maxProtrusionM, 0.03, 0.2);
  const maxInstances = Math.max(1, INSTANCE_BUDGET);
  const instances: WallDetailInstance[] = [];

  if (!options.enabled || options.segments.length === 0) {
    return {
      instances,
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

  const anchors = options.anchors?.anchors ?? [];
  const rootRng = new DeterministicRng(seed);
  let segmentsDecorated = 0;

  for (let index = 0; index < options.segments.length; index += 1) {
    if (instances.length >= maxInstances) {
      break;
    }

    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const isMainLane = isMainLaneZone(zone);
    const isShopfront = isShopfrontZone(zone);
    const isSideHall = zone?.type === "side_hall";

    const segmentDensityRaw = density
      * (isMainLane ? 1.04 : 1)
      * (isShopfront ? 1.08 : 1)
      * (isSideHall ? 0.84 : 1)
      * (zone?.type === "connector" ? 0.78 : 1);
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
      segment,
      zone,
      isMainLane,
      isShopfrontZone: isShopfront,
      isSideHall,
      wallHeightM: options.wallHeightM,
      wallThicknessM: options.wallThicknessM,
      maxProtrusionM: segmentMaxProtrusion,
      density: segmentDensity,
      rng: segRng,
      anchors,
      instances,
      maxInstances,
    });
    if (instances.length > countBefore) {
      segmentsDecorated += 1;
    }
  }

  return {
    instances,
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
