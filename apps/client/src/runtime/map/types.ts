type UnknownRecord = Record<string, unknown>;

export type RuntimeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RuntimeBlockoutZone = {
  id: string;
  type: string;
  rect: RuntimeRect;
  label: string;
  notes: string;
};

export type RuntimeWallPatch = {
  orientation: "vertical" | "horizontal";
  coord: number;
  start: number;
  end: number;
  outward: -1 | 1;
};

export type RuntimeBlockoutSpec = {
  mapId: string;
  playable_boundary: RuntimeRect;
  defaults: {
    wall_height: number;
    wall_thickness: number;
    ceiling_height: number;
    floor_height: number;
  };
  wall_details: RuntimeWallDetailOptions;
  zones: RuntimeBlockoutZone[];
  exterior_wall_patches: RuntimeWallPatch[];
  constraints: {
    min_path_width_main_lane: number;
    min_path_width_side_halls: number;
  };
};

export type RuntimeWallDetailStyle = "bazaar";

export type RuntimeWallDetailOptions = {
  enabled: boolean;
  seed?: number;
  style: RuntimeWallDetailStyle;
  density: number;
  maxProtrusion: number;
};

export type RuntimeAnchor = {
  id: string;
  type: string;
  zone: string;
  pos: {
    x: number;
    y: number;
    z: number;
  };
  yawDeg?: number;
  endPos?: {
    x: number;
    y: number;
    z: number;
  };
  widthM?: number;
  heightM?: number;
  notes?: string;
};

export type RuntimeAnchorsSpec = {
  mapId: string;
  anchors: RuntimeAnchor[];
};

export type RuntimeShot = {
  id: string;
  label: string;
  description: string;
  camera: {
    pos: {
      x: number;
      y: number;
      z: number;
    };
    lookAt: {
      x: number;
      y: number;
      z: number;
    };
    fovDeg: number;
  };
  durationSec?: number;
  tags?: string[];
};

export type RuntimeShotsSpec = {
  metadata: Record<string, unknown>;
  aliases?: {
    compare?: string;
  };
  shots: RuntimeShot[];
};

export type RuntimeMapAssets = {
  blockout: RuntimeBlockoutSpec;
  anchors: RuntimeAnchorsSpec;
  shots: RuntimeShotsSpec;
};

function failParse(source: string, message: string): never {
  throw new Error(`[map-parse] ${source}: ${message}`);
}

function asObject(value: unknown, source: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failParse(source, "expected object");
  }
  return value as UnknownRecord;
}

function asString(value: unknown, source: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    failParse(source, "expected non-empty string");
  }
  return value;
}

function asNumber(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failParse(source, "expected finite number");
  }
  return value;
}

function asBoolean(value: unknown, source: string): boolean {
  if (typeof value !== "boolean") {
    failParse(source, "expected boolean");
  }
  return value;
}

function asPositiveNumber(value: unknown, source: string): number {
  const numeric = asNumber(value, source);
  if (numeric <= 0) {
    failParse(source, "expected number > 0");
  }
  return numeric;
}

function asStringArray(value: unknown, source: string): string[] {
  if (!Array.isArray(value)) {
    failParse(source, "expected string array");
  }
  return value.map((item, index) => asString(item, `${source}[${index}]`));
}

function parseRect(value: unknown, source: string): RuntimeRect {
  const obj = asObject(value, source);
  return {
    x: asNumber(obj.x, `${source}.x`),
    y: asNumber(obj.y, `${source}.y`),
    w: asPositiveNumber(obj.w, `${source}.w`),
    h: asPositiveNumber(obj.h, `${source}.h`),
  };
}

function parseVec3(value: unknown, source: string): { x: number; y: number; z: number } {
  const obj = asObject(value, source);
  return {
    x: asNumber(obj.x, `${source}.x`),
    y: asNumber(obj.y, `${source}.y`),
    z: asNumber(obj.z, `${source}.z`),
  };
}

const DEFAULT_WALL_THICKNESS_M = 0.25;
const DEFAULT_WALL_DETAIL_DENSITY = 0.48;
const DEFAULT_WALL_DETAIL_MAX_PROTRUSION_M = 0.15;

function parseWallDetailOptions(value: unknown, source: string): RuntimeWallDetailOptions {
  if (typeof value === "undefined") {
    return {
      enabled: true,
      style: "bazaar",
      density: DEFAULT_WALL_DETAIL_DENSITY,
      maxProtrusion: DEFAULT_WALL_DETAIL_MAX_PROTRUSION_M,
    };
  }

  const obj = asObject(value, source);
  const styleRaw = typeof obj.style === "string" ? obj.style : "bazaar";
  if (styleRaw !== "bazaar") {
    failParse(`${source}.style`, "expected 'bazaar'");
  }
  const style: RuntimeWallDetailStyle = "bazaar";

  const densityRaw =
    typeof obj.density === "number" && Number.isFinite(obj.density) ? obj.density : DEFAULT_WALL_DETAIL_DENSITY;
  const maxProtrusionRaw =
    typeof obj.maxProtrusion === "number" && Number.isFinite(obj.maxProtrusion)
      ? obj.maxProtrusion
      : DEFAULT_WALL_DETAIL_MAX_PROTRUSION_M;

  const density = Math.max(0, Math.min(1.25, densityRaw));
  const maxProtrusion = Math.max(0.02, Math.min(0.2, maxProtrusionRaw));

  const resolved: RuntimeWallDetailOptions = {
    enabled: typeof obj.enabled === "undefined" ? true : asBoolean(obj.enabled, `${source}.enabled`),
    style,
    density,
    maxProtrusion,
  };

  if (typeof obj.seed !== "undefined") {
    resolved.seed = asNumber(obj.seed, `${source}.seed`);
  }

  return resolved;
}

export function parseBlockoutSpec(value: unknown, source = "map_spec.json"): RuntimeBlockoutSpec {
  const obj = asObject(value, source);
  const zonesRaw = obj.zones;
  if (!Array.isArray(zonesRaw) || zonesRaw.length === 0) {
    failParse(source, "zones must be a non-empty array");
  }

  const zones = zonesRaw.map((zoneRaw, index) => {
    const zone = asObject(zoneRaw, `${source}.zones[${index}]`);
    return {
      id: asString(zone.id, `${source}.zones[${index}].id`),
      type: asString(zone.type, `${source}.zones[${index}].type`),
      rect: parseRect(zone.rect, `${source}.zones[${index}].rect`),
      label: typeof zone.label === "string" ? zone.label : "",
      notes: typeof zone.notes === "string" ? zone.notes : "",
    };
  });

  const defaults = asObject(obj.defaults, `${source}.defaults`);
  const constraints = asObject(obj.constraints, `${source}.constraints`);

  const patchesRaw = obj.exterior_wall_patches;
  const exterior_wall_patches: RuntimeWallPatch[] = Array.isArray(patchesRaw)
    ? patchesRaw.map((p, i) => {
        const patch = asObject(p, `${source}.exterior_wall_patches[${i}]`);
        const orientation = asString(patch.orientation, `${source}.exterior_wall_patches[${i}].orientation`);
        if (orientation !== "vertical" && orientation !== "horizontal") {
          failParse(`${source}.exterior_wall_patches[${i}].orientation`, "expected 'vertical' or 'horizontal'");
        }
        const outward = asNumber(patch.outward, `${source}.exterior_wall_patches[${i}].outward`);
        if (outward !== -1 && outward !== 1) {
          failParse(`${source}.exterior_wall_patches[${i}].outward`, "expected -1 or 1");
        }
        return {
          orientation: orientation as "vertical" | "horizontal",
          coord: asNumber(patch.coord, `${source}.exterior_wall_patches[${i}].coord`),
          start: asNumber(patch.start, `${source}.exterior_wall_patches[${i}].start`),
          end: asNumber(patch.end, `${source}.exterior_wall_patches[${i}].end`),
          outward: outward as -1 | 1,
        };
      })
    : [];

  return {
    mapId: asString(obj.mapId, `${source}.mapId`),
    playable_boundary: parseRect(obj.playable_boundary, `${source}.playable_boundary`),
    defaults: {
      wall_height: asPositiveNumber(defaults.wall_height, `${source}.defaults.wall_height`),
      wall_thickness:
        typeof defaults.wall_thickness === "undefined"
          ? DEFAULT_WALL_THICKNESS_M
          : asPositiveNumber(defaults.wall_thickness, `${source}.defaults.wall_thickness`),
      ceiling_height: asPositiveNumber(defaults.ceiling_height, `${source}.defaults.ceiling_height`),
      floor_height: asNumber(defaults.floor_height, `${source}.defaults.floor_height`),
    },
    wall_details: parseWallDetailOptions(obj.wall_details, `${source}.wall_details`),
    zones,
    exterior_wall_patches,
    constraints: {
      min_path_width_main_lane: asPositiveNumber(
        constraints.min_path_width_main_lane,
        `${source}.constraints.min_path_width_main_lane`,
      ),
      min_path_width_side_halls: asPositiveNumber(
        constraints.min_path_width_side_halls,
        `${source}.constraints.min_path_width_side_halls`,
      ),
    },
  };
}

export function parseAnchorsSpec(value: unknown, source = "map_spec.json"): RuntimeAnchorsSpec {
  const obj = asObject(value, source);
  const anchorsRaw = obj.anchors;
  if (!Array.isArray(anchorsRaw)) {
    failParse(source, "anchors must be an array");
  }

  const anchors = anchorsRaw.map((anchorRaw, index) => {
    const anchor = asObject(anchorRaw, `${source}.anchors[${index}]`);
    const out: RuntimeAnchor = {
      id: asString(anchor.id, `${source}.anchors[${index}].id`),
      type: asString(anchor.type, `${source}.anchors[${index}].type`),
      zone: asString(anchor.zone, `${source}.anchors[${index}].zone`),
      pos: parseVec3(anchor.pos, `${source}.anchors[${index}].pos`),
    };

    if (typeof anchor.yawDeg !== "undefined") {
      out.yawDeg = asNumber(anchor.yawDeg, `${source}.anchors[${index}].yawDeg`);
    }
    if (typeof anchor.endPos !== "undefined") {
      out.endPos = parseVec3(anchor.endPos, `${source}.anchors[${index}].endPos`);
    }
    if (typeof anchor.widthM !== "undefined") {
      out.widthM = asPositiveNumber(anchor.widthM, `${source}.anchors[${index}].widthM`);
    }
    if (typeof anchor.heightM !== "undefined") {
      out.heightM = asPositiveNumber(anchor.heightM, `${source}.anchors[${index}].heightM`);
    }
    if (typeof anchor.notes !== "undefined") {
      out.notes = asString(anchor.notes, `${source}.anchors[${index}].notes`);
    }

    return out;
  });

  return {
    mapId: asString(obj.mapId, `${source}.mapId`),
    anchors,
  };
}

export function parseShotsSpec(value: unknown, source = "shots.json"): RuntimeShotsSpec {
  const obj = asObject(value, source);
  const shotsRaw = obj.shots;
  if (!Array.isArray(shotsRaw) || shotsRaw.length === 0) {
    failParse(source, "shots must be a non-empty array");
  }

  const shots = shotsRaw.map((shotRaw, index) => {
    const shot = asObject(shotRaw, `${source}.shots[${index}]`);
    const camera = asObject(shot.camera, `${source}.shots[${index}].camera`);

    return {
      id: asString(shot.id, `${source}.shots[${index}].id`),
      label: asString(shot.label, `${source}.shots[${index}].label`),
      description: asString(shot.description, `${source}.shots[${index}].description`),
      camera: {
        pos: parseVec3(camera.pos, `${source}.shots[${index}].camera.pos`),
        lookAt: parseVec3(camera.lookAt, `${source}.shots[${index}].camera.lookAt`),
        fovDeg: asPositiveNumber(camera.fovDeg, `${source}.shots[${index}].camera.fovDeg`),
      },
      ...(typeof shot.durationSec !== "undefined"
        ? { durationSec: asPositiveNumber(shot.durationSec, `${source}.shots[${index}].durationSec`) }
        : {}),
      ...(typeof shot.tags !== "undefined"
        ? { tags: asStringArray(shot.tags, `${source}.shots[${index}].tags`) }
        : {}),
    };
  });

  const metadataRaw = obj.metadata;
  const metadata = metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
    ? (metadataRaw as Record<string, unknown>)
    : {};

  let aliases: RuntimeShotsSpec["aliases"] | undefined;
  if (typeof obj.aliases !== "undefined") {
    const aliasObj = asObject(obj.aliases, `${source}.aliases`);
    aliases = {
      ...(typeof aliasObj.compare !== "undefined"
        ? { compare: asString(aliasObj.compare, `${source}.aliases.compare`) }
        : {}),
    };
  }

  return {
    metadata,
    ...(aliases ? { aliases } : {}),
    shots,
  };
}
