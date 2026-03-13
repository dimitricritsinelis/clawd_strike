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

export type RuntimeFacadeFace = "north" | "south" | "east" | "west";

export type RuntimeFacadeOverridePreset =
  | "merchant_rhythm"
  | "merchant_hero_stack"
  | "residential_quiet"
  | "residential_balcony_stack"
  | "spawn_courtyard_landmark"
  | "spawn_gate_brick_backdrop"
  | "service_blank";

export type RuntimeFacadeOverride = {
  zoneId: string;
  face: RuntimeFacadeFace;
  preset: RuntimeFacadeOverridePreset;
};

export type WindowHeadShape = "rect" | "pointed_arch";
export type WindowGlassStyle = "stained_glass_bright" | "stained_glass_dim";

export type RuntimeAuthoredWindow = {
  centerS: number;
  sillY: number;
  width: number;
  height: number;
  headShape: WindowHeadShape;
  glassStyle: WindowGlassStyle;
};

export type RuntimeAuthoredDoor = {
  centerS: number;
};

export type RuntimeAuthoredBalconyOpening = {
  width: number;
  height: number;
  sillOffsetM: number;
  headShape: "pointed_arch";
  glassStyle: WindowGlassStyle;
};

export type RuntimeAuthoredBalcony = {
  centerS: number;
  storyIndex: number;
  spanBays: number;
  depthM: number;
  parapetHeightM: number;
  openingSurroundWidthM: number;
  openingSurroundHeightM: number;
  openingSurroundBottomOffsetM: number;
  roofBreakWidthM: number;
  roofBreakBottomOffsetM: number;
  roofBreakHeightM: number;
  roofBreakCapHeightM: number;
  opening: RuntimeAuthoredBalconyOpening;
};

export type RuntimeDoorStyleSource = {
  zoneId: string;
  face: RuntimeFacadeFace;
  segmentOrdinal: number;
};

export type RuntimeDoorLayoutOverride = {
  zoneId: string;
  face: RuntimeFacadeFace;
  segmentOrdinal: number;
  doors: RuntimeAuthoredDoor[];
  styleSource?: RuntimeDoorStyleSource;
};

export type RuntimeWindowLayoutOverride = {
  zoneId: string;
  face: RuntimeFacadeFace;
  segmentOrdinal: number;
  windows: RuntimeAuthoredWindow[];
};

export type RuntimeBalconyLayoutOverride = {
  zoneId: string;
  face: RuntimeFacadeFace;
  segmentOrdinal: number;
  balconies: RuntimeAuthoredBalcony[];
};

export type RuntimeWindowModule = {
  id: string;
  headShape: "pointed_arch";
  glassStyle: WindowGlassStyle;
  apertureWidthM: number;
  apertureHeightM: number;
  frameWidthM: number;
  frameHeightM: number;
  frameDepthM: number;
  voidInsetM: number;
  glassInsetM: number;
  sillWidthM: number;
  sillHeightM: number;
  sillDepthM: number;
  apronWidthM: number;
  apronHeightM: number;
  apronDepthM: number;
  apronOffsetBelowSillM: number;
};

export type RuntimeDoorModule = {
  id: string;
  modelId: string;
  coverShape: "arched" | "rect";
  doorWidthM: number;
  doorHeightM: number;
  coverWidthM: number;
  coverHeightM: number;
  coverCenterYOffsetM: number;
  trimThicknessM: number;
  revealWidthM: number;
  surroundDepthM: number;
  voidInsetM: number;
  voidDepthM: number;
};

export type RuntimeHeroBayModule = {
  id: string;
  glassStyle: WindowGlassStyle;
  openingWidthM: number;
  openingHeightM: number;
  openingSillY: number;
  surroundWidthM: number;
  surroundHeightM: number;
  surroundBottomY: number;
  frameDepthM: number;
  voidInsetM: number;
  glassInsetM: number;
  pilasterWidthM: number;
  pilasterDepthM: number;
  pilasterHeightM: number;
  pilasterBottomY: number;
  entablatureWidthM: number;
  entablatureDepthM: number;
  entablatureThicknessM: number;
  entablatureCenterY: number;
  entablatureCapWidthM: number;
  entablatureCapDepthM: number;
  entablatureCapThicknessM: number;
  entablatureCapCenterY: number;
  corbelWidthM: number;
  corbelDepthM: number;
  corbelHeightM: number;
  corbelCenterY: number;
  corbelCount: number;
  corbelSpreadM: number;
  pedimentBaseWidthM: number;
  pedimentDepthM: number;
  pedimentLayerHeightM: number;
  pedimentLayerCount: number;
  pedimentWidthStepM: number;
  pedimentBottomY: number;
};

export type RuntimeWallModuleRegistry = {
  windowModules: RuntimeWindowModule[];
  doorModules: RuntimeDoorModule[];
  heroBayModules: RuntimeHeroBayModule[];
};

export type RuntimeCompositionLayoutKind =
  | "spawn_b_front_courtyard"
  | "spawn_b_side_courtyard";

export type RuntimeCompositionLayoutOverride = {
  zoneId: string;
  face: RuntimeFacadeFace;
  segmentOrdinal: number;
  kind: RuntimeCompositionLayoutKind;
  windowModuleId: string;
  doorModuleId: string;
  heroBayModuleId?: string;
  lowerWindowSillY: number;
  upperWindowSillY: number;
};

export type RuntimeWallDetailOptions = {
  enabled: boolean;
  seed?: number;
  style: RuntimeWallDetailStyle;
  density: number;
  maxProtrusion: number;
  facadeOverrides: RuntimeFacadeOverride[];
  doorLayoutOverrides: RuntimeDoorLayoutOverride[];
  windowLayoutOverrides: RuntimeWindowLayoutOverride[];
  balconyLayoutOverrides: RuntimeBalconyLayoutOverride[];
  moduleRegistry: RuntimeWallModuleRegistry;
  compositionLayoutOverrides: RuntimeCompositionLayoutOverride[];
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
const DEFAULT_WALL_DETAIL_MAX_PROTRUSION_M = 0.30;

function parseWallDetailOptions(value: unknown, source: string): RuntimeWallDetailOptions {
  if (typeof value === "undefined") {
    return {
      enabled: true,
      style: "bazaar",
      density: DEFAULT_WALL_DETAIL_DENSITY,
      maxProtrusion: DEFAULT_WALL_DETAIL_MAX_PROTRUSION_M,
      facadeOverrides: [],
      doorLayoutOverrides: [],
      windowLayoutOverrides: [],
      balconyLayoutOverrides: [],
      moduleRegistry: {
        windowModules: [],
        doorModules: [],
        heroBayModules: [],
      },
      compositionLayoutOverrides: [],
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
  const maxProtrusion = Math.max(0.02, Math.min(0.4, maxProtrusionRaw));

  const resolved: RuntimeWallDetailOptions = {
    enabled: typeof obj.enabled === "undefined" ? true : asBoolean(obj.enabled, `${source}.enabled`),
    style,
    density,
    maxProtrusion,
    facadeOverrides: [],
    doorLayoutOverrides: [],
    windowLayoutOverrides: [],
    balconyLayoutOverrides: [],
    moduleRegistry: {
      windowModules: [],
      doorModules: [],
      heroBayModules: [],
    },
    compositionLayoutOverrides: [],
  };

  if (typeof obj.seed !== "undefined") {
    resolved.seed = asNumber(obj.seed, `${source}.seed`);
  }

  if (typeof obj.facade_overrides !== "undefined") {
    if (!Array.isArray(obj.facade_overrides)) {
      failParse(`${source}.facade_overrides`, "expected array");
    }

    resolved.facadeOverrides = obj.facade_overrides.map((rawOverride, index) => {
      const override = asObject(rawOverride, `${source}.facade_overrides[${index}]`);
      const zoneId = asString(override.zoneId, `${source}.facade_overrides[${index}].zoneId`);
      const face = asString(override.face, `${source}.facade_overrides[${index}].face`);
      if (face !== "north" && face !== "south" && face !== "east" && face !== "west") {
        failParse(`${source}.facade_overrides[${index}].face`, "expected 'north', 'south', 'east', or 'west'");
      }
      const preset = asString(override.preset, `${source}.facade_overrides[${index}].preset`);
      if (
        preset !== "merchant_rhythm"
        && preset !== "merchant_hero_stack"
        && preset !== "residential_quiet"
        && preset !== "residential_balcony_stack"
        && preset !== "spawn_courtyard_landmark"
        && preset !== "spawn_gate_brick_backdrop"
        && preset !== "service_blank"
      ) {
        failParse(
          `${source}.facade_overrides[${index}].preset`,
          "expected known facade preset",
        );
      }

      return {
        zoneId,
        face,
        preset,
      };
    });
  }

  if (typeof obj.module_registry !== "undefined") {
    const registry = asObject(obj.module_registry, `${source}.module_registry`);

    if (typeof registry.window_modules !== "undefined") {
      if (!Array.isArray(registry.window_modules)) {
        failParse(`${source}.module_registry.window_modules`, "expected array");
      }
      resolved.moduleRegistry.windowModules = registry.window_modules.map((rawModule, index) => {
        const module = asObject(rawModule, `${source}.module_registry.window_modules[${index}]`);
        const headShape = asString(
          module.headShape,
          `${source}.module_registry.window_modules[${index}].headShape`,
        );
        if (headShape !== "pointed_arch") {
          failParse(
            `${source}.module_registry.window_modules[${index}].headShape`,
            "expected 'pointed_arch'",
          );
        }
        const glassStyle = asString(
          module.glassStyle,
          `${source}.module_registry.window_modules[${index}].glassStyle`,
        );
        if (glassStyle !== "stained_glass_bright" && glassStyle !== "stained_glass_dim") {
          failParse(
            `${source}.module_registry.window_modules[${index}].glassStyle`,
            "expected supported window glass style",
          );
        }
        return {
          id: asString(module.id, `${source}.module_registry.window_modules[${index}].id`),
          headShape: "pointed_arch",
          glassStyle,
          apertureWidthM: asPositiveNumber(
            module.apertureWidthM,
            `${source}.module_registry.window_modules[${index}].apertureWidthM`,
          ),
          apertureHeightM: asPositiveNumber(
            module.apertureHeightM,
            `${source}.module_registry.window_modules[${index}].apertureHeightM`,
          ),
          frameWidthM: asPositiveNumber(
            module.frameWidthM,
            `${source}.module_registry.window_modules[${index}].frameWidthM`,
          ),
          frameHeightM: asPositiveNumber(
            module.frameHeightM,
            `${source}.module_registry.window_modules[${index}].frameHeightM`,
          ),
          frameDepthM: asPositiveNumber(
            module.frameDepthM,
            `${source}.module_registry.window_modules[${index}].frameDepthM`,
          ),
          voidInsetM: asNumber(
            module.voidInsetM,
            `${source}.module_registry.window_modules[${index}].voidInsetM`,
          ),
          glassInsetM: asNumber(
            module.glassInsetM,
            `${source}.module_registry.window_modules[${index}].glassInsetM`,
          ),
          sillWidthM: asPositiveNumber(
            module.sillWidthM,
            `${source}.module_registry.window_modules[${index}].sillWidthM`,
          ),
          sillHeightM: asPositiveNumber(
            module.sillHeightM,
            `${source}.module_registry.window_modules[${index}].sillHeightM`,
          ),
          sillDepthM: asPositiveNumber(
            module.sillDepthM,
            `${source}.module_registry.window_modules[${index}].sillDepthM`,
          ),
          apronWidthM: asPositiveNumber(
            module.apronWidthM,
            `${source}.module_registry.window_modules[${index}].apronWidthM`,
          ),
          apronHeightM: asPositiveNumber(
            module.apronHeightM,
            `${source}.module_registry.window_modules[${index}].apronHeightM`,
          ),
          apronDepthM: asPositiveNumber(
            module.apronDepthM,
            `${source}.module_registry.window_modules[${index}].apronDepthM`,
          ),
          apronOffsetBelowSillM: asNumber(
            module.apronOffsetBelowSillM,
            `${source}.module_registry.window_modules[${index}].apronOffsetBelowSillM`,
          ),
        };
      });
    }

    if (typeof registry.door_modules !== "undefined") {
      if (!Array.isArray(registry.door_modules)) {
        failParse(`${source}.module_registry.door_modules`, "expected array");
      }
      resolved.moduleRegistry.doorModules = registry.door_modules.map((rawModule, index) => {
        const module = asObject(rawModule, `${source}.module_registry.door_modules[${index}]`);
        const coverShape = asString(
          module.coverShape,
          `${source}.module_registry.door_modules[${index}].coverShape`,
        );
        if (coverShape !== "arched" && coverShape !== "rect") {
          failParse(
            `${source}.module_registry.door_modules[${index}].coverShape`,
            "expected 'arched' or 'rect'",
          );
        }
        return {
          id: asString(module.id, `${source}.module_registry.door_modules[${index}].id`),
          modelId: asString(module.modelId, `${source}.module_registry.door_modules[${index}].modelId`),
          coverShape,
          doorWidthM: asPositiveNumber(
            module.doorWidthM,
            `${source}.module_registry.door_modules[${index}].doorWidthM`,
          ),
          doorHeightM: asPositiveNumber(
            module.doorHeightM,
            `${source}.module_registry.door_modules[${index}].doorHeightM`,
          ),
          coverWidthM: asPositiveNumber(
            module.coverWidthM,
            `${source}.module_registry.door_modules[${index}].coverWidthM`,
          ),
          coverHeightM: asPositiveNumber(
            module.coverHeightM,
            `${source}.module_registry.door_modules[${index}].coverHeightM`,
          ),
          coverCenterYOffsetM: asNumber(
            module.coverCenterYOffsetM,
            `${source}.module_registry.door_modules[${index}].coverCenterYOffsetM`,
          ),
          trimThicknessM: asPositiveNumber(
            module.trimThicknessM,
            `${source}.module_registry.door_modules[${index}].trimThicknessM`,
          ),
          revealWidthM: asPositiveNumber(
            module.revealWidthM,
            `${source}.module_registry.door_modules[${index}].revealWidthM`,
          ),
          surroundDepthM: asPositiveNumber(
            module.surroundDepthM,
            `${source}.module_registry.door_modules[${index}].surroundDepthM`,
          ),
          voidInsetM: asNumber(
            module.voidInsetM,
            `${source}.module_registry.door_modules[${index}].voidInsetM`,
          ),
          voidDepthM: asPositiveNumber(
            module.voidDepthM,
            `${source}.module_registry.door_modules[${index}].voidDepthM`,
          ),
        };
      });
    }

    if (typeof registry.hero_bay_modules !== "undefined") {
      if (!Array.isArray(registry.hero_bay_modules)) {
        failParse(`${source}.module_registry.hero_bay_modules`, "expected array");
      }
      resolved.moduleRegistry.heroBayModules = registry.hero_bay_modules.map((rawModule, index) => {
        const module = asObject(rawModule, `${source}.module_registry.hero_bay_modules[${index}]`);
        const glassStyle = asString(
          module.glassStyle,
          `${source}.module_registry.hero_bay_modules[${index}].glassStyle`,
        );
        if (glassStyle !== "stained_glass_bright" && glassStyle !== "stained_glass_dim") {
          failParse(
            `${source}.module_registry.hero_bay_modules[${index}].glassStyle`,
            "expected supported window glass style",
          );
        }
        const corbelCount = asPositiveNumber(
          module.corbelCount,
          `${source}.module_registry.hero_bay_modules[${index}].corbelCount`,
        );
        if (!Number.isInteger(corbelCount)) {
          failParse(
            `${source}.module_registry.hero_bay_modules[${index}].corbelCount`,
            "expected integer > 0",
          );
        }
        const pedimentLayerCount = asPositiveNumber(
          module.pedimentLayerCount,
          `${source}.module_registry.hero_bay_modules[${index}].pedimentLayerCount`,
        );
        if (!Number.isInteger(pedimentLayerCount)) {
          failParse(
            `${source}.module_registry.hero_bay_modules[${index}].pedimentLayerCount`,
            "expected integer > 0",
          );
        }
        return {
          id: asString(module.id, `${source}.module_registry.hero_bay_modules[${index}].id`),
          glassStyle,
          openingWidthM: asPositiveNumber(
            module.openingWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].openingWidthM`,
          ),
          openingHeightM: asPositiveNumber(
            module.openingHeightM,
            `${source}.module_registry.hero_bay_modules[${index}].openingHeightM`,
          ),
          openingSillY: asNumber(
            module.openingSillY,
            `${source}.module_registry.hero_bay_modules[${index}].openingSillY`,
          ),
          surroundWidthM: asPositiveNumber(
            module.surroundWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].surroundWidthM`,
          ),
          surroundHeightM: asPositiveNumber(
            module.surroundHeightM,
            `${source}.module_registry.hero_bay_modules[${index}].surroundHeightM`,
          ),
          surroundBottomY: asNumber(
            module.surroundBottomY,
            `${source}.module_registry.hero_bay_modules[${index}].surroundBottomY`,
          ),
          frameDepthM: asPositiveNumber(
            module.frameDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].frameDepthM`,
          ),
          voidInsetM: asNumber(
            module.voidInsetM,
            `${source}.module_registry.hero_bay_modules[${index}].voidInsetM`,
          ),
          glassInsetM: asNumber(
            module.glassInsetM,
            `${source}.module_registry.hero_bay_modules[${index}].glassInsetM`,
          ),
          pilasterWidthM: asPositiveNumber(
            module.pilasterWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].pilasterWidthM`,
          ),
          pilasterDepthM: asPositiveNumber(
            module.pilasterDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].pilasterDepthM`,
          ),
          pilasterHeightM: asPositiveNumber(
            module.pilasterHeightM,
            `${source}.module_registry.hero_bay_modules[${index}].pilasterHeightM`,
          ),
          pilasterBottomY: asNumber(
            module.pilasterBottomY,
            `${source}.module_registry.hero_bay_modules[${index}].pilasterBottomY`,
          ),
          entablatureWidthM: asPositiveNumber(
            module.entablatureWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureWidthM`,
          ),
          entablatureDepthM: asPositiveNumber(
            module.entablatureDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureDepthM`,
          ),
          entablatureThicknessM: asPositiveNumber(
            module.entablatureThicknessM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureThicknessM`,
          ),
          entablatureCenterY: asNumber(
            module.entablatureCenterY,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureCenterY`,
          ),
          entablatureCapWidthM: asPositiveNumber(
            module.entablatureCapWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureCapWidthM`,
          ),
          entablatureCapDepthM: asPositiveNumber(
            module.entablatureCapDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureCapDepthM`,
          ),
          entablatureCapThicknessM: asPositiveNumber(
            module.entablatureCapThicknessM,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureCapThicknessM`,
          ),
          entablatureCapCenterY: asNumber(
            module.entablatureCapCenterY,
            `${source}.module_registry.hero_bay_modules[${index}].entablatureCapCenterY`,
          ),
          corbelWidthM: asPositiveNumber(
            module.corbelWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].corbelWidthM`,
          ),
          corbelDepthM: asPositiveNumber(
            module.corbelDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].corbelDepthM`,
          ),
          corbelHeightM: asPositiveNumber(
            module.corbelHeightM,
            `${source}.module_registry.hero_bay_modules[${index}].corbelHeightM`,
          ),
          corbelCenterY: asNumber(
            module.corbelCenterY,
            `${source}.module_registry.hero_bay_modules[${index}].corbelCenterY`,
          ),
          corbelCount,
          corbelSpreadM: asPositiveNumber(
            module.corbelSpreadM,
            `${source}.module_registry.hero_bay_modules[${index}].corbelSpreadM`,
          ),
          pedimentBaseWidthM: asPositiveNumber(
            module.pedimentBaseWidthM,
            `${source}.module_registry.hero_bay_modules[${index}].pedimentBaseWidthM`,
          ),
          pedimentDepthM: asPositiveNumber(
            module.pedimentDepthM,
            `${source}.module_registry.hero_bay_modules[${index}].pedimentDepthM`,
          ),
          pedimentLayerHeightM: asPositiveNumber(
            module.pedimentLayerHeightM,
            `${source}.module_registry.hero_bay_modules[${index}].pedimentLayerHeightM`,
          ),
          pedimentLayerCount,
          pedimentWidthStepM: asPositiveNumber(
            module.pedimentWidthStepM,
            `${source}.module_registry.hero_bay_modules[${index}].pedimentWidthStepM`,
          ),
          pedimentBottomY: asNumber(
            module.pedimentBottomY,
            `${source}.module_registry.hero_bay_modules[${index}].pedimentBottomY`,
          ),
        };
      });
    }
  }

  if (typeof obj.window_layout_overrides !== "undefined") {
    if (!Array.isArray(obj.window_layout_overrides)) {
      failParse(`${source}.window_layout_overrides`, "expected array");
    }

    resolved.windowLayoutOverrides = obj.window_layout_overrides.map((rawOverride, index) => {
      const override = asObject(rawOverride, `${source}.window_layout_overrides[${index}]`);
      const zoneId = asString(override.zoneId, `${source}.window_layout_overrides[${index}].zoneId`);
      const face = asString(override.face, `${source}.window_layout_overrides[${index}].face`);
      if (face !== "north" && face !== "south" && face !== "east" && face !== "west") {
        failParse(`${source}.window_layout_overrides[${index}].face`, "expected 'north', 'south', 'east', or 'west'");
      }
      const segmentOrdinal = asPositiveNumber(
        override.segmentOrdinal,
        `${source}.window_layout_overrides[${index}].segmentOrdinal`,
      );
      if (!Number.isInteger(segmentOrdinal)) {
        failParse(`${source}.window_layout_overrides[${index}].segmentOrdinal`, "expected integer > 0");
      }
      if (!Array.isArray(override.windows) || override.windows.length === 0) {
        failParse(`${source}.window_layout_overrides[${index}].windows`, "expected non-empty array");
      }

      const windows = override.windows.map((rawWindow, windowIndex) => {
        const window = asObject(rawWindow, `${source}.window_layout_overrides[${index}].windows[${windowIndex}]`);
        const headShapeRaw = asString(
          window.headShape,
          `${source}.window_layout_overrides[${index}].windows[${windowIndex}].headShape`,
        );
        if (headShapeRaw !== "rect" && headShapeRaw !== "pointed_arch") {
          failParse(
            `${source}.window_layout_overrides[${index}].windows[${windowIndex}].headShape`,
            "expected 'rect' or 'pointed_arch'",
          );
        }
        const glassStyleRaw = asString(
          window.glassStyle,
          `${source}.window_layout_overrides[${index}].windows[${windowIndex}].glassStyle`,
        );
        if (glassStyleRaw !== "stained_glass_bright" && glassStyleRaw !== "stained_glass_dim") {
          failParse(
            `${source}.window_layout_overrides[${index}].windows[${windowIndex}].glassStyle`,
            "expected supported window glass style",
          );
        }
        const headShape: WindowHeadShape = headShapeRaw;
        const glassStyle: WindowGlassStyle = glassStyleRaw;

        return {
          centerS: asNumber(window.centerS, `${source}.window_layout_overrides[${index}].windows[${windowIndex}].centerS`),
          sillY: asNumber(window.sillY, `${source}.window_layout_overrides[${index}].windows[${windowIndex}].sillY`),
          width: asPositiveNumber(window.width, `${source}.window_layout_overrides[${index}].windows[${windowIndex}].width`),
          height: asPositiveNumber(window.height, `${source}.window_layout_overrides[${index}].windows[${windowIndex}].height`),
          headShape,
          glassStyle,
        };
      });

      return {
        zoneId,
        face,
        segmentOrdinal,
        windows,
      };
    });
  }

  if (typeof obj.balcony_layout_overrides !== "undefined") {
    if (!Array.isArray(obj.balcony_layout_overrides)) {
      failParse(`${source}.balcony_layout_overrides`, "expected array");
    }

    resolved.balconyLayoutOverrides = obj.balcony_layout_overrides.map((rawOverride, index) => {
      const override = asObject(rawOverride, `${source}.balcony_layout_overrides[${index}]`);
      const zoneId = asString(override.zoneId, `${source}.balcony_layout_overrides[${index}].zoneId`);
      const face = asString(override.face, `${source}.balcony_layout_overrides[${index}].face`);
      if (face !== "north" && face !== "south" && face !== "east" && face !== "west") {
        failParse(`${source}.balcony_layout_overrides[${index}].face`, "expected 'north', 'south', 'east', or 'west'");
      }
      const segmentOrdinal = asPositiveNumber(
        override.segmentOrdinal,
        `${source}.balcony_layout_overrides[${index}].segmentOrdinal`,
      );
      if (!Number.isInteger(segmentOrdinal)) {
        failParse(`${source}.balcony_layout_overrides[${index}].segmentOrdinal`, "expected integer > 0");
      }
      if (!Array.isArray(override.balconies) || override.balconies.length === 0) {
        failParse(`${source}.balcony_layout_overrides[${index}].balconies`, "expected non-empty array");
      }

      const balconies = override.balconies.map((rawBalcony, balconyIndex) => {
        const balcony = asObject(rawBalcony, `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}]`);
        const storyIndex = asNumber(
          balcony.storyIndex,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].storyIndex`,
        );
        if (!Number.isInteger(storyIndex) || storyIndex < 1) {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].storyIndex`,
            "expected integer >= 1",
          );
        }
        const spanBays = asPositiveNumber(
          balcony.spanBays,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].spanBays`,
        );
        if (!Number.isInteger(spanBays)) {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].spanBays`,
            "expected integer > 0",
          );
        }
        const opening = asObject(
          balcony.opening,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening`,
        );
        const headShape = asString(
          opening.headShape,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.headShape`,
        );
        if (headShape !== "pointed_arch") {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.headShape`,
            "expected 'pointed_arch'",
          );
        }
        const balconyHeadShape: "pointed_arch" = "pointed_arch";
        const glassStyleRaw = asString(
          opening.glassStyle,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.glassStyle`,
        );
        if (glassStyleRaw !== "stained_glass_bright" && glassStyleRaw !== "stained_glass_dim") {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.glassStyle`,
            "expected supported window glass style",
          );
        }
        const glassStyle: WindowGlassStyle = glassStyleRaw;

        const roofBreakHeightM = asNumber(
          balcony.roofBreakHeightM,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakHeightM`,
        );
        if (roofBreakHeightM < 0) {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakHeightM`,
            "expected number >= 0",
          );
        }
        const roofBreakCapHeightM = asNumber(
          balcony.roofBreakCapHeightM,
          `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakCapHeightM`,
        );
        if (roofBreakCapHeightM < 0) {
          failParse(
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakCapHeightM`,
            "expected number >= 0",
          );
        }

        return {
          centerS: asNumber(
            balcony.centerS,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].centerS`,
          ),
          storyIndex,
          spanBays,
          depthM: asPositiveNumber(
            balcony.depthM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].depthM`,
          ),
          parapetHeightM: asPositiveNumber(
            balcony.parapetHeightM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].parapetHeightM`,
          ),
          openingSurroundWidthM: asPositiveNumber(
            balcony.openingSurroundWidthM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].openingSurroundWidthM`,
          ),
          openingSurroundHeightM: asPositiveNumber(
            balcony.openingSurroundHeightM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].openingSurroundHeightM`,
          ),
          openingSurroundBottomOffsetM: asNumber(
            balcony.openingSurroundBottomOffsetM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].openingSurroundBottomOffsetM`,
          ),
          roofBreakWidthM: asPositiveNumber(
            balcony.roofBreakWidthM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakWidthM`,
          ),
          roofBreakBottomOffsetM: asNumber(
            balcony.roofBreakBottomOffsetM,
            `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].roofBreakBottomOffsetM`,
          ),
          roofBreakHeightM,
          roofBreakCapHeightM,
          opening: {
            width: asPositiveNumber(
              opening.width,
              `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.width`,
            ),
            height: asPositiveNumber(
              opening.height,
              `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.height`,
            ),
            sillOffsetM: asNumber(
              opening.sillOffsetM,
              `${source}.balcony_layout_overrides[${index}].balconies[${balconyIndex}].opening.sillOffsetM`,
            ),
            headShape: balconyHeadShape,
            glassStyle,
          },
        };
      });

      return {
        zoneId,
        face,
        segmentOrdinal,
        balconies,
      };
    });
  }

  if (typeof obj.door_layout_overrides !== "undefined") {
    if (!Array.isArray(obj.door_layout_overrides)) {
      failParse(`${source}.door_layout_overrides`, "expected array");
    }

    resolved.doorLayoutOverrides = obj.door_layout_overrides.map((rawOverride, index) => {
      const override = asObject(rawOverride, `${source}.door_layout_overrides[${index}]`);
      const zoneId = asString(override.zoneId, `${source}.door_layout_overrides[${index}].zoneId`);
      const face = asString(override.face, `${source}.door_layout_overrides[${index}].face`);
      if (face !== "north" && face !== "south" && face !== "east" && face !== "west") {
        failParse(`${source}.door_layout_overrides[${index}].face`, "expected 'north', 'south', 'east', or 'west'");
      }
      const segmentOrdinal = asPositiveNumber(
        override.segmentOrdinal,
        `${source}.door_layout_overrides[${index}].segmentOrdinal`,
      );
      if (!Number.isInteger(segmentOrdinal)) {
        failParse(`${source}.door_layout_overrides[${index}].segmentOrdinal`, "expected integer > 0");
      }
      if (!Array.isArray(override.doors) || override.doors.length === 0) {
        failParse(`${source}.door_layout_overrides[${index}].doors`, "expected non-empty array");
      }

      const doors = override.doors.map((rawDoor, doorIndex) => {
        const door = asObject(rawDoor, `${source}.door_layout_overrides[${index}].doors[${doorIndex}]`);
        return {
          centerS: asNumber(door.centerS, `${source}.door_layout_overrides[${index}].doors[${doorIndex}].centerS`),
        };
      });

      let styleSource: RuntimeDoorStyleSource | undefined;
      if (typeof override.styleSource !== "undefined") {
        const sourceRef = asObject(override.styleSource, `${source}.door_layout_overrides[${index}].styleSource`);
        const sourceFace = asString(
          sourceRef.face,
          `${source}.door_layout_overrides[${index}].styleSource.face`,
        );
        if (sourceFace !== "north" && sourceFace !== "south" && sourceFace !== "east" && sourceFace !== "west") {
          failParse(
            `${source}.door_layout_overrides[${index}].styleSource.face`,
            "expected 'north', 'south', 'east', or 'west'",
          );
        }
        const sourceSegmentOrdinal = asPositiveNumber(
          sourceRef.segmentOrdinal,
          `${source}.door_layout_overrides[${index}].styleSource.segmentOrdinal`,
        );
        if (!Number.isInteger(sourceSegmentOrdinal)) {
          failParse(
            `${source}.door_layout_overrides[${index}].styleSource.segmentOrdinal`,
            "expected integer > 0",
          );
        }
        styleSource = {
          zoneId: asString(
            sourceRef.zoneId,
            `${source}.door_layout_overrides[${index}].styleSource.zoneId`,
          ),
          face: sourceFace,
          segmentOrdinal: sourceSegmentOrdinal,
        };
      }

      return {
        zoneId,
        face,
        segmentOrdinal,
        doors,
        ...(styleSource ? { styleSource } : {}),
      };
    });
  }

  if (typeof obj.composition_layout_overrides !== "undefined") {
    if (!Array.isArray(obj.composition_layout_overrides)) {
      failParse(`${source}.composition_layout_overrides`, "expected array");
    }

    const windowModuleIds = new Set(resolved.moduleRegistry.windowModules.map((module) => module.id));
    const doorModuleIds = new Set(resolved.moduleRegistry.doorModules.map((module) => module.id));
    const heroBayModuleIds = new Set(resolved.moduleRegistry.heroBayModules.map((module) => module.id));

    resolved.compositionLayoutOverrides = obj.composition_layout_overrides.map((rawOverride, index) => {
      const override = asObject(rawOverride, `${source}.composition_layout_overrides[${index}]`);
      const zoneId = asString(override.zoneId, `${source}.composition_layout_overrides[${index}].zoneId`);
      const face = asString(override.face, `${source}.composition_layout_overrides[${index}].face`);
      if (face !== "north" && face !== "south" && face !== "east" && face !== "west") {
        failParse(`${source}.composition_layout_overrides[${index}].face`, "expected 'north', 'south', 'east', or 'west'");
      }
      const segmentOrdinal = asPositiveNumber(
        override.segmentOrdinal,
        `${source}.composition_layout_overrides[${index}].segmentOrdinal`,
      );
      if (!Number.isInteger(segmentOrdinal)) {
        failParse(`${source}.composition_layout_overrides[${index}].segmentOrdinal`, "expected integer > 0");
      }
      const kind = asString(override.kind, `${source}.composition_layout_overrides[${index}].kind`);
      if (kind !== "spawn_b_front_courtyard" && kind !== "spawn_b_side_courtyard") {
        failParse(
          `${source}.composition_layout_overrides[${index}].kind`,
          "expected supported composition layout kind",
        );
      }
      const windowModuleId = asString(
        override.windowModuleId,
        `${source}.composition_layout_overrides[${index}].windowModuleId`,
      );
      if (!windowModuleIds.has(windowModuleId)) {
        failParse(
          `${source}.composition_layout_overrides[${index}].windowModuleId`,
          `unknown window module '${windowModuleId}'`,
        );
      }
      const doorModuleId = asString(
        override.doorModuleId,
        `${source}.composition_layout_overrides[${index}].doorModuleId`,
      );
      if (!doorModuleIds.has(doorModuleId)) {
        failParse(
          `${source}.composition_layout_overrides[${index}].doorModuleId`,
          `unknown door module '${doorModuleId}'`,
        );
      }
      const heroBayModuleId = typeof override.heroBayModuleId === "undefined"
        ? undefined
        : asString(
            override.heroBayModuleId,
            `${source}.composition_layout_overrides[${index}].heroBayModuleId`,
          );
      if (kind === "spawn_b_front_courtyard" && !heroBayModuleId) {
        failParse(
          `${source}.composition_layout_overrides[${index}].heroBayModuleId`,
          "front Spawn B compositions require a hero bay module",
        );
      }
      if (heroBayModuleId && !heroBayModuleIds.has(heroBayModuleId)) {
        failParse(
          `${source}.composition_layout_overrides[${index}].heroBayModuleId`,
          `unknown hero bay module '${heroBayModuleId}'`,
        );
      }
      return {
        zoneId,
        face,
        segmentOrdinal,
        kind,
        windowModuleId,
        doorModuleId,
        ...(heroBayModuleId ? { heroBayModuleId } : {}),
        lowerWindowSillY: asNumber(
          override.lowerWindowSillY,
          `${source}.composition_layout_overrides[${index}].lowerWindowSillY`,
        ),
        upperWindowSillY: asNumber(
          override.upperWindowSillY,
          `${source}.composition_layout_overrides[${index}].upperWindowSillY`,
        ),
      };
    });
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
