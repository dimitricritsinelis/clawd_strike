const DEFAULT_MAP_ID = "bazaar-map";
const DEFAULT_PROP_PROFILE = "subtle";

export type RuntimeSpawnId = "A" | "B";
export type RuntimePropProfile = "subtle" | "medium" | "high";
export type RuntimePropChaosOptions = {
  profile: RuntimePropProfile;
  jitter: number | null;
  cluster: number | null;
  density: number | null;
};

export type RuntimeUrlParams = {
  mapId: string;
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

export function parseRuntimeUrlParams(search: string): RuntimeUrlParams {
  const params = new URLSearchParams(search);
  const rawMapId = params.get("map");
  const rawShot = params.get("shot");
  const rawSpawn = params.get("spawn");
  const rawDebug = params.get("debug");
  const rawPerf = params.get("perf");
  const rawHighVis = params.get("highvis");
  const rawVm = params.get("vm");
  const rawVmDebug = params.get("vmDebug");
  const rawAnchors = params.get("anchors");
  const rawLabels = params.get("labels");
  const rawAnchorTypes = params.get("anchorTypes");
  const rawSeed = params.get("seed");
  const rawPropProfile = params.get("propProfile");
  const rawPropJitter = params.get("propJitter");
  const rawPropCluster = params.get("propCluster");
  const rawPropDensity = params.get("propDensity");

  const mapId = rawMapId && rawMapId.trim().length > 0 ? rawMapId.trim() : DEFAULT_MAP_ID;
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
  const propChaos: RuntimePropChaosOptions = {
    profile: parsePropProfile(rawPropProfile),
    jitter: parseUnitFloat(rawPropJitter),
    cluster: parseUnitFloat(rawPropCluster),
    density: parseUnitFloat(rawPropDensity),
  };

  return {
    mapId,
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
    propChaos,
  };
}
