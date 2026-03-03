import type { FloorMaterialId } from "./buildPbrFloors";

export const DEFAULT_FLOOR_MATERIAL_ID: FloorMaterialId = "cobblestone_color";

export const FLOOR_MATERIAL_BY_ZONE_ID: Record<string, FloorMaterialId> = {
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

export function resolveFloorMaterialIdForZone(zoneId: string | null): FloorMaterialId {
  if (!zoneId) return DEFAULT_FLOOR_MATERIAL_ID;
  return FLOOR_MATERIAL_BY_ZONE_ID[zoneId] ?? DEFAULT_FLOOR_MATERIAL_ID;
}
