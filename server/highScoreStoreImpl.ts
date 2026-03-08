import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import {
  HIGH_SCORE_MAP_ID_MAX_LENGTH,
  SHARED_CHAMPION_SCORE_RULESET,
  SITEWIDE_CHAMPION_BOARD_KEY,
  createSharedChampion,
  normalizeScoreHalfPoints,
  sanitizeSharedChampionMapId,
  sanitizeSharedChampionName,
  scoreHalfPointsToValue,
  type SharedChampion,
  type SharedChampionControlMode,
  type SharedChampionPostRequest,
  type SharedChampionRunSummary,
} from "../apps/shared/highScore.js";
import {
  createRunCursor,
  deriveRunFields,
  formatNullableScore,
  resolveBuildId,
  type ResolvedSharedChampionStatsFilters,
  type ResolvedSharedChampionStatsRunFilters,
  type SharedChampionRunRecord,
  type SharedChampionStatsDailyRollup,
  type SharedChampionStatsNameRollup,
  type SharedChampionStatsOverview,
} from "./highScoreStats.js";

const CREATE_HIGH_SCORE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_scores (
    board_key TEXT PRIMARY KEY,
    score_half_points INTEGER NOT NULL CHECK (score_half_points >= 0),
    holder_name VARCHAR(15) NOT NULL,
    holder_mode TEXT NOT NULL CHECK (holder_mode IN ('human', 'agent')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_SUBMISSIONS_LOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS champion_submissions_log (
    id SERIAL PRIMARY KEY,
    client_ip_fingerprint TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const ALTER_SUBMISSIONS_LOG_TABLE_SQL = `
  ALTER TABLE champion_submissions_log
    ADD COLUMN IF NOT EXISTS client_ip_fingerprint TEXT;
`;

const DROP_LEGACY_SUBMISSIONS_LOG_SQL = `
  DROP INDEX IF EXISTS idx_submissions_ip_time;
  ALTER TABLE champion_submissions_log DROP COLUMN IF EXISTS client_ip;
`;

const CREATE_SUBMISSIONS_LOG_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_submissions_ip_fingerprint_time
  ON champion_submissions_log (client_ip_fingerprint, submitted_at);
`;

const RATE_LIMIT_CHECK_SQL = `
  SELECT COUNT(*) AS recent
  FROM champion_submissions_log
  WHERE client_ip_fingerprint = $1 AND submitted_at > NOW() - INTERVAL '30 seconds';
`;

const RATE_LIMIT_INSERT_SQL = `
  INSERT INTO champion_submissions_log (client_ip_fingerprint) VALUES ($1);
`;

const RATE_LIMIT_CLEANUP_SQL = `
  DELETE FROM champion_submissions_log
  WHERE submitted_at < NOW() - INTERVAL '24 hours';
`;

const CREATE_RUN_TOKEN_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_run_tokens (
    run_id UUID PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    player_name VARCHAR(15) NOT NULL,
    control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
    map_id VARCHAR(${HIGH_SCORE_MAP_ID_MAX_LENGTH}) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_ip_fingerprint TEXT,
    created_user_agent_fingerprint TEXT,
    claim_ip_fingerprint TEXT,
    claim_user_agent_fingerprint TEXT
  );
`;

const ALTER_RUN_TOKEN_TABLE_SQL = `
  ALTER TABLE shared_champion_run_tokens
    ADD COLUMN IF NOT EXISTS created_ip_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS created_user_agent_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS claim_ip_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS claim_user_agent_fingerprint TEXT;
`;

const DROP_LEGACY_RUN_TOKEN_COLUMNS_SQL = `
  ALTER TABLE shared_champion_run_tokens DROP COLUMN IF EXISTS created_ip_hash;
  ALTER TABLE shared_champion_run_tokens DROP COLUMN IF EXISTS created_user_agent;
  ALTER TABLE shared_champion_run_tokens DROP COLUMN IF EXISTS claim_ip_hash;
  ALTER TABLE shared_champion_run_tokens DROP COLUMN IF EXISTS claim_user_agent;
`;

const CREATE_RUN_TOKEN_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_shared_champion_run_tokens_expires_at
    ON shared_champion_run_tokens (expires_at);
`;

const RUN_TOKEN_CLEANUP_SQL = `
  DELETE FROM shared_champion_run_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
`;

const CREATE_AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_run_audit (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    run_id UUID,
    ip_fingerprint TEXT,
    user_agent_fingerprint TEXT,
    reason TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const ALTER_AUDIT_TABLE_SQL = `
  ALTER TABLE shared_champion_run_audit
    ADD COLUMN IF NOT EXISTS ip_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS user_agent_fingerprint TEXT;
`;

const DROP_LEGACY_AUDIT_COLUMNS_SQL = `
  ALTER TABLE shared_champion_run_audit DROP COLUMN IF EXISTS ip_hash;
  ALTER TABLE shared_champion_run_audit DROP COLUMN IF EXISTS user_agent;
`;

const AUDIT_CLEANUP_SQL = `
  DELETE FROM shared_champion_run_audit
  WHERE created_at < NOW() - INTERVAL '30 days';
`;

const CREATE_RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_runs (
    run_id UUID PRIMARY KEY,
    player_name VARCHAR(15) NOT NULL,
    player_name_key VARCHAR(15) NOT NULL,
    control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
    map_id VARCHAR(${HIGH_SCORE_MAP_ID_MAX_LENGTH}) NOT NULL,
    ruleset TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
    score_half_points INTEGER NOT NULL CHECK (score_half_points >= 0),
    kills INTEGER NOT NULL CHECK (kills >= 0),
    headshots INTEGER NOT NULL CHECK (headshots >= 0),
    shots_fired INTEGER NOT NULL CHECK (shots_fired >= 0),
    shots_hit INTEGER NOT NULL CHECK (shots_hit >= 0),
    accuracy_pct DOUBLE PRECISION NOT NULL CHECK (accuracy_pct >= 0),
    waves_cleared INTEGER NOT NULL CHECK (waves_cleared >= 0),
    wave_reached INTEGER NOT NULL CHECK (wave_reached >= 1),
    death_cause TEXT CHECK (death_cause IN ('enemy-fire', 'unknown')),
    champion_updated BOOLEAN NOT NULL,
    build_id VARCHAR(128),
    client_ip_fingerprint TEXT,
    user_agent_fingerprint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_RUNS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_created_at
    ON shared_champion_runs (created_at DESC, run_id DESC);
  CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_player_name_key
    ON shared_champion_runs (player_name_key, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_map_id
    ON shared_champion_runs (map_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_champion_updated
    ON shared_champion_runs (champion_updated, created_at DESC);
`;

const CREATE_DAILY_ROLLUPS_VIEW_SQL = `
  CREATE OR REPLACE VIEW shared_champion_daily_rollups_v1 AS
  SELECT
    TO_CHAR(DATE_TRUNC('day', ended_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
    COUNT(*)::BIGINT AS total_runs,
    SUM(CASE WHEN champion_updated THEN 1 ELSE 0 END)::BIGINT AS champion_updates,
    COUNT(DISTINCT player_name_key)::BIGINT AS unique_player_names,
    SUM(CASE WHEN control_mode = 'human' THEN 1 ELSE 0 END)::BIGINT AS human_runs,
    SUM(CASE WHEN control_mode = 'agent' THEN 1 ELSE 0 END)::BIGINT AS agent_runs,
    MAX(score_half_points)::INTEGER AS best_score_half_points,
    AVG(score_half_points)::DOUBLE PRECISION AS average_score_half_points,
    AVG(accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct
  FROM shared_champion_runs
  GROUP BY 1;
`;

const CREATE_NAME_ROLLUPS_VIEW_SQL = `
  CREATE OR REPLACE VIEW shared_champion_name_rollups_v1 AS
  SELECT
    player_name_key,
    MIN(player_name) AS player_name,
    COUNT(*)::BIGINT AS total_runs,
    SUM(CASE WHEN champion_updated THEN 1 ELSE 0 END)::BIGINT AS champion_updates,
    SUM(CASE WHEN control_mode = 'human' THEN 1 ELSE 0 END)::BIGINT AS human_runs,
    SUM(CASE WHEN control_mode = 'agent' THEN 1 ELSE 0 END)::BIGINT AS agent_runs,
    MAX(score_half_points)::INTEGER AS best_score_half_points,
    AVG(score_half_points)::DOUBLE PRECISION AS average_score_half_points,
    AVG(accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct,
    MAX(created_at) AS latest_run_at
  FROM shared_champion_runs
  GROUP BY player_name_key;
`;

const SELECT_CHAMPION_SQL = `
  SELECT score_half_points, holder_name, holder_mode, updated_at
  FROM shared_champion_scores
  WHERE board_key = $1
  LIMIT 1;
`;

const UPSERT_CHAMPION_SQL = `
  WITH attempted AS (
    INSERT INTO shared_champion_scores AS scores (
      board_key,
      score_half_points,
      holder_name,
      holder_mode
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (board_key) DO UPDATE
    SET
      score_half_points = EXCLUDED.score_half_points,
      holder_name = EXCLUDED.holder_name,
      holder_mode = EXCLUDED.holder_mode,
      updated_at = NOW()
    WHERE EXCLUDED.score_half_points > scores.score_half_points
    RETURNING score_half_points, holder_name, holder_mode, updated_at, TRUE AS updated
  )
  SELECT score_half_points, holder_name, holder_mode, updated_at, updated
  FROM attempted
  UNION ALL
  SELECT score_half_points, holder_name, holder_mode, updated_at, FALSE AS updated
  FROM shared_champion_scores
  WHERE board_key = $1
    AND NOT EXISTS (SELECT 1 FROM attempted)
  LIMIT 1;
`;

const INSERT_RUN_TOKEN_SQL = `
  INSERT INTO shared_champion_run_tokens (
    run_id,
    token_hash,
    player_name,
    control_mode,
    map_id,
    expires_at,
    created_ip_fingerprint,
    created_user_agent_fingerprint
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at;
`;

const CLAIM_RUN_TOKEN_SQL = `
  UPDATE shared_champion_run_tokens
  SET
    claimed_at = NOW(),
    claim_ip_fingerprint = $2,
    claim_user_agent_fingerprint = $3
  WHERE token_hash = $1
    AND claimed_at IS NULL
    AND expires_at > NOW()
  RETURNING run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at;
`;

const SELECT_RUN_TOKEN_SQL = `
  SELECT run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at
  FROM shared_champion_run_tokens
  WHERE token_hash = $1
  LIMIT 1;
`;

const INSERT_AUDIT_EVENT_SQL = `
  INSERT INTO shared_champion_run_audit (
    event_type,
    outcome,
    run_id,
    ip_fingerprint,
    user_agent_fingerprint,
    reason,
    payload
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb);
`;

const INSERT_RUN_SQL = `
  INSERT INTO shared_champion_runs (
    run_id,
    player_name,
    player_name_key,
    control_mode,
    map_id,
    ruleset,
    started_at,
    ended_at,
    elapsed_ms,
    score_half_points,
    kills,
    headshots,
    shots_fired,
    shots_hit,
    accuracy_pct,
    waves_cleared,
    wave_reached,
    death_cause,
    champion_updated,
    build_id,
    client_ip_fingerprint,
    user_agent_fingerprint
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
  )
  RETURNING
    run_id,
    player_name,
    player_name_key,
    control_mode,
    map_id,
    ruleset,
    started_at,
    ended_at,
    elapsed_ms,
    score_half_points,
    kills,
    headshots,
    shots_fired,
    shots_hit,
    accuracy_pct,
    waves_cleared,
    wave_reached,
    death_cause,
    champion_updated,
    build_id,
    client_ip_fingerprint,
    user_agent_fingerprint,
    created_at;
`;

type PoolKind = "read" | "write";

type ChampionRow = {
  score_half_points: number;
  holder_name: string;
  holder_mode: SharedChampionControlMode;
  updated_at: Date;
};

type ChampionMutationRow = ChampionRow & {
  updated: boolean;
};

type RunTokenRow = {
  run_id: string;
  player_name: string;
  control_mode: SharedChampionControlMode;
  map_id: string;
  issued_at: Date;
  expires_at: Date;
  claimed_at: Date | null;
};

type RunRow = {
  run_id: string;
  player_name: string;
  player_name_key: string;
  control_mode: SharedChampionControlMode;
  map_id: string;
  ruleset: typeof SHARED_CHAMPION_SCORE_RULESET;
  started_at: Date;
  ended_at: Date;
  elapsed_ms: number;
  score_half_points: number;
  kills: number;
  headshots: number;
  shots_fired: number;
  shots_hit: number;
  accuracy_pct: number;
  waves_cleared: number;
  wave_reached: number;
  death_cause: "enemy-fire" | "unknown" | null;
  champion_updated: boolean;
  build_id: string | null;
  client_ip_fingerprint: string | null;
  user_agent_fingerprint: string | null;
  created_at: Date;
};

type OverviewRow = {
  total_runs: string;
  champion_updates: string;
  unique_player_names: string;
  human_runs: string;
  agent_runs: string;
  best_score_half_points: number | null;
  average_score_half_points: number | null;
  average_accuracy_pct: number | null;
  latest_run_at: Date | null;
  latest_champion_at: Date | null;
};

type NameRollupRow = {
  player_name_key: string;
  player_name: string;
  total_runs: string;
  champion_updates: string;
  human_runs: string;
  agent_runs: string;
  best_score_half_points: number;
  average_score_half_points: number;
  average_accuracy_pct: number;
  latest_run_at: Date;
};

type DailyRollupRow = {
  day: string;
  total_runs: string;
  champion_updates: string;
  unique_player_names: string;
  human_runs: string;
  agent_runs: string;
  best_score_half_points: number;
  average_score_half_points: number;
  average_accuracy_pct: number;
};

export type SharedChampionRunTokenRecord = {
  runId: string;
  playerName: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
  issuedAt: string;
  expiresAt: string;
  claimedAt: string | null;
};

export type SharedChampionAuditEvent = {
  eventType: string;
  outcome: "accepted" | "rejected";
  runId?: string | null;
  ipFingerprint?: string | null;
  userAgentFingerprint?: string | null;
  reason?: string | null;
  payload?: unknown;
};

export type SharedChampionStore = {
  getChampion: () => Promise<SharedChampion | null>;
  submitCandidate: (input: SharedChampionPostRequest) => Promise<{
    updated: boolean;
    champion: SharedChampion | null;
  }>;
  isRateLimited: (clientIpFingerprint: string) => Promise<boolean>;
  logSubmission: (clientIpFingerprint: string) => Promise<void>;
  issueRunToken: (input: {
    runId: string;
    tokenHash: string;
    playerName: string;
    controlMode: SharedChampionControlMode;
    mapId: string;
    expiresAt: Date;
    clientIpFingerprint: string | null;
    userAgentFingerprint: string | null;
  }) => Promise<SharedChampionRunTokenRecord>;
  consumeRunToken: (input: {
    tokenHash: string;
    clientIpFingerprint: string | null;
    userAgentFingerprint: string | null;
  }) => Promise<{
    status: "consumed" | "missing" | "expired" | "used";
    record: SharedChampionRunTokenRecord | null;
  }>;
  finalizeValidatedRun: (input: {
    tokenRecord: SharedChampionRunTokenRecord;
    summary: SharedChampionRunSummary;
    elapsedMs: number;
    scoreHalfPoints: number;
    clientIpFingerprint: string | null;
    userAgentFingerprint: string | null;
    buildId?: string | null;
  }) => Promise<{
    updated: boolean;
    champion: SharedChampion | null;
    run: SharedChampionRunRecord;
  }>;
  recordAuditEvent: (event: SharedChampionAuditEvent) => Promise<void>;
  getStatsOverview: (filters: ResolvedSharedChampionStatsFilters) => Promise<SharedChampionStatsOverview>;
  listRuns: (filters: ResolvedSharedChampionStatsRunFilters) => Promise<{
    items: SharedChampionRunRecord[];
    nextCursor: string | null;
  }>;
  listNames: (filters: ResolvedSharedChampionStatsFilters, limit: number) => Promise<SharedChampionStatsNameRollup[]>;
  listDaily: (filters: ResolvedSharedChampionStatsFilters, limit: number) => Promise<SharedChampionStatsDailyRollup[]>;
};

type InMemoryRunTokenRecord = SharedChampionRunTokenRecord & {
  tokenHash: string;
};

function mapRowToChampion(row: ChampionRow): SharedChampion {
  return createSharedChampion({
    holderName: row.holder_name,
    scoreHalfPoints: row.score_half_points,
    controlMode: row.holder_mode,
    updatedAt: row.updated_at,
  });
}

function mapRunTokenRow(row: RunTokenRow): SharedChampionRunTokenRecord {
  return {
    runId: row.run_id,
    playerName: row.player_name,
    controlMode: row.control_mode,
    mapId: row.map_id,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  };
}

function mapRunRow(row: RunRow): SharedChampionRunRecord {
  return {
    runId: row.run_id,
    playerName: row.player_name,
    playerNameKey: row.player_name_key,
    controlMode: row.control_mode,
    mapId: row.map_id,
    ruleset: row.ruleset,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
    elapsedMs: row.elapsed_ms,
    scoreHalfPoints: row.score_half_points,
    score: scoreHalfPointsToValue(row.score_half_points),
    kills: row.kills,
    headshots: row.headshots,
    shotsFired: row.shots_fired,
    shotsHit: row.shots_hit,
    accuracyPct: roundMetric(row.accuracy_pct, 1),
    wavesCleared: row.waves_cleared,
    waveReached: row.wave_reached,
    deathCause: row.death_cause,
    championUpdated: row.champion_updated,
    buildId: row.build_id,
    clientIpFingerprint: row.client_ip_fingerprint,
    userAgentFingerprint: row.user_agent_fingerprint,
    createdAt: row.created_at.toISOString(),
  };
}

function parseBigIntCount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMetric(value: number | null, digits = 2): number {
  if (value === null || !Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeSubmission(input: SharedChampionPostRequest): SharedChampionPostRequest {
  return {
    playerName: sanitizeSharedChampionName(input.playerName, input.controlMode),
    scoreHalfPoints: normalizeScoreHalfPoints(input.scoreHalfPoints),
    controlMode: input.controlMode,
    ...(input.telemetry ? { telemetry: input.telemetry } : {}),
  };
}

function normalizeRunTokenInput(input: {
  runId: string;
  tokenHash: string;
  playerName: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
  expiresAt: Date;
  clientIpFingerprint: string | null;
  userAgentFingerprint: string | null;
}) {
  return {
    runId: input.runId,
    tokenHash: input.tokenHash.trim(),
    playerName: sanitizeSharedChampionName(input.playerName, input.controlMode),
    controlMode: input.controlMode,
    mapId: sanitizeSharedChampionMapId(input.mapId),
    expiresAt: input.expiresAt,
    clientIpFingerprint: input.clientIpFingerprint?.trim() || null,
    userAgentFingerprint: input.userAgentFingerprint?.trim() || null,
  };
}

function normalizeRunRecord(input: {
  tokenRecord: SharedChampionRunTokenRecord;
  summary: SharedChampionRunSummary;
  elapsedMs: number;
  scoreHalfPoints: number;
  championUpdated: boolean;
  clientIpFingerprint: string | null;
  userAgentFingerprint: string | null;
  buildId?: string | null;
  createdAt?: Date;
}): SharedChampionRunRecord {
  const derived = deriveRunFields({
    playerName: input.tokenRecord.playerName,
    mapId: input.tokenRecord.mapId,
    summary: input.summary,
    scoreHalfPoints: input.scoreHalfPoints,
    elapsedMs: input.elapsedMs,
    buildId: input.buildId ?? resolveBuildId(),
  });
  const endedAt = input.tokenRecord.claimedAt
    ? new Date(input.tokenRecord.claimedAt)
    : new Date(Date.parse(input.tokenRecord.issuedAt) + derived.elapsedMs);
  const createdAt = input.createdAt ?? endedAt;
  return {
    runId: input.tokenRecord.runId,
    playerName: derived.playerName,
    playerNameKey: derived.playerNameKey,
    controlMode: input.tokenRecord.controlMode,
    mapId: derived.mapId,
    ruleset: derived.ruleset,
    startedAt: new Date(input.tokenRecord.issuedAt).toISOString(),
    endedAt: endedAt.toISOString(),
    elapsedMs: derived.elapsedMs,
    scoreHalfPoints: derived.scoreHalfPoints,
    score: scoreHalfPointsToValue(derived.scoreHalfPoints),
    kills: input.summary.kills,
    headshots: input.summary.headshots,
    shotsFired: input.summary.shotsFired,
    shotsHit: input.summary.shotsHit,
    accuracyPct: derived.accuracyPct,
    wavesCleared: derived.wavesCleared,
    waveReached: derived.waveReached,
    deathCause: derived.deathCause,
    championUpdated: input.championUpdated,
    buildId: derived.buildId,
    clientIpFingerprint: input.clientIpFingerprint?.trim() || null,
    userAgentFingerprint: input.userAgentFingerprint?.trim() || null,
    createdAt: createdAt.toISOString(),
  };
}

function compareRunCursor(a: SharedChampionRunRecord, b: { createdAt: string; runId: string }): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  if (a.runId === b.runId) return 0;
  return a.runId < b.runId ? -1 : 1;
}

function applyInMemoryFilters<T extends SharedChampionRunRecord>(
  runs: readonly T[],
  filters: ResolvedSharedChampionStatsFilters,
): T[] {
  return runs.filter((run) => {
    if (filters.from && run.endedAt < filters.from) return false;
    if (filters.to && run.endedAt > filters.to) return false;
    if (filters.controlMode && run.controlMode !== filters.controlMode) return false;
    if (filters.mapId && run.mapId !== filters.mapId) return false;
    if (filters.playerNameKey && run.playerNameKey !== filters.playerNameKey) return false;
    return true;
  });
}

function sortRunsDesc<T extends SharedChampionRunRecord>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    if (a.runId === b.runId) return 0;
    return a.runId < b.runId ? 1 : -1;
  });
}

function computeOverview(runs: readonly SharedChampionRunRecord[]): SharedChampionStatsOverview {
  const totalRuns = runs.length;
  const championUpdates = runs.filter((run) => run.championUpdated).length;
  const uniqueNames = new Set(runs.map((run) => run.playerNameKey)).size;
  const humanRuns = runs.filter((run) => run.controlMode === "human").length;
  const agentRuns = runs.filter((run) => run.controlMode === "agent").length;
  const bestScoreHalfPoints = totalRuns > 0
    ? Math.max(...runs.map((run) => run.scoreHalfPoints))
    : null;
  const averageScoreHalfPoints = totalRuns > 0
    ? runs.reduce((sum, run) => sum + run.scoreHalfPoints, 0) / totalRuns
    : null;
  const averageAccuracy = totalRuns > 0
    ? runs.reduce((sum, run) => sum + run.accuracyPct, 0) / totalRuns
    : null;
  const latestRunAt = totalRuns > 0 ? sortRunsDesc(runs)[0]?.createdAt ?? null : null;
  const latestChampionAt = sortRunsDesc(runs.filter((run) => run.championUpdated))[0]?.createdAt ?? null;
  return {
    totalRuns,
    championUpdates,
    uniquePlayerNames: uniqueNames,
    humanRuns,
    agentRuns,
    bestScoreHalfPoints,
    bestScore: formatNullableScore(bestScoreHalfPoints),
    averageScore: averageScoreHalfPoints === null ? null : roundMetric(averageScoreHalfPoints / 2, 2),
    averageAccuracyPct: averageAccuracy === null ? null : roundMetric(averageAccuracy, 2),
    latestRunAt,
    latestChampionAt,
  };
}

function computeNameRollups(
  runs: readonly SharedChampionRunRecord[],
): SharedChampionStatsNameRollup[] {
  const byName = new Map<string, SharedChampionRunRecord[]>();
  for (const run of runs) {
    const bucket = byName.get(run.playerNameKey);
    if (bucket) {
      bucket.push(run);
    } else {
      byName.set(run.playerNameKey, [run]);
    }
  }
  return [...byName.entries()]
    .map(([playerNameKey, playerRuns]) => {
      const sorted = sortRunsDesc(playerRuns);
      const totalRuns = playerRuns.length;
      const championUpdates = playerRuns.filter((run) => run.championUpdated).length;
      const humanRuns = playerRuns.filter((run) => run.controlMode === "human").length;
      const agentRuns = playerRuns.filter((run) => run.controlMode === "agent").length;
      const bestScoreHalfPoints = Math.max(...playerRuns.map((run) => run.scoreHalfPoints));
      const averageScore = playerRuns.reduce((sum, run) => sum + run.score, 0) / totalRuns;
      const averageAccuracyPct = playerRuns.reduce((sum, run) => sum + run.accuracyPct, 0) / totalRuns;
      const stableName = [...new Set(playerRuns.map((run) => run.playerName))].sort()[0] ?? playerNameKey;
      return {
        playerNameKey,
        playerName: stableName,
        totalRuns,
        championUpdates,
        humanRuns,
        agentRuns,
        bestScoreHalfPoints,
        bestScore: scoreHalfPointsToValue(bestScoreHalfPoints),
        averageScore: roundMetric(averageScore, 2),
        averageAccuracyPct: roundMetric(averageAccuracyPct, 2),
        latestRunAt: sorted[0]?.createdAt ?? new Date(0).toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.bestScoreHalfPoints !== b.bestScoreHalfPoints) {
        return b.bestScoreHalfPoints - a.bestScoreHalfPoints;
      }
      if (a.latestRunAt !== b.latestRunAt) {
        return a.latestRunAt < b.latestRunAt ? 1 : -1;
      }
      return a.playerNameKey.localeCompare(b.playerNameKey);
    });
}

function computeDailyRollups(
  runs: readonly SharedChampionRunRecord[],
): SharedChampionStatsDailyRollup[] {
  const byDay = new Map<string, SharedChampionRunRecord[]>();
  for (const run of runs) {
    const day = run.endedAt.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) {
      bucket.push(run);
    } else {
      byDay.set(day, [run]);
    }
  }
  return [...byDay.entries()]
    .map(([day, dayRuns]) => {
      const totalRuns = dayRuns.length;
      const championUpdates = dayRuns.filter((run) => run.championUpdated).length;
      const uniquePlayerNames = new Set(dayRuns.map((run) => run.playerNameKey)).size;
      const humanRuns = dayRuns.filter((run) => run.controlMode === "human").length;
      const agentRuns = dayRuns.filter((run) => run.controlMode === "agent").length;
      const bestScoreHalfPoints = Math.max(...dayRuns.map((run) => run.scoreHalfPoints));
      const averageScore = dayRuns.reduce((sum, run) => sum + run.score, 0) / totalRuns;
      const averageAccuracyPct = dayRuns.reduce((sum, run) => sum + run.accuracyPct, 0) / totalRuns;
      return {
        day,
        totalRuns,
        championUpdates,
        uniquePlayerNames,
        humanRuns,
        agentRuns,
        bestScoreHalfPoints,
        bestScore: scoreHalfPointsToValue(bestScoreHalfPoints),
        averageScore: roundMetric(averageScore, 2),
        averageAccuracyPct: roundMetric(averageAccuracyPct, 2),
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

export function createInMemorySharedChampionStore(): SharedChampionStore {
  let champion: SharedChampion | null = null;
  const runTokens = new Map<string, InMemoryRunTokenRecord>();
  const auditEvents: SharedChampionAuditEvent[] = [];
  const runs: SharedChampionRunRecord[] = [];

  return {
    async getChampion() {
      return champion;
    },
    async submitCandidate(input) {
      const normalized = normalizeSubmission(input);
      const nextChampion = createSharedChampion({
        holderName: normalized.playerName,
        scoreHalfPoints: normalized.scoreHalfPoints,
        controlMode: normalized.controlMode,
        updatedAt: new Date(),
      });

      if (!champion || normalized.scoreHalfPoints > champion.scoreHalfPoints) {
        champion = nextChampion;
        return {
          updated: true,
          champion,
        };
      }

      return {
        updated: false,
        champion,
      };
    },
    async isRateLimited() {
      return false;
    },
    async logSubmission() {
      // No-op in dev/test.
    },
    async issueRunToken(input) {
      const normalized = normalizeRunTokenInput(input);
      const issuedAt = new Date();
      const record: InMemoryRunTokenRecord = {
        runId: normalized.runId,
        tokenHash: normalized.tokenHash,
        playerName: normalized.playerName,
        controlMode: normalized.controlMode,
        mapId: normalized.mapId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: normalized.expiresAt.toISOString(),
        claimedAt: null,
      };
      runTokens.set(normalized.tokenHash, record);
      return {
        runId: record.runId,
        playerName: record.playerName,
        controlMode: record.controlMode,
        mapId: record.mapId,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        claimedAt: record.claimedAt,
      };
    },
    async consumeRunToken(input) {
      const tokenHash = input.tokenHash.trim();
      const record = runTokens.get(tokenHash) ?? null;
      if (!record) {
        return {
          status: "missing" as const,
          record: null,
        };
      }

      if (record.claimedAt !== null) {
        return {
          status: "used" as const,
          record: {
            runId: record.runId,
            playerName: record.playerName,
            controlMode: record.controlMode,
            mapId: record.mapId,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            claimedAt: record.claimedAt,
          },
        };
      }

      if (Date.parse(record.expiresAt) <= Date.now()) {
        return {
          status: "expired" as const,
          record: {
            runId: record.runId,
            playerName: record.playerName,
            controlMode: record.controlMode,
            mapId: record.mapId,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            claimedAt: record.claimedAt,
          },
        };
      }

      record.claimedAt = new Date().toISOString();
      return {
        status: "consumed" as const,
        record: {
          runId: record.runId,
          playerName: record.playerName,
          controlMode: record.controlMode,
          mapId: record.mapId,
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          claimedAt: record.claimedAt,
        },
      };
    },
    async finalizeValidatedRun(input) {
      const normalizedSummary = normalizeRunRecord({
        ...input,
        championUpdated: false,
      });
      const nextChampion = createSharedChampion({
        holderName: normalizedSummary.playerName,
        scoreHalfPoints: normalizedSummary.scoreHalfPoints,
        controlMode: normalizedSummary.controlMode,
        updatedAt: new Date(normalizedSummary.createdAt),
      });
      const updated = champion === null || normalizedSummary.scoreHalfPoints > champion.scoreHalfPoints;
      if (updated) {
        champion = nextChampion;
      }
      const run = {
        ...normalizedSummary,
        championUpdated: updated,
      };
      runs.push(run);
      return {
        updated,
        champion,
        run,
      };
    },
    async recordAuditEvent(event) {
      auditEvents.push(event);
    },
    async getStatsOverview(filters) {
      return computeOverview(applyInMemoryFilters(runs, filters));
    },
    async listRuns(filters) {
      let filtered = applyInMemoryFilters(runs, filters);
      if (filters.championUpdated !== null) {
        filtered = filtered.filter((run) => run.championUpdated === filters.championUpdated);
      }
      const sorted = sortRunsDesc(filtered);
      const afterCursor = filters.cursor
        ? sorted.filter((run) => compareRunCursor(run, filters.cursor!) < 0)
        : sorted;
      const items = afterCursor.slice(0, filters.limit);
      const next = afterCursor.length > filters.limit ? items[items.length - 1] ?? null : null;
      return {
        items,
        nextCursor: next ? createRunCursor({ createdAt: next.createdAt, runId: next.runId }) : null,
      };
    },
    async listNames(filters, limit) {
      return computeNameRollups(applyInMemoryFilters(runs, filters)).slice(0, limit);
    },
    async listDaily(filters, limit) {
      return computeDailyRollups(applyInMemoryFilters(runs, filters)).slice(0, limit);
    },
  };
}

function isProductionDatabaseMode(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function resolvePgConnectionString(kind: PoolKind): string {
  const productionMode = isProductionDatabaseMode();
  const candidates = kind === "write"
    ? [
        process.env.POSTGRES_WRITE_URL,
        ...(productionMode ? [] : [
          process.env.POSTGRES_URL,
          process.env.DATABASE_URL,
          process.env.NEON_DATABASE_URL,
        ]),
      ]
    : [
        process.env.POSTGRES_READ_URL,
        ...(productionMode ? [] : [
          process.env.POSTGRES_WRITE_URL,
          process.env.POSTGRES_URL,
          process.env.DATABASE_URL,
          process.env.NEON_DATABASE_URL,
        ]),
      ];
  const connectionString = candidates.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
  if (connectionString.trim().length > 0) {
    return connectionString.trim();
  }

  if (kind === "write") {
    throw new Error(
      productionMode
        ? "Missing Postgres write connection string. Configure POSTGRES_WRITE_URL for gameplay writes."
        : "Missing Postgres connection string. Configure POSTGRES_WRITE_URL or POSTGRES_URL / DATABASE_URL.",
    );
  }
  throw new Error(
    productionMode
      ? "Missing Postgres read connection string. Configure POSTGRES_READ_URL for admin stats reads."
      : "Missing Postgres read connection string. Configure POSTGRES_READ_URL or POSTGRES_WRITE_URL.",
  );
}

function hasPgConnectionString(kind: PoolKind): boolean {
  try {
    return resolvePgConnectionString(kind).length > 0;
  } catch {
    return false;
  }
}

function resolveSslConfig(connectionString: string): PoolConfig["ssl"] {
  try {
    const parsedUrl = new URL(connectionString);
    const sslMode = parsedUrl.searchParams.get("sslmode")?.trim().toLowerCase();
    const isLocalHost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (sslMode === "disable" || isLocalHost) return undefined;
    return { rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

const pools: Partial<Record<PoolKind, Pool>> = {};
let schemaReadyPromise: Promise<void> | null = null;

function getPool(kind: PoolKind): Pool {
  const existing = pools[kind];
  if (existing) return existing;

  const connectionString = resolvePgConnectionString(kind);
  const pool = new Pool({
    connectionString,
    max: kind === "write" ? 4 : 2,
    idleTimeoutMillis: 5_000,
    ssl: resolveSslConfig(connectionString),
  });
  attachDatabasePool(pool);
  pools[kind] = pool;
  return pool;
}

async function queryColumnExists(client: PoolClient, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists;
    `,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

async function ensureSchemaReady(): Promise<void> {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const client = await getPool("write").connect();
    try {
      await client.query(CREATE_HIGH_SCORE_TABLE_SQL);

      await client.query(CREATE_SUBMISSIONS_LOG_TABLE_SQL);
      await client.query(ALTER_SUBMISSIONS_LOG_TABLE_SQL);
      if (await queryColumnExists(client, "champion_submissions_log", "client_ip")) {
        await client.query("TRUNCATE TABLE champion_submissions_log;");
      }
      await client.query(DROP_LEGACY_SUBMISSIONS_LOG_SQL);
      await client.query(CREATE_SUBMISSIONS_LOG_INDEX_SQL);

      await client.query(CREATE_RUN_TOKEN_TABLE_SQL);
      await client.query(ALTER_RUN_TOKEN_TABLE_SQL);
      await client.query(DROP_LEGACY_RUN_TOKEN_COLUMNS_SQL);
      await client.query(CREATE_RUN_TOKEN_INDEX_SQL);

      await client.query(CREATE_AUDIT_TABLE_SQL);
      await client.query(ALTER_AUDIT_TABLE_SQL);
      await client.query(DROP_LEGACY_AUDIT_COLUMNS_SQL);

      await client.query(CREATE_RUNS_TABLE_SQL);
      await client.query(CREATE_RUNS_INDEX_SQL);

      await client.query(CREATE_DAILY_ROLLUPS_VIEW_SQL);
      await client.query(CREATE_NAME_ROLLUPS_VIEW_SQL);
    } finally {
      client.release();
    }
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool("write").connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function applyRunFiltersSql(
  filters: ResolvedSharedChampionStatsFilters,
  values: unknown[],
  alias = "runs",
): string {
  const clauses: string[] = [];
  const push = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.fromDate) {
    clauses.push(`${alias}.ended_at >= ${push(filters.fromDate.toISOString())}`);
  }
  if (filters.toDate) {
    clauses.push(`${alias}.ended_at <= ${push(filters.toDate.toISOString())}`);
  }
  if (filters.controlMode) {
    clauses.push(`${alias}.control_mode = ${push(filters.controlMode)}`);
  }
  if (filters.mapId) {
    clauses.push(`${alias}.map_id = ${push(filters.mapId)}`);
  }
  if (filters.playerNameKey) {
    clauses.push(`${alias}.player_name_key = ${push(filters.playerNameKey)}`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

function mapOverviewRow(row: OverviewRow | undefined): SharedChampionStatsOverview {
  return {
    totalRuns: parseBigIntCount(row?.total_runs),
    championUpdates: parseBigIntCount(row?.champion_updates),
    uniquePlayerNames: parseBigIntCount(row?.unique_player_names),
    humanRuns: parseBigIntCount(row?.human_runs),
    agentRuns: parseBigIntCount(row?.agent_runs),
    bestScoreHalfPoints: row?.best_score_half_points ?? null,
    bestScore: formatNullableScore(row?.best_score_half_points ?? null),
    averageScore: row?.average_score_half_points === null || row?.average_score_half_points === undefined
      ? null
      : roundMetric(row.average_score_half_points / 2, 2),
    averageAccuracyPct: row?.average_accuracy_pct === null || row?.average_accuracy_pct === undefined
      ? null
      : roundMetric(row.average_accuracy_pct, 2),
    latestRunAt: row?.latest_run_at ? row.latest_run_at.toISOString() : null,
    latestChampionAt: row?.latest_champion_at ? row.latest_champion_at.toISOString() : null,
  };
}

function mapNameRollupRow(row: NameRollupRow): SharedChampionStatsNameRollup {
  return {
    playerNameKey: row.player_name_key,
    playerName: row.player_name,
    totalRuns: parseBigIntCount(row.total_runs),
    championUpdates: parseBigIntCount(row.champion_updates),
    humanRuns: parseBigIntCount(row.human_runs),
    agentRuns: parseBigIntCount(row.agent_runs),
    bestScoreHalfPoints: row.best_score_half_points,
    bestScore: scoreHalfPointsToValue(row.best_score_half_points),
    averageScore: roundMetric(row.average_score_half_points / 2, 2),
    averageAccuracyPct: roundMetric(row.average_accuracy_pct, 2),
    latestRunAt: row.latest_run_at.toISOString(),
  };
}

function mapDailyRollupRow(row: DailyRollupRow): SharedChampionStatsDailyRollup {
  return {
    day: row.day,
    totalRuns: parseBigIntCount(row.total_runs),
    championUpdates: parseBigIntCount(row.champion_updates),
    uniquePlayerNames: parseBigIntCount(row.unique_player_names),
    humanRuns: parseBigIntCount(row.human_runs),
    agentRuns: parseBigIntCount(row.agent_runs),
    bestScoreHalfPoints: row.best_score_half_points,
    bestScore: scoreHalfPointsToValue(row.best_score_half_points),
    averageScore: roundMetric(row.average_score_half_points / 2, 2),
    averageAccuracyPct: roundMetric(row.average_accuracy_pct, 2),
  };
}

export function hasConfiguredSharedChampionDatabase(kind: PoolKind = "write"): boolean {
  return hasPgConnectionString(kind);
}

export function createPostgresSharedChampionStore(): SharedChampionStore {
  return {
    async getChampion() {
      await ensureSchemaReady();
      const result = await getPool("write").query<ChampionRow>(SELECT_CHAMPION_SQL, [SITEWIDE_CHAMPION_BOARD_KEY]);
      const row = result.rows[0];
      return row ? mapRowToChampion(row) : null;
    },
    async submitCandidate(input) {
      await ensureSchemaReady();
      const normalized = normalizeSubmission(input);
      const result = await getPool("write").query<ChampionMutationRow>(UPSERT_CHAMPION_SQL, [
        SITEWIDE_CHAMPION_BOARD_KEY,
        normalized.scoreHalfPoints,
        normalized.playerName,
        normalized.controlMode,
      ]);
      const row = result.rows[0] ?? null;
      return {
        updated: row?.updated === true,
        champion: row ? mapRowToChampion(row) : null,
      };
    },
    async isRateLimited(clientIpFingerprint) {
      await ensureSchemaReady();
      const result = await getPool("write").query<{ recent: string }>(RATE_LIMIT_CHECK_SQL, [clientIpFingerprint]);
      return parseBigIntCount(result.rows[0]?.recent) > 0;
    },
    async logSubmission(clientIpFingerprint) {
      await ensureSchemaReady();
      await getPool("write").query(RATE_LIMIT_INSERT_SQL, [clientIpFingerprint]);
      getPool("write").query(RATE_LIMIT_CLEANUP_SQL).catch(() => {});
    },
    async issueRunToken(input) {
      await ensureSchemaReady();
      const normalized = normalizeRunTokenInput(input);
      const result = await getPool("write").query<RunTokenRow>(INSERT_RUN_TOKEN_SQL, [
        normalized.runId,
        normalized.tokenHash,
        normalized.playerName,
        normalized.controlMode,
        normalized.mapId,
        normalized.expiresAt,
        normalized.clientIpFingerprint,
        normalized.userAgentFingerprint,
      ]);
      getPool("write").query(RUN_TOKEN_CLEANUP_SQL).catch(() => {});
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to issue shared champion run token.");
      }
      return mapRunTokenRow(row);
    },
    async consumeRunToken(input) {
      await ensureSchemaReady();
      const normalizedTokenHash = input.tokenHash.trim();
      const result = await getPool("write").query<RunTokenRow>(CLAIM_RUN_TOKEN_SQL, [
        normalizedTokenHash,
        input.clientIpFingerprint?.trim() || null,
        input.userAgentFingerprint?.trim() || null,
      ]);
      const consumed = result.rows[0];
      if (consumed) {
        return {
          status: "consumed" as const,
          record: mapRunTokenRow(consumed),
        };
      }

      const lookup = await getPool("write").query<RunTokenRow>(SELECT_RUN_TOKEN_SQL, [normalizedTokenHash]);
      const row = lookup.rows[0] ?? null;
      if (!row) {
        return {
          status: "missing" as const,
          record: null,
        };
      }

      if (row.claimed_at !== null) {
        return {
          status: "used" as const,
          record: mapRunTokenRow(row),
        };
      }

      if (row.expires_at.getTime() <= Date.now()) {
        return {
          status: "expired" as const,
          record: mapRunTokenRow(row),
        };
      }

      return {
        status: "used" as const,
        record: mapRunTokenRow(row),
      };
    },
    async finalizeValidatedRun(input) {
      await ensureSchemaReady();
      return withTransaction(async (client) => {
        const championResult = await client.query<ChampionMutationRow>(UPSERT_CHAMPION_SQL, [
          SITEWIDE_CHAMPION_BOARD_KEY,
          normalizeScoreHalfPoints(input.scoreHalfPoints),
          sanitizeSharedChampionName(input.tokenRecord.playerName, input.tokenRecord.controlMode),
          input.tokenRecord.controlMode,
        ]);
        const championRow = championResult.rows[0] ?? null;
        const updated = championRow?.updated === true;
        const normalizedRun = normalizeRunRecord({
          ...input,
          championUpdated: updated,
          createdAt: input.tokenRecord.claimedAt ? new Date(input.tokenRecord.claimedAt) : new Date(),
          buildId: input.buildId ?? resolveBuildId(),
        });
        const runResult = await client.query<RunRow>(INSERT_RUN_SQL, [
          normalizedRun.runId,
          normalizedRun.playerName,
          normalizedRun.playerNameKey,
          normalizedRun.controlMode,
          normalizedRun.mapId,
          normalizedRun.ruleset,
          normalizedRun.startedAt,
          normalizedRun.endedAt,
          normalizedRun.elapsedMs,
          normalizedRun.scoreHalfPoints,
          normalizedRun.kills,
          normalizedRun.headshots,
          normalizedRun.shotsFired,
          normalizedRun.shotsHit,
          normalizedRun.accuracyPct,
          normalizedRun.wavesCleared,
          normalizedRun.waveReached,
          normalizedRun.deathCause,
          normalizedRun.championUpdated,
          normalizedRun.buildId,
          normalizedRun.clientIpFingerprint,
          normalizedRun.userAgentFingerprint,
        ]);
        const runRow = runResult.rows[0];
        if (!runRow) {
          throw new Error("Failed to persist shared champion run.");
        }
        return {
          updated,
          champion: championRow ? mapRowToChampion(championRow) : null,
          run: mapRunRow(runRow),
        };
      });
    },
    async recordAuditEvent(event) {
      await ensureSchemaReady();
      await getPool("write").query(INSERT_AUDIT_EVENT_SQL, [
        event.eventType,
        event.outcome,
        event.runId ?? null,
        event.ipFingerprint ?? null,
        event.userAgentFingerprint ?? null,
        event.reason ?? null,
        JSON.stringify(event.payload ?? null),
      ]);
      getPool("write").query(AUDIT_CLEANUP_SQL).catch(() => {});
    },
    async getStatsOverview(filters) {
      await ensureSchemaReady();
      const values: unknown[] = [];
      const where = applyRunFiltersSql(filters, values);
      const query = `
        SELECT
          COUNT(*)::BIGINT AS total_runs,
          COALESCE(SUM(CASE WHEN runs.champion_updated THEN 1 ELSE 0 END), 0)::BIGINT AS champion_updates,
          COUNT(DISTINCT runs.player_name_key)::BIGINT AS unique_player_names,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'human' THEN 1 ELSE 0 END), 0)::BIGINT AS human_runs,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'agent' THEN 1 ELSE 0 END), 0)::BIGINT AS agent_runs,
          MAX(runs.score_half_points)::INTEGER AS best_score_half_points,
          AVG(runs.score_half_points)::DOUBLE PRECISION AS average_score_half_points,
          AVG(runs.accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct,
          MAX(runs.created_at) AS latest_run_at,
          MAX(CASE WHEN runs.champion_updated THEN runs.created_at ELSE NULL END) AS latest_champion_at
        FROM shared_champion_runs runs
        ${where};
      `;
      const result = await getPool("read").query<OverviewRow>(query, values);
      return mapOverviewRow(result.rows[0]);
    },
    async listRuns(filters) {
      await ensureSchemaReady();
      const values: unknown[] = [];
      const push = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      const whereClauses: string[] = [];
      const baseWhere = applyRunFiltersSql(filters, values);
      if (baseWhere.length > 0) {
        whereClauses.push(baseWhere.replace(/^WHERE /, ""));
      }
      if (filters.championUpdated !== null) {
        whereClauses.push(`runs.champion_updated = ${push(filters.championUpdated)}`);
      }
      if (filters.cursor) {
        const createdAtParam = push(filters.cursor.createdAt);
        const runIdParam = push(filters.cursor.runId);
        whereClauses.push(`(runs.created_at, runs.run_id) < (${createdAtParam}, ${runIdParam})`);
      }
      const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const limitParam = push(filters.limit + 1);
      const query = `
        SELECT
          run_id,
          player_name,
          player_name_key,
          control_mode,
          map_id,
          ruleset,
          started_at,
          ended_at,
          elapsed_ms,
          score_half_points,
          kills,
          headshots,
          shots_fired,
          shots_hit,
          accuracy_pct,
          waves_cleared,
          wave_reached,
          death_cause,
          champion_updated,
          build_id,
          client_ip_fingerprint,
          user_agent_fingerprint,
          created_at
        FROM shared_champion_runs runs
        ${where}
        ORDER BY runs.created_at DESC, runs.run_id DESC
        LIMIT ${limitParam};
      `;
      const result = await getPool("read").query<RunRow>(query, values);
      const rows = result.rows.map(mapRunRow);
      const items = rows.slice(0, filters.limit);
      const next = rows.length > filters.limit ? items[items.length - 1] ?? null : null;
      return {
        items,
        nextCursor: next ? createRunCursor({ createdAt: next.createdAt, runId: next.runId }) : null,
      };
    },
    async listNames(filters, limit) {
      await ensureSchemaReady();
      const values: unknown[] = [];
      const where = applyRunFiltersSql(filters, values);
      values.push(limit);
      const query = `
        SELECT
          runs.player_name_key,
          MIN(runs.player_name) AS player_name,
          COUNT(*)::BIGINT AS total_runs,
          COALESCE(SUM(CASE WHEN runs.champion_updated THEN 1 ELSE 0 END), 0)::BIGINT AS champion_updates,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'human' THEN 1 ELSE 0 END), 0)::BIGINT AS human_runs,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'agent' THEN 1 ELSE 0 END), 0)::BIGINT AS agent_runs,
          MAX(runs.score_half_points)::INTEGER AS best_score_half_points,
          AVG(runs.score_half_points)::DOUBLE PRECISION AS average_score_half_points,
          AVG(runs.accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct,
          MAX(runs.created_at) AS latest_run_at
        FROM shared_champion_runs runs
        ${where}
        GROUP BY runs.player_name_key
        ORDER BY best_score_half_points DESC, latest_run_at DESC, runs.player_name_key ASC
        LIMIT $${values.length};
      `;
      const result = await getPool("read").query<NameRollupRow>(query, values);
      return result.rows.map(mapNameRollupRow);
    },
    async listDaily(filters, limit) {
      await ensureSchemaReady();
      const values: unknown[] = [];
      const where = applyRunFiltersSql(filters, values);
      values.push(limit);
      const query = `
        SELECT
          TO_CHAR(DATE_TRUNC('day', runs.ended_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          COUNT(*)::BIGINT AS total_runs,
          COALESCE(SUM(CASE WHEN runs.champion_updated THEN 1 ELSE 0 END), 0)::BIGINT AS champion_updates,
          COUNT(DISTINCT runs.player_name_key)::BIGINT AS unique_player_names,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'human' THEN 1 ELSE 0 END), 0)::BIGINT AS human_runs,
          COALESCE(SUM(CASE WHEN runs.control_mode = 'agent' THEN 1 ELSE 0 END), 0)::BIGINT AS agent_runs,
          MAX(runs.score_half_points)::INTEGER AS best_score_half_points,
          AVG(runs.score_half_points)::DOUBLE PRECISION AS average_score_half_points,
          AVG(runs.accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct
        FROM shared_champion_runs runs
        ${where}
        GROUP BY 1
        ORDER BY day DESC
        LIMIT $${values.length};
      `;
      const result = await getPool("read").query<DailyRollupRow>(query, values);
      return result.rows.map(mapDailyRollupRow);
    },
  };
}
