import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAP_ID = "bazaar-map";
const STORY_HEIGHT_M = 3.0;
const SEGMENT_EDGE_MARGIN_M = 0.35;
const SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_M = 0.58;
const SPAWN_B_SHELL_SHARED_PLINTH_DEPTH_M = 0.17;
const FACE_VALUES = ["north", "south", "east", "west"];
const TARGET_WALL_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "connector",
  "cut",
]);
const WALKABLE_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);
const FLOOR_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "cut",
  "connector",
]);
const AREA_ZONE_TYPES = new Set([
  "spawn_plaza",
  "main_lane_segment",
  "side_hall",
  "connector",
  "cut",
  "clear_travel_zone",
  "stall_strip",
]);
const EPS = 1e-6;
const SVG_MARGIN = 40;
const SVG_SCALE = 10;

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const repoRoot = path.resolve(scriptDir, "../../..");

const mapSpecPath = path.join(repoRoot, "docs/map-design/specs/map_spec.json");
const calloutsPath = path.join(repoRoot, "docs/map-design/specs/callouts.csv");
const objectCatalogPath = path.join(repoRoot, "docs/map-design/specs/object_catalog.csv");
const docsOutDir = path.join(repoRoot, "docs/map-design");
const markdownOutPath = path.join(docsOutDir, "layout-reference.md");
const svgOutPath = path.join(docsOutDir, "layout-reference.svg");

function fail(message) {
  throw new Error(`[gen:layout-reference] ${message}`);
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function asArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value;
}

function asString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function asNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function approxEqual(left, right, epsilon = EPS) {
  return Math.abs(left - right) <= epsilon;
}

function rangeLabel(start, end) {
  return `${start.toFixed(2)}-${end.toFixed(2)}m`;
}

function formatFace(face) {
  return face.charAt(0).toUpperCase() + face.slice(1);
}

function formatType(value) {
  return value.replaceAll("_", " ");
}

function normalizeUint32(value) {
  return value >>> 0;
}

function normalizeSeed(seed) {
  if (!Number.isFinite(seed)) return 1;
  return normalizeUint32(Math.trunc(seed));
}

function deriveSeedFromString(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return normalizeUint32(hash);
}

function deriveSubSeed(seed, tag) {
  const normalizedSeed = normalizeSeed(seed) || 1;
  const mixedInput = `${normalizedSeed}:${tag}`;
  const hashed = deriveSeedFromString(mixedInput);
  return hashed || 1;
}

class DeterministicRng {
  constructor(seed) {
    this.seed = normalizeSeed(seed) || 1;
    this.state = this.seed;
  }

  next() {
    this.state = normalizeUint32(this.state + 0x6d2b79f5);
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  fork(tag) {
    return new DeterministicRng(deriveSubSeed(this.seed, tag));
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  console.log(`[gen:layout-reference] wrote ${path.relative(repoRoot, filePath)}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((columns) => {
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = (columns[index] ?? "").trim();
    }
    return record;
  });
}

function normalizeRect(rect, label) {
  const object = asObject(rect, label);
  const x = asNumber(object.x, `${label}.x`);
  const y = asNumber(object.y, `${label}.y`);
  const w = asNumber(object.w, `${label}.w`);
  const h = asNumber(object.h, `${label}.h`);
  if (w <= 0 || h <= 0) {
    fail(`${label} width and height must be > 0`);
  }
  return { x, y, w, h };
}

function rectContainsPoint(rect, x, y) {
  return x >= rect.x - EPS && x <= rect.x + rect.w + EPS && y >= rect.y - EPS && y <= rect.y + rect.h + EPS;
}

function rectContainsRect(outer, inner) {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}

function overlapRange(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return end - start > EPS ? { start, end } : null;
}

function subtractRanges(start, end, blocks) {
  const sorted = [...blocks]
    .filter((block) => block.end - block.start > EPS)
    .sort((left, right) => left.start - right.start);
  const parts = [];
  let cursor = start;

  for (const block of sorted) {
    const clippedStart = clamp(block.start, start, end);
    const clippedEnd = clamp(block.end, start, end);
    if (clippedEnd - clippedStart <= EPS) continue;
    if (clippedStart - cursor > EPS) {
      parts.push({ start: cursor, end: clippedStart });
    }
    cursor = Math.max(cursor, clippedEnd);
  }

  if (end - cursor > EPS) {
    parts.push({ start: cursor, end });
  }

  return parts;
}

function collectAxisCoordinates(rects, boundary) {
  const xs = new Set([boundary.x, boundary.x + boundary.w]);
  const ys = new Set([boundary.y, boundary.y + boundary.h]);

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

function buildInsideGrid(walkableRects, xs, ys) {
  const rows = ys.length - 1;
  const cols = xs.length - 1;
  const inside = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerX = (xs[col] + xs[col + 1]) * 0.5;
      const centerY = (ys[row] + ys[row + 1]) * 0.5;
      inside[row][col] = walkableRects.some((rect) => rectContainsPoint(rect, centerX, centerY));
    }
  }

  return inside;
}

function extractBoundarySegments(inside, xs, ys) {
  const rows = inside.length;
  const cols = inside[0]?.length ?? 0;
  const segments = [];

  const isInside = (xIndex, yIndex) => {
    if (xIndex < 0 || yIndex < 0 || xIndex >= cols || yIndex >= rows) return false;
    return inside[yIndex]?.[xIndex] ?? false;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!inside[row]?.[col]) continue;

      const x0 = xs[col];
      const x1 = xs[col + 1];
      const y0 = ys[row];
      const y1 = ys[row + 1];

      if (!isInside(col - 1, row)) {
        segments.push({ orientation: "vertical", coord: x0, start: y0, end: y1, outward: -1 });
      }
      if (!isInside(col + 1, row)) {
        segments.push({ orientation: "vertical", coord: x1, start: y0, end: y1, outward: 1 });
      }
      if (!isInside(col, row - 1)) {
        segments.push({ orientation: "horizontal", coord: y0, start: x0, end: x1, outward: -1 });
      }
      if (!isInside(col, row + 1)) {
        segments.push({ orientation: "horizontal", coord: y1, start: x0, end: x1, outward: 1 });
      }
    }
  }

  return segments;
}

function mergeBoundarySegments(segments) {
  const sorted = [...segments].sort((left, right) => {
    if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
    if (!approxEqual(left.coord, right.coord)) return left.coord - right.coord;
    if (left.outward !== right.outward) return left.outward - right.outward;
    return left.start - right.start;
  });

  const merged = [];
  for (const segment of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.orientation === segment.orientation &&
      approxEqual(previous.coord, segment.coord) &&
      previous.outward === segment.outward &&
      approxEqual(previous.end, segment.start)
    ) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

function sortBoundarySegments(segments) {
  return [...segments].sort((left, right) => {
    if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
    if (!approxEqual(left.coord, right.coord)) return left.coord - right.coord;
    if (left.outward !== right.outward) return left.outward - right.outward;
    return left.start - right.start;
  });
}

function toSegmentFrame(segment) {
  if (segment.orientation === "vertical") {
    return {
      lengthM: segment.end - segment.start,
      centerX: segment.coord,
      centerZ: (segment.start + segment.end) * 0.5,
      inwardX: -segment.outward,
      inwardZ: 0,
    };
  }

  return {
    lengthM: segment.end - segment.start,
    centerX: (segment.start + segment.end) * 0.5,
    centerZ: segment.coord,
    inwardX: 0,
    inwardZ: -segment.outward,
  };
}

function resolveSegmentZone(frame, zones) {
  const probeX = frame.centerX + frame.inwardX * 0.1;
  const probeZ = frame.centerZ + frame.inwardZ * 0.1;
  let winner = null;
  let winnerArea = Number.POSITIVE_INFINITY;

  for (const zone of zones) {
    if (!TARGET_WALL_ZONE_TYPES.has(zone.type)) continue;
    if (!rectContainsPoint(zone.rect, probeX, probeZ)) continue;
    const area = zone.rect.w * zone.rect.h;
    if (area < winnerArea) {
      winner = zone;
      winnerArea = area;
    }
  }

  return winner;
}

function getZoneCenter(zone) {
  return {
    x: zone.rect.x + zone.rect.w * 0.5,
    z: zone.rect.y + zone.rect.h * 0.5,
  };
}

function isVerticalFacade(frame) {
  return Math.abs(frame.inwardX) > Math.abs(frame.inwardZ);
}

function resolveFacadeFaceForSegment(zone, frame) {
  const zoneCenter = getZoneCenter(zone);
  if (isVerticalFacade(frame)) {
    return frame.centerX < zoneCenter.x ? "west" : "east";
  }
  return frame.centerZ < zoneCenter.z ? "south" : "north";
}

const SLOT_MERCHANT_WARM = {
  wall: "ph_lime_plaster_sun",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_lime_soft",
  balcony: "tm_balcony_wood_dark",
};

const SLOT_MERCHANT_HERO = {
  wall: "ph_lime_plaster_sun",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "tm_balcony_wood_dark",
};

const SLOT_RESIDENTIAL_CALM = {
  wall: "ph_aged_plaster_ochre",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_RESIDENTIAL_DUSTY = {
  wall: "ph_whitewashed_brick_dusty",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SERVICE_MAIN = {
  wall: "ph_beige_wall_002",
  trimHeavy: "ph_stone_trim_white",
  trimLight: "ph_band_beige_002",
  balcony: null,
};

const SLOT_SPAWN = {
  wall: "ph_whitewashed_brick_warm",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SPAWN_SIDE = {
  wall: "ph_aged_plaster_ochre",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SPAWN_B_BRICK = {
  wall: "ph_brick_4_desert",
  trimHeavy: "ph_stone_trim_white",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_SIDE_HALL = {
  wall: "ph_whitewashed_brick",
  trimHeavy: "ph_sandstone_blocks_05",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_CONNECTOR = {
  wall: "ph_whitewashed_brick_cool",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_CUT = {
  wall: "ph_beige_wall_002",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: null,
};

function resolveFacadeStyleForSegment(zone, frame) {
  if (zone.type === "main_lane_segment") {
    const zoneCenter = getZoneCenter(zone);
    const face = resolveFacadeFaceForSegment(zone, frame);
    const verticalFacade = face === "west" || face === "east";

    if (!verticalFacade) {
      if (frame.centerZ < zoneCenter.z) {
        return {
          family: "service",
          trimTier: "restrained",
          balconyStyle: "none",
          materials: SLOT_SERVICE_MAIN,
        };
      }
      return {
        family: "residential",
        trimTier: zone.id === "BZ_M3" ? "accented" : "restrained",
        balconyStyle: "residential_parapet",
        materials: zone.id === "BZ_M3" ? SLOT_RESIDENTIAL_DUSTY : SLOT_RESIDENTIAL_CALM,
      };
    }

    switch (`${zone.id}:${face}`) {
      case "BZ_M1:west":
        return {
          family: "merchant",
          trimTier: "accented",
          balconyStyle: "merchant_ledge",
          materials: SLOT_MERCHANT_WARM,
        };
      case "BZ_M1:east":
        return {
          family: "residential",
          trimTier: "restrained",
          balconyStyle: "residential_parapet",
          materials: SLOT_RESIDENTIAL_CALM,
        };
      case "BZ_M2_JOG:west":
        return {
          family: "service",
          trimTier: "restrained",
          balconyStyle: "none",
          materials: SLOT_SERVICE_MAIN,
        };
      case "BZ_M2_JOG:east":
        return {
          family: "merchant",
          trimTier: "hero",
          balconyStyle: "hero_cantilever",
          materials: SLOT_MERCHANT_HERO,
        };
      case "BZ_M3:west":
        return {
          family: "residential",
          trimTier: "accented",
          balconyStyle: "residential_parapet",
          materials: SLOT_RESIDENTIAL_DUSTY,
        };
      case "BZ_M3:east":
        return {
          family: "merchant",
          trimTier: "accented",
          balconyStyle: "merchant_ledge",
          materials: SLOT_MERCHANT_WARM,
        };
      default:
        return {
          family: "merchant",
          trimTier: "accented",
          balconyStyle: "merchant_ledge",
          materials: SLOT_MERCHANT_WARM,
        };
    }
  }

  if (zone.type === "spawn_plaza") {
    const face = resolveFacadeFaceForSegment(zone, frame);
    const isHorizontalFace = face === "north" || face === "south";
    const isSpawnBOuterShell = zone.id === "SPAWN_B_GATE_PLAZA" && face !== "south";
    return {
      family: "spawn",
      trimTier: isSpawnBOuterShell ? (face === "north" ? "hero" : "accented") : isHorizontalFace ? "hero" : "accented",
      balconyStyle: isSpawnBOuterShell ? "none" : "residential_parapet",
      materials: isSpawnBOuterShell ? SLOT_SPAWN_B_BRICK : isHorizontalFace ? SLOT_SPAWN : SLOT_SPAWN_SIDE,
    };
  }

  if (zone.type === "connector") {
    return {
      family: "connector",
      trimTier: "restrained",
      balconyStyle: "none",
      materials: SLOT_CONNECTOR,
    };
  }

  if (zone.type === "cut") {
    return {
      family: "cut",
      trimTier: "restrained",
      balconyStyle: "none",
      materials: SLOT_CUT,
    };
  }

  return {
    family: "side_hall",
    trimTier: "restrained",
    balconyStyle: "none",
    materials: SLOT_SIDE_HALL,
  };
}

function isMainLaneZone(zone) {
  if (!zone) return false;
  if (zone.type === "main_lane_segment") return true;
  const tag = `${zone.id} ${zone.label} ${zone.notes}`.toLowerCase();
  return tag.includes("main lane") || tag.includes("main_bazaar") || tag.includes("bazaar main");
}

function isShopfrontZone(zone) {
  if (!zone) return false;
  return zone.type === "main_lane_segment" || zone.id.startsWith("BZ_");
}

function isFrontageWallRole(wallRole) {
  return wallRole === "main_frontage" || wallRole === "spawn_frontage";
}

function isBlankWallRole(wallRole) {
  return wallRole === "sidehall_back_blank" || wallRole === "connector_blank" || wallRole === "cut_blank";
}

function resolveWallRole(zone, facadeFace, isInsideWall, isSpawnEntryWall) {
  switch (zone.type) {
    case "main_lane_segment":
      return facadeFace === "east" || facadeFace === "west" ? "main_frontage" : "main_side_window_only";
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

function resolveDefaultCompositionPreset(zone, facadeFamily, balconyStyle) {
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

function resolveCompositionPreset(zone, face, facadeFamily, balconyStyle, overrideMap) {
  const override = overrideMap.get(`${zone.id}:${face}`);
  if (override) return override;
  return resolveDefaultCompositionPreset(zone, facadeFamily, balconyStyle);
}

function resolveSegmentWallHeight(baseHeight, zone, isInsideWall, isSpawnEntryWall, isConnectorMainLaneFacing) {
  if (zone.type === "main_lane_segment") {
    return 3 * STORY_HEIGHT_M;
  }
  if (zone.type === "spawn_plaza") {
    return isSpawnEntryWall ? 3 * STORY_HEIGHT_M : 2 * STORY_HEIGHT_M;
  }
  if (zone.type === "side_hall") {
    return isInsideWall ? 3 * STORY_HEIGHT_M : 1 * STORY_HEIGHT_M;
  }
  if (zone.type === "cut") {
    return 3 * STORY_HEIGHT_M;
  }
  if (zone.type === "connector") {
    return isConnectorMainLaneFacing ? 3 * STORY_HEIGHT_M : 2 * STORY_HEIGHT_M;
  }
  return baseHeight;
}

const TRIM_DIMS = {
  1: {
    plinthH: 0.34,
    plinthD: 0.08,
    courseH: 0.13,
    courseD: 0.08,
    corniceH: 0.22,
    corniceD: 0.12,
    parapetH: 0.22,
    parapetD: 0.09,
    pierW: 0.44,
    pierD: 0.07,
  },
  2: {
    plinthH: 0.38,
    plinthD: 0.09,
    courseH: 0.13,
    courseD: 0.08,
    corniceH: 0.24,
    corniceD: 0.14,
    parapetH: 0.24,
    parapetD: 0.10,
    pierW: 0.50,
    pierD: 0.08,
  },
  3: {
    plinthH: 0.40,
    plinthD: 0.10,
    courseH: 0.13,
    courseD: 0.09,
    corniceH: 0.26,
    corniceD: 0.15,
    parapetH: 0.26,
    parapetD: 0.10,
    pierW: 0.56,
    pierD: 0.08,
  },
};

function getTrimDims(wallHeightM) {
  const stories = Math.max(1, Math.round(wallHeightM / STORY_HEIGHT_M));
  return TRIM_DIMS[stories] ?? TRIM_DIMS[3];
}

function isSpawnGateBrickBackdropPreset(preset) {
  return preset === "spawn_gate_brick_backdrop";
}

function isSpawnBShellCleanupSurface(zone, face) {
  return zone?.id === "SPAWN_B_GATE_PLAZA" && (face === "north" || face === "east" || face === "west");
}

function isHeroBalconyPreset(preset) {
  return preset === "merchant_hero_stack" || preset === "spawn_courtyard_landmark" || preset === "residential_balcony_stack";
}

function isSpawnHeroFacade(compositionPreset) {
  return compositionPreset === "spawn_courtyard_landmark" || isSpawnGateBrickBackdropPreset(compositionPreset);
}

function pickFacadeLean(zoneType, rng) {
  if (zoneType === "spawn_plaza") {
    return rng.fork("spawn-hero-lean").next() < 0.5 ? -1 : 1;
  }
  return rng.fork("facade-lean").next() < 0.5 ? -1 : 1;
}

function consumeCornerPierRng(ctx) {
  if (ctx.lengthM < 0.8) return;

  const dims = getTrimDims(ctx.wallHeightM);
  const isHero = isSpawnHeroFacade(ctx.compositionPreset);
  const marginM = ctx.profile === "pbr" ? 0.04 : 0.02;
  const maxWidth = Math.max(0.28, Math.min(1.05, ctx.lengthM * 0.4));
  ctx.rng.range(0.4, 0.72);
  ctx.rng.range(0.05, 0.1);
  ctx.rng.range(0.35, 0.75);
  const tierWidthScale = isHero ? 0.72 : ctx.trimTier === "hero" ? 0.88 : ctx.trimTier === "accented" ? 0.72 : 0.58;
  const tierDepthScale = isHero ? 0.9 : ctx.trimTier === "hero" ? 1.0 : ctx.trimTier === "accented" ? 0.78 : 0.62;
  const pierWidth = clamp(dims.pierW * tierWidthScale, 0.22, maxWidth);
  const halfLen = ctx.lengthM * 0.5;

  for (const side of [-1, 1]) {
    const isCorner = (side === -1 && ctx.cornerAtStart) || (side === 1 && ctx.cornerAtEnd);
    const effectiveMargin = isCorner ? 0 : marginM;
    const capChance = clamp(
      0.22 + (ctx.isShopfrontZone ? 0.08 : 0) - (ctx.isSideHall ? 0.08 : 0) + ctx.density * 0.04,
      0.08,
      0.45,
    );
    if ((ctx.isMainLane || ctx.zoneType === "main_lane_segment") && !isCorner && ctx.trimTier !== "hero") {
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
    const span = Math.max(0.02, halfLen - pierWidth * 0.5 - effectiveMargin);
    if (span < 0) continue;
    if (ctx.rng.next() < capChance) {
      ctx.rng.range(0.55, 1.05);
      ctx.rng.range(0.4, 0.62);
    }
  }
}

function consumeParapetRng(ctx) {
  if (ctx.lengthM < 1.0) return;
  ctx.rng.range(0.18, 0.35);
  ctx.rng.range(0.06, 0.14);
}

function consumePlinthRng(ctx) {
  if (ctx.lengthM < 1.0) return;
  ctx.rng.range(0.28, 0.48);
  ctx.rng.range(0.06, 0.13);
}

function consumeStringCourseRng(ctx) {
  if (ctx.lengthM < 1.5) return;
  ctx.rng.range(0.10, 0.18);
  ctx.rng.range(0.06, 0.11);
}

function consumeCorniceRng(ctx) {
  if (ctx.lengthM < 1.0) return;
  ctx.rng.range(0.18, 0.30);
  ctx.rng.range(0.10, 0.19);
}

function resolveDoorCountForWallRole(wallRole, usableLength, compositionPreset) {
  if (!isFrontageWallRole(wallRole)) return 0;
  if (isHeroBalconyPreset(compositionPreset) && usableLength >= 8) return 1;
  if (usableLength >= 18) return 2;
  if (usableLength >= 8) return 1;
  return 0;
}

function assignDoorColumns(bayCount, doorCount) {
  if (doorCount <= 0 || bayCount <= 0) return [];
  const clamped = Math.min(doorCount, bayCount);
  if (clamped === 1) {
    return [Math.floor(bayCount / 2)];
  }

  const first = bayCount > 2 ? 1 : 0;
  const last = bayCount > 2 ? bayCount - 2 : bayCount - 1;
  const range = last - first;
  const columns = [];

  for (let index = 0; index < clamped; index += 1) {
    const column = range > 0 ? first + Math.round((index * range) / (clamped - 1)) : first;
    if (!columns.includes(column)) columns.push(column);
  }

  return columns;
}

function buildWindowCandidateColumns(bayCount, blockedColumns) {
  const allowEdgeColumns = bayCount <= 3;
  const minIndex = allowEdgeColumns ? 0 : 1;
  const maxIndex = allowEdgeColumns ? bayCount - 1 : bayCount - 2;
  const columns = [];

  for (let index = minIndex; index <= maxIndex; index += 1) {
    if (!blockedColumns.has(index)) {
      columns.push(index);
    }
  }

  return columns;
}

function pickBalancedColumns(candidateColumns, bayCount, targetCount) {
  if (targetCount <= 0 || candidateColumns.length === 0) return [];

  const wallMid = (bayCount - 1) * 0.5;
  const groups = new Map();

  for (const column of candidateColumns) {
    const key = Math.abs(column - wallMid).toFixed(4);
    const group = groups.get(key);
    if (group) {
      group.push(column);
    } else {
      groups.set(key, [column]);
    }
  }

  const selected = [];
  const sortedGroups = [...groups.entries()]
    .map(([distance, columns]) => ({
      distance: Number(distance),
      columns: [...columns].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.distance - right.distance);

  for (const group of sortedGroups) {
    selected.push(...group.columns);
    if (selected.length >= targetCount) {
      break;
    }
  }

  return [...new Set(selected)].sort((left, right) => left - right);
}

function resolveWindowColumnTarget(wallRole, candidateColumns, stories, doorCount, compositionPreset) {
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

function resolveAccentWindowColumns(windowColumns, doorColumns, bayCount) {
  if (windowColumns.length === 0) return [];

  const referencePoints = doorColumns.length > 0 ? [...doorColumns] : [(bayCount - 1) * 0.5];
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
    .sort((left, right) => left - right);
}

function resolveWindowTreatment(spec, columnIndex, story) {
  const isAccent = spec.accentWindowColumns.includes(columnIndex);
  const leanBias = spec.facadeLean > 0 ? 0 : 1;

  if (spec.wallRole === "sidehall_outer_quiet") {
    return story === spec.stories - 1 ? "glass" : "dark";
  }

  if (spec.wallRole === "main_side_window_only") {
    return (story + columnIndex + leanBias) % 2 === 0 ? "glass" : "dark";
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
      return (columnIndex + story + leanBias) % 2 === 0 ? "glass" : "dark";
    case "merchant_hero_stack":
      if (isAccent && story === 0) {
        return "shuttered";
      }
      return story === spec.stories - 1 ? "glass" : "dark";
    case "residential_quiet":
      return (story + columnIndex + leanBias) % 3 === 0 ? "glass" : "dark";
    case "residential_balcony_stack":
      return story === spec.stories - 1 ? "glass" : "dark";
    case "spawn_gate_brick_backdrop":
      if (story === spec.stories - 1) return "glass";
      if (isAccent) return "shuttered";
      return columnIndex === Math.floor(spec.bayCount * 0.5) ? "dark" : "glass";
    case "spawn_courtyard_landmark":
      return story === spec.stories - 1 ? "glass" : "dark";
    default:
      return "glass";
  }
}

function authoredWindowLayoutKey(zoneId, face, segmentOrdinal) {
  return `${zoneId}:${face}:${segmentOrdinal}`;
}

function countContiguousWindowColumns(spec, startColumn, direction, maxCount) {
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

function pickDominantBalconyDoor(spec) {
  const wallMid = (spec.bayCount - 1) * 0.5;
  let winner = spec.doorColumns[0];
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

function computeBalconyPlacements(spec) {
  const balconyInfo = new Map();
  const coveredWindows = new Set();
  const upperDoorOpenings = new Set();

  if (
    spec.stories < 2 ||
    spec.balconyStyle === "none" ||
    spec.doorColumns.length === 0 ||
    !isFrontageWallRole(spec.wallRole) ||
    !isHeroBalconyPreset(spec.compositionPreset)
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

function buildColumnPattern(columnRoles) {
  return columnRoles
    .map((role) => {
      if (role === "door") return "D";
      if (role === "window") return "W";
      return "_";
    })
    .join(" ");
}

function summarizeSegmentFacade(segment, zone, segmentIndex, segmentOrdinal, faceContext, authoredWindowLayout, baseSeed, maxProtrusionM, density, cornerKeys) {
  const style = resolveFacadeStyleForSegment(zone, toSegmentFrame(segment));
  const wallRole = resolveWallRole(zone, faceContext.face, faceContext.isInsideWall, faceContext.isSpawnEntryWall);
  const segmentDensityRaw = density
    * (faceContext.isMainLane ? 1.04 : 1)
    * (faceContext.isShopfront ? 1.08 : 1)
    * (faceContext.isSideHall ? 0.84 : 1)
    * (faceContext.isConnector ? 0.78 : 1);
  const segmentDensity = clamp(segmentDensityRaw, 0.06, 1.2);
  const segmentMaxProtrusion = clamp(
    faceContext.isMainLane ? Math.min(maxProtrusionM, 0.14) : maxProtrusionM,
    0.03,
    maxProtrusionM,
  );
  const seedTag = deriveSubSeed(baseSeed, `segment:${segmentIndex}:${zone.id}`);
  const rng = new DeterministicRng(deriveSubSeed(baseSeed, String(seedTag)));
  const lengthM = segment.end - segment.start;
  const cornerAtStart = cornerKeys.has(
    segment.orientation === "vertical"
      ? `${segment.coord.toFixed(3)}:${segment.start.toFixed(3)}`
      : `${segment.start.toFixed(3)}:${segment.coord.toFixed(3)}`,
  );
  const cornerAtEnd = cornerKeys.has(
    segment.orientation === "vertical"
      ? `${segment.coord.toFixed(3)}:${segment.end.toFixed(3)}`
      : `${segment.end.toFixed(3)}:${segment.coord.toFixed(3)}`,
  );

  consumeCornerPierRng({
    rng,
    lengthM,
    wallHeightM: faceContext.wallHeightM,
    profile: "pbr",
    trimTier: style.trimTier,
    maxProtrusionM: segmentMaxProtrusion,
    isMainLane: faceContext.isMainLane,
    zoneType: zone.type,
    isShopfrontZone: faceContext.isShopfront,
    isSideHall: faceContext.isSideHall,
    density: segmentDensity,
    cornerAtStart,
    cornerAtEnd,
    compositionPreset: faceContext.compositionPreset,
  });
  consumeParapetRng({
    rng,
    lengthM,
  });
  consumePlinthRng({
    rng,
    lengthM,
  });
  consumeStringCourseRng({
    rng,
    lengthM,
  });
  consumeCorniceRng({
    rng,
    lengthM,
  });

  const usableLength = lengthM - SEGMENT_EDGE_MARGIN_M * 2;
  if (usableLength < 1.4) {
    return {
      wallRole,
      compositionPreset: faceContext.compositionPreset,
      style,
      lengthM,
      usableLength,
      wallHeightM: faceContext.wallHeightM,
      stories: Math.max(1, Math.floor(faceContext.wallHeightM / STORY_HEIGHT_M)),
      bayCount: 0,
      doorCount: 0,
      groundDoorCount: 0,
      upperDoorCount: 0,
      balconyCount: 0,
      windowCounts: { glass: 0, dark: 0, shuttered: 0 },
      windowColumns: [],
      accentWindowColumns: [],
      doorColumns: [],
      columnPattern: "n/a",
      specNotes: "Segment is too short for a procedural facade grid after edge margins.",
      balconyNotes: "No balcony evaluation; segment is below the minimum facade length.",
      doorNotes: "No procedural doors; segment is below the minimum frontage length.",
      windowNotes: "No procedural windows; segment is below the minimum facade length.",
    };
  }

  const stories = Math.max(1, Math.floor(faceContext.wallHeightM / STORY_HEIGHT_M));
  const facadeLean = pickFacadeLean(zone.type, rng);
  const isBrickBackdrop = isSpawnGateBrickBackdropPreset(faceContext.compositionPreset);
  const isSpawnFacade = zone.type === "spawn_plaza";
  const targetBayW = isBrickBackdrop
    ? usableLength >= 18 ? usableLength / 7 : usableLength / 5
    : isFrontageWallRole(wallRole)
      ? rng.range(2.2, 3.0)
      : wallRole === "sidehall_outer_quiet"
        ? rng.range(2.6, 3.4)
        : rng.range(1.9, 2.5);
  let bayCount = Math.max(1, Math.round(usableLength / targetBayW));
  if (isBrickBackdrop) {
    bayCount = usableLength >= 18 ? 7 : 5;
  }
  const doorCount = resolveDoorCountForWallRole(wallRole, usableLength, faceContext.compositionPreset);

  if (doorCount === 1 && bayCount >= 2 && bayCount % 2 === 0) {
    bayCount = Math.max(1, bayCount - 1);
  }
  if (doorCount > 0 && bayCount < doorCount + 2) {
    bayCount = doorCount + 2;
  }

  const bayWidth = usableLength / bayCount;
  const windowW = clamp(
    bayWidth * (
      isBrickBackdrop
        ? rng.range(0.36, 0.48)
        : isSpawnFacade
          ? rng.range(0.46, 0.58)
          : isFrontageWallRole(wallRole)
            ? rng.range(0.34, 0.46)
            : wallRole === "sidehall_outer_quiet"
              ? rng.range(0.26, 0.34)
              : rng.range(0.32, 0.44)
    ),
    0.52,
    bayWidth * (isBrickBackdrop ? 0.56 : isSpawnFacade ? 0.72 : 0.64),
  );
  const windowH = isBrickBackdrop
    ? rng.range(1.18, 1.38)
    : isSpawnFacade
      ? rng.range(1.28, 1.55)
      : isFrontageWallRole(wallRole)
        ? rng.range(1.0, 1.26)
        : wallRole === "sidehall_outer_quiet"
          ? rng.range(0.92, 1.16)
          : rng.range(1.08, 1.38);
  rng.range(0.85, 1.05);
  const doorW = clamp(
    bayWidth * (
      isBrickBackdrop
        ? rng.range(0.56, 0.68)
        : isFrontageWallRole(wallRole)
          ? rng.range(0.50, 0.64)
          : wallRole === "sidehall_outer_quiet"
            ? rng.range(0.40, 0.50)
            : rng.range(0.44, 0.58)
    ),
    0.75,
    bayWidth * 0.74,
  );
  const doorH = isBrickBackdrop
    ? rng.range(2.52, 2.78)
    : style.family === "merchant"
      ? rng.range(2.45, 2.72)
      : style.family === "service"
        ? rng.range(2.18, 2.38)
        : rng.range(2.32, 2.58);
  const recessDepth = isBrickBackdrop
    ? rng.range(0.22, 0.32)
    : isSpawnFacade ? rng.range(0.18, 0.28) : rng.range(0.10, 0.16);
  const frameThickness = isBrickBackdrop
    ? rng.range(0.18, 0.26)
    : isSpawnFacade ? rng.range(0.14, 0.22) : rng.range(0.11, 0.17);
  const frameDepth = clamp(
    isBrickBackdrop
      ? rng.range(0.22, 0.32)
      : isSpawnFacade ? rng.range(0.16, 0.26) : rng.range(0.09, 0.13),
    0.06,
    segmentMaxProtrusion + (isBrickBackdrop ? 0.16 : isSpawnFacade ? 0.10 : 0.08),
  );
  const jambDepth = clamp(
    isBrickBackdrop
      ? rng.range(0.24, 0.34)
      : isSpawnFacade ? rng.range(0.18, 0.28) : rng.range(0.10, 0.16),
    0.06,
    segmentMaxProtrusion + (isBrickBackdrop ? 0.18 : isSpawnFacade ? 0.12 : 0.10),
  );

  const columnRoles = Array.from({ length: bayCount }, () => "blank");
  let doorColumns = [];
  if (doorCount > 0) {
    doorColumns = assignDoorColumns(bayCount, doorCount);
    for (const column of doorColumns) {
      columnRoles[column] = "door";
    }
  }

  const blockedWindowColumns = new Set(doorColumns);
  const candidateWindowColumns = buildWindowCandidateColumns(bayCount, blockedWindowColumns);
  const targetWindowColumns = resolveWindowColumnTarget(
    wallRole,
    candidateWindowColumns,
    stories,
    doorColumns.length,
    faceContext.compositionPreset,
  );
  const selectedWindowColumns = pickBalancedColumns(candidateWindowColumns, bayCount, targetWindowColumns);

  for (const column of selectedWindowColumns) {
    columnRoles[column] = "window";
  }

  const accentWindowColumns = resolveAccentWindowColumns(selectedWindowColumns, doorColumns, bayCount);
  const spec = {
    bayCount,
    bayWidth,
    usableLength,
    stories,
    wallRole,
    columnRoles,
    doorColumns,
    compositionPreset: faceContext.compositionPreset,
    accentWindowColumns,
    windowW,
    windowH,
    doorW,
    doorH,
    recessDepth,
    frameThickness,
    frameDepth,
    jambDepth,
    facadeLean,
    balconyStyle: style.balconyStyle,
  };
  const balconyPlan = computeBalconyPlacements(spec);
  const windowCounts = { glass: 0, dark: 0, shuttered: 0 };
  let upperDoorCount = 0;

  if (authoredWindowLayout) {
    for (const window of authoredWindowLayout.windows) {
      windowCounts.glass += 1;
    }

    const upperCount = authoredWindowLayout.windows.filter((window) => window.glassStyle === "stained_glass_bright").length;
    const lowerCount = authoredWindowLayout.windows.length - upperCount;

    return {
      wallRole,
      compositionPreset: faceContext.compositionPreset,
      style,
      lengthM,
      usableLength,
      wallHeightM: faceContext.wallHeightM,
      stories,
      bayCount,
      bayWidth,
      doorCount,
      groundDoorCount: doorColumns.length,
      upperDoorCount,
      balconyCount: 0,
      balconyEntries: [],
      windowCounts,
      windowColumns: [],
      accentWindowColumns: [],
      doorColumns,
      columnPattern: "authored",
      specNotes: `Authored window layout override on segment #${segmentOrdinal} places ${authoredWindowLayout.windows.length} exact windows while retaining the procedural door grid.`,
      balconyNotes: spec.balconyStyle === "none"
        ? `No balconies because ${style.family} frontage resolves balcony style "none".`
        : `No balconies because authored window layout does not introduce balcony openings.`,
      doorNotes: doorColumns.length > 0
        ? `${doorColumns.length} ground door column(s) derived from wall role ${wallRole}.`
        : isFrontageWallRole(wallRole)
          ? `No ground doors because ${usableLength.toFixed(2)}m usable length does not reach the frontage threshold.`
          : `No ground doors because wall role ${wallRole} suppresses frontage openings.`,
      windowNotes: `Authored window layout places ${authoredWindowLayout.windows.length} pointed-arch windows (${upperCount} bright stained-glass upper / ${lowerCount} dim stained-glass lower).`,
    };
  }

  for (let column = 0; column < spec.bayCount; column += 1) {
    const role = spec.columnRoles[column];
    for (let story = 0; story < spec.stories; story += 1) {
      if (story === 0 && role === "door") {
        continue;
      }
      if (story > 0 && role === "door") {
        if (balconyPlan.balconyInfo.has(`${column}:${story}`) || balconyPlan.upperDoorOpenings.has(`${column}:${story}`)) {
          upperDoorCount += 1;
        }
        continue;
      }
      if (role === "window" && !balconyPlan.coveredWindows.has(`${column}:${story}`)) {
        if (isSpawnGateBrickBackdropPreset(spec.compositionPreset) && story === 0 && column === Math.floor(spec.bayCount * 0.5)) {
          continue;
        }
        const treatment = resolveWindowTreatment(spec, column, story);
        windowCounts[treatment] += 1;
      }
    }
  }

  const balconyEntries = [...balconyPlan.balconyInfo.entries()].map(([key, value]) => ({
    key,
    leftBays: value.leftBays,
    rightBays: value.rightBays,
  }));

  return {
    wallRole,
    compositionPreset: faceContext.compositionPreset,
    style,
    lengthM,
    usableLength,
    wallHeightM: faceContext.wallHeightM,
    stories,
    bayCount,
    bayWidth,
    doorCount,
    groundDoorCount: doorColumns.length,
    upperDoorCount,
    balconyCount: balconyEntries.length,
    balconyEntries,
    windowCounts,
    windowColumns: selectedWindowColumns,
    accentWindowColumns,
    doorColumns,
    columnPattern: buildColumnPattern(columnRoles),
    specNotes: `Facade grid uses ${bayCount} bays across ${usableLength.toFixed(2)}m usable length with ${bayWidth.toFixed(2)}m bay width.`,
    balconyNotes: balconyEntries.length > 0
      ? balconyEntries
        .map((entry) => `door ${entry.key.split(":")[0]} uses ${1 + entry.leftBays + entry.rightBays} bays (${entry.leftBays} left / ${entry.rightBays} right)`)
        .join("; ")
      : spec.balconyStyle === "none"
        ? `No balconies because ${style.family} frontage resolves balcony style "none".`
        : !isHeroBalconyPreset(faceContext.compositionPreset)
          ? `No balconies because preset ${faceContext.compositionPreset} does not enable balcony stacks.`
          : `No balconies because the segment does not provide enough contiguous window bays for a dominant door.`,
    doorNotes: doorColumns.length > 0
      ? `${doorColumns.length} ground door column(s) derived from wall role ${wallRole}.`
      : isFrontageWallRole(wallRole)
        ? `No ground doors because ${usableLength.toFixed(2)}m usable length does not reach the frontage threshold.`
        : `No ground doors because wall role ${wallRole} suppresses frontage openings.`,
    windowNotes: selectedWindowColumns.length > 0
      ? `${selectedWindowColumns.length} window column(s) with accent columns [${accentWindowColumns.join(", ") || "none"}].`
      : `No window columns selected for wall role ${wallRole}.`,
    dimensions: {
      windowW,
      windowH,
      doorW,
      doorH,
      recessDepth,
      frameThickness,
      frameDepth,
      jambDepth,
    },
  };
}

function faceLineForZone(zone, face) {
  if (face === "west") {
    return { orientation: "vertical", coord: zone.rect.x, start: zone.rect.y, end: zone.rect.y + zone.rect.h, outward: -1 };
  }
  if (face === "east") {
    return { orientation: "vertical", coord: zone.rect.x + zone.rect.w, start: zone.rect.y, end: zone.rect.y + zone.rect.h, outward: 1 };
  }
  if (face === "south") {
    return { orientation: "horizontal", coord: zone.rect.y, start: zone.rect.x, end: zone.rect.x + zone.rect.w, outward: -1 };
  }
  return { orientation: "horizontal", coord: zone.rect.y + zone.rect.h, start: zone.rect.x, end: zone.rect.x + zone.rect.w, outward: 1 };
}

function overlappingFaceBlocks(zone, face, walkableZones) {
  const overlaps = [];
  for (const other of walkableZones) {
    if (other.id === zone.id) continue;
    if (face === "west" && approxEqual(other.rect.x + other.rect.w, zone.rect.x)) {
      const overlap = overlapRange(zone.rect.y, zone.rect.y + zone.rect.h, other.rect.y, other.rect.y + other.rect.h);
      if (overlap) overlaps.push({ ...overlap, zoneId: other.id });
    } else if (face === "east" && approxEqual(other.rect.x, zone.rect.x + zone.rect.w)) {
      const overlap = overlapRange(zone.rect.y, zone.rect.y + zone.rect.h, other.rect.y, other.rect.y + other.rect.h);
      if (overlap) overlaps.push({ ...overlap, zoneId: other.id });
    } else if (face === "south" && approxEqual(other.rect.y + other.rect.h, zone.rect.y)) {
      const overlap = overlapRange(zone.rect.x, zone.rect.x + zone.rect.w, other.rect.x, other.rect.x + other.rect.w);
      if (overlap) overlaps.push({ ...overlap, zoneId: other.id });
    } else if (face === "north" && approxEqual(other.rect.y, zone.rect.y + zone.rect.h)) {
      const overlap = overlapRange(zone.rect.x, zone.rect.x + zone.rect.w, other.rect.x, other.rect.x + other.rect.w);
      if (overlap) overlaps.push({ ...overlap, zoneId: other.id });
    }
  }

  return overlaps.sort((left, right) => left.start - right.start);
}

function resolveFloorMaterialIdForZone(zoneId) {
  const materialByZoneId = {
    BZ_M1: "cobblestone_color",
    BZ_M2_JOG: "cobblestone_color",
    BZ_M3: "cobblestone_color",
    SPAWN_A_COURTYARD: "large_sandstone_blocks_01",
    SPAWN_B_GATE_PLAZA: "cobblestone_pavement",
    SH_E: "cobblestone_pavement",
    SH_W: "cobblestone_pavement",
    CONN_NE: "cobblestone_color",
    CONN_NW: "cobblestone_color",
    CONN_SE: "cobblestone_color",
    CONN_SW: "cobblestone_color",
    CUT_E_MID: "grey_tiles",
    CUT_W_MID: "grey_tiles",
    CUT_E_NORTH: "sand_01",
    CUT_W_NORTH: "sand_01",
  };
  return materialByZoneId[zoneId] ?? "cobblestone_color";
}

function floorSummaryForZone(zone, areaByZoneId) {
  if (FLOOR_ZONE_TYPES.has(zone.type)) {
    return `PBR floor material \`${resolveFloorMaterialIdForZone(zone.id)}\``;
  }

  const parentArea = [...areaByZoneId.values()].find((candidate) => {
    if (candidate.zoneId === zone.id) return false;
    const parentZone = candidate.zone;
    return parentZone && rectContainsRect(parentZone.rect, zone.rect) && FLOOR_ZONE_TYPES.has(parentZone.type);
  });
  if (zone.type === "clear_travel_zone" && parentArea) {
    return `Overlay-only travel band inside ${parentArea.label}; inherits \`${resolveFloorMaterialIdForZone(parentArea.zoneId)}\` in the PBR floor pass.`;
  }
  if (zone.type === "stall_strip" && parentArea) {
    return `Embedded stall strip inside ${parentArea.label}; no standalone floor material, inherits \`${resolveFloorMaterialIdForZone(parentArea.zoneId)}\`.`;
  }
  return "No standalone floor material entry.";
}

function mapAnchorCategory(anchorType) {
  switch (anchorType) {
    case "shopfront_anchor":
      return "shopfront";
    case "signage_anchor":
      return "signage";
    case "service_door_anchor":
      return "service-door";
    case "cloth_canopy_span":
      return "canopy";
    case "cover_cluster":
      return "cover";
    case "hero_landmark":
    case "landmark":
      return "landmark";
    case "spawn_cover":
      return "spawn-cover";
    case "open_node":
      return "open-node";
    default:
      return anchorType;
  }
}

function summarizeAnchors(anchors) {
  if (anchors.length === 0) {
    return {
      counts: {},
      text: "none",
      ids: [],
    };
  }

  const counts = {};
  for (const anchor of anchors) {
    const category = mapAnchorCategory(anchor.type);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  const text = Object.entries(counts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([category, count]) => `${category} x${count}`)
    .join(", ");

  return {
    counts,
    text,
    ids: anchors.map((anchor) => anchor.id).sort((left, right) => left.localeCompare(right)),
  };
}

function anchorFaceDistance(anchor, zone, face) {
  if (face === "west") return Math.abs(anchor.x - zone.rect.x);
  if (face === "east") return Math.abs(anchor.x - (zone.rect.x + zone.rect.w));
  if (face === "south") return Math.abs(anchor.y - zone.rect.y);
  return Math.abs(anchor.y - (zone.rect.y + zone.rect.h));
}

function assignAnchorsToWalls(anchors, wallAssetsByZoneFace, zonesById) {
  const assignments = new Map();
  for (const anchor of anchors) {
    const zone = zonesById.get(anchor.zone);
    if (!zone) continue;
    const candidates = FACE_VALUES
      .map((face) => {
        const wall = wallAssetsByZoneFace.get(`${zone.id}:${face}`);
        if (!wall) return null;
        return {
          wall,
          distance: anchorFaceDistance(anchor, zone, face),
          faceRank: FACE_VALUES.indexOf(face),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.faceRank - right.faceRank;
      });
    if (candidates.length === 0) continue;
    const target = candidates[0].wall;
    const list = assignments.get(target.id);
    if (list) {
      list.push(anchor);
    } else {
      assignments.set(target.id, [anchor]);
    }
  }
  return assignments;
}

function createCornerKeys(segments) {
  const buckets = new Map();
  const toKey = (x, z) => `${x.toFixed(3)}:${z.toFixed(3)}`;
  const getBucket = (x, z) => {
    const key = toKey(x, z);
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = { hasV: false, hasH: false };
    buckets.set(key, created);
    return created;
  };

  for (const segment of segments) {
    if (segment.end - segment.start <= EPS) continue;
    if (segment.orientation === "vertical") {
      getBucket(segment.coord, segment.start).hasV = true;
      getBucket(segment.coord, segment.end).hasV = true;
    } else {
      getBucket(segment.start, segment.coord).hasH = true;
      getBucket(segment.end, segment.coord).hasH = true;
    }
  }

  const corners = new Set();
  for (const [key, bucket] of buckets) {
    if (bucket.hasV && bucket.hasH) {
      corners.add(key);
    }
  }
  return corners;
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function faceAbbreviation(face) {
  if (face === "north") return "N";
  if (face === "south") return "S";
  if (face === "east") return "E";
  return "W";
}

function zoneTypeColor(zoneType) {
  switch (zoneType) {
    case "spawn_plaza":
      return { fill: "#243b53", stroke: "#7fb3d5" };
    case "main_lane_segment":
      return { fill: "#2f2f46", stroke: "#d6d7dc" };
    case "side_hall":
      return { fill: "#1f2937", stroke: "#cbd5e1" };
    case "connector":
      return { fill: "#281a13", stroke: "#fb923c" };
    case "cut":
      return { fill: "#2d1836", stroke: "#f472b6" };
    case "clear_travel_zone":
      return { fill: "none", stroke: "#22c55e" };
    case "stall_strip":
      return { fill: "#3b2d1b", stroke: "#fbbf24" };
    default:
      return { fill: "#1b253a", stroke: "#9ca3af" };
  }
}

function labelPointForRect(rect) {
  return {
    x: rect.x + rect.w * 0.5,
    y: rect.y + rect.h * 0.5,
  };
}

function wallLabelPoint(wall) {
  const totalLength = wall.segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const weightedMid = wall.segments.reduce((sum, segment) => {
    const segmentLength = segment.end - segment.start;
    return sum + ((segment.start + segment.end) * 0.5) * segmentLength;
  }, 0) / Math.max(totalLength, EPS);

  if (wall.face === "west") {
    return { x: wall.zone.rect.x - 0.8, y: weightedMid, rotate: -90 };
  }
  if (wall.face === "east") {
    return { x: wall.zone.rect.x + wall.zone.rect.w + 0.8, y: weightedMid, rotate: 90 };
  }
  if (wall.face === "south") {
    return { x: weightedMid, y: wall.zone.rect.y - 0.9, rotate: 0 };
  }
  return { x: weightedMid, y: wall.zone.rect.y + wall.zone.rect.h + 0.9, rotate: 0 };
}

function buildingLabelPoint(zone, face) {
  if (face === "west") return { x: zone.rect.x + 0.9, y: zone.rect.y + zone.rect.h * 0.5 };
  if (face === "east") return { x: zone.rect.x + zone.rect.w - 0.9, y: zone.rect.y + zone.rect.h * 0.5 };
  if (face === "south") return { x: zone.rect.x + zone.rect.w * 0.5, y: zone.rect.y + 0.9 };
  return { x: zone.rect.x + zone.rect.w * 0.5, y: zone.rect.y + zone.rect.h - 0.9 };
}

function calloutPoint(callout, zonesById) {
  const connector = zonesById.get(callout.connectorZoneId);
  const hall = zonesById.get(callout.hallZoneId);
  if (!connector || !hall) {
    fail(`Missing connector or hall for callout ${callout.calloutId}`);
  }

  return {
    x: callout.spawnFace === "west" ? connector.rect.x + connector.rect.w * 0.25 : connector.rect.x + connector.rect.w * 0.75,
    y: hall.id === "SH_W" || hall.id === "SH_E" ? connector.rect.y + connector.rect.h * 0.5 : connector.rect.y + connector.rect.h * 0.5,
  };
}

function worldToSvgX(boundary, worldX) {
  return SVG_MARGIN + (worldX - boundary.x) * SVG_SCALE;
}

function worldToSvgY(boundary, worldY) {
  return SVG_MARGIN + (boundary.h - (worldY - boundary.y)) * SVG_SCALE;
}

function worldRectToSvg(boundary, rect) {
  return {
    x: worldToSvgX(boundary, rect.x),
    y: worldToSvgY(boundary, rect.y + rect.h),
    w: rect.w * SVG_SCALE,
    h: rect.h * SVG_SCALE,
  };
}

function renderSvg(spec, areaAssets, calloutAssets, buildingAssets, wallAssets) {
  const boundary = spec.global_dimensions.playable_boundary;
  const width = boundary.w * SVG_SCALE + SVG_MARGIN * 2;
  const height = boundary.h * SVG_SCALE + SVG_MARGIN * 2 + 40;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#0b1220"/>`,
    `<rect x="${SVG_MARGIN}" y="${SVG_MARGIN}" width="${boundary.w * SVG_SCALE}" height="${boundary.h * SVG_SCALE}" fill="none" stroke="#eab308" stroke-width="3"/>`,
    `<text x="${width / 2}" y="24" fill="#ffffff" font-size="18" font-family="Arial" font-weight="bold" text-anchor="middle">Bazaar Map Layout Reference</text>`,
    `<text x="${width / 2}" y="44" fill="#9ca3af" font-size="12" font-family="Arial" text-anchor="middle">Generated from docs/map-design/specs/map_spec.json. North is up. Codes map to the legend in the Markdown catalog.</text>`,
  ];

  const zoneAreas = areaAssets.filter((asset) => asset.kind === "zone");
  for (const area of zoneAreas) {
    const svgRect = worldRectToSvg(boundary, area.zone.rect);
    const palette = zoneTypeColor(area.zone.type);
    const dash = area.zone.type === "clear_travel_zone" ? ` stroke-dasharray="6,4"` : "";
    const fill = area.zone.type === "clear_travel_zone" ? "none" : palette.fill;
    lines.push(
      `<g id="${escapeXml(area.id)}">`,
      `<rect x="${svgRect.x.toFixed(1)}" y="${svgRect.y.toFixed(1)}" width="${svgRect.w.toFixed(1)}" height="${svgRect.h.toFixed(1)}" rx="6" ry="6" fill="${fill}" stroke="${palette.stroke}" stroke-width="2"${dash}/>`,
      `</g>`,
    );
    const center = labelPointForRect(area.zone.rect);
    const fontSize = area.zone.type === "connector" || area.zone.type === "cut" ? 11 : 13;
    lines.push(
      `<g id="${escapeXml(area.id)}-label">`,
      `<text x="${worldToSvgX(boundary, center.x).toFixed(1)}" y="${worldToSvgY(boundary, center.y).toFixed(1)}" fill="#ffffff" font-size="${fontSize}" font-family="Arial" font-weight="bold" text-anchor="middle">${escapeXml(area.shortLabel)}</text>`,
      `</g>`,
    );
  }

  for (const wall of wallAssets) {
    lines.push(`<g id="${escapeXml(wall.id)}">`);
    for (const segment of wall.segments) {
      if (segment.orientation === "vertical") {
        const x = worldToSvgX(boundary, segment.coord);
        const y1 = worldToSvgY(boundary, segment.start);
        const y2 = worldToSvgY(boundary, segment.end);
        lines.push(`<line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${wall.buildingId ? "#38bdf8" : "#fca5a5"}" stroke-width="4"/>`);
      } else {
        const y = worldToSvgY(boundary, segment.coord);
        const x1 = worldToSvgX(boundary, segment.start);
        const x2 = worldToSvgX(boundary, segment.end);
        lines.push(`<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${wall.buildingId ? "#38bdf8" : "#fca5a5"}" stroke-width="4"/>`);
      }
    }
    const labelPoint = wallLabelPoint(wall);
    const labelX = worldToSvgX(boundary, labelPoint.x).toFixed(1);
    const labelY = worldToSvgY(boundary, labelPoint.y).toFixed(1);
    const rotate = labelPoint.rotate === 0 ? "" : ` transform="rotate(${labelPoint.rotate} ${labelX} ${labelY})"`;
    lines.push(
      `<text x="${labelX}" y="${labelY}" fill="#f8fafc" font-size="11" font-family="Arial" font-weight="bold" text-anchor="middle"${rotate}>${escapeXml(wall.shortLabel)}</text>`,
      `</g>`,
    );
  }

  for (const building of buildingAssets) {
    const zone = building.zone;
    const point = buildingLabelPoint(zone, building.face);
    lines.push(
      `<g id="${escapeXml(building.id)}">`,
      `<circle cx="${worldToSvgX(boundary, point.x).toFixed(1)}" cy="${worldToSvgY(boundary, point.y).toFixed(1)}" r="10" fill="#111827" stroke="#38bdf8" stroke-width="2"/>`,
      `<text x="${worldToSvgX(boundary, point.x).toFixed(1)}" y="${(worldToSvgY(boundary, point.y) + 4).toFixed(1)}" fill="#38bdf8" font-size="12" font-family="Arial" font-weight="bold" text-anchor="middle">${escapeXml(building.shortLabel)}</text>`,
      `</g>`,
    );
  }

  for (const callout of calloutAssets) {
    const point = calloutPoint(callout, spec.zoneById);
    lines.push(
      `<g id="${escapeXml(callout.id)}">`,
      `<circle cx="${worldToSvgX(boundary, point.x).toFixed(1)}" cy="${worldToSvgY(boundary, point.y).toFixed(1)}" r="7" fill="#111827" stroke="#fbbf24" stroke-width="2"/>`,
      `<text x="${(worldToSvgX(boundary, point.x) + 12).toFixed(1)}" y="${(worldToSvgY(boundary, point.y) - 4).toFixed(1)}" fill="#fbbf24" font-size="12" font-family="Arial" font-weight="bold">${escapeXml(callout.label)}</text>`,
      `</g>`,
    );
  }

  lines.push(`</svg>`);
  return `${lines.join("\n")}\n`;
}

function renderLegendTable(items, columns) {
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = items.map((item) => `| ${columns.map((column) => item[column] ?? "").join(" | ")} |`);
  return [header, divider, ...rows].join("\n");
}

function renderMarkdown(spec, areaAssets, calloutAssets, buildingAssets, wallAssets) {
  const lines = [
    "# Bazaar Map Layout Reference Catalog",
    "",
    `Generated from \`docs/map-design/specs/map_spec.json\` with \`pnpm --filter @clawd-strike/client gen:layout-reference\`. This Markdown and its SVG are generated reference artifacts; the authoritative source stays in the design packet.`,
    "",
    "![Bazaar map layout reference](./layout-reference.svg)",
    "",
    "## ID Legend",
    "",
    "### Areas",
    renderLegendTable(
      areaAssets.map((area) => ({
        ID: `\`${area.id}\``,
        Code: `\`${area.shortLabel}\``,
        Label: area.label,
        Source: area.kind === "zone" ? `\`${area.zoneId}\`` : "custom callout",
      })),
      ["ID", "Code", "Label", "Source"],
    ),
    "",
    "### Buildings",
    renderLegendTable(
      buildingAssets.map((building) => ({
        ID: `\`${building.id}\``,
        Code: `\`${building.shortLabel}\``,
        Label: building.label,
        Source: `\`${building.zone.id}:${building.face}\``,
      })),
      ["ID", "Code", "Label", "Source"],
    ),
    "",
    "### Walls",
    renderLegendTable(
      wallAssets.map((wall) => ({
        ID: `\`${wall.id}\``,
        Code: `\`${wall.shortLabel}\``,
        Label: wall.label,
        Source: `\`${wall.zone.id}:${wall.face}\``,
      })),
      ["ID", "Code", "Label", "Source"],
    ),
    "",
    "## Areas",
    "",
  ];

  for (const area of areaAssets) {
    lines.push(`### ${area.id} — ${area.label}`, "");
    if (area.kind === "zone") {
      lines.push(`- Source zone: \`${area.zoneId}\` (\`${area.zone.type}\`)`);
      lines.push(`- Short label: \`${area.shortLabel}\``);
      lines.push(`- Human label: ${area.humanLabel}`);
      lines.push(`- Bounds: x=${area.zone.rect.x.toFixed(2)}-${(area.zone.rect.x + area.zone.rect.w).toFixed(2)}m, y=${area.zone.rect.y.toFixed(2)}-${(area.zone.rect.y + area.zone.rect.h).toFixed(2)}m (${area.zone.rect.w.toFixed(2)}m x ${area.zone.rect.h.toFixed(2)}m)`);
      lines.push(`- Design callouts: ${area.designCallouts.length > 0 ? area.designCallouts.map((callout) => `\`${callout.id}\` ${callout.name}`).join(", ") : "none"}`);
      lines.push(`- Edge adjacency: ${area.edgeAdjacency.length > 0 ? area.edgeAdjacency.map((entry) => `\`${entry.id}\``).join(", ") : "none"}`);
      lines.push(`- Contained by: ${area.containedBy.length > 0 ? area.containedBy.map((entry) => `\`${entry.id}\``).join(", ") : "none"}`);
      lines.push(`- Contains: ${area.contains.length > 0 ? area.contains.map((entry) => `\`${entry.id}\``).join(", ") : "none"}`);
      lines.push(`- Linked walls: ${area.linkedWallIds.length > 0 ? area.linkedWallIds.map((id) => `\`${id}\``).join(", ") : "none"}`);
      lines.push(`- Linked buildings: ${area.linkedBuildingIds.length > 0 ? area.linkedBuildingIds.map((id) => `\`${id}\``).join(", ") : "none"}`);
      lines.push(`- Anchors: ${area.anchorSummary.text}`);
      if (area.anchorSummary.ids.length > 0) {
        lines.push(`- Anchor IDs: ${area.anchorSummary.ids.map((id) => `\`${id}\``).join(", ")}`);
      }
      lines.push(`- Floor surface: ${area.floorSummary}`);
      lines.push(`- Wall material summary: ${area.wallMaterialSummary}`);
      lines.push(`- Constraints: ${area.constraintSummary}`);
      lines.push(`- Notes: ${area.notes}`);
    } else {
      lines.push(`- Type: custom corner callout`);
      lines.push(`- Short label: \`${area.shortLabel}\``);
      lines.push(`- Human label: ${area.humanLabel}`);
      lines.push(`- Related zones: \`${area.spawnZoneId}\`, \`${area.connectorZoneId}\`, \`${area.hallZoneId}\``);
      lines.push(`- Surface summary: ${area.floorSummary}`);
      lines.push(`- Linked walls: ${area.linkedWallIds.length > 0 ? area.linkedWallIds.map((id) => `\`${id}\``).join(", ") : "none"}`);
      lines.push(`- Anchors: none authored directly; use adjacent zone entries for placed anchors.`);
      lines.push(`- Notes: ${area.notes}`);
    }
    lines.push("");
  }

  lines.push("## Buildings", "");
  for (const building of buildingAssets) {
    lines.push(`### ${building.id} — ${building.label}`, "");
    lines.push(`- Source face: \`${building.zone.id}:${building.face}\``);
    lines.push(`- Short label: \`${building.shortLabel}\``);
    lines.push(`- Human label: ${building.humanLabel}`);
    lines.push(`- Owning area: \`${building.areaId}\``);
    lines.push(`- Wall asset: \`${building.wall.id}\``);
    lines.push(`- Height: ${building.wall.totals.heightM.toFixed(2)}m (${building.wall.totals.stories} stories)`);
    lines.push(`- Facade family: \`${building.wall.totals.style.family}\``);
    lines.push(`- Composition preset: \`${building.wall.totals.compositionPreset}\``);
    lines.push(`- Wall material: \`${building.wall.totals.style.materials.wall}\``);
    lines.push(`- Trim materials: heavy \`${building.wall.totals.style.materials.trimHeavy}\`, light \`${building.wall.totals.style.materials.trimLight}\``);
    lines.push(`- Balcony material: ${building.wall.totals.style.materials.balcony ? `\`${building.wall.totals.style.materials.balcony}\`` : "none"}`);
    lines.push(`- Opening totals: ${building.wall.totals.groundDoorCount} ground doors, ${building.wall.totals.upperDoorCount} upper door openings, ${building.wall.totals.balconyCount} balconies, ${building.wall.totals.windowCounts.glass} glass windows, ${building.wall.totals.windowCounts.dark} dark windows, ${building.wall.totals.windowCounts.shuttered} shuttered windows`);
    lines.push(`- Anchor summary: ${building.anchorSummary.text}`);
    lines.push(`- Texture logic: ${building.textureLogic}`);
    lines.push(`- Trim logic: ${building.trimLogic}`);
    lines.push(`- Notes: ${building.notes}`);
    lines.push("");
  }

  lines.push("## Walls", "");
  for (const wall of wallAssets) {
    lines.push(`### ${wall.id} — ${wall.label}`, "");
    lines.push(`- Source face: \`${wall.zone.id}:${wall.face}\``);
    lines.push(`- Short label: \`${wall.shortLabel}\``);
    lines.push(`- Owner: ${wall.buildingId ? `\`${wall.buildingId}\`` : `\`${wall.areaId}\``}`);
    lines.push(`- Visible span: ${wall.segments.length} segment(s), total ${wall.totalVisibleLength.toFixed(2)}m`);
    lines.push(`- Segment spans: ${wall.segments.map((segment) => `#${segment.segmentNumber} ${segment.orientation === "vertical" ? `y=${rangeLabel(segment.start, segment.end)}` : `x=${rangeLabel(segment.start, segment.end)}`}`).join("; ")}`);
    lines.push(`- Adjacent gaps: ${wall.gapSummary}`);
    lines.push(`- Height: ${wall.totals.heightM.toFixed(2)}m (${wall.totals.stories} stories)`);
    lines.push(`- Wall role: \`${wall.totals.wallRole}\``);
    lines.push(`- Composition preset: \`${wall.totals.compositionPreset}\``);
    lines.push(`- Facade family: \`${wall.totals.style.family}\``);
    lines.push(`- Balcony style: \`${wall.totals.style.balconyStyle}\``);
    lines.push(`- Wall material: \`${wall.totals.style.materials.wall}\``);
    lines.push(`- Trim textures: heavy \`${wall.totals.style.materials.trimHeavy}\`, light \`${wall.totals.style.materials.trimLight}\``);
    lines.push(`- Balcony texture: ${wall.totals.style.materials.balcony ? `\`${wall.totals.style.materials.balcony}\`` : "none"}`);
    lines.push(`- Floor context: ${wall.floorContext}`);
    lines.push(`- Opening totals: ${wall.totals.groundDoorCount} ground doors, ${wall.totals.upperDoorCount} upper door openings, ${wall.totals.balconyCount} balconies, ${wall.totals.windowCounts.glass} glass windows, ${wall.totals.windowCounts.dark} dark windows, ${wall.totals.windowCounts.shuttered} shuttered windows`);
    lines.push(`- Door logic: ${wall.doorLogic}`);
    lines.push(`- Window logic: ${wall.windowLogic}`);
    lines.push(`- Balcony logic: ${wall.balconyLogic}`);
    lines.push(`- Texture logic: ${wall.textureLogic}`);
    lines.push(`- Trim logic: ${wall.trimLogic}`);
    lines.push(`- Anchor summary: ${wall.anchorSummary.text}`);
    if (wall.anchorSummary.ids.length > 0) {
      lines.push(`- Anchor IDs: ${wall.anchorSummary.ids.map((id) => `\`${id}\``).join(", ")}`);
    }
    lines.push(`- Segment breakdown:`);
    for (const segment of wall.segments) {
      lines.push(`  - #${segment.segmentNumber}: usable=${segment.summary.usableLength.toFixed(2)}m, bays=${segment.summary.bayCount}, pattern=${segment.summary.columnPattern}, doors=${segment.summary.groundDoorCount}/${segment.summary.upperDoorCount}, balconies=${segment.summary.balconyCount}, windows=${segment.summary.windowCounts.glass} glass / ${segment.summary.windowCounts.dark} dark / ${segment.summary.windowCounts.shuttered} shuttered`);
      lines.push(`    logic: ${segment.summary.specNotes} ${segment.summary.doorNotes} ${segment.summary.windowNotes} ${segment.summary.balconyNotes}`);
    }
    lines.push(`- Notes: ${wall.notes}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function validateAssetCoverage(markdown, svg, assets) {
  for (const asset of assets) {
    if (!markdown.includes(asset.id)) {
      fail(`Generated Markdown is missing asset ${asset.id}`);
    }
    if (!svg.includes(`id="${asset.id}"`)) {
      fail(`Generated SVG is missing asset ${asset.id}`);
    }
  }
}

function resolveConstraintSummary(zone, spec) {
  const parts = [];
  if (zone.notes) parts.push(zone.notes);
  if (zone.type === "clear_travel_zone") {
    parts.push(spec.constraints.no_block_zone);
  }
  if (zone.type === "main_lane_segment") {
    parts.push(`Keep ${spec.constraints.min_path_width_main_lane.toFixed(1)}m minimum main-lane width.`);
  }
  if (zone.type === "side_hall") {
    parts.push(`Keep ${spec.constraints.min_path_width_side_halls.toFixed(1)}m minimum side-hall width.`);
  }
  return parts.join(" ");
}

function resolveWallMaterialSummary(linkedWalls, floorSummary) {
  if (linkedWalls.length === 0) {
    return floorSummary;
  }
  const wallIds = [...new Set(linkedWalls.map((wall) => wall.totals.style.materials.wall))];
  const trimHeavy = [...new Set(linkedWalls.map((wall) => wall.totals.style.materials.trimHeavy))];
  const trimLight = [...new Set(linkedWalls.map((wall) => wall.totals.style.materials.trimLight))];
  return `Walls ${wallIds.map((id) => `\`${id}\``).join(", ")} with heavy trims ${trimHeavy.map((id) => `\`${id}\``).join(", ")} and light trims ${trimLight.map((id) => `\`${id}\``).join(", ")}.`;
}

async function main() {
  const specRaw = await readJson(mapSpecPath);
  const spec = {
    ...asObject(specRaw, "map_spec"),
    global_dimensions: asObject(specRaw.global_dimensions, "global_dimensions"),
    wall_details: asObject(specRaw.wall_details, "wall_details"),
    constraints: asObject(specRaw.constraints, "constraints"),
    layout_reference: asObject(specRaw.layout_reference, "layout_reference"),
    zones: asArray(specRaw.zones, "zones").map((zone, index) => {
      const object = asObject(zone, `zones[${index}]`);
      return {
        id: asString(object.id, `zones[${index}].id`),
        type: asString(object.type, `zones[${index}].type`),
        label: typeof object.label === "string" ? object.label : "",
        notes: typeof object.notes === "string" ? object.notes : "",
        rect: normalizeRect(object.rect, `zones[${index}].rect`),
      };
    }),
    anchors: asArray(specRaw.anchors, "anchors").map((anchor, index) => {
      const object = asObject(anchor, `anchors[${index}]`);
      return {
        id: asString(object.id, `anchors[${index}].id`),
        type: asString(object.type, `anchors[${index}].type`),
        zone: asString(object.zone, `anchors[${index}].zone`),
        x: asNumber(object.x, `anchors[${index}].x`),
        y: asNumber(object.y, `anchors[${index}].y`),
        z: asNumber(object.z, `anchors[${index}].z`),
        yawDeg: typeof object.yaw_deg === "number" ? object.yaw_deg : null,
        endX: typeof object.end_x === "number" ? object.end_x : null,
        endY: typeof object.end_y === "number" ? object.end_y : null,
        endZ: typeof object.end_z === "number" ? object.end_z : null,
        widthM: typeof object.width_m === "number" ? object.width_m : null,
        heightM: typeof object.height_m === "number" ? object.height_m : null,
        notes: typeof object.notes === "string" ? object.notes : "",
      };
    }),
    zoneById: new Map(),
  };

  for (const zone of spec.zones) {
    if (spec.zoneById.has(zone.id)) {
      fail(`Duplicate zone ${zone.id}`);
    }
    spec.zoneById.set(zone.id, zone);
  }

  const layoutReference = spec.layout_reference;
  const zoneAliases = asArray(layoutReference.zone_aliases, "layout_reference.zone_aliases").map((entry, index) => {
    const object = asObject(entry, `layout_reference.zone_aliases[${index}]`);
    const zoneId = asString(object.zoneId, `layout_reference.zone_aliases[${index}].zoneId`);
    const zone = spec.zoneById.get(zoneId);
    if (!zone) {
      fail(`layout_reference.zone_aliases[${index}] references unknown zone ${zoneId}`);
    }
    return {
      id: asString(object.areaId, `layout_reference.zone_aliases[${index}].areaId`),
      zoneId,
      zone,
      label: asString(object.label, `layout_reference.zone_aliases[${index}].label`),
      shortLabel: asString(object.shortLabel, `layout_reference.zone_aliases[${index}].shortLabel`),
      humanLabel: typeof object.humanLabel === "string" ? object.humanLabel : asString(object.label, `layout_reference.zone_aliases[${index}].label`),
      notes: typeof object.notes === "string" ? object.notes : zone.notes,
      kind: "zone",
    };
  });
  const aliasZoneIds = new Set(zoneAliases.map((entry) => entry.zoneId));
  for (const zone of spec.zones) {
    if (AREA_ZONE_TYPES.has(zone.type) && !aliasZoneIds.has(zone.id)) {
      fail(`Missing zone alias for ${zone.id}`);
    }
  }

  const buildingFrontages = asArray(layoutReference.building_frontages, "layout_reference.building_frontages").map((entry, index) => {
    const object = asObject(entry, `layout_reference.building_frontages[${index}]`);
    const zoneId = asString(object.zoneId, `layout_reference.building_frontages[${index}].zoneId`);
    const zone = spec.zoneById.get(zoneId);
    if (!zone) {
      fail(`layout_reference.building_frontages[${index}] references unknown zone ${zoneId}`);
    }
    const face = asString(object.face, `layout_reference.building_frontages[${index}].face`);
    if (!FACE_VALUES.includes(face)) {
      fail(`layout_reference.building_frontages[${index}].face must be one of ${FACE_VALUES.join(", ")}`);
    }
    if (!TARGET_WALL_ZONE_TYPES.has(zone.type)) {
      fail(`Building frontage ${zoneId}:${face} must target a wall-bearing zone`);
    }
    return {
      id: asString(object.buildingId, `layout_reference.building_frontages[${index}].buildingId`),
      zone,
      face,
      label: asString(object.label, `layout_reference.building_frontages[${index}].label`),
      shortLabel: asString(object.shortLabel, `layout_reference.building_frontages[${index}].shortLabel`),
      humanLabel: typeof object.humanLabel === "string" ? object.humanLabel : asString(object.label, `layout_reference.building_frontages[${index}].label`),
      notes: typeof object.notes === "string" ? object.notes : "",
    };
  });

  const customCallouts = asArray(layoutReference.custom_callouts, "layout_reference.custom_callouts").map((entry, index) => {
    const object = asObject(entry, `layout_reference.custom_callouts[${index}]`);
    const spawnZoneId = asString(object.spawnZoneId, `layout_reference.custom_callouts[${index}].spawnZoneId`);
    const hallZoneId = asString(object.hallZoneId, `layout_reference.custom_callouts[${index}].hallZoneId`);
    const connectorZoneId = asString(object.connectorZoneId, `layout_reference.custom_callouts[${index}].connectorZoneId`);
    const spawnZone = spec.zoneById.get(spawnZoneId);
    const hallZone = spec.zoneById.get(hallZoneId);
    const connectorZone = spec.zoneById.get(connectorZoneId);
    if (!spawnZone || !hallZone || !connectorZone) {
      fail(`Custom callout ${index} references unknown zones`);
    }
    const spawnFace = asString(object.spawnFace, `layout_reference.custom_callouts[${index}].spawnFace`);
    if (spawnFace !== "east" && spawnFace !== "west") {
      fail(`Custom callout ${index} spawnFace must be east or west`);
    }
    return {
      id: asString(object.calloutId, `layout_reference.custom_callouts[${index}].calloutId`),
      label: asString(object.label, `layout_reference.custom_callouts[${index}].label`),
      shortLabel: asString(object.shortLabel, `layout_reference.custom_callouts[${index}].shortLabel`),
      humanLabel: typeof object.humanLabel === "string" ? object.humanLabel : asString(object.label, `layout_reference.custom_callouts[${index}].label`),
      spawnZoneId,
      hallZoneId,
      connectorZoneId,
      spawnFace,
      notes: typeof object.notes === "string" ? object.notes : "",
      kind: "callout",
    };
  });

  const seenIds = new Map();
  const seenShortLabels = new Map();
  for (const asset of [...zoneAliases, ...buildingFrontages, ...customCallouts]) {
    if (seenIds.has(asset.id)) {
      fail(`Duplicate layout reference ID ${asset.id}`);
    }
    seenIds.set(asset.id, asset.id);
    if (seenShortLabels.has(asset.shortLabel)) {
      fail(`Duplicate layout reference short label ${asset.shortLabel}`);
    }
    seenShortLabels.set(asset.shortLabel, asset.id);
  }

  const calloutCsvText = await readOptionalText(calloutsPath);
  const objectCatalogText = await readOptionalText(objectCatalogPath);
  const calloutsCsv = calloutCsvText ? parseCsv(calloutCsvText) : [];
  const objectCatalog = objectCatalogText ? parseCsv(objectCatalogText) : [];
  const designCalloutsByZoneId = new Map();
  for (const row of calloutsCsv) {
    const zoneId = row["Zone ID"];
    if (!zoneId) continue;
    const list = designCalloutsByZoneId.get(zoneId) ?? [];
    list.push({
      id: row["Callout ID"] ?? "",
      name: row.Name ?? "",
      description: row.Description ?? "",
    });
    designCalloutsByZoneId.set(zoneId, list);
  }

  const walkableZones = spec.zones.filter((zone) => WALKABLE_ZONE_TYPES.has(zone.type));
  const walkableRects = walkableZones.map((zone) => zone.rect);
  const boundary = normalizeRect(spec.global_dimensions.playable_boundary, "global_dimensions.playable_boundary");
  spec.global_dimensions.playable_boundary = boundary;
  const axes = collectAxisCoordinates(walkableRects, boundary);
  const inside = buildInsideGrid(walkableRects, axes.xs, axes.ys);
  const rawSegments = extractBoundarySegments(inside, axes.xs, axes.ys);

  const overrideMap = new Map();
  for (const override of asArray(specRaw.wall_details.facade_overrides, "wall_details.facade_overrides")) {
    const object = asObject(override, "wall_details.facade_overrides[]");
    overrideMap.set(
      `${asString(object.zoneId, "wall_details.facade_overrides[].zoneId")}:${asString(object.face, "wall_details.facade_overrides[].face")}`,
      asString(object.preset, "wall_details.facade_overrides[].preset"),
    );
  }
  const authoredWindowLayoutMap = new Map();
  for (const override of asArray(specRaw.wall_details.window_layout_overrides ?? [], "wall_details.window_layout_overrides")) {
    const object = asObject(override, "wall_details.window_layout_overrides[]");
    authoredWindowLayoutMap.set(
      authoredWindowLayoutKey(
        asString(object.zoneId, "wall_details.window_layout_overrides[].zoneId"),
        asString(object.face, "wall_details.window_layout_overrides[].face"),
        asNumber(object.segmentOrdinal, "wall_details.window_layout_overrides[].segmentOrdinal"),
      ),
      {
        windows: asArray(object.windows, "wall_details.window_layout_overrides[].windows").map((window) => {
          const rawWindow = asObject(window, "wall_details.window_layout_overrides[].windows[]");
          return {
            glassStyle: asString(rawWindow.glassStyle, "wall_details.window_layout_overrides[].windows[].glassStyle"),
          };
        }),
      },
    );
  }

  const mainLaneZones = spec.zones.filter((zone) => zone.type === "main_lane_segment");
  const mapCenterX = mainLaneZones.reduce((sum, zone) => sum + zone.rect.x + zone.rect.w * 0.5, 0) / Math.max(1, mainLaneZones.length);
  const mapCenterZ = mainLaneZones.reduce((sum, zone) => sum + zone.rect.y + zone.rect.h * 0.5, 0) / Math.max(1, mainLaneZones.length);
  const baseHeight = asNumber(spec.global_dimensions.wall_height_default, "global_dimensions.wall_height_default");
  const density = clamp(asNumber(spec.wall_details.density, "wall_details.density"), 0, 1.25);
  const maxProtrusionM = clamp(asNumber(spec.wall_details.maxProtrusion, "wall_details.maxProtrusion"), 0.03, 0.2);
  const runtimeSeed = deriveSeedFromString(MAP_ID) || 1;

  const expectedFaces = new Map();
  for (const zone of spec.zones.filter((candidate) => TARGET_WALL_ZONE_TYPES.has(candidate.type))) {
    for (const face of FACE_VALUES) {
      const line = faceLineForZone(zone, face);
      const overlaps = overlappingFaceBlocks(zone, face, walkableZones);
      const visible = subtractRanges(line.start, line.end, overlaps);
      if (visible.length === 0) continue;
      expectedFaces.set(`${zone.id}:${face}`, {
        zone,
        face,
        line,
        visible,
        overlaps,
      });
    }
  }

  const exposedSegments = sortBoundarySegments(
    [...expectedFaces.values()].flatMap((expected) =>
      expected.visible.map((span) => ({
        orientation: expected.line.orientation,
        coord: expected.line.coord,
        start: span.start,
        end: span.end,
        outward: expected.line.outward,
        zoneId: expected.zone.id,
        face: expected.face,
      })),
    ),
  ).map((segment, index) => ({
    ...segment,
    index,
  }));
  const segmentsByFaceKey = new Map();
  for (const segment of exposedSegments) {
    const list = segmentsByFaceKey.get(`${segment.zoneId}:${segment.face}`) ?? [];
    list.push(segment);
    segmentsByFaceKey.set(`${segment.zoneId}:${segment.face}`, list);
  }
  const cornerKeys = createCornerKeys(exposedSegments);

  const buildingByFaceKey = new Map(buildingFrontages.map((building) => [`${building.zone.id}:${building.face}`, building]));
  const areaByZoneId = new Map(zoneAliases.map((area) => [area.zoneId, area]));
  const wallAssets = [];
  const wallAssetsByZoneFace = new Map();

  for (const [key, expected] of expectedFaces) {
    const segments = segmentsByFaceKey.get(key);
    if (!segments || segments.length === 0) {
      fail(`Expected exposed face ${key} has no generated wall asset`);
    }
    const matchedSpans = segments.map((segment) => ({ start: segment.start, end: segment.end })).sort((left, right) => left.start - right.start);
    if (matchedSpans.length !== expected.visible.length) {
      fail(`Face ${key} expected ${expected.visible.length} visible span(s) but found ${matchedSpans.length}`);
    }
    for (let index = 0; index < matchedSpans.length; index += 1) {
      const visible = expected.visible[index];
      const matched = matchedSpans[index];
      if (!approxEqual(visible.start, matched.start) || !approxEqual(visible.end, matched.end)) {
        fail(`Face ${key} visible spans do not match generated boundary segments`);
      }
    }

    const area = areaByZoneId.get(expected.zone.id);
    if (!area) {
      fail(`Missing area alias for ${expected.zone.id}`);
    }

    const building = buildingByFaceKey.get(key) ?? null;
    const frame = toSegmentFrame(segments[0]);
    const style = resolveFacadeStyleForSegment(expected.zone, frame);
    const isSideHall = expected.zone.type === "side_hall";
    const isConnector = expected.zone.type === "connector";
    const isCut = expected.zone.type === "cut";
    const isMainLane = isMainLaneZone(expected.zone);
    const isShopfront = isShopfrontZone(expected.zone);
    const isInsideWall = isSideHall
      && Math.abs(frame.inwardX) > 0.5
      && Math.sign(frame.centerX - mapCenterX) !== 0
      && Math.sign(frame.centerX - mapCenterX) === Math.sign(frame.inwardX);
    let isSpawnEntryWall = false;
    if (expected.zone.type === "spawn_plaza") {
      const spawnCenterZ = expected.zone.rect.y + expected.zone.rect.h * 0.5;
      isSpawnEntryWall = (frame.centerZ - spawnCenterZ) * (mapCenterZ - spawnCenterZ) > 0;
    }
    let isConnectorMainLaneFacing = false;
    if (expected.zone.type === "connector") {
      const zoneCenterZ = expected.zone.rect.y + expected.zone.rect.h * 0.5;
      const zoneCenterX = expected.zone.rect.x + expected.zone.rect.w * 0.5;
      const toMainLane =
        frame.inwardZ * (mapCenterZ - zoneCenterZ) +
        frame.inwardX * (mapCenterX - zoneCenterX);
      isConnectorMainLaneFacing = toMainLane < -0.01;
    }
    const wallHeightM = resolveSegmentWallHeight(baseHeight, expected.zone, isInsideWall, isSpawnEntryWall, isConnectorMainLaneFacing);
    const compositionPreset = resolveCompositionPreset(expected.zone, expected.face, style.family, style.balconyStyle, overrideMap);
    const faceContext = {
      face: expected.face,
      wallHeightM,
      compositionPreset,
      isInsideWall,
      isSpawnEntryWall,
      isConnectorMainLaneFacing,
      isMainLane,
      isShopfront,
      isSideHall,
      isConnector,
    };
    const isSpawnBCleanup = isSpawnBShellCleanupSurface(expected.zone, expected.face);

    const segmentSummaries = segments
      .sort((left, right) => left.start - right.start)
      .map((segment, index) => ({
        ...segment,
        segmentNumber: index + 1,
        summary: summarizeSegmentFacade(
          segment,
          expected.zone,
          segment.index,
          index + 1,
          faceContext,
          authoredWindowLayoutMap.get(authoredWindowLayoutKey(expected.zone.id, expected.face, index + 1)) ?? null,
          runtimeSeed,
          maxProtrusionM,
          density,
          cornerKeys,
        ),
      }));

    const totals = segmentSummaries.reduce((aggregate, segment) => {
      aggregate.groundDoorCount += segment.summary.groundDoorCount;
      aggregate.upperDoorCount += segment.summary.upperDoorCount;
      aggregate.balconyCount += segment.summary.balconyCount;
      aggregate.windowCounts.glass += segment.summary.windowCounts.glass;
      aggregate.windowCounts.dark += segment.summary.windowCounts.dark;
      aggregate.windowCounts.shuttered += segment.summary.windowCounts.shuttered;
      return aggregate;
    }, {
      groundDoorCount: 0,
      upperDoorCount: 0,
      balconyCount: 0,
      windowCounts: { glass: 0, dark: 0, shuttered: 0 },
    });

    const wall = {
      id: building ? `WALL_${building.id}_FRONT` : `WALL_${area.id}_${expected.face.toUpperCase()}`,
      shortLabel: building ? `${building.shortLabel}-F` : `${area.shortLabel}-${faceAbbreviation(expected.face)}`,
      label: building ? `${building.label} Front Wall` : `${area.label} ${formatFace(expected.face)} Wall`,
      zone: expected.zone,
      face: expected.face,
      areaId: area.id,
      buildingId: building?.id ?? null,
      segments: segmentSummaries,
      totalVisibleLength: segmentSummaries.reduce((sum, segment) => sum + (segment.end - segment.start), 0),
      totals: {
        wallRole: segmentSummaries[0].summary.wallRole,
        compositionPreset: segmentSummaries[0].summary.compositionPreset,
        style: segmentSummaries[0].summary.style,
        heightM: wallHeightM,
        stories: Math.round(wallHeightM / STORY_HEIGHT_M),
        ...totals,
      },
      floorContext: floorSummaryForZone(expected.zone, areaByZoneId),
      gapSummary: expected.overlaps.length > 0
        ? expected.overlaps
          .map((overlap) => {
            const overlapArea = areaByZoneId.get(overlap.zoneId);
            const axisLabel = expected.face === "west" || expected.face === "east" ? "y" : "x";
            return `${overlapArea ? overlapArea.label : overlap.zoneId} (${axisLabel}=${rangeLabel(overlap.start, overlap.end)})`;
          })
          .join(", ")
        : "none",
      doorLogic: segmentSummaries.map((segment) => `#${segment.segmentNumber} ${segment.summary.doorNotes}`).join(" "),
      windowLogic: segmentSummaries.map((segment) => `#${segment.segmentNumber} ${segment.summary.windowNotes}`).join(" "),
      balconyLogic: segmentSummaries.map((segment) => `#${segment.segmentNumber} ${segment.summary.balconyNotes}`).join(" "),
      textureLogic: `${style.family} facade family on ${expected.zone.id}:${expected.face} resolves wall \`${style.materials.wall}\` with balcony material ${style.materials.balcony ? `\`${style.materials.balcony}\`` : "none"}.`,
      trimLogic: isSpawnBCleanup
        ? `Spawn B shell cleanup keeps only edge trims: shared plinth ${SPAWN_B_SHELL_SHARED_PLINTH_HEIGHT_M.toFixed(2)}m / ${SPAWN_B_SHELL_SHARED_PLINTH_DEPTH_M.toFixed(2)}m, heavy top-edge trims on \`${style.materials.trimHeavy}\`, no string-course bands, and no full-height pilaster grid.`
        : style.trimTier === "hero"
          ? `Hero trim tier uses the heaviest parapet and trim emphasis with \`${style.materials.trimHeavy}\` and \`${style.materials.trimLight}\`.`
          : style.trimTier === "accented"
            ? `Accented trim tier keeps base trim and string-course reads with \`${style.materials.trimHeavy}\` / \`${style.materials.trimLight}\`.`
            : `Restrained trim tier minimizes banding and keeps trims on \`${style.materials.trimHeavy}\` / \`${style.materials.trimLight}\`.`,
      notes: building ? building.notes : `${area.label} exposed ${expected.face} face.`,
    };

    wallAssets.push(wall);
    wallAssetsByZoneFace.set(key, wall);
  }

  for (const building of buildingFrontages) {
    if (!wallAssetsByZoneFace.has(`${building.zone.id}:${building.face}`)) {
      fail(`Building frontage ${building.id} (${building.zone.id}:${building.face}) does not resolve to an exposed wall asset`);
    }
  }

  const anchorsByZoneId = new Map();
  for (const anchor of spec.anchors) {
    const list = anchorsByZoneId.get(anchor.zone) ?? [];
    list.push(anchor);
    anchorsByZoneId.set(anchor.zone, list);
  }
  const anchorAssignments = assignAnchorsToWalls(spec.anchors, wallAssetsByZoneFace, spec.zoneById);
  for (const wall of wallAssets) {
    const assigned = anchorAssignments.get(wall.id) ?? [];
    wall.anchorSummary = summarizeAnchors(assigned);
  }

  const areaAssets = zoneAliases.map((area) => {
    const zone = area.zone;
    const linkedWalls = wallAssets.filter((wall) => wall.areaId === area.id);
    const linkedBuildings = buildingFrontages
      .filter((building) => building.zone.id === zone.id)
      .map((building) => building.id);
    const edgeAdjacency = zoneAliases.filter((other) => {
      if (other.zoneId === zone.id) return false;
      const verticalTouchLeft = approxEqual(zone.rect.x + zone.rect.w, other.zone.rect.x) && overlapRange(zone.rect.y, zone.rect.y + zone.rect.h, other.zone.rect.y, other.zone.rect.y + other.zone.rect.h);
      const verticalTouchRight = approxEqual(other.zone.rect.x + other.zone.rect.w, zone.rect.x) && overlapRange(zone.rect.y, zone.rect.y + zone.rect.h, other.zone.rect.y, other.zone.rect.y + other.zone.rect.h);
      const horizontalTouchTop = approxEqual(zone.rect.y + zone.rect.h, other.zone.rect.y) && overlapRange(zone.rect.x, zone.rect.x + zone.rect.w, other.zone.rect.x, other.zone.rect.x + other.zone.rect.w);
      const horizontalTouchBottom = approxEqual(other.zone.rect.y + other.zone.rect.h, zone.rect.y) && overlapRange(zone.rect.x, zone.rect.x + zone.rect.w, other.zone.rect.x, other.zone.rect.x + other.zone.rect.w);
      return Boolean(verticalTouchLeft || verticalTouchRight || horizontalTouchTop || horizontalTouchBottom);
    });
    const containedBy = zoneAliases.filter((other) => other.zoneId !== zone.id && rectContainsRect(other.zone.rect, zone.rect));
    const contains = zoneAliases.filter((other) => other.zoneId !== zone.id && rectContainsRect(zone.rect, other.zone.rect));
    const zoneAnchors = anchorsByZoneId.get(zone.id) ?? [];
    const floorSummary = floorSummaryForZone(zone, areaByZoneId);

    return {
      ...area,
      designCallouts: designCalloutsByZoneId.get(zone.id) ?? [],
      edgeAdjacency,
      containedBy,
      contains,
      linkedWallIds: linkedWalls.map((wall) => wall.id),
      linkedBuildingIds: linkedBuildings,
      anchorSummary: summarizeAnchors(zoneAnchors),
      floorSummary,
      wallMaterialSummary: resolveWallMaterialSummary(linkedWalls, floorSummary),
      constraintSummary: resolveConstraintSummary(zone, specRaw),
      notes: area.notes || zone.notes || "No extra notes.",
    };
  });

  const calloutAssets = customCallouts.map((callout) => {
    const linkedWalls = [
      wallAssetsByZoneFace.get(`${callout.spawnZoneId}:${callout.spawnFace}`),
      wallAssetsByZoneFace.get(`${callout.hallZoneId}:${callout.spawnFace === "west" ? "east" : "west"}`),
    ].filter(Boolean);
    const spawnMaterial = resolveFloorMaterialIdForZone(callout.spawnZoneId);
    const hallMaterial = resolveFloorMaterialIdForZone(callout.hallZoneId);
    const connectorMaterial = resolveFloorMaterialIdForZone(callout.connectorZoneId);
    return {
      ...callout,
      floorSummary: `Composite corner between spawn \`${spawnMaterial}\`, connector \`${connectorMaterial}\`, and hall \`${hallMaterial}\` surfaces.`,
      linkedWallIds: linkedWalls.map((wall) => wall.id),
    };
  });

  const buildingAssets = buildingFrontages.map((building) => {
    const wall = wallAssetsByZoneFace.get(`${building.zone.id}:${building.face}`);
    const area = areaByZoneId.get(building.zone.id);
    if (!wall || !area) {
      fail(`Missing wall or area for building ${building.id}`);
    }
    return {
      ...building,
      areaId: area.id,
      wall,
      anchorSummary: wall.anchorSummary,
      textureLogic: wall.textureLogic,
      trimLogic: wall.trimLogic,
    };
  });

  const svg = renderSvg(spec, areaAssets, calloutAssets, buildingAssets, wallAssets);
  const markdown = renderMarkdown(spec, [...areaAssets, ...calloutAssets], calloutAssets, buildingAssets, wallAssets);
  validateAssetCoverage(markdown, svg, [...areaAssets, ...calloutAssets, ...buildingAssets, ...wallAssets]);

  if (objectCatalog.length === 0) {
    console.warn("[gen:layout-reference] note: object_catalog.csv unavailable or empty; continuing without optional prose enrichment");
  }

  await writeText(svgOutPath, svg);
  await writeText(markdownOutPath, markdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
