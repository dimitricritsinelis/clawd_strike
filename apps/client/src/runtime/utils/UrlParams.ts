const DEFAULT_MAP_ID = "bazaar-map";
const DEFAULT_PROP_PROFILE = "subtle";
const DEFAULT_FLOOR_QUALITY = "4k";
export const PLAYER_NAME_MAX_LENGTH = 15;

export type RuntimeSpawnId = "A" | "B";
export type RuntimeControlMode = "human" | "agent";
export type RuntimePropProfile = "subtle" | "medium" | "high";
export type RuntimeFloorMode = "blockout" | "pbr";
export type RuntimeWallMode = "blockout" | "pbr";
export type RuntimeFloorQuality = "1k" | "2k" | "4k";
export type RuntimeLightingPreset = "golden" | "flat";
export type RuntimePropVisualMode = "blockout" | "bazaar";
export type RuntimePropChaosOptions = {
  profile: RuntimePropProfile;
  jitter: number | null;
  cluster: number | null;
  density: number | null;
};

export type RuntimeUrlParams = {
  mapId: string;
  controlMode: RuntimeControlMode;
  playerName: string;
  shot: string | null;
  spawn: RuntimeSpawnId;
  debug: boolean;
  perf: boolean;
  highVis: boolean;
  vm: boolean;
  vmDebug: boolean;
  anchors: boolean;
  labels: boolean;
  anchorTypes: string[];
  seed: number | null;
  floorMode: RuntimeFloorMode;
  wallMode: RuntimeWallMode;
  wallDetails: boolean;
  wallDetailDensity: number | null;
  floorQuality: RuntimeFloorQuality;
  lightingPreset: RuntimeLightingPreset;
  propVisuals: RuntimePropVisualMode;
  propChaos: RuntimePropChaosOptions;
  unlimitedHealth: boolean;
};

function parseBooleanFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseBooleanFlagWithDefault(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return parseBooleanFlag(value);
}

function parseAnchorTypes(value: string | null): string[] {
  if (!value) return [];

  const normalized = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  if (normalized.length === 0) return [];
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function parseSeed(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[-+]?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parsePropProfile(value: string | null): RuntimePropProfile {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "subtle" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return DEFAULT_PROP_PROFILE;
}

function parseUnitFloat(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function parseDensityScale(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(2, parsed));
}

function parseFloorMode(value: string | null): RuntimeFloorMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "blockout") return "blockout";
  return "pbr";
}

function parseWallMode(value: string | null): RuntimeWallMode {
  return value?.trim().toLowerCase() === "blockout" ? "blockout" : "pbr";
}

function parseFloorQuality(value: string | null): RuntimeFloorQuality {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "4k") {
    return normalized;
  }
  return DEFAULT_FLOOR_QUALITY;
}

function parseLightingPreset(value: string | null): RuntimeLightingPreset {
  return value?.trim().toLowerCase() === "flat" ? "flat" : "golden";
}

function parsePropVisualMode(value: string | null): RuntimePropVisualMode {
  return value?.trim().toLowerCase() === "bazaar" ? "bazaar" : "blockout";
}

function getParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) return value;
  }
  return null;
}

function parseControlMode(modeValue: string | null, autostartValue: string | null): RuntimeControlMode {
  const mode = modeValue?.trim().toLowerCase();
  if (mode === "human" || mode === "agent") {
    return mode;
  }

  const autostart = autostartValue?.trim().toLowerCase();
  if (autostart === "agent") {
    return "agent";
  }
  return "human";
}

export function sanitizeRuntimePlayerName(
  value: string | null | undefined,
  mode: RuntimeControlMode,
): string {
  const fallback = mode === "agent" ? "Agent" : "Operator";
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, PLAYER_NAME_MAX_LENGTH);
}

export function parseRuntimeUrlParams(search: string): RuntimeUrlParams {
  const params = new URLSearchParams(search);
  const rawMapId = getParam(params, "map");
  const rawControlMode = getParam(params, "mode", "controlMode");
  const rawAutostart = getParam(params, "autostart");
  const rawPlayerName = getParam(params, "name", "player", "playerName");
  const rawShot = getParam(params, "shot");
  const rawSpawn = getParam(params, "spawn");
  const rawDebug = getParam(params, "debug");
  const rawPerf = getParam(params, "perf");
  const rawHighVis = getParam(params, "high-vis", "highvis");
  const rawVm = getParam(params, "vm");
  const rawVmDebug = getParam(params, "vm-debug", "vmDebug");
  const rawAnchors = getParam(params, "anchors");
  const rawLabels = getParam(params, "labels");
  const rawAnchorTypes = getParam(params, "anchor-types", "anchorTypes");
  const rawSeed = getParam(params, "seed");
  const rawFloors = getParam(params, "floors");
  const rawWalls = getParam(params, "walls");
  const rawFloorRes = getParam(params, "floorRes", "floor-res");
  const rawLighting = getParam(params, "lighting");
  const rawWallDetails = getParam(params, "wallDetails", "wall-details");
  const rawWallDetailDensity = getParam(params, "wallDetailDensity", "wall-detail-density");
  const rawProps = getParam(params, "props", "propVisuals", "prop-visuals");
  const rawPropProfile = getParam(params, "prop-profile", "propProfile");
  const rawPropJitter = getParam(params, "prop-jitter", "propJitter");
  const rawPropCluster = getParam(params, "prop-cluster", "propCluster");
  const rawPropDensity = getParam(params, "prop-density", "propDensity");
  const rawUnlimitedHealth = getParam(params, "unlimitedHealth", "god", "godMode");

  const mapId = rawMapId && rawMapId.trim().length > 0 ? rawMapId.trim() : DEFAULT_MAP_ID;
  const controlMode = parseControlMode(rawControlMode, rawAutostart);
  const playerName = sanitizeRuntimePlayerName(rawPlayerName, controlMode);
  const shot = rawShot && rawShot.trim().length > 0 ? rawShot.trim() : null;
  const spawn = rawSpawn?.trim().toUpperCase() === "B" ? "B" : "A";
  const debug = parseBooleanFlag(rawDebug);
  const perf = parseBooleanFlag(rawPerf);
  const highVis = parseBooleanFlag(rawHighVis);
  const vm = parseBooleanFlagWithDefault(rawVm, true);
  const vmDebug = parseBooleanFlag(rawVmDebug);
  const anchors = parseBooleanFlag(rawAnchors);
  const labels = parseBooleanFlag(rawLabels);
  const anchorTypes = parseAnchorTypes(rawAnchorTypes);
  const seed = parseSeed(rawSeed);
  const floorMode = parseFloorMode(rawFloors);
  const wallMode = parseWallMode(rawWalls);
  const wallDetails = parseBooleanFlagWithDefault(rawWallDetails, true);
  const wallDetailDensity = parseDensityScale(rawWallDetailDensity);
  const floorQuality = parseFloorQuality(rawFloorRes);
  const lightingPreset = parseLightingPreset(rawLighting);
  const propVisuals = parsePropVisualMode(rawProps);
  const propChaos: RuntimePropChaosOptions = {
    profile: parsePropProfile(rawPropProfile),
    jitter: parseUnitFloat(rawPropJitter),
    cluster: parseUnitFloat(rawPropCluster),
    density: parseUnitFloat(rawPropDensity),
  };
  const unlimitedHealth = parseBooleanFlag(rawUnlimitedHealth);

  return {
    mapId,
    controlMode,
    playerName,
    shot,
    spawn,
    debug,
    perf,
    highVis,
    vm,
    vmDebug,
    anchors,
    labels,
    anchorTypes,
    seed,
    floorMode,
    wallMode,
    wallDetails,
    wallDetailDensity,
    floorQuality,
    lightingPreset,
    propVisuals,
    propChaos,
    unlimitedHealth,
  };
}
