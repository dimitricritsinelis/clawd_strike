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

const DOOR_ANCHOR_TYPES = new Set([
  "service_door_anchor",
  "shopfront_anchor",
]);

const SIGN_ANCHOR_TYPE = "signage_anchor";
const ENABLE_CABLE_RUNS = false;
const ENABLE_SIGN_MOUNTS = false;
const ENABLE_SIGN_BRACKETS = false;
const ENABLE_AWNING_BRACKETS = false;
const SEGMENT_EDGE_MARGIN_M = 0.35;
const LAYER_EPSILON_M = 0.002;

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
  meshId: WallDetailInstance["meshId"],
  frame: SegmentFrame,
  alongS: number,
  y: number,
  inwardN: number,
  depth: number,
  height: number,
  length: number,
  rollRad = 0,
): void {
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
    ...(Math.abs(rollRad) > 1e-6 ? { rollRad } : {}),
  });
}

function pushCable(
  instances: WallDetailInstance[],
  frame: SegmentFrame,
  alongS: number,
  y: number,
  inwardN: number,
  radiusM: number,
  lengthM: number,
): void {
  const world = toWorld(frame, alongS, y, inwardN);
  instances.push({
    meshId: "cable_segment",
    position: world,
    scale: {
      x: Math.max(0.002, radiusM),
      y: Math.max(0.002, lengthM),
      z: Math.max(0.002, radiusM),
    },
    yawRad: frame.yawRad,
    pitchRad: Math.PI * 0.5,
  });
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
  acceptedTypes: Set<string> | string,
  maxFaceDistanceM: number,
): RuntimeAnchor[] {
  const list: RuntimeAnchor[] = [];
  for (const anchor of anchors) {
    const type = anchor.type.toLowerCase();
    const accepted = typeof acceptedTypes === "string" ? type === acceptedTypes : acceptedTypes.has(type);
    if (!accepted) continue;
    if (anchorFaceDistance(segment, anchor) > maxFaceDistanceM) continue;

    const along = anchorAlongAxis(segment, anchor);
    if (along < segment.start + SEGMENT_EDGE_MARGIN_M || along > segment.end - SEGMENT_EDGE_MARGIN_M) continue;
    list.push(anchor);
  }

  return list.sort((a, b) => anchorAlongAxis(segment, a) - anchorAlongAxis(segment, b));
}

function placeBaseStrips(ctx: SegmentDecorContext): void {
  const plinthHeight = 0.35;
  const corniceHeight = clamp(ctx.rng.range(0.2, 0.3), 0.2, 0.3);
  const plinthDepth = clamp(ctx.rng.range(0.08, 0.12), 0.06, ctx.maxProtrusionM);
  const corniceDepth = clamp(ctx.rng.range(0.08, 0.12), 0.06, ctx.maxProtrusionM);
  const stripLength = Math.max(0.4, ctx.frame.lengthM - 0.02);

  pushBox(
    ctx.instances,
    "plinth_strip",
    ctx.frame,
    0,
    plinthHeight * 0.5,
    plinthDepth * 0.5,
    plinthDepth,
    plinthHeight,
    stripLength,
  );
  pushBox(
    ctx.instances,
    "cornice_strip",
    ctx.frame,
    0,
    ctx.wallHeightM - corniceHeight * 0.5,
    corniceDepth * 0.5,
    corniceDepth,
    corniceHeight,
    stripLength,
  );
}

function placeEdgeTrim(ctx: SegmentDecorContext): void {
  const trimDepth = clamp(ctx.rng.range(0.02, 0.04), 0.02, Math.min(0.06, ctx.maxProtrusionM));
  const trimWidth = clamp(ctx.rng.range(0.03, 0.06), 0.03, 0.08);
  const endOffset = Math.max(0.1, ctx.frame.lengthM * 0.5 - trimWidth * 0.5);
  for (const side of [-1, 1] as const) {
    pushBox(
      ctx.instances,
      "vertical_edge_trim",
      ctx.frame,
      side * endOffset,
      ctx.wallHeightM * 0.5,
      trimDepth * 0.5,
      trimDepth,
      ctx.wallHeightM,
      trimWidth,
    );
  }
}

function collectPilasterPositions(lengthM: number, widthM: number, rng: DeterministicRng): number[] {
  const endInset = Math.max(widthM * 0.65, 0.2);
  const min = -lengthM * 0.5 + endInset;
  const max = lengthM * 0.5 - endInset;

  if (max <= min) {
    return [0];
  }

  const positions = [min, max];
  let cursor = min + rng.range(2.8, 4.4);
  while (cursor < max - 0.8) {
    positions.push(cursor);
    cursor += rng.range(3, 5);
  }

  positions.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const pos of positions) {
    const last = deduped[deduped.length - 1];
    if (typeof last === "number" && Math.abs(last - pos) < 0.18) continue;
    deduped.push(pos);
  }
  return deduped;
}

function placePilastersAndPanels(ctx: SegmentDecorContext): void {
  const pilasterWidth = clamp(ctx.rng.range(0.3, 0.5), 0.3, 0.5);
  const pilasterDepth = clamp(ctx.rng.range(0.08, 0.14), 0.05, ctx.maxProtrusionM);
  const plinthHeight = 0.35;
  const topPadding = 0.42;
  const pilasterHeight = Math.max(1.8, ctx.wallHeightM - plinthHeight - topPadding);
  const pilasterY = plinthHeight + pilasterHeight * 0.5;
  const pilasterPositions = collectPilasterPositions(ctx.frame.lengthM, pilasterWidth, ctx.rng);

  for (const s of pilasterPositions) {
    pushBox(
      ctx.instances,
      "pilaster",
      ctx.frame,
      s,
      pilasterY,
      pilasterDepth * 0.5,
      pilasterDepth,
      pilasterHeight,
      pilasterWidth,
    );
  }

  for (let index = 0; index < pilasterPositions.length - 1; index += 1) {
    const left = pilasterPositions[index]!;
    const right = pilasterPositions[index + 1]!;
    const bayStart = left + pilasterWidth * 0.5 + 0.08;
    const bayEnd = right - pilasterWidth * 0.5 - 0.08;
    const bayLength = bayEnd - bayStart;
    if (bayLength < 0.9) continue;

    const panelChance = clamp(0.3 + ctx.density * 0.26, 0.3, 0.6);
    if (ctx.rng.next() > panelChance) continue;

    const panelWidth = clamp(bayLength * 0.82, 0.8, 2.6);
    const panelBottom = 0.8;
    const panelHeightMax = ctx.wallHeightM - 1.1 - panelBottom;
    if (panelHeightMax < 1.4) continue;
    const panelHeight = clamp(ctx.rng.range(1.6, 2.5), 1.4, panelHeightMax);
    const panelY = panelBottom + panelHeight * 0.5;
    const panelCenterS = (bayStart + bayEnd) * 0.5;
    const frameDepth = clamp(ctx.rng.range(0.03, 0.06), 0.03, Math.min(0.08, ctx.maxProtrusionM));
    const recessDepth = clamp(
      ctx.rng.range(0.05, 0.1),
      0.05,
      Math.max(0.05, Math.min(0.1, ctx.wallThicknessM * 0.5)),
    );
    const frameBand = 0.08;
    const innerWidth = panelWidth - frameBand * 2;
    const innerHeight = panelHeight - frameBand * 2;
    if (innerWidth <= 0.15 || innerHeight <= 0.15) continue;

    pushBox(
      ctx.instances,
      "recessed_panel_frame_h",
      ctx.frame,
      panelCenterS,
      panelBottom + frameBand * 0.5,
      frameDepth * 0.5,
      frameDepth,
      frameBand,
      panelWidth,
    );
    pushBox(
      ctx.instances,
      "recessed_panel_frame_h",
      ctx.frame,
      panelCenterS,
      panelBottom + panelHeight - frameBand * 0.5,
      frameDepth * 0.5,
      frameDepth,
      frameBand,
      panelWidth,
    );
    pushBox(
      ctx.instances,
      "recessed_panel_frame_v",
      ctx.frame,
      panelCenterS - (panelWidth * 0.5 - frameBand * 0.5),
      panelY,
      frameDepth * 0.5,
      frameDepth,
      innerHeight,
      frameBand,
    );
    pushBox(
      ctx.instances,
      "recessed_panel_frame_v",
      ctx.frame,
      panelCenterS + (panelWidth * 0.5 - frameBand * 0.5),
      panelY,
      frameDepth * 0.5,
      frameDepth,
      innerHeight,
      frameBand,
    );

    // Shift the back plate into the wall body to fake a true recess.
    pushBox(
      ctx.instances,
      "recessed_panel_back",
      ctx.frame,
      panelCenterS,
      panelY,
      -(recessDepth + 0.01 + LAYER_EPSILON_M),
      0.02,
      innerHeight,
      innerWidth,
    );
  }
}

function placeDoorFrames(ctx: SegmentDecorContext): void {
  const doorAnchors = collectAnchorsForSegment(
    ctx.segment,
    ctx.anchors,
    DOOR_ANCHOR_TYPES,
    Math.max(0.55, ctx.wallThicknessM + 0.35),
  );
  if (doorAnchors.length === 0) return;

  let lastPlacedS = Number.NEGATIVE_INFINITY;
  for (const anchor of doorAnchors) {
    const along = anchorAlongAxis(ctx.segment, anchor);
    const s = along - (ctx.segment.start + ctx.segment.end) * 0.5;
    if (Math.abs(s - lastPlacedS) < 1.2) continue;

    const type = anchor.type.toLowerCase();
    const doorWidth = clamp(anchor.widthM ?? (type === "service_door_anchor" ? 1.2 : 1.7), 1, 2.8);
    const doorHeight = clamp(anchor.heightM ?? (type === "service_door_anchor" ? 2.3 : 2.6), 2.1, 3.5);
    const frameDepth = clamp(ctx.rng.range(0.05, 0.1), 0.04, ctx.maxProtrusionM);
    const jambWidth = 0.11;
    const lintelHeight = 0.14;
    const sideOffset = doorWidth * 0.5 + jambWidth * 0.5;

    pushBox(
      ctx.instances,
      "door_jamb",
      ctx.frame,
      s - sideOffset,
      doorHeight * 0.5,
      frameDepth * 0.5,
      frameDepth,
      doorHeight,
      jambWidth,
    );
    pushBox(
      ctx.instances,
      "door_jamb",
      ctx.frame,
      s + sideOffset,
      doorHeight * 0.5,
      frameDepth * 0.5,
      frameDepth,
      doorHeight,
      jambWidth,
    );
    pushBox(
      ctx.instances,
      "door_lintel",
      ctx.frame,
      s,
      doorHeight + lintelHeight * 0.5,
      frameDepth * 0.5,
      frameDepth,
      lintelHeight,
      doorWidth + jambWidth * 2,
    );

    if (ctx.rng.next() < 0.3) {
      const archRise = 0.12;
      const archDepth = frameDepth * 0.8;
      const world = toWorld(ctx.frame, s, doorHeight + archRise * 0.5, archDepth * 0.5);
      ctx.instances.push({
        meshId: "door_arch_lintel",
        position: world,
        scale: {
          x: archDepth,
          y: archRise,
          z: doorWidth + jambWidth * 2,
        },
        yawRad: ctx.frame.yawRad,
        pitchRad: Math.PI * 0.5,
      });
    }

    lastPlacedS = s;
  }
}

function placeSignageAndAwning(ctx: SegmentDecorContext): void {
  if (!ENABLE_SIGN_MOUNTS && !ENABLE_AWNING_BRACKETS) return;
  const signageAnchors = collectAnchorsForSegment(
    ctx.segment,
    ctx.anchors,
    SIGN_ANCHOR_TYPE,
    Math.max(0.65, ctx.wallThicknessM + 0.45),
  );
  const hangingDensity = clamp(ctx.density * (ctx.isMainLane ? 0.55 : 0.9), 0, 0.8);
  const maxSignProtrusion = clamp(ctx.maxProtrusionM, 0.05, 0.15);

  for (const anchor of signageAnchors) {
    if (!ENABLE_SIGN_MOUNTS) continue;
    if (ctx.rng.next() > hangingDensity) continue;

    const along = anchorAlongAxis(ctx.segment, anchor);
    const s = along - (ctx.segment.start + ctx.segment.end) * 0.5;
    const width = clamp(anchor.widthM ?? 1.6, 0.9, 3.2);
    const boardHeight = clamp(ctx.rng.range(0.32, 0.58), 0.3, 0.6);
    const boardDepth = clamp(ctx.rng.range(0.05, 0.09), 0.04, maxSignProtrusion);
    const y = clamp(anchor.pos.z > 0 ? anchor.pos.z : ctx.rng.range(2.0, 2.6), 2.0, 2.6);

    pushBox(
      ctx.instances,
      "sign_board",
      ctx.frame,
      s,
      y,
      boardDepth * 0.5,
      boardDepth,
      boardHeight,
      width,
    );

    if (ENABLE_SIGN_BRACKETS) {
      const bracketDepth = clamp(boardDepth + 0.04, 0.06, maxSignProtrusion);
      const bracketY = y - boardHeight * 0.33;
      const bracketOffset = width * 0.34;
      pushBox(
        ctx.instances,
        "sign_bracket",
        ctx.frame,
        s - bracketOffset,
        bracketY,
        bracketDepth * 0.5,
        bracketDepth,
        0.18,
        0.07,
      );
      pushBox(
        ctx.instances,
        "sign_bracket",
        ctx.frame,
        s + bracketOffset,
        bracketY,
        bracketDepth * 0.5,
        bracketDepth,
        0.18,
        0.07,
      );
    }
  }

  if (!ENABLE_AWNING_BRACKETS) return;
  if (ctx.frame.lengthM < 3 || ctx.rng.next() > hangingDensity * 0.5) {
    return;
  }

  const bracketCount = ctx.rng.next() < 0.55 ? 1 : 2;
  const spanMin = -ctx.frame.lengthM * 0.5 + 0.7;
  const spanMax = ctx.frame.lengthM * 0.5 - 0.7;
  for (let index = 0; index < bracketCount; index += 1) {
    const s = ctx.rng.range(spanMin, spanMax);
    const y = clamp(ctx.rng.range(2.25, 2.95), 2.2, 3.1);
    const protrusion = clamp(ctx.rng.range(0.06, 0.1), 0.05, maxSignProtrusion);
    const split = 0.5;
    pushBox(
      ctx.instances,
      "awning_bracket",
      ctx.frame,
      s - split,
      y,
      protrusion * 0.5,
      protrusion,
      0.22,
      0.08,
      -0.25,
    );
    pushBox(
      ctx.instances,
      "awning_bracket",
      ctx.frame,
      s + split,
      y,
      protrusion * 0.5,
      protrusion,
      0.22,
      0.08,
      0.25,
    );
  }
}

function placeCableRuns(ctx: SegmentDecorContext): void {
  if (!ENABLE_CABLE_RUNS) return;
  if (ctx.frame.lengthM < 4) return;
  const hangingDensity = clamp(ctx.density * (ctx.isMainLane ? 0.45 : 0.75), 0, 0.75);
  if (ctx.rng.next() > hangingDensity) return;

  const pieces = clamp(Math.floor(ctx.frame.lengthM / 2.4), 2, 6);
  const start = -ctx.frame.lengthM * 0.5 + 0.55;
  const end = ctx.frame.lengthM * 0.5 - 0.55;
  const span = Math.max(0.5, end - start);
  const sectionLength = span / pieces;
  const cableLength = Math.max(0.4, sectionLength * 0.92);
  const baseY = clamp(ctx.rng.range(2.6, 3.05), 2.6, 3.1);
  const radius = 0.018;
  const cableOffset = clamp(ctx.rng.range(0.03, 0.06), 0.03, Math.min(0.08, ctx.maxProtrusionM));
  const phase = ctx.rng.range(0, Math.PI * 2);

  for (let index = 0; index < pieces; index += 1) {
    const s = start + sectionLength * (index + 0.5);
    const sway = Math.sin(phase + index * 0.82) * 0.08 + ctx.rng.range(-0.02, 0.02);
    const y = clamp(baseY + sway, 2.55, 3.15);
    pushCable(
      ctx.instances,
      ctx.frame,
      s,
      y,
      cableOffset * 0.5,
      radius,
      cableLength,
    );
  }
}

function decorateSegment(ctx: SegmentDecorContext): void {
  if (ctx.frame.lengthM < 0.65) return;

  placeBaseStrips(ctx);
  placeEdgeTrim(ctx);
  placePilastersAndPanels(ctx);
  placeDoorFrames(ctx);
  placeSignageAndAwning(ctx);
  placeCableRuns(ctx);
}

export function buildWallDetailPlacements(options: BuildWallDetailPlacementsOptions): WallDetailPlacementResult {
  const seed = typeof options.detailSeed === "number"
    ? Math.trunc(options.detailSeed)
    : deriveSubSeed(options.seed, "wall-detail-seed");
  const density = clamp(options.density, 0, 1.25);
  const maxProtrusionM = clamp(options.maxProtrusionM, 0.03, 0.2);
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
    const segment = options.segments[index]!;
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, options.zones);
    const isMainLane = isMainLaneZone(zone);
    const isShopfront = isShopfrontZone(zone);
    const isSideHall = zone?.type === "side_hall";
    const segmentDensityRaw = density
      * (isShopfront ? 1.12 : 1)
      * (isSideHall ? 0.68 : 1)
      * (zone?.type === "connector" ? 0.82 : 1);
    const segmentDensity = clamp(segmentDensityRaw, 0.05, 1.2);
    const segmentMaxProtrusion = Math.min(maxProtrusionM, isMainLane ? 0.1 : maxProtrusionM);
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
