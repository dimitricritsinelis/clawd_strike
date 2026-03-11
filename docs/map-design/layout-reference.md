# Bazaar Map Layout Reference Catalog

Generated from `docs/map-design/specs/map_spec.json` with `pnpm --filter @clawd-strike/client gen:layout-reference`. This Markdown and its SVG are generated reference artifacts; the authoritative source stays in the design packet.

![Bazaar map layout reference](./layout-reference.svg)

## ID Legend

### Areas
| ID | Code | Label | Source |
| --- | --- | --- | --- |
| `AREA_SPAWN_A` | `SA` | Spawn A | `SPAWN_A_COURTYARD` |
| `AREA_SPAWN_B` | `SB` | Spawn B | `SPAWN_B_GATE_PLAZA` |
| `AREA_MAIN_HALL_SOUTH` | `MHS` | Main Hall South | `BZ_M1` |
| `AREA_MAIN_HALL_JOG` | `MHJ` | Main Hall Jog | `BZ_M2_JOG` |
| `AREA_MAIN_HALL_NORTH` | `MHN` | Main Hall North | `BZ_M3` |
| `AREA_SIDE_HALL_A` | `SHA` | Side Hall A | `SH_W` |
| `AREA_SIDE_HALL_B` | `SHB` | Side Hall B | `SH_E` |
| `AREA_CONNECTOR_A` | `CNA` | Connector A | `CONN_SW` |
| `AREA_CONNECTOR_B` | `CNB` | Connector B | `CONN_SE` |
| `AREA_CONNECTOR_C` | `CNC` | Connector C | `CONN_NW` |
| `AREA_CONNECTOR_D` | `CND` | Connector D | `CONN_NE` |
| `AREA_MID_CUT_A` | `MCA` | Mid Cut A | `CUT_W_MID` |
| `AREA_MID_CUT_B` | `MCB` | Mid Cut B | `CUT_E_MID` |
| `AREA_NORTH_CUT_A` | `NCA` | North Cut A | `CUT_W_NORTH` |
| `AREA_NORTH_CUT_B` | `NCB` | North Cut B | `CUT_E_NORTH` |
| `AREA_CLEAR_SOUTH` | `CLS` | Main Clear South | `CLEAR_M1` |
| `AREA_CLEAR_JOG` | `CLJ` | Main Clear Jog | `CLEAR_M2` |
| `AREA_CLEAR_NORTH` | `CLN` | Main Clear North | `CLEAR_M3` |
| `AREA_STALL_SOUTH_A` | `SSA` | Stall South A | `STALL_M1_L` |
| `AREA_STALL_SOUTH_B` | `SSB` | Stall South B | `STALL_M1_R` |
| `AREA_STALL_JOG_A` | `SJA` | Stall Jog A | `STALL_M2_L` |
| `AREA_STALL_JOG_B` | `SJB` | Stall Jog B | `STALL_M2_R` |
| `AREA_STALL_NORTH_A` | `SNA` | Stall North A | `STALL_M3_L` |
| `AREA_STALL_NORTH_B` | `SNB` | Stall North B | `STALL_M3_R` |
| `CORNER_A` | `CRA` | Corner A | custom callout |
| `CORNER_B` | `CRB` | Corner B | custom callout |
| `CORNER_C` | `CRC` | Corner C | custom callout |
| `CORNER_D` | `CRD` | Corner D | custom callout |

### Buildings
| ID | Code | Label | Source |
| --- | --- | --- | --- |
| `BLDG_A` | `A` | Building A | `BZ_M1:west` |
| `BLDG_B` | `B` | Building B | `BZ_M1:east` |
| `BLDG_C` | `C` | Building C | `BZ_M2_JOG:west` |
| `BLDG_D` | `D` | Building D | `BZ_M2_JOG:east` |
| `BLDG_E` | `E` | Building E | `BZ_M3:west` |
| `BLDG_F` | `F` | Building F | `BZ_M3:east` |
| `BLDG_G` | `G` | Building G | `SPAWN_A_COURTYARD:north` |
| `BLDG_H` | `H` | Building H | `SPAWN_B_GATE_PLAZA:south` |
| `BLDG_I` | `I` | Building I | `SH_W:west` |
| `BLDG_J` | `J` | Building J | `SH_E:east` |

### Walls
| ID | Code | Label | Source |
| --- | --- | --- | --- |
| `WALL_BLDG_G_FRONT` | `G-F` | Building G Front Wall | `SPAWN_A_COURTYARD:north` |
| `WALL_AREA_SPAWN_A_SOUTH` | `SA-S` | Spawn A South Wall | `SPAWN_A_COURTYARD:south` |
| `WALL_AREA_SPAWN_A_EAST` | `SA-E` | Spawn A East Wall | `SPAWN_A_COURTYARD:east` |
| `WALL_AREA_SPAWN_A_WEST` | `SA-W` | Spawn A West Wall | `SPAWN_A_COURTYARD:west` |
| `WALL_AREA_SPAWN_B_NORTH` | `SB-N` | Spawn B North Wall | `SPAWN_B_GATE_PLAZA:north` |
| `WALL_BLDG_H_FRONT` | `H-F` | Building H Front Wall | `SPAWN_B_GATE_PLAZA:south` |
| `WALL_AREA_SPAWN_B_EAST` | `SB-E` | Spawn B East Wall | `SPAWN_B_GATE_PLAZA:east` |
| `WALL_AREA_SPAWN_B_WEST` | `SB-W` | Spawn B West Wall | `SPAWN_B_GATE_PLAZA:west` |
| `WALL_AREA_MAIN_HALL_SOUTH_NORTH` | `MHS-N` | Main Hall South North Wall | `BZ_M1:north` |
| `WALL_BLDG_B_FRONT` | `B-F` | Building B Front Wall | `BZ_M1:east` |
| `WALL_BLDG_A_FRONT` | `A-F` | Building A Front Wall | `BZ_M1:west` |
| `WALL_AREA_MAIN_HALL_JOG_NORTH` | `MHJ-N` | Main Hall Jog North Wall | `BZ_M2_JOG:north` |
| `WALL_AREA_MAIN_HALL_JOG_SOUTH` | `MHJ-S` | Main Hall Jog South Wall | `BZ_M2_JOG:south` |
| `WALL_BLDG_D_FRONT` | `D-F` | Building D Front Wall | `BZ_M2_JOG:east` |
| `WALL_BLDG_C_FRONT` | `C-F` | Building C Front Wall | `BZ_M2_JOG:west` |
| `WALL_AREA_MAIN_HALL_NORTH_SOUTH` | `MHN-S` | Main Hall North South Wall | `BZ_M3:south` |
| `WALL_BLDG_F_FRONT` | `F-F` | Building F Front Wall | `BZ_M3:east` |
| `WALL_BLDG_E_FRONT` | `E-F` | Building E Front Wall | `BZ_M3:west` |
| `WALL_AREA_SIDE_HALL_A_NORTH` | `SHA-N` | Side Hall A North Wall | `SH_W:north` |
| `WALL_AREA_SIDE_HALL_A_SOUTH` | `SHA-S` | Side Hall A South Wall | `SH_W:south` |
| `WALL_AREA_SIDE_HALL_A_EAST` | `SHA-E` | Side Hall A East Wall | `SH_W:east` |
| `WALL_BLDG_I_FRONT` | `I-F` | Building I Front Wall | `SH_W:west` |
| `WALL_AREA_SIDE_HALL_B_NORTH` | `SHB-N` | Side Hall B North Wall | `SH_E:north` |
| `WALL_AREA_SIDE_HALL_B_SOUTH` | `SHB-S` | Side Hall B South Wall | `SH_E:south` |
| `WALL_BLDG_J_FRONT` | `J-F` | Building J Front Wall | `SH_E:east` |
| `WALL_AREA_SIDE_HALL_B_WEST` | `SHB-W` | Side Hall B West Wall | `SH_E:west` |
| `WALL_AREA_CONNECTOR_A_NORTH` | `CNA-N` | Connector A North Wall | `CONN_SW:north` |
| `WALL_AREA_CONNECTOR_A_SOUTH` | `CNA-S` | Connector A South Wall | `CONN_SW:south` |
| `WALL_AREA_CONNECTOR_A_WEST` | `CNA-W` | Connector A West Wall | `CONN_SW:west` |
| `WALL_AREA_CONNECTOR_B_NORTH` | `CNB-N` | Connector B North Wall | `CONN_SE:north` |
| `WALL_AREA_CONNECTOR_B_SOUTH` | `CNB-S` | Connector B South Wall | `CONN_SE:south` |
| `WALL_AREA_CONNECTOR_B_EAST` | `CNB-E` | Connector B East Wall | `CONN_SE:east` |
| `WALL_AREA_CONNECTOR_C_NORTH` | `CNC-N` | Connector C North Wall | `CONN_NW:north` |
| `WALL_AREA_CONNECTOR_C_SOUTH` | `CNC-S` | Connector C South Wall | `CONN_NW:south` |
| `WALL_AREA_CONNECTOR_C_WEST` | `CNC-W` | Connector C West Wall | `CONN_NW:west` |
| `WALL_AREA_CONNECTOR_D_NORTH` | `CND-N` | Connector D North Wall | `CONN_NE:north` |
| `WALL_AREA_CONNECTOR_D_SOUTH` | `CND-S` | Connector D South Wall | `CONN_NE:south` |
| `WALL_AREA_CONNECTOR_D_EAST` | `CND-E` | Connector D East Wall | `CONN_NE:east` |
| `WALL_AREA_MID_CUT_A_NORTH` | `MCA-N` | Mid Cut A North Wall | `CUT_W_MID:north` |
| `WALL_AREA_MID_CUT_A_SOUTH` | `MCA-S` | Mid Cut A South Wall | `CUT_W_MID:south` |
| `WALL_AREA_MID_CUT_B_NORTH` | `MCB-N` | Mid Cut B North Wall | `CUT_E_MID:north` |
| `WALL_AREA_MID_CUT_B_SOUTH` | `MCB-S` | Mid Cut B South Wall | `CUT_E_MID:south` |
| `WALL_AREA_NORTH_CUT_A_NORTH` | `NCA-N` | North Cut A North Wall | `CUT_W_NORTH:north` |
| `WALL_AREA_NORTH_CUT_A_SOUTH` | `NCA-S` | North Cut A South Wall | `CUT_W_NORTH:south` |
| `WALL_AREA_NORTH_CUT_B_NORTH` | `NCB-N` | North Cut B North Wall | `CUT_E_NORTH:north` |
| `WALL_AREA_NORTH_CUT_B_SOUTH` | `NCB-S` | North Cut B South Wall | `CUT_E_NORTH:south` |

## Areas

### AREA_SPAWN_A — Spawn A

- Source zone: `SPAWN_A_COURTYARD` (`spawn_plaza`)
- Short label: `SA`
- Human label: Spawn A Courtyard
- Bounds: x=14.00-36.00m, y=0.00-14.00m (22.00m x 14.00m)
- Design callouts: `C01` Courtyard Spawn
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_CONNECTOR_A`, `AREA_CONNECTOR_B`, `AREA_CLEAR_SOUTH`, `AREA_STALL_SOUTH_A`, `AREA_STALL_SOUTH_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_BLDG_G_FRONT`, `WALL_AREA_SPAWN_A_SOUTH`, `WALL_AREA_SPAWN_A_EAST`, `WALL_AREA_SPAWN_A_WEST`
- Linked buildings: `BLDG_G`
- Anchors: spawn-cover x2
- Anchor IDs: `PP_SPAWN_A_01`, `PP_SPAWN_A_02`
- Floor surface: PBR floor material `large_sandstone_blocks_01`
- Wall material summary: Walls `ph_whitewashed_brick_warm`, `ph_aged_plaster_ochre` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`.
- Constraints: Spawn safety cover + quick access to all lanes via bazaar center and side connectors.
- Notes: South spawn courtyard and staging area.

### AREA_SPAWN_B — Spawn B

- Source zone: `SPAWN_B_GATE_PLAZA` (`spawn_plaza`)
- Short label: `SB`
- Human label: Spawn B Gate Plaza
- Bounds: x=14.00-36.00m, y=68.00-82.00m (22.00m x 14.00m)
- Design callouts: `C02` Gate Plaza Spawn
- Edge adjacency: `AREA_MAIN_HALL_NORTH`, `AREA_CONNECTOR_C`, `AREA_CONNECTOR_D`, `AREA_CLEAR_NORTH`, `AREA_STALL_NORTH_A`, `AREA_STALL_NORTH_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_SPAWN_B_NORTH`, `WALL_BLDG_H_FRONT`, `WALL_AREA_SPAWN_B_EAST`, `WALL_AREA_SPAWN_B_WEST`
- Linked buildings: `BLDG_H`
- Anchors: spawn-cover x2
- Anchor IDs: `PP_SPAWN_B_01`, `PP_SPAWN_B_02`
- Floor surface: PBR floor material `cobblestone_pavement`
- Wall material summary: Walls `ph_brick_4_desert`, `ph_whitewashed_brick_warm` with heavy trims `ph_stone_trim_white`, `ph_trim_sanded_01` and light trims `ph_band_plastered`, `ph_band_beige_001`.
- Constraints: Spawn safety cover + landmark arch threshold into bazaar.
- Notes: North spawn gate plaza and arch threshold.

### AREA_MAIN_HALL_SOUTH — Main Hall South

- Source zone: `BZ_M1` (`main_lane_segment`)
- Short label: `MHS`
- Human label: Main Hall South — Spice Market
- Bounds: x=20.25-29.75m, y=14.00-32.00m (9.50m x 18.00m)
- Design callouts: `C03` Bazaar South
- Edge adjacency: `AREA_SPAWN_A`, `AREA_MAIN_HALL_JOG`, `AREA_MID_CUT_A`, `AREA_MID_CUT_B`, `AREA_CLEAR_JOG`, `AREA_STALL_JOG_A`
- Contained by: none
- Contains: `AREA_CLEAR_SOUTH`, `AREA_STALL_SOUTH_A`, `AREA_STALL_SOUTH_B`
- Linked walls: `WALL_AREA_MAIN_HALL_SOUTH_NORTH`, `WALL_BLDG_B_FRONT`, `WALL_BLDG_A_FRONT`
- Linked buildings: `BLDG_A`, `BLDG_B`
- Anchors: canopy x1, cover x2, open-node x1, shopfront x14, signage x7
- Anchor IDs: `CLOTH_SPAN_01`, `M1_SHOP_L_01`, `M1_SHOP_L_02`, `M1_SHOP_L_03`, `M1_SHOP_L_04`, `M1_SHOP_L_05`, `M1_SHOP_L_06`, `M1_SHOP_L_07`, `M1_SHOP_R_01`, `M1_SHOP_R_02`, `M1_SHOP_R_03`, `M1_SHOP_R_04`, `M1_SHOP_R_05`, `M1_SHOP_R_06`, `M1_SHOP_R_07`, `M1_SIGN_L_01`, `M1_SIGN_L_02`, `M1_SIGN_L_03`, `M1_SIGN_L_04`, `M1_SIGN_R_01`, `M1_SIGN_R_02`, `M1_SIGN_R_03`, `NODE_M1_OPEN_01`, `PP_M1_EAST_NEAR_CUT`, `PP_M1_WEST_NEAR_CUT`
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_aged_plaster_ochre`, `ph_lime_plaster_sun` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`, `ph_band_lime_soft`.
- Constraints: Dense spice-market character. Stall strips on edges. Clusters near entry, open node near mid cut. Keep 6.0m minimum main-lane width.
- Notes: South main-lane segment with dense merchant frontage.

### AREA_MAIN_HALL_JOG — Main Hall Jog

- Source zone: `BZ_M2_JOG` (`main_lane_segment`)
- Short label: `MHJ`
- Human label: Main Hall Jog — Fabric & Textile Offset
- Bounds: x=22.75-31.25m, y=32.00-50.00m (8.50m x 18.00m)
- Design callouts: `C06` Jog, `C07` Well
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_MAIN_HALL_NORTH`, `AREA_CLEAR_SOUTH`, `AREA_CLEAR_NORTH`, `AREA_STALL_SOUTH_B`, `AREA_STALL_NORTH_B`
- Contained by: none
- Contains: `AREA_CLEAR_JOG`, `AREA_STALL_JOG_A`, `AREA_STALL_JOG_B`
- Linked walls: `WALL_AREA_MAIN_HALL_JOG_NORTH`, `WALL_AREA_MAIN_HALL_JOG_SOUTH`, `WALL_BLDG_D_FRONT`, `WALL_BLDG_C_FRONT`
- Linked buildings: `BLDG_C`, `BLDG_D`
- Anchors: canopy x1, cover x2, landmark x1, open-node x1, shopfront x11, signage x5
- Anchor IDs: `CLOTH_SPAN_02`, `LMK_MID_WELL_01`, `M2_SHOP_L_01`, `M2_SHOP_L_02`, `M2_SHOP_L_03`, `M2_SHOP_L_04`, `M2_SHOP_L_05`, `M2_SHOP_R_01`, `M2_SHOP_R_02`, `M2_SHOP_R_03`, `M2_SHOP_R_04`, `M2_SHOP_R_05`, `M2_SHOP_R_06`, `M2_SIGN_L_01`, `M2_SIGN_L_02`, `M2_SIGN_L_03`, `M2_SIGN_R_01`, `M2_SIGN_R_02`, `NODE_M2_COURT_01`, `PP_M2_EAST_NEAR_JOG`, `PP_M2_WEST_NEAR_JOG`
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_aged_plaster_ochre`, `ph_beige_wall_002`, `ph_lime_plaster_sun` with heavy trims `ph_trim_sanded_01`, `ph_stone_trim_white` and light trims `ph_band_beige_001`, `ph_band_beige_002`.
- Constraints: Wider stalls, fewer count. Jog +2.0m East breaks LoS. Asymmetric left/right stall count. Well node at Y=41. Keep 6.0m minimum main-lane width.
- Notes: Middle jog segment around the well landmark.

### AREA_MAIN_HALL_NORTH — Main Hall North

- Source zone: `BZ_M3` (`main_lane_segment`)
- Short label: `MHN`
- Human label: Main Hall North — Rug & Craft Approach
- Bounds: x=20.25-29.75m, y=50.00-68.00m (9.50m x 18.00m)
- Design callouts: `C08` Bazaar North, `C09` Hero Arch
- Edge adjacency: `AREA_SPAWN_B`, `AREA_MAIN_HALL_JOG`, `AREA_NORTH_CUT_A`, `AREA_NORTH_CUT_B`, `AREA_CLEAR_JOG`, `AREA_STALL_JOG_A`
- Contained by: none
- Contains: `AREA_CLEAR_NORTH`, `AREA_STALL_NORTH_A`, `AREA_STALL_NORTH_B`
- Linked walls: `WALL_AREA_MAIN_HALL_NORTH_SOUTH`, `WALL_BLDG_F_FRONT`, `WALL_BLDG_E_FRONT`
- Linked buildings: `BLDG_E`, `BLDG_F`
- Anchors: canopy x1, cover x2, landmark x1, open-node x1, shopfront x9, signage x7
- Anchor IDs: `CLOTH_SPAN_03`, `LMK_HERO_ARCH_01`, `M3_SHOP_L_01`, `M3_SHOP_L_02`, `M3_SHOP_L_03`, `M3_SHOP_L_04`, `M3_SHOP_R_01`, `M3_SHOP_R_02`, `M3_SHOP_R_03`, `M3_SHOP_R_04`, `M3_SHOP_R_05`, `M3_SIGN_L_01`, `M3_SIGN_L_02`, `M3_SIGN_L_03`, `M3_SIGN_L_04`, `M3_SIGN_R_01`, `M3_SIGN_R_02`, `M3_SIGN_R_03`, `NODE_M3_ARCH_CLEAR_01`, `PP_M3_EAST_NEAR_CUT`, `PP_M3_WEST_NEAR_CUT`
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_beige_wall_002`, `ph_lime_plaster_sun`, `ph_whitewashed_brick_dusty` with heavy trims `ph_stone_trim_white`, `ph_trim_sanded_01` and light trims `ph_band_beige_002`, `ph_band_lime_soft`, `ph_band_beige_001`.
- Constraints: Sparse at south, denser approaching arch. Hero arch zone (Y=65-68) has no stalls. One diagonal stall near north cut. Keep 6.0m minimum main-lane width.
- Notes: North main-lane segment leading into the hero arch.

### AREA_SIDE_HALL_A — Side Hall A

- Source zone: `SH_W` (`side_hall`)
- Short label: `SHA`
- Human label: Side Hall A — West Service Hall
- Bounds: x=1.50-8.00m, y=10.00-72.00m (6.50m x 62.00m)
- Design callouts: `C10` West Hall South, `C11` West Hall Mid, `C12` West Hall North
- Edge adjacency: `AREA_CONNECTOR_A`, `AREA_CONNECTOR_C`, `AREA_MID_CUT_A`, `AREA_NORTH_CUT_A`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_SIDE_HALL_A_NORTH`, `WALL_AREA_SIDE_HALL_A_SOUTH`, `WALL_AREA_SIDE_HALL_A_EAST`, `WALL_BLDG_I_FRONT`
- Linked buildings: `BLDG_I`
- Anchors: cover x2, service-door x5
- Anchor IDs: `PP_SHW_MID`, `PP_SHW_NORTH`, `SHW_DOOR_01`, `SHW_DOOR_02`, `SHW_DOOR_03`, `SHW_DOOR_04`, `SHW_DOOR_05`
- Floor surface: PBR floor material `cobblestone_pavement`
- Wall material summary: Walls `ph_whitewashed_brick` with heavy trims `ph_sandstone_blocks_05` and light trims `ph_band_plastered`.
- Constraints: 6.5m total / 4.5m clear. Goods stacks against outer wall. Heavier dressing than east hall. Service character. Keep 4.5m minimum side-hall width.
- Notes: West service alley and flank route.

### AREA_SIDE_HALL_B — Side Hall B

- Source zone: `SH_E` (`side_hall`)
- Short label: `SHB`
- Human label: Side Hall B — East Service Hall
- Bounds: x=42.00-48.50m, y=10.00-72.00m (6.50m x 62.00m)
- Design callouts: `C13` East Hall South, `C14` East Hall Mid, `C15` East Hall North
- Edge adjacency: `AREA_CONNECTOR_B`, `AREA_CONNECTOR_D`, `AREA_MID_CUT_B`, `AREA_NORTH_CUT_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_SIDE_HALL_B_NORTH`, `WALL_AREA_SIDE_HALL_B_SOUTH`, `WALL_BLDG_J_FRONT`, `WALL_AREA_SIDE_HALL_B_WEST`
- Linked buildings: `BLDG_J`
- Anchors: cover x2, service-door x5
- Anchor IDs: `PP_SHE_MID`, `PP_SHE_NORTH`, `SHE_DOOR_01`, `SHE_DOOR_02`, `SHE_DOOR_03`, `SHE_DOOR_04`, `SHE_DOOR_05`
- Floor surface: PBR floor material `cobblestone_pavement`
- Wall material summary: Walls `ph_whitewashed_brick` with heavy trims `ph_sandstone_blocks_05` and light trims `ph_band_plastered`.
- Constraints: 6.5m total / 4.5m clear. Lighter dressing than west hall. Service character. Keep 4.5m minimum side-hall width.
- Notes: East service alley and flank route.

### AREA_CONNECTOR_A — Connector A

- Source zone: `CONN_SW` (`connector`)
- Short label: `CNA`
- Human label: Spawn A ↔ Side Hall A Connector
- Bounds: x=8.00-14.00m, y=8.00-12.00m (6.00m x 4.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_A`, `AREA_SIDE_HALL_A`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_CONNECTOR_A_NORTH`, `WALL_AREA_CONNECTOR_A_SOUTH`, `WALL_AREA_CONNECTOR_A_WEST`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_whitewashed_brick_cool` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_plastered`.
- Constraints: Widened to match hall expansion. Short connector; maintain quick flank access.
- Notes: Southwest spawn connector.

### AREA_CONNECTOR_B — Connector B

- Source zone: `CONN_SE` (`connector`)
- Short label: `CNB`
- Human label: Spawn A ↔ Side Hall B Connector
- Bounds: x=36.00-42.00m, y=8.00-12.00m (6.00m x 4.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_A`, `AREA_SIDE_HALL_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_CONNECTOR_B_NORTH`, `WALL_AREA_CONNECTOR_B_SOUTH`, `WALL_AREA_CONNECTOR_B_EAST`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_whitewashed_brick_cool` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_plastered`.
- Constraints: Widened to match hall expansion. Short connector; maintain quick flank access.
- Notes: Southeast spawn connector.

### AREA_CONNECTOR_C — Connector C

- Source zone: `CONN_NW` (`connector`)
- Short label: `CNC`
- Human label: Spawn B ↔ Side Hall A Connector
- Bounds: x=8.00-14.00m, y=70.00-74.00m (6.00m x 4.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_B`, `AREA_SIDE_HALL_A`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_CONNECTOR_C_NORTH`, `WALL_AREA_CONNECTOR_C_SOUTH`, `WALL_AREA_CONNECTOR_C_WEST`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_whitewashed_brick_cool` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_plastered`.
- Constraints: Widened to match hall expansion. Short connector; maintain quick flank access.
- Notes: Northwest spawn connector.

### AREA_CONNECTOR_D — Connector D

- Source zone: `CONN_NE` (`connector`)
- Short label: `CND`
- Human label: Spawn B ↔ Side Hall B Connector
- Bounds: x=36.00-42.00m, y=70.00-74.00m (6.00m x 4.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_B`, `AREA_SIDE_HALL_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_CONNECTOR_D_NORTH`, `WALL_AREA_CONNECTOR_D_SOUTH`, `WALL_AREA_CONNECTOR_D_EAST`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `cobblestone_color`
- Wall material summary: Walls `ph_whitewashed_brick_cool` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_plastered`.
- Constraints: Widened to match hall expansion. Short connector; maintain quick flank access.
- Notes: Northeast spawn connector.

### AREA_MID_CUT_A — Mid Cut A

- Source zone: `CUT_W_MID` (`cut`)
- Short label: `MCA`
- Human label: Mid Cut A — West
- Bounds: x=8.00-20.25m, y=24.50-27.50m (12.25m x 3.00m)
- Design callouts: `C04` Mid Cut West
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_SIDE_HALL_A`, `AREA_STALL_SOUTH_A`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_MID_CUT_A_NORTH`, `WALL_AREA_MID_CUT_A_SOUTH`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `grey_tiles`
- Wall material summary: Walls `ph_beige_wall_002` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`.
- Constraints: Extended to reach widened west hall inner edge at x=8.0.
- Notes: West mid cut between Side Hall A and Main Hall South/Jog.

### AREA_MID_CUT_B — Mid Cut B

- Source zone: `CUT_E_MID` (`cut`)
- Short label: `MCB`
- Human label: Mid Cut B — East
- Bounds: x=29.75-42.00m, y=24.50-27.50m (12.25m x 3.00m)
- Design callouts: `C05` Mid Cut East
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_SIDE_HALL_B`, `AREA_STALL_SOUTH_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_MID_CUT_B_NORTH`, `WALL_AREA_MID_CUT_B_SOUTH`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `grey_tiles`
- Wall material summary: Walls `ph_beige_wall_002` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`.
- Constraints: Extended to reach widened east hall inner edge at x=42.0.
- Notes: East mid cut between Side Hall B and Main Hall South/Jog.

### AREA_NORTH_CUT_A — North Cut A

- Source zone: `CUT_W_NORTH` (`cut`)
- Short label: `NCA`
- Human label: North Cut A — West
- Bounds: x=8.00-20.25m, y=56.00-59.00m (12.25m x 3.00m)
- Design callouts: `C16` North Cut West
- Edge adjacency: `AREA_MAIN_HALL_NORTH`, `AREA_SIDE_HALL_A`, `AREA_STALL_NORTH_A`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_NORTH_CUT_A_NORTH`, `WALL_AREA_NORTH_CUT_A_SOUTH`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `sand_01`
- Wall material summary: Walls `ph_beige_wall_002` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`.
- Constraints: Extended to reach widened west hall inner edge at x=8.0.
- Notes: West north cut between Side Hall A and Main Hall North.

### AREA_NORTH_CUT_B — North Cut B

- Source zone: `CUT_E_NORTH` (`cut`)
- Short label: `NCB`
- Human label: North Cut B — East
- Bounds: x=29.75-42.00m, y=56.00-59.00m (12.25m x 3.00m)
- Design callouts: `C17` North Cut East
- Edge adjacency: `AREA_MAIN_HALL_NORTH`, `AREA_SIDE_HALL_B`, `AREA_STALL_NORTH_B`
- Contained by: none
- Contains: none
- Linked walls: `WALL_AREA_NORTH_CUT_B_NORTH`, `WALL_AREA_NORTH_CUT_B_SOUTH`
- Linked buildings: none
- Anchors: none
- Floor surface: PBR floor material `sand_01`
- Wall material summary: Walls `ph_beige_wall_002` with heavy trims `ph_trim_sanded_01` and light trims `ph_band_beige_001`.
- Constraints: Extended to reach widened east hall inner edge at x=42.0.
- Notes: East north cut between Side Hall B and Main Hall North.

### AREA_CLEAR_SOUTH — Main Clear South

- Source zone: `CLEAR_M1` (`clear_travel_zone`)
- Short label: `CLS`
- Human label: Main Hall South Clear Travel Zone
- Bounds: x=22.00-28.00m, y=14.00-32.00m (6.00m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_A`, `AREA_MAIN_HALL_JOG`, `AREA_CLEAR_JOG`, `AREA_STALL_SOUTH_A`, `AREA_STALL_SOUTH_B`, `AREA_STALL_JOG_A`
- Contained by: `AREA_MAIN_HALL_SOUTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Overlay-only travel band inside Main Hall South; inherits `cobblestone_color` in the PBR floor pass.
- Wall material summary: Overlay-only travel band inside Main Hall South; inherits `cobblestone_color` in the PBR floor pass.
- Constraints: NO props/shops. Clear travel zones must remain unobstructed by props/shops. Temporary gameplay items only (e.g., pickups) allowed if they do not block.
- Notes: Protected travel strip inside Main Hall South.

### AREA_CLEAR_JOG — Main Clear Jog

- Source zone: `CLEAR_M2` (`clear_travel_zone`)
- Short label: `CLJ`
- Human label: Main Hall Jog Clear Travel Zone
- Bounds: x=24.00-30.00m, y=32.00-50.00m (6.00m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_MAIN_HALL_NORTH`, `AREA_CLEAR_SOUTH`, `AREA_CLEAR_NORTH`, `AREA_STALL_SOUTH_B`, `AREA_STALL_JOG_A`, `AREA_STALL_JOG_B`, `AREA_STALL_NORTH_B`
- Contained by: `AREA_MAIN_HALL_JOG`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Overlay-only travel band inside Main Hall Jog; inherits `cobblestone_color` in the PBR floor pass.
- Wall material summary: Overlay-only travel band inside Main Hall Jog; inherits `cobblestone_color` in the PBR floor pass.
- Constraints: NO props/shops. Clear travel zones must remain unobstructed by props/shops. Temporary gameplay items only (e.g., pickups) allowed if they do not block.
- Notes: Protected travel strip inside Main Hall Jog.

### AREA_CLEAR_NORTH — Main Clear North

- Source zone: `CLEAR_M3` (`clear_travel_zone`)
- Short label: `CLN`
- Human label: Main Hall North Clear Travel Zone
- Bounds: x=22.00-28.00m, y=50.00-68.00m (6.00m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_B`, `AREA_MAIN_HALL_JOG`, `AREA_CLEAR_JOG`, `AREA_STALL_JOG_A`, `AREA_STALL_NORTH_A`, `AREA_STALL_NORTH_B`
- Contained by: `AREA_MAIN_HALL_NORTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Overlay-only travel band inside Main Hall North; inherits `cobblestone_color` in the PBR floor pass.
- Wall material summary: Overlay-only travel band inside Main Hall North; inherits `cobblestone_color` in the PBR floor pass.
- Constraints: NO props/shops. Clear travel zones must remain unobstructed by props/shops. Temporary gameplay items only (e.g., pickups) allowed if they do not block.
- Notes: Protected travel strip inside Main Hall North.

### AREA_STALL_SOUTH_A — Stall South A

- Source zone: `STALL_M1_L` (`stall_strip`)
- Short label: `SSA`
- Human label: Main Hall South Stall Strip A
- Bounds: x=20.25-22.00m, y=14.00-32.00m (1.75m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_A`, `AREA_MID_CUT_A`, `AREA_CLEAR_SOUTH`
- Contained by: `AREA_MAIN_HALL_SOUTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall South; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall South; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M1.
- Notes: West-side stall strip for Main Hall South.

### AREA_STALL_SOUTH_B — Stall South B

- Source zone: `STALL_M1_R` (`stall_strip`)
- Short label: `SSB`
- Human label: Main Hall South Stall Strip B
- Bounds: x=28.00-29.75m, y=14.00-32.00m (1.75m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_A`, `AREA_MAIN_HALL_JOG`, `AREA_MID_CUT_B`, `AREA_CLEAR_SOUTH`, `AREA_CLEAR_JOG`
- Contained by: `AREA_MAIN_HALL_SOUTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall South; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall South; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M1.
- Notes: East-side stall strip for Main Hall South.

### AREA_STALL_JOG_A — Stall Jog A

- Source zone: `STALL_M2_L` (`stall_strip`)
- Short label: `SJA`
- Human label: Main Hall Jog Stall Strip A
- Bounds: x=22.75-24.00m, y=32.00-50.00m (1.25m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_MAIN_HALL_SOUTH`, `AREA_MAIN_HALL_NORTH`, `AREA_CLEAR_SOUTH`, `AREA_CLEAR_JOG`, `AREA_CLEAR_NORTH`
- Contained by: `AREA_MAIN_HALL_JOG`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall Jog; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall Jog; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M2.
- Notes: West-side stall strip for Main Hall Jog.

### AREA_STALL_JOG_B — Stall Jog B

- Source zone: `STALL_M2_R` (`stall_strip`)
- Short label: `SJB`
- Human label: Main Hall Jog Stall Strip B
- Bounds: x=30.00-31.25m, y=32.00-50.00m (1.25m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_CLEAR_JOG`
- Contained by: `AREA_MAIN_HALL_JOG`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall Jog; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall Jog; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M2.
- Notes: East-side stall strip for Main Hall Jog.

### AREA_STALL_NORTH_A — Stall North A

- Source zone: `STALL_M3_L` (`stall_strip`)
- Short label: `SNA`
- Human label: Main Hall North Stall Strip A
- Bounds: x=20.25-22.00m, y=50.00-68.00m (1.75m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_B`, `AREA_NORTH_CUT_A`, `AREA_CLEAR_NORTH`
- Contained by: `AREA_MAIN_HALL_NORTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall North; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall North; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M3.
- Notes: West-side stall strip for Main Hall North.

### AREA_STALL_NORTH_B — Stall North B

- Source zone: `STALL_M3_R` (`stall_strip`)
- Short label: `SNB`
- Human label: Main Hall North Stall Strip B
- Bounds: x=28.00-29.75m, y=50.00-68.00m (1.75m x 18.00m)
- Design callouts: none
- Edge adjacency: `AREA_SPAWN_B`, `AREA_MAIN_HALL_JOG`, `AREA_NORTH_CUT_B`, `AREA_CLEAR_JOG`, `AREA_CLEAR_NORTH`
- Contained by: `AREA_MAIN_HALL_NORTH`
- Contains: none
- Linked walls: none
- Linked buildings: none
- Anchors: none
- Floor surface: Embedded stall strip inside Main Hall North; no standalone floor material, inherits `cobblestone_color`.
- Wall material summary: Embedded stall strip inside Main Hall North; no standalone floor material, inherits `cobblestone_color`.
- Constraints: Edge-only decor + stalls; never intrude into CLEAR_M3.
- Notes: East-side stall strip for Main Hall North.

### CORNER_A — Corner A

- Type: custom corner callout
- Short label: `CRA`
- Human label: Spawn A West Elbow
- Related zones: `SPAWN_A_COURTYARD`, `CONN_SW`, `SH_W`
- Surface summary: Composite corner between spawn `large_sandstone_blocks_01`, connector `cobblestone_color`, and hall `cobblestone_pavement` surfaces.
- Linked walls: `WALL_AREA_SPAWN_A_WEST`, `WALL_AREA_SIDE_HALL_A_EAST`
- Anchors: none authored directly; use adjacent zone entries for placed anchors.
- Notes: Corner space between Spawn A, Connector A, and Side Hall A.

### CORNER_B — Corner B

- Type: custom corner callout
- Short label: `CRB`
- Human label: Spawn A East Elbow
- Related zones: `SPAWN_A_COURTYARD`, `CONN_SE`, `SH_E`
- Surface summary: Composite corner between spawn `large_sandstone_blocks_01`, connector `cobblestone_color`, and hall `cobblestone_pavement` surfaces.
- Linked walls: `WALL_AREA_SPAWN_A_EAST`, `WALL_AREA_SIDE_HALL_B_WEST`
- Anchors: none authored directly; use adjacent zone entries for placed anchors.
- Notes: Corner space between Spawn A, Connector B, and Side Hall B.

### CORNER_C — Corner C

- Type: custom corner callout
- Short label: `CRC`
- Human label: Spawn B West Elbow
- Related zones: `SPAWN_B_GATE_PLAZA`, `CONN_NW`, `SH_W`
- Surface summary: Composite corner between spawn `cobblestone_pavement`, connector `cobblestone_color`, and hall `cobblestone_pavement` surfaces.
- Linked walls: `WALL_AREA_SPAWN_B_WEST`, `WALL_AREA_SIDE_HALL_A_EAST`
- Anchors: none authored directly; use adjacent zone entries for placed anchors.
- Notes: Corner space between Spawn B, Connector C, and Side Hall A.

### CORNER_D — Corner D

- Type: custom corner callout
- Short label: `CRD`
- Human label: Spawn B East Elbow
- Related zones: `SPAWN_B_GATE_PLAZA`, `CONN_NE`, `SH_E`
- Surface summary: Composite corner between spawn `cobblestone_pavement`, connector `cobblestone_color`, and hall `cobblestone_pavement` surfaces.
- Linked walls: `WALL_AREA_SPAWN_B_EAST`, `WALL_AREA_SIDE_HALL_B_WEST`
- Anchors: none authored directly; use adjacent zone entries for placed anchors.
- Notes: Corner space between Spawn B, Connector D, and Side Hall B.

## Buildings

### BLDG_A — Building A

- Source face: `BZ_M1:west`
- Short label: `A`
- Human label: Spice Market West Frontage
- Owning area: `AREA_MAIN_HALL_SOUTH`
- Wall asset: `WALL_BLDG_A_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `merchant`
- Composition preset: `merchant_rhythm`
- Wall material: `ph_lime_plaster_sun`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_lime_soft`
- Balcony material: `tm_balcony_wood_dark`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 1 glass windows, 2 dark windows, 6 shuttered windows
- Anchor summary: canopy x1, cover x1, shopfront x7, signage x4
- Texture logic: merchant facade family on BZ_M1:west resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_lime_soft`.
- Notes: Merchant-heavy west frontage for Main Hall South.

### BLDG_B — Building B

- Source face: `BZ_M1:east`
- Short label: `B`
- Human label: Spice Market East Frontage
- Owning area: `AREA_MAIN_HALL_SOUTH`
- Wall asset: `WALL_BLDG_B_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `residential`
- Composition preset: `residential_quiet`
- Wall material: `ph_aged_plaster_ochre`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony material: `ph_trim_sanded_01`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 3 glass windows, 6 dark windows, 0 shuttered windows
- Anchor summary: cover x1, open-node x1, shopfront x7, signage x3
- Texture logic: residential facade family on BZ_M1:east resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Notes: Residential-leaning east frontage for Main Hall South.

### BLDG_C — Building C

- Source face: `BZ_M2_JOG:west`
- Short label: `C`
- Human label: Jog West Frontage
- Owning area: `AREA_MAIN_HALL_JOG`
- Wall asset: `WALL_BLDG_C_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `service`
- Composition preset: `service_blank`
- Wall material: `ph_beige_wall_002`
- Trim materials: heavy `ph_stone_trim_white`, light `ph_band_beige_002`
- Balcony material: none
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 6 glass windows, 0 dark windows, 0 shuttered windows
- Anchor summary: canopy x1, cover x1, shopfront x5, signage x3
- Texture logic: service facade family on BZ_M2_JOG:west resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_stone_trim_white` / `ph_band_beige_002`.
- Notes: Service wall on the west side of the jog.

### BLDG_D — Building D

- Source face: `BZ_M2_JOG:east`
- Short label: `D`
- Human label: Jog East Frontage
- Owning area: `AREA_MAIN_HALL_JOG`
- Wall asset: `WALL_BLDG_D_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `merchant`
- Composition preset: `merchant_hero_stack`
- Wall material: `ph_lime_plaster_sun`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony material: `tm_balcony_wood_dark`
- Opening totals: 1 ground doors, 2 upper door openings, 1 balconies, 2 glass windows, 0 dark windows, 2 shuttered windows
- Anchor summary: cover x1, landmark x1, open-node x1, shopfront x6, signage x2
- Texture logic: merchant facade family on BZ_M2_JOG:east resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Notes: Hero merchant frontage on the east side of the jog.

### BLDG_E — Building E

- Source face: `BZ_M3:west`
- Short label: `E`
- Human label: North Hall West Frontage
- Owning area: `AREA_MAIN_HALL_NORTH`
- Wall asset: `WALL_BLDG_E_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `residential`
- Composition preset: `residential_balcony_stack`
- Wall material: `ph_whitewashed_brick_dusty`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony material: `ph_trim_sanded_01`
- Opening totals: 1 ground doors, 2 upper door openings, 1 balconies, 4 glass windows, 6 dark windows, 0 shuttered windows
- Anchor summary: canopy x1, cover x1, shopfront x4, signage x4
- Texture logic: residential facade family on BZ_M3:west resolves wall `ph_whitewashed_brick_dusty` with balcony material `ph_trim_sanded_01`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_beige_001`.
- Notes: Residential frontage near the arch approach.

### BLDG_F — Building F

- Source face: `BZ_M3:east`
- Short label: `F`
- Human label: North Hall East Frontage
- Owning area: `AREA_MAIN_HALL_NORTH`
- Wall asset: `WALL_BLDG_F_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `merchant`
- Composition preset: `merchant_rhythm`
- Wall material: `ph_lime_plaster_sun`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_lime_soft`
- Balcony material: `tm_balcony_wood_dark`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 1 glass windows, 3 dark windows, 8 shuttered windows
- Anchor summary: cover x1, landmark x1, open-node x1, shopfront x5, signage x3
- Texture logic: merchant facade family on BZ_M3:east resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_lime_soft`.
- Notes: Merchant frontage near the arch approach.

### BLDG_G — Building G

- Source face: `SPAWN_A_COURTYARD:north`
- Short label: `G`
- Human label: Spawn A North Frontage
- Owning area: `AREA_SPAWN_A`
- Wall asset: `WALL_BLDG_G_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `spawn`
- Composition preset: `spawn_courtyard_landmark`
- Wall material: `ph_whitewashed_brick_warm`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony material: `ph_trim_sanded_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 8 dark windows, 0 shuttered windows
- Anchor summary: spawn-cover x2
- Texture logic: spawn facade family on SPAWN_A_COURTYARD:north resolves wall `ph_whitewashed_brick_warm` with balcony material `ph_trim_sanded_01`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Notes: Spawn A entry frontage looking into the bazaar.

### BLDG_H — Building H

- Source face: `SPAWN_B_GATE_PLAZA:south`
- Short label: `H`
- Human label: Spawn B South Frontage
- Owning area: `AREA_SPAWN_B`
- Wall asset: `WALL_BLDG_H_FRONT`
- Height: 9.00m (3 stories)
- Facade family: `spawn`
- Composition preset: `spawn_courtyard_landmark`
- Wall material: `ph_whitewashed_brick_warm`
- Trim materials: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony material: `ph_trim_sanded_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 8 dark windows, 0 shuttered windows
- Anchor summary: spawn-cover x2
- Texture logic: spawn facade family on SPAWN_B_GATE_PLAZA:south resolves wall `ph_whitewashed_brick_warm` with balcony material `ph_trim_sanded_01`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Notes: Spawn B entry frontage behind the hero arch.

### BLDG_I — Building I

- Source face: `SH_W:west`
- Short label: `I`
- Human label: Side Hall A Outer Frontage
- Owning area: `AREA_SIDE_HALL_A`
- Wall asset: `WALL_BLDG_I_FRONT`
- Height: 3.00m (1 stories)
- Facade family: `side_hall`
- Composition preset: `service_blank`
- Wall material: `ph_whitewashed_brick`
- Trim materials: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony material: none
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 8 glass windows, 0 dark windows, 0 shuttered windows
- Anchor summary: cover x2, service-door x5
- Texture logic: side_hall facade family on SH_W:west resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Notes: Outer west wall of Side Hall A.

### BLDG_J — Building J

- Source face: `SH_E:east`
- Short label: `J`
- Human label: Side Hall B Outer Frontage
- Owning area: `AREA_SIDE_HALL_B`
- Wall asset: `WALL_BLDG_J_FRONT`
- Height: 3.00m (1 stories)
- Facade family: `side_hall`
- Composition preset: `service_blank`
- Wall material: `ph_whitewashed_brick`
- Trim materials: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony material: none
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 8 glass windows, 0 dark windows, 0 shuttered windows
- Anchor summary: cover x2, service-door x5
- Texture logic: side_hall facade family on SH_E:east resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Notes: Outer east wall of Side Hall B.

## Walls

### WALL_BLDG_G_FRONT — Building G Front Wall

- Source face: `SPAWN_A_COURTYARD:north`
- Short label: `G-F`
- Owner: `BLDG_G`
- Visible span: 2 segment(s), total 12.50m
- Segment spans: #1 x=14.00-20.25m; #2 x=29.75-36.00m
- Adjacent gaps: Main Hall South (x=20.25-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `spawn_frontage`
- Composition preset: `spawn_courtyard_landmark`
- Facade family: `spawn`
- Balcony style: `residential_parapet`
- Wall material: `ph_whitewashed_brick_warm`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `large_sandstone_blocks_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 8 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because 5.55m usable length does not reach the frontage threshold. #2 No ground doors because 5.55m usable length does not reach the frontage threshold.
- Window logic: #1 2 window column(s) with accent columns [0, 1]. #2 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because the segment does not provide enough contiguous window bays for a dominant door. #2 No balconies because the segment does not provide enough contiguous window bays for a dominant door.
- Texture logic: spawn facade family on SPAWN_A_COURTYARD:north resolves wall `ph_whitewashed_brick_warm` with balcony material `ph_trim_sanded_01`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Anchor summary: spawn-cover x2
- Anchor IDs: `PP_SPAWN_A_01`, `PP_SPAWN_A_02`
- Segment breakdown:
  - #1: usable=5.55m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.55m usable length with 2.77m bay width. No ground doors because 5.55m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because the segment does not provide enough contiguous window bays for a dominant door.
  - #2: usable=5.55m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.55m usable length with 2.77m bay width. No ground doors because 5.55m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because the segment does not provide enough contiguous window bays for a dominant door.
- Notes: Spawn A entry frontage looking into the bazaar.

### WALL_AREA_SPAWN_A_SOUTH — Spawn A South Wall

- Source face: `SPAWN_A_COURTYARD:south`
- Short label: `SA-S`
- Owner: `AREA_SPAWN_A`
- Visible span: 1 segment(s), total 22.00m
- Segment spans: #1 x=14.00-36.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `spawn_frontage`
- Composition preset: `residential_quiet`
- Facade family: `spawn`
- Balcony style: `residential_parapet`
- Wall material: `ph_whitewashed_brick_warm`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `large_sandstone_blocks_01`
- Opening totals: 2 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 4 dark windows, 0 shuttered windows
- Door logic: #1 2 ground door column(s) derived from wall role spawn_frontage.
- Window logic: #1 3 window column(s) with accent columns [2, 4].
- Balcony logic: #1 No balconies because preset residential_quiet does not enable balcony stacks.
- Texture logic: spawn facade family on SPAWN_A_COURTYARD:south resolves wall `ph_whitewashed_brick_warm` with balcony material `ph_trim_sanded_01`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=21.30m, bays=7, pattern=_ D W W W D _, doors=2/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 7 bays across 21.30m usable length with 3.04m bay width. 2 ground door column(s) derived from wall role spawn_frontage. 3 window column(s) with accent columns [2, 4]. No balconies because preset residential_quiet does not enable balcony stacks.
- Notes: Spawn A exposed south face.

### WALL_AREA_SPAWN_A_EAST — Spawn A East Wall

- Source face: `SPAWN_A_COURTYARD:east`
- Short label: `SA-E`
- Owner: `AREA_SPAWN_A`
- Visible span: 2 segment(s), total 10.00m
- Segment spans: #1 y=0.00-8.00m; #2 y=12.00-14.00m
- Adjacent gaps: Connector B (y=8.00-12.00m)
- Height: 6.00m (2 stories)
- Wall role: `spawn_side_window_rich`
- Composition preset: `residential_quiet`
- Facade family: `spawn`
- Balcony style: `residential_parapet`
- Wall material: `ph_aged_plaster_ochre`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `large_sandstone_blocks_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 3 glass windows, 1 dark windows, 2 shuttered windows
- Door logic: #1 No ground doors because wall role spawn_side_window_rich suppresses frontage openings. #2 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 3 window column(s) with accent columns [0, 1]. #2 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balconies because preset residential_quiet does not enable balcony stacks. #2 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: spawn facade family on SPAWN_A_COURTYARD:east resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=7.30m, bays=3, pattern=W W W, doors=0/0, balconies=0, windows=3 glass / 1 dark / 2 shuttered
    logic: Facade grid uses 3 bays across 7.30m usable length with 2.43m bay width. No ground doors because wall role spawn_side_window_rich suppresses frontage openings. 3 window column(s) with accent columns [0, 1]. No balconies because preset residential_quiet does not enable balcony stacks.
  - #2: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Spawn A exposed east face.

### WALL_AREA_SPAWN_A_WEST — Spawn A West Wall

- Source face: `SPAWN_A_COURTYARD:west`
- Short label: `SA-W`
- Owner: `AREA_SPAWN_A`
- Visible span: 2 segment(s), total 10.00m
- Segment spans: #1 y=0.00-8.00m; #2 y=12.00-14.00m
- Adjacent gaps: Connector A (y=8.00-12.00m)
- Height: 6.00m (2 stories)
- Wall role: `spawn_side_window_rich`
- Composition preset: `residential_quiet`
- Facade family: `spawn`
- Balcony style: `residential_parapet`
- Wall material: `ph_aged_plaster_ochre`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `large_sandstone_blocks_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 3 glass windows, 1 dark windows, 2 shuttered windows
- Door logic: #1 No ground doors because wall role spawn_side_window_rich suppresses frontage openings. #2 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 3 window column(s) with accent columns [0, 1]. #2 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balconies because preset residential_quiet does not enable balcony stacks. #2 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: spawn facade family on SPAWN_A_COURTYARD:west resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=7.30m, bays=3, pattern=W W W, doors=0/0, balconies=0, windows=3 glass / 1 dark / 2 shuttered
    logic: Facade grid uses 3 bays across 7.30m usable length with 2.43m bay width. No ground doors because wall role spawn_side_window_rich suppresses frontage openings. 3 window column(s) with accent columns [0, 1]. No balconies because preset residential_quiet does not enable balcony stacks.
  - #2: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Spawn A exposed west face.

### WALL_AREA_SPAWN_B_NORTH — Spawn B North Wall

- Source face: `SPAWN_B_GATE_PLAZA:north`
- Short label: `SB-N`
- Owner: `AREA_SPAWN_B`
- Visible span: 1 segment(s), total 22.00m
- Segment spans: #1 x=14.00-36.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `spawn_frontage`
- Composition preset: `spawn_gate_brick_backdrop`
- Facade family: `spawn`
- Balcony style: `none`
- Wall material: `ph_brick_4_desert`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 2 ground doors, 0 upper door openings, 0 balconies, 8 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 2 authored ground door opening(s) placed on segment #1.
- Window logic: #1 Authored window layout places 8 pointed-arch windows (4 bright stained-glass upper / 4 dim stained-glass lower).
- Balcony logic: #1 No balconies because spawn frontage resolves balcony style "none".
- Texture logic: spawn facade family on SPAWN_B_GATE_PLAZA:north resolves wall `ph_brick_4_desert` with balcony material none.
- Trim logic: Spawn B shell cleanup keeps only edge trims: shared plinth 0.58m / 0.17m, heavy top-edge trims on `ph_stone_trim_white`, no string-course bands, and no full-height pilaster grid.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=21.30m, bays=7, pattern=authored, doors=2/0, balconies=0, windows=8 glass / 0 dark / 0 shuttered
    logic: Authored door/window layout overrides on segment #1 place exact openings while preserving the existing facade construction. 2 authored ground door opening(s) placed on segment #1. Authored window layout places 8 pointed-arch windows (4 bright stained-glass upper / 4 dim stained-glass lower). No balconies because spawn frontage resolves balcony style "none".
- Notes: Spawn B exposed north face.

### WALL_BLDG_H_FRONT — Building H Front Wall

- Source face: `SPAWN_B_GATE_PLAZA:south`
- Short label: `H-F`
- Owner: `BLDG_H`
- Visible span: 2 segment(s), total 12.50m
- Segment spans: #1 x=14.00-20.25m; #2 x=29.75-36.00m
- Adjacent gaps: Main Hall North (x=20.25-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `spawn_frontage`
- Composition preset: `spawn_courtyard_landmark`
- Facade family: `spawn`
- Balcony style: `residential_parapet`
- Wall material: `ph_whitewashed_brick_warm`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 8 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because 5.55m usable length does not reach the frontage threshold. #2 No ground doors because 5.55m usable length does not reach the frontage threshold.
- Window logic: #1 2 window column(s) with accent columns [0, 1]. #2 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because the segment does not provide enough contiguous window bays for a dominant door. #2 No balconies because the segment does not provide enough contiguous window bays for a dominant door.
- Texture logic: spawn facade family on SPAWN_B_GATE_PLAZA:south resolves wall `ph_whitewashed_brick_warm` with balcony material `ph_trim_sanded_01`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Anchor summary: spawn-cover x2
- Anchor IDs: `PP_SPAWN_B_01`, `PP_SPAWN_B_02`
- Segment breakdown:
  - #1: usable=5.55m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.55m usable length with 2.77m bay width. No ground doors because 5.55m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because the segment does not provide enough contiguous window bays for a dominant door.
  - #2: usable=5.55m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.55m usable length with 2.77m bay width. No ground doors because 5.55m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because the segment does not provide enough contiguous window bays for a dominant door.
- Notes: Spawn B entry frontage behind the hero arch.

### WALL_AREA_SPAWN_B_EAST — Spawn B East Wall

- Source face: `SPAWN_B_GATE_PLAZA:east`
- Short label: `SB-E`
- Owner: `AREA_SPAWN_B`
- Visible span: 2 segment(s), total 10.00m
- Segment spans: #1 y=68.00-70.00m; #2 y=74.00-82.00m
- Adjacent gaps: Connector D (y=70.00-74.00m)
- Height: 9.00m (3 stories)
- Wall role: `spawn_frontage`
- Composition preset: `residential_quiet`
- Facade family: `spawn`
- Balcony style: `none`
- Wall material: `ph_brick_4_desert`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length. #2 1 authored ground door opening(s) placed on segment #2 using door style from SPAWN_B_GATE_PLAZA:north#1.
- Window logic: #1 No procedural windows; segment is below the minimum facade length. #2 Authored window layout places 4 pointed-arch windows (2 bright stained-glass upper / 2 dim stained-glass lower).
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length. #2 No balconies because spawn frontage resolves balcony style "none".
- Texture logic: spawn facade family on SPAWN_B_GATE_PLAZA:east resolves wall `ph_brick_4_desert` with balcony material none.
- Trim logic: Spawn B shell cleanup keeps only edge trims: shared plinth 0.58m / 0.17m, heavy top-edge trims on `ph_stone_trim_white`, no string-course bands, and no full-height pilaster grid.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
  - #2: usable=7.30m, bays=3, pattern=authored, doors=1/0, balconies=0, windows=4 glass / 0 dark / 0 shuttered
    logic: Authored door/window layout overrides on segment #2 place exact openings while preserving the existing facade construction, using door style from SPAWN_B_GATE_PLAZA:north#1. 1 authored ground door opening(s) placed on segment #2 using door style from SPAWN_B_GATE_PLAZA:north#1. Authored window layout places 4 pointed-arch windows (2 bright stained-glass upper / 2 dim stained-glass lower). No balconies because spawn frontage resolves balcony style "none".
- Notes: Spawn B exposed east face.

### WALL_AREA_SPAWN_B_WEST — Spawn B West Wall

- Source face: `SPAWN_B_GATE_PLAZA:west`
- Short label: `SB-W`
- Owner: `AREA_SPAWN_B`
- Visible span: 2 segment(s), total 10.00m
- Segment spans: #1 y=68.00-70.00m; #2 y=74.00-82.00m
- Adjacent gaps: Connector C (y=70.00-74.00m)
- Height: 9.00m (3 stories)
- Wall role: `spawn_frontage`
- Composition preset: `residential_quiet`
- Facade family: `spawn`
- Balcony style: `none`
- Wall material: `ph_brick_4_desert`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 4 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length. #2 1 authored ground door opening(s) placed on segment #2 using door style from SPAWN_B_GATE_PLAZA:north#1.
- Window logic: #1 No procedural windows; segment is below the minimum facade length. #2 Authored window layout places 4 pointed-arch windows (2 bright stained-glass upper / 2 dim stained-glass lower).
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length. #2 No balconies because spawn frontage resolves balcony style "none".
- Texture logic: spawn facade family on SPAWN_B_GATE_PLAZA:west resolves wall `ph_brick_4_desert` with balcony material none.
- Trim logic: Spawn B shell cleanup keeps only edge trims: shared plinth 0.58m / 0.17m, heavy top-edge trims on `ph_stone_trim_white`, no string-course bands, and no full-height pilaster grid.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
  - #2: usable=7.30m, bays=3, pattern=authored, doors=1/0, balconies=0, windows=4 glass / 0 dark / 0 shuttered
    logic: Authored door/window layout overrides on segment #2 place exact openings while preserving the existing facade construction, using door style from SPAWN_B_GATE_PLAZA:north#1. 1 authored ground door opening(s) placed on segment #2 using door style from SPAWN_B_GATE_PLAZA:north#1. Authored window layout places 4 pointed-arch windows (2 bright stained-glass upper / 2 dim stained-glass lower). No balconies because spawn frontage resolves balcony style "none".
- Notes: Spawn B exposed west face.

### WALL_AREA_MAIN_HALL_SOUTH_NORTH — Main Hall South North Wall

- Source face: `BZ_M1:north`
- Short label: `MHS-N`
- Owner: `AREA_MAIN_HALL_SOUTH`
- Visible span: 1 segment(s), total 2.50m
- Segment spans: #1 x=20.25-22.75m
- Adjacent gaps: Main Hall Jog (x=22.75-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `main_side_window_only`
- Composition preset: `residential_quiet`
- Facade family: `residential`
- Balcony style: `residential_parapet`
- Wall material: `ph_aged_plaster_ochre`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 1 glass windows, 2 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role main_side_window_only suppresses frontage openings.
- Window logic: #1 1 window column(s) with accent columns [0].
- Balcony logic: #1 No balconies because preset residential_quiet does not enable balcony stacks.
- Texture logic: residential facade family on BZ_M1:north resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.80m, bays=1, pattern=W, doors=0/0, balconies=0, windows=1 glass / 2 dark / 0 shuttered
    logic: Facade grid uses 1 bays across 1.80m usable length with 1.80m bay width. No ground doors because wall role main_side_window_only suppresses frontage openings. 1 window column(s) with accent columns [0]. No balconies because preset residential_quiet does not enable balcony stacks.
- Notes: Main Hall South exposed north face.

### WALL_BLDG_B_FRONT — Building B Front Wall

- Source face: `BZ_M1:east`
- Short label: `B-F`
- Owner: `BLDG_B`
- Visible span: 2 segment(s), total 15.00m
- Segment spans: #1 y=14.00-24.50m; #2 y=27.50-32.00m
- Adjacent gaps: Mid Cut B (y=24.50-27.50m)
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `residential_quiet`
- Facade family: `residential`
- Balcony style: `residential_parapet`
- Wall material: `ph_aged_plaster_ochre`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 3 glass windows, 6 dark windows, 0 shuttered windows
- Door logic: #1 1 ground door column(s) derived from wall role main_frontage. #2 No ground doors because 3.80m usable length does not reach the frontage threshold.
- Window logic: #1 2 window column(s) with accent columns [0, 2]. #2 1 window column(s) with accent columns [0].
- Balcony logic: #1 No balconies because preset residential_quiet does not enable balcony stacks. #2 No balconies because preset residential_quiet does not enable balcony stacks.
- Texture logic: residential facade family on BZ_M1:east resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: cover x1, open-node x1, shopfront x7, signage x3
- Anchor IDs: `M1_SHOP_R_01`, `M1_SHOP_R_02`, `M1_SHOP_R_03`, `M1_SHOP_R_04`, `M1_SHOP_R_05`, `M1_SHOP_R_06`, `M1_SHOP_R_07`, `M1_SIGN_R_01`, `M1_SIGN_R_02`, `M1_SIGN_R_03`, `NODE_M1_OPEN_01`, `PP_M1_EAST_NEAR_CUT`
- Segment breakdown:
  - #1: usable=9.80m, bays=3, pattern=W D W, doors=1/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 9.80m usable length with 3.27m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [0, 2]. No balconies because preset residential_quiet does not enable balcony stacks.
  - #2: usable=3.80m, bays=1, pattern=W, doors=0/0, balconies=0, windows=1 glass / 2 dark / 0 shuttered
    logic: Facade grid uses 1 bays across 3.80m usable length with 3.80m bay width. No ground doors because 3.80m usable length does not reach the frontage threshold. 1 window column(s) with accent columns [0]. No balconies because preset residential_quiet does not enable balcony stacks.
- Notes: Residential-leaning east frontage for Main Hall South.

### WALL_BLDG_A_FRONT — Building A Front Wall

- Source face: `BZ_M1:west`
- Short label: `A-F`
- Owner: `BLDG_A`
- Visible span: 2 segment(s), total 15.00m
- Segment spans: #1 y=14.00-24.50m; #2 y=27.50-32.00m
- Adjacent gaps: Mid Cut A (y=24.50-27.50m)
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `merchant_rhythm`
- Facade family: `merchant`
- Balcony style: `merchant_ledge`
- Wall material: `ph_lime_plaster_sun`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_lime_soft`
- Balcony texture: `tm_balcony_wood_dark`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 1 glass windows, 2 dark windows, 6 shuttered windows
- Door logic: #1 1 ground door column(s) derived from wall role main_frontage. #2 No ground doors because 3.80m usable length does not reach the frontage threshold.
- Window logic: #1 2 window column(s) with accent columns [0, 2]. #2 1 window column(s) with accent columns [0].
- Balcony logic: #1 No balconies because preset merchant_rhythm does not enable balcony stacks. #2 No balconies because preset merchant_rhythm does not enable balcony stacks.
- Texture logic: merchant facade family on BZ_M1:west resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_lime_soft`.
- Anchor summary: canopy x1, cover x1, shopfront x7, signage x4
- Anchor IDs: `CLOTH_SPAN_01`, `M1_SHOP_L_01`, `M1_SHOP_L_02`, `M1_SHOP_L_03`, `M1_SHOP_L_04`, `M1_SHOP_L_05`, `M1_SHOP_L_06`, `M1_SHOP_L_07`, `M1_SIGN_L_01`, `M1_SIGN_L_02`, `M1_SIGN_L_03`, `M1_SIGN_L_04`, `PP_M1_WEST_NEAR_CUT`
- Segment breakdown:
  - #1: usable=9.80m, bays=3, pattern=W D W, doors=1/0, balconies=0, windows=0 glass / 2 dark / 4 shuttered
    logic: Facade grid uses 3 bays across 9.80m usable length with 3.27m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [0, 2]. No balconies because preset merchant_rhythm does not enable balcony stacks.
  - #2: usable=3.80m, bays=1, pattern=W, doors=0/0, balconies=0, windows=1 glass / 0 dark / 2 shuttered
    logic: Facade grid uses 1 bays across 3.80m usable length with 3.80m bay width. No ground doors because 3.80m usable length does not reach the frontage threshold. 1 window column(s) with accent columns [0]. No balconies because preset merchant_rhythm does not enable balcony stacks.
- Notes: Merchant-heavy west frontage for Main Hall South.

### WALL_AREA_MAIN_HALL_JOG_NORTH — Main Hall Jog North Wall

- Source face: `BZ_M2_JOG:north`
- Short label: `MHJ-N`
- Owner: `AREA_MAIN_HALL_JOG`
- Visible span: 1 segment(s), total 1.50m
- Segment spans: #1 x=29.75-31.25m
- Adjacent gaps: Main Hall North (x=22.75-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `main_side_window_only`
- Composition preset: `residential_quiet`
- Facade family: `residential`
- Balcony style: `residential_parapet`
- Wall material: `ph_aged_plaster_ochre`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: residential facade family on BZ_M2_JOG:north resolves wall `ph_aged_plaster_ochre` with balcony material `ph_trim_sanded_01`.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=0.80m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Main Hall Jog exposed north face.

### WALL_AREA_MAIN_HALL_JOG_SOUTH — Main Hall Jog South Wall

- Source face: `BZ_M2_JOG:south`
- Short label: `MHJ-S`
- Owner: `AREA_MAIN_HALL_JOG`
- Visible span: 1 segment(s), total 1.50m
- Segment spans: #1 x=29.75-31.25m
- Adjacent gaps: Main Hall South (x=22.75-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `main_side_window_only`
- Composition preset: `service_blank`
- Facade family: `service`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_beige_002`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: service facade family on BZ_M2_JOG:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_stone_trim_white` / `ph_band_beige_002`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=0.80m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Main Hall Jog exposed south face.

### WALL_BLDG_D_FRONT — Building D Front Wall

- Source face: `BZ_M2_JOG:east`
- Short label: `D-F`
- Owner: `BLDG_D`
- Visible span: 1 segment(s), total 18.00m
- Segment spans: #1 y=32.00-50.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `merchant_hero_stack`
- Facade family: `merchant`
- Balcony style: `hero_cantilever`
- Wall material: `ph_lime_plaster_sun`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `tm_balcony_wood_dark`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 2 upper door openings, 1 balconies, 2 glass windows, 0 dark windows, 2 shuttered windows
- Door logic: #1 1 ground door column(s) derived from wall role main_frontage.
- Window logic: #1 2 window column(s) with accent columns [1, 3].
- Balcony logic: #1 door 2 uses 3 bays (1 left / 1 right)
- Texture logic: merchant facade family on BZ_M2_JOG:east resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Hero trim tier uses the heaviest parapet and trim emphasis with `ph_trim_sanded_01` and `ph_band_beige_001`.
- Anchor summary: cover x1, landmark x1, open-node x1, shopfront x6, signage x2
- Anchor IDs: `LMK_MID_WELL_01`, `M2_SHOP_R_01`, `M2_SHOP_R_02`, `M2_SHOP_R_03`, `M2_SHOP_R_04`, `M2_SHOP_R_05`, `M2_SHOP_R_06`, `M2_SIGN_R_01`, `M2_SIGN_R_02`, `NODE_M2_COURT_01`, `PP_M2_EAST_NEAR_JOG`
- Segment breakdown:
  - #1: usable=17.30m, bays=5, pattern=_ W D W _, doors=1/2, balconies=1, windows=2 glass / 0 dark / 2 shuttered
    logic: Facade grid uses 5 bays across 17.30m usable length with 3.46m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [1, 3]. door 2 uses 3 bays (1 left / 1 right)
- Notes: Hero merchant frontage on the east side of the jog.

### WALL_BLDG_C_FRONT — Building C Front Wall

- Source face: `BZ_M2_JOG:west`
- Short label: `C-F`
- Owner: `BLDG_C`
- Visible span: 1 segment(s), total 18.00m
- Segment spans: #1 y=32.00-50.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `service_blank`
- Facade family: `service`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_beige_002`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 6 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 1 ground door column(s) derived from wall role main_frontage.
- Window logic: #1 2 window column(s) with accent columns [1, 3].
- Balcony logic: #1 No balconies because service frontage resolves balcony style "none".
- Texture logic: service facade family on BZ_M2_JOG:west resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_stone_trim_white` / `ph_band_beige_002`.
- Anchor summary: canopy x1, cover x1, shopfront x5, signage x3
- Anchor IDs: `CLOTH_SPAN_02`, `M2_SHOP_L_01`, `M2_SHOP_L_02`, `M2_SHOP_L_03`, `M2_SHOP_L_04`, `M2_SHOP_L_05`, `M2_SIGN_L_01`, `M2_SIGN_L_02`, `M2_SIGN_L_03`, `PP_M2_WEST_NEAR_JOG`
- Segment breakdown:
  - #1: usable=17.30m, bays=5, pattern=_ W D W _, doors=1/0, balconies=0, windows=6 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 17.30m usable length with 3.46m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [1, 3]. No balconies because service frontage resolves balcony style "none".
- Notes: Service wall on the west side of the jog.

### WALL_AREA_MAIN_HALL_NORTH_SOUTH — Main Hall North South Wall

- Source face: `BZ_M3:south`
- Short label: `MHN-S`
- Owner: `AREA_MAIN_HALL_NORTH`
- Visible span: 1 segment(s), total 2.50m
- Segment spans: #1 x=20.25-22.75m
- Adjacent gaps: Main Hall Jog (x=22.75-29.75m)
- Height: 9.00m (3 stories)
- Wall role: `main_side_window_only`
- Composition preset: `service_blank`
- Facade family: `service`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_stone_trim_white`, light `ph_band_beige_002`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 1 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role main_side_window_only suppresses frontage openings.
- Window logic: #1 1 window column(s) with accent columns [0].
- Balcony logic: #1 No balconies because service frontage resolves balcony style "none".
- Texture logic: service facade family on BZ_M3:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_stone_trim_white` / `ph_band_beige_002`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.80m, bays=1, pattern=W, doors=0/0, balconies=0, windows=2 glass / 1 dark / 0 shuttered
    logic: Facade grid uses 1 bays across 1.80m usable length with 1.80m bay width. No ground doors because wall role main_side_window_only suppresses frontage openings. 1 window column(s) with accent columns [0]. No balconies because service frontage resolves balcony style "none".
- Notes: Main Hall North exposed south face.

### WALL_BLDG_F_FRONT — Building F Front Wall

- Source face: `BZ_M3:east`
- Short label: `F-F`
- Owner: `BLDG_F`
- Visible span: 2 segment(s), total 15.00m
- Segment spans: #1 y=50.00-56.00m; #2 y=59.00-68.00m
- Adjacent gaps: North Cut B (y=56.00-59.00m)
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `merchant_rhythm`
- Facade family: `merchant`
- Balcony style: `merchant_ledge`
- Wall material: `ph_lime_plaster_sun`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_lime_soft`
- Balcony texture: `tm_balcony_wood_dark`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 0 upper door openings, 0 balconies, 1 glass windows, 3 dark windows, 8 shuttered windows
- Door logic: #1 No ground doors because 5.30m usable length does not reach the frontage threshold. #2 1 ground door column(s) derived from wall role main_frontage.
- Window logic: #1 2 window column(s) with accent columns [0, 1]. #2 2 window column(s) with accent columns [0, 2].
- Balcony logic: #1 No balconies because preset merchant_rhythm does not enable balcony stacks. #2 No balconies because preset merchant_rhythm does not enable balcony stacks.
- Texture logic: merchant facade family on BZ_M3:east resolves wall `ph_lime_plaster_sun` with balcony material `tm_balcony_wood_dark`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_lime_soft`.
- Anchor summary: cover x1, landmark x1, open-node x1, shopfront x5, signage x3
- Anchor IDs: `LMK_HERO_ARCH_01`, `M3_SHOP_R_01`, `M3_SHOP_R_02`, `M3_SHOP_R_03`, `M3_SHOP_R_04`, `M3_SHOP_R_05`, `M3_SIGN_R_01`, `M3_SIGN_R_02`, `M3_SIGN_R_03`, `NODE_M3_ARCH_CLEAR_01`, `PP_M3_EAST_NEAR_CUT`
- Segment breakdown:
  - #1: usable=5.30m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=1 glass / 1 dark / 4 shuttered
    logic: Facade grid uses 2 bays across 5.30m usable length with 2.65m bay width. No ground doors because 5.30m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because preset merchant_rhythm does not enable balcony stacks.
  - #2: usable=8.30m, bays=3, pattern=W D W, doors=1/0, balconies=0, windows=0 glass / 2 dark / 4 shuttered
    logic: Facade grid uses 3 bays across 8.30m usable length with 2.77m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [0, 2]. No balconies because preset merchant_rhythm does not enable balcony stacks.
- Notes: Merchant frontage near the arch approach.

### WALL_BLDG_E_FRONT — Building E Front Wall

- Source face: `BZ_M3:west`
- Short label: `E-F`
- Owner: `BLDG_E`
- Visible span: 2 segment(s), total 15.00m
- Segment spans: #1 y=50.00-56.00m; #2 y=59.00-68.00m
- Adjacent gaps: North Cut A (y=56.00-59.00m)
- Height: 9.00m (3 stories)
- Wall role: `main_frontage`
- Composition preset: `residential_balcony_stack`
- Facade family: `residential`
- Balcony style: `residential_parapet`
- Wall material: `ph_whitewashed_brick_dusty`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: `ph_trim_sanded_01`
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 1 ground doors, 2 upper door openings, 1 balconies, 4 glass windows, 6 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because 5.30m usable length does not reach the frontage threshold. #2 1 ground door column(s) derived from wall role main_frontage.
- Window logic: #1 2 window column(s) with accent columns [0, 1]. #2 2 window column(s) with accent columns [0, 2].
- Balcony logic: #1 No balconies because the segment does not provide enough contiguous window bays for a dominant door. #2 door 1 uses 3 bays (1 left / 1 right)
- Texture logic: residential facade family on BZ_M3:west resolves wall `ph_whitewashed_brick_dusty` with balcony material `ph_trim_sanded_01`.
- Trim logic: Accented trim tier keeps base trim and string-course reads with `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: canopy x1, cover x1, shopfront x4, signage x4
- Anchor IDs: `CLOTH_SPAN_03`, `M3_SHOP_L_01`, `M3_SHOP_L_02`, `M3_SHOP_L_03`, `M3_SHOP_L_04`, `M3_SIGN_L_01`, `M3_SIGN_L_02`, `M3_SIGN_L_03`, `M3_SIGN_L_04`, `PP_M3_WEST_NEAR_CUT`
- Segment breakdown:
  - #1: usable=5.30m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 4 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.30m usable length with 2.65m bay width. No ground doors because 5.30m usable length does not reach the frontage threshold. 2 window column(s) with accent columns [0, 1]. No balconies because the segment does not provide enough contiguous window bays for a dominant door.
  - #2: usable=8.30m, bays=3, pattern=W D W, doors=1/2, balconies=1, windows=2 glass / 2 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 8.30m usable length with 2.77m bay width. 1 ground door column(s) derived from wall role main_frontage. 2 window column(s) with accent columns [0, 2]. door 1 uses 3 bays (1 left / 1 right)
- Notes: Residential frontage near the arch approach.

### WALL_AREA_SIDE_HALL_A_NORTH — Side Hall A North Wall

- Source face: `SH_W:north`
- Short label: `SHA-N`
- Owner: `AREA_SIDE_HALL_A`
- Visible span: 1 segment(s), total 6.50m
- Segment spans: #1 x=1.50-8.00m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_W:north resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.80m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.80m usable length with 2.90m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 2 window column(s) with accent columns [0, 1]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall A exposed north face.

### WALL_AREA_SIDE_HALL_A_SOUTH — Side Hall A South Wall

- Source face: `SH_W:south`
- Short label: `SHA-S`
- Owner: `AREA_SIDE_HALL_A`
- Visible span: 1 segment(s), total 6.50m
- Segment spans: #1 x=1.50-8.00m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_W:south resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.80m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.80m usable length with 2.90m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 2 window column(s) with accent columns [0, 1]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall A exposed south face.

### WALL_AREA_SIDE_HALL_A_EAST — Side Hall A East Wall

- Source face: `SH_W:east`
- Short label: `SHA-E`
- Owner: `AREA_SIDE_HALL_A`
- Visible span: 3 segment(s), total 52.00m
- Segment spans: #1 y=12.00-24.50m; #2 y=27.50-56.00m; #3 y=59.00-70.00m
- Adjacent gaps: Connector A (y=10.00-12.00m), Mid Cut A (y=24.50-27.50m), North Cut A (y=56.00-59.00m), Connector C (y=70.00-72.00m)
- Height: 9.00m (3 stories)
- Wall role: `sidehall_back_blank`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_back_blank suppresses frontage openings. #2 No ground doors because wall role sidehall_back_blank suppresses frontage openings. #3 No ground doors because wall role sidehall_back_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role sidehall_back_blank. #2 No window columns selected for wall role sidehall_back_blank. #3 No window columns selected for wall role sidehall_back_blank.
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none". #2 No balconies because side_hall frontage resolves balcony style "none". #3 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_W:east resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.80m, bays=6, pattern=_ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 6 bays across 11.80m usable length with 1.97m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
  - #2: usable=27.80m, bays=13, pattern=_ _ _ _ _ _ _ _ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 13 bays across 27.80m usable length with 2.14m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
  - #3: usable=10.30m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 10.30m usable length with 2.06m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall A exposed east face.

### WALL_BLDG_I_FRONT — Building I Front Wall

- Source face: `SH_W:west`
- Short label: `I-F`
- Owner: `BLDG_I`
- Visible span: 1 segment(s), total 62.00m
- Segment spans: #1 y=10.00-72.00m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 8 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 8 window column(s) with accent columns [11, 12].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_W:west resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: cover x2, service-door x5
- Anchor IDs: `PP_SHW_MID`, `PP_SHW_NORTH`, `SHW_DOOR_01`, `SHW_DOOR_02`, `SHW_DOOR_03`, `SHW_DOOR_04`, `SHW_DOOR_05`
- Segment breakdown:
  - #1: usable=61.30m, bays=24, pattern=_ _ _ _ _ _ _ _ W W W W W W W W _ _ _ _ _ _ _ _, doors=0/0, balconies=0, windows=8 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 24 bays across 61.30m usable length with 2.55m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 8 window column(s) with accent columns [11, 12]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Outer west wall of Side Hall A.

### WALL_AREA_SIDE_HALL_B_NORTH — Side Hall B North Wall

- Source face: `SH_E:north`
- Short label: `SHB-N`
- Owner: `AREA_SIDE_HALL_B`
- Visible span: 1 segment(s), total 6.50m
- Segment spans: #1 x=42.00-48.50m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_E:north resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.80m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.80m usable length with 2.90m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 2 window column(s) with accent columns [0, 1]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall B exposed north face.

### WALL_AREA_SIDE_HALL_B_SOUTH — Side Hall B South Wall

- Source face: `SH_E:south`
- Short label: `SHB-S`
- Owner: `AREA_SIDE_HALL_B`
- Visible span: 1 segment(s), total 6.50m
- Segment spans: #1 x=42.00-48.50m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 2 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 2 window column(s) with accent columns [0, 1].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_E:south resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.80m, bays=2, pattern=W W, doors=0/0, balconies=0, windows=2 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.80m usable length with 2.90m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 2 window column(s) with accent columns [0, 1]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall B exposed south face.

### WALL_BLDG_J_FRONT — Building J Front Wall

- Source face: `SH_E:east`
- Short label: `J-F`
- Owner: `BLDG_J`
- Visible span: 1 segment(s), total 62.00m
- Segment spans: #1 y=10.00-72.00m
- Adjacent gaps: none
- Height: 3.00m (1 stories)
- Wall role: `sidehall_outer_quiet`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 8 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_outer_quiet suppresses frontage openings.
- Window logic: #1 8 window column(s) with accent columns [10, 11].
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_E:east resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: cover x2, service-door x5
- Anchor IDs: `PP_SHE_MID`, `PP_SHE_NORTH`, `SHE_DOOR_01`, `SHE_DOOR_02`, `SHE_DOOR_03`, `SHE_DOOR_04`, `SHE_DOOR_05`
- Segment breakdown:
  - #1: usable=61.30m, bays=22, pattern=_ _ _ _ _ _ _ W W W W W W W W _ _ _ _ _ _ _, doors=0/0, balconies=0, windows=8 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 22 bays across 61.30m usable length with 2.79m bay width. No ground doors because wall role sidehall_outer_quiet suppresses frontage openings. 8 window column(s) with accent columns [10, 11]. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Outer east wall of Side Hall B.

### WALL_AREA_SIDE_HALL_B_WEST — Side Hall B West Wall

- Source face: `SH_E:west`
- Short label: `SHB-W`
- Owner: `AREA_SIDE_HALL_B`
- Visible span: 3 segment(s), total 52.00m
- Segment spans: #1 y=12.00-24.50m; #2 y=27.50-56.00m; #3 y=59.00-70.00m
- Adjacent gaps: Connector B (y=10.00-12.00m), Mid Cut B (y=24.50-27.50m), North Cut B (y=56.00-59.00m), Connector D (y=70.00-72.00m)
- Height: 9.00m (3 stories)
- Wall role: `sidehall_back_blank`
- Composition preset: `service_blank`
- Facade family: `side_hall`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick`
- Trim textures: heavy `ph_sandstone_blocks_05`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_pavement`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role sidehall_back_blank suppresses frontage openings. #2 No ground doors because wall role sidehall_back_blank suppresses frontage openings. #3 No ground doors because wall role sidehall_back_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role sidehall_back_blank. #2 No window columns selected for wall role sidehall_back_blank. #3 No window columns selected for wall role sidehall_back_blank.
- Balcony logic: #1 No balconies because side_hall frontage resolves balcony style "none". #2 No balconies because side_hall frontage resolves balcony style "none". #3 No balconies because side_hall frontage resolves balcony style "none".
- Texture logic: side_hall facade family on SH_E:west resolves wall `ph_whitewashed_brick` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_sandstone_blocks_05` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.80m, bays=6, pattern=_ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 6 bays across 11.80m usable length with 1.97m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
  - #2: usable=27.80m, bays=13, pattern=_ _ _ _ _ _ _ _ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 13 bays across 27.80m usable length with 2.14m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
  - #3: usable=10.30m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 10.30m usable length with 2.06m bay width. No ground doors because wall role sidehall_back_blank suppresses frontage openings. No window columns selected for wall role sidehall_back_blank. No balconies because side_hall frontage resolves balcony style "none".
- Notes: Side Hall B exposed west face.

### WALL_AREA_CONNECTOR_A_NORTH — Connector A North Wall

- Source face: `CONN_SW:north`
- Short label: `CNA-N`
- Owner: `AREA_CONNECTOR_A`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=8.00-14.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_SW:north resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=3, pattern=_ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 5.30m usable length with 1.77m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector A exposed north face.

### WALL_AREA_CONNECTOR_A_SOUTH — Connector A South Wall

- Source face: `CONN_SW:south`
- Short label: `CNA-S`
- Owner: `AREA_CONNECTOR_A`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=8.00-14.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_SW:south resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=3, pattern=_ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 5.30m usable length with 1.77m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector A exposed south face.

### WALL_AREA_CONNECTOR_A_WEST — Connector A West Wall

- Source face: `CONN_SW:west`
- Short label: `CNA-W`
- Owner: `AREA_CONNECTOR_A`
- Visible span: 1 segment(s), total 2.00m
- Segment spans: #1 y=8.00-10.00m
- Adjacent gaps: Side Hall A (y=10.00-12.00m)
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: connector facade family on CONN_SW:west resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Connector A exposed west face.

### WALL_AREA_CONNECTOR_B_NORTH — Connector B North Wall

- Source face: `CONN_SE:north`
- Short label: `CNB-N`
- Owner: `AREA_CONNECTOR_B`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=36.00-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_SE:north resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=2, pattern=_ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.30m usable length with 2.65m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector B exposed north face.

### WALL_AREA_CONNECTOR_B_SOUTH — Connector B South Wall

- Source face: `CONN_SE:south`
- Short label: `CNB-S`
- Owner: `AREA_CONNECTOR_B`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=36.00-42.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_SE:south resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=3, pattern=_ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 5.30m usable length with 1.77m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector B exposed south face.

### WALL_AREA_CONNECTOR_B_EAST — Connector B East Wall

- Source face: `CONN_SE:east`
- Short label: `CNB-E`
- Owner: `AREA_CONNECTOR_B`
- Visible span: 1 segment(s), total 2.00m
- Segment spans: #1 y=8.00-10.00m
- Adjacent gaps: Side Hall B (y=10.00-12.00m)
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: connector facade family on CONN_SE:east resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Connector B exposed east face.

### WALL_AREA_CONNECTOR_C_NORTH — Connector C North Wall

- Source face: `CONN_NW:north`
- Short label: `CNC-N`
- Owner: `AREA_CONNECTOR_C`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=8.00-14.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_NW:north resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=3, pattern=_ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 5.30m usable length with 1.77m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector C exposed north face.

### WALL_AREA_CONNECTOR_C_SOUTH — Connector C South Wall

- Source face: `CONN_NW:south`
- Short label: `CNC-S`
- Owner: `AREA_CONNECTOR_C`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=8.00-14.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_NW:south resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=2, pattern=_ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.30m usable length with 2.65m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector C exposed south face.

### WALL_AREA_CONNECTOR_C_WEST — Connector C West Wall

- Source face: `CONN_NW:west`
- Short label: `CNC-W`
- Owner: `AREA_CONNECTOR_C`
- Visible span: 1 segment(s), total 2.00m
- Segment spans: #1 y=72.00-74.00m
- Adjacent gaps: Side Hall A (y=70.00-72.00m)
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: connector facade family on CONN_NW:west resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Connector C exposed west face.

### WALL_AREA_CONNECTOR_D_NORTH — Connector D North Wall

- Source face: `CONN_NE:north`
- Short label: `CND-N`
- Owner: `AREA_CONNECTOR_D`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=36.00-42.00m
- Adjacent gaps: none
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_NE:north resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=2, pattern=_ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 2 bays across 5.30m usable length with 2.65m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector D exposed north face.

### WALL_AREA_CONNECTOR_D_SOUTH — Connector D South Wall

- Source face: `CONN_NE:south`
- Short label: `CND-S`
- Owner: `AREA_CONNECTOR_D`
- Visible span: 1 segment(s), total 6.00m
- Segment spans: #1 x=36.00-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role connector_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role connector_blank.
- Balcony logic: #1 No balconies because connector frontage resolves balcony style "none".
- Texture logic: connector facade family on CONN_NE:south resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=5.30m, bays=3, pattern=_ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 3 bays across 5.30m usable length with 1.77m bay width. No ground doors because wall role connector_blank suppresses frontage openings. No window columns selected for wall role connector_blank. No balconies because connector frontage resolves balcony style "none".
- Notes: Connector D exposed south face.

### WALL_AREA_CONNECTOR_D_EAST — Connector D East Wall

- Source face: `CONN_NE:east`
- Short label: `CND-E`
- Owner: `AREA_CONNECTOR_D`
- Visible span: 1 segment(s), total 2.00m
- Segment spans: #1 y=72.00-74.00m
- Adjacent gaps: Side Hall B (y=70.00-72.00m)
- Height: 6.00m (2 stories)
- Wall role: `connector_blank`
- Composition preset: `service_blank`
- Facade family: `connector`
- Balcony style: `none`
- Wall material: `ph_whitewashed_brick_cool`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_plastered`
- Balcony texture: none
- Floor context: PBR floor material `cobblestone_color`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No procedural doors; segment is below the minimum frontage length.
- Window logic: #1 No procedural windows; segment is below the minimum facade length.
- Balcony logic: #1 No balcony evaluation; segment is below the minimum facade length.
- Texture logic: connector facade family on CONN_NE:east resolves wall `ph_whitewashed_brick_cool` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_plastered`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=1.30m, bays=0, pattern=n/a, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Segment is too short for a procedural facade grid after edge margins. No procedural doors; segment is below the minimum frontage length. No procedural windows; segment is below the minimum facade length. No balcony evaluation; segment is below the minimum facade length.
- Notes: Connector D exposed east face.

### WALL_AREA_MID_CUT_A_NORTH — Mid Cut A North Wall

- Source face: `CUT_W_MID:north`
- Short label: `MCA-N`
- Owner: `AREA_MID_CUT_A`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=8.00-20.25m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `grey_tiles`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_W_MID:north resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 11.55m usable length with 2.31m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: Mid Cut A exposed north face.

### WALL_AREA_MID_CUT_A_SOUTH — Mid Cut A South Wall

- Source face: `CUT_W_MID:south`
- Short label: `MCA-S`
- Owner: `AREA_MID_CUT_A`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=8.00-20.25m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `grey_tiles`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_W_MID:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=6, pattern=_ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 6 bays across 11.55m usable length with 1.93m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: Mid Cut A exposed south face.

### WALL_AREA_MID_CUT_B_NORTH — Mid Cut B North Wall

- Source face: `CUT_E_MID:north`
- Short label: `MCB-N`
- Owner: `AREA_MID_CUT_B`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=29.75-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `grey_tiles`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_E_MID:north resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 11.55m usable length with 2.31m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: Mid Cut B exposed north face.

### WALL_AREA_MID_CUT_B_SOUTH — Mid Cut B South Wall

- Source face: `CUT_E_MID:south`
- Short label: `MCB-S`
- Owner: `AREA_MID_CUT_B`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=29.75-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `grey_tiles`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_E_MID:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 11.55m usable length with 2.31m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: Mid Cut B exposed south face.

### WALL_AREA_NORTH_CUT_A_NORTH — North Cut A North Wall

- Source face: `CUT_W_NORTH:north`
- Short label: `NCA-N`
- Owner: `AREA_NORTH_CUT_A`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=8.00-20.25m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `sand_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_W_NORTH:north resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=6, pattern=_ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 6 bays across 11.55m usable length with 1.93m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: North Cut A exposed north face.

### WALL_AREA_NORTH_CUT_A_SOUTH — North Cut A South Wall

- Source face: `CUT_W_NORTH:south`
- Short label: `NCA-S`
- Owner: `AREA_NORTH_CUT_A`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=8.00-20.25m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `sand_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_W_NORTH:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=6, pattern=_ _ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 6 bays across 11.55m usable length with 1.93m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: North Cut A exposed south face.

### WALL_AREA_NORTH_CUT_B_NORTH — North Cut B North Wall

- Source face: `CUT_E_NORTH:north`
- Short label: `NCB-N`
- Owner: `AREA_NORTH_CUT_B`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=29.75-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `sand_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_E_NORTH:north resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 11.55m usable length with 2.31m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: North Cut B exposed north face.

### WALL_AREA_NORTH_CUT_B_SOUTH — North Cut B South Wall

- Source face: `CUT_E_NORTH:south`
- Short label: `NCB-S`
- Owner: `AREA_NORTH_CUT_B`
- Visible span: 1 segment(s), total 12.25m
- Segment spans: #1 x=29.75-42.00m
- Adjacent gaps: none
- Height: 9.00m (3 stories)
- Wall role: `cut_blank`
- Composition preset: `service_blank`
- Facade family: `cut`
- Balcony style: `none`
- Wall material: `ph_beige_wall_002`
- Trim textures: heavy `ph_trim_sanded_01`, light `ph_band_beige_001`
- Balcony texture: none
- Floor context: PBR floor material `sand_01`
- Opening totals: 0 ground doors, 0 upper door openings, 0 balconies, 0 glass windows, 0 dark windows, 0 shuttered windows
- Door logic: #1 No ground doors because wall role cut_blank suppresses frontage openings.
- Window logic: #1 No window columns selected for wall role cut_blank.
- Balcony logic: #1 No balconies because cut frontage resolves balcony style "none".
- Texture logic: cut facade family on CUT_E_NORTH:south resolves wall `ph_beige_wall_002` with balcony material none.
- Trim logic: Restrained trim tier minimizes banding and keeps trims on `ph_trim_sanded_01` / `ph_band_beige_001`.
- Anchor summary: none
- Segment breakdown:
  - #1: usable=11.55m, bays=5, pattern=_ _ _ _ _, doors=0/0, balconies=0, windows=0 glass / 0 dark / 0 shuttered
    logic: Facade grid uses 5 bays across 11.55m usable length with 2.31m bay width. No ground doors because wall role cut_blank suppresses frontage openings. No window columns selected for wall role cut_blank. No balconies because cut frontage resolves balcony style "none".
- Notes: North Cut B exposed south face.

