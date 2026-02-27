export const DEFAULT_WALL_MATERIAL_ID = "ph_sandstone_blocks_04";

export const WALL_MATERIAL_BY_ZONE_ID: Record<string, string> = {
  BZ_M1: "ph_sandstone_blocks_04",
  BZ_M2_JOG: "ph_exterior_wall_cladding",
  BZ_M3: "ph_sandstone_blocks_05",
  SPAWN_A_COURTYARD: "ph_sandstone_blocks_05",
  SPAWN_B_GATE_PLAZA: "ph_sandstone_blocks_05",
  SH_E: "ph_sandstone_blocks_04",
  SH_W: "ph_sandstone_blocks_04",
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
