export const HIGH_SCORE_PLAYER_NAME_MAX_LENGTH = 15;
export const HIGH_SCORE_MAP_ID_MAX_LENGTH = 64;
export const SITEWIDE_CHAMPION_SCOPE = "sitewide";
export const SITEWIDE_CHAMPION_BOARD_KEY = "default";
export const SHARED_CHAMPION_SCORE_RULESET = "wave-score-v1-k10-hs2_5";
export const SHARED_CHAMPION_WAVE_ENEMY_COUNT = 9;
export const SHARED_CHAMPION_WAVE_RESPAWN_DELAY_S = 5;
export const SHARED_CHAMPION_FIRE_INTERVAL_S = 0.1;
export const SHARED_CHAMPION_KILL_SCORE_HALF_POINTS = 20;
export const SHARED_CHAMPION_HEADSHOT_BONUS_HALF_POINTS = 5;
export const SHARED_CHAMPION_RUN_TOKEN_TTL_MS = 30 * 60 * 1000;
export const SHARED_CHAMPION_SCORE_WRITE_ENDPOINT = "/api/high-score";
export const SHARED_CHAMPION_RUN_START_ENDPOINT = "/api/run/start";
export const SHARED_CHAMPION_RUN_FINISH_ENDPOINT = "/api/run/finish";

const SHARED_CHAMPION_MAX_STARTING_KILLS = SHARED_CHAMPION_WAVE_ENEMY_COUNT;
const SHARED_CHAMPION_MAX_STARTING_SHOTS = 30;
const SHARED_CHAMPION_ACCURACY_TOLERANCE = 0.2;
const SHARED_CHAMPION_SURVIVAL_TIME_TOLERANCE_MS = 5_000;

export type SharedChampionControlMode = "human" | "agent";
export type SharedChampionRunDeathCause = "enemy-fire" | "unknown";

export type SharedChampion = {
  holderName: string;
  score: number;
  scoreHalfPoints: number;
  controlMode: SharedChampionControlMode;
  scope: typeof SITEWIDE_CHAMPION_SCOPE;
  updatedAt: string;
};

export type SharedChampionSnapshotStatus = "idle" | "loading" | "ready" | "unavailable";

export type SharedChampionSnapshot = {
  status: SharedChampionSnapshotStatus;
  champion: SharedChampion | null;
};

export type SharedChampionGetResponse = {
  champion: SharedChampion | null;
};

export type SharedChampionPostTelemetry = {
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  survivalTimeS: number;
};

export type SharedChampionPostRequest = {
  playerName: string;
  scoreHalfPoints: number;
  controlMode: SharedChampionControlMode;
  telemetry?: SharedChampionPostTelemetry;
};

export type SharedChampionPostResponse = {
  updated: boolean;
  champion: SharedChampion | null;
};

export type SharedChampionRunStartRequest = {
  playerName: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
};

export type SharedChampionRunStartResponse = {
  runToken: string;
  issuedAt: string;
  expiresAt: string;
  ruleset: typeof SHARED_CHAMPION_SCORE_RULESET;
};

export type SharedChampionRunSummary = {
  survivalTimeS: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  finalScore: number;
  deathCause?: SharedChampionRunDeathCause;
};

export type SharedChampionRunFinishRequest = {
  runToken: string;
  summary: SharedChampionRunSummary;
};

export type SharedChampionRunFinishResponse = {
  accepted: boolean;
  updated: boolean;
  champion: SharedChampion | null;
  reason: string | null;
};

export type SharedChampionRunValidation =
  | {
      ok: true;
      computedScoreHalfPoints: number;
      elapsedMs: number;
      maxKills: number;
      maxShotsFired: number;
    }
  | {
      ok: false;
      reason: string;
      computedScoreHalfPoints: number;
      elapsedMs: number;
      maxKills: number;
      maxShotsFired: number;
    };

export function isSharedChampionControlMode(value: unknown): value is SharedChampionControlMode {
  return value === "human" || value === "agent";
}

export function isSharedChampionRunDeathCause(value: unknown): value is SharedChampionRunDeathCause {
  return value === "enemy-fire" || value === "unknown";
}

export function clampSharedChampionName(value: string): string {
  return value.trim().slice(0, HIGH_SCORE_PLAYER_NAME_MAX_LENGTH);
}

export function sanitizeSharedChampionName(
  value: unknown,
  controlMode: SharedChampionControlMode,
): string {
  const fallback = controlMode === "agent" ? "Agent" : "Operator";
  if (typeof value !== "string") return fallback;
  const normalized = clampSharedChampionName(value);
  return normalized.length > 0 ? normalized : fallback;
}

export function sanitizeSharedChampionMapId(value: unknown): string {
  if (typeof value !== "string") return "unknown-map";
  const normalized = value.trim().slice(0, HIGH_SCORE_MAP_ID_MAX_LENGTH);
  return normalized.length > 0 ? normalized : "unknown-map";
}

export function normalizeScoreHalfPoints(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function roundScoreValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 2) / 2);
}

export function scoreHalfPointsToValue(value: unknown): number {
  return roundScoreValue(normalizeScoreHalfPoints(value) / 2);
}

export function scoreValueToHalfPoints(value: number): number {
  return normalizeScoreHalfPoints(roundScoreValue(value) * 2);
}

export function normalizeRunCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeRunSeconds(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10) / 10);
}

export function normalizeAccuracyPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10) / 10);
}

export function computeAccuracyPercent(shotsHit: number, shotsFired: number): number {
  if (shotsFired <= 0) return 0;
  return normalizeAccuracyPercent((shotsHit / shotsFired) * 100);
}

export function calculateSharedChampionScoreHalfPoints(kills: number, headshots: number): number {
  const normalizedKills = normalizeRunCount(kills);
  const normalizedHeadshots = normalizeRunCount(headshots);
  return (normalizedKills * SHARED_CHAMPION_KILL_SCORE_HALF_POINTS)
    + (normalizedHeadshots * SHARED_CHAMPION_HEADSHOT_BONUS_HALF_POINTS);
}

export function calculateSharedChampionScoreValue(kills: number, headshots: number): number {
  return scoreHalfPointsToValue(calculateSharedChampionScoreHalfPoints(kills, headshots));
}

export function createSharedChampion(input: {
  holderName: string;
  scoreHalfPoints: number;
  controlMode: SharedChampionControlMode;
  updatedAt: Date | string;
}): SharedChampion {
  const updatedAt = input.updatedAt instanceof Date
    ? input.updatedAt.toISOString()
    : new Date(input.updatedAt).toISOString();

  return {
    holderName: clampSharedChampionName(input.holderName),
    scoreHalfPoints: normalizeScoreHalfPoints(input.scoreHalfPoints),
    score: scoreHalfPointsToValue(input.scoreHalfPoints),
    controlMode: input.controlMode,
    scope: SITEWIDE_CHAMPION_SCOPE,
    updatedAt,
  };
}

export function parseSharedChampion(value: unknown): SharedChampion | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (!isSharedChampionControlMode(record.controlMode)) return null;
  if (typeof record.holderName !== "string") return null;
  if (typeof record.updatedAt !== "string") return null;

  const updatedAt = new Date(record.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) return null;

  return createSharedChampion({
    holderName: record.holderName,
    scoreHalfPoints: normalizeScoreHalfPoints(record.scoreHalfPoints),
    controlMode: record.controlMode,
    updatedAt,
  });
}

export function parseSharedChampionGetResponse(value: unknown): SharedChampionGetResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    champion: record.champion === null ? null : parseSharedChampion(record.champion),
  };
}

export function parseSharedChampionPostResponse(value: unknown): SharedChampionPostResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.updated !== "boolean") return null;
  return {
    updated: record.updated,
    champion: record.champion === null ? null : parseSharedChampion(record.champion),
  };
}

export function normalizeSharedChampionRunSummary(value: unknown): SharedChampionRunSummary | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const deathCause = record.deathCause;
  if (deathCause !== undefined && !isSharedChampionRunDeathCause(deathCause)) {
    return null;
  }

  return {
    survivalTimeS: normalizeRunSeconds(record.survivalTimeS),
    kills: normalizeRunCount(record.kills),
    headshots: normalizeRunCount(record.headshots),
    shotsFired: normalizeRunCount(record.shotsFired),
    shotsHit: normalizeRunCount(record.shotsHit),
    accuracy: normalizeAccuracyPercent(record.accuracy),
    finalScore: roundScoreValue(typeof record.finalScore === "number" ? record.finalScore : Number(record.finalScore)),
    ...(deathCause !== undefined ? { deathCause } : {}),
  };
}

export function parseSharedChampionRunStartResponse(value: unknown): SharedChampionRunStartResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.runToken !== "string") return null;
  if (typeof record.issuedAt !== "string") return null;
  if (typeof record.expiresAt !== "string") return null;
  if (record.ruleset !== SHARED_CHAMPION_SCORE_RULESET) return null;

  const issuedAt = new Date(record.issuedAt);
  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return null;
  }

  return {
    runToken: record.runToken,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ruleset: SHARED_CHAMPION_SCORE_RULESET,
  };
}

export function parseSharedChampionRunFinishResponse(value: unknown): SharedChampionRunFinishResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.accepted !== "boolean") return null;
  if (typeof record.updated !== "boolean") return null;
  if (!(typeof record.reason === "string" || record.reason === null)) return null;
  return {
    accepted: record.accepted,
    updated: record.updated,
    champion: record.champion === null ? null : parseSharedChampion(record.champion),
    reason: record.reason,
  };
}

export function isBetterSharedChampionCandidate(
  champion: SharedChampion | null,
  scoreHalfPoints: number,
): boolean {
  const candidate = normalizeScoreHalfPoints(scoreHalfPoints);
  return champion === null || candidate > champion.scoreHalfPoints;
}

export function calculateSharedChampionMaxKills(elapsedMs: number): number {
  const normalizedElapsedMs = Math.max(0, Math.round(elapsedMs));
  const extraWaves = Math.floor(normalizedElapsedMs / (SHARED_CHAMPION_WAVE_RESPAWN_DELAY_S * 1000));
  return SHARED_CHAMPION_MAX_STARTING_KILLS + (extraWaves * SHARED_CHAMPION_WAVE_ENEMY_COUNT);
}

export function calculateSharedChampionMaxShotsFired(elapsedMs: number): number {
  const normalizedElapsedMs = Math.max(0, Math.round(elapsedMs));
  const extraShots = Math.ceil(normalizedElapsedMs / (SHARED_CHAMPION_FIRE_INTERVAL_S * 1000));
  return SHARED_CHAMPION_MAX_STARTING_SHOTS + extraShots;
}

export function validateSharedChampionRunSummary(
  summary: SharedChampionRunSummary,
  elapsedMs: number,
): SharedChampionRunValidation {
  const normalizedElapsedMs = Math.max(0, Math.round(elapsedMs));
  const maxKills = calculateSharedChampionMaxKills(normalizedElapsedMs);
  const maxShotsFired = calculateSharedChampionMaxShotsFired(normalizedElapsedMs);
  const computedScoreHalfPoints = calculateSharedChampionScoreHalfPoints(summary.kills, summary.headshots);
  const expectedAccuracy = computeAccuracyPercent(summary.shotsHit, summary.shotsFired);
  const survivalTimeDeltaMs = Math.abs((summary.survivalTimeS * 1000) - normalizedElapsedMs);
  const reportedScoreHalfPoints = scoreValueToHalfPoints(summary.finalScore);

  if (summary.headshots > summary.kills) {
    return {
      ok: false,
      reason: "headshots-exceed-kills",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.shotsHit > summary.shotsFired) {
    return {
      ok: false,
      reason: "shots-hit-exceed-shots-fired",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.kills > summary.shotsHit) {
    return {
      ok: false,
      reason: "kills-exceed-shots-hit",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.kills > maxKills) {
    return {
      ok: false,
      reason: "kills-exceed-cap",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.shotsFired > maxShotsFired) {
    return {
      ok: false,
      reason: "shots-fired-exceed-cap",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (reportedScoreHalfPoints !== computedScoreHalfPoints) {
    return {
      ok: false,
      reason: "score-does-not-match-stats",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (Math.abs(summary.accuracy - expectedAccuracy) > SHARED_CHAMPION_ACCURACY_TOLERANCE) {
    return {
      ok: false,
      reason: "accuracy-does-not-match-stats",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (survivalTimeDeltaMs > SHARED_CHAMPION_SURVIVAL_TIME_TOLERANCE_MS) {
    return {
      ok: false,
      reason: "survival-time-out-of-range",
      computedScoreHalfPoints,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  return {
    ok: true,
    computedScoreHalfPoints,
    elapsedMs: normalizedElapsedMs,
    maxKills,
    maxShotsFired,
  };
}

export function formatSharedChampionScore(value: number): string {
  return roundScoreValue(value).toLocaleString("en-US");
}

export function formatSharedChampionMode(mode: SharedChampionControlMode): string {
  return mode === "agent" ? "AGENT" : "HUMAN";
}

// ── Telemetry parsing & validation ──────────────────────────────────────────

const SCORE_PER_KILL_HALF_POINTS = 20; // 10 points * 2
const SCORE_PER_HEADSHOT_HALF_POINTS = 5; // 2.5 points * 2
const MAX_KILLS_PER_SECOND = 5;

export function parseTelemetry(value: unknown): SharedChampionPostTelemetry | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;

  const kills = Math.round(Number(r.kills));
  const headshots = Math.round(Number(r.headshots));
  const shotsFired = Math.round(Number(r.shotsFired));
  const shotsHit = Math.round(Number(r.shotsHit));
  const survivalTimeS = Number(r.survivalTimeS);

  if (
    !Number.isFinite(kills) || kills < 0
    || !Number.isFinite(headshots) || headshots < 0
    || !Number.isFinite(shotsFired) || shotsFired < 0
    || !Number.isFinite(shotsHit) || shotsHit < 0
    || !Number.isFinite(survivalTimeS) || survivalTimeS <= 0
  ) {
    return null;
  }

  return { kills, headshots, shotsFired, shotsHit, survivalTimeS };
}

export type TelemetryValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateTelemetry(
  scoreHalfPoints: number,
  telemetry: SharedChampionPostTelemetry,
): TelemetryValidationResult {
  const { kills, headshots, shotsFired, shotsHit, survivalTimeS } = telemetry;

  // Score formula: half_points = kills * 20 + headshots * 5
  const expectedHalfPoints =
    kills * SCORE_PER_KILL_HALF_POINTS + headshots * SCORE_PER_HEADSHOT_HALF_POINTS;
  if (scoreHalfPoints !== expectedHalfPoints) {
    return { valid: false, reason: "score-mismatch" };
  }

  if (headshots > kills) {
    return { valid: false, reason: "headshots-exceed-kills" };
  }

  if (kills > 0 && shotsHit < kills) {
    return { valid: false, reason: "hits-below-kills" };
  }

  if (shotsFired < shotsHit) {
    return { valid: false, reason: "fired-below-hits" };
  }

  if (survivalTimeS > 0 && kills / survivalTimeS > MAX_KILLS_PER_SECOND) {
    return { valid: false, reason: "implausible-kill-rate" };
  }

  return { valid: true };
}
