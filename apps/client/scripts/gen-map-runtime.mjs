import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAP_ID = "bazaar-map";
const COMPARE_SHOT_ID = "SHOT_BLOCKOUT_COMPARE";
const KNOWN_ZONE_TYPES = new Set([
  "clear_travel_zone",
  "connector",
  "cut",
  "main_lane_segment",
  "side_hall",
  "spawn_plaza",
  "stall_strip",
]);
const KNOWN_ANCHOR_TYPES = new Set([
  "cloth_canopy_span",
  "cover_cluster",
  "hero_landmark",
  "landmark",
  "service_door_anchor",
  "shopfront_anchor",
  "signage_anchor",
  "spawn_cover",
]);

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const repoRoot = path.resolve(scriptDir, "../../..");

const mapSpecPath = path.join(repoRoot, "docs/map-design/specs/map_spec.json");
const designShotsPath = path.join(repoRoot, "docs/map-design/shots.json");
const runtimeDir = path.join(repoRoot, "apps/client/public/maps", MAP_ID);

const blockoutOutPath = path.join(runtimeDir, "blockout_spec.json");
const anchorsOutPath = path.join(runtimeDir, "anchors.json");
const shotsOutPath = path.join(runtimeDir, "shots.json");

function fail(message) {
  throw new Error(`[gen:maps] ${message}`);
}

function asNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function optionalNumber(value, label) {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number when provided`);
  }
  return value;
}

function ensurePositive(value, label) {
  if (value <= 0) {
    fail(`${label} must be > 0`);
  }
}

function ensureString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeRect(rect, label) {
  if (!rect || typeof rect !== "object") {
    fail(`${label} is missing`);
  }

  const normalized = {
    x: asNumber(rect.x, `${label}.x`),
    y: asNumber(rect.y, `${label}.y`),
    w: asNumber(rect.w, `${label}.w`),
    h: asNumber(rect.h, `${label}.h`),
  };

  ensurePositive(normalized.w, `${label}.w`);
  ensurePositive(normalized.h, `${label}.h`);
  return normalized;
}

function inRect2D(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function sortedById(items) {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueSortedStrings(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`[gen:maps] wrote ${path.relative(repoRoot, filePath)}`);
}

function deriveZones(spec) {
  const zones = spec?.zones;
  if (!Array.isArray(zones) || zones.length === 0) {
    fail("spec.zones must be a non-empty array");
  }

  const allowedZoneTypes =
    Array.isArray(spec?.metadata?.zone_types) && spec.metadata.zone_types.length > 0
      ? new Set(spec.metadata.zone_types)
      : KNOWN_ZONE_TYPES;

  const seenIds = new Set();
  const derived = zones.map((zone, index) => {
    if (!zone || typeof zone !== "object") {
      fail(`zones[${index}] must be an object`);
    }

    const id = ensureString(zone.id, `zones[${index}].id`);
    const type = ensureString(zone.type, `zones[${index}].type`);
    if (!allowedZoneTypes.has(type)) {
      fail(`Unknown zone type '${type}' at zone '${id}'`);
    }
    if (seenIds.has(id)) {
      fail(`Duplicate zone id '${id}'`);
    }
    seenIds.add(id);

    const rect = normalizeRect(zone.rect, `zones[${index}].rect`);
    return {
      id,
      type,
      rect,
      label: typeof zone.label === "string" ? zone.label : "",
      notes: typeof zone.notes === "string" ? zone.notes : "",
    };
  });

  return {
    zoneIds: seenIds,
    zones: sortedById(derived),
  };
}

function deriveAnchors(spec, zoneIds) {
  const anchors = spec?.anchors;
  if (!Array.isArray(anchors)) {
    fail("spec.anchors must be an array");
  }

  const allowedAnchorTypes =
    Array.isArray(spec?.metadata?.anchor_types) && spec.metadata.anchor_types.length > 0
      ? new Set(spec.metadata.anchor_types)
      : KNOWN_ANCHOR_TYPES;

  const seenIds = new Set();
  const derived = anchors.map((anchor, index) => {
    if (!anchor || typeof anchor !== "object") {
      fail(`anchors[${index}] must be an object`);
    }

    const id = ensureString(anchor.id, `anchors[${index}].id`);
    const type = ensureString(anchor.type, `anchors[${index}].type`);
    if (!allowedAnchorTypes.has(type)) {
      fail(`Unknown anchor type '${type}' at anchor '${id}'`);
    }
    if (seenIds.has(id)) {
      fail(`Duplicate anchor id '${id}'`);
    }
    seenIds.add(id);

    const zone = ensureString(anchor.zone, `anchors[${index}].zone`);
    if (!zoneIds.has(zone)) {
      fail(`Anchor '${id}' references unknown zone '${zone}'`);
    }

    const x = asNumber(anchor.x, `anchors[${index}].x`);
    const y = asNumber(anchor.y, `anchors[${index}].y`);
    const z = asNumber(anchor.z, `anchors[${index}].z`);
    const yawDeg = optionalNumber(anchor.yaw_deg, `anchors[${index}].yaw_deg`);

    const endX = optionalNumber(anchor.end_x, `anchors[${index}].end_x`);
    const endY = optionalNumber(anchor.end_y, `anchors[${index}].end_y`);
    const endZ = optionalNumber(anchor.end_z, `anchors[${index}].end_z`);
    const hasAnyEndPos = typeof endX !== "undefined" || typeof endY !== "undefined" || typeof endZ !== "undefined";
    if (hasAnyEndPos && (typeof endX === "undefined" || typeof endY === "undefined" || typeof endZ === "undefined")) {
      fail(`Anchor '${id}' must provide all of end_x/end_y/end_z or none`);
    }

    const widthM = optionalNumber(anchor.width_m, `anchors[${index}].width_m`);
    const heightM = optionalNumber(anchor.height_m, `anchors[${index}].height_m`);
    if (typeof widthM !== "undefined") ensurePositive(widthM, `anchors[${index}].width_m`);
    if (typeof heightM !== "undefined") ensurePositive(heightM, `anchors[${index}].height_m`);

    const normalized = {
      id,
      type,
      zone,
      pos: { x, y, z },
      ...(typeof yawDeg !== "undefined" ? { yawDeg } : {}),
      ...(hasAnyEndPos ? { endPos: { x: endX, y: endY, z: endZ } } : {}),
      ...(typeof widthM !== "undefined" ? { widthM } : {}),
      ...(typeof heightM !== "undefined" ? { heightM } : {}),
      ...(typeof anchor.notes === "string" && anchor.notes.length > 0 ? { notes: anchor.notes } : {}),
    };

    return normalized;
  });

  return sortedById(derived);
}

function warnAnchorsInClearZones(anchors, zones) {
  const clearTravelZones = zones.filter((zone) => zone.type === "clear_travel_zone");
  for (const anchor of anchors) {
    for (const zone of clearTravelZones) {
      if (inRect2D(anchor.pos.x, anchor.pos.y, zone.rect)) {
        console.warn(
          `[gen:maps] warning: anchor '${anchor.id}' (${anchor.type}) lies inside clear_travel_zone '${zone.id}'`,
        );
      }
    }
  }
}

function deriveBlockoutSpec(spec, zones) {
  const globalDimensions = spec?.global_dimensions;
  if (!globalDimensions || typeof globalDimensions !== "object") {
    fail("spec.global_dimensions is missing");
  }

  const playableBoundary = normalizeRect(globalDimensions.playable_boundary, "global_dimensions.playable_boundary");
  const wallHeight = asNumber(globalDimensions.wall_height_default, "global_dimensions.wall_height_default");
  const ceilingHeight = asNumber(globalDimensions.ceiling_height_default, "global_dimensions.ceiling_height_default");
  const floorHeight = asNumber(globalDimensions.floor_height_default, "global_dimensions.floor_height_default");

  ensurePositive(wallHeight, "global_dimensions.wall_height_default");
  ensurePositive(ceilingHeight, "global_dimensions.ceiling_height_default");

  const constraints = spec?.constraints;
  if (!constraints || typeof constraints !== "object") {
    fail("spec.constraints is missing");
  }

  const minMainLane = asNumber(constraints.min_path_width_main_lane, "constraints.min_path_width_main_lane");
  const minSideHalls = asNumber(constraints.min_path_width_side_halls, "constraints.min_path_width_side_halls");
  ensurePositive(minMainLane, "constraints.min_path_width_main_lane");
  ensurePositive(minSideHalls, "constraints.min_path_width_side_halls");

  return {
    mapId: MAP_ID,
    playable_boundary: playableBoundary,
    defaults: {
      wall_height: wallHeight,
      ceiling_height: ceilingHeight,
      floor_height: floorHeight,
    },
    zones,
    constraints: {
      min_path_width_main_lane: minMainLane,
      min_path_width_side_halls: minSideHalls,
    },
  };
}

function deriveShotsRuntime(designShotsDoc) {
  const sourceShots = Array.isArray(designShotsDoc?.shots) ? designShotsDoc.shots : [];
  if (sourceShots.length === 0) {
    fail("docs/map-design/shots.json must contain a non-empty 'shots' array");
  }

  const shots = sourceShots.map((shot) => JSON.parse(JSON.stringify(shot)));
  const hasCompareShot = shots.some((shot) => shot?.id === COMPARE_SHOT_ID);

  if (!hasCompareShot) {
    const topdown =
      shots.find((shot) => shot?.id === "SHOT_01_TOPDOWN_ESTABLISHING") ||
      shots.find((shot) => typeof shot?.label === "string" && /topdown/i.test(shot.label));

    const fallbackCamera = {
      pos: { x: 25.0, y: 41.0, z: 55.0 },
      lookAt: { x: 25.0, y: 41.0, z: 0.0 },
      fovDeg: 60.0,
    };

    const topdownCamera = topdown?.camera && typeof topdown.camera === "object" ? topdown.camera : fallbackCamera;
    const tags = uniqueSortedStrings([
      ...(Array.isArray(topdown?.tags) ? topdown.tags.filter((tag) => typeof tag === "string") : []),
      "compare",
    ]);

    shots.push({
      id: COMPARE_SHOT_ID,
      label: "Blockout compare",
      description: "Canonical deterministic compare shot for blockout captures.",
      camera: topdownCamera,
      durationSec: typeof topdown?.durationSec === "number" ? topdown.durationSec : 3.0,
      tags,
    });
  }

  const sortedShots = [...shots].sort((a, b) => {
    const aId = typeof a?.id === "string" ? a.id : "";
    const bId = typeof b?.id === "string" ? b.id : "";
    return aId.localeCompare(bId);
  });

  const metadata =
    designShotsDoc?.metadata && typeof designShotsDoc.metadata === "object"
      ? { ...designShotsDoc.metadata }
      : {};

  return {
    metadata: {
      ...metadata,
      mapId: MAP_ID,
      shotCount: sortedShots.length,
    },
    aliases: {
      compare: COMPARE_SHOT_ID,
    },
    shots: sortedShots,
  };
}

async function main() {
  const mapSpec = await readJson(mapSpecPath);
  const designShots = await readJson(designShotsPath);

  const { zoneIds, zones } = deriveZones(mapSpec);
  const anchors = deriveAnchors(mapSpec, zoneIds);
  warnAnchorsInClearZones(anchors, zones);

  const blockoutSpec = deriveBlockoutSpec(mapSpec, zones);
  const anchorsRuntime = {
    mapId: MAP_ID,
    anchors,
  };
  const shotsRuntime = deriveShotsRuntime(designShots);

  await mkdir(runtimeDir, { recursive: true });
  await writeJson(blockoutOutPath, blockoutSpec);
  await writeJson(anchorsOutPath, anchorsRuntime);
  await writeJson(shotsOutPath, shotsRuntime);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
