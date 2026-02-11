import type { SurfaceTag, Team } from "../net/protocol";
import type { Vec3 } from "../math/vec3";
import { v3 } from "../math/vec3";

export type AABB = Readonly<{
  id: string;
  min: Vec3;
  max: Vec3;
  surface: SurfaceTag;
}>;

export type AABB2 = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>;

export type SpawnPoint = Readonly<{
  team: Team;
  pos: Vec3;
  yaw: number;
}>;

export type BombsiteId = "A" | "B";

export type Bombsite = Readonly<{
  id: BombsiteId;
  aabb: AABB2;
}>;

export type MapPoint = Readonly<{
  id: string;
  pos: Vec3;
}>;

export type MapDef = Readonly<{
  id: string;
  bounds: AABB2;
  colliders: readonly AABB[];
  spawns: readonly SpawnPoint[];
  bombsites: readonly Bombsite[];
  nav: Readonly<{
    cellSize: number;
    sampleY: number;
  }>;
  points: readonly MapPoint[];
}>;

// Dust2-inspired slice with AABB-only collision and 6 regions + 2 connectors.
export const dust2Slice: MapDef = {
  id: "dust2_slice",
  bounds: { minX: -72, minZ: -68, maxX: 72, maxZ: 68 },
  nav: { cellSize: 1.25, sampleY: 0.05 },
  colliders: [
    // Floor: top must stay at y=0 so nav sampling at +Y works.
    { id: "floor", min: v3(-72, -0.2, -68), max: v3(72, 0, 68), surface: "sand" },
    { id: "floor_mid_stone", min: v3(-18, -0.05, -14), max: v3(22, 0, 16), surface: "stone" },
    { id: "floor_bazaar_concrete", min: v3(-10, -0.05, 12), max: v3(10, 0, 46), surface: "concrete" },
    { id: "floor_b_site_metal", min: v3(30, -0.05, -46), max: v3(46, 0, -30), surface: "metal" },
    { id: "floor_west_wood", min: v3(-56, -0.05, -4), max: v3(-30, 0, 14), surface: "wood" },

    // Perimeter shell.
    { id: "perim_n", min: v3(-72, 0, 66.8), max: v3(72, 9, 68), surface: "stone" },
    { id: "perim_s", min: v3(-72, 0, -68), max: v3(72, 9, -66.8), surface: "stone" },
    { id: "perim_w", min: v3(-72, 0, -68), max: v3(-70.8, 9, 68), surface: "stone" },
    { id: "perim_e", min: v3(70.8, 0, -68), max: v3(72, 9, 68), surface: "stone" },

    // Spawn-blocking architecture for LOS control.
    { id: "t_block_0", min: v3(-69, 0, -66), max: v3(-46, 7, -44), surface: "stone" },
    { id: "t_block_1", min: v3(-58, 0, -50), max: v3(-36, 7, -34), surface: "stone" },
    { id: "t_block_2", min: v3(-66, 0, -36), max: v3(-50, 6.5, -22), surface: "stone" },
    { id: "ct_block_0", min: v3(46, 0, 44), max: v3(69, 7, 66), surface: "stone" },
    { id: "ct_block_1", min: v3(36, 0, 34), max: v3(58, 7, 50), surface: "stone" },
    { id: "ct_block_2", min: v3(50, 0, 22), max: v3(66, 6.5, 36), surface: "stone" },

    // A site (northwest, interior-ish). Entrances via south and east voids.
    { id: "a_shell_w", min: v3(-66, 0, 18), max: v3(-60, 8, 60), surface: "stone" },
    { id: "a_shell_n", min: v3(-66, 0, 58), max: v3(-24, 8, 60), surface: "stone" },
    { id: "a_shell_e_north", min: v3(-26, 0, 40), max: v3(-20, 8, 60), surface: "stone" },
    { id: "a_shell_e_south", min: v3(-26, 0, 18), max: v3(-20, 8, 30), surface: "stone" },
    { id: "a_interior_mass", min: v3(-50, 0, 42), max: v3(-36, 6.5, 56), surface: "stone" },
    { id: "a_cover_box_0", min: v3(-44, 0, 22), max: v3(-39, 1.2, 27), surface: "concrete" },
    { id: "a_cover_box_1", min: v3(-33, 0, 20), max: v3(-28, 1.2, 25), surface: "concrete" },
    { id: "a_cover_sandbags", min: v3(-55, 0, 42), max: v3(-49, 1.1, 45), surface: "sand" },

    // B site (southeast, open courtyard). Entrances via north-west and west-mid voids.
    { id: "b_shell_s", min: v3(16, 0, -60), max: v3(64, 8, -54), surface: "stone" },
    { id: "b_shell_e", min: v3(58, 0, -60), max: v3(64, 8, -16), surface: "stone" },
    { id: "b_shell_n_east", min: v3(40, 0, -22), max: v3(64, 8, -16), surface: "stone" },
    { id: "b_shell_n_west", min: v3(16, 0, -22), max: v3(30, 8, -16), surface: "stone" },
    { id: "b_shell_w_south", min: v3(16, 0, -60), max: v3(22, 8, -44), surface: "stone" },
    { id: "b_shell_w_north", min: v3(16, 0, -36), max: v3(22, 8, -16), surface: "stone" },
    { id: "b_cover_box_0", min: v3(22, 0, -34), max: v3(25, 1.2, -28), surface: "concrete" },
    { id: "b_cover_box_1", min: v3(54, 0, -35), max: v3(58, 1.2, -29), surface: "concrete" },
    { id: "b_cover_sandbags", min: v3(38, 0, -56), max: v3(44, 1.1, -53), surface: "sand" },

    // Mid courtyard and sightline breakers.
    { id: "mid_landmark_base", min: v3(-4, 0, -4), max: v3(4, 1.25, 4), surface: "stone" },
    { id: "mid_cover_w", min: v3(-16, 0, 6), max: v3(-10, 1.2, 12), surface: "concrete" },
    { id: "mid_cover_e", min: v3(10, 0, -12), max: v3(16, 1.2, -6), surface: "concrete" },
    { id: "mid_mass_nw", min: v3(-22, 0, 10), max: v3(-8, 6.5, 20), surface: "stone" },
    { id: "mid_mass_se", min: v3(8, 0, -20), max: v3(22, 6.5, -10), surface: "stone" },

    // Bazaar corridor north of mid.
    { id: "bazaar_w", min: v3(-10, 0, 12), max: v3(-8, 6, 46), surface: "stone" },
    { id: "bazaar_e", min: v3(8, 0, 12), max: v3(10, 6, 46), surface: "stone" },
    { id: "bazaar_col_0", min: v3(-3.5, 0, 18), max: v3(-1.5, 3.6, 20), surface: "stone" },
    { id: "bazaar_col_1", min: v3(1.5, 0, 26), max: v3(3.5, 3.6, 28), surface: "stone" },
    { id: "bazaar_col_2", min: v3(-3.5, 0, 34), max: v3(-1.5, 3.6, 36), surface: "stone" },
    { id: "bazaar_col_3", min: v3(1.5, 0, 42), max: v3(3.5, 3.6, 44), surface: "stone" },

    // West alley with S-chicane (no end-to-end LOS).
    { id: "west_chicane_0", min: v3(-56, 0, -12), max: v3(-36, 7, 8), surface: "stone" },
    { id: "west_chicane_1", min: v3(-48, 0, 10), max: v3(-28, 7, 26), surface: "stone" },
    { id: "west_cover_0", min: v3(-34, 0, 4), max: v3(-29, 1.2, 8), surface: "concrete" },

    // East street: longer with partial cover.
    { id: "east_mass_0", min: v3(20, 0, -8), max: v3(42, 7, 8), surface: "stone" },
    { id: "east_mass_1", min: v3(44, 0, 10), max: v3(62, 7, 26), surface: "stone" },
    { id: "east_cover_0", min: v3(48, 0, -2), max: v3(54, 1.2, 4), surface: "concrete" },
    { id: "east_cover_1", min: v3(30, 0, 16), max: v3(36, 1.2, 22), surface: "concrete" },

    // Site approach connective blocks to enforce route rhythm.
    { id: "connector_north_mass", min: v3(14, 0, 34), max: v3(30, 6.5, 50), surface: "stone" },
    { id: "connector_south_mass", min: v3(-24, 0, -34), max: v3(-8, 6.5, -18), surface: "stone" }
  ],
  spawns: [
    // T spawn (southwest)
    { team: "T", pos: v3(-36, 0, -62), yaw: 0.2 },
    { team: "T", pos: v3(-32, 0, -60), yaw: 0.25 },
    { team: "T", pos: v3(-28, 0, -62), yaw: 0.22 },
    { team: "T", pos: v3(-34, 0, -56), yaw: 0.27 },
    { team: "T", pos: v3(-30, 0, -56), yaw: 0.25 },

    // CT spawn (northeast)
    { team: "CT", pos: v3(36, 0, 62), yaw: -2.9 },
    { team: "CT", pos: v3(32, 0, 60), yaw: -2.85 },
    { team: "CT", pos: v3(28, 0, 62), yaw: -2.88 },
    { team: "CT", pos: v3(34, 0, 56), yaw: -2.84 },
    { team: "CT", pos: v3(30, 0, 56), yaw: -2.86 }
  ],
  bombsites: [
    { id: "A", aabb: { minX: -56, minZ: 28, maxX: -30, maxZ: 40 } },
    { id: "B", aabb: { minX: 26, minZ: -52, maxX: 52, maxZ: -28 } }
  ],
  points: [
    { id: "t_spawn", pos: v3(-32, 0, -60) },
    { id: "ct_spawn", pos: v3(32, 0, 60) },
    { id: "mid", pos: v3(0, 0, 8) },
    { id: "a_site", pos: v3(-43, 0, 31) },
    { id: "b_site", pos: v3(39, 0, -40) },
    { id: "bazaar_mid", pos: v3(0, 0, 30) },
    { id: "west_alley_entry", pos: v3(-58, 0, -20) },
    { id: "west_alley_bend", pos: v3(-26, 0, 12) },
    { id: "west_alley_exit", pos: v3(-24, 0, 30) },
    { id: "east_street_entry", pos: v3(26, 0, -14) },
    { id: "east_street_mid", pos: v3(48, 0, 8) },
    { id: "east_street_exit", pos: v3(60, 0, 30) }
  ]
};

/** @deprecated Internal compatibility export retained for one cleanup cycle. */
export const mapsById: Readonly<Record<string, MapDef>> = {
  [dust2Slice.id]: dust2Slice
};
