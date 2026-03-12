export type BuffType = "speed_boost" | "rapid_fire" | "unlimited_ammo" | "health_boost";

export type BuffDefinition = {
  type: BuffType;
  name: string;
  durationS: number;
  iconPath: string;
  orbColor: number;
  orbEmissive: number;
  vignetteColor: string; // CSS rgba base color
};

export const BUFF_DEFINITIONS: Record<BuffType, BuffDefinition> = {
  speed_boost: {
    type: "speed_boost",
    name: "Adrenaline Rush",
    durationS: 10,
    iconPath: "/assets/ui/buffs/speed_boost.png",
    orbColor: 0x00ccff,
    orbEmissive: 0x0088ff,
    vignetteColor: "0, 204, 255",
  },
  rapid_fire: {
    type: "rapid_fire",
    name: "Bloodlust",
    durationS: 10,
    iconPath: "/assets/ui/buffs/rapid_fire.png",
    orbColor: 0xcc66ff,
    orbEmissive: 0x9933cc,
    vignetteColor: "204, 102, 255",
  },
  unlimited_ammo: {
    type: "unlimited_ammo",
    name: "Bottomless Mag",
    durationS: 10,
    iconPath: "/assets/ui/buffs/unlimited_ammo.png",
    orbColor: 0xffcc00,
    orbEmissive: 0xffaa00,
    vignetteColor: "255, 204, 0",
  },
  health_boost: {
    type: "health_boost",
    name: "Iron Skin",
    durationS: 10,
    iconPath: "/assets/ui/buffs/health_boost.png",
    orbColor: 0x44ff44,
    orbEmissive: 0x22cc22,
    vignetteColor: "68, 255, 68",
  },
};

/** Rallying Cry vignette color (red-orange) */
export const RALLYING_CRY_VIGNETTE_COLOR = "255, 68, 0";
export const RALLYING_CRY_ICON_PATH = "/assets/ui/buffs/rallying_cry.png";
export const RALLYING_CRY_NAME = "Rallying Cry of the Dragonslayer";

export const BUFF_TYPES: readonly BuffType[] = [
  "speed_boost", "rapid_fire", "unlimited_ammo", "health_boost",
] as const;

/** Orb 3D parameters */
export const ORB_RADIUS_M = 0.35;
export const ORB_BOB_AMPLITUDE_M = 0.15;
export const ORB_BOB_FREQUENCY_HZ = 1.2;
export const ORB_SPIN_RAD_PER_S = Math.PI;
export const ORB_PICKUP_RADIUS_M = 1.0;
export const ORB_LIFETIME_S = 15;
export const ORB_SPAWN_HEIGHT_OFFSET_M = 0.6;
