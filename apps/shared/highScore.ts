import {
  PLAYER_NAME_MAX_LENGTH,
  normalizeValidatedPlayerName,
  parseStoredPlayerName,
  sanitizeValidatedPlayerName,
} from "./playerName.js";

export const HIGH_SCORE_PLAYER_NAME_MAX_LENGTH = PLAYER_NAME_MAX_LENGTH;
export const HIGH_SCORE_MAP_ID_MAX_LENGTH = 64;
export const SITEWIDE_CHAMPION_SCOPE = "sitewide";
export const SITEWIDE_CHAMPION_BOARD_KEY = "default";
export const SHARED_CHAMPION_SCORE_RULESET = "wave-score-v4-k5-wi2-hs2x-b10";
export const SHARED_CHAMPION_WAVE_ENEMY_COUNT = 10;
export const SHARED_CHAMPION_WAVE_RESPAWN_DELAY_S = 5;
export const SHARED_CHAMPION_FIRE_INTERVAL_S = 0.1;
export const SHARED_CHAMPION_KILL_SCORE = 5;
export const SHARED_CHAMPION_WAVE_SCORE_INCREMENT = 2;
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
  score: number;
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
  headshotsPerWave: number[];
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
      computedScore: number;
      elapsedMs: number;
      maxKills: number;
      maxShotsFired: number;
    }
  | {
      ok: false;
      reason: string;
      computedScore: number;
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
  return normalizeValidatedPlayerName(value);
}

export function sanitizeSharedChampionName(
  value: unknown,
  _controlMode?: SharedChampionControlMode,
): string | null {
  return sanitizeValidatedPlayerName(value);
}

export function sanitizeSharedChampionMapId(value: unknown): string {
  if (typeof value !== "string") return "unknown-map";
  const normalized = value.trim().slice(0, HIGH_SCORE_MAP_ID_MAX_LENGTH);
  return normalized.length > 0 ? normalized : "unknown-map";
}

export function normalizeScore(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
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

/** Base kill value for a 1-indexed wave number. */
export function getWaveKillValue(wave: number): number {
  return SHARED_CHAMPION_KILL_SCORE + (Math.max(1, wave) - 1) * SHARED_CHAMPION_WAVE_SCORE_INCREMENT;
}

/** Headshot bonus for a 1-indexed wave number (2× multiplier: bonus = killValue). */
export function getWaveHeadshotBonus(wave: number): number {
  return getWaveKillValue(wave);
}

/** Flat score formula used only by admin telemetry validation. */
export function calculateFlatScore(kills: number, headshots: number): number {
  const normalizedKills = normalizeRunCount(kills);
  const normalizedHeadshots = normalizeRunCount(headshots);
  return (normalizedKills * SHARED_CHAMPION_KILL_SCORE)
    + (normalizedHeadshots * SHARED_CHAMPION_KILL_SCORE);
}

/** Wave-scaled score from kills + per-wave headshot distribution. */
export function calculateSharedChampionScore(kills: number, headshotsPerWave: number[]): number {
  const normalizedKills = normalizeRunCount(kills);
  const totalWaves = Math.ceil(normalizedKills / SHARED_CHAMPION_WAVE_ENEMY_COUNT);
  let score = 0;
  for (let w = 1; w <= totalWaves; w++) {
    const killsInWave = Math.min(
      SHARED_CHAMPION_WAVE_ENEMY_COUNT,
      normalizedKills - (w - 1) * SHARED_CHAMPION_WAVE_ENEMY_COUNT,
    );
    const hsInWave = normalizeRunCount(headshotsPerWave[w - 1] ?? 0);
    const kv = getWaveKillValue(w);
    score += killsInWave * kv + hsInWave * kv;
  }
  return score;
}

export function createSharedChampion(input: {
  holderName: string;
  score: number;
  controlMode: SharedChampionControlMode;
  updatedAt: Date | string;
}): SharedChampion {
  const updatedAt = input.updatedAt instanceof Date
    ? input.updatedAt.toISOString()
    : new Date(input.updatedAt).toISOString();

  return {
    holderName: normalizeValidatedPlayerName(input.holderName),
    score: normalizeScore(input.score),
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
  const holderName = parseStoredPlayerName(record.holderName);
  if (holderName === null) return null;

  const updatedAt = new Date(record.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) return null;

  return createSharedChampion({
    holderName,
    score: normalizeScore(record.score),
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

function normalizeHeadshotsPerWave(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const result: number[] = [];
  for (const item of value) {
    result.push(normalizeRunCount(item));
  }
  return result;
}

export function normalizeSharedChampionRunSummary(value: unknown): SharedChampionRunSummary | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const rawDeathCause = record.deathCause;
  if (rawDeathCause !== undefined && !isSharedChampionRunDeathCause(rawDeathCause)) {
    return null;
  }
  const deathCause = rawDeathCause as SharedChampionRunDeathCause | undefined;

  return {
    survivalTimeS: normalizeRunSeconds(record.survivalTimeS),
    kills: normalizeRunCount(record.kills),
    headshots: normalizeRunCount(record.headshots),
    headshotsPerWave: normalizeHeadshotsPerWave(record.headshotsPerWave),
    shotsFired: normalizeRunCount(record.shotsFired),
    shotsHit: normalizeRunCount(record.shotsHit),
    accuracy: normalizeAccuracyPercent(record.accuracy),
    finalScore: normalizeScore(record.finalScore),
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
  const reason = record.reason;
  if (!(typeof reason === "string" || reason === null)) return null;
  const normalizedReason: string | null = typeof reason === "string" ? reason : null;
  return {
    accepted: record.accepted,
    updated: record.updated,
    champion: record.champion === null ? null : parseSharedChampion(record.champion),
    reason: normalizedReason,
  };
}

export function isBetterSharedChampionCandidate(
  champion: SharedChampion | null,
  score: number,
): boolean {
  const candidate = normalizeScore(score);
  return champion === null || candidate > champion.score;
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

  // ── Per-wave headshot validation ──────────────────────────────────────────
  const expectedWaveCount = summary.kills > 0
    ? Math.ceil(summary.kills / SHARED_CHAMPION_WAVE_ENEMY_COUNT)
    : 0;

  if (summary.headshotsPerWave.length !== expectedWaveCount) {
    return {
      ok: false,
      reason: "headshots-per-wave-length-mismatch",
      computedScore: 0,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  let headshotsPerWaveSum = 0;
  for (let w = 0; w < summary.headshotsPerWave.length; w++) {
    const hsInWave = summary.headshotsPerWave[w]!;
    const killsInWave = Math.min(
      SHARED_CHAMPION_WAVE_ENEMY_COUNT,
      summary.kills - w * SHARED_CHAMPION_WAVE_ENEMY_COUNT,
    );
    if (hsInWave < 0 || hsInWave > killsInWave) {
      return {
        ok: false,
        reason: "headshots-per-wave-out-of-range",
        computedScore: 0,
        elapsedMs: normalizedElapsedMs,
        maxKills,
        maxShotsFired,
      };
    }
    headshotsPerWaveSum += hsInWave;
  }

  if (headshotsPerWaveSum !== summary.headshots) {
    return {
      ok: false,
      reason: "headshots-per-wave-sum-mismatch",
      computedScore: 0,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  // ── Score computation using wave-scaled formula ───────────────────────────
  const computedScore = calculateSharedChampionScore(summary.kills, summary.headshotsPerWave);
  const expectedAccuracy = computeAccuracyPercent(summary.shotsHit, summary.shotsFired);
  const survivalTimeDeltaMs = Math.abs((summary.survivalTimeS * 1000) - normalizedElapsedMs);
  const reportedScore = normalizeScore(summary.finalScore);

  if (summary.headshots > summary.kills) {
    return {
      ok: false,
      reason: "headshots-exceed-kills",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.shotsHit > summary.shotsFired) {
    return {
      ok: false,
      reason: "shots-hit-exceed-shots-fired",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.kills > summary.shotsHit) {
    return {
      ok: false,
      reason: "kills-exceed-shots-hit",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.kills > maxKills) {
    return {
      ok: false,
      reason: "kills-exceed-cap",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (summary.shotsFired > maxShotsFired) {
    return {
      ok: false,
      reason: "shots-fired-exceed-cap",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (reportedScore !== computedScore) {
    return {
      ok: false,
      reason: "score-does-not-match-stats",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (Math.abs(summary.accuracy - expectedAccuracy) > SHARED_CHAMPION_ACCURACY_TOLERANCE) {
    return {
      ok: false,
      reason: "accuracy-does-not-match-stats",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  if (survivalTimeDeltaMs > SHARED_CHAMPION_SURVIVAL_TIME_TOLERANCE_MS) {
    return {
      ok: false,
      reason: "survival-time-out-of-range",
      computedScore,
      elapsedMs: normalizedElapsedMs,
      maxKills,
      maxShotsFired,
    };
  }

  return {
    ok: true,
    computedScore,
    elapsedMs: normalizedElapsedMs,
    maxKills,
    maxShotsFired,
  };
}

export function formatSharedChampionScore(value: number): string {
  return normalizeScore(value).toLocaleString("en-US");
}

export function formatSharedChampionMode(mode: SharedChampionControlMode): string {
  return mode === "agent" ? "AGENT" : "HUMAN";
}

// ── Telemetry parsing & validation ──────────────────────────────────────────

const TELEMETRY_SCORE_PER_KILL = 5;
const TELEMETRY_SCORE_PER_HEADSHOT = 5;
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
  score: number,
  telemetry: SharedChampionPostTelemetry,
): TelemetryValidationResult {
  const { kills, headshots, shotsFired, shotsHit, survivalTimeS } = telemetry;

  // Flat score formula (admin-only): score = kills * 5 + headshots * 5
  const expectedScore =
    kills * TELEMETRY_SCORE_PER_KILL + headshots * TELEMETRY_SCORE_PER_HEADSHOT;
  if (score !== expectedScore) {
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
