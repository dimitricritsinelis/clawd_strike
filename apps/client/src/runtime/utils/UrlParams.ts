const DEFAULT_MAP_ID = "bazaar-map";
const DEFAULT_PROP_PROFILE = "subtle";
const DEFAULT_FLOOR_QUALITY = "2k";

export type RuntimeSpawnId = "A" | "B";
export type RuntimePropProfile = "subtle" | "medium" | "high";
export type RuntimeFloorMode = "blockout" | "pbr";
export type RuntimeFloorQuality = "1k" | "2k";
export type RuntimeLightingPreset = "golden" | "flat";
export type RuntimePropChaosOptions = {
  profile: RuntimePropProfile;
  jitter: number | null;
  cluster: number | null;
  density: number | null;
};

export type RuntimeUrlParams = {
  mapId: string;
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
  floorQuality: RuntimeFloorQuality;
  lightingPreset: RuntimeLightingPreset;
  propChaos: RuntimePropChaosOptions;
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

function parseFloorMode(value: string | null): RuntimeFloorMode {
  return value?.trim().toLowerCase() === "pbr" ? "pbr" : "blockout";
}

function parseFloorQuality(value: string | null): RuntimeFloorQuality {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "1k" || normalized === "2k") {
    return normalized;
  }
  return DEFAULT_FLOOR_QUALITY;
}

function parseLightingPreset(value: string | null): RuntimeLightingPreset {
  return value?.trim().toLowerCase() === "flat" ? "flat" : "golden";
}

function getParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) return value;
  }
  return null;
}

function parsePlayerName(value: string | null): string {
  if (!value) return "Operator";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Operator";
  return trimmed.slice(0, 24);
}

export function parseRuntimeUrlParams(search: string): RuntimeUrlParams {
  const params = new URLSearchParams(search);
  const rawMapId = getParam(params, "map");
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
  const rawFloorRes = getParam(params, "floorRes", "floor-res");
  const rawLighting = getParam(params, "lighting");
  const rawPropProfile = getParam(params, "prop-profile", "propProfile");
  const rawPropJitter = getParam(params, "prop-jitter", "propJitter");
  const rawPropCluster = getParam(params, "prop-cluster", "propCluster");
  const rawPropDensity = getParam(params, "prop-density", "propDensity");

  const mapId = rawMapId && rawMapId.trim().length > 0 ? rawMapId.trim() : DEFAULT_MAP_ID;
  const playerName = parsePlayerName(rawPlayerName);
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
  const floorQuality = parseFloorQuality(rawFloorRes);
  const lightingPreset = parseLightingPreset(rawLighting);
  const propChaos: RuntimePropChaosOptions = {
    profile: parsePropProfile(rawPropProfile),
    jitter: parseUnitFloat(rawPropJitter),
    cluster: parseUnitFloat(rawPropCluster),
    density: parseUnitFloat(rawPropDensity),
  };

  return {
    mapId,
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
    floorQuality,
    lightingPreset,
    propChaos,
  };
}
