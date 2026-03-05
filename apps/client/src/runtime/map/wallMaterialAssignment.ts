export const DEFAULT_WALL_MATERIAL_ID = "ph_sandstone_blocks_04";

export type WallMaterialCombo = {
  wall: string;
  trimHeavy: string;
  trimLight: string;
};

const COMBO_1: WallMaterialCombo = {
  wall: "ph_beige_wall_001",
  trimHeavy: "ph_stone_trim_sandstone",
  trimLight: "ph_band_beige_001",
};

const COMBO_2: WallMaterialCombo = {
  wall: "ph_beige_wall_002",
  trimHeavy: "ph_stone_trim_white",
  trimLight: "ph_band_beige_002",
};

const COMBO_3: WallMaterialCombo = {
  wall: "ph_plastered_wall",
  trimHeavy: "ph_stone_trim_sandstone",
  trimLight: "ph_band_plastered",
};

export const WALL_COMBO_BY_ZONE_ID: Record<string, WallMaterialCombo> = {
  BZ_M1: COMBO_1,
  BZ_M2_JOG: COMBO_2,
  BZ_M3: COMBO_3,
};

export function resolveWallComboForZone(zoneId: string | null): WallMaterialCombo | null {
  if (!zoneId) return null;
  return WALL_COMBO_BY_ZONE_ID[zoneId] ?? null;
}

export const WALL_MATERIAL_BY_ZONE_ID: Record<string, string> = {
  BZ_M1: "ph_beige_wall_001",
  BZ_M2_JOG: "ph_beige_wall_002",
  BZ_M3: "ph_plastered_wall",
  SPAWN_A_COURTYARD: "ph_sandstone_blocks_05",
  SPAWN_B_GATE_PLAZA: "ph_sandstone_blocks_05",
  SH_E: "ph_whitewashed_brick",
  SH_W: "ph_whitewashed_brick",
  CONN_NE: "ph_sandstone_blocks_04",
  CONN_NW: "ph_sandstone_blocks_04",
  CONN_SE: "ph_sandstone_blocks_04",
  CONN_SW: "ph_sandstone_blocks_04",
  CUT_E_MID: "ph_worn_brick_wall",
  CUT_W_MID: "ph_worn_brick_wall",
  CUT_E_NORTH: "ph_whitewashed_brick",
  CUT_W_NORTH: "ph_whitewashed_brick",
};

export function resolveWallMaterialIdForZone(zoneId: string | null): string {
  if (!zoneId) return DEFAULT_WALL_MATERIAL_ID;
  return WALL_MATERIAL_BY_ZONE_ID[zoneId] ?? DEFAULT_WALL_MATERIAL_ID;
}
