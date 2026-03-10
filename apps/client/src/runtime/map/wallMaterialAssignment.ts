export const DEFAULT_WALL_MATERIAL_ID = "ph_whitewashed_brick";

export type FacadeFamily = "merchant" | "residential" | "service" | "spawn" | "connector" | "side_hall" | "cut";
export type FacadeTrimTier = "restrained" | "accented" | "hero";
export type BalconyStyle = "none" | "merchant_ledge" | "residential_parapet" | "hero_cantilever";
export type FacadeFace = "north" | "south" | "east" | "west";

export type FacadeMaterialSlots = {
  wall: string;
  trimHeavy: string;
  trimLight: string;
  balcony: string | null;
};

export type WallMaterialCombo = {
  wall: string;
  trimHeavy: string;
  trimLight: string;
};

export type FacadeSegmentFrame = {
  centerX: number;
  centerZ: number;
  inwardX: number;
  inwardZ: number;
};

type ZoneRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ZoneLike = {
  id: string;
  type: string;
  rect: ZoneRect;
} | null;

export type ResolvedFacadeStyle = {
  family: FacadeFamily;
  trimTier: FacadeTrimTier;
  balconyStyle: BalconyStyle;
  materials: FacadeMaterialSlots;
};

const SLOT_MERCHANT_WARM: FacadeMaterialSlots = {
  wall: "ph_lime_plaster_sun",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_lime_soft",
  balcony: "tm_balcony_wood_dark",
};

const SLOT_MERCHANT_HERO: FacadeMaterialSlots = {
  wall: "ph_lime_plaster_sun",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "tm_balcony_wood_dark",
};

const SLOT_RESIDENTIAL_CALM: FacadeMaterialSlots = {
  wall: "ph_aged_plaster_ochre",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_RESIDENTIAL_DUSTY: FacadeMaterialSlots = {
  wall: "ph_whitewashed_brick_dusty",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SERVICE_MAIN: FacadeMaterialSlots = {
  wall: "ph_beige_wall_002",
  trimHeavy: "ph_stone_trim_white",
  trimLight: "ph_band_beige_002",
  balcony: null,
};

const SLOT_SPAWN: FacadeMaterialSlots = {
  wall: "ph_whitewashed_brick_warm",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SPAWN_SIDE: FacadeMaterialSlots = {
  wall: "ph_aged_plaster_ochre",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: "ph_trim_sanded_01",
};

const SLOT_SPAWN_B_BRICK: FacadeMaterialSlots = {
  wall: "ph_brick_4_desert",
  trimHeavy: "ph_stone_trim_white",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_SIDE_HALL: FacadeMaterialSlots = {
  wall: "ph_whitewashed_brick",
  trimHeavy: "ph_sandstone_blocks_05",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_CONNECTOR: FacadeMaterialSlots = {
  wall: "ph_whitewashed_brick_cool",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_plastered",
  balcony: null,
};

const SLOT_CUT: FacadeMaterialSlots = {
  wall: "ph_beige_wall_002",
  trimHeavy: "ph_trim_sanded_01",
  trimLight: "ph_band_beige_001",
  balcony: null,
};

const LEGACY_DEFAULT_STYLE: ResolvedFacadeStyle = {
  family: "side_hall",
  trimTier: "restrained",
  balconyStyle: "none",
  materials: SLOT_SIDE_HALL,
};

function isVerticalFacade(frame: FacadeSegmentFrame): boolean {
  return Math.abs(frame.inwardX) > Math.abs(frame.inwardZ);
}

export function resolveFacadeFaceForSegment(zone: ZoneLike, frame: FacadeSegmentFrame): FacadeFace {
  const { x: zoneCenterX, z: zoneCenterZ } = getZoneCenter(zone);
  if (isVerticalFacade(frame)) {
    return frame.centerX < zoneCenterX ? "west" : "east";
  }
  return frame.centerZ < zoneCenterZ ? "south" : "north";
}

function getZoneCenter(zone: ZoneLike): { x: number; z: number } {
  if (!zone) {
    return { x: 0, z: 0 };
  }
  return {
    x: zone.rect.x + zone.rect.w * 0.5,
    z: zone.rect.y + zone.rect.h * 0.5,
  };
}

function resolveMainLaneStyle(zone: NonNullable<ZoneLike>, frame: FacadeSegmentFrame): ResolvedFacadeStyle {
  const { z: zoneCenterZ } = getZoneCenter(zone);
  const face = resolveFacadeFaceForSegment(zone, frame);
  const verticalFacade = face === "west" || face === "east";

  if (!verticalFacade) {
    if (frame.centerZ < zoneCenterZ) {
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

export function resolveFacadeStyleForSegment(zone: ZoneLike, frame: FacadeSegmentFrame): ResolvedFacadeStyle {
  if (!zone) {
    return LEGACY_DEFAULT_STYLE;
  }

  if (zone.type === "main_lane_segment") {
    return resolveMainLaneStyle(zone, frame);
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

export function resolveWallComboForZone(zoneId: string | null): WallMaterialCombo | null {
  if (!zoneId) return null;

  const style =
    zoneId === "SPAWN_A_COURTYARD" || zoneId === "SPAWN_B_GATE_PLAZA"
      ? {
          family: "spawn",
          trimTier: "hero",
          balconyStyle: "residential_parapet",
          materials: SLOT_SPAWN,
        }
      : zoneId.startsWith("CONN_")
        ? {
            family: "connector",
            trimTier: "restrained",
            balconyStyle: "none",
            materials: SLOT_CONNECTOR,
          }
        : zoneId.startsWith("CUT_")
          ? {
              family: "cut",
              trimTier: "restrained",
              balconyStyle: "none",
              materials: SLOT_CUT,
            }
          : zoneId.startsWith("SH_")
            ? LEGACY_DEFAULT_STYLE
            : {
                family: "merchant",
                trimTier: "accented",
                balconyStyle: "merchant_ledge",
                materials: SLOT_MERCHANT_WARM,
              };

  return {
    wall: style.materials.wall,
    trimHeavy: style.materials.trimHeavy,
    trimLight: style.materials.trimLight,
  };
}

export function resolveWallMaterialIdForZone(zoneId: string | null): string {
  if (!zoneId) return DEFAULT_WALL_MATERIAL_ID;
  return resolveWallComboForZone(zoneId)?.wall ?? DEFAULT_WALL_MATERIAL_ID;
}
