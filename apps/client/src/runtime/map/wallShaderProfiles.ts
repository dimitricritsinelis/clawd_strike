import type { WallShaderTweakOptions } from "../render/materials/applyWallShaderTweaks";

export type WallShaderSurfaceKind = "wall" | "detail" | "balcony";

const BRICK_MASONRY_IDS = new Set([
  "ph_brick_4_desert",
]);

const SUN_WASHED_PLASTER_IDS = new Set([
  "ph_whitewashed_brick_warm",
  "ph_whitewashed_brick_dusty",
  "ph_lime_plaster_sun",
]);

const AGED_PLASTER_IDS = new Set([
  "ph_whitewashed_brick",
  "ph_whitewashed_brick_cool",
  "ph_aged_plaster_ochre",
  "ph_plastered_wall",
  "ph_beige_wall_002",
]);

const SOFT_TRIM_IDS = new Set([
  "ph_trim_sanded_01",
  "ph_band_lime_soft",
  "ph_band_beige_001",
  "ph_band_beige_002",
  "ph_band_plastered",
  "ph_stone_trim_white",
]);

export function resolveWallShaderProfile(
  materialId: string,
  surfaceKind: WallShaderSurfaceKind,
): Partial<WallShaderTweakOptions> {
  if (BRICK_MASONRY_IDS.has(materialId)) {
    return {
      macroColorAmplitude: surfaceKind === "wall" ? 0.05 : 0.035,
      macroRoughnessAmplitude: surfaceKind === "wall" ? 0.06 : 0.04,
      macroFrequency: surfaceKind === "wall" ? 0.09 : 0.11,
      topBleachAmount: surfaceKind === "balcony" ? 0.015 : 0.025,
      topBleachStartY: surfaceKind === "wall" ? 2.6 : 0.45,
      topBleachHeightM: surfaceKind === "wall" ? 2.4 : 0.7,
      topBleachColor: "#efe0c6",
      dustColor: "#c9ad82",
      dustColorAmount: surfaceKind === "balcony" ? 0.045 : 0.09,
      dirtEnabled: true,
      dirtHeightM: surfaceKind === "balcony" ? 0.5 : 1.65,
      dirtDarken: surfaceKind === "balcony" ? 0.09 : 0.18,
      dirtRoughnessBoost: surfaceKind === "balcony" ? 0.1 : 0.17,
      ...(surfaceKind !== "wall"
        ? {
            contactDarkenAmount: surfaceKind === "balcony" ? 0.16 : 0.14,
            contactDarkenDepth: surfaceKind === "balcony" ? 0.22 : 0.18,
            useLocalCoords: true,
          }
        : {}),
    };
  }

  if (SUN_WASHED_PLASTER_IDS.has(materialId)) {
    return {
      macroColorAmplitude: surfaceKind === "wall" ? 0.07 : 0.05,
      macroRoughnessAmplitude: surfaceKind === "wall" ? 0.08 : 0.05,
      macroFrequency: surfaceKind === "wall" ? 0.1 : 0.12,
      topBleachAmount: surfaceKind === "balcony" ? 0.03 : 0.06,
      topBleachStartY: surfaceKind === "wall" ? 2.2 : 0.35,
      topBleachHeightM: surfaceKind === "wall" ? 3.8 : 0.9,
      topBleachColor: "#f2e7d4",
      dustColor: "#d8c3a0",
      dustColorAmount: surfaceKind === "balcony" ? 0.05 : 0.08,
      dirtEnabled: true,
      dirtHeightM: surfaceKind === "balcony" ? 0.55 : 1.45,
      dirtDarken: surfaceKind === "balcony" ? 0.08 : 0.12,
      dirtRoughnessBoost: surfaceKind === "balcony" ? 0.1 : 0.16,
      ...(surfaceKind !== "wall"
        ? {
            contactDarkenAmount: surfaceKind === "balcony" ? 0.14 : 0.1,
            contactDarkenDepth: surfaceKind === "balcony" ? 0.22 : 0.16,
            useLocalCoords: true,
          }
        : {}),
    };
  }

  if (AGED_PLASTER_IDS.has(materialId)) {
    return {
      macroColorAmplitude: surfaceKind === "wall" ? 0.06 : 0.04,
      macroRoughnessAmplitude: surfaceKind === "wall" ? 0.06 : 0.04,
      macroFrequency: surfaceKind === "wall" ? 0.12 : 0.14,
      topBleachAmount: 0.03,
      topBleachStartY: surfaceKind === "wall" ? 2.5 : 0.4,
      topBleachHeightM: surfaceKind === "wall" ? 3.0 : 0.8,
      topBleachColor: "#efe1cb",
      dustColor: "#cfb18b",
      dustColorAmount: surfaceKind === "balcony" ? 0.04 : 0.06,
      dirtEnabled: true,
      dirtHeightM: surfaceKind === "balcony" ? 0.5 : 1.25,
      dirtDarken: surfaceKind === "balcony" ? 0.06 : 0.1,
      dirtRoughnessBoost: surfaceKind === "balcony" ? 0.08 : 0.13,
      ...(surfaceKind !== "wall"
        ? {
            contactDarkenAmount: surfaceKind === "balcony" ? 0.12 : 0.08,
            contactDarkenDepth: surfaceKind === "balcony" ? 0.2 : 0.14,
            useLocalCoords: true,
          }
        : {}),
    };
  }

  if (SOFT_TRIM_IDS.has(materialId)) {
    return {
      macroColorAmplitude: surfaceKind === "balcony" ? 0.03 : 0.025,
      macroRoughnessAmplitude: surfaceKind === "balcony" ? 0.04 : 0.03,
      macroFrequency: 0.15,
      dustColor: "#d6c19e",
      dustColorAmount: surfaceKind === "balcony" ? 0.035 : 0.025,
      dirtEnabled: true,
      dirtHeightM: surfaceKind === "balcony" ? 0.45 : 0.7,
      dirtDarken: surfaceKind === "balcony" ? 0.05 : 0.035,
      dirtRoughnessBoost: 0.08,
      ...(surfaceKind !== "wall"
        ? {
            contactDarkenAmount: surfaceKind === "balcony" ? 0.1 : 0.06,
            contactDarkenDepth: surfaceKind === "balcony" ? 0.16 : 0.1,
            useLocalCoords: true,
          }
        : {}),
    };
  }

  return {};
}
