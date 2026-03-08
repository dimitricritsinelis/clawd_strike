import {
  HIGH_SCORE_MAP_ID_MAX_LENGTH,
  SHARED_CHAMPION_SCORE_RULESET,
  SHARED_CHAMPION_WAVE_ENEMY_COUNT,
  clampSharedChampionName,
  sanitizeSharedChampionMapId,
  type SharedChampionControlMode,
  type SharedChampionRunDeathCause,
  type SharedChampionRunSummary,
} from "../apps/shared/highScore.js";

export const STATS_ADMIN_DEFAULT_LIMIT = 50;
export const STATS_ADMIN_MAX_LIMIT = 200;
const BUILD_ID_MAX_LENGTH = 128;

export type SharedChampionStatsFilters = {
  from: string | null;
  to: string | null;
  controlMode: SharedChampionControlMode | null;
  mapId: string | null;
  playerName: string | null;
};

export type SharedChampionStatsRunFilters = SharedChampionStatsFilters & {
  championUpdated: boolean | null;
  cursor: string | null;
  limit: number;
};

export type ResolvedSharedChampionStatsFilters = SharedChampionStatsFilters & {
  fromDate: Date | null;
  toDate: Date | null;
  playerNameKey: string | null;
};

export type ResolvedSharedChampionStatsRunFilters = ResolvedSharedChampionStatsFilters & {
  championUpdated: boolean | null;
  cursor: { createdAt: string; runId: string } | null;
  limit: number;
};

export type SharedChampionRunRecord = {
  runId: string;
  playerName: string;
  playerNameKey: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
  ruleset: typeof SHARED_CHAMPION_SCORE_RULESET;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  score: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  accuracyPct: number;
  wavesCleared: number;
  waveReached: number;
  deathCause: SharedChampionRunDeathCause | null;
  championUpdated: boolean;
  buildId: string | null;
  clientIpFingerprint: string | null;
  userAgentFingerprint: string | null;
  createdAt: string;
};

export type SharedChampionStatsOverview = {
  totalRuns: number;
  championUpdates: number;
  uniquePlayerNames: number;
  humanRuns: number;
  agentRuns: number;
  bestScore: number | null;
  averageScore: number | null;
  averageAccuracyPct: number | null;
  latestRunAt: string | null;
  latestChampionAt: string | null;
};

export type SharedChampionStatsNameRollup = {
  playerNameKey: string;
  playerName: string;
  totalRuns: number;
  championUpdates: number;
  humanRuns: number;
  agentRuns: number;
  bestScore: number;
  averageScore: number;
  averageAccuracyPct: number;
  latestRunAt: string;
};

export type SharedChampionStatsDailyRollup = {
  day: string;
  totalRuns: number;
  championUpdates: number;
  uniquePlayerNames: number;
  humanRuns: number;
  agentRuns: number;
  bestScore: number;
  averageScore: number;
  averageAccuracyPct: number;
};

export type SharedChampionStatsOverviewResponse = {
  overview: SharedChampionStatsOverview;
  filters: SharedChampionStatsFilters;
};

export type SharedChampionStatsRunsResponse = {
  items: SharedChampionRunRecord[];
  nextCursor: string | null;
  limit: number;
  filters: SharedChampionStatsRunFilters;
};

export type SharedChampionStatsNamesResponse = {
  items: SharedChampionStatsNameRollup[];
  nextCursor: string | null;
  limit: number;
  filters: SharedChampionStatsFilters & {
    cursor: string | null;
  };
};

export type SharedChampionStatsDailyResponse = {
  items: SharedChampionStatsDailyRollup[];
  nextCursor: string | null;
  limit: number;
  filters: SharedChampionStatsFilters & {
    cursor: string | null;
  };
};

export type DerivedSharedChampionRunFields = {
  playerName: string;
  playerNameKey: string;
  mapId: string;
  ruleset: typeof SHARED_CHAMPION_SCORE_RULESET;
  elapsedMs: number;
  score: number;
  accuracyPct: number;
  wavesCleared: number;
  waveReached: number;
  deathCause: SharedChampionRunDeathCause | null;
  buildId: string | null;
};

export function normalizePlayerNameKey(value: string): string {
  return clampSharedChampionName(value).trim().toLowerCase();
}

export function resolveBuildId(): string | null {
  const value = process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.VERCEL_GIT_COMMIT_REF
    ?? process.env.VERCEL_URL
    ?? process.env.VERCEL_BRANCH_URL
    ?? "";
  const normalized = value.trim().slice(0, BUILD_ID_MAX_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

export function deriveWaveProgress(kills: number): {
  wavesCleared: number;
  waveReached: number;
} {
  const normalizedKills = Math.max(0, Math.floor(kills));
  const wavesCleared = Math.floor(normalizedKills / SHARED_CHAMPION_WAVE_ENEMY_COUNT);
  return {
    wavesCleared,
    waveReached: wavesCleared + 1,
  };
}

export function deriveRunFields(input: {
  playerName: string;
  mapId: string;
  summary: SharedChampionRunSummary;
  score: number;
  elapsedMs: number;
  buildId?: string | null;
}): DerivedSharedChampionRunFields {
  const normalizedPlayerName = clampSharedChampionName(input.playerName);
  const waveProgress = deriveWaveProgress(input.summary.kills);
  return {
    playerName: normalizedPlayerName,
    playerNameKey: normalizePlayerNameKey(normalizedPlayerName),
    mapId: sanitizeSharedChampionMapId(input.mapId),
    ruleset: SHARED_CHAMPION_SCORE_RULESET,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    score: Math.max(0, Math.round(input.score)),
    accuracyPct: Math.max(0, Math.round(input.summary.accuracy * 10) / 10),
    wavesCleared: waveProgress.wavesCleared,
    waveReached: waveProgress.waveReached,
    deathCause: input.summary.deathCause ?? null,
    buildId: input.buildId ? input.buildId.trim().slice(0, BUILD_ID_MAX_LENGTH) || null : null,
  };
}

export function createRunCursor(input: { createdAt: string; runId: string }): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function parseRunCursor(value: string | null): { createdAt: string; runId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.runId !== "string") {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return {
      createdAt: createdAt.toISOString(),
      runId: parsed.runId,
    };
  } catch {
    return null;
  }
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return date;
}

function parseLimit(value: string | null): number {
  if (!value) return STATS_ADMIN_DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return Math.min(STATS_ADMIN_MAX_LIMIT, parsed);
}

function parseControlMode(value: string | null): SharedChampionControlMode | null {
  if (!value) return null;
  if (value === "human" || value === "agent") return value;
  throw new Error("controlMode must be 'human' or 'agent'.");
}

function parseBooleanParam(value: string | null): boolean | null {
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Boolean filters must be 'true' or 'false'.");
}

function normalizeMapIdFilter(value: string | null): string | null {
  if (!value) return null;
  const normalized = sanitizeSharedChampionMapId(value).slice(0, HIGH_SCORE_MAP_ID_MAX_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

function normalizePlayerNameFilter(value: string | null): string | null {
  if (!value) return null;
  const normalized = clampSharedChampionName(value);
  return normalized.length > 0 ? normalized : null;
}

export function parseStatsFilters(url: URL): ResolvedSharedChampionStatsFilters {
  const playerName = normalizePlayerNameFilter(url.searchParams.get("playerName"));
  const mapId = normalizeMapIdFilter(url.searchParams.get("mapId"));
  const fromDate = parseDateParam(url.searchParams.get("from"));
  const toDate = parseDateParam(url.searchParams.get("to"));
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("from must be before to.");
  }
  return {
    from: fromDate ? fromDate.toISOString() : null,
    to: toDate ? toDate.toISOString() : null,
    fromDate,
    toDate,
    controlMode: parseControlMode(url.searchParams.get("controlMode")),
    mapId,
    playerName,
    playerNameKey: playerName ? normalizePlayerNameKey(playerName) : null,
  };
}

export function parseRunStatsFilters(url: URL): ResolvedSharedChampionStatsRunFilters {
  const filters = parseStatsFilters(url);
  const cursorValue = url.searchParams.get("cursor");
  const cursor = parseRunCursor(cursorValue);
  if (cursorValue && !cursor) {
    throw new Error("cursor is invalid.");
  }
  return {
    ...filters,
    championUpdated: parseBooleanParam(url.searchParams.get("championUpdated")),
    cursor,
    limit: parseLimit(url.searchParams.get("limit")),
  };
}

export function parseListLimit(url: URL): number {
  return parseLimit(url.searchParams.get("limit"));
}

export function toOverviewResponse(
  overview: SharedChampionStatsOverview,
  filters: ResolvedSharedChampionStatsFilters,
): SharedChampionStatsOverviewResponse {
  return {
    overview,
    filters: {
      from: filters.from,
      to: filters.to,
      controlMode: filters.controlMode,
      mapId: filters.mapId,
      playerName: filters.playerName,
    },
  };
}

export function toRunsResponse(input: {
  items: SharedChampionRunRecord[];
  nextCursor: string | null;
  filters: ResolvedSharedChampionStatsRunFilters;
}): SharedChampionStatsRunsResponse {
  return {
    items: input.items,
    nextCursor: input.nextCursor,
    limit: input.filters.limit,
    filters: {
      from: input.filters.from,
      to: input.filters.to,
      controlMode: input.filters.controlMode,
      mapId: input.filters.mapId,
      playerName: input.filters.playerName,
      championUpdated: input.filters.championUpdated,
      cursor: input.filters.cursor ? createRunCursor(input.filters.cursor) : null,
      limit: input.filters.limit,
    },
  };
}

export function toNamesResponse(input: {
  items: SharedChampionStatsNameRollup[];
  nextCursor: string | null;
  limit: number;
  filters: ResolvedSharedChampionStatsFilters;
  cursor: string | null;
}): SharedChampionStatsNamesResponse {
  return {
    items: input.items,
    nextCursor: input.nextCursor,
    limit: input.limit,
    filters: {
      from: input.filters.from,
      to: input.filters.to,
      controlMode: input.filters.controlMode,
      mapId: input.filters.mapId,
      playerName: input.filters.playerName,
      cursor: input.cursor,
    },
  };
}

export function toDailyResponse(input: {
  items: SharedChampionStatsDailyRollup[];
  nextCursor: string | null;
  limit: number;
  filters: ResolvedSharedChampionStatsFilters;
  cursor: string | null;
}): SharedChampionStatsDailyResponse {
  return {
    items: input.items,
    nextCursor: input.nextCursor,
    limit: input.limit,
    filters: {
      from: input.filters.from,
      to: input.filters.to,
      controlMode: input.filters.controlMode,
      mapId: input.filters.mapId,
      playerName: input.filters.playerName,
      cursor: input.cursor,
    },
  };
}

export function formatNullableScore(score: number | null): number | null {
  return score;
}
