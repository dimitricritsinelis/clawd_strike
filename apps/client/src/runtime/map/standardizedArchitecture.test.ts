import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { buildWallDetailPlacements } from "./wallDetailPlacer";
import { parseBlockoutSpec } from "./types";
import {
  resolveFacadeFaceForSegment,
  resolveFacadeStyleForSegment,
  resolveWallPlaneOverride,
} from "./wallMaterialAssignment";

const WALKABLE_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);

const DETAIL_ZONE_TYPES = new Set([
  "main_lane_segment",
  "side_hall",
  "spawn_plaza",
  "connector",
  "cut",
]);

const B_SPAWN_DETAIL_HASH = "3baec89fcc135efb0169bb191a879c7e980274c2101c7f83e95445ac03d982b2";
const B_SPAWN_DOOR_HASH = "5dc2d5e9ecec25678725733de6ed565395617cb7e4c94d3e8dccc607f8931912";
const B_SPAWN_WALL_HASH = "21412ff62e9a7e419fe4caeeab1ae1aa7b85caa9898facf3207bcd8d3de60662";

type Segment = {
  orientation: "vertical" | "horizontal";
  coord: number;
  start: number;
  end: number;
  outward: -1 | 1;
};

type SegmentFrame = {
  lengthM: number;
  centerX: number;
  centerZ: number;
  tangentX: number;
  tangentZ: number;
  inwardX: number;
  inwardZ: number;
};

type SegmentMeta = {
  index: number;
  segment: Segment;
  frame: SegmentFrame;
  zone: {
    id: string;
    type: string;
    rect: { x: number; y: number; w: number; h: number };
  } | null;
  face: "north" | "south" | "east" | "west";
  ordinal: number | null;
};

type AuditContext = {
  spec: ReturnType<typeof parseBlockoutSpec>;
  metas: SegmentMeta[];
  placements: ReturnType<typeof buildWallDetailPlacements>;
};

function rectContainsPoint(rect: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function collectAxisCoordinates(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  boundary: { x: number; y: number; w: number; h: number },
): { xs: number[]; ys: number[] } {
  const xs = new Set<number>([boundary.x, boundary.x + boundary.w]);
  const ys = new Set<number>([boundary.y, boundary.y + boundary.h]);
  for (const rect of rects) {
    xs.add(rect.x);
    xs.add(rect.x + rect.w);
    ys.add(rect.y);
    ys.add(rect.y + rect.h);
  }
  return {
    xs: [...xs].sort((left, right) => left - right),
    ys: [...ys].sort((left, right) => left - right),
  };
}

function buildInsideGrid(
  walkableRects: Array<{ x: number; y: number; w: number; h: number }>,
  xs: number[],
  ys: number[],
): boolean[][] {
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

function extractBoundarySegments(inside: boolean[][], xs: number[], ys: number[]): Segment[] {
  const rows = inside.length;
  const cols = inside[0]?.length ?? 0;
  const segments: Segment[] = [];
  const isInside = (xIndex: number, yIndex: number): boolean => {
    if (xIndex < 0 || yIndex < 0 || xIndex >= cols || yIndex >= rows) {
      return false;
    }
    return inside[yIndex]?.[xIndex] ?? false;
  };

  for (let yIndex = 0; yIndex < rows; yIndex += 1) {
    for (let xIndex = 0; xIndex < cols; xIndex += 1) {
      if (!inside[yIndex]?.[xIndex]) {
        continue;
      }
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

function mergeBoundarySegments(segments: Segment[]): Segment[] {
  const EPS = 1e-6;
  const sorted = [...segments].sort((left, right) => {
    if (left.orientation !== right.orientation) {
      return left.orientation.localeCompare(right.orientation);
    }
    if (left.coord !== right.coord) {
      return left.coord - right.coord;
    }
    if (left.outward !== right.outward) {
      return left.outward - right.outward;
    }
    return left.start - right.start;
  });

  const merged: Segment[] = [];
  for (const segment of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous
      && previous.orientation === segment.orientation
      && Math.abs(previous.coord - segment.coord) < EPS
      && previous.outward === segment.outward
      && Math.abs(previous.end - segment.start) < EPS
    ) {
      previous.end = segment.end;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

function toSegmentFrame(segment: Segment): SegmentFrame {
  if (segment.orientation === "vertical") {
    return {
      lengthM: segment.end - segment.start,
      centerX: segment.coord,
      centerZ: (segment.start + segment.end) * 0.5,
      tangentX: 0,
      tangentZ: 1,
      inwardX: -segment.outward,
      inwardZ: 0,
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
  };
}

function pointInRect2D(
  zone: { rect: { x: number; y: number; w: number; h: number } },
  x: number,
  z: number,
): boolean {
  const rect = zone.rect;
  return x >= rect.x && x <= rect.x + rect.w && z >= rect.y && z <= rect.y + rect.h;
}

function resolveSegmentZone(
  frame: SegmentFrame,
  zones: Array<{ id: string; type: string; rect: { x: number; y: number; w: number; h: number } }>,
) {
  const probeX = frame.centerX + frame.inwardX * 0.1;
  const probeZ = frame.centerZ + frame.inwardZ * 0.1;
  let winner: typeof zones[number] | null = null;
  let winnerArea = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    if (!DETAIL_ZONE_TYPES.has(zone.type)) {
      continue;
    }
    if (!pointInRect2D(zone, probeX, probeZ)) {
      continue;
    }
    const area = zone.rect.w * zone.rect.h;
    if (area < winnerArea) {
      winnerArea = area;
      winner = zone;
    }
  }
  return winner;
}

function project(frame: SegmentFrame, position: { x: number; y: number; z: number }) {
  const dx = position.x - frame.centerX;
  const dz = position.z - frame.centerZ;
  return {
    alongS: dx * frame.tangentX + dz * frame.tangentZ,
    inwardN: dx * frame.inwardX + dz * frame.inwardZ,
    y: position.y,
  };
}

async function buildAuditContext(): Promise<AuditContext> {
  const raw = JSON.parse(await readFile("public/maps/bazaar-map/map_spec.json", "utf8"));
  const spec = parseBlockoutSpec(raw, "public/maps/bazaar-map/map_spec.json");
  const walkableRects = spec.zones
    .filter((zone) => WALKABLE_ZONE_TYPES.has(zone.type))
    .map((zone) => zone.rect);
  const { xs, ys } = collectAxisCoordinates(walkableRects, spec.playable_boundary);
  const segments = mergeBoundarySegments(extractBoundarySegments(buildInsideGrid(walkableRects, xs, ys), xs, ys));
  const metas: SegmentMeta[] = segments.map((segment, index) => {
    const frame = toSegmentFrame(segment);
    const zone = resolveSegmentZone(frame, spec.zones);
    const face = resolveFacadeFaceForSegment(zone, frame);
    return {
      index,
      segment,
      frame,
      zone,
      face,
      ordinal: null,
    };
  });

  const groups = new Map<string, SegmentMeta[]>();
  for (const meta of metas) {
    if (!meta.zone) {
      continue;
    }
    const key = `${meta.zone.id}:${meta.face}`;
    const list = groups.get(key) ?? [];
    list.push(meta);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.segment.start - right.segment.start);
    list.forEach((meta, index) => {
      meta.ordinal = index + 1;
    });
  }

  const placements = buildWallDetailPlacements({
    segments,
    zones: spec.zones,
    anchors: null,
    facadeOverrides: spec.wall_details.facadeOverrides,
    moduleRegistry: spec.wall_details.moduleRegistry,
    compositionLayoutOverrides: spec.wall_details.compositionLayoutOverrides,
    doorLayoutOverrides: spec.wall_details.doorLayoutOverrides,
    windowLayoutOverrides: spec.wall_details.windowLayoutOverrides,
    balconyLayoutOverrides: spec.wall_details.balconyLayoutOverrides,
    seed: 1,
    wallHeightM: spec.defaults.wall_height,
    wallThicknessM: spec.defaults.wall_thickness,
    enabled: spec.wall_details.enabled,
    profile: "pbr",
    detailSeed: null,
    density: spec.wall_details.density,
    maxProtrusionM: spec.wall_details.maxProtrusion,
  });

  return { spec, metas, placements };
}

function findBestSegmentMeta(
  metas: SegmentMeta[],
  position: { x: number; y: number; z: number },
  maxNormalDistance = 2.5,
): { meta: SegmentMeta; local: ReturnType<typeof project> } | null {
  const matches = metas
    .map((meta) => ({
      meta,
      local: project(meta.frame, position),
    }))
    .filter(({ meta, local }) => (
      Math.abs(local.alongS) <= meta.frame.lengthM * 0.5 + 0.3
      && Math.abs(local.inwardN) <= maxNormalDistance
    ))
    .sort((left, right) => (
      Math.abs(left.local.inwardN) - Math.abs(right.local.inwardN)
      || Math.abs(left.local.alongS) - Math.abs(right.local.alongS)
    ));

  return matches[0] ?? null;
}

function isBalconyLikeMesh(meshId: string): boolean {
  return meshId.startsWith("balcony_")
    || meshId === "spawn_hero_corbel"
    || meshId === "spawn_hero_pediment";
}

function windowFrameLike(meshId: string): boolean {
  return meshId === "spawn_window_pointed_arch_frame"
    || meshId === "spawn_hero_window_pointed_arch_frame"
    || meshId === "window_pointed_arch_frame"
    || meshId === "hero_window_pointed_arch_frame";
}

function isSpawnBReferenceMeta(meta: SegmentMeta): boolean {
  return meta.zone?.id === "SPAWN_B_GATE_PLAZA"
    && (
      (meta.face === "north" && meta.ordinal === 1)
      || (meta.face === "west" && meta.ordinal === 2)
      || (meta.face === "east" && meta.ordinal === 2)
    );
}

function digestBSpawn(context: AuditContext): { detailHash: string; doorHash: string; wallHash: string } {
  const bMetas = context.metas.filter((meta) => isSpawnBReferenceMeta(meta));
  const detailRecords = context.placements.instances
    .map((instance) => {
      const hit = findBestSegmentMeta(bMetas, instance.position);
      if (!hit) {
        return null;
      }
      return {
        face: hit.meta.face,
        ordinal: hit.meta.ordinal,
        meshId: instance.meshId,
        x: +hit.local.alongS.toFixed(3),
        y: +instance.position.y.toFixed(3),
        n: +hit.local.inwardN.toFixed(3),
        sx: +instance.scale.x.toFixed(3),
        sy: +instance.scale.y.toFixed(3),
        sz: +instance.scale.z.toFixed(3),
        wall: instance.wallMaterialId,
        trim: instance.trimMaterialId,
        detail: instance.detailMaterialId ?? null,
      };
    })
    .filter((record): record is NonNullable<typeof record> => record != null)
    .sort((left, right) => (
      left.face.localeCompare(right.face)
      || left.ordinal! - right.ordinal!
      || left.meshId.localeCompare(right.meshId)
      || left.x - right.x
      || left.y - right.y
      || left.n - right.n
    ));

  const doorRecords = context.placements.doorModelPlacements
    .map((placement) => {
      const hit = findBestSegmentMeta(bMetas, placement.wallSurfacePos, 0.25);
      if (!hit) {
        return null;
      }
      return {
        face: hit.meta.face,
        ordinal: hit.meta.ordinal,
        x: +hit.local.alongS.toFixed(3),
        y: +placement.wallSurfacePos.y.toFixed(3),
        doorW: +placement.doorW.toFixed(3),
        doorH: +placement.doorH.toFixed(3),
        surroundDepthM: +(placement.surroundDepthM ?? 0).toFixed(3),
        coverWidthM: +(placement.coverWidthM ?? 0).toFixed(3),
        coverHeightM: +(placement.coverHeightM ?? 0).toFixed(3),
        trimThicknessM: +(placement.trimThicknessM ?? 0).toFixed(3),
        trim: placement.trimMaterialId,
      };
    })
    .filter((record): record is NonNullable<typeof record> => record != null)
    .sort((left, right) => left.face.localeCompare(right.face) || left.ordinal! - right.ordinal! || left.x - right.x);

  const wallRecords = bMetas
    .map((meta) => ({
      face: meta.face,
      ordinal: meta.ordinal,
      material: resolveFacadeStyleForSegment(meta.zone, meta.frame).materials.wall,
    }))
    .sort((left, right) => left.face.localeCompare(right.face) || left.ordinal! - right.ordinal!);

  return {
    detailHash: createHash("sha256").update(JSON.stringify(detailRecords)).digest("hex"),
    doorHash: createHash("sha256").update(JSON.stringify(doorRecords)).digest("hex"),
    wallHash: createHash("sha256").update(JSON.stringify(wallRecords)).digest("hex"),
  };
}

function assertMirrored(values: number[], tolerance: number, label: string): void {
  const sorted = [...values].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    const mirrored = sorted[sorted.length - 1 - index]!;
    assert.ok(
      Math.abs(sorted[index]! + mirrored) <= tolerance,
      `${label} lost symmetry: ${sorted.join(", ")}`,
    );
  }
}

function collectInstancesBySegment(
  context: AuditContext,
): Map<string, Array<{ meshId: string; alongS: number; y: number; start: number; end: number }>> {
  const instancesBySegment = new Map<string, Array<{ meshId: string; alongS: number; y: number; start: number; end: number }>>();
  for (const instance of context.placements.instances) {
    const hit = findBestSegmentMeta(context.metas, instance.position);
    if (!hit) {
      continue;
    }
    const key = `${hit.meta.zone?.id ?? "none"}:${hit.meta.face}#${hit.meta.ordinal ?? 0}`;
    const list = instancesBySegment.get(key) ?? [];
    list.push({
      meshId: instance.meshId,
      alongS: hit.local.alongS,
      y: instance.position.y,
      start: hit.local.alongS - instance.scale.z * 0.5,
      end: hit.local.alongS + instance.scale.z * 0.5,
    });
    instancesBySegment.set(key, list);
  }
  return instancesBySegment;
}

function collectDoorCentersBySegment(context: AuditContext): Map<string, number[]> {
  const doorCentersBySegment = new Map<string, number[]>();
  for (const placement of context.placements.doorModelPlacements) {
    const hit = findBestSegmentMeta(context.metas, placement.wallSurfacePos, 0.25);
    if (!hit) {
      continue;
    }
    const key = `${hit.meta.zone?.id ?? "none"}:${hit.meta.face}#${hit.meta.ordinal ?? 0}`;
    const list = doorCentersBySegment.get(key) ?? [];
    list.push(hit.local.alongS);
    doorCentersBySegment.set(key, list);
  }
  return doorCentersBySegment;
}

test("preserves the Spawn B reference digest", async () => {
  const context = await buildAuditContext();
  const digest = digestBSpawn(context);
  assert.equal(digest.detailHash, B_SPAWN_DETAIL_HASH);
  assert.equal(digest.doorHash, B_SPAWN_DOOR_HASH);
  assert.equal(digest.wallHash, B_SPAWN_WALL_HASH);
});

test("uses canonical openings, removes generic balconies, and clears hallway openings", async () => {
  const context = await buildAuditContext();
  const doorModule = context.spec.wall_details.moduleRegistry.doorModules.find((module) => module.id === "spawn_standard_door");
  assert.ok(doorModule, "spawn standard door module missing");

  const instancesBySegment = collectInstancesBySegment(context);
  const doorCentersBySegment = collectDoorCentersBySegment(context);

  for (const placement of context.placements.doorModelPlacements) {
    const hit = findBestSegmentMeta(context.metas, placement.wallSurfacePos, 0.25);
    if (!hit) {
      continue;
    }
    const key = `${hit.meta.zone?.id ?? "none"}:${hit.meta.face}#${hit.meta.ordinal ?? 0}`;
    if (hit.meta.zone?.id !== "SPAWN_B_GATE_PLAZA") {
      assert.ok(Math.abs(placement.doorW - doorModule!.doorWidthM) <= 1e-6, `${key} drifted off canonical door width`);
      assert.ok(Math.abs(placement.doorH - doorModule!.doorHeightM) <= 1e-6, `${key} drifted off canonical door height`);
      assert.ok(Math.abs((placement.coverWidthM ?? 0) - doorModule!.coverWidthM) <= 1e-6, `${key} drifted off canonical cover width`);
      assert.ok(Math.abs((placement.coverHeightM ?? 0) - doorModule!.coverHeightM) <= 1e-6, `${key} drifted off canonical cover height`);
      assert.ok(Math.abs((placement.surroundDepthM ?? 0) - doorModule!.surroundDepthM) <= 1e-6, `${key} drifted off canonical surround depth`);
    }
  }

  for (const [key, entries] of instancesBySegment) {
    const zoneId = key.split(":")[0]!;

    if (zoneId === "SH_W" || zoneId === "SH_E") {
      assert.ok(
        entries.every(({ meshId }) => !meshId.includes("window") && !meshId.includes("door")),
        `${key} still contains hallway openings`,
      );
      assert.equal(doorCentersBySegment.get(key)?.length ?? 0, 0, `${key} still has hallway door placements`);
    }

    if (zoneId !== "SPAWN_B_GATE_PLAZA") {
      assert.ok(
        entries.every(({ meshId }) => meshId !== "window_pointed_arch_frame" && meshId !== "hero_window_pointed_arch_frame"),
        `${key} still uses non-canonical window geometry`,
      );
    }

    const balconyMeshes = entries.filter(({ meshId }) => isBalconyLikeMesh(meshId));
    if (balconyMeshes.length > 0) {
      assert.ok(
        key === "SPAWN_B_GATE_PLAZA:north#1" || key === "SPAWN_A_COURTYARD:south#1",
        `${key} still carries a non-approved balcony/portico mesh`,
      );
    }

    const windowCenters = entries
      .filter(({ meshId }) => windowFrameLike(meshId))
      .map(({ alongS }) => alongS);
    const doorCenters = doorCentersBySegment.get(key) ?? [];
    if (windowCenters.length > 0 || doorCenters.length > 0) {
      assertMirrored([...windowCenters, ...doorCenters], 0.02, key);
    }

    const rows = new Map<string, Array<{ start: number; end: number; meshId: string }>>();
    for (const entry of entries.filter(({ meshId }) => windowFrameLike(meshId))) {
      const rowKey = entry.y.toFixed(3);
      const list = rows.get(rowKey) ?? [];
      list.push({ start: entry.start, end: entry.end, meshId: entry.meshId });
      rows.set(rowKey, list);
    }
    for (const center of doorCenters) {
      const rowKey = (doorModule!.doorHeightM * 0.5).toFixed(3);
      const list = rows.get(rowKey) ?? [];
      list.push({
        start: center - doorModule!.coverWidthM * 0.5,
        end: center + doorModule!.coverWidthM * 0.5,
        meshId: "door",
      });
      rows.set(rowKey, list);
    }
    for (const [rowKey, rowEntries] of rows) {
      const sorted = [...rowEntries].sort((left, right) => left.start - right.start);
      for (let index = 1; index < sorted.length; index += 1) {
        assert.ok(
          sorted[index]!.start >= sorted[index - 1]!.end - 0.01,
          `${key} row ${rowKey} has overlapping openings`,
        );
      }
    }
  }
});

test("adds a third standardized window row on main hallway facades only", async () => {
  const context = await buildAuditContext();
  const instancesBySegment = collectInstancesBySegment(context);
  const expectedTopRowCounts = new Map<string, { topRow: number; total: number }>([
    ["BZ_M1:east#1", { topRow: 3, total: 8 }],
    ["BZ_M1:west#1", { topRow: 3, total: 8 }],
    ["BZ_M1:east#2", { topRow: 1, total: 3 }],
    ["BZ_M1:west#2", { topRow: 1, total: 3 }],
    ["BZ_M2_JOG:east#1", { topRow: 7, total: 17 }],
    ["BZ_M2_JOG:west#1", { topRow: 7, total: 20 }],
    ["BZ_M3:east#1", { topRow: 1, total: 3 }],
    ["BZ_M3:west#1", { topRow: 1, total: 3 }],
    ["BZ_M3:east#2", { topRow: 3, total: 8 }],
    ["BZ_M3:west#2", { topRow: 3, total: 8 }],
  ]);

  for (const [key, expected] of expectedTopRowCounts) {
    const frameEntries = (instancesBySegment.get(key) ?? []).filter(
      ({ meshId }) => meshId === "spawn_window_pointed_arch_frame",
    );
    assert.equal(frameEntries.length, expected.total, `${key} total standardized window count drifted`);

    const rowCounts = new Map<string, number>();
    for (const entry of frameEntries) {
      const rowKey = entry.y.toFixed(3);
      rowCounts.set(rowKey, (rowCounts.get(rowKey) ?? 0) + 1);
    }

    const rows = [...rowCounts.entries()].sort((left, right) => Number(left[0]) - Number(right[0]));
    assert.equal(rows.length, 3, `${key} should have exactly three standardized window rows`);
    assert.equal(rows[2]?.[1], expected.topRow, `${key} top row count drifted`);
    assert.equal(rows[1]?.[1], expected.topRow, `${key} third story should mirror the second-story solve`);
  }

  const unchangedSegments = [
    "SPAWN_A_COURTYARD:east#1",
    "SPAWN_A_COURTYARD:west#1",
    "CONN_NE:north#1",
    "CONN_NW:north#1",
  ];
  for (const key of unchangedSegments) {
    const frameEntries = (instancesBySegment.get(key) ?? []).filter(
      ({ meshId }) => meshId === "spawn_window_pointed_arch_frame",
    );
    const rowCount = new Set(frameEntries.map((entry) => entry.y.toFixed(3))).size;
    assert.ok(rowCount <= 2, `${key} unexpectedly gained a third standardized window row`);
  }
});

function resolveSegmentMetaByKey(context: AuditContext, key: string): SegmentMeta {
  const [zoneId, faceOrdinal] = key.split(":");
  const [face, ordinalRaw] = faceOrdinal!.split("#");
  const meta = context.metas.find((candidate) => (
    candidate.zone?.id === zoneId
    && candidate.face === face
    && candidate.ordinal === Number(ordinalRaw)
  ));
  assert.ok(meta, `missing segment meta for ${key}`);
  return meta!;
}

function collectSegmentWindowFrames(
  context: AuditContext,
  key: string,
  maxNormalDistance = 0.5,
): Array<{ alongS: number; y: number }> {
  const meta = resolveSegmentMetaByKey(context, key);
  return context.placements.instances
    .map((instance) => ({
      instance,
      local: project(meta.frame, instance.position),
    }))
    .filter(({ instance, local }) => (
      instance.meshId === "spawn_window_pointed_arch_frame"
      && Math.abs(local.alongS) <= meta.frame.lengthM * 0.5 + 0.3
      && Math.abs(local.inwardN) <= maxNormalDistance
    ))
    .map(({ instance, local }) => ({
      alongS: local.alongS,
      y: instance.position.y,
    }))
    .sort((left, right) => left.y - right.y || left.alongS - right.alongS);
}

test("standardizes the four spawn-facing main-building end walls with two canonical windows per row", async () => {
  const context = await buildAuditContext();
  const doorCentersBySegment = collectDoorCentersBySegment(context);
  const expectedRowYs = ["1.686", "4.486", "7.486"];
  const targetSegments = [
    "SPAWN_A_COURTYARD:north#1",
    "SPAWN_A_COURTYARD:north#2",
    "SPAWN_B_GATE_PLAZA:south#1",
    "SPAWN_B_GATE_PLAZA:south#2",
  ];

  for (const key of targetSegments) {
    const frameEntries = collectSegmentWindowFrames(context, key);
    assert.equal(frameEntries.length, 6, `${key} should have exactly two end-wall windows per row`);
    assert.equal(doorCentersBySegment.get(key)?.length ?? 0, 0, `${key} should not receive doors`);

    const rows = [...new Set(frameEntries.map((entry) => entry.y.toFixed(3)))].sort();
    assert.deepEqual(rows, expectedRowYs, `${key} row heights drifted`);

    for (const rowKey of rows) {
      const rowEntries = frameEntries
        .filter((entry) => entry.y.toFixed(3) === rowKey)
        .map((entry) => entry.alongS)
        .sort((left, right) => left - right);
      assert.equal(rowEntries.length, 2, `${key} row ${rowKey} should have exactly two windows`);
      assertMirrored(rowEntries, 0.02, `${key} row ${rowKey}`);
    }
  }

  const oldWrongSegments = [
    "BZ_M1:north#1",
    "BZ_M2_JOG:north#1",
    "BZ_M2_JOG:south#1",
    "BZ_M3:south#1",
  ];
  for (const key of oldWrongSegments) {
    const frameEntries = collectSegmentWindowFrames(context, key);
    assert.ok(frameEntries.length <= 3, `${key} should no longer use the dedicated end-wall treatment`);
  }

  const connectorSegments = [
    "CONN_SW:north#1",
    "CONN_SE:north#1",
    "CONN_NW:north#1",
    "CONN_NE:north#1",
  ];
  for (const key of connectorSegments) {
    const frameEntries = collectSegmentWindowFrames(context, key);
    assert.equal(frameEntries.length, 0, `${key} should remain unchanged`);
  }
});

test("adds one narrow centered window per row on the four connector-adjacent corner walls", async () => {
  const context = await buildAuditContext();
  const doorCentersBySegment = collectDoorCentersBySegment(context);
  const cornerSegments = [
    "SPAWN_A_COURTYARD:west#2",
    "SPAWN_A_COURTYARD:east#2",
    "SPAWN_B_GATE_PLAZA:west#1",
    "SPAWN_B_GATE_PLAZA:east#1",
  ];
  const expectedRowYs = ["1.686", "4.486", "7.486"];

  for (const key of cornerSegments) {
    const frameEntries = collectSegmentWindowFrames(context, key, 0.3);
    assert.equal(frameEntries.length, 3, `${key} should have exactly one corner window per row`);
    assert.equal(doorCentersBySegment.get(key)?.length ?? 0, 0, `${key} should not receive doors`);

    const rows = [...new Set(frameEntries.map((entry) => entry.y.toFixed(3)))].sort();
    assert.deepEqual(rows, expectedRowYs, `${key} row heights drifted`);

    for (const entry of frameEntries) {
      assert.ok(Math.abs(entry.alongS) <= 0.02, `${key} corner window drifted off centerline`);
    }

    const meta = resolveSegmentMetaByKey(context, key);
    const override = resolveWallPlaneOverride(meta.zone, meta.face, meta.ordinal);
    assert.ok(override, `${key} should resolve a shared wall-plane override`);
    assert.equal(override?.materials.wall, "ph_brick_4_desert", `${key} wall material override drifted`);
    assert.equal(override?.materials.trimHeavy, "ph_stone_trim_white", `${key} heavy trim override drifted`);
    assert.equal(override?.materials.trimLight, "ph_band_plastered", `${key} light trim override drifted`);
  }

  const connectorSegments = [
    "CONN_SW:north#1",
    "CONN_SE:north#1",
    "CONN_NW:north#1",
    "CONN_NE:north#1",
  ];
  for (const key of connectorSegments) {
    const frameEntries = collectSegmentWindowFrames(context, key, 0.3);
    assert.equal(frameEntries.length, 0, `${key} should remain unchanged`);
  }
});
